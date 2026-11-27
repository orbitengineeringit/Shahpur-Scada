const drives: Record<string,string> = {
  FLASH_MIXER:'Flash mixer', ALUM_AG01:'Alum agitator 1', ALUM_AG02:'Alum agitator 2',
  LIME_AG01:'Lime agitator 1', LIME_AG02:'Lime agitator 2', AIR_BLOWER:'Air blower',
  PRE_CL01:'Pre-chlorination 1', PRE_CL02:'Pre-chlorination 2',
  POST_CL01:'Post-chlorination 1', POST_CL02:'Post-chlorination 2',
  RECYCLE_PUMP01:'Recycle pump 1', RECYCLE_PUMP02:'Recycle pump 2', SLDP_PUMP:'Sludge pump',
};
const section = 'wtp' as const;
function feedback(key: string, label: string, instrumentType: 'pump' | 'valve') {
  return { id:'WTP-' + key, mqttKey:key, label, min:0, max:1, unit:'', section, type:'digital' as const, instrumentType };
}
const valves = Array.from({ length:7 }, (_, i) => (i < 2 ? 'CWR_VALVE' : 'VALVE') + (i + 1));
export const wtpAdditionalSensors = [
  ...Object.entries(drives).flatMap(([base,label]) => [
    feedback(base + '_RUN_FB', label + ' running', 'pump'),
    feedback(base + (base === 'ALUM_AG02' ? 'TRIP_FB' : '_TRIP_FB'), label + ' trip', 'pump'),
  ]),
  ...valves.flatMap((base,i) => ['OPEN','CLOSE','TRIP','REMOTE'].map(state =>
    feedback(base + '_' + state + '_FB', (i < 2 ? 'CWR valve ' : 'Valve ') + (i + 1) + ' ' + state.toLowerCase(), 'valve'))),
  { id:'WTP-PH-IN', mqttKey:'RAW_PH_SCALED', label:'Raw water pH', unit:'pH', min:0, max:14, section, subsection:'raw-water', type:'analog' as const, instrumentType:'ph' as const },
  { id:'WTP-PLC-PT3', mqttKey:'PT3', label:'Pressure transmitter 3', unit:'Bar', min:0, max:10, section, type:'analog' as const, instrumentType:'pt' as const },
  { id:'WTP-OCFM', mqttKey:'OCFM_SCALED', label:'OCFM (PLC reading)', unit:'', min:-1e8, max:1e8, section, type:'analog' as const, instrumentType:'flow' as const },
];

const aliases: Record<string,string> = {
  PT1:'PUMP1_PT', PT2:'PUMP2_PT', CWR_LT_SCALED:'CWT', BACKWASH_LT_SCALED:'BACKWASH_TANK',
  RAW_TURBIDITY_SCALED:'TURBIDITY_INLET', CWR_PH_SCALED:'PUMP_PH', CWR_TURBIDITY_SCALED:'PUMP_TURBIDITY',
  CWR_CHLORINE_SCALED:'PUMP_CHLORINE', ROF_SCALED:'ROF_FB1', LOH_SCALED:'LOH_FB1', LOH02_SCALED:'LOH_FB2',
  CWR_PUMP1_RUN_FB:'MOTOR1_INDACTOR', CWR_PUMP1_TRIP_FB:'MOTOR1_TRIP',
  CWR_PUMP2_RUN_FB:'MOTOR2_INDACTOR', CWR_PUMP2_TRIP_FB:'MOTOR2_TRIP', ALUM_AG02_TRIP_FB:'ALUM_AG02TRIP_FB',
};
const canonical = (key: string) => Object.prototype.hasOwnProperty.call(aliases,key) ? aliases[key] : key;
const binary = new Set([...wtpAdditionalSensors.filter(s => s.type === 'digital').map(s => s.mqttKey),
  'MOTOR1_INDACTOR','MOTOR1_TRIP','MOTOR2_INDACTOR','MOTOR2_TRIP']);
// The WTP equipment envelope repeats these measurements with zero placeholders.
const zeroPlaceholderMeasurements = new Set([
  'PUMP1_PT', 'PUMP2_PT', 'PT3', 'CWT', 'BACKWASH_TANK', 'OCFM_SCALED',
  'RAW_PH_SCALED', 'TURBIDITY_INLET', 'PUMP_PH', 'PUMP_TURBIDITY', 'PUMP_CHLORINE',
  'ROF_FB1', 'LOH_FB1', 'LOH_FB2',
]);
export const WTP_INVALID_FEEDBACK = 'invalid-wtp-feedback';

export function normalizeWtpFields(entries: Iterable<[string,unknown]>): Record<string,number | string> {
  const result: Record<string,number | string> = Object.create(null);
  for (const [name,raw] of entries) {
    if (!name) continue;
    const key = canonical(name.toUpperCase());
    const value = typeof raw === 'number' || (typeof raw === 'string' && raw.trim() !== '') ? Number(raw) : NaN;
    const bad = !Number.isFinite(value) || (binary.has(key) && value !== 0 && value !== 1)
      || (['LOH_SCALED','LOH02_SCALED'].includes(name.toUpperCase()) && (value < 0 || value > 100));
    const previous = result[key];
    if (bad || previous === WTP_INVALID_FEEDBACK) {
      result[key] = WTP_INVALID_FEEDBACK;
    } else if (previous === undefined || previous === value) {
      result[key] = value;
    } else if (zeroPlaceholderMeasurements.has(key) && (previous === 0 || value === 0)) {
      result[key] = previous === 0 ? value : previous;
    } else {
      result[key] = WTP_INVALID_FEEDBACK;
    }
  }
  function checkPair(a: string, b: string) {
    if (result[a] === 1 && result[b] === 1) result[a] = result[b] = WTP_INVALID_FEEDBACK;
  }
  for (const base of Object.keys(drives)) checkPair(base + '_RUN_FB',canonical(base + '_TRIP_FB'));
  for (const n of [1,2]) checkPair('MOTOR' + n + '_INDACTOR','MOTOR' + n + '_TRIP');
  for (const base of valves) checkPair(base + '_OPEN_FB',base + '_CLOSE_FB');
  return result;
}

/** Index each JSON member before parsing so duplicate names survive at every depth.
 * Accept flat readings and named/anonymous equipment banks; leave legacy shapes to their decoder. */
export function decodeWtpEquipment(raw: string): Record<string,number | string> | undefined {
  const names: string[] = [];
  try {
    const indexed = raw.replace(/"(?:\\.|[^"\\])*"(\s*:)?/g, (token, colon: string | undefined) => {
      if (!colon) return token;
      names.push(JSON.parse(token.slice(0,-colon.length)));
      return '"' + (names.length - 1) + '":';
    });
    const root = JSON.parse(indexed);
    if (!root || typeof root !== 'object' || Array.isArray(root)) return;
    const entries: [string,unknown][] = [];
    let equipment = false;
    for (const [index,value] of Object.entries(root)) {
      const name = names[Number(index)];
      if ((name === 'equipment_data' || !name) && value && typeof value === 'object' && !Array.isArray(value)) {
        equipment = true;
        for (const [id,reading] of Object.entries(value)) entries.push([names[Number(id)],reading]);
      }
    }
    if (!equipment) {
      if (Object.keys(root).some(i => ['params','r_data','tag','value'].includes(names[Number(i)]?.toLowerCase()))) return;
      if (Object.values(root).some(v => v !== null && typeof v === 'object')) return;
      for (const [id,reading] of Object.entries(root)) entries.push([names[Number(id)],reading]);
    }
    return normalizeWtpFields(entries);
  } catch {
    // A truncated equipment envelope must never fall through to legacy fragment recovery.
    return /"(?:equipment_data)?"\s*:/.test(raw) ? {} : undefined;
  }
}
