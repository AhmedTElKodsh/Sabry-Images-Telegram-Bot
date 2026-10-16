# Workflow investigation and repair — October 16, 2026

## Shared school catalog upgrade — final release 7

The approved shared-catalog implementation is deployed to the existing endpoint
as **version 7**, October 16 at 16:59 Cairo time. It adds authorized multi-input
enrollment, durable intake/archive workers, caption versions/synchronization,
analysis fallback, shared teacher access and stage recovery. All nine local
`tests/*_check.js` suites, source syntax and whitespace checks pass. Four independent
review lenses completed; verified findings and repairs are recorded individually
in `spec-shared-school-catalog.md`.

Final reviewed local and saved editor source match after CRLF normalization:
`4d6758da64525426068f7e5644a9ac25ff8d492235b5540f09ae5cc779d7347f`.
Temporary operator probes were removed before the immutable release. No credential
settings page was opened, and no credential values were printed or added to files.

### Live evidence

| Check | Observed result |
|---|---|
| Controlled maintenance | Tagging/publication workers paused before source replacement; webhook deleted with `drop_pending_updates: false`. Delivery restored after migration/deployment. |
| Migration | Guarded migration returned `existing_rows_preserved: true` for all seven existing records and their original 45 columns. Schema now has 62 Records columns and eight Groups columns. One verified existing input seeded; output resolved as Elardh_Images_Group. |
| Durable intake | Fresh approved plant/book fixture, input record `-1004439324869:11`, appeared as ARCHIVE_PENDING with its original caption and frozen eligibility before download/analysis. |
| Pipeline | Independent archive run completed at 16:42:38; analysis at 16:43:22; publication at 16:44:17. The record became ARCHIVED, TAGGED and PUBLISHED with healthy canonical integrity and output message ID 20. |
| Retention | Prior healthy record 10 remains published as output message 12. Legacy/unverified and failed rows were not replayed. |
| Shared search | Output command 21 `/search كتاب` returned two photos as messages 22/23. Private command 4668 returned two photos as messages 4669/4670. Both interfaces used the confirmed-published catalog. |
| Caption edit/index | Input message 11 was edited with the unique term `فهرسةمدرسية`. Group command 24 returned one photo as message 25; private command 4671 returned one as message 4672. Original human caption remained retained. |
| Caption display repair | The first live edit exposed AI sections crowding human context out of the Telegram caption budget. Version 6 reserves human text first. A second source edit added `فهرسةمدرسية مراجعة`; the original output message 20 visibly contains the complete short edited caption and persisted SYNCED state. No replacement photo was published. |
| Repeated workers | At 16:54:28, archive/analysis/publication/caption workers all processed zero records; all saved publication IDs remained unchanged. Five managed handlers were present, webhook active, pending update count zero, no stage paused. |
| Final version smoke | After version 7 deployment, group command 26 for `فهرسةمدرسية` returned one photo as message 27. Corresponding deployed doPost at 16:59:35 completed in 4.023 seconds. |

Version 7 also repairs established-cutoff resumption during shared-catalog
maintenance. The legacy enable helper advanced the global cutoff when tagging
was first re-enabled in this upgrade; the queue was empty and retained record
eligibility/publication IDs were unaffected. The exact previous global cutoff
was not captured, so its historical preservation is not claimed. The corrected
path preserves an existing canonical boundary even after temporary disablement
and permits already queued updates during resumption. First activation and invalid
boundaries still require an empty queue. This repair has focused offline coverage;
the final smoke test did not intentionally interrupt delivery again.

### Limits and retained history

- Several-input authorization/routing, add/promote/remove ordering, token rotation,
  lease contention, rate/auth failures, exhausted-analysis fallback and later
  enrichment are covered by offline fixtures. Live acceptance used the existing
  ImageBot_test group; a second real input enrollment was not performed.
- Live analysis succeeded. Caption-only fallback and outage recovery were not
  forced against real providers or credentials.
- The signed-in teacher account performed live searches. Additional-member access
  and denial variants are covered offline; no second human account was used.
- Three old ARCHIVE_RETRY rows lack new admission evidence and remain historical
  failures requiring separate review. Another old archive is terminal; two legacy
  records are unverified. Health totals include that retained history. The fresh
  record has no pending archive/publication/caption work.
- No real school/children image test, advanced OCR, embedding/reranking evaluation,
  school-corpus relevance benchmark, restoration drill or hosting migration was
  performed. Drive retention was preserved; source deletion does not request archive deletion.

## Latest live acceptance — school group search

The user approved implementing shared output-group bot search and a full safe-photo
test. Version 4 is deployed to the existing endpoint. `/search كتاب` now replies
inside Elardh_Images_Group after current output-membership verification; private
allowlisting is not required for group commands. Results are restricted to healthy
photos already PUBLISHED to that group, not the unpublished input archive.

Verified live on October 16, 2026 (Cairo UI times):

- Version 3 first demonstrated a group command reply at 13:47, with no matching photo.
- Approved fixture: `test-images/02-plant-and-book.png`, a plant and blue book with no
  people, caption `كتاب اختبار`. User approved Telegram, Drive, Groq and output use.
- First input message 9 failed archive validation because Telegram served generic
  application/octet-stream. The terminal failed row was preserved. This exposed and
  reproduced a MIME handling defect; the repair recognizes generic MIME only when
  bytes match an existing supported signature and sets the blob type without
  modifying the bytes. Explicit MIME/signature conflicts still fail.
- Version 4 contains group search and the reviewed MIME correction. Normalized
  Code.gs SHA-256 matches local and final editor source:
  `74d898aacc1c4d6ff0b0471f726e80f7e0de42d2c32d5d202259cf8421d0b5c7`.
- Fresh input record `-1004439324869:10`: ARCHIVED, 200935 bytes, canonical integrity
  ready; TAGGED on attempt 1 by qwen/qwen3.8-27b; metadata valid; PUBLISHED to the
  intended output as message 12. Capture webhook completed at 13:54:15.
- Output command message 13, `/search كتاب`, returned the same plant/book photo as
  message 14 with `1/1 · Lexical fallback · matched 1/1 query terms`. Search webhook
  completed at 13:58:40. The visible photo and bilingual description were checked.
- A repeated worker run processed zero new tags/publications and retained the
  original output_message_id 12. A search result is an intentional reply and is
  distinct from duplicate automatic publication.
- Temporary safe probe removed from editor; final source parity rechecked. It was
  never included in an immutable deployment. No credential settings were inspected.
- All five local suites, syntax and diff checks pass; independent review found no
  issues in either change. Offline integration tests cover members outside the
  private allowlist, revoked/failed membership, mismatched IDs, other bots, wrong
  groups, deduplication, publication filtering and private-search regression.

The live synthetic input → archive → Groq → output → group-search flow is verified.
This does not establish school-wide search quality, real-photo provider approval,
or a second live test using another member's account. Earlier archive history and
private multi-result delivery limitations remain as recorded below.

## Earlier recovery outcome (before shared group search)

At the earlier recovery checkpoint, the incident was not yet resolved live. The release repaired the confirmed
bootstrap overwrite, retired default model, unsafe provider-error propagation,
unbounded metadata instructions and false tagging-success count. Offline regression
checks pass, and version 2 containing the repairs is deployed in the new Google
project. User confirmed replacement of all three credentials after the most recent
disclosure. Telegram group verification, webhook installation and worker activation
completed, but a fresh-photo Groq/publication/search acceptance test remains pending.

## Entire workflow trace

| Stage | Evidence and failure | Repair or required proof |
|---|---|---|
| Telegram delivery | Previous live run created version 1 in the new project, but bootstrap saved `/dev` and then failed the canonical URL validator. Old endpoint had already been paused. | Version 2 bootstrap completed after explicit canonical binding. Telegram reports matching redacted deployment URL, pending count 0, no last delivery error, and max_connections 1. A real incoming photo still needs verification. |
| Input authorization | Bot and intended input/output administrator memberships passed verification again after the latest user-confirmed rotation. Verification is token-fingerprint bound. | Verification returned true for SchoolImages_bot, ID 8907501266. Canonical group IDs and guards retained. |
| Archive and ledger | Original account had full storage plus an inaccessible folder. New-account resource setup and copied five-row catalog were verified earlier. Three historical rows were stranded archive failures; two lacked verified archive evidence. | Preserve the history. Fresh upload must produce one Drive object with matching hash, byte size and MIME evidence. Old rows are not automatically replayed. Archive backoff fix remains covered by regression tests. |
| Groq request | Default was `qwen/qwen3.6-27b`, retired for free/developer usage September 14. This can block enrichment even with a valid key. | Default now uses documented successor `qwen/qwen3.8-27b`; explicit overrides remain unchanged and need operator inspection if old. No live provider success is claimed. |
| Metadata | Prompt asked for exact OCR without the validator's 1200-character bound; dense book pages can exceed it. This is a demonstrated contract mismatch, not a verified cause of the user's actual provider response. | Prompt specifies representative OCR excerpt, list-item/count and caption limits. Completion budget increased from 1200 to 4096. Strict validation remains; stochastic output can still fail and needs live checking. |
| Tag result persistence | Worker incremented tagged/retry/failure counts even when `finishTagClaim_()` rejected a stale claim. | Outcome counts now require successful persistence. Rejected-save fixtures verify no false tagged success. |
| Output publication | Requires archived bytes, capture-time eligibility, current verified bot/groups, new-only tagging and validated metadata. Earlier uploads cannot become eligible by changing config afterward. | Existing settling delay, claim revalidation, bounded retry and unknown-send suppression preserved. Fresh eligible photo must show exactly one output message and stored message ID. |
| Search | Group `/search` is intentionally ignored. Private `/start` and `/search` require the numeric allowlist and fresh input-group membership. Unverified archives are excluded by default. | Use private chat with the existing bot. Telegram's group-search UI searches published captions. Confirm the fresh record is found; do not weaken access checks. |
| Error reporting | Raw UrlFetch errors may include authenticated URLs; raw HTTP/provider descriptions could reach logs and Sheet error cells. | Generic transport/HTTP failure messages, safe Telegram JSON parse failures, shared exact-secret/pattern redaction, sanitized archive rethrows and webhook delivery errors. Fake credential fixtures exercise boundaries without real secrets or network access. |

## Credential handling and live gate

The previous assistant settings snapshot disclosed the then-current `BOT_TOKEN`,
`GROQ_API_KEY` and `WEBHOOK_SECRET` after the user had rotated them. No values are
included in this report or the repair. The user subsequently confirmed “yes all
rotated.” No credential settings page was opened during this review. Membership
verification and webhook installation succeeded with the new configuration; the
Groq credential has not yet been proven by a successful image analysis.

Completed the guarded sequence after rotation: group verification and canonical
binding; saved reviewed source; version 2 deployment; successful bootstrap;
sanitized webhook queue check; successful new-photo-only activation; successful
output activation. Trigger inventory shows exactly two owned time-based triggers:
one processPendingTags and one processPendingPublications. No pending updates were
dropped and no historical or ambiguous publications were replayed.

Normalized target editor Code.gs SHA-256 matches the tested local source before
versioning and after temporary helper removal:
`93b173f99ca04ff9d695806967b66722bb4a41a05da633f2f8d1bda617feaddd`.
The UI confirmed the existing deployment updated to version 2. These observations
establish saved editor parity and version creation, not an independent downloaded
immutable-source comparison. No temporary operator helper was included in version 2.

User was instructed to upload a fresh safe book photo to input with caption
`كتاب اختبار`, allow up to ten minutes for the independent five-minute workers,
then run `/start` and `/search كتاب` in a private bot chat. Acceptance remains
open until one new record has matching archive integrity, validated metadata, one
stored output message ID and successful authorized private delivery.

## Verification

- `node tests/workflow_recovery_check.js` — passed, offline fixtures for bootstrap,
  provider errors, actual generated Groq request, and rejected tagging persistence.
- `node tests/self_check.js` — passed, existing workflow guards and behaviors.
- `node tests/archive_retry_check.js` — passed, backoff and bounded archive retries.
- `Get-Content -Raw apps-script/Code.gs | node --check -` — passed.
- `git diff --check` — passed (Windows line-ending conversion notices only).
- Independent quick review found whitespace-validation and encoded-error redaction
  gaps. Both were patched with regression fixtures; follow-up found no remaining
  actionable findings.

## Remaining limitations

There is no durable independent ingestion/archive-retry worker. Telegram delivery
must be demonstrated; a local direct-call retry fixture does not prove Telegram
will redeliver after an Apps Script failure. Private multi-result search can resend
earlier results if a later result fails; that existing limitation remains separate
from the startup repair. Neither historical rows nor ambiguous publications were
replayed. Real school/children images still require the existing provider approval.

## Primary sources checked on October 16

- [Google Apps Script Service.getUrl](https://developers.google.com/apps-script/reference/script/service): development-mode execution can return the development URL.
- [Groq model deprecations](https://console.groq.com/docs/deprecations): September 14 retirement and successor for the old default model.
- [Groq vision documentation](https://console.groq.com/docs/vision): replacement model supports images and JSON mode.


## Operational limitation closure — October 16, evening (in progress)

Owner scope: non-sensitive images; sensitive school/children content is excluded.
Advanced OCR and semantic retrieval remain deferred. No second output member is
available, so a second-human-account test remains pending.

The supplied second input invitation resolves to schoolImages_test2,
chat -5371587584. Bot was already a member; it was promoted with all optional
administrator powers off to meet the existing capture/enrollment requirement.
The pre-promotion photo was not admitted (input remained PENDING).

Private backup/restore drill, 17:33–17:34 Cairo:
- Backup folder: 1rUYRgJtTGvkEfOwpX2wjdNN3mXh0wE9-.
- Backup Sheet: 1Yl6132BWlpcdvxPWD8yfEhxKzWdTz2_mkmlbUX2ez4Q.
- Restored Sheet: 1UN5tcevey3AVxMn2iiKS6Cyjgmuq4bwIi8SdgQApZmI.
- Eight original Records rows matched restored values exactly.
- Both accessible archive objects (records :10 and :11) were copied and restored;
  each was 200935 bytes and SHA-256
  42c6542ffc584862702d2efa327453c4a83f5c4fd0d240fac83c620aef319829.
- Legacy -5556698493:11 and :25 Drive sources were inaccessible; not backed up.
- A restore-manifest.json in the private folder maps original/backup/restore IDs.
- Same-account recovery only; independent account disaster recovery remains untested.

Historical recovery initial attempt made no archive changes: source timestamps
were legacy UTC strings without fractional seconds, rejected by strict validation.
The helper now normalizes that exact format, with regression coverage.

Historical recovery retry at 17:42:27–17:42:51 completed for all six exact IDs:
-5556698493:11, -5556698493:25, -1004439324869:3, :4, :5 and :9.
All returned ARCHIVED. Existing inaccessible Drive references were retained in
sanitized original-row audit events; bytes were recovered from Telegram. No old
Drive objects were deleted. Publication/analysis admission was not granted.

Telegram promoted/upgraded the second basic group to supergroup
-1004406332620 (visible chat URL); its previous ID was -5371587584.

### Live controlled failure drill (17:47:21–17:48:04 Cairo)

Target: -1004406332620:2, the plant/book fixture captioned
`كتاب اختباراعطال تعددمصادر نبات وكتاب`. Core actual workers operated against
real Sheets/Drive. Temporary editor-only overrides injected failures for that
exact record; scheduled workers remained paused, overrides and pause values were
restored in finally. Credentials were not altered and no provider outage was induced.

- Real archive succeeded.
- Injected analysis 401 paused/refunded: TAG_RETRY, attempts 0.
- Injected analysis 429 honored a 7200-second retry deadline.
- Four additional injected transient failures reached attempt 5 / TAG_UNAVAILABLE;
  only the target retry deadlines were advanced to accelerate the drill.
- Injected publication 403 refunded attempt; injected 429 honored 7200 seconds.
- Real caption-only fallback published as output message 28.
- Repeat publication made no duplicate; real Groq enrichment then succeeded and
  caption sync edited the same output message 28, SYNCED. UI confirmed generated
  English/Arabic caption and absence of the unavailable-analysis warning.

### Shared input/search acceptance

The successful supergroup promotion used only Change Group Info; all destructive,
membership, invitation and administrator-creation powers were disabled. Automatic
my_chat_member enrollment made -1004406332620 ACTIVE at 17:45:22 UTC+3.
The obsolete pre-upgrade group ID was explicitly retired to SUSPENDED/MIGRATED
with an Events audit after verifying the ACTIVE successor and same initiator.

Group /search اختباراعطال: command 29 -> one result 30, correct second-input image.
Group /search نبات كتاب: command 31 -> results 32–34. First result matched 2/2
query terms, the other two 1/2. This is lexical token coverage, not semantic ranking.
Group /search زرافةفضائيةغيرموجودة: command 35 -> response 36, no matching photos.
No school-corpus accuracy percentage is established from these synthetic fixtures.

Final worker resumption at 17:49:38–17:49:44: all stages unpaused, current/historical
backlog and failure counts zero, all nine archive rows ready, six recovered rows
TAG_NOT_ELIGIBLE, original published output IDs 12/20 preserved, new output ID28.
All five managed handlers present; webhook installed; repeat workers processed zero.

Clean source parity after removing temporary helpers:
SHA-256 f09c2e0bfa7cdacdf67276ca82cc4ad88f0b7a250f72c2a55b58dfdeeb943144.
Final complete-catalog backup/restore drill completed 17:50:26–17:51:24:
all nine Records rows matched, and all nine source images were copied/restored
with matching byte sizes and SHA-256 hashes. No unavailable files remained.
Backup folder: 1RSC9qrHJgHxveSM322vE3QRXG48xJmw2.
Backup Sheet: 1mP1Q9PWoHS8mZ_nrzwZyz0QX14V28qhCgG_lSw9Vu4g.
Restored Sheet: 1pOJ4X44PkC0CCTUwpEiX-vyDGkKJrqj1a0psERJ7Cec.
The private restore-manifest.json maps each source to backup and restored file.

Functional isolated-restore verification 17:53:36–17:53:45 remapped the copied
Records Drive IDs/links to restored files, validated all nine via the actual
archive verifier, and retrieved exactly -1004406332620:2 for اختباراعطال.
Only the isolated restored sheet was remapped; live catalog references unchanged.
This is verified same-account restoration, not independent-account recovery.

Version 8 deployed 17:51; smoke /search اختباراعطال command 37 -> result 38.
Final live diagnostic at 17:53:44: webhook pending 0, no last error; stages
unpaused, backlog/failures 0; both intended inputs ACTIVE; obsolete old ID
SUSPENDED/MIGRATED. No second-human-account verification was possible.

A final reviewed health-only correction preserves admitted analysis backlog when
Groq is temporarily disabled (does not activate processing). New regression passed.
Final source SHA-256:
278c314435d12ca78c7fd0f68a631f7df7f97ced506ddf943e4960719f2a0eb3.
All temporary operator helpers removed; saved-editor parity verified.

Final release: immutable version 9, deployed 17:56 Cairo on the existing endpoint
with unchanged execution/access configuration. Source hash matches the final
reviewed local file above; no temporary helpers remain. Version-9 smoke search
/search اختباراعطال command39 -> correct image result40 (1/1, matched1/1).
All ten registered local checks, Apps Script syntax and diff checks passed.
Review findings were fixed; final independent source review found no further
material defects. No remote push requested or performed.
