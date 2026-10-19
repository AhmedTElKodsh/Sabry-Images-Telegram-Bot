# Telegram Catalog Workflow Full Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the verified workflow correctness and reliability gaps, make release state reproducible, and provide explicit runnable gates for the external acceptance work that cannot be completed from the repository alone.

**Architecture:** Preserve the current Apps Script, Sheets, Drive, Telegram, and staged-worker design. Repair claim persistence first, then add replay-safe search delivery and a durable webhook inbox without weakening authorization, archive integrity, new-photo-only admission, or ambiguous-send protection. Add operational diagnostics, automated repository checks, and gated semantic/deletion/restore acceptance tooling without enabling unapproved live processing.

**Tech Stack:** Google Apps Script V8 JavaScript, Node.js fixture tests, PowerShell verification, GitHub Actions.

**Spec:** `_bmad-output/implementation-artifacts/full-workflow-repair-2026-10-19.md`

## Global Constraints

- Never emit credentials, unredacted webhook URLs, provider bodies, or private image content.
- Never drop pending Telegram updates or replay `PUBLISH_UNKNOWN` automatically.
- Preserve append-only record provenance, exact archive evidence, eligibility cutoffs, publication IDs, and historical rows.
- All production behavior changes use red-green TDD against real `Code.gs` execution in the repository fixture.
- Local checks, deployment evidence, live acceptance, privacy approval, and independent-account recovery remain separate gates.
- No live deployment, credential/property mutation, Telegram send, or Git push is performed without current evidence and the applicable external access.

## Review Focus

- Save-lock contention must not consume archive or caption attempts or strand stale claims.
- A partially delivered multi-result search must not automatically resend confirmed or ambiguous earlier results.
- A webhook update durably admitted to the inbox must survive a later processing exception without double-admitting a photo.
- Stage failures, missing triggers, webhook errors, and ambiguous work must be visible without exposing secrets.
- Semantic routing and real-data processing must remain disabled unless approval, dataset, query, model, expiry, and evaluation gates all pass.

---

### Task 1: Refund lock-contention claims

**Files:**
- Modify: `apps-script/Code.gs`
- Modify: `tests/archive_retry_check.js`
- Modify: `tests/catalog_caption_check.js`

**Interfaces:**
- Consumes: existing archive/caption claim rows and ten-second ScriptLock acquisition.
- Produces: retryable claim state with unchanged attempt budget when result persistence cannot acquire the save lock.

- [x] Write archive and caption tests that deliberately hold the save lock after external work and assert refunded attempts and no terminalization after five contentions.
- [x] Run the focused tests and confirm failure because expired claims consumed another attempt.
- [x] Refund expired archive and idempotent caption claims before safe locked reclamation.
- [x] Run focused tests, then all registered checks and syntax validation.

### Task 2: Make search delivery replay-safe

**Files:**
- Modify: `apps-script/Code.gs`
- Modify: `tests/output_group_search_check.js`
- Modify: `tests/catalog_fixture.js`

**Interfaces:**
- Consumes: update ID, requesting chat ID, stable canonical result IDs, and Telegram send dispositions.
- Produces: append-only per-result delivery state `CLAIMED`, `SENT`, or `UNKNOWN` in the existing Events ledger; completed command event only after every result is terminal.

- [x] Write a failing routed-consumer test for result-two failure after result one succeeds and no resend of `SENT`/`UNKNOWN` results.
- [x] Verify the current all-or-nothing command event fails the test with `search-unavailable` and no delivery ledger.
- [x] Add append-only search-delivery claim/finalize helpers in Events; a `CLAIMED` entry without a later disposition is ambiguous and must never be auto-replayed.
- [x] Route both private and output-group search through delivery claims and report incomplete/unknown delivery safely.
- [x] Run focused and full verification.

### Task 3: Add a durable webhook inbox

**Files:**
- Modify: `apps-script/Code.gs`
- Create: `tests/webhook_inbox_check.js`
- Modify: `tests/catalog_fixture.js`

**Interfaces:**
- Consumes: authenticated Telegram update JSON and update ID.
- Produces: append-only inbox receipt plus `processPendingInbox()` recovery worker while preserving synchronous best-effort processing.

- [x] Write failing tests for durable receipt before processing, duplicate webhook delivery, exception after receipt, worker replay, and already-completed update suppression.
- [x] Add an append-only `Inbox` sheet with bounded payload, status, claim, lease, attempts, and sanitized error fields.
- [x] Make `doPost()` persist the receipt before processing and finalize it after `processUpdate_`; leave failed receipts retryable for the worker.
- [x] Install exactly one inbox worker and include it in health/trigger diagnostics.
- [x] Run focused and full verification.

### Task 4: Add operational alert and recovery evidence

**Files:**
- Modify: `apps-script/Code.gs`
- Create: `tests/catalog_operations_check.js`
- Modify: `README.md`

**Interfaces:**
- Consumes: catalog health, trigger inventory, redacted webhook diagnostics, and terminal/unknown rows.
- Produces: sanitized `catalogOperationalReport()` plus bounded, deduplicated operator alerts and explicit record-scoped recovery candidates.

- [x] Write failing tests for missing trigger, paused stage, terminal archive, `PUBLISH_UNKNOWN`, webhook error redaction, and repeated-alert suppression.
- [x] Implement read-only operational reporting and opt-in operator alert delivery without exposing credentials or provider payloads.
- [x] Add safe record-scoped recovery planning; never automatically replay ambiguous publication.
- [x] Document alert setup, triage, and recovery boundaries.
- [x] Run focused and full verification.

### Task 5: Add deletion/access-request workflow

**Files:**
- Modify: `apps-script/Code.gs`
- Create: `tests/catalog_erasure_check.js`
- Modify: `README.md`

**Interfaces:**
- Consumes: exact record/canonical group, approved request ID, approver, timestamp, and dry-run flag.
- Produces: review manifest first; execution removes retrieval/publication eligibility and provider vectors while retaining a minimal non-sensitive audit tombstone. Physical Drive/output deletion remains explicit and disposition-recorded.

- [x] Write failing dry-run, shared-canonical, alias, published-message, embedding, backup-warning, repeated-request, and partial-failure tests.
- [x] Implement fail-closed planning and separately authorized execution with append-only Events audit.
- [x] Ensure no alias request deletes bytes still required by another retained provenance row.
- [x] Document approval, retention, backup, and independent-controller responsibilities.
- [x] Run focused and full verification.

### Task 6: Add semantic evaluation and integration gates

**Files:**
- Modify: `apps-script/Code.gs`
- Create: `tests/semantic_evaluation_check.js`
- Create: `tools/evaluate_semantic_retrieval.js`
- Modify: `README.md`

**Interfaces:**
- Consumes: preregistered 50–100-record evaluation set, 15–20 approved Arabic/English queries, relevance judgments, and current pilot approval.
- Produces: deterministic lexical/semantic metrics and a fail-closed integration decision; teacher search remains lexical until the gate passes.

- [x] Write failing tests for missing approval, dataset/query mismatch, silent omissions, nDCG gain below `0.10`, relevant-in-top-five below `0.90`, excess false positives, excess language gap, and provider failures.
- [x] Implement an offline evaluator with machine-readable results and explicit thresholds copied from the PRD.
- [x] Add a gated teacher-search router that can select hybrid mode only for the exact approved/evaluated configuration.
- [x] Preserve lexical fallback and never enable real school imagery automatically.
- [x] Run focused and full verification.

### Task 7: Automate repository and release verification

**Files:**
- Create: `.github/workflows/verify.yml`
- Create: `tools/verify_release.ps1`
- Create: `_bmad-output/implementation-artifacts/full-workflow-repair-2026-10-19.md`
- Modify: `_bmad-output/implementation-artifacts/spec-workflow-recovery-2026-10-16.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: tracked source, registered tests, Git commit, source SHA-256, and optional redacted live evidence.
- Produces: one local/CI verification command and an evidence manifest that keeps local, GitHub, editor, deployed, and live states distinct.

- [x] Add CI that runs every `tests/*_check.js`, Apps Script syntax validation, helper self-checks, and whitespace checks.
- [x] Add a local release verifier that prints no secrets and records commit/source/test evidence.
- [x] Reconcile stale artifact status without rewriting frozen intent or historical evidence.
- [x] Record which external gates remain: live deployment, dedup acceptance, second-teacher authorization/revocation, independent-account restoration, and privacy approval.
- [x] Run the exact CI-equivalent command locally and inspect the final diff.

### Task 8: External acceptance gates

**Files:**
- Modify only the evidence report after each authorized live action.

**Interfaces:**
- Consumes: reviewed release commit, matching editor source, operator authorization, safe fixtures, second teacher account, independent Google account, and privacy approval where applicable.
- Produces: separately recorded deployment, current health, canonical dedup, authorization/revocation, disaster recovery, deletion, and semantic-quality evidence.

- [ ] Deploy with workers/webhook paused and pending updates preserved; verify immutable version and source hash.
- [ ] Run safe canonical dedup end-to-end and prove two provenance rows, one Drive object, one analysis/publication, one result slot, and caption synchronization.
- [ ] Test second-teacher access and revocation.
- [ ] Restore into an independent Google account.
- [ ] Exercise an approved deletion/access request.
- [ ] Run the preregistered semantic evaluation only after the privacy/provider gate exists.

