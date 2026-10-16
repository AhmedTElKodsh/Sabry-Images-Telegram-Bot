const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync('apps-script/Code.gs', 'utf8');
function fixture() {
  const s = { console: { log() {}, warn() {} } };
  vm.createContext(s);
  vm.runInContext(source, s);
  const field = vm.runInContext('RECORD_FIELD', s);
  const config = { botToken: 'fixture', spreadsheetId: 'sheet', allowedChatId: '-1001',
    outputChatId: '-1002', botTokenFingerprint: 'f'.repeat(64), searchUserIds: [],
    outputGroupsVerifiedFor: 'v2|-1001|-1002|' + 'f'.repeat(64) };
  function row(id, changes = {}) {
    const r = new Array(45).fill('');
    r[0] = id; r[1] = '-1001'; r[10] = 'كتاب'; r[11] = 'photo-' + id; r[13] = 'drive-' + id;
    r[field.ARCHIVE_STATUS] = 'ARCHIVED'; r[field.ARCHIVE_MIME_TYPE] = 'image/jpeg';
    r[field.ARCHIVE_BYTE_SIZE] = 4; r[field.ARCHIVE_SHA256] = '01'.repeat(32);
    r[field.ARCHIVE_ATTEMPTS] = 1; r[field.ARCHIVE_COMPLETED_AT_UTC] = '2026-10-16T10:00:00.000Z';
    r[field.PUBLISH_STATUS] = 'PUBLISHED'; r[field.OUTPUT_CHAT_ID] = '-1002';
    r[field.OUTPUT_MESSAGE_ID] = '5';
    for (const [key, value] of Object.entries(changes)) r[field[key]] = value;
    return r;
  }
  const rows = [row('good'), row('private', { PUBLISH_STATUS: 'PUBLISH_PENDING' }),
    row('elsewhere', { OUTPUT_CHAT_ID: '-1003' }), row('unverified', { ARCHIVE_STATUS: '' }),
    row('missing-id', { OUTPUT_MESSAGE_ID: '' })];
  const events = [], sends = [], memberships = [];
  let reads = 0;
  const recordSheet = { getLastRow: () => rows.length + 1,
    getRange: () => ({ getValues: () => { reads++; return rows; } }) };
  const eventSheet = { getLastRow: () => events.length + 1, appendRow: row => events.push(row),
    getRange: () => ({ createTextFinder: text => ({ matchEntireCell: () => ({
      findNext: () => events.some(e => e[0] === text) ? {} : null
    }) }) }) };
  s.SpreadsheetApp = { openById: () => ({ getSheetByName: name =>
    name === 'Records' ? recordSheet : name === 'Events' ? eventSheet : null }) };
  s.PropertiesService = { getScriptProperties: () => ({ getProperty: () => '',
    getProperties: () => ({}) }) };
  s.Utilities = { formatDate: () => '2026-10-16T10:00:00Z',
    DigestAlgorithm: { SHA_256: 'SHA_256' }, computeDigest: () => new Array(32).fill(1) };
  s.DriveApp = { getFileById: () => ({ isTrashed: () => false, getBlob: () => ({
    getBytes: () => [255, 216, 255, 217], getContentType: () => 'image/jpeg'
  }) }) };
  let membership = { user: { id: 42, is_bot: false }, status: 'member' };
  s.telegram_ = (method, payload) => {
    if (method === 'getMe') return { ok: true, result: { id: 1, is_bot: true, username: 'SchoolImages_bot' } };
    if (method === 'getChatMember') {
      memberships.push(payload);
      if (membership instanceof Error) throw membership;
      return { ok: true, result: membership };
    }
    assert.ok(['sendMessage', 'sendPhoto'].includes(method), 'unexpected Telegram side effect');
    sends.push({ method, payload });
    return { ok: true, result: { message_id: 100 } };
  };
  const message = { message_id: 10, date: 1792144800, chat: { id: -1002, type: 'supergroup' },
    from: { id: 42, is_bot: false }, text: '/search كتاب' };
  const run = (overrides = {}, id = 10) => s.processUpdate_({ update_id: id,
    message: { ...message, ...overrides } }, config);
  return { s, field, config, rows, sends, events, memberships, run, row,
    readCount: () => reads, member: value => { membership = value; } };
}

// Missing group routing or allowlist reuse breaks this real photo delivery path.
let f = fixture();
assert.strictEqual(f.run(), 'search-results');
assert.strictEqual(f.sends.length, 1);
assert.strictEqual(f.sends[0].method, 'sendPhoto');
assert.strictEqual(f.sends[0].payload.chat_id, '-1002');
assert.strictEqual(f.sends[0].payload.photo, 'photo-good');
for (const status of ['creator', 'administrator', 'restricted']) {
  f = fixture(); f.member({ user: { id: 42, is_bot: false }, status, is_member: true });
  assert.strictEqual(f.run(), 'search-results');
}
assert.strictEqual(f.sends[0].payload.protect_content, true);
assert.strictEqual(f.memberships[0].chat_id, '-1002');
assert.strictEqual(f.run(), 'duplicate');
assert.strictEqual(f.sends.length, 1);

// Membership failures and mismatched identities must deny before reading records.
for (const member of [new Error('lookup unavailable'), { user: { id: 42 }, status: 'left' },
  { user: { id: 42 }, status: 'kicked' }, { user: { id: 99 }, status: 'member' },
  { user: { id: 42 }, status: 'restricted', is_member: false }]) {
  f = fixture(); f.member(member); f.run();
  assert.strictEqual(f.readCount(), 0);
  assert.ok(f.sends.every(x => x.method !== 'sendPhoto'));
}
for (const overrides of [{ chat: { id: -1003, type: 'supergroup' } },
  { sender_chat: { id: -1002 } }, { from: { id: 42, is_bot: true } },
  { from: null }, { text: '/search@OtherBot كتاب' }, { text: '/start' }, { text: 'كتاب' }]) {
  f = fixture(); f.run(overrides);
  assert.strictEqual(f.readCount(), 0);
  assert.strictEqual(f.sends.length, 0);
}
f = fixture(); f.config.outputGroupsVerifiedFor = 'stale'; f.run();
assert.strictEqual(f.readCount(), 0); assert.strictEqual(f.sends.length, 0);
f = fixture(); assert.strictEqual(f.run({ text: '/search@SchoolImages_bot كتاب' }), 'search-results');
assert.strictEqual(f.sends[0].payload.photo, 'photo-good');
for (const text of ['/search', '/search ' + 'a'.repeat(201), '/search لايوجد']) {
  f = fixture(); f.run({ text });
  assert.strictEqual(f.sends.length, 1); assert.strictEqual(f.sends[0].method, 'sendMessage');
}
f = fixture();
f.run({ chat: { id: 42, type: 'private' } });
assert.strictEqual(f.readCount(), 0);
assert.ok(f.sends.every(x => x.method !== 'sendPhoto'));
f = fixture(); f.config.searchUserIds = ['42'];
assert.strictEqual(f.run({ chat: { id: 42, type: 'private' } }), 'search-results');
assert.strictEqual(f.memberships[0].chat_id, '-1001');
assert.ok(f.sends.every(x => x.payload.chat_id === '42'));
// More than five real matches still sends only the bounded result count.
f = fixture(); for (let i = 0; i < 8; i++) f.rows.push(f.row('more-' + i));
assert.strictEqual(f.run(), 'search-results'); assert.strictEqual(f.sends.length, 5);
console.log('PASS: output-group search routing, authorization, corpus and delivery checks');
