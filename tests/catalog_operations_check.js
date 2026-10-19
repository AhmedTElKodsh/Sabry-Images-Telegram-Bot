const assert = require('assert');
const {runtime} = require('./catalog_fixture');

const f = runtime(), F = f.F;
f.config.operatorAlertChatId = '-900';
f.props.STAGE_PAUSED_archive = JSON.stringify({at:'2026-10-19T00:00:00.000Z', reason:'private detail'});

const terminal = Array(f.H.length).fill('');
terminal[0] = '-1:10';
terminal[F.ADMITTED_GROUP_ID] = '-1';
terminal[F.ARCHIVE_STATUS] = 'ARCHIVE_FAILED_TERMINAL';
f.records.data.push(terminal);
const ambiguous = Array(f.H.length).fill('');
ambiguous[0] = '-1:11';
ambiguous[F.PUBLISH_ELIGIBLE_AT_UTC] = '2026-10-19T00:00:00.000Z';
ambiguous[F.PUBLISH_STATUS] = 'PUBLISH_UNKNOWN';
f.records.data.push(ambiguous);
f.inbox.data.push(['9001','{}','FAILED','','',5,'private provider body','now','']);

const installed = [
  'processPendingArchives', 'processPendingEnrollments', 'processPendingCaptionSync',
  'processPendingTags', 'processPendingPublications'
];
f.s.ScriptApp = {getProjectTriggers: () => installed.map(name => ({getHandlerFunction: () => name}))};
const sends = [];
f.s.telegram_ = (method, payload) => {
  if (method === 'getWebhookInfo') return {ok:true,result:{
    url:'https://script.google.com/macros/s/deployment/exec?telegram_webhook_key=secret-value',
    pending_update_count:3,
    last_error_message:'https://private.example/error BOT_TOKEN=secret-value'
  }};
  sends.push({method,payload}); return {ok:true};
};

const report = f.s.catalogOperationalReport();
const text = JSON.stringify(report);
assert.ok(report.issues.some(issue => issue.code === 'TRIGGER_COUNT' && issue.handler === 'processPendingInbox'));
assert.ok(report.issues.some(issue => issue.code === 'STAGE_PAUSED' && issue.stage === 'archive'));
assert.ok(report.issues.some(issue => issue.code === 'WEBHOOK_ERROR'));
assert.ok(report.recovery_candidates.some(item => item.record_id === '-1:10' && item.action === 'RECORD_SCOPED_ARCHIVE_REVIEW'));
assert.ok(report.recovery_candidates.some(item => item.record_id === '-1:11' && item.action === 'MANUAL_PUBLICATION_RECONCILIATION_ONLY'));
assert.ok(report.recovery_candidates.some(item => item.update_id === '9001' && item.action === 'INBOX_FAILURE_REVIEW'));
assert.ok(!text.includes('private.example'));
assert.ok(!text.includes('secret-value'));
assert.ok(!text.includes('private provider body'));

const first = f.s.sendCatalogOperationalAlert();
assert.equal(first.sent, true);
assert.equal(sends.length, 1);
assert.equal(sends[0].method, 'sendMessage');
assert.ok(!JSON.stringify(sends[0]).includes('secret-value'));
const repeated = f.s.sendCatalogOperationalAlert();
assert.deepStrictEqual(JSON.parse(JSON.stringify(repeated)), {sent:false, suppressed:true});
assert.equal(sends.length, 1);

console.log('PASS: sanitized operational report, recovery boundaries and repeated-alert suppression');
