const assert=require('assert'), {runtime}=require('./catalog_fixture');
let f=runtime();
function telegram(f) {
 f.s.telegram_=(method,payload)=>{
  if(method==='getMe') return {result:{id:9,is_bot:true}};
  if(method==='getChat') return {result:{id:Number(payload.chat_id),type:'supergroup',permissions:{can_invite_users:true}}};
  if(method==='getChatMember') return {result:{user:{id:Number(payload.user_id)},status:
    String(payload.user_id)==='9'?'administrator':'member'}};
  throw Error('unexpected request');
 };
}
function event(id,date,oldStatus,newStatus,actor=42) {return {update_id:id,my_chat_member:{
 chat:{id:-3,type:'supergroup'}, date, from:{id:actor,is_bot:false},
 old_chat_member:{user:{id:9},status:oldStatus},new_chat_member:{user:{id:9},status:newStatus}}};}
telegram(f);
const live=f.s.telegram_;let botStatus='member';
f.s.telegram_=(method,p)=>method==='getChatMember'&&String(p.user_id)==='9'
 ? {result:{user:{id:9},status:botStatus}}:live(method,p);
// Add by an ordinary school/output member with inherited input invitation rights.
assert.equal(f.s.processEnrollment_(event(1,1,'left','member'),f.config),'pending');
assert.equal(f.groups.data[1][1],'42');
botStatus='administrator';
assert.equal(f.s.processEnrollment_(event(2,2,'member','administrator',99),f.config),'active');
assert.equal(f.groups.data.length,2); assert.equal(f.groups.data[1][1],'42');
assert.equal(f.s.processEnrollment_(event(3,3,'administrator','member',99),f.config),'suspended');
assert.equal(f.s.processEnrollment_(event(2,2,'member','administrator'),f.config),'stale');
assert.equal(f.groups.data[1][3],'SUSPENDED');
let spoof=event(4,4,'member','administrator'); spoof.my_chat_member.new_chat_member.user.id=999;
assert.equal(f.s.processEnrollment_(spoof,f.config),'ignored');
assert.equal(f.groups.data[1][3],'SUSPENDED');
let output=event(5,5,'left','administrator');output.my_chat_member.chat.id=-2;
assert.equal(f.s.processEnrollment_(output,f.config),'ignored');
// Unknown permissions stay pending and later verification can recover.
f=runtime();telegram(f);let actual=f.s.telegram_;
f.s.telegram_=(method,payload)=>{if(method==='getChatMember')throw Error('unavailable');return actual(method,payload);};
assert.equal(f.s.processEnrollment_(event(1,1,'left','administrator'),f.config),'pending');
f.s.telegram_=actual;f.s.processPendingEnrollments();assert.equal(f.groups.data[1][3],'ACTIVE');
// Nonmembers remain inactive even with invitation rights.
f=runtime();telegram(f);actual=f.s.telegram_;
f.s.telegram_=(method,p)=>method==='getChatMember'&&String(p.chat_id)==='-2'
 ? {result:{user:{id:Number(p.user_id)},status:'left'}}:actual(method,p);
assert.equal(f.s.processEnrollment_(event(1,1,'left','administrator'),f.config),'inactive');
// Migration preserves every legacy cell, terminal state, unknown state and publication ID.
f=runtime();delete f.props.SHARED_CATALOG_VERSION;
f.config.outputGroupsVerifiedFor='v2|-1|-2|'+'f'.repeat(64);
f.s.verifyCurrentBotMemberships_=()=>({});
f.groups.data.length=1;
for(const status of ['PUBLISH_UNKNOWN','PUBLISH_FAILED','PUBLISHED','PUBLISH_PENDING']) {
 const row=new Array(45).fill('');row[0]=status;row[10]='caption';row[13]='drive';
 row[f.F.PUBLISH_STATUS]=status;row[f.F.OUTPUT_MESSAGE_ID]=status==='PUBLISHED'?'72':'';
 f.records.data.push(row);
}
f.records.data[0]=Array.from(f.H.slice(0,45));
const old=JSON.stringify(f.records.data.slice(1));
assert.equal(f.s.migrateSharedCatalog().migrated,true);
assert.equal(JSON.stringify(f.records.data.slice(1).map(r=>r.slice(0,45))),old);
f.config.outputGroupsVerifiedFor=f.props.OUTPUT_GROUPS_VERIFIED_FOR;
assert.equal(f.s.migrateSharedCatalog().migrated,false);
assert.equal(f.groups.data.length,2);
assert.equal(JSON.stringify(f.records.data.slice(1).map(r=>r.slice(0,45))),old);
// Collision in appended columns refuses migration instead of overwriting data.
f=runtime();delete f.props.SHARED_CATALOG_VERSION;f.config.outputGroupsVerifiedFor='v2|-1|-2|'+'f'.repeat(64);
f.s.verifyCurrentBotMemberships_=()=>({});f.records.data[0]=Array.from(f.H.slice(0,45));
f.records.data[0][45]='unrelated';assert.throws(()=>f.s.migrateSharedCatalog(),/extension columns/);
assert.equal(f.props.SHARED_CATALOG_VERSION,undefined);
console.log('PASS: enrollment authority, initiator preservation, suspension, unknown retries and append-only migration');
