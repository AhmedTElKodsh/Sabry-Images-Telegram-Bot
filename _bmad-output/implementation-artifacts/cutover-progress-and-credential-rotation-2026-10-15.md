# Cutover progress and secure credential rotation

October 15, 2026. The user authorized continuing the target-account cutover and
requested guidance on the exposed credentials. No credential values are stored
in this document.

## Verified preparation

- Target Google account: `ahmedtelkodsh@gmail.com`.
- Target project: `18fpuJuxe91AiJyt4_K3es8VwgjZ3Sp9GLQJex2925L_BPCsjCNflxo--`.
- Target editor source initially matched the published repository baseline after
  CRLF normalization: SHA-256
  `746dde4303d41136df65c852e78c72ebec18cb630a61d54b9798cfd5f8403303`.
- Applied only the reviewed archive-retry correction. Final normalized Code.gs
  SHA-256 matches local source:
  `716834498c53b9d131f69cf2aa3d3611b38d72095d65af00bad61fbe0b51796b`.
- The user completed the new project's Google authorization. Initial setup
  demonstrated that the old catalog was not editable by this account. The
  original catalog also showed the owner's storage-capacity block.
- Created a private copy named `ImageBot — ahmedtelkodsh — 2026-10-15` in the
  target account. “Share it with the same people” was left unchecked.
- Copied catalog ID: `1Uo-bl5I0NcC37DnZJjvQ4A4skPiJabAJI8xbYAdPn3g`.
- Verified exact clipboard-text equality of Records A1:AS6 (header plus five
  records), Events A1:H1000 (12 populated rows), and Embeddings A1:L200 (header
  only). Summary tab is retained; its formulas were not independently audited.
- Bound the target project to its owned catalog and accessible archive folder.
  `setupPoc()` completed successfully; target resources reported ready with five
  preserved records and external-call gates closed.
- Corrected output chat ID to `-1004296439122`; removed copied activation and
  verification markers. Used canonical `disableOutputPublishing()` before
  verification, because its verification precondition requires the gate
  property to be absent, not the literal string `false`.
- Verified through Telegram, without sending messages:
  - Bot: `SchoolImages_bot`, ID `8907501266`.
  - Input: `ImageBot_test`, ID `-1004439324869`, bot administrator.
  - Output: `Elardh_Images_Group`, ID `-1004296439122`, bot administrator.
- Stopped both old-account workers through their disable helpers; old project
  trigger inventory showed zero triggers.
- Ran guarded `deleteWebhook` with `drop_pending_updates: false`. Telegram
  confirmed an empty webhook URL and zero pending updates. Delivery is paused;
  this is intentional maintenance, not a restored live workflow.
- Temporary operator helpers were removed from both projects after use. No
  helper was added to the live versioned deployment. Local reproducible helper
  source remains in `tools/cutover_maintenance.gs`, outside the release bundle.
- Archived the old version-22 deployment after webhook pause to close its old
  public endpoint. The UI confirmed “Deployment successfully archived.” Its
  version history remains recoverable.

## Current handoff

Updated October 16: version 1 bootstrap failed after storing a `/dev` service URL.
A subsequent settings snapshot disclosed replacement credentials. The user then
confirmed another complete rotation. Version 2 now contains the reviewed bootstrap,
provider compatibility and safe-error repairs. Group verification, canonical URL
binding, bootstrap/webhook installation and both new-photo-only worker activations
completed successfully. Webhook queue is zero with no reported delivery error;
trigger inventory shows one tag worker and one publication worker. See
`workflow-debug-and-repair-2026-10-16.md` for detailed evidence and limits.
The final fresh-photo archive/enrichment/publication/search test is outstanding;
do not report end-to-end success.

The user must perform credential replacement through secure provider and Script
Properties UI steps. Do not ask for replacement values in chat or screenshots.
Do not read or emit settings snapshots while replacement values are entered.

## Credentials exposed earlier

| Property | Meaning | Replacement action |
|---|---|---|
| `BOT_TOKEN` | Telegram API credential for the existing bot | Revoke/regenerate through official @BotFather; retain the same bot |
| `GROQ_API_KEY` | Groq API access | Create a replacement dedicated key in Groq Console, update the property, revoke the exposed key |
| `WEBHOOK_SECRET` | Custom request-authentication value used in the webhook URL | Generate a fresh random hexadecimal value and replace it while webhook delivery is paused |

Gmail passwords were not part of the exposed settings snapshot. Script, Sheet,
folder, and numeric group IDs are resource identifiers; rotating them does not
replace the exposed authentication credentials.

## User steps

1. In official [@BotFather](https://t.me/BotFather), use `/revoke` and select
   `@SchoolImages_bot`. Follow its flow to obtain a replacement token for this
   same bot. Paste it directly into target Script Property `BOT_TOKEN`.
2. In [Groq API Keys](https://console.groq.com/keys), create a dedicated new key.
   Paste it directly into target Script Property `GROQ_API_KEY`, then revoke the
   exposed key. Confirm other applications do not depend on that key before
   revocation; the bot's old workers are already stopped.
3. In a local PowerShell window, generate a fresh webhook secret directly to the
   clipboard without printing it:

   ```powershell
   $secretBytes = New-Object byte[] 32
   $secretRng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
   $secretRng.GetBytes($secretBytes)
   Set-Clipboard (-join ($secretBytes | ForEach-Object { $_.ToString('x2') }))
   $secretRng.Dispose()
   ```

   Paste directly into target `WEBHOOK_SECRET`. This produces 64 hexadecimal
   characters, compatible with the existing validation contract.
4. Save the three changed properties. Do not manually enable workers, modify
   verification markers, or reinstall the old webhook. Tell the assistant only
   that the properties were updated, without sending their values.

## Remaining continuation after replacement

- Confirm rotation via credential-presence checks and sanitized provider
  results, without printing values. Reverify both groups because the bot-token
  fingerprint has changed.
- Inspect the target manifest and create a target-account versioned deployment
  with the reviewed source. Verify Code.gs and manifest identity before cutover.
- Update target `WEB_APP_URL` to its new deployment; never copy the credential
  URL into reports. Keep the old deployment retired.
- Recreate managed new-photo-only tagging and publication workers with current
  trigger UIDs and a fresh cutoff. Preserve pending Telegram updates and do not
  backfill old failed captures.
- Install the new webhook, verify queue/error status, and trace one newly
  authorized safe image through capture, integrity, Groq metadata, exactly one
  output publication, and authorized private `/search كتاب`.
- The older Groq JSON-validation errors and stranded September captures remain
  unresolved until separately tested/reconciled. Previously uploaded Telegram
  content is not automatically re-sent or replayed.

## Sources for rotation guidance

- [Telegram token handling](https://core.telegram.org/bots/tutorial)
- [Groq API key management](https://console.groq.com/keys)
