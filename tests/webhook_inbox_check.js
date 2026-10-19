const assert = require('assert');
const {runtime} = require('./catalog_fixture');

const f = runtime();
f.config.webhookSecret = 'a'.repeat(32);
f.s.HtmlService = {createHtmlOutput: value => value};
const update = {update_id: 9001, message: f.message};
const request = {
  parameter: {telegram_webhook_key: f.config.webhookSecret},
  parameters: {telegram_webhook_key: [f.config.webhookSecret]},
  postData: {contents: JSON.stringify(update)}
};

let processed = 0;
f.s.processUpdate_ = value => { processed++; assert.equal(value.update_id, 9001); return 'saved'; };
assert.equal(f.s.doPost(request), 'ok');
assert.equal(processed, 1);
assert.equal(f.inbox.data.length, 2);
assert.equal(f.inbox.data[1][0], '9001');
assert.equal(f.inbox.data[1][2], 'COMPLETED');

// Telegram redelivery of a completed receipt is acknowledged without processing again.
assert.equal(f.s.doPost(request), 'ok');
assert.equal(processed, 1);
assert.equal(f.inbox.data.length, 2);

// A failure after durable admission remains retryable and the inbox worker completes it once.
const failedUpdate = {update_id: 9002, message: {...f.message, message_id: 11}};
request.postData.contents = JSON.stringify(failedUpdate);
f.s.processUpdate_ = () => { throw new Error('private provider detail'); };
assert.throws(() => f.s.doPost(request), /Webhook update processing failed/);
assert.equal(f.inbox.data.length, 3);
assert.equal(f.inbox.data[2][2], 'PENDING');
assert.equal(f.inbox.data[2][5], 1);
assert.ok(!String(f.inbox.data[2][6]).includes('private provider detail'));

processed = 0;
f.s.processUpdate_ = value => { processed++; assert.equal(value.update_id, 9002); return 'saved'; };
const worker = f.s.processPendingInbox();
assert.deepStrictEqual(JSON.parse(JSON.stringify(worker)), {processed: 1, completed: 1, retrying: 0, failed: 0});
assert.equal(processed, 1);
assert.equal(f.inbox.data[2][2], 'COMPLETED');
assert.equal(f.inbox.data[2][3], '');

// Completed work is never claimed again.
assert.deepStrictEqual(JSON.parse(JSON.stringify(f.s.processPendingInbox())),
  {processed: 0, completed: 0, retrying: 0, failed: 0});

// An expired in-flight lease is ambiguous: quarantine it instead of replaying a
// possibly completed external side effect.
f.inbox.data.push(['9003', JSON.stringify({update_id:9003,message:f.message}), 'PROCESSING',
  'old-claim', '2000-01-01T00:00:00.000Z', 1, '', 'now', '']);
assert.deepStrictEqual(JSON.parse(JSON.stringify(f.s.processPendingInbox())),
  {processed: 0, completed: 0, retrying: 0, failed: 0});
assert.equal(f.inbox.data[3][2], 'UNKNOWN');
processed = 0;
request.postData.contents = JSON.stringify({update_id:9003,message:f.message});
assert.equal(f.s.doPost(request), 'ok');
assert.equal(processed, 0);
console.log('PASS: durable webhook admission, redelivery suppression and inbox recovery');
