// Operator-only helpers. Keep this file outside the deployed source bundle.
// Run in the Apps Script editor during the approved account migration only.
function migrationPrepareTarget() {
  const targetSheetId = '1Uo-bl5I0NcC37DnZJjvQ4A4skPiJabAJI8xbYAdPn3g';
  const targetFolderId = '1cUpu3ZzOp0CAQ0f7s03-39Qaue4VFvCl';
  const sheet = SpreadsheetApp.openById(targetSheetId);
  DriveApp.getFolderById(targetFolderId).getName();
  if (!sheet.getSheetByName('Records') || !sheet.getSheetByName('Events')) {
    throw new Error('The copied catalog is missing its required ledger tabs.');
  }
  const properties = PropertiesService.getScriptProperties();
  properties.deleteProperty('GROQ_TAGGING_ENABLED');
  properties.deleteProperty('OUTPUT_PUBLISHING_ENABLED');
  properties.setProperty('SPREADSHEET_ID', targetSheetId);
  properties.setProperty('DRIVE_FOLDER_ID', targetFolderId);
  properties.setProperty('OUTPUT_CHAT_ID', '-1004296439122');
  ['GROQ_TAGGING_MODE', 'GROQ_TAGGING_AFTER_MESSAGE_DATE',
    'GROQ_TAGGING_TRIGGER_UID', 'OUTPUT_GROUPS_VERIFIED_FOR'].forEach(function (key) {
    properties.deleteProperty(key);
  });
  setupPoc();
  console.log(JSON.stringify({ target_resources_ready: true,
    records: sheet.getSheetByName('Records').getLastRow() - 1,
    tagging_enabled: false, publishing_enabled: false }));
}

function migrationVerifyGroups() {
  try {
    const result = verifyOutputGroups();
    console.log(JSON.stringify(result));
    return result;
  } catch (error) {
    throw new Error('Group verification failed; credential-bearing details suppressed.');
  }
}

function migrationPauseWebhook() {
  const properties = PropertiesService.getScriptProperties().getProperties();
  if (properties.GROQ_TAGGING_ENABLED === 'true' ||
      properties.OUTPUT_PUBLISHING_ENABLED === 'true') {
    throw new Error('Disable both workers before pausing delivery.');
  }
  try {
    const config = getConfig_(false);
    const records = SpreadsheetApp.openById(config.spreadsheetId).getSheetByName('Records');
    if (records && (recordsHaveTaggingClaims_(records) || recordsHavePublishingClaims_(records))) {
      throw new Error('A worker claim remains active.');
    }
    const result = telegram_('deleteWebhook', { drop_pending_updates: false }, config.botToken);
    if (!result || result.ok !== true) throw new Error('Pause was not confirmed.');
    const status = webhookInfo();
    if (!status.result || status.result.url) throw new Error('Webhook remains active.');
    console.log(JSON.stringify({ paused: true, pending_updates_preserved: true,
      pending_update_count: status.result.pending_update_count }));
    return true;
  } catch (error) {
    throw new Error('Webhook pause failed; credential-bearing details suppressed.');
  }
}
