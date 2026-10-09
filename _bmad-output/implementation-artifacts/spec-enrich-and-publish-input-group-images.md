---
title: 'Enrich and Publish Input-Group Images'
type: 'feature'
created: '2026-08-29'
status: 'done'
baseline_commit: 'NO_VCS'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/prds/prd-Telegram-Bot-2026-08-06/prd.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-approved-pilot-semantic-search.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Input-group photos are stored and may receive basic Groq tags, but no enriched copy reaches a separate output group. Members cannot use Telegram search to find photos by broad visual vocabulary, OCR text, activity, setting, color, or visual mood.

**Approach:** Extend the asynchronous Groq pipeline to persist bounded, non-sensitive bilingual visual metadata and publish each enriched photo to one explicit output group with a deterministic searchable caption. Keep image bytes unchanged: hidden image metadata is not Telegram-searchable, so complete metadata lives in Sheets and its search projection in the Telegram caption.

## Boundaries & Constraints

**Always:** Treat `ALLOWED_CHAT_ID` as input and require a different explicit `OUTPUT_CHAT_ID` before enabling enrichment. Keep webhook capture independent from AI/delivery; preserve Drive originals, human text, manual tags, and existing search. Groq may describe only visible content and must return English/Arabic captions, tags/vocabulary, objects, activities, setting/topics, colors, OCR text, and non-personal visual tone. Store the normalized result in Sheets and a prioritized plain-text caption no longer than Telegram's 1024-character limit. Claim and commit under short locks with network calls outside locks. Retry only definitely unsent transient failures; expose permanent and ambiguous outcomes.

**Ask First:** Sending real school/children photos without recorded Groq approval; changing provider/model; publishing old records; replaying ambiguous delivery; deploying, installing triggers, changing live properties, or making live provider/Telegram calls.

**Never:** Identify people; infer names, sensitive traits, emotions, or intent; invent facts; persist secrets/image bytes outside approved storage; make output history authoritative; publish from the webhook; silently truncate durable metadata; or claim exactly-once delivery after an ambiguous timeout.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| New photo | Unique input photo; enrichment enabled; valid output group | Capture once, enrich asynchronously, publish one searchable copy, save output message ID | Network calls never delay webhook acknowledgement |
| Duplicate work | Existing record/claim or output message ID | Skip completed stages; no known duplicate | Reuse persisted state |
| Groq failure | Transient versus permanent response | Bounded retry or terminal error; original remains stored/searchable | Persist safe status/error |
| Publish failure | Definite rejection versus unknown transport outcome | Retry definite non-delivery; stop permanent/unknown cases | Never blindly replay unknown delivery |
| Large metadata | Result exceeds caption capacity | Preserve full JSON; emit prioritized valid UTF-8 caption ≤1024 characters | Omit lower-priority caption tokens only |
| Bad groups | Missing/non-group/same IDs | Capture remains available; enable/publish fails closed | Non-sending configuration error |

</frozen-after-approval>

## Code Map

- `apps-script/Code.gs` -- schema/config, Groq contract, claims, output delivery, and self-check.
- `tests/self_check.js` -- Node VM runner for the Apps Script-compatible deterministic self-check.
- `README.md` -- two-group setup, privacy, states, and non-sending checklist.

## Tasks & Acceptance

**Execution:**
- [x] `apps-script/Code.gs` -- append backward-compatible Records fields; validate group config; expand/sanitize the Groq JSON contract; persist metadata; build the bounded caption; implement claim/publish/finalize states with explicit ambiguous outcomes.
- [x] `apps-script/Code.gs` self-check and `tests/self_check.js` -- cover model parsing, caption budgeting, eligibility, duplicate suppression, groups, retries, and all existing ranking/Gemini checks without network calls.
- [x] `README.md` -- document `OUTPUT_CHAT_ID`, permissions, searchable captions, privacy approval, states, recovery boundaries, local verification, and unverified deployment/live status.

**Acceptance Criteria:**
- Given a captured record and valid Groq output, when the worker completes, then structured metadata is stored and publication becomes pending without overwriting human metadata.
- Given pending publication and valid groups, when `sendPhoto` succeeds, then its message ID is stored and later workers skip delivery.
- Given malformed AI output, oversized metadata, duplicate work, or a delivery failure, when tests run, then the matrix behavior and existing lexical/Gemini checks pass.

## Spec Change Log

## Design Notes

The caption is a search projection, not source of truth. Prioritize bilingual captions and vocabulary, then OCR, activity/setting, colors, visual tone, and human context. Telegram has no client idempotency key for `sendPhoto`; a post-transmission timeout becomes `PUBLISH_UNKNOWN`, not a safe automatic retry.

## Verification

**Commands:**
- `node tests/self_check.js` -- expected: all deterministic Apps Script checks pass with no network calls.

**Manual checks:**
- Inspect caption fixtures for useful Arabic/English terms and ≤1024 characters.
- Do not deploy, install triggers, alter live properties, or send live messages in this cycle.

## Suggested Review Order

**Two-group activation boundary**

- Non-sending Telegram verification binds both exact group identities before activation.
  [`Code.gs:460`](../../apps-script/Code.gs#L460)

- Explicit enablement installs an independent publication worker without backfilling records.
  [`Code.gs:481`](../../apps-script/Code.gs#L481)

- Capture-time eligibility ensures only correctly configured new photos can publish.
  [`Code.gs:519`](../../apps-script/Code.gs#L519)

**Enrichment and searchable metadata**

- Groq receives the bounded bilingual visual-analysis contract outside the webhook.
  [`Code.gs:1554`](../../apps-script/Code.gs#L1554)

- Strict normalization rejects malformed, oversized, or non-bilingual provider output.
  [`Code.gs:1674`](../../apps-script/Code.gs#L1674)

- Caption budgeting preserves complete Unicode tokens within Telegram's limit.
  [`Code.gs:1802`](../../apps-script/Code.gs#L1802)

- Rich metadata joins existing weighted lexical ranking without replacing manual tags.
  [`Code.gs:2053`](../../apps-script/Code.gs#L2053)

**Idempotent output publication**

- The independent worker owns bounded claims and explicit delivery outcomes.
  [`Code.gs:1097`](../../apps-script/Code.gs#L1097)

- Claiming records eligibility, settling, metadata, caption, lease, and destination atomically.
  [`Code.gs:1131`](../../apps-script/Code.gs#L1131)

- Locked pre-send revalidation detects every mutable claim boundary before network delivery.
  [`Code.gs:1252`](../../apps-script/Code.gs#L1252)

- Telegram responses distinguish confirmed delivery, retryable rejection, permanent failure, and ambiguity.
  [`Code.gs:1334`](../../apps-script/Code.gs#L1334)

- Finalization stores message identity and prevents known-delivered rows from re-entering claims.
  [`Code.gs:1414`](../../apps-script/Code.gs#L1414)

**Migration, operations, and verification**

- Records extension expands safely and refuses to relabel occupied legacy columns.
  [`Code.gs:1923`](../../apps-script/Code.gs#L1923)

- Operator guidance explains privacy, verification, triggers, states, and unknown-delivery recovery.
  [`README.md:152`](../../README.md#L152)

- Provider-free checks exercise migration, metadata, Unicode, claims, retries, and compatibility.
  [`Code.gs:2341`](../../apps-script/Code.gs#L2341)
