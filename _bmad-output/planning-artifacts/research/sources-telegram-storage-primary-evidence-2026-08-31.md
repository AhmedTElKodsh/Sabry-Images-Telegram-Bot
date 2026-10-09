# Telegram-Native Storage vs. Independent Image Storage

**Evidence date:** 2026-08-31 (live-verified against the linked first-party pages)  
**Scope:** Telegram-native message/media storage as a durable archive for a Telegram image bot, compared with Google Drive and Apps Script.  
**Source policy:** Primary sources only: official Telegram documentation, policies and terms; official Google Drive and Apps Script documentation.  

## Bottom line

**Do not use Telegram as the only permanent archive when losing an image would be unacceptable.** Telegram is an excellent user-facing delivery and discovery layer, and a bot can normally reuse a persistent `file_id` without uploading the image again. But Telegram expressly makes no availability or durability guarantee for bot-related chats, messages, media, or files and instructs developers to design their own persistence so Telegram-side data loss has no material effect. This directly rules out treating Telegram as the sole durable system of record. [Telegram Bot Platform Developer Terms, sections 6.3 and 10](https://telegram.org/tos/bot-developers)

**Google Drive is not uniquely required.** What is required for a durable design is an independent copy in storage controlled by the operator. Google Drive is a practical fit for the existing Apps Script implementation, but another object store could perform the same role. Drive itself is not an immutable or infinite archive: ownership, permissions, deletion, quota, and account lifecycle still need to be managed.

Recommended architecture for this project:

1. Keep the original image in operator-controlled storage (currently Google Drive).
2. Keep the searchable AI metadata and source identifiers in the Google Sheet or another database.
3. Publish a searchable copy with a concise caption to the output Telegram group.
4. Store Telegram `file_id`, `file_unique_id`, chat ID, message ID, Drive file ID, checksum, and processing state as cross-references—not as substitutes for the image bytes.
5. For genuine archival requirements, maintain a second independent backup in addition to Drive.

## Evidence classification

- **Explicit guarantee:** The source directly promises or defines the behavior.
- **Explicit limitation or risk:** The source directly limits, disclaims, or permits loss/deletion.
- **Inference:** Architectural conclusion derived from the cited guarantees and limitations; it is not itself promised by Telegram or Google.

## 1. What Telegram actually stores

### Cloud chats are cloud-backed, not device-cache-only

Telegram describes itself as a cloud service and says it processes cloud chat history—including messages, media, and files—to make it available on a user's devices without third-party backup or cloud storage. Its FAQ also distinguishes cloud messages from device cache: clearing local cache does not inherently delete cloud messages. [Telegram Privacy Policy, section 5.1](https://telegram.org/privacy) [Telegram FAQ](https://telegram.org/faq)

**Explicit behavior:** Images posted in ordinary groups and supergroups are cloud-chat media, not merely files held in one phone's “app memory.”

**Inference:** A Telegram client cache should never be considered the archive. At most, the Telegram cloud copy is the platform-held copy. Local cache eviction, device loss, or reinstall is not the main durability question.

### Telegram does not promise bot-data permanence

Telegram's Bot Platform Developer Terms say Telegram may delete or make inaccessible whole chats, messages, media, and files sent to or from a third-party app at any time. They state that Telegram gives no guarantee that bot-related data will remain available, uncorrupted, or fit for a purpose, and direct developers to design persistence so partial or total loss of Telegram-provided data has no effect. They also say developers must not assume such data is perpetually available, even where documentation or source code otherwise describes a duration. [Telegram Bot Platform Developer Terms, section 6.3](https://telegram.org/tos/bot-developers)

The same terms say the Bot Platform may be changed, restricted, or discontinued and is provided “as is” and “as available.” [Telegram Bot Platform Developer Terms, sections 10 and 12.3](https://telegram.org/tos/bot-developers)

**Explicit limitation:** Telegram does not warrant permanent, uncorrupted, continuously accessible storage for the bot's media.

**Inference:** “Telegram keeps cloud media” is useful product behavior, but it is not an archival service-level guarantee. It cannot be the sole copy where business continuity or irreplaceable school records matter.

## 2. `file_id` and `file_unique_id`: what they guarantee

### `file_id`

The official Bots FAQ says `file_id` values can be treated as persistent. The Bot API defines `file_id` as an identifier usable to download or reuse a file. [Telegram Bots FAQ, Handling Media](https://core.telegram.org/bots/faq) [Telegram Bot API, File](https://core.telegram.org/bots/api#file)

The Bot API also states:

- A `file_id` is unique to an individual bot and cannot be transferred to another bot.
- The same file can have more than one valid `file_id`, even for the same bot.
- A photo resent by `file_id` reuses the Telegram-hosted media without a new upload. [Telegram Bot API, Sending Files](https://core.telegram.org/bots/api#sending-files)

**Explicit guarantee:** The identifier may be stored and reused by the same bot as a persistent API handle.

**Not guaranteed:** The `file_id` documentation does not promise that the underlying bytes will survive every message deletion, chat deletion, bot/account termination, policy action, or platform failure. The Developer Terms expressly disclaim perpetual availability of those bytes.

**Inference:** Persist `file_id` for efficient Telegram reuse, but do not interpret “persistent identifier” as “permanent archive.” An identifier can remain stable while the resource it used to reference becomes unavailable.

### `file_unique_id`

The Bot API says `file_unique_id` is supposed to remain the same over time and across different bots, but explicitly says it cannot be used to download or reuse the file. [Telegram Bot API, PhotoSize and File](https://core.telegram.org/bots/api#photosize)

**Explicit behavior:** `file_unique_id` is suitable as a deduplication/correlation signal across bots.

**Explicit limitation:** It is not a retrieval credential and cannot recover image bytes.

**Inference:** Store it as an index key, not as backup data. It can help recognize a repeated Telegram object, but it cannot restore a missing archive.

### File-reference behavior in the full Telegram API

Telegram's full API documentation explains that a media file reference can expire and may need to be refreshed by refetching its source message or another media source. [Telegram API, File References](https://core.telegram.org/api/file-references)

**Scope caveat:** This is the full MTProto API's `file_reference` mechanism, not the Bot API's `file_id` contract. It should not be conflated with the Bots FAQ's persistent `file_id` statement.

**Inference:** Telegram's internal retrieval model remains source- and platform-dependent. Deleting or losing the source context can make recovery pathways less dependable, reinforcing the need for an independent byte copy.

## 3. Download behavior and operational limits

### Download URL lifetime

`getFile` returns a `file_path`; the bot downloads it through a token-bearing URL. Telegram guarantees that this URL remains valid for at least one hour and says a new URL can be requested by calling `getFile` again after expiry. [Telegram Bot API, `getFile`](https://core.telegram.org/bots/api#getfile)

**Explicit guarantee:** The generated download URL is temporary but valid for at least one hour.

**Inference:** Never save the token-bearing download URL as the long-term pointer. Save `file_id`, and download the bytes promptly into controlled storage. Persisting the URL also creates a credential-exposure risk because it contains the bot token.

### Bot API download limit

The hosted Bot API currently limits `getFile` downloads to 20 MB. Telegram also notes that `getFile` may not preserve the original filename and MIME type and advises saving them when available. [Telegram Bot API, `getFile`](https://core.telegram.org/bots/api#getfile)

**Explicit limitation:** A media item can be visible in Telegram yet exceed what the hosted Bot API will download through `getFile`.

Telegram separately documents that operating a Local Bot API Server permits downloads without a file-size limit. This changes the transport limit, not Telegram's storage-retention or availability commitments. [Telegram Bot API, Using a Local Bot API Server](https://core.telegram.org/bots/api#using-a-local-bot-api-server)

**Inference:** Enforce an input-size policy before promising archival, and store filename/MIME metadata separately. Ordinary compressed Telegram photos are usually below this threshold, but documents uploaded as large original images can exceed it.

### Update retention is not history retention

Telegram stores incoming bot updates only until delivered and never longer than 24 hours. [Telegram Bot API, Getting Updates](https://core.telegram.org/bots/api#getting-updates)

**Explicit limitation:** If the webhook or polling consumer is unavailable long enough, the bot cannot rely on Telegram's update queue to replay all missed uploads.

**Inference:** The bot should download and register images promptly, monitor webhook failures, and reconcile its own ledger. Telegram's update stream is delivery infrastructure, not a backup catalog.

## 4. Deletion, chat lifecycle, and bot access risks

### Message and account deletion

Telegram's Privacy Policy says deleting an account removes messages, media, contacts, and other data stored in the Telegram cloud. It also states that deleting a message in a supergroup or channel removes it for all participants; deleted supergroup messages are retained only temporarily for the admins' Recent Actions view. Inactive accounts self-destruct after the configured period—18 months by default—along with Telegram-cloud data associated with the account. [Telegram Privacy Policy, sections 10.1–10.4](https://telegram.org/privacy)

The Telegram FAQ similarly documents irreversible account deletion and user controls for deleting messages and chat history. [Telegram FAQ, account and data deletion](https://telegram.org/faq)

**Explicit risk:** Telegram messages and their visible media can be deleted by authorized users or through account/chat lifecycle events.

### Bot removal, bans, and platform termination

The Bot API provides `my_chat_member` updates when the bot's membership status changes, confirming that group access is a mutable condition. [Telegram Bot API, Update](https://core.telegram.org/bots/api#update)

The Bot Developer Terms permit Telegram to remove a violating bot, account, or affiliated community and to restrict or discontinue platform access. [Telegram Bot Platform Developer Terms, sections 9–10](https://telegram.org/tos/bot-developers)

**Explicit risk:** Continued bot membership and Bot Platform access are not permanent.

**No explicit guarantee found:** Official Bot API documentation does not promise that a saved `file_id` remains downloadable after the bot is removed from the source group, the source message/chat is deleted, the bot token/account is terminated, or Telegram removes the media.

**Inference:** The system must remain usable if the bot loses Telegram access. That requires the bytes, index, and operational metadata outside Telegram.

## 5. Metadata, indexing, search, backup, and recovery

### Telegram metadata and search

The Bot API permits a photo caption of up to 1,024 characters after entity parsing. [Telegram Bot API, `sendPhoto`](https://core.telegram.org/bots/api#sendphoto)

**Explicit limitation:** A caption is a compact display/search surface, not a general metadata document. It cannot safely hold a complete bilingual AI analysis, provenance, processing state, model information, checksums, and recovery pointers.

The Bot API is update- and action-oriented. Its documented method set does not expose a general bot method to enumerate all historical group messages or perform arbitrary historical full-text search. New incoming updates are retained for at most 24 hours. [Telegram Bot API](https://core.telegram.org/bots/api)

**Inference from the official API surface:** Telegram's client search may be convenient for group members, but the bot needs its own index if search completeness, structured filtering, reprocessing, audits, or recovery matter.

### Telegram backup and recovery

Telegram markets Cloud Chats as an integrated way for users to retain and synchronize chat history across devices. [Telegram FAQ](https://telegram.org/faq)

**No explicit guarantee found:** The Bot API documents no bot-controlled snapshot, point-in-time restore, retention lock, legal hold, checksum audit, or disaster-recovery service for bot media.

**Inference:** User-facing cloud synchronization is not equivalent to an operator-controlled backup. A backup must be independently restorable without depending on the same Telegram chat, bot, token, and platform.

## 6. Google Drive comparison

### Independent byte ownership and retrieval

The Drive API models uploaded binary images as first-class files with stable file IDs, metadata, permissions, and downloadable content. A single user owns files in My Drive; an organization/team owns files in a shared drive. [Google Drive API, Files and folders overview](https://developers.google.com/workspace/drive/api/guides/about-files)

**Explicit behavior:** Drive gives the operator a separately authenticated copy independent of the Telegram message and bot token.

**Inference:** Losing or deleting a Telegram message does not remove the Drive copy, and losing Drive access does not automatically remove the Telegram publication. This failure-domain separation is the core benefit.

### Ownership model

Google says shared-drive files belong to the team rather than an individual and remain when members leave. Shared drives require a qualifying Google Workspace setup. [Google Workspace Learning Center, What are shared drives?](https://support.google.com/a/users/answer/7212025) [Google Drive API, Shared drives overview](https://developers.google.com/workspace/drive/api/guides/about-shareddrives)

**Inference:** For an organization, a shared drive is safer than an employee-owned My Drive folder because archive continuity is not tied to one person's account. For a consumer account, document the owner and recovery plan and share administration with a second trusted operator where possible.

### Deletion and recovery are controlled but not permanent

Drive files moved to trash remain there for 30 days and are then permanently deleted; they can be restored during that window. Only the owner can trash a My Drive file, while shared-drive deletion rights depend on role. [Google Drive API, Trash or delete files](https://developers.google.com/workspace/drive/api/guides/delete) [Google Drive Help, deleted files](https://support.google.com/drive/answer/14933051)

**Explicit limitation:** Drive is not immutable storage. Authorized deletion and permanent loss are still possible.

**Inference:** Restrict delete permissions, alert on missing files, and keep a second backup if the archive is irreplaceable. Drive should be treated as the primary independent store, not the only possible disaster-recovery copy.

### Metadata and search

Drive supports custom file properties for tags and external IDs, and those properties can be used in Drive API search expressions. It also supports `fullText`, file name, MIME type, timestamps, ownership, and other query fields. Custom properties have size/count limits, so a Sheet/database is still more suitable for the full AI payload. [Google Drive API, custom file properties](https://developers.google.com/workspace/drive/api/guides/properties) [Google Drive API, search files](https://developers.google.com/workspace/drive/api/guides/search-files)

**Inference:** Put a compact set of durable keys on the Drive file (`telegram_file_unique_id`, source message ID, record ID, checksum), and keep the rich bilingual vocabulary/sentiment/semantic analysis in the Sheet. Publish only the most useful search words in the Telegram caption.

### Quotas and capacity

A consumer Google account normally has up to 15 GB shared across Drive, Gmail, and Photos. When full, it cannot upload or create Drive files; Google also warns that content may be deleted after being over quota for two years. [Google Drive Help, storage management](https://support.google.com/drive/answer/6374270)

Apps Script also has execution and service quotas, including daily URL Fetch calls, trigger runtime, six-minute execution limits, and a 50 MB URL Fetch response limit. [Google Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas)

**Inference:** Drive capacity and Apps Script quotas must be monitored. They are operational limits, not reasons to remove independent storage. If volume exceeds them, migrate the byte store or worker runtime rather than falling back to Telegram-only storage.

## 7. Architecture options

| Option | Durability assessment | Search/index assessment | Recommendation |
|---|---|---|---|
| Telegram only: output-group message + `file_id` | Fails the Bot Developer Terms' stated persistence expectation; vulnerable to message/chat/platform loss | Useful client search, but caption-limited and not a complete bot-controlled index | Acceptable only for disposable/re-creatable images |
| Telegram bytes + external metadata only | Better indexing, but image recovery still depends on Telegram | Structured search possible; archive restore remains incomplete | Not sufficient when images are irreplaceable |
| Drive original + Sheet metadata + Telegram publication | Independent byte copy and independent index; Telegram remains the user interface | Strongest fit for current Apps Script code and easy group search | **Recommended minimum** |
| Two independent byte stores + Sheet/database + Telegram | Survives loss of one storage provider if backups are tested | Strong, with explicit recovery workflow | Recommended for true archival/compliance needs |

## 8. Recommended project policy

1. **Define Telegram as publication/cache, not source of truth.** The output group is optimized for human discovery and sharing.
2. **Download immediately.** On each accepted input photo, call `getFile`, validate size/MIME type, download the bytes, checksum them, and save them to Drive before marking the record archived.
3. **Keep both identifiers.** Store `file_id` for efficient same-bot resend and `file_unique_id` for correlation/deduplication. Never treat either as the archive.
4. **Record provenance.** Store source chat/message IDs, uploader-provided caption, capture time, Drive file ID, Telegram output message ID, byte size, MIME type, checksum, AI model/version, metadata status, and publication status.
5. **Keep metadata in the Sheet/database.** Use a short bilingual caption for Telegram search; keep the full structured analysis outside the 1,024-character caption.
6. **Fail closed on archive failure.** If Drive is unavailable, do not claim the image is permanently saved. Queue retry and visibly report `archive_pending`/`archive_failed` in operator state.
7. **Use organizational ownership where available.** Prefer a Google Workspace shared drive for continuity; otherwise document the My Drive owner and recovery contacts.
8. **Monitor quota and integrity.** Alert before storage exhaustion and periodically verify that sampled Drive checksums and Telegram/Sheet cross-references still resolve.
9. **Back up the archive.** For irreplaceable school images, periodically export Drive originals and metadata to a second controlled location. Test restoration rather than assuming it.
10. **Respect consent and retention.** Telegram's Developer Terms require lawful, purpose-limited retention and deletion of user data when requested or no longer necessary. The project should define consent, access, deletion, and retention rules before storing real school/children imagery. [Telegram Bot Platform Developer Terms, section 4.2](https://telegram.org/tos/bot-developers)

## Final decision

### Can the bot depend on Telegram-native storage?

- **For convenience, display, delivery, and ordinary resend:** Yes. Persistent `file_id` reuse and Telegram Cloud make it operationally useful.
- **As the only permanent durable archive:** No. Telegram explicitly disclaims that guarantee and instructs bot developers to tolerate loss of Telegram-provided data.

### Is Google Drive required?

- **Google Drive specifically:** No.
- **An independent operator-controlled byte store:** Yes, if “permanent” means the system must survive Telegram message deletion, group loss, bot removal, account/platform action, or an unavailable `file_id`.
- **Best fit for this repository today:** Keep Google Drive as the primary independent image store, Google Sheets as the metadata/index ledger, and the Telegram output group as the searchable user-facing catalog. Add a second backup if the images are truly irreplaceable.

## Primary sources consulted

### Telegram

- [Telegram Bot Platform Developer Terms of Service](https://telegram.org/tos/bot-developers)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Telegram Bots FAQ](https://core.telegram.org/bots/faq)
- [Telegram API file references](https://core.telegram.org/api/file-references)
- [Telegram Privacy Policy](https://telegram.org/privacy)
- [Telegram FAQ](https://telegram.org/faq)

### Google

- [Google Drive API: Files and folders overview](https://developers.google.com/workspace/drive/api/guides/about-files)
- [Google Drive API: Shared drives overview](https://developers.google.com/workspace/drive/api/guides/about-shareddrives)
- [Google Workspace Learning Center: What are shared drives?](https://support.google.com/a/users/answer/7212025)
- [Google Drive API: Trash or delete files and folders](https://developers.google.com/workspace/drive/api/guides/delete)
- [Google Drive Help: What happens when a file is deleted](https://support.google.com/drive/answer/14933051)
- [Google Drive API: Add custom file properties](https://developers.google.com/workspace/drive/api/guides/properties)
- [Google Drive API: Search for files and folders](https://developers.google.com/workspace/drive/api/guides/search-files)
- [Google Drive Help: Manage storage](https://support.google.com/drive/answer/6374270)
- [Google Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas)
