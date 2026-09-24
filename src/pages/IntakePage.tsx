import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useScada } from '@/contexts/ScadaContext';
import StatusBar from '@/components/StatusBar';
import InstrumentCard from '@/components/InstrumentCard';
import PumpAnalyticsCard from '@/components/PumpAnalyticsCard';
import ConsumptionCard from '@/components/ConsumptionCard';
import SystemHealthCard from '@/components/SystemHealthCard';
import CombinedPtGauge from '@/components/instruments/CombinedPtGauge';
import SortableCardGrid, { SortableItem } from '@/components/SortableCardGrid';
import SortableSectionList from '@/components/SortableSectionList';
import IntakeProcessSimulation from '@/components/IntakeProcessSimulation';
import { INTAKE_SENSORS } from '@/config/shahpurSensors';
import { TrendingUp, Wifi, WifiOff, BarChart2, LayoutGrid, Activity } from 'lucide-react';
import { AlarmBellButton } from '@/components/AlarmBellButton';
import IntakeIcon from '@/components/icons/IntakeIcon';
import SensorTrendModal from '@/components/SensorTrendModal';
import AlarmSettingsModal, { AlarmSettings } from '@/components/AlarmSettingsModal';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/** Sub-component so Combined PT card can have its own state for Trend & Alarm Modals */
const CombinedPtCard: React.FC<{
  combinedPtValue: number; pt1Val: number; pt2Val: number;
  pump1Running: boolean; pump2Running: boolean;
  tag: any; section: 'intake' | 'wtp';
}> = ({ combinedPtValue, pt1Val, pt2Val, pump1Running, pump2Running, tag, section }) => {
  const { updateTagAlarmSettings } = useScada();
  const [showTrend, setShowTrend] = useState(false);
  const [showAlarm, setShowAlarm] = useState(false);

  const handleAlarmSave = (settings: AlarmSettings) => {
    if (tag) updateTagAlarmSettings(section, tag.id, settings);
  };

  const hasAlarmConfig = tag?.alarmEnabled && (tag?.highSetpoint !== undefined || tag?.lowSetpoint !== undefined);

  return (
    <>
      <div
        className="premium-card rounded-xl p-3 sm:p-4 flex flex-col h-full opacity-0 animate-fade-in relative overflow-visible cursor-pointer"
        onClick={() => setShowTrend(true)}
      >
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-transparent via-primary to-transparent rounded-t-xl z-10" />
        <div className="absolute -inset-[1px] rounded-xl border border-primary/30 pointer-events-none z-10" />
        <div className="flex items-center justify-between mb-1.5 sm:mb-2 shrink-0">
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-[10px] sm:text-xs text-muted-foreground font-medium truncate">Combined Pressure (P1+P2)</span>
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
          <CombinedPtGauge value={combinedPtValue} pt1Value={pt1Val} pt2Value={pt2Val} pump1Running={pump1Running} pump2Running={pump2Running} min={0} max={10} unit="Bar" size={160} />
        </div>
        <div className="shrink-0 mt-auto">
          {(tag?.highSetpoint !== undefined || tag?.lowSetpoint !== undefined) && (
            <div className="flex gap-0.5 sm:gap-1 text-xs mt-1">
              {tag?.highSetpoint !== undefined && (
                <span className={`px-1 sm:px-1.5 py-0.5 rounded-md text-[9px] sm:text-[10px] font-mono ${combinedPtValue > tag.highSetpoint ? 'bg-destructive/20 text-destructive' : 'bg-secondary text-muted-foreground'}`}>
                  H:{tag.highSetpoint}
                </span>
              )}
              {tag?.lowSetpoint !== undefined && (
                <span className={`px-1 sm:px-1.5 py-0.5 rounded-md text-[9px] sm:text-[10px] font-mono ${combinedPtValue < tag.lowSetpoint ? 'bg-warning/20 text-warning' : 'bg-secondary text-muted-foreground'}`}>
                  L:{tag.lowSetpoint}
                </span>
              )}
            </div>
          )}
          <div className="flex items-center gap-1 mt-1">
            <span className="text-[9px] sm:text-[10px] text-muted-foreground font-mono truncate">{new Date().toLocaleTimeString()}</span>
          </div>
        </div>
      </div>
      {showTrend && (
        <SensorTrendModal
          open={showTrend} onOpenChange={setShowTrend}
          tagId="INT-CombinedPT" label="Combined Pressure (P1+P2)" unit="Bar" section={section}
          currentValue={combinedPtValue}
        />
      )}
      {showAlarm && tag && (
        <AlarmSettingsModal
          open={showAlarm} onOpenChange={setShowAlarm}
          tag={tag} section={section} onSave={handleAlarmSave}
        />
      )}
    </>
  );
};

const IntakePage: React.FC = () => {
  const { intakeTags } = useScada();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<'cards' | 'process'>('process');

  const findTag = (sensorId: string) => intakeTags.find(t => t.id === sensorId);
  const liveValue = (sensorId: string) => {
    const tag = findTag(sensorId);
    return tag?.status === 'connected' ? tag.value : 0;
  };

  const ptSensors = INTAKE_SENSORS.filter(s => s.instrumentType === 'pt' && !s.notInstalled);
  const ltSensor = INTAKE_SENSORS.find(s => s.instrumentType === 'lt' && !s.notInstalled);
  const flowSensors = INTAKE_SENSORS.filter(s => s.instrumentType === 'flow' && !s.notInstalled);
  const totalizerSensors = INTAKE_SENSORS.filter(s => s.instrumentType === 'totalizer' && !s.notInstalled);
  const pumpSensors = INTAKE_SENSORS.filter(s => s.instrumentType === 'pump' && !s.notInstalled);

  const pump1Tag = findTag('INT-Pump1');
  const pump2Tag = findTag('INT-Pump2');
  const pt1Tag = findTag('INT-PT1');
  const pt2Tag = findTag('INT-PT2');
  const headerPtTag = findTag('INT-HeaderPT');
  const combinedPtTag = findTag('INT-CombinedPT');
  const pt1Val = liveValue('INT-PT1');
  const pt2Val = liveValue('INT-PT2');
  const headerPtVal = liveValue('INT-HeaderPT');
  const combinedPtVal = liveValue('INT-CombinedPT');

  const pump1Running = (pt1Tag?.status === 'connected' && pt1Val > 1.5) || (pump1Tag?.status === 'connected' && pump1Tag?.value === 1);
  const pump2Running = (pt2Tag?.status === 'connected' && pt2Val > 1.5) || (pump2Tag?.status === 'connected' && pump2Tag?.value === 1);

  const combinedPtValue = useMemo(() => {
    if (headerPtTag && headerPtTag.status === 'connected' && headerPtVal > 0) {
      return headerPtVal;
    }
    if (combinedPtTag && combinedPtTag.status === 'connected' && combinedPtVal > 0) {
      return combinedPtVal;
    }
    if (pump1Running && pump2Running) return (pt1Val + pt2Val) / 2;
    if (pump1Running) return pt1Val;
    if (pump2Running) return pt2Val;
    return headerPtVal || combinedPtVal;
  }, [headerPtTag, headerPtVal, combinedPtTag, combinedPtVal, pump1Running, pump2Running, pt1Val, pt2Val]);

  const sensorMap = useMemo(() => {
    const map: Record<string, typeof INTAKE_SENSORS[0]> = {};
    INTAKE_SENSORS.forEach(s => { map[s.id] = s; });
    return map;
  }, []);

  const ptIds = useMemo(() => [...ptSensors.map(s => s.id), 'INT-CombinedPT'], [ptSensors]);
  const mainIds = useMemo(() => [
    ltSensor?.id,
    ...flowSensors.map(s => s.id),
    ...totalizerSensors.map(s => s.id)
  ].filter(Boolean) as string[], [ltSensor, flowSensors, totalizerSensors]);
  const pumpIds = useMemo(() => pumpSensors.map(s => s.id), [pumpSensors]);

  let idx = 0;

  const sections = useMemo(() => [
    {
      id: 'intake-sec-main',
      content: (
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-foreground mb-4 opacity-0 animate-fade-in flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary" />
            Main Process (Level & Flow)
          </h3>
          <SortableCardGrid groupKey="intake-main" sensorIds={mainIds} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6 w-full">
            {(orderedIds) => orderedIds.map((id) => {
              const sensor = sensorMap[id];
              const tag = findTag(id);
              if (!sensor || !tag) return null;
              return (
                <SortableItem key={id} id={id}>
                  <InstrumentCard tag={tag} sensor={sensor as any} section="intake" index={idx++} />
                </SortableItem>
              );
            })}
          </SortableCardGrid>
        </div>
      ),
    },
    {
      id: 'intake-sec-pumps',
      content: (
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-foreground mb-4 opacity-0 animate-fade-in flex items-center gap-2" style={{ animationDelay: '100ms' }}>
            <div className="w-2 h-2 rounded-full bg-warning" />
            VT Pumps
          </h3>
          <SortableCardGrid groupKey="intake-pumps" sensorIds={pumpIds} className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 max-w-4xl mx-auto">
            {(orderedIds) => orderedIds.map((id) => {
              const sensor = sensorMap[id];
              const tag = findTag(id);
              if (!sensor || !tag) return null;
              return (
                <SortableItem key={id} id={id}>
                  <InstrumentCard tag={tag} sensor={sensor} section="intake" index={idx++} pumpComponent="intake" />
                </SortableItem>
              );
            })}
          </SortableCardGrid>
        </div>
      ),
    },
    {
      id: 'intake-sec-pt',
      content: (
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-foreground mb-4 opacity-0 animate-fade-in flex items-center gap-2" style={{ animationDelay: '150ms' }}>
            <div className="w-2 h-2 rounded-full bg-destructive" />
            Pump Pressures
          </h3>
          <SortableCardGrid groupKey="intake-pt" sensorIds={ptIds} className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 max-w-6xl mx-auto">
            {(orderedIds) => orderedIds.map((id) => {
              if (id === 'INT-CombinedPT') {
                return (
                  <SortableItem key={id} id={id}>
                    <CombinedPtCard
                      combinedPtValue={combinedPtValue} pt1Val={pt1Val} pt2Val={pt2Val}
                      pump1Running={pump1Running} pump2Running={pump2Running}
                      tag={{ id: 'INT-CombinedPT', label: 'Combined Pressure (P1+P2)', unit: 'Bar', value: combinedPtValue, min: 0, max: 10, timestamp: headerPtTag?.timestamp ?? new Date(), status: headerPtTag?.status ?? 'unknown' }}
                      section="intake"
                    />
                  </SortableItem>
                );
              }
              const sensor = sensorMap[id];
              const tag = findTag(id);
              if (!sensor || !tag) return null;
              return (
                <SortableItem key={id} id={id}>
                  <InstrumentCard tag={tag} sensor={sensor} section="intake" index={idx++} />
                </SortableItem>
              );
            })}
          </SortableCardGrid>
        </div>
      ),
    },
  ], [ptIds, mainIds, pumpIds, combinedPtValue, pt1Val, pt2Val, pump1Running, pump2Running, intakeTags, sensorMap]);

  return (
    <div className="min-h-screen flex flex-col bg-background grid-pattern">
      <main className="flex-1 container mx-auto px-4 py-6 md:py-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6 opacity-0 animate-fade-in">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-primary/10 shrink-0">
              <IntakeIcon size={36} />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl md:text-2xl font-bold text-foreground truncate">Intake Well</h2>
              <p className="text-sm text-muted-foreground">{INTAKE_SENSORS.length} instruments monitoring</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap shrink-0">
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
              onClick={() => navigate('/analytics/intake')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 hover:border-primary/40 transition-all duration-200 hover:scale-105 active:scale-95 shrink-0 group"
            >
              <BarChart2 className="h-4 w-4 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-semibold">Analytics</span>
            </button>
          </div>
        </div>

        {viewMode === 'cards' ? (
          <SortableSectionList groupKey="intake-sections" sections={sections} />
        ) : (
          <IntakeProcessSimulation />
        )}
      </main>
      <StatusBar />
    </div>
  );
};

export default IntakePage;
