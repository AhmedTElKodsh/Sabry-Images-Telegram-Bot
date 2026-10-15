---
title: 'Honor archive retry backoff on Telegram redelivery'
type: 'bugfix'
created: '2026-10-15'
status: 'done'
route: 'oneshot'
route_source: 'auto'
review: 'quick'
review_source: 'auto'
lenses_ran: ['quick']
review_loop_iteration: 0
baseline_commit: 'cd01eab0a6c2f209225e7ef2e488f6f72deaef67'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Telegram redelivery immediately repeats failed Drive capture even when the record contains a future `archive_next_attempt_utc`. Closely spaced deliveries can exhaust the five-attempt limit before Drive recovers.

**Approach:** Refuse archive retries before their recorded due time without consuming an attempt, accessing Drive/Telegram, or completing the photo event. Missing or malformed retry deadlines fail closed. Due retries retain the existing bounded failure/recovery behavior; legacy `ARCHIVE_FAILED` handling remains compatible. This local correction does not add a retry scheduler or replay old live records.

</frozen-after-approval>

## Implementation Notes

- One-shot route: a small guard in `processPhoto_`, isolated behavioral regression coverage, and an operator-documentation correction.
- Reproduced before the fix: an `ARCHIVE_RETRY` row due in one hour invoked storage immediately and advanced `archive_attempts` from 1 to 2.
- Existing webhook lock serializes the record check and attempt. Keep the update unacknowledged by throwing, so Telegram can redeliver; do not append a completed photo event while waiting.
- Implemented the guard, isolated tests, and documented redelivery dependence. Both local suites, Apps Script syntax, and whitespace checks pass.

## Spec Change Log

## Review Triage Log

- medium / patch: The quick reviewer reproduced numeric `0` being accepted by `Date.parse` as an overdue date. Require a string matching the canonical UTC ISO representation written by the retry scheduler. Added coercion, overflow-date, date-only, and alternate-offset cases to the rejection tests.
- Follow-up quick review: no remaining findings; the reviewer reran the isolated regression suite and whitespace check. Completion here refers to this local correction only, not live deployment or full-workflow acceptance.

## Verification

- `node tests/self_check.js` — existing provider-free regression checks pass.
- `node tests/archive_retry_check.js` — future, invalid, due, recovery, and terminal retry behaviors pass without external calls.
- `Get-Content -Raw apps-script/Code.gs | node --check -` — syntax passes.
- `git diff --check` — no whitespace errors.
