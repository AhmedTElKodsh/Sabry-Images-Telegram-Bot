---
title: 'Canonical Exact-Image Deduplication'
type: 'feature'
created: '2026-10-19'
status: 'done'
route: 'full'
route_source: 'auto'
baseline_commit: '0f5e7f1eb473d3ddccb16a2bcced71b7d1059a22'
review: 'thorough'
review_source: 'auto'
lenses_ran: ['blind-hunter', 'edge-case-hunter', 'verification-gap', 'intent-alignment']
review_loop_iteration: 3
context:
  - '{project-root}/_bmad-output/implementation-artifacts/spec-shared-school-catalog.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-durable-archive-and-hybrid-search.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Reuploading the same image under a new Telegram message creates another Drive object, another independently processed record, and potentially another search result. Repeated or different human captions for those uploads are not combined, wasting storage and fragmenting discovery.

**Approach:** Keep every upload row as immutable provenance while assigning exact-byte matches to one canonical searchable/publishable image. Reuse one verified Drive archive, aggregate distinct current human captions for matching and display, and return or publish the canonical image only once.

## Boundaries & Constraints

**Always:** Use validated SHA-256 as the equality authority; `file_unique_id` is only an early correlation signal. Preserve source chat/message, uploader, timestamps, original/latest captions, archive evidence, and event ordering for every upload. Normalize caption equality conservatively (Unicode NFKC, collapsed whitespace, trimmed text) while retaining verbatim text; identical captions are included once and different captions remain searchable. Append schema fields without moving existing columns. Canonical lookup, archive reuse/create, and row linkage must be race-safe and idempotent. Alias uploads must not invoke analysis, embeddings, or photo publication; a new caption for an already published canonical image schedules an edit of its known output message. Keep full caption/provenance data in Sheets and keep Telegram projections within existing limits.

**Never:** Delete or overwrite historical rows or Drive objects, automatically merge pre-existing duplicate candidates, trust `file_unique_id` without byte verification, weaken archive integrity or retry/lease gates, replay `PUBLISH_UNKNOWN`, backfill analysis/publication eligibility, deploy live, change credentials/properties, or send Telegram messages as part of this build.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| First image | New validated bytes | One canonical row and one Drive object continue through existing stages | Existing archive retry/terminal policy applies |
| Same image, same caption | New message with identical bytes/text | Provenance row retained; Drive, caption set, analysis, publication, and search result remain singular | Retry safely without creating a second object |
| Same image, different caption | New message or later edit | Unique caption joins canonical search/display context; known output message is edited once | Caption-sync retry policy applies to the canonical row |
| Concurrent duplicates | Two claims with the same SHA-256 | One canonical Drive object and deterministic canonical linkage | Re-read under lock; reject conflicting evidence |
| Search | Several linked upload rows match | One canonical result occupies one result slot using all active unique captions | Unpublished/unverified aliases cannot make a result eligible |
| Existing catalog | Historical duplicate candidates | Read-only report identifies candidates and evidence; no rows/files are changed | Ambiguous/conflicting groups are reported for review |

</frozen-after-approval>

## Code Map

- `apps-script/Code.gs` — append canonical-link fields to `RECORD_HEADERS`/`RECORD_FIELD`; preserve `record_id` and all source fields as upload provenance. Refactor `processPendingArchives` around existing blob validation/SHA helpers so download occurs outside the lock and canonical selection plus reuse/create/link commit occurs under `ScriptLock`. Deduplicate candidate probes by archive evidence/Drive ID, prioritize an established owner, and validate only until the required owner/source is established. Treat `archivePermanent` validation failures and confirmed missing/trashed/mismatched objects as skippable corrupt candidates; before a source is established, transient, authorization, quota, and indeterminate provider failures abort through retry/pause without creating a new object. Optional later candidates must not block a valid established source and remain unchanged unless the already verified evidence proves them safe to relink. Multiple legacy owners must not block prospective ingest.
- `apps-script/Code.gs` — update `processPhoto_`, `processCaptionEdit_`, `processText_`, `recordPublishCaption_`, publication/tag/embedding/operator gates, and caption-sync routing so aliases never create derived work and canonical rows receive deduplicated linked captions plus adjacent context in sheet/event order. Preserve an active `SYNCING` claim when context changes; completion must compare the latest aggregate and queue a follow-up only when dirty. Aggregate-equivalent alias edits/removals must not queue unchanged Telegram edits. Prospective `ARCHIVE_ONLY` rows may update only their appended canonical-link fields when a later eligible owner appears; legacy blank-field rows remain report-only and unchanged.
- `apps-script/Code.gs` — reconcile publication completion against the latest aggregate under the claim lock: persist a confirmed remote output ID/status before caption recomputation, and if an alias/context change arrived after the claim snapshot or recomputation fails, queue canonical caption sync without losing the publication result. Explicit enrichment must reject aliases.
- `apps-script/Code.gs` — group `rankRecordValues_`, published-group search, semantic candidates, and hybrid fusion by canonical identity before limiting; return canonical archive evidence once. Use code-point-safe bounded projection and prioritize the linked human fragment responsible for a lexical match so it remains visible when capacity permits; semantic projection must include linked human context before AI text. Add a read-only historical duplicate-candidate report that excludes a group only when it has exactly one self-linked owner and every alias has consistent Drive/source/integrity evidence; describe report evidence as ledger-ready rather than live-healthy.
- `apps-script/Code.gs` — make the locked canonical commit retry-completable: write owner sync/relinks idempotently before the current claim-clearing row, so interruption leaves the live claim recoverable and a retry completes the group. Historical recovery must prepare bytes outside the lock but perform digest-name Drive reuse/create and the final row commit under the same `ScriptLock` discipline.
- `tests/catalog_fixture.js` — model multiple uploads, canonical fields, shared archive evidence, and Drive create/reuse behavior without live services.
- `tests/canonical_image_dedup_check.js` — exercise exact-byte identity, lock-held and retry-completable commits, SHA-derived Drive create/reuse/conflict branches, NFKC/whitespace caption uniqueness in sheet order, in-flight publication and caption-sync reconciliation, aggregate-preserving no-op edits, initial and later canonical captions, alias caption edits and adjacent context routed to the owner, alias stage/operator exclusion, one-message synchronization, one-result grouping with the matching linked human fragment visible under the limit and safe supplementary characters, verified-only archive-only relinking, zero-Drive-call public reporting, consistent-evidence resolved filtering, and non-destructive reporting.
- `tests/archive_retry_check.js` — exercise commit-time ordinary, authorization, quota, transient/provider, permanent-corrupt, and conflicting-ledger-evidence failures after successful preparation; assert claim cleanup, retry/terminal/pause behavior, attempt refunds where applicable, later valid-source selection, valid-first immunity to irrelevant later outages, and zero replacement creation after indeterminate or conflicting validation.
- `tests/output_group_search_check.js` — exercise the routed `/search` consumer with a published owner plus alias-only matching text and assert exactly one owner photo is sent.
- `tests/self_check.js`, `tests/catalog_registry_check.js`, `tests/catalog_caption_check.js`, `tests/output_group_search_check.js` — protect Gemini owner-only indexing/search, append-only migration, canonical caption behavior, and both teacher-search interfaces.
- `README.md` — document canonical images, retained provenance, multi-caption matching, one-result behavior, and report-only treatment of historical candidates.

## Tasks & Acceptance

**Execution:**
- [x] `apps-script/Code.gs` — implement append-only canonical identity, race-safe and retry-completable archive reuse with classified candidate failures, current-caption/context aggregation and safe query-aware display, publication/caption-sync race reconciliation, owner-only entry points, grouped retrieval, and evidence-consistent resolved reporting while preserving existing state machines.
- [x] `tests/` — reproduce cross-message duplication first, then cover every matrix row, every review-discovered race/entry point/Drive/worker-failure/consumer-boundary branch, and existing migration/archive/publication/search regressions with provider-free fixtures.
- [x] `README.md` — explain operational behavior and explicitly separate new-ingest deduplication from reviewed historical cleanup without calling ledger-only candidates live-healthy.

**Acceptance Criteria:**
- Given two authorized uploads with identical validated bytes, when archive workers and all downstream workers run repeatedly, then both provenance rows remain, exactly one canonical Drive object/analysis/publication is used, and no retry creates another object or photo message.
- Given distinct active captions across linked uploads, when private or output-group search matches either caption, then the same canonical photo appears once and its bounded displayed caption contains unique human context where capacity permits.
- Given existing rows before migration, when migration and the duplicate report run repeatedly, then all existing cells, statuses, output IDs, eligibility, and Drive objects remain unchanged while candidate groups are deterministic.

## Implementation Notes

- Append canonical record ID, role, link timestamp and archive-source record ID after the established 62-column Records contract. New rows are prospective participants; legacy blank-field rows retain self-identity and are never rewritten by reporting.
- Prepare and hash downloaded bytes before the save lock. The locked commit must establish one verified source, apply dependent owner-sync/relink writes idempotently before clearing the current claim, and permit only the canonical owner to enter derived stages. Historical repair uses the same locked digest-create discipline.
- Combine unique normalized current captions and adjacent context in sheet/event order while retaining verbatim source cells. Publication and caption-sync completion detect aggregate changes that arrive in flight. Lexical projection prioritizes matched linked context and every Telegram-bound projection truncates by code point.
- `reportHistoricalDuplicateCandidates()` remains deterministic and read-only, excludes only evidence-consistent resolved prospective groups, performs no Drive probe, and leaves historical candidates, eligibility, output IDs and Drive objects unchanged.

## Spec Change Log

- Review pass 1 found that the implementation plan omitted publication-claim/caption races, alternative archive-source validation, ambiguous legacy owners, prospective archive-only relinking, alias adjacent context, owner-only operator entry points, resolved-report filtering, and executable Drive/Gemini/public-wrapper checks. The Code Map and test task now require those behaviors explicitly. Known-bad states avoided: permanently lost captions, valid archives masked by corrupt candidates, new intake blocked by historical duplicates, dead alias work, unchanged Telegram edits, misleading reports, and mocked-away storage guarantees. **KEEP:** append-only canonical fields; download/hash outside the lock with lookup/create/link inside it; SHA-derived filenames; retained provenance rows; alias exclusion from derived work; grouped search; report-only historical cleanup; no deployment or destructive operations.
- Review pass 2 found that the plan did not distinguish confirmed unusable archive candidates from transient/provider failures, did not require linked human context in the displayed lexical and semantic result, and omitted worker-level commit-failure and alias-caption-edit regressions. The Code Map and test tasks now require fail-closed candidate validation, context-preserving result projection, verified-only archive-only relinking, clean alias sync state, and those executable recovery paths. Known-bad states avoided: duplicate Drive creation during an outage, search matches whose visible caption hides the matching human text, corrupt archive-only rows being relinked as trusted aliases, and unverified commit recovery. **KEEP:** append-only canonical fields; SHA-derived deterministic storage; preparation outside and atomic commit inside `ScriptLock`; retained provenance; prospective archive-only relinking from verified candidates; publication-race reconciliation; owner-only Groq/Gemini/enrichment/publication/sync; unique caption plus adjacent-context aggregation; canonical search grouping; resolved-aware read-only historical reporting; all previously green regression suites; no deployment, credential/property changes, Drive cleanup, or Telegram sends.
- Review pass 3 found that the plan still omitted retry-completable multi-row linkage, historical-recovery participation in digest-create locking, in-flight caption-sync dirtiness, confirmed permanent-candidate skipping, source-probe deduplication/early stop, query-aware safe result truncation, and consistent archive evidence in resolved-report suppression. The Code Map and test tasks now make those state transitions and consumer-boundary regressions explicit. Known-bad states avoided: completed claims with partial linkage, duplicate objects from manual recovery races, overlapping caption edits, a corrupt first candidate masking a later valid source, valid sources blocked by irrelevant later outages, matching captions hidden past the result budget, malformed UTF-16 output, and storage-inconsistent groups disappearing from review. **KEEP:** every pass-2 KEEP item; fail-closed creation before any valid source exists; owner-only downstream work; provider-free recovery tests; visible linked context; deterministic code-unit report ordering; ledger-only reporting; no live or destructive operations.

## Review Triage Log

### Review pass 1 — thorough

Verdicts: 0 high, 12 medium, 5 low, 3 false, 1 maybe-false. Routes before grouping: 8 bad-spec, 10 patch, 1 defer, 3 reject.

| Lens / finding | Verdict / route | Evidence |
|---|---|---|
| Blind 1: alias caption during in-flight publication can be lost | medium / bad_spec | `markCanonicalCaptionSyncPending_` returns before recording work when no output message ID exists, while the publication claim keeps an older caption snapshot; `finishPublishClaim_` does not reconcile the latest aggregate. |
| Blind 2: prospective archive-only upload captions never join a later eligible owner | medium / bad_spec | `commitCanonicalArchive_` reuses the archive but leaves the earlier `ARCHIVE_ONLY` row self-linked, so its current caption/context is outside the later canonical group. The intended handling of prospective ineligible-first uploads was not specified. |
| Blind 3: historical report includes already resolved canonical/alias groups | low / patch | `historicalDuplicateCandidateReportFromRows_` groups every healthy row by digest and does not distinguish fully linked groups, so normal future aliases pollute the operator report. |
| Blind 4: prototype-named captions are silently dropped | low / patch | `canonicalHumanCaptions_` uses `{}` and `seen[key]`; keys such as `constructor` resolve through `Object.prototype`. A `Set` is the direct correction. |
| Blind 5: first lexicographic archive source can mask a valid alternative | medium / bad_spec | `commitCanonicalArchive_` selects one matching row before `assertDriveArchiveRow_`; a missing/corrupt first Drive object aborts even if another same-digest candidate is valid. Source selection policy was under-specified. |
| Blind 6: multiple legacy admitted duplicates permanently block new ingest | medium / bad_spec | More than one blank-field admitted same-digest row makes `owners.length > 1` and raises a permanent archive error, coupling prospective ingest to historical cleanup contrary to the approved separation. |
| Blind 7: explicit enrichment accepts an alias into a dead pending state | low / patch | `requestCatalogEnrichment` lacks the owner gate. Claims still reject the alias, but the operator call appears successful and leaves misleading `TAG_PENDING` backlog. |
| Blind 8: real SHA filename/reuse/create behavior is mocked away | medium / patch | The focused suite replaces `createOrReusePreparedArchive_`; existing self-check covers only multiple-name rejection, not digest naming, one-object reuse, conflict, or create branches. |
| Blind 9: publication/alias timing window has no regression | medium / bad_spec | No test claims initial publication, links a new distinct caption before result commit, and proves final synchronization. This is the executable evidence gap for Blind 1. |
| Blind 10: caption/context aggregation is unbounded | maybe-false / defer | The code concatenates every linked value per query/publication. A corpus/load benchmark and expected maximum uploads per image are needed to establish whether Apps Script memory/runtime limits are reachable. |
| Verification 1: save-lock atomicity is not asserted | medium / patch | Pre-verified gap: duplicate claims execute sequentially in one stack and no hook asserts lookup/create/link occurs while `ScriptLock` is held. |
| Verification 2: distinct alias captions are not observed on initial publication | medium / patch | Pre-verified gap: real publication coverage used whitespace-equivalent captions; distinct captions were tested only after manually marking the owner published. |
| Verification 3: Gemini alias exclusion is unverified | medium / patch | Pre-verified gap: semantic fixtures contain only legacy owner-shaped rows, so removing the new owner gates would leave them green. |
| Verification 4: deterministic Drive reuse contract lacks branch coverage | medium / patch | Pre-verified gap: no executable check asserts the SHA-derived name, one-object reuse without create, conflicting-object rejection, and no-match creation. |
| Verification 5: public historical-report wrapper is unverified | low / patch | Pre-verified gap: tests call only the row helper, not the documented spreadsheet-opening entry point. |
| Verification other: alias adjacent text schedules an unchanged caption edit | medium / bad_spec | `processText_` marks the owner pending, but `recordPublishCaption_` aggregates linked captions only and reads adjacent text from the owner row. Telegram may reject the unchanged edit and retries cannot project the alias context. |
| Edge 1: in-flight publication drops a newly linked caption | medium / bad_spec | Independently confirms Blind 1 at the same guard: no output message ID means no durable pending synchronization. |
| Edge 2: prototype-named caption disappears | low / patch | Independently confirms Blind 4; inherited object keys make the equality set unsafe. |
| Intent alignment: catalog-wide historical canonicalization is absent | false / reject | The full approved frozen contract expressly forbids automatic historical merging and requires report-only review, so prospective behavior is intentional. |
| Intent alignment: live integration guarantee is not exercised | false / reject | The approved frozen contract expressly forbids deployment, property changes, Drive cleanup, or Telegram sends in this build; offline evidence is correctly scoped. |
| Intent alignment: provenance rows are not literally immutable | false / reject | The approved approach preserves distinct provenance identity/history while existing versioned caption and workflow fields remain mutable; literal append-only rows would contradict current-caption behavior. |

### Review pass 2 — thorough

Verdicts: 0 high, 7 medium, 3 low, 11 false, 1 maybe-false. Routes before grouping: 4 bad-spec, 6 patch, 1 defer, 11 reject. Bad-spec entries trigger re-derivation; lower routes are recorded but moot for this pass.

| Lens / finding | Verdict / route | Evidence |
|---|---|---|
| Blind 1: caption edit and owner sync write race without a lock | false / reject | `doPost` acquires the global `ScriptLock` before `processUpdate_`; all production callers of `processCaptionEdit_`, `processText_`, and archive-time owner synchronization therefore execute inside that lock. |
| Blind 2: malformed canonical links can inject unrelated captions | false / reject | No application path writes a cross-digest or roleless link: linkage is derived from a validated digest inside the save lock. The described state requires out-of-band manual sheet corruption, outside the demonstrated runtime state. |
| Blind 3: transient Drive failures are swallowed as unusable candidates | medium / bad_spec | `commitCanonicalArchive_` catches every `assertDriveArchiveRow_` error and continues; an outage, authorization, or quota failure can exhaust candidates and fall through to `createOrReusePreparedArchive_`, risking another object instead of retry/pause. |
| Blind 4: multiple verified derived owners are silently selected | false / reject | Multiple prospective derived owners cannot be created through the locked commit. Choosing the deterministic first legacy owner is intentional and required by the prior change log so historical ambiguity does not block prospective intake. |
| Blind 5: `localeCompare` weakens cross-runtime deterministic ordering | low / patch | Locale-sensitive ordering can vary across runtime locale even though it is stable within one deployment. A code-unit comparator is a direct deterministic correction. |
| Blind 6: orphaned aliases can be suppressed from the historical report | false / reject | The application does not create alias-only groups or links to a missing owner; the claimed state requires out-of-band sheet corruption. |
| Blind 7: inconsistent archive objects can be suppressed from the report | false / reject | Prospective linkage copies one verified archive evidence set under the lock, while legacy rows have blank canonical fields and remain reportable. The claimed inconsistency is not reachable through application writes. |
| Blind 8: README calls ledger-ready report groups healthy | low / patch | The report checks ledger readiness but does not probe live Drive. Documentation should state that candidates are ledger-ready/object-unverified rather than live-healthy. |
| Blind 9: lexical result display can omit the linked caption that matched | medium / bad_spec | Ranking searches aggregate linked human context, but the returned caption uses `aiCaption || context`; when an AI caption exists, a query can match alias context that the visible result omits, contrary to the display acceptance criterion. |
| Blind 10: semantic-only result display omits linked context | medium / bad_spec | `rankSemanticRows_` receives only owner rows and builds display context from owner fields, so a semantic-only canonical result cannot project linked captions or adjacent alias text. This shares the result-projection root cause with Blind 9. |
| Blind 11: batch test is not true concurrent execution | false / reject | The fixture selects two stale claims before either commit, asserts create/link happens while the lock is held, and the implementation re-reads each claim under that lock. Moving the critical commit outside the lock would fail the lock-aware hook; actual parallel Apps Script execution is outside provider-free simulation. |
| Blind 12: caption/context aggregation is unbounded | maybe-false / defer | carried: the code still scans and concatenates linked values; a corpus/load benchmark plus expected maximum uploads per image is required to establish whether Apps Script limits are reachable. |
| Verification 1: alias caption edits lack owner-boundary regression | medium / patch | Pre-verified gap: existing tests cover owner edits, alias upload, and alias adjacent text, but never invoke `processCaptionEdit_` on an alias and observe the canonical output-message edit. |
| Verification 2: commit-time archive failures lack worker-boundary regression | medium / patch | Pre-verified gap: preparation failures and direct helper conflicts are tested, but no test makes the locked commit throw and verifies claim cleanup plus retry/pause persistence. |
| Edge 1: alias edit leaves an unclaimable alias `SYNC_PENDING` status | low / patch | `applyCaptionVersion_` marks the alias pending before routing work to the owner; caption claims reject aliases, leaving misleading historical backlog state. Clearing alias sync state after owner routing is a direct correction. |
| Edge 2: unverified archive-only matches are relinked | medium / patch | The relink loop iterates `matches`, not `verifiedMatches`; a same-digest row whose Drive object failed validation can be labeled an alias even though only verified candidates may donate trusted linkage. |
| Edge 3: bounded search display can omit linked captions | medium / bad_spec | Independently confirms Blind 9: aggregation affects matching, but AI caption precedence hides the matching linked human context from result display. |
| Intent: catalog-wide historical canonicalization is absent | false / reject | carried: the frozen contract explicitly forbids automatic historical merging and requires report-only handling. |
| Intent: physical row immutability is absent | false / reject | carried: retained provenance identity/history is the approved meaning; literal immutable cells conflict with current-caption and workflow requirements. |
| Intent: lifetime-global single return is absent | false / reject | The edge-case matrix defines one canonical result slot and one publication workflow, not a lifetime ban on returning a valid image in later searches. |
| Intent: Telegram-native and historical search are not rewritten | false / reject | The frozen scope governs bot-controlled search/publication and expressly leaves historical rows/messages unchanged; native Telegram search is not an application result path. |
| Intent: live provider behavior is not exercised | false / reject | carried: deployment, property mutation, cleanup, and live Telegram sends are expressly forbidden; provider-free evidence is correctly scoped. |

### Review pass 3 — thorough

Verdicts: 0 high, 16 medium, 5 low, 7 false, 1 maybe-false. Routes before grouping: 9 bad-spec, 12 patch, 1 defer, 7 reject. Bad-spec entries trigger re-derivation; lower routes are recorded but moot for this pass.

| Lens / finding | Verdict / route | Evidence |
|---|---|---|
| Blind 1: `archivePermanent` corrupt candidates are not skipped | medium / patch | `unusableCanonicalCandidateError_` ignores the explicit marker emitted by blob validation, so a confirmed corrupt first candidate aborts instead of allowing a later valid source. |
| Blind 2: irrelevant later transient candidates block an established valid source | medium / bad_spec | The loop validates every match and rethrows provider failures even after a verified owner/source exists. Optional relinking must not reduce availability once storage singularity is already established. |
| Blind 3: aliases sharing one Drive file are repeatedly downloaded under the lock | low / patch | Candidate validation iterates provenance rows rather than unique archive evidence, so a common canonical object is rehashed once per alias while holding the global lock. |
| Blind 4: multi-row canonical commit is not retry-completable | medium / bad_spec | The current row clears its claim before owner-sync and archive-only relink writes. A later Sheet failure leaves partial linkage with no claim for a worker retry. |
| Blind 5: historical recovery creates digest objects outside the save lock | medium / bad_spec | `recoverHistoricalArchive` calls the renamed digest-based `storePhoto_` before reacquiring `ScriptLock`; it can race another recovery or canonical commit and create a second object. |
| Blind 6: context changes overwrite an active caption-sync claim | medium / bad_spec | Routing changes `SYNCING` to `SYNC_PENDING`; a second worker can claim before the first completion and stale completion can interfere with the newer claim. The active claim must remain intact and completion must detect dirtiness. |
| Blind 7: aggregate-preserving alias edits queue unchanged Telegram edits | low / patch | Caption routing queues without comparing the aggregate before/after, so normalization-equivalent edits or removal of one duplicated caption can send an unchanged edit. |
| Blind 8: publication reconciliation can lose a confirmed remote result | medium / bad_spec | `finishPublishClaim_` recomputes the aggregate before persisting the successful message ID. A local projection error after Telegram success can leave the delivery unrecorded. |
| Blind 9: linked context uses lexicographic record ordering | low / patch | String ordering places message `:10` before `:2` and can select a later verbatim equivalent first; preserving sheet/event order is the direct correction. |
| Blind 10: bounded result output can hide the matching alias fragment | medium / bad_spec | Concatenating all context then taking the first 700 characters can omit the later fragment responsible for the lexical match even when the budget could display it. |
| Blind 11: result truncation can split supplementary characters | low / patch | `.slice(0, 700)` truncates UTF-16 code units; existing code-point-safe/lone-surrogate helpers should be reused for Telegram-bound text. |
| Blind 12: incomplete rows with a digest are absent from the historical report | false / reject | The approved report is explicitly scoped to ledger-ready duplicate candidates; incomplete and failed archive states remain visible through existing archive health/recovery surfaces. |
| Blind 13: structurally linked but archive-inconsistent groups are suppressed | medium / bad_spec | Resolved filtering checks only roles and canonical IDs. Partial writes or evidence drift can leave multiple Drive/source/integrity values that should remain reviewable. |
| Blind 14: aggregation is unbounded | maybe-false / defer | carried: a real corpus/load benchmark and expected maximum reuploads per image are still required to determine whether Apps Script limits are reachable. |
| Blind 15: principal failure paths are missing from tests | medium / patch | The listed permanent-candidate, later-outage, repeated-object, partial-commit, recovery-race, in-flight-sync, no-op-edit, ordering, truncation, and report-consistency branches are not directly exercised. |
| Verification 1: routed published-group search lacks alias-only match coverage | medium / patch | Pre-verified gap: the ranker is tested directly with aliases, but `/search` consumer fixtures contain only owners, so alias rows could be dropped before ranking undetected. |
| Verification 2: NFKC-equivalent captions are unverified | medium / patch | Pre-verified gap: whitespace equivalence is covered, but removing `.normalize('NFKC')` would leave all current tests green. |
| Verification 3: public historical report does not assert zero Drive calls | medium / patch | Pre-verified gap: fixture Drive access would succeed, so a future live probe could violate the declared ledger-only scope without failing tests. |
| Verification 4: same-digest conflicting ledger evidence lacks worker coverage | medium / patch | Pre-verified gap: helper conflict tests do not prove the archive worker stores terminal failure, clears the claim, and creates no replacement for size/MIME contradiction. |
| Edge 1: caption routing can stale-write worker state | false / reject | Production caption routing is reached through `doPost`, which already holds the global `ScriptLock`; archive-time routing runs inside the save lock. |
| Edge 2: permanent corrupt first candidate masks later valid source | medium / patch | Independently confirms Blind 1 at the error classifier. |
| Edge 3: normalized no-op alias edit retries unnecessarily | low / patch | Independently confirms Blind 7 at caption-change routing. |
| Edge 4: matching text beyond earlier context budget is hidden | medium / bad_spec | Independently confirms Blind 10 at the result projection boundary. |
| Edge 5: archive-inconsistent resolved group disappears from report | medium / bad_spec | Independently confirms Blind 13 at resolved filtering. |
| Intent: historical catalog remains unmerged | false / reject | carried: the frozen contract explicitly selects prospective behavior and forbids automatic historical merging. |
| Intent: operational cells remain mutable | false / reject | carried: immutable provenance means retained row identity/source history, while current caption and workflow state are intentionally mutable. |
| Intent: adjacent context/manual tags extend caption aggregation | false / reject | The frozen matrix and boundaries explicitly include current human context and existing display metadata; this is a compatible superset of captions, not a conflicting behavior. |
| Intent: universal one-object storage is not achieved historically | false / reject | carried: pre-existing Drive objects are never deleted or merged and remain report-only by explicit boundary. |
| Intent: live end-to-end behavior is not demonstrated | false / reject | carried: live deployment, provider mutations, cleanup, and Telegram sends are prohibited in this build; local provider-free evidence is the approved surface. |

### Review pass 4 — thorough

Verdicts: 0 high, 19 medium, 3 low, 8 false, 0 maybe-false. Routes before grouping: 22 patch, 8 reject. Repeated confirmations are logged separately as required and grouped into the patch handoff by root cause.

| Lens / finding | Verdict / route | Evidence |
|---|---|---|
| Blind 1: legacy row can be probed before an explicit owner | medium / patch | `canonicalRowIsOwner_` treats blank legacy rows as owners in candidate priority, so a lexically earlier legacy outage can block a healthy explicit owner despite the explicit-owner-first requirement. |
| Blind 2: multiple explicit owners are silently merged | false / reject | Canonical fields are new and the locked, current-row-last commit cannot create two explicit owners for one digest. The described state requires out-of-band corruption or a different implementation, and historical blank-field ambiguity remains unmerged. |
| Blind 3: archive-source provenance is overwritten with the immediate source row | medium / patch | Participant updates assign `source.row[0]` instead of following an established `ARCHIVE_SOURCE_RECORD_ID`, so later aliases can replace the original donating record in every participant. |
| Blind 4: relink timestamp retains the former relationship time | low / patch | `existing || linkedAt` leaves an archive-only self-link timestamp after its canonical ID changes. Update the timestamp when the relationship changes. |
| Blind 5: tag claims lack an owner gate | medium / patch | `claimPendingTags_` and revalidation check archive/status but not canonical ownership, leaving a direct defense-in-depth violation of the owner-only invariant. |
| Blind 6: newly created Drive object is not read back for full integrity | medium / patch | The create branch checks ID and size only; existing objects receive blob SHA/MIME/size validation. A created object must be read back and checked before recording verified evidence. |
| Blind 7: generic 404/not-found errors are treated as confirmed absence | medium / patch | The classifier can authorize replacement creation for permission-obscured or indeterminate provider failures. Only explicit local integrity/permanent signals and positively identified missing/trashed objects may be skipped. |
| Blind 8: malformed linked rows can inject semantic context | false / reject | Application linkage writes only archive-ready OWNER/ALIAS participants under the lock; legacy blank rows self-identify. The described roleless or unready cross-link requires out-of-band corruption. |
| Blind 9: final search caption can split a surrogate pair | low / patch | `searchResultCaption_` applies code-unit `.slice` after combining already safe fields. Apply the code-point-safe bound to the completed Telegram caption. |
| Blind 10: resolved report accepts a bogus common source ID | medium / patch | Resolved suppression compares source strings but does not require that the source identifies a group member with matching evidence or that every canonical-link tuple is complete and valid. |
| Blind 11: full duplicate-worker flow is not exercised | medium / patch | Existing tests cover individual gates and routed search but do not count analysis, first publication, caption sync, and repeated retry calls across the complete duplicate flow. |
| Blind 12: candidate tests do not contain explicit owner plus earlier failing legacy row | medium / patch | Current candidate fixtures do not prove explicit-owner priority, source stability, or valid-owner immunity from an earlier failing legacy candidate. |
| Verification 1: PNG/WebP digest filename paths are unverified | medium / patch | Pre-verified gap: MIME signature checks cover all formats, but the real Drive naming/create helper is executed only for JPEG. |
| Verification 2: semantic linked human context is unverified | medium / patch | Pre-verified gap: semantic fixtures contain only independent owners, so owner-only projection would remain green while lexical aggregation still passes. |
| Edge 1: caption queueing can stale-write owner state | false / reject | Production webhook changes run under `doPost`'s global script lock and archive routing runs under the save lock; the alleged overlapping execution cannot reach this code outside tests. |
| Edge 2: fifth-attempt interrupted commit terminalizes partial linkage | medium / patch | `canonicalCommitInterrupted` returns with attempt five and an active lease; after expiry the selector terminalizes it before retry, violating retry-completeness. Interrupted commits must not consume the terminal attempt. |
| Edge 3: legacy candidate outranks explicit owner | medium / patch | Independently confirms Blind 1 at candidate sorting. |
| Edge 4: changed caption plus provider failure bypasses pause/error policy | medium / patch | Sync completion checks `changed` before `error`; an authorization/quota failure with a concurrent change becomes plain pending, discarding diagnostics and stage-pause handling. |
| Edge 5: bogus common archive source hides an invalid group | medium / patch | Independently confirms Blind 10 at resolved-report suppression. |
| Edge 6: inaccessible 404 can authorize replacement creation | medium / patch | Independently confirms Blind 7 at candidate classification. |
| Edge 7: first publication leaves an already-satisfied sync pending | low / patch | When the latest aggregate equals the sent claim caption, `finishPublishClaim_` does not clear a pre-existing `SYNC_PENDING`, causing one unnecessary identical edit. |
| Edge 8: ready historical legacy archive is recreated under a digest name | medium / patch | Historical recovery calls digest create/reuse before its already-verified return check; a ready legacy-named object can gain a second object and have evidence rewritten. |
| Edge 9: archive reuse is not retry-completable on the fifth attempt | medium / patch | Independently confirms Edge 2 at the archive selector/commit boundary. |
| Edge 10: report suppression lacks source referential integrity | medium / patch | Independently confirms Blind 10 at the report contract. |
| Edge 11: 404 handling is not positively confirmed | medium / patch | Independently confirms Blind 7; an HTTP status alone does not prove absence rather than hidden access. |
| Edge 12: fifth-attempt interruption regression is absent | medium / patch | The current injected write-failure test covers only the first attempt, so terminal partial linkage would remain green. |
| Intent: prospective rather than catalog-wide canonicalization | false / reject | carried: the frozen contract explicitly prohibits automatic historical merges and selects report-only treatment. |
| Intent: literal whole-row immutability is absent | false / reject | carried: retained source identity/history plus mutable operational state is the approved reading. |
| Intent: adjacent context expands beyond captions | false / reject | carried: the frozen requirements explicitly include adjacent human context for matching/display. |
| Intent: historical physical storage remains duplicated | false / reject | carried: destructive cleanup and automatic historical object consolidation are forbidden. |
| Intent: live end-to-end proof is absent | false / reject | carried: live deployment/provider mutations and Telegram sends are outside this approved local build. |

## Design Notes

Upload rows remain the provenance ledger, avoiding an ever-growing caption JSON cell. Blank canonical fields on legacy rows behave as self-identity until a new verified ingest explicitly links to a suitable canonical row; historical candidate reporting alone never mutates them. A verified archive may be reused even when its old provenance row is not publication-eligible, while the current eligible row remains the canonical publication/search owner.

## Verification

**Commands:**
- `Get-ChildItem tests -Filter '*_check.js' | ForEach-Object { node $_.FullName; if ($LASTEXITCODE -ne 0) { throw "Failed: $($_.Name)" } }` — every registered provider-free suite passes.
- `Get-Content -Raw -LiteralPath 'apps-script\Code.gs' | node --check -` — Apps Script source parses.
- `git diff --check` — no whitespace errors.

**Manual checks:**
- Inspect the diff for append-only schema evolution, no secret values, no deployment calls, and no destructive Drive or historical-record mutation.
- Inspect focused test output for lock-held canonical commit, initial-publication and in-flight-caption reconciliation, real SHA-name Drive branches, Gemini alias exclusion, and the public historical-report entry point.
