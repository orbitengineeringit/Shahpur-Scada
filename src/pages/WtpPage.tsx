import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useScada } from '@/contexts/ScadaContext';
import StatusBar from '@/components/StatusBar';
import InstrumentCard from '@/components/InstrumentCard';
import SortableCardGrid, { SortableItem } from '@/components/SortableCardGrid';
import SortableSectionList from '@/components/SortableSectionList';
import { WTP_SENSORS } from '@/config/shahpurSensors';
import { BarChart2, LayoutGrid, Activity } from 'lucide-react';
import WtpIcon from '@/components/icons/WtpIcon';
import CombinedPtGauge from '@/components/instruments/CombinedPtGauge';
import SensorTrendModal from '@/components/SensorTrendModal';
import AlarmSettingsModal, { AlarmSettings } from '@/components/AlarmSettingsModal';
import { Button } from '@/components/ui/button';
import WtpProcessSimulation from '@/components/WtpProcessSimulation';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { TrendingUp, Wifi } from 'lucide-react';
import { AlarmBellButton } from '@/components/AlarmBellButton';

/** WTP Combined PT Card */
const WtpCombinedPtCard: React.FC<{
  combinedId: string; label: string; pt1Id: string; pt2Id: string;
  pump1Id: string; pump2Id: string; tags: any[];
}> = ({ combinedId, label, pt1Id, pt2Id, pump1Id, pump2Id, tags }) => {
  const { updateTagAlarmSettings } = useScada();
  const [showTrend, setShowTrend] = useState(false);
  const [showAlarm, setShowAlarm] = useState(false);

  const findTag = (id: string) => tags.find((t: any) => t.id === id);
  const pt1Val = findTag(pt1Id)?.value ?? 0;
  const pt2Val = findTag(pt2Id)?.value ?? 0;
  // HT Pump ON threshold: PT > 1.5 Bar = pump running
  const pump1Running = pt1Val > 1.5;
  const pump2Running = pt2Val > 1.5;

  const combinedPtValue = useMemo(() => {
    if (pump1Running && pump2Running) return (pt1Val + pt2Val) / 2;
    if (pump1Running) return pt1Val;
    if (pump2Running) return pt2Val;
    return (pt1Val + pt2Val) / 2;
  }, [pump1Running, pump2Running, pt1Val, pt2Val]);

  const tag = findTag(combinedId) || {
    id: combinedId, label, unit: 'Bar', value: combinedPtValue,
    min: 0, max: 10, timestamp: new Date(), status: 'ok'
  };

  const hasAlarmConfig = tag?.alarmEnabled && (tag?.highSetpoint !== undefined || tag?.lowSetpoint !== undefined);

  return (
    <>
      <div className="premium-card rounded-xl p-3 sm:p-4 flex flex-col h-full opacity-0 animate-fade-in relative overflow-visible cursor-pointer"
        onClick={() => setShowTrend(true)}>
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-transparent via-primary to-transparent rounded-t-xl z-10" />
        <div className="absolute -inset-[1px] rounded-xl border border-primary/30 pointer-events-none z-10" />
        <div className="flex items-center justify-between mb-1.5 sm:mb-2 shrink-0">
          <div className="flex items-center gap-1 min-w-0">
            <Wifi className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-success shrink-0" />
            <span className="text-[10px] sm:text-xs text-muted-foreground font-medium truncate">{label}</span>
          </div>
          <div className="flex gap-0 sm:gap-0.5 shrink-0">
            <Tooltip delayDuration={150}>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-5 w-5 sm:h-6 sm:w-6 hover:bg-primary/10"
                  onClick={(e) => { e.stopPropagation(); setShowTrend(true); }}>
                  <TrendingUp className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="z-[100]"><p>📈 View Trends</p></TooltipContent>
            </Tooltip>
            <AlarmBellButton 
              hasAlarmConfig={hasAlarmConfig} 
              onClick={(e) => { e.stopPropagation(); setShowAlarm(true); }} 
              className="h-5 w-5 sm:h-6 sm:w-6"
              iconClassName="h-2.5 w-2.5 sm:h-3 sm:w-3"
            />
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center py-0.5 sm:py-1 overflow-hidden">
          <CombinedPtGauge value={combinedPtValue} pt1Value={pt1Val} pt2Value={pt2Val}
            pump1Running={pump1Running} pump2Running={pump2Running} min={0} max={10} unit="Bar" size={160} />
        </div>
        <div className="shrink-0 mt-auto">
          <div className="flex items-center gap-1 mt-1">
            <div className="w-1.5 h-1.5 rounded-full bg-success shrink-0" />
            <span className="text-[9px] sm:text-[10px] text-muted-foreground font-mono truncate">{new Date().toLocaleTimeString()}</span>
          </div>
        </div>
      </div>
      {showTrend && (
        <SensorTrendModal open={showTrend} onOpenChange={setShowTrend}
          tagId={combinedId} label={label} unit="Bar" section="wtp" currentValue={combinedPtValue} />
      )}
      {showAlarm && tag && (
        <AlarmSettingsModal open={showAlarm} onOpenChange={setShowAlarm}
          tag={tag} section="wtp" onSave={(settings: AlarmSettings) => updateTagAlarmSettings('wtp', tag.id, settings)} />
      )}
    </>
  );
};

const WtpPage: React.FC = () => {
  const { wtpTags } = useScada();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<'cards' | 'process'>('process');

  const findTag = (sensorId: string) => wtpTags.find(t => t.id === sensorId);

  const sensorMap = useMemo(() => {
    const map: Record<string, typeof WTP_SENSORS[0]> = {};
    WTP_SENSORS.forEach(s => { map[s.id] = s; });
    return map;
  }, []);

  const ltIds = useMemo(() => WTP_SENSORS.filter(s => s.instrumentType === 'lt' && !s.notInstalled).map(s => s.id), []);
  const flowIds = useMemo(() => WTP_SENSORS.filter(s => s.instrumentType === 'flow' && !s.notInstalled).map(s => s.id), []);
  const inletAnalyzerIds = useMemo(() => WTP_SENSORS.filter(s => (s.subsection === 'raw-water' || s.subsection === 'inlet') && !s.notInstalled).map(s => s.id), []);
  const outletAnalyzerIds = useMemo(() => WTP_SENSORS.filter(s => s.subsection === 'outlet' && !s.notInstalled).map(s => s.id), []);
  const pumpIds = useMemo(() => WTP_SENSORS.filter(s => s.instrumentType === 'pump' && !s.notInstalled).map(s => s.id), []);
  const ptIds = useMemo(() => WTP_SENSORS.filter(s => s.instrumentType === 'pt' && !s.notInstalled).map(s => s.id), []);
  const totalizerSensor = WTP_SENSORS.find(s => s.instrumentType === 'totalizer' && !s.notInstalled);

  const pumpPtPairs = useMemo(() => {
    const pairs = [
      { pumpId: 'WTP-Pump1', ptId: 'WTP-PT1' },
      { pumpId: 'WTP-Pump2', ptId: 'WTP-PT2' },
      { pumpId: 'WTP-Pump3', ptId: 'WTP-PT3' },
      { pumpId: 'WTP-Pump4', ptId: 'WTP-PT4' },
    ];
    return pairs.filter(p => !sensorMap[p.pumpId]?.notInstalled);
  }, [sensorMap]);

  let idx = 0;

  const legacySections = useMemo(() => {
    const list = [];

    list.push({
      id: 'wtp-sec-primary',
      content: (
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-foreground mb-4 opacity-0 animate-fade-in flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary" />
            Levels, Flow & Metering
          </h3>
          <SortableCardGrid groupKey="wtp-primary" sensorIds={[...ltIds, ...flowIds, totalizerSensor?.id].filter(Boolean) as string[]} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6 w-full">
            {(orderedIds) => orderedIds.map((id) => {
              const sensor = sensorMap[id];
              const tag = findTag(id);
              if (!sensor || !tag) return null;
              return (
                <SortableItem key={id} id={id}>
                  <InstrumentCard tag={tag} sensor={sensor as any} section="wtp" index={idx++} />
                </SortableItem>
              );
            })}
          </SortableCardGrid>
        </div>
      ),
    });

    if (inletAnalyzerIds.length > 0) {
      list.push({
        id: 'wtp-sec-inlet',
        content: (
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-foreground mb-4 opacity-0 animate-fade-in flex items-center gap-2" style={{ animationDelay: '100ms' }}>
              <div className="w-2 h-2 rounded-full bg-accent" />
              Water Quality — Inlet
            </h3>
            <SortableCardGrid groupKey="wtp-inlet" sensorIds={inletAnalyzerIds} className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 max-w-4xl">
              {(orderedIds) => orderedIds.map((id) => {
                const sensor = sensorMap[id];
                const tag = findTag(id);
                if (!sensor || !tag) return null;
                return (
                  <SortableItem key={id} id={id}>
                    <InstrumentCard tag={tag} sensor={sensor} section="wtp" index={idx++} />
                  </SortableItem>
                );
              })}
            </SortableCardGrid>
          </div>
        ),
      });
    }

    if (outletAnalyzerIds.length > 0) {
      list.push({
        id: 'wtp-sec-outlet',
        content: (
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-foreground mb-4 opacity-0 animate-fade-in flex items-center gap-2" style={{ animationDelay: '150ms' }}>
              <div className="w-2 h-2 rounded-full bg-accent" />
              Water Quality — Outlet
            </h3>
            <SortableCardGrid groupKey="wtp-outlet" sensorIds={outletAnalyzerIds} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6 max-w-6xl">
              {(orderedIds) => orderedIds.map((id) => {
                const sensor = sensorMap[id];
                const tag = findTag(id);
                if (!sensor || !tag) return null;
                return (
                  <SortableItem key={id} id={id}>
                    <InstrumentCard tag={tag} sensor={sensor} section="wtp" index={idx++} />
                  </SortableItem>
                );
              })}
            </SortableCardGrid>
          </div>
        ),
      });
    }

    list.push({
      id: 'wtp-sec-pumps',
      content: (
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-foreground mb-4 opacity-0 animate-fade-in flex items-center gap-2" style={{ animationDelay: '150ms' }}>
            <div className="w-2 h-2 rounded-full bg-warning" />
            HT Pumps, Pressure & Combined PT
          </h3>
          {/* Row 1: Active Pumps with their individual PTs */}
          <div className={`grid gap-4 sm:gap-6 w-full ${pumpPtPairs.length <= 2 ? 'grid-cols-1 sm:grid-cols-2 max-w-4xl' : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4'}`}>
          {pumpPtPairs.map(({ pumpId, ptId }) => {
              const pumpSensor = sensorMap[pumpId];
              const pumpTag = findTag(pumpId);
              const ptSensor = sensorMap[ptId];
              const ptTag = findTag(ptId);
              const isPumpOn = ptTag && ptTag.status === 'connected' ? ptTag.value > 1.5 : false;
              return (
                <div key={pumpId} className="flex flex-col gap-3">
                  {pumpSensor && pumpTag && (
                    <InstrumentCard tag={pumpTag} sensor={pumpSensor} section="wtp" index={idx++} pumpComponent="wtp" />
                  )}
                  {ptSensor && ptTag && (
                    <div className="relative">
                      <InstrumentCard tag={ptTag} sensor={ptSensor} section="wtp" index={idx++} />
                      {/* Pump status overlay badge on PT card */}
                      <div className={`absolute bottom-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold tracking-wider border ${isPumpOn ? 'bg-success/15 text-success border-success/30' : 'bg-destructive/10 text-destructive border-destructive/25'}`}>
                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isPumpOn ? 'bg-success' : 'bg-destructive'}`} />
                        {isPumpOn ? 'PUMP ON' : 'PUMP OFF'}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {/* Row 2: Combined Pressure Gauges */}
          <div className={`grid gap-4 sm:gap-6 mt-6 mx-auto ${!sensorMap['WTP-CombinedPT2']?.notInstalled ? 'grid-cols-1 sm:grid-cols-2 max-w-4xl' : 'grid-cols-1 max-w-md'}`}>
            {!sensorMap['WTP-CombinedPT1']?.notInstalled && (
              <WtpCombinedPtCard
                combinedId="WTP-CombinedPT1" label="Combined Pressure (P1+P2)"
                pt1Id="WTP-PT1" pt2Id="WTP-PT2" pump1Id="WTP-Pump1" pump2Id="WTP-Pump2"
                tags={wtpTags}
              />
            )}
            {!sensorMap['WTP-CombinedPT2']?.notInstalled && (
              <WtpCombinedPtCard
                combinedId="WTP-CombinedPT2" label="Combined Pressure (P3+P4)"
                pt1Id="WTP-PT3" pt2Id="WTP-PT4" pump1Id="WTP-Pump3" pump2Id="WTP-Pump4"
                tags={wtpTags}
              />
            )}
          </div>
        </div>
      ),
    });

    return list;
  }, [ltIds, ptIds, flowIds, inletAnalyzerIds, outletAnalyzerIds, pumpIds, wtpTags, totalizerSensor, sensorMap, pumpPtPairs]);

  const rawWaterIds = useMemo(() => WTP_SENSORS.filter(s => s.subsection === 'raw-water' && !s.notInstalled).map(s => s.id), []);
  const backwashIds = useMemo(() => ['WTP-LT-BW'].filter(id => !sensorMap[id]?.notInstalled), [sensorMap]);
  const clearWaterIds = useMemo(() => [
    'WTP-LT-CW', 'WTP-Pump1', 'WTP-Pump2', 'WTP-PT1', 'WTP-PT2', 'WTP-HeaderPT', 'WTP-CombinedPT1',
  ].filter(id => !sensorMap[id]?.notInstalled), [sensorMap]);
  const outletIds = useMemo(() => WTP_SENSORS.filter(s => s.subsection === 'outlet' && !s.notInstalled).map(s => s.id), []);

  const renderSensorCard = (id: string, pumpComponent?: 'wtp') => {
    const sensor = sensorMap[id];
    const tag = findTag(id);
    if (!sensor || !tag) return null;
    return <InstrumentCard tag={tag} sensor={sensor} section="wtp" index={0} pumpComponent={pumpComponent} />;
  };

  const sections = useMemo(() => [
    {
      id: 'wtp-sec-raw-water',
      content: (
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-primary" />Raw Water / Inlet</h3>
          <SortableCardGrid groupKey="wtp-raw-water" sensorIds={rawWaterIds} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6 w-full">
            {(orderedIds) => orderedIds.map(id => <SortableItem key={id} id={id}>{renderSensorCard(id)}</SortableItem>)}
          </SortableCardGrid>
        </div>
      ),
    },
    {
      id: 'wtp-sec-backwash',
      content: (
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-accent" />Backwash</h3>
          <SortableCardGrid groupKey="wtp-backwash" sensorIds={backwashIds} className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 max-w-4xl">
            {(orderedIds) => orderedIds.map(id => <SortableItem key={id} id={id}>{renderSensorCard(id)}</SortableItem>)}
          </SortableCardGrid>
        </div>
      ),
    },
    {
      id: 'wtp-sec-clear-water',
      content: (
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-success" />Clear Water</h3>
          <SortableCardGrid groupKey="wtp-clear-water" sensorIds={clearWaterIds} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6 w-full">
            {(orderedIds) => orderedIds.map(id => (
              <SortableItem key={id} id={id}>
                {id === 'WTP-CombinedPT1'
                  ? <WtpCombinedPtCard combinedId="WTP-CombinedPT1" label="Combined Pressure (P1+P2)" pt1Id="WTP-PT1" pt2Id="WTP-PT2" pump1Id="WTP-Pump1" pump2Id="WTP-Pump2" tags={wtpTags} />
                  : renderSensorCard(id, id.startsWith('WTP-Pump') ? 'wtp' : undefined)}
              </SortableItem>
            ))}
          </SortableCardGrid>
        </div>
      ),
    },
    {
      id: 'wtp-sec-outlet',
      content: (
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-warning" />Outlet</h3>
          <SortableCardGrid groupKey="wtp-outlet-process" sensorIds={outletIds} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6 w-full">
            {(orderedIds) => orderedIds.map(id => <SortableItem key={id} id={id}>{renderSensorCard(id)}</SortableItem>)}
          </SortableCardGrid>
        </div>
      ),
    },
  ], [rawWaterIds, backwashIds, clearWaterIds, outletIds, wtpTags, sensorMap]);

  return (
    <div className="min-h-screen flex flex-col bg-background grid-pattern">
      <main className="flex-1 container mx-auto px-4 py-6 md:py-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6 opacity-0 animate-fade-in">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-accent/10 shrink-0">
              <WtpIcon size={36} />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-foreground truncate">Water Treatment Plant (WTP)</h2>
              <p className="text-xs sm:text-sm text-muted-foreground">{WTP_SENSORS.length} instruments • Awaiting Field Commissioning</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap sm:shrink-0">
            {/* Cards / Process View Toggle */}
            <div className="flex items-center gap-1 p-1 rounded-lg bg-secondary border border-border">
              <Button
                variant={viewMode === 'cards' ? 'default' : 'ghost'}
                size="sm"
                className="gap-1.5 h-8 text-xs"
                onClick={() => setViewMode('cards')}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant={viewMode === 'process' ? 'default' : 'ghost'}
                size="sm"
                className="gap-1.5 h-8 text-xs"
                onClick={() => setViewMode('process')}
              >
                <Activity className="h-3.5 w-3.5" />
              </Button>
            </div>
            <button
              onClick={() => navigate('/analytics/wtp')}
              className="flex items-center gap-1.5 sm:gap-2 px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl bg-accent/10 hover:bg-accent/20 text-accent border border-accent/20 hover:border-accent/40 transition-all duration-200 hover:scale-105 active:scale-95 shrink-0 group"
            >
              <BarChart2 className="h-4 w-4 sm:h-[18px] sm:w-[18px] group-hover:scale-110 transition-transform" />
              <span className="text-xs sm:text-sm font-semibold hidden sm:inline">View Analytics</span>
              <span className="text-xs font-semibold sm:hidden">Analytics</span>
            </button>
          </div>
        </div>

        {viewMode === 'cards' ? (
          <SortableSectionList groupKey="wtp-sections" sections={sections} />
        ) : (
          <WtpProcessSimulation />
        )}
      </main>
      <StatusBar />
    </div>
  );
};

export default WtpPage;
