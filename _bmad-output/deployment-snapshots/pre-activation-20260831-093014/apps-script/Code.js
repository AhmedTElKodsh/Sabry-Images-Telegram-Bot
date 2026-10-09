const POC_SPREADSHEET_ID = '1iklZs_4cPbgoqr1RSYY1jGGUT9sWbV7Q4G7kFrT6wn4';
const POC_DRIVE_FOLDER_ID = '1nwNIXt4fw39mu3prtJwCJSz9fk0Lt2bi';

const RECORD_HEADERS = [
  'record_id', 'chat_id', 'update_id', 'upload_time_utc',
  'upload_time_cairo', 'username', 'display_name', 'user_id',
  'message_id', 'before_line', 'after_line_caption', 'file_id',
  'file_unique_id', 'drive_file_id', 'drive_link', 'media_group_id',
  'processing_status', 'error', 'manual_tags', 'ai_tags', 'ai_caption',
  'tag_attempts', 'tag_next_attempt_utc', 'tag_model'
];

const EVENT_HEADERS = [
  'update_id', 'chat_id', 'message_id', 'user_id',
  'kind', 'text', 'record_id', 'received_at_utc'
];

const DEFAULT_GROQ_MODEL = 'qwen/qwen3.6-27b';
const GROQ_TAG_BATCH_SIZE = 2;
const GROQ_MAX_ATTEMPTS = 5;
const GROQ_LEASE_MINUTES = 10;

function setupPoc() {
  const properties = PropertiesService.getScriptProperties();
  const current = properties.getProperties();
  properties.setProperties({
    SPREADSHEET_ID: current.SPREADSHEET_ID || POC_SPREADSHEET_ID,
    DRIVE_FOLDER_ID: current.DRIVE_FOLDER_ID || POC_DRIVE_FOLDER_ID,
    WEBHOOK_SECRET: current.WEBHOOK_SECRET || Utilities.getUuid().replace(/-/g, '')
  });

  const spreadsheet = SpreadsheetApp.openById(
    properties.getProperty('SPREADSHEET_ID')
  );
  let records = spreadsheet.getSheetByName('Records');
  if (!records) {
    records = spreadsheet.getSheetByName('Sheet1');
    records = records ? records.setName('Records') : spreadsheet.insertSheet('Records');
  }
  prepareSheet_(records, RECORD_HEADERS);
  prepareSheet_(
    spreadsheet.getSheetByName('Events') || spreadsheet.insertSheet('Events'),
    EVENT_HEADERS
  );

  return {
    spreadsheet: spreadsheet.getUrl(),
    driveFolder: DriveApp.getFolderById(
      properties.getProperty('DRIVE_FOLDER_ID')
    ).getUrl(),
    next: 'Run bootstrapPoc() to discover the group and install the webhook.'
  };
}

function bootstrapPoc() {
  const setup = setupPoc();
  const properties = PropertiesService.getScriptProperties();
  let chatId = properties.getProperty('ALLOWED_CHAT_ID');
  if (!chatId) {
    const groups = discoverChatIds().filter(function (chat) {
      return String(chat.chat_id).charAt(0) === '-';
    });
    if (groups.length > 1) {
      throw new Error(
        'Expected one recent Telegram group, found ' + groups.length +
        '. Set ALLOWED_CHAT_ID explicitly, then run bootstrapPoc() again.'
      );
    }
    if (groups.length === 1) {
      chatId = groups[0].chat_id;
      properties.setProperty('ALLOWED_CHAT_ID', chatId);
    }
  }

  const webAppUrl = ScriptApp.getService().getUrl();
  if (!webAppUrl) throw new Error('Deploy this project as a web app first.');
  properties.setProperty('WEB_APP_URL', webAppUrl);
  const webhook = installWebhook();
  return {
    ok: webhook.ok,
    chat_id: chatId || 'Will bind on the first group message',
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
  const config = getConfig_(false);
  if (webhookSecretFromEvent_(e) !== config.webhookSecret) {
    return HtmlService.createHtmlOutput('not found');
  }

  const update = JSON.parse(e.postData.contents);
  // ponytail: one global lock preserves POC ordering; split capture/search locks only
  // when measured Telegram volume makes this a bottleneck.
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Webhook is busy; retry this update.');
  try {
    if (!config.allowedChatId) {
      if (!isGroupMessage_(update.message)) {
        return HtmlService.createHtmlOutput('ignored');
      }
      // ponytail: first group binds this single-group POC; use an invite code before multi-group use.
      config.allowedChatId = String(update.message.chat.id);
      PropertiesService.getScriptProperties().setProperty(
        'ALLOWED_CHAT_ID',
        config.allowedChatId
      );
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

  const results = searchRecords_(records, command.query, 5);
  if (!results.length) {
    sendText_(
      message.chat.id,
      'No caption, adjacent-text, or tag match. Semantic image matching is not enabled yet.',
      config
    );
  } else {
    results.forEach(function (result, index) {
      sendSearchPhoto_(message.chat.id, result, index, results.length, config);
    });
  }
  appendEvent_(events, update, message, 'command', command.query, '');
  return results.length ? 'search-results' : 'search-empty';
}

function processPhoto_(update, message, records, events, config) {
  const recordId = makeRecordId_(message);
  const existingRow = findRecordRow_(records, recordId);
  if (existingRow) {
    appendEvent_(events, update, message, 'photo', firstLine_(message.caption), recordId);
    return 'duplicate-record';
  }

  const userId = getUserId_(message);
  const beforeRow = findEventRow_(
    events, String(message.chat.id), message.message_id - 1, userId, 'text'
  );
  const beforeLine = beforeRow ? String(events.getRange(beforeRow, 6).getValue()) : '';
  const afterLine = firstLine_(message.caption);
  const safeAfterLine = sheetText_(afterLine);
  const photo = largestPhoto_(message.photo);
  const stored = storePhoto_(photo, message, recordId, config);
  const sentAt = new Date(message.date * 1000);

  records.appendRow([
    recordId,
    String(message.chat.id),
    String(update.update_id),
    Utilities.formatDate(sentAt, 'UTC', "yyyy-MM-dd'T'HH:mm:ss'Z'"),
    Utilities.formatDate(sentAt, 'Africa/Cairo', 'yyyy-MM-dd HH:mm:ss'),
    sheetText_(message.from && message.from.username || ''),
    sheetText_(displayName_(message.from)),
    userId,
    String(message.message_id),
    beforeLine,
    safeAfterLine,
    photo.file_id,
    photo.file_unique_id,
    stored.id,
    stored.url,
    message.media_group_id || '',
    'TAG_PENDING',
    ''
  ]);

  if (beforeRow) events.getRange(beforeRow, 7).setValue(recordId);
  appendEvent_(events, update, message, 'photo', safeAfterLine, recordId);
  return 'saved';
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
  const existing = folder.getFilesByName(fileName);
  const file = existing.hasNext()
    ? existing.next()
    : folder.createFile(fetchOk_(
      'https://api.telegram.org/file/bot' + config.botToken + '/' + filePath
    ).getBlob().setName(fileName));
  return { id: file.getId(), url: file.getUrl() };
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
  const config = getConfig_(false);
  if (!config.webAppUrl) throw new Error('Run bootstrapPoc() after deploying the web app.');
  return telegram_('setWebhook', {
    url: config.webAppUrl.replace(/\/$/, '') +
      '?secret=' + encodeURIComponent(config.webhookSecret),
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
  console.log(JSON.stringify(info));
  return info;
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
    groqTaggingEnabled: properties.GROQ_TAGGING_ENABLED === 'true'
  };
  ['botToken', 'spreadsheetId', 'driveFolderId', 'webhookSecret'].forEach(function (key) {
    if (!config[key]) throw new Error('Missing Script Property: ' + key);
  });
  if (requireChat && !config.allowedChatId) {
    throw new Error('Missing Script Property: ALLOWED_CHAT_ID');
  }
  return config;
}

function enableGroqTagging() {
  const config = getConfig_(false);
  if (!config.groqApiKey) {
    throw new Error(
      'Missing Script Property: GROQ_API_KEY. Add it in Project Settings, then run again.'
    );
  }
  setupPoc();
  PropertiesService.getScriptProperties().setProperty('GROQ_TAGGING_ENABLED', 'true');
  const queued = queueExistingPhotosForTagging();
  const triggerCreated = ensureGroqTagTrigger_();
  const firstBatch = processPendingTags();
  return {
    enabled: true,
    model: config.groqModel,
    queued: queued,
    trigger_created: triggerCreated,
    first_batch: firstBatch
  };
}

function disableGroqTagging() {
  PropertiesService.getScriptProperties().deleteProperty('GROQ_TAGGING_ENABLED');
  let removed = 0;
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'processPendingTags') {
      ScriptApp.deleteTrigger(trigger);
      removed++;
    }
  });
  return { enabled: false, triggers_removed: removed };
}

function ensureGroqTagTrigger_() {
  const exists = ScriptApp.getProjectTriggers().some(function (trigger) {
    return trigger.getHandlerFunction() === 'processPendingTags';
  });
  if (exists) return false;
  ScriptApp.newTrigger('processPendingTags').timeBased().everyMinutes(5).create();
  return true;
}

function queueExistingPhotosForTagging() {
  const config = getConfig_(false);
  const spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
  const sheet = spreadsheet.getSheetByName('Records');
  if (!sheet || sheet.getLastRow() < 2) return 0;

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Could not lock Records for tag queueing.');
  try {
    const rowCount = sheet.getLastRow() - 1;
    const values = sheet.getRange(2, 1, rowCount, RECORD_HEADERS.length).getValues();
    let queued = 0;
    values.forEach(function (row) {
      const status = String(row[16] || '');
      if (
        row[13] &&
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

function processPendingTags() {
  const config = getConfig_(false);
  if (!config.groqTaggingEnabled) {
    return { processed: 0, skipped: 'Groq tagging is disabled' };
  }
  if (!config.groqApiKey) {
    return { processed: 0, skipped: 'Missing GROQ_API_KEY' };
  }

  const claims = claimPendingTags_(config, GROQ_TAG_BATCH_SIZE);
  let tagged = 0;
  let retrying = 0;
  let failed = 0;
  claims.forEach(function (claim) {
    try {
      const tags = groqTagDriveImage_(claim.driveFileId, config);
      finishTagClaim_(config, claim, {
        status: 'TAGGED',
        aiTags: tags.aiTags,
        aiCaption: tags.aiCaption,
        error: '',
        nextAttempt: ''
      });
      tagged++;
    } catch (error) {
      const retry = shouldRetryGroqError_(error, claim.attempts);
      finishTagClaim_(config, claim, {
        status: retry ? 'TAG_RETRY' : 'TAG_ERROR',
        aiTags: '',
        aiCaption: '',
        error: safeTagError_(error),
        nextAttempt: retry
          ? new Date(Date.now() + groqBackoffMinutes_(claim.attempts) * 60000)
          : ''
      });
      if (retry) retrying++;
      else failed++;
    }
  });
  return {
    processed: claims.length,
    tagged: tagged,
    retrying: retrying,
    failed: failed
  };
}

function claimPendingTags_(config, limit) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return [];
  try {
    const sheet = SpreadsheetApp.openById(config.spreadsheetId).getSheetByName('Records');
    if (!sheet || sheet.getLastRow() < 2) return [];
    const now = new Date();
    const values = sheet.getRange(
      2, 1, sheet.getLastRow() - 1, RECORD_HEADERS.length
    ).getValues();
    const claims = [];
    for (let index = 0; index < values.length && claims.length < limit; index++) {
      const row = values[index];
      const status = String(row[16] || '');
      const nextAttempt = row[22] ? new Date(row[22]) : null;
      const due = !nextAttempt || isNaN(nextAttempt.getTime()) || nextAttempt <= now;
      const attempts = Number(row[21] || 0);
      if (status === 'TAGGING' && due && attempts >= GROQ_MAX_ATTEMPTS) {
        sheet.getRange(index + 2, 17, 1, 2).setValues([[
          'TAG_ERROR',
          'Tagging lease expired after the maximum number of attempts.'
        ]]);
        continue;
      }
      if (
        !row[13] ||
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
        config.groqModel
      ]]);
      claims.push({
        recordId: String(row[0]),
        driveFileId: String(row[13]),
        attempts: claimedAttempts
      });
    }
    return claims;
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
    const current = sheet.getRange(rowNumber, 17, 1, 8).getValues()[0];
    if (String(current[0]) !== 'TAGGING' || Number(current[5]) !== claim.attempts) {
      return false;
    }
    current[0] = result.status;
    current[1] = sheetText_(result.error);
    current[3] = sheetText_(result.aiTags);
    current[4] = sheetText_(result.aiCaption);
    current[6] = result.nextAttempt;
    current[7] = config.groqModel;
    sheet.getRange(rowNumber, 17, 1, 8).setValues([current]);
    return true;
  } finally {
    lock.releaseLock();
  }
}

function groqTagDriveImage_(driveFileId, config) {
  const file = DriveApp.getFileById(driveFileId);
  const blob = file.getBlob();
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
    '{"tags_en":[],"tags_ar":[],"caption_en":"","caption_ar":""}',
    'Provide 5 to 12 short, search-friendly tags in each language.',
    'Prioritize activity, objects, art/sport type, animals, indoor/outdoor, and setting.',
    'Write one concise factual caption in English and Arabic.',
    'Do not identify people or infer names, ethnicity, health, religion, or other sensitive traits.',
    'Do not invent a location, organization, event, or relationship.'
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
        max_completion_tokens: 512
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
  const tagsEn = cleanGroqTags_(value.tags_en);
  const tagsAr = cleanGroqTags_(value.tags_ar);
  const captionEn = cleanGroqCaption_(value.caption_en);
  const captionAr = cleanGroqCaption_(value.caption_ar);
  if (tagsEn.length < 5 || tagsAr.length < 5 || !captionEn || !captionAr) {
    throw new Error('Groq tag output is missing bilingual tags or captions.');
  }
  return {
    aiTags: tagsEn.concat(tagsAr).join(', '),
    aiCaption: [captionEn, captionAr].join(' · ')
  };
}

function cleanGroqTags_(value) {
  if (!Array.isArray(value)) return [];
  const seen = {};
  return value.map(function (tag) {
    return String(tag || '').replace(/[\r\n,]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  }).filter(function (tag) {
    const key = tag.toLocaleLowerCase();
    if (!tag || seen[key]) return false;
    seen[key] = true;
    return true;
  }).slice(0, 12);
}

function cleanGroqCaption_(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 500);
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

function prepareSheet_(sheet, headers) {
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold')
    .setBackground('#1f4e78')
    .setFontColor('#ffffff');
  sheet.autoResizeColumns(1, headers.length);
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

function rankRecordValues_(values, query, limit) {
  const normalizedQuery = normalizeSearchText_(query);
  const tokens = Array.from(new Set(normalizedQuery.split(' ').filter(Boolean)));
  if (!tokens.length) return [];

  return values.map(function (row) {
    const context = [row[9], row[10]].map(readSheetText_).filter(Boolean).join(' · ');
    const manualTags = readSheetText_(row[18]);
    const aiTags = readSheetText_(row[19]);
    const aiCaption = readSheetText_(row[20]);
    const fields = [
      { value: context, weight: 1 },
      { value: aiCaption, weight: 2 },
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

function sendSearchPhoto_(chatId, result, index, total, config) {
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
    payload.photo = DriveApp.getFileById(result.driveFileId).getBlob();
    return telegram_('sendPhoto', payload, config.botToken);
  }
}

function searchResultCaption_(result, index, total) {
  return [
    String(index + 1) + '/' + total + ' · matched ' +
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
    limit
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
  return event && event.parameter && event.parameter.secret ||
    event && event.pathInfo || '';
}

function selfCheck() {
  const photos = [
    { file_id: 'small', width: 90, height: 90, file_size: 100 },
    { file_id: 'large', width: 900, height: 900, file_size: 1000 }
  ];
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
  const rowA = new Array(RECORD_HEADERS.length).fill('');
  rowA[0] = 'a';
  rowA[9] = 'نشاط خيل';
  rowA[10] = 'Open area';
  rowA[11] = 'file-a';
  rowA[13] = 'drive-a';
  rowA[19] = 'horses, activity';
  rowA[20] = 'Children riding horses outdoors';
  const rowB = new Array(RECORD_HEADERS.length).fill('');
  rowB[0] = 'b';
  rowB[10] = 'Art activity';
  rowB[11] = 'file-b';
  rowB[18] = 'art';
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
    !isSearchUser_({ from: { id: 456 } }, ['123', '456'])
  ) {
    throw new Error('search authorization failed');
  }
  if (
    webhookSecretFromEvent_({ parameter: { secret: 'query' } }) !== 'query' ||
    webhookSecretFromEvent_({ pathInfo: 'legacy' }) !== 'legacy' ||
    webhookSecretFromEvent_() !== ''
  ) {
    throw new Error('webhookSecretFromEvent_ failed');
  }
  const parsedTags = parseGroqTagResponse_(JSON.stringify({
    tags_en: ['sports', 'horses', 'outdoors', 'riding', 'activity', 'sports'],
    tags_ar: ['رياضة', 'خيول', 'مكان مفتوح', 'ركوب', 'نشاط'],
    caption_en: 'A horse-riding activity outdoors.',
    caption_ar: 'نشاط ركوب خيل في مكان مفتوح.'
  }));
  if (
    parsedTags.aiTags.indexOf('sports, horses, outdoors, riding, activity') !== 0 ||
    parsedTags.aiCaption.indexOf('A horse-riding activity outdoors.') !== 0
  ) {
    throw new Error('parseGroqTagResponse_ failed');
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
  console.log('PASS: Telegram collector self-check');
  return true;
}
