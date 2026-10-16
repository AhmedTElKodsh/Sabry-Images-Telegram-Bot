const assert=require('assert'), {runtime}=require('./catalog_fixture');
function fixture(shared=true,cutoff='2000-01-01T00:00:00.000Z',mode='NEW_PHOTOS_ONLY') {
 const f=runtime();Object.assign(f.props,{SPREADSHEET_ID:'sheet',GROQ_API_KEY:'key',BOT_TOKEN:'token',
  GROQ_TAGGING_MODE:mode,GROQ_TAGGING_AFTER_MESSAGE_DATE:cutoff});
 if(!shared)delete f.props.SHARED_CATALOG_VERSION;
 let queueChecks=0;
 f.s.telegram_=(method)=>{assert.equal(method,'getWebhookInfo');queueChecks++;return {result:{pending_update_count:8}};};
 f.s.closeManagedWorkerFailClosed_=()=>{};
 f.s.replaceTimeTrigger_=()=>({trigger:{getUniqueId:()=> 'restored-trigger'}});
 f.s.handlerTriggers_=()=>[{}];
 return {...f,queueChecks:()=>queueChecks};
}
// Restoring the established shared boundary is safe while Telegram retains queued updates.
let f=fixture();f.config.groqTaggingEnabled=false;
f.s.processPhoto_({update_id:1},f.message,f.records,f.events,f.config);
assert.equal(f.records.data[1][f.F.ANALYSIS_ADMITTED_AT_UTC],'');
const resumed=f.s.activateGroqMode_('NEW_PHOTOS_ONLY');
assert.equal(resumed.resumed,true);assert.equal(resumed.cutoff,'2000-01-01T00:00:00.000Z');
assert.equal(f.props.GROQ_TAGGING_AFTER_MESSAGE_DATE,resumed.cutoff);assert.equal(f.queueChecks(),0);
f.config.groqTaggingEnabled=true;f.s.storePhoto_=()=>f.archive;f.s.processPendingArchives();
assert.equal(f.records.data[1][16],'TAG_NOT_ELIGIBLE');
assert.equal(f.s.claimPendingTags_(f.config,2).length,0);
// First activation, invalid stored boundary and legacy behavior still require an empty queue.
for(const args of [[true,''],[true,'invalid'],[true,'2000-01-01T00:00:00.000Z',''],[false]]) {
 f=fixture(...args);assert.throws(()=>f.s.activateGroqMode_('NEW_PHOTOS_ONLY'),/pending webhook updates/);
 assert.equal(f.queueChecks(),1);assert.equal(f.props.GROQ_TAGGING_ENABLED,undefined);
}
console.log('PASS: disabled shared-mode resumption preserves cutoff with queued updates and receipt admission');
// A genuine first activation still succeeds only after an empty-queue check and establishes a new boundary.
f=fixture(true,'');let firstChecks=0;
f.s.telegram_=()=>{firstChecks++;return {result:{pending_update_count:0}};};
const first=f.s.activateGroqMode_('NEW_PHOTOS_ONLY');
assert.equal(first.resumed,false);assert.equal(firstChecks,1);
assert.ok(f.s.canonicalIsoInstant_(first.cutoff));
