---
title: 'Telegram Security and Authorization Hardening'
type: 'bugfix'
created: '2026-08-06'
status: 'done'
baseline_commit: 'NO_VCS'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/prds/prd-Telegram-Bot-2026-08-06/prd.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-approved-pilot-semantic-search.md'
---

<frozen-after-approval reason="human-owned intent - do not modify unless human renegotiates">

## Intent

**Problem:** The current setup contains reusable storage IDs, can bind itself to the first group that contacts it, authorizes private search from a static user list after staff leave the school group, and places the webhook secret in a query string. The README also presents local source as if it were deployed.

**Approach:** Require all operator-owned IDs before setup, bind exactly one configured school group, combine the explicit search allowlist with a live Telegram group-membership check, require the bot to be a group administrator, and authenticate webhook requests only from the Apps Script path segment.

## Boundaries & Constraints

**Always:** Fail closed before archive access; keep `SEARCH_USER_IDS` as the first authorization gate; then require current membership in `ALLOWED_CHAT_ID`; accept Telegram statuses `creator`, `administrator`, and `member`, plus `restricted` only when `is_member === true`; treat API errors and malformed responses as unauthorized; require explicit `BOT_TOKEN`, `SPREADSHEET_ID`, `DRIVE_FOLDER_ID`, `ALLOWED_CHAT_ID`, and `SEARCH_USER_IDS`; keep generated secrets in Script Properties; preserve existing ingestion, Gemini, Groq, and ranking behavior.

**Never:** Auto-select or auto-bind a group, cache membership, accept webhook secrets from query parameters, expose Telegram/API error details to users, claim local code is deployed, or perform deployment/live-provider calls in this cycle.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Behavior |
|---|---|---|
| Missing setup property | Missing storage ID or allowed chat | Throw before writing properties or creating Sheets |
| Correct group update | Message chat equals configured `ALLOWED_CHAT_ID` | Existing capture flow continues |
| Other group update | Any other group ID | Ignore without changing configuration |
| Authorized private user | User is allowlisted and currently a group member | Existing `/start` or `/search` flow continues |
| Former/non-member | Allowlisted user is `left`, `kicked`, or restricted without membership | Deny before opening the archive |
| Membership unavailable | `getChatMember` fails or returns malformed data | Fail closed with a generic reply; log bounded diagnostics |
| Valid webhook | Exact generated secret in `e.pathInfo` | Process the update |
| Legacy/invalid webhook | Secret only in query string, missing path, or wrong path | Return not found without processing |
| Bootstrap without bot admin | Bot is not administrator/creator in configured group | Throw and do not install webhook |

</frozen-after-approval>

## Code Map

- `apps-script/Code.gs` - required-property validation, setup/bootstrap, path-only webhook validation, group/member authorization, Gemini input attestation, Telegram calls, and provider-free self-check.
- `tests/self_check.js` - dependency-free runner for deterministic security checks.
- `README.md` - truthful configuration, basic non-sensitive Gemini gate, administrator prerequisite, deployment, and webhook migration steps.

## Tasks & Acceptance

**Execution:**

- [x] `apps-script/Code.gs` - remove reusable storage-ID defaults and validate `BOT_TOKEN`, `SPREADSHEET_ID`, `DRIVE_FOLDER_ID`, `ALLOWED_CHAT_ID`, and a nonempty numeric `SEARCH_USER_IDS` before setup mutates properties or Sheets; generate only a missing hexadecimal webhook secret after validation.
- [x] `apps-script/Code.gs` - remove bootstrap/webhook auto-binding; keep discovery diagnostic-only; reject foreign-group updates without configuration mutation.
- [x] `apps-script/Code.gs` - require the static private-search allowlist and then a live `getChatMember` result before opening the archive; accept documented member statuses through one pure predicate and fail closed with a generic reply on malformed/provider failures.
- [x] `apps-script/Code.gs` - make `installWebhook()` verify the configured group and the bot's administrator/creator status, then install `WEB_APP_URL/<secret>`; authenticate only an exact `e.pathInfo` secret.
- [x] `apps-script/Code.gs` - require `GEMINI_INPUTS_CONFIRMED_NON_SENSITIVE=true` whenever the Gemini pilot is enabled, revalidate it before provider calls, and preserve the existing explicit record/query allowlists without adding model-based or keyword-based sensitivity detection.
- [x] `apps-script/Code.gs` and `tests/self_check.js` - extend the provider-free self-check for required configuration, membership/admin predicates, path-only secrets/URLs, foreign-group non-mutation, and Gemini attestation failure.
- [x] `README.md` - remove deployment-parity claims and hard-coded project URLs; document all required IDs, numeric chat ID, bot-admin prerequisite, non-sensitive Gemini attestation, local-proof limitation, and deploy/reinstall/verify migration order.

**Acceptance Criteria:**

- Given any required operator property is absent, when setup/bootstrap runs, then it fails before configuration or storage mutation.
- Given an update from an unconfigured group, when the webhook handles it, then no capture or chat-binding mutation occurs.
- Given a statically allowlisted user who is no longer a current group member, when a private command arrives, then archive access and search do not occur.
- Given membership lookup fails or is malformed, when authorization runs, then access is denied without leaking provider details.
- Given the bot is not a configured-group administrator, when bootstrap runs, then webhook installation is refused with an operator-facing error.
- Given a query-only or incorrect webhook secret, when `doPost` runs, then the update is not processed; an exact path secret is accepted.
- Given the Gemini pilot is enabled without exact non-sensitive-input attestation, when image indexing or semantic query embedding is attempted, then no Gemini request occurs and lexical search remains available.
- Given a record and query are explicitly approved and attested non-sensitive, when the existing Gemini pilot gate runs, then no sensitive-trait classifier or sensitive-trait output is introduced.
- Given local self-check execution, when the changes are complete, then `node tests/self_check.js` exits zero and covers the new security decisions.
- Given the README, when an operator follows it, then it does not infer deployment parity from repository state and instructs deploy-new-code, immediately run `installWebhook()`, then verify `webhookInfo()`.

## Design Notes

Use the existing `telegram_()` REST helper, one pure membership-status predicate, and one pure bot-admin predicate. Do not add dependencies, caches, middleware, DLP APIs, sensitivity classifiers, or keyword denylists. Telegram membership failures return one generic denial while bounded logs omit Telegram response details.

The user's basic Gemini gatekeeper is an operator attestation applied before bytes or queries leave the system. It does not claim that an embedding cannot internally encode sensitive visual signals; only excluding such input can enforce that boundary. Gemini remains embedding-only, and the application must not request or surface identity, biometric, health, religion, ethnicity, or other sensitive-trait labels. Groq's existing no-sensitive-inference prompt remains unchanged.

`installWebhook()` must repeat bot-admin validation so a caller cannot bypass bootstrap. Use a generated hexadecimal secret so path decoding cannot change the comparison value. Keep `ANYONE_ANONYMOUS` because Telegram calls the web app; the exact high-entropy path is the ingress credential for this Apps Script design.

## Verification

**Command:** `node tests/self_check.js` - expected `PASS: Telegram collector self-check`, exit code 0.

**Manual checks:** In Apps Script with test credentials, verify missing-property rejection, bot-admin rejection, current/former member behavior, an ignored foreign-group update, path-only webhook installation, and clean `webhookInfo()`. Deployment and these live checks remain operator actions.
