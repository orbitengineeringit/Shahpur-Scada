/**
 * SHAHPUR SCADA - COMPLETE SENSOR CONFIGURATION
 * 
 * Project: Improvement of Water Supply in Shahpur, Dist- Sagar, Madhya Pradesh (Package-61)
 * Client: Madhya Pradesh Urban Development Company Limited (MPUDCL)
 * Capacity: 1.75 MLD
 * Contractor: M/s. CMPV Engineering Pvt. Ltd.
 * System Integrator: M/s Orbit Engineering Solutions
 * 
 * MQTT topic paths are loaded securely from the database at runtime.
 * Only topic keys (OHT1, OHT2, INTAKE, WTP) are defined here.
 * 
 * Stations:
 * - Intake PLC: sahpur/intake/plc01/update (Device ID: 02500225110500007982)
 * - OHT-1 (Bus Station OHT): sahpur/oht/plc01/update (Device ID: 02500225110500007512)
 * - OHT-2: Pending Commissioning (Topic TBD)
 * - WTP: Awaiting Commissioning (Topic TBD)
 */

export type SectionType = 'oht' | 'intake' | 'wtp';

export interface ShahpurSensor {
  id: string;
  mqttKey: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  section: SectionType;
  subsection?: string;
  type: 'analog' | 'digital' | 'totalizer';
  instrumentType: 'pt' | 'lt' | 'flow' | 'totalizer' | 'valve' | 'kw' | 'pump' | 'ph' | 'turbidity' | 'chlorine' | 'fcv' | 'combined_pt' | 'temperature';
  notInstalled?: boolean;
  pendingCommissioning?: boolean;
  /** If this is a pump, which PT sensor ID drives its ON/OFF status */
  derivedFromPt?: string;
}


// ==================== OHT SENSORS ====================
// Shahpur OHT Model:
// OHT-1: Bus Station OHT (Live)
// OHT-2: OHT-2 (Pending Commissioning)
// Keys: OHT_PT_1, OHT_LT, OHT_FLOW, OHT_POSICUMVALUE
const createOhtSensors = (ohtNum: number, isPending: boolean = false): ShahpurSensor[] => {
  const prefix = `OHT${ohtNum}`;
  const sub = `OHT-${ohtNum}`;
  return [
    {
      id: `${prefix}-PT`,
      mqttKey: 'OHT_PT_1',
      label: 'Inlet Pressure (PT)',
      unit: 'Bar',
      min: 0,
      max: 10,
      section: 'oht',
      subsection: sub,
      type: 'analog',
      instrumentType: 'pt',
      pendingCommissioning: isPending,
    },
    {
      id: `${prefix}-LT`,
      mqttKey: 'OHT_LT',
      label: 'Level Transducer',
      unit: '%',
      min: 0,
      max: 100,
      section: 'oht',
      subsection: sub,
      type: 'analog',
      instrumentType: 'lt',
      pendingCommissioning: isPending,
    },
    {
      id: `${prefix}-Flow`,
      mqttKey: 'OHT_FLOW',
      label: 'Outlet Flow Meter',
      unit: 'm³/hr',
      min: 0,
      max: 50,
      section: 'oht',
      subsection: sub,
      type: 'analog',
      instrumentType: 'flow',
      pendingCommissioning: isPending,
    },
    {
      id: `${prefix}-Totalizer`,
      mqttKey: 'OHT_POSICUMVALUE',
      label: 'Totalizer',
      unit: 'm³',
      min: 0,
      max: 999999,
      section: 'oht',
      subsection: sub,
      type: 'totalizer',
      instrumentType: 'totalizer',
      pendingCommissioning: isPending,
    },
  ];
};

export const OHT1_SENSORS = createOhtSensors(1, false);
export const OHT2_SENSORS = createOhtSensors(2, true);
export const ALL_OHT_SENSORS = [...OHT1_SENSORS, ...OHT2_SENSORS];

// ==================== INTAKE SENSORS ====================
// Intake PLC: sahpur/intake/plc01/update (Device ID: 02500225110500007982)
// Totalizers are received as high/low 16-bit words: H × 65536 + L
export const INTAKE_SENSORS: ShahpurSensor[] = [
  { id: 'INT-PT1', mqttKey: 'INTAKEPT1', label: 'VT Pump 1 Pressure', unit: 'Bar', min: 0, max: 10, section: 'intake', type: 'analog', instrumentType: 'pt' },
  { id: 'INT-PT2', mqttKey: 'INTAKEPT2', label: 'VT Pump 2 Pressure', unit: 'Bar', min: 0, max: 10, section: 'intake', type: 'analog', instrumentType: 'pt' },
  { id: 'INT-HeaderPT', mqttKey: 'INTAKEHDPT1', label: 'Main Header Pressure', unit: 'Bar', min: 0, max: 10, section: 'intake', type: 'analog', instrumentType: 'combined_pt' },
  { id: 'INT-LT', mqttKey: 'INTAKERLT', label: 'River Level (RLT)', unit: '%', min: 0, max: 100, section: 'intake', type: 'analog', instrumentType: 'lt' },
  { id: 'INT-Flow-IN', mqttKey: 'INFLOW1', label: 'Inlet Flow Meter', unit: 'm³/hr', min: 0, max: 200, section: 'intake', type: 'analog', instrumentType: 'flow' },
  { id: 'INT-Totalizer-IN', mqttKey: 'INTotalizer1H', label: 'Inlet Totalizer', unit: 'm³', min: 0, max: 999999, section: 'intake', type: 'totalizer', instrumentType: 'totalizer' },
  { id: 'INT-Flow-OUT', mqttKey: 'OUTFLOW2', label: 'Outlet Flow Meter', unit: 'm³/hr', min: 0, max: 200, section: 'intake', type: 'analog', instrumentType: 'flow' },
  { id: 'INT-Totalizer-OUT', mqttKey: 'OUTTotalizer1H', label: 'Outlet Totalizer', unit: 'm³', min: 0, max: 999999, section: 'intake', type: 'totalizer', instrumentType: 'totalizer' },
  { id: 'INT-Pump1', mqttKey: '', label: 'VT Pump 1', unit: '', min: 0, max: 1, section: 'intake', type: 'digital', instrumentType: 'pump', derivedFromPt: 'INT-PT1' },
  { id: 'INT-Pump2', mqttKey: '', label: 'VT Pump 2', unit: '', min: 0, max: 1, section: 'intake', type: 'digital', instrumentType: 'pump', derivedFromPt: 'INT-PT2' },
];

// ==================== WTP SENSORS (SCAFFOLDED) ====================
// WTP is scaffolded pending commissioning (topics TBD).
export const WTP_SENSORS: ShahpurSensor[] = [
  // Levels
  { id: 'WTP-LT-BW', mqttKey: 'BW_LT', label: 'Backwash Level', unit: '%', min: 0, max: 100, section: 'wtp', type: 'analog', instrumentType: 'lt', pendingCommissioning: true },
  { id: 'WTP-LT-CW', mqttKey: 'CWR_LT', label: 'Clear Water Level', unit: '%', min: 0, max: 100, section: 'wtp', type: 'analog', instrumentType: 'lt', pendingCommissioning: true },
  // Pressures
  { id: 'WTP-PT1', mqttKey: 'PT_1', label: 'HT Pump 1 Pressure', unit: 'Bar', min: 0, max: 10, section: 'wtp', type: 'analog', instrumentType: 'pt', pendingCommissioning: true },
  { id: 'WTP-PT2', mqttKey: 'PT_2', label: 'HT Pump 2 Pressure', unit: 'Bar', min: 0, max: 10, section: 'wtp', type: 'analog', instrumentType: 'pt', pendingCommissioning: true },
  { id: 'WTP-HeaderPT', mqttKey: 'PT_3', label: 'Combined Header Pressure', unit: 'Bar', min: 0, max: 10, section: 'wtp', type: 'analog', instrumentType: 'combined_pt', pendingCommissioning: true },
  // Raw water / inlet
  { id: 'WTP-Flow-IN', mqttKey: 'RAW_EFM_FLOW', label: 'Inlet Flow Meter', unit: 'm³/hr', min: 0, max: 200, section: 'wtp', subsection: 'raw-water', type: 'analog', instrumentType: 'flow', pendingCommissioning: true },
  { id: 'WTP-Totalizer-IN', mqttKey: 'RAW_EFM', label: 'Inlet Totalizer', unit: 'm³', min: 0, max: 999999, section: 'wtp', subsection: 'raw-water', type: 'totalizer', instrumentType: 'totalizer', pendingCommissioning: true },
  // Outlet
  { id: 'WTP-Flow-OUT', mqttKey: 'CLR_EFM_FLOW', label: 'Outlet Flow Meter', unit: 'm³/hr', min: 0, max: 200, section: 'wtp', subsection: 'outlet', type: 'analog', instrumentType: 'flow', pendingCommissioning: true },
  { id: 'WTP-Totalizer-OUT', mqttKey: 'CLR_EFM', label: 'Outlet Totalizer', unit: 'm³', min: 0, max: 999999, section: 'wtp', subsection: 'outlet', type: 'totalizer', instrumentType: 'totalizer', pendingCommissioning: true },
  // Analyzers
  { id: 'WTP-PH-IN', mqttKey: 'RW_PH', label: 'Inlet pH', unit: 'pH', min: 0, max: 14, section: 'wtp', subsection: 'raw-water', type: 'analog', instrumentType: 'ph', pendingCommissioning: true },
  { id: 'WTP-TA-IN', mqttKey: 'RW_TB', label: 'Inlet Turbidity', unit: 'NTU', min: 0, max: 100, section: 'wtp', subsection: 'raw-water', type: 'analog', instrumentType: 'turbidity', pendingCommissioning: true },
  { id: 'WTP-PH', mqttKey: 'CWR_PH', label: 'Outlet pH', unit: 'pH', min: 0, max: 14, section: 'wtp', subsection: 'outlet', type: 'analog', instrumentType: 'ph', pendingCommissioning: true },
  { id: 'WTP-CL', mqttKey: 'CWR_CL', label: 'Outlet Chlorine', unit: 'PPM', min: 0, max: 20, section: 'wtp', subsection: 'outlet', type: 'analog', instrumentType: 'chlorine', pendingCommissioning: true },
  { id: 'WTP-TA', mqttKey: 'CWR_TB', label: 'Outlet Turbidity', unit: 'NTU', min: 0, max: 100, section: 'wtp', subsection: 'outlet', type: 'analog', instrumentType: 'turbidity', pendingCommissioning: true },
  { id: 'WTP-TEM', mqttKey: 'CWR_TEM', label: 'Outlet Temperature', unit: '°C', min: 0, max: 60, section: 'wtp', subsection: 'outlet', type: 'analog', instrumentType: 'temperature', pendingCommissioning: true },
  // HT Pumps
  { id: 'WTP-Pump1', mqttKey: '', label: 'HT Pump 1', unit: '', min: 0, max: 1, section: 'wtp', type: 'digital', instrumentType: 'pump', derivedFromPt: 'WTP-PT1', pendingCommissioning: true },
  { id: 'WTP-Pump2', mqttKey: '', label: 'HT Pump 2', unit: '', min: 0, max: 1, section: 'wtp', type: 'digital', instrumentType: 'pump', derivedFromPt: 'WTP-PT2', pendingCommissioning: true },
];

// ==================== ALL SENSORS ====================
export const ALL_SENSORS = [...ALL_OHT_SENSORS, ...INTAKE_SENSORS, ...WTP_SENSORS];

// ==================== PT → PUMP DERIVATION MAP ====================
export const PT_TO_PUMP_MAP: Record<string, string> = {};
ALL_SENSORS.filter(s => s.derivedFromPt).forEach(pump => {
  PT_TO_PUMP_MAP[pump.derivedFromPt!] = pump.id;
});

// ==================== MQTT TOPICS ====================
export const MQTT_TOPIC_KEYS = ['OHT1', 'OHT2', 'INTAKE', 'WTP'] as const;

const getEnv = (key: string): string | undefined => {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return import.meta.env[key];
  }
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key];
  }
  return undefined;
};

// Default topics for Shahpur plant
export const DEFAULT_MQTT_TOPICS: Record<string, string> = {
  INTAKE: getEnv('VITE_MQTT_TOPIC_INTAKE') || getEnv('NEXT_PUBLIC_MQTT_TOPIC_INTAKE') || 'sahpur/intake/plc01/update',
  OHT1:   getEnv('VITE_MQTT_TOPIC_OHT1')   || getEnv('NEXT_PUBLIC_MQTT_TOPIC_OHT1')   || 'sahpur/oht/plc01/update',
  OHT2:   getEnv('VITE_MQTT_TOPIC_OHT2')   || getEnv('NEXT_PUBLIC_MQTT_TOPIC_OHT2')   || '',
  WTP:    getEnv('VITE_MQTT_TOPIC_WTP')    || getEnv('NEXT_PUBLIC_MQTT_TOPIC_WTP')    || '',
};

// Mutable map — initialized with station defaults
export const MQTT_TOPICS: Record<string, string> = { ...DEFAULT_MQTT_TOPICS };

// Built dynamically when topics are loaded from DB or Vault
export const TOPIC_TO_SECTION: Record<string, { section: SectionType; subsection?: string }> = {};

export const ALL_MQTT_TOPICS: string[] = [];

/** Called by MqttContext after loading topics from database or Vault */
export const setTopicsFromDb = (topics: Record<string, string>) => {
  if (!topics) return;
  for (const [key, val] of Object.entries(topics)) {
    if (val) MQTT_TOPICS[key] = val;
    else if (DEFAULT_MQTT_TOPICS[key]) MQTT_TOPICS[key] = DEFAULT_MQTT_TOPICS[key];
  }
  for (const k in TOPIC_TO_SECTION) delete TOPIC_TO_SECTION[k];
  const sectionMap: Record<string, { section: SectionType; subsection?: string }> = {
    OHT1: { section: 'oht', subsection: 'OHT-1' },
    OHT2: { section: 'oht', subsection: 'OHT-2' },
    INTAKE: { section: 'intake' },
    WTP: { section: 'wtp' },
  };
  for (const [key, topic] of Object.entries(MQTT_TOPICS)) {
    if (topic && sectionMap[key]) {
      TOPIC_TO_SECTION[topic] = sectionMap[key];
    }
  }
  ALL_MQTT_TOPICS.length = 0;
  ALL_MQTT_TOPICS.push(...Object.values(MQTT_TOPICS).filter(Boolean));
};

// Initialize TOPIC_TO_SECTION immediately with default topics
setTopicsFromDb(DEFAULT_MQTT_TOPICS);

// Helper functions
export const getSensorsForSubsection = (subsection: string): ShahpurSensor[] => {
  return ALL_SENSORS.filter(s => s.subsection === subsection);
};

export const getSensorsForSection = (section: SectionType): ShahpurSensor[] => {
  return ALL_SENSORS.filter(s => s.section === section);
};

export const getAnalogSensors = (section: SectionType, subsection?: string): ShahpurSensor[] => {
  return ALL_SENSORS.filter(s => 
    s.section === section && 
    s.type === 'analog' && 
    (!subsection || s.subsection === subsection)
  );
};

export const getPumpSensors = (section: SectionType): ShahpurSensor[] => {
  return ALL_SENSORS.filter(s => s.section === section && s.instrumentType === 'pump');
};

// Valid MQTT keys per section
export const VALID_OHT_KEYS = [
  'OHT_PT_1', 'OHT_PT_2', 'OHT_LT', 'OHT_FLOW', 'OHT_POSICUMVALUE', 'OHT_DECPOSICUMVALUE',
  // Backward compatibility / alias keys
  'PT', 'PT_01', 'LT', 'LEVEL', 'FLOW', 'TOTALIZER',
];

export const VALID_INTAKE_KEYS = [
  'INTAKEPT1', 'INTAKEPT2', 'INTAKEHDPT1', 'INTAKERLT',
  'INFLOW1', 'INTotalizer1H', 'INTotalizer1L',
  'OUTFLOW2', 'OUTTotalizer1H', 'OUTToalizer1L', 'OUTTotalizer1L',
  // Backward compatibility / aliases
  'PT_1', 'PT_2', 'PT_3', 'RLT', 'EFM', 'EFM_FLOW',
];

export const VALID_WTP_KEYS = [
  'BW_LT', 'CWR_LT', 'PT_1', 'PT_2', 'PT_3',
  'RW_PH', 'RW_TB', 'RAW_EFM_FLOW', 'RAW_EFM',
  'CWR_PH', 'CWR_CL', 'CWR_TB', 'CWR_TEM',
  'CLR_EFM', 'CLR_EFM_FLOW',
];
