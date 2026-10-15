# School Images Telegram POC

Telegram photo messages are copied to a private Google Drive folder and indexed
in the provided Google Sheet. A text message is associated only when it is
immediately before or after the photo and was sent by the same user.

## Security first

The token previously pasted into chat must be revoked in BotFather. Never put
the replacement token in this repository or in the spreadsheet.

## Configure and deploy

Repository state is not proof of what is currently deployed in Apps Script.
Before setup, add these required values under **Project Settings → Script
Properties**:

- `BOT_TOKEN`: the rotated BotFather token.
- `SPREADSHEET_ID`: the operator-owned catalog Sheet ID.
- `DRIVE_FOLDER_ID`: the private operator-owned archive folder ID.
- `ALLOWED_CHAT_ID`: the canonical negative numeric input-group ID.
- `SEARCH_USER_IDS`: one or more comma-separated numeric Telegram user IDs.

`setupPoc()` validates every required value before changing properties or
Sheets. It never supplies reusable project IDs and never binds itself to the
first group it sees. It generates `WEBHOOK_SECRET` only when the operator-owned
configuration is valid. Invite hashes are not chat IDs.

Make the bot an administrator or creator in the configured input group. Private
search requires both the static `SEARCH_USER_IDS` allowlist and a fresh
`getChatMember` result proving that the user is still a current member; lookup
errors fail closed.

For an authorized release, use this order:

1. Push only the tracked Apps Script files, create a new immutable version, and
   update the existing deployment ID. Confirm the deployment listing maps that
   ID to the new version. Pull the deployed source into a separate temporary
   directory and compare SHA-256 hashes for `Code.gs` and `appsscript.json`
   against the reviewed local files before changing the webhook.
2. Only after deployment identity and source parity are proven, run
   `installWebhook()`. It rechecks the configured input group
   and bot administrator status, then installs the exact
   `WEB_APP_URL?telegram_webhook_key=<WEBHOOK_SECRET>` URL. The generated
   high-entropy value remains in Script Properties and is accepted only from
   that single parameter. Apps Script's public `/exec` endpoint is anonymous in
   this deployment, while anonymous `/exec/<path>` requests are redirected to
   Google sign-in; the query credential is therefore the constrained direct
   Apps Script compatibility boundary. A proxy that validates Telegram's
   `X-Telegram-Bot-Api-Secret-Token` header is the stronger production option.
3. Run `webhookInfo()` and verify that the returned URL contains
   `telegram_webhook_key=[REDACTED]`,
   `pending_update_count` trends to zero as Telegram retries queued updates, and
   the previous `401 Unauthorized` error timestamp stops advancing. A stale
   `last_error_message` may remain temporarily, so judge recovery by the queue
   trend and timestamp rather than by the text alone. The helper never logs or
   returns the query credential or any additional query values.

Treat the complete webhook URL as a credential: do not paste it into chat,
tickets, screenshots, or logs. Do not replace `WEBHOOK_SECRET` while the
webhook is active: an update arriving between the property change and webhook
reinstallation could be acknowledged as unauthenticated. Secret rotation is a
separate ask-first maintenance operation that must pause/delete the webhook
without dropping pending updates, change the property, and reinstall the new
credential before Telegram delivery resumes. Do not rotate by editing the
property first.

These are operator actions. The local checks in this repository do not prove
deployment parity, live permissions, or provider behavior.

The POC uses one Telegram webhook connection so adjacent messages stay ordered.
Upload the files under `test-images/` from a human account to run the live test.

## First live test

Post each item separately and wait for it to finish uploading:

1. Upload `01-notebooks.png` with the caption `Notebooks caption`.
2. Send `Plant before`, upload `02-plant-and-book.png`, then send `Plant after`.
3. Upload `03-globe-and-geometry.png`, then send `Globe after`.

Expected: three `Records` rows, three Drive files, both Plant lines attached to
the second record, and a 👍 reaction on every saved image or associated
after-line. Replying directly to a photo is also supported.

## Private search baseline

Each allowlisted user must open the bot privately and send `/start` once, then
can run searches such as:

```text
/search Plant
/search نشاط خيل
```

The bot returns at most five protected Telegram photos, strongest match first.
Each result shows its rank, matched query-term count, tags when available, and
caption/context. Search fields are weighted in this order:

1. `manual_tags`
2. `ai_tags`
3. `ai_caption`
4. uploader caption and adjacent text

When Groq tagging is enabled, each saved image is analyzed outside the Telegram
webhook. The model writes bilingual captions and search vocabulary plus visible
objects, activities, settings, topics, colors, OCR text, and non-personal visual
tone. The complete normalized result is stored in `ai_metadata_json`; existing
`manual_tags` are never overwritten. `/search` ranks matching images with the
strongest result first. This is rich lexical search over human and generated
metadata, not CLIP-style image embeddings, so a query still needs to overlap a
stored term. Human text is stored as literal Sheet text so formula-looking
messages cannot execute as spreadsheet formulas.

## Approved Gemini semantic-search pilot

The free-tier pilot is only for synthetic or properly de-identified images and
preregistered non-sensitive queries. **Do not enable it for real school or
children photos.** Real imagery requires paid-provider terms plus explicit
privacy, retention, residency, policy, and consent approval first.

Run `setupPoc()` once after updating the source so it creates the separate
`Embeddings` Sheet. Then add all of these Script Properties:

- `GEMINI_API_KEY`: the secret key; never store it in code, Sheets, logs, or chat.
- `GEMINI_PILOT_ENABLED`: exactly `true`.
- `GEMINI_INPUTS_CONFIRMED_NON_SENSITIVE`: exactly `true`, after privacy review.
- `GEMINI_PILOT_DATASET_ID`: the approved synthetic/de-identified dataset version.
- `GEMINI_PILOT_APPROVED_BY`: the privacy approver.
- `GEMINI_PILOT_APPROVED_AT`: an ISO-8601 timestamp with timezone.
- `GEMINI_PILOT_EXPIRES_AT`: a future ISO-8601 timestamp with timezone.
- `GEMINI_PILOT_RECORD_IDS`: comma-separated approved `Records.record_id` values.
- `GEMINI_PILOT_QUERIES`: one approved query per line.
- `GEMINI_EMBEDDING_MODEL`: optional; only `gemini-embedding-2` is supported and
  is the default.

An authorized Apps Script editor manually runs `indexApprovedGeminiPilot()`.
Each run claims at most two approved photos, performs provider calls outside the
short Sheet locks, and retries rows marked `ERROR` on a later run. It never
queues the existing archive automatically and does not depend on Groq tags.

Set `GEMINI_INPUTS_CONFIRMED_NON_SENSITIVE=true` as an additional mandatory
operator attestation. The pilot fails closed before image or query embedding if
that exact value is absent. This gate does not classify content; it records the
privacy owner's decision that the allowlisted inputs are non-sensitive.

For an approved normalized query, `/search` displays `Hybrid pilot` and merges
lexical/OCR/tag rank with exact cosine-similarity rank. Each record appears once,
with literal matches weighted slightly more strongly. An unapproved query,
disabled or expired approval, missing eligible vectors, or provider failure
uses the existing local search and displays `Lexical fallback` without provider
details.

To stop external requests, change `GEMINI_PILOT_ENABLED` to anything other than
`true` or remove it. Existing vectors remain stored but are ineligible while the
gate is closed. After expiry, removal from the record allowlist, approval
replacement, or deletion of a source Photo Record, run
`purgeRevokedGeminiPilotEmbeddings()` to clear vector data and retain its audit
provenance as `REVOKED`.

Run the local check below before the manual synthetic pilot. It makes no Gemini
request. A real Apps Script run is integration evidence only; bilingual quality,
latency, failure-rate, and cost claims require the separate preregistered pilot
benchmark.

## Optional Groq image tagging

Groq receives each queued image, so obtain the required school/privacy approval
before enabling it. In the Groq Console, enable Zero Data Retention for the
project when available.

1. Create a Groq API key.
2. Open the Apps Script project and select **Project Settings**.
3. Under **Script Properties**, add:

   - `GROQ_API_KEY` = your secret Groq key
   - `GROQ_MODEL` = `qwen/qwen3.6-27b` (optional; this is the default)

4. Never put the key in this repository, the Google Sheet, or a Telegram
   message.
5. For this rollout, run `enableGroqTaggingForNewPhotosOnly()` once and approve
   the requested permissions. It stores a UTC cutoff, creates or repairs the
   five-minute worker, returns `queued: 0` and `processed_immediately: 0`, and
   never queues an old row. Eligibility uses each photo's Telegram
   `message.date`, not `update_id`; delayed pre-activation updates remain outside
   the cutoff. Re-running the function safely preserves an existing valid
   cutoff. It refuses activation while a live `TAGGING` lease exists.
6. The older `enableGroqTagging()` explicitly enables `LEGACY_BACKFILL`, queues
   existing untagged photos, and attempts a first batch. Do not use it for this
   rollout. Missing, corrupt, or incomplete mode/cutoff properties fail closed.
7. Check the `Records.processing_status` column:

   - `TAG_NOT_ELIGIBLE`: captured outside the armed new-photo-only boundary
   - `TAG_PENDING`: waiting
   - `TAGGING`: currently leased by a worker
   - `TAG_RETRY`: temporary API/rate-limit failure; automatic retry scheduled
   - `TAGGED`: `ai_tags` and `ai_caption` are ready for `/search`

Activation records the exact managed trigger UID. Any legacy trigger owned by a
different Google account remains inert because its UID cannot pass the worker
gate, even if that account's trigger is still visible in Apps Script.
   - `TAG_ERROR`: permanent failure or five failed attempts; inspect `error`

Run `disableGroqTagging()` to remove the worker and stop new Groq calls. Photo
capture and existing `/search` results continue working while tagging is
disabled.

## Separate searchable output group

The optional output workflow copies a newly captured and successfully enriched
photo to one explicit archive group. Telegram does not search hidden EXIF/image
metadata, so the complete normalized metadata remains in the `Records` Sheet
while a deterministic search projection is placed in the output photo caption.
The caption prioritizes English and Arabic captions and vocabulary, then OCR,
activity/setting, colors/visual tone, and original human context. It is plain
text, uses complete Unicode code points and whole words/phrases, and is always at
most Telegram's 1024-character caption limit. The image bytes/content are not
edited. Provider metadata that has missing/wrong fields, wrong language scripts,
oversized values, or excessive list counts is rejected instead of silently
truncated before durable storage.

Real school or children photos must not be sent to Groq until the school Privacy
Owner has approved the provider boundary, retention, residency, policy, and
consent requirements. The analysis requests only visibly supported content. It
must not identify people or infer names, emotions, intent, relationships, or
sensitive traits.

## Canonical archive and processing states

Telegram is the ingestion/publication interface and a fast delivery cache; it
is not the system of record. Drive holds the immutable canonical image bytes,
Sheets hold workflow and metadata, Groq/Gemini outputs are rebuildable
derivatives, and the output group is a regenerable searchable projection.

Every new accepted photo is downloaded once and validated before AI work. The
bot records `archive_mime_type`, `archive_byte_size`, `archive_sha256`,
`archive_status`, `archive_error`, and `archive_completed_at_utc`. Only an
`ARCHIVED` row with complete integrity evidence is eligible for Groq, Gemini,
publication, normal search delivery, or Drive fallback. A failed capture is
tracked with `archive_attempts` and `archive_next_attempt_utc`. Transient
failures use bounded `ARCHIVE_RETRY`; unsupported/corrupt bytes, ambiguous
duplicate Drive objects, or exhausted retries use `ARCHIVE_FAILED_TERMINAL`.
A Telegram redelivery retries capture only after `archive_next_attempt_utc` is
due. Earlier deliveries and missing/invalid retry deadlines do not consume an
attempt or complete the photo event. This relies on Telegram redelivery; there
is no independent archive retry worker. A record left after Telegram stops
retrying requires operator review before any replay.
A redelivered update can reconcile the same deterministic Drive object and
record without creating a duplicate.

Legacy rows with a Drive ID but no integrity fields are reported as
`LEGACY_UNVERIFIED`. They are excluded by default. An operator may temporarily
set `ALLOW_LEGACY_UNVERIFIED_LEXICAL_SEARCH=true` to expose them to lexical
search only; they remain ineligible for AI, semantic results, and publication.

Run `auditArchive()` from Apps Script for a non-sending health report. It reads
the Records ledger and Drive object metadata and classifies healthy records,
legacy rows, archive failures, incomplete rows, missing objects, and byte-size
conflicts. It does not prove a backup. Irreplaceable images still require a
separately selected backup target and a captured restoration test.

The lifecycle is deliberately ordered:

```text
Telegram input → Drive original + integrity → Groq metadata validation
               → lexical/semantic indexes → Telegram output publication
```

Before enabling the feature:

1. Run `setupPoc()` after updating the source. It expands the `Records` Sheet to
   the append-only 45-column schema. Existing 24- or 37-column layouts migrate
   by appending headers only. If extension columns contain data under unrelated
   headers, setup fails closed and does not relabel that data.
2. Add the existing bot to both private groups using Telegram itself. In
   BotFather, use `/mybots` to confirm its exact `@username` without copying its
   token. In each group, open the group title, choose **Add Members**, and add
   that username. Make the bot an administrator in both groups with only the
   permissions it needs: ordinary photo visibility in input, and message/media
   sending in output. Do not grant user-management or group-settings rights.

   Obtain each numeric ID without a third-party bot:

   - Send one harmless text message in each group, then use **Copy Message Link**
     on that message. This is not the private invite link.
   - A private supergroup link such as `https://t.me/c/1940123456/27` maps to Bot
     API chat ID `-1001940123456`. Apply this conversion independently to each
     group's own message link.
   - If Telegram does not produce the `/c/<number>/<message>` form, stop. Do not
     guess from a `t.me/+...` invite hash and do not use a third-party ID bot.
3. Set `ALLOWED_CHAT_ID` explicitly to the input group or supergroup numeric ID.
   Set `OUTPUT_CHAT_ID` explicitly to the output group or supergroup numeric ID.
   Both must use canonical negative form such as `-1001234567890`—no zero or
   leading zeros—and they must differ.
4. Ensure output publishing is disabled, then run `verifyOutputGroups()`. It
   makes non-sending `getMe`, `getChat`, and `getChatMember` calls; requires the
   current bot to be administrator/creator in both groups; and returns the bot
   identity plus both resolved group titles. Compare those titles and IDs with
   the intended input/output groups before continuing. The managed verification
   marker is bound to both IDs and a one-way fingerprint of the current bot
   token, so changing IDs or rotating the token requires verification again. Do
   not create or edit this marker manually.
5. Configure and approve Groq as described above. Run
   `enableGroqTaggingForNewPhotosOnly()` so the API key, explicit mode, UTC
   cutoff, and worker are all valid while old rows remain unclaimable. The
   function requires Telegram `pending_update_count=0`; after it returns, wait
   until the returned `activated_after_message_date` has passed before sending
   the synthetic test photo. A photo from the cutoff's exact second is rejected
   conservatively.
6. Run `enableOutputPublishing()`. It rechecks the exact verification marker and
   Groq configuration, sets `OUTPUT_PUBLISHING_ENABLED=true`, and installs an
   independent five-minute `processPendingPublications` trigger. It returns
   `backfilled: 0` and never changes old rows.

If output publishing is disabled, either group ID is missing/invalid, the IDs
are equal, the exact verification marker is absent/stale, or Groq enrichment is
not fully enabled at capture time, capture still works but that photo is not a
publication candidate. Fixing configuration later does not backfill it. Only
photos captured while the complete feature configuration is valid receive
`publish_eligible_at_utc`; existing rows and earlier captures are never
auto-published.

`processPendingTags()` performs only Groq work. The independent publication
trigger advances `PUBLISH_PENDING` and due `PUBLISH_RETRY` rows even if Groq is
disabled later. An operator may also run `processPendingPublications()`
explicitly. Run `disableOutputPublishing()` to close the publishing gate and
remove only the publication trigger; it does not alter existing records or the
Groq trigger. Both Groq and Telegram network calls occur outside short Sheet
locks.

Publication waits at least 20 seconds after capture before claiming a row. This
settling window lets an immediately following same-user text line attach to the
photo and enter the deterministic caption before delivery.

Publication states in `Records.publish_status` are:

- blank: output publishing was disabled when the photo was captured.
- `PUBLISH_NOT_ELIGIBLE`: publishing was enabled but configuration was invalid
  at capture time; this row will not be backfilled.
- `PUBLISH_WAITING_FOR_ENRICHMENT`: a new eligible photo is waiting for Groq.
- `PUBLISH_PENDING`: complete metadata is stored and delivery may be claimed.
- `PUBLISHING`: a short-lived worker claim exists; the network call is outside
  the lock.
- `PUBLISH_RETRY`: Telegram explicitly rejected the request with a definitely
  unsent transient response; bounded retry is scheduled.
- `PUBLISHED`: `output_message_id`, `published_at_utc`, and the exact
  `publish_caption` were stored; later workers skip it.
- `PUBLISH_BLOCKED_ENRICHMENT` or `PUBLISH_FAILED`: enrichment or publication
  ended permanently and requires operator review.
- `PUBLISH_UNKNOWN`: the request may have reached Telegram but its outcome could
  not be proved, including a transport timeout or expired delivery claim. It is
  never replayed automatically because replay could create a duplicate.

For `PUBLISH_UNKNOWN`, inspect the output group and Telegram message history
first. Do not reset or replay the row unless an authorized operator has proved
that no message was delivered; ambiguous replay remains an ask-first action.
Changing `OUTPUT_CHAT_ID`, publishing old rows, or sending real photos also
requires explicit approval.

This repository change does not deploy Apps Script, install a trigger, change
Script Properties, or perform live Telegram/Groq/Gemini calls. Those integration
steps and output-group permissions remain unverified until an approved operator
performs the non-destructive configuration checklist above.

## Local check

```powershell
node tests/self_check.js
node tests/archive_retry_check.js
Get-Content -Raw -LiteralPath 'apps-script\Code.gs' | node --check -
```
