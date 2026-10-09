# Product Brief Addendum

## Technical boundary retained for downstream design

- Gemini multimodal embeddings provide semantic ranking; Groq produces optional human-readable bilingual tags and captions.
- The pilot uses exact cosine comparison over stored vectors. A vector database is deferred until measured scale or latency requires it.
- Embedding work runs outside the Telegram webhook so provider latency cannot delay update acknowledgement.
- Embeddings are keyed to the existing photo record and store model, dimensions, status, attempts, and last error for audit and retry.
- Free-tier integration is opt-in and fails closed unless an operator explicitly confirms that the pilot dataset is synthetic or properly de-identified.
- Embedding model changes require re-indexing because vectors from different model spaces are not compared.
