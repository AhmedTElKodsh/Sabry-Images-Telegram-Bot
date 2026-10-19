const assert = require('assert');
const {runtime} = require('./catalog_fixture');

const f = runtime(), F = f.F;
const owner = Array(f.H.length).fill(''), alias = Array(f.H.length).fill('');
owner[0] = 'owner'; owner[5] = 'teacher'; owner[10] = 'child name'; owner[13] = 'drive';
owner[14] = 'drive-link'; owner[16] = 'TAGGED'; owner[19] = 'private tags';
owner[F.CANONICAL_RECORD_ID] = 'owner'; owner[F.CANONICAL_ROLE] = 'OWNER';
owner[F.ARCHIVE_STATUS] = 'ARCHIVED'; owner[F.ARCHIVE_SHA256] = 'a'.repeat(64);
owner[F.PUBLISH_STATUS] = 'PUBLISHED'; owner[F.OUTPUT_MESSAGE_ID] = '55';
alias[0] = 'alias'; alias[5] = 'teacher2'; alias[10] = 'other child';
alias[F.CANONICAL_RECORD_ID] = 'owner'; alias[F.CANONICAL_ROLE] = 'ALIAS';
alias[F.ARCHIVE_STATUS] = 'ARCHIVED'; alias[F.PUBLISH_STATUS] = 'PUBLISHED';
f.records.data.push(owner, alias);
f.embeddings.data.push(['owner','pilot','approver','now','later','model',2,'[0.1,0.2]','READY',1,'','now']);

const base = {request_id:'REQ-2026-001', record_id:'alias', scope:'RECORD',
  approver:'privacy-officer', approved_at:'2026-10-19T08:00:00.000Z'};
const plan = f.s.planCatalogErasure(base);
assert.equal(plan.dry_run, true);
assert.deepStrictEqual(JSON.parse(JSON.stringify(plan.target_record_ids)), ['alias']);
assert.equal(plan.drive_disposition, 'RETAIN_SHARED_CANONICAL_OBJECT');
assert.equal(f.records.data[2][10], 'other child');

assert.throws(() => f.s.executeCatalogErasure({...base, request_id:'REQ-2026-002', record_id:'owner'}),
  /canonical group/);

const calls = [];
f.s.DriveApp = {getFileById: id => { calls.push(['drive',id]); throw Error('must not call'); }};
f.s.telegram_ = (...args) => { calls.push(['telegram',...args]); throw Error('must not call'); };
const result = f.s.executeCatalogErasure({...base, request_id:'REQ-2026-003',
  record_id:'owner', scope:'CANONICAL_GROUP'});
assert.equal(result.status, 'COMPLETED');
assert.deepStrictEqual(JSON.parse(JSON.stringify(result.target_record_ids)), ['owner','alias']);
assert.equal(result.drive_disposition, 'MANUAL_DRIVE_DELETION_REQUIRED');
assert.equal(result.output_disposition, 'MANUAL_TELEGRAM_DELETION_REQUIRED');
assert.equal(calls.length, 0);
assert.equal(f.records.data[1][16], 'ERASED');
assert.equal(f.records.data[1][10], '');
assert.equal(f.records.data[1][13], '');
assert.equal(f.records.data[2][16], 'ERASED');
assert.equal(f.embeddings.data[1][7], '');
assert.equal(f.embeddings.data[1][8], 'ERASED');
assert.ok(f.events.data.some(row => row[0] === 'erasure:REQ-2026-003' && row[4] === 'erasure-completed'));
assert.equal(f.s.executeCatalogErasure({...base, request_id:'REQ-2026-003',
  record_id:'owner', scope:'CANONICAL_GROUP'}).status, 'DUPLICATE');

assert.throws(() => f.s.planCatalogErasure({...base, request_id:'bad id'}), /request_id/);

// A mid-execution storage failure remains visibly claimed and cannot be retried blindly.
const interrupted = runtime(), interruptedRow = Array(interrupted.H.length).fill('');
interruptedRow[0] = 'single'; interruptedRow[16] = 'TAGGED';
interruptedRow[interrupted.F.CANONICAL_RECORD_ID] = 'single';
interruptedRow[interrupted.F.CANONICAL_ROLE] = 'OWNER';
interrupted.records.data.push(interruptedRow);
interrupted.embeddings.data.push(['single','pilot','approver','now','later','model',2,'[1,2]','READY',1,'','now']);
const originalRange = interrupted.embeddings.getRange;
interrupted.embeddings.getRange = (...args) => {
  const range = originalRange(...args), originalSet = range.setValues;
  range.setValues = values => { if (args[0] === 2) throw Error('storage failure'); return originalSet(values); };
  return range;
};
const interruptedRequest = {request_id:'REQ-2026-004',record_id:'single',scope:'RECORD',
  approver:'privacy-officer',approved_at:'2026-10-19T08:00:00.000Z'};
assert.throws(() => interrupted.s.executeCatalogErasure(interruptedRequest), /operator review/);
assert.ok(interrupted.events.data.some(row => row[0] === 'erasure:REQ-2026-004' && row[4] === 'erasure-claimed'));
assert.ok(!interrupted.events.data.some(row => row[0] === 'erasure:REQ-2026-004' && row[4] === 'erasure-completed'));
assert.throws(() => interrupted.s.executeCatalogErasure(interruptedRequest), /incomplete prior execution/);
console.log('PASS: manifest-first erasure, canonical safety, vector removal and manual external dispositions');
