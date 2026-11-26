import { useEffect, useState, type ReactNode } from 'react';
import WtpPlantDrawing from './WtpPlantDrawing';
import { useScada } from '@/contexts/ScadaContext';
import { getTagConnection } from '@/hooks/useTagConnection';
import { deriveWtpProcessActivity, readWtpTelemetry, type WtpPumpState, type WtpValveFeedback } from '@/lib/wtpProcessActivity';
import './WtpProcessSimulation.css';

const WIDTH = 1672;
const HEIGHT = 941;

type Reading = ReturnType<typeof readWtpTelemetry>;

const format = (value: number, decimals: number) => value.toLocaleString('en-IN', {
  maximumFractionDigits: decimals,
  minimumFractionDigits: decimals,
});

function ReadingValue({ reading, decimals = 1 }: { reading: Reading; decimals?: number }) {
  if (reading.value === null) {
    return <span className="wtp-reading-unavailable" data-status={reading.status}>{reading.status}</span>;
  }
  return (
    <span className="wtp-reading-value">
      {format(reading.value, decimals)}{reading.unit && <small> {reading.unit}</small>}
    </span>
  );
}

function MapLabel({ x, y, kind = 'equipment', children }: {
  x: number;
  y: number;
  kind?: 'equipment' | 'tank' | 'readout' | 'pump' | 'outlet' | 'sight-glass';
  children: ReactNode;
}) {
  return (
    <div className={`wtp-map-label wtp-map-label--${kind}`}
      style={{ left: `${x / WIDTH * 100}%`, top: `${y / HEIGHT * 100}%` }}>
      {children}
    </div>
  );
}

function MapReading({ label, reading, decimals }: { label: string; reading: Reading; decimals?: number }) {
  return (
    <div className="wtp-map-reading">
      <span>{label}</span>
      <ReadingValue reading={reading} decimals={decimals} />
    </div>
  );
}

const levelFill = (value: number) => `${Math.max(0, Math.min(100, value))}%`;

function DeviceStatus({ state }: { state: WtpPumpState }) {
  const tone = state === 'Trip' || state === 'Fault' || state === 'Conflict' ? 'alarm'
    : state === 'Run' ? 'running' : state === 'Stale' ? 'caution' : 'neutral';
  const label = state === 'No data' ? 'Unavailable' : state === 'Off' ? 'Stopped' : state === 'Run' ? 'Running' : state;
  return <strong className="wtp-device-status" data-tone={tone} title={state === 'No data' ? 'Status unavailable' : undefined}>{label}</strong>;
}

function DeviceLabel({ x, y, name, state, pressure }: {
  x: number; y: number; name: string; state: WtpPumpState; pressure?: Reading;
}) {
  return (
    <MapLabel x={x} y={y} kind="pump">
      <span>{name}</span>
      <DeviceStatus state={state} />
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
function ValveIndicator({ valve }: { valve: WtpValveFeedback }) {
  return <div className="wtp-valve-indicator" data-position={valve.position}>
    <span><svg viewBox="0 0 24 18" aria-hidden="true"><path d="M2 8v8l10-4 10 4V8l-10 4zM12 12V4M7 3h10" fill="none" stroke="currentColor" strokeWidth="2"/></svg>{valve.name}</span>
    <strong>{valve.position}</strong>
    <small>{valve.trip === true ? 'Trip' : valve.trip === false ? 'No trip' : 'Trip —'} · {valve.remote === true ? 'Remote' : valve.remote === false ? 'Remote off' : 'Mode —'}</small>
  </div>;
}

export default function WtpProcessSimulation({ paused, controls }: { paused: boolean; controls: ReactNode }) {
  const { wtpTags } = useScada();
  // Refresh once a tag ages into a different quality band, even when packets have stopped.
  const [, setQuality] = useState('');

  useEffect(() => {
    const refresh = () => setQuality(wtpTags.map(tag => getTagConnection(tag)).join(','));
    refresh();
    const interval = window.setInterval(refresh, 1000);
    return () => window.clearInterval(interval);
  }, [wtpTags]);

  const activity = deriveWtpProcessActivity(wtpTags);
  const read = (id: string) => readWtpTelemetry(wtpTags.find(tag => tag.id === `WTP-${id}`));
  const inletTurbidity = read('TA-IN');
  const filterFlow = read('ROF-FB1');
  const outletFlow = read('Flow-OUT');
  const backwashLevel = read('LT-BW');
  const clearWaterLevel = read('LT-CW');
  const pressure1 = read('PT1');
  const pressure2 = read('PT2');
  const headerPressure = read('HeaderPT');
  const [pump1, pump2] = activity.pumpStates;
  const blower = activity.fieldDrives.find(d => d.name === 'Air blower')!;
  const sludge = activity.fieldDrives.find(d => d.name === 'Sludge pump')!;
  const outletReadings = [
    { label: 'Outlet flow', reading: outletFlow, decimals: 1 },
    { label: 'Outlet pH', reading: read('PH'), decimals: 2 },
    { label: 'Outlet chlorine', reading: read('CL'), decimals: 2 },
    { label: 'Outlet turbidity', reading: read('TA'), decimals: 2 },
    { label: 'Outlet totalizer', reading: read('Totalizer-OUT'), decimals: 2 },
    { label: 'OCFM', reading: read('OCFM'), decimals: 2 },
    { label: 'Pressure transmitter 3', reading: read('PLC-PT3'), decimals: 2 },
  ];

  return (
    <section className="wtp-process" aria-label="WTP live process">
      <div className="wtp-process-controls">{controls}</div>
      <div className="wtp-process-stage">
        <div className="wtp-process-drawing" id="wtp-process-drawing" data-paused={paused}>
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
            {backwashLevel.value !== null && (
              <div className="wtp-level-track" aria-hidden="true">
                <div style={{ width: levelFill(backwashLevel.value) }} />
              </div>
            )}
          </MapLabel>
          <div className="wtp-valve-bank wtp-general-valves" role="group" aria-label="Valves 3 to 7, branch assignment unverified">
            <span className="wtp-valve-caption">Valve feedback · branch unverified</span>
            {activity.fieldValves.slice(2).map(valve => <ValveIndicator key={valve.name} valve={valve} />)}
          </div>

          <MapLabel x={237} y={402} kind="readout">
            <MapReading label="Inlet pH" reading={read('PH-IN')} decimals={2} />
            <MapReading label="Inlet turbidity" reading={inletTurbidity} />
          </MapLabel>
          <MapLabel x={90} y={468}>Raw Water Inlet</MapLabel>
          <MapLabel x={241} y={578}>Raw Water Channel</MapLabel>
          <DeviceLabel x={528} y={615} name="Flash Mixer" state={activity.driveStates.mixer} />
          <MapLabel x={854} y={650}>Clariflocculator</MapLabel>

          {activity.filters.map((filter, index) => (
            <MapLabel key={index} x={1405} y={index === 0 ? 351 : 530}>
              Filter 0{index + 1}{filter ? ' · ' + filterModeLabel[filter] : ''}
            </MapLabel>
          ))}
          <MapLabel x={1405} y={493} kind="readout">
            <MapReading label="Flow" reading={filterFlow} />
            <MapReading label="Loss of head" reading={read('LOH-FB1')} />
          </MapLabel>
          <MapLabel x={1405} y={660} kind="readout">
            <MapReading label="Loss of head" reading={read('LOH-FB2')} />
          </MapLabel>
          <MapLabel x={1603} y={704}>Filter Bypass</MapLabel>

          <DeviceLabel x={200} y={753} name={blower.name} state={blower.state} />
          <MapLabel x={720} y={772}>Sludge Recirculation Sump</MapLabel>
          <DeviceLabel x={897} y={767} name={sludge.name} state={sludge.state} />
          <MapLabel x={148} y={839}>Chlorine Feed</MapLabel>
          <MapLabel x={425} y={918}>Chlorine Contact Chamber</MapLabel>
          <div className="wtp-valve-bank wtp-cwr-valves" role="group" aria-label="Clear water reservoir valve feedback">
            {activity.fieldValves.slice(0, 2).map(valve => <ValveIndicator key={valve.name} valve={valve} />)}
          </div>
          <MapLabel x={910} y={917}>Clear Water Storage Tank</MapLabel>
          <MapLabel x={909} y={824} kind="readout"><MapReading label="Level" reading={clearWaterLevel} /></MapLabel>
          <MapLabel x={1115.5} y={869.5} kind="sight-glass">
            {clearWaterLevel.value !== null && <span aria-hidden="true" style={{ height: levelFill(clearWaterLevel.value) }} />}
          </MapLabel>

          <MapLabel x={1368} y={780} kind="readout">
            <span className="wtp-readout-title">Clear Water Transfer Pumps</span>
            {(headerPressure.value !== null || headerPressure.status !== 'No data') && <MapReading label="Header pressure" reading={headerPressure} decimals={2} />}
          </MapLabel>
          <DeviceLabel x={1294} y={907} name="CWR Pump 01" state={pump1} pressure={pressure1} />
          <DeviceLabel x={1430} y={907} name="CWR Pump 02" state={pump2} pressure={pressure2} />
          <MapLabel x={1584} y={859} kind="outlet">To ESR</MapLabel>
        </div>
      </div>
      <dl className="wtp-outlet-readings" aria-label="Outlet and PLC measurements">
        {outletReadings.map(({ label, reading, decimals }) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd><ReadingValue reading={reading} decimals={decimals} /></dd>
          </div>
        ))}
      </dl>
      <div className="wtp-field-feedback" aria-label="PLC equipment and valve feedback">
        <div className="wtp-field-row wtp-field-drives" aria-label="Drive feedback">
          {activity.fieldDrives.filter(d => d !== blower && d !== sludge).map(({name, state}) => <div key={name}>
            <span>{name}</span><DeviceStatus state={state} />
          </div>)}
        </div>

      </div>
    </section>
  );
}
