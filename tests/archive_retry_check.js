const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('apps-script/Code.gs', 'utf8'), sandbox);
const field = vm.runInContext('RECORD_FIELD', sandbox);
const row = new Array(45).fill('');
row[field.ARCHIVE_STATUS] = 'ARCHIVE_RETRY';
row[field.ARCHIVE_ATTEMPTS] = 1;
row[field.ARCHIVE_NEXT_ATTEMPT_UTC] = new Date(Date.now() + 3600000).toISOString();
let storageCalls = 0;
let writes = 0;
let events = 0;
sandbox.findRecordRow_ = () => 2;
sandbox.findEventRow_ = () => null;
sandbox.Utilities = { formatDate: () => new Date().toISOString() };
sandbox.storePhoto_ = () => { storageCalls++; throw new Error('temporary failure'); };
const records = { getRange: () => ({
  getValues: () => [row],
  setValues: (values) => { writes++; row.splice(0, row.length, ...values[0]); }
}) };
const eventSheet = { appendRow: () => { events++; } };
const message = { chat: { id: -1001 }, message_id: 1, date: 1, from: { id: 2 },
  photo: [{ file_id: 'f', file_unique_id: 'u', width: 1, height: 1 }] };
const process = () => sandbox.processPhoto_({ update_id: 1 }, message, records, eventSheet, {});
for (const deadline of [row[field.ARCHIVE_NEXT_ATTEMPT_UTC], '', 'invalid',
  0, false, [], ['2000-01-01'], '0', '2000-02-30T00:00:00.000Z',
  '2000-01-01', '2000-01-01T00:00:00.000+00:00']) {
  row[field.ARCHIVE_NEXT_ATTEMPT_UTC] = deadline;
  for (let delivery = 0; delivery < 5; delivery++) {
    assert.throws(process, /retry is not due or its deadline is invalid/);
  }
}
assert.deepStrictEqual([storageCalls, writes, events, row[field.ARCHIVE_ATTEMPTS]], [0, 0, 0, 1]);
row[field.ARCHIVE_NEXT_ATTEMPT_UTC] = '2000-01-01T00:00:00.000Z';
assert.throws(process, /temporary failure/);
assert.strictEqual(row[field.ARCHIVE_ATTEMPTS], 2);
assert.ok(Date.parse(row[field.ARCHIVE_NEXT_ATTEMPT_UTC]) > Date.now());
assert.throws(process, /retry is not due/);
assert.strictEqual(storageCalls, 1);
// A due successful retry still completes the same row and event once.
row[field.ARCHIVE_NEXT_ATTEMPT_UTC] = '2000-01-01T00:00:00.000Z';
sandbox.storePhoto_ = () => { storageCalls++; return {
  id: 'drive-id', url: 'drive-url', mimeType: 'image/jpeg', byteSize: 6,
  sha256: 'a'.repeat(64), completedAtUtc: new Date().toISOString()
}; };
sandbox.tagStatusForCapture_ = () => 'TAG_NOT_ELIGIBLE';
sandbox.publicationEligibilityForCapture_ = () => ({ eligibleAt: '', status: '', outputChatId: '', error: '' });
assert.strictEqual(process(), 'archive-recovered');
assert.strictEqual(row[field.ARCHIVE_STATUS], 'ARCHIVED');
assert.strictEqual(row[field.ARCHIVE_NEXT_ATTEMPT_UTC], '');
assert.strictEqual(events, 1);
// Legacy failures have no deadline; existing compatibility must survive.
row[field.ARCHIVE_STATUS] = 'ARCHIVE_FAILED';
assert.strictEqual(process(), 'archive-recovered');
// A real fifth failure becomes terminal; further redelivery cannot call storage.
row[field.ARCHIVE_STATUS] = 'ARCHIVE_RETRY';
row[field.ARCHIVE_ATTEMPTS] = 4;
row[field.ARCHIVE_NEXT_ATTEMPT_UTC] = '2000-01-01T00:00:00.000Z';
sandbox.storePhoto_ = () => { storageCalls++; throw new Error('temporary failure'); };
assert.throws(process, /temporary failure/);
assert.strictEqual(row[field.ARCHIVE_STATUS], 'ARCHIVE_FAILED_TERMINAL');
const finalCalls = storageCalls;
assert.throws(process, /terminal state/);
assert.strictEqual(storageCalls, finalCalls);
console.log('PASS: archive retry redelivery checks');
