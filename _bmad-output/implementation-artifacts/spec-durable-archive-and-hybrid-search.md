---
title: 'Durable Image Archive and Hybrid Search Hardening'
type: 'feature'
created: '2026-08-31'
status: 'done'
baseline_commit: 'NO_VCS'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/research/technical-telegram-native-storage-vs-google-drive-permanent-image-archive-research-2026-08-31.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-security-authorization-hardening.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The bot saves originals to Drive before Groq analysis, but the ledger does not prove archive integrity or enforce archive completion before AI/index/publication. Search also chooses semantic or lexical ranking instead of combining both signals.

**Approach:** Make the Drive original a verified prerequisite with explicit integrity/provenance state, gate every derived stage on it, add a non-sending archive audit, and deterministically fuse approved semantic results with lexical/OCR/tag matches.

## Boundaries & Constraints

**Always:** Preserve immutable original bytes before any AI call; append schema fields without reordering existing columns; retain Telegram IDs as delivery/deduplication references; keep AI metadata and embeddings rebuildable; fail closed for missing/unverified archives; preserve strict bilingual Groq validation, leases, retries, deduplication, privacy gates, and Drive fallback; complete the approved security-hardening spec before live activation.

**Ask First:** Selecting or creating a second backup destination; defining retention/deletion rules; changing Drive ownership/shared-drive placement; sending images to Groq/Gemini; deploying, installing triggers/webhooks, changing Script Properties, or sending Telegram messages; migrating to PostgreSQL/pgvector.

**Never:** Treat Telegram as the canonical archive; overwrite the original with enriched output; store image bytes in Sheets or a vector database; publish or semantically index an incomplete/unresolvable archive; infer sensitive personal traits; claim backup/recovery or live readiness without captured restore/live evidence.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| New valid photo | Non-empty supported image downloaded from Telegram | Save once to Drive; record MIME, byte size, SHA-256, archive timestamp/status; then permit analysis | N/A |
| Duplicate update | Existing canonical record/object | Reuse the same archive identity without duplicate effects | Reconcile stored integrity; flag conflicts |
| Invalid/archive failure | Empty, unsupported, oversized, missing, or inaccessible object | No AI, embedding, or publication eligibility | Persist bounded archive error and terminal/retryable state |
| Legacy row | Drive ID exists but integrity fields are absent | Remains lexically visible only under explicit legacy policy; not AI/index/publication eligible as newly verified | Audit reports `LEGACY_UNVERIFIED` for operator repair |
| Approved semantic query | Valid archived records with lexical and semantic candidates | Return one deduplicated deterministic hybrid ranking | On provider/pilot failure, use lexical results only |

</frozen-after-approval>

## Code Map

- `apps-script/Code.gs` -- record schema, archive capture/integrity, stage eligibility, audit, ranking, and provider-free checks.
- `tests/self_check.js` -- deterministic source and runtime regression checks.
- `README.md` -- archive contract, operator gates, health/audit, recovery limitations, and activation sequence.

## Tasks & Acceptance

**Execution:**
- [x] `apps-script/Code.gs` -- append archive MIME/size/SHA-256/status/error/completion fields and central field indexes; migrate headers without destructive reordering.
- [x] `apps-script/Code.gs` -- validate downloaded bytes, compute integrity metadata, save/reconcile the canonical Drive object, and commit archive state before Groq eligibility.
- [x] `apps-script/Code.gs` -- centralize archive eligibility and apply it to Groq claims, Gemini indexing/results, publication claims, search visibility, and Drive fallback.
- [x] `apps-script/Code.gs` -- add a read-only/non-sending archive audit summarizing missing objects, size conflicts, incomplete states, terminal failures, and legacy rows without exposing secrets.
- [x] `apps-script/Code.gs` -- fuse lexical and approved semantic candidates using deterministic normalized rank fusion, deduplicate by record ID, and preserve lexical-only fallback.
- [x] `apps-script/Code.gs` and `tests/self_check.js` -- cover archive state transitions, duplicate reconciliation, fail-closed eligibility, audit classification, hybrid ties/deduplication, Arabic/English lexical fallback, and backward-compatible headers.
- [x] `README.md` -- document source-of-truth roles, raw-before-analysis timeline, fields/states, audit usage, backup/restore limitation, hybrid search, and the non-sending-to-live activation boundary.

**Acceptance Criteria:**
- Given a new photo, when capture succeeds, then no Groq/Gemini/publication path can run until a resolvable Drive object and integrity fields are committed as archived.
- Given missing or conflicting archive evidence, when workers/search run, then derived actions fail closed and the audit identifies the record without leaking credentials.
- Given lexical and semantic candidates, when hybrid ranking runs, then each record appears once in deterministic order and semantic failure still returns lexical matches.
- Given existing Sheets, when schema preparation runs, then prior columns/data retain their positions and new fields append safely.
- Given local verification, when `node tests/self_check.js` runs, then it exits zero without provider calls or external writes.

## Design Notes

Use one pure archive-state predicate everywhere. SHA-256 describes the downloaded original; metadata stays in Sheets and the original Drive blob is never rewritten. Hybrid ranking should combine bounded lexical and semantic ranks rather than raw scores with incompatible scales. Database/vector migration remains threshold-driven.

## Verification

**Commands:**
- `node tests/self_check.js` -- expected: `PASS: Telegram collector self-check` and zero exit code, with no network calls.
- `Get-Content -Raw -LiteralPath 'apps-script\Code.gs' | node --check -` -- expected: syntax success.

**Manual checks:**
- Review exact source for zero hard-coded secrets/invite links and confirm every AI/publication claim uses the archive predicate.
- Later, only with explicit activation approval, run non-sending identity/config checks followed by one synthetic archive/enrich/search/fallback/restore evidence cycle.

## Suggested Review Order

**Archive lifecycle and integrity**

- Raw preservation owns retries, terminal failures, and duplicate reconciliation.
  [`Code.gs:252`](../../apps-script/Code.gs#L252)

- Canonical storage verifies unique identity, signatures, size, MIME, and SHA-256.
  [`Code.gs:385`](../../apps-script/Code.gs#L385)

- One strict archive predicate gates every derived stage.
  [`Code.gs:1179`](../../apps-script/Code.gs#L1179)

- Non-sending audit detects missing, replaced, malformed, or legacy objects.
  [`Code.gs:573`](../../apps-script/Code.gs#L573)

**AI, publication, and search boundaries**

- Gemini claims bind archive evidence before and after external work.
  [`Code.gs:1359`](../../apps-script/Code.gs#L1359)

- Groq claims revalidate the same canonical object before committing metadata.
  [`Code.gs:2447`](../../apps-script/Code.gs#L2447)

- Publication revalidates and sends verified Drive bytes, not Telegram-only storage.
  [`Code.gs:2173`](../../apps-script/Code.gs#L2173)

- Hybrid search resolves archives before queries and deterministically fuses ranks.
  [`Code.gs:3133`](../../apps-script/Code.gs#L3133)

**Security and operator guidance**

- Setup fails closed before mutation and requires operator-owned identifiers.
  [`Code.gs:80`](../../apps-script/Code.gs#L80)

- Private search combines static allowlisting with current group membership.
  [`Code.gs:195`](../../apps-script/Code.gs#L195)

- README explains custody, activation boundaries, audit, and recovery limits.
  [`README.md:204`](../../README.md#L204)

**Provider-free verification**

- Runtime mocks exercise signatures and ambiguous duplicate Drive objects.
  [`self_check.js:11`](../../tests/self_check.js#L11)
