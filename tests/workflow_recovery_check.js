const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const code = fs.readFileSync('apps-script/Code.gs', 'utf8');
function runtime() {
  const state = { console };
  vm.createContext(state);
  vm.runInContext(code, state);
  return state;
}

// Editor execution must never replace the explicitly selected immutable deployment.
const s = runtime();
let writes = 0, setups = 0, installs = 0;
const properties = { WEB_APP_URL: 'https://script.google.com/macros/s/release_1/exec',
  ALLOWED_CHAT_ID: '-1001', BOT_TOKEN: 'fake-telegram-secret',
  GROQ_API_KEY: 'fake-groq-secret', WEBHOOK_SECRET: 'fake-webhook-secret' };
s.PropertiesService = { getScriptProperties: () => ({
  getProperty: key => properties[key], setProperty: () => { writes++; }
}) };
s.ScriptApp = { getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/editor/dev' }) };
s.setupPoc = () => { setups++; return { spreadsheet: 'sheet', driveFolder: 'folder' }; };
s.installWebhook = () => { installs++; return { ok: true }; };
assert.strictEqual(s.bootstrapPoc().web_app_url, properties.WEB_APP_URL);
assert.deepStrictEqual([setups, installs, writes], [1, 1, 0]);
for (const invalid of ['', 'https://script.google.com/macros/s/editor/dev',
  ' https://script.google.com/macros/s/release_1/exec ',
  'https://example.com/exec', 'https://script.google.com/macros/s/release_1/exec?key=secret']) {
  properties.WEB_APP_URL = invalid;
  assert.throws(() => s.bootstrapPoc(), /Set WEB_APP_URL/);
  assert.strictEqual(properties.WEB_APP_URL, invalid);
}
assert.deepStrictEqual([setups, installs, writes], [1, 1, 0]);

// Real provider boundaries, not just the formatting helper, must suppress secrets.
const sensitive = Object.values(properties).join(' ') +
  ' https://api.telegram.org/file/bot123456:FAKE_TOKEN/photo.jpg Bearer fake-header';
for (const format of [s.safeArchiveError_, s.safeTagError_, s.safePublishError_, s.safeGeminiError_]) {
  const result = format(new Error(sensitive));
  for (const secret of ['fake-telegram-secret', 'fake-groq-secret', 'fake-webhook-secret',
    '123456:FAKE_TOKEN', 'fake-header', 'https://api.telegram.org']) {
    assert.ok(!result.includes(secret), 'credential survived error formatting');
  }
}
s.UrlFetchApp = { fetch: () => { throw new Error(sensitive); } };
assert.throws(() => s.fetchOk_('https://example.com'), /^Error: Provider transport request failed\.$/);
s.UrlFetchApp.fetch = () => ({ getResponseCode: () => 401, getContentText: () => sensitive });
assert.throws(() => s.fetchOk_('https://example.com'), /^Error: HTTP 401: provider request failed\.$/);
s.UrlFetchApp.fetch = () => ({ getResponseCode: () => 200,
  getContentText: () => JSON.stringify({ ok: false, description: sensitive }) });
assert.throws(() => s.telegram_('getMe', {}, 'fake-token'), /^Error: Telegram request failed\.$/);
s.UrlFetchApp.fetch = () => ({ getResponseCode: () => 200, getContentText: () => sensitive });
assert.throws(() => s.telegram_('getMe', {}, 'fake-token'),
  /^Error: Telegram getMe returned invalid response JSON\.$/);
assert.ok(!s.groqErrorMessage_(JSON.stringify({ error: { message: sensitive } }))
  .includes('fake-groq-secret'));
assert.strictEqual(s.groqErrorMessage_('{"error":{"message":"123456%3AFAKE_TOKEN"}}'), 'request failed');
assert.throws(() => s.classifyTelegramPublishResponse_(429, JSON.stringify({
  ok: false, error_code: 429, description: '123456%3AFAKE_TOKEN', parameters: { retry_after: 30 }
})), error => error.message === 'Telegram publication failed (HTTP 429).' &&
  error.publishDisposition === 'RETRY' && error.retryAfterSeconds === 30);
assert.ok(!s.redactWebhookInfo_({ result: { last_error_message: sensitive } })
  .result.last_error_message.includes('fake-webhook-secret'));

// Inspect the actual image request; a fake provider response never leaves this process.
const g = runtime();
assert.strictEqual(vm.runInContext('DEFAULT_GROQ_MODEL', g), 'qwen/qwen3.8-27b');
let request;
g.assertDriveArchiveEvidence_ = () => ({ blob: {
  getBytes: () => [255, 216, 255, 217], getContentType: () => 'image/jpeg'
} });
g.Utilities = { base64Encode: () => 'fake-base64' };
g.UrlFetchApp = { fetch: (url, options) => {
  request = JSON.parse(options.payload);
  return { getResponseCode: () => 200, getContentText: () => JSON.stringify({
    choices: [{ message: { content: '{}' } }]
  }) };
} };
g.parseGroqTagResponse_ = content => content;
g.groqTagDriveImage_('fixture', { groqModel: 'explicit-override', groqApiKey: 'fake-key' }, {});
assert.strictEqual(request.model, 'explicit-override');
assert.strictEqual(request.response_format.type, 'json_object');
assert.strictEqual(request.max_completion_tokens, 4096);
assert.match(request.messages[0].content[0].text, /excerpt of at most 1200 characters/);
assert.match(request.messages[0].content[0].text, /at most 80 characters/);

// A stale/rejected ledger save cannot be counted as successful enrichment or failure.
const w = runtime();
w.getConfig_ = () => ({ groqTaggingEnabled: true, groqApiKey: 'fake-key' });
w.claimPendingTags_ = () => [{ config: {}, attempts: 1 }];
w.revalidateTagClaim_ = () => true;
w.groqTagDriveImage_ = () => ({});
w.finishTagClaim_ = () => false;
assert.strictEqual(w.processPendingTags().tagged, 0);
w.finishTagClaim_ = () => true;
assert.strictEqual(w.processPendingTags().tagged, 1);
w.groqTagDriveImage_ = () => { throw new Error('temporary'); };
w.finishTagClaim_ = () => false;
assert.strictEqual(w.processPendingTags().retrying, 0);
console.log('PASS: workflow recovery boundary checks (offline fixtures)');
