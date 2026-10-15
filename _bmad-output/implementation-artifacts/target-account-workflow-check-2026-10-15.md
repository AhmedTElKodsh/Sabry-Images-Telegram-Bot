# Target-account workflow check — October 15, 2026

## Requested workflow

The user identified ImageBot_test as input, @SchoolImages_bot as the bot, and
Elardh_Images_Group as output. Private invitation URLs are intentionally omitted.
The user uploaded a photo of an open Arabic book to input and sent `/search كتاب`
in output, receiving no response.

## Verified observations

- The open Apps Script project belongs to the signed-in
  `ahmedtelkodsh@gmail.com` session. Project ID:
  `18fpuJuxe91AiJyt4_K3es8VwgjZ3Sp9GLQJex2925L_BPCsjCNflxo--`.
- Manage deployments reports no active or archived deployments and says the
  project has not been deployed yet.
- Triggers shows zero triggers; Executions shows zero executions in seven days.
- The saved `WEB_APP_URL` points to the earlier account's deployment, not a
  deployment of this project. The complete URL is unnecessary here.
- The saved `OUTPUT_CHAT_ID` is `1004296439122`, which fails the code's required
  canonical negative-group-ID format. The configured group-verification marker
  does not match the currently displayed input/output pair. These observations
  were repeated after navigating away from and back to Settings.
- `ALLOWED_CHAT_ID` is `-1004439324869`. Neither group title nor the current bot
  username was independently verified through Telegram in this check. Invitation
  hashes are not evidence of numeric group identity.
- Credential properties are present. Their values were suppressed in every
  settings inspection during this check; no secret values are recorded here.
- A save-error notification was visible: “Some error occurred while saving
  Script Properties. Please try again.” No Save action was performed by the
  assistant during this check.
- The target Gmail account can open the configured SchoolImages Telegram Archive
  folder. Its visible item list is empty; Drive reports 7.83 GB of 15 GB used.
  This establishes account-level access and available capacity, not execution
  authorization, successful writes, or deployment readiness.

## Search behavior confirmed in current repository code

`processUpdate_()` routes only private-chat messages to
`processPrivateCommand_()`. Group commands are not routed to that handler.
Therefore `/search كتاب` in the output group receives no bot response by design.
The current search workflow is a private chat with @SchoolImages_bot: `/start`,
then `/search كتاب`, subject to the configured numeric user allowlist and current
input-group membership. There must also be an eligible archived/searchable photo.

The output group receives enriched photo publications and searchable captions.
Telegram's own group-search interface is distinct from the bot's private
`/search` command. Group command support would be a separate behavior change.

## Proposed controlled continuation

Use this specific target project under `ahmedtelkodsh@gmail.com`, retain the
existing Telegram bot and intended groups, and preserve catalog history:

1. Verify bot identity and both exact numeric group IDs/membership without
   sending test messages. Correct the malformed output ID only after that
   verification. Reconcile deployed/source code and confirm catalog access.
2. Create a versioned web-app deployment executed by the target account, with
   the reviewed authentication boundary and archive retry fix. Prove source
   parity before moving webhook traffic.
3. Coordinate rotation of the previously exposed credentials through secure
   provider/Script Properties UI steps. Preserve pending updates, pause old
   workers safely, and avoid changing an active webhook secret before pausing
   delivery. Credential rotation authorization remains outstanding.
4. Recreate the managed trigger and verification state in this project. Do not
   trust copied trigger UIDs, old verification markers, or old activation state.
   Keep the new-only policy and avoid historical backfill.
5. Switch the webhook to this target deployment without dropping pending
   updates, then trace a newly authorized safe photo through archive, metadata,
   one output publication, and authorized private search.

No cloud configuration, deployment, trigger, webhook, ownership, or credential
was changed during this check. Completion of migration and activation requires
authorization of the concrete cutover above; this report is not live acceptance.

## Limits

The uploaded photo's current processing outcome was not established. The new
project has never executed, but the old endpoint may still receive updates.
The catalog could not be inspected under the target account in this browser
check. The older Groq JSON-validation errors remain a separate unresolved
integration concern. Secrets must not be pasted into chat or report artifacts.
