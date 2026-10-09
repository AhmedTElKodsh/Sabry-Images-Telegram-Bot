---
stepsCompleted: [1, 2, 3, 4, 5, 6]
inputDocuments: []
workflowType: 'research'
lastStep: 6
research_type: 'technical'
research_topic: 'Telegram native storage versus Google Drive for permanent bot image archives'
research_goals: 'Determine whether this Telegram image-search bot can depend on Telegram native storage as its durable image archive, or whether Google Drive or another external object store is required for permanent retention, stable retrieval, metadata, search, recovery, and operational ownership.'
user_name: 'Admin'
date: '2026-08-31'
web_research_enabled: true
source_verification: true
---

# Durable Telegram Image Intelligence: Permanent Storage, AI Enrichment, and Hybrid Search

**Date:** 2026-08-31
**Author:** Admin
**Research Type:** technical

---

## Research Overview

This research determines whether a Telegram image-search bot can depend on Telegram-hosted group media as its permanent archive or requires an independently controlled image store. It examines current Telegram Bot Platform contracts and file behavior, Google Drive ownership and recovery controls, Apps Script execution constraints, Groq vision integration, Sheet-backed workflow coordination, and vector-search evolution. Official Telegram, Google, Groq, and pgvector documentation was prioritized and cross-checked against the repository's actual Apps Script data path.

The decisive result is that Telegram is suitable as an ingestion, publication, and fast-delivery layer but not as the sole durable archive. Telegram's Bot Developer Terms expressly warn developers not to assume perpetual availability and require persistence designs that tolerate partial or complete platform-data loss. The recommended lifecycle is therefore to preserve the immutable raw image in operator-controlled storage before Groq analysis, then validate and index the derived metadata before publishing a searchable Telegram projection.

The practical initial architecture is Drive for canonical image bytes, Sheets for workflow and structured metadata, Apps Script for orchestration, Groq for replaceable AI enrichment, and a derived embedding index for semantic search. Search should remain hybrid—exact lexical/OCR/tag matching plus vectors. PostgreSQL with pgvector is the preferred evidence-driven evolution when Sheet contention, workflow volume, authorization requirements, or search scale justify migration. See **Research Synthesis and Executive Decision** near the end of this document for the consolidated decision, roadmap, risk posture, and completion gates.

---

<!-- Content will be appended sequentially through research workflow steps -->

## Technical Research Scope Confirmation

**Research Topic:** Telegram native storage versus Google Drive for permanent bot image archives
**Research Goals:** Determine whether this Telegram image-search bot can depend on Telegram native storage as its durable image archive, or whether Google Drive or another external object store is required for permanent retention, stable retrieval, metadata, search, recovery, and operational ownership.

**Technical Research Scope:**

- Architecture Analysis - design patterns, frameworks, system architecture
- Implementation Approaches - development methodologies, coding patterns
- Technology Stack - languages, frameworks, tools, platforms
- Integration Patterns - APIs, protocols, interoperability
- Performance Considerations - scalability, optimization, patterns

**Research Methodology:**

- Current web data with rigorous source verification
- Multi-source validation for critical technical claims
- Confidence level framework for uncertain information
- Comprehensive technical coverage with architecture-specific insights

**Scope Confirmed:** 2026-08-31

## Technology Stack Analysis

### Research Coverage and Evidence Quality

This analysis distinguishes three different things that are easy to conflate: Telegram client cache, Telegram cloud-chat media, and the Telegram Bot API's programmatic file interface. It evaluates those components against Google Drive as an external archive controlled by the bot operator. Current official Telegram, Google Drive, and Google Apps Script documentation was prioritized. The project's checked-in Apps Script implementation was then used to test whether the findings match the actual data path.

The strongest documented facts are the Bot API's identifier behavior, temporary download-link behavior, hosted download-size limit, update retention window, and Google Drive's ownership and file-resource model. More decisively, Telegram's current Bot Platform Developer Terms state that developers must not assume Telegram-provided data will remain available perpetually or for a specific duration and must design persistence so partial or total loss does not harm the application. Therefore, the conclusion that Telegram-only storage is unsuitable for a permanent business archive is directly supported by Telegram's platform terms as well as by the documented control and deletion boundaries; it is not a claim that Telegram normally deletes cloud-chat media quickly.

**Overall confidence:** High for the recommended hybrid architecture; medium for the future lifetime of any specific Telegram `file_id`, because the documentation describes reuse but does not provide an archival retention guarantee.

### Programming Languages

The existing implementation uses JavaScript on the Google Apps Script V8 runtime. This remains a suitable language/runtime combination for this bot because its workload is event-driven orchestration: parse Telegram webhook JSON, download a binary image, call Groq or Gemini over HTTPS, update a Sheet, save a Drive blob, and publish to Telegram. There is no computational advantage in adding another language merely to change storage policy.

Apps Script's `UrlFetchApp` is the relevant networking primitive for Telegram and AI-provider APIs. Google documents it as the supported way for Apps Script to call external web APIs. The runtime is convenient but bounded: current Apps Script documentation lists a six-minute execution limit, per-user daily URL Fetch quotas, a 50 MB response-size limit per call, and daily trigger-runtime quotas. These limits support short asynchronous jobs and bounded retries rather than long-running bulk processing.

_Primary language: JavaScript (Google Apps Script V8)_  
_Performance characteristic: appropriate for low-to-moderate event volume; execution and URL Fetch quotas must be monitored_  
_Source: [Google Apps Script external APIs](https://developers.google.com/apps-script/guides/services/external), [Google Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas)_

### Development Frameworks and Libraries

The system does not require a conventional web framework. Google Apps Script supplies the hosted web-app entry point, triggers, locking, properties, Drive access, and Sheets access. Telegram supplies the Bot API over HTTPS. Groq and Gemini are called directly using their JSON APIs. This small dependency surface is advantageous for an Apps Script deployment because there is no package build or server process to maintain.

The important protocol distinction is between the Telegram Bot API and Telegram's lower-level MTProto API. This bot uses the Bot API. Bot API media objects expose a `file_id` that can be used to download or reuse the file and a `file_unique_id` intended to remain the same over time and across bots, but `file_unique_id` cannot download or resend the file. `getFile` returns a `file_path`; the resulting hosted download URL is guaranteed for at least one hour and can be renewed by calling `getFile` again. The standard hosted Bot API currently limits bot downloads to 20 MB.

Telegram also documents that a self-hosted Local Bot API Server removes the download-size limit and can return a local path. That option changes transport and hosting, but it does not turn a Telegram group into an operator-controlled backup. Running it would add server administration and local disk durability requirements that the current serverless Apps Script design intentionally avoids.

_Major interfaces: Telegram Bot API, Apps Script services, Groq API, Gemini API_  
_Ecosystem maturity: mature HTTP/JSON interfaces; no additional framework is required_  
_Source: [Telegram Bot API File and getFile](https://core.telegram.org/bots/api#getfile), [Telegram Local Bot API Server](https://core.telegram.org/bots/api#using-a-local-bot-api-server)_

### Database and Storage Technologies

#### Telegram cloud media

Telegram cloud chats are useful as the user-facing publication and discovery surface. Users can search captions and tags in the output group, and the bot can efficiently resend an image by its Telegram `file_id`. Telegram's FAQ confirms that ordinary cloud messages and media are synchronized through the Telegram cloud, so clearing a device's local cache is not the same as deleting the cloud copy.

However, Telegram cloud media should be classified here as an **operational messaging store and delivery cache**, not the permanent archive of record:

- A `file_id` is an opaque Telegram handle, not an independently held image object. The documented download URL derived from `getFile` is temporary.
- `file_unique_id` is useful for deduplication, but cannot retrieve or resend content.
- Telegram keeps unconsumed bot updates for no longer than 24 hours. If webhook processing fails beyond that window, the bot cannot treat the update queue as a durable ingestion log.
- Group administrators and bots with suitable rights can delete messages. Telegram's user FAQ also documents account and cloud-data deletion mechanisms. These facts establish that message existence and access are governed inside Telegram, not by an archive retention policy owned by this application.
- Telegram documents MTProto file references as expirable and refreshable by refetching the source message. Although the Bot API hides much of that mechanism behind `file_id` and `getFile`, it reinforces the architectural principle that Telegram references are service-managed access handles rather than portable stored objects.
- Telegram's Bot Platform Developer Terms make the persistence boundary explicit: Telegram gives no guarantee that Bot Platform data will remain available, uncorrupted, or fit for a purpose, and instructs developers to make partial or complete platform-data loss non-damaging to their application.

The documentation does **not** say that every ordinary Bot API `file_id` immediately stops working when its source message is deleted, so this report does not assume that behavior. The risk is the absence of a documented permanent-retention contract and the operator's lack of independent custody.

_Sources: [Telegram Bot API](https://core.telegram.org/bots/api), [Telegram Bot Platform Developer Terms](https://telegram.org/tos/bot-developers), [Telegram file references](https://core.telegram.org/api/file-references), [Telegram FAQ](https://telegram.org/faq)_

#### Google Drive image archive

Google Drive represents each saved image as a first-class `files` resource with a stable file ID, binary content, size, timestamps, version information, description, ownership, permissions, and trash state. This gives the bot operator an independently addressable copy that can be downloaded, exported, audited, backed up elsewhere, or re-uploaded to Telegram.

Drive is not literally indestructible. Owners or authorized organizers can trash or permanently delete content, and trashed files are automatically deleted after 30 days. Its advantage is governance: ownership, access control, deletion, recovery during the trash window, and migration are controlled by the Google account or Workspace organization selected by the operator. For organizational continuity, a Workspace shared drive is stronger than one person's My Drive because Google documents shared-drive content as owned by the organization rather than an individual user. A consumer-account deployment can still use My Drive, but should define account recovery, ownership, storage quota, and backup/export procedures.

_Recommended role: durable primary image archive under operator control_  
_Source: [Google Drive files resource](https://developers.google.com/workspace/drive/api/reference/rest/v3/files), [Drive files and ownership](https://developers.google.com/workspace/drive/api/guides/about-files), [Drive trash and deletion](https://developers.google.com/workspace/drive/api/guides/delete)_

#### Google Sheets metadata index

Google Sheets is appropriate for the current catalog's structured metadata and processing state: Telegram message IDs, `file_id`, `file_unique_id`, Drive file ID/link, bilingual captions, lexical tags, OCR text, analysis status, and publication state. It should not store image binaries. Sheets is an index and lightweight job ledger; Drive is the binary object store; Telegram is the searchable user interface and fast media-delivery layer.

For larger scale or stronger transactional/search requirements, the Sheet could later be replaced by a database or dedicated search index without changing the recommendation to keep independent binary storage. That migration is not required for the current scope.

### Development Tools and Platforms

The current toolchain—Apps Script editor or `clasp`, source control, local self-checks, and Apps Script execution logs—is sufficient. Operational tooling should additionally verify:

- the deployed script owner can open and write the configured Drive folder;
- the bot can call `getFile` and download representative image sizes;
- every accepted Telegram image has a non-empty Drive file ID before AI processing/publication is considered complete;
- the Sheet's Telegram and Drive identifiers remain paired for fallback and audit;
- failed Drive writes are retried or visibly quarantined rather than silently publishing a Telegram-only record.

This aligns with the checked-in implementation: `storePhoto_` downloads the Telegram file and creates a Drive file; Groq and Gemini read the Drive blob; search delivery first tries Telegram's cached `file_id`, then re-uploads the Drive blob if the cached send fails. The code therefore already treats Drive as the durable recovery path.

_Testing emphasis: ingestion durability, permission failure, duplicate processing, Telegram cached-send fallback, and Drive recovery_  
_Source: [Apps Script execution and quota guidance](https://developers.google.com/apps-script/guides/services/quotas)_

### Cloud Infrastructure and Deployment

The suitable deployment is a small hybrid/serverless architecture:

1. Telegram input group receives the original image and sends a webhook update.
2. Apps Script immediately resolves and downloads the Telegram file while the update and access path are fresh.
3. Apps Script stores the binary in Drive and records both Telegram and Drive identifiers in Sheets.
4. AI analysis reads the Drive copy, producing searchable bilingual metadata.
5. The bot publishes to the output Telegram group using the image and enriched caption.
6. Search results use Telegram `file_id` for efficiency and Drive as the retry/recovery source.

No Docker, Kubernetes, VM, or self-hosted Telegram Bot API server is justified at the current scale. Those components become relevant only if image sizes exceed hosted Bot API/App Script limits, throughput outgrows Apps Script quotas, or the operator needs a different object store and worker runtime.

_Cloud platforms: Telegram cloud plus Google Apps Script, Drive, and Sheets_  
_Deployment style: serverless webhook and bounded background triggers_  
_Source: [Telegram Bot API update delivery](https://core.telegram.org/bots/api#getting-updates), [Google Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas)_

### Technology Adoption and Decision Trend

The relevant design pattern is not “Telegram versus Google Drive” as mutually exclusive products. It is **messaging-platform storage versus operator-controlled object storage**. Messaging media IDs are excellent for delivery locality and low-friction reuse. A separately controlled object copy is better for retention policy, recovery, migration, audit, and protection from chat-level lifecycle changes.

Google Drive is not the only technically valid permanent-storage option. Amazon S3, Google Cloud Storage, Azure Blob Storage, or another durable object store could fill the same architectural role. In this project, Drive is the pragmatic default because the runtime already has native Drive access, the code already stores and reads Drive files, and the existing Sheets catalog already records Drive IDs and links. Replacing Drive now would add integration and credential complexity without solving an unmet requirement.

### Step 2 Decision

**Google Drive is not technically mandatory by product name, but an external operator-controlled binary store is required if “permanent storage” means durable custody, recoverability, migration, and retention independent of Telegram.** Telegram-only storage is acceptable only if the owner explicitly accepts it as a convenience archive with no independent backup or retention guarantee.

For this bot, keep the current hybrid design:

- Telegram output group: searchable user-facing library and efficient delivery cache.
- Google Drive: canonical retained image copy and fallback source.
- Google Sheets: metadata/search index and processing ledger.
- Telegram `file_id`: fast resend handle, never the sole archival record.
- Telegram `file_unique_id`: deduplication key, not a download key.

Before calling the storage path production-ready, the configured Drive folder must be accessible and writable by the Apps Script deployment owner, and a live but controlled end-to-end image should prove that a Drive copy exists before enrichment/publication completes.

## Integration Patterns Analysis

### Research Coverage and Quality Assessment

This step evaluated the APIs and failure boundaries that connect Telegram, Apps Script, Google Drive, Google Sheets, and Groq. Official platform documentation was used for webhook delivery, Apps Script execution and locking, Drive upload recovery, and Groq image/error behavior. The checked-in implementation was inspected to determine whether the recommended patterns already exist.

**Cross-integration finding:** no single API call can atomically commit the Telegram message, Drive object, Sheet row, Groq metadata, and Telegram output publication. Reliability must therefore come from stable identifiers, idempotent writes, explicit processing states, bounded leases, and retryable transitions.

**Confidence:** High. The platforms document their individual delivery and retry behavior clearly. The remaining uncertainty is operational—actual quotas, group permissions, and account ownership—which must be verified in the live deployment.

### API Design Patterns

#### REST-style HTTP APIs

The integrations are point-to-point HTTPS APIs:

- Telegram sends JSON updates to an Apps Script web-app `doPost(e)` endpoint.
- Apps Script calls Telegram Bot API methods using form or JSON HTTP requests.
- Apps Script calls Groq's OpenAI-compatible chat-completions endpoint with JSON.
- Apps Script uses native Drive and Sheets services under the deployment owner's Google authorization.

GraphQL, gRPC, WebSockets, and a general API gateway provide no useful benefit at the current scale. They would add infrastructure without removing the fundamental cross-system state problem.

_RESTful APIs: suitable and already implemented_  
_GraphQL/RPC/gRPC: not justified for this small orchestration workflow_  
_Source: [Telegram Bot API](https://core.telegram.org/bots/api), [Apps Script web apps](https://developers.google.com/apps-script/guides/web), [Apps Script external APIs](https://developers.google.com/apps-script/guides/services/external)_

#### Webhook ingestion

Telegram's `setWebhook` sends each update as an HTTPS POST containing a JSON `Update`. Telegram retries unsuccessful non-2xx responses for a limited number of attempts. It permits 1–100 simultaneous webhook connections, with 40 as the documented default, and exposes pending-update and last-error information through `getWebhookInfo`.

For Apps Script, a low `max_connections` value is safer than Telegram's default because each request may contend for a script lock and shared Sheet. The webhook should perform only bounded ingestion work: authenticate the request, validate the allowed input group, deduplicate `update_id`, resolve/download the image, create the Drive copy, write the initial Sheet record, and return success. Groq analysis and output publication should remain in queued trigger workers.

Telegram supports a `secret_token` that arrives in the `X-Telegram-Bot-Api-Secret-Token` header. However, Apps Script's documented `doPost(e)` event object exposes request parameters and body data, not arbitrary request headers. The existing secret embedded in the deployed webhook URL is therefore a practical Apps Script-specific compensating control. It must be combined with the explicit numeric input-chat allowlist, kept out of logs/documentation, and rotated if exposed. A platform that exposes headers should use Telegram's native secret header.

_Webhook pattern: authenticated, idempotent, bounded ingestion followed by asynchronous workers_  
_Source: [Telegram `setWebhook`](https://core.telegram.org/bots/api#setwebhook), [Apps Script web-app request events](https://developers.google.com/apps-script/guides/web)_

### Communication Protocols

All external communication uses HTTPS. Telegram and Groq exchange UTF-8 JSON control data; Telegram's file endpoint exchanges binary image bytes; Groq accepts either an image URL or a base64 data URL for vision input. Drive and Sheets are accessed through Apps Script's authorized service layer.

Persistent WebSockets are not suitable because Apps Script web apps are request-driven and have bounded execution time. AMQP, MQTT, Kafka, RabbitMQ, and similar brokers are also unnecessary today. The Sheet's explicit state columns and time-driven trigger form a lightweight durable work queue adequate for current throughput.

That lightweight queue is valid only while contention and scan cost remain manageable. A move to Cloud Tasks, Pub/Sub, or another broker becomes appropriate if webhook volume, latency targets, or Apps Script quotas make Sheet-based claiming unreliable.

_HTTP/HTTPS: required and sufficient_  
_WebSockets: incompatible with the current serverless request lifecycle_  
_Message broker: deferred until scale or latency evidence justifies it_  
_Source: [Apps Script web apps](https://developers.google.com/apps-script/guides/web), [Google Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas)_

### Data Formats and Standards

#### Telegram update and API data

Telegram updates are JSON objects. Numeric Telegram identifiers may exceed 32 significant bits, while the Bot API documents them as safe within 52 significant bits; storing chat, message, and update identifiers as strings in Sheets avoids formatting and precision surprises. The stable ingestion identity should be the Telegram `update_id`, with `(chat_id, message_id)` and `file_unique_id` retained as additional correlation keys.

The temporary `file_path` URL must never be treated as persistent metadata and must not be logged because the URL includes the bot token. Store `file_id`, `file_unique_id`, MIME type, byte size, source IDs, Drive ID, and optionally a cryptographic checksum instead.

#### Binary images and AI payloads

The image itself should remain binary in Drive. Passing it to Groq as a base64 data URL increases payload size and must stay under the model/request limit. Current Groq vision documentation lists a 20 MB maximum request containing an image URL for the supported Qwen vision models; the checked-in implementation also guards its base64 request size.

Groq vision supports JSON mode. The bot should continue requesting a strict JSON object and then validate every field, type, count, language, and length before persisting or publishing it. Model output is untrusted application input even when JSON parsing succeeds.

#### Sheet record format

The Sheet is the canonical integration ledger, not a flat export. Each row needs stable identifiers and explicit states such as archive saved, tag pending/leased/retry/error/complete, and publication pending/leased/retry/failed/complete. Timestamps should be ISO-8601 UTC strings. Rich AI metadata should remain structured in dedicated columns or normalized JSON fields; only the most useful bounded terms belong in the Telegram caption.

_JSON: control and structured metadata_  
_Binary blob: canonical image bytes in Drive_  
_Base64 data URL: transient Groq transport only_  
_CSV/flat files: suitable only for backup/export, not live coordination_  
_Source: [Telegram Bot API types](https://core.telegram.org/bots/api#available-types), [Groq vision and JSON mode](https://console.groq.com/docs/vision)_

### System Interoperability Approaches

#### Point-to-point integration with a canonical ledger

The current system should remain point-to-point because there are only four external service boundaries and one orchestration runtime. The Sheet row is the canonical coordination record linking:

- Telegram input `update_id`, chat ID, message ID, `file_id`, and `file_unique_id`;
- Drive file ID, link, MIME type, byte size, and optional checksum;
- Groq model/version, metadata output, attempts, error, and completion state;
- Telegram output chat ID and output message ID.

No identifier substitutes for another. In particular, the Telegram output message is a publication projection of the archived Drive object and Sheet metadata, not the source record.

#### Idempotency and duplicate suppression

Telegram may retry webhook delivery after a non-2xx response, and uncertainty can occur after any remote call times out. Processing must therefore be at-least-once with idempotent effects:

1. Reject or no-op a previously recorded `update_id`.
2. Derive a stable record ID and deterministic Drive filename or store a checksum/correlation property.
3. Under a script lock, claim state transitions and write unique attempt/lease identifiers.
4. Perform remote work outside long critical sections where practical.
5. Reacquire the lock and commit the result only if the same lease is still active.
6. Treat a repeated successful publication or upload as reconciliation work, not a reason to create another canonical row.

Google Drive's REST API can pre-generate file IDs, allowing safe retry after an indeterminate upload result: a successful duplicate retry receives a conflict instead of creating another object. The current `DriveApp` implementation uses a deterministic filename lookup, which is simpler but weaker under races; the Sheet lock and unique record identity must remain in place. If upload ambiguity becomes a real problem, use the advanced Drive API with a pre-generated ID.

_Integration style: direct APIs plus a durable, idempotent Sheet ledger_  
_API gateway/service mesh/ESB: not justified_  
_Source: [Telegram webhook behavior](https://core.telegram.org/bots/api#setwebhook), [Drive upload and safe retry](https://developers.google.com/workspace/drive/api/guides/manage-uploads), [Apps Script LockService](https://developers.google.com/apps-script/reference/lock/lock-service)_

### Microservices Integration Patterns

This application is a modular monolith, not a microservice system. Apps Script functions form logical stages but deploy as one script. The useful resilience patterns are still applicable:

- **Circuit breaker / pause:** repeated 401/403 configuration failures or terminal validation failures should stop retries and require operator action.
- **Bounded exponential backoff:** retry Telegram 429/5xx, Groq 429/498/5xx, and transient Google service failures with jitter and maximum attempts.
- **Respect provider delay:** Telegram may return `retry_after`; Groq documents `retry-after` on 429 responses. Honor these values within safe bounds.
- **Lease-and-reclaim:** a worker claim expires so a later worker can recover after Apps Script termination.
- **Compensating action:** if output publication succeeds but the final Sheet commit is uncertain, reconcile by output message/correlation state rather than blindly resending.
- **Dead-letter state:** terminal archive, AI, or publication failures remain visible in the Sheet for operator repair.

A distributed Saga framework is unnecessary. The state-machine row already acts as an explicit orchestration saga: archive, enrich, publish, and finalize are separately committed steps with retries and terminal states.

_Source: [Groq API errors](https://console.groq.com/docs/errors), [Groq rate limits](https://console.groq.com/docs/rate-limits), [Telegram Bot API response parameters](https://core.telegram.org/bots/api#responseparameters)_

### Event-Driven Integration

The architecture is event-driven at ingress and scheduled-event-driven afterward:

```text
Telegram photo update
        |
        v
Apps Script doPost -- validate + deduplicate + save Drive + create Sheet row
        |
        +--> tagging trigger -- claim --> Groq --> validate --> commit metadata
        |
        +--> publishing trigger -- claim --> Telegram output --> commit message ID
        |
        +--> search command -- query Sheet --> send cached file_id
                                      \--> on failure, upload Drive blob
```

Full event sourcing and CQRS are excessive. Nevertheless, preserving append-only event/audit rows for incoming updates and explicit current-state columns is useful. The search path is a read projection over completed rows, while tagging and publication are commands that mutate controlled processing state.

Telegram retains undelivered updates for no more than 24 hours. `getWebhookInfo.pending_update_count`, last error date, and last error message should therefore be monitored. A production recovery procedure should explain how to reconcile manually uploaded input-group images if webhook downtime approaches that limit.

_Publish-subscribe broker: not currently present_  
_Event source: Telegram webhook_  
_Durable workflow state: Google Sheet rows and audit events_  
_Source: [Telegram getting updates](https://core.telegram.org/bots/api#getting-updates), [Telegram `getWebhookInfo`](https://core.telegram.org/bots/api#getwebhookinfo)_

### Integration Security Patterns

#### Secrets and authentication

Store `BOT_TOKEN`, `GROQ_API_KEY`, webhook secret, spreadsheet ID, Drive folder ID, and explicit chat IDs in Script Properties rather than source code or Sheet cells. Apps Script documents Script Properties as key-value data scoped to and accessible within the script. Access to the Apps Script project must therefore be restricted because script editors can access script-scoped configuration.

The bot token must never appear in logs. Since Telegram file-download URLs embed it, errors should log only HTTP status, record ID, and a redacted provider message. Groq uses a bearer API key; use a project-specific key, separate test and production projects if available, and rotate compromised credentials.

#### Authorization and data minimization

Webhook authenticity alone is insufficient. Every image event must also match the configured numeric input-group ID. Output publication must match a different explicit output-group ID. The bot should request only the Telegram update types and group/admin permissions it needs.

Drive access executes under the configured Apps Script deployment identity. Prefer a dedicated organizational owner/shared drive when available, use the smallest practical folder scope, and do not expose public Drive links merely to let Groq read the image. The existing base64 transport keeps Drive private, though it sends the image bytes to Groq and therefore requires a disclosed privacy policy, lawful purpose, retention rules, and uploader authorization.

Telegram's Bot Developer Terms require purpose-limited data collection and deletion when data is no longer needed or a valid request requires deletion. Images—especially school or children's images—must not be processed into a broad dataset or AI training corpus. Search access should remain limited to authorized group members, and `protect_content` can reduce casual forwarding but is not an access-control substitute.

#### Concurrency protection

Apps Script `LockService` prevents concurrent execution of guarded code sections and is appropriate for Sheet claims and duplicate checks. Locks should be short and always released in `finally`; remote network calls should not monopolize a global lock unless correctness requires it. Long work is protected by persisted lease IDs and expiry timestamps, not by holding a lock across the entire API call.

_Authentication: Telegram webhook URL secret plus strict chat allowlist; bearer keys for provider APIs_  
_Authorization: Apps Script deployment identity and Drive permissions_  
_Encryption: HTTPS in transit; Google/Telegram/Groq provider controls at rest, subject to their terms_  
_Source: [Telegram webhook secret](https://core.telegram.org/bots/api#setwebhook), [Apps Script PropertiesService](https://developers.google.com/apps-script/reference/properties/properties-service), [Apps Script LockService](https://developers.google.com/apps-script/reference/lock/lock-service), [Telegram Bot Developer Terms](https://telegram.org/tos/bot-developers)_

### Failure and Recovery Matrix

| Failure boundary | Required behavior | Durable evidence |
|---|---|---|
| Invalid webhook secret or wrong input group | Reject/no-op; never archive or analyze | Security log without image/token data |
| Duplicate Telegram update | Return success without duplicate Drive/Sheet objects | Existing `update_id` record |
| Telegram `getFile`/download transient failure | Return non-2xx while retry remains useful, or persist explicit archive-pending work if bytes can later be resolved | Attempt/error state |
| Drive permission/quota failure | Do not mark archived, enrich, or publish as permanent | `ARCHIVE_FAILED`/operator-visible error |
| Sheet lock contention | Short bounded retry; avoid parallel row mutation | No partial claim |
| Groq 429/498/5xx | Retry with bounded jitter/backoff and provider delay | Attempts, next-attempt time, last error |
| Invalid/hallucinated Groq JSON | Fail closed; never publish unsupported metadata | Terminal validation error |
| Telegram publication 429/5xx | Retry from pending state; honor `retry_after` | Publication claim and attempts |
| Telegram cached `file_id` fails | Retry upload from Drive blob | Drive ID and resulting output message ID |
| Commit uncertain after remote success | Reconcile before repeating side effect | Claim ID, correlation IDs, output IDs |

### Step 3 Decision

Keep the existing direct API integrations and Sheet-backed worker state machine. Strengthen the operational contract as follows:

1. A photo is not archived until its Drive file ID and source identifiers are durably recorded.
2. AI enrichment never runs from a Telegram-only reference when the archive requirement applies.
3. Publication never runs until archive and validated metadata states are complete.
4. Every stage is idempotent, lease-based, bounded in retries, and visibly terminal on permanent failure.
5. Search tries Telegram's cached `file_id` first and Drive bytes second.
6. Webhook backlog, Drive quota/access, Groq errors, and terminal Sheet states are monitored.
7. Secrets, image data, and AI-provider disclosure are governed by an explicit privacy/retention policy.

No API gateway, message broker, microservice split, or self-hosted Bot API server is needed now. The next scaling step should be evidence-driven: migrate worker queues/storage only when Apps Script execution limits, Sheet contention, or archive volume demonstrably exceed this design.

## Architectural Patterns and Design

### System Architecture Patterns

The target architecture is a **serverless modular monolith with asynchronous workers**. One Apps Script deployment owns policy and orchestration, while internal modules separate webhook ingestion, raw preservation, AI enrichment, metadata validation, publication, search, and administration. This preserves low operational overhead without coupling every stage into one synchronous request.

The architecture follows an orchestration-saga pattern because no transaction can atomically update Telegram, Drive, Sheets, Groq, and the output group. Each stage commits durable progress and can be retried independently. External side effects use stable correlation identifiers and reconciliation rather than assuming exactly-once delivery.

The system's ownership boundaries are:

| Component | Architectural responsibility |
|---|---|
| Telegram input group | User-controlled ingestion channel |
| Apps Script | Orchestrator and policy enforcement |
| Google Drive | Canonical retained raw image bytes |
| Google Sheets initially | Metadata catalog, audit trail, queue, and workflow state |
| PostgreSQL plus pgvector later | Scalable transactional metadata, lexical search, and vector index |
| Groq | Replaceable AI enrichment adapter |
| Telegram output group | Searchable publication projection and delivery cache |

Telegram and Groq are not systems of record. Their identifiers and generated outputs are references or derived data. Drive owns the retained source bytes; the metadata ledger owns processing truth; Telegram is a regenerable projection.

_Source: [Google Cloud Well-Architected Framework](https://docs.cloud.google.com/architecture/framework), [Microsoft compensating-transaction pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/compensating-transaction)_

### Design Principles and Best Practices

The key lifecycle principle is:

> **Preserve the original before analysis; complete the catalog after validated analysis.**

“Archive” is divided into two milestones:

1. **Raw preservation:** download the Telegram image, save an immutable operator-controlled copy, and durably record its source identifiers.
2. **Catalog completion:** run Groq, validate all derived metadata, update lexical/vector indexes, and publish the searchable Telegram projection.

The resulting sequence is:

```text
Telegram update
    -> authenticate, authorize, deduplicate
    -> download original once
    -> save raw Drive image + ingestion record (ANALYSIS_PENDING)
    -> Groq analysis
    -> strict metadata validation
    -> save structured metadata + embeddings
    -> publish enriched output-group message
    -> mark COMPLETE
```

Groq deliberately runs after raw preservation because it is a fallible processor rather than storage. Rate limits, model availability, invalid JSON, request limits, or Apps Script termination must not lose the original. Preserving the source also supports later re-analysis with a better prompt/model and audit of derived claims.

The only raw original should not be destructively rewritten. If embedded EXIF/XMP/IPTC metadata is required for file portability, create a derived enriched image while retaining the immutable original. Telegram search should rely on visible captions and the external index, not hidden image metadata.

Other design principles are:

- archive state and analysis state are distinct;
- publication requires raw preservation plus validated metadata;
- each command is idempotent and lease-protected;
- retries are bounded and terminal failures remain visible;
- irreversible external effects occur only after validation;
- storage/provider adapters remain replaceable;
- metadata collection is purpose-limited and provenance is retained.

_Source: [Telegram Bot Platform Developer Terms](https://telegram.org/tos/bot-developers), [AWS transactional-outbox pattern](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html)_

### Scalability and Performance Patterns

At current scale, a Sheet-backed queue and time-driven Apps Script workers provide sufficient load leveling. Webhook intake is decoupled from Groq latency and output publication. Worker batch sizes, trigger frequency, claim leases, and retry schedules protect Groq, Telegram, Drive, and Sheets from bursts.

The system should minimize service calls, batch Sheet reads/writes, keep script locks short, and process a bounded number of rows per execution. Google advises using batch operations and considering a dedicated database as Sheets approaches very large datasets or high-frequency writes.

The evolution path is incremental:

1. **Initial:** Drive + Sheets + Apps Script workers; exact lexical search and small-scale embeddings.
2. **Growth:** PostgreSQL with pgvector for workflow, structured metadata, full-text search, and vectors; retain Drive/object storage for image bytes.
3. **Higher throughput:** Cloud Tasks or Pub/Sub for queueing and Cloud Run/Functions for workers.
4. **Large archive:** managed object storage, dedicated vector indexes where benchmarks justify them, and independently tested backup/restore.

A dedicated vector database is not a substitute for Drive or a transactional workflow store. Its purpose is nearest-neighbor retrieval. For this domain, hybrid search is stronger than vector-only search: exact lexical/OCR/tag matching preserves names, numbers, dates, and literal vocabulary, while embeddings recover conceptually related images.

PostgreSQL plus pgvector is the preferred long-term consolidation because relational workflow state, metadata filters, exact/full-text search, and vector similarity can coexist. pgvector supports exact nearest-neighbor search and approximate HNSW/IVFFlat indexes; approximate indexes trade recall for speed and require careful filtering/tuning.

_Source: [Apps Script best practices](https://developers.google.com/apps-script/guides/support/best-practices), [Google Sheets scaling guidance](https://developers.google.com/apps-script/guides/sheets), [pgvector documentation](https://github.com/pgvector/pgvector), [Microsoft queue-based load leveling](https://learn.microsoft.com/en-us/azure/architecture/patterns/queue-based-load-leveling)_

### Integration and Communication Patterns

The system uses HTTPS point-to-point integrations and a canonical workflow ledger. Large image bytes stay in Drive; workers pass a Drive ID and structured metadata references. This is the Claim Check pattern: the work message carries a pointer to separately durable data rather than duplicating the payload through every stage.

The row state machine functions as an application-level saga/outbox:

- ingestion writes the source and raw-preservation state;
- the analysis worker claims eligible rows and commits validated results;
- the publication worker claims completed metadata and records the output message ID;
- search reads only completed/authorized projections;
- reconciliation repairs uncertain remote-success/local-commit outcomes.

Provider adapters isolate Telegram, Drive, and Groq details from workflow policy. This makes it possible to migrate from Drive to object storage, Sheets to PostgreSQL, or Groq to another vision provider without changing lifecycle invariants.

_Source: [Microsoft reliability pattern catalog](https://learn.microsoft.com/en-us/azure/well-architected/reliability/design-patterns), [AWS transactional-outbox pattern](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html)_

### Security Architecture Patterns

Security uses layered authorization and least privilege:

- authenticate the webhook using a secret suitable for the Apps Script request model;
- authorize every incoming event against the explicit numeric input-group ID;
- publish only to a different explicit output-group ID;
- retain API keys in restricted script-scoped configuration and keep them out of source, Sheets, captions, and logs;
- never log token-bearing Telegram file URLs or base64 image data;
- restrict Apps Script project editors and Drive folder/shared-drive roles;
- use a dedicated organizational owner/shared drive where available;
- disclose that image bytes are sent to Groq and define consent, retention, deletion, and authorized-search policies;
- prohibit sensitive-person inference and broad dataset/model-training reuse.

For school or children's imagery, data minimization is an architectural requirement. Store only metadata needed for legitimate retrieval and operations, and make deletion propagate across Drive, metadata/vector indexes, and Telegram projections according to policy.

_Source: [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html), [Google Cloud security, privacy, and compliance framework](https://docs.cloud.google.com/architecture/framework/security), [Telegram Bot Platform Developer Terms](https://telegram.org/tos/bot-developers)_

### Data Architecture Patterns

The data architecture separates four concerns:

1. **Raw binary:** immutable original in Drive/object storage.
2. **Structured record:** source IDs, status, attempts, captions, tags, OCR, model/prompt versions, checksum, and publication IDs.
3. **Semantic index:** text and/or image embeddings linked by canonical record ID.
4. **User projection:** bounded bilingual Telegram caption and published image.

The vector index is derived and rebuildable. It must never be the sole copy of the metadata or image. A useful long-term PostgreSQL record includes Telegram identifiers, Drive/object ID, bilingual captions/tags, OCR, structured JSON, embedding, analysis/publication states, checksum, model and prompt versions, and timestamps.

Search should be hybrid:

```text
query
  +-> lexical/OCR/tag search
  +-> vector similarity search
  -> merge/rerank
  -> authorization/status filter
  -> Telegram result delivery, with Drive fallback
```

Metadata embedded into an enriched derivative image is optional portability data. External structured metadata remains authoritative because it is queryable, versionable, correctable, and suitable for workflow/audit.

For organizational continuity, shared-drive content is owned by the organization rather than an individual. For truly irreplaceable images, a second independently restorable backup remains necessary because Drive itself permits authorized deletion and has quota/account lifecycle risks.

_Source: [Google Drive shared drives overview](https://developers.google.com/workspace/drive/api/guides/about-shareddrives), [Google Drive files resource](https://developers.google.com/workspace/drive/api/reference/rest/v3/files), [pgvector filtering and indexing](https://github.com/pgvector/pgvector)_

### Deployment and Operations Architecture

Deployment remains a versioned Apps Script web app with bounded time-driven workers. Operations must monitor:

- Telegram webhook pending count and last delivery error;
- raw-preservation failures and missing Drive IDs;
- Drive access, quota, ownership, and sampled checksums;
- Groq rate limits, retries, invalid outputs, and terminal failures;
- expired worker leases and trigger health;
- publication retries, duplicate reconciliation, and output-message IDs;
- Sheet/database growth and search latency;
- backup completion and restoration tests.

Production activation requires a controlled end-to-end proof showing: one accepted input image, one canonical raw object, one workflow record, validated AI metadata, one output publication, successful lexical/semantic retrieval, and Drive fallback delivery. This does not authorize processing real user images until privacy and retention approval exists.

The recommended architecture decision is therefore:

> **Drive original + Sheet workflow/metadata initially + optional embedding index + Telegram searchable projection, orchestrated by Apps Script with Groq as a replaceable enrichment adapter. Evolve to PostgreSQL plus pgvector when scale or search quality justifies it.**

_Source: [Google Cloud reliability framework](https://docs.cloud.google.com/architecture/framework/reliability), [Google Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas)_

## Implementation Approaches and Technology Adoption

### Technology Adoption Strategies

Adoption should be incremental rather than a database/vector-platform rewrite. The first objective is to make the existing Drive/Sheets workflow demonstrably durable and privacy-approved. Semantic search should then be evaluated against realistic bilingual queries. PostgreSQL/pgvector or dedicated queue infrastructure is introduced only when measured scale, contention, authorization, or search-quality requirements exceed Apps Script and Sheets.

The implementation phases are:

1. **Ownership and policy:** establish deployment/Drive ownership, group IDs, privacy approval, retention/deletion rules, and provider data controls.
2. **Harden existing architecture:** make raw preservation, workflow states, metadata validation, retries, and fallback behavior explicit.
3. **Controlled verification:** provider-free tests, Apps Script self-check, synthetic end-to-end test, and failure injection.
4. **Hybrid-search evaluation:** compare lexical-only, vector-only, and combined ranking on approved Arabic/English queries.
5. **Evidence-driven migration:** move workflow/search to PostgreSQL plus pgvector and workers/queues only when thresholds are reached.

Migration must preserve canonical record IDs and support shadow reads, parity checks, and recoverable rollback. Google describes incremental modernization and strangler-style adoption as preferable to unnecessary big-bang replacement.

_Source: [Google Cloud incremental re-architecture guidance](https://cloud.google.com/resources/rearchitecting-to-cloud-native), [Google Cloud migration approaches](https://docs.cloud.google.com/architecture/migration-to-gcp-getting-started)_

### Development Workflows and Tooling

Keep source local and version-controlled. Use `clasp` for synchronization and deployment management, with provider-free checks before push. Google documents Apps Script versions as immutable snapshots and versioned deployments as the appropriate public release mechanism; head deployments are for testing.

Recommended workflow:

1. Inspect current local and remote Apps Script source before editing.
2. Run `node tests/self_check.js` and the Apps Script `selfCheck()` logic in a non-sending context.
3. Review source changes and scan for credentials/token-bearing URLs.
4. Push source with `clasp` only after local checks pass.
5. Create an immutable version with a descriptive release note.
6. Use a test deployment for controlled verification.
7. Redeploy the existing production deployment ID to the approved version, preserving the webhook URL.
8. Verify deployed health, source parity, trigger ownership, webhook information, and fail-closed gates.
9. Preserve the prior known-good version for rollback.

Production changes should separate code publication from activation. Deploying source does not by itself authorize changing Script Properties, installing triggers, enabling Groq/Gemini, or sending Telegram images.

_Source: [Google `clasp` guide](https://developers.google.com/apps-script/guides/clasp), [Apps Script deployments](https://developers.google.com/apps-script/concepts/deployments)_

### Testing and Quality Assurance

Testing is layered:

#### Provider-free local checks

Exercise JSON parsing, Unicode constraints, formula-injection protection, retries, terminal classifications, worker leases, duplicate suppression, metadata limits, semantic ranking, and publication state transitions without live APIs.

#### Apps Script non-sending checks

Verify Script Properties, Sheet headers, configured folder access, group-ID shape, trigger uniqueness/ownership, deployed source, and activation gates. Read-only Telegram calls such as `getMe`, `getChat`, `getChatMember`, and `getWebhookInfo` can verify identity and membership without publishing content.

#### Controlled synthetic end-to-end test

Use approved non-sensitive test images and prove:

- one accepted Telegram update;
- one canonical Drive original;
- one canonical workflow record;
- validated bilingual Groq metadata;
- one output-group publication;
- lexical and semantic retrieval;
- Drive fallback after a simulated failed cached `file_id` send.

#### Failure injection

Test duplicate updates, Drive permission/quota failures, Groq 429/498/5xx and invalid JSON, expired leases, Telegram retry responses, uncertain commits, missing Drive objects, and revoked embedding approval. Every scenario must either recover idempotently or terminate in an operator-visible state.

#### Search-quality evaluation

Maintain an approved bilingual query/image relevance set covering exact vocabulary, synonyms, cross-language concepts, OCR, names, dates, and queries with no lexical overlap. Compare lexical, vector, and hybrid top-k results. Vector-only retrieval is not accepted as a replacement for exact search.

_Source: [Groq API errors](https://console.groq.com/docs/errors), [Groq rate limits](https://console.groq.com/docs/rate-limits), [Apps Script best practices](https://developers.google.com/apps-script/guides/support/best-practices)_

### Deployment and Operations Practices

Before real-data activation, verify the deployment owner can write the Drive folder, Telegram group memberships/permissions are correct, privacy approval exists, provider data controls are configured, and no stale or duplicate managed triggers exist.

Operational monitoring covers:

- Telegram pending webhook updates and last error;
- archive success/failure and records missing Drive IDs;
- Drive quota, access, ownership, and sampled checksum integrity;
- Groq attempts, rate limits, invalid output, and terminal errors;
- trigger execution health and expired leases;
- publication retries, duplicates, and output-message reconciliation;
- semantic-index errors and model/version drift;
- search latency and relevance;
- backup age and restoration tests.

Runbooks must distinguish transient provider errors, terminal credential/configuration errors, privacy authorization blocks, data-integrity failures, and provider outages. Rollback re-points the production deployment to the prior known-good immutable version; activation flags and triggers are reverted separately and explicitly.

Groq states that inference customer data is not retained by default except in limited reliability/abuse circumstances, with configurable Zero Data Retention. The project must verify and document the actual organization settings before approved imagery is sent.

_Source: [Groq security onboarding](https://console.groq.com/docs/production-readiness/security-onboarding), [Groq data controls](https://console.groq.com/docs/your-data), [Apps Script web apps](https://developers.google.com/apps-script/guides/web)_

### Team Organization and Skills

The minimum ownership model includes:

- **Product/archive owner:** defines what must be retained and who may search/delete it.
- **Privacy owner:** approves provider boundaries, consent, retention, residency, and children's/school image policy.
- **Technical operator:** owns Apps Script deployment, credentials, triggers, Drive access, monitoring, and incident response.
- **Reviewer/test owner:** independently checks release evidence and controlled end-to-end behavior.

One person may initially hold more than one operational role, but privacy approval and final release verification should remain explicit. Required skills are Apps Script JavaScript, Telegram Bot API, Drive/Sheets administration, HTTP/API error handling, basic AI-output validation, search evaluation, and credential/privacy operations. PostgreSQL/pgvector and cloud worker skills become necessary only at the migration threshold.

_Source: [Google Cloud security, privacy, and compliance framework](https://docs.cloud.google.com/architecture/framework/security), [Telegram Bot Platform Developer Terms](https://telegram.org/tos/bot-developers)_

### Cost Optimization and Resource Management

Avoid hard-coding current provider prices into architecture. Track the cost drivers:

- accepted images per day and average original byte size;
- Drive growth and backup replication multiplier;
- Groq requests, image/token use, retries, and chosen tier/model;
- embedding generation, re-indexing, and query volume;
- Apps Script URL Fetch, trigger runtime, and execution quotas;
- database/vector/worker infrastructure after migration.

Use configurable daily processing caps, bounded retries, provider project/spend limits, and quota alerts. Generate embeddings once per approved image/model version and rebuild only when the model, source, or indexing policy changes. Batch Sheet operations and avoid unnecessary remote calls. A vector platform is adopted only when measured quality or scale benefits exceed its operational and financial cost.

_Source: [Google Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas), [Groq billing guidance](https://console.groq.com/docs/billing-faqs), [Apps Script best practices](https://developers.google.com/apps-script/guides/support/best-practices)_

### Risk Assessment and Mitigation

| Risk | Consequence | Mitigation |
|---|---|---|
| Telegram-only dependency | Unrecoverable image loss or access loss | Preserve operator-controlled original before analysis |
| Drive owner/folder misconfiguration | Archive ingestion fails | Preflight owner write access; prefer organizational shared drive |
| Groq outage/rate limit | Delayed metadata | Durable pending state, bounded backoff, no source loss |
| Invalid AI metadata | False or unsafe search labels | Strict schema/content validation and fail closed |
| Duplicate delivery/execution | Duplicate files/messages/cost | Stable IDs, locks, leases, idempotent reconciliation |
| Apps Script quota/runtime exhaustion | Backlog and missed processing | Bounded batches, monitoring, queue/worker migration threshold |
| Sheet growth/contention | Slow or unreliable workflow/search | Batch operations; migrate to PostgreSQL at defined thresholds |
| Vector-only retrieval | Missed exact names/dates/OCR or false similarity | Hybrid lexical/vector search and relevance evaluation |
| Secret exposure | Bot/provider compromise | Scoped secret storage, redaction, rotation, restricted editors |
| Unauthorized/sensitive image processing | Privacy/legal harm | Explicit group authorization, consent, minimization, retention/deletion policy |
| Drive as sole backup | Loss after authorized deletion/account issue | Second independently restorable backup for irreplaceable content |
| Provider/model drift | Changed metadata/search behavior | Store model/prompt/index versions and maintain evaluation set |

_Source: [Telegram Bot Platform Developer Terms](https://telegram.org/tos/bot-developers), [Google Drive permissions](https://developers.google.com/workspace/drive/api/guides/manage-sharing), [OWASP Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)_

## Technical Research Recommendations

### Implementation Roadmap

#### Immediate readiness

1. Fix and verify Apps Script-owner access to the configured Drive folder.
2. Confirm numeric input/output chat IDs and bot membership/permissions using non-sending checks.
3. Approve and configure Groq privacy/data controls.
4. Preserve raw images before analysis and represent archive/analysis/publication as distinct states.
5. Complete provider-free and Apps Script self-checks on exact source.

#### Controlled activation

6. Deploy an immutable version without enabling live processing automatically.
7. Run a controlled synthetic image through raw preservation, Groq validation, publication, lexical search, semantic search, and Drive fallback.
8. Inject duplicate/transient/terminal failures and confirm retry/reconciliation behavior.
9. Record evidence and obtain release/privacy sign-off before real images.

#### Operational maturity

10. Add quota/backlog/error/integrity monitoring and runbooks.
11. Establish backup and tested restoration for irreplaceable images.
12. Maintain a bilingual search-quality evaluation set and re-run it when model/prompt/index versions change.
13. Review Sheet and Apps Script scaling metrics periodically.

#### Evolution

14. Migrate to PostgreSQL plus pgvector only when defined thresholds are met.
15. Use dual-write/shadow-read parity checks and a recoverable cutover.
16. Introduce dedicated queues/workers/object storage only when current execution, contention, throughput, or governance evidence requires them.

### Technology Stack Recommendations

- **Now:** Telegram Bot API, Apps Script V8, private Drive folder/shared drive, Google Sheets workflow/catalog, Groq vision metadata, and the existing approved embedding pilot.
- **Search:** hybrid exact lexical/OCR/tag search plus semantic embeddings; vectors remain derived and rebuildable.
- **At scale:** PostgreSQL plus pgvector for workflow, metadata, full-text filters, and vector similarity; Drive or object storage remains the binary source.
- **Workers at scale:** Cloud Tasks/Pub/Sub and Cloud Run/Functions if Apps Script quotas or concurrency become limiting.
- **Archive:** add a second independent backup when images are irreplaceable.

### Skill Development Requirements

- Apps Script deployments, triggers, quotas, locks, and properties;
- Telegram webhook/file/publication semantics and group authorization;
- Drive ownership, permissions, quota, checksum, and restore operations;
- Groq vision, structured-output validation, rate limits, data controls, and model versioning;
- bilingual lexical search and semantic-search evaluation;
- privacy, consent, retention, and incident response for school imagery;
- later: PostgreSQL schema/transactions/full-text search, pgvector indexing, cloud queues, and worker observability.

### Success Metrics and KPIs

- 100% of completed records have a resolvable canonical image object.
- 0 completed records depend solely on Telegram `file_id`.
- 0 duplicate canonical records for repeated updates.
- 100% of published records contain validated bilingual metadata.
- 100% of Groq calls occur after approved raw preservation.
- 0 unauthorized input-group events are archived or analyzed.
- Bounded retry exhaustion always creates an operator-visible terminal state.
- Drive fallback retrieval passes periodically.
- Backup restoration is tested at the agreed interval.
- Search relevance meets agreed top-1/top-5 targets for Arabic and English evaluation queries.
- Deletion requests propagate across storage, metadata, vectors, and Telegram projections.
- Provider and Apps Script usage remain within defined quota/budget thresholds.

# Research Synthesis and Executive Decision

## Executive Summary

Telegram cloud chats give users convenient synchronized access to messages and media, and the Bot API provides reusable file identifiers. Those product features do not constitute an operator-owned permanent archive. Telegram's current Bot Platform Developer Terms state that Bot Platform data is not guaranteed to remain available, uncorrupted, or fit for a purpose, and instruct developers not to assume perpetual availability. A system that cannot accept image loss must therefore retain an independent copy outside Telegram.

Google Drive is not uniquely mandatory, but an independently controlled binary store is. Drive is the best current fit because Apps Script already has native access and the checked-in implementation already copies Telegram images to Drive, performs Groq/Gemini work from Drive blobs, records Drive identifiers in Sheets, and retries Telegram delivery from Drive when a cached `file_id` fails. For organizational continuity, a Workspace shared drive is preferable where available; for irreplaceable images, Drive still requires a second independently restorable backup.

The final architecture separates raw preservation from catalog completion. The immutable source image is preserved first. Groq then produces bilingual captions, vocabulary, OCR, objects, settings, topics, colors, and bounded visual tone. The application validates that output before storing metadata, generating embeddings, and publishing a searchable output-group message. Sheets is adequate for initial workflow coordination and operator visibility; vectors augment search but do not replace storage or transactional state. PostgreSQL plus pgvector is the preferred scaling path because it combines relational workflow, full-text search, metadata filters, and semantic similarity.

### Key Technical Findings

- Telegram `file_id` is an efficient same-bot download/resend handle, not proof of permanent byte custody.
- Telegram `file_unique_id` supports correlation/deduplication but cannot retrieve content.
- Hosted Bot API download links are temporary, hosted downloads are currently limited, and undelivered updates are retained no longer than 24 hours.
- The archive invariant is: **preserve the original before analysis; complete the catalog after validated analysis**.
- Drive owns canonical raw bytes; the metadata ledger owns workflow truth; Telegram is a regenerable user projection.
- Groq and embedding providers are replaceable processors; their outputs are versioned, derived, validated, and rebuildable.
- Hybrid lexical/vector search is required because vectors improve conceptual recall while exact terms, OCR, names, IDs, and dates need lexical matching/filtering.
- The existing modular Apps Script and Sheet-backed workers are appropriate until measured quotas, contention, volume, authorization, or search-quality needs justify migration.
- Privacy approval, retention/deletion policy, provider data controls, and access governance are release prerequisites for real school or children's imagery.

### Strategic Technical Recommendations

1. Retain Drive/object storage as the canonical raw-image layer and never mark a Telegram-only record complete.
2. Represent raw preservation, analysis, indexing, and publication as separate idempotent workflow states.
3. Keep the immutable original and create an optional metadata-enriched derivative rather than rewriting the only source file.
4. Use strict bilingual Groq schema/content validation and fail closed on unsupported claims or malformed output.
5. Keep exact lexical/OCR/tag search and add vectors as a parallel derived index; merge/rerank results.
6. Keep Sheets for the controlled initial rollout, with explicit thresholds for PostgreSQL/pgvector migration.
7. Verify Drive ownership/access, Telegram group identity, trigger ownership, provider data controls, backups, and restoration before activation.

## Table of Contents

1. [Technical Research Introduction and Methodology](#1-technical-research-introduction-and-methodology)
2. [Technical Landscape and Architecture Analysis](#2-technical-landscape-and-architecture-analysis)
3. [Implementation Approaches and Best Practices](#3-implementation-approaches-and-best-practices)
4. [Technology Stack Evolution and Current Trends](#4-technology-stack-evolution-and-current-trends)
5. [Integration and Interoperability Patterns](#5-integration-and-interoperability-patterns)
6. [Performance and Scalability Analysis](#6-performance-and-scalability-analysis)
7. [Security, Privacy, and Compliance Considerations](#7-security-privacy-and-compliance-considerations)
8. [Strategic Technical Recommendations](#8-strategic-technical-recommendations)
9. [Implementation Roadmap and Risk Assessment](#9-implementation-roadmap-and-risk-assessment)
10. [Future Technical Outlook and Innovation Opportunities](#10-future-technical-outlook-and-innovation-opportunities)
11. [Technical Research Methodology and Source Verification](#11-technical-research-methodology-and-source-verification)
12. [Technical Appendices and Reference Materials](#12-technical-appendices-and-reference-materials)
13. [Technical Research Conclusion](#technical-research-conclusion)

## 1. Technical Research Introduction and Methodology

### Technical Research Significance

This bot is not merely forwarding pictures. It is creating a searchable institutional image catalog from user-provided media and AI-derived descriptions. That changes the durability, accuracy, privacy, and recovery requirements. A messaging platform can be the best user interface while still being the wrong system of record. Likewise, an AI model can improve retrieval while remaining unsuitable as an authority for what an image means.

The technical question is therefore a custody and failure-domain question: if a Telegram message, bot, group, account, cached file handle, AI request, or Apps Script execution disappears, can the system still reconstruct the intended archive and search experience? The architecture is acceptable only when the answer is yes for approved, completed records.

_Technical importance: independent custody, reproducible AI derivation, and recoverable search_  
_Business impact: avoids false permanence claims, uncontrolled data loss, and untraceable metadata_  
_Source: [Telegram Bot Platform Developer Terms](https://telegram.org/tos/bot-developers)_

### Technical Research Methodology

- **Scope:** storage, file retrieval, ownership, metadata, search, integration, retries, security, privacy, deployment, scaling, and migration.
- **Primary sources:** official Telegram Bot/API documentation and terms; official Google Drive and Apps Script documentation; official Groq documentation; pgvector project documentation.
- **Repository verification:** checked-in Apps Script functions and README were inspected to trace real image, metadata, embedding, search, retry, and publication paths.
- **Analysis framework:** distinguish explicit guarantees from limitations and architectural inference; map sources of truth, failure boundaries, idempotency, and operational ownership.
- **Time period:** sources reverified on 2026-08-31; provider limits, terms, models, and prices remain changeable and require rechecking before later activation/migration.
- **Execution boundary:** research and documentation do not authorize live triggers, properties, provider calls, Telegram sends, or sensitive-image processing.

### Goals and Achieved Objectives

**Original goal:** determine whether Telegram-native storage can be the durable archive or Google Drive/another external object store is required for permanent retention, stable retrieval, metadata, search, recovery, and operational ownership.

**Achieved objectives:**

- Established from Telegram's own terms that Telegram-only persistence cannot satisfy a permanent archive requirement.
- Distinguished `file_id`, `file_unique_id`, temporary download paths, update delivery, and MTProto file-reference concerns.
- Identified Drive/object storage as the canonical byte layer and clarified its ownership/deletion/backup limits.
- Validated the repository's current hybrid data path and identified Drive access as a live readiness gate.
- Defined an idempotent event/worker state machine with retries, leases, reconciliation, and terminal states.
- Clarified raw preservation before Groq versus completed cataloging after validation.
- Positioned hybrid search and PostgreSQL/pgvector as measured evolution rather than premature replacement.
- Produced phased implementation, testing, privacy, deployment, monitoring, risk, and success criteria.

## 2. Technical Landscape and Architecture Analysis

### Current Target Architecture

```text
Input Telegram group
        |
        v
Apps Script webhook
  authenticate + authorize + deduplicate
        |
        v
Download original once
        |
        +--> Drive raw image (canonical bytes)
        |
        +--> Metadata/workflow record (ANALYSIS_PENDING)
                    |
                    v
              Groq analysis
                    |
                    v
          strict metadata validation
                    |
          +---------+---------+
          |                   |
          v                   v
   lexical/OCR index      vector embedding index
          |                   |
          +---------+---------+
                    v
       Output Telegram searchable projection
```

### Architectural Patterns

- **Serverless modular monolith:** one Apps Script deployment with explicit internal modules.
- **Orchestrated saga/state machine:** archive, enrich, index, publish, and finalize commit separately.
- **Claim Check:** image bytes stay in durable object storage; workers exchange stable object IDs.
- **At-least-once/idempotent processing:** duplicates are expected and neutralized by identifiers, claims, and reconciliation.
- **Stateless workers with persisted leases:** execution loss does not lose workflow progress.
- **Ports and adapters:** Telegram, Drive, Groq, and future database/vector providers remain replaceable.
- **Regenerable projection:** Telegram output can be recreated from canonical bytes and metadata.

_Architectural trade-off: Apps Script/Sheets minimize operational complexity but impose runtime, quota, concurrency, and growth ceilings._  
_Source: [Google Cloud Well-Architected Framework](https://docs.cloud.google.com/architecture/framework), [Microsoft compensating transaction](https://learn.microsoft.com/en-us/azure/architecture/patterns/compensating-transaction)_

### Source-of-Truth Boundaries

| Data | Initial authority | Rebuildable projection/derivative |
|---|---|---|
| Original image bytes | Drive/object storage | Telegram publication, thumbnails, enriched derivative |
| Workflow and provenance | Sheet, later PostgreSQL | dashboards/reports |
| AI metadata | Validated versioned metadata record | captions, tags, Drive properties |
| Embeddings | Derived embedding index | fully rebuildable from approved source/model policy |
| User-facing catalog | Telegram output group | rebuildable from archive and metadata |

## 3. Implementation Approaches and Best Practices

### Current Implementation Method

The repository already follows much of the target pattern: Telegram `getFile` download, Drive file creation, Sheet records, Groq analysis from Drive blobs, strict bilingual metadata normalization, leased retry workers, publication states, semantic-pilot embeddings, lexical fallback, and Drive re-upload when cached Telegram sending fails.

Implementation should preserve those invariants while clarifying separate archive and analysis statuses, adding integrity metadata such as checksum/MIME/size, and ensuring no publication can bypass raw preservation plus validated enrichment.

### Quality and Release Practice

- Provider-free local self-checks before remote writes.
- Apps Script non-sending configuration and schema verification.
- Immutable versioned deployments, with test deployment before production redeploy.
- Controlled synthetic image proof and failure injection.
- Independent review of exact deployed source and captured evidence.
- Rollback of code version separated from rollback of activation properties/triggers.

_Source: [Apps Script deployments](https://developers.google.com/apps-script/concepts/deployments), [Google `clasp`](https://developers.google.com/apps-script/guides/clasp)_

## 4. Technology Stack Evolution and Current Trends

### Recommended Current Stack

- JavaScript on Apps Script V8.
- HTTPS Telegram Bot API and Groq API.
- Private Drive folder or organization-owned shared drive for raw bytes.
- Google Sheets for low-volume workflow and operator-visible metadata.
- Groq vision for constrained bilingual metadata and OCR.
- Existing approved embedding provider/pilot for semantic evaluation.
- Telegram output group for visible keyword search and image delivery.

### Evolution Strategy

Sheets remains acceptable while volume and contention are low. Vectors are added as a parallel, derived search path. When defined thresholds are exceeded, migrate metadata/workflow/search to PostgreSQL plus pgvector, retaining object storage and Telegram projections. pgvector supports exact and approximate nearest-neighbor search and hybrid use with PostgreSQL full-text search.

_Source: [Google Sheets scaling guidance](https://developers.google.com/apps-script/guides/sheets), [pgvector](https://github.com/pgvector/pgvector)_

## 5. Integration and Interoperability Patterns

### API and Data Flow

Telegram webhook JSON enters Apps Script; image bytes are downloaded through Telegram's file endpoint; Drive/Sheets use authorized Apps Script services; Groq receives prompt plus base64 image data and returns JSON-mode output; Telegram publication uses structured Bot API requests. Stable IDs connect each boundary.

### Reliability Contract

- Deduplicate Telegram `update_id` before effects.
- Preserve raw bytes before remote AI work.
- Use short locks for Sheet claims and persistent leases for network work.
- Retry only transient classes with bounded delay/jitter and provider `retry_after` where supplied.
- Fail closed on credentials, permissions, invalid metadata, privacy blocks, and exhausted attempts.
- Reconcile uncertain remote success before repeating publication/upload.
- Keep terminal failures visible for human repair.

_Source: [Telegram `setWebhook`](https://core.telegram.org/bots/api#setwebhook), [Groq API errors](https://console.groq.com/docs/errors), [Drive upload safe retry](https://developers.google.com/workspace/drive/api/guides/manage-uploads)_

## 6. Performance and Scalability Analysis

### Current Constraints

- Apps Script execution and daily service quotas.
- Telegram hosted `getFile` download and update-retention limits.
- Groq request/rate/model limits.
- Sheet scan, lock, and cell-growth costs.
- Drive storage quota and permission/ownership operations.

### Optimization

- Keep webhook work bounded and defer AI/publication to workers.
- Batch Sheet reads/writes and cap claims per execution.
- Generate embeddings once per approved image/model version.
- Cache only non-authoritative derived data.
- Monitor backlog, latency, quota, and terminal states.
- Compare approximate vector recall against exact results before index tuning.

### Migration Thresholds

Move workflow/search to a database/queue when recurring contention, execution overruns, high-frequency writes, authorization needs, unacceptable search latency, or archive/search volume are demonstrated. Avoid a migration based solely on theoretical scale.

_Source: [Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas), [Apps Script best practices](https://developers.google.com/apps-script/guides/support/best-practices), [pgvector performance guidance](https://github.com/pgvector/pgvector)_

## 7. Security, Privacy, and Compliance Considerations

### Security Controls

- Restrict Apps Script editors and Drive roles.
- Keep bot/provider secrets outside source and redact token-bearing URLs.
- Authenticate webhook requests and separately authorize explicit input/output chat IDs.
- Use organization/project-specific provider keys and documented rotation/revocation.
- Store minimum necessary metadata; validate and bound all model output.
- Keep image bytes private; do not create public Drive links for AI processing.
- Audit deletion across raw objects, metadata, embeddings, and Telegram projections.

### Privacy and Provider Boundary

Images sent to Groq cross a provider boundary. Groq currently documents default inference-data behavior and optional Zero Data Retention controls, but the actual organization settings, residency implications, consent, and legal basis must be approved before real school/children images. Telegram's developer terms also impose purpose limitation and deletion obligations.

The system must not infer identity, emotion, relationships, ethnicity, health, religion, intent, or other unsupported/sensitive personal traits. Visual tone remains restricted to observable non-personal composition qualities.

_Source: [Groq data controls](https://console.groq.com/docs/your-data), [Groq security onboarding](https://console.groq.com/docs/production-readiness/security-onboarding), [Telegram Bot Platform Developer Terms](https://telegram.org/tos/bot-developers), [OWASP Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)_

## 8. Strategic Technical Recommendations

### Decision Framework

| Question | Decision |
|---|---|
| Can Telegram be the only permanent archive? | No |
| Is Google Drive uniquely required? | No; independent operator-controlled bytes are required |
| Is Drive the best current fit? | Yes, contingent on verified owner access and governance |
| Should Groq run before the original is preserved? | No |
| Should Groq run before catalog completion/publication? | Yes |
| Should metadata modify the only original? | No; preserve original and optionally create a derivative |
| Should vectors replace Drive? | No |
| Should vectors replace the workflow ledger? | No |
| Should vectors augment search? | Yes |
| Should Sheets be replaced immediately? | No |
| Preferred database evolution | PostgreSQL plus pgvector at measured thresholds |

### Differentiating Capability

The valuable capability is not generic AI tagging. It is a governed bilingual archive where each result can be traced to an immutable source, regenerated with a versioned model/prompt, found by exact Arabic/English vocabulary or semantic concepts, and delivered through Telegram with a separate recovery path.

## 9. Implementation Roadmap and Risk Assessment

### Phased Roadmap

**Phase A — Prerequisites:** fix Drive access, confirm groups/bot permissions, assign owners, approve privacy/provider controls, define retention/deletion, and establish backup target.

**Phase B — Harden:** distinguish archive/analysis/publication states; add integrity/provenance fields; ensure raw-first invariants and fail-closed gates.

**Phase C — Verify:** run provider-free checks, Apps Script self-check, non-sending live identity/config checks, synthetic end-to-end test, failure injection, fallback, and restore test.

**Phase D — Controlled activation:** deploy immutable version, enable only approved modes, process bounded approved inputs, monitor backlog/errors/quota, and retain rollback path.

**Phase E — Search evaluation:** maintain bilingual relevance set; compare lexical, vector, and hybrid top-k quality; version embedding/index policy.

**Phase F — Scale when proven:** dual-write/shadow-read PostgreSQL/pgvector migration; parity checks; reversible cutover; dedicated queue/workers/object storage only if evidence requires them.

### Top Risks

The principal risks are Telegram-only dependency, Drive ownership/permission failure, privacy violations, invalid AI metadata, duplicate external effects, Apps Script quota/backlog, Sheet contention, vector-only retrieval errors, credential exposure, model drift, and untested backup recovery. Each is mitigated through the source-of-truth separation, explicit states, strict validation, idempotency, access governance, hybrid search, versioning, monitoring, and restore testing documented above.

## 10. Future Technical Outlook and Innovation Opportunities

### Near-Term

- Complete safe activation and reliability evidence.
- Improve bilingual prompt/schema quality and search evaluation.
- Add optional checksum-backed derivative/sidecar metadata.
- Introduce hybrid rank fusion after measured lexical/vector comparison.

### Medium-Term

- PostgreSQL/pgvector migration for transactional workflow and hybrid search.
- Dedicated object storage and second-region/provider backup where warranted.
- Queue-based workers and richer observability at higher throughput.
- Authorized search filters, retention automation, and auditable deletion workflows.

### Long-Term

- Model/provider portability with re-index pipelines.
- Image and text embeddings with benchmarked reranking.
- Assisted human metadata correction and relevance feedback without using private archives as unauthorized training datasets.
- Formal archive governance, disaster recovery objectives, and periodic integrity attestations.

All future adoption remains subject to measured need, privacy approval, current provider terms, and controlled migration evidence.

## 11. Technical Research Methodology and Source Verification

### Primary Sources

- [Telegram Bot Platform Developer Terms](https://telegram.org/tos/bot-developers)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Telegram Bots FAQ](https://core.telegram.org/bots/faq)
- [Telegram file references](https://core.telegram.org/api/file-references)
- [Telegram Privacy Policy](https://telegram.org/privacy)
- [Google Drive files and ownership](https://developers.google.com/workspace/drive/api/guides/about-files)
- [Google Drive shared drives](https://developers.google.com/workspace/drive/api/guides/about-shareddrives)
- [Google Drive deletion](https://developers.google.com/workspace/drive/api/guides/delete)
- [Apps Script quotas and best practices](https://developers.google.com/apps-script/guides/services/quotas)
- [Apps Script deployments and `clasp`](https://developers.google.com/apps-script/concepts/deployments)
- [Groq vision, errors, rate limits, security, and data controls](https://console.groq.com/docs/vision)
- [pgvector](https://github.com/pgvector/pgvector)

### Quality Assurance and Limitations

Claims were classified as explicit guarantees, explicit limitations, or architectural inference. Current technical/platform claims were verified live on 2026-08-31 and cross-checked where consequential. Repository observations came from the checked-in Apps Script and README.

The research does not include a completed live image ingestion/publication/restore test after the final architecture decision. Current account quotas, exact Groq model permissions/rates, Drive folder ownership, privacy approval, Telegram group IDs/memberships, and trigger ownership are environment-specific and must be verified at activation time. Exa discovery was unavailable because no Exa credential/client was configured; official-domain web research and an independent primary-source sidecar were used instead.

## 12. Technical Appendices and Reference Materials

### Canonical Record Requirements

At minimum retain: canonical record ID, Telegram input update/chat/message/file identifiers, uploader time/caption as permitted, Drive/object ID, MIME type, byte size, checksum, archive state/error, analysis state/attempts/model/prompt version, validated bilingual metadata/OCR, embedding model/version/state, publication state/output message ID, retention/deletion state, and UTC timestamps.

### Completion Invariants

- No AI call without an approved, resolvable raw object.
- No completed archive without canonical bytes and durable provenance.
- No output publication without validated required metadata.
- No semantic result from revoked, stale-model, malformed, missing-source, unauthorized, or incomplete records.
- No duplicate canonical effect from repeated update/worker execution.
- No claim of backup without a tested independent restoration path.

### Search Evaluation Dimensions

- Arabic and English exact terms.
- Synonyms and cross-language concepts.
- OCR and visible text.
- Names, dates, numbers, and identifiers.
- Conceptual queries with no lexical overlap.
- Top-1/top-5 relevance, false positives, no-result rate, latency, and correction rate.

### Related Project Evidence

The primary-source evidence sidecar is stored beside this report as `sources-telegram-storage-primary-evidence-2026-08-31.md`. The repository README documents current activation gates and live-test expectations. The Apps Script source contains the concrete Drive ingestion, Groq validation, worker lease/retry, semantic-pilot, hybrid fallback, and self-check implementation referenced throughout this analysis.

## Technical Research Conclusion

### Summary of Key Findings

The bot cannot responsibly promise permanent storage while relying only on Telegram. The correct design preserves an immutable operator-controlled image copy immediately, then treats AI metadata and vectors as validated, versioned, rebuildable derivatives. Telegram remains the strongest user interface for the intended users, while Drive/object storage and the metadata workflow provide custody and recovery.

The current Apps Script/Drive/Sheets implementation is a sound initial architecture after its Drive access, privacy, activation, and end-to-end recovery gates are verified. Vector search is valuable but should augment exact lexical/OCR/tag search. PostgreSQL plus pgvector is the preferred measured evolution, not an immediate prerequisite.

### Strategic Impact

This decision minimizes avoidable infrastructure while preventing a false archive guarantee. It preserves a clean path from the current proof of concept to a governed, scalable bilingual image intelligence system without binding custody to Telegram or search quality to a single AI/vector provider.

### Next Technical Actions

1. Resolve and verify Apps Script-owner Drive access.
2. Confirm input/output group identities and bot memberships using non-sending checks.
3. Obtain privacy/provider approval and verify Groq data controls.
4. Recheck exact source, run provider-free and Apps Script self-checks, and deploy an immutable version if changes are required.
5. Run one controlled synthetic end-to-end image with archive, enrichment, publication, lexical/vector search, Drive fallback, and restoration evidence.
6. Activate real processing only after explicit approval of the captured evidence and privacy boundary.

---

**Technical Research Completion Date:** 2026-08-31  
**Research Period:** current comprehensive technical analysis  
**Source Verification:** current official technical sources with explicit limitations documented  
**Technical Confidence:** High for the architecture decision; live operational readiness remains unverified until controlled activation evidence exists

_This document is the authoritative project research reference for Telegram-native storage versus an independent durable image archive and the associated AI/search architecture._
