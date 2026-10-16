---
title: 'Close shared catalog operational gaps'
type: 'bugfix'
created: '2026-10-16'
status: 'done'
route: 'oneshot'
route_source: 'auto'
review: 'quick'
review_source: 'auto'
lenses_ran: ['quick']
review_loop_iteration: 0
baseline_commit: '4d82e47d0e1dece729b59dbdc636fc9c72d24adf'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

Resolve the practical limitations remaining after release 7. The user states this
catalog contains no sensitive school/children images requiring provider approval;
document that operating scope without adding an approval gate. Advanced OCR,
semantic retrieval and hosting migration remain deferred as previously agreed.

Add operator-invoked recovery for one exact historical archive record and distinguish
historical/unactionable work from current worker backlog. Never manufacture intake,
analysis or publication admission. Preserve original evidence in an append-only audit
event before recovery commits. Validate existing accessible Drive bytes, compare any
existing integrity evidence, or recover missing bytes from the retained Telegram file
reference into the current private archive. Do not overwrite conflicting evidence,
delete old files, replay PUBLISH_UNKNOWN, or grant historical publication eligibility.
Refuse ambiguous IDs, active leases, admitted records and publication-eligible records;
perform network work outside locks and reject stale completion. Failures remain
visible and leave the original record intact; successful archive-only recovery sets
TAG_NOT_ELIGIBLE. Repeated successful recovery is a verified no-op.

Given a recoverable historical row, when explicitly repaired, then canonical integrity
is established, original evidence retained and no AI/publication work queued. Given
conflicting bytes, unavailable sources, a stale claim or a failed audit write, when
repair runs, then no original record/evidence is replaced. Given stranded historical
retries, when health is inspected, then they are distinguished from actionable work.

Use the user's named second Telegram input group for live enrollment and synthetic
capture into the existing shared output. Run record-scoped, temporary editor-only
failure drills against actual workers, restoring overrides/pause state in finally;
do not change credentials or induce real provider outages. Label accelerated retry
timing and injected failures honestly. Verify fallback publication, later enrichment
on the same output message and duplicate suppression. Create a private backup and
exercise non-destructive restoration using copied data with byte/hash checks.

No second member is available: retain that live-human observation as pending rather
than fabricate it. Likewise report any historical file that cannot be recovered
without accessible bytes or a new upload. Record actual search relevance on the
non-sensitive fixtures without claiming school-corpus accuracy.

</frozen-after-approval>

## Implementation Notes

Production change: targeted recovery and health classification (roughly 120 lines), reusing archive validation,
deterministic storage and existing Sheet/Events contracts. Live drills and backup
verification use temporary operator helpers rather than permanent fault switches.
No new storage platform or migration schema is required.

## Spec Change Log

## Review Triage Log

- medium / patched: explicitly PUBLISH_NOT_ELIGIBLE historical rows were rejected
  by an overly broad publication-status guard. Permit only that inert status;
  retain refusal of attempted, pending, published and uncertain delivery.
- Live discovery / patched: v1 upload timestamps omit milliseconds. Normalize
  exactly the legacy UTC seconds format for source retrieval while retaining
  strict date validation and preserving the original timestamp in the audit.


- medium / patched: a complete ARCHIVED ledger with a missing Drive object took
  the no-op path too early. All repairs now inspect bytes or fall back to retained
  Telegram references and compare integrity before deciding whether to no-op.
- medium / patched: previously archived historical rows with TAG_PENDING could
  retain AI work. Only verified TAG_NOT_ELIGIBLE records qualify for no-op;
  other successful repairs audit and disable AI work. Both have regressions.


- Final review: no additional material findings after patches; health classification
  now preserves admitted work when Groq is temporarily disabled. Regression passes.

## Verification

- Add failing recovery/health regressions; run all `tests/*_check.js`, source syntax
  and diff checks after implementation and review.
- Deploy reviewed source with parity, verify second-input enrollment/capture/search,
  controlled failure/recovery and private backup restoration; preserve existing
  records, credentials, queued updates and publication IDs. Save results and exact
  remaining external dependencies in the workflow report.



Evidence: workflow-debug-and-repair-2026-10-16.md, operational closure section.
All ten registered checks pass, plus Apps Script syntax and git diff checks.
Live: six historical records repaired archive-only; two active inputs; injected
failure/retry/fallback drill with real enrichment on output message28; positive,
ranked phrase and negative searches; nine-file private backup and functional
isolated restore. Second-human test unavailable; independent-account disaster
recovery and advanced OCR/semantic retrieval remain outside verified coverage.

Final deployment: version9, clean-source SHA-256
278c314435d12ca78c7fd0f68a631f7df7f97ced506ddf943e4960719f2a0eb3.
Post-deployment group command39 returned expected image40. All temporary operator
helpers removed and localhost source bridge stopped.
