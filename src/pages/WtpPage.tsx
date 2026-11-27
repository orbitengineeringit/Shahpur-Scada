import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useScada, type TagData } from '@/contexts/ScadaContext';
import { getTagConnection } from '@/hooks/useTagConnection';
import StatusBar from '@/components/StatusBar';
import SensorTrendModal from '@/components/SensorTrendModal';
import InstrumentCard from '@/components/InstrumentCard';
import SortableCardGrid, { SortableItem } from '@/components/SortableCardGrid';
import SortableSectionList from '@/components/SortableSectionList';
import { WTP_SENSORS } from '@/config/shahpurSensors';
import { BarChart2, LayoutGrid, Activity, Pause, Play } from 'lucide-react';
import WtpIcon from '@/components/icons/WtpIcon';
import { Button } from '@/components/ui/button';
import WtpProcessSimulation, { WtpDriveStatus, WtpValveStatus } from '@/components/WtpProcessSimulation';
import { deriveWtpProcessActivity, isSameWtpSample, readWtpMotorState, readWtpTelemetry, wtpProcessReadouts } from '@/lib/wtpProcessActivity';
import { wtpMotorFeedback } from '../../supabase/functions/_shared/wtpEquipment';

const configuredSignalCount = WTP_SENSORS.filter(sensor => !sensor.notInstalled).length;
const motorByRun = new Map(wtpMotorFeedback.map(motor => [motor.runTag, motor]));
const valveCard = /^WTP-(?:CWR_)?VALVE([1-7])_OPEN_FB$/;
const processReadouts = Object.values(wtpProcessReadouts);
const readoutById = new Map<string, typeof processReadouts[number]>(processReadouts.map(readout => [readout.id, readout]));
const cardSensors = WTP_SENSORS.filter(sensor => !sensor.notInstalled).map(sensor => {
  const readout = readoutById.get(sensor.id);
  return readout ? { ...sensor, label: readout.label } : sensor;
});
const sensorMap = new Map(cardSensors.map(sensor => [sensor.id, sensor]));
const sectionIds = [
  { id: 'raw-water', name: 'Raw Water / Inlet' },
  { id: 'mixing-dosing', name: 'Mixing and Dosing', feedback: /^(FLASH_MIXER|ALUM_AG|LIME_AG|PRE_CL|POST_CL)/ },
  { id: 'backwash', name: 'Backwash' },
  { id: 'filter-bed', name: 'Filter Bed', feedback: /^AIR_BLOWER/ },
  { id: 'sludge', name: 'Sludge Recirculation', feedback: /^(SLDP_PUMP|RECYCLE_PUMP)/ },
  { id: 'clear-water', name: 'Clear Water', feedback: /^MOTOR/ },
  { id: 'outlet', name: 'Outlet', orderKey: 'wtp-outlet-process' },
  { id: 'process-instruments', name: 'Process Instruments' },
  { id: 'valves', name: 'Valve Feedback' },
  { id: 'other-instruments', name: 'Other Instruments' },
];
const cardGroups = sectionIds.map(section => ({
  ...section,
  sensorIds: cardSensors.filter(sensor => {
    const readout = readoutById.get(sensor.id);
    if (readout) return section.id === readout.group;
    if (valveCard.test(sensor.id)) return section.id === 'valves';
    if (motorByRun.has(sensor.id)) return section.feedback?.test(sensor.mqttKey) ?? false;
    return sensor.type !== 'digital' && section.id === 'other-instruments';
  }).map(sensor => sensor.id),
})).filter(section => section.sensorIds.length > 0);

function FeedbackCard({ tag, name, children }: { tag: TagData; name: string; children?: React.ReactNode }) {
  const [showTrend, setShowTrend] = useState(false);
  const liveValue = readWtpTelemetry(tag).value;
  return <article className="h-full"><button type="button" aria-label={`View trend for ${name}`} onClick={() => setShowTrend(true)}
    className="premium-card h-full min-h-16 w-full rounded-xl p-4 text-left">
    <span className="block text-xs text-muted-foreground">{name}</span>
    {children}
  </button>{showTrend && <SensorTrendModal open onOpenChange={setShowTrend} tagId={tag.id} label={name} unit={tag.unit} section="wtp" currentValue={liveValue ?? undefined} digital />}</article>;
}

const WtpPage: React.FC = () => {
  const { wtpTags } = useScada();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<'cards' | 'process'>('process');

  const [paused, setPaused] = useState(false);
  const [quality, setQuality] = useState('');
  // Keep the headline and equipment states in sync when incoming signals age out.
  useEffect(() => {
    const refresh = () => setQuality(wtpTags.map(tag => getTagConnection(tag)).join(','));
    refresh();
    const timer = window.setInterval(refresh, 1000);
    return () => window.clearInterval(timer);
  }, [wtpTags]);
  const installedStates = wtpTags.filter(tag => !tag.notInstalled && tag.source === 'mqtt').map(getTagConnection);
  const liveSignalCount = installedStates.filter(state => state === 'connected' || state === 'inactive').length;

  const tagsById = useMemo(() => new Map(wtpTags.map(tag => [tag.id, tag])), [wtpTags]);
  const live = useMemo(() => ({
    quality,
    activity: deriveWtpProcessActivity(wtpTags),
    readings: new Map(processReadouts.map(({ id }) => [id, readWtpTelemetry(tagsById.get(id))])),
  }), [wtpTags, tagsById, quality]);

  const renderSensorCard = useCallback((id: string) => {
    const sensor = sensorMap.get(id);
    const tag = tagsById.get(id);
    if (!sensor || !tag) return null;
    const motor = motorByRun.get(id);
    if (motor) {
      const state = readWtpMotorState(tag, tagsById.get(motor.tripTag));
      return <FeedbackCard tag={tag} name={motor.name}><WtpDriveStatus state={state} /></FeedbackCard>;
    }
    const valveIndex = valveCard.exec(id)?.[1];
    if (valveIndex) {
      const valve = live.activity.fieldValves[Number(valveIndex) - 1];
      return <FeedbackCard tag={tag} name={valve.name}>
        <WtpValveStatus valve={valve} />
      </FeedbackCard>;
    }
    return <InstrumentCard tag={tag} sensor={sensor} section="wtp" index={0} />;
  }, [tagsById, live]);

  const sections = useMemo(() => cardGroups.map(({ id, name, orderKey, sensorIds }) => ({
    id,
    content: <section className="mb-8" aria-labelledby={`wtp-cards-${id}`}>
      <h3 id={`wtp-cards-${id}`} className="mb-4 text-lg font-semibold text-foreground">{name}</h3>
      <SortableCardGrid groupKey={orderKey ?? `wtp-${id}`} sensorIds={sensorIds} className="wtp-instrument-grid grid gap-3 sm:gap-4">
        {orderedIds => orderedIds.map(sensorId => <SortableItem key={sensorId} id={sensorId}>
          {renderSensorCard(sensorId)}
        </SortableItem>)}
      </SortableCardGrid>
    </section>,
  })), [renderSensorCard]);

  const viewControls = (
    <div className={`wtp-view-controls flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6 ${viewMode === 'cards' ? 'opacity-0 animate-fade-in' : ''}`}>
      <div className="flex items-center gap-3 min-w-0">
        <div className="wtp-view-icon p-2 rounded-xl bg-accent/10 shrink-0">
          <WtpIcon size={36} />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-foreground truncate">Water Treatment Plant (WTP)</h2>
          <p className="text-xs sm:text-sm text-muted-foreground">
            {liveSignalCount} of {configuredSignalCount} signals live
          </p>
        </div>
      </div>
      <div className="wtp-view-actions flex items-center gap-2 sm:gap-3 flex-wrap sm:shrink-0">
        {viewMode === 'process' && (
          <Button type="button" size="sm" variant="outline" className="wtp-motion-toggle"
            aria-label={paused ? 'Resume motion' : 'Pause motion'} aria-controls="wtp-process-drawing"
            onClick={() => setPaused(value => !value)}>
            {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
            <span>{paused ? 'Resume motion' : 'Pause motion'}</span>
          </Button>
        )}
        <div className="flex items-center gap-1 p-1 rounded-lg bg-secondary border border-border">
          <Button
            variant={viewMode === 'cards' ? 'default' : 'ghost'}
            size="sm"
            className="gap-1.5 h-8 text-xs"
            aria-label="Instrument cards"
            aria-pressed={viewMode === 'cards'}
            onClick={() => setViewMode('cards')}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant={viewMode === 'process' ? 'default' : 'ghost'}
            size="sm"
            className="gap-1.5 h-8 text-xs"
            aria-label="Process view"
            aria-pressed={viewMode === 'process'}
            onClick={() => setViewMode('process')}
          >
            <Activity className="h-3.5 w-3.5" />
          </Button>
        </div>
        <button
          onClick={() => navigate('/analytics/wtp')}
          aria-label="View Analytics"
          className="wtp-analytics-button flex items-center gap-1.5 sm:gap-2 px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl bg-accent/10 hover:bg-accent/20 text-accent border border-accent/20 hover:border-accent/40 transition-all duration-200 hover:scale-105 active:scale-95 shrink-0 group"
        >
          <BarChart2 className="h-4 w-4 sm:h-[18px] sm:w-[18px] group-hover:scale-110 transition-transform" />
          <span className="text-xs sm:text-sm font-semibold hidden sm:inline">View Analytics</span>
          <span className="text-xs font-semibold sm:hidden">Analytics</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className={`flex flex-col bg-background grid-pattern ${viewMode === 'process' ? 'wtp-fit-page' : 'min-h-screen'}`}>
      <main className="flex-1 container mx-auto px-4 py-6 md:py-8">
        {viewMode === 'cards' ? (
          <>
            {viewControls}
            <SortableSectionList groupKey="wtp-sections" sections={sections} />
            <details className="rounded-lg border p-4">
              <summary className="cursor-pointer font-semibold">PLC diagnostics</summary>
              <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                {wtpTags.filter(tag => sensorMap.get(tag.id)?.type === 'digital').map(tag => {
                  const reading = readWtpTelemetry(tag);
                  const motor = motorByRun.get(tag.id);
                  const trip = motor ? tagsById.get(motor.tripTag) : undefined;
                  const mismatch = reading.value === 1 && readWtpTelemetry(trip).value === 1 && isSameWtpSample(tag, trip);
                  return <FeedbackCard key={tag.id} tag={tag} name={tag.label}>
                    <strong>{reading.value ?? reading.status}</strong>
                    {mismatch && <span className="block text-xs">RUN and TRIP both active</span>}
                  </FeedbackCard>;
                })}
              </div>
            </details>
          </>
        ) : (
          <WtpProcessSimulation paused={paused} controls={viewControls} activity={live.activity} readings={live.readings} />
        )}
      </main>
      <StatusBar />
    </div>
  );
};

export default WtpPage;
