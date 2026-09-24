import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useScada } from '@/contexts/ScadaContext';
import StatusBar from '@/components/StatusBar';
import InstrumentCard from '@/components/InstrumentCard';
import SortableCardGrid, { SortableItem } from '@/components/SortableCardGrid';
import SortableSectionList from '@/components/SortableSectionList';
import { WTP_SENSORS } from '@/config/shahpurSensors';
import { BarChart2, LayoutGrid, Activity } from 'lucide-react';
import WtpIcon from '@/components/icons/WtpIcon';
import { Button } from '@/components/ui/button';
import WtpProcessSimulation from '@/components/WtpProcessSimulation';



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


  const rawWaterIds = useMemo(() => WTP_SENSORS.filter(s => s.subsection === 'raw-water' && !s.notInstalled).map(s => s.id), []);
  const backwashIds = useMemo(() => ['WTP-LT-BW'].filter(id => !sensorMap[id]?.notInstalled), [sensorMap]);
  const filterBedIds = useMemo(() => ['WTP-ROF-FB1', 'WTP-LOH-FB1', 'WTP-LOH-FB2'].filter(id => !sensorMap[id]?.notInstalled), [sensorMap]);
  const clearWaterIds = useMemo(() => [
    'WTP-LT-CW', 'WTP-Pump1', 'WTP-Pump2', 'WTP-Trip1', 'WTP-Trip2', 'WTP-PT1', 'WTP-PT2', 'WTP-HeaderPT',
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
      id: 'wtp-sec-filter-bed',
      content: (
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-500" />Filter Bed</h3>
          <SortableCardGrid groupKey="wtp-filter-bed" sensorIds={filterBedIds} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6 w-full">
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
                {renderSensorCard(id, id.startsWith('WTP-Pump') ? 'wtp' : undefined)}
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
  ], [rawWaterIds, backwashIds, filterBedIds, clearWaterIds, outletIds, wtpTags, sensorMap]);

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
              <p className="text-xs sm:text-sm text-muted-foreground">{WTP_SENSORS.length} instruments monitoring</p>
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
