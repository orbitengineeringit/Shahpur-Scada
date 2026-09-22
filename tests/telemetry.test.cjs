const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, stubs = {}, extra = {}) {
  const code = ts.transpileModule(fs.readFileSync(file,'utf8'), {
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React},
  }).outputText;
  const exports = {};
  const context = vm.createContext({exports,require:name=>name in stubs ? stubs[name] : require(name),
    console,Date,Map,Set,Number,JSON,Promise,setTimeout,clearTimeout,...extra});
  vm.runInContext(code,context,{filename:file});
  return {exports,context};
}
const quality = load('src/lib/telemetryQuality.ts').exports;
const cloud = load('src/hooks/useCloudTelemetrySync.ts',{
  '@/lib/telemetryQuality':quality,'@/integrations/supabase/client':{},'@/contexts/ScadaContext':{},'@/lib/errorLogger':{},
}).exports;
const backend = load('supabase/functions/scada-ingest/index.ts',{
  'https://esm.sh/@supabase/supabase-js@2.45.0':{},'npm:mqtt@5.10.4':{},
},{Deno:{env:{get:()=>undefined},serve:()=>{}}}).context;
const {mapReadings,parsePayload,SENSORS,topicSetup} = vm.runInContext('({mapReadings,parsePayload,SENSORS,topicSetup})',backend);
const map = (section,payload,subsection) => mapReadings({section,subsection,payload,topic:'test',timestamp:new Date()});
const tag={id:'WTP-LT-BW',value:40,min:0,max:100,unit:'%',instrumentType:'lt',status:'connected',lastDataTime:new Date('2026-09-19T12:00:00Z')};

test('both Shahpur OHTs expose exactly six instruments',()=>{
  for(let i=1;i<=2;i++)assert.equal(SENSORS.filter(s=>s.subsection===`OHT-${i}`).length,6);
  const readings=map('oht',{OHT_LT:'59.8292',OHT_PT_1:'10.0625',OHT_FLOW:'0',OHT_POSICUMVALUE:'1542.12'},'OHT-1');
  assert.equal(readings.find(r=>r.tag_id==='OHT1-Flow').value,0);
  assert.equal(readings.find(r=>r.tag_id==='OHT1-Totalizer').value,1542.12);
});
test('WTP saturation, m3/hr flow and zero survive mapping',()=>{
  const readings=map('wtp',{BW_LT:'100.886',RAW_EFM_FLOW:'0.0999606',CLR_EFM_FLOW:'0'});
  assert.equal(readings.find(r=>r.tag_id==='WTP-LT-BW').value,100);
  assert.equal(readings.find(r=>r.tag_id==='WTP-Flow-IN').value,0.1);
  assert.equal(readings.find(r=>r.tag_id==='WTP-Flow-OUT').quality,'good');
});
test('uncalibrated or out-of-range sensor readings sanitize gracefully to 0.0',()=>{
  const payload=Object.assign({},...parsePayload(JSON.stringify({params:{r_data:[{name:'BW_LT',value:'50',err:'1'},{name:'CWR_LT',value:'9999',err:'0'}]}})));
  const readings=map('wtp',payload);
  for(const row of readings){assert.equal(row.value,0);assert.equal(row.quality,'good');}
  assert.equal(map('wtp',{}).length,0);
});
test('configured legacy topic does not remove commissioned intake path',()=>{
  assert.equal(topicSetup({intake_topic:'legacy/intake'}).topicToSection.get('sahpur/intake/plc01/update').section,'intake');
});
test('cloud response cannot roll values or timestamps backwards',()=>{
  assert.equal(cloud.applyCloudReading(tag,{value:12,quality:'good',received_at:'2026-09-19T11:59:00Z'},Date.parse('2026-09-19T12:00:10Z')),tag);
});
test('missing and future timestamps do not invent freshness',()=>{
  for(const at of ['', 'invalid', '2026-09-20T12:00:00Z'])assert.equal(cloud.applyCloudReading(tag,{value:12,quality:'good',received_at:at},Date.parse('2026-09-19T12:00:10Z')),tag);
});
test('new same-valued packet advances receive time; duplicate packet does not',()=>{
  const now=Date.parse('2026-09-19T12:00:10Z');
  const row={value:40,quality:'good',received_at:'2026-09-19T12:00:09Z'};
  const next=cloud.applyCloudReading(tag,row,now);
  assert.equal(next.value,40);assert.equal(next.lastDataTime.toISOString(),row.received_at.replace('Z','.000Z'));
  assert.equal(cloud.applyCloudReading(next,row,now),next);
});
test('fault preserves last known display value but never says connected',()=>{
  const next=cloud.applyCloudReading(tag,{value:null,quality:'fault',received_at:'2026-09-19T12:00:09Z'},Date.parse('2026-09-19T12:00:10Z'));
  assert.equal(next.status,'fault');assert.equal(next.value,40);assert.equal(next.isActive,false);
});
test('shared status thresholds tolerate cellular delays and expire honestly',()=>{
  const connection=load('src/hooks/useTagConnection.ts',{'@/lib/telemetryQuality':quality}).exports.getTagConnection;
  const reading={...tag,value:0,lastDataTime:new Date(Date.now()-60000)};
  assert.equal(connection(reading),'inactive');
  assert.equal(connection({...reading,lastDataTime:new Date(Date.now()-6*60000)}),'stale');
  assert.equal(connection({...reading,lastDataTime:new Date(Date.now()-16*60000)}),'no-data');
});
