const assert=require('assert'), {runtime}=require('./catalog_fixture');
let f=runtime();const {s,F,records,events,message,config}=f;
// An edit delivered before intake survives the later original delivery.
s.processCaptionEdit_({update_id:2},{...message,edit_date:message.date+1,caption:'latest horse'},records,events);
s.processPhoto_({update_id:1},message,records,events,config);
let row=records.data[1];assert.equal(row[F.ORIGINAL_CAPTION],'original book');
assert.equal(row[F.LATEST_CAPTION],'latest horse');assert.equal(row[10],'latest horse');
assert.equal(s.processCaptionEdit_({update_id:1},{...message,caption:'stale'},records,events),'stale');
row[F.ADJACENT_AFTER_TEXT]='adjacent retained';
s.processCaptionEdit_({update_id:3},{...message,edit_date:message.date+2,caption:''},records,events);
assert.equal(row[F.ADJACENT_AFTER_TEXT],'adjacent retained');
// Worker saved copies replace row arrays; always read current persistent values.
row=records.data[1];assert.equal(row[F.LATEST_CAPTION],'');assert.equal(row[F.ADJACENT_AFTER_TEXT],'adjacent retained');
s.storePhoto_=()=>f.archive;s.processPendingArchives();row=records.data[1];
assert.equal(row[16],'TAG_PENDING');
// Exhausted analysis becomes explicit unavailable state, retaining healthy archive.
s.applyTerminalTagError_(row,'timeout');assert.equal(row[16],'TAG_UNAVAILABLE');
assert.equal(row[F.PUBLISH_STATUS],'PUBLISH_PENDING');
assert.match(s.recordPublishCaption_(row),/Analysis unavailable/);
assert.equal(s.publicationRowBoundaryError_(row,{inputChatId:'-999',outputChatId:'-2'}),'');
row[F.PUBLISH_STATUS]='PUBLISHED';row[F.OUTPUT_MESSAGE_ID]='7';
row[F.CAPTION_SYNC_STATUS]='SYNC_PENDING';const calls=[];
s.telegram_=(method,payload)=>{calls.push({method,payload});return {ok:true};};
s.processPendingCaptionSync();assert.equal(calls.length,1);assert.equal(calls[0].method,'editMessageCaption');
assert.equal(calls[0].payload.message_id,'7');assert.match(calls[0].payload.caption,/Analysis unavailable/);
s.requestCatalogEnrichment(row[0]);row=records.data[1];assert.equal(row[16],'TAG_PENDING');
row[16]='TAGGING';row[21]=1;row[22]=new Date(Date.now()+600000).toISOString();row[F.TAG_CLAIM_ID]='new';
const claim={...s.archiveEvidenceFromRow_(row),recordId:row[0],attempts:1,claimId:'new'};
assert.equal(s.finishTagClaim_(config,{...claim,claimId:'old'},{status:'TAGGED'}),false);
const metadata={caption_en:'horse',caption_ar:'حصان', tags_en:['horse'],tags_ar:['حصان']};
for(const key of s.groqMetadataKeys_()) if(!(key in metadata)) metadata[key]=key==='ocr_text'?'':[];
const clean=s.normalizeGroqMetadata_(metadata);
assert.equal(s.finishTagClaim_(config,claim,{status:'TAGGED',error:'',aiTags:'horse',aiCaption:'horse',
 metadataJson:JSON.stringify(clean),nextAttempt:''}),true);
s.processPendingCaptionSync();assert.equal(calls.length,2);assert.equal(calls[1].method,'editMessageCaption');
assert.equal(calls[1].payload.message_id,'7');assert.doesNotMatch(calls[1].payload.caption,/Analysis unavailable/);
assert.equal(records.data[1][F.OUTPUT_MESSAGE_ID],'7');
assert.equal(s.meaningfulQueryTokens_('the and في على').length,0);
// Weighted metadata cannot outrank more meaningful query-token coverage.
let a=records.data[1].slice(),b=a.slice();a[0]='one';b[0]='two';
a[F.CANONICAL_RECORD_ID]='';a[F.CANONICAL_ROLE]='';b[F.CANONICAL_RECORD_ID]='';b[F.CANONICAL_ROLE]='';
a[18]='horse';a[10]='';a[F.AI_METADATA_JSON]='';a[19]='';a[20]='';
b[18]='';b[10]='horse book';b[F.AI_METADATA_JSON]='';b[19]='';b[20]='';
assert.equal(s.rankRecordValues_([a,b],'the horse book',5,false)[0].recordId,'two');
// Caption timeouts retry only the known message; a newer caption is repaired after a stale success.
records.data[1][F.CAPTION_SYNC_STATUS]='SYNC_PENDING';
s.telegram_=()=>{let e=Error('timeout');e.retryAfterSeconds=3600;throw e;};
s.processPendingCaptionSync();assert.equal(records.data[1][F.CAPTION_SYNC_STATUS],'SYNC_RETRY');
assert.ok(Date.parse(records.data[1][F.CAPTION_SYNC_NEXT_ATTEMPT_UTC])-Date.now()>3599000);
records.data[1][F.CAPTION_SYNC_NEXT_ATTEMPT_UTC]='';records.data[1][F.CAPTION_SYNC_STATUS]='SYNC_PENDING';
s.telegram_=()=>{records.data[1][F.CAPTION_SYNC_CLAIM_ID]='newer-claim';return {ok:true};};
s.processPendingCaptionSync();assert.equal(records.data[1][F.CAPTION_SYNC_STATUS],'SYNC_PENDING');
// A successful remote edit whose result cannot acquire the save lock remains retryable
// without consuming the caption attempt budget or stranding a live claim.
const contention=runtime();
contention.s.processPhoto_({update_id:1},contention.message,contention.records,
  contention.events,contention.config);
contention.s.storePhoto_=()=>contention.archive;contention.s.processPendingArchives();
const contentionRow=contention.records.data[1], contentionF=contention.F;
contentionRow[contentionF.PUBLISH_STATUS]='PUBLISHED';contentionRow[contentionF.OUTPUT_MESSAGE_ID]='7';
contentionRow[16]='TAG_UNAVAILABLE';
contentionRow[contentionF.CAPTION_SYNC_STATUS]='SYNC_PENDING';
for(let contentionAttempt=0;contentionAttempt<5;contentionAttempt++) {
 contention.s.telegram_=()=>{assert.equal(contention.lock.tryLock(0),true);return {ok:true};};
 contention.s.processPendingCaptionSync();
 assert.equal(contention.records.data[1][contentionF.CAPTION_SYNC_STATUS],'SYNCING');
 assert.equal(contention.records.data[1][contentionF.CAPTION_SYNC_ATTEMPTS],1,
   'expired save-lock claims must refund before the next caption claim');
 contention.lock.releaseLock();
 contention.records.data[1][contentionF.CAPTION_SYNC_LEASE_UNTIL_UTC]='2000-01-01T00:00:00.000Z';
}
contention.s.telegram_=()=>({ok:true});contention.s.processPendingCaptionSync();
assert.equal(contention.records.data[1][contentionF.CAPTION_SYNC_STATUS],'SYNCED');
assert.equal(contention.records.data[1][contentionF.CAPTION_SYNC_ATTEMPTS],1);
assert.equal(contention.records.data[1][contentionF.CAPTION_SYNC_CLAIM_ID],'');
// Expired delivery claims are quarantined as unknown and cannot be resent.
const expired=runtime();
expired.s.processPhoto_({update_id:1},expired.message,expired.records,expired.events,expired.config);
row=expired.records.data[1];row[expired.F.PUBLISH_STATUS]='PUBLISHING';row[expired.F.OUTPUT_MESSAGE_ID]='';
row[expired.F.PUBLISH_LEASE_UNTIL_UTC]='2000-01-01T00:00:00.000Z';
expired.s.claimPendingPublications_(expired.records,{inputChatId:'-1',outputChatId:'-2'},2);
assert.equal(expired.records.data[1][expired.F.PUBLISH_STATUS],'PUBLISH_UNKNOWN');
assert.equal(expired.s.claimPendingPublications_(expired.records,{inputChatId:'-1',outputChatId:'-2'},2).length,0);
console.log('PASS: caption ordering/removal, fallback, explicit enrichment, same-message synchronization and meaningful ranking');
// Dense generated metadata must reserve visible space for the latest edited human caption.
{
 const d=runtime(), dense={};
 for(const key of d.s.groqMetadataKeys_()) {
  dense[key]=key.startsWith('caption_')?Array(100).fill(key==='caption_en'?'generated':'مولد').join(' ').slice(0,500):
   key==='ocr_text'?Array(300).fill('ocr').join(' ').slice(0,1200):
    Array.from({length:/^(tags|objects)_/.test(key)?20:key.startsWith('visual_tone_')?8:12},
      (_,n)=>(String(n)+' '+Array(15).fill('detail').join(' ')).slice(0,80));
 }
 const stored=JSON.stringify(d.s.normalizeGroqMetadata_(dense));
 d.s.processPhoto_({update_id:1},d.message,d.records,d.events,d.config);
 d.s.storePhoto_=()=>d.archive;d.s.processPendingArchives();
 const rr=d.records.data[1],df=d.F;
 rr[16]='TAGGED';rr[df.AI_METADATA_JSON]=stored;
 rr[18]=Array(80).fill('older manual context').join(' ');
 rr[9]=Array(80).fill('older adjacent context').join(' ');
 rr[df.PUBLISH_STATUS]='PUBLISHED';rr[df.OUTPUT_MESSAGE_ID]='20';
 const edited='كتاب اختبار الكتالوج المشترك فهرسةمدرسية 😀';
 d.s.processCaptionEdit_({update_id:2},{...d.message,edit_date:d.message.date+1,caption:edited},d.records,d.events);
 const sends=[];d.s.telegram_=(method,payload)=>{sends.push({method,payload});return {ok:true};};
 d.s.processPendingCaptionSync();
 assert.equal(sends.length,1);assert.equal(sends[0].method,'editMessageCaption');
 assert.equal(sends[0].payload.message_id,'20');
 assert.ok(sends[0].payload.caption.includes(edited),'latest human caption must survive a full metadata budget');
 assert.ok(d.s.unicodeCodePointLength_(sends[0].payload.caption)<=1024);
 assert.equal(d.s.hasLoneSurrogate_(sends[0].payload.caption),false);
 assert.equal(d.records.data[1][df.AI_METADATA_JSON],stored,'full structured metadata remains intact');
 assert.equal(d.records.data[1][df.OUTPUT_MESSAGE_ID],'20');
}
console.log('PASS: dense metadata preserves latest human context, Unicode limits and same-message sync');
