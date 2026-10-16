---
title: 'School member search in the output group'
type: 'feature'
created: '2026-10-16'
status: 'done'
route: 'oneshot'
route_source: 'auto'
review: 'quick'
review_source: 'auto'
lenses_ran: ['quick']
review_loop_iteration: 0
baseline_commit: '6e721a393a968ef0cc2f72bcb2ed77bd7f416885'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

School members must be able to send `/search كتاب` in the configured private
Elardh_Images_Group output group and receive matching photos there without
individual private-search allowlisting. The user explicitly approved implementing
the proposed output-group handler and testing it afterward. Preserve private bot
search, input capture, current webhook authentication, archive integrity and the
new-photo-only publication policy.

Accept only a group/supergroup matching the verified output ID and current token
fingerprint. Require a real human sender with no sender_chat and a fresh successful
Telegram membership lookup against the output group; lookup failures, departed or
banned users fail closed before reading the archive. Honor optional bot addressing
only when it matches this bot's current username. Ignore other bots' commands,
unrelated chats and non-command group traffic. A valid command must not need the
private user allowlist or input-group membership. Results stay inside the same
output group, limited to at most five healthy archived photos already recorded as
PUBLISHED there with a stored output message ID. Do not expose unpublished or
historically unverified rows. Use existing local metadata ranking; avoid introducing
new external AI query processing for group members. Private search keeps its current
allowlist plus input-membership check and approved optional semantic pilot.

Given a current output-group member absent from the private allowlist, when they
send a valid search, then published matching photos return to that group. Given an
invalid member, sender_chat, stale group marker or different chat, no archive photos
are returned. Given `/search@OtherBot`, this bot ignores it. Given an empty/oversized
query, usage/length feedback is returned. Given a repeated completed update, no
duplicate delivery occurs. Given no eligible match, the bot replies explicitly.
Given an unauthorized private sender, group membership does not bypass private
authorization. Existing capture and publication checks must remain green.

Deploy the reviewed source to the existing endpoint, then repeat a live output-group
command and inspect its response and corresponding execution. An empty result
proves interaction/authorization only; photo retrieval requires an eligible real
record and must be reported separately. Do not alter secrets, snapshot credential
settings, drop queued updates, replay old publications or weaken archive guards.

</frozen-after-approval>

## Implementation Notes

Bounded extension of the existing search path, estimated under 100 production lines.
Root cause was reproduced live: version 2 webhook completed for a group command but
processUpdate_ only routes private commands. Reuse the command execution and photo
delivery helpers, plus live membership verification with an explicit group target.
Write and run failing routing/authorization tests before implementation.

Implemented output-group routing and shared command execution while keeping private
authorization intact. Group ranking filters current input provenance, PUBLISHED,
exact output ID, a positive output-message ID and healthy canonical archive evidence.
Membership checks target the output group explicitly. Bot addressing resolves the
current username through getMe; no new secret or bot-username property is needed.
The failing test returned ignored before implementation and now exercises actual
ranking, archive verification and Telegram delivery with external services doubled.

Version 3 deployed and replied to live group `/search كتاب` with an explicit empty
result. User approved uploading the repository plant/book fixture through Telegram,
Drive and Groq. Input message 9 exposed a prerequisite ingestion defect: Telegram
download MIME was application/octet-stream, leading to terminal archive failure.
A separate failing regression reproduced it. Narrowly recognize that generic MIME
only through an existing supported byte signature and set the blob content type;
bytes and explicit-MIME mismatch rejection remain unchanged. Independent review of
the group change and follow-up MIME repair returned no findings. The failed record
was preserved, never reset or replayed.

Version 4 deployed with editor/source SHA-256 parity:
74d898aacc1c4d6ff0b0471f726e80f7e0de42d2c32d5d202259cf8421d0b5c7.
Fresh approved input message 10 became ARCHIVED (200935 bytes, integrity ready),
TAGGED on attempt 1 by qwen/qwen3.8-27b, validated metadata, and PUBLISHED to output
message 12. Group command message 13 returned the same photo as message 14 with
matched 1/1 query terms. Capture and search webhooks completed. A repeated worker
run processed zero tags/publications and retained output_message_id 12. Temporary
probe source was removed and final editor parity reverified; no helper was versioned.

All five local suites, syntax and diff checks passed. Live test used the signed-in
group member; non-allowlisted member authorization and denial variants are covered
by offline integration fixtures. This verifies the safe synthetic case, not relevance
quality across a school corpus or private multi-result retry idempotency.

## Spec Change Log

## Review Triage Log

- Quick review of group routing, authorization, scoped corpus, private regression
  and tests: no findings. Follow-up review of the MIME repair: no findings.
- Broader review lenses skipped for this bounded change. No review findings deferred.

## Verification

- `node tests/output_group_search_check.js` (observe missing-feature failure first).
- Existing self-check, archive retry and workflow recovery suites, syntax and diff checks.
- `node tests/archive_mime_check.js`: generic supported signatures pass unchanged;
  unsupported bytes and explicit MIME mismatches remain terminal.
- Source parity and deployment version inspection; live `/search كتاب` in output.
