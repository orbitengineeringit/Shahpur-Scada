import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useScada } from '@/contexts/ScadaContext';
import StatusBar from '@/components/StatusBar';
import InstrumentCard from '@/components/InstrumentCard';
import SortableCardGrid, { SortableItem } from '@/components/SortableCardGrid';
import SortableSectionList from '@/components/SortableSectionList';
import { OHT1_SENSORS, OHT2_SENSORS, ShahpurSensor } from '@/config/shahpurSensors';
import OhtAnalyticsCard from '@/components/OhtAnalyticsCard';
import { BarChart2, LayoutGrid, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import OhtIcon from '@/components/icons/OhtIcon';
import OhtProcessSimulation from '@/components/OhtProcessSimulation';

interface OhtConfig {
  title: string;
  label: string;
  color: string;
  colorHsl: string;
  borderColor: string;
  bgColor: string;
  iconBg: string;
  sensors: ShahpurSensor[];
  startIndex: number;
  capacity: string;
  groupKey: string;
}

const OhtTankIcon: React.FC<{ colorHsl: string; label: string }> = ({ colorHsl, label }) => (
  <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
    <path d="M10 16 L10 36 Q10 40 14 40 L34 40 Q38 40 38 36 L38 16" fill={`hsl(${colorHsl} / 0.1)`} stroke={`hsl(${colorHsl})`} strokeWidth="1.5"/>
    <path d="M10 16 Q10 10 24 10 Q38 10 38 16" fill={`hsl(${colorHsl} / 0.05)`} stroke={`hsl(${colorHsl})`} strokeWidth="1.5"/>
    <line x1="10" y1="16" x2="38" y2="16" stroke={`hsl(${colorHsl})`} strokeWidth="1"/>
    <rect x="12" y="24" width="24" height="14" rx="1" fill={`hsl(${colorHsl} / 0.15)`}>
      <animate attributeName="height" dur="4s" repeatCount="indefinite" values="14;11;14"/>
      <animate attributeName="y" dur="4s" repeatCount="indefinite" values="24;27;24"/>
    </rect>
    <path d="M12 26 Q18 24 24 26 Q30 28 36 25" stroke={`hsl(${colorHsl} / 0.4)`} strokeWidth="1" fill="none">
      <animate attributeName="d" dur="2.5s" repeatCount="indefinite" values="M12 26 Q18 24 24 26 Q30 28 36 25;M12 25 Q18 27 24 24 Q30 26 36 26;M12 26 Q18 24 24 26 Q30 28 36 25"/>
    </path>
    <line x1="14" y1="40" x2="10" y2="47" stroke={`hsl(${colorHsl})`} strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="24" y1="40" x2="24" y2="47" stroke={`hsl(${colorHsl})`} strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="34" y1="40" x2="38" y2="47" stroke={`hsl(${colorHsl})`} strokeWidth="1.5" strokeLinecap="round"/>
    <text x="24" y="22" textAnchor="middle" fill={`hsl(${colorHsl})`} fontSize="7" fontWeight="700">{label}</text>
    <line x1="24" y1="4" x2="24" y2="10" stroke={`hsl(${colorHsl})`} strokeWidth="1.5"/>
    <line x1="20" y1="4" x2="28" y2="4" stroke={`hsl(${colorHsl})`} strokeWidth="1.5"/>
  </svg>
);

const OhtSubsection: React.FC<{ config: OhtConfig; tags: any[]; viewMode: 'cards' | 'process' }> = ({ config, tags, viewMode }) => {
  const findTag = (id: string) => tags.find((t: any) => t.id === id);

  const sensorIds = useMemo(() => config.sensors.filter(s => !s.notInstalled).map(s => s.id), [config.sensors, config.groupKey]);
  const sensorMap = useMemo(() => {
    const map: Record<string, ShahpurSensor> = {};
    config.sensors.forEach(s => { map[s.id] = s; });
    return map;
  }, [config.groupKey]);

  return (
    <div className={`mb-4 rounded-2xl border ${config.borderColor} ${config.bgColor} p-3 sm:p-4 relative overflow-hidden transition-all duration-300 hover:shadow-lg`}>
      <div className={`absolute top-0 left-0 right-0 h-1 ${config.color}`} style={{ opacity: 0.8 }} />

      <div className="flex items-center gap-2 mb-3">
        <div className={`p-2 rounded-xl ${config.iconBg}`}>
          <OhtTankIcon colorHsl={config.colorHsl} label={config.label} />
        </div>
        <div>
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${config.color}`} />
            {config.title}
          </h3>
          <p className="text-xs text-muted-foreground">{config.capacity}</p>
        </div>
      </div>

      {viewMode === 'cards' ? (
        <SortableCardGrid groupKey={config.groupKey} sensorIds={sensorIds} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 w-full mt-4">
          {(orderedIds) => orderedIds.map((id, i) => {
            const sensor = sensorMap[id];
            const tag = findTag(id);
            if (!sensor || !tag) return null;
            return (
              <SortableItem key={id} id={id}>
                <InstrumentCard tag={tag} sensor={sensor} section="oht" index={config.startIndex + i} />
              </SortableItem>
            );
          })}
        </SortableCardGrid>
      ) : (
        <div className="mt-4">
          <OhtProcessSimulation sensors={config.sensors} tags={tags} config={config} />
        </div>
      )}
    </div>
  );
};

const OhtPage: React.FC = () => {
  const { ohtTags } = useScada();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<'cards' | 'process'>('process');

  const ohtConfigs: OhtConfig[] = [
    {
      title: 'OHT - 1 (Bus Station OHT)', label: '#1', color: 'bg-primary', colorHsl: '199 89% 48%',
      borderColor: 'border-primary/20', bgColor: 'bg-primary/[0.03]', iconBg: 'bg-primary/10',
      sensors: OHT1_SENSORS, startIndex: 0, capacity: '6 instruments • PT1, PT2, Level, Flow, Totalizer, Decr Totalizer',
      groupKey: 'oht-1',
    },
    {
      title: 'OHT - 2 (Awaiting Commissioning)', label: '#2', color: 'bg-accent', colorHsl: '38 92% 50%',
      borderColor: 'border-accent/20', bgColor: 'bg-accent/[0.03]', iconBg: 'bg-accent/10',
      sensors: OHT2_SENSORS, startIndex: 6, capacity: 'Awaiting Commissioning • 6 instruments scaffolded',
      groupKey: 'oht-2',
    },
  ];

  const sections = useMemo(() => [
    ...ohtConfigs.map((config, i) => ({
      id: `oht-sec-${config.groupKey}`,
      content: (
        <div className="opacity-0 animate-fade-in" style={{ animationDelay: `${i * 100}ms` }}>
          <OhtSubsection config={config} tags={ohtTags} viewMode={viewMode} />
        </div>
      ),
    })),
  ], [ohtTags, viewMode]);

  return (
    <div className="min-h-screen flex flex-col bg-background grid-pattern">
      <main className="flex-1 container mx-auto px-4 py-3 md:py-5">
        <div className="flex flex-col gap-3 mb-3 opacity-0 animate-fade-in sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-success/10 shrink-0">
              <OhtIcon size={36} />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl leading-tight md:text-2xl font-bold text-foreground">Overhead Tanks (OHT)</h2>
              <p className="text-sm text-muted-foreground">2 OHT units • Bus Station OHT (Live) & OHT-2 (Pending)</p>
            </div>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:gap-3 sm:w-auto sm:flex-nowrap sm:justify-end">
            <div className="flex items-center gap-1 p-1 rounded-lg bg-secondary border border-border shrink-0">
              <Button
                variant={viewMode === 'cards' ? 'default' : 'ghost'}
                size="sm"
                className="gap-1.5 h-8 text-xs"
                onClick={() => setViewMode('cards')}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Cards</span>
              </Button>
              <Button
                variant={viewMode === 'process' ? 'default' : 'ghost'}
                size="sm"
                className="gap-1.5 h-8 text-xs"
                onClick={() => setViewMode('process')}
              >
                <Activity className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Process</span>
              </Button>
            </div>
            
            <button
              onClick={() => navigate('/analytics/oht')}
              className="flex items-center gap-1.5 sm:gap-2 px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl bg-success/10 hover:bg-success/20 text-success border border-success/20 hover:border-success/40 transition-all duration-200 hover:scale-105 active:scale-95 shrink-0 group whitespace-nowrap"
            >
              <BarChart2 className="h-4 w-4 sm:h-[18px] sm:w-[18px] group-hover:scale-110 transition-transform" />
              <span className="text-xs sm:text-sm font-semibold hidden sm:inline">View Analytics</span>
              <span className="text-xs font-semibold sm:hidden">Analytics</span>
            </button>
          </div>
        </div>

        <SortableSectionList groupKey="oht-sections" sections={sections} />
      </main>
      <StatusBar />
    </div>
  );
};

export default OhtPage;
