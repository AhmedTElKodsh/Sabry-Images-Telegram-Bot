const assert = require('assert'), fs = require('fs'), vm = require('vm');
function runtime() {
  const state = { console, Date, Set }; vm.createContext(state);
  vm.runInContext(fs.readFileSync('apps-script/Code.gs', 'utf8'), state);
  const F = vm.runInContext('RECORD_FIELD', state), H = vm.runInContext('RECORD_HEADERS', state);
  const props = { SHARED_CATALOG_VERSION: '3' };
  state.PropertiesService = { getScriptProperties: () => ({ getProperty: k => props[k] || '',
    getProperties: () => ({...props}), setProperties: values => {Object.assign(props,values);}, setProperty: (k,v) => {props[k]=v;}, deleteProperty: k => {delete props[k];} }) };
  let uuid = 0;
  state.Utilities = { getUuid: () => 'claim-' + ++uuid, formatDate: d => d.toISOString() };
  let held = false;
  const lock = { tryLock: () => { if (held) return false; held=true; return true; },
    releaseLock: () => { assert.ok(held, 'release without lock'); held=false; } };
  state.LockService = { getScriptLock: () => lock };
  state.reactSaved_ = () => {};
  const bytes = [255,216,255,217];
  state.Utilities.DigestAlgorithm = { SHA_256: 'sha256' };
  state.Utilities.computeDigest = (algorithm,data) => Array.from(require('crypto').createHash('sha256').update(Buffer.from(data)).digest());
  state.DriveApp = { getFileById: () => ({isTrashed:()=>false,getBlob:()=>({
    getBytes:()=>bytes, getContentType:()=> 'image/jpeg' })}) };
  function sheet(headers) {
    const data = [Array.from(headers)];
    return {data, getLastRow: () => data.length, getMaxColumns: () => 80,
      insertColumnsAfter() {}, setFrozenRows() {}, autoResizeColumns() {},
      appendRow: row => data.push(Array.from(row)), getRange: (r,c,n=1,m=1) => {
        const range = { getValues: () => Array.from({length:n}, (_,i) =>
          Array.from({length:m}, (_,j) => data[r+i-1]?.[c+j-1] ?? '')),
          setValues: values => { values.forEach((row,i) => {data[r+i-1] ||= [];
            row.forEach((v,j) => { data[r+i-1][c+j-1]=v; });}); return range; },
          getValue: () => data[r-1]?.[c-1] ?? '', setValue: v => {data[r-1][c-1]=v;},
          setFontWeight: () => range, setBackground: () => range, setFontColor: () => range };
        return range;
      }};
  }
  const records = sheet(H), events = sheet(vm.runInContext('EVENT_HEADERS', state)),
    groups = sheet(vm.runInContext('GROUP_HEADERS', state)),
    embeddings = sheet(vm.runInContext('EMBEDDING_HEADERS', state)),
    inbox = sheet(['update_id','payload_json','status','claim_id','lease_until_utc',
      'attempts','last_error','received_at_utc','completed_at_utc']);
  const spreadsheet = { getSheetByName: n => ({Records:records, Events:events, Groups:groups,
      Embeddings:embeddings, Inbox:inbox}[n]),
    insertSheet: () => {throw Error('unexpected sheet');} };
  state.SpreadsheetApp = { openById: () => spreadsheet };
  state.findRecordRow_ = (s,id) => {const i=s.data.findIndex(r=>r[0]===id); return i<0?0:i+1;};
  state.findEventRow_ = () => null;
  state.hasUpdate_ = (s,id) => s.data.slice(1).some(r=>r[0]===String(id));
  const config = { spreadsheetId:'sheet', botToken:'token', outputChatId:'-2', allowedChatId:'-1',
    botTokenFingerprint:'f'.repeat(64), outputGroupsVerifiedFor:'v3|-2|'+'f'.repeat(64),
    outputPublishingEnabled:true, groqTaggingEnabled:true, groqApiKey:'key',
    groqTaggingMode:'NEW_PHOTOS_ONLY', groqTaggingCutoff:'2000-01-01T00:00:00.000Z' };
  state.getConfig_ = () => config;
  const message = { chat:{id:-1,type:'supergroup'}, message_id:10, date:1700000000,
    from:{id:42,is_bot:false}, caption:'original book', photo:[{file_id:'photo',file_unique_id:'unique',width:1,height:1}] };
  const archive = { id:'drive', url:'drive-url', mimeType:'image/jpeg', byteSize:4,
    sha256:require('crypto').createHash('sha256').update(Buffer.from([255,216,255,217])).digest('hex'), completedAtUtc:new Date().toISOString() };
  // Worker preparation is provider-free. Preserve older focused tests that replace storePhoto_
  // while the production worker now creates/reuses the digest object only inside its save lock.
  const productionStore = state.storePhoto_, productionCreate = state.createOrReusePreparedArchive_;
  state.prepareCanonicalPhoto_ = (photo, config) => state.storePhoto_ !== productionStore
    ? state.storePhoto_(photo, message, 'fixture-record', config)
    : { blob:{setName(){return this;}}, mimeType:archive.mimeType,
      byteSize:archive.byteSize, sha256:archive.sha256 };
  state.createOrReusePreparedArchive_ = prepared => prepared && prepared.id ? prepared : archive;
  return {s:state,F,H,props,records,events,groups,embeddings,inbox,spreadsheet,config,message,archive,sheet,lock,
    productionCreate};
}
module.exports = {runtime};
