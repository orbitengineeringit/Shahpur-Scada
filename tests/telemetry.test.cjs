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
  const context = vm.createContext({exports,require:name=>name in stubs ? stubs[name] : (name.startsWith('@/') ? {} : require(name)),
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

test('history and alarms asset filters isolate OHT-1 and OHT-2 and purge legacy Mohgaon footprints',()=>{
  const historyModule = load('src/pages/HistoryPage.tsx', {
    '@/integrations/supabase/client': { supabase: {} },
    '@/contexts/ScadaContext': { useScada: () => ({ plantName: 'Shahpur SCADA' }) },
    '@/lib/errorLogger': {},
    '@/hooks/use-toast': { useToast: () => ({ toast: () => {} }) },
    '@/components/GlobalFilterBar': {},
    '@/components/StatusBar': () => null,
    '@/components/ui/button': {},
    '@/components/ui/card': {},
    '@/components/ui/table': {},
    '@/components/ui/select': {},
    '@/components/ui/switch': {},
    '@/components/ui/label': {},
    '@/components/ui/skeleton': {},
    '@/components/ui/progress': {},
    '@/components/ui/dialog': {},
    '@/lib/utils': { cn: (...args) => args.filter(Boolean).join(' ') },
    'exceljs': {},
    'date-fns': { format: () => '', startOfDay: d => d, endOfDay: d => d, subDays: d => d },
    'lucide-react': {},
  }).exports;

  const { isLegacyMohgaonTag, matchesSelectedAssets, applyAssetFiltersToQuery } = historyModule;

  // 1. Legacy Mohgaon tags must be rejected (OHT3, OHT4, OHT5, Ward No, Mohgaon, etc.)
  assert.equal(isLegacyMohgaonTag('OHT3-LT'), true);
  assert.equal(isLegacyMohgaonTag('OHT4-Flow'), true);
  assert.equal(isLegacyMohgaonTag('OHT5-Flow'), true);
  assert.equal(isLegacyMohgaonTag('OHT-3-PT'), true);
  assert.equal(isLegacyMohgaonTag('OHT-4-LT'), true);
  assert.equal(isLegacyMohgaonTag('OHT-5-LT'), true);
  assert.equal(isLegacyMohgaonTag('Ward No 14 Tank'), true);
  assert.equal(isLegacyMohgaonTag('Mohgaon Tank'), true);
  assert.equal(isLegacyMohgaonTag('MOH_OHT_001'), true);
  assert.equal(isLegacyMohgaonTag('OHT1-LT'), false);
  assert.equal(isLegacyMohgaonTag('OHT-1-PT'), false);
  assert.equal(isLegacyMohgaonTag('OHT2-PT'), false);
  assert.equal(isLegacyMohgaonTag('OHT-2-LT'), false);
  assert.equal(isLegacyMohgaonTag('INT-PT1'), false);

  // 2. 'all' assets filter accepts valid Shahpur tags but rejects legacy tags
  assert.equal(matchesSelectedAssets({ tag_id: 'OHT1-LT', section: 'oht' }, ['all']), true);
  assert.equal(matchesSelectedAssets({ tag_id: 'OHT2-LT', section: 'oht' }, ['all']), true);
  assert.equal(matchesSelectedAssets({ tag_id: 'INT-LT', section: 'intake' }, ['all']), true);
  assert.equal(matchesSelectedAssets({ tag_id: 'OHT3-LT', section: 'oht' }, ['all']), false);
  assert.equal(matchesSelectedAssets({ tag_id: 'OHT5-LT', section: 'oht' }, ['all']), false);
  assert.equal(matchesSelectedAssets({ tag_id: 'Ward Tank', section: 'oht' }, ['all']), false);

  // 3. 'oht-1' filter strictly matches ONLY OHT-1
  assert.equal(matchesSelectedAssets({ tag_id: 'OHT1-LT', section: 'oht' }, ['oht-1']), true);
  assert.equal(matchesSelectedAssets({ tag_id: 'OHT2-LT', section: 'oht' }, ['oht-1']), false);
  assert.equal(matchesSelectedAssets({ tag_id: 'INT-LT', section: 'intake' }, ['oht-1']), false);

  // 4. 'oht-2' filter strictly matches ONLY OHT-2
  assert.equal(matchesSelectedAssets({ tag_id: 'OHT2-LT', section: 'oht' }, ['oht-2']), true);
  assert.equal(matchesSelectedAssets({ tag_id: 'OHT1-LT', section: 'oht' }, ['oht-2']), false);

  // 5. Multi-selection: 'intake' + 'oht-1' matches Intake & OHT-1, excludes OHT-2 and WTP
  assert.equal(matchesSelectedAssets({ tag_id: 'INT-LT', section: 'intake' }, ['intake', 'oht-1']), true);
  assert.equal(matchesSelectedAssets({ tag_id: 'OHT1-Flow', section: 'oht' }, ['intake', 'oht-1']), true);
  assert.equal(matchesSelectedAssets({ tag_id: 'OHT2-Flow', section: 'oht' }, ['intake', 'oht-1']), false);
  assert.equal(matchesSelectedAssets({ tag_id: 'WTP-PT1', section: 'wtp' }, ['intake', 'oht-1']), false);

  // 6. SQL Query Builder: applyAssetFiltersToQuery correctly isolates assets
  const createMockQuery = () => {
    const ops = [];
    return {
      ops,
      eq: (k, v) => { ops.push({ op: 'eq', k, v }); return createMockQueryProxy(ops); },
      in: (k, v) => { ops.push({ op: 'in', k, v }); return createMockQueryProxy(ops); },
      like: (k, v) => { ops.push({ op: 'like', k, v }); return createMockQueryProxy(ops); },
      or: (cond) => { ops.push({ op: 'or', cond }); return createMockQueryProxy(ops); },
    };
  };
  const createMockQueryProxy = (ops) => ({
    ops,
    eq: (k, v) => { ops.push({ op: 'eq', k, v }); return createMockQueryProxy(ops); },
    in: (k, v) => { ops.push({ op: 'in', k, v }); return createMockQueryProxy(ops); },
    like: (k, v) => { ops.push({ op: 'like', k, v }); return createMockQueryProxy(ops); },
    or: (cond) => { ops.push({ op: 'or', cond }); return createMockQueryProxy(ops); },
  });

  const serializeOps = (q) => JSON.parse(JSON.stringify(q.ops));

  // Test SQL filters for single assets
  const qAll = applyAssetFiltersToQuery(createMockQuery(), ['all']);
  assert.equal(qAll.ops.length, 0); // 'all' requires no restrictive asset filter

  const qIntake = applyAssetFiltersToQuery(createMockQuery(), ['intake']);
  assert.deepEqual(serializeOps(qIntake), [{ op: 'eq', k: 'section', v: 'intake' }]);

  const qWtp = applyAssetFiltersToQuery(createMockQuery(), ['wtp']);
  assert.deepEqual(serializeOps(qWtp), [{ op: 'eq', k: 'section', v: 'wtp' }]);

  const qOht1 = applyAssetFiltersToQuery(createMockQuery(), ['oht-1']);
  assert.deepEqual(serializeOps(qOht1), [{ op: 'like', k: 'tag_id', v: 'OHT1-%' }]);

  const qOht2 = applyAssetFiltersToQuery(createMockQuery(), ['oht-2']);
  assert.deepEqual(serializeOps(qOht2), [{ op: 'like', k: 'tag_id', v: 'OHT2-%' }]);

  // Test SQL filters for multi-asset combinations
  const qIntakeOht1 = applyAssetFiltersToQuery(createMockQuery(), ['intake', 'oht-1']);
  assert.deepEqual(serializeOps(qIntakeOht1), [{ op: 'or', cond: 'section.eq.intake,tag_id.like.OHT1-%' }]);

  const qIntakeWtp = applyAssetFiltersToQuery(createMockQuery(), ['intake', 'wtp']);
  assert.deepEqual(serializeOps(qIntakeWtp), [{ op: 'in', k: 'section', v: ['intake', 'wtp'] }]);

  const qOht1Oht2 = applyAssetFiltersToQuery(createMockQuery(), ['oht-1', 'oht-2']);
  assert.deepEqual(serializeOps(qOht1Oht2), [{ op: 'or', cond: 'tag_id.like.OHT1-%,tag_id.like.OHT2-%' }]);

  const qIntakeWtpOht1 = applyAssetFiltersToQuery(createMockQuery(), ['intake', 'wtp', 'oht-1']);
  assert.deepEqual(serializeOps(qIntakeWtpOht1), [{ op: 'or', cond: 'section.eq.intake,section.eq.wtp,tag_id.like.OHT1-%' }]);

  // 7. Alarms: isLegacyMohgaonAlarm filters out legacy alarms
  const alarmModule = load('src/contexts/AlarmContext.tsx', {
    '@/integrations/supabase/client': { supabase: {} },
    '@/lib/errorLogger': {},
    'sonner': { toast: {} },
    'react': { createContext: () => ({}), useContext: () => ({}), useState: () => [null, () => {}], useEffect: () => {}, useCallback: fn => fn, useRef: () => ({ current: new Map() }) },
  }).exports;
  const { isLegacyMohgaonAlarm } = alarmModule;

  assert.equal(isLegacyMohgaonAlarm({ tagId: 'OHT3-LT', label: 'Tank High' }), true);
  assert.equal(isLegacyMohgaonAlarm({ tagId: 'OHT4-Flow', label: 'Flow meter' }), true);
  assert.equal(isLegacyMohgaonAlarm({ tagId: 'OHT5-LT', label: 'Tank Level' }), true);
  assert.equal(isLegacyMohgaonAlarm({ tagId: 'INT-PT1', label: 'Ward No 14 Tank Level' }), true);
  assert.equal(isLegacyMohgaonAlarm({ tagId: 'INT-PT1', label: 'Mohgaon Station Pump' }), true);
  assert.equal(isLegacyMohgaonAlarm({ tagId: 'OHT1-LT', label: 'Bus Station OHT Level' }), false);
  assert.equal(isLegacyMohgaonAlarm({ tagId: 'OHT2-PT', label: 'OHT-2 Pressure' }), false);
  assert.equal(isLegacyMohgaonAlarm({ tagId: 'INT-PT1', label: 'VT Pump 1' }), false);
});

test('Garud GIS sync enforces uncommissioned station omission and MQTT freshness requirements',()=>{
  const gisCode = fs.readFileSync('supabase/functions/gis-sync/index.ts', 'utf8');

  // Verify WTP and OHT-2 are marked as non-commissioned and excluded
  assert.match(gisCode, /skippedStations\.push\("oht2"\)/);
  assert.match(gisCode, /skippedStations\.push\("wtp"\)/);
  assert.doesNotMatch(gisCode, /freshOhts\.push\(.*OHT2/);

  // Verify Intake and OHT-1 transmit only if fresh MQTT data received
  assert.match(gisCode, /if\s*\(hasFreshData\(intakeIds\)\)/);
  assert.match(gisCode, /if\s*\(hasFreshData\(oht1Ids\)\)/);

  // Verify 0.00 fallback for uncalibrated / zero readings
  assert.match(gisCode, /v\(TAG\.intake\.lt\)\s*\?\?\s*0\.0/);
  assert.match(gisCode, /v\(oht1Tags\.flow\)\s*\?\?\s*0\.0/);

  // Verify when no fresh data arrived from MQTT, POST to Garud is skipped with 204
  assert.match(gisCode, /if\s*\(includedStations\.length\s*===\s*0\)/);
  assert.match(gisCode, /response_status:\s*204/);

  // Verify GisSyncStatus component rejects false-positive SENT when payload is null or status 204
  const gisUiCode = fs.readFileSync('src/components/GisSyncStatus.tsx', 'utf8');
  assert.match(gisUiCode, /if\s*\(!payload\s*\|\|\s*typeof\s*payload\s*!==\s*'object'\)\s*return\s*\{\s*included:\s*false/);
  assert.match(gisUiCode, /isSkippedStatus\s*=\s*lastStatus\s*===\s*204/);
  assert.match(gisUiCode, /\(success\s*&&\s*included\)\s*\?\s*'SENT'/);
});

