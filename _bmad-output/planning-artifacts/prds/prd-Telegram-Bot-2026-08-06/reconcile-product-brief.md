# Input Reconciliation: Product Brief

## Inputs compared

- `briefs/brief-Telegram-Bot-2026-08-06/brief.md`
- `briefs/brief-Telegram-Bot-2026-08-06/addendum.md`
- `prds/prd-Telegram-Bot-2026-08-06/prd.md`
- `prds/prd-Telegram-Bot-2026-08-06/addendum.md`

## Reconciliation verdict

The PRD and its addendum preserve the product brief's intended pilot, privacy boundary, user workflow, semantic-search behavior, operational safeguards, and deliberate infrastructure limits. No conflicting product decision was found. Two minor completeness gaps remain: explicit cost reporting and an evaluation-corpus indexing-readiness gate.

## Coverage map

| Product brief input | PRD destination | Result |
|---|---|---|
| Teachers keep posting photos, captions, and adjacent one-line context in Telegram | Vision; UJ-1; FR-1; FR-2 | Covered, including separate caption/context storage, provenance, and idempotent capture. |
| Authorized staff search by synonym, topic, language variant, or visible image element | Vision; UJ-2; FR-8; FR-9 | Covered, including Arabic/English queries, authorization, cosine ranking, and five-result cap. |
| A `farm` query can retrieve a farmer/horse/sheep image without the exact word | UJ-2; FR-9; SM-2 | Covered as an explicit semantic-search outcome and evaluation category. |
| Gemini multimodal embeddings are independent from optional Groq bilingual tags/captions | FR-5; FR-9; FR-11; PRD addendum | Covered; semantic retrieval remains operable when readable enrichment is disabled or failed. |
| Synthetic or properly de-identified free-tier pilot only; real school/children imagery stays blocked pending a paid privacy-approved boundary | Vision; FR-3; NFR-1; NFR-2; Stakeholder Gates; Non-Goals | Covered and strengthened with fail-closed configuration and approval ownership. |
| Highest-quality photo plus Telegram/album/message/sender/chat/time/Drive provenance | FR-1 | Covered. |
| Duplicate Telegram delivery creates neither duplicate photo nor embedding records | FR-1; FR-5; SM-5 | Covered through capture idempotency and one model-specific index entry per Photo Record. |
| Failed enrichment is visible and retryable without replacing manual tags | FR-6; FR-11; SM-5 | Covered. |
| Delete, restore, disable, and re-index drills do not leave orphaned searchable records | NFR-5; SM-6 | Covered as a pilot operating requirement and success metric. |
| 50-100 approved images, 15-20 bilingual queries, top-five relevance, nDCG@10 gain, two-second warm median, and language/precision/failure counter-metrics | NFR-7; MVP Scope; Success Metrics | Covered, apart from the cost-reporting gap below. |
| Exact cosine scan in Sheets; no vector database or new hosted service until measured scale/latency requires it | NFR-12; MVP Scope; Risks; PRD addendum | Covered. |
| Image embedding work stays outside the Telegram webhook | FR-5; NFR-6; PRD addendum | Covered. |
| Store record/model/dimensions/status/attempts/error and re-index across model-space changes | FR-5; FR-6; FR-7; NFR-10; PRD addendum | Covered. |
| No face recognition, identity inference, biometric indexing, or profiling | FR-4; Non-Goals | Covered. |
| No public UI, mobile app, complex admin UI, automatic live-archive migration, or production approval from synthetic/local tests | Non-Goals; MVP Out of Scope | Covered. |

## Gaps to resolve before finalization

### G1 - Actual API cost is no longer an explicit counter-metric

The brief requires actual API cost to be tracked. The PRD instead requires request/usage recording in NFR-11 and reports "actual request usage" in SM-C3. Usage supports later cost calculation, but it does not require the pilot report to apply provider pricing and present actual cost. Restore the explicit cost counter-metric or state that zero/free-tier cost is the measured value for this pilot.

### G2 - No explicit indexing-readiness gate for the approved evaluation corpus

The brief says an embedding is created for each approved pilot image. FR-5 and FR-6 define per-record request, state, and retry behavior, but the PRD does not require the evaluation corpus to reach a known indexing state before retrieval metrics are calculated. Add a pilot-readiness rule requiring every image included in the evaluation denominator to be `ready`, or explicitly accounted for as failed and excluded under a documented rule, before baseline-versus-semantic scoring begins.

## Conflicts

None. The PRD adds useful precision around malformed vectors, deterministic ties, spreadsheet-formula safety, credential handling, and lexical fallback without changing the brief's product direction.

## Qualitative ideas retained

The PRD preserves the brief's key product feel: teachers do not adopt a new upload workflow; authorized staff search by remembered meaning rather than catalog terminology; readable enrichment remains inspectable but nonessential; and the pilot is a proof of usefulness and safety rather than a disguised production launch.
