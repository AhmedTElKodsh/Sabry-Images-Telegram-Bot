---
title: "School Images Telegram Bot Semantic Search"
status: final
created: 2026-08-06
updated: 2026-08-06
---

# PRD: School Images Telegram Bot Semantic Search

## 0. Document Purpose

This PRD defines the product requirements for adding controlled semantic photo retrieval to the existing Telegram school-image archive. It is for the product owner, school privacy owner, developer, and operator. Requirements describe observable capabilities; provider and storage mechanisms are retained in [addendum.md](addendum.md).

## 1. Vision

Teachers continue posting photos and short messages in their existing Telegram group. The system preserves the photo and its surrounding context, then lets authorized staff find it using a remembered topic, synonym, language variant, or visible element rather than the exact original caption.

The first release proves retrieval quality and operational safety on a small approved pilot. It does not trade school-photo privacy for convenience: free-tier AI processing is restricted to synthetic or properly de-identified images, and real school or children photos require a paid, privacy-approved provider boundary before they can enter semantic indexing.

## 2. Target Users

### 2.1 Jobs To Be Done

- A **Teacher** wants normal Telegram posting to create a searchable record without extra cataloguing work.
- An **Authorized Searcher** wants to describe a remembered subject in Arabic or English and receive the closest photos first.
- An **Operator** wants failed enrichment to be visible, retryable, and auditable without duplicating records or overwriting human work.
- A **Privacy Owner** wants AI processing to fail closed until the dataset and provider boundary are approved.

### 2.2 Non-Users in v1

Students, parents, public users, and users from non-allowlisted chats cannot search or administer the Photo Archive.

### 2.3 Key User Journeys

- **UJ-1. Mariam archives a classroom activity without changing her routine.** Mariam, a Teacher, posts a photo with a caption and a short related line in the School Group. The Bot acknowledges Telegram promptly, stores one Photo Record with the best available image and Message Context, and queues only approved optional enrichment. If Telegram redelivers the update, no duplicate Photo Record is created.
- **UJ-2. Omar finds a farm photo using a related idea.** Omar, an Authorized Searcher, privately sends `/search farm` or an Arabic equivalent. The Bot verifies his chat, compares the Search Query with approved Indexed Photos, and sends at most five Ranked Results, closest first. A photo containing a farmer, horse, and sheep can rank even if its original caption did not contain the exact query word.
- **UJ-3. Salma runs and audits the pilot.** Salma, the Operator, explicitly enables the Semantic Pilot after the Privacy Owner approves a synthetic or properly de-identified Pilot Dataset. She can see which Photo Records are pending, ready, or failed; retry failures; and verify that disabling approval stops new external processing without removing archived source data.

## 3. Glossary

- **Authorized Searcher** — a private Telegram chat allowed to issue retrieval commands.
- **Bot** — the existing Telegram bot and its Google Apps Script runtime.
- **Indexed Photo** — an approved Photo Record with a ready Embedding.
- **Embedding** — a numeric representation used only to compare semantic similarity.
- **Message Context** — the Telegram caption and qualifying adjacent one-line message associated with a photo.
- **Photo Archive** — the Drive files and Sheets records owned by the system.
- **Photo Record** — the single metadata record keyed to one archived Telegram photo.
- **Pilot Dataset** — synthetic or properly de-identified images listed in a versioned approval manifest with dataset identifier, Photo Record identifiers, approver, and approval time.
- **Pilot Query Set** — preregistered, non-sensitive Search Queries approved for free-tier text embedding during evaluation.
- **Privacy Owner** — the school representative accountable for approving data use and provider terms.
- **Ranked Result** — an authorized photo returned with its position determined by semantic similarity.
- **Search Query** — non-empty text submitted through the private `/search` command.
- **Semantic Pilot** — the opt-in, non-production evaluation of embedding-based retrieval.

## 4. Features

### 4.1 Telegram Photo Capture

**Description:** The Bot converts a Telegram photo post and its Message Context into one durable Photo Record. This preserves the current teacher workflow and realizes UJ-1.

#### FR-1: Capture photo and provenance

The Bot must store the highest-resolution available Telegram photo with its caption, chat identifier, message identifier, media-group identifier when present, sender provenance, Telegram file identifier, archive file reference, and timestamps.

**Consequences (testable):**

- A supported photo update creates one Photo Record and one archived image.
- Redelivery of the same Telegram update creates neither a second Photo Record nor a second archived image.
- Stored user text cannot be interpreted as a spreadsheet formula.

#### FR-2: Associate adjacent text

The Bot must associate a qualifying one-line message immediately before or after a photo when it is from the same sender, is the nearest eligible message within the configured time window, or directly replies to that photo message.

**Consequences (testable):**

- The caption, eligible before-line, and eligible after-line are stored separately when present.
- Unrelated, multiline, or out-of-window text is not silently attached.
- Each photo in a Telegram album remains a separate Photo Record with the shared media-group identifier; album-level grouping and deduplicated result presentation are deferred.

### 4.2 Privacy-Controlled Semantic Pilot

**Description:** The Semantic Pilot is disabled by default and external embedding requests fail closed unless an Operator explicitly enables it for a Privacy-Owner-approved Pilot Dataset. This realizes UJ-3.

#### FR-3: Enforce explicit pilot approval

The Bot must refuse image-embedding requests unless the Semantic Pilot is enabled and the Photo Record appears in the Pilot Dataset manifest. The Bot must refuse query-embedding requests unless the normalized Search Query appears in the Pilot Query Set.

**Consequences (testable):**

- Missing, false, expired, or malformed approval configuration prevents external embedding requests.
- Every external image request maps to one approved Photo Record identifier and records the Pilot Dataset identifier, approver, and approval time.
- A Search Query outside the Pilot Query Set remains local and uses lexical fallback.
- Enabling the Semantic Pilot does not automatically enqueue existing Photo Archive images.
- Disabling approval stops new embedding requests while preserving Photo Records and existing Embeddings.

**Out of Scope:** Approval is not a substitute for legal, school-policy, or contractual review.

#### FR-4: Prevent biometric use

The product must not perform face recognition, identity inference, biometric indexing, sensitive-trait inference, or student profiling. Generic observable categories explicitly requested for discovery, including `child`, `woman`, `man`, `person`, and `people`, are allowed only as non-identifying visible-element labels.

**Consequences (testable):**

- No user command or indexing field accepts or returns a person identity or sensitive trait inferred from an image.
- Product documentation and generated prompts do not request facial identity.

### 4.3 Idempotent Semantic Index

**Description:** The Bot creates and tracks one model-specific Embedding per approved Photo Record without affecting optional human-readable enrichment. This realizes UJ-2 and UJ-3.

#### FR-5: Create an image Embedding

The Operator can request embedding for an approved Photo Record outside the Telegram webhook path.

**Consequences (testable):**

- A successful request stores the Photo Record identifier, Pilot Dataset identifier, approval provenance, model identifier, vector dimensions, Embedding, status, and update time.
- A repeated request for the same Photo Record and model updates the same index entry rather than adding a duplicate.
- A malformed or empty provider response is recorded as failed and never marked ready.

#### FR-6: Expose retryable indexing state

The Operator can distinguish pending, ready, and failed index entries and retry failed entries.

**Consequences (testable):**

- A failed request records a bounded error message and attempt count.
- A retry never deletes the underlying Photo Record or manual metadata.
- Provider credentials and raw image bytes are not written to status or error cells.

#### FR-7: Isolate model spaces

The Bot must compare only Embeddings created by the same model and dimensions as the Search Query.

**Consequences (testable):**

- Incompatible index entries are skipped rather than scored.
- A model change requires explicit re-indexing; incompatible vectors are not silently reused.

### 4.4 Authorized Ranked Retrieval

**Description:** An Authorized Searcher uses the current private command interface to retrieve Ranked Results. Semantic ranking is the primary pilot signal; existing lexical matching remains the safe fallback. This realizes UJ-2.

#### FR-8: Authorize every search

The Bot must reject search commands from chats outside the configured allowlist before reading or sending Photo Archive content.

**Consequences (testable):**

- An unauthorized chat receives no archived photo or archive metadata.
- Authorization applies equally to lexical and semantic retrieval paths.

#### FR-9: Rank by semantic similarity

For a non-empty Search Query in the Pilot Query Set, the Bot must create a compatible query Embedding, compute cosine similarity against eligible Indexed Photos, and return up to five Ranked Results in descending similarity. Other Search Queries use lexical fallback.

**Consequences (testable):**

- Identical vectors score higher than orthogonal vectors.
- Zero-length, non-finite, malformed, or dimension-mismatched vectors are excluded without failing the whole search.
- Ties are deterministic.
- The response never exceeds five photos.

#### FR-10: Preserve a usable fallback

If the Semantic Pilot is disabled, unavailable, or has no eligible Indexed Photos, the Bot must use the existing lexical ranking rather than exposing a provider error to the Authorized Searcher.

**Consequences (testable):**

- A provider timeout or malformed query Embedding does not prevent lexical results.
- Semantic failure does not enqueue image processing or mutate Photo Records.

### 4.5 Independent Readable Enrichment

**Description:** Optional AI-generated bilingual tags and captions help humans inspect records but are not required for semantic ranking.

#### FR-11: Preserve enrichment independence

The Bot may add Arabic and English AI tags and captions without overwriting manual tags, and semantic retrieval must remain operable when this enrichment is disabled or failed.

**Consequences (testable):**

- Manual tags remain unchanged after enrichment and retry.
- Disabling the readable-enrichment provider does not disable a ready Semantic Pilot.

## 5. Constraints and Guardrails

### 5.1 Privacy and Security

- **NFR-1:** Free-tier external AI requests must contain only Pilot Dataset images or Pilot Query Set text.
- **NFR-2:** Real school or children photos must not be processed until the Privacy Owner approves a paid provider boundary and applicable policy, retention, residency, and consent requirements.
- **NFR-3:** API keys and bot tokens must remain in Script Properties and must never appear in Sheet cells, logs, chat replies, or source control.
- **NFR-4:** Photo retrieval must remain private-chat allowlist controlled.
- **NFR-5:** Deletion and access requests must be handled against the Photo Archive and its corresponding index entry; the pilot must document and exercise this process before live approval.

### 5.2 Performance and Reliability

- **NFR-6:** Telegram webhook acknowledgement must not wait for external image-enrichment requests.
- **NFR-7:** Warm `/search` median response time must be at most two seconds under the pilot load of 100 Indexed Photos, excluding Telegram delivery latency.
- **NFR-8:** One failed provider call must not corrupt other Photo Records or stop later retryable work.
- **NFR-9:** External responses, stored vectors, user commands, and Sheet values must be validated at their trust boundaries.

### 5.3 Observability and Cost

- **NFR-10:** Each index entry must expose model, dimensions, status, attempt count, last update, and bounded last error.
- **NFR-11:** The pilot must record image-embedding requests and query-embedding requests sufficiently to report actual provider usage and cost per 1,000 indexed images without logging image content or secrets.
- **NFR-12:** No vector database or new hosted service is introduced unless measured scale or latency violates NFR-7.

## 6. Non-Goals

- Public, parent, or student search access.
- Face recognition, person identification, biometric inference, or student profiling.
- A vector database, public portal, mobile application, or complex administration UI.
- Automatic indexing of the existing live Photo Archive.
- Treating synthetic/local success as approval for real school data.
- Replacing Telegram, Drive, Sheets, or the existing optional readable-enrichment workflow.

## 7. MVP Scope

### 7.1 In Scope

- Existing Telegram capture, Drive archive, Sheets metadata, private authorization, and optional readable enrichment.
- Explicit free-tier Pilot Dataset approval gate.
- Model-specific image and text Embeddings stored with operational status.
- Exact cosine ranking over at most 100 Indexed Photos.
- Lexical fallback and at most five returned photos.
- One runnable local self-check covering privacy gating and ranking edge cases.

### 7.2 Out of Scope for MVP

- Real school or children images through the free tier.
- Background bulk migration of existing records.
- Approximate-nearest-neighbor indexing or a managed vector store.
- Formal production SLA or disaster-recovery commitment.

## 8. Success Metrics

The evaluation set contains 50–100 Pilot Dataset images and 15–20 representative Arabic and English Search Queries, with relevance judgments recorded before comparing systems.

**Primary**

- **SM-1:** Relevant-in-top-five rate — at least 90% of evaluation queries return one relevant photo in the first five. Validates FR-5, FR-7, and FR-9.
- **SM-2:** Semantic gain — semantic nDCG@10 exceeds the existing lexical baseline by at least 0.10 on the preregistered synonym, concept, and visible-element evaluation. Validates FR-9 and FR-10.
- **SM-3:** Privacy enforcement — zero unauthorized retrievals, zero free-tier image requests outside the Pilot Dataset, zero free-tier text requests outside the Pilot Query Set, and a prompt/schema inspection confirming no biometric or sensitive-trait request. Validates FR-3, FR-4, and FR-8.

**Secondary**

- **SM-4:** Warm search latency — median at most two seconds at 100 Indexed Photos. Validates NFR-7.
- **SM-5:** Index integrity — zero duplicate entries for the same Photo Record and model; all failed calls remain visible and retryable. Validates FR-5 and FR-6.
- **SM-6:** Operational drill — delete, restore, disable, and re-index exercises complete without orphaned searchable entries or lost source records. Validates FR-3, FR-6, and NFR-5.
- **SM-7:** Evaluation readiness — every approved evaluation image is ready or explicitly recorded as failed before retrieval metrics are calculated; no silent omissions are allowed. Validates FR-5 and FR-6.

**Counter-metrics**

- **SM-C1:** False-positive top result rate must not exceed 20%, preventing recall improvements from hiding poor first-result precision.
- **SM-C2:** Arabic-versus-English relevant-in-top-five gap must not exceed 10 percentage points, so the combined score cannot hide language bias.
- **SM-C3:** Provider failure rate must not exceed 5%; actual request usage and cost per 1,000 indexed images must be reported.

## 9. Stakeholders and Approval Gates

- The **Product Owner** accepts pilot scope and evaluation queries.
- The **Privacy Owner** approves the Pilot Dataset before free-tier processing.
- The **Operator** confirms configuration, runs the self-check, and records provider failures and usage.
- Real school data remains blocked until the Privacy Owner approves the paid provider terms and the live-data operating procedure.

## 10. Risks and Mitigations

- **Sensitive imagery sent to a free tier:** fail-closed approval plus no automatic backlog indexing.
- **Semantic false positives:** capped results, relevance evaluation, and visible captions/context for human confirmation.
- **Arabic quality gap:** bilingual evaluation and separately reported language metrics.
- **Provider outage or malformed output:** strict validation, recorded failure, retry, and lexical fallback.
- **Sheet-based linear scan becomes slow:** cap the pilot at 100 Indexed Photos and add a vector store only after measured failure of the latency target.
- **Model upgrade corrupts ranking:** store model and dimensions, isolate model spaces, and require re-indexing.

## 11. Open Questions

No phase-blocking product questions remain for the synthetic/de-identified pilot. The numerical pilot thresholds above are the preregistered go/no-go rule. Live-data approval criteria must be defined with the Privacy Owner before any real school imagery is enabled.

## 12. Assumptions Index

- No unconfirmed assumptions are required for the pilot. The dataset boundary, provider tier, existing platform, result cap, and staged upgrade were supplied or established during the preceding product discussion.

## 13. Brownfield Delivery Delta

| Requirement | Current state | Delivery treatment |
|---|---|---|
| FR-1 | Existing | Preserve and regression-check. |
| FR-2 | Existing with caption/adjacent-line limitation | Correct separate context storage in a dedicated follow-up slice. |
| FR-3–FR-7 | New | Implement for the Semantic Pilot. |
| FR-8 | Existing | Preserve and regression-check. |
| FR-9 | New | Implement for the Semantic Pilot. |
| FR-10 | Existing lexical path; new fallback routing | Preserve lexical ranking and add semantic fallback routing. |
| FR-11 | Existing | Preserve and regression-check. |
