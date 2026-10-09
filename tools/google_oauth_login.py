"""Authenticate Google ADC through a Desktop OAuth client without clasp."""

from __future__ import annotations

import argparse
import json
import os
import secrets
import tempfile
import urllib.parse
import urllib.request
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path


AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"


def load_client(path: Path) -> dict[str, str]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    client = payload.get("installed") or payload.get("web") or payload
    if not client.get("client_id") or not client.get("client_secret"):
        raise ValueError("OAuth client file needs client_id and client_secret.")
    return client


def exchange_code(client: dict[str, str], code: str, redirect_uri: str) -> dict:
    body = urllib.parse.urlencode(
        {
            "client_id": client["client_id"],
            "client_secret": client["client_secret"],
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": redirect_uri,
        }
    ).encode()
    request = urllib.request.Request(
        client.get("token_uri", TOKEN_URL),
        data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def write_adc(path: Path, client: dict[str, str], refresh_token: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "client_id": client["client_id"],
        "client_secret": client["client_secret"],
        "refresh_token": refresh_token,
        "type": "authorized_user",
    }
    handle, temporary = tempfile.mkstemp(prefix="adc-", suffix=".json", dir=path.parent)
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as stream:
            json.dump(payload, stream, indent=2)
            stream.write("\n")
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def login(client_path: Path, adc_path: Path, scopes: list[str]) -> None:
    client = load_client(client_path)
    state = secrets.token_urlsafe(32)
    result: dict[str, str] = {}

    class Callback(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802 - required by BaseHTTPRequestHandler
            values = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            if values.get("state", [""])[0] != state:
                self.send_error(400, "Invalid OAuth state.")
                return
            result["code"] = values.get("code", [""])[0]
            result["error"] = values.get("error", [""])[0]
            body = b"Google authorization received. You may close this tab."
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *_: object) -> None:
            pass

    server = HTTPServer(("127.0.0.1", 0), Callback)
    redirect_uri = f"http://localhost:{server.server_port}"
    query = urllib.parse.urlencode(
        {
            "client_id": client["client_id"],
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": " ".join(scopes),
            "access_type": "offline",
            "prompt": "consent",
            "state": state,
        }
    )
    print("Opening Google authorization in your browser...", flush=True)
    webbrowser.open(f"{AUTH_URL}?{query}", new=1)

    server.timeout = 300
    try:
        server.handle_request()
    finally:
        server.server_close()

    if result.get("error"):
        raise RuntimeError(f"Google authorization failed: {result['error']}")
    if not result.get("code"):
        raise TimeoutError("No Google authorization callback received.")

    tokens = exchange_code(client, result["code"], redirect_uri)
    refresh_token = tokens.get("refresh_token")
    if not refresh_token:
        raise RuntimeError("Google returned no refresh token.")
    write_adc(adc_path, client, refresh_token)
    print(f"Authenticated ADC written to {adc_path}", flush=True)


def self_check() -> None:
    assert urllib.parse.urlencode({"scope": "a b"}) == "scope=a+b"
    assert set(
        {
            "client_id": "id",
            "client_secret": "secret",
            "refresh_token": "refresh",
            "type": "authorized_user",
        }
    ) == {"client_id", "client_secret", "refresh_token", "type"}
    print("PASS: OAuth helper self-check")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--client-file", type=Path)
    parser.add_argument("--adc-output", type=Path)
    parser.add_argument("--scope", action="append", default=[])
    parser.add_argument("--self-check", action="store_true")
    args = parser.parse_args()
    if args.self_check:
        self_check()
        return
    if not args.client_file or not args.adc_output or not args.scope:
        parser.error("--client-file, --adc-output, and at least one --scope are required")
    login(args.client_file, args.adc_output, args.scope)


if __name__ == "__main__":
    main()
