---
title: 'Repair Anonymous Telegram Webhook Authentication on Apps Script'
type: 'bugfix'
created: '2026-09-02'
status: 'done'
baseline_commit: 'NO_VCS'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/spec-security-authorization-hardening.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-live-apps-script-two-group-activation.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Telegram cannot deliver updates because anonymous requests to the deployed Apps Script `/exec/<secret>` path are redirected to Google sign-in, producing webhook `401 Unauthorized`. The base `/exec` endpoint is public, so four pending updates remain outside `doPost`, Drive, Sheets, Groq, and publication.

**Approach:** Keep the existing Apps Script deployment and fail-closed secret gate, but move the high-entropy webhook credential to one dedicated query parameter that Apps Script exposes to `doPost`. Redact that parameter everywhere, preserve pending updates, test the boundary, and deploy a new immutable version to the same deployment ID.

## Boundaries & Constraints

**Always:** Require an exact hexadecimal `WEBHOOK_SECRET` match before parsing the Telegram body; accept the secret only from the dedicated `telegram_webhook_key` parameter; URL-encode it when installing; preserve `drop_pending_updates: false`; redact the credential from `webhookInfo()` and diagnostics; retain group/admin, archive, Groq, publication, and private-search gates unchanged; keep secrets only in Script Properties.

**Ask First:** Rotating `BOT_TOKEN`, `GROQ_API_KEY`, or storage IDs; replacing the Apps Script deployment; dropping pending Telegram updates; adding a Cloud Run/Cloudflare proxy; replaying ambiguous publication outcomes.

**Never:** Accept unauthenticated requests; accept multiple credential locations; log or return the raw query credential; place a secret in repository files; weaken chat/user authorization; backfill historical AI/publication work; discard the four pending updates.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|---------------------------|----------------|
| Valid Telegram webhook | Exact secret in `telegram_webhook_key` | Process update normally | N/A |
| Missing or wrong secret | No parameter, wrong value, duplicate/array value, or legacy path-only URL | Return `not found` before parsing body | No state mutation or provider call |
| Status inspection | Telegram returns a webhook URL containing the query credential | Return the same URL with only the value replaced by `[REDACTED]` | Never log raw URL |
| Migration | Existing webhook has queued updates | Install query-auth URL with `drop_pending_updates: false` | Telegram retries queued updates |

</frozen-after-approval>

## Code Map

- `apps-script/Code.gs` -- webhook URL construction, event credential extraction, fail-closed `doPost`, status redaction, and provider-free self-check.
- `tests/self_check.js` -- source guards and behavioral regression coverage for exact query authentication and redaction.
- `README.md` -- deployment rationale, credential exposure boundary, migration order, and live verification expectations.
- `.clasp.json` -- existing online project binding; deployment ID must remain unchanged.

## Tasks & Acceptance

**Execution:**
- [x] `apps-script/Code.gs` -- replace path-only authentication with one exact query parameter and robust credential redaction while preserving all downstream behavior.
- [x] `tests/self_check.js` -- prove valid, missing, wrong, duplicate, legacy-path, and redaction cases fail or pass as specified.
- [x] `README.md` -- document the observed anonymous subpath limitation and the constrained Apps Script compatibility design.
- [x] Local release candidate -- run syntax/self-check gates and prove only `Code.gs` and `appsscript.json` are tracked for upload.

**Acceptance Criteria:**
- Given any unauthenticated or ambiguously authenticated POST, when `doPost` runs, then it exits before JSON parsing, storage access, Telegram calls, AI calls, or publication.
- Given a webhook status response, when it is logged or returned, then no raw credential remains in path, query, fragment, or percent-encoded form.
- Given the existing deployment and queued updates, when the repaired installer builds the webhook request, then it retains `drop_pending_updates: false`, uses the unchanged configured base URL, and provides a URL that can enter the existing archive-first pipeline.

## Post-Review Online Release

- [x] Push only the tracked Apps Script files, create immutable version 22, update the existing web-app deployment ID, pull an isolated remote snapshot, and prove SHA-256 parity.
- [x] Run `installWebhook()` and `webhookInfo()` without dropping pending updates; verify the queue drains and the 401 timestamp stops advancing before checking the test record.

## Spec Change Log

## Design Notes

Apps Script officially documents query parameters in `e.parameter`, while its web-app event object does not expose Telegram's preferred custom secret header. A proxy remains the stronger production option; this repair is the narrow direct-Apps-Script compatibility boundary requested by the operator.

## Verification

**Commands:**
- `Get-Content -Raw -LiteralPath 'apps-script\Code.gs' | node --check -` -- expected: exit 0.
- `node tests\self_check.js` -- expected: `PASS: Telegram collector self-check`.
- `npx --yes @google/clasp@3.4.1 status` -- expected: only `Code.gs` and `appsscript.json` tracked.
- Pull deployed version into an isolated directory and compare SHA-256 hashes -- expected: exact local/remote parity.

**Manual checks:**
- Run `installWebhook()`, then `webhookInfo()`; expect a redacted query credential, unchanged deployment ID, `pending_update_count` trending to zero, and no new 401 timestamp.

## Live Release Evidence

- Existing deployment ID now maps to immutable Apps Script version 22.
- Isolated pull-back SHA-256 hashes match local `Code.gs` and `appsscript.json` exactly.
- `installWebhook()` completed with `drop_pending_updates=false`; `webhookInfo()` returned a redacted query URL, zero pending updates, and no current error.
- Queued updates reached version 22 `doPost`; three photo rows were retained as `ARCHIVE_RETRY` because the previous Drive folder was inaccessible.
- A private `SchoolImages Telegram Archive` folder was created under the deployment identity, `DRIVE_FOLDER_ID` was corrected, and `setupPoc()` then completed successfully.
- A fresh human-account Telegram photo remains the final end-to-end archive, Groq, and publication proof; stale failed updates were not replayed.

## Suggested Review Order

**Authentication boundary**

- Reject invalid configuration and ambiguous credentials before reading the request body.
  [`Code.gs:145`](../../apps-script/Code.gs#L145)

- Accept exactly one consistent query credential and refuse legacy path combinations.
  [`Code.gs:3485`](../../apps-script/Code.gs#L3485)

**Installation and disclosure controls**

- Constrain installation to the canonical Apps Script deployment while retaining queued updates.
  [`Code.gs:534`](../../apps-script/Code.gs#L534)

- Fail closed when webhook status contains malformed or unrecognized credential-bearing URLs.
  [`Code.gs:559`](../../apps-script/Code.gs#L559)

- Validate the configured deployment URL before constructing the authenticated endpoint.
  [`Code.gs:752`](../../apps-script/Code.gs#L752)

**Regression and operations evidence**

- Exercise real entry-point rejection, valid processing, installer payload, and log redaction.
  [`self_check.js:77`](../../tests/self_check.js#L77)

- Require deployment identity, source-hash parity, queue drainage, and stable error timestamps.
  [`README.md:34`](../../README.md#L34)
