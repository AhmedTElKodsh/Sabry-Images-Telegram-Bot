# PRD Quality Review — School Images Telegram Bot Semantic Search

## Overall verdict

The PRD is coherent, appropriately scoped for a brownfield pilot, and substantially more testable than a typical early draft. It is not yet green-light ready: the free-tier boundary does not fully govern query text, the approval mechanism cannot yet prove per-record Pilot Dataset membership, and the semantic-win decision rule remains subjective.

## Decision-readiness — adequate

The document makes real decisions: free-tier processing is limited to a synthetic/de-identified pilot, real school imagery is blocked behind a future paid and privacy-approved boundary, exact cosine search is capped at 100 photos, lexical search remains the fallback, and a vector database is explicitly deferred. The Non-Goals and addendum make the chosen trade-off—a cheap, bounded proof rather than a production platform—easy to understand.

One privacy decision is incomplete. FR-3 gates image embeddings, but FR-9 and the addendum send every eligible Search Query to the free-tier embedding provider. Because Pilot Dataset is defined only as images, an Authorized Searcher can still submit a child's name or other sensitive text without a stated approval rule. The claim that no phase-blocking questions remain is therefore premature.

### Findings

- **high** Query text falls outside the explicit free-tier approval boundary (§4.2 FR-3, §4.4 FR-9, §5.1 NFR-1, §8 SM-3, addendum §Pilot implementation) — FR-3 controls only image-embedding requests, while FR-9 sends Search Queries to the same external provider; SM-3 checks only unauthorized image requests. *Fix:* Decide whether pilot query text is restricted to the preregistered evaluation set or separately approved for free-tier processing, gate query embedding on that decision, and extend the privacy metric to all external embedding requests.
- **medium** The allowed boundary for person-related visual concepts is unresolved (§4.2 FR-4, §6 Non-Goals, §8 SM-2) — identity and profiling are prohibited, but the PRD does not say whether inferred age/gender terms such as `child` or `woman` are forbidden, allowed as generic visible-element labels, or review-only. That ambiguity changes prompts, evaluation queries, and indexed metadata. *Fix:* Add an approved visual-concept policy, preferably allowing neutral `person/people` while explicitly accepting or excluding demographic inference categories.

## Substance over theater — strong

The four roles drive distinct requirements, and all three named journeys map to concrete capture, search, authorization, retry, and approval behavior. The NFRs contain product-specific bounds—100 photos, two-second warm median latency, no vector database without measured need—rather than generic claims about scalability or security. The Vision is specific to the existing Telegram-to-Drive archive and its school-photo privacy boundary; there is no novelty or persona theater.

### Findings

No substantive findings.

## Strategic coherence — adequate

The thesis is clear: prove that embeddings retrieve bilingual conceptual matches better than the existing lexical baseline without exposing live school data. Features, non-goals, and primary metrics consistently serve that thesis, while the counter-metrics correctly recognize first-result quality, language bias, provider fragility, and cost.

The decision gate is not complete, however. SM-2 says semantic nDCG@10 must "materially" exceed the lexical baseline, but no margin is defined or required to be preregistered. The counter-metrics are reports rather than guardrails because none has an acceptance threshold. A favorable Recall@5 result could therefore be declared a win despite unacceptable first-result errors, Arabic disparity, or provider failure.

### Findings

- **high** The semantic-win rule can be chosen after results are visible (§8 SM-2 and SM-C1–SM-C3, §11 Open Questions) — "materially exceeds" has no numeric or adjudicated margin, and the counter-metrics have no stop thresholds. This weakens the central build/upgrade decision. *Fix:* Before evaluation, preregister the required nDCG@10 improvement or confidence/tie rule plus maximum acceptable top-result false-positive rate, Arabic/English gap, and provider failure rate; list any still-unapproved values as open questions.

## Done-ness clarity — adequate

Most FRs have useful, testable consequences, including malformed-vector behavior, deterministic ties, model-space isolation, duplicate suppression, fallback behavior, and protection of manual metadata. Performance, index size, and result count have explicit bounds.

Two requirements still rely on concepts that are not observable enough for implementation and acceptance. A global approval flag plus an Operator assertion does not establish which specific Photo Records were approved, and FR-2 delegates its behavioral contract to unnamed "existing adjacency rules." Album behavior is also unstated despite requiring `media-group identifier` storage.

### Findings

- **high** Approval is not bound to an auditable set of Photo Records (§3 Pilot Dataset, §4.2 FR-3, §4.3 FR-5, §8 SM-3, addendum §Pilot implementation) — a global flag and an operator invocation cannot by themselves prove that every transmitted image belongs to the approved dataset. "Explicitly marks or invokes" leaves no required membership record or testable selection rule. *Fix:* Require a versioned Pilot Dataset manifest or per-record approval fields (`dataset_id`, `approved_by`, `approved_at`), make the worker reject records without that evidence, and audit the provider-request-to-record mapping without retaining image bytes.
- **medium** Message Context and album behavior are not self-contained (§3 Message Context, §4.1 FR-1 and FR-2) — "existing adjacency rules" does not state same-sender matching, immediate message order, reply handling, or how a caption and separate after-line coexist. `media-group identifier` is stored, but the PRD never decides whether album photos are separate records, share context, or collapse in results. *Fix:* State the complete adjacency contract and the minimum album rule directly in FR-1/FR-2, including separate caption/before/after storage.

## Scope honesty — adequate

The PRD is candid about major omissions: no live images on the free tier, no backlog migration, no vector database, no public UI, no biometrics, and no production SLA. It also separates pilot approval from eventual legal and contractual approval, which prevents synthetic success from being misrepresented as production readiness.

The closing claim that there are no unconfirmed assumptions is too absolute. "Properly de-identified" has no acceptance procedure, the metric margins are unresolved, and query-data treatment is unstated. Those are pilot inputs, not merely future live-data questions.

### Findings

- **medium** Open Questions and the Assumptions Index overstate closure (§3 Pilot Dataset, §11 Open Questions, §12 Assumptions Index) — the PRD treats the dataset boundary as established but does not define who certifies de-identification, what evidence is retained, or how approval is revoked; the evaluation thresholds are also incomplete. *Fix:* Record these as `[NOTE FOR PM]` decisions or explicit assumptions, define the Privacy Owner's dataset-acceptance artifact, and update the Assumptions Index until they are resolved.

## Downstream usability — adequate

The Glossary is useful, UJ/FR/NFR/SM identifiers are contiguous, each journey has a named protagonist, and requirements can mostly be extracted independently for UX, architecture, and story creation. The implementation addendum cleanly isolates provider and storage decisions from product behavior.

Because this is a brownfield PRD, downstream work also needs an explicit delta. The addendum names the existing platform, but the Features section mixes already-working requirements (most of FR-1, FR-8, lexical fallback) with fixes and new capabilities (separate adjacent text, approval, embeddings, semantic ranking) without marking their status.

### Findings

- **medium** Existing behavior, corrective work, and new scope are mixed together (§4 Features, addendum §Existing platform) — story generation cannot reliably tell whether an FR requires preservation, regression coverage, a bug fix, or new implementation. *Fix:* Add a compact brownfield delta table mapping each FR to `existing/verify`, `existing/fix`, or `new`, with the relevant current-code boundary where useful.

## Shape fit — strong

The PRD fits a small multi-stakeholder B2B brownfield capability: three load-bearing named journeys cover uploader, searcher, and operator concerns; the Privacy Owner supplies the necessary approval constraint; and technical detail is moved to a short addendum. The document is neither a feature backlog disguised as a PRD nor an over-formalized platform specification.

### Findings

No substantive findings.

## Mechanical notes

- UJ-1–UJ-3, FR-1–FR-11, NFR-1–NFR-12, and SM-1–SM-6 are contiguous and unique; SM-C1–SM-C3 form a clear separate counter-metric series.
- All UJs have named protagonists and carry their role context inline.
- Glossary terminology is largely stable. The material drift is between `Pilot Dataset`, `approved Photo Record`, and `Indexed Photo`: approval membership is implied rather than represented by one defined record/state.
- SM-3 claims to validate FR-4, but its stated measurements—unauthorized retrieval and out-of-dataset image calls—do not test absence of biometric inference. Add a prompt/schema/configuration inspection or a dedicated FR-4 acceptance check.
- The Assumptions Index has no roundtrip errors because there are no inline `[ASSUMPTION]` tags, but its assertion that no unconfirmed assumptions exist is substantively unsupported as noted above.
- Required sections for this product shape are present, and the addendum link resolves conceptually within the same document workspace.
