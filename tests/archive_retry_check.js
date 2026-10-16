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
f=runtime();f.s.processPhoto_({update_id:1},f.message,f.records,f.events,f.config);
f.s.storePhoto_=()=>{f.records.data[1][f.F.ARCHIVE_CLAIM_ID]='replacement';return f.archive;};
f.s.processPendingArchives();assert.equal(f.records.data[1][f.F.ARCHIVE_STATUS],'ARCHIVING');
assert.equal(f.records.data[1][13],'');
// Analysis admission is independent of publication admission.
f=runtime();f.config.outputPublishingEnabled=false;
f.s.processPhoto_({update_id:1},f.message,f.records,f.events,f.config);
f.s.storePhoto_=()=>f.archive;f.s.processPendingArchives();assert.equal(f.records.data[1][16],'TAG_PENDING');
assert.equal(f.records.data[1][f.F.PUBLISH_STATUS],'PUBLISH_NOT_ELIGIBLE');
console.log('PASS: durable intake, worker crash recovery, five attempts, receipt eligibility and stage recovery');
