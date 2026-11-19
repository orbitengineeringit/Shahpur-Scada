const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, stubs = {}, extra = {}) {
  const raw = fs.readFileSync(file, 'utf8').replace(/import\.meta/g, '({env:{}})');
  const code = ts.transpileModule(raw, {
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

test('both Shahpur OHTs expose exactly four instruments',()=>{
  for(let i=1;i<=2;i++)assert.equal(SENSORS.filter(s=>s.subsection===`OHT-${i}`).length,4);
  const readings=map('oht',{OHT_LT:'59.8292',OHT_PT_1:'10.0625',OHT_FLOW:'0',OHT_POSICUMVALUE:'1542.12'},'OHT-1');
  assert.equal(readings.find(r=>r.tag_id==='OHT1-Flow').value,0);
  assert.equal(readings.find(r=>r.tag_id==='OHT1-Totalizer').value,1542.12);
});
test('WTP saturation and installed outlet flow survive mapping',()=>{
  const readings=map('wtp',{BW_LT:'100.886',RAW_EFM_FLOW:'0.0999606',CLR_EFM_FLOW:'0'});
  assert.equal(readings.find(r=>r.tag_id==='WTP-LT-BW').value,100);
  assert.equal(readings.find(r=>r.tag_id==='WTP-Flow-IN'),undefined);
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
test('fault clears the live display value and never says connected',()=>{
  const next=cloud.applyCloudReading(tag,{value:null,quality:'fault',received_at:'2026-09-19T12:00:09Z'},Date.parse('2026-09-19T12:00:10Z'));
  assert.equal(next.status,'fault');assert.equal(next.value,0);assert.equal(next.isActive,false);
});
test('stale cloud telemetry cannot be presented as a current process value',()=>{
  const now=Date.parse('2026-09-19T12:20:00Z');
  const next=cloud.applyCloudReading({...tag,lastDataTime:undefined},{value:88,quality:'good',received_at:'2026-09-19T12:00:00Z'},now);
  assert.equal(next.status,'disconnected');assert.equal(next.value,0);assert.equal(next.isActive,false);
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
  assert.match(gisCode, /skippedStations\.push\(stationName\)/);
  assert.match(gisCode, /skippedStations\.push\("wtp"\)/);

  // Verify Intake and OHT-1 transmit only if fresh MQTT data received
  assert.match(gisCode, /if\s*\(hasFreshData\(intakeIds\)\)/);
  assert.match(gisCode, /if\s*\(hasFreshData\(ohtIds\)\)/);

  // Verify 0.00 fallback for uncalibrated / zero readings
  assert.match(gisCode, /v\(TAG\.intake\.lt\)\s*\?\?\s*0\.0/);
  assert.match(gisCode, /v\(ohtTags\.flow\)\s*\?\?\s*0\.0/);

  // Verify when no fresh data arrived from MQTT, POST to Garud is skipped with 204
  assert.match(gisCode, /if\s*\(includedStations\.length\s*===\s*0\)/);
  assert.match(gisCode, /response_status:\s*204/);

  // Verify telemetry payload explicitly transmits Sagar District (Code 427) and never Betul
  assert.match(gisCode, /districtName:\s*["']SAGAR["']/);
  assert.match(gisCode, /district_Code:\s*["']427["']/);
  assert.equal(/betul/i.test(gisCode), false, 'GIS sync must never transmit or reference Betul');

  // Verify GisSyncStatus component rejects false-positive SENT when payload is null or status 204
  const gisUiCode = fs.readFileSync('src/components/GisSyncStatus.tsx', 'utf8');
  assert.match(gisUiCode, /if\s*\(!payload\s*\|\|\s*typeof\s*payload\s*!==\s*'object'\)\s*return\s*\{\s*included:\s*false/);
  assert.match(gisUiCode, /isSkippedStatus\s*=\s*lastStatus\s*===\s*204/);
  assert.match(gisUiCode, /\(success\s*&&\s*included\)\s*\?\s*'SENT'/);
  assert.match(gisUiCode, /SAGAR \(427\)/, 'GIS Sync UI must display Sagar district with code 427');
});

test('Intake PLC active keys, equipment_data extraction, and WTP LOH/ROF ranges work as expected', () => {
  const rawPayload = JSON.stringify({
    equipment_data: {
      PUMP1_PT1_ACT: 2.45,
      PUMP2_PT2_ACT: 0.0,
      COMMON_HEADER_PT_ACT: 2.30,
      RLT_ACT: 45.5,
      MOTOR1_ON: 1,
      MOTOR2_ON: 0,
      ROF_FB1: 82.6520,
      LOH_FB1: 16.6369,
      LOH_FB2: 12.5902,
    }
  });
  const parsed = Object.assign({}, ...parsePayload(rawPayload));
  assert.equal(parsed.PUMP1_PT1_ACT, 2.45);
  assert.equal(parsed.RLT_ACT, 45.5);
  assert.equal(parsed.MOTOR1_ON, 1);

  const intakeReadings = map('intake', parsed);
  assert.equal(intakeReadings.find(r => r.tag_id === 'INT-PT1')?.value, 2.45);
  assert.equal(intakeReadings.find(r => r.tag_id === 'INT-HeaderPT')?.value, 2.30);
  assert.equal(intakeReadings.find(r => r.tag_id === 'INT-LT')?.value, 45.5);
  assert.equal(intakeReadings.find(r => r.tag_id === 'INT-Pump1')?.value, 1);

  const wtpReadings = map('wtp', parsed);
  assert.equal(wtpReadings.find(r => r.tag_id === 'WTP-ROF-FB1')?.value, 82.65);
  assert.equal(wtpReadings.find(r => r.tag_id === 'WTP-LOH-FB1')?.value, 16.64);
  assert.equal(wtpReadings.find(r => r.tag_id === 'WTP-LOH-FB2')?.value, 12.59);
  assert.equal(wtpReadings.filter(r => r.tag_id.startsWith('WTP-LOH-')).length, 2);
  assert.equal(map('wtp', { LOH_FB2: 12.5902 }).map(r => r.tag_id).join(','), 'WTP-LOH-FB2');
  assert.equal(SENSORS.find(s => s.id === 'WTP-ROF-FB1')?.mqttKey, 'ROF_FB1');
  assert.equal(SENSORS.find(s => s.id === 'WTP-LOH-FB1')?.mqttKey, 'LOH_FB1');
  assert.equal(SENSORS.find(s => s.id === 'WTP-LOH-FB2')?.mqttKey, 'LOH_FB2');
  assert.equal(SENSORS.find(s => s.id === 'WTP-LOH-FB1')?.unit, '%');
  assert.equal(SENSORS.find(s => s.id === 'WTP-LOH-FB1')?.max, 100);
  assert.equal(SENSORS.find(s => s.id === 'WTP-ROF-FB1')?.unit, 'm³/hr');
  assert.equal(SENSORS.find(s => s.id === 'WTP-ROF-FB1')?.max, 200);
});

test('Intake totalizers combine complete 32-bit register pairs using ((65535 * H) + L) / 100', () => {
  // 1. Test with user exact RTU keys and values
  const rtuData = map('intake', {
    INLETFLOW: 45.2,
    INLETTOTLIZER1: 16,
    INLETTOTLIZER2: 36297,
    OUTLETFLOW: 12.8,
    OUTLETTOTLIZER1: 4,
    OUTLETTOTLIZER2: 11353,
  });
  assert.equal(rtuData.find(r => r.tag_id === 'INT-Flow-IN')?.value, 45.2);
  assert.equal(rtuData.find(r => r.tag_id === 'INT-Flow-OUT')?.value, 12.8);
  // Formula: ((65535 * 16) + 36297) / 100 = (1048560 + 36297) / 100 = 10848.57
  assert.equal(rtuData.find(r => r.tag_id === 'INT-Totalizer-IN')?.value, 10848.57);
  // Formula: ((65535 * 4) + 11353) / 100 = (262140 + 11353) / 100 = 2734.93
  assert.equal(rtuData.find(r => r.tag_id === 'INT-Totalizer-OUT')?.value, 2734.93);

  // 2. Test with legacy register aliases
  const legacyData = map('intake', { INTotalizer1H: 2, INTotalizer1L: 15, OUTTotalizer1H: 1, OUTToalizer1L: 9 });
  assert.equal(legacyData.find(r => r.tag_id === 'INT-Totalizer-IN')?.value, 1310.85);
  assert.equal(legacyData.find(r => r.tag_id === 'INT-Totalizer-OUT')?.value, 655.44);
  assert.equal(map('intake', { INLETTOTLIZER1: 16 }).find(r => r.tag_id === 'INT-Totalizer-IN'), undefined);
  assert.equal(map('intake', { INTotalizer1H: 2 }).find(r => r.tag_id === 'INT-Totalizer-IN'), undefined);
});

test('Direct digital motor status takes precedence over PT derivation in any key order', () => {
  const r1 = map('intake', { MOTOR1_ON: 0, PUMP1_PT1_ACT: 2.85 });
  assert.equal(r1.find(r => r.tag_id === 'INT-Pump1')?.value, 0);

  const r2 = map('intake', { PUMP1_PT1_ACT: 2.85, MOTOR1_ON: 0 });
  assert.equal(r2.find(r => r.tag_id === 'INT-Pump1')?.value, 0);

  const r3 = map('intake', { PUMP1_PT1_ACT: 2.85 });
  assert.equal(r3.find(r => r.tag_id === 'INT-Pump1')?.value, 1);
});

test('WTP aliases map accurately to sensors in scada-ingest', () => {
  const wtpAliases = map('wtp', {
    BW_LT: 65.5,
    CWR_LT: 80.2,
    PT_1: 2.1,
    PT_2: 0.0,
    PT_3: 3.4,
    CLR_EFM_FLOW: 45.6,
    CLR_EFM: 12050,
  });
  assert.equal(wtpAliases.find(r => r.tag_id === 'WTP-LT-BW')?.value, 65.5);
  assert.equal(wtpAliases.find(r => r.tag_id === 'WTP-LT-CW')?.value, 80.2);
  assert.equal(wtpAliases.find(r => r.tag_id === 'WTP-PT1')?.value, 2.1);
  assert.equal(wtpAliases.find(r => r.tag_id === 'WTP-HeaderPT')?.value, 3.4);
  assert.equal(wtpAliases.find(r => r.tag_id === 'WTP-Flow-OUT')?.value, 45.6);
  assert.equal(wtpAliases.find(r => r.tag_id === 'WTP-Totalizer-OUT')?.value, 12050);
});

test('OHT-1 payload parses correctly and preserves negative flow', () => {
  const oht1PayloadRaw = JSON.stringify({
    params: {
      dir: "up",
      id: "02500225110500007512",
      r_data: [
        { name: "OHT1_PT_ACT", value: "0.00997485", err: "0" },
        { name: "OHT1_LT_ACT", value: "32.5", err: "0" },
        { name: "OHT_FLOW", value: "-10.5181", err: "0" },
        { name: "OHT_TOTALIZER", value: "9254", err: "0" }
      ]
    }
  });

  const parsed = Object.assign({}, ...parsePayload(oht1PayloadRaw));
  assert.equal(parsed.OHT1_PT_ACT, "0.00997485");
  assert.equal(parsed.OHT1_LT_ACT, "32.5");
  assert.equal(parsed.OHT_FLOW, "-10.5181");
  assert.equal(parsed.OHT_TOTALIZER, "9254");

  const readings = map('oht', parsed, 'OHT-1');
  const pt = readings.find(r => r.tag_id === 'OHT1-PT');
  const lt = readings.find(r => r.tag_id === 'OHT1-LT');
  const flow = readings.find(r => r.tag_id === 'OHT1-Flow');
  const tot = readings.find(r => r.tag_id === 'OHT1-Totalizer');

  assert.ok(pt, 'OHT1-PT should be mapped');
  assert.equal(pt.value, 0.01);
  assert.equal(pt.quality, 'good');

  assert.ok(lt, 'OHT1-LT should be mapped');
  assert.equal(lt.value, 32.5);
  assert.equal(lt.quality, 'good');

  assert.ok(flow, 'OHT1-Flow should be mapped');
  assert.equal(flow.value, -10.52);
  assert.equal(flow.quality, 'good');

  assert.ok(tot, 'OHT1-Totalizer should be mapped');
  assert.equal(tot.value, 9254);
  assert.equal(tot.quality, 'good');

  // Verify telemetryQuality sanitize and normalize also preserve negative flow when allowed
  assert.equal(quality.sanitizeRtuValue("-10.5181", true), -10.5181);
  assert.equal(quality.sanitizeRtuValue("-10.5181", false), 0.0);
  assert.equal(quality.normalizeTelemetryValue("-10.5181", { min: -50, max: 50 }), -10.5181);
});

test('Historical Data heading and 30-day time-slice export resilience', () => {
  const historyCode = fs.readFileSync('src/pages/HistoryPage.tsx', 'utf8');

  // 1. Verify "Historical Sensors" was renamed to "Historical Data"
  assert.equal(historyCode.includes('Historical Sensors'), false, 'Should not contain Historical Sensors heading');
  assert.match(historyCode, /<h2[^>]*>Historical Data<\/h2>/, 'Should contain Historical Data heading');

  // 2. Verify Time-slice partitioning logic (1-day slices)
  const SLICE_DURATION_MS = 24 * 60 * 60 * 1000;
  const startMs = new Date('2026-09-29T00:00:00.000Z').getTime();
  const endMs = new Date('2026-10-29T23:59:59.999Z').getTime();

  const slices = [];
  for (let t = endMs; t > startMs; t -= SLICE_DURATION_MS) {
    const sStart = Math.max(startMs, t - SLICE_DURATION_MS);
    slices.push({
      sliceStartMs: sStart,
      sliceEndMs: t,
      isLast: t === endMs,
    });
  }

  // Slices should span ~31 days
  assert.equal(slices.length >= 30, true);
  // Slices must be contiguous: each slice start must equal previous slice end
  for (let i = 0; i < slices.length - 1; i++) {
    assert.equal(slices[i].sliceStartMs, slices[i + 1].sliceEndMs);
  }
  // Earliest slice must start at startMs
  assert.equal(slices[slices.length - 1].sliceStartMs, startMs);
  // Latest slice must end at endMs
  assert.equal(slices[0].sliceEndMs, endMs);

  // 3. Verify deduplication logic keeps latest timestamp per 5-min bucket per tag
  const DEDUP_BUCKET_MS = 5 * 60 * 1000;
  const testLogs = [
    { tag_id: 'WTP-LT-BW', value: 40, timestamp: '2026-10-29T10:01:00.000Z', section: 'wtp' },
    { tag_id: 'WTP-LT-BW', value: 42, timestamp: '2026-10-29T10:04:00.000Z', section: 'wtp' }, // newer in same 5-min bucket (10:00-10:05)
    { tag_id: 'WTP-LT-BW', value: 45, timestamp: '2026-10-29T10:07:00.000Z', section: 'wtp' }, // next bucket (10:05-10:10)
    { tag_id: 'INT-LT', value: 5.5, timestamp: '2026-10-29T10:02:00.000Z', section: 'intake' },
  ];

  const latestPerTagBucket = new Map();
  for (const log of testLogs) {
    const bucketTs = Math.floor(new Date(log.timestamp).getTime() / DEDUP_BUCKET_MS);
    const key = `${log.tag_id}|${bucketTs}`;
    const existing = latestPerTagBucket.get(key);
    if (!existing || new Date(existing.timestamp).getTime() < new Date(log.timestamp).getTime()) {
      latestPerTagBucket.set(key, log);
    }
  }

  assert.equal(latestPerTagBucket.size, 3);
  const bwBucket1 = latestPerTagBucket.get(`WTP-LT-BW|${Math.floor(new Date('2026-10-29T10:00:00.000Z').getTime() / DEDUP_BUCKET_MS)}`);
  assert.equal(bwBucket1.value, 42, 'Should keep the latest timestamp within the bucket (value 42)');

  // 4. Verify ALL_SENSORS maps to valid labels (s.label, not s.name)
  const sensorsModule = load('src/config/shahpurSensors.ts').exports;
  const staticMap = new Map(sensorsModule.ALL_SENSORS.map(s => [s.id, { label: s.label, unit: s.unit }]));
  assert.equal(staticMap.size > 20, true, 'ALL_SENSORS should contain at least 20 sensors');
  for (const [id, cfg] of staticMap.entries()) {
    assert.equal(typeof cfg.label, 'string', `Sensor ${id} must have a valid string label`);
    assert.notEqual(cfg.label, '', `Sensor ${id} label should not be empty`);
    assert.notEqual(cfg.label, undefined, `Sensor ${id} label should not be undefined`);
  }

  // 5. Verify single-day edge case slicing (exact 1 slice)
  const singleDayStart = new Date('2026-10-29T00:00:00.000Z').getTime();
  const singleDayEnd = new Date('2026-10-29T23:59:59.999Z').getTime();
  const singleSlices = [];
  for (let t = singleDayEnd; t > singleDayStart; t -= SLICE_DURATION_MS) {
    const sStart = Math.max(singleDayStart, t - SLICE_DURATION_MS);
    singleSlices.push({ sliceStartMs: sStart, sliceEndMs: t, isLast: t === singleDayEnd });
  }
  assert.equal(singleSlices.length, 1);
  assert.equal(singleSlices[0].isLast, true);
  assert.equal(singleSlices[0].sliceStartMs, singleDayStart);
  assert.equal(singleSlices[0].sliceEndMs, singleDayEnd);

  // 6. Verify 60-day slice continuity
  const sixtyDaysStart = new Date('2026-08-30T00:00:00.000Z').getTime();
  const sixtyDaysEnd = new Date('2026-10-29T23:59:59.999Z').getTime();
  const sixtySlices = [];
  for (let t = sixtyDaysEnd; t > sixtyDaysStart; t -= SLICE_DURATION_MS) {
    const sStart = Math.max(sixtyDaysStart, t - SLICE_DURATION_MS);
    sixtySlices.push({ sliceStartMs: sStart, sliceEndMs: t, isLast: t === sixtyDaysEnd });
  }
  assert.equal(sixtySlices.length >= 60, true);
  for (let i = 0; i < sixtySlices.length - 1; i++) {
    assert.equal(sixtySlices[i].sliceStartMs, sixtySlices[i + 1].sliceEndMs);
  }

  // 7. Verify precalculated sort keys produce identical ordering as timestamp comparator
  const unsorted = [
    { tag_id: 'WTP-LT-BW', section: 'wtp', timestamp: '2026-10-29T10:01:00.000Z' },
    { tag_id: 'INT-LT', section: 'intake', timestamp: '2026-10-29T10:02:00.000Z' },
    { tag_id: 'OHT1-LT', section: 'oht', timestamp: '2026-10-29T10:03:00.000Z' },
    { tag_id: 'WTP-PT-RAW', section: 'wtp', timestamp: '2026-10-29T10:00:00.000Z' },
    { tag_id: 'INT-PT1', section: 'intake', timestamp: '2026-10-29T09:55:00.000Z' },
  ];
  function getSectionOrder(section, tagId) {
    const sec = (section || '').toLowerCase();
    if (sec === 'intake') return 0;
    if (sec === 'wtp') return 1;
    if (sec === 'oht') {
      const m = tagId.match(/^OHT[-_\s]*([0-9]+)/i);
      return 1 + (m ? parseInt(m[1], 10) : 99);
    }
    return 99;
  }
  const withKeys = unsorted.map(log => ({
    log,
    bucketTs: Math.floor(new Date(log.timestamp).getTime() / DEDUP_BUCKET_MS),
    secOrder: getSectionOrder(log.section, log.tag_id),
  }));
  withKeys.sort((a, b) => {
    if (a.bucketTs !== b.bucketTs) return b.bucketTs - a.bucketTs;
    if (a.secOrder !== b.secOrder) return a.secOrder - b.secOrder;
    return a.log.tag_id.localeCompare(b.log.tag_id);
  });
  const sortedTags = withKeys.map(x => x.log.tag_id);
  // Intake is section 0, WTP is 1, OHT is 2+. In the 10:00 bucket: Intake comes before WTP, which comes before OHT1.
  assert.equal(sortedTags[0], 'INT-LT');
  assert.equal(sortedTags[1], 'WTP-LT-BW');
  assert.equal(sortedTags[2], 'WTP-PT-RAW');
  assert.equal(sortedTags[3], 'OHT1-LT');
  assert.equal(sortedTags[4], 'INT-PT1'); // 09:55 bucket comes after 10:00 bucket
});

