const assert = require('assert');
const crypto = require('crypto');
const {runtime} = require('./catalog_fixture');

let f = runtime(), {s,F,records,events,config} = f;
const digest = crypto.createHash('sha256').update(Buffer.from([255,216,255,217])).digest('hex');
let creates = 0;
s.storePhoto_ = () => f.archive;
s.createOrReusePreparedArchive_ = prepared => {
  assert.strictEqual(f.lock.tryLock(0), false, 'Drive reuse/create must run under ScriptLock');
  creates++;
  assert.strictEqual(prepared.sha256, digest);
  return f.archive;
};

const first = {...f.message, caption:'Ａ  book', message_id:10,
  photo:[{file_id:'one',file_unique_id:'signal-1',width:1,height:1}]};
const second = {...f.message, caption:'A book', message_id:11,
  photo:[{file_id:'two',file_unique_id:'different-signal',width:1,height:1}]};
const third = {...f.message, caption:'horse notes', message_id:12,
  photo:[{file_id:'three',file_unique_id:'signal-1',width:1,height:1}]};
for (const [i,message] of [first,second,third].entries()) {
  assert.strictEqual(s.processPhoto_({update_id:i+1},message,records,events,config),'saved');
  s.processPendingArchives();
}
assert.strictEqual(creates,1,'verified canonical source avoids replacement Drive creation');
const owner=records.data[1], alias1=records.data[2], alias2=records.data[3];
assert.strictEqual(owner[F.CANONICAL_ROLE],'OWNER');
assert.strictEqual(alias1[F.CANONICAL_ROLE],'ALIAS');
assert.strictEqual(alias2[F.CANONICAL_ROLE],'ALIAS');
assert.strictEqual(alias1[F.CANONICAL_RECORD_ID],owner[0]);
assert.strictEqual(alias2[13],owner[13]);
assert.strictEqual(alias1[16],'TAG_NOT_ELIGIBLE');
assert.strictEqual(alias1[F.PUBLISH_STATUS],'PUBLISH_NOT_ELIGIBLE');
assert.deepStrictEqual(Array.from(s.canonicalHumanFragments_(records.data.slice(1),owner)),
  ['Ａ  book','horse notes'],'NFKC and whitespace-equivalent captions are unique in sheet order');

owner[F.PUBLISH_STATUS]='PUBLISHED'; owner[F.OUTPUT_CHAT_ID]='-2';
owner[F.OUTPUT_MESSAGE_ID]='77'; owner[16]='TAG_UNAVAILABLE';
owner[F.CAPTION_SYNC_STATUS]='SYNCED';
let ranked=s.searchPublishedGroupRecords_(records,'horse',5,config);
assert.strictEqual(ranked.length,1);
assert.strictEqual(ranked[0].recordId,owner[0]);
assert.match(ranked[0].caption,/horse notes/);
assert.doesNotMatch(ranked[0].caption,/\uD800|\uDC00/);
const projectionRows=records.data.slice(1).map(row=>row.slice());
projectionRows[0][F.LATEST_CAPTION]='x'.repeat(800)+'😀';projectionRows[0][10]=projectionRows[0][F.LATEST_CAPTION];
projectionRows[1][F.LATEST_CAPTION]='same long context';projectionRows[1][10]='same long context';
projectionRows[2][F.LATEST_CAPTION]='needle 🐎';projectionRows[2][10]='needle 🐎';
const projected=s.rankRecordValues_(projectionRows,'needle',5,false)[0].caption;
assert.match(projected,/^needle 🐎/);assert.doesNotMatch(projected,/\uD800(?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])\uDC00/);

const edit={...third,caption:'horse archive',edit_date:1700000100};
assert.strictEqual(s.processCaptionEdit_({update_id:99,edited_message:edit},edit,records,events),'caption-updated');
assert.strictEqual(records.data[3][F.CAPTION_SYNC_STATUS],'');
assert.strictEqual(records.data[1][F.CAPTION_SYNC_STATUS],'SYNC_PENDING');

// Provider failure takes retry precedence even when linked content changes in flight.
records.data[1][F.CAPTION_SYNC_STATUS]='SYNC_PENDING';let failedEdit=false;
s.telegram_=method=>{if(method==='editMessageCaption'&&!failedEdit){failedEdit=true;
  const live={...third,caption:'newest failed edit',edit_date:1700000400};
  s.processCaptionEdit_({update_id:103,edited_message:live},live,records,events);
  const e=Error('timeout');e.retryAfterSeconds=60;throw e;}return{ok:true};};
s.processPendingCaptionSync();assert.strictEqual(records.data[1][F.CAPTION_SYNC_STATUS],'SYNC_RETRY');
assert.match(records.data[1][F.CAPTION_SYNC_ERROR],/failed/i);
records.data[1][F.CAPTION_SYNC_STATUS]='SYNCED';
const adjacent={chat:f.message.chat,message_id:13,date:1700000101,from:f.message.from,text:'adjacent alias detail'};
assert.strictEqual(s.processText_({update_id:100},adjacent,records,events),'associated-after');
assert.strictEqual(records.data[1][F.CAPTION_SYNC_STATUS],'SYNC_PENDING');
assert.match(s.recordPublishCaption_(records.data[1],records.data.slice(1)),/adjacent alias detail/);
// An aggregate-equivalent edit does not schedule another output edit.
records.data[1][F.CAPTION_SYNC_STATUS]='SYNCED';
const equivalent={...second,caption:' A   book ',edit_date:1700000200};
s.processCaptionEdit_({update_id:101,edited_message:equivalent},equivalent,records,events);
assert.strictEqual(records.data[1][F.CAPTION_SYNC_STATUS],'SYNCED');

// A caption that changes while a sync is in flight leaves the owner's claim intact,
// then queues one follow-up for the latest aggregate.
records.data[1][F.CAPTION_SYNC_STATUS]='SYNC_PENDING';
let editedDuringSync=false;
s.telegram_=method=>{
  if(method==='editMessageCaption'&&!editedDuringSync){editedDuringSync=true;
    const live={...third,caption:'horse notes 🐎',edit_date:1700000500};
    s.processCaptionEdit_({update_id:104,edited_message:live},live,records,events);
    assert.strictEqual(records.data[1][F.CAPTION_SYNC_STATUS],'SYNCING');
  }
  return {ok:true,result:true};
};
s.processPendingCaptionSync();
assert.strictEqual(records.data[1][F.CAPTION_SYNC_STATUS],'SYNC_PENDING');

// A confirmed remote publication is persisted before latest-caption reconciliation.
records.data[1][F.PUBLISH_STATUS]='PUBLISHING';records.data[1][F.PUBLISH_CLAIM_ID]='pub-1';
records.data[1][F.PUBLISH_ATTEMPTS]=1;records.data[1][F.PUBLISH_CAPTION]='old snapshot';
records.data[1][F.OUTPUT_MESSAGE_ID]='';
assert.strictEqual(s.finishPublishClaim_(records,{rowNumber:2,recordId:records.data[1][0],
  claimId:'pub-1',attempts:1,caption:'old snapshot'},{status:'PUBLISHED',messageId:'88'}),true);
assert.strictEqual(records.data[1][F.OUTPUT_MESSAGE_ID],'88');
assert.strictEqual(records.data[1][F.CAPTION_SYNC_STATUS],'SYNC_PENDING');
const latestCaption=s.recordPublishCaption_(records.data[1],records.data.slice(1));
records.data[1][F.PUBLISH_STATUS]='PUBLISHING';records.data[1][F.PUBLISH_CLAIM_ID]='pub-2';
records.data[1][F.PUBLISH_ATTEMPTS]=2;records.data[1][F.OUTPUT_MESSAGE_ID]='';
records.data[1][F.CAPTION_SYNC_STATUS]='SYNC_PENDING';
s.finishPublishClaim_(records,{rowNumber:2,recordId:records.data[1][0],claimId:'pub-2',
  attempts:2,caption:latestCaption},{status:'PUBLISHED',messageId:'89'});
assert.strictEqual(records.data[1][F.CAPTION_SYNC_STATUS],'SYNCED',
  'initial publication using latest aggregate satisfies synchronization');

// Fully consistent prospective groups disappear from the ledger-only report; inconsistent evidence stays.
assert.deepStrictEqual(Array.from(s.historicalDuplicateCandidateReportFromRows_(records.data.slice(1))),[]);
alias2[13]='conflicting-drive';
assert.strictEqual(s.historicalDuplicateCandidateReportFromRows_(records.data.slice(1)).length,1);
let driveCalls=0; s.DriveApp={getFileById:()=>{driveCalls++;throw Error('must not probe');}};
assert.strictEqual(s.reportHistoricalDuplicateCandidates().length,1);
assert.strictEqual(driveCalls,0,'public report must remain ledger-only');
const bogusSourceRows=records.data.slice(1).map(row=>row.slice());
bogusSourceRows.forEach(row=>{row[F.ARCHIVE_SOURCE_RECORD_ID]='not-in-group';});
assert.strictEqual(s.historicalDuplicateCandidateReportFromRows_(bogusSourceRows).length,1,
  'a common but non-referential archive source cannot suppress review');
const embeddings=f.sheet(new Array(12).fill(''));
const geminiConfig={recordIds:[alias1[0]],datasetId:'d',approvedBy:'reviewer',
  approvedAt:'2026-10-19T00:00:00.000Z',expiresAt:'2026-10-20T00:00:00.000Z',
  model:'gemini',dimensions:3};
assert.strictEqual(s.claimGeminiPilotRows_(records,embeddings,geminiConfig,5).length,0,
  'aliases must never enter Gemini indexing');
assert.throws(()=>s.requestCatalogEnrichment(alias1[0]),/not eligible/,
  'explicit operator enrichment must reject aliases');
const semanticConfig={recordIdSet:new Set([owner[0]]),datasetId:'d',approvedBy:'reviewer',
  approvedAt:'2026-10-19T00:00:00.000Z',expiresAt:'2026-10-20T00:00:00.000Z',
  model:'gemini',dimensions:2};
const embedding=[owner[0],'d','reviewer',semanticConfig.approvedAt,semanticConfig.expiresAt,
  'gemini',2,'[1,0]','READY',1,'','2026-10-19T00:00:01.000Z'];
assert.match(s.rankSemanticRows_([embedding],records.data.slice(1),[1,0],semanticConfig,5,
  new Date('2026-10-19T01:00:00.000Z'))[0].caption,/adjacent alias detail/,
  'semantic projection includes linked human context');

// Digest filename create/reuse/conflict branches use exact prepared bytes.
f=runtime(); ({s}=f); s.createOrReusePreparedArchive_=f.productionCreate;
const prepared={blob:{setName(name){this.name=name;return this;}},mimeType:'image/jpeg',byteSize:4,sha256:digest};
function iterator(items){let i=0;return{hasNext:()=>i<items.length,next:()=>items[i++]};}
const validFile={getId:()=> 'd1',getUrl:()=> 'u1',getSize:()=>4,getBlob:()=>({
  getBytes:()=>[255,216,255,217],getContentType:()=> 'image/jpeg'})};
let created=0, matches=[];
s.DriveApp={getFolderById:()=>({getFilesByName:name=>{assert.strictEqual(name,digest+'.jpg');return iterator(matches);},
  createFile:blob=>{created++;return validFile;}})};
assert.strictEqual(s.createOrReusePreparedArchive_(prepared,{}).id,'d1'); assert.strictEqual(created,1);
matches=[validFile]; assert.strictEqual(s.createOrReusePreparedArchive_(prepared,{}).id,'d1'); assert.strictEqual(created,1);
matches=[validFile,validFile]; assert.throws(()=>s.createOrReusePreparedArchive_(prepared,{}),/Multiple Drive objects/);
assert.strictEqual(s.canonicalArchiveFileName_({...prepared,mimeType:'image/png'}),digest+'.png');
assert.strictEqual(s.canonicalArchiveFileName_({...prepared,mimeType:'image/webp'}),digest+'.webp');
matches=[];created=0;
const badReadback={...validFile,getBlob:()=>({getBytes:()=>[137,80,78,71,13,10,26,10],getContentType:()=> 'image/png'})};
s.DriveApp={getFolderById:()=>({getFilesByName:()=>iterator([]),createFile:()=>badReadback})};
assert.throws(()=>s.createOrReusePreparedArchive_(prepared,{}),/readback/);

// Explicit owners outrank blank legacy candidates and preserve source lineage/timestamps.
f=runtime();({s,F,records,events,config}=f);s.storePhoto_=()=>f.archive;
function readyCandidate(id,drive){const row=new Array(f.H.length).fill('');row[0]=id;row[11]='p-'+id;
 row[13]=drive;row[14]='u-'+drive;row[F.ARCHIVE_MIME_TYPE]='image/jpeg';row[F.ARCHIVE_BYTE_SIZE]=4;
 row[F.ARCHIVE_SHA256]=digest;row[F.ARCHIVE_STATUS]='ARCHIVED';row[F.ARCHIVE_ATTEMPTS]=1;
 row[F.ARCHIVE_COMPLETED_AT_UTC]='2026-10-19T00:00:00.000Z';return row;}
const legacy=readyCandidate('a-legacy','legacy-drive'),explicit=readyCandidate('z-owner','owner-drive');
explicit[F.CANONICAL_RECORD_ID]='z-owner';explicit[F.CANONICAL_ROLE]='OWNER';
explicit[F.CANONICAL_LINKED_AT_UTC]='2026-10-18T00:00:00.000Z';
explicit[F.ARCHIVE_SOURCE_RECORD_ID]='z-owner';records.appendRow(legacy);records.appendRow(explicit);
let priorityProbes=[];s.DriveApp={getFileById:id=>{priorityProbes.push(id);return{isTrashed:()=>false,getBlob:()=>({
 getBytes:()=>[255,216,255,217],getContentType:()=> 'image/jpeg'})};}};
config.outputPublishingEnabled=false;config.groqTaggingEnabled=false;
s.processPhoto_({update_id:1},f.message,records,events,config);s.processPendingArchives();
assert.deepStrictEqual(priorityProbes,['owner-drive']);
assert.strictEqual(records.data[3][F.ARCHIVE_SOURCE_RECORD_ID],'z-owner');
assert.strictEqual(records.data[2][F.CANONICAL_LINKED_AT_UTC],'2026-10-18T00:00:00.000Z');

// A prospective archive-only receipt can donate verified storage, then becomes an alias
// when a later eligible upload is the canonical downstream owner.
f=runtime();({s,F,records,events,config}=f);s.storePhoto_=()=>f.archive;
config.outputPublishingEnabled=false;config.groqTaggingEnabled=false;
s.processPhoto_({update_id:1},f.message,records,events,config);s.processPendingArchives();
config.outputPublishingEnabled=true;config.groqTaggingEnabled=true;
const eligible={...f.message,message_id:11,caption:'eligible owner'};
s.processPhoto_({update_id:2},eligible,records,events,config);s.processPendingArchives();
assert.strictEqual(records.data[1][F.CANONICAL_ROLE],'ALIAS');
assert.strictEqual(records.data[2][F.CANONICAL_ROLE],'OWNER');
assert.strictEqual(records.data[1][F.CANONICAL_RECORD_ID],records.data[2][0]);
assert.strictEqual(records.data[1][F.PUBLISH_STATUS],'PUBLISH_NOT_ELIGIBLE');

// Two stale claims selected in one batch re-read under the lock and still create once.
f=runtime();({s,F,records,events,config}=f);let batchCreates=0;s.storePhoto_=()=>f.archive;
s.createOrReusePreparedArchive_=prepared=>{batchCreates++;return f.archive;};
s.processPhoto_({update_id:1},f.message,records,events,config);
s.processPhoto_({update_id:2},{...f.message,message_id:11},records,events,config);
s.processPendingArchives();assert.strictEqual(batchCreates,1);
assert.strictEqual(records.data[2][F.CANONICAL_ROLE],'ALIAS');
let repeatedProbes=0;s.DriveApp={getFileById:()=>{repeatedProbes++;return{isTrashed:()=>false,getBlob:()=>({
  getBytes:()=>[255,216,255,217],getContentType:()=> 'image/jpeg'})};}};
s.processPhoto_({update_id:3},{...f.message,message_id:12},records,events,config);s.processPendingArchives();
assert.strictEqual(repeatedProbes,1,'aliases sharing archive evidence are probed once');

console.log('PASS: canonical exact-image deduplication, caption routing, grouped search and reporting');
