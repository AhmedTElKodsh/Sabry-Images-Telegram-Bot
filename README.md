# School Images Telegram Bot

Several school input groups feed one private image catalog. Drive stores the
original image bytes, Sheets stores provenance, captions, analysis and workflow
state, and **Elardh_Images_Group** receives the published copies. Teachers can
search the same published catalog privately through **@SchoolImages_bot** or
with `/search` in the output group.

## Credentials and deployment

Keep `BOT_TOKEN`, `GROQ_API_KEY`, `WEBHOOK_SECRET` and any optional Gemini key in
Apps Script Properties. Never put their values in source, Sheets, chat, logs or
screenshots. The complete webhook URL contains a secret; do not copy it into a
report. Avoid recording the Project Settings page while credentials are visible.

The existing configuration uses `SPREADSHEET_ID`, `DRIVE_FOLDER_ID`,
`ALLOWED_CHAT_ID` as the original input migration seed, and one fixed
`OUTPUT_CHAT_ID`. The bot needs administrator status in the output group for
reliable current-member checks. Keep the archive and catalog private; teachers
receive results through Telegram rather than direct Drive sharing.

The legacy `setupPoc()` validator also requires `SEARCH_USER_IDS` containing at
least one numeric account ID; retain the operator's existing value during this
upgrade. This is a setup-compatibility value, not the shared catalog's teacher
access list. Do not add each teacher there: current output-group membership
authorizes teacher search.

`WEB_APP_URL` must be the versioned canonical Apps Script `/exec` address,
without query parameters or a fragment. Keep the existing deployment identity.
The authenticated webhook uses one high-entropy query parameter because this
Apps Script deployment cannot inspect Telegram's secret-token header. A proxy
that validates that header is a possible later production improvement.

Deploy reviewed source to a new immutable version of the existing deployment,
using the maintenance order below. Compare saved editor source with the reviewed
local source before activation.
Do not treat passing local tests as proof of the deployed version, permissions,
provider behavior or retrieval quality.

For the existing verified two-group installation:

1. Before replacing editor source, run `disableGroqTagging()` and
   `disableOutputPublishing()` and wait for in-flight claims to settle. Pause the
   webhook with `deleteWebhook` and `drop_pending_updates: false`. Use a temporary
   editor wrapper calling `telegram_('deleteWebhook',
   {drop_pending_updates: false}, getConfig_(false).botToken)`; log only its `ok`
   flag. Keep secrets in Properties. Do not reset unknown deliveries, terminal
   records or activation cutoffs. Saving editor source immediately affects
   scheduled workers, even before updating the immutable web deployment.
2. Save the reviewed source, then run `migrateSharedCatalog()` while delivery is
   paused. It validates the previous token-bound group
   verification and live bot identities, appends the schema, seeds the existing
   input, and creates the output-only verification. Repeating migration must
   preserve records and output message IDs. Stop on schema conflicts.
3. Remove temporary wrappers and verify clean source parity, then create a new
   immutable version on the existing deployment. Run
   `installSharedCatalogWorkers()`, `enableGroqTaggingForNewPhotosOnly()` and
   `enableOutputPublishing()` to restore all five managed workers. The existing
   valid analysis cutoff is retained. These are five-minute schedules, not
   immediate deadlines.
4. Run `installWebhook()` to subscribe to `message`, `edited_message` and
   `my_chat_member`, preserving queued Telegram updates.
5. Inspect `catalogHealth()` and the execution page. `webhookInfo()` returns a
   redacted URL; never print or inspect the unredacted webhook URL.
6. Test only the approved synthetic fixture through intake, Drive, Groq,
   publication, search and caption editing. Record local and live evidence
   separately, including any untested multi-group cases.

For a new installation, configure the operator-owned resources and both seed
and output group IDs, make the bot administrator, and run `setupPoc()` and the
existing group-verification/bootstrap flow before migration. Groq tagging uses
`enableGroqTaggingForNewPhotosOnly()` and publishing uses
`enableOutputPublishing()`. Preserve their cutoff: enabling a feature later
must not automatically publish or analyze older photos. Do not use the legacy
`enableGroqTagging()` backfill function for this rollout.

Credential rotation is a separate maintenance operation. Pause/remove the
webhook without dropping pending updates, have the operator replace the secret
values, verify the current bot identity, and reinstall the authenticated
webhook. Never change the webhook secret while delivery is active.

## Adding school input groups

A school member adds the bot to an input group and makes it an administrator.
The bot records the numeric chat ID automatically; private invite hashes are
not chat IDs and need not be copied into configuration.

The enrollment initiator must currently belong to Elardh_Images_Group and have
administration or effective invitation authority in the candidate input group.
Ordinary members with permission to invite are included. Unknown membership or
permission checks do not authorize capture; the pending enrollment can retry.
If another administrator later promotes the bot, the original eligible
initiator remains attached to the enrollment request.

The output group can never enroll as an input. Removing or demoting the bot
suspends new intake. Previously admitted work and already published catalog
entries remain retained. Adding an arbitrary outsider's group does not make
its photos school publications.

## Capture, storage and caption edits

The webhook persists one pending record before acknowledging accepted photo
intake. Its stable ID is `source_chat_id:message_id`. A background archive worker
then downloads the highest-resolution Telegram photo, validates supported
JPEG/PNG/WebP bytes and stores it in the private Drive archive. The catalog
records MIME type, byte size, SHA-256 and completion time. Retries reconcile the
same deterministic Drive object rather than creating a new image each time.

Store full normalized analysis in `ai_metadata_json`, separate from human
captions and manual tags. Telegram captions are a bounded search projection;
they are not the authoritative metadata store. Image bytes are unchanged.
Legacy rows without integrity evidence remain unverified and are excluded from
the shared teacher catalog.

Original and latest human captions are retained separately from adjacent text.
A newer caption edit updates the index and schedules an edit to the known
output message. Removing a caption removes that latest caption from matching;
old human captions are retained for history rather than silently searched.
Duplicate and older edit versions do not restore stale text. Caption updates
never send a replacement photo. A missing output message is a visible failure
requiring review.

Deleting a photo or message from the input Telegram group does **not** delete
its Drive archive, metadata or published catalog entry. Source deletion is not
an archive deletion request. Album photos remain separate records; advanced
album presentation is deferred.

## Basic image analysis

Groq receives archived images outside the webhook. The current default model
is `qwen/qwen3.8-27b`; an explicit configured model override is retained. Basic
analysis produces bilingual descriptions and vocabulary, visible objects,
activities, settings, topics, colors, a representative OCR excerpt and
non-personal visual tone. Full-page transcription and advanced OCR are deferred.

Do not infer identity, sensitive traits, personal emotions or intent. Strict
JSON validation rejects malformed or oversized model output. Human captions and
manual tags are preserved. Provider keys and raw provider responses must never
enter operational errors or Telegram replies.

The operating scope is a non-sensitive image catalog, as confirmed by the owner;
sensitive school/children images are excluded. Basic Groq analysis is authorized
for this scope. The live fixture `test-images/02-plant-and-book.png` contains no
people. Keep credentials out of captions, images, logs and replies.

## Teacher search

In the bot's private chat, send `/start`, then `/search كتاب`. The same command
works in Elardh_Images_Group, including `/search@SchoolImages_bot كتاب` for the
bot's current username. Each request checks the sender's current output-group
membership. Teachers need neither input-group membership nor an individual
`SEARCH_USER_IDS` entry. Anonymous/channel senders and commands addressed to
another bot are ignored.

Both interfaces return at most five healthy archives with confirmed publication
to the fixed output group and a saved output message ID. Pending, unpublished,
failed and unverified records are excluded. Suspending an input does not hide
its previously published photos. Results in the group are visible to that group.

Search is local lexical matching over latest human text, adjacent context,
manual tags and validated AI metadata/OCR. Conservative Arabic/English stopword
filtering removes common function words. At least one meaningful term must
match; coverage, phrase matching and field weights determine order, with stable
ties. A query containing only stopwords asks for more useful terms. A service
failure reports temporary unavailability rather than claiming no matches.

There is no semantic similarity percentage or universal cosine cutoff in this
release. Synonyms work only when present in the indexed vocabulary. Later
embeddings/reranking need separate model selection and school-query evaluation.
Telegram's built-in group search can also find published caption terms, but its
ranking and visibility are separate from `/search`.

## Failures and recovery

Work advances by stage: durable intake → canonical archive → basic analysis or
caption-only fallback → publication → later caption synchronization. Workers
claim short leases under locks and perform external calls outside those locks.
They resume the failed stage rather than repeating the whole workflow.

Temporary failures have five total attempts, with approximately 5, 10, 20 and
40 minutes between retries. Worker scheduling can make waits longer. Honor a
longer provider retry-after interval. Unsupported or corrupt images are terminal.
Invalid credentials, permission loss and storage exhaustion pause the affected
stage for operator attention instead of exhausting every queued photo's budget.

After transient or invalid-JSON analysis retries exhaust, a healthy eligible
archive can publish with its latest human caption and an **analysis unavailable**
marker. It remains searchable through human text. A credential/configuration
pause does not itself trigger that fallback.

Use `catalogHealth()` for sanitized stage state. After fixing the underlying
cause, run `recoverCatalogStage('archive')`, `recoverCatalogStage('analysis')`,
`recoverCatalogStage('publication')` or `recoverCatalogStage('caption')` as
appropriate. This resumes a paused stage; it is not permission to replay old
terminal records or ambiguous publications. Use `requestCatalogEnrichment(recordId)`
for an explicit later analysis attempt on a caption-only record. Successful
analysis updates that record and the same output message.

The Apps Script Run selector cannot supply function arguments. For a deliberate
recovery, an editor can temporarily add and run a small wrapper, then remove it:

```javascript
function operatorRecovery() {
  console.log(JSON.stringify(recoverCatalogStage('archive')));
}
```

Choose the affected stage rather than resuming all stages indiscriminately.
The same wrapper pattern can call `requestCatalogEnrichment('chat_id:message_id')`
for the specific reviewed record; never bulk-reset catalog rows.

For a historical record that was never admitted, an operator wrapper may call
`recoverHistoricalArchive('chat_id:message_id')`. It verifies accessible Drive
bytes or retrieves the retained Telegram file, compares existing integrity
evidence and saves a sanitized original-row audit event before committing.
It grants no analysis or publication eligibility. Conflicts and unavailable
sources fail without replacing the record. An interrupted manual claim requires
operator inspection; never clear it while its execution is still running.
`catalogHealth()` separates current backlog/failures from historical counts;
historical failures remain visible but are not automatic worker work.

Confirmed publication stores `output_message_id`; subsequent runs skip first
publication. Explicit temporary Telegram rejections may retry. A timeout or
expired photo-send lease becomes `PUBLISH_UNKNOWN`: delivery might have occurred,
so automatic resend could duplicate it. Inspect and reconcile the output history
before any separately authorized resend. Caption edits target a known message
and can safely retry; Telegram's 'message is not modified' response completes
that synchronization.

`auditArchive()` provides separate archive health evidence. The October 16
private same-account restore drill verified a copied Records sheet and accessible
image byte sizes/SHA-256 hashes; its manifest and precise coverage are recorded
in `workflow-debug-and-repair-2026-10-16.md` under implementation artifacts.
Repeat backups after changes. This does not establish independent-account
recovery or protect against losing the owning Google account.

## Optional semantic pilot

The older Gemini embedding pilot is retained as an isolated operator experiment;
teacher `/search` does not invoke it. Its explicit dataset, query, expiry and
non-sensitive-input approval gates remain mandatory. Do not enable it for real
school imagery. See the retained pilot spec under
`_bmad-output/implementation-artifacts/spec-approved-pilot-semantic-search.md`.

## Local verification

Run every registered check and syntax validation before deployment:

```powershell
Get-ChildItem tests -Filter '*_check.js' | ForEach-Object {
    node $_.FullName
    if ($LASTEXITCODE -ne 0) { throw "Failed: $($_.Name)" }
}
Get-Content -Raw -LiteralPath 'apps-script\Code.gs' | node --check -
git diff --check
```

Offline fixtures prove the cases they exercise. Live synthetic capture/search
proves that specific deployed path; it does not establish school-corpus relevance
or behavior for every group and member.
