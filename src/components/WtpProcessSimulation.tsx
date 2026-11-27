import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import WtpPlantDrawing from './WtpPlantDrawing';
import { wtpProcessReadouts, type WtpProcessActivity, type WtpReading, type WtpPumpState, type WtpValveFeedback } from '@/lib/wtpProcessActivity';
import './WtpProcessSimulation.css';

const WIDTH = 1672;
const HEIGHT = 941;
const processViews = [
  { id: 'overview', label: 'Full plant', x: 0, y: 0 }, { id: 'dosing', label: 'Dosing', x: 480, y: 175 },
  { id: 'mixing', label: 'Mixing', x: 670, y: 480 }, { id: 'filters', label: 'Filters', x: 1410, y: 430 },
  { id: 'clear-water', label: 'Clear water', x: 1230, y: 820 },
];

type Reading = WtpReading;

const format = (value: number, decimals: number) => value.toLocaleString('en-IN', {
  maximumFractionDigits: decimals,
  minimumFractionDigits: decimals,
});

function ReadingValue({ reading, decimals = 1 }: { reading: Reading; decimals?: number }) {
  if (reading.value === null) return null;
  return (
    <span className="wtp-reading-value">
      {format(reading.value, decimals)}{reading.unit && <small> {reading.unit}</small>}
    </span>
  );
}

function MapLabel({ x, y, kind = 'equipment', active, children }: {
  x: number;
  y: number;
  active?: boolean;
  kind?: 'equipment' | 'tank' | 'readout' | 'pump' | 'outlet' | 'sight-glass';
  children: ReactNode;
}) {
  return (
    <div className={`wtp-map-label wtp-map-label--${kind}`} data-active={active}
      style={{ left: `${x / WIDTH * 100}%`, top: `${y / HEIGHT * 100}%` }}>
      {children}
    </div>
  );
}

function MapReading({ label, reading, decimals }: { label: string; reading: Reading; decimals?: number }) {
  if (reading.value === null) return null;
  return (
    <div className="wtp-map-reading">
      <span>{label}</span>
      <ReadingValue reading={reading} decimals={decimals} />
    </div>
  );
}

const levelFraction = (value: number) => Math.max(0, Math.min(100, value)) / 100;

export function WtpDriveStatus({ state }: { state: WtpPumpState }) {
  if (state !== 'Run' && state !== 'Off' && state !== 'Trip') return null;
  const tone = state === 'Trip' ? 'alarm' : state === 'Run' ? 'running' : 'neutral';
  return <strong className="wtp-device-status" data-tone={tone}>{state === 'Run' ? 'ON' : state.toUpperCase()}</strong>;
}

function DeviceLabel({ x, y, name, state, pressure }: {
  x: number; y: number; name: string; state: WtpPumpState; pressure?: Reading;
}) {
  return (
    <MapLabel x={x} y={y} kind="pump" active={state === 'Run'}>
      <span>{name}</span>
      <WtpDriveStatus state={state} />
      {pressure && <ReadingValue reading={pressure} decimals={2} />}
    </MapLabel>
  );
}

const dosingTanks = [
  { x: 175, name: 'Alum 1' }, { x: 302, name: 'Alum 2' },
  { x: 430, name: 'Lime 1' }, { x: 555, name: 'Lime 2' },
  { x: 685, name: 'PE 1' }, { x: 813, name: 'PE 2' },
];

const filterModeLabel = { filter: 'Flow detected', backwash: 'Backwashing', 'air-scour': 'Air scour', rinse: 'Rinse', idle: 'Idle' };

function LevelTrack({ value }: { value: number }) {
  return <div className="wtp-level-track" aria-hidden="true">
    <div style={{ transform: `scaleX(${levelFraction(value)})` }} />
  </div>;
}

function ValveIndicator({ valve }: { valve: WtpValveFeedback }) {
  const confirmed = valve.position === 'Open' || valve.position === 'Closed';
  return <div className="wtp-valve-indicator" data-position={valve.position} data-trip={valve.trip === true}>
    <span>{valve.name}</span>
    <svg viewBox="0 0 62 36" aria-hidden="true" className="wtp-valve-drawing">
      <path d="M2 25H60" stroke="#284857" strokeWidth="10" />
      <path d="M2 23H60" stroke="#7ca8ba" strokeWidth="3" />
      <path d="M12 18v14m38-14v14" stroke="#426274" strokeWidth="5" />
      <rect x="16" y="15" width="30" height="19" rx="7" fill="#29485b" stroke="#8aa5b2" strokeWidth="1.5" />
      <path d="M31 8v14" stroke="#8aa5b2" strokeWidth="3" />
      <rect x="21" y="2" width="20" height="10" rx="3" fill="#285974" stroke="#77a9bf" />
      <circle cx="35" cy="7" r="2.5" fill="currentColor" />
      <circle cx="31" cy="25" r="6" fill="#0c2736" />
      {confirmed
        ? <path className="wtp-valve-disc" d="M25 25h12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        : <path d="M27 25h8" stroke="currentColor" strokeWidth="2" strokeDasharray="2 2" />}
    </svg>
    <WtpValveStatus valve={valve} />
  </div>;
}

export function WtpValveStatus({ valve }: { valve: WtpValveFeedback }) {
  return <>
    {(valve.position === 'Open' || valve.position === 'Closed') && <strong data-valve-position={valve.position}>{valve.position}</strong>}
    {(valve.trip === true || valve.remote !== null) && <small className="wtp-valve-status">
      {valve.trip === true && <span data-trip="true">TRIP</span>}
      {valve.remote !== null && <span>{valve.remote ? 'Remote' : 'Remote off'}</span>}
    </small>}
  </>;
}

function DriveRotor() {
  return <svg className="wtp-drive-icon" viewBox="0 0 28 24" aria-hidden="true">
    <rect x="1" y="4" width="23" height="16" rx="5" fill="#23506c" stroke="#7294a9" />
    <path d="M5 8v8m3-8v8m3-8v8" stroke="#9cbac9" strokeWidth="1.2" />
    <circle cx="20" cy="12" r="7" fill="#123347" stroke="#82a5b8" />
    <g className="wtp-drive-rotor" fill="currentColor">
      <path d="M20 11c-4-1-4-5-1-4l2 4c4-1 6 2 3 3l-4-1c-1 4-5 4-5 1l4-2z" />
      <circle cx="20" cy="12" r="1.6" />
    </g>
  </svg>;
}

export default function WtpProcessSimulation({ paused, controls, activity, readings }: {
  paused: boolean; controls: ReactNode; activity: WtpProcessActivity; readings: ReadonlyMap<string, WtpReading>;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef<HTMLDivElement>(null);
  const [processView, setProcessView] = useState(0);
  useLayoutEffect(() => {
    const stage = stageRef.current;
    const drawing = drawingRef.current;
    if (!stage || !drawing) return;
    const align = () => {
      const { x, y } = processViews[processView];
      stage.scrollTo({
        left: Math.max(0, x / WIDTH * drawing.offsetWidth - stage.clientWidth / 2),
        top: Math.max(0, y / HEIGHT * drawing.offsetHeight - stage.clientHeight / 2),
      });
    };
    align();
    const observer = new ResizeObserver(align);
    observer.observe(stage);
    observer.observe(drawing);
    return () => observer.disconnect();
  }, [processView]);
  const read = (key: keyof typeof wtpProcessReadouts): Reading =>
    readings.get(wtpProcessReadouts[key].id) ?? { value: null, unit: '', status: 'No data' };
  const inletTurbidity = read('inletTurbidity');
  const inletPh = read('inletPh');
  const filterFlow = read('filterFlow');
  const filterHead1 = read('filterHead1');
  const filterHead2 = read('filterHead2');
  const backwashLevel = read('backwashLevel');
  const clearWaterLevel = read('clearWaterLevel');
  const pressure1 = read('pressure1');
  const pressure2 = read('pressure2');
  const headerPressure = read('headerPressure');
  const [pump1, pump2] = activity.pumpStates;
  const blower = activity.fieldDrives.find(d => d.name === 'Air blower')!;
  const sludge = activity.fieldDrives.find(d => d.name === 'Sludge pump')!;
  const waterReadouts = Object.values(wtpProcessReadouts);
  const alwaysShown = (entry: typeof waterReadouts[number]) =>
    entry.group === 'outlet' || entry.group === 'process-instruments';

  return (
    <section className="wtp-process" aria-label="WTP live process" data-paused={paused}>
      <div className="wtp-process-controls">{controls}</div>
      <div className="wtp-map-navigation" role="group" aria-label="Focus a process area">
        {processViews.map(({ label }, index) => <button key={label} type="button"
          aria-controls="wtp-process-drawing" aria-pressed={processView === index} onClick={() => setProcessView(index)}>
          {label}
        </button>)}
      </div>
      <div ref={stageRef} className="wtp-process-stage" data-zoomed={processView !== 0} data-focus={processViews[processView].id}
        tabIndex={processView ? 0 : undefined} aria-label={processView ? 'Scrollable plant detail' : undefined}>
        <div ref={drawingRef} className="wtp-process-drawing" id="wtp-process-drawing" data-paused={paused}>
          <WtpPlantDrawing activity={activity}
            pressure1={pressure1.value} pressure2={pressure2.value} headerPressure={headerPressure.value}
            clearLevel={clearWaterLevel.value} backwashLevel={backwashLevel.value}
            inletTurbidity={inletTurbidity.value} />
          <MapLabel x={483} y={19}>Alum, lime and PE dosing</MapLabel>
          {dosingTanks.map(({ x, name }, index) => (
            index >= 4 ? <MapLabel key={name} x={x} y={179}>{name}</MapLabel> : <DeviceLabel key={name} x={x} y={179} name={`${name} agitator`} state={activity.driveStates.dosingMixers[index]} />
          ))}

          <MapLabel x={1084} y={98} kind="readout">
            <span className="wtp-readout-title">Backwash Water Tank</span>
            <MapReading label="Level" reading={backwashLevel} />
            {backwashLevel.value !== null && <LevelTrack value={backwashLevel.value} />}
          </MapLabel>
          <div className="wtp-valve-bank wtp-general-valves" role="group" aria-label="Valves 3 to 7, branch assignment unverified">
            <span className="wtp-valve-caption">PLC valves · branch locations unverified</span>
            {activity.fieldValves.slice(2).map(valve => <ValveIndicator key={valve.name} valve={valve} />)}
          </div>
          {activity.driveStates.backwashPumps.map((state, index) =>
            <DeviceLabel key={index} x={index === 0 ? 1275 : 1424} y={266} name={`Backwash pump ${index + 1}`} state={state} />)}

          {(inletPh.value !== null || inletTurbidity.value !== null) && <MapLabel x={237} y={402} kind="readout">
            <MapReading label="Inlet pH" reading={inletPh} decimals={2} />
            <MapReading label="Inlet turbidity" reading={inletTurbidity} />
          </MapLabel>}
          <MapLabel x={90} y={468}>Raw Water Inlet</MapLabel>
          <MapLabel x={241} y={578}>Raw Water Channel</MapLabel>
          <DeviceLabel x={528} y={615} name="Flash Mixer" state={activity.driveStates.mixer} />
          <DeviceLabel x={854} y={650} name="Clariflocculator" state={activity.driveStates.clarifier} />

          {activity.filters.map((filter, index) => (
            <MapLabel key={index} x={1405} y={index === 0 ? 351 : 530} active={filter !== null && filter !== 'idle'}>
              Filter 0{index + 1}{filter ? ' · ' + filterModeLabel[filter] : ''}
            </MapLabel>
          ))}
          {(filterFlow.value !== null || filterHead1.value !== null) && <MapLabel x={1405} y={486} kind="readout">
            <MapReading label="Flow" reading={filterFlow} />
            <MapReading label="Loss of head" reading={filterHead1} />
          </MapLabel>}
          {filterHead2.value !== null && <MapLabel x={1405} y={660} kind="readout">
            <MapReading label="Loss of head" reading={filterHead2} />
          </MapLabel>}
          <MapLabel x={1603} y={704}>Filter Bypass</MapLabel>

          <DeviceLabel x={200} y={753} name={blower.name} state={blower.state} />
          <MapLabel x={720} y={772}>Sludge Recirculation Sump</MapLabel>
          <DeviceLabel x={897} y={767} name={sludge.name} state={sludge.state} />
          <MapLabel x={148} y={839}>Chlorine Feed</MapLabel>
          <MapLabel x={425} y={918}>Chlorine Contact Chamber</MapLabel>
          <MapLabel x={910} y={917}>Clear Water Storage Tank</MapLabel>
          {clearWaterLevel.value !== null && <MapLabel x={909} y={824} kind="readout">
            <MapReading label="Level" reading={clearWaterLevel} />
            <LevelTrack value={clearWaterLevel.value} />
          </MapLabel>}
          <MapLabel x={1115.5} y={869.5} kind="sight-glass">
            {clearWaterLevel.value !== null && <span className="wtp-liquid-level" aria-hidden="true"
              style={{ transform: `scaleY(${levelFraction(clearWaterLevel.value)})` }} />}
          </MapLabel>

          <MapLabel x={1368} y={780} kind="readout">
            <span className="wtp-readout-title">Clear Water Transfer Pumps</span>
            <MapReading label="Header pressure" reading={headerPressure} decimals={2} />
          </MapLabel>
          <DeviceLabel x={1294} y={907} name="CWR Pump 01" state={pump1} pressure={pressure1} />
          <DeviceLabel x={1430} y={907} name="CWR Pump 02" state={pump2} pressure={pressure2} />
          <MapLabel x={1584} y={859} kind="outlet" active={activity.outletFlow === true}>To ESR</MapLabel>
        </div>
      </div>
      <aside className="wtp-process-measurements" aria-label="Water measurements and valve feedback">
        <h3 className="wtp-measurements-heading">Water readings</h3>
        <dl className="wtp-outlet-readings" aria-label="Water measurements">
          {[...waterReadouts.filter(alwaysShown), ...waterReadouts.filter(entry => !alwaysShown(entry))].map(entry => {
            const reading = readings.get(entry.id);
            if (!reading || reading.value === null) return null;
            return <div key={entry.id} className={alwaysShown(entry) ? undefined : 'wtp-mobile-reading'}>
              <dt>{entry.label}</dt>
              <dd><ReadingValue reading={reading} decimals={entry.decimals} /></dd>
            </div>;
          })}
        </dl>
        <div className="wtp-valve-bank wtp-cwr-valves" role="group" aria-label="Clear water reservoir valve feedback">
          <span className="wtp-valve-caption">Clear water valves</span>
          {activity.fieldValves.slice(0, 2).map(valve => <ValveIndicator key={valve.name} valve={valve} />)}
        </div>
        <div className="wtp-valve-bank wtp-mobile-valves" role="group" aria-label="Valves 3 to 7, branch assignment unverified">
          <span className="wtp-valve-caption">PLC valves · branch locations unverified</span>
          {activity.fieldValves.slice(2).map(valve => <ValveIndicator key={valve.name} valve={valve} />)}
        </div>
      </aside>
      <div className="wtp-field-feedback" aria-label="PLC equipment and valve feedback">
        <div className="wtp-field-row wtp-field-drives" aria-label="Drive feedback">
          {activity.fieldDrives.filter(d => d !== blower && d !== sludge).map(({name, state}) => <div key={name} data-drive={state}>
            <DriveRotor /><span>{name}</span><WtpDriveStatus state={state} />
          </div>)}
        </div>

      </div>
    </section>
  );
}
