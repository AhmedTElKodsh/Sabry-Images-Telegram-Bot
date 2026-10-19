const assert = require('assert'), {runtime} = require('./catalog_fixture');
let f=runtime(), {s,F,records,events,message,config}=f;
let calls=0; s.storePhoto_=()=>{calls++; throw Error('temporary');};
assert.equal(s.processPhoto_({update_id:1},message,records,events,config),'saved');
assert.equal(calls,0,'intake must not download');
assert.equal(records.data.length,2); assert.equal(records.data[1][F.ARCHIVE_STATUS],'ARCHIVE_PENDING');
assert.equal(s.processPhoto_({update_id:1},message,records,events,config),'duplicate-record');
assert.equal(records.data.length,2);
s.processPendingArchives(); assert.equal(calls,1); assert.equal(records.data[1][F.ARCHIVE_ATTEMPTS],1);
assert.equal(records.data[1][F.ARCHIVE_STATUS],'ARCHIVE_RETRY');
assert.ok(Date.parse(records.data[1][F.ARCHIVE_NEXT_ATTEMPT_UTC])-Date.now()>299000);
s.processPendingArchives(); assert.equal(calls,1);
for(let attempt=2;attempt<=5;attempt++) {
 records.data[1][F.ARCHIVE_NEXT_ATTEMPT_UTC]='2000-01-01T00:00:00.000Z';
 s.processPendingArchives(); assert.equal(records.data[1][F.ARCHIVE_ATTEMPTS],attempt);
}
assert.equal(records.data[1][F.ARCHIVE_STATUS],'ARCHIVE_FAILED_TERMINAL');
s.processPendingArchives(); assert.equal(calls,5);
// Crash after durable intake, before Events save; redelivery does not duplicate work.
f=runtime(); f.events.appendRow=()=>{throw Error('crash after intake');};
assert.throws(()=>f.s.processPhoto_({update_id:1},f.message,f.records,f.events,f.config),/crash/);
assert.equal(f.records.data.length,2); f.events.appendRow=()=>{};
f.s.processPhoto_({update_id:1},f.message,f.records,f.events,f.config);
assert.equal(f.records.data.length,2);
f.s.storePhoto_=()=>f.archive; f.s.processPendingArchives();
assert.equal(f.records.data[1][f.F.ARCHIVE_STATUS],'ARCHIVED');
// A suspended group does not cancel admitted work; activation cannot grant old receipts eligibility.
f=runtime(); f.config.outputPublishingEnabled=false; f.config.groqTaggingEnabled=false;
f.s.processPhoto_({update_id:1},f.message,f.records,f.events,f.config);
f.config.outputPublishingEnabled=true; f.s.storePhoto_=()=>f.archive; f.s.processPendingArchives();
assert.equal(f.records.data[1][16],'TAG_NOT_ELIGIBLE');
assert.equal(f.records.data[1][f.F.PUBLISH_STATUS],'PUBLISH_NOT_ELIGIBLE');
// Credential outage refunds the attempt and pauses the stage for explicit operator recovery.
f=runtime(); f.s.processPhoto_({update_id:1},f.message,f.records,f.events,f.config);
f.s.storePhoto_=()=>{let e=Error('secret'); e.httpStatus=401; throw e;};
f.s.processPendingArchives(); assert.equal(f.records.data[1][f.F.ARCHIVE_ATTEMPTS],0);
assert.ok(f.s.catalogHealth().find(r=>r.stage==='archive').paused);
assert.ok(!JSON.stringify(f.s.catalogHealth()).includes('secret'));
f.s.recoverCatalogStage('archive'); f.s.storePhoto_=()=>f.archive;
f.s.processPendingArchives(); assert.equal(f.records.data[1][f.F.ARCHIVE_STATUS],'ARCHIVED');
// An archive lease prevents concurrent workers, and an obsolete claim cannot save.
f=runtime();f.s.processPhoto_({update_id:1},f.message,f.records,f.events,f.config);
let concurrent=0;
f.s.storePhoto_=()=>{concurrent++;assert.equal(f.s.processPendingArchives().processed,0);return f.archive;};
f.s.processPendingArchives();assert.equal(concurrent,1);
// Losing the save-lock race after a successful download is infrastructure contention,
// not an archive attempt. Refund and release the claim so contention cannot terminalize healthy bytes.
f=runtime();f.s.processPhoto_({update_id:1},f.message,f.records,f.events,f.config);
for(let contentionAttempt=0;contentionAttempt<5;contentionAttempt++) {
 f.s.storePhoto_=()=>{assert.equal(f.lock.tryLock(0),true);return f.archive;};
 f.s.processPendingArchives();
 assert.equal(f.records.data[1][f.F.ARCHIVE_STATUS],'ARCHIVING');
 assert.equal(f.records.data[1][f.F.ARCHIVE_ATTEMPTS],1,
   'expired save-lock claims must refund before the next claim');
 f.lock.releaseLock();
 f.records.data[1][f.F.ARCHIVE_LEASE_UNTIL_UTC]='2000-01-01T00:00:00.000Z';
}
f.s.storePhoto_=()=>f.archive;f.s.processPendingArchives();
assert.equal(f.records.data[1][f.F.ARCHIVE_STATUS],'ARCHIVED');
assert.equal(f.records.data[1][f.F.ARCHIVE_ATTEMPTS],1);
assert.equal(f.records.data[1][f.F.ARCHIVE_CLAIM_ID],'');
f=runtime();f.s.processPhoto_({update_id:1},f.message,f.records,f.events,f.config);
f.s.storePhoto_=()=>{f.records.data[1][f.F.ARCHIVE_CLAIM_ID]='replacement';return f.archive;};
f.s.processPendingArchives();assert.equal(f.records.data[1][f.F.ARCHIVE_STATUS],'ARCHIVING');
assert.equal(f.records.data[1][13],'');
// Analysis admission is independent of publication admission.
f=runtime();f.config.outputPublishingEnabled=false;
f.s.processPhoto_({update_id:1},f.message,f.records,f.events,f.config);
f.s.storePhoto_=()=>f.archive;f.s.processPendingArchives();assert.equal(f.records.data[1][16],'TAG_PENDING');
assert.equal(f.records.data[1][f.F.PUBLISH_STATUS],'PUBLISH_NOT_ELIGIBLE');

function candidate(f,id,drive,size=4){
 const r=new Array(f.H.length).fill('');r[0]=id;r[11]='photo-'+id;r[13]=drive;r[14]='url-'+drive;
 r[f.F.ARCHIVE_MIME_TYPE]='image/jpeg';r[f.F.ARCHIVE_BYTE_SIZE]=size;
 r[f.F.ARCHIVE_SHA256]=f.archive.sha256;r[f.F.ARCHIVE_STATUS]='ARCHIVED';
 r[f.F.ARCHIVE_COMPLETED_AT_UTC]='2026-10-19T00:00:00.000Z';r[f.F.ARCHIVE_ATTEMPTS]=1;
 return r;
}
const validBlob=()=>({getBytes:()=>[255,216,255,217],getContentType:()=> 'image/jpeg'});
// A confirmed corrupt candidate is skipped for a later valid source, without replacement creation.
f=runtime();f.records.appendRow(candidate(f,'a-corrupt','bad'));f.records.appendRow(candidate(f,'z-valid','good'));
f.s.processPhoto_({update_id:1},f.message,f.records,f.events,f.config);let created=0;
f.s.storePhoto_=()=>f.archive;f.s.createOrReusePreparedArchive_=()=>{created++;return f.archive;};
f.s.DriveApp={getFileById:id=>id==='bad'?{isTrashed:()=>false,getBlob:()=>({getBytes:()=>[1],getContentType:()=> 'image/jpeg'})}:
 {isTrashed:()=>false,getBlob:validBlob}};
f.s.processPendingArchives();assert.equal(f.records.data[3][13],'good');assert.equal(created,0);
// Once a valid source is established, an irrelevant later outage is never probed.
f=runtime();f.records.appendRow(candidate(f,'a-valid','good'));f.records.appendRow(candidate(f,'z-outage','outage'));
f.s.processPhoto_({update_id:1},f.message,f.records,f.events,f.config);let probes=[];
f.s.storePhoto_=()=>f.archive;f.s.createOrReusePreparedArchive_=()=>{throw Error('unexpected create');};
f.s.DriveApp={getFileById:id=>{probes.push(id);if(id==='outage')throw Error('provider down');return{isTrashed:()=>false,getBlob:validBlob};}};
f.s.processPendingArchives();assert.deepEqual(probes,['good']);assert.equal(f.records.data[3][13],'good');
// Before a source exists, provider uncertainty retries and cannot create a replacement.
f=runtime();f.records.appendRow(candidate(f,'a-outage','outage'));f.records.appendRow(candidate(f,'z-valid','good'));
f.s.processPhoto_({update_id:1},f.message,f.records,f.events,f.config);created=0;
f.s.storePhoto_=()=>f.archive;f.s.createOrReusePreparedArchive_=()=>{created++;return f.archive;};
f.s.DriveApp={getFileById:id=>{if(id==='outage')throw Error('provider down');return{isTrashed:()=>false,getBlob:validBlob};}};
f.s.processPendingArchives();assert.equal(f.records.data[3][f.F.ARCHIVE_STATUS],'ARCHIVE_RETRY');assert.equal(created,0);
// A generic/ambiguous 404 is provider uncertainty, not positive evidence that replacement is safe.
f=runtime();f.records.appendRow(candidate(f,'a-ambiguous','ambiguous'));
f.s.processPhoto_({update_id:1},f.message,f.records,f.events,f.config);created=0;
f.s.storePhoto_=()=>f.archive;f.s.createOrReusePreparedArchive_=()=>{created++;return f.archive;};
f.s.DriveApp={getFileById:()=>{const e=Error('not found maybe');e.httpStatus=404;throw e;}};
f.s.processPendingArchives();assert.equal(f.records.data[2][f.F.ARCHIVE_STATUS],'ARCHIVE_RETRY');
assert.equal(created,0);
// Conflicting same-digest ledger evidence is terminal and also forbids replacement creation.
f=runtime();f.records.appendRow(candidate(f,'conflict','good',5));
f.s.processPhoto_({update_id:1},f.message,f.records,f.events,f.config);created=0;
f.s.storePhoto_=()=>f.archive;f.s.createOrReusePreparedArchive_=()=>{created++;return f.archive;};
f.s.processPendingArchives();assert.equal(f.records.data[2][f.F.ARCHIVE_STATUS],'ARCHIVE_FAILED_TERMINAL');
assert.equal(created,0);
// Authorization and quota failures discovered during the locked candidate probe pause/refund.
for(const blocked of [Object.assign(Error('denied'),{httpStatus:403}),Error('Drive quota exceeded')]){
 f=runtime();f.records.appendRow(candidate(f,'a-blocked','blocked'));
 f.s.processPhoto_({update_id:1},f.message,f.records,f.events,f.config);created=0;
 f.s.storePhoto_=()=>f.archive;f.s.createOrReusePreparedArchive_=()=>{created++;return f.archive;};
 f.s.DriveApp={getFileById:()=>{throw blocked;}};f.s.processPendingArchives();
 assert.equal(f.records.data[2][f.F.ARCHIVE_STATUS],'ARCHIVE_RETRY');
 assert.equal(f.records.data[2][f.F.ARCHIVE_ATTEMPTS],0);assert.equal(created,0);
 assert.ok(f.s.catalogHealth().find(r=>r.stage==='archive').paused);
}
// A partial multi-row Sheet write retains the live claim; an expired-lease retry completes linkage.
f=runtime();f.s.storePhoto_=()=>f.archive;f.s.processPhoto_({update_id:1},f.message,f.records,f.events,f.config);
f.s.processPendingArchives();const m2={...f.message,message_id:11,caption:'second'};
f.s.processPhoto_({update_id:2},m2,f.records,f.events,f.config);
f.records.data[2][f.F.ARCHIVE_ATTEMPTS]=4;
const originalRange=f.records.getRange.bind(f.records);let currentWrites=0,interrupt=true;
f.records.getRange=(r,c,n=1,m=1)=>{const range=originalRange(r,c,n,m),set=range.setValues;
 range.setValues=values=>{if(r===3&&++currentWrites===2&&interrupt)throw Error('sheet interrupted');return set(values);};return range;};
f.s.processPendingArchives();assert.equal(f.records.data[2][f.F.ARCHIVE_STATUS],'ARCHIVING');
assert.ok(f.records.data[2][f.F.ARCHIVE_CLAIM_ID]);
assert.equal(f.records.data[2][f.F.ARCHIVE_ATTEMPTS],4,'interrupted fifth claim refunds its attempt');
interrupt=false;f.records.data[2][f.F.ARCHIVE_LEASE_UNTIL_UTC]='2000-01-01T00:00:00.000Z';
f.s.processPendingArchives();assert.equal(f.records.data[2][f.F.CANONICAL_ROLE],'ALIAS');
assert.equal(f.records.data[2][f.F.ARCHIVE_CLAIM_ID],'');
console.log('PASS: durable intake, worker crash recovery, five attempts, receipt eligibility and stage recovery');
