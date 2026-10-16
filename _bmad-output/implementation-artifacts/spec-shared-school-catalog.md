---
title: 'Reliable shared school image catalog'
type: 'feature'
created: '2026-10-16'
status: 'done'
route: 'full'
route_source: 'auto'
review: 'thorough'
review_source: 'auto'
lenses_ran: ['blind-hunter', 'edge-case-hunter', 'verification-gap', 'intent-alignment']
review_loop_iteration: 0
baseline_commit: '177fc936aa0dc3b61b93792c753a778036f2d241'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The school needs several input groups feeding one searchable catalog. Current capture depends on synchronous downloads, teacher access differs between interfaces, and edits cannot update published captions.

**Approach:** Automatically enroll authorized school groups, persist intake before acknowledgement, and process archive, basic analysis, publication and caption synchronization independently. Elardh_Images_Group remains the sole output; its current members can search the same published catalog privately or there.

## Boundaries & Constraints

**Always:** An enrollment initiator must be a current output-group member with current input-group administration or invitation authority. Preserve the initiator across later bot promotion; activate only after verifying bot administrator status. Removing/demoting the bot suspends new capture, retaining admitted work and published records. Never enroll the output as input. Fail closed on unknown identity/permissions; retry pending verification. Store group IDs automatically.

Keep Drive originals, full structured metadata in Sheets, stable chat/message keys, human text and publication IDs. Preserve original/latest captions separately from adjacent text; accept only newer edit versions. Deleting input messages does not remove archived/searchable photos. Admission records the authorized group and publication eligibility at receipt; later activation cannot backfill old records.

Transient work gets five total attempts with approximately 5/10/20/40-minute delays, honoring longer provider retry-after values. Invalid credentials, permission loss and storage exhaustion pause the affected stage for explicit operator recovery without consuming every record's budget. Expose sanitized stage health and recovery actions; never disclose keys, full webhook URLs or raw provider errors.

After transient analysis retries exhaust, publish the healthy archive with latest human caption and an analysis-unavailable marker. Unsupported/corrupt archives remain terminal. Explicit later enrichment updates the same record/output message. Preserve PUBLISH_UNKNOWN for ambiguous photo delivery; require reconciliation before any resend.

Search requires fresh output membership in both interfaces, includes only healthy archives with confirmed publication to that output, and retains published records from suspended inputs. Require one meaningful query-token match after conservative Arabic/English stopword filtering; rank coverage, phrase and existing field weights deterministically; return at most five. All-stopword queries request useful terms; infrastructure failure reports temporary unavailability.

**Never:** Add embeddings, semantic reranking, advanced OCR, biometric/person-emotion inference, historical backfill, a new storage platform, or real-school-image tests. Preserve basic bilingual visual metadata and bounded OCR. These decisions supersede older single-input/private-allowlist requirements; optional semantic pilot code stays isolated from teacher search. Use only the already approved synthetic fixture for live tests.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected behavior | Failure handling |
|---|---|---|---|
| Enrollment | Add, then promote; different actors | One registry entry; eligible initiator retained | Unknown checks pending; unauthorized inactive |
| Intake | Duplicate/reordered update or worker crash | One durable record; resumable archive | No acknowledgement before durable save; leased retry |
| Edit | Caption added/removed before or after publication | Latest index and same output message updated | Ignore stale versions; retry known-message edit |
| Analysis | Timeout, 429, 5xx, invalid JSON | Bounded retry, then caption-only publication | Authentication/configuration pauses separately |
| Delivery | Confirmed rejection versus timeout | Retry definitely unsent transient request | Unknown photo outcome never automatically replayed |
| Retrieval | Teacher absent from old private allowlist | Same published results in either interface | Nonmember denied before catalog access |

</frozen-after-approval>

## Code Map

- `apps-script/Code.gs`: `processUpdate_`, `installWebhook`, configuration/setup and v2 verification marker assume one input. Add persistent Groups registry, versioned output verification and enrollment processing for `my_chat_member`.
- `processPhoto_` archives before save; reuse stable IDs, `storePhoto_`, signature/hash verification and Events. Append intake eligibility, archive claims/leases and caption version/synchronization fields; retain existing 45 columns.
- `processPendingTags`, `finishTagClaim_`, publication claims/boundaries currently require TAGGED and one input. Retain short locks, archive revalidation and unknown-delivery guards; support admitted provenance and explicit fallback state.
- `processPrivateCommand_`, `processSearchCommand_`, `searchPublishedGroupRecords_`, `rankRecordValues_`: unify authorization/corpus, preserve archive checks and deterministic ranking. Keep adjacent context independent from caption replacement.
- `tests/*.js`: VM doubles cover archive retries, MIME, recovery and output search. Extend existing fixtures; add focused registry, durable intake and caption-sync suites.

## Tasks & Acceptance

**Execution:**
- [x] `apps-script/Code.gs` — append schema and implement idempotent migration, enrollment, durable intake/archive worker, caption versions and synchronization, stage pauses/recovery, fallback publication and shared retrieval.
- [x] `tests/` — first reproduce missing behaviors; cover the matrix, crashes between saves, concurrent/stale claims, edit-before-intake, add-then-promote, invite-authorized ordinary members, suspension retention and migration refusal on occupied columns.
- [x] `README.md` — document enrollment rights, worker schedules, retention, basic search, safe health/recovery and migration/deployment sequence.
- [x] `_bmad-output/implementation-artifacts/workflow-debug-and-repair-2026-10-16.md` — record local versus live evidence and remaining limits after review and deployment.

**Acceptance Criteria:**
- Given the existing 45-column catalog, when migration repeats, then files, captions, publication IDs and cutoffs survive unchanged and unknown/terminal records are not replayed.
- Given a receipt authorized before suspension, when workers resume, then admitted work completes without admitting newer photos from that suspended group.
- Given caption-only publication followed by explicit successful enrichment, when synchronization runs, then the original output message is edited without a second photo.
- Given current output members using either interface, when identical queries run, then ranking and corpus agree without input membership or per-teacher allowlisting.

## Implementation Notes

- Implemented append-only 62-column Records schema and eight-column Groups registry. Original 45 field positions remain unchanged; migration preserves existing rows and publication IDs. The existing input is seeded only after prior token-bound verification and live group checks.
- Independent intake/archive, enrollment and caption workers accompany existing analysis/publication workers. Intake freezes analysis/publication admission independently. Latest captions are versioned and stage completion merges persisted edits.
- First full verification passed all eight `tests/*_check.js` suites, source syntax and diff whitespace checks after review repairs. Matrix coverage: enrollment (registry/review suites); intake (archive/review suites); edits (caption/review suites); analysis (recovery/review suites); delivery (self-check/caption/review suites); retrieval (output-search/review suites). All covering suites ran.
- Final verification passed all nine suites, including the live-discovered dense-caption regression and the maintenance-resumption regression. Final source/editor SHA-256: `4d6758da64525426068f7e5644a9ac25ff8d492235b5540f09ae5cc779d7347f`.
- Live migration preserved seven original records. Fresh synthetic input 11 reached healthy archive, TAGGED and PUBLISHED as output 20. Private/group book queries each returned two photos; the edited unique term returned one in both interfaces. Caption synchronization retained output 20 and the original human text. Repeated workers processed zero and preserved publication IDs; five managed triggers and zero pending updates were verified.
- Final immutable release is version 7; its group command 26 returned one photo as message 27, and the corresponding doPost completed. Temporary probes were removed before versioning. The evidence report distinguishes live results from offline multi-group/outage tests and documents the initial legacy cutoff-advancement behavior plus its prospective repair.

## Spec Change Log

## Review Triage Log

First thorough review: all four lenses completed. Every filed finding is recorded below before grouping; repairs preserve the approved intent and existing successful paths.

| Finding | Verdict / route | Evidence and action |
|---|---|---|
| Blind 1: token rotation leaves inputs inactive | medium / patch | Active inputs retain old fingerprints; enrollment worker only visits PENDING. Revalidate stale-token inputs after output verification, including the trusted migration seed. |
| Blind 2: seed cannot recover after promotion | medium / patch | Seed has an empty initiator and verification immediately rejects it. Retain the seed's previously verified authority while rechecking live bot rights. |
| Blind 3: enrollment starvation | medium / patch | Worker always starts at the first two pending rows. Persist fair iteration. |
| Blind 4: explicit enrichment before first publication | medium / patch | Resetting TAG_UNAVAILABLE to TAG_PENDING leaves PUBLISH_PENDING claimable and then failed. Return unpublished eligible work to waiting; never reopen unknown delivery. |
| Blind 5: Groq Retry-After header ignored | medium / patch | Direct Groq fetch reads only body retry hints. Honor the longer header/body delay. |
| Blind 6: undefined Gemini responseText | low / patch | Error detail parsing references an undeclared variable inside a swallowed catch. Read the existing response text before parsing. |
| Blind 7: setup documentation omits compatibility property | medium / patch | Legacy setup still requires SEARCH_USER_IDS. Document its compatibility purpose without requiring per-teacher entries. |
| Blind 8: private addressed commands | medium / patch | Private parser discards the username. Apply the existing current-bot identity rule privately too. |
| Blind 9: lock fixture always succeeds | medium / patch | No fixture can demonstrate contention or lock failure. Add a lock-aware double and targeted cases. |
| Blind 10: caption failures not diagnosable | medium / patch | Sync status has no error detail; health reports only pause flags. Add sanitized sync diagnostics and bounded stage counts. |
| Edge 1: enrollment starvation | medium / patch | Same verified defect as Blind 3; one fair-scheduling repair. |
| Edge 2: adjacent text cannot restart exhausted sync | medium / patch | processText_ sets pending without resetting attempts/deadline. Reset the budget for a new desired caption. |
| Edge 3: non-JSON Telegram auth failure loses status | medium / patch | JSON parse error drops HTTP 401/403. Preserve status on the fixed sanitized error so the stage pauses. |
| Edge 4: Groq Retry-After ignored | medium / patch | Same verified defect as Blind 5. |
| Edge 5: enrichment/publication race | medium / patch | Same verified defect as Blind 4. |
| Verification 1: registry admission bypassed in tests | medium / patch | Filed evidence shows only direct helper calls for input capture. Add real router tests for active second input, denied states and edits after suspension. |
| Verification 2: fallback first publication bypassed | medium / patch | Test manually sets PUBLISHED. Exercise real claim/revalidation/finish with only external transport doubled. |
| Verification 3: analysis/publication pause consumers untested | medium / patch | Only archive outage state is verified. Test actual claim release/refund, paused calls and recovery in both workers. |
| Intent: live multi-group enrollment, HTTP durability, real contention, visible edits, paired live searches | medium / verification pending | Offline coverage is not live evidence; perform approved synthetic live checks after review, identify remaining multi-group/HTTP fault-injection limits. No new product decision is required. |
| Intent: continuously recheck enrollment initiator | false / reject | Approved boundaries require current authority at enrollment and suspension on bot membership changes; they do not require per-photo initiator revalidation. |
| Intent: school-corpus relevance | false / reject | Advanced retrieval and real-school-image tests are explicitly deferred. Report basic lexical matching and its limits. |
| Intent: named output versus configured ID | false / reject | Live group identity was previously verified; migration rechecks it. Reconfirm the resolved output during deployment. |
| Parent: first edit of legacy caption loses original text | medium / patch | Migration preserves original 45 cells but leaves new original-caption field empty; first edit replaces old row[10]. Snapshot existing context into original caption before applying that first version. |

Repair outcome: every patch above was applied and its consumer-level regression passed. No verified code finding remains deferred. The Gemini variable correction is incidental preservation of the isolated operator pilot; teacher retrieval stays lexical. Live acceptance and stated integration limits remain to be recorded below.

| Additional live finding | Verdict / route | Evidence and action |
|---|---|---|
| Human caption crowded out by AI projection | medium / patch | Live source record 11 was edited and output synchronization completed, but output message 20 had 1022 characters and only `Context: كتاب اختبار الكتالوج`; the new unique term was omitted. Reserve caption space for human context before generated sections and add a dense-metadata regression. Preserve the same output message ID. |
| Established cutoff lost on maintenance resume | medium / patch | Existing activation preserves cutoff only while enabled, so disable/re-enable advances it and the unconditional empty-queue check can block resumption with preserved updates. Shared-catalog resumption must retain a canonical existing new-only boundary; first activation and invalid boundaries still require an empty queue. |

## Design Notes

Migration must verify the old token-bound marker and live identities before seeding the current input. New output verification must not change when another input enrolls. Enrollment event versions prevent stale additions reactivating removed groups. Stage health uses the existing operator surface; no new notification destination is assumed.

## Verification

- Run every `tests/*_check.js` suite, Apps Script syntax check and `git diff --check`; all must pass.
- Review migration with old pending, terminal and published fixtures; verify fail-closed authorization and unchanged bytes.
- Deploy reviewed source to the existing endpoint, preserve queued Telegram updates and secrets, migrate safely, and verify managed triggers/source parity. Use approved synthetic evidence for capture → archive → analysis/fallback → publication → private/group retrieval → caption edit. Report untested live multi-group enrollment separately; do not claim fixture coverage proves live behavior.
