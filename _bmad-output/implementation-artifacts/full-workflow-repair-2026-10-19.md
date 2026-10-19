# Full workflow repair — 2026-10-19

## Decision

The locally inspected workflow is materially safer and more operable, but it is
not yet a confirmed live release. Repository evidence now covers the verified
correctness gaps. Deployment and human/account/privacy acceptance remain separate.

## Locally verified repairs

- Archive and caption lease reclamation no longer consumes attempts merely
  because a post-provider save lock was unavailable.
- Multi-result search records per-result `CLAIMED`, `SENT`, and `UNKNOWN`
  dispositions; confirmed or ambiguous deliveries are not automatically resent.
- Authenticated webhook updates are durably admitted to `Inbox` before processing,
  completed redeliveries are suppressed, and caught failures receive bounded worker
  retries with sanitized errors.
- `catalogOperationalReport()` combines stage/inbox health, required trigger
  cardinality, redacted webhook state, and bounded recovery candidates.
- Optional operator alerts are sanitized and repeated incidents are suppressed.
- Manifest-first erasure protects shared canonical objects, tombstones targeted
  searchable rows, clears matching vectors, and records manual external deletion
  dispositions; interrupted execution remains visibly claimed.
- Hybrid teacher search now requires the exact pilot approval, a deterministic
  passing PRD evaluation, an integration approver, and explicit activation of the
  matching evaluation ID. Lexical fallback remains the default.
- GitHub Actions and `tools/verify_release.ps1` run every registered offline check,
  syntax validation, and whitespace validation and record the source hash.

## Evidence boundaries

The offline fixtures execute the current `apps-script/Code.gs`; they do not prove
that Google Apps Script editor source, an immutable deployment, Telegram webhook,
Drive/Sheets state, provider behavior, or GitHub currently match this checkout.
The generated release manifest states those boundaries explicitly.

## Remaining external gates

1. Review and commit the repaired source; run the release verifier from the exact
   release commit and preserve its manifest.
2. With workers and webhook delivery safely paused and pending updates preserved,
   save the exact reviewed source, create an immutable Apps Script version, and
   verify source SHA-256/parity before activation.
3. Install exactly six managed workers and verify one trigger per handler; restore
   the webhook without dropping updates; inspect the sanitized operational report.
4. Run a synthetic canonical-dedup acceptance trace proving two provenance rows,
   one Drive object, one analysis/publication, one search slot, and caption sync.
5. Test an independently authorized second teacher and revocation.
6. Restore into an independent Google account; the earlier same-account exercise
   does not satisfy this gate.
7. Exercise one approved access/erasure case, including manual Drive/Telegram and
   independent backup-controller dispositions.
8. Obtain privacy/provider approval and run the preregistered bilingual semantic
   benchmark on the exact approved dataset. Do not activate hybrid teacher search
   from synthetic local results.

## Verification command

```powershell
.\tools\verify_release.ps1
```

The command writes
`_bmad-output/implementation-artifacts/release-verification-current.json` and
prints the Apps Script SHA-256. A passing local result is release-candidate
evidence only.
