---
title: 'Approved Pilot Semantic Photo Search'
type: 'feature'
created: '2026-08-06'
status: 'done'
baseline_commit: 'NO_VCS'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/prds/prd-Telegram-Bot-2026-08-06/prd.md'
  - '{project-root}/_bmad-output/planning-artifacts/prds/prd-Telegram-Bot-2026-08-06/addendum.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Private `/search` currently uses exact weighted token overlap, so a query such as “farm” cannot find an image containing a farmer, horse, and sheep unless one stored field repeats that word. Sending real school images or arbitrary private queries to Gemini free tier is not approved.

**Approach:** Add a fail-closed Gemini embedding evaluation pilot for explicitly allowlisted synthetic or properly de-identified Photo Records and preregistered non-sensitive queries. An authorized Apps Script editor invokes bounded indexing manually; private search ranks compatible vectors with exact cosine similarity and visibly identifies when the current lexical search is used instead.

## Boundaries & Constraints

**Always:** Keep Telegram authorization before archive access; require exact pilot enablement plus dataset ID, approver, approval time, future expiry, record allowlist, and query allowlist before any external embedding call; run image indexing only from `indexApprovedGeminiPilot()` outside the webhook; claim and finalize index rows under short script locks while performing remote calls outside locks; validate provider payloads and vectors; compare only ready, unexpired, currently approved entries whose Photo Record still exists; preserve Groq and manual metadata; cap results at five; label each result path `Semantic pilot` or `Lexical fallback`; keep secrets in Script Properties.

**Ask First:** Any request to process real school or children images, permit arbitrary query text, auto-index the existing archive, change provider/model space, or introduce a hosted/vector service.

**Never:** Face recognition, identity or sensitive-trait inference, biometric indexing, student profiling, silent fallback, automatic backlog migration, API keys or image bytes in Sheets/logs/source, a vector database, or production/quality claims from local and synthetic integration checks alone. The judged bilingual benchmark and cost report are a separate pilot-validation slice.

### Configuration Contract

Required Script Properties are `GEMINI_API_KEY`, `GEMINI_PILOT_ENABLED=true`, `GEMINI_PILOT_DATASET_ID`, `GEMINI_PILOT_APPROVED_BY`, ISO-8601 `GEMINI_PILOT_APPROVED_AT`, future ISO-8601 `GEMINI_PILOT_EXPIRES_AT`, comma-separated `GEMINI_PILOT_RECORD_IDS`, and newline-separated `GEMINI_PILOT_QUERIES`. `GEMINI_EMBEDDING_MODEL` is optional and defaults to `gemini-embedding-2`. Empty identifiers, invalid dates, expired approval, empty allowlists, duplicate normalized queries, or an unsupported model configuration fail closed.

### Embeddings Sheet Contract

One current row per `record_id + model` contains: `record_id`, `dataset_id`, `approved_by`, `approved_at`, `approval_expires_at`, `model`, `dimensions`, `vector_json`, `status`, `attempts`, `last_error`, and `updated_at_utc`. Status is `INDEXING`, `READY`, `ERROR`, or `REVOKED`. Error text is bounded and never contains credentials, request bodies, or image bytes.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Approved indexing | Enabled, unexpired pilot; listed existing Photo Record; valid image response | One `READY` model-specific row with dataset approval provenance | Re-run skips the same ready row; failed rows are retryable |
| Closed gate | Missing/malformed approval or unlisted Photo Record | No external image request | Throw a bounded operator-facing error |
| Approved search | Authorized user; listed query; compatible approved ready vectors | Up to five `Semantic pilot` results in descending cosine order | Invalid, revoked, orphaned, expired, or incompatible vectors are skipped |
| Local fallback | Unlisted query, disabled/expired pilot, no eligible vectors, or provider error | Existing lexical ranking runs unchanged and results say `Lexical fallback` | No image indexing or Photo Record mutation; no provider details shown |
| Bad provider output | HTTP error, empty/non-finite vector, or wrong dimensions | Never mark ready or use the vector | Store bounded status/error for indexing; fallback for search |
| Revocation | Record removed from current allowlist or Photo Record missing | Entry is immediately ineligible for search | `purgeRevokedGeminiPilotEmbeddings()` clears vector data and marks it `REVOKED` while retaining audit provenance |

</frozen-after-approval>

## Code Map

- `apps-script/Code.gs` — existing capture, Script Properties config, Sheets setup, private command routing, lexical ranker, provider REST pattern, and self-check.
- `tests/self_check.js` — dependency-free VM runner for `selfCheck()`.
- `README.md` — operator configuration, privacy warning, pilot indexing, disablement, and verification instructions.

## Tasks & Acceptance

**Execution:**

- [x] `apps-script/Code.gs` — add the contracted Embeddings Sheet, strict pilot configuration parsing, `indexApprovedGeminiPilot()` with a two-record batch and short-lock claim/finalize flow, `purgeRevokedGeminiPilotEmbeddings()`, Gemini response validation, eligible-record joins, cosine ranking, and labeled semantic-to-lexical routing; extend `selfCheck()` with deterministic provider-independent checks.
- [x] `README.md` — document every required Script Property, synthetic/de-identified-only boundary, explicit indexing workflow, lexical fallback, disablement, and paid/privacy approval required before real imagery.

**Acceptance Criteria:**

- Given missing or malformed pilot approval, when indexing is invoked, then no provider request occurs and the call fails closed.
- Given an approved Photo Record is indexed twice for the same model, when both runs complete, then exactly one current index row exists.
- Given an authorized approved query and compatible vectors, when `/search` runs, then at most five photos are ordered by descending cosine similarity with deterministic ties.
- Given an unapproved query or any semantic-provider failure, when `/search` runs, then the existing lexical result path is labeled `Lexical fallback` without exposing provider details.
- Given malformed, non-finite, zero-magnitude, model-mismatched, or dimension-mismatched vectors, when ranking runs, then those candidates are skipped without aborting other results.
- Given approval expires, a record leaves the allowlist, or its Photo Record is absent, when search runs, then its Embedding is ineligible; when purge runs, vector data is cleared and audit provenance remains.
- Given two indexer invocations overlap, when they claim work, then the same `record_id + model` is not sent twice and webhook lock time excludes the remote provider call.
- Given Groq is disabled or manual tags exist, when semantic indexing/search runs, then it neither depends on Groq nor overwrites manual metadata.

## Spec Change Log

## Design Notes

The pilot ceiling is 100 Indexed Photos, so a Sheet scan and exact cosine comparison are the smallest correct design. Mark this O(n) ceiling with a `ponytail:` comment; add a vector index only after measured latency violates the PRD target. This slice proves safe integration and deterministic ranking mechanics. The separate pilot-validation slice must run the preregistered bilingual relevance benchmark, latency measurement, provider-failure rate, and cost report before any semantic-quality or production decision.

## Verification

**Commands:**

- `node tests/self_check.js` — expected: `PASS: Telegram collector self-check` and exit code 0; exercises configuration rejection before fetch eligibility, normalized query approval, cosine ordering/ties, invalid vectors, duplicate row selection, and revoked/orphaned exclusion without live credentials.

**Manual checks:**

- In Apps Script, run setup and `indexApprovedGeminiPilot()` with synthetic/de-identified test records; confirm approval provenance, bounded two-record processing, one-row idempotency, labeled semantic results, labeled lexical fallback, expiry rejection, and revocation purge. This is live-provider integration evidence, not semantic-quality or production approval.

## Suggested Review Order

**Search entry and fallback**

- Private commands preserve authorization while selecting semantic or lexical results.
  [`Code.gs:165`](../../apps-script/Code.gs#L165)

- Eligibility is checked before any approved query leaves the system.
  [`Code.gs:1317`](../../apps-script/Code.gs#L1317)

- Result captions disclose semantic versus lexical ranking without provider details.
  [`Code.gs:1452`](../../apps-script/Code.gs#L1452)

**Approval and indexing boundary**

- Strict configuration rejects disabled, expired, malformed, duplicate, or oversized pilots.
  [`Code.gs:392`](../../apps-script/Code.gs#L392)

- Manual indexing claims two records and performs remote calls outside locks.
  [`Code.gs:503`](../../apps-script/Code.gs#L503)

- Every image request revalidates live approval and source-record identity.
  [`Code.gs:535`](../../apps-script/Code.gs#L535)

- Revocation clears vector data while retaining bounded audit provenance.
  [`Code.gs:754`](../../apps-script/Code.gs#L754)

**Storage and verification**

- Setup creates the separate Embeddings Sheet under a protected header contract.
  [`Code.gs:33`](../../apps-script/Code.gs#L33)

- Provider-free checks cover gates, vectors, duplicates, expiry, and deterministic ranking.
  [`Code.gs:1550`](../../apps-script/Code.gs#L1550)

- Operator documentation states configuration, privacy limits, fallback, and purge steps.
  [`README.md:76`](../../README.md#L76)
