const assert=require('assert'),{runtime}=require('./catalog_fixture');
function tg(f,failChat='') {
 f.s.telegram_=(method,p)=>{
  if(method==='getMe')return {result:{id:9,is_bot:true,username:'SchoolBot'}};
  if(method==='getChat')return {result:{id:Number(p.chat_id),type:'supergroup',permissions:{can_invite_users:true}}};
  if(method==='getChatMember') {
   if(String(p.chat_id)===failChat) throw Error('pending');
   return {result:{user:{id:Number(p.user_id)},status:String(p.user_id)==='9'?'administrator':'member'}};
  }
  return {ok:true,result:{message_id:7}};
 };
}
function intake(f) { f.groups.data.push(['-3','42','1','ACTIVE','administrator','now',f.config.botTokenFingerprint,'INITIATOR']);
 return f.s.processUpdate_({update_id:1,message:{...f.message,chat:{id:-3,type:'supergroup'}}},f.config); }
let f=runtime();tg(f);assert.equal(intake(f),'saved');
f.config.botTokenFingerprint='e'.repeat(64);f.config.outputGroupsVerifiedFor='v3|-2|'+'e'.repeat(64);
assert.equal(f.s.inputGroupIsActive_(f.spreadsheet,'-3',f.config),false);
f.s.processPendingEnrollments();assert.equal(f.s.inputGroupIsActive_(f.spreadsheet,'-3',f.config),true);
f.groups.data.push(['-1','','0','ACTIVE','administrator','now','old','MIGRATION_VERIFIED']);
f.s.processPendingEnrollments();assert.equal(f.groups.data[2][3],'ACTIVE');
const ev=(id,status,old)=>({update_id:id,my_chat_member:{chat:{id:-1,type:'supergroup'},date:id,
 from:{id:99,is_bot:false},old_chat_member:{user:{id:9},status:old},new_chat_member:{user:{id:9},status}}});
assert.equal(f.s.processUpdate_(ev(4,'member','administrator'),f.config),'suspended');
assert.equal(f.s.processUpdate_(ev(5,'administrator','member'),f.config),'active');
// Fair scheduling gives the third pending group a turn despite permanent earlier failures.
f=runtime();tg(f,'-3');
for(let n=3;n<=5;n++)f.groups.data.push(['-'+n,'42','1','PENDING','member','','old','INITIATOR']);
const original=f.s.telegram_;
f.s.telegram_=(m,p)=>m==='getChatMember'&&['-3','-4'].includes(String(p.chat_id))?(()=>{throw Error('pending');})():original(m,p);
f.s.processPendingEnrollments();f.s.processPendingEnrollments();assert.equal(f.groups.data[3][3],'ACTIVE');
// Router denies new capture from pending/suspended/unregistered, while admitted edits survive suspension.
f=runtime();tg(f);assert.equal(intake(f),'saved');
for(const status of ['PENDING','SUSPENDED']) {
 f.groups.data[1][3]=status;
 assert.equal(f.s.processUpdate_({update_id:2,message:{...f.message,message_id:11,chat:{id:-3,type:'supergroup'}}},f.config),'ignored');
}
assert.equal(f.s.processUpdate_({update_id:3,message:{...f.message,chat:{id:-9,type:'supergroup'}}},f.config),'ignored');
assert.equal(f.s.processUpdate_({update_id:4,edited_message:{...f.message,chat:{id:-3,type:'supergroup'},edit_date:f.message.date+1,caption:'edited'}},f.config),'caption-updated');
assert.equal(f.records.data.length,2);
assert.equal(f.s.processUpdate_({update_id:5,message:{...f.message,chat:{id:42,type:'private'},text:'/search@OtherBot horse'}},f.config),'ignored');
// Real lock contention blocks claims without sending or mutating records.
assert.equal(f.lock.tryLock(),true);assert.equal(f.s.processPendingArchives().processed,0);f.lock.releaseLock();
f.s.storePhoto_=()=>f.archive;f.s.processPendingArchives();
let r=f.records.data[1],F=f.F;r[F.PUBLISH_ELIGIBLE_AT_UTC]='2000-01-01T00:00:00.000Z';
f.s.applyTerminalTagError_(r,'timeout');
let photos=0;f.s.UrlFetchApp={fetch:(url,options)=>{photos++;assert.match(url,/sendPhoto$/);
 assert.match(options.payload.caption,/Analysis unavailable/);
 return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({ok:true,result:{message_id:88}})};}};
// Actual claim, revalidation (including synthetic archive integrity), and finish persist first fallback publication.
f.s.processPendingPublications();assert.equal(photos,1);assert.equal(f.records.data[1][F.PUBLISH_STATUS],'PUBLISHED');
assert.equal(f.records.data[1][F.OUTPUT_MESSAGE_ID],'88');
// Explicit enrichment suspends definitely unpublished fallback; ambiguous identity is preserved.
for(const status of ['PUBLISH_PENDING','PUBLISH_RETRY','PUBLISH_UNKNOWN','PUBLISHED']) {
 r=f.records.data[1];r[16]='TAG_UNAVAILABLE';r[F.PUBLISH_STATUS]=status;r[F.OUTPUT_MESSAGE_ID]=status==='PUBLISHED'?'88':'';
 f.s.requestCatalogEnrichment(r[0]);assert.equal(f.records.data[1][F.PUBLISH_STATUS],
 ['PUBLISH_PENDING','PUBLISH_RETRY'].includes(status)?'PUBLISH_WAITING_FOR_ENRICHMENT':status);
}
// First legacy caption edit snapshots existing human text; new adjacent text resets exhausted budget.
r=f.records.data[1];r[F.CAPTION_VERSION]='';r[10]='old legacy human';
f.s.applyCaptionVersion_(r,'new','999999999999:0000000000000001');assert.equal(r[F.ORIGINAL_CAPTION],'old legacy human');
r[F.CAPTION_SYNC_ATTEMPTS]=5;r[F.CAPTION_SYNC_NEXT_ATTEMPT_UTC]='2999-01-01T00:00:00.000Z';r[F.ADJACENT_AFTER_TEXT]='';
f.s.processText_({update_id:8},{...f.message,chat:{id:-3,type:'supergroup'},message_id:11,text:'adjacent'},f.records,f.events);
assert.equal(r[F.CAPTION_SYNC_ATTEMPTS],0);assert.equal(r[F.CAPTION_SYNC_NEXT_ATTEMPT_UTC],'');
// Analysis/publication authorization outages refund all claims, stop subsequent calls and recover explicitly.
for(const stage of ['analysis','publication']) for(const code of [401,403]) {
 f=runtime();tg(f);intake(f);f.s.storePhoto_=()=>f.archive;f.s.processPendingArchives();
 r=f.records.data[1];r[F.PUBLISH_ELIGIBLE_AT_UTC]='2000-01-01T00:00:00.000Z';
 if(stage==='publication')f.s.applyTerminalTagError_(r,'timeout');
 const second=r.slice();second[0]='-3:12';second[8]='12';f.records.data.push(second);
 let calls=0;
 f.s.Utilities.base64Encode=()=> 'fixture';
 f.s.UrlFetchApp={fetch:()=>{calls++;return {getResponseCode:()=>code,
   getContentText:()=>JSON.stringify({ok:false,error_code:code,error:{code:'authentication_error'},description:'private provider body'}),getHeaders:()=>({})};}};
 const run=stage==='analysis'?()=>f.s.processPendingTags():()=>f.s.processPendingPublications();
 run();assert.equal(calls,1);
 for(const saved of f.records.data.slice(1))assert.equal(saved[stage==='analysis'?21:F.PUBLISH_ATTEMPTS],0);
 run();assert.equal(calls,1);assert.ok(f.s.catalogHealth().find(x=>x.stage===stage).paused);
 f.s.recoverCatalogStage(stage);
 const metadata={};for(const key of f.s.groqMetadataKeys_())metadata[key]=key.startsWith('caption_')?'horse':key==='ocr_text'?'':[];
 metadata.tags_en=['horse','book','school','tree','sky'];metadata.tags_ar=['حصان','كتاب','مدرسة','شجرة','سماء'];
 f.s.UrlFetchApp.fetch=()=>({getResponseCode:()=>200,getContentText:()=>JSON.stringify(
   stage==='analysis'?{choices:[{message:{content:JSON.stringify(metadata)}}]}:{ok:true,result:{message_id:99}}),getHeaders:()=>({})});
 run();assert.equal(f.records.data[1][stage==='analysis'?16:F.PUBLISH_STATUS],stage==='analysis'?'TAGGED':'PUBLISHED');
}
console.log('PASS: reviewed registry, router, locks, fallback publication and stage outage recovery regressions');

// Provider failures retain sanitized status and the longest header/body delay.
f=runtime();f.s.Utilities.base64Encode=()=> 'fixture';
const response=(status,body,header)=>({getResponseCode:()=>status,getContentText:()=>body,
 getHeaders:()=>({'Retry-After':header})});
f.s.UrlFetchApp={fetch:()=>response(429,JSON.stringify({parameters:{retry_after:30}}),'7200')};
const evidence={driveFileId:'drive',archiveMimeType:'image/jpeg',archiveByteSize:4,
 archiveSha256:f.archive.sha256,archiveCompletedAtUtc:f.archive.completedAtUtc};
assert.throws(()=>f.s.groqTagDriveImage_('drive',{groqApiKey:'fixture',groqModel:'fixture'},evidence),
 e=>e.httpStatus===429&&e.retryAfterSeconds===7200);
assert.throws(()=>f.s.geminiEmbedPart_({text:'fixture'},{model:'fixture',apiKey:'fixture',dimensions:2}),
 e=>e.httpStatus===429&&e.retryAfterSeconds===7200&&!e.message.includes('responseText'));
for(const code of [401,403]) {
 f.s.UrlFetchApp.fetch=()=>response(code,'secret raw non-json response','900');
 assert.throws(()=>f.s.telegram_('getMe',{},'fixture'),e=>e.httpStatus===code&&
   e.retryAfterSeconds===900&&!e.message.includes('secret'));
}
// Fixed caption diagnostics survive missing-message failures and exhaustion; health exposes counts.
f=runtime();tg(f);intake(f);f.s.storePhoto_=()=>f.archive;f.s.processPendingArchives();
r=f.records.data[1];F=f.F;r[16]='TAG_UNAVAILABLE';r[F.PUBLISH_STATUS]='PUBLISHED';
r[F.OUTPUT_MESSAGE_ID]='77';r[F.CAPTION_SYNC_STATUS]='SYNC_PENDING';
f.s.telegram_=()=>{const e=Error('private raw missing-message body');e.httpStatus=400;throw e;};
for(let n=0;n<5;n++){f.records.data[1][F.CAPTION_SYNC_NEXT_ATTEMPT_UTC]='';f.s.processPendingCaptionSync();}
assert.equal(f.records.data[1][F.CAPTION_SYNC_STATUS],'SYNC_FAILED');
assert.equal(f.records.data[1][F.CAPTION_SYNC_ERROR],'Caption synchronization failed (HTTP 400).');
let health=f.s.catalogHealth();assert.equal(health.find(x=>x.stage==='caption').failed,1);
assert.equal(health.find(x=>x.stage==='caption').backlog,0);
assert.ok(!JSON.stringify(health).includes('private'));
f.records.data[1][F.PUBLISH_STATUS]='PUBLISH_UNKNOWN';
assert.equal(f.s.catalogHealth().find(x=>x.stage==='publication').failed,1);
console.log('PASS: provider retry/status sanitization, caption failure diagnostics and health counts');

// The v3 registry extension migrates old seven-column headers without overwriting rows.
f=runtime();f.groups.data[0]=f.groups.data[0].slice(0,7);
f.groups.data.push(['-1','','0','ACTIVE','administrator','now',f.config.botTokenFingerprint]);
f.s.migrateSharedCatalog();assert.equal(f.groups.data[0][7],'enrollment_authority');
assert.equal(f.groups.data[1][0],'-1');
