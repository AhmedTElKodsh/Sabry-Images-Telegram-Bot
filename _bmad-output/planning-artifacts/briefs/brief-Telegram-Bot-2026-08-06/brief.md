---
title: "School Images Telegram Bot Product Brief"
status: final
created: 2026-08-06
updated: 2026-08-06
---

# Product Brief: School Images Telegram Bot

## Executive Summary

Teachers already share school photos in Telegram, but sparse captions and nearby one-line messages make those photos difficult to find later. The bot will preserve each photo with its Telegram context, enrich it with readable bilingual descriptions, and let authorized staff retrieve it using words, synonyms, or concepts visible in the image.

The first release adds semantic ranking to the existing Google Apps Script bot without introducing a vector database or a new user interface. A controlled pilot will use Gemini multimodal embeddings for synthetic or properly de-identified images only. Real school or children photos remain outside the free-tier AI boundary until the project upgrades to a paid, privacy-approved service configuration.

## The Problem

Teachers upload photos with a caption, a short message immediately before or after the photo, or both. Later, an authorized staff member may remember the idea in the image rather than the exact wording—for example, searching for “farm” when the photo contains a farmer, horse, and sheep. Exact keyword matching misses these relationships, especially across Arabic and English.

Manual tagging is inconsistent and expensive. Telegram history is chronological rather than organized for semantic discovery, so finding an old photo requires scrolling, guessing the original caption, or asking colleagues. For school imagery, any enrichment service also creates a material privacy risk unless the data boundary is explicit and enforced.

## The Solution

The bot captures the highest-quality Telegram photo, its caption, a qualifying adjacent one-line message, album and message identifiers, sender and chat provenance, timestamps, and Drive references. It preserves the existing Groq enrichment path for human-readable Arabic and English tags and captions.

For semantic retrieval, the bot creates a multimodal embedding for each approved pilot image and an embedding for each search query. It ranks candidates by cosine similarity and returns the closest authorized photos. A query such as “farm,” “vehicle,” or an Arabic equivalent can therefore find images based on meaning and visible content rather than exact stored words.

## What Makes This Different

- It fits the teachers’ existing Telegram workflow; no separate upload interface is required.
- It combines Telegram context, readable AI descriptions, and image-aware semantic ranking.
- Retrieval remains useful when optional Groq tagging is unavailable because embeddings are an independent search signal.
- The pilot has an enforced privacy boundary: free-tier AI processing is limited to synthetic or properly de-identified images.

## Who This Serves

- **Teachers:** upload normally and later find material without remembering exact captions.
- **Authorized school staff:** search the archive in Arabic or English and receive the best matches first.
- **School administrator or privacy owner:** approve the dataset and provider boundary before real imagery is processed.
- **Operator:** monitor enrichment failures, retry approved records, and maintain the bot configuration.

Students, parents, and public users are not search users in the first release.

## Success Criteria

The controlled pilot uses 50–100 synthetic or properly de-identified images and 15–20 representative Arabic and English queries.

- At least 90% of pilot queries return a relevant image in the first five results.
- Semantic ranking materially outperforms the existing lexical baseline on synonym and visible-element queries, measured with nDCG@10.
- Warm searches complete in a median of two seconds or less under pilot load.
- Unauthorized chats retrieve zero photos.
- Duplicate Telegram updates do not create duplicate image or embedding records.
- Failed enrichment is visible and retryable without replacing manual tags.
- Delete, restore, and re-index drills complete without orphaned searchable records.

Counter-metrics: false-positive top results, Arabic-versus-English relevance gap, enrichment failure rate, and actual API cost are tracked so headline recall does not hide poor precision, language bias, or operational fragility.

## Scope

**In the first release**

- Preserve photo, caption, qualifying adjacent line, album/message provenance, sender, chat, and timestamps.
- Keep Drive and Sheets as the archive and metadata store.
- Keep optional Groq bilingual tags and captions.
- Add opt-in Gemini embedding creation for an approved pilot dataset.
- Rank `/search` results by exact cosine similarity and return up to five authorized photos.
- Expose clear embedding status and errors for retry and audit.
- Provide a local self-check for ranking and the privacy gate.

**Explicitly out**

- Processing real school or children photos through Gemini free tier.
- Face recognition, identity inference, biometric indexing, or student profiling.
- A vector database, public search portal, mobile app, or complex administration UI.
- Automatic migration of the existing live archive into the pilot.
- Production approval based only on local or synthetic tests.

## Vision

If the pilot proves useful and safe, the archive becomes a dependable private visual memory for the school: staff can find teaching material by topic, activity, objects, or language without manual cataloguing. The next step is not more features; it is a paid, contractually appropriate AI boundary, school privacy approval, and live evaluation on authorized data. Scale infrastructure is added only when measured archive size or latency makes the simple Sheets-based approach insufficient.
