const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

let sharedWtp;
function load(file, stubs = {}, extra = {}) {
  const raw = fs.readFileSync(file, 'utf8').replace(/import\.meta/g, '({env:{}})');
  const code = ts.transpileModule(raw, {
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React},
  }).outputText;
  const exports = {};
  if (file !== 'supabase/functions/_shared/wtpEquipment.ts' && !sharedWtp) sharedWtp = load('supabase/functions/_shared/wtpEquipment.ts').exports;
  stubs = { '../_shared/wtpEquipment.ts':sharedWtp, '../../supabase/functions/_shared/wtpEquipment':sharedWtp, ...stubs };
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

test('OHT-1 retains four instruments and OHT-2 maps five exact RTU measurements',()=>{
  assert.equal(topicSetup(null).topicToSection.get('shahpur-oht2')?.subsection, 'OHT-2');
  assert.equal(SENSORS.filter(s=>s.subsection==='OHT-1').length,4);
  assert.equal(SENSORS.filter(s=>s.subsection==='OHT-2').length,5);
  const r_data = Object.entries({PT1:'0.1', LT1:'0.0996094', FLOW:'-2786.41', TOTALIZER:'604', TOTALIZER2:'46445'}).map(([name,value])=>({name,value,err:'0'}));
  const payload=Object.assign({},...parsePayload(JSON.stringify({params:{id:'00601924123100045318',r_data}})));
  const rows=map('oht',payload,'OHT-2');
  assert.deepEqual(Object.fromEntries(rows.map(r=>[r.tag_id,r.value])),{'OHT2-PT':0.1,'OHT2-LT':0.0996094,'OHT2-Flow':-2786.41,'OHT2-Totalizer':604,'OHT2-Totalizer2':46445});
  const bad=Object.assign({},...parsePayload(JSON.stringify({params:{r_data:[{name:'FLOW',value:'42',err:'1'}]}})));
  const [fault]=map('oht',bad,'OHT-2');
  assert.equal(fault.quality,'fault');
  assert.equal(fault.value,null);
  assert.equal(quality.normalizeTelemetryValue(-2786.41,{id:'OHT2-Flow',min:-50,max:50}),-2786.41);
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
test('explicit instrument errors remain faults and out-of-range readings still sanitize',()=>{
  const payload=Object.assign({},...parsePayload(JSON.stringify({params:{r_data:[{name:'BW_LT',value:'50',err:'1'},{name:'CWR_LT',value:'9999',err:'0'}]}})));
  const readings=map('wtp',payload);
  assert.equal(readings.find(row => row.tag_id === 'WTP-LT-BW')?.quality, 'fault');
  assert.equal(readings.find(row => row.tag_id === 'WTP-LT-BW')?.value, null);
  assert.equal(readings.find(row => row.tag_id === 'WTP-LT-CW')?.value, 0);
  assert.equal(readings.find(row => row.tag_id === 'WTP-LT-CW')?.quality, 'good');
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

const wtpLive = load('src/lib/wtpProcessActivity.ts', {
  '@/hooks/useTagConnection': load('src/hooks/useTagConnection.ts', {
    '@/lib/telemetryQuality': quality,
  }).exports,
}).exports;

function wtpReading(id, value, options = {}) {
  return { ...tag, id, value, source: 'mqtt', lastDataTime: new Date(), ...options };
}

test('WTP measured flow never implies unmonitored equipment or a backwash phase', () => {
  const samples = [
    wtpReading('WTP-ROF-FB1', 42),
    wtpReading('WTP-LOH-FB2', 90),
    wtpReading('WTP-Flow-OUT', 65),
    wtpReading('WTP-PT1', 4.5),
    wtpReading('WTP-LT-BW', 60),
  ];
  const view = wtpLive.deriveWtpProcessActivity(samples);
  assert.deepEqual(Array.from(view.filters), ['filter', null]);
  assert.deepEqual(Array.from(view.pumpStates), ['No data', 'No data', 'No data']);
  assert.equal(view.outletFlow, true);
  assert.equal(view.inletFlow, null);
  assert.equal(view.mixing, null);
  assert.equal(view.clarifying, null);
  assert.equal(view.estimated.upstreamFlow, true);
  assert.equal(view.backwashTankOutflow, null);
  assert.deepEqual(Array.from(view.dosing), Array(6).fill(null));
  assert.deepEqual(Array.from(view.backwashPumps), [null, null]);
});

test('WTP upstream motion estimates stop without usable filtration evidence', () => {
  const flow = wtpReading('WTP-ROF-FB1', 42);
  const derive = wtpLive.deriveWtpProcessActivity;
  for (const unsuitable of [
    { value: 0 }, { status: 'fault' }, { source: 'simulated' },
    { lastDataTime: new Date(Date.now() - 6 * 60000) },
  ]) {
    assert.equal(derive([{ ...flow, ...unsuitable }]).estimated.upstreamFlow, false);
  }
  assert.equal(derive([flow, wtpReading('phase', 1)], {
    filters: [{ phase: { tag: 'phase', values: { 1: 'backwash' } } }],
  }).estimated.upstreamFlow, false);
  assert.equal(derive([flow, wtpReading('filter-outlet', 0)], {
    filters: [{ outletOpen: 'filter-outlet' }],
  }).estimated.upstreamFlow, false);
  const metered = derive([flow, wtpReading('inlet-meter', 0)], { inletFlow: 'inlet-meter' });
  assert.equal(metered.estimated.upstreamFlow, false);
  assert.equal(metered.inletFlow, false);
});

test('WTP downstream motion estimates require healthy feedback from the corresponding pump', () => {
  const derive = wtpLive.deriveWtpProcessActivity;
  const feedback = (name, trip = 0) => [
    wtpReading(`WTP-${name}_RUN_FB`, 1), wtpReading(`WTP-${name}_TRIP_FB`, trip),
  ];
  const samples = [...feedback('SLDP_PUMP'), ...feedback('POST_CL02')];
  const view = derive(samples);
  assert.equal(view.estimated.sludgeDraw, true);
  assert.equal(view.estimated.chlorineFeed, true);
  assert.equal(view.sludgeFlow, null);
  assert.equal(view.chlorineFeeding, null);
  assert.equal(derive(feedback('SLDP_PUMP', 1)).estimated.sludgeDraw, false);
  assert.equal(derive(feedback('POST_CL02', 1)).estimated.chlorineFeed, false);
  assert.equal(derive(feedback('PRE_CL02')).estimated.chlorineFeed, false);
  assert.equal(derive([...samples, wtpReading('sludge-valve', 0)], { sludgeOpen: 'sludge-valve' }).estimated.sludgeDraw, false);
  assert.equal(derive(samples, { chlorineFlow: 'chlorine-meter' }).estimated.chlorineFeed, false);
});

test('WTP rotation uses independent digital run and trip feedback', () => {
  const active = [
    wtpReading('WTP-Pump1', 1),
    wtpReading('WTP-Trip1', 1),
    wtpReading('WTP-Pump2', 0),
    wtpReading('WTP-Trip2', 0),
    wtpReading('WTP-PT2', 8.2),
  ];
  assert.deepEqual(Array.from(wtpLive.deriveWtpProcessActivity(active).pumpStates), ['Conflict', 'Off', 'No data']);
  assert.deepEqual(Array.from(wtpLive.deriveWtpProcessActivity([
    wtpReading('WTP-Pump1', 1, { source: 'simulated' }),
    wtpReading('WTP-Pump2', 1, { lastDataTime: new Date(Date.now() - 6 * 60000) }),
  ]).pumpStates), ['No data', 'Stale', 'No data']);
  assert.equal(wtpLive.deriveWtpProcessActivity([wtpReading('WTP-Pump1', 7)]).pumpStates[0], 'Fault');
});

test('WTP estimates a transfer branch only with outlet flow and a single eligible pump', () => {
  const derive = wtpLive.deriveWtpProcessActivity;
  const sample = (outlet, run1, run2, trip2 = 0) => [
    wtpReading('WTP-Flow-OUT', outlet), wtpReading('WTP-Pump1', run1),
    wtpReading('WTP-Pump2', run2), wtpReading('WTP-Trip1', 0), wtpReading('WTP-Trip2', trip2),
  ];
  const branch = (tags, mapping) => Array.from(derive(tags, mapping).estimated.transferBranch);
  assert.deepEqual(branch(sample(25, 1, 0)), [true, false]);
  assert.deepEqual(branch(sample(25, 0, 1)), [false, true]);
  assert.deepEqual(branch(sample(0, 1, 0)), [false, false]);
  assert.deepEqual(branch(sample(25, 1, 1)), [false, false]);
  assert.deepEqual(branch(sample(25, 1, 1, 1)), [false, false]);
  assert.deepEqual(branch(sample(25, 1, 0).filter(tag => tag.id !== 'WTP-Trip2')), [false, false]);
  assert.deepEqual(branch([...sample(25, 1, 0), wtpReading('rpm1', 0)], { transferPumps: [{ rpm: 'rpm1' }] }), [false, false]);
});

test('HMI mixer, numbered agitators and valves require their own feedback', () => {
  const samples = [
    wtpReading('WTP-FLASH_MIXER_RUN_FB', 1), wtpReading('WTP-FLASH_MIXER_TRIP_FB', 0),
    wtpReading('WTP-ALUM_AG02_RUN_FB', 1), wtpReading('WTP-ALUM_AG02TRIP_FB', 0),
    wtpReading('WTP-CWR_VALVE1_OPEN_FB', 1), wtpReading('WTP-CWR_VALVE1_CLOSE_FB', 0),
    wtpReading('WTP-VALVE3_OPEN_FB', 0), wtpReading('WTP-VALVE3_CLOSE_FB', 0),
    wtpReading('WTP-VALVE4_OPEN_FB', 1), wtpReading('WTP-VALVE4_CLOSE_FB', 1),
    wtpReading('WTP-AIR_BLOWER_RUN_FB', 1), wtpReading('WTP-AIR_BLOWER_TRIP_FB', 0),
  ];
  const view = wtpLive.deriveWtpProcessActivity(samples);
  assert.equal(view.mixing, true);
  assert.equal(view.driveStates.dosingMixers[1], 'Run');
  assert.equal(view.dosing[1], null);
  assert.deepEqual(Array.from(view.blowers), [null, null]);
  assert.equal(view.fieldDrives.find(d => d.name === 'Air blower').state, 'Run');
  assert.deepEqual(Array.from(view.fieldValves.slice(0,4), v => v.position), ['Open','No data','Unconfirmed','Conflict']);
  assert.equal(wtpLive.deriveWtpProcessActivity([samples[0]]).mixing, null);
});

test('WTP preserves fresh zero and distinguishes unavailable analog readings', () => {
  assert.equal(wtpLive.readWtpTelemetry(wtpReading('WTP-LT-CW', 0)).value, 0);
  for (const degraded of [
    { status: 'fault' }, { status: 'unknown' }, { notInstalled: true },
    { source: 'simulated' }, { value: NaN }, { lastDataTime: undefined },
  ]) {
    assert.equal(wtpLive.readWtpTelemetry(wtpReading('WTP-LT-CW', 17, degraded)).value, null);
  }
  const zeroFlows = wtpLive.deriveWtpProcessActivity([wtpReading('WTP-Flow-OUT', 0), wtpReading('WTP-ROF-FB1', 0)]);
  assert.equal(zeroFlows.outletFlow, false);
  assert.equal(zeroFlows.rates.filterBed[0], 0);
  assert.equal(zeroFlows.filters[0], null);
});

test('WTP can consume explicitly mapped field signals without assigning activity to other equipment', () => {
  const mapping = {
    mixer: { run: 'fixture-mixer-run', rpm: 'fixture-mixer-rpm' },
    dosing: [{ run: 'fixture-dosing-run', mixer: { run: 'fixture-dosing-agitator-run' } }],
    filters: [undefined, {
      phase: { tag: 'fixture-second-bed-stage', values: { 4: 'backwash' } },
      backwashInletOpen: 'fixture-wash-inlet',
      washFlow: 'fixture-wash-flow',
    }],
  };
  const samples = [
    wtpReading('fixture-mixer-run', 1),
    wtpReading('fixture-mixer-rpm', 27),
    wtpReading('fixture-dosing-run', 1),
    wtpReading('fixture-dosing-agitator-run', 0),
    wtpReading('fixture-second-bed-stage', 4),
    wtpReading('fixture-wash-inlet', 1),
    wtpReading('fixture-wash-flow', 39),
  ];
  const view = wtpLive.deriveWtpProcessActivity(samples, mapping);
  assert.equal(view.mixing, true);
  assert.equal(view.rpm.mixer, 27);
  assert.equal(view.clarifying, null);
  assert.equal(view.driveStates.dosing[0], 'Run');
  assert.equal(view.driveStates.dosingMixers[0], 'Off');
  assert.deepEqual(Array.from(view.filters), [null, 'backwash']);
  assert.equal(view.valves.backwashInlet[1], true);
  assert.equal(view.rates.backwash[1], 39);
  assert.equal(view.backwashPumps[1], null);
});

test('history and alarms asset filters isolate OHT-1 and OHT-2 and purge legacy Mohgaon footprints',()=>{
  const historyModule = load('src/pages/HistoryPage.tsx', {
    '@/config/shahpurSensors': load('src/config/shahpurSensors.ts').exports,
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
  const historyValue = (tag_id, value) => historyModule.describeHistoryReading({tag_id, value});
  assert.equal(historyValue('WTP-CWR_VALVE1_OPEN_FB', 1).sensorType, 'Valve feedback');
  assert.equal(historyValue('WTP-FLASH_MIXER_RUN_FB', 0).valueOut, 0);
  assert.equal(historyValue('WTP-Trip1', 1).valueOut, 1);
  assert.equal(historyValue('OHT2-Flow', -2786.41).valueOut, -2786.41);
  assert.equal(historyValue('OHT2-Totalizer2', 46445).sensorType, 'Totalizer');
  assert.equal(historyValue('OHT2-LT', null).valueOut, '—');

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

test('Garud sends fresh valid measurements for commissioned stations',()=>{
  const gisCode = fs.readFileSync('supabase/functions/gis-sync/index.ts', 'utf8');

  // Stations without eligible readings are skipped
  assert.match(gisCode, /skippedStations\.push\(stationName\)/);
  assert.match(gisCode, /skippedStations\.push\("wtp"\)/);

  // Verify Intake and OHT-1 transmit only if fresh MQTT data received
  assert.match(gisCode, /if\s*\(hasFreshData\(intakeIds\)\)/);
  assert.match(gisCode, /if\s*\(hasFreshData\(ohtIds\)\)/);

  const gis = load('supabase/functions/gis-sync/index.ts', {
    'https://esm.sh/@supabase/supabase-js@2.45.0': {},
  }, { Deno: { env: {get:()=>undefined}, serve:()=>{} } }).context;
  const normalize = vm.runInContext('normalizeReading', gis);
  assert.equal(normalize('OHT2-Flow', -2786.41), undefined);
  assert.equal(normalize('WTP-CL', NaN), undefined);
  assert.equal(normalize('WTP-CL', 0), 0);
  assert.equal(normalize('OHT2-PT', 0.1), 0.1);
  assert.doesNotMatch(gisCode, /v\([^)]*\)\s*\?\?\s*0/);

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

test('Garud request routes all four stations without fabricating missing flow or pressure', async () => {
  const now = new Date().toISOString();
  const row = (tag_id, value, quality = 'good', received_at = now) => ({tag_id, value, quality, received_at});
  let readings = [
    row('INT-Flow-IN', 25), row('INT-LT', 42),
    row('OHT1-Flow', 10), row('OHT1-LT', 32),
    row('OHT2-Flow', -2786.41), row('OHT2-PT', 0.1), row('OHT2-LT', 0.0996094),
    row('WTP-PH-IN', 7.1), row('WTP-CL', 0), row('WTP-LT-CW', null, 'fault'),
    row('WTP-PT1', 2.2, 'good', new Date(Date.now() - 3600000).toISOString()),
  ];
  const client = {from(table) {
    const query = {
      select: () => query, limit: () => query, in: () => query,
      order: () => table === 'telemetry_latest' ? {data: readings} : query,
      maybeSingle: () => ({data: {cron_secret:'test', base_url:'https://example.invalid',
        intake_device_id:'SHA_INTK_001', wtp_device_id:'SHA_WTP_001',
        oht1_device_id:'SHA_OHT_001', oht2_device_id:'SHA_OHT_002'}}),
      insert: async () => ({}),
    };
    return query;
  }};
  const sent = [];
  let handler;
  load('supabase/functions/gis-sync/index.ts', {
    'https://esm.sh/@supabase/supabase-js@2.45.0': {createClient:()=>client},
  }, {
    Deno: {env:{get:()=>undefined}, serve: fn => {handler = fn;}},
    fetch: async (_, options) => {sent.push(JSON.parse(options.body)); return new Response('{}');},
    Response, AbortSignal,
  });
  const request = new Request('https://example.invalid', {method:'POST', headers:{'x-cron-key':'test'}});
  const result = await (await handler(request)).json();
  assert.deepEqual(result.proof.included_stations.sort(), ['intake', 'oht1', 'oht2', 'wtp']);
  assert.equal(sent[0].intake.intakWell_Device_id, 'SHA_INTK_001');
  assert.equal(sent[0].intake.inletFlow_mld, 0.6);
  assert.equal(sent[0].intake.outletFlow_mld, undefined);
  assert.deepEqual(sent[0].intakePumps, []);
  const unit = sent[0].wtpUnits[0];
  assert.equal(unit.wtp.wtP_Device_id, 'SHA_WTP_001');
  assert.equal(unit.ohts[0].ohT_Device_id, 'SHA_OHT_001');
  assert.equal(unit.ohts[0].inletFlow_mld, 0.24);
  assert.equal(unit.ohts[1].ohT_Device_id, 'SHA_OHT_002');
  assert.equal(unit.ohts[1].inletPressure, 0.1);
  assert.equal(unit.ohts[1].waterLevel_mld, 0.0996);
  assert.equal(unit.ohts[1].outletFlow_mld, undefined);
  assert.equal(unit.wtp.rawPh, 7.1);
  assert.equal(unit.wtp.chlorine, 0);
  assert.equal(unit.wtp.cwrLevel, undefined);
  assert.deepEqual(unit.pumps, []);
  readings = [row('OHT2-Flow', -2786.41)];
  const skipped = await (await handler(request)).json();
  assert.equal(skipped.proof.status, 204);
  assert.equal(sent.length, 1);
  assert.equal(skipped.proof.invalid_readings['OHT2-Flow'].value, -2786.41);
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

test('Intake fault-only packets clear metered flow and totalizer values without clearing healthy readings', () => {
  const r_data = [
    { name: 'PUMP1_PT1_ACT', value: '2.45', err: '0' },
    ...['INLETFLOW', 'OUTLETFLOW', 'INLETTOTLIZER1', 'OUTLETTOTLIZER2']
      .map(name => ({ name, err: '1' })),
  ];
  const rows = map('intake', Object.assign({}, ...parsePayload(JSON.stringify({ params: { r_data } }))));
  for (const name of ['INT-Flow-IN', 'INT-Flow-OUT', 'INT-Totalizer-IN', 'INT-Totalizer-OUT']) {
    const row = rows.find(r => r.tag_id === name);
    assert.equal(row?.quality, 'fault', name);
    assert.equal(row?.value, null, name);
  }
  assert.equal(rows.find(r => r.tag_id === 'INT-PT1')?.value, 2.45);
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

test('SCADA All data export preserves separate archived readings and exact source fields in Excel', async () => {
  const ExcelJS = require('exceljs');
  // ExcelJS identifies row arrays using instanceof, so move VM arrays into its realm.
  class FixtureWorkbook extends ExcelJS.Workbook {
    addWorksheet(...args) {
      const sheet = super.addWorksheet(...args);
      const addRow = sheet.addRow.bind(sheet);
      sheet.addRow = values => addRow(Array.from(values));
      return sheet;
    }
  }
  const window = { start: '2026-11-25T00:00:00.000Z', end: '2026-11-26T00:00:00.000Z' };
  const records = [
    { id: 'a', tag_id: 'OHT2-Flow', section: 'oht', value: -2786.412345678901,
      timestamp: '2026-11-25T10:00:00.123456+00:00', received_at: '2026-11-25T10:00:03.765432+00:00' },
    { id: 'b', tag_id: 'OHT2-Flow', section: 'oht', value: 0,
      timestamp: '2026-11-25T10:01:00+00:00', received_at: null },
  ];
  let blob;
  const react = {
    default: { createElement: (type, props, ...children) => ({ type, props, children }) },
    useState: initial => [initial && typeof initial === 'object' && 'density' in initial
      ? { ...initial, startDate: new Date(window.start), endDate: new Date(Date.parse(window.end) - 1) } : initial, () => {}],
    useMemo: compute => compute(),
    useCallback: callback => callback,
    useEffect: () => {},
    useRef: value => ({ current: value }),
  };
  const { exports } = load('src/pages/HistoryPage.tsx', {
    react,
    exceljs: { default: { Workbook: FixtureWorkbook } },
    'date-fns': { format: () => '25 Nov 2026', startOfDay: date => date, endOfDay: date => date },
    '@/config/shahpurSensors': load('src/config/shahpurSensors.ts').exports,
    '@/contexts/ScadaContext': { useScada: () => ({ plantName: 'Shahpur SCADA' }) },
    '@/hooks/use-toast': { useToast: () => ({ toast: () => {} }) },
    '@/integrations/supabase/client': { supabase: { from: () => ({ select: async () => ({ data: [] }) }) } },
    '@/lib/historianArchiveClient': {
      resolveHistorianDates: async () => [{ ...window, archived: true }],
      readArchiveHistory: async () => ({ count: records.length, rows: [] }),
      readArchivePage: async () => ({ count: records.length, rows: records }),
    },
    '@/lib/errorLogger': { logWarn: () => {}, logError: (_, error) => { throw error; } },
    '@/lib/utils': { cn: (...args) => args.filter(Boolean).join(' ') },
    '@/components/ui/button': { Button: 'fixture-button' },
  }, {
    Blob,
    URL: { createObjectURL: value => { blob = value; return 'blob:fixture'; }, revokeObjectURL: () => {} },
    document: { createElement: () => ({ click: () => {} }), body: { appendChild: () => {}, removeChild: () => {} } },
    setTimeout: callback => { callback(); return 0; },
  });
  const hasExportText = element => element === 'Export Excel' || element?.children?.some(hasExportText);
  function exportButton(element) {
    if (element?.type === 'fixture-button' && hasExportText(element)) return element;
    for (const child of element?.children ?? []) {
      const match = exportButton(child);
      if (match) return match;
    }
  }
  const button = exportButton(exports.default());
  assert.equal(typeof button?.props?.onClick, 'function');
  await button.props.onClick();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(await blob.arrayBuffer()));
  const sheet = workbook.getWorksheet('Historical Records');
  assert.equal(sheet.rowCount, 6);
  const result = [5, 6].map(row => [sheet.getCell(row, 1).value, sheet.getCell(row, 7).value ?? '', sheet.getCell(row, 8).value]);
  assert.deepEqual(result.sort(), records.map(record => [record.timestamp, record.received_at ?? '', String(record.value)]).sort());
});


test('WTP original bytes preserve named readings inside repeated anonymous members', () => {
  const raw = '{"":"id","":{"CWR_LT_SCALED":"7.8615","CWR_LT_SCALED":"0.0000","FLASH_MIXER_RUN_FB":"1","FLASH_MIXER_TRIP_FB":"0","CWR_VALVE1_OPEN_FB":"1","CWR_VALVE1_CLOSE_FB":"0","RAW_PH_SCALED":"8.5","pt3":"1.0065"},"":"1"}';
  const decoded = sharedWtp.decodeWtpEquipment(raw);
  const rows = new Map(map('wtp', decoded).map(row => [row.tag_id,row]));
  assert.equal(rows.get('WTP-LT-CW').quality,'good');
  assert.equal(rows.get('WTP-LT-CW').value,7.86);
  assert.equal(rows.get('WTP-FLASH_MIXER_RUN_FB').value,1);
  assert.equal(rows.get('WTP-CWR_VALVE1_OPEN_FB').value,1);
  assert.equal(rows.get('WTP-PH-IN').value,8.5);
  assert.equal(rows.get('WTP-PLC-PT3').value,1.01);
  assert.equal(rows.has('WTP-HeaderPT'),false);
  assert.equal(sharedWtp.decodeWtpEquipment('{"":{"TOTALIZER":"604","OUTLET_FLOW":0},"":"1"}').TOTALIZER,604);
});

test('WTP zero placeholders only yield to one valid measurement, regardless of packet order', () => {
  const invalid = sharedWtp.WTP_INVALID_FEEDBACK;
  const fields = [
    ['pt2', '0.0844'], ['pt3', '0'], ['CWR_LT_SCALED', '43.5203'],
    ['BACKWASH_LT_SCALED', '48.9161'], ['RAW_TURBIDITY_SCALED', '10'],
    ['LOH_SCALED', '11.7082'], ['ROF_SCALED', '55.2368'], ['LOH02_SCALED', '-4.3061'],
    ['pt2', '0'], ['pt3', '1.0065'], ['CWR_LT_SCALED', '0'],
    ['BACKWASH_LT_SCALED', '0'], ['RAW_TURBIDITY_SCALED', '0'],
    ['LOH_SCALED', '0'], ['ROF_SCALED', '0'], ['LOH02_SCALED', '0'],
    ['PT1', '0'], ['PT1', '0'], ['OUTLET_FLOW', '0'], ['TOTALIZER', '0'],
    ['FLASH_MIXER_RUN_FB', '0'], ['FLASH_MIXER_RUN_FB', '1'],
    ['RECYCLE_PUMP02_RUN_FB', '1'], ['RECYCLE_PUMP02_TRIP_FB', '1'],
    ['VALVE4_OPEN_FB', '1'], ['VALVE4_CLOSE_FB', '0'],
  ];
  for (const entries of [fields, [...fields].reverse()]) {
    const decoded = sharedWtp.normalizeWtpFields(entries);
    for (const [key, value] of Object.entries({
      PUMP2_PT: 0.0844, PT3: 1.0065, CWT: 43.5203, BACKWASH_TANK: 48.9161,
      TURBIDITY_INLET: 10, LOH_FB1: 11.7082, ROF_FB1: 55.2368, LOH_FB2: invalid,
      PUMP1_PT: 0, OUTLET_FLOW: 0, TOTALIZER: 0, FLASH_MIXER_RUN_FB: invalid,
      RECYCLE_PUMP02_RUN_FB: invalid, RECYCLE_PUMP02_TRIP_FB: invalid,
      VALVE4_OPEN_FB: 1, VALVE4_CLOSE_FB: 0,
    })) assert.equal(decoded[key], value, key);
    const rows = new Map(map('wtp', decoded).map(row => [row.tag_id, row]));
    assert.equal(rows.get('WTP-LT-CW').value, 43.52);
    assert.equal(rows.get('WTP-ROF-FB1').quality, 'good');
  }
  const conflicts = sharedWtp.normalizeWtpFields([
    ['PT2', '0'], ['PT2', '1'], ['PT2', '2'], ['PT2', '0'],
    ['PT3', 'bad'], ['PT3', '1'], ['TOTALIZER', '0'], ['TOTALIZER', '10'],
  ]);
  assert.equal(conflicts.PUMP2_PT, invalid);
  assert.equal(conflicts.PT3, invalid);
  assert.equal(conflicts.TOTALIZER, invalid);
});

test('WTP conflicting drive and valve feedback cannot create good historian samples', () => {
  const decoded = sharedWtp.decodeWtpEquipment(JSON.stringify({equipment_data:{
    RECYCLE_PUMP02_RUN_FB:1, RECYCLE_PUMP02_TRIP_FB:1, VALVE4_OPEN_FB:1, VALVE4_CLOSE_FB:1,
    AIR_BLOWER_RUN_FB:2, VALVE5_OPEN_FB:0, VALVE5_CLOSE_FB:0, LOH02_SCALED:-4.0116,
    ALUM_AG02_RUN_FB:1, ALUM_AG02TRIP_FB:1, CWR_PUMP1_RUN_FB:0, CWR_PUMP1_TRIP_FB:0,
  }}));
  const rows = new Map(map('wtp',decoded).map(row => [row.tag_id,row]));
  for (const key of ['RECYCLE_PUMP02_RUN_FB','RECYCLE_PUMP02_TRIP_FB','VALVE4_OPEN_FB','VALVE4_CLOSE_FB',
    'AIR_BLOWER_RUN_FB','ALUM_AG02TRIP_FB','ALUM_AG02_RUN_FB','LOH-FB2']) {
    assert.equal(rows.get('WTP-'+key).quality,'fault',key);
  }
  for (const key of ['VALVE5_OPEN_FB','VALVE5_CLOSE_FB','Pump1','Trip1']) {
    assert.equal(rows.get('WTP-'+key).quality,'good',key);
    assert.equal(rows.get('WTP-'+key).value,0,key);
  }
  const fixed = sharedWtp.decodeWtpEquipment('{"equipment_data":{"RECYCLE_PUMP02_RUN_FB":1,"RECYCLE_PUMP02_TRIP_FB":0,"LOH02_SCALED":"2.50","LOH02_SCALED":2.5}}');
  assert.ok(map('wtp',fixed).every(row=>row.quality==='good'));
});

test('every additional WTP feedback field has a matching database definition', () => {
  const migration = fs.readFileSync('supabase/migrations/20261125010000_wtp_equipment_feedback.sql','utf8');
  for (const sensor of sharedWtp.wtpAdditionalSensors) {
    assert.ok(migration.includes("('"+sensor.id+"', 'wtp',"),sensor.id);
    assert.equal(SENSORS.filter(s=>s.id===sensor.id).length,1);
  }
});
