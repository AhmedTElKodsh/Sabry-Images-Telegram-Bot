const fs = require('fs');
const vm = require('vm');

const code = fs.readFileSync('apps-script/Code.gs', 'utf8');
const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

if (sandbox.selfCheck() !== true) process.exitCode = 1;

sandbox.Utilities = {
  DigestAlgorithm: { SHA_256: 'SHA_256' },
  computeDigest: () => new Array(32).fill(1),
  formatDate: () => '20260831_120000'
};
const validJpegBlob = {
  getBytes: () => [255, 216, 1, 2, 255, 217],
  getContentType: () => 'image/jpeg',
  setName() { return this; }
};
const integrity = sandbox.validateArchiveBlob_(validJpegBlob);
if (integrity.byteSize !== 6 || integrity.sha256.length !== 64) {
  console.error('FAIL: archive blob integrity validation did not execute');
  process.exitCode = 1;
}
let spoofedMimeRejected = false;
try {
  sandbox.validateArchiveBlob_({
    getBytes: () => [1, 2, 3, 4],
    getContentType: () => 'image/jpeg'
  });
} catch (error) { spoofedMimeRejected = true; }
if (!spoofedMimeRejected) {
  console.error('FAIL: MIME-spoofed non-image bytes were accepted');
  process.exitCode = 1;
}

sandbox.telegram_ = () => ({ result: { file_path: 'photos/test.jpg' } });
sandbox.fetchOk_ = () => ({ getBlob: () => validJpegBlob });
sandbox.DriveApp = {
  getFolderById: () => ({
    getFilesByName: () => {
      const files = [{}, {}];
      return { hasNext: () => files.length > 0, next: () => files.shift() };
    }
  })
};
let duplicateArchiveRejected = false;
try {
  sandbox.storePhoto_(
    { file_id: 'telegram-file' },
    { date: 1 },
    '-1001:1',
    { botToken: 'test-token', driveFolderId: 'test-folder' }
  );
} catch (error) { duplicateArchiveRejected = /Multiple Drive objects/.test(error.message); }
if (!duplicateArchiveRejected) {
  console.error('FAIL: duplicate canonical Drive objects were not rejected');
  process.exitCode = 1;
}

const safeActivationRegion = code.match(
  /function enableGroqTaggingForNewPhotosOnly\(\)[\s\S]*?function disableGroqTagging\(\)/
);
if (!safeActivationRegion ||
    /queueExistingPhotosForTagging\s*\(|processPendingTags\s*\(/.test(safeActivationRegion[0])) {
  console.error('FAIL: new-photo-only activation calls historical queue or immediate batch');
  process.exitCode = 1;
}

if (!/function enableOutputPublishing\(\)[\s\S]*recordsHavePublishingClaims_/.test(code) ||
    !/function activateGroqMode_\([\s\S]*recordsHavePublishingClaims_/.test(code)) {
  console.error('FAIL: activation does not refuse live publication claims');
  process.exitCode = 1;
}

const normalizedCode = code.replace(/\r\n/g, '\n');
const webhookExtractorRegion = normalizedCode.match(
  /function webhookSecretFromEvent_\(event\) \{[\s\S]*?\n\}/
);
if (/POC_SPREADSHEET_ID|POC_DRIVE_FOLDER_ID/.test(code) ||
    !/const WEBHOOK_SECRET_PARAMETER = 'telegram_webhook_key'/.test(code) ||
    !webhookExtractorRegion ||
    !/event\.parameters/.test(webhookExtractorRegion[0]) ||
    !/event\.pathInfo/.test(webhookExtractorRegion[0]) ||
    !/function redactWebhookInfo_\(info\)[\s\S]*redactWebhookUrl_/.test(code) ||
    !/function installWebhook\(\)[\s\S]*verifyConfiguredInputBotAdmin_/.test(code)) {
  console.error('FAIL: explicit setup, query webhook authentication, redaction, or bot-admin gates regressed');
  process.exitCode = 1;
}

const webhookSecret = 'a'.repeat(32);
const validWebhookEvent = {
  parameter: { telegram_webhook_key: webhookSecret },
  parameters: { telegram_webhook_key: [webhookSecret] }
};
if (sandbox.webhookSecretFromEvent_(validWebhookEvent) !== webhookSecret ||
    sandbox.webhookSecretFromEvent_({
      parameter: { telegram_webhook_key: 'b'.repeat(32) },
      parameters: { telegram_webhook_key: ['b'.repeat(32)] }
    }) !== 'b'.repeat(32) ||
    sandbox.webhookSecretFromEvent_({ parameter: {}, parameters: {} }) !== '' ||
    sandbox.webhookSecretFromEvent_({
      parameter: { telegram_webhook_key: webhookSecret },
      parameters: { telegram_webhook_key: [webhookSecret, webhookSecret] }
    }) !== '' ||
    sandbox.webhookSecretFromEvent_({
      pathInfo: 'legacy',
      parameter: { telegram_webhook_key: webhookSecret },
      parameters: { telegram_webhook_key: [webhookSecret] }
    }) !== '' ||
    sandbox.webhookSecretFromEvent_({ pathInfo: webhookSecret }) !== '') {
  console.error('FAIL: webhook query authentication is not exact and duplicate-safe');
  process.exitCode = 1;
}
const encodedSecret = [...webhookSecret]
  .map((character) => '%' + character.charCodeAt(0).toString(16).padStart(2, '0'))
  .join('');
const rawWebhookUrl = `https://script.google.com/macros/s/deployment/exec?` +
  `telegram_webhook_key=${encodedSecret}&extra=value#${encodedSecret}`;
const redactedWebhookUrl = sandbox.redactWebhookInfo_({ result: { url: rawWebhookUrl } })
  .result.url;
if (redactedWebhookUrl.includes(webhookSecret) ||
    redactedWebhookUrl.includes(encodedSecret) ||
    redactedWebhookUrl !==
      'https://script.google.com/macros/s/deployment/exec?telegram_webhook_key=[REDACTED]') {
  console.error('FAIL: webhook status redaction leaked query credentials');
  process.exitCode = 1;
}
const redactedLegacyUrl = sandbox.redactWebhookInfo_({ result: {
  url: `https://script.google.com/macros/s/deployment/exec/${webhookSecret}#${webhookSecret}`
} }).result.url;
if (redactedLegacyUrl !==
    'https://script.google.com/macros/s/deployment/exec/[REDACTED]') {
  console.error('FAIL: legacy webhook path or fragment was not redacted');
  process.exitCode = 1;
}
[
  `https://example.com/${webhookSecret}`,
  `https://example.com/${encodedSecret}`,
  `https://script.google.com/macros/s/deployment/exec/extra/${webhookSecret}`,
  `not-a-url-${encodedSecret}`
].forEach((malformedUrl) => {
  const redacted = sandbox.redactWebhookInfo_({ result: { url: malformedUrl } }).result.url;
  if (redacted !== '[REDACTED]') {
    console.error('FAIL: malformed webhook URL was returned without fail-closed redaction');
    process.exitCode = 1;
  }
});

const originalGetConfig = sandbox.getConfig_;
const originalHtmlService = sandbox.HtmlService;
const originalLockService = sandbox.LockService;
const originalProcessUpdate = sandbox.processUpdate_;
let configuredWebhookSecret = webhookSecret;
sandbox.getConfig_ = () => ({
  webhookSecret: configuredWebhookSecret,
  allowedChatId: '-1004439324869'
});
sandbox.HtmlService = {
  createHtmlOutput: (body) => ({ body })
};
let lockReleased = false;
sandbox.LockService = { getScriptLock: () => ({
  tryLock: (milliseconds) => milliseconds === 10000,
  releaseLock: () => { lockReleased = true; }
}) };
let processedUpdate = null;
sandbox.processUpdate_ = (update, config) => { processedUpdate = { update, config }; };
const acceptedWebhook = sandbox.doPost({
  ...validWebhookEvent,
  postData: { contents: JSON.stringify({ update_id: 123, message: { message_id: 2 } }) }
});
if (!acceptedWebhook || acceptedWebhook.body !== 'ok' || !lockReleased ||
    !processedUpdate || processedUpdate.update.update_id !== 123 ||
    processedUpdate.config.allowedChatId !== '-1004439324869') {
  console.error('FAIL: valid doPost request was not parsed and processed exactly once');
  process.exitCode = 1;
}

const invalidEvents = [
  {},
  { parameter: {}, parameters: {} },
  { parameter: { telegram_webhook_key: webhookSecret } },
  { parameters: { telegram_webhook_key: [webhookSecret] } },
  {
    parameter: { telegram_webhook_key: webhookSecret },
    parameters: { telegram_webhook_key: [webhookSecret, webhookSecret] }
  },
  {
    parameter: { telegram_webhook_key: webhookSecret },
    parameters: { telegram_webhook_key: [webhookSecret, 'b'.repeat(32)] }
  },
  {
    parameter: { telegram_webhook_key: webhookSecret },
    parameters: { telegram_webhook_key: webhookSecret }
  },
  {
    parameter: { telegram_webhook_key: 123 },
    parameters: { telegram_webhook_key: [123] }
  },
  {
    pathInfo: 'legacy',
    parameter: { telegram_webhook_key: webhookSecret },
    parameters: { telegram_webhook_key: [webhookSecret] }
  },
  { pathInfo: webhookSecret }
];
invalidEvents.forEach((event) => {
  let bodyRead = false;
  event.postData = {
    get contents() {
      bodyRead = true;
      throw new Error('invalid webhook body was parsed');
    }
  };
  const rejected = sandbox.doPost(event);
  if (bodyRead || !rejected || rejected.body !== 'not found') {
    console.error('FAIL: malformed webhook authentication reached body parsing');
    process.exitCode = 1;
  }
});
configuredWebhookSecret = 'matching-but-not-hex';
let invalidConfiguredSecretReadBody = false;
const rejectedInvalidConfiguredSecret = sandbox.doPost({
  parameter: { telegram_webhook_key: configuredWebhookSecret },
  parameters: { telegram_webhook_key: [configuredWebhookSecret] },
  postData: {
    get contents() {
      invalidConfiguredSecretReadBody = true;
      throw new Error('invalid configured secret reached body parsing');
    }
  }
});
sandbox.getConfig_ = originalGetConfig;
sandbox.HtmlService = originalHtmlService;
sandbox.LockService = originalLockService;
sandbox.processUpdate_ = originalProcessUpdate;
if (invalidConfiguredSecretReadBody || !rejectedInvalidConfiguredSecret ||
    rejectedInvalidConfiguredSecret.body !== 'not found') {
  console.error('FAIL: invalid configured webhook secret authenticated a request');
  process.exitCode = 1;
}

const originalVerifyConfiguredInputBotAdmin = sandbox.verifyConfiguredInputBotAdmin_;
const originalTelegram = sandbox.telegram_;
const installCallOrder = [];
let setWebhookCall = null;
sandbox.getConfig_ = () => ({
  webAppUrl: 'https://script.google.com/macros/s/deployment/exec',
  webhookSecret,
  botToken: 'test-bot-token',
  allowedChatId: '-1004439324869'
});
sandbox.verifyConfiguredInputBotAdmin_ = () => { installCallOrder.push('verifyAdmin'); };
sandbox.telegram_ = (method, payload, token) => {
  installCallOrder.push(method);
  setWebhookCall = { method, payload, token };
  return { ok: true };
};
sandbox.installWebhook();
sandbox.getConfig_ = originalGetConfig;
sandbox.verifyConfiguredInputBotAdmin_ = originalVerifyConfiguredInputBotAdmin;
sandbox.telegram_ = originalTelegram;
if (installCallOrder.join(',') !== 'verifyAdmin,setWebhook' ||
    !setWebhookCall || setWebhookCall.token !== 'test-bot-token' ||
    setWebhookCall.payload.url !==
      `https://script.google.com/macros/s/deployment/exec?telegram_webhook_key=${webhookSecret}` ||
    setWebhookCall.payload.allowed_updates !== JSON.stringify(['message']) ||
    setWebhookCall.payload.max_connections !== 1 ||
    setWebhookCall.payload.drop_pending_updates !== false) {
  console.error('FAIL: installWebhook changed validation order, URL, queue, or update policy');
  process.exitCode = 1;
}

const capturedWebhookLogs = [];
const originalConsole = sandbox.console;
sandbox.getConfig_ = () => ({ botToken: 'test-bot-token' });
sandbox.telegram_ = () => ({ ok: true, result: { url: rawWebhookUrl } });
sandbox.console = {
  log: (value) => { capturedWebhookLogs.push(String(value)); },
  warn: originalConsole.warn.bind(originalConsole),
  error: originalConsole.error.bind(originalConsole)
};
const loggedWebhookInfo = sandbox.webhookInfo();
sandbox.getConfig_ = originalGetConfig;
sandbox.telegram_ = originalTelegram;
sandbox.console = originalConsole;
const serializedWebhookInfo = JSON.stringify(loggedWebhookInfo);
const serializedWebhookLogs = capturedWebhookLogs.join('\n');
if (serializedWebhookInfo.includes(webhookSecret) ||
    serializedWebhookInfo.includes(encodedSecret) ||
    serializedWebhookLogs.includes(webhookSecret) ||
    serializedWebhookLogs.includes(encodedSecret) ||
    loggedWebhookInfo.result.url !==
      'https://script.google.com/macros/s/deployment/exec?telegram_webhook_key=[REDACTED]') {
  console.error('FAIL: webhookInfo returned or logged a raw webhook credential');
  process.exitCode = 1;
}

if (!/function processPrivateCommand_[\s\S]*isCurrentSearchGroupMember_/.test(code) ||
    !/GEMINI_INPUTS_CONFIRMED_NON_SENSITIVE/.test(code)) {
  console.error('FAIL: live membership or Gemini non-sensitive gate is missing');
  process.exitCode = 1;
}

[
  'archive_mime_type', 'archive_byte_size', 'archive_sha256',
  'archive_status', 'archive_error', 'archive_completed_at_utc'
].forEach((field) => {
  if (!code.includes(`'${field}'`)) {
    console.error(`FAIL: missing archive field ${field}`);
    process.exitCode = 1;
  }
});

if (!/function archiveRowIsReady_/.test(code) ||
    !/function claimPendingTags_[\s\S]*archiveRowIsReady_/.test(code) ||
    !/function publicationRowBoundaryError_[\s\S]*archiveRowIsReady_/.test(code) ||
    !/function eligibleSemanticRows_[\s\S]*archiveRowIsReady_/.test(code) ||
    !/function auditArchive\(\)/.test(code) ||
    !/function fuseHybridResults_/.test(code)) {
  console.error('FAIL: archive eligibility, audit, or hybrid search gate is missing');
  process.exitCode = 1;
}

function makeTrigger(handler, id) {
  return {
    id,
    getHandlerFunction: () => handler
  };
}

function installTriggerMocks({
  initial = [], createFails = false, undeletableId = '', deletePropertyFails = false
} = {}) {
  let triggers = initial.slice();
  const properties = {};
  sandbox.PropertiesService = {
    getScriptProperties: () => ({
      deleteProperty: (key) => {
        if (deletePropertyFails) throw new Error('property delete failed');
        delete properties[key];
      },
      setProperty: (key, value) => { properties[key] = value; },
      getProperty: (key) => properties[key]
    })
  };
  sandbox.ScriptApp = {
    getProjectTriggers: () => triggers.slice(),
    deleteTrigger: (trigger) => {
      if (trigger.id === undeletableId) throw new Error('delete failed');
      triggers = triggers.filter((candidate) => candidate !== trigger);
    },
    newTrigger: (handler) => ({
      timeBased: () => ({
        everyMinutes: () => ({
          create: () => {
            if (createFails) throw new Error('create failed');
            const trigger = makeTrigger(handler, `created-${triggers.length + 1}`);
            triggers.push(trigger);
            return trigger;
          }
        })
      })
    })
  };
  return { properties, triggers: () => triggers.slice() };
}

const healthyTriggers = installTriggerMocks({
  initial: [makeTrigger('worker', 'old-1'), makeTrigger('worker', 'old-2')]
});
sandbox.replaceTimeTrigger_('worker');
if (healthyTriggers.triggers().length !== 1) {
  console.error('FAIL: trigger replacement did not establish exactly one worker');
  process.exitCode = 1;
}

const failedCreation = installTriggerMocks({
  initial: [makeTrigger('worker', 'old')], createFails: true
});
let createFailureClosed = false;
try { sandbox.replaceTimeTrigger_('worker'); } catch (error) { createFailureClosed = true; }
if (!createFailureClosed || failedCreation.triggers().length !== 0) {
  console.error('FAIL: trigger creation failure did not clean up fail-closed');
  process.exitCode = 1;
}

const failedDisable = installTriggerMocks({
  initial: [makeTrigger('worker', 'stuck')], undeletableId: 'stuck'
});
failedDisable.properties.GATE = 'true';
let disableFailureReported = false;
try { sandbox.disableManagedWorker_('GATE', 'worker'); } catch (error) {
  disableFailureReported = true;
}
if (!disableFailureReported || failedDisable.properties.GATE !== undefined) {
  console.error('FAIL: disable failure did not leave the external-call gate closed');
  process.exitCode = 1;
}

const failedGateDelete = installTriggerMocks({
  initial: [makeTrigger('worker', 'old')], deletePropertyFails: true
});
failedGateDelete.properties.GATE = 'true';
let gateFailureReported = false;
try { sandbox.disableManagedWorker_('GATE', 'worker'); } catch (error) {
  gateFailureReported = true;
}
if (!gateFailureReported || failedGateDelete.triggers().length !== 0) {
  console.error('FAIL: property failure prevented independent trigger shutdown');
  process.exitCode = 1;
}

function markdownFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return markdownFiles(path);
    return entry.isFile() && entry.name.toLowerCase().endsWith('.md') ? [path] : [];
  });
}

const documentation = ['README.md', ...markdownFiles('_bmad-output')]
  .map((file) => fs.readFileSync(file, 'utf8'))
  .join('\n');
if (/https:\/\/t\.me\/\+[A-Za-z0-9_-]+/.test(documentation)) {
  console.error('FAIL: project documentation contains a live private Telegram invite URL');
  process.exitCode = 1;
}
