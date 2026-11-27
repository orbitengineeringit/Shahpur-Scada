import type { TagData } from '@/contexts/ScadaContext';
import { getTagConnection } from '@/hooks/useTagConnection';

type Pair<T> = readonly [T, T];
type TransferBank<T> = readonly [T, T, T];
type DosingBank<T> = readonly [T, T, T, T, T, T];
type Slots<T extends readonly unknown[]> = { [Index in keyof T]?: T[Index] };
type Reading = number | null;
type Feedback = boolean | null;

export type WtpFilterMode = 'idle' | 'filter' | 'air-scour' | 'backwash' | 'rinse';
export type WtpPumpState = 'Run' | 'Off' | 'Trip' | 'Conflict' | 'Fault' | 'Stale' | 'No data';
export type WtpValveFeedback = {
  name: string;
  position: 'Open' | 'Closed' | 'Unconfirmed' | 'Conflict' | 'Stale' | 'No data' | 'Fault';
  remote: Feedback;
  trip: Feedback;
};

type DriveTags = { run?: string; trip?: string; rpm?: string };
type FilterTags = {
  flow?: string;
  washFlow?: string;
  wasteFlow?: string;
  phase?: { tag: string; values: Readonly<Partial<Record<number, WtpFilterMode>>> };
  inletOpen?: string;
  outletOpen?: string;
  wasteOpen?: string;
  backwashInletOpen?: string;
};

/** Values in the map are confirmed SCADA tag IDs, with discrete feedback normalized to 0/1. */
export type WtpProcessTagMap = {
  inletFlow?: string;
  outletFlow?: string;
  clearInflow?: string;
  contactFlow?: string;
  bypassFlow?: string;
  sludgeFlow?: string;
  chlorineFlow?: string;
  backwashTankOutflow?: string;
  filters?: Slots<Pair<FilterTags>>;
  mixer?: DriveTags;
  clarifier?: DriveTags;
  sludge?: DriveTags;
  chlorine?: DriveTags;
  dosing?: Slots<DosingBank<DriveTags & { flow?: string; level?: string; mixer?: DriveTags }>>;
  backwashPumps?: Slots<Pair<DriveTags>>;
  blowers?: Slots<Pair<DriveTags>>;
  transferPumps?: Slots<TransferBank<DriveTags>>;
  bypassOpen?: string;
  sludgeOpen?: string;
};

export type WtpProcessActivity = {
  fieldValves: WtpValveFeedback[];
  fieldDrives: { name: string; state: WtpPumpState }[];
  filters: Pair<WtpFilterMode | null>;
  inletFlow: Feedback;
  outletFlow: Feedback;
  clearInflow: Feedback;
  contactFlow: Feedback;
  bypassFlow: Feedback;
  sludgeFlow: Feedback;
  chlorineFeeding: Feedback;
  backwashTankOutflow: Feedback;
  estimated: {
    upstreamFlow: boolean;
    sludgeDraw: boolean;
    chlorineFeed: boolean;
    transferBranch: Pair<boolean>;
  };
  mixing: Feedback;
  clarifying: Feedback;
  dosing: DosingBank<Feedback>;
  backwashPumps: Pair<Feedback>;
  blowers: Pair<Feedback>;
  driveStates: {
    mixer: WtpPumpState;
    clarifier: WtpPumpState;
    sludge: WtpPumpState;
    chlorine: WtpPumpState;
    dosing: DosingBank<WtpPumpState>;
    dosingMixers: DosingBank<WtpPumpState>;
    backwashPumps: Pair<WtpPumpState>;
    blowers: Pair<WtpPumpState>;
  };
  pumpStates: TransferBank<WtpPumpState>;
  rates: {
    inlet: Reading;
    outlet: Reading;
    clearInflow: Reading;
    contact: Reading;
    bypass: Reading;
    sludge: Reading;
    chlorine: Reading;
    backwashTankOutflow: Reading;
    filterBed: Pair<Reading>;
    dosing: DosingBank<Reading>;
    backwash: Pair<Reading>;
    washToWaste: Pair<Reading>;
  };
  rpm: {
    mixer: Reading;
    clarifier: Reading;
    sludge: Reading;
    dosing: DosingBank<Reading>;
    dosingMixers: DosingBank<Reading>;
    backwashPumps: Pair<Reading>;
    blowers: Pair<Reading>;
    transferPumps: TransferBank<Reading>;
  };
  dosingLevels: DosingBank<Reading>;
  valves: {
    filterInlet: Pair<Feedback>;
    filterOutlet: Pair<Feedback>;
    filterWaste: Pair<Feedback>;
    backwashInlet: Pair<Feedback>;
    bypass: Feedback;
    sludge: Feedback;
  };
};

type UnavailableStatus = 'Fault' | 'Stale' | 'No data';

export type WtpReading = {
  value: Reading;
  unit: string;
  status: UnavailableStatus;
};

export function readWtpTelemetry(tag?: TagData): WtpReading {
  const unit = tag?.unit ?? '';
  if (!tag || tag.source === 'simulated' || tag.notInstalled || tag.status === 'unknown') {
    return { value: null, unit, status: 'No data' };
  }
  const connection = getTagConnection(tag);
  if (connection === 'stale') return { value: null, unit, status: 'Stale' };
  if (connection === 'fault') return { value: null, unit, status: 'Fault' };
  if (connection === 'no-data') return { value: null, unit, status: 'No data' };
  if (!Number.isFinite(tag.value)) return { value: null, unit, status: 'Fault' };
  return { value: tag.value, unit, status: 'No data' };
}

function two<T>(get: (index: number) => T): Pair<T> {
  return [get(0), get(1)];
}

function three<T>(get: (index: number) => T): TransferBank<T> {
  return [get(0), get(1), get(2)];
}

function six<T>(get: (index: number) => T): DosingBank<T> {
  return [get(0), get(1), get(2), get(3), get(4), get(5)];
}

function digital(value: Reading): Feedback {
  if (value === 0) return false;
  if (value === 1) return true;
  return null;
}

function hasFlow(value: Reading): Feedback {
  return value === null || value < 0 ? null : value > 0;
}

function isRunning(state: WtpPumpState): Feedback {
  if (state === 'Run') return true;
  if (state === 'Off' || state === 'Trip') return false;
  return null;
}

const transferPumpTags: Slots<TransferBank<DriveTags>> = [
  { run: 'WTP-Pump1', trip: 'WTP-Trip1' },
  { run: 'WTP-Pump2', trip: 'WTP-Trip2' },
];

function plcDrive(prefix: string, trip = prefix + '_TRIP_FB'): DriveTags {
  return { run: 'WTP-' + prefix + '_RUN_FB', trip: 'WTP-' + trip };
}

const dosingAgitators = [
  plcDrive('ALUM_AG01'), plcDrive('ALUM_AG02', 'ALUM_AG02TRIP_FB'),
  plcDrive('LIME_AG01'), plcDrive('LIME_AG02'),
];

const fieldDrives = [
  ['Recycle 01', 'RECYCLE_PUMP01'], ['Recycle 02', 'RECYCLE_PUMP02'],
  ['Sludge pump', 'SLDP_PUMP'], ['Air blower', 'AIR_BLOWER'],
  ['Pre-Cl 01', 'PRE_CL01'], ['Pre-Cl 02', 'PRE_CL02'],
  ['Post-Cl 01', 'POST_CL01'], ['Post-Cl 02', 'POST_CL02'],
] as const;

export function deriveWtpProcessActivity(tags: readonly TagData[], mapping: WtpProcessTagMap = {}): WtpProcessActivity {
  const indexed = new Map(tags.map(tag => [tag.id, tag]));
  const read = (id?: string) => readWtpTelemetry(id === undefined ? undefined : indexed.get(id));
  const value = (id?: string) => read(id).value;
  const bit = (id?: string) => digital(value(id));
  const rpm = (drive?: DriveTags) => {
    const reading = value(drive?.rpm);
    return reading !== null && reading >= 0 ? reading : null;
  };

  function driveState(drive?: DriveTags): WtpPumpState {
    const trip = read(drive?.trip);
    const run = read(drive?.run);
    if (trip.value === 1 && run.value === 1) return 'Conflict';
    if (trip.value === 1) return 'Trip';
    if (trip.status === 'Fault' || run.status === 'Fault') return 'Fault';
    if (run.value !== null && digital(run.value) === null) return 'Fault';
    if (drive?.trip && trip.value === null && run.value !== null) return trip.status;
    if (trip.value !== null && digital(trip.value) === null) return 'Fault';
    if (run.value === 1) return 'Run';
    if (run.value === 0) return 'Off';
    return run.status;
  }

  function fieldValve(index: number): WtpValveFeedback {
    const prefix = 'WTP-' + (index <= 2 ? 'CWR_' : '') + 'VALVE' + index;
    const opened = read(prefix + '_OPEN_FB');
    const closed = read(prefix + '_CLOSE_FB');
    let position: WtpValveFeedback['position'];
    if (opened.status === 'Fault' || closed.status === 'Fault') position = 'Fault';
    else if (opened.status === 'Stale' || closed.status === 'Stale') position = 'Stale';
    else if (opened.value === null || closed.value === null) position = 'No data';
    else if (digital(opened.value) === null || digital(closed.value) === null) position = 'Fault';
    else if (opened.value && closed.value) position = 'Conflict';
    else position = opened.value ? 'Open' : closed.value ? 'Closed' : 'Unconfirmed';
    return { name: (index <= 2 ? 'CWR V' : 'Valve ') + index, position,
      trip: bit(prefix + '_TRIP_FB'), remote: bit(prefix + '_REMOTE_FB') };
  }

  const transferMapping = three(i => ({ ...transferPumpTags[i], ...mapping.transferPumps?.[i] }));
  const filterFlow = two(i => value(mapping.filters?.[i]?.flow ?? (i === 0 ? 'WTP-ROF-FB1' : undefined)));
  const valves = {
    filterInlet: two(i => bit(mapping.filters?.[i]?.inletOpen)),
    filterOutlet: two(i => bit(mapping.filters?.[i]?.outletOpen)),
    filterWaste: two(i => bit(mapping.filters?.[i]?.wasteOpen)),
    backwashInlet: two(i => bit(mapping.filters?.[i]?.backwashInletOpen)),
    bypass: bit(mapping.bypassOpen),
    sludge: bit(mapping.sludgeOpen),
  };
  const filters = two(i => {
    const phase = mapping.filters?.[i]?.phase;
    if (phase) {
      const code = value(phase.tag);
      return code === null ? null : phase.values[code] ?? null;
    }
    // Flow can show filtration on the measured bed. Zero flow alone cannot identify the phase.
    return hasFlow(filterFlow[i]) && valves.filterInlet[i] !== false ? 'filter' : null;
  });
  const driveStates = {
    mixer: driveState(mapping.mixer ?? plcDrive('FLASH_MIXER')),
    clarifier: driveState(mapping.clarifier),
    sludge: driveState(mapping.sludge),
    chlorine: driveState(mapping.chlorine),
    dosing: six(i => driveState(mapping.dosing?.[i])),
    dosingMixers: six(i => driveState(mapping.dosing?.[i]?.mixer ?? dosingAgitators[i])),
    backwashPumps: two(i => driveState(mapping.backwashPumps?.[i])),
    blowers: two(i => driveState(mapping.blowers?.[i])),
  };
  const rates = {
    inlet: value(mapping.inletFlow),
    outlet: value(mapping.outletFlow ?? 'WTP-Flow-OUT'),
    clearInflow: value(mapping.clearInflow),
    contact: value(mapping.contactFlow),
    bypass: value(mapping.bypassFlow),
    sludge: value(mapping.sludgeFlow),
    chlorine: value(mapping.chlorineFlow),
    backwashTankOutflow: value(mapping.backwashTankOutflow),
    filterBed: filterFlow,
    dosing: six(i => value(mapping.dosing?.[i]?.flow)),
    backwash: two(i => value(mapping.filters?.[i]?.washFlow)),
    washToWaste: two(i => value(mapping.filters?.[i]?.wasteFlow)),
  };
  const reportedDrives = fieldDrives.map(([name, prefix]) => ({ name, state: driveState(plcDrive(prefix)) }));
  const reportedRunning = (name: typeof fieldDrives[number][0]) =>
    reportedDrives.some(drive => drive.name === name && drive.state === 'Run');
  const pumpStates = three(i => driveState(transferMapping[i]));
  const transferRpm = three(i => rpm(transferMapping[i]));
  const outletFlow = hasFlow(rates.outlet);
  // Hydraulic estimates are used only for drawing motion. Mapped flow meters stay authoritative.
  const estimated = {
    upstreamFlow: !mapping.inletFlow && filters.some((phase, i) =>
      phase === 'filter' && hasFlow(filterFlow[i]) === true &&
      valves.filterInlet[i] !== false && valves.filterOutlet[i] !== false &&
      valves.filterWaste[i] !== true && valves.backwashInlet[i] !== true),
    sludgeDraw: !mapping.sludgeFlow && valves.sludge !== false &&
      (mapping.sludge ? driveStates.sludge === 'Run' : reportedRunning('Sludge pump')),
    chlorineFeed: !mapping.chlorineFlow &&
      (mapping.chlorine ? driveStates.chlorine === 'Run' : reportedRunning('Post-Cl 01') || reportedRunning('Post-Cl 02')),
    // The common outlet meter can identify a likely branch only when one monitored pump is running.
    transferBranch: two(i => outletFlow === true && pumpStates[i] === 'Run' && transferRpm[i] !== 0 &&
      pumpStates.every((state, index) => index === i || state === 'Off' || state === 'Trip' ||
        (index === 2 && !transferMapping[index].run && !transferMapping[index].trip))),
  };

  return {
    fieldValves: [1,2,3,4,5,6,7].map(fieldValve),
    fieldDrives: reportedDrives,
    filters,
    inletFlow: hasFlow(rates.inlet),
    outletFlow,
    clearInflow: hasFlow(rates.clearInflow),
    contactFlow: hasFlow(rates.contact),
    bypassFlow: hasFlow(rates.bypass),
    sludgeFlow: hasFlow(rates.sludge),
    chlorineFeeding: hasFlow(rates.chlorine),
    backwashTankOutflow: hasFlow(rates.backwashTankOutflow),
    estimated,
    mixing: isRunning(driveStates.mixer),
    clarifying: isRunning(driveStates.clarifier),
    dosing: six(i => isRunning(driveStates.dosing[i])),
    backwashPumps: two(i => isRunning(driveStates.backwashPumps[i])),
    blowers: two(i => isRunning(driveStates.blowers[i])),
    driveStates,
    pumpStates,
    rates,
    rpm: {
      mixer: rpm(mapping.mixer),
      clarifier: rpm(mapping.clarifier),
      sludge: rpm(mapping.sludge),
      dosing: six(i => rpm(mapping.dosing?.[i])),
      dosingMixers: six(i => rpm(mapping.dosing?.[i]?.mixer)),
      backwashPumps: two(i => rpm(mapping.backwashPumps?.[i])),
      blowers: two(i => rpm(mapping.blowers?.[i])),
      transferPumps: transferRpm,
    },
    dosingLevels: six(i => value(mapping.dosing?.[i]?.level)),
    valves,
  };
}
