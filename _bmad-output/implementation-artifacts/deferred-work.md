- source_spec: `_bmad-output/implementation-artifacts/spec-approved-pilot-semantic-search.md`
  summary: Separate private search latency from the capture-ordering global webhook lock.
  evidence: The lock is a pre-existing POC ordering mechanism, but a live query-embedding call can now hold it long enough to contend with group photo ingestion; change only after the pilot measures contention because independent command idempotency is required.

- source_spec: `_bmad-output/implementation-artifacts/spec-approved-pilot-semantic-search.md`
  summary: Make multi-photo search delivery resumable after a partial Telegram send failure.
  evidence: The pre-existing search loop records its event only after all photos are sent, so a Telegram retry can resend earlier results; semantic search also repeats the query embedding request.

- source_spec: none
  summary: Separate private semantic search from capture locking and make multi-photo delivery idempotent.
  evidence: This is independently shippable reliability work and was split from the security-first hardening cycle.

- source_spec: none
  summary: Harden Gemini ranking, retry, telemetry, quota accounting, and approval-time query behavior.
  evidence: Provider operations and ranking policy can be reviewed independently from Telegram authorization controls.

- source_spec: none
  summary: Protect all Sheet schemas and add integration-level tests for claims, purge, routing, and provider parsing.
  evidence: Schema migration and test-harness work are separate deliverables from the immediate authorization boundary.
- source_spec: none
  summary: Refactor Telegram ingestion into a durable event ledger with edit, album, topic, reply, duplicate, and out-of-order reconciliation.
  evidence: Split from the security-hardening implementation because it is an independently shippable ingestion architecture change with separate migration and replay risks.
- source_spec: none
  summary: Replace Drive as the authoritative media store with private Google Cloud Storage and a verified per-record Drive migration.
  evidence: Split from the security-hardening implementation because storage authority, IAM, conditional writes, checksums, and data migration form an independent deployable change.
- source_spec: none
  summary: Upgrade retrieval to aggregated Gemini image-and-text embeddings, reciprocal-rank hybrid search, and optional structured Groq enrichment.
  evidence: Split from the security-hardening implementation because semantic relevance, provider evaluation, vector cohorts, and ranking changes have independent acceptance and rollback gates.
- source_spec: `_bmad-output/implementation-artifacts/spec-enrich-and-publish-input-group-images.md`
  summary: Add durable Groq approval provenance, expiry, dataset scope, and explicit historical-record authorization before provider calls.
  evidence: The existing Groq enablement path predates this story and relies on an external operator approval rather than a code-enforced approval manifest; this implementation makes no live provider calls and does not auto-publish historical rows.
- source_spec: `_bmad-output/implementation-artifacts/spec-enrich-and-publish-input-group-images.md`
  summary: Design and validate a privacy-review boundary for AI captions, broad vocabulary, and OCR before real school imagery is published.
  evidence: Prompt constraints cannot prove that a probabilistic vision response contains no identifying or sensitive content; a reliable multilingual PII and school-policy moderation design requires separate governance, evaluation data, and acceptance criteria.
- source_spec: `_bmad-output/implementation-artifacts/spec-enrich-and-publish-input-group-images.md`
  summary: Bound publication-worker Sheet scans and separate worker locking from webhook capture after measured contention.
  evidence: The new worker performs an O(n) Records scan under the existing global POC lock; network calls are outside the lock and pilot scale is bounded, but larger archives need measured contention evidence and a dedicated lock/idempotency design.

- source_spec: `_bmad-output/implementation-artifacts/spec-durable-archive-and-hybrid-search.md`
  summary: Private search needs per-result delivery progress or another replay-safe response design.
  evidence: If a later `sendPhoto` fails after earlier results were delivered, the command event is not appended and Telegram retry can resend the earlier photos.
