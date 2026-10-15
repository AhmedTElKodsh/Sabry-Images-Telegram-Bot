# Telegram workflow migration to another Gmail account

Prepared October 15, 2026. Proposal only; destination and cutover approval pending.

## Outcome

Run the existing Telegram bot and its existing input/output groups using Google
resources owned and executed by the destination Gmail account, with preserved
catalog history and verified archive files. The account change alone does not
repair older Groq JSON errors or recover photos whose archive capture failed.

## Why a complete runtime move is needed

The current account is over storage capacity and cannot access the configured
archive folder. Moving only a folder would leave Apps Script running under the
old deployment account. Google states that existing versioned deployment
ownership does not change when the script project's ownership transfers.
Installable triggers also execute as their creator.

Recommended approach: prepare a separate private Sheet and archive folder, and
a reviewed Apps Script project/deployment owned by the destination account.
Keep the current resources as evidence until the new flow passes acceptance.
Keep the same Telegram bot and group IDs; only its Google backend changes.

## Preparation before cloud changes

1. Identify the destination Gmail account and confirm available storage and its
   suitability for these school records. Sign in interactively; never send a
   password, OAuth code, bot token, or provider key through chat.
2. Inventory the existing Sheet tabs, headers, rows, photo IDs, accessible Drive
   originals, deployed source, deployment identity, and trigger owners. Save
   only redacted configuration/evidence. Current audit: five records, two legacy
   unverified and three failed captures; zero healthy archives.
3. Decide whether to transfer existing file ownership or make verified copies.
   For personal Gmail accounts, ownership transfer is possible for eligible
   files shared with the recipient, who must accept. Folder ownership does not
   transfer ownership of its contained files. If copies are made, record the
   old-to-new file ID mapping and reconcile every catalog reference.
4. The inaccessible configured folder must be recovered through its actual
   owner, or replaced through an explicitly approved resource change. Do not
   represent missing originals as migrated. Preserve the failed-photo ledger;
   historical replay needs separate authorization.

## Prepare the destination

1. Create a private archive folder and catalog Sheet under the destination
   account. Preserve Records, Events, and Embeddings data and schema; examine
   Summary formulas for references to old resources. Verify copied content and
   archive bytes/hashes, not merely matching counts.
2. Create the Apps Script project from reviewed source including the local
   retry-deadline fix. Reconcile the online source first. Set only the necessary
   destination resource identifiers and approved configuration.
3. Keep capture/publication/provider gates closed while preparing. Do not copy
   managed trigger UIDs or group-verification markers as if they were valid on
   the new runtime. Recreate/revalidate them under the destination identity.
4. Authorize the destination account and create its own immutable web-app
   deployment running as that account. Verify source parity, deployment access,
   Sheet/folder permissions, bot identity, and exact group membership before
   routing Telegram updates to it.

## Coordinated cutover and credential rotation

Get explicit approval for the concrete destination, resource changes, new
deployment, credential rotation, and safe test before switching live traffic.
User-entered credential changes stay in provider UIs and Script Properties.

1. Ensure there are no active tagging/publication claims. Pause the old workers
   and stop webhook delivery without dropping pending updates. Record the
   queue/status and avoid processing the same backlog in two runtimes.
2. Rotate the exposed Telegram token, Groq key, and webhook secret. Do not leave
   old workers able to make requests with obsolete or exposed credentials.
   Do not replace an active webhook secret before delivery is paused.
3. Revalidate bot/group bindings with the current token. Recreate destination
   workers through the managed activation helpers, using a quiescent pipeline
   and a new-photo-only cutoff. Do not enable legacy backfill.
4. Install the destination webhook preserving pending updates. Verify current
   status and source/deployment identity without printing the credential URL.
5. Keep old workers disabled. Do not delete the old project or files during
   acceptance. If cutover fails, use an explicit recovery plan with current
   credentials; the exposed credentials are not a rollback mechanism.

## Acceptance

One authorized synthetic photo must produce one input event, one resolvable
archive with verified integrity, validated bilingual Groq metadata, exactly one
output message, and a matching catalog publication ID. An authorized private
search should find it. Confirm no duplicate captures/publications and no new
401, permission, quota, or provider-format errors. Only then retire the old
runtime; preservation/deletion of historical files remains a separate decision.

## Sources checked

- [Google Drive ownership transfer](https://support.google.com/drive/answer/2494892?hl=en)
- [Apps Script deployment ownership](https://developers.google.com/apps-script/concepts/deployments)
- [Apps Script installable triggers](https://developers.google.com/apps-script/guides/triggers/installable)
- [Apps Script collaboration](https://developers.google.com/apps-script/guides/collaborating)
