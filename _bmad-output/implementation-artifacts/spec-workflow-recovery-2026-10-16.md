---
title: 'Repair verified workflow blockers'
type: 'bugfix'
created: '2026-10-16'
status: 'in-review'
route: 'oneshot'
route_source: 'auto'
review: 'quick'
review_source: 'auto'
lenses_ran: ['quick']
review_loop_iteration: 0
baseline_commit: '56451095fc362670de9b45d63f9e13233d1707ae'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

Review the complete Telegram input → Drive/Sheets → Groq → output → private
search workflow and fix verified blockers while preserving records, authentication,
new-photo-only activation, and duplicate-publication protection. The previous live
cutover stopped with workers off after bootstrap saved a development URL. Repair
bootstrap so an explicit canonical deployed URL survives editor execution, reject
invalid addresses before mutations, update the retired default Groq vision model
to its documented successor, align the prompt with enforced metadata limits, and
prevent provider transport/HTTP errors from exposing credentials in logs or Sheets.

The new Google project already has version 1 deployed, but a release containing
these repairs must be verified and deployed before activation. Never inspect or
emit credential settings snapshots, rotate credentials through automation, drop
pending updates, replay ambiguous sends, or backfill historical tagging/publication.
The user enters replacement credentials directly; the last reported exposure has
not yet been followed by a new rotation confirmation. Do independent local work
first, and report this live activation dependency accurately. Search remains a
private bot command; Telegram group search uses output captions.

Acceptance: Given a canonical configured /exec URL and a /dev service URL, bootstrap
preserves and uses /exec. Given a missing/invalid configured URL, bootstrap fails
before setup, property writes, or Telegram calls. Given provider transport errors
or HTTP bodies, errors contain only safe operation/status information and preserve
publication ambiguity and retry behavior. Given ordinary config without a model
override, Groq uses the current documented vision model; explicit overrides remain
operator decisions. Given dense text, the generation instructions specify the same
OCR/list/caption limits as validation; malformed metadata is still rejected.
Local tests must cover actual bootstrap/provider boundaries and existing workflow
checks must remain green. Live success requires a fresh safe photo traced through
archive integrity, validated metadata, exactly one publication and private search;
local fixtures cannot establish that result.

</frozen-after-approval>

## Implementation Notes

Small corrections in the existing bootstrap, transport and request code are expected
to require fewer than 100 production lines; use the oneshot route. Read-only parallel
investigation covers capture/search and enrichment/publication. Existing baseline
self-check, archive-retry suite and syntax check passed before changes.

Implemented and verified all local corrections. The generated prompt retains strict
metadata validation and requests bounded excerpts rather than silently truncating
provider output. Explicit model overrides remain intact. Provider HTTP bodies and
transport exception details are suppressed; status/disposition/retry metadata is
preserved. All three offline suites, syntax and diff checks pass.

User confirmed the latest three-credential rotation. Target editor source hash was
verified before/after saving. A temporary helper verified the rotated bot/groups and
bound the canonical deployment base URL, then was removed before versioning.
Version 2 deployed successfully; bootstrap completed; webhook diagnostics confirmed
the exact target base with redacted secret, zero queue and no delivery error. Both
activation helpers completed; trigger inventory shows exactly one owned time-based
tag worker and one publication worker. Fresh safe-photo acceptance remains pending,
so incident acceptance stays in-review rather than claiming full live completion.

## Spec Change Log

## Review Triage Log

## Current reconciliation — 2026-10-19

The frozen intent and October 16 live evidence above remain historical. The
current checkout adds lease-attempt refunds, per-result search dispositions, a
durable webhook inbox, consolidated operational reporting, manifest-first
erasure, a PRD-threshold semantic activation gate, and automated verification.
These changes are locally verified but have not been established as the current
Apps Script editor source or immutable deployment. Fresh live acceptance,
second-teacher authorization/revocation, independent-account restoration,
privacy approval, and real-data semantic evaluation remain pending. See
`full-workflow-repair-2026-10-19.md` and the generated release manifest.

- medium / patch: bootstrap trimmed the URL while install consumed the raw value.
  Removed the trim and added a whitespace fixture proving failure before mutations.
- high / patch: provider description redaction could preserve encoded credentials.
  Replaced Groq/publication HTTP descriptions with fixed safe operation/status text;
  encoded-credential fixture preserves retry disposition and retry-after metadata.
- Follow-up independent review: no remaining actionable findings. Existing durable
  ingestion and partial-search delivery limitations remain recorded in the report.

## Verification

- Run regression fixtures for bootstrap and provider failure boundaries.
- Run `node tests/self_check.js`, `node tests/archive_retry_check.js`, source syntax
  check, and `git diff --check`.
- Reconcile the new release with the target editor/deployment only through a safe
  source view. Credential replacement and final live test remain explicit evidence
  requirements before marking the operational incident resolved.
