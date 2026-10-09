# PRD Addendum: Implementation Decisions

This addendum retains technical decisions that should inform Quick Dev and architecture work without turning the PRD into an implementation specification.

## Existing platform

- Google Apps Script receives Telegram updates.
- Google Drive stores image files; Google Sheets stores Photo Records.
- The current private `/search` command performs weighted lexical matching.
- Groq remains optional and independent for human-readable Arabic and English tags and captions.

## Pilot implementation

- Use Gemini `gemini-embedding-2` through its REST API for compatible image and text embeddings.
- Keep vectors in a separate `Embeddings` Sheet keyed by Photo Record identifier and model.
- Use exact cosine comparison. The pilot ceiling is 100 Indexed Photos; a vector database is unnecessary at that size.
- Run image embedding only from an explicit operator worker, never in the Telegram webhook.
- Require an exact affirmative pilot flag, a versioned dataset identifier, approver, approval time, and an explicit comma-separated Photo Record allowlist in Script Properties before image bytes can leave the system.
- Require an explicit normalized Pilot Query Set in Script Properties; any other query stays local and uses lexical search.
- Do not auto-enqueue the existing archive. The Operator explicitly invokes only approved Photo Records.
- Store dataset approval provenance, model, dimensions, vector JSON, status, attempts, update time, and bounded error. Never store keys or image bytes in the Sheet.
- On `/search`, embed an approved Search Query, compare only compatible ready entries, apply deterministic descending cosine ranking, and fall back to current lexical search on any semantic unavailability or unapproved query.

## Upgrade boundary

Before real school imagery is processed, replace the free-tier configuration with a paid, privacy-approved provider arrangement, document retention and deletion behavior, obtain required school approval, and re-run retrieval and operational tests. Embeddings from a different model space require explicit re-indexing.
