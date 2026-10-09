---
title: 'Activate the Two-Group Apps Script Bot Online'
type: 'feature'
created: '2026-08-30'
status: 'done'
baseline_commit: 'NO_VCS'
review_loop_iteration: 3
context:
  - '{project-root}/_bmad-output/implementation-artifacts/spec-enrich-and-publish-input-group-images.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The reviewed two-group workflow exists only locally. The online Apps Script project has not received it, and the new private groups are known by invite links rather than the numeric Telegram chat IDs required by the bot.

**Approach:** Deploy to the existing Apps Script project, guide the operator through adding the existing bot and obtaining both numeric IDs, verify and bind those groups, enable new-photo-only Groq enrichment/publication, and prove the flow with one synthetic or de-identified image.

## Boundaries & Constraints

**Always:** Preserve existing secrets, storage IDs, webhook secret, deployment URL, unrelated properties, and unrelated triggers. Authenticate Google interactively without exposing credentials. Treat the supplied private input group as input and the supplied private output group as output, but configure only canonical numeric IDs obtained from Telegram. Reconcile remote source before pushing, migrate Sheets append-only, avoid historical AI/publication backfill, test with safe content, and verify both exact groups with non-sending calls before enabling workers.

**Ask First:** Rotating secrets; changing Drive/Sheet IDs or ownership; deleting/recreating a web-app deployment; interrupting the webhook to discover IDs; sending real school/children photos to Groq without explicit provider/privacy approval; replaying `PUBLISH_UNKNOWN`; or altering unrelated runtime state.

**Never:** Infer IDs from invite hashes; print tokens; publish historical records; overwrite occupied Sheet columns; use a third-party metadata bot; claim success without inspecting the live row and output message; or blindly retry ambiguous delivery.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|---------------------------|----------------|
| Ready activation | OAuth, bot membership, properties, and IDs are valid | Push source, verify groups, enable workers, and produce one searchable output copy from a safe test | Preserve evidence per stage |
| Invite links only | No numeric IDs | Guide native Telegram bot membership and ID collection; configure no guesses | Pause at the required operator action |
| Remote differs | Online source differs from local | Snapshot and compare before deployment | Halt on material overlap |
| Missing access | OAuth, property, or Telegram permission missing | Request only the minimum secure UI action and recheck | Never request secrets in chat |
| Send ambiguous | Telegram outcome cannot be proved | Persist `PUBLISH_UNKNOWN` and inspect history | Never auto-replay |

</frozen-after-approval>

## Code Map

- `apps-script/Code.gs` -- setup, safe Groq enablement, verification, triggers, and publication state machine.
- `apps-script/appsscript.json` -- runtime, scopes, and deployment settings.
- `.clasp.json` -- existing online project binding and local source root.
- `tests/self_check.js` -- provider-free regression gate.
- `README.md` -- Telegram membership, numeric-ID, property, and activation guidance.

## Tasks & Acceptance

**Execution:**
- [x] `apps-script/Code.gs`, `tests/self_check.js`, and `README.md` -- implement/test timestamp-based new-photo-only Groq activation, serialized fail-closed state/trigger handling, current-scope claim validation, stronger bot/group verification, and native numeric-ID guidance without embedding live invite links.

**Acceptance Criteria:**
- Given existing records, pending Telegram updates, or live tag/publish claims, when new-only activation is attempted, then it refuses to arm until the pipeline is quiescent; once armed, webhook capture reads current state inside its lock and persists each photo as eligible or terminally not eligible so workers never rescan historical rows.
- Given missing/corrupt mode/cutoff state, stale/duplicate/wrong-cadence workers, concurrent activation, credential/model change, or trigger/property failure, when activation or claiming runs, then it fails closed without queueing history, using a stale provider configuration, duplicating workers, or losing unrelated properties.
- Given Groq or output disablement, when active claims exist, then disablement refuses to report success; when no claims exist, the gate and its worker stop atomically so no provider/send call starts afterward and paused unsent rows remain recoverable rather than terminally failed.
- Given exact numeric group IDs, when verification runs with publishing disabled, then it returns the resolved titles/bot identity, requires the bot to be administrator/creator in both groups, and binds the marker to the current token fingerprint.
- Given only private invite links, when the operator reads the setup guide, then it uses native Telegram membership and canonical numeric IDs without third-party ID services, invite-hash guessing, or storing live invite URLs in repository documentation.

## Post-Review Online Activation

- [ ] `.clasp.json` and existing Apps Script project -- complete interactive OAuth, snapshot/reconcile remote source, push the reviewed bundle, and update the existing deployment without replacing runtime configuration.
- [ ] Apps Script/Telegram runtime -- configure exact numeric IDs, run setup and non-sending verification, then enable Groq/publication triggers with zero historical publication backfill.
- [ ] Safe live fixture -- upload one synthetic/de-identified input photo and verify Drive, complete Sheets metadata, bounded bilingual caption, one output message, statuses, and duplicate suppression.

**Online Acceptance:** Given the existing project and a safe fixture, when activation completes, then only newly captured eligible photos are enriched and copied from the exact input group to the exact output group. Given missing access, a remote conflict, or an ambiguous send, activation stops without exposing credentials, losing remote work, backfilling history, or creating a blind duplicate.

## Spec Change Log

- Review loop 1: adversarial review proved numeric `update_id` ordering is unsafe after long inactivity and can admit delayed updates; it also exposed fail-open mode corruption, activation/claim races, incomplete rollback, and under-specified group identity/permission checks. Replaced the boundary design with Telegram message-send time, required explicit fail-closed modes plus locked current-state claim validation, serialized trigger/property activation with safe resume, and strengthened group verification with titles, administrator membership, publishing-disabled precondition, and token binding. Known-bad state avoided: historical photos reaching Groq, new photos stranded, duplicate workers, or delivery to an unintended/unready group. KEEP: zero historical queue/immediate batch, preserved unrelated properties, native numeric-ID guidance, no third-party ID bot, and review-before-deploy sequencing.
- Review loop 2: second review found that timestamp comparison alone cannot be an absolute cross-system boundary, webhook configuration was read before its lock, disabled-interval rows could become eligible on resume, disablement was not quiescent, provider configuration could be stale after claim, and trigger integrity/rollback were incomplete. Replaced worker-time historical filtering with capture-time eligibility plus a quiescent activation gate requiring zero Telegram pending updates and zero live claims; required current config inside webhook/claim locks, terminal not-eligible status for out-of-scope captures, claim-aware atomic disablement, recoverable publication pause behavior, trigger integrity/rollback, and current group-membership recheck at output enablement. Known-bad state avoided: delayed/disabled-interval photos reaching Groq, post-disable calls, stale-key/model calls, permanently failed paused rows, orphan/duplicate workers, or group rebinding during an old delivery. KEEP: explicit modes, conservative send-time cutoff as defense in depth, token-bound verification, resolved title/admin evidence, no historical queue/first batch, and no invite URLs in repository artifacts.
- Review loop 3: acceptance review found that activation did not check both claim types, trigger replacement could remove a worker while leaving its gate enabled, the live Groq key was not rechecked under lock, and legacy first-group auto-binding remained documented and callable. Activation now refuses both claim types, closes each external-call gate before destructive trigger repair, verifies exactly one replacement worker before reopening the gate, leaves the gate closed on any cleanup failure, rechecks the live key, removes implicit group binding, and tests trigger creation/deletion failures. Known-bad state avoided: an enabled gate without a worker, provider/send calls after a failed repair, arming with a removed key, and accidentally binding the output or an unrelated group as input. KEEP: safe rows remain retryable, unrelated properties/triggers remain untouched, and online proof stays separate from local acceptance.

## Design Notes

Invite links are navigation aids, not Bot API IDs, and do not belong in repository documentation. New-only activation requires Telegram `pending_update_count=0`, no active claims, and a healthy single five-minute worker before committing managed state. The webhook acquires the script lock before reading configuration and stores `TAG_PENDING` only for captures that satisfy the armed capture-time gate; all others become `TAG_NOT_ELIGIBLE`, so history is neither queued nor repeatedly scanned. Telegram send time remains a conservative defense against in-flight pre-activation requests, not the sole ordering authority. Claims use the current locked configuration snapshot for both provider call and audit. Disablement refuses active claims, closes the external-call gate first, and verifies worker removal; even if trigger cleanup fails, an inert stale trigger cannot start a provider/send call. Output pause leaves unsent rows recoverable. Group verification and output enablement recheck current identity, titles, administrator membership, exact IDs, token fingerprint, trigger integrity, and absence of old publication claims.

## Verification

**Commands:**
- `Get-Content -Raw -LiteralPath '.\apps-script\Code.gs' | node --check -` -- expected: exit 0.
- `node .\tests\self_check.js` -- expected: `PASS: Telegram collector self-check`.
- `npx --yes @google/clasp@3.4.1 status` -- expected: only intended Apps Script files are tracked.

**Manual checks:**
- Confirm OAuth, remote snapshot/diff, exact group titles/IDs, required property presence without values, expected triggers, and one safe end-to-end record/message.
- A live audit found a legacy `processPendingTags` trigger owned by another Google account. The managed activation now stores its exact trigger UID, so that undeletable legacy schedule is permanently rejected at the worker entry point.

**Review note:** The acceptance reviewer identified and verified closure of the final property-failure, expired-lease, and operator-guidance findings. A second final reviewer could not complete because the Codex account reached its agent usage limit; the canonical suite and targeted failure simulations were rerun locally after the final patch.

## Suggested Review Order

**Capture and activation boundary**

- Webhook reads current configuration only after acquiring the global ordering lock.
  [`Code.gs:133`](../../apps-script/Code.gs#L133)

- New-photo-only activation requires quiescence before opening any worker gate.
  [`Code.gs:1284`](../../apps-script/Code.gs#L1284)

- Capture-time status makes out-of-bound photos terminally ineligible.
  [`Code.gs:778`](../../apps-script/Code.gs#L778)

**Two-group identity and delivery**

- Non-sending verification binds exact groups to the current bot identity.
  [`Code.gs:478`](../../apps-script/Code.gs#L478)

- Publishing activation rechecks membership, claims, Groq mode, and worker integrity.
  [`Code.gs:597`](../../apps-script/Code.gs#L597)

- Final claim revalidation prevents sends after configuration or row mutation.
  [`Code.gs:1742`](../../apps-script/Code.gs#L1742)

**Fail-closed workers and enrichment**

- Independent gate and trigger barriers survive partial property-service failures.
  [`Code.gs:726`](../../apps-script/Code.gs#L726)

- Claims carry the locked provider snapshot through API and audit completion.
  [`Code.gs:1934`](../../apps-script/Code.gs#L1934)

- Bounded bilingual metadata becomes deterministic Telegram-searchable caption text.
  [`Code.gs:2302`](../../apps-script/Code.gs#L2302)

**Operator guidance and regression evidence**

- Setup requires explicit native Telegram IDs and documents safe activation order.
  [`README.md:161`](../../README.md#L161)

- Failure simulations cover trigger creation, deletion, and property-operation faults.
  [`self_check.js:33`](../../tests/self_check.js#L33)

- Provider-free behavioral checks exercise metadata, eligibility, and delivery state machines.
  [`Code.gs:2841`](../../apps-script/Code.gs#L2841)
