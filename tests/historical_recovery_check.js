const assert = require('assert');
const {runtime} = require('./catalog_fixture');
function historical(r) {
  const row = Array(r.H.length).fill('');
  row[0]='-1:3'; row[1]='-1'; row[8]=3; row[3]='2026-01-01T00:00:00Z';
  row[11]='retained-file'; row[16]='ARCHIVE_RETRY'; row[r.F.ARCHIVE_STATUS]='ARCHIVE_RETRY';
  r.records.appendRow(row); return row;
}
{
  const r=runtime(), row=historical(r);
  r.records.data[1][r.F.PUBLISH_STATUS]='PUBLISH_NOT_ELIGIBLE';
  r.s.storePhoto_=()=>r.archive;
  let lockedCreates=0;r.s.createOrReusePreparedArchive_=prepared=>{
    assert.equal(r.lock.tryLock(0),false,'historical digest reuse/create must hold ScriptLock');
    lockedCreates++;return r.archive;
  };
  assert.equal(r.s.recoverHistoricalArchive(row[0]).status,'ARCHIVED');
  const saved=r.records.data[1];
  assert.ok(r.s.archiveRowIsReady_(saved));
  assert.equal(saved[16],'TAG_NOT_ELIGIBLE');
  for(const key of ['ADMITTED_GROUP_ID','ANALYSIS_ADMITTED_AT_UTC','PUBLISH_ELIGIBLE_AT_UTC','OUTPUT_MESSAGE_ID']) assert.equal(saved[r.F[key]],'');
  assert.equal(r.events.data.length,2);
  assert.equal(JSON.parse(r.events.data[1][5])[r.F.ARCHIVE_STATUS],'ARCHIVE_RETRY');
  assert.equal(r.s.recoverHistoricalArchive(row[0]).status,'ALREADY_VERIFIED');
  assert.equal(lockedCreates,1,'already-verified legacy recovery must not create or reuse another object');
  assert.equal(r.events.data.length,2);
}
for(const missing of [false,true]) {
  const r=runtime(),row=historical(r);
  row[13]=r.archive.id; row[14]=r.archive.url; row[16]='TAG_PENDING';
  row[r.F.ARCHIVE_STATUS]='ARCHIVED'; row[r.F.ARCHIVE_ATTEMPTS]=1;
  row[r.F.ARCHIVE_MIME_TYPE]=r.archive.mimeType;row[r.F.ARCHIVE_BYTE_SIZE]=r.archive.byteSize;
  row[r.F.ARCHIVE_SHA256]=r.archive.sha256;row[r.F.ARCHIVE_COMPLETED_AT_UTC]=r.archive.completedAtUtc;
  r.records.data[1]=row;
  let downloads=0;
  if(missing)r.s.DriveApp.getFileById=()=>{throw Error('missing');};
  r.s.storePhoto_=()=>{downloads++;return {...r.archive,id:'replacement'};};
  assert.equal(r.s.recoverHistoricalArchive(row[0]).status,'ARCHIVED');
  assert.equal(downloads,missing?1:0);
  assert.equal(r.records.data[1][16],'TAG_NOT_ELIGIBLE');
  assert.equal(r.events.data.length,2);
  assert.equal(r.s.claimPendingTags_(r.config,2).length,0);
}
for (const scenario of ['conflict','audit','stale','unavailable','admitted','duplicate','leased','published']) {
  const r=runtime(), row=historical(r);
  if(scenario==='conflict') {row[13]='old';row[r.F.ARCHIVE_SHA256]='0'.repeat(64);r.records.data[1]=row.slice();}
  if(scenario==='audit')r.events.appendRow=()=>{throw Error('sheet failure');};
  if(scenario==='admitted')r.records.data[1][r.F.ADMITTED_GROUP_ID]='-1';
  if(scenario==='duplicate')r.records.appendRow(row);
  if(scenario==='leased')r.records.data[1][r.F.ARCHIVE_CLAIM_ID]='other';
  if(scenario==='published')r.records.data[1][r.F.OUTPUT_MESSAGE_ID]='20';
  r.s.storePhoto_=()=>{
    if(scenario==='unavailable') throw Error('unavailable');
    if(scenario==='stale')r.records.data[1][10]='new caption';
    return r.archive;
  };
  const before=r.records.data[1].slice();
  assert.throws(()=>r.s.recoverHistoricalArchive(row[0]),undefined,scenario);
  if(scenario==='stale')before[10]='new caption';
  assert.deepEqual(r.records.data[1],before,scenario+' preserves row');
}
{
  const r=runtime(); historical(r);
  const h=r.s.catalogHealth();
  assert.equal(h.find(x=>x.stage==='archive').backlog,0);
  assert.equal(h.find(x=>x.stage==='archive').historicalBacklog,1);
  assert.equal(h.find(x=>x.stage==='analysis').backlog,0);
  r.records.data[1][r.F.ADMITTED_GROUP_ID]='-1';
  assert.equal(r.s.catalogHealth().find(x=>x.stage==='archive').backlog,1);
  r.records.data[1][16]='TAG_PENDING';
  r.records.data[1][r.F.ANALYSIS_ADMITTED_AT_UTC]='2026-10-16T00:00:00.000Z';
  r.config.groqTaggingEnabled=false;
  assert.equal(r.s.catalogHealth().find(x=>x.stage==='analysis').backlog,1,
    'temporary disablement does not turn admitted work into historical backlog');
}
console.log('historical recovery checks passed');
