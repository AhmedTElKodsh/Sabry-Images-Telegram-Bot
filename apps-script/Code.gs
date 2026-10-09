const RECORD_HEADERS = [
  'record_id', 'chat_id', 'update_id', 'upload_time_utc',
  'upload_time_cairo', 'username', 'display_name', 'user_id',
  'message_id', 'before_line', 'after_line_caption', 'file_id',
  'file_unique_id', 'drive_file_id', 'drive_link', 'media_group_id',
  'processing_status', 'error', 'manual_tags', 'ai_tags', 'ai_caption',
  'tag_attempts', 'tag_next_attempt_utc', 'tag_model',
  'ai_metadata_json', 'enriched_at_utc', 'publish_eligible_at_utc',
  'publish_status', 'publish_attempts', 'publish_next_attempt_utc',
  'publish_claim_id', 'publish_lease_until_utc', 'output_chat_id',
  'output_message_id', 'published_at_utc', 'publish_error', 'publish_caption',
  'archive_mime_type', 'archive_byte_size', 'archive_sha256',
  'archive_status', 'archive_error', 'archive_completed_at_utc',
  'archive_attempts', 'archive_next_attempt_utc'
];

const RECORD_FIELD = {
  AI_METADATA_JSON: 24,
  ENRICHED_AT_UTC: 25,
  PUBLISH_ELIGIBLE_AT_UTC: 26,
  PUBLISH_STATUS: 27,
  PUBLISH_ATTEMPTS: 28,
  PUBLISH_NEXT_ATTEMPT_UTC: 29,
  PUBLISH_CLAIM_ID: 30,
  PUBLISH_LEASE_UNTIL_UTC: 31,
  OUTPUT_CHAT_ID: 32,
  OUTPUT_MESSAGE_ID: 33,
  PUBLISHED_AT_UTC: 34,
  PUBLISH_ERROR: 35,
  PUBLISH_CAPTION: 36,
  ARCHIVE_MIME_TYPE: 37,
  ARCHIVE_BYTE_SIZE: 38,
  ARCHIVE_SHA256: 39,
  ARCHIVE_STATUS: 40,
  ARCHIVE_ERROR: 41,
  ARCHIVE_COMPLETED_AT_UTC: 42,
  ARCHIVE_ATTEMPTS: 43,
  ARCHIVE_NEXT_ATTEMPT_UTC: 44
};

const EVENT_HEADERS = [
  'update_id', 'chat_id', 'message_id', 'user_id',
  'kind', 'text', 'record_id', 'received_at_utc'
];

const EMBEDDING_HEADERS = [
  'record_id', 'dataset_id', 'approved_by', 'approved_at',
  'approval_expires_at', 'model', 'dimensions', 'vector_json',
  'status', 'attempts', 'last_error', 'updated_at_utc'
];

const DEFAULT_GROQ_MODEL = 'qwen/qwen3.6-27b';
const WEBHOOK_SECRET_PARAMETER = 'telegram_webhook_key';
const GROQ_TAG_BATCH_SIZE = 2;
const GROQ_MAX_ATTEMPTS = 5;
const GROQ_LEASE_MINUTES = 10;
const PUBLISH_BATCH_SIZE = 2;
const PUBLISH_MAX_ATTEMPTS = 5;
const PUBLISH_LEASE_MINUTES = 10;
const PUBLISH_SETTLING_SECONDS = 20;
const OUTPUT_GROUP_VERIFICATION_PROPERTY = 'OUTPUT_GROUPS_VERIFIED_FOR';
const OUTPUT_PUBLISHING_ENABLED_PROPERTY = 'OUTPUT_PUBLISHING_ENABLED';
const GROQ_TAGGING_ENABLED_PROPERTY = 'GROQ_TAGGING_ENABLED';
const GROQ_TAGGING_MODE_PROPERTY = 'GROQ_TAGGING_MODE';
const GROQ_TAGGING_CUTOFF_PROPERTY = 'GROQ_TAGGING_AFTER_MESSAGE_DATE';
const GROQ_TAGGING_TRIGGER_UID_PROPERTY = 'GROQ_TAGGING_TRIGGER_UID';
const GROQ_TAGGING_MODE_NEW_PHOTOS_ONLY = 'NEW_PHOTOS_ONLY';
const GROQ_TAGGING_MODE_LEGACY_BACKFILL = 'LEGACY_BACKFILL';
const GROQ_MANAGED_PROPERTY_NAMES = [
  GROQ_TAGGING_ENABLED_PROPERTY,
  GROQ_TAGGING_MODE_PROPERTY,
  GROQ_TAGGING_CUTOFF_PROPERTY,
  GROQ_TAGGING_TRIGGER_UID_PROPERTY
];
const DEFAULT_GEMINI_EMBEDDING_MODEL = 'gemini-embedding-2';
const GEMINI_EMBEDDING_DIMENSIONS = 768;
const GEMINI_INDEX_BATCH_SIZE = 2;
const GEMINI_INDEX_LEASE_MINUTES = 10;
const ARCHIVE_MAX_ATTEMPTS = 5;

function setupPoc() {
  const properties = PropertiesService.getScriptProperties();
  const current = properties.getProperties();
  const setup = validateRequiredSetupProperties_(current);
  const spreadsheet = SpreadsheetApp.openById(setup.spreadsheetId);
  const driveFolder = DriveApp.getFolderById(setup.driveFolderId);
  // Resolve both operator-owned resources before any property or Sheet mutation.
  driveFolder.getName();
  if (!current.WEBHOOK_SECRET) {
    properties.setProperty('WEBHOOK_SECRET', Utilities.getUuid().replace(/-/g, ''));
  } else if (!isHexWebhookSecret_(current.WEBHOOK_SECRET)) {
    throw new Error('WEBHOOK_SECRET must be a hexadecimal secret of at least 32 characters.');
  }

  let records = spreadsheet.getSheetByName('Records');
  if (!records) {
    records = spreadsheet.getSheetByName('Sheet1');
    records = records ? records.setName('Records') : spreadsheet.insertSheet('Records');
  }
  prepareRecordsSheet_(records);
  prepareSheet_(
    spreadsheet.getSheetByName('Events') || spreadsheet.insertSheet('Events'),
    EVENT_HEADERS
  );
  prepareEmbeddingSheet_(
    spreadsheet.getSheetByName('Embeddings') || spreadsheet.insertSheet('Embeddings')
  );

  return {
    spreadsheet: spreadsheet.getUrl(),
    driveFolder: driveFolder.getUrl(),
    next: 'Confirm the configured group and bot administrator rights, then run bootstrapPoc().'
  };
}

function bootstrapPoc() {
  const setup = setupPoc();
  const properties = PropertiesService.getScriptProperties();
  const chatId = String(properties.getProperty('ALLOWED_CHAT_ID') || '').trim();
  if (!/^-[1-9]\d*$/.test(chatId)) {
    throw new Error(
      'Set ALLOWED_CHAT_ID to the explicit canonical Telegram input-group ID before bootstrap.'
    );
  }

  const webAppUrl = ScriptApp.getService().getUrl();
  if (!webAppUrl) throw new Error('Deploy this project as a web app first.');
  properties.setProperty('WEB_APP_URL', webAppUrl);
  const webhook = installWebhook();
  return {
    ok: webhook.ok,
    chat_id: chatId,
    web_app_url: webAppUrl,
    spreadsheet: setup.spreadsheet,
    drive_folder: setup.driveFolder
  };
}

function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, service: 'School Images Telegram Bot' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const initialConfig = getConfig_(false);
  if (!isHexWebhookSecret_(initialConfig.webhookSecret) ||
      webhookSecretFromEvent_(e) !== initialConfig.webhookSecret) {
    return HtmlService.createHtmlOutput('not found');
  }

  const update = JSON.parse(e.postData.contents);
  // ponytail: one global lock preserves POC ordering; split capture/search locks only
  // when measured Telegram volume makes this a bottleneck.
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Webhook is busy; retry this update.');
  try {
    const config = getConfig_(false);
    if (!config.allowedChatId) {
      return HtmlService.createHtmlOutput('ignored');
    }
    processUpdate_(update, config);
  } finally {
    lock.releaseLock();
  }
  // Telegram does not follow ContentService's mandatory 302 redirect.
  return HtmlService.createHtmlOutput('ok');
}

function processUpdate_(update, config) {
  const message = update.message;
  if (!message) return 'ignored';
  if (isPrivateMessage_(message)) {
    return processPrivateCommand_(update, message, config);
  }
  if (String(message.chat.id) !== config.allowedChatId) return 'ignored';

  const spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
  const records = spreadsheet.getSheetByName('Records');
  const events = spreadsheet.getSheetByName('Events');
  if (!records || !events) throw new Error('Run setupPoc() first.');
  if (hasUpdate_(events, update.update_id)) return 'duplicate';

  if (message.photo && message.photo.length) {
    const outcome = processPhoto_(update, message, records, events, config);
    reactSaved_(message, config);
    return outcome;
  }
  if (message.text && message.text.charAt(0) !== '/') {
    const outcome = processText_(update, message, records, events);
    if (outcome === 'associated-after') reactSaved_(message, config);
    return outcome;
  }
  return 'unsupported';
}

function processPrivateCommand_(update, message, config) {
  const command = privateCommand_(message);
  if (!command) return 'unsupported';
  if (!isSearchUser_(message, config.searchUserIds)) {
    sendText_(message.chat.id, 'This Telegram account is not authorized.', config);
    return 'unauthorized';
  }
  if (!isCurrentSearchGroupMember_(getUserId_(message), config)) {
    sendText_(message.chat.id, 'This Telegram account is not authorized.', config);
    return 'unauthorized';
  }

  const spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
  const records = spreadsheet.getSheetByName('Records');
  const events = spreadsheet.getSheetByName('Events');
  if (!records || !events) throw new Error('Run setupPoc() first.');
  if (hasUpdate_(events, update.update_id)) return 'duplicate';

  if (command.name === 'start') {
    sendText_(
      message.chat.id,
      'Authorized. Use /search followed by words from captions, adjacent text, or tags.',
      config
    );
    appendEvent_(events, update, message, 'command', command.name, '');
    return 'started';
  }

  if (!command.query) {
    sendText_(message.chat.id, 'Usage: /search activity with horses', config);
    appendEvent_(events, update, message, 'command', command.name, '');
    return 'search-usage';
  }
  if (command.query.length > 200) {
    sendText_(message.chat.id, 'Search text is too long. Keep it under 200 characters.', config);
    appendEvent_(events, update, message, 'command', command.query.slice(0, 200), '');
    return 'search-too-long';
  }

  const search = searchWithGeminiFallback_(spreadsheet, records, command.query, 5);
  const results = search.results;
  if (!results.length) {
    sendText_(
      message.chat.id,
      search.mode + ' · No matching photos found.',
      config
    );
  } else {
    results.forEach(function (result, index) {
      result.searchMode = search.mode;
      sendSearchPhoto_(message.chat.id, result, index, results.length, config);
    });
  }
  appendEvent_(events, update, message, 'command', command.query, '');
  return results.length ? 'search-results' : 'search-empty';
}

function processPhoto_(update, message, records, events, config) {
  const recordId = makeRecordId_(message);
  const existingRow = findRecordRow_(records, recordId);
  let existingValues = null;
  if (existingRow) {
    existingValues = records.getRange(
      existingRow, 1, 1, RECORD_HEADERS.length
    ).getValues()[0];
    const existingStatus = String(existingValues[RECORD_FIELD.ARCHIVE_STATUS] || '');
    if (existingStatus === 'ARCHIVED') {
      try {
        assertDriveArchiveRow_(existingValues);
      } catch (error) {
        existingValues[RECORD_FIELD.ARCHIVE_STATUS] = 'ARCHIVE_CONFLICT';
        existingValues[RECORD_FIELD.ARCHIVE_ERROR] = sheetText_(safeArchiveError_(error));
        records.getRange(existingRow, 1, 1, RECORD_HEADERS.length)
          .setValues([existingValues]);
        appendEvent_(events, update, message, 'photo', firstLine_(message.caption), recordId);
        throw error;
      }
      appendEvent_(events, update, message, 'photo', firstLine_(message.caption), recordId);
      return 'duplicate-record';
    }
    if (['ARCHIVE_RETRY', 'ARCHIVE_FAILED'].indexOf(existingStatus) === -1) {
      appendEvent_(events, update, message, 'photo', firstLine_(message.caption), recordId);
      if (['ARCHIVE_FAILED_TERMINAL', 'ARCHIVE_CONFLICT'].indexOf(existingStatus) !== -1) {
        throw new Error('Canonical archive is in terminal state: ' + existingStatus);
      }
      return 'duplicate-record';
    }
  }

  const userId = getUserId_(message);
  const beforeRow = findEventRow_(
    events, String(message.chat.id), message.message_id - 1, userId, 'text'
  );
  const beforeLine = beforeRow ? String(events.getRange(beforeRow, 6).getValue()) : '';
  const afterLine = firstLine_(message.caption);
  const safeAfterLine = sheetText_(afterLine);
  const photo = largestPhoto_(message.photo);
  const sentAt = new Date(message.date * 1000);
  const uploadTimeUtc = Utilities.formatDate(sentAt, 'UTC', "yyyy-MM-dd'T'HH:mm:ss'Z'");
  const row = existingRow
    ? existingValues
    : new Array(RECORD_HEADERS.length).fill('');
  row[0] = recordId;
  row[1] = String(message.chat.id);
  row[2] = String(update.update_id);
  row[3] = uploadTimeUtc;
  row[4] = Utilities.formatDate(sentAt, 'Africa/Cairo', 'yyyy-MM-dd HH:mm:ss');
  row[5] = sheetText_(message.from && message.from.username || '');
  row[6] = sheetText_(displayName_(message.from));
  row[7] = userId;
  row[8] = String(message.message_id);
  row[9] = beforeLine;
  row[10] = safeAfterLine;
  row[11] = photo.file_id;
  row[12] = photo.file_unique_id;
  row[15] = message.media_group_id || '';
  const archiveAttempts = Number(row[RECORD_FIELD.ARCHIVE_ATTEMPTS] || 0) + 1;
  row[RECORD_FIELD.ARCHIVE_ATTEMPTS] = archiveAttempts;
  let stored;
  try {
    stored = storePhoto_(photo, message, recordId, config);
  } catch (error) {
    const disposition = archiveFailureDisposition_(error, archiveAttempts);
    row[16] = disposition.status;
    row[17] = sheetText_(safeArchiveError_(error));
    row[RECORD_FIELD.PUBLISH_STATUS] = 'PUBLISH_NOT_ELIGIBLE';
    row[RECORD_FIELD.PUBLISH_ERROR] = 'Canonical archive was not completed.';
    row[RECORD_FIELD.ARCHIVE_STATUS] = disposition.status;
    row[RECORD_FIELD.ARCHIVE_ERROR] = sheetText_(safeArchiveError_(error));
    row[RECORD_FIELD.ARCHIVE_COMPLETED_AT_UTC] = '';
    row[RECORD_FIELD.ARCHIVE_NEXT_ATTEMPT_UTC] = disposition.nextAttempt;
    if (existingRow) {
      records.getRange(existingRow, 1, 1, RECORD_HEADERS.length).setValues([row]);
    } else {
      records.appendRow(row);
    }
    if (disposition.terminal) {
      appendEvent_(events, update, message, 'photo', safeAfterLine, recordId);
    }
    throw error;
  }
  row[13] = stored.id;
  row[14] = stored.url;
  row[RECORD_FIELD.ARCHIVE_MIME_TYPE] = stored.mimeType;
  row[RECORD_FIELD.ARCHIVE_BYTE_SIZE] = stored.byteSize;
  row[RECORD_FIELD.ARCHIVE_SHA256] = stored.sha256;
  row[RECORD_FIELD.ARCHIVE_STATUS] = 'ARCHIVED';
  row[RECORD_FIELD.ARCHIVE_ERROR] = '';
  row[RECORD_FIELD.ARCHIVE_COMPLETED_AT_UTC] = stored.completedAtUtc;
  row[RECORD_FIELD.ARCHIVE_NEXT_ATTEMPT_UTC] = '';
  row[16] = tagStatusForCapture_(config, uploadTimeUtc, row);
  row[17] = '';
  const publishEligibility = publicationEligibilityForCapture_(
    config, stored.completedAtUtc, uploadTimeUtc, row
  );
  row[RECORD_FIELD.PUBLISH_ELIGIBLE_AT_UTC] = publishEligibility.eligibleAt;
  row[RECORD_FIELD.PUBLISH_STATUS] = publishEligibility.status;
  row[RECORD_FIELD.OUTPUT_CHAT_ID] = publishEligibility.outputChatId;
  row[RECORD_FIELD.PUBLISH_ERROR] = sheetText_(publishEligibility.error);
  if (existingRow) {
    records.getRange(existingRow, 1, 1, RECORD_HEADERS.length).setValues([row]);
  } else {
    records.appendRow(row);
  }

  if (beforeRow) events.getRange(beforeRow, 7).setValue(recordId);
  appendEvent_(events, update, message, 'photo', safeAfterLine, recordId);
  return existingRow ? 'archive-recovered' : 'saved';
}

function processText_(update, message, records, events) {
  const text = sheetText_(firstLine_(message.text));
  const targetMessageId = afterTargetMessageId_(message);
  const previousRecordId = String(message.chat.id) + ':' + targetMessageId;
  const row = findRecordRow_(records, previousRecordId);
  let associatedRecordId = '';

  if (row) {
    const sameUser = String(records.getRange(row, 8).getValue()) === getUserId_(message);
    const afterIsEmpty = !records.getRange(row, 11).getValue();
    if (sameUser && afterIsEmpty) {
      records.getRange(row, 11).setValue(text);
      associatedRecordId = previousRecordId;
    }
  }

  appendEvent_(events, update, message, 'text', text, associatedRecordId);
  return associatedRecordId ? 'associated-after' : 'pending-before';
}

function storePhoto_(photo, message, recordId, config) {
  const fileInfo = telegram_('getFile', { file_id: photo.file_id }, config.botToken);
  const filePath = fileInfo.result.file_path;
  const extensionMatch = filePath.match(/\.[A-Za-z0-9]{1,5}$/);
  const extension = extensionMatch ? extensionMatch[0].toLowerCase() : '.jpg';
  const timestamp = Utilities.formatDate(
    new Date(message.date * 1000), 'UTC', 'yyyyMMdd_HHmmss'
  );
  const fileName = timestamp + '_' + recordId.replace(/[^0-9A-Za-z_-]/g, '_') + extension;
  const folder = DriveApp.getFolderById(config.driveFolderId);
  const downloaded = fetchOk_(
    'https://api.telegram.org/file/bot' + config.botToken + '/' + filePath
  ).getBlob().setName(fileName);
  const integrity = validateArchiveBlob_(downloaded);
  const existing = folder.getFilesByName(fileName);
  const matches = [];
  while (existing.hasNext() && matches.length < 2) matches.push(existing.next());
  if (matches.length > 1) {
    const duplicateError = new Error(
      'Multiple Drive objects match the canonical archive filename.'
    );
    duplicateError.archivePermanent = true;
    throw duplicateError;
  }
  let file;
  if (matches.length === 1) {
    file = matches[0];
    const existingIntegrity = validateArchiveBlob_(file.getBlob());
    if (existingIntegrity.sha256 !== integrity.sha256 ||
        existingIntegrity.byteSize !== integrity.byteSize ||
        existingIntegrity.mimeType !== integrity.mimeType) {
      const conflictError = new Error(
        'Existing canonical Drive object conflicts with downloaded bytes.'
      );
      conflictError.archivePermanent = true;
      throw conflictError;
    }
  } else {
    file = folder.createFile(downloaded);
  }
  if (!file.getId() || Number(file.getSize()) !== integrity.byteSize) {
    throw new Error('Drive did not confirm the canonical archive byte size.');
  }
  return {
    id: file.getId(),
    url: file.getUrl(),
    mimeType: integrity.mimeType,
    byteSize: integrity.byteSize,
    sha256: integrity.sha256,
    completedAtUtc: new Date().toISOString()
  };
}

function validateArchiveBlob_(blob) {
  if (!blob || typeof blob.getBytes !== 'function') {
    throw permanentArchiveError_('Telegram download did not return an image blob.');
  }
  const bytes = blob.getBytes();
  const mimeType = String(blob.getContentType() || '').toLowerCase();
  if (!bytes.length) throw permanentArchiveError_('Downloaded image is empty.');
  if (bytes.length > 20 * 1024 * 1024) {
    throw permanentArchiveError_('Downloaded image exceeds the Telegram hosted download limit.');
  }
  if (['image/jpeg', 'image/png', 'image/webp'].indexOf(mimeType) === -1) {
    throw permanentArchiveError_('Unsupported archived image type: ' + mimeType);
  }
  if (!imageSignatureMatchesMime_(bytes, mimeType)) {
    throw permanentArchiveError_('Downloaded bytes do not match the declared image type.');
  }
  return {
    mimeType: mimeType,
    byteSize: bytes.length,
    sha256: sha256Hex_(bytes)
  };
}

function imageSignatureMatchesMime_(bytes, mimeType) {
  const unsigned = bytes.map(function (value) { return (Number(value) + 256) % 256; });
  if (mimeType === 'image/jpeg') {
    return unsigned.length >= 4 && unsigned[0] === 0xFF && unsigned[1] === 0xD8 &&
      unsigned[unsigned.length - 2] === 0xFF && unsigned[unsigned.length - 1] === 0xD9;
  }
  if (mimeType === 'image/png') {
    const png = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    return unsigned.length >= png.length && png.every(function (value, index) {
      return unsigned[index] === value;
    });
  }
  if (mimeType === 'image/webp') {
    return unsigned.length >= 12 &&
      String.fromCharCode.apply(null, unsigned.slice(0, 4)) === 'RIFF' &&
      String.fromCharCode.apply(null, unsigned.slice(8, 12)) === 'WEBP';
  }
  return false;
}

function permanentArchiveError_(message) {
  const error = new Error(message);
  error.archivePermanent = true;
  return error;
}

function archiveFailureDisposition_(error, attempts) {
  const count = Number(attempts) || 0;
  const terminal = Boolean(error && error.archivePermanent) || count >= ARCHIVE_MAX_ATTEMPTS;
  return {
    status: terminal ? 'ARCHIVE_FAILED_TERMINAL' : 'ARCHIVE_RETRY',
    terminal: terminal,
    nextAttempt: terminal ? '' : new Date(
      Date.now() + Math.min(60, Math.pow(2, Math.max(1, count))) * 60000
    ).toISOString()
  };
}

function sha256Hex_(bytes) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes)
    .map(function (value) {
      return ('0' + ((Number(value) + 256) % 256).toString(16)).slice(-2);
    }).join('');
}

function safeArchiveError_(error) {
  return String(error && error.message || error || 'Archive operation failed.')
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 300);
}

function telegram_(method, payload, token) {
  const response = fetchOk_('https://api.telegram.org/bot' + token + '/' + method, {
    method: 'post',
    payload: payload,
    muteHttpExceptions: true
  });
  const body = JSON.parse(response.getContentText());
  if (!body.ok) throw new Error('Telegram ' + method + ' failed: ' + body.description);
  return body;
}

function fetchOk_(url, options) {
  const response = UrlFetchApp.fetch(url, options || { muteHttpExceptions: true });
  const status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error('HTTP ' + status + ': ' + response.getContentText().slice(0, 300));
  }
  return response;
}

function installWebhook() {
  const config = getConfig_(true);
  if (!config.webAppUrl) throw new Error('Run bootstrapPoc() after deploying the web app.');
  verifyConfiguredInputBotAdmin_(config);
  return telegram_('setWebhook', {
    url: webhookUrl_(config.webAppUrl, config.webhookSecret),
    allowed_updates: JSON.stringify(['message']),
    max_connections: 1,
    drop_pending_updates: false
  }, config.botToken);
}

function reactSaved_(message, config) {
  try {
    telegram_('setMessageReaction', {
      chat_id: String(message.chat.id),
      message_id: message.message_id,
      reaction: JSON.stringify([{ type: 'emoji', emoji: '\uD83D\uDC4D' }]),
      is_big: false
    }, config.botToken);
  } catch (error) {
    console.warn('Saved, but reaction failed: ' + error.message);
  }
}

function webhookInfo() {
  const config = getConfig_(false);
  const info = telegram_('getWebhookInfo', {}, config.botToken);
  const redacted = redactWebhookInfo_(info);
  console.log(JSON.stringify(redacted));
  return redacted;
}

function redactWebhookInfo_(info) {
  const safe = JSON.parse(JSON.stringify(info || {}));
  if (safe.result && safe.result.url) {
    safe.result.url = redactWebhookUrl_(safe.result.url);
  }
  return safe;
}

function redactWebhookUrl_(url) {
  const value = String(url || '');
  const fragmentIndex = value.indexOf('#');
  const withoutFragment = fragmentIndex === -1 ? value : value.slice(0, fragmentIndex);
  const queryMatch = withoutFragment.match(
    /^(https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec)\?.*$/
  );
  if (queryMatch) {
    return queryMatch[1] + '?' + WEBHOOK_SECRET_PARAMETER + '=[REDACTED]';
  }
  const legacyPathMatch = withoutFragment.match(
    /^(https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec)\/[^/?#]+$/
  );
  return legacyPathMatch ? legacyPathMatch[1] + '/[REDACTED]' : '[REDACTED]';
}

function auditArchive() {
  const config = getConfig_(false);
  const sheet = SpreadsheetApp.openById(config.spreadsheetId).getSheetByName('Records');
  if (!sheet) throw new Error('Records Sheet is missing.');
  const rows = sheet.getLastRow() < 2 ? [] : sheet.getRange(
    2, 1, sheet.getLastRow() - 1, RECORD_HEADERS.length
  ).getValues();
  const summary = {
    total: rows.length,
    healthy: 0,
    legacy_unverified: 0,
    archive_failed: 0,
    archive_retry: 0,
    archive_failed_terminal: 0,
    archive_conflict: 0,
    incomplete: 0,
    missing_object: 0,
    size_conflict: 0,
    mime_conflict: 0,
    hash_conflict: 0,
    integrity_conflict: 0,
    findings: []
  };
  rows.forEach(function (row) {
    let probe = null;
    if (row[13]) {
      try {
        const file = DriveApp.getFileById(String(row[13]));
        if (typeof file.isTrashed === 'function' && file.isTrashed()) {
          probe = { exists: false };
          throw new Error('Drive object is trashed.');
        }
        const actual = validateArchiveBlob_(file.getBlob());
        probe = {
          exists: true,
          byteSize: actual.byteSize,
          mimeType: actual.mimeType,
          sha256: actual.sha256
        };
      } catch (error) {
        probe = error && error.archivePermanent
          ? { exists: true, invalid: true }
          : { exists: false };
      }
    }
    const classification = archiveAuditClassification_(row, probe);
    summary[classification.toLowerCase()]++;
    if (classification !== 'HEALTHY') {
      summary.findings.push({ record_id: String(row[0]), state: classification });
    }
  });
  console.log(JSON.stringify(summary));
  return summary;
}

function archiveAuditClassification_(row, driveProbe) {
  const status = String(row && row[RECORD_FIELD.ARCHIVE_STATUS] || '');
  if (legacyArchiveRowIsUnverified_(row)) return 'LEGACY_UNVERIFIED';
  if (['ARCHIVE_FAILED', 'ARCHIVE_RETRY', 'ARCHIVE_FAILED_TERMINAL',
    'ARCHIVE_CONFLICT'].indexOf(status) !== -1) return status;
  if (!archiveRowIsReady_(row)) return 'INCOMPLETE';
  if (!driveProbe || driveProbe.exists !== true) return 'MISSING_OBJECT';
  if (driveProbe.invalid) return 'INTEGRITY_CONFLICT';
  if (Number(driveProbe.byteSize) !== Number(row[RECORD_FIELD.ARCHIVE_BYTE_SIZE])) {
    return 'SIZE_CONFLICT';
  }
  if (String(driveProbe.mimeType) !== String(row[RECORD_FIELD.ARCHIVE_MIME_TYPE])) {
    return 'MIME_CONFLICT';
  }
  if (String(driveProbe.sha256) !== String(row[RECORD_FIELD.ARCHIVE_SHA256])) {
    return 'HASH_CONFLICT';
  }
  return 'HEALTHY';
}

function discoverChatIds() {
  const config = getConfig_(false);
  const result = telegram_('getUpdates', { limit: 100 }, config.botToken).result;
  const chats = {};
  result.forEach(function (update) {
    const message = update.message;
    if (message && message.chat) {
      chats[String(message.chat.id)] = message.chat.title || message.chat.username || 'private chat';
    }
  });
  return Object.keys(chats).map(function (id) {
    return { chat_id: id, title: chats[id] };
  });
}

function getConfig_(requireChat) {
  const properties = PropertiesService.getScriptProperties().getProperties();
  const config = {
    botToken: properties.BOT_TOKEN,
    spreadsheetId: properties.SPREADSHEET_ID,
    driveFolderId: properties.DRIVE_FOLDER_ID,
    allowedChatId: properties.ALLOWED_CHAT_ID,
    searchUserIds: parseUserIds_(properties.SEARCH_USER_IDS || ''),
    webhookSecret: properties.WEBHOOK_SECRET,
    webAppUrl: properties.WEB_APP_URL,
    groqApiKey: properties.GROQ_API_KEY || '',
    groqModel: properties.GROQ_MODEL || DEFAULT_GROQ_MODEL,
    groqTaggingEnabled: properties.GROQ_TAGGING_ENABLED === 'true',
    groqTaggingEnabledRaw: String(properties.GROQ_TAGGING_ENABLED || ''),
    groqTaggingMode: String(properties[GROQ_TAGGING_MODE_PROPERTY] || ''),
    groqTaggingCutoff: String(properties[GROQ_TAGGING_CUTOFF_PROPERTY] || ''),
    groqTagTriggerUid: String(properties[GROQ_TAGGING_TRIGGER_UID_PROPERTY] || ''),
    outputChatId: String(properties.OUTPUT_CHAT_ID || '').trim(),
    outputPublishingEnabled: properties[OUTPUT_PUBLISHING_ENABLED_PROPERTY] === 'true',
    outputPublishingEnabledRaw: String(properties[OUTPUT_PUBLISHING_ENABLED_PROPERTY] || ''),
    outputGroupsVerifiedFor: String(properties[OUTPUT_GROUP_VERIFICATION_PROPERTY] || ''),
    botTokenFingerprint: properties.BOT_TOKEN ? botTokenFingerprint_(properties.BOT_TOKEN) : ''
  };
  ['botToken', 'spreadsheetId', 'driveFolderId', 'webhookSecret'].forEach(function (key) {
    if (!config[key]) throw new Error('Missing Script Property: ' + key);
  });
  if (requireChat && !config.allowedChatId) {
    throw new Error('Missing Script Property: ALLOWED_CHAT_ID');
  }
  return config;
}

function validateRequiredSetupProperties_(properties) {
  const required = [
    'BOT_TOKEN', 'SPREADSHEET_ID', 'DRIVE_FOLDER_ID', 'ALLOWED_CHAT_ID',
    'SEARCH_USER_IDS'
  ];
  required.forEach(function (name) {
    if (!String(properties[name] || '').trim()) {
      throw new Error('Missing Script Property: ' + name);
    }
  });
  const allowedChatId = String(properties.ALLOWED_CHAT_ID).trim();
  if (!/^-[1-9]\d*$/.test(allowedChatId)) {
    throw new Error('ALLOWED_CHAT_ID must be an explicit canonical Telegram group ID.');
  }
  const searchUserIds = parseUserIdsStrict_(properties.SEARCH_USER_IDS);
  return {
    botToken: String(properties.BOT_TOKEN),
    spreadsheetId: String(properties.SPREADSHEET_ID).trim(),
    driveFolderId: String(properties.DRIVE_FOLDER_ID).trim(),
    allowedChatId: allowedChatId,
    searchUserIds: searchUserIds
  };
}

function parseUserIdsStrict_(value) {
  const ids = String(value || '').split(/[\s,]+/).filter(Boolean);
  if (!ids.length || ids.some(function (id) { return !/^\d+$/.test(id); })) {
    throw new Error('SEARCH_USER_IDS must contain one or more numeric Telegram user IDs.');
  }
  if (new Set(ids).size !== ids.length) {
    throw new Error('SEARCH_USER_IDS must not contain duplicate Telegram user IDs.');
  }
  return ids;
}

function isHexWebhookSecret_(value) {
  return /^[0-9a-f]{32,}$/i.test(String(value || ''));
}

function webhookUrl_(webAppUrl, secret) {
  if (!isHexWebhookSecret_(secret)) throw new Error('WEBHOOK_SECRET is invalid.');
  const base = String(webAppUrl || '').replace(/\/+$/, '');
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(base)) {
    throw new Error('WEB_APP_URL must be the canonical Apps Script /exec URL.');
  }
  return base + '?' + WEBHOOK_SECRET_PARAMETER + '=' + encodeURIComponent(String(secret));
}

function parseOutputGroupConfig_(config) {
  if (!config.outputPublishingEnabled) {
    throw new Error('Output publishing is not explicitly enabled.');
  }
  return requireVerifiedOutputGroups_(config);
}

function parseOutputGroupIds_(config) {
  const inputChatId = String(config.allowedChatId || '').trim();
  const outputChatId = String(config.outputChatId || '').trim();
  if (!/^-[1-9]\d*$/.test(inputChatId)) {
    throw new Error('ALLOWED_CHAT_ID must be an explicit Telegram group ID.');
  }
  if (!/^-[1-9]\d*$/.test(outputChatId)) {
    throw new Error('OUTPUT_CHAT_ID must be an explicit Telegram group ID.');
  }
  if (inputChatId === outputChatId) {
    throw new Error('OUTPUT_CHAT_ID must be different from ALLOWED_CHAT_ID.');
  }
  return { inputChatId: inputChatId, outputChatId: outputChatId };
}

function botTokenFingerprint_(token) {
  if (!token) throw new Error('BOT_TOKEN is required to verify group identity.');
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(token),
    Utilities.Charset.UTF_8
  );
  return digest.map(function (value) {
    return ('0' + ((Number(value) + 256) % 256).toString(16)).slice(-2);
  }).join('');
}

function outputGroupVerificationMarker_(groups, tokenFingerprint) {
  const fingerprint = String(tokenFingerprint || '');
  if (!/^[0-9a-f]{64}$/.test(fingerprint)) {
    throw new Error('Current BOT_TOKEN fingerprint is missing or invalid.');
  }
  return 'v2|' + groups.inputChatId + '|' + groups.outputChatId + '|' + fingerprint;
}

function requireVerifiedOutputGroups_(config) {
  const groups = parseOutputGroupIds_(config);
  const expected = outputGroupVerificationMarker_(groups, config.botTokenFingerprint);
  if (String(config.outputGroupsVerifiedFor || '') !== expected) {
    throw new Error(
      'Input/output groups have not been verified for these exact IDs and current bot token.'
    );
  }
  return groups;
}

function verifyOutputGroups() {
  const properties = PropertiesService.getScriptProperties();
  const initialLock = LockService.getScriptLock();
  if (!initialLock.tryLock(10000)) {
    throw new Error('Could not lock configuration for group verification.');
  }
  let config;
  let groups;
  try {
    config = getConfig_(true);
    groups = parseOutputGroupIds_(config);
    requirePublishingDisabledForVerification_(properties.getProperties());
    if (publicationTriggers_().length) {
      throw new Error(
        'Publishing trigger still exists. Run disableOutputPublishing() before verification.'
      );
    }
    const verifySheet = SpreadsheetApp.openById(config.spreadsheetId).getSheetByName('Records');
    if (verifySheet && recordsHavePublishingClaims_(verifySheet)) {
      throw new Error('A publication claim is still in flight. Wait before group verification.');
    }
    properties.deleteProperty(OUTPUT_GROUP_VERIFICATION_PROPERTY);
  } finally {
    initialLock.releaseLock();
  }

  const liveVerification = verifyCurrentBotMemberships_(config, groups);
  const me = liveVerification.me;
  const verifiedChats = liveVerification.chats;

  const finalLock = LockService.getScriptLock();
  if (!finalLock.tryLock(10000)) {
    throw new Error('Could not lock configuration to save group verification.');
  }
  let marker;
  try {
    const currentConfig = getConfig_(true);
    const currentGroups = parseOutputGroupIds_(currentConfig);
    requirePublishingDisabledForVerification_(properties.getProperties());
    if (publicationTriggers_().length ||
        currentGroups.inputChatId !== groups.inputChatId ||
        currentGroups.outputChatId !== groups.outputChatId ||
        currentConfig.botTokenFingerprint !== config.botTokenFingerprint) {
      throw new Error('Bot/group configuration changed during verification; run it again.');
    }
    const finalSheet = SpreadsheetApp.openById(currentConfig.spreadsheetId)
      .getSheetByName('Records');
    if (finalSheet && recordsHavePublishingClaims_(finalSheet)) {
      throw new Error('A publication claim started during verification; run it again.');
    }
    marker = outputGroupVerificationMarker_(groups, config.botTokenFingerprint);
    properties.setProperty(OUTPUT_GROUP_VERIFICATION_PROPERTY, marker);
  } finally {
    finalLock.releaseLock();
  }
  return {
    verified: true,
    bot: {
      id: String(me.id),
      username: String(me.username || ''),
      display_name: String(me.first_name || '')
    },
    input_group: verifiedChats[0],
    output_group: verifiedChats[1],
    verification_version: 'v2'
  };
}

function verifyCurrentBotMemberships_(config, groups) {
  const me = telegram_('getMe', {}, config.botToken).result;
  if (!me || me.is_bot !== true || !/^[1-9]\d*$/.test(String(me.id || ''))) {
    throw new Error('Telegram getMe did not return a valid bot identity.');
  }
  const chats = [groups.inputChatId, groups.outputChatId].map(function (chatId) {
    const chat = telegram_('getChat', { chat_id: chatId }, config.botToken).result;
    const membership = telegram_('getChatMember', {
      chat_id: chatId,
      user_id: String(me.id)
    }, config.botToken).result;
    return validateTelegramGroupForBot_(chatId, chat, membership, String(me.id));
  });
  return { me: me, chats: chats };
}

function verifyConfiguredInputBotAdmin_(config) {
  const me = telegram_('getMe', {}, config.botToken).result;
  if (!me || me.is_bot !== true || !/^[1-9]\d*$/.test(String(me.id || ''))) {
    throw new Error('Telegram getMe did not return a valid bot identity.');
  }
  const chat = telegram_('getChat', {
    chat_id: config.allowedChatId
  }, config.botToken).result;
  const membership = telegram_('getChatMember', {
    chat_id: config.allowedChatId,
    user_id: String(me.id)
  }, config.botToken).result;
  return validateTelegramGroupForBot_(
    config.allowedChatId, chat, membership, String(me.id)
  );
}

function validateTelegramGroupForBot_(chatId, chat, membership, botId) {
  if (!chat || ['group', 'supergroup'].indexOf(String(chat.type)) === -1) {
    throw new Error('Telegram chat is not a group or supergroup: ' + chatId);
  }
  if (String(chat.id) !== String(chatId)) {
    throw new Error('Telegram returned a different chat ID for ' + chatId + '.');
  }
  if (!membership || !membership.user || String(membership.user.id) !== String(botId) ||
      ['administrator', 'creator'].indexOf(String(membership.status)) === -1) {
    throw new Error('The current bot must be administrator or creator in group ' + chatId + '.');
  }
  return {
    chat_id: String(chatId),
    title: String(chat.title || ''),
    type: String(chat.type),
    bot_membership: String(membership.status)
  };
}

function telegramMembershipAllowsSearch_(membership) {
  if (!membership || !membership.user || !/^[1-9]\d*$/.test(
    String(membership.user.id || '')
  )) return false;
  const status = String(membership.status || '');
  if (['creator', 'administrator', 'member'].indexOf(status) !== -1) return true;
  return status === 'restricted' && membership.is_member === true;
}

function isCurrentSearchGroupMember_(userId, config) {
  try {
    const membership = telegram_('getChatMember', {
      chat_id: config.allowedChatId,
      user_id: String(userId)
    }, config.botToken).result;
    return telegramMembershipAllowsSearch_(membership) &&
      String(membership.user.id) === String(userId);
  } catch (error) {
    console.warn('Telegram membership verification failed; archive access denied.');
    return false;
  }
}

function requirePublishingDisabledForVerification_(propertyValues) {
  const raw = String(propertyValues.OUTPUT_PUBLISHING_ENABLED || '');
  if (raw) {
    throw new Error(
      'Output publishing must be disabled before group verification. Run disableOutputPublishing().'
    );
  }
  return true;
}

function publicationTriggers_() {
  return ScriptApp.getProjectTriggers().filter(function (trigger) {
    return trigger.getHandlerFunction() === 'processPendingPublications';
  });
}

function enableOutputPublishing() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Could not lock output-publishing activation.');
  try {
    const config = getConfig_(true);
    const groups = requireVerifiedOutputGroups_(config);
    if (!config.groqTaggingEnabled || !config.groqApiKey) {
      throw new Error('Groq enrichment must be enabled and configured first.');
    }
    requireNewPhotoOnlyGroqActivation_(config);
    verifyCurrentBotMemberships_(config, groups);
    const sheet = SpreadsheetApp.openById(config.spreadsheetId).getSheetByName('Records');
    if (!sheet) throw new Error('Records Sheet is missing.');
    if (recordsHavePublishingClaims_(sheet)) {
      throw new Error('A publication claim is still in flight. Wait before activation.');
    }
    if (handlerTriggers_('processPendingTags').length !== 1) {
      throw new Error('Groq worker trigger is missing or duplicated. Repair Groq activation first.');
    }
    const properties = PropertiesService.getScriptProperties();
    try {
      closeManagedWorkerFailClosed_(
        OUTPUT_PUBLISHING_ENABLED_PROPERTY, 'processPendingPublications'
      );
      replaceTimeTrigger_('processPendingPublications');
      properties.setProperty(OUTPUT_PUBLISHING_ENABLED_PROPERTY, 'true');
      if (handlerTriggers_('processPendingPublications').length !== 1) {
        throw new Error('Output worker postcondition failed.');
      }
    } catch (error) {
      try {
        closeManagedWorkerFailClosed_(
          OUTPUT_PUBLISHING_ENABLED_PROPERTY, 'processPendingPublications'
        );
      } catch (cleanupError) {
        throw new Error(error.message + ' Fail-closed cleanup also failed: ' + cleanupError.message);
      }
      throw error;
    }
    return {
      enabled: true,
      input_chat_id: groups.inputChatId,
      output_chat_id: groups.outputChatId,
      trigger_created: true,
      backfilled: 0
    };
  } finally {
    lock.releaseLock();
  }
}

function disableOutputPublishing() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Could not lock output-publishing disablement.');
  try {
    const config = getConfig_(true);
    const sheet = SpreadsheetApp.openById(config.spreadsheetId).getSheetByName('Records');
    if (sheet && recordsHavePublishingClaims_(sheet)) {
      throw new Error('A publication claim is still in flight. Wait before disabling.');
    }
    const removed = disableManagedWorker_(
      OUTPUT_PUBLISHING_ENABLED_PROPERTY, 'processPendingPublications'
    );
    return { enabled: false, triggers_removed: removed };
  } finally {
    lock.releaseLock();
  }
}

function recordsHavePublishingClaims_(sheet) {
  if (sheet.getLastRow() < 2) return false;
  const values = sheet.getRange(
    2, RECORD_FIELD.PUBLISH_STATUS + 1, sheet.getLastRow() - 1,
    RECORD_FIELD.PUBLISH_LEASE_UNTIL_UTC - RECORD_FIELD.PUBLISH_STATUS + 1
  ).getValues();
  const now = new Date();
  return values.some(function (row) {
    if (String(row[0]) !== 'PUBLISHING') return false;
    const lease = new Date(row[RECORD_FIELD.PUBLISH_LEASE_UNTIL_UTC -
      RECORD_FIELD.PUBLISH_STATUS]);
    return isNaN(lease.getTime()) || lease > now;
  });
}

function handlerTriggers_(handlerName) {
  return ScriptApp.getProjectTriggers().filter(function (trigger) {
    return trigger.getHandlerFunction() === handlerName;
  });
}

function replaceTimeTrigger_(handlerName) {
  let trigger;
  try {
    deleteHandlerTriggers_(handlerName);
    if (handlerTriggers_(handlerName).length) {
      throw new Error('Could not remove every existing trigger for ' + handlerName + '.');
    }
    trigger = ScriptApp.newTrigger(handlerName).timeBased().everyMinutes(5).create();
    if (handlerTriggers_(handlerName).length !== 1) {
      throw new Error('Could not establish exactly one trigger for ' + handlerName + '.');
    }
    return { created: true, trigger: trigger };
  } catch (error) {
    bestEffortDeleteHandlerTriggers_(handlerName);
    throw error;
  }
}

function deleteHandlerTriggers_(handlerName) {
  let removed = 0;
  handlerTriggers_(handlerName).forEach(function (trigger) {
    ScriptApp.deleteTrigger(trigger);
    removed++;
  });
  return removed;
}

function bestEffortDeleteHandlerTriggers_(handlerName) {
  try {
    handlerTriggers_(handlerName).forEach(function (trigger) {
      try { ScriptApp.deleteTrigger(trigger); } catch (ignored) {}
    });
  } catch (ignored) {}
}

function disableManagedWorker_(propertyName, handlerName) {
  return closeManagedWorkerFailClosed_(propertyName, handlerName);
}

function closeManagedWorkerFailClosed_(propertyName, handlerName) {
  const properties = PropertiesService.getScriptProperties();
  const errors = [];
  try {
    properties.deleteProperty(propertyName);
  } catch (error) {
    errors.push('gate: ' + error.message);
  }
  let removed = 0;
  try {
    handlerTriggers_(handlerName).forEach(function (trigger) {
      try {
        ScriptApp.deleteTrigger(trigger);
        removed++;
      } catch (error) {
        errors.push('trigger: ' + error.message);
      }
    });
  } catch (error) {
    errors.push('trigger-list: ' + error.message);
  }
  let gateClosed = false;
  try {
    gateClosed = properties.getProperty(propertyName) !== 'true';
  } catch (error) {
    errors.push('gate-verify: ' + error.message);
  }
  let remaining = null;
  try {
    remaining = handlerTriggers_(handlerName).length;
  } catch (error) {
    errors.push('trigger-verify: ' + error.message);
  }
  // Either independently verified barrier is enough to prevent an external call.
  // Report cleanup errors, but never skip attempting the other barrier.
  if ((!gateClosed && remaining !== 0) || remaining === null || errors.length) {
    throw new Error(
      'Could not fully verify fail-closed cleanup for ' + handlerName + ': ' +
      errors.join('; ')
    );
  }
  return removed;
}

function requireNewPhotoOnlyGroqActivation_(config) {
  const activation = groqActivationState_(config);
  if (!activation.valid || activation.mode !== GROQ_TAGGING_MODE_NEW_PHOTOS_ONLY) {
    throw new Error('A valid new-photo-only Groq activation is required for output publishing.');
  }
  return activation;
}

function tagStatusForCapture_(config, messageSentAtUtc, archivedRow) {
  if (!archiveRowIsReady_(archivedRow)) return 'TAG_NOT_ELIGIBLE';
  const activation = groqActivationState_(config);
  const row = new Array(RECORD_HEADERS.length).fill('');
  row[3] = messageSentAtUtc;
  return groqRowIsInsideActivationScope_(row, activation)
    ? 'TAG_PENDING'
    : 'TAG_NOT_ELIGIBLE';
}

function publicationEligibilityForCapture_(config, capturedAtUtc, messageSentAtUtc, archivedRow) {
  if (!archiveRowIsReady_(archivedRow)) {
    return {
      eligibleAt: '', status: 'PUBLISH_NOT_ELIGIBLE', outputChatId: '',
      error: 'Canonical archive was not completed.'
    };
  }
  if (!config.outputPublishingEnabled) {
    return { eligibleAt: '', status: '', outputChatId: '', error: '' };
  }
  try {
    const groups = parseOutputGroupConfig_(config);
    if (!config.groqTaggingEnabled || !config.groqApiKey) {
      throw new Error('Groq enrichment must be enabled before output publishing.');
    }
    const activation = requireNewPhotoOnlyGroqActivation_(config);
    const captureRow = new Array(RECORD_HEADERS.length).fill('');
    captureRow[3] = messageSentAtUtc;
    if (!groqRowIsInsideActivationScope_(captureRow, activation)) {
      throw new Error('Photo was sent before the new-photo-only Groq activation cutoff.');
    }
    return {
      eligibleAt: capturedAtUtc,
      status: 'PUBLISH_WAITING_FOR_ENRICHMENT',
      outputChatId: groups.outputChatId,
      error: ''
    };
  } catch (error) {
    return {
      eligibleAt: '',
      status: 'PUBLISH_NOT_ELIGIBLE',
      outputChatId: '',
      error: safePublishError_(error)
    };
  }
}

function archiveRowIsReady_(row) {
  if (!row || String(row[RECORD_FIELD.ARCHIVE_STATUS]) !== 'ARCHIVED' ||
      String(row[RECORD_FIELD.ARCHIVE_ERROR] || '') ||
      !String(row[13] || '') ||
      ['image/jpeg', 'image/png', 'image/webp'].indexOf(
        String(row[RECORD_FIELD.ARCHIVE_MIME_TYPE] || '').toLowerCase()
      ) === -1 ||
      !Number.isSafeInteger(Number(row[RECORD_FIELD.ARCHIVE_BYTE_SIZE])) ||
      Number(row[RECORD_FIELD.ARCHIVE_BYTE_SIZE]) <= 0 ||
      !/^[0-9a-f]{64}$/.test(String(row[RECORD_FIELD.ARCHIVE_SHA256] || ''))) {
    return false;
  }
  const attempts = Number(row[RECORD_FIELD.ARCHIVE_ATTEMPTS]);
  return Number.isSafeInteger(attempts) && attempts >= 1 && attempts <= ARCHIVE_MAX_ATTEMPTS &&
    !String(row[RECORD_FIELD.ARCHIVE_NEXT_ATTEMPT_UTC] || '') &&
    Boolean(canonicalIsoInstant_(row[RECORD_FIELD.ARCHIVE_COMPLETED_AT_UTC]));
}

function recordSearchIsAllowed_(row, allowLegacyUnverified) {
  if (archiveRowIsReady_(row)) return true;
  return allowLegacyUnverified === true && legacyArchiveRowIsUnverified_(row);
}

function legacyArchiveRowIsUnverified_(row) {
  if (!row || String(row[RECORD_FIELD.ARCHIVE_STATUS] || '') || !row[13]) return false;
  return [
    RECORD_FIELD.ARCHIVE_MIME_TYPE, RECORD_FIELD.ARCHIVE_BYTE_SIZE,
    RECORD_FIELD.ARCHIVE_SHA256, RECORD_FIELD.ARCHIVE_ERROR,
    RECORD_FIELD.ARCHIVE_COMPLETED_AT_UTC, RECORD_FIELD.ARCHIVE_ATTEMPTS,
    RECORD_FIELD.ARCHIVE_NEXT_ATTEMPT_UTC
  ].every(function (index) { return !String(row[index] || ''); });
}

function parseGeminiPilotConfig_(properties, now) {
  const current = now || new Date();
  const required = [
    'GEMINI_API_KEY', 'GEMINI_PILOT_DATASET_ID', 'GEMINI_PILOT_APPROVED_BY',
    'GEMINI_PILOT_APPROVED_AT', 'GEMINI_PILOT_EXPIRES_AT',
    'GEMINI_PILOT_RECORD_IDS', 'GEMINI_PILOT_QUERIES'
  ];
  if (properties.GEMINI_PILOT_ENABLED !== 'true') {
    throw new Error('Gemini pilot is not explicitly enabled.');
  }
  if (properties.GEMINI_INPUTS_CONFIRMED_NON_SENSITIVE !== 'true') {
    throw new Error('Gemini inputs are not confirmed non-sensitive.');
  }
  required.forEach(function (name) {
    if (!String(properties[name] || '').trim()) {
      throw new Error('Missing Script Property: ' + name);
    }
  });

  const model = String(
    properties.GEMINI_EMBEDDING_MODEL || DEFAULT_GEMINI_EMBEDDING_MODEL
  ).trim();
  if (model !== DEFAULT_GEMINI_EMBEDDING_MODEL) {
    throw new Error('Unsupported GEMINI_EMBEDDING_MODEL. Explicit re-indexing is required.');
  }
  const approvedAt = parseIsoDate_(properties.GEMINI_PILOT_APPROVED_AT);
  const expiresAt = parseIsoDate_(properties.GEMINI_PILOT_EXPIRES_AT);
  if (approvedAt > current || expiresAt <= current || expiresAt <= approvedAt) {
    throw new Error('Gemini pilot approval is not currently valid.');
  }

  const recordIds = parsePilotRecordIds_(properties.GEMINI_PILOT_RECORD_IDS);
  const queryLines = String(properties.GEMINI_PILOT_QUERIES).split(/\r?\n/);
  const queries = queryLines.map(normalizeSearchText_).filter(Boolean);
  if (!queries.length || queries.length !== queryLines.length) {
    throw new Error('Gemini pilot query allowlist contains an empty query.');
  }
  if (new Set(queries).size !== queries.length) {
    throw new Error('Gemini pilot query allowlist contains duplicate normalized queries.');
  }

  return {
    apiKey: String(properties.GEMINI_API_KEY),
    datasetId: String(properties.GEMINI_PILOT_DATASET_ID).trim(),
    approvedBy: String(properties.GEMINI_PILOT_APPROVED_BY).trim(),
    approvedAt: approvedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    model: model,
    dimensions: GEMINI_EMBEDDING_DIMENSIONS,
    recordIds: recordIds,
    recordIdSet: new Set(recordIds),
    queries: queries,
    querySet: new Set(queries)
  };
}

function parseIsoDate_(value) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(text)) {
    throw new Error('Pilot approval dates must be ISO-8601 timestamps with a timezone.');
  }
  const parsed = new Date(text);
  if (isNaN(parsed.getTime())) throw new Error('Pilot approval date is invalid.');
  return parsed;
}

function parsePilotRecordIds_(value) {
  const parts = String(value || '').split(',').map(function (item) {
    return String(item).trim();
  });
  const ids = uniqueNonEmpty_(parts);
  if (!ids.length || ids.length > 100 || parts.some(function (item) { return !item; }) ||
      ids.length !== parts.length) {
    throw new Error('Gemini pilot record allowlist must contain 1 to 100 unique identifiers.');
  }
  return ids;
}

function parseGeminiPurgeConfig_(properties) {
  const datasetId = String(properties.GEMINI_PILOT_DATASET_ID || '').trim();
  const approvedBy = String(properties.GEMINI_PILOT_APPROVED_BY || '').trim();
  if (!datasetId || !approvedBy) throw new Error('Missing Gemini pilot approval provenance.');
  const model = String(
    properties.GEMINI_EMBEDDING_MODEL || DEFAULT_GEMINI_EMBEDDING_MODEL
  ).trim();
  if (model !== DEFAULT_GEMINI_EMBEDDING_MODEL) {
    throw new Error('Unsupported GEMINI_EMBEDDING_MODEL.');
  }
  const approvedAt = parseIsoDate_(properties.GEMINI_PILOT_APPROVED_AT);
  const expiresAt = parseIsoDate_(properties.GEMINI_PILOT_EXPIRES_AT);
  if (approvedAt > new Date() || expiresAt <= approvedAt) {
    throw new Error('Gemini pilot approval dates are inconsistent.');
  }
  const recordIds = parsePilotRecordIds_(properties.GEMINI_PILOT_RECORD_IDS);
  return {
    datasetId: datasetId,
    approvedBy: approvedBy,
    approvedAt: approvedAt,
    expiresAt: expiresAt,
    model: model,
    recordIdSet: new Set(recordIds)
  };
}

function uniqueNonEmpty_(values) {
  const seen = {};
  return values.map(function (value) { return String(value || '').trim(); })
    .filter(function (value) {
      if (!value || seen[value]) return false;
      seen[value] = true;
      return true;
    });
}

function indexApprovedGeminiPilot() {
  const properties = PropertiesService.getScriptProperties().getProperties();
  const config = parseGeminiPilotConfig_(properties, new Date());
  const spreadsheetId = String(properties.SPREADSHEET_ID || '');
  if (!spreadsheetId) throw new Error('Missing Script Property: SPREADSHEET_ID');
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const records = spreadsheet.getSheetByName('Records');
  const embeddings = spreadsheet.getSheetByName('Embeddings');
  if (!records || !embeddings) throw new Error('Run setupPoc() first.');

  const claims = claimGeminiPilotRows_(records, embeddings, config, GEMINI_INDEX_BATCH_SIZE);
  const outcome = { claimed: 0, ready: 0, failed: 0 };
  claims.forEach(function (claim) {
    try {
      const liveConfig = revalidateGeminiClaim_(spreadsheet, claim, config);
      const vector = geminiEmbedDriveImage_(claim.driveFileId, liveConfig, claim);
      revalidateGeminiClaim_(spreadsheet, claim, config);
      if (finishGeminiPilotClaim_(spreadsheet, claim, config, 'READY', vector, '')) {
        outcome.ready++;
        outcome.claimed++;
      }
    } catch (error) {
      if (finishGeminiPilotClaim_(
        spreadsheet, claim, config, 'ERROR', [], safeGeminiError_(error)
      )) {
        outcome.failed++;
        outcome.claimed++;
      }
    }
  });
  return outcome;
}

function revalidateGeminiClaim_(spreadsheet, claim, expected) {
  const live = parseGeminiPilotConfig_(
    PropertiesService.getScriptProperties().getProperties(), new Date()
  );
  if (!live.recordIdSet.has(claim.recordId) || live.datasetId !== expected.datasetId ||
      live.approvedBy !== expected.approvedBy || live.approvedAt !== expected.approvedAt ||
      live.expiresAt !== expected.expiresAt || live.model !== expected.model ||
      live.dimensions !== expected.dimensions) {
    throw new Error('Gemini pilot approval changed after the index claim.');
  }
  const records = spreadsheet.getSheetByName('Records');
  if (!records) throw new Error('Records Sheet is missing.');
  const matches = records.getLastRow() < 2 ? [] : records.getRange(
    2, 1, records.getLastRow() - 1, RECORD_HEADERS.length
  ).getValues().filter(function (row) { return String(row[0]) === claim.recordId; });
  if (matches.length !== 1 || !archiveEvidenceMatchesRow_(claim, matches[0])) {
    throw new Error('Approved source record changed after the index claim.');
  }
  return live;
}

function claimGeminiPilotRows_(records, embeddings, config, limit) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Could not lock the Gemini pilot index.');
  try {
    const recordValues = records.getLastRow() < 2 ? [] : records.getRange(
      2, 1, records.getLastRow() - 1, RECORD_HEADERS.length
    ).getValues();
    const recordsById = {};
    const recordCounts = {};
    recordValues.forEach(function (row) {
      const id = String(row[0]);
      recordCounts[id] = (recordCounts[id] || 0) + 1;
      recordsById[id] = row;
    });
    config.recordIds.forEach(function (recordId) {
      if (recordCounts[recordId] !== 1 || !archiveRowIsReady_(recordsById[recordId])) {
        throw new Error(('Approved record is missing, duplicated, or lacks a Drive file: ' +
          recordId).slice(0, 300));
      }
    });
    const embeddingValues = embeddings.getLastRow() < 2 ? [] : embeddings.getRange(
      2, 1, embeddings.getLastRow() - 1, EMBEDDING_HEADERS.length
    ).getValues();
    const latest = latestEmbeddingRows_(embeddingValues);
    const now = new Date();
    const claims = [];

    config.recordIds.some(function (recordId) {
      if (claims.length >= limit) return true;
      const record = recordsById[recordId];
      if (!record || !archiveRowIsReady_(record)) return false;
      const key = recordId + '\n' + config.model;
      const current = latest[key];
      if (current && String(current.values[8]) === 'READY' &&
          embeddingApprovalMatches_(current.values, config) &&
          storedEmbeddingVectorIsValid_(current.values, config.dimensions)) return false;
      if (current && String(current.values[8]) === 'INDEXING') {
        const updated = new Date(current.values[11]);
        if (!isNaN(updated.getTime()) &&
            updated > new Date(now.getTime() - GEMINI_INDEX_LEASE_MINUTES * 60000)) {
          return false;
        }
      }
      const attempts = Number(current && current.values[9] || 0) + 1;
      const values = [
        recordId, sheetText_(config.datasetId), sheetText_(config.approvedBy), config.approvedAt,
        config.expiresAt, config.model, config.dimensions, '',
        'INDEXING', attempts, '', now.toISOString()
      ];
      let rowNumber;
      if (current) {
        rowNumber = current.index + 2;
        embeddings.getRange(rowNumber, 1, 1, EMBEDDING_HEADERS.length).setValues([values]);
      } else {
        embeddings.appendRow(values);
        rowNumber = embeddings.getLastRow();
      }
      claims.push({
        recordId: recordId,
        driveFileId: String(record[13]),
        archiveMimeType: String(record[RECORD_FIELD.ARCHIVE_MIME_TYPE]),
        archiveByteSize: Number(record[RECORD_FIELD.ARCHIVE_BYTE_SIZE]),
        archiveSha256: String(record[RECORD_FIELD.ARCHIVE_SHA256]),
        archiveCompletedAtUtc: String(record[RECORD_FIELD.ARCHIVE_COMPLETED_AT_UTC]),
        attempts: attempts,
        rowNumber: rowNumber
      });
      return false;
    });
    return claims;
  } finally {
    lock.releaseLock();
  }
}

function finishGeminiPilotClaim_(spreadsheet, claim, config, status, vector, errorText) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Could not lock the Gemini pilot result.');
  try {
    const embeddings = spreadsheet.getSheetByName('Embeddings');
    const records = spreadsheet.getSheetByName('Records');
    if (!embeddings || !records) throw new Error('Gemini pilot Sheets are missing.');
    const recordMatches = records.getLastRow() < 2 ? [] : records.getRange(
      2, 1, records.getLastRow() - 1, RECORD_HEADERS.length
    ).getValues().filter(function (candidate) {
      return String(candidate[0]) === claim.recordId;
    });
    if (recordMatches.length !== 1 ||
        !archiveEvidenceMatchesRow_(claim, recordMatches[0])) return false;
    const row = embeddings.getRange(
      claim.rowNumber, 1, 1, EMBEDDING_HEADERS.length
    ).getValues()[0];
    if (String(row[0]) !== claim.recordId || String(row[5]) !== config.model ||
        String(row[8]) !== 'INDEXING' || Number(row[9]) !== claim.attempts) return false;
    row[7] = status === 'READY' ? JSON.stringify(vector) : '';
    row[8] = status;
    row[10] = status === 'ERROR' ? sheetText_(String(errorText || '').slice(0, 300)) : '';
    row[11] = new Date().toISOString();
    embeddings.getRange(
      claim.rowNumber, 1, 1, EMBEDDING_HEADERS.length
    ).setValues([row]);
    return true;
  } finally {
    lock.releaseLock();
  }
}

function geminiEmbedDriveImage_(driveFileId, config, archiveEvidence) {
  const blob = assertDriveArchiveEvidence_(archiveEvidence).blob;
  const mimeType = String(blob.getContentType() || '').toLowerCase();
  if (['image/jpeg', 'image/png'].indexOf(mimeType) === -1) {
    throw new Error('Unsupported Gemini pilot image type.');
  }
  return geminiEmbedPart_({
    inline_data: {
      mime_type: mimeType,
      data: Utilities.base64Encode(blob.getBytes())
    }
  }, config);
}

function geminiEmbedText_(query, config) {
  return geminiEmbedPart_({ text: query }, config);
}

function geminiEmbedPart_(part, config) {
  const response = UrlFetchApp.fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/' +
      encodeURIComponent(config.model) + ':embedContent',
    {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-goog-api-key': config.apiKey },
      payload: JSON.stringify({
        model: 'models/' + config.model,
        content: { parts: [part] },
        embedContentConfig: { outputDimensionality: config.dimensions }
      }),
      muteHttpExceptions: true
    }
  );
  const status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    const error = new Error('Gemini HTTP ' + status + ': request failed.');
    error.httpStatus = status;
    throw error;
  }
  let body;
  try {
    body = JSON.parse(response.getContentText());
  } catch (error) {
    throw new Error('Gemini returned invalid response JSON.');
  }
  return validateEmbeddingVector_(body && body.embedding && body.embedding.values, config.dimensions);
}

function validateEmbeddingVector_(value, dimensions) {
  if (!Array.isArray(value) || value.length !== dimensions) {
    throw new Error('Embedding dimensions do not match the configured model space.');
  }
  if (value.some(function (number) {
    return typeof number !== 'number' || !isFinite(number);
  })) {
    throw new Error('Embedding contains a non-finite value.');
  }
  if (!value.some(function (number) { return number !== 0; })) {
    throw new Error('Embedding magnitude is zero.');
  }
  return value.slice();
}

function storedEmbeddingVectorIsValid_(row, dimensions) {
  try {
    validateEmbeddingVector_(JSON.parse(String(row[7] || '')), dimensions);
    return true;
  } catch (error) {
    return false;
  }
}

function safeGeminiError_(error) {
  return String(error && error.message || 'Gemini pilot request failed.')
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 300);
}

function embeddingApprovalMatches_(row, config) {
  const approvedAt = new Date(row[3]);
  const expiresAt = new Date(row[4]);
  return !isNaN(approvedAt.getTime()) && !isNaN(expiresAt.getTime()) &&
    readSheetText_(row[1]) === config.datasetId &&
    readSheetText_(row[2]) === config.approvedBy &&
    approvedAt.toISOString() === config.approvedAt &&
    expiresAt.toISOString() === config.expiresAt &&
    String(row[5]) === config.model && Number(row[6]) === config.dimensions;
}

function latestEmbeddingRows_(rows) {
  const latest = {};
  rows.forEach(function (row, index) {
    const key = String(row[0]) + '\n' + String(row[5]);
    const updated = new Date(row[11]).getTime();
    const current = latest[key];
    const currentTime = current ? new Date(current.values[11]).getTime() : NaN;
    const currentUpdated = isFinite(currentTime) ? currentTime : -Infinity;
    if (!current || (isFinite(updated) ? updated : -Infinity) >= currentUpdated) {
      latest[key] = { values: row, index: index };
    }
  });
  return latest;
}

function purgeRevokedGeminiPilotEmbeddings() {
  const properties = PropertiesService.getScriptProperties().getProperties();
  const spreadsheetId = String(properties.SPREADSHEET_ID || '');
  if (!spreadsheetId) throw new Error('Missing Script Property: SPREADSHEET_ID');
  const config = parseGeminiPurgeConfig_(properties);
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const records = spreadsheet.getSheetByName('Records');
  const embeddings = spreadsheet.getSheetByName('Embeddings');
  if (!records || !embeddings) throw new Error('Records or Embeddings Sheet is missing.');
  if (embeddings.getLastRow() < 1 || !headersMatch_(
    embeddings.getRange(1, 1, 1, embeddings.getLastColumn()).getValues()[0],
    EMBEDDING_HEADERS
  )) throw new Error('Embeddings header does not match the required contract.');
  if (embeddings.getLastRow() < 2) return { revoked: 0 };
  const recordIdValues = records.getLastRow() < 2 ? [] : records.getRange(
    2, 1, records.getLastRow() - 1, 1
  ).getValues().map(function (row) { return String(row[0]); });
  const recordIds = new Set(recordIdValues);
  const embeddingIds = new Set(embeddings.getRange(
    2, 1, embeddings.getLastRow() - 1, 1
  ).getValues().map(function (row) { return String(row[0]); }));
  config.recordIdSet.forEach(function (recordId) {
    const count = recordIdValues.filter(function (value) { return value === recordId; }).length;
    if (count > 1 || (!count && !embeddingIds.has(recordId))) {
      throw new Error(('Gemini pilot record allowlist is ambiguous or unknown: ' +
        recordId).slice(0, 300));
    }
  });

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Could not lock the Gemini pilot purge.');
  try {
    const values = embeddings.getRange(
      2, 1, embeddings.getLastRow() - 1, EMBEDDING_HEADERS.length
    ).getValues();
    let revoked = 0;
    values.forEach(function (row) {
      const revoke = String(row[5]) !== config.model ||
        !config.recordIdSet.has(String(row[0])) || !recordIds.has(String(row[0])) ||
        readSheetText_(row[1]) !== config.datasetId ||
        readSheetText_(row[2]) !== config.approvedBy ||
        isNaN(new Date(row[3]).getTime()) ||
        new Date(row[3]).toISOString() !== config.approvedAt.toISOString() ||
        isNaN(new Date(row[4]).getTime()) ||
        new Date(row[4]).toISOString() !== config.expiresAt.toISOString() ||
        config.expiresAt <= new Date();
      if (revoke && (row[7] || String(row[8]) !== 'REVOKED')) {
        row[7] = '';
        row[8] = 'REVOKED';
        row[10] = 'Approval expired, changed, or source Photo Record is unavailable.';
        row[11] = new Date().toISOString();
        revoked++;
      }
    });
    if (revoked) embeddings.getRange(
      2, 1, values.length, EMBEDDING_HEADERS.length
    ).setValues(values);
    return { revoked: revoked };
  } finally {
    lock.releaseLock();
  }
}

function enableGroqTagging() {
  const config = getConfig_(false);
  if (!config.groqApiKey) {
    throw new Error(
      'Missing Script Property: GROQ_API_KEY. Add it in Project Settings, then run again.'
    );
  }
  setupPoc();
  const activation = activateGroqMode_(GROQ_TAGGING_MODE_LEGACY_BACKFILL);
  const queued = queueExistingPhotosForTagging();
  const firstBatch = processPendingTags();
  return {
    enabled: true,
    model: config.groqModel,
    queued: queued,
    trigger_created: activation.triggerCreated,
    first_batch: firstBatch
  };
}

function enableGroqTaggingForNewPhotosOnly() {
  const config = getConfig_(false);
  if (!config.groqApiKey) {
    throw new Error(
      'Missing Script Property: GROQ_API_KEY. Add it in Project Settings, then run again.'
    );
  }
  setupPoc();
  const activation = activateGroqMode_(GROQ_TAGGING_MODE_NEW_PHOTOS_ONLY);
  return {
    enabled: true,
    model: config.groqModel,
    mode: activation.mode,
    activated_after_message_date: activation.cutoff,
    resumed: activation.resumed,
    queued: 0,
    processed_immediately: 0,
    trigger_created: activation.triggerCreated
  };
}

function activateGroqMode_(requestedMode) {
  if ([GROQ_TAGGING_MODE_NEW_PHOTOS_ONLY, GROQ_TAGGING_MODE_LEGACY_BACKFILL]
      .indexOf(requestedMode) === -1) {
    throw new Error('Unknown Groq activation mode.');
  }
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Could not lock Groq activation state.');
  try {
    const properties = PropertiesService.getScriptProperties();
    const values = properties.getProperties();
    const spreadsheetId = String(values.SPREADSHEET_ID || '');
    if (!spreadsheetId) throw new Error('Missing Script Property: SPREADSHEET_ID');
    if (!String(values.GROQ_API_KEY || '')) {
      throw new Error('Missing Script Property: GROQ_API_KEY');
    }
    const sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName('Records');
    if (!sheet) throw new Error('Records Sheet is missing.');
    if (recordsHaveTaggingClaims_(sheet)) {
      throw new Error('A TAGGING claim is still in flight. Wait for it to finish before activation.');
    }
    if (recordsHavePublishingClaims_(sheet)) {
      throw new Error('A publication claim is still in flight. Wait for it to finish before activation.');
    }
    if (requestedMode === GROQ_TAGGING_MODE_NEW_PHOTOS_ONLY) {
      const webhookInfo = telegram_('getWebhookInfo', {}, String(values.BOT_TOKEN || '')).result;
      if (!webhookInfo || Number(webhookInfo.pending_update_count || 0) !== 0) {
        throw new Error(
          'Telegram still has pending webhook updates. Wait for pending_update_count=0 and retry.'
        );
      }
    }

    const cutoffNow = new Date(Math.ceil(Date.now() / 1000) * 1000).toISOString();
    const plan = planGroqActivation_(requestedMode, values, cutoffNow);
    const cutoff = plan.cutoff;

    try {
      closeManagedWorkerFailClosed_(GROQ_TAGGING_ENABLED_PROPERTY, 'processPendingTags');
      const triggerResult = replaceTimeTrigger_('processPendingTags');
      const triggerUid = String(triggerResult.trigger.getUniqueId() || '');
      if (!triggerUid) throw new Error('Groq worker trigger UID is unavailable.');
      const managed = {};
      managed[GROQ_TAGGING_ENABLED_PROPERTY] = 'true';
      managed[GROQ_TAGGING_MODE_PROPERTY] = requestedMode;
      managed[GROQ_TAGGING_TRIGGER_UID_PROPERTY] = triggerUid;
      if (cutoff) managed[GROQ_TAGGING_CUTOFF_PROPERTY] = cutoff;
      properties.setProperties(managed);
      if (!cutoff) properties.deleteProperty(GROQ_TAGGING_CUTOFF_PROPERTY);
      if (requestedMode === GROQ_TAGGING_MODE_NEW_PHOTOS_ONLY) {
        markHistoricalTagRowsNotEligible_(sheet, cutoff);
      }
      if (handlerTriggers_('processPendingTags').length !== 1 ||
          properties.getProperty(GROQ_TAGGING_ENABLED_PROPERTY) !== 'true') {
        throw new Error('Groq worker activation postcondition failed.');
      }
    } catch (error) {
      let cleanupError = null;
      try {
        closeManagedWorkerFailClosed_(GROQ_TAGGING_ENABLED_PROPERTY, 'processPendingTags');
      } catch (failure) {
        cleanupError = failure;
      }
      forceDisableGroqManagedState_(properties);
      if (cleanupError) {
        throw new Error(error.message + ' Fail-closed cleanup also failed: ' + cleanupError.message);
      }
      throw error;
    }
    return {
      mode: requestedMode,
      cutoff: cutoff,
      resumed: plan.resumed,
      triggerCreated: true
    };
  } finally {
    lock.releaseLock();
  }
}

function markHistoricalTagRowsNotEligible_(sheet, cutoff) {
  if (sheet.getLastRow() < 2) return 0;
  const rowCount = sheet.getLastRow() - 1;
  const values = sheet.getRange(2, 1, rowCount, RECORD_HEADERS.length).getValues();
  let changed = 0;
  values.forEach(function (row) {
    const status = String(row[16] || '');
    if (['', 'SAVED', 'TAG_PENDING', 'TAG_RETRY', 'TAGGING'].indexOf(status) !== -1) {
      const sentAt = new Date(String(row[3] || ''));
      if (isNaN(sentAt.getTime()) || sentAt <= new Date(cutoff)) {
        row[16] = 'TAG_NOT_ELIGIBLE';
        row[17] = 'Captured before new-photo-only Groq activation.';
        row[22] = '';
        changed++;
      }
    }
  });
  if (changed) {
    sheet.getRange(2, 17, rowCount, 7).setValues(values.map(function (row) {
      return row.slice(16, 23);
    }));
  }
  return changed;
}

function forceDisableGroqManagedState_(properties) {
  GROQ_MANAGED_PROPERTY_NAMES.forEach(function (key) {
    properties.deleteProperty(key);
  });
}

function restoreGroqManagedProperties_(properties, previousValues) {
  GROQ_MANAGED_PROPERTY_NAMES.forEach(function (key) {
    if (Object.prototype.hasOwnProperty.call(previousValues, key) &&
        String(previousValues[key]) !== '') {
      properties.setProperty(key, String(previousValues[key]));
    } else {
      properties.deleteProperty(key);
    }
  });
}

function planGroqActivation_(requestedMode, values, nowIso) {
  const existingMode = String(values[GROQ_TAGGING_MODE_PROPERTY] || '');
  const existingCutoff = canonicalIsoInstant_(values[GROQ_TAGGING_CUTOFF_PROPERTY]);
  const alreadyEnabled = String(values[GROQ_TAGGING_ENABLED_PROPERTY] || '') === 'true';
  const knownExistingMode = [
    GROQ_TAGGING_MODE_NEW_PHOTOS_ONLY, GROQ_TAGGING_MODE_LEGACY_BACKFILL
  ].indexOf(existingMode) !== -1;
  if (alreadyEnabled && (!knownExistingMode || existingMode !== requestedMode ||
      (existingMode === GROQ_TAGGING_MODE_NEW_PHOTOS_ONLY && !existingCutoff))) {
    throw new Error('Groq is enabled in a different or invalid mode. Disable it first.');
  }
  if (requestedMode === GROQ_TAGGING_MODE_NEW_PHOTOS_ONLY &&
      alreadyEnabled && existingMode === requestedMode && existingCutoff) {
    return { cutoff: existingCutoff, resumed: true };
  }
  const newCutoff = requestedMode === GROQ_TAGGING_MODE_NEW_PHOTOS_ONLY
    ? canonicalIsoInstant_(nowIso)
    : '';
  if (requestedMode === GROQ_TAGGING_MODE_NEW_PHOTOS_ONLY && !newCutoff) {
    throw new Error('Could not establish a canonical Groq activation cutoff.');
  }
  return { cutoff: newCutoff, resumed: false };
}

function recordsHaveTaggingClaims_(sheet) {
  if (sheet.getLastRow() < 2) return false;
  return taggingClaimsAreInFlight_(
    sheet.getRange(2, 17, sheet.getLastRow() - 1, 7).getValues(), new Date()
  );
}

function taggingClaimsAreInFlight_(statusRows, now) {
  return statusRows.some(function (row) {
    if (String(row[0]) !== 'TAGGING') return false;
    const lease = new Date(row[6]);
    return isNaN(lease.getTime()) || lease > now;
  });
}

function canonicalIsoInstant_(value) {
  const text = String(value === null || value === undefined ? '' : value).trim();
  if (!text) return '';
  const parsed = new Date(text);
  if (isNaN(parsed.getTime())) return '';
  return parsed.toISOString() === text ? text : '';
}

function groqActivationState_(config) {
  if (!config || config.groqTaggingEnabled !== true) return { valid: false, mode: '' };
  if (config.groqTaggingMode === GROQ_TAGGING_MODE_LEGACY_BACKFILL) {
    return { valid: true, mode: GROQ_TAGGING_MODE_LEGACY_BACKFILL, cutoff: '' };
  }
  if (config.groqTaggingMode === GROQ_TAGGING_MODE_NEW_PHOTOS_ONLY) {
    const cutoff = canonicalIsoInstant_(config.groqTaggingCutoff);
    return cutoff
      ? { valid: true, mode: GROQ_TAGGING_MODE_NEW_PHOTOS_ONLY, cutoff: cutoff }
      : { valid: false, mode: GROQ_TAGGING_MODE_NEW_PHOTOS_ONLY };
  }
  return { valid: false, mode: String(config.groqTaggingMode || '') };
}

function groqRowIsInsideActivationScope_(row, activation) {
  if (!activation || !activation.valid) return false;
  if (activation.mode === GROQ_TAGGING_MODE_LEGACY_BACKFILL) return true;
  const sentAt = new Date(String(row[3] || ''));
  const cutoff = new Date(activation.cutoff);
  return !isNaN(sentAt.getTime()) && !isNaN(cutoff.getTime()) && sentAt > cutoff;
}

function disableGroqTagging() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Could not lock Groq disablement.');
  try {
    const config = getConfig_(false);
    const sheet = SpreadsheetApp.openById(config.spreadsheetId).getSheetByName('Records');
    if (sheet && recordsHaveTaggingClaims_(sheet)) {
      throw new Error('A TAGGING claim is still in flight. Wait before disabling.');
    }
    const removed = disableManagedWorker_(
      GROQ_TAGGING_ENABLED_PROPERTY, 'processPendingTags'
    );
    return { enabled: false, triggers_removed: removed };
  } finally {
    lock.releaseLock();
  }
}

function queueExistingPhotosForTagging() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Could not lock Records for tag queueing.');
  try {
    const config = getConfig_(false);
    const activation = groqActivationState_(config);
    if (!activation.valid || activation.mode !== GROQ_TAGGING_MODE_LEGACY_BACKFILL) {
      throw new Error('Historical tag queueing requires explicit LEGACY_BACKFILL mode.');
    }
    const spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
    const sheet = spreadsheet.getSheetByName('Records');
    if (!sheet || sheet.getLastRow() < 2) return 0;
    const rowCount = sheet.getLastRow() - 1;
    const values = sheet.getRange(2, 1, rowCount, RECORD_HEADERS.length).getValues();
    let queued = 0;
    values.forEach(function (row) {
      const status = String(row[16] || '');
      if (
        archiveRowIsReady_(row) &&
        !row[19] &&
        !row[20] &&
        (status === '' || status === 'SAVED')
      ) {
        row[16] = 'TAG_PENDING';
        row[17] = '';
        queued++;
      }
    });
    if (queued) {
      sheet.getRange(2, 17, rowCount, 2).setValues(values.map(function (row) {
        return [row[16], row[17]];
      }));
    }
    return queued;
  } finally {
    lock.releaseLock();
  }
}

function processPendingTags(event) {
  const config = getConfig_(false);
  if (!config.groqTaggingEnabled) {
    return { processed: 0, skipped: 'Groq tagging is disabled' };
  }
  if (!triggerInvocationIsCurrent_(event, config.groqTagTriggerUid)) {
    return { processed: 0, skipped: 'Stale or unmanaged Groq trigger' };
  }
  if (!config.groqApiKey) {
    return { processed: 0, skipped: 'Missing GROQ_API_KEY' };
  }

  const claims = claimPendingTags_(config, GROQ_TAG_BATCH_SIZE);
  let tagged = 0;
  let retrying = 0;
  let failed = 0;
  claims.forEach(function (claim) {
    const claimConfig = claim.config;
    try {
      revalidateTagClaim_(claimConfig, claim);
      const tags = groqTagDriveImage_(claim.driveFileId, claimConfig, claim);
      finishTagClaim_(claimConfig, claim, {
        status: 'TAGGED',
        aiTags: tags.aiTags,
        aiCaption: tags.aiCaption,
        metadataJson: tags.metadataJson,
        error: '',
        nextAttempt: ''
      });
      tagged++;
    } catch (error) {
      const retry = shouldRetryGroqError_(error, claim.attempts);
      finishTagClaim_(claimConfig, claim, {
        status: retry ? 'TAG_RETRY' : 'TAG_ERROR',
        aiTags: '',
        aiCaption: '',
        metadataJson: '',
        error: safeTagError_(error),
        nextAttempt: retry
          ? new Date(Date.now() + groqBackoffMinutes_(claim.attempts) * 60000)
          : ''
      });
      if (retry) retrying++;
      else failed++;
    }
  });
  const outcome = {
    processed: claims.length,
    tagged: tagged,
    retrying: retrying,
    failed: failed
  };
  return outcome;
}

function triggerInvocationIsCurrent_(event, expectedTriggerUid) {
  if (!event) return true;
  const expected = String(expectedTriggerUid || '');
  const actual = String(event.triggerUid || '');
  return Boolean(expected) && actual === expected;
}

function processPendingPublications() {
  const config = getConfig_(true);
  const groups = parseOutputGroupConfig_(config);
  const sheet = SpreadsheetApp.openById(config.spreadsheetId).getSheetByName('Records');
  if (!sheet) throw new Error('Records Sheet is missing.');
  const claims = claimPendingPublications_(sheet, groups, PUBLISH_BATCH_SIZE);
  const outcome = { processed: 0, published: 0, retrying: 0, failed: 0, unknown: 0 };
  claims.forEach(function (claim) {
    let result;
    try {
      const live = revalidatePublishClaim_(sheet, claim, groups);
      result = telegramPublishPhoto_(claim, live.config.botToken, live.archiveBlob);
      if (finishPublishClaim_(sheet, claim, {
        status: 'PUBLISHED',
        messageId: result.messageId,
        error: '',
        nextAttempt: ''
      })) {
        outcome.processed++;
        outcome.published++;
      }
    } catch (error) {
      const disposition = publishErrorDisposition_(error, claim.attempts);
      if (finishPublishClaim_(sheet, claim, disposition)) {
        outcome.processed++;
        if (disposition.status === 'PUBLISH_RETRY') outcome.retrying++;
        else if (disposition.status === 'PUBLISH_UNKNOWN') outcome.unknown++;
        else outcome.failed++;
      }
    }
  });
  return outcome;
}

function claimPendingPublications_(sheet, groups, limit) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return [];
  try {
    let liveGroups;
    try {
      liveGroups = parseOutputGroupConfig_(getConfig_(true));
    } catch (error) {
      return [];
    }
    if (liveGroups.inputChatId !== groups.inputChatId ||
        liveGroups.outputChatId !== groups.outputChatId) return [];
    if (sheet.getLastRow() < 2) return [];
    const now = new Date();
    const values = sheet.getRange(
      2, 1, sheet.getLastRow() - 1, RECORD_HEADERS.length
    ).getValues();
    const claims = [];
    values.forEach(function (row, index) {
      const status = String(row[RECORD_FIELD.PUBLISH_STATUS] || '');
      const attempts = Number(row[RECORD_FIELD.PUBLISH_ATTEMPTS] || 0);
      const leaseUntil = row[RECORD_FIELD.PUBLISH_LEASE_UNTIL_UTC]
        ? new Date(row[RECORD_FIELD.PUBLISH_LEASE_UNTIL_UTC])
        : null;
      if (status === 'PUBLISHING' &&
          (!leaseUntil || isNaN(leaseUntil.getTime()) || leaseUntil <= now)) {
        row[RECORD_FIELD.PUBLISH_STATUS] = 'PUBLISH_UNKNOWN';
        row[RECORD_FIELD.PUBLISH_CLAIM_ID] = '';
        row[RECORD_FIELD.PUBLISH_LEASE_UNTIL_UTC] = '';
        row[RECORD_FIELD.PUBLISH_ERROR] =
          'Publication claim expired; delivery may have occurred and was not replayed.';
        sheet.getRange(index + 2, 1, 1, RECORD_HEADERS.length).setValues([row]);
        return;
      }
      if (claims.length >= limit || ['PUBLISH_PENDING', 'PUBLISH_RETRY'].indexOf(status) === -1) {
        return;
      }
      const nextAttempt = row[RECORD_FIELD.PUBLISH_NEXT_ATTEMPT_UTC]
        ? new Date(row[RECORD_FIELD.PUBLISH_NEXT_ATTEMPT_UTC])
        : null;
      if (nextAttempt && !isNaN(nextAttempt.getTime()) && nextAttempt > now) return;
      if (attempts >= PUBLISH_MAX_ATTEMPTS) {
        row[RECORD_FIELD.PUBLISH_STATUS] = 'PUBLISH_FAILED';
        row[RECORD_FIELD.PUBLISH_ERROR] = 'Maximum publication attempts reached.';
        sheet.getRange(index + 2, 1, 1, RECORD_HEADERS.length).setValues([row]);
        return;
      }
      if (!hasPublicationSettled_(row[RECORD_FIELD.PUBLISH_ELIGIBLE_AT_UTC], now)) {
        return;
      }
      const boundaryError = publicationRowBoundaryError_(row, liveGroups);
      if (boundaryError) {
        row[RECORD_FIELD.PUBLISH_STATUS] = 'PUBLISH_FAILED';
        row[RECORD_FIELD.PUBLISH_ERROR] = boundaryError;
        sheet.getRange(index + 2, 1, 1, RECORD_HEADERS.length).setValues([row]);
        return;
      }
      const caption = buildPublishCaption_(
        row[RECORD_FIELD.AI_METADATA_JSON],
        [readSheetText_(row[18]), readSheetText_(row[9]), readSheetText_(row[10])]
          .filter(Boolean).join(' · ')
      );
      const claimId = Utilities.getUuid();
      const claimedAttempts = attempts + 1;
      row[RECORD_FIELD.PUBLISH_STATUS] = 'PUBLISHING';
      row[RECORD_FIELD.PUBLISH_ATTEMPTS] = claimedAttempts;
      row[RECORD_FIELD.PUBLISH_NEXT_ATTEMPT_UTC] = '';
      row[RECORD_FIELD.PUBLISH_CLAIM_ID] = claimId;
      const leaseUntilUtc = new Date(
        now.getTime() + PUBLISH_LEASE_MINUTES * 60000
      ).toISOString();
      row[RECORD_FIELD.PUBLISH_LEASE_UNTIL_UTC] = leaseUntilUtc;
      row[RECORD_FIELD.PUBLISH_ERROR] = '';
      row[RECORD_FIELD.PUBLISH_CAPTION] = caption;
      sheet.getRange(index + 2, 1, 1, RECORD_HEADERS.length).setValues([row]);
      claims.push({
        rowNumber: index + 2,
        recordId: String(row[0]),
        inputChatId: String(row[1]),
        fileId: String(row[11]),
        driveFileId: String(row[13]),
        archiveMimeType: String(row[RECORD_FIELD.ARCHIVE_MIME_TYPE]),
        archiveByteSize: Number(row[RECORD_FIELD.ARCHIVE_BYTE_SIZE]),
        archiveSha256: String(row[RECORD_FIELD.ARCHIVE_SHA256]),
        archiveCompletedAtUtc: String(row[RECORD_FIELD.ARCHIVE_COMPLETED_AT_UTC]),
        metadataJson: String(row[RECORD_FIELD.AI_METADATA_JSON]),
        tagState: String(row[16]),
        eligibleAt: String(row[RECORD_FIELD.PUBLISH_ELIGIBLE_AT_UTC]),
        outputChatId: liveGroups.outputChatId,
        caption: caption,
        attempts: claimedAttempts,
        claimId: claimId,
        leaseUntilUtc: leaseUntilUtc
      });
    });
    return claims;
  } finally {
    lock.releaseLock();
  }
}

function isClaimablePublicationRow_(row, groups, now) {
  const status = String(row[RECORD_FIELD.PUBLISH_STATUS] || '');
  if (['PUBLISH_PENDING', 'PUBLISH_RETRY'].indexOf(status) === -1) return false;
  const nextAttempt = row[RECORD_FIELD.PUBLISH_NEXT_ATTEMPT_UTC]
    ? new Date(row[RECORD_FIELD.PUBLISH_NEXT_ATTEMPT_UTC])
    : null;
  return Number(row[RECORD_FIELD.PUBLISH_ATTEMPTS] || 0) < PUBLISH_MAX_ATTEMPTS &&
    (!nextAttempt || isNaN(nextAttempt.getTime()) || nextAttempt <= (now || new Date())) &&
    hasPublicationSettled_(row[RECORD_FIELD.PUBLISH_ELIGIBLE_AT_UTC], now) &&
    !publicationRowBoundaryError_(row, groups);
}

function publicationRowBoundaryError_(row, groups) {
  if (!archiveRowIsReady_(row) || !row[RECORD_FIELD.PUBLISH_ELIGIBLE_AT_UTC] ||
      String(row[1]) !== groups.inputChatId ||
      String(row[RECORD_FIELD.OUTPUT_CHAT_ID]) !== groups.outputChatId ||
      row[RECORD_FIELD.OUTPUT_MESSAGE_ID] ||
      String(row[16]) !== 'TAGGED' || !row[11]) {
    return 'Publication candidate no longer satisfies the captured eligibility boundary.';
  }
  if (!parseStoredMetadata_(row[RECORD_FIELD.AI_METADATA_JSON])) {
    return 'Stored AI metadata JSON is invalid.';
  }
  return '';
}

function hasPublicationSettled_(eligibleAt, now) {
  const eligible = new Date(eligibleAt);
  const current = now || new Date();
  return !isNaN(eligible.getTime()) &&
    eligible <= new Date(current.getTime() - PUBLISH_SETTLING_SECONDS * 1000);
}

function revalidatePublishClaim_(sheet, claim, expectedGroups) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    const lockError = new Error('Could not lock Records to revalidate publication.');
    lockError.publishDisposition = 'RETRY';
    throw lockError;
  }
  try {
    let liveGroups;
    let liveConfig;
    try {
      liveConfig = getConfig_(true);
      liveGroups = parseOutputGroupConfig_(liveConfig);
    } catch (configError) {
      configError.publishDisposition = 'RETRY';
      throw configError;
    }
    if (liveGroups.inputChatId !== expectedGroups.inputChatId ||
        liveGroups.outputChatId !== expectedGroups.outputChatId ||
        liveGroups.inputChatId !== claim.inputChatId ||
        liveGroups.outputChatId !== claim.outputChatId) {
      const configChangedError = new Error(
        'Output group configuration changed after publication claim.'
      );
      configChangedError.publishDisposition = 'FAILED';
      throw configChangedError;
    }
    const row = sheet.getRange(
      claim.rowNumber, 1, 1, RECORD_HEADERS.length
    ).getValues()[0];
    if (!publishClaimMatchesRow_(row, claim, new Date())) {
      const claimChangedError = new Error('Publication claim changed before delivery.');
      claimChangedError.publishDisposition = 'FAILED';
      throw claimChangedError;
    }
    const verifiedArchive = assertDriveArchiveEvidence_(claim);
    return { config: liveConfig, archiveBlob: verifiedArchive.blob };
  } finally {
    lock.releaseLock();
  }
}

function publishClaimMatchesRow_(row, claim, now) {
  const leaseUntil = new Date(row[RECORD_FIELD.PUBLISH_LEASE_UNTIL_UTC]);
  return archiveEvidenceMatchesRow_(claim, row) && String(row[0]) === claim.recordId &&
    String(row[1]) === claim.inputChatId &&
    String(row[11]) === claim.fileId &&
    String(row[16]) === claim.tagState && claim.tagState === 'TAGGED' &&
    String(row[RECORD_FIELD.AI_METADATA_JSON]) === claim.metadataJson &&
    String(row[RECORD_FIELD.PUBLISH_ELIGIBLE_AT_UTC]) === claim.eligibleAt &&
    String(row[RECORD_FIELD.PUBLISH_STATUS]) === 'PUBLISHING' &&
    String(row[RECORD_FIELD.PUBLISH_CLAIM_ID]) === claim.claimId &&
    Number(row[RECORD_FIELD.PUBLISH_ATTEMPTS]) === claim.attempts &&
    String(row[RECORD_FIELD.PUBLISH_LEASE_UNTIL_UTC]) === claim.leaseUntilUtc &&
    !isNaN(leaseUntil.getTime()) && leaseUntil > (now || new Date()) &&
    String(row[RECORD_FIELD.OUTPUT_CHAT_ID]) === claim.outputChatId &&
    String(row[RECORD_FIELD.PUBLISH_CAPTION]) === claim.caption &&
    !row[RECORD_FIELD.OUTPUT_MESSAGE_ID];
}

function telegramPublishPhoto_(claim, token, archiveBlob) {
  let response;
  try {
    response = UrlFetchApp.fetch(
      'https://api.telegram.org/bot' + token + '/sendPhoto',
      {
        method: 'post',
        payload: {
          chat_id: claim.outputChatId,
          photo: archiveBlob || claim.fileId,
          caption: claim.caption,
          protect_content: true
        },
        muteHttpExceptions: true
      }
    );
  } catch (transportError) {
    const error = new Error('Telegram transport outcome is unknown.');
    error.publishDisposition = 'UNKNOWN';
    throw error;
  }
  return classifyTelegramPublishResponse_(
    response.getResponseCode(), response.getContentText()
  );
}

function classifyTelegramPublishResponse_(status, responseText) {
  let body;
  try {
    body = JSON.parse(String(responseText || ''));
  } catch (parseError) {
    throw invalidTelegramPublishResponse_(status);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw invalidTelegramPublishResponse_(status);
  }
  if (status >= 200 && status < 300 && body.ok === true &&
      body.result && typeof body.result === 'object' && !Array.isArray(body.result) &&
      Number.isSafeInteger(body.result.message_id) && body.result.message_id > 0) {
    return { messageId: String(body.result.message_id) };
  }
  if (status >= 200 && status < 300 && body.ok === true) {
    const ambiguousSuccess = new Error(
      'Telegram publication response did not contain a valid message ID.'
    );
    ambiguousSuccess.publishDisposition = 'UNKNOWN';
    throw ambiguousSuccess;
  }
  const code = Number(body.error_code || status || 0);
  const explicitRejection = body.ok === false;
  const error = new Error(
    String(body.description || 'Telegram publication failed.').slice(0, 240)
  );
  if (explicitRejection && (code === 429 || code >= 500)) {
    error.publishDisposition = 'RETRY';
    error.retryAfterSeconds = boundedRetryAfterSeconds_(
      body.parameters && body.parameters.retry_after
    );
  } else if (explicitRejection || (status >= 400 && status < 500 && status !== 429)) {
    error.publishDisposition = 'FAILED';
  } else {
    error.publishDisposition = 'UNKNOWN';
  }
  throw error;
}

function invalidTelegramPublishResponse_(status) {
  const invalidError = new Error('Telegram returned an unreadable publication response.');
  invalidError.publishDisposition = status >= 400 && status < 500 && status !== 429
    ? 'FAILED'
    : 'UNKNOWN';
  return invalidError;
}

function boundedRetryAfterSeconds_(value) {
  const seconds = Number(value);
  if (!isFinite(seconds)) return 0;
  return Math.max(0, Math.min(3600, Math.floor(seconds)));
}

function publishErrorDisposition_(error, attempts) {
  const disposition = String(error && error.publishDisposition || 'UNKNOWN');
  if (disposition === 'RETRY' && attempts < PUBLISH_MAX_ATTEMPTS) {
    const retrySeconds = boundedRetryAfterSeconds_(error && error.retryAfterSeconds);
    const delayMs = retrySeconds > 0
      ? retrySeconds * 1000
      : publishBackoffMinutes_(attempts) * 60000;
    return {
      status: 'PUBLISH_RETRY',
      messageId: '',
      error: safePublishError_(error),
      nextAttempt: new Date(Date.now() + delayMs).toISOString()
    };
  }
  return {
    status: disposition === 'UNKNOWN' ? 'PUBLISH_UNKNOWN' : 'PUBLISH_FAILED',
    messageId: '',
    error: safePublishError_(error),
    nextAttempt: ''
  };
}

function publishBackoffMinutes_(attempts) {
  return Math.min(60, Math.pow(2, Math.max(1, Number(attempts) || 1)));
}

function finishPublishClaim_(sheet, claim, result) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Could not lock Records to save publication result.');
  try {
    const row = sheet.getRange(
      claim.rowNumber, 1, 1, RECORD_HEADERS.length
    ).getValues()[0];
    if (String(row[0]) !== claim.recordId ||
        String(row[RECORD_FIELD.PUBLISH_STATUS]) !== 'PUBLISHING' ||
        String(row[RECORD_FIELD.PUBLISH_CLAIM_ID]) !== claim.claimId ||
        Number(row[RECORD_FIELD.PUBLISH_ATTEMPTS]) !== claim.attempts) return false;
    row[RECORD_FIELD.PUBLISH_STATUS] = result.status;
    row[RECORD_FIELD.PUBLISH_NEXT_ATTEMPT_UTC] = result.nextAttempt || '';
    row[RECORD_FIELD.PUBLISH_CLAIM_ID] = '';
    row[RECORD_FIELD.PUBLISH_LEASE_UNTIL_UTC] = '';
    row[RECORD_FIELD.PUBLISH_ERROR] = sheetText_(result.error || '');
    if (result.status === 'PUBLISHED') {
      row[RECORD_FIELD.OUTPUT_MESSAGE_ID] = String(result.messageId);
      row[RECORD_FIELD.PUBLISHED_AT_UTC] = new Date().toISOString();
    }
    sheet.getRange(claim.rowNumber, 1, 1, RECORD_HEADERS.length).setValues([row]);
    return true;
  } finally {
    lock.releaseLock();
  }
}

function claimPendingTags_(config, limit) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return [];
  try {
    const currentConfig = getConfig_(false);
    const activation = groqActivationState_(currentConfig);
    if (!activation.valid || !currentConfig.groqApiKey) return [];
    const sheet = SpreadsheetApp.openById(currentConfig.spreadsheetId).getSheetByName('Records');
    if (!sheet || sheet.getLastRow() < 2) return [];
    const now = new Date();
    const values = sheet.getRange(
      2, 1, sheet.getLastRow() - 1, RECORD_HEADERS.length
    ).getValues();
    const claims = [];
    for (let index = 0; index < values.length && claims.length < limit; index++) {
      const row = values[index];
      if (!groqRowIsInsideActivationScope_(row, activation)) continue;
      const status = String(row[16] || '');
      const nextAttempt = row[22] ? new Date(row[22]) : null;
      const due = !nextAttempt || isNaN(nextAttempt.getTime()) || nextAttempt <= now;
      const attempts = Number(row[21] || 0);
      if (status === 'TAGGING' && due && attempts >= GROQ_MAX_ATTEMPTS) {
        applyTerminalTagError_(
          row, 'Tagging lease expired after the maximum number of attempts.'
        );
        sheet.getRange(index + 2, 1, 1, RECORD_HEADERS.length).setValues([row]);
        continue;
      }
      if (
        !archiveRowIsReady_(row) ||
        row[19] ||
        row[20] ||
        attempts >= GROQ_MAX_ATTEMPTS ||
        !due ||
        ['TAG_PENDING', 'TAG_RETRY', 'TAGGING'].indexOf(status) === -1
      ) continue;

      const claimedAttempts = attempts + 1;
      const leaseUntil = new Date(now.getTime() + GROQ_LEASE_MINUTES * 60000);
      sheet.getRange(index + 2, 17, 1, 8).setValues([[
        'TAGGING',
        '',
        row[18],
        row[19],
        row[20],
        claimedAttempts,
        leaseUntil,
        currentConfig.groqModel
      ]]);
      claims.push({
        recordId: String(row[0]),
        driveFileId: String(row[13]),
        archiveMimeType: String(row[RECORD_FIELD.ARCHIVE_MIME_TYPE]),
        archiveByteSize: Number(row[RECORD_FIELD.ARCHIVE_BYTE_SIZE]),
        archiveSha256: String(row[RECORD_FIELD.ARCHIVE_SHA256]),
        archiveCompletedAtUtc: String(row[RECORD_FIELD.ARCHIVE_COMPLETED_AT_UTC]),
        attempts: claimedAttempts,
        // This in-memory snapshot binds the provider call and audit write to the
        // same configuration that was current while the row was claimed.
        config: currentConfig
      });
    }
    return claims;
  } finally {
    lock.releaseLock();
  }
}

function applyTerminalTagError_(row, errorText) {
  const safeError = safeTagError_(errorText);
  row[16] = 'TAG_ERROR';
  row[17] = sheetText_(safeError);
  row[22] = '';
  if (String(row[RECORD_FIELD.PUBLISH_STATUS]) === 'PUBLISH_WAITING_FOR_ENRICHMENT' &&
      row[RECORD_FIELD.PUBLISH_ELIGIBLE_AT_UTC]) {
    row[RECORD_FIELD.PUBLISH_STATUS] = 'PUBLISH_BLOCKED_ENRICHMENT';
    row[RECORD_FIELD.PUBLISH_ERROR] = sheetText_(safeError);
  }
  return row;
}

function revalidateTagClaim_(config, claim) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Could not lock Records to revalidate Groq claim.');
  try {
    const sheet = SpreadsheetApp.openById(config.spreadsheetId).getSheetByName('Records');
    const rowNumber = sheet ? findRecordRow_(sheet, claim.recordId) : 0;
    if (!rowNumber) throw new Error('Claimed record no longer exists.');
    const row = sheet.getRange(rowNumber, 1, 1, RECORD_HEADERS.length).getValues()[0];
    if (String(row[16]) !== 'TAGGING' || Number(row[21]) !== claim.attempts ||
        !archiveEvidenceMatchesRow_(claim, row)) {
      throw new Error('Groq claim or canonical archive changed before analysis.');
    }
    return true;
  } finally {
    lock.releaseLock();
  }
}

function finishTagClaim_(config, claim, result) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Could not lock Records to save Groq result.');
  try {
    const sheet = SpreadsheetApp.openById(config.spreadsheetId).getSheetByName('Records');
    const rowNumber = sheet ? findRecordRow_(sheet, claim.recordId) : 0;
    if (!rowNumber) throw new Error('Claimed record no longer exists: ' + claim.recordId);
    const current = sheet.getRange(
      rowNumber, 1, 1, RECORD_HEADERS.length
    ).getValues()[0];
    if (!archiveEvidenceMatchesRow_(claim, current) ||
        String(current[16]) !== 'TAGGING' || Number(current[21]) !== claim.attempts) {
      return false;
    }
    current[16] = result.status;
    current[17] = sheetText_(result.error);
    current[19] = sheetText_(result.aiTags);
    current[20] = sheetText_(result.aiCaption);
    current[22] = result.nextAttempt;
    current[23] = config.groqModel;
    current[RECORD_FIELD.AI_METADATA_JSON] = result.metadataJson || '';
    current[RECORD_FIELD.ENRICHED_AT_UTC] = result.status === 'TAGGED'
      ? new Date().toISOString()
      : '';
    if (result.status === 'TAGGED' &&
        String(current[RECORD_FIELD.PUBLISH_STATUS]) === 'PUBLISH_WAITING_FOR_ENRICHMENT' &&
        current[RECORD_FIELD.PUBLISH_ELIGIBLE_AT_UTC] &&
        current[RECORD_FIELD.OUTPUT_CHAT_ID] &&
        !current[RECORD_FIELD.OUTPUT_MESSAGE_ID]) {
      current[RECORD_FIELD.PUBLISH_STATUS] = 'PUBLISH_PENDING';
      current[RECORD_FIELD.PUBLISH_NEXT_ATTEMPT_UTC] = '';
      current[RECORD_FIELD.PUBLISH_ERROR] = '';
    } else if (result.status === 'TAG_ERROR' &&
        String(current[RECORD_FIELD.PUBLISH_STATUS]) === 'PUBLISH_WAITING_FOR_ENRICHMENT') {
      current[RECORD_FIELD.PUBLISH_STATUS] = 'PUBLISH_BLOCKED_ENRICHMENT';
      current[RECORD_FIELD.PUBLISH_ERROR] = sheetText_(result.error);
    }
    sheet.getRange(rowNumber, 1, 1, RECORD_HEADERS.length).setValues([current]);
    return true;
  } finally {
    lock.releaseLock();
  }
}

function groqTagDriveImage_(driveFileId, config, archiveEvidence) {
  const blob = assertDriveArchiveEvidence_(archiveEvidence).blob;
  const bytes = blob.getBytes();
  const mimeType = String(blob.getContentType() || '').toLowerCase();
  if (['image/jpeg', 'image/png', 'image/webp'].indexOf(mimeType) === -1) {
    const error = new Error('Unsupported image type: ' + mimeType);
    error.httpStatus = 400;
    throw error;
  }
  const encodedSize = Math.ceil(bytes.length / 3) * 4;
  if (encodedSize + 10000 > 20 * 1024 * 1024) {
    const error = new Error('Base64-encoded image would exceed Groq 20 MB request limit.');
    error.httpStatus = 400;
    throw error;
  }

  const prompt = [
    'Analyze only what is visibly supported by this image.',
    'Return one JSON object with exactly these keys:',
    '{"caption_en":"","caption_ar":"","tags_en":[],"tags_ar":[],' +
      '"objects_en":[],"objects_ar":[],"activities_en":[],"activities_ar":[],' +
      '"settings_en":[],"settings_ar":[],"topics_en":[],"topics_ar":[],' +
      '"colors_en":[],"colors_ar":[],"ocr_text":"",' +
      '"visual_tone_en":[],"visual_tone_ar":[]}',
    'Provide 5 to 20 short, search-friendly tags or vocabulary terms in each language.',
    'List visible objects, activities, setting, topics, prominent colors, and exact visible OCR text.',
    'Visual tone means only non-personal image qualities such as bright, calm composition, festive, or formal.',
    'Write one concise factual caption in English and Arabic.',
    'Do not identify people or infer names, emotions, intent, relationships, ethnicity, health, religion, or sensitive traits.',
    'Do not invent a location, organization, event, relationship, or unreadable text.'
  ].join(' ');
  const dataUrl = 'data:' + mimeType + ';base64,' +
    Utilities.base64Encode(bytes);
  const response = UrlFetchApp.fetch(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + config.groqApiKey },
      payload: JSON.stringify({
        model: config.groqModel,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: dataUrl } }
          ]
        }],
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_completion_tokens: 1200
      }),
      muteHttpExceptions: true
    }
  );
  const status = response.getResponseCode();
  const responseText = response.getContentText();
  if (status < 200 || status >= 300) {
    const error = new Error('Groq HTTP ' + status + ': ' + groqErrorMessage_(responseText));
    error.httpStatus = status;
    throw error;
  }
  let body;
  try {
    body = JSON.parse(responseText);
  } catch (parseError) {
    throw new Error('Groq returned invalid response JSON.');
  }
  const content = body &&
    body.choices &&
    body.choices[0] &&
    body.choices[0].message &&
    body.choices[0].message.content;
  return parseGroqTagResponse_(content);
}

function assertBlobMatchesArchive_(blob, archiveEvidence) {
  const actual = validateArchiveBlob_(blob);
  if (!archiveEvidence || actual.byteSize !== Number(archiveEvidence.archiveByteSize) ||
      actual.sha256 !== String(archiveEvidence.archiveSha256 || '') ||
      actual.mimeType !== String(archiveEvidence.archiveMimeType || '')) {
    throw new Error('Canonical Drive object no longer matches recorded archive integrity.');
  }
  return actual;
}

function archiveEvidenceFromRow_(row) {
  return {
    driveFileId: String(row && row[13] || ''),
    archiveMimeType: String(row && row[RECORD_FIELD.ARCHIVE_MIME_TYPE] || ''),
    archiveByteSize: Number(row && row[RECORD_FIELD.ARCHIVE_BYTE_SIZE] || 0),
    archiveSha256: String(row && row[RECORD_FIELD.ARCHIVE_SHA256] || ''),
    archiveCompletedAtUtc: String(
      row && row[RECORD_FIELD.ARCHIVE_COMPLETED_AT_UTC] || ''
    )
  };
}

function archiveEvidenceMatchesRow_(evidence, row) {
  const current = archiveEvidenceFromRow_(row);
  return archiveRowIsReady_(row) && evidence &&
    current.driveFileId === String(evidence.driveFileId || '') &&
    current.archiveMimeType === String(evidence.archiveMimeType || '') &&
    current.archiveByteSize === Number(evidence.archiveByteSize) &&
    current.archiveSha256 === String(evidence.archiveSha256 || '') &&
    current.archiveCompletedAtUtc === String(evidence.archiveCompletedAtUtc || '');
}

function assertDriveArchiveRow_(row) {
  if (!archiveRowIsReady_(row)) throw new Error('Archive ledger evidence is incomplete.');
  return assertDriveArchiveEvidence_(archiveEvidenceFromRow_(row));
}

function assertDriveArchiveEvidence_(evidence) {
  if (!evidence || !evidence.driveFileId) throw new Error('Canonical Drive object is missing.');
  const file = DriveApp.getFileById(String(evidence.driveFileId));
  if (typeof file.isTrashed === 'function' && file.isTrashed()) {
    throw new Error('Canonical Drive object is trashed.');
  }
  const blob = file.getBlob();
  assertBlobMatchesArchive_(blob, evidence);
  return { file: file, blob: blob };
}

function parseGroqTagResponse_(content) {
  const text = String(content || '')
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '');
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error('Groq tag output was not valid JSON.');
  }
  const metadata = normalizeGroqMetadata_(value);
  const tagsEn = metadata.tags_en;
  const tagsAr = metadata.tags_ar;
  const captionEn = metadata.caption_en;
  const captionAr = metadata.caption_ar;
  if (tagsEn.length < 5 || tagsAr.length < 5 || !captionEn || !captionAr) {
    throw new Error('Groq tag output is missing bilingual tags or captions.');
  }
  const searchTerms = uniqueNonEmpty_([
    tagsEn, tagsAr, metadata.objects_en, metadata.objects_ar,
    metadata.activities_en, metadata.activities_ar,
    metadata.settings_en, metadata.settings_ar,
    metadata.topics_en, metadata.topics_ar,
    metadata.colors_en, metadata.colors_ar,
    metadata.visual_tone_en, metadata.visual_tone_ar
  ].reduce(function (all, list) { return all.concat(list); }, []));
  return {
    aiTags: searchTerms.join(', '),
    aiCaption: [captionEn, captionAr].join(' · '),
    metadata: metadata,
    metadataJson: JSON.stringify(metadata)
  };
}

function groqMetadataKeys_() {
  return [
    'caption_en', 'caption_ar', 'tags_en', 'tags_ar',
    'objects_en', 'objects_ar', 'activities_en', 'activities_ar',
    'settings_en', 'settings_ar', 'topics_en', 'topics_ar',
    'colors_en', 'colors_ar', 'ocr_text', 'visual_tone_en', 'visual_tone_ar'
  ];
}

function normalizeGroqMetadata_(value) {
  const requiredKeys = groqMetadataKeys_();
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== requiredKeys.length ||
      requiredKeys.some(function (key) {
        return !Object.prototype.hasOwnProperty.call(value, key);
      })) {
    throw new Error('Groq metadata output is missing required fields.');
  }
  const metadata = {
    caption_en: cleanGroqCaption_(value.caption_en),
    caption_ar: cleanGroqCaption_(value.caption_ar),
    tags_en: cleanGroqList_(value.tags_en, 20),
    tags_ar: cleanGroqList_(value.tags_ar, 20),
    objects_en: cleanGroqList_(value.objects_en, 20),
    objects_ar: cleanGroqList_(value.objects_ar, 20),
    activities_en: cleanGroqList_(value.activities_en, 12),
    activities_ar: cleanGroqList_(value.activities_ar, 12),
    settings_en: cleanGroqList_(value.settings_en, 12),
    settings_ar: cleanGroqList_(value.settings_ar, 12),
    topics_en: cleanGroqList_(value.topics_en, 12),
    topics_ar: cleanGroqList_(value.topics_ar, 12),
    colors_en: cleanGroqList_(value.colors_en, 12),
    colors_ar: cleanGroqList_(value.colors_ar, 12),
    ocr_text: cleanGroqOcr_(value.ocr_text),
    visual_tone_en: cleanGroqList_(value.visual_tone_en, 8),
    visual_tone_ar: cleanGroqList_(value.visual_tone_ar, 8)
  };
  if (!/[A-Za-z]/.test(metadata.caption_en + ' ' + metadata.tags_en.join(' '))) {
    throw new Error('English Groq captions/tags must contain Latin script.');
  }
  if (!/[\u0600-\u06FF]/.test(metadata.caption_ar + ' ' + metadata.tags_ar.join(' '))) {
    throw new Error('Arabic Groq captions/tags must contain Arabic script.');
  }
  return metadata;
}

function cleanGroqTags_(value) {
  return cleanGroqList_(value, 12);
}

function cleanGroqList_(value, limit) {
  if (!Array.isArray(value)) throw new Error('Groq metadata list field is invalid.');
  if (value.length > limit) throw new Error('Groq metadata list exceeds its item limit.');
  if (value.some(function (item) { return typeof item !== 'string'; })) {
    throw new Error('Groq metadata list items must be text.');
  }
  const seen = {};
  return value.map(function (tag) {
    if (hasLoneSurrogate_(tag)) {
      throw new Error('Groq metadata list item contains invalid Unicode.');
    }
    const normalized = tag
      .replace(/[\u0000-\u001F\u007F,]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (unicodeCodePointLength_(normalized) > 80) {
      throw new Error('Groq metadata list item exceeds 80 characters.');
    }
    return normalized;
  }).filter(function (tag) {
    const key = tag.toLocaleLowerCase();
    if (!tag || seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function cleanGroqCaption_(value) {
  if (typeof value !== 'string') throw new Error('Groq metadata caption is invalid.');
  if (hasLoneSurrogate_(value)) throw new Error('Groq metadata caption contains invalid Unicode.');
  const normalized = value
    .replace(/[\u0000-\u001F\u007F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (unicodeCodePointLength_(normalized) > 500) {
    throw new Error('Groq metadata caption exceeds 500 characters.');
  }
  return normalized;
}

function cleanGroqOcr_(value) {
  if (Array.isArray(value)) {
    if (value.some(function (item) { return typeof item !== 'string'; })) {
      throw new Error('Groq OCR items must be text.');
    }
    value = value.join(' ');
  }
  if (typeof value !== 'string') throw new Error('Groq OCR text is invalid.');
  if (hasLoneSurrogate_(value)) throw new Error('Groq OCR text contains invalid Unicode.');
  const normalized = value
    .replace(/[\u0000-\u001F\u007F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (unicodeCodePointLength_(normalized) > 1200) {
    throw new Error('Groq OCR text exceeds 1200 characters.');
  }
  return normalized;
}

function parseStoredMetadata_(value) {
  try {
    const parsed = JSON.parse(readSheetText_(value));
    const normalized = normalizeGroqMetadata_(parsed);
    const keys = groqMetadataKeys_();
    const canonical = keys.every(function (key) {
      return JSON.stringify(parsed[key]) === JSON.stringify(normalized[key]);
    });
    return canonical ? normalized : null;
  } catch (error) {
    return null;
  }
}

function metadataSearchText_(value) {
  const metadata = parseStoredMetadata_(value);
  if (!metadata) return '';
  return [
    metadata.caption_en, metadata.caption_ar, metadata.tags_en, metadata.tags_ar,
    metadata.objects_en, metadata.objects_ar, metadata.activities_en, metadata.activities_ar,
    metadata.settings_en, metadata.settings_ar, metadata.topics_en, metadata.topics_ar,
    metadata.colors_en, metadata.colors_ar, metadata.ocr_text,
    metadata.visual_tone_en, metadata.visual_tone_ar
  ].reduce(function (parts, item) {
    return parts.concat(Array.isArray(item) ? item : [item]);
  }, []).filter(Boolean).join(' ');
}

function buildPublishCaption_(metadataJson, humanContext) {
  const metadata = parseStoredMetadata_(metadataJson);
  if (!metadata) throw new Error('Stored AI metadata JSON is invalid.');
  const sections = [
    ['EN', captionTokens_(metadata.caption_en), ' ', 240],
    ['AR', captionTokens_(metadata.caption_ar), ' ', 240],
    ['Words', [].concat(metadata.tags_en, metadata.objects_en, metadata.topics_en), ', ', 180],
    ['كلمات', [].concat(metadata.tags_ar, metadata.objects_ar, metadata.topics_ar), '، ', 180],
    ['OCR', captionTokens_(metadata.ocr_text), ' ', 140],
    ['Activity', [].concat(metadata.activities_en, metadata.settings_en), ', ', 120],
    ['النشاط', [].concat(metadata.activities_ar, metadata.settings_ar), '، ', 120],
    ['Colors', [].concat(metadata.colors_en, metadata.visual_tone_en), ', ', 100],
    ['الألوان', [].concat(metadata.colors_ar, metadata.visual_tone_ar), '، ', 100],
    ['Context', captionTokens_(humanContext), ' ', 140]
  ];
  const lines = [];
  sections.some(function (section) {
    return appendCaptionSection_(lines, section[0], section[1], section[2], section[3]) === false;
  });
  const caption = lines.join('\n');
  if (!caption || unicodeCodePointLength_(caption) > 1024 || hasLoneSurrogate_(caption)) {
    throw new Error('Searchable Telegram caption could not be built within 1024 characters.');
  }
  return caption;
}

function appendCaptionSection_(lines, label, items, itemSeparator, sectionLimit) {
  const normalizedItems = items.map(function (item) {
    return stripLoneSurrogates_(String(item || '')).replace(/\s+/g, ' ').trim();
  }).filter(Boolean);
  if (!normalizedItems.length) return true;
  const prefix = label + ': ';
  const used = unicodeCodePointLength_(lines.join('\n')) + (lines.length ? 1 : 0);
  const available = Math.min(
    sectionLimit,
    1024 - used - unicodeCodePointLength_(prefix)
  );
  if (available <= 0) return false;
  const kept = [];
  for (let index = 0; index < normalizedItems.length; index++) {
    const candidate = kept.concat([normalizedItems[index]]).join(itemSeparator);
    if (unicodeCodePointLength_(candidate) > available) break;
    kept.push(normalizedItems[index]);
  }
  if (!kept.length) return false;
  lines.push(prefix + kept.join(itemSeparator));
  return true;
}

function captionTokens_(value) {
  return stripLoneSurrogates_(String(value || '')).split(/\s+/).filter(Boolean);
}

function unicodeCodePointLength_(value) {
  return Array.from(String(value || '')).length;
}

function stripLoneSurrogates_(value) {
  const text = String(value || '');
  let clean = '';
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code >= 0xD800 && code <= 0xDBFF) {
      const next = text.charCodeAt(index + 1);
      if (next >= 0xDC00 && next <= 0xDFFF) {
        clean += text.charAt(index) + text.charAt(index + 1);
        index++;
      }
    } else if (code < 0xDC00 || code > 0xDFFF) {
      clean += text.charAt(index);
    }
  }
  return clean;
}

function hasLoneSurrogate_(value) {
  return stripLoneSurrogates_(value) !== String(value || '');
}

function groqErrorMessage_(responseText) {
  try {
    const body = JSON.parse(responseText);
    return String(body.error && body.error.message || 'request failed').slice(0, 240);
  } catch (error) {
    return 'request failed';
  }
}

function shouldRetryGroqError_(error, attempts) {
  if (attempts >= GROQ_MAX_ATTEMPTS) return false;
  const status = Number(error && error.httpStatus || 0);
  return !status || status === 429 || status >= 500;
}

function groqBackoffMinutes_(attempts) {
  return Math.min(60, Math.pow(2, Math.max(1, Number(attempts) || 1)));
}

function safeTagError_(error) {
  return String(error && error.message || error || 'Unknown Groq error')
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 300);
}

function safePublishError_(error) {
  return String(error && error.message || error || 'Output publication failed.')
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 300);
}

function prepareSheet_(sheet, headers) {
  ensureSheetColumns_(sheet, headers.length);
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold')
    .setBackground('#1f4e78')
    .setFontColor('#ffffff');
  sheet.autoResizeColumns(1, headers.length);
}

function prepareRecordsSheet_(sheet) {
  const legacyHeaders = RECORD_HEADERS.slice(0, 24);
  const extensionHeaders = RECORD_HEADERS.slice(24);
  ensureSheetColumns_(sheet, RECORD_HEADERS.length);
  if (sheet.getLastRow() > 0) {
    const existing = sheet.getRange(1, 1, 1, legacyHeaders.length).getValues()[0];
    if (!headersMatch_(existing, legacyHeaders)) {
      throw new Error('Records header does not match the backward-compatible contract.');
    }
    const extensionValues = sheet.getRange(
      1, 25, Math.max(1, sheet.getLastRow()), extensionHeaders.length
    ).getValues();
    if (!recordsExtensionSchemaIsSafe_(extensionValues, extensionHeaders)) {
      throw new Error(
        'Records extension columns contain data outside the expected append-only schema.'
      );
    }
  }
  prepareSheet_(sheet, RECORD_HEADERS);
}

function ensureSheetColumns_(sheet, requiredColumns) {
  const currentColumns = sheet.getMaxColumns();
  if (currentColumns < requiredColumns) {
    sheet.insertColumnsAfter(currentColumns, requiredColumns - currentColumns);
  }
  return Math.max(currentColumns, requiredColumns);
}

function recordsExtensionSchemaIsSafe_(extensionValues, expectedHeaders) {
  const extensionHasData = extensionValues.some(function (row) {
    return row.some(function (value) { return String(value) !== ''; });
  });
  if (!extensionHasData) return true;
  const actualHeaders = extensionValues[0] || [];
  let seenBlank = false;
  for (let index = 0; index < expectedHeaders.length; index++) {
    const actual = String(actualHeaders[index] || '');
    if (!actual) {
      seenBlank = true;
      continue;
    }
    if (seenBlank || actual !== expectedHeaders[index]) return false;
  }
  return extensionValues.slice(1).every(function (row) {
    return row.every(function (value, index) {
      return index < actualHeaders.length && String(actualHeaders[index] || '')
        ? true
        : String(value || '') === '';
    });
  });
}

function prepareEmbeddingSheet_(sheet) {
  if (sheet.getLastRow() > 0) {
    const existing = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (!headersMatch_(existing, EMBEDDING_HEADERS)) {
      throw new Error('Embeddings header does not match the required contract.');
    }
  }
  prepareSheet_(sheet, EMBEDDING_HEADERS);
}

function headersMatch_(actual, expected) {
  return actual.length === expected.length && actual.every(function (value, index) {
    return String(value) === expected[index];
  });
}

function appendEvent_(sheet, update, message, kind, text, recordId) {
  sheet.appendRow([
    String(update.update_id),
    String(message.chat.id),
    String(message.message_id),
    getUserId_(message),
    kind,
    sheetText_(text),
    recordId || '',
    Utilities.formatDate(new Date(), 'UTC', "yyyy-MM-dd'T'HH:mm:ss'Z'")
  ]);
}

function hasUpdate_(sheet, updateId) {
  if (sheet.getLastRow() < 2) return false;
  return !!sheet.getRange(2, 1, sheet.getLastRow() - 1, 1)
    .createTextFinder(String(updateId))
    .matchEntireCell(true)
    .findNext();
}

function findRecordRow_(sheet, recordId) {
  if (sheet.getLastRow() < 2) return 0;
  const match = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1)
    .createTextFinder(recordId)
    .matchEntireCell(true)
    .findNext();
  return match ? match.getRow() : 0;
}

function findEventRow_(sheet, chatId, messageId, userId, kind) {
  // ponytail: O(n) scan is enough for the POC; index events in a database if volume grows.
  if (sheet.getLastRow() < 2) return 0;
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, EVENT_HEADERS.length)
    .getValues();
  for (let i = values.length - 1; i >= 0; i--) {
    const row = values[i];
    if (
      String(row[1]) === chatId &&
      String(row[2]) === String(messageId) &&
      String(row[3]) === userId &&
      row[4] === kind &&
      !row[6]
    ) return i + 2;
  }
  return 0;
}

function firstLine_(value) {
  // ponytail: one line is the POC contract; add a review queue if multiline posts matter.
  return String(value || '').split(/\r?\n/).map(function (line) {
    return line.trim();
  }).filter(Boolean)[0] || '';
}

function sheetText_(value) {
  const text = String(value || '');
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function readSheetText_(value) {
  return String(value || '').replace(/^'(?=[=+\-@])/, '');
}

function normalizeSearchText_(value) {
  // ponytail: basic Arabic normalization is the lexical baseline; use the winning
  // model/analyzer only when the judged Arabic benchmark proves this insufficient.
  return readSheetText_(value)
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\u0640\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function rankRecordValues_(values, query, limit, allowLegacyUnverified) {
  const normalizedQuery = normalizeSearchText_(query);
  const tokens = Array.from(new Set(normalizedQuery.split(' ').filter(Boolean)));
  if (!tokens.length) return [];

  return values.map(function (row) {
    if (!recordSearchIsAllowed_(row, allowLegacyUnverified)) return null;
    const context = [row[9], row[10]].map(readSheetText_).filter(Boolean).join(' · ');
    const manualTags = readSheetText_(row[18]);
    const aiTags = readSheetText_(row[19]);
    const aiCaption = readSheetText_(row[20]);
    const aiMetadata = metadataSearchText_(row[RECORD_FIELD.AI_METADATA_JSON]);
    const fields = [
      { value: context, weight: 1 },
      { value: aiCaption, weight: 2 },
      { value: aiMetadata, weight: 3 },
      { value: aiTags, weight: 3 },
      { value: manualTags, weight: 4 }
    ].map(function (field) {
      const normalized = normalizeSearchText_(field.value);
      return {
        normalized: normalized,
        tokens: new Set(normalized.split(' ').filter(Boolean)),
        weight: field.weight
      };
    });
    const termScores = tokens.map(function (token) {
      return fields.reduce(function (best, field) {
        return field.tokens.has(token) ? Math.max(best, field.weight) : best;
      }, 0);
    });
    const matches = termScores.filter(Boolean).length;
    if (!matches || !row[11]) return null;
    const phraseBonus = fields.reduce(function (best, field) {
      return field.normalized.indexOf(normalizedQuery) !== -1
        ? Math.max(best, field.weight)
        : best;
    }, 0);
    return {
      fileId: String(row[11]),
      driveFileId: String(row[13] || ''),
      archiveMimeType: String(row[RECORD_FIELD.ARCHIVE_MIME_TYPE] || ''),
      archiveByteSize: Number(row[RECORD_FIELD.ARCHIVE_BYTE_SIZE] || 0),
      archiveSha256: String(row[RECORD_FIELD.ARCHIVE_SHA256] || ''),
      archiveCompletedAtUtc: String(row[RECORD_FIELD.ARCHIVE_COMPLETED_AT_UTC] || ''),
      legacyUnverified: !archiveRowIsReady_(row),
      recordId: String(row[0]),
      caption: (aiCaption || context || 'Matched record ' + row[0]).slice(0, 700),
      tags: [manualTags, aiTags].filter(Boolean).join(', ').slice(0, 200),
      matchedTerms: matches,
      totalTerms: tokens.length,
      score: termScores.reduce(function (sum, value) { return sum + value; }, 0) +
        phraseBonus
    };
  }).filter(Boolean).sort(function (left, right) {
    return right.score - left.score ||
      right.matchedTerms - left.matchedTerms ||
      left.recordId.localeCompare(right.recordId);
  }).slice(0, limit);
}

function searchWithGeminiFallback_(spreadsheet, records, query, limit) {
  const lexical = searchRecords_(records, query, Math.max(limit * 4, 20));
  try {
    const properties = PropertiesService.getScriptProperties().getProperties();
    const config = parseGeminiPilotConfig_(properties, new Date());
    if (!config.querySet.has(normalizeSearchText_(query))) {
      return { mode: 'Lexical fallback', results: lexical.slice(0, limit) };
    }
    const embeddings = spreadsheet.getSheetByName('Embeddings');
    if (!embeddings || embeddings.getLastRow() < 2 || records.getLastRow() < 2) {
      return { mode: 'Lexical fallback', results: lexical.slice(0, limit) };
    }
    const embeddingRows = embeddings.getRange(
      2, 1, embeddings.getLastRow() - 1, EMBEDDING_HEADERS.length
    ).getValues();
    const recordRows = records.getRange(
      2, 1, records.getLastRow() - 1, RECORD_HEADERS.length
    ).getValues();
    const eligible = eligibleSemanticRows_(embeddingRows, recordRows, config, new Date());
    const resolvableIds = {};
    eligible.forEach(function (candidate) {
      try {
        assertDriveArchiveRow_(candidate.record);
        resolvableIds[candidate.recordId] = true;
      } catch (error) {
        console.warn('Semantic candidate archive is unavailable; candidate excluded.');
      }
    });
    const resolvableRecordRows = recordRows.filter(function (row) {
      return resolvableIds[String(row[0])] === true;
    });
    if (!resolvableRecordRows.length) {
      return { mode: 'Lexical fallback', results: lexical.slice(0, limit) };
    }
    const liveConfig = parseGeminiPilotConfig_(
      PropertiesService.getScriptProperties().getProperties(), new Date()
    );
    if (!geminiPilotConfigMatches_(config, liveConfig) ||
        !liveConfig.querySet.has(normalizeSearchText_(query))) {
      throw new Error('Gemini pilot approval changed before query embedding.');
    }
    const queryVector = geminiEmbedText_(query, liveConfig);
    const results = rankSemanticRows_(
      embeddingRows,
      resolvableRecordRows,
      queryVector,
      liveConfig,
      Math.max(limit * 4, 20),
      new Date()
    );
    if (results.length) {
      return {
        mode: 'Hybrid pilot',
        results: fuseHybridResults_(lexical, results, limit)
      };
    }
  } catch (error) {
    console.warn('Semantic pilot unavailable; using lexical fallback.');
  }
  return { mode: 'Lexical fallback', results: lexical.slice(0, limit) };
}

function geminiPilotConfigMatches_(expected, current) {
  return expected && current && expected.datasetId === current.datasetId &&
    expected.approvedBy === current.approvedBy &&
    expected.approvedAt === current.approvedAt &&
    expected.expiresAt === current.expiresAt && expected.model === current.model &&
    expected.dimensions === current.dimensions &&
    expected.recordIds.join('\n') === current.recordIds.join('\n') &&
    expected.queries.join('\n') === current.queries.join('\n');
}

function fuseHybridResults_(lexicalResults, semanticResults, limit) {
  const combined = {};
  function add_(result, index, count, kind) {
    const recordId = String(result.recordId || '');
    if (!recordId) return;
    if (!combined[recordId]) {
      combined[recordId] = Object.assign({}, result, {
        lexicalRankScore: 0,
        semanticRankScore: 0
      });
    }
    const normalizedRank = count ? (count - index) / count : 0;
    if (kind === 'lexical') {
      if (combined[recordId].lexicalRankScore) return;
      combined[recordId].lexicalRankScore = normalizedRank;
      combined[recordId].matchedTerms = result.matchedTerms;
      combined[recordId].totalTerms = result.totalTerms;
      combined[recordId].score = result.score;
    } else {
      if (combined[recordId].semanticRankScore) return;
      combined[recordId].semanticRankScore = normalizedRank;
      combined[recordId].semanticScore = result.semanticScore;
    }
  }
  lexicalResults.forEach(function (result, index) {
    add_(result, index, lexicalResults.length, 'lexical');
  });
  semanticResults.forEach(function (result, index) {
    add_(result, index, semanticResults.length, 'semantic');
  });
  return Object.keys(combined).map(function (recordId) {
    const result = combined[recordId];
    result.hybridScore = result.lexicalRankScore * 0.55 +
      result.semanticRankScore * 0.45;
    return result;
  }).sort(function (left, right) {
    return right.hybridScore - left.hybridScore ||
      right.lexicalRankScore - left.lexicalRankScore ||
      right.semanticRankScore - left.semanticRankScore ||
      left.recordId.localeCompare(right.recordId);
  }).slice(0, limit);
}

function rankSemanticRows_(embeddingRows, recordRows, queryVector, config, limit, now) {
  // ponytail: O(n) exact cosine is enough for 100 pilot photos; add a vector
  // index only after measured search latency violates the PRD target.
  const query = validateEmbeddingVector_(queryVector, config.dimensions);
  return eligibleSemanticRows_(embeddingRows, recordRows, config, now).map(function (candidate) {
    const record = candidate.record;
    const recordId = candidate.recordId;
    const context = [record[9], record[10]].map(readSheetText_).filter(Boolean).join(' · ');
    const manualTags = readSheetText_(record[18]);
    const aiTags = readSheetText_(record[19]);
    const aiCaption = readSheetText_(record[20]);
    return {
      fileId: String(record[11]),
      driveFileId: String(record[13] || ''),
      archiveMimeType: String(record[RECORD_FIELD.ARCHIVE_MIME_TYPE] || ''),
      archiveByteSize: Number(record[RECORD_FIELD.ARCHIVE_BYTE_SIZE] || 0),
      archiveSha256: String(record[RECORD_FIELD.ARCHIVE_SHA256] || ''),
      archiveCompletedAtUtc: String(
        record[RECORD_FIELD.ARCHIVE_COMPLETED_AT_UTC] || ''
      ),
      recordId: recordId,
      caption: (aiCaption || context || 'Matched record ' + recordId).slice(0, 700),
      tags: [manualTags, aiTags].filter(Boolean).join(', ').slice(0, 200),
      semanticScore: cosineSimilarity_(query, candidate.vector)
    };
  }).filter(function (result) {
    return isFinite(result.semanticScore);
  }).sort(function (left, right) {
    return right.semanticScore - left.semanticScore ||
      left.recordId.localeCompare(right.recordId);
  }).slice(0, limit);
}

function eligibleSemanticRows_(embeddingRows, recordRows, config, now) {
  const current = now || new Date();
  const records = {};
  const counts = {};
  recordRows.forEach(function (row) {
    const id = String(row[0]);
    counts[id] = (counts[id] || 0) + 1;
    records[id] = row;
  });
  const latest = latestEmbeddingRows_(embeddingRows);

  return Object.keys(latest).map(function (key) {
    const embedding = latest[key].values;
    const recordId = String(embedding[0]);
    const record = records[recordId];
    if (!record || counts[recordId] !== 1 || !archiveRowIsReady_(record) || !record[11] ||
        !config.recordIdSet.has(recordId) ||
        String(embedding[8]) !== 'READY' || String(embedding[5]) !== config.model ||
        Number(embedding[6]) !== config.dimensions || !embeddingApprovalMatches_(embedding, config) ||
        new Date(embedding[4]) <= current) return null;
    let vector;
    try {
      vector = validateEmbeddingVector_(JSON.parse(String(embedding[7] || '')), config.dimensions);
    } catch (error) {
      return null;
    }
    return {
      recordId: recordId,
      record: record,
      vector: vector
    };
  }).filter(Boolean);
}

function cosineSimilarity_(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return NaN;
  }
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index++) {
    const a = left[index];
    const b = right[index];
    if (typeof a !== 'number' || typeof b !== 'number' || !isFinite(a) || !isFinite(b)) {
      return NaN;
    }
    dot += a * b;
    leftMagnitude += a * a;
    rightMagnitude += b * b;
  }
  return leftMagnitude && rightMagnitude
    ? dot / Math.sqrt(leftMagnitude * rightMagnitude)
    : NaN;
}

function sendSearchPhoto_(chatId, result, index, total, config) {
  let archiveFile;
  let archiveBlob;
  if (result.legacyUnverified === true) {
    archiveFile = DriveApp.getFileById(String(result.driveFileId));
    if (!archiveFile.getId() ||
        (typeof archiveFile.isTrashed === 'function' && archiveFile.isTrashed())) {
      throw new Error('Legacy Drive object is unavailable.');
    }
  } else {
    const verified = assertDriveArchiveEvidence_(result);
    archiveFile = verified.file;
    archiveBlob = verified.blob;
  }
  const payload = {
    chat_id: String(chatId),
    photo: result.fileId,
    caption: searchResultCaption_(result, index, total),
    protect_content: true
  };
  try {
    return telegram_('sendPhoto', payload, config.botToken);
  } catch (cachedPhotoError) {
    if (!result.driveFileId) throw cachedPhotoError;
    console.warn('Cached Telegram photo failed; retrying from Drive.');
    payload.photo = archiveBlob || archiveFile.getBlob();
    return telegram_('sendPhoto', payload, config.botToken);
  }
}

function searchResultCaption_(result, index, total) {
  const hybrid = result.searchMode === 'Hybrid pilot';
  return [
    hybrid
      ? String(index + 1) + '/' + total + ' · Hybrid pilot · rank ' +
        Number(result.hybridScore).toFixed(3)
      : String(index + 1) + '/' + total + ' · Lexical fallback · matched ' +
        result.matchedTerms + '/' + result.totalTerms + ' query terms',
    result.tags ? 'Tags: ' + result.tags : '',
    result.caption
  ].filter(Boolean).join('\n').slice(0, 1000);
}

function searchRecords_(sheet, query, limit) {
  // ponytail: O(n) Sheet scan is the benchmark; replace it only after measured need.
  if (sheet.getLastRow() < 2) return [];
  return rankRecordValues_(
    sheet.getRange(2, 1, sheet.getLastRow() - 1, RECORD_HEADERS.length).getValues(),
    query,
    limit,
    PropertiesService.getScriptProperties().getProperty(
      'ALLOW_LEGACY_UNVERIFIED_LEXICAL_SEARCH'
    ) === 'true'
  );
}

function privateCommand_(message) {
  if (!isPrivateMessage_(message) || !message.text) return null;
  const match = firstLine_(message.text)
    .match(/^\/(start|search)(?:@[A-Za-z0-9_]+)?(?:\s+(.*))?$/i);
  return match ? {
    name: match[1].toLowerCase(),
    query: String(match[2] || '').trim()
  } : null;
}

function parseUserIds_(value) {
  const ids = String(value || '').split(/[\s,]+/).filter(Boolean);
  const invalid = ids.filter(function (id) { return !/^\d+$/.test(id); });
  if (invalid.length) {
    console.warn('SEARCH_USER_IDS contains a non-numeric value; private search is disabled.');
    return [];
  }
  return ids;
}

function isSearchUser_(message, allowedUserIds) {
  return allowedUserIds.indexOf(getUserId_(message)) !== -1;
}

function sendText_(chatId, text, config) {
  return telegram_('sendMessage', {
    chat_id: String(chatId),
    text: text,
    protect_content: true
  }, config.botToken);
}

function largestPhoto_(photos) {
  return photos.reduce(function (largest, photo) {
    return (photo.file_size || photo.width * photo.height) >
      (largest.file_size || largest.width * largest.height) ? photo : largest;
  });
}

function makeRecordId_(message) {
  return String(message.chat.id) + ':' + String(message.message_id);
}

function afterTargetMessageId_(message) {
  const reply = message.reply_to_message;
  return reply && reply.photo && reply.photo.length
    ? reply.message_id
    : message.message_id - 1;
}

function getUserId_(message) {
  return String(message.from && message.from.id || message.sender_chat && message.sender_chat.id || '');
}

function displayName_(user) {
  return user ? [user.first_name, user.last_name].filter(Boolean).join(' ') : '';
}

function isGroupMessage_(message) {
  return Boolean(
    message &&
    message.chat &&
    (message.chat.type === 'group' || message.chat.type === 'supergroup')
  );
}

function isPrivateMessage_(message) {
  return Boolean(message && message.chat && message.chat.type === 'private');
}

function webhookSecretFromEvent_(event) {
  if (!event || event.pathInfo || !event.parameter || !event.parameters) return '';
  const singular = event.parameter[WEBHOOK_SECRET_PARAMETER];
  const values = event.parameters[WEBHOOK_SECRET_PARAMETER];
  if (typeof singular !== 'string' || !Array.isArray(values) || values.length !== 1 ||
      typeof values[0] !== 'string' || values[0] !== singular) {
    return '';
  }
  return singular;
}

function selfCheck() {
  const photos = [
    { file_id: 'small', width: 90, height: 90, file_size: 100 },
    { file_id: 'large', width: 900, height: 900, file_size: 1000 }
  ];
  function markArchived_(row, id, byteSize) {
    row[13] = 'drive-' + id;
    row[RECORD_FIELD.ARCHIVE_MIME_TYPE] = 'image/jpeg';
    row[RECORD_FIELD.ARCHIVE_BYTE_SIZE] = byteSize || 100;
    row[RECORD_FIELD.ARCHIVE_SHA256] = Array(65).join('a');
    row[RECORD_FIELD.ARCHIVE_STATUS] = 'ARCHIVED';
    row[RECORD_FIELD.ARCHIVE_COMPLETED_AT_UTC] = '2026-08-29T00:00:00.000Z';
    row[RECORD_FIELD.ARCHIVE_ATTEMPTS] = 1;
    return row;
  }
  if (firstLine_('\n First line \nSecond line') !== 'First line') {
    throw new Error('firstLine_ failed');
  }
  if (largestPhoto_(photos).file_id !== 'large') {
    throw new Error('largestPhoto_ failed');
  }
  if (makeRecordId_({ chat: { id: -1001 }, message_id: 42 }) !== '-1001:42') {
    throw new Error('makeRecordId_ failed');
  }
  if (afterTargetMessageId_({
    message_id: 50,
    reply_to_message: { message_id: 42, photo: [{}] }
  }) !== 42) {
    throw new Error('afterTargetMessageId_ reply failed');
  }
  if (afterTargetMessageId_({ message_id: 50 }) !== 49) {
    throw new Error('afterTargetMessageId_ adjacency failed');
  }
  if (!isGroupMessage_({ chat: { type: 'supergroup' } }) ||
      isGroupMessage_({ chat: { type: 'private' } })) {
    throw new Error('isGroupMessage_ failed');
  }
  if (!isPrivateMessage_({ chat: { type: 'private' } }) ||
      isPrivateMessage_({ chat: { type: 'group' } })) {
    throw new Error('isPrivateMessage_ failed');
  }
  const command = privateCommand_({
    chat: { type: 'private' },
    text: '/search@school_bot نشاط خيل'
  });
  if (!command || command.name !== 'search' || command.query !== 'نشاط خيل') {
    throw new Error('privateCommand_ failed');
  }
  if (
    sheetText_('=IMPORTXML("x")') !== '\'=IMPORTXML("x")' ||
    sheetText_('sports') !== 'sports' ||
    readSheetText_('\'+SUM(1,2)') !== '+SUM(1,2)'
  ) {
    throw new Error('sheetText_ failed');
  }
  if (normalizeSearchText_('ألعَاب رياضيّة') !== 'العاب رياضيه') {
    throw new Error('normalizeSearchText_ failed');
  }
  if (!imageSignatureMatchesMime_([255, 216, 0, 255, 217], 'image/jpeg') ||
      !imageSignatureMatchesMime_([137, 80, 78, 71, 13, 10, 26, 10], 'image/png') ||
      !imageSignatureMatchesMime_([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80],
        'image/webp') ||
      imageSignatureMatchesMime_([1, 2, 3, 4], 'image/jpeg') ||
      archiveFailureDisposition_(permanentArchiveError_('bad image'), 1).status !==
        'ARCHIVE_FAILED_TERMINAL' ||
      archiveFailureDisposition_(new Error('temporary'), 1).status !== 'ARCHIVE_RETRY' ||
      archiveFailureDisposition_(new Error('repeated'), ARCHIVE_MAX_ATTEMPTS).status !==
        'ARCHIVE_FAILED_TERMINAL') {
    throw new Error('archive signature or bounded retry classification failed');
  }
  const rowA = new Array(RECORD_HEADERS.length).fill('');
  rowA[0] = 'a';
  rowA[9] = 'نشاط خيل';
  rowA[10] = 'Open area';
  rowA[11] = 'file-a';
  markArchived_(rowA, 'a', 101);
  rowA[19] = 'horses, activity';
  rowA[20] = 'Children riding horses outdoors';
  const rowB = new Array(RECORD_HEADERS.length).fill('');
  rowB[0] = 'b';
  rowB[10] = 'Art activity';
  rowB[11] = 'file-b';
  rowB[18] = 'art';
  markArchived_(rowB, 'b', 102);
  const ranked = rankRecordValues_([rowB, rowA], 'نشاط خيل', 5);
  if (
    ranked.length !== 1 ||
    ranked[0].fileId !== 'file-a' ||
    ranked[0].driveFileId !== 'drive-a'
  ) {
    throw new Error('rankRecordValues_ failed');
  }
  const rankedTags = rankRecordValues_([rowB, rowA], 'activity', 5);
  if (
    rankedTags.length !== 2 ||
    rankedTags[0].fileId !== 'file-a' ||
    searchResultCaption_(rankedTags[0], 0, 2).indexOf('matched 1/1') === -1
  ) {
    throw new Error('weighted tag ranking failed');
  }
  if (
    parseUserIds_('123, 456').join(',') !== '123,456' ||
    parseUserIdsStrict_('123,456').join(',') !== '123,456' ||
    !isSearchUser_({ from: { id: 456 } }, ['123', '456']) ||
    !telegramMembershipAllowsSearch_({ user: { id: 456 }, status: 'member' }) ||
    !telegramMembershipAllowsSearch_({
      user: { id: 456 }, status: 'restricted', is_member: true
    }) ||
    telegramMembershipAllowsSearch_({
      user: { id: 456 }, status: 'restricted', is_member: false
    }) ||
    telegramMembershipAllowsSearch_({ user: { id: 456 }, status: 'left' })
  ) {
    throw new Error('search authorization failed');
  }
  const webhookSecret = Array(33).join('a');
  if (
    webhookSecretFromEvent_({
      parameter: { telegram_webhook_key: webhookSecret },
      parameters: { telegram_webhook_key: [webhookSecret] }
    }) !== webhookSecret ||
    webhookSecretFromEvent_({
      parameter: { telegram_webhook_key: webhookSecret },
      parameters: { telegram_webhook_key: [webhookSecret, webhookSecret] }
    }) !== '' ||
    webhookSecretFromEvent_({
      pathInfo: 'legacy',
      parameter: { telegram_webhook_key: webhookSecret },
      parameters: { telegram_webhook_key: [webhookSecret] }
    }) !== '' ||
    webhookSecretFromEvent_({ pathInfo: webhookSecret }) !== '' ||
    webhookSecretFromEvent_() !== '' ||
    webhookUrl_('https://script.google.com/macros/s/deployment/exec/',
      webhookSecret) !==
      'https://script.google.com/macros/s/deployment/exec?' +
        WEBHOOK_SECRET_PARAMETER + '=' + webhookSecret ||
    redactWebhookInfo_({ result: {
      url: 'https://script.google.com/macros/s/deployment/exec?' +
        WEBHOOK_SECRET_PARAMETER + '=' + webhookSecret + '&leak=' + encodeURIComponent(webhookSecret)
    } }).result.url !==
      'https://script.google.com/macros/s/deployment/exec?' +
        WEBHOOK_SECRET_PARAMETER + '=[REDACTED]'
  ) {
    throw new Error('webhookSecretFromEvent_ failed');
  }
  [
    'http://script.google.com/macros/s/deployment/exec',
    'https://example.com/macros/s/deployment/exec',
    'https://script.google.com/macros/s/deployment/dev',
    'https://script.google.com/macros/s/deployment/exec/extra',
    'https://script.google.com/macros/s/deployment/exec?already=query',
    'https://script.google.com/macros/s/deployment/exec#fragment'
  ].forEach(function (invalidUrl) {
    let rejected = false;
    try {
      webhookUrl_(invalidUrl, webhookSecret);
    } catch (error) {
      rejected = true;
    }
    if (!rejected) throw new Error('webhookUrl_ accepted invalid WEB_APP_URL');
  });
  if (
    redactWebhookUrl_('https://example.com/' + webhookSecret) !== '[REDACTED]' ||
    redactWebhookUrl_('https://script.google.com/macros/s/deployment/exec/extra/' +
      webhookSecret) !== '[REDACTED]'
  ) {
    throw new Error('redactWebhookUrl_ exposed malformed webhook URL');
  }
  let invalidSetupRejected = false;
  try {
    validateRequiredSetupProperties_({
      BOT_TOKEN: 'token', SPREADSHEET_ID: 'sheet', DRIVE_FOLDER_ID: 'drive',
      ALLOWED_CHAT_ID: '-1001', SEARCH_USER_IDS: '123,bad'
    });
  } catch (error) {
    invalidSetupRejected = true;
  }
  if (!invalidSetupRejected || validateRequiredSetupProperties_({
    BOT_TOKEN: 'token', SPREADSHEET_ID: 'sheet', DRIVE_FOLDER_ID: 'drive',
    ALLOWED_CHAT_ID: '-1001', SEARCH_USER_IDS: '123,456'
  }).searchUserIds.length !== 2) {
    throw new Error('required setup validation failed');
  }
  const parsedTags = parseGroqTagResponse_(JSON.stringify({
    caption_en: 'A horse-riding activity outdoors.',
    caption_ar: 'نشاط ركوب خيل في مكان مفتوح.',
    tags_en: ['sports', 'horses', 'outdoors', 'riding', 'activity', 'sports'],
    tags_ar: ['رياضة', 'خيول', 'مكان مفتوح', 'ركوب', 'نشاط'],
    objects_en: ['horse', 'helmet'],
    objects_ar: ['حصان', 'خوذة'],
    activities_en: ['horse riding'],
    activities_ar: ['ركوب الخيل'],
    settings_en: ['outdoors'],
    settings_ar: ['مكان مفتوح'],
    topics_en: ['sports education'],
    topics_ar: ['تعليم رياضي'],
    colors_en: ['green', 'brown'],
    colors_ar: ['أخضر', 'بني'],
    ocr_text: 'TEAM 2026',
    visual_tone_en: ['bright'],
    visual_tone_ar: ['مشرق']
  }));
  if (
    parsedTags.aiTags.indexOf('sports, horses, outdoors, riding, activity') !== 0 ||
    parsedTags.aiCaption.indexOf('A horse-riding activity outdoors.') !== 0 ||
    JSON.parse(parsedTags.metadataJson).ocr_text !== 'TEAM 2026' ||
    metadataSearchText_(parsedTags.metadataJson).indexOf('sports education') === -1
  ) {
    throw new Error('parseGroqTagResponse_ failed');
  }
  let malformedGroqRejected = false;
  try {
    parseGroqTagResponse_(JSON.stringify({
      caption_en: 'Visible scene', caption_ar: 'مشهد ظاهر',
      tags_en: ['one', 'two', 'three', 'four', 5],
      tags_ar: ['واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة']
    }));
  } catch (error) {
    malformedGroqRejected = true;
  }
  if (!malformedGroqRejected) throw new Error('malformed Groq metadata was accepted');
  function metadataRejected_(candidate) {
    try {
      normalizeGroqMetadata_(candidate);
      return false;
    } catch (error) {
      return true;
    }
  }
  const tooManyTags = Object.assign({}, parsedTags.metadata, {
    tags_en: Array.from({ length: 21 }, function (_, index) { return 'tag' + index; })
  });
  const tooLongItem = Object.assign({}, parsedTags.metadata, {
    objects_en: [Array(82).join('x')]
  });
  const tooLongCaption = Object.assign({}, parsedTags.metadata, {
    caption_en: Array(502).join('x')
  });
  const tooLongOcr = Object.assign({}, parsedTags.metadata, {
    ocr_text: Array(1202).join('x')
  });
  const wrongLanguageEn = Object.assign({}, parsedTags.metadata, {
    caption_en: '١٢٣', tags_en: ['١', '٢', '٣', '٤', '٥']
  });
  const wrongLanguageAr = Object.assign({}, parsedTags.metadata, {
    caption_ar: '123', tags_ar: ['one', 'two', 'three', 'four', 'five']
  });
  const extraMetadata = Object.assign({}, parsedTags.metadata, { extra: 'not allowed' });
  const wrongTypeMetadata = Object.assign({}, parsedTags.metadata, { objects_en: 'horse' });
  if (!metadataRejected_([]) || !metadataRejected_(tooManyTags) ||
      !metadataRejected_(tooLongItem) || !metadataRejected_(tooLongCaption) ||
      !metadataRejected_(tooLongOcr) || !metadataRejected_(wrongLanguageEn) ||
      !metadataRejected_(wrongLanguageAr) || !metadataRejected_(extraMetadata) ||
      !metadataRejected_(wrongTypeMetadata) ||
      parseStoredMetadata_(JSON.stringify([])) !== null ||
      parseStoredMetadata_(JSON.stringify(extraMetadata)) !== null) {
    throw new Error('Groq metadata boundary validation failed');
  }
  const publishCaption = buildPublishCaption_(
    parsedTags.metadataJson,
    Array(80).fill('original human context').join(' ') + '\uD800'
  );
  const tokenLines = [];
  appendCaptionSection_(tokenLines, 'X', ['alpha', 'beta'], ' ', 7);
  if (unicodeCodePointLength_(publishCaption) > 1024 || hasLoneSurrogate_(publishCaption) ||
      publishCaption.indexOf('EN: ') !== 0 ||
      publishCaption.indexOf('\nAR: ') === -1 || publishCaption.indexOf('TEAM 2026') === -1 ||
      tokenLines.join('\n') !== 'X: alpha' || unicodeCodePointLength_('😀') !== 1 ||
      buildPublishCaption_(parsedTags.metadataJson, 'context') !==
        buildPublishCaption_(parsedTags.metadataJson, 'context')) {
    throw new Error('publish caption budgeting or determinism failed');
  }
  const outputConfig = {
    outputPublishingEnabled: true,
    allowedChatId: '-1001',
    outputChatId: '-2002',
    groqTaggingEnabled: true,
    groqTaggingMode: GROQ_TAGGING_MODE_NEW_PHOTOS_ONLY,
    groqTaggingCutoff: '2026-08-28T23:59:59.000Z',
    botTokenFingerprint: Array(65).join('a'),
    groqApiKey: 'test-key'
  };
  outputConfig.outputGroupsVerifiedFor = outputGroupVerificationMarker_(
    parseOutputGroupIds_(outputConfig), outputConfig.botTokenFingerprint
  );
  const groups = parseOutputGroupConfig_(outputConfig);
  const eligibleCapture = publicationEligibilityForCapture_(
    outputConfig, '2026-08-29T00:00:00Z', '2026-08-29T00:00:00Z', rowA
  );
  const disabledCapture = publicationEligibilityForCapture_(Object.assign({}, outputConfig, {
    outputPublishingEnabled: false
  }), '2026-08-29T00:00:00Z', '2026-08-29T00:00:00Z', rowA);
  const sameGroupCapture = publicationEligibilityForCapture_(Object.assign({}, outputConfig, {
    outputChatId: '-1001'
  }), '2026-08-29T00:00:00Z', '2026-08-29T00:00:00Z', rowA);
  const staleVerificationCapture = publicationEligibilityForCapture_(Object.assign({}, outputConfig, {
    outputChatId: '-3003'
  }), '2026-08-29T00:00:00Z', '2026-08-29T00:00:00Z', rowA);
  const delayedOldCapture = publicationEligibilityForCapture_(
    outputConfig, '2026-08-30T00:00:00Z', '2026-08-28T23:59:59Z', rowA
  );
  const corruptCutoffCapture = publicationEligibilityForCapture_(Object.assign({}, outputConfig, {
    groqTaggingCutoff: 'invalid'
  }), '2026-08-30T00:00:00Z', '2026-08-30T00:00:00Z', rowA);
  const incompleteCapture = publicationEligibilityForCapture_(
    outputConfig, '2026-08-29T00:00:00Z', '2026-08-29T00:00:00Z',
    new Array(RECORD_HEADERS.length).fill('')
  );
  const invalidCanonicalIdsRejected = ['-0', '-01', '0', '100', '--1'].every(function (id) {
    try {
      parseOutputGroupIds_(Object.assign({}, outputConfig, { outputChatId: id }));
      return false;
    } catch (error) {
      return true;
    }
  });
  if (groups.outputChatId !== '-2002' ||
      eligibleCapture.status !== 'PUBLISH_WAITING_FOR_ENRICHMENT' ||
      eligibleCapture.eligibleAt !== '2026-08-29T00:00:00Z' ||
      disabledCapture.status !== '' || disabledCapture.eligibleAt !== '' ||
      sameGroupCapture.status !== 'PUBLISH_NOT_ELIGIBLE' || sameGroupCapture.eligibleAt !== '' ||
      staleVerificationCapture.status !== 'PUBLISH_NOT_ELIGIBLE' ||
      staleVerificationCapture.eligibleAt !== '' ||
      delayedOldCapture.status !== 'PUBLISH_NOT_ELIGIBLE' ||
      corruptCutoffCapture.status !== 'PUBLISH_NOT_ELIGIBLE' ||
      incompleteCapture.status !== 'PUBLISH_NOT_ELIGIBLE' ||
      !invalidCanonicalIdsRejected) {
    throw new Error('output group or new-record eligibility gating failed');
  }
  const firstNewOnlyPlan = planGroqActivation_(
    GROQ_TAGGING_MODE_NEW_PHOTOS_ONLY, {}, '2026-08-30T00:00:00.000Z'
  );
  const resumedNewOnlyPlan = planGroqActivation_(GROQ_TAGGING_MODE_NEW_PHOTOS_ONLY, {
    GROQ_TAGGING_ENABLED: 'true',
    GROQ_TAGGING_MODE: GROQ_TAGGING_MODE_NEW_PHOTOS_ONLY,
    GROQ_TAGGING_AFTER_MESSAGE_DATE: '2026-08-30T00:00:00.000Z'
  }, '2026-09-01T00:00:00.000Z');
  const restartedNewOnlyPlan = planGroqActivation_(GROQ_TAGGING_MODE_NEW_PHOTOS_ONLY, {
    GROQ_TAGGING_MODE: GROQ_TAGGING_MODE_NEW_PHOTOS_ONLY,
    GROQ_TAGGING_AFTER_MESSAGE_DATE: '2026-08-30T00:00:00.000Z'
  }, '2026-09-01T00:00:00.000Z');
  let invalidEnabledModeRejected = false;
  try {
    planGroqActivation_(GROQ_TAGGING_MODE_NEW_PHOTOS_ONLY, {
      GROQ_TAGGING_ENABLED: 'true', GROQ_TAGGING_MODE: 'CORRUPT'
    }, '2026-08-30T00:00:00.000Z');
  } catch (error) {
    invalidEnabledModeRejected = true;
  }
  const safeActivation = groqActivationState_(Object.assign({}, outputConfig));
  const unknownActivation = groqActivationState_({
    groqTaggingEnabled: true, groqTaggingMode: 'CORRUPT', groqTaggingCutoff: ''
  });
  const oldSentRow = new Array(RECORD_HEADERS.length).fill('');
  oldSentRow[2] = '999999999';
  oldSentRow[3] = '2026-08-28T23:59:59Z';
  const newSentRow = oldSentRow.slice();
  newSentRow[2] = '1';
  newSentRow[3] = '2026-08-29T00:00:00Z';
  const eligibleTagStatus = tagStatusForCapture_(
    outputConfig, '2026-08-29T00:00:00Z', rowA
  );
  const oldTagStatus = tagStatusForCapture_(
    outputConfig, '2026-08-28T23:59:59Z', rowA
  );
  const disabledTagStatus = tagStatusForCapture_(Object.assign({}, outputConfig, {
    groqTaggingEnabled: false
  }), '2026-08-29T00:00:00Z', rowA);
  const inFlightStatus = new Array(7).fill('');
  inFlightStatus[0] = 'TAGGING';
  inFlightStatus[6] = '2026-08-30T00:10:00Z';
  const expiredStatus = inFlightStatus.slice();
  expiredStatus[6] = '2026-08-29T23:59:59Z';
  const verifiedGroupFixture = validateTelegramGroupForBot_(
    '-1001', { id: -1001, type: 'supergroup', title: 'Input' },
    { user: { id: 42 }, status: 'administrator' }, '42'
  );
  let nonAdminRejected = false;
  try {
    validateTelegramGroupForBot_(
      '-1001', { id: -1001, type: 'supergroup', title: 'Input' },
      { user: { id: 42 }, status: 'member' }, '42'
    );
  } catch (error) {
    nonAdminRejected = true;
  }
  const changedTokenMarker = outputGroupVerificationMarker_(
    groups, Array(65).join('b')
  );
  const restoredValues = {
    GROQ_TAGGING_ENABLED: 'partial', GROQ_TAGGING_MODE: 'partial',
    GROQ_TAGGING_AFTER_MESSAGE_DATE: 'partial', UNRELATED: 'preserve-me'
  };
  restoreGroqManagedProperties_({
    setProperty: function (key, value) { restoredValues[key] = value; },
    deleteProperty: function (key) { delete restoredValues[key]; }
  }, {
    GROQ_TAGGING_MODE: GROQ_TAGGING_MODE_NEW_PHOTOS_ONLY,
    GROQ_TAGGING_AFTER_MESSAGE_DATE: '2026-08-30T00:00:00.000Z',
    UNRELATED: 'preserve-me'
  });
  if (firstNewOnlyPlan.cutoff !== '2026-08-30T00:00:00.000Z' ||
      firstNewOnlyPlan.resumed || !resumedNewOnlyPlan.resumed ||
      resumedNewOnlyPlan.cutoff !== '2026-08-30T00:00:00.000Z' ||
      restartedNewOnlyPlan.resumed ||
      restartedNewOnlyPlan.cutoff !== '2026-09-01T00:00:00.000Z' ||
      !invalidEnabledModeRejected || !safeActivation.valid || unknownActivation.valid ||
      groqRowIsInsideActivationScope_(oldSentRow, safeActivation) ||
      !groqRowIsInsideActivationScope_(newSentRow, safeActivation) ||
      eligibleTagStatus !== 'TAG_PENDING' || oldTagStatus !== 'TAG_NOT_ELIGIBLE' ||
      disabledTagStatus !== 'TAG_NOT_ELIGIBLE' ||
      !triggerInvocationIsCurrent_(null, '') ||
      !triggerInvocationIsCurrent_({ triggerUid: 'new-trigger' }, 'new-trigger') ||
      triggerInvocationIsCurrent_({ triggerUid: 'old-trigger' }, 'new-trigger') ||
      triggerInvocationIsCurrent_({ triggerUid: 'old-trigger' }, '') ||
      !taggingClaimsAreInFlight_([inFlightStatus], new Date('2026-08-30T00:00:00Z')) ||
      taggingClaimsAreInFlight_([expiredStatus], new Date('2026-08-30T00:00:00Z')) ||
      verifiedGroupFixture.title !== 'Input' || !nonAdminRejected ||
      changedTokenMarker === outputConfig.outputGroupsVerifiedFor ||
      restoredValues.GROQ_TAGGING_ENABLED ||
      restoredValues.GROQ_TAGGING_MODE !== GROQ_TAGGING_MODE_NEW_PHOTOS_ONLY ||
      restoredValues.GROQ_TAGGING_AFTER_MESSAGE_DATE !== '2026-08-30T00:00:00.000Z' ||
      restoredValues.UNRELATED !== 'preserve-me') {
    throw new Error('activation cutoff, fail-closed mode, or group identity checks failed');
  }
  const extensionHeaders = RECORD_HEADERS.slice(24);
  const blankExtension = [new Array(extensionHeaders.length).fill('')];
  const validExtension = [extensionHeaders.slice(), new Array(extensionHeaders.length).fill('')];
  validExtension[1][0] = parsedTags.metadataJson;
  const legacyExtension = [
    extensionHeaders.slice(0, 13).concat(new Array(extensionHeaders.length - 13).fill('')),
    new Array(extensionHeaders.length).fill('')
  ];
  legacyExtension[1][0] = parsedTags.metadataJson;
  const collidingExtension = [new Array(extensionHeaders.length).fill('')];
  collidingExtension[0][0] = 'unrelated_header';
  let insertedColumns = null;
  const narrowSheet = {
    getMaxColumns: function () { return 24; },
    insertColumnsAfter: function (after, count) { insertedColumns = [after, count]; }
  };
  if (!recordsExtensionSchemaIsSafe_(blankExtension, extensionHeaders) ||
      !recordsExtensionSchemaIsSafe_(validExtension, extensionHeaders) ||
      !recordsExtensionSchemaIsSafe_(legacyExtension, extensionHeaders) ||
      recordsExtensionSchemaIsSafe_(collidingExtension, extensionHeaders) ||
      ensureSheetColumns_(narrowSheet, RECORD_HEADERS.length) !== RECORD_HEADERS.length ||
      !insertedColumns || insertedColumns[0] !== 24 ||
      insertedColumns[1] !== RECORD_HEADERS.length - 24) {
    throw new Error('Records physical-grid or extension collision validation failed');
  }
  if (
    !shouldRetryGroqError_({ httpStatus: 429 }, 1) ||
    !shouldRetryGroqError_({ httpStatus: 503 }, 4) ||
    shouldRetryGroqError_({ httpStatus: 401 }, 1) ||
    shouldRetryGroqError_({ httpStatus: 503 }, GROQ_MAX_ATTEMPTS) ||
    groqBackoffMinutes_(1) !== 2 ||
    groqBackoffMinutes_(10) !== 60
  ) {
    throw new Error('Groq retry policy failed');
  }
  const publishGroups = { inputChatId: '-1001', outputChatId: '-2002' };
  const publicationRow = new Array(RECORD_HEADERS.length).fill('');
  publicationRow[0] = 'publish-a';
  publicationRow[1] = publishGroups.inputChatId;
  publicationRow[11] = 'telegram-file-a';
  markArchived_(publicationRow, 'publish-a', 103);
  publicationRow[16] = 'TAGGED';
  publicationRow[RECORD_FIELD.AI_METADATA_JSON] = parsedTags.metadataJson;
  publicationRow[RECORD_FIELD.PUBLISH_ELIGIBLE_AT_UTC] = '2026-08-29T00:00:00Z';
  publicationRow[RECORD_FIELD.PUBLISH_STATUS] = 'PUBLISH_PENDING';
  publicationRow[RECORD_FIELD.OUTPUT_CHAT_ID] = publishGroups.outputChatId;
  const publicationNow = new Date('2026-08-29T01:00:00Z');
  if (!isClaimablePublicationRow_(publicationRow, publishGroups, publicationNow)) {
    throw new Error('eligible publication row was not claimable');
  }
  const duplicatePublication = publicationRow.slice();
  duplicatePublication[RECORD_FIELD.OUTPUT_MESSAGE_ID] = '12345';
  const oldPublication = publicationRow.slice();
  oldPublication[RECORD_FIELD.PUBLISH_ELIGIBLE_AT_UTC] = '';
  const ambiguousPublication = publicationRow.slice();
  ambiguousPublication[RECORD_FIELD.PUBLISH_STATUS] = 'PUBLISH_UNKNOWN';
  const unsettledPublication = publicationRow.slice();
  unsettledPublication[RECORD_FIELD.PUBLISH_ELIGIBLE_AT_UTC] = '2026-08-29T00:59:50Z';
  const terminalTagRow = publicationRow.slice();
  terminalTagRow[RECORD_FIELD.PUBLISH_STATUS] = 'PUBLISH_WAITING_FOR_ENRICHMENT';
  applyTerminalTagError_(terminalTagRow, 'lease exhausted');
  const corruptPublication = publicationRow.slice();
  corruptPublication[RECORD_FIELD.AI_METADATA_JSON] = '[]';
  if (isClaimablePublicationRow_(duplicatePublication, publishGroups, publicationNow) ||
      isClaimablePublicationRow_(oldPublication, publishGroups, publicationNow) ||
      isClaimablePublicationRow_(ambiguousPublication, publishGroups, publicationNow) ||
      isClaimablePublicationRow_(unsettledPublication, publishGroups, publicationNow) ||
      !hasPublicationSettled_('2026-08-29T00:59:39Z', publicationNow) ||
      terminalTagRow[16] !== 'TAG_ERROR' ||
      terminalTagRow[RECORD_FIELD.PUBLISH_STATUS] !== 'PUBLISH_BLOCKED_ENRICHMENT' ||
      terminalTagRow[RECORD_FIELD.PUBLISH_ERROR] !== 'lease exhausted' ||
      publicationRowBoundaryError_(corruptPublication, publishGroups) !==
        'Stored AI metadata JSON is invalid.' ||
      publicationRowBoundaryError_(publicationRow, publishGroups) !== '') {
    throw new Error('publication duplicate or no-backfill suppression failed');
  }
  const claimRow = publicationRow.slice();
  claimRow[RECORD_FIELD.PUBLISH_STATUS] = 'PUBLISHING';
  claimRow[RECORD_FIELD.PUBLISH_ATTEMPTS] = 1;
  claimRow[RECORD_FIELD.PUBLISH_CLAIM_ID] = 'claim-1';
  claimRow[RECORD_FIELD.PUBLISH_LEASE_UNTIL_UTC] = '2026-08-29T01:10:00Z';
  claimRow[RECORD_FIELD.PUBLISH_CAPTION] = publishCaption;
  const claimSnapshot = {
    recordId: 'publish-a', inputChatId: '-1001', fileId: 'telegram-file-a',
    driveFileId: 'drive-publish-a', archiveByteSize: 103,
    archiveMimeType: 'image/jpeg', archiveSha256: Array(65).join('a'),
    archiveCompletedAtUtc: '2026-08-29T00:00:00.000Z',
    metadataJson: parsedTags.metadataJson, tagState: 'TAGGED',
    eligibleAt: '2026-08-29T00:00:00Z', outputChatId: '-2002',
    caption: publishCaption, attempts: 1, claimId: 'claim-1',
    leaseUntilUtc: '2026-08-29T01:10:00Z'
  };
  const claimMutationIndexes = [
    0, 1, 11, 13, 16, RECORD_FIELD.ARCHIVE_BYTE_SIZE,
    RECORD_FIELD.ARCHIVE_SHA256, RECORD_FIELD.ARCHIVE_STATUS,
    RECORD_FIELD.ARCHIVE_COMPLETED_AT_UTC, RECORD_FIELD.AI_METADATA_JSON,
    RECORD_FIELD.PUBLISH_ELIGIBLE_AT_UTC, RECORD_FIELD.PUBLISH_STATUS,
    RECORD_FIELD.PUBLISH_ATTEMPTS, RECORD_FIELD.PUBLISH_CLAIM_ID,
    RECORD_FIELD.PUBLISH_LEASE_UNTIL_UTC, RECORD_FIELD.OUTPUT_CHAT_ID,
    RECORD_FIELD.PUBLISH_CAPTION, RECORD_FIELD.OUTPUT_MESSAGE_ID
  ];
  const claimMutationsRejected = claimMutationIndexes.every(function (fieldIndex) {
    const changed = claimRow.slice();
    changed[fieldIndex] = String(changed[fieldIndex] || '') + '-changed';
    return !publishClaimMatchesRow_(changed, claimSnapshot, publicationNow);
  });
  if (!publishClaimMatchesRow_(claimRow, claimSnapshot, publicationNow) ||
      !claimMutationsRejected ||
      publishClaimMatchesRow_(claimRow, claimSnapshot, new Date('2026-08-29T01:10:01Z'))) {
    throw new Error('publication claim snapshot revalidation failed');
  }
  const legacyArchiveRow = new Array(RECORD_HEADERS.length).fill('');
  legacyArchiveRow[0] = 'legacy';
  legacyArchiveRow[13] = 'legacy-drive';
  const failedArchiveRow = new Array(RECORD_HEADERS.length).fill('');
  failedArchiveRow[RECORD_FIELD.ARCHIVE_STATUS] = 'ARCHIVE_FAILED';
  if (archiveAuditClassification_(publicationRow, {
        exists: true, byteSize: 103, mimeType: 'image/jpeg',
        sha256: Array(65).join('a')
      }) !==
        'HEALTHY' ||
      archiveAuditClassification_(publicationRow, { exists: false }) !== 'MISSING_OBJECT' ||
      archiveAuditClassification_(publicationRow, { exists: true, byteSize: 999 }) !==
        'SIZE_CONFLICT' ||
      archiveAuditClassification_(legacyArchiveRow, null) !== 'LEGACY_UNVERIFIED' ||
      archiveAuditClassification_(failedArchiveRow, null) !== 'ARCHIVE_FAILED' ||
      !recordSearchIsAllowed_(legacyArchiveRow, true) ||
      recordSearchIsAllowed_(legacyArchiveRow, false)) {
    throw new Error('archive state, audit, or legacy-search policy failed');
  }
  const conflictingLegacy = legacyArchiveRow.slice();
  conflictingLegacy[RECORD_FIELD.ARCHIVE_SHA256] = Array(65).join('b');
  const archivedWithError = publicationRow.slice();
  archivedWithError[RECORD_FIELD.ARCHIVE_ERROR] = 'stale failure';
  if (legacyArchiveRowIsUnverified_(conflictingLegacy) ||
      archiveRowIsReady_(archivedWithError) ||
      redactWebhookInfo_({ result: {
        url: 'https://script.google.com/macros/s/deployment/exec/' + Array(33).join('a')
      } }).result.url.indexOf(Array(33).join('a')) !== -1) {
    throw new Error('strict legacy, archive error, or webhook redaction check failed');
  }
  const publishedResponse = classifyTelegramPublishResponse_(
    200, JSON.stringify({ ok: true, result: { message_id: 987 } })
  );
  if (publishedResponse.messageId !== '987') {
    throw new Error('Telegram publication success parsing failed');
  }
  function capturePublishError(status, body) {
    try {
      classifyTelegramPublishResponse_(status, body);
      return null;
    } catch (error) {
      return error;
    }
  }
  const retryPublish = capturePublishError(429, JSON.stringify({
    ok: false,
    error_code: 429,
    description: 'Too Many Requests',
    parameters: { retry_after: 12 }
  }));
  const failedPublish = capturePublishError(403, JSON.stringify({
    ok: false, error_code: 403, description: 'Forbidden'
  }));
  const unknownPublish = capturePublishError(502, '<html>bad gateway</html>');
  const invalidSuccessBodies = [
    'null', '[]',
    JSON.stringify({ ok: true, result: { message_id: 0 } }),
    JSON.stringify({ ok: true, result: { message_id: -1 } }),
    JSON.stringify({ ok: true, result: { message_id: 1.5 } }),
    JSON.stringify({ ok: true, result: { message_id: '987' } }),
    JSON.stringify({ ok: 'true', result: { message_id: 987 } }),
    JSON.stringify({ ok: true, result: { message_id: Number.MAX_SAFE_INTEGER + 1 } })
  ].map(function (body) { return capturePublishError(200, body); });
  const overflowRetry = capturePublishError(429, JSON.stringify({
    ok: false, error_code: 429, description: 'wait',
    parameters: { retry_after: 99999 }
  }));
  if (!retryPublish || retryPublish.publishDisposition !== 'RETRY' ||
      retryPublish.retryAfterSeconds !== 12 ||
      publishErrorDisposition_(retryPublish, 1).status !== 'PUBLISH_RETRY' ||
      publishErrorDisposition_(retryPublish, PUBLISH_MAX_ATTEMPTS).status !== 'PUBLISH_FAILED' ||
      !failedPublish || failedPublish.publishDisposition !== 'FAILED' ||
      publishErrorDisposition_(failedPublish, 1).status !== 'PUBLISH_FAILED' ||
      !unknownPublish || unknownPublish.publishDisposition !== 'UNKNOWN' ||
      publishErrorDisposition_(unknownPublish, 1).status !== 'PUBLISH_UNKNOWN' ||
      !invalidSuccessBodies.every(function (error) {
        return error && error.publishDisposition === 'UNKNOWN';
      }) || !overflowRetry || overflowRetry.retryAfterSeconds !== 3600 ||
      boundedRetryAfterSeconds_(-5) !== 0 ||
      boundedRetryAfterSeconds_('1e999') !== 0 ||
      publishBackoffMinutes_(1) !== 2 || publishBackoffMinutes_(10) !== 60) {
    throw new Error('Telegram publication response classification failed');
  }

  const pilotProperties = {
    GEMINI_API_KEY: 'test-key',
    GEMINI_PILOT_ENABLED: 'true',
    GEMINI_INPUTS_CONFIRMED_NON_SENSITIVE: 'true',
    GEMINI_PILOT_DATASET_ID: 'synthetic-v1',
    GEMINI_PILOT_APPROVED_BY: 'privacy-owner',
    GEMINI_PILOT_APPROVED_AT: '2026-01-01T00:00:00Z',
    GEMINI_PILOT_EXPIRES_AT: '2027-01-01T00:00:00Z',
    GEMINI_PILOT_RECORD_IDS: 'a,b,c,d,e,f,g,j,k',
    GEMINI_PILOT_QUERIES: 'Farm\nمزرعة'
  };
  const pilot = parseGeminiPilotConfig_(pilotProperties, new Date('2026-06-01T00:00:00Z'));
  if (!pilot.querySet.has(normalizeSearchText_('  FARM  ')) ||
      pilot.querySet.has(normalizeSearchText_('school')) ||
      parseIsoDate_('2026-01-01T00:00:00.123456Z').getUTCMilliseconds() !== 123 ||
      !headersMatch_(EMBEDDING_HEADERS.slice(), EMBEDDING_HEADERS) ||
      headersMatch_(['record_id'], EMBEDDING_HEADERS)) {
    throw new Error('Gemini normalized query approval failed');
  }
  let gateRejected = false;
  try {
    parseGeminiPilotConfig_(Object.assign({}, pilotProperties, {
      GEMINI_PILOT_ENABLED: 'false'
    }), new Date('2026-06-01T00:00:00Z'));
  } catch (error) {
    gateRejected = true;
  }
  let attestationRejected = false;
  try {
    parseGeminiPilotConfig_(Object.assign({}, pilotProperties, {
      GEMINI_INPUTS_CONFIRMED_NON_SENSITIVE: 'false'
    }), new Date('2026-06-01T00:00:00Z'));
  } catch (error) {
    attestationRejected = true;
  }
  let duplicatesRejected = false;
  try {
    parseGeminiPilotConfig_(Object.assign({}, pilotProperties, {
      GEMINI_PILOT_QUERIES: 'Farm\n farm '
    }), new Date('2026-06-01T00:00:00Z'));
  } catch (error) {
    duplicatesRejected = true;
  }
  let oversizedAllowlistRejected = false;
  try {
    parseGeminiPilotConfig_(Object.assign({}, pilotProperties, {
      GEMINI_PILOT_RECORD_IDS: Array.from({ length: 101 }, function (_, index) {
        return 'record-' + index;
      }).join(',')
    }), new Date('2026-06-01T00:00:00Z'));
  } catch (error) {
    oversizedAllowlistRejected = true;
  }
  const expiredPurge = parseGeminiPurgeConfig_(Object.assign({}, pilotProperties, {
    GEMINI_PILOT_EXPIRES_AT: '2026-02-01T00:00:00Z'
  }));
  let malformedPurgeRejected = false;
  try {
    parseGeminiPurgeConfig_(Object.assign({}, pilotProperties, {
      GEMINI_PILOT_RECORD_IDS: 'a,,b'
    }));
  } catch (error) {
    malformedPurgeRejected = true;
  }
  if (!gateRejected || !attestationRejected || !duplicatesRejected ||
      !oversizedAllowlistRejected ||
      !malformedPurgeRejected || expiredPurge.expiresAt >= new Date('2026-06-01T00:00:00Z')) {
    throw new Error('Gemini pilot configuration did not fail closed');
  }

  function semanticRecord(id) {
    const row = new Array(RECORD_HEADERS.length).fill('');
    row[0] = id;
    row[11] = 'file-' + id;
    markArchived_(row, id, 100 + id.charCodeAt(0));
    row[18] = 'manual-' + id;
    return row;
  }
  function semanticEmbedding(id, vectorJson, status, updated, dimensions, model) {
    return [
      id, pilot.datasetId, pilot.approvedBy, pilot.approvedAt, pilot.expiresAt,
      model || pilot.model, dimensions || pilot.dimensions, vectorJson,
      status || 'READY', 1, '', updated
    ];
  }
  const semanticRows = [
    semanticEmbedding('a', '[0,1,0]', 'READY', '2026-05-01T00:00:00Z', 3),
    semanticEmbedding('a', '[1,0,0]', 'READY', '2026-05-02T00:00:00Z', 3),
    semanticEmbedding('b', '[0.8,0.6,0]', 'READY', '2026-05-02T00:00:00Z', 3),
    semanticEmbedding('c', '[0.8,0.6,0]', 'READY', '2026-05-02T00:00:00Z', 3),
    semanticEmbedding('d', '[0,0,0]', 'READY', '2026-05-02T00:00:00Z', 3),
    semanticEmbedding('e', '[1,0]', 'READY', '2026-05-02T00:00:00Z', 2),
    semanticEmbedding('f', '[1e309,0,0]', 'READY', '2026-05-02T00:00:00Z', 3),
    semanticEmbedding('g', '[1,0,0]', 'REVOKED', '2026-05-02T00:00:00Z', 3),
    semanticEmbedding('i', '[1,0,0]', 'READY', '2026-05-02T00:00:00Z', 3),
    semanticEmbedding('j', '[1,0,0]', 'READY', '2026-05-02T00:00:00Z', 3, 'old-model'),
    semanticEmbedding('k', '{bad', 'READY', '2026-05-02T00:00:00Z', 3),
    semanticEmbedding('orphan', '[1,0,0]', 'READY', '2026-05-02T00:00:00Z', 3)
  ];
  const pilot3 = Object.assign({}, pilot, { dimensions: 3 });
  const semanticRanked = rankSemanticRows_(
    semanticRows,
    ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'i', 'j', 'k'].map(semanticRecord),
    [1, 0, 0],
    pilot3,
    5,
    new Date('2026-06-01T00:00:00Z')
  );
  if (semanticRanked.map(function (result) { return result.recordId; }).join(',') !== 'a,b,c' ||
      latestEmbeddingRows_(semanticRows)['a\n' + pilot.model].index !== 1 ||
      storedEmbeddingVectorIsValid_(semanticRows[4], 3) ||
      !storedEmbeddingVectorIsValid_(semanticRows[1], 3)) {
    throw new Error('Gemini semantic ranking, ties, or duplicate selection failed');
  }
  const duplicateRecordRanking = rankSemanticRows_(
    semanticRows,
    ['a', 'a', 'b', 'c'].map(semanticRecord),
    [1, 0, 0], pilot3, 5, new Date('2026-06-01T00:00:00Z')
  );
  if (duplicateRecordRanking.map(function (result) { return result.recordId; }).join(',') !== 'b,c') {
    throw new Error('Gemini duplicate Photo Record exclusion failed');
  }
  const hybridRanked = fuseHybridResults_([
    Object.assign({}, semanticRanked[2], { recordId: 'c', score: 10 }),
    Object.assign({}, semanticRanked[0], { recordId: 'a', score: 9 })
  ], semanticRanked, 5);
  const duplicateFusion = fuseHybridResults_([
    { recordId: 'a' }, { recordId: 'b' }, { recordId: 'a' }
  ], [], 5);
  hybridRanked[0].searchMode = 'Hybrid pilot';
  if (hybridRanked.map(function (result) { return result.recordId; }).join(',') !== 'a,c,b' ||
      duplicateFusion[0].recordId !== 'a' || duplicateFusion.length !== 2 ||
      searchResultCaption_(hybridRanked[0], 0, 3).indexOf('Hybrid pilot') === -1 ||
      rankSemanticRows_(semanticRows, [semanticRecord('a')], [1, 0, 0], pilot3, 5,
        new Date('2027-01-01T00:00:01Z')).length !== 0) {
    throw new Error('Gemini search labeling or expiry exclusion failed');
  }
  let invalidVectorRejected = false;
  try {
    validateEmbeddingVector_([0, 0, 0], 3);
  } catch (error) {
    invalidVectorRejected = true;
  }
  const invalidTypes = [['1', 0, 0], [true, 0, 0], [null, 0, 0]];
  const invalidTypesRejected = invalidTypes.every(function (vector) {
    try {
      validateEmbeddingVector_(vector, 3);
      return false;
    } catch (error) {
      return true;
    }
  });
  if (!invalidVectorRejected || !invalidTypesRejected ||
      !isNaN(cosineSimilarity_([1, 0], [1])) ||
      !isNaN(cosineSimilarity_(['1', 0], [1, 0]))) {
    throw new Error('Gemini vector validation failed');
  }
  console.log('PASS: Telegram collector self-check');
  return true;
}
