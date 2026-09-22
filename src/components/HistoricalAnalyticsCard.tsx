import React, { memo, useMemo, useId } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, TrendingUp, TrendingDown, Minus, BarChart3, Droplets, Gauge, Zap, Activity, Database, Clock } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useScada } from '@/contexts/ScadaContext';
import { getTagConnection } from '@/hooks/useTagConnection';

interface HistoricalAnalyticsCardProps {
  section: 'intake' | 'wtp' | 'oht';
}

interface DaySummary {
  date: string;
  avgLevel: number;
  avgPressure: number;
  avgFlow: number;
  totalConsumption: number;
  pumpRuntime: number;
  sampleCount: number;
}

const SECTION_COLORS: Record<string, { primary: string; gradient: string; border: string }> = {
  intake: { primary: 'hsl(199, 89%, 48%)', gradient: 'from-blue-500/10 via-cyan-500/5 to-transparent', border: 'border-blue-500/20' },
  wtp: { primary: 'hsl(262, 83%, 58%)', gradient: 'from-purple-500/10 via-violet-500/5 to-transparent', border: 'border-purple-500/20' },
  oht: { primary: 'hsl(142, 71%, 45%)', gradient: 'from-green-500/10 via-emerald-500/5 to-transparent', border: 'border-green-500/20' },
};

const DAY_COLORS = [
  'hsl(199, 89%, 48%)', 'hsl(262, 83%, 58%)', 'hsl(142, 71%, 45%)',
  'hsl(38, 92%, 50%)', 'hsl(350, 89%, 60%)', 'hsl(180, 70%, 45%)', 'hsl(220, 80%, 55%)',
];

const formatRuntime = (seconds: number): string => {
  if (seconds <= 0) return '0h';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
};

const MiniBarChart: React.FC<{ data: number[]; labels: string[]; color: string; unit: string; title: string; icon: React.ReactNode }> = memo(({ data, labels, color, unit, title, icon }) => {
  const maxVal = Math.max(...data, 0.1);
  const hasData = data.some(v => v > 0);

  return (
    <div className="rounded-2xl border border-border/50 p-4 bg-gradient-to-br from-background to-muted/10 hover:border-primary/20 transition-all">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">{title}</span>
        <span className="ml-auto text-[10px] font-mono text-muted-foreground">{unit}</span>
      </div>
      {hasData ? (
        <>
          <div className="flex items-end gap-[3px] h-16">
            {data.map((val, i) => {
              const heightPct = maxVal > 0 ? (val / maxVal) * 100 : 0;
              const isMax = val === maxVal && val > 0;
              const barColor = isMax ? 'hsl(var(--destructive))' : color;
              return (
                <div key={i} className="flex-1 flex flex-col items-center group relative">
                  <div
                    className="w-full rounded-t-sm transition-all duration-500 ease-out"
                    style={{
                      height: `${Math.max(heightPct, 3)}%`,
                      backgroundColor: barColor,
                      opacity: val > 0 ? 1 : 0.15,
                      animation: `barGrowH 0.6s ease-out ${i * 0.05}s both`,
                    }}
                  />
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-popover text-popover-foreground text-[9px] px-2 py-1 rounded-md shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-20 border border-border transition-opacity">
                    {labels[i]}: {val.toFixed(1)} {unit}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mt-1.5">
            {labels.map((l, i) => (
              <span key={i} className="text-[7px] text-muted-foreground font-medium flex-1 text-center">
                {l.split(' ')[0]}
              </span>
            ))}
          </div>
        </>
      ) : (
        <div className="h-16 flex items-center justify-center">
          <span className="text-[10px] text-muted-foreground/60 italic">Awaiting data collection...</span>
        </div>
      )}
    </div>
  );
});
MiniBarChart.displayName = 'MiniBarChart';

/** Live Instrument Status Row */
const LiveInstrumentRow: React.FC<{ label: string; value: number; unit: string; status: string; color: string }> = memo(({ label, value, unit, status, color }) => {
  const isLive = status === 'connected' || status === 'inactive';
  const isZero = value === 0 && isLive;
  return (
    <div className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-muted/20 transition-colors">
      <div className={`w-2 h-2 rounded-full shrink-0 ${isLive ? 'bg-success animate-pulse' : 'bg-muted-foreground/30'}`} />
      <span className="text-[10px] font-bold text-muted-foreground flex-1 truncate">{label}</span>
      <span className="text-xs font-mono font-bold tabular-nums" style={{ color: isLive ? color : 'hsl(var(--muted-foreground))' }}>
        {value.toFixed(1)}
      </span>
      <span className="text-[9px] text-muted-foreground">{unit}</span>
      <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold ${
        isLive ? 'bg-success/10 text-success' : 'bg-muted/50 text-muted-foreground'
      }`}>
        {isLive ? (isZero ? 'ZERO' : 'LIVE') : status === 'stale' ? 'DELAY' : status === 'fault' ? 'FAULT' : 'OFF'}
      </span>
    </div>
  );
});
LiveInstrumentRow.displayName = 'LiveInstrumentRow';

const HistoricalAnalyticsCard: React.FC<HistoricalAnalyticsCardProps> = memo(({ section }) => {
  const colors = SECTION_COLORS[section];
  const { intakeTags, wtpTags, ohtTags } = useScada();

  // Get live tags for this section
  const liveTags = section === 'intake' ? intakeTags : section === 'wtp' ? wtpTags : ohtTags;

  // Build live instrument summary
  const liveInstruments = useMemo(() => {
    return liveTags.filter(tag => !tag.notInstalled && tag.instrumentType !== 'pump').map(tag => ({
      id: tag.id,
      label: tag.label,
      value: tag.value,
      unit: tag.unit,
      status: getTagConnection(tag),
      instrumentType: tag.instrumentType,
    }));
  }, [liveTags]);

  const liveStats = useMemo(() => {
    const totalInstruments = liveInstruments.length;
    const onlineCount = liveInstruments.filter(i => i.status === 'connected' || i.status === 'inactive').length;
    const activeCount = liveInstruments.filter(i => i.status === 'connected' && i.value > 0).length;
    
    const fresh = liveInstruments.filter(i => i.status === 'connected' || i.status === 'inactive');
    const levelTags = fresh.filter(i => i.instrumentType === 'lt');
    const flowTags = fresh.filter(i => i.instrumentType === 'flow');
    const ptTags = fresh.filter(i => i.instrumentType === 'pt');
    
    const avgLevel = levelTags.length > 0 ? levelTags.reduce((s, t) => s + t.value, 0) / levelTags.length : 0;
    const totalFlow = flowTags.reduce((s, t) => s + t.value, 0);
    const avgPressure = ptTags.length > 0 ? ptTags.reduce((s, t) => s + t.value, 0) / ptTags.length : 0;

    return { totalInstruments, onlineCount, activeCount, avgLevel, totalFlow, avgPressure };
  }, [liveInstruments]);

  const { data: historicalData, isLoading } = useQuery({
    queryKey: ['historical-analytics', section],
    queryFn: async () => {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 6);
      const startStr = startDate.toISOString().split('T')[0];

      const [aggRes, consRes, pumpRes] = await Promise.all([
        supabase.from('historian_aggregates').select('*').eq('section', section).gte('bucket_start', startStr).order('bucket_start', { ascending: true }),
        supabase.from('consumption_data').select('*').eq('section', section).gte('date', startStr).order('date', { ascending: true }),
        section !== 'oht'
          ? supabase.from('pump_analytics').select('*').eq('section', section).gte('date', startStr).order('date', { ascending: true })
          : Promise.resolve({ data: [] }),
      ]);

      const days: Record<string, DaySummary> = {};
      for (let i = 0; i < 7; i++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + i);
        const dateStr = d.toISOString().split('T')[0];
        days[dateStr] = { date: dateStr, avgLevel: 0, avgPressure: 0, avgFlow: 0, totalConsumption: 0, pumpRuntime: 0, sampleCount: 0 };
      }

      for (const agg of (aggRes.data || [])) {
        const dateStr = agg.bucket_start.split('T')[0];
        if (!days[dateStr]) continue;
        const tagId = agg.tag_id?.toLowerCase() || '';

        // Skip legacy Mohgaon OHT-3 / OHT-4 tags and uninstalled sensors
        if (tagId.startsWith('oht3') || tagId.startsWith('oht4') || 
            tagId.startsWith('oht-3') || tagId.startsWith('oht-4') ||
            tagId.includes('ward no') ||
            tagId === 'wtp-pump3' || tagId === 'wtp-pump4' || 
            tagId === 'wtp-pt3' || tagId === 'wtp-pt4' ||
            tagId === 'wtp-combinedpt1' || tagId === 'wtp-combinedpt2' ||
            tagId === 'wtp-kw' || tagId === 'int-kw') {
          continue;
        }

        if (tagId.includes('lt') || tagId.includes('level')) days[dateStr].avgLevel = Math.max(days[dateStr].avgLevel, Number(agg.avg_value));
        if (tagId.includes('pt') && !tagId.includes('com')) days[dateStr].avgPressure = Math.max(days[dateStr].avgPressure, Number(agg.avg_value));
        if (tagId.includes('flow')) days[dateStr].avgFlow += Number(agg.avg_value);
        days[dateStr].sampleCount += agg.sample_count;
      }

      for (const c of (consRes.data || [])) {
        if (days[c.date]) days[c.date].totalConsumption += Number(c.hourly_consumption || 0);
      }

      for (const p of ((pumpRes as any).data || [])) {
        if (days[p.date]) days[p.date].pumpRuntime += Number(p.runtime_seconds || 0);
      }

      return Object.values(days).sort((a, b) => a.date.localeCompare(b.date));
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const summaries = historicalData || [];
  const hasHistoricalData = summaries.some(s => s.sampleCount > 0 || s.totalConsumption > 0 || s.pumpRuntime > 0);

  const dateLabels = useMemo(() =>
    summaries.map(s => new Date(s.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })),
    [summaries]
  );

  const totalConsumption7d = useMemo(() => summaries.reduce((s, d) => s + d.totalConsumption, 0), [summaries]);
  const avgDailyConsumption = summaries.length > 0 ? totalConsumption7d / summaries.length : 0;
  const peakDay = useMemo(() => {
    if (summaries.length === 0) return null;
    return summaries.reduce((best, cur) => cur.totalConsumption > best.totalConsumption ? cur : best);
  }, [summaries]);

  const sectionLabel = section === 'intake' ? 'Intake' : section === 'wtp' ? 'WTP' : 'OHT';
  const todayIdx = summaries.length - 1;

  return (
    <Card className={`opacity-0 animate-fade-in relative overflow-hidden ${colors.border}`} style={{ animationDelay: '400ms' }}>
      <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: `linear-gradient(90deg, transparent, ${colors.primary}80, transparent)` }} />
      <div className={`absolute inset-0 bg-gradient-to-br ${colors.gradient} pointer-events-none`} />

      <CardHeader className="pb-3 relative">
        <CardTitle className="text-lg flex items-center gap-2.5">
          <div className="p-2 rounded-xl ring-1 shrink-0" style={{ backgroundColor: `${colors.primary}15`, borderColor: `${colors.primary}30` }}>
            <Calendar className="h-5 w-5" style={{ color: colors.primary }} />
          </div>
          <div>
            <span className="font-bold block">Historical Analytics</span>
            <span className="text-[10px] text-muted-foreground font-medium">Last 7 days • {sectionLabel} Section</span>
          </div>
          <span className="text-xs font-semibold text-muted-foreground ml-auto px-3 py-1 rounded-full bg-muted/80 ring-1 ring-border/50 shrink-0">
            7 DAYS
          </span>
        </CardTitle>
      </CardHeader>

      <CardContent className="relative">
        {isLoading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <Skeleton className="h-24 rounded-xl" />
              <Skeleton className="h-24 rounded-xl" />
              <Skeleton className="h-24 rounded-xl" />
            </div>
            <Skeleton className="h-32 rounded-xl" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* ===== LIVE INSTRUMENT STATUS ===== */}
            <div className="rounded-2xl border border-border/50 p-4 bg-gradient-to-br from-background to-muted/10">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 rounded-lg bg-success/10">
                  <Activity className="h-3.5 w-3.5 text-success" />
                </div>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Live Instrument Status</span>
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-[10px] font-mono font-bold text-success">{liveStats.onlineCount}</span>
                  <span className="text-[10px] text-muted-foreground">/</span>
                  <span className="text-[10px] font-mono font-bold text-foreground">{liveStats.totalInstruments}</span>
                  <span className="text-[10px] text-muted-foreground">Online</span>
                </div>
              </div>

              {/* Quick KPIs from live data */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="rounded-xl p-2.5 text-center bg-primary/5 border border-primary/10">
                  <div className="text-[9px] text-primary/70 uppercase tracking-wider font-bold mb-1">Level</div>
                  <div className="text-lg font-mono font-bold text-primary tabular-nums">{liveStats.avgLevel.toFixed(1)}</div>
                  <div className="text-[9px] text-muted-foreground">m</div>
                </div>
                <div className="rounded-xl p-2.5 text-center bg-success/5 border border-success/10">
                  <div className="text-[9px] text-success/70 uppercase tracking-wider font-bold mb-1">Flow</div>
                  <div className="text-lg font-mono font-bold text-success tabular-nums">{liveStats.totalFlow.toFixed(1)}</div>
                  <div className="text-[9px] text-muted-foreground">m³/hr</div>
                </div>
                <div className="rounded-xl p-2.5 text-center bg-accent/5 border border-accent/10">
                  <div className="text-[9px] text-accent/70 uppercase tracking-wider font-bold mb-1">Pressure</div>
                  <div className="text-lg font-mono font-bold text-accent tabular-nums">{liveStats.avgPressure.toFixed(1)}</div>
                  <div className="text-[9px] text-muted-foreground">Bar</div>
                </div>
              </div>

              {/* Per-instrument list */}
              <div className="space-y-0.5 max-h-48 overflow-y-auto">
                {liveInstruments.map(inst => (
                  <LiveInstrumentRow
                    key={inst.id}
                    label={inst.label}
                    value={inst.value}
                    unit={inst.unit}
                    status={inst.status}
                    color={colors.primary}
                  />
                ))}
              </div>
            </div>

            {/* ===== KPI Summary (from historical data) ===== */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl p-4 text-center relative overflow-hidden border-2 bg-gradient-to-br from-primary/10 to-primary/3 border-primary/15 hover:border-primary/25 transition-colors">
                <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
                <div className="flex items-center justify-center gap-1.5 mb-2">
                  <Droplets className="h-4 w-4 text-primary" />
                  <span className="text-[10px] text-primary/80 uppercase tracking-wider font-bold">7-Day Total</span>
                </div>
                <div className="text-2xl font-mono font-bold text-primary tabular-nums leading-none">
                  {totalConsumption7d > 0 ? totalConsumption7d.toFixed(0) : '—'}
                </div>
                <div className="text-[10px] text-muted-foreground mt-1 font-medium">{totalConsumption7d > 0 ? 'm³' : 'No data'}</div>
              </div>

              <div className="rounded-2xl p-4 text-center relative overflow-hidden border-2 bg-gradient-to-br from-success/10 to-success/3 border-success/15 hover:border-success/25 transition-colors">
                <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-transparent via-success/50 to-transparent" />
                <div className="flex items-center justify-center gap-1.5 mb-2">
                  <Gauge className="h-4 w-4 text-success" />
                  <span className="text-[10px] text-success/80 uppercase tracking-wider font-bold">Daily Avg</span>
                </div>
                <div className="text-2xl font-mono font-bold text-success tabular-nums leading-none">
                  {avgDailyConsumption > 0 ? avgDailyConsumption.toFixed(1) : '—'}
                </div>
                <div className="text-[10px] text-muted-foreground mt-1 font-medium">{avgDailyConsumption > 0 ? 'm³/day' : 'No data'}</div>
              </div>

              <div className="rounded-2xl p-4 text-center relative overflow-hidden border-2 bg-gradient-to-br from-destructive/10 to-destructive/3 border-destructive/15 hover:border-destructive/25 transition-colors">
                <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-transparent via-destructive/50 to-transparent" />
                <div className="flex items-center justify-center gap-1.5 mb-2">
                  <Zap className="h-4 w-4 text-destructive" />
                  <span className="text-[10px] text-destructive/80 uppercase tracking-wider font-bold">Peak Day</span>
                </div>
                <div className="text-2xl font-mono font-bold text-destructive tabular-nums leading-none">
                  {peakDay && peakDay.totalConsumption > 0 ? peakDay.totalConsumption.toFixed(0) : '—'}
                </div>
                <div className="text-[10px] text-muted-foreground mt-1 font-medium">
                  {peakDay && peakDay.totalConsumption > 0 ? new Date(peakDay.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : 'No data'}
                </div>
              </div>
            </div>

            {/* ===== CHARTS GRID ===== */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <MiniBarChart data={summaries.map(s => s.totalConsumption)} labels={dateLabels} color="hsl(var(--primary))" unit="m³" title="Daily Consumption" icon={<Droplets className="h-3.5 w-3.5 text-primary" />} />
              <MiniBarChart data={summaries.map(s => s.avgFlow)} labels={dateLabels} color="hsl(var(--success))" unit="m³/hr" title="Avg Flow Rate" icon={<Activity className="h-3.5 w-3.5 text-success" />} />
              <MiniBarChart data={summaries.map(s => s.avgLevel)} labels={dateLabels} color="hsl(var(--accent))" unit="m" title="Avg Level" icon={<Gauge className="h-3.5 w-3.5 text-accent" />} />
              {section !== 'oht' ? (
                <MiniBarChart data={summaries.map(s => s.pumpRuntime / 3600)} labels={dateLabels} color="hsl(38, 92%, 50%)" unit="hrs" title="Pump Runtime" icon={<Zap className="h-3.5 w-3.5 text-warning" />} />
              ) : (
                <MiniBarChart data={summaries.map(s => s.avgPressure)} labels={dateLabels} color="hsl(262, 83%, 58%)" unit="Bar" title="Avg Pressure" icon={<BarChart3 className="h-3.5 w-3.5 text-purple-500" />} />
              )}
            </div>

            {/* ===== DAY-WISE TABLE ===== */}
            {hasHistoricalData ? (
              <div className="rounded-2xl border border-border/50 overflow-hidden">
                <div className="bg-muted/30 px-4 py-2.5 flex items-center gap-2 border-b border-border/50">
                  <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Day-wise Summary</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[10px]">
                    <thead>
                      <tr className="border-b border-border/30">
                        <th className="text-left px-3 py-2 text-muted-foreground font-bold uppercase tracking-wider">Date</th>
                        <th className="text-right px-3 py-2 text-muted-foreground font-bold uppercase tracking-wider">Level</th>
                        <th className="text-right px-3 py-2 text-muted-foreground font-bold uppercase tracking-wider">Flow</th>
                        <th className="text-right px-3 py-2 text-muted-foreground font-bold uppercase tracking-wider">Consumption</th>
                        {section !== 'oht' && <th className="text-right px-3 py-2 text-muted-foreground font-bold uppercase tracking-wider">Pump Runtime</th>}
                        <th className="text-right px-3 py-2 text-muted-foreground font-bold uppercase tracking-wider">Samples</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summaries.map((day, i) => {
                        const isToday = i === todayIdx;
                        const dateObj = new Date(day.date);
                        const dayName = dateObj.toLocaleDateString('en-IN', { weekday: 'short' });
                        const dateStr = dateObj.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
                        return (
                          <tr key={day.date} className={`border-b border-border/20 transition-colors hover:bg-muted/20 ${isToday ? 'bg-primary/5' : ''}`}>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: DAY_COLORS[i % DAY_COLORS.length] }} />
                                <span className="font-bold text-foreground">{dateStr}</span>
                                <span className="text-muted-foreground">{dayName}</span>
                                {isToday && <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-bold">TODAY</span>}
                              </div>
                            </td>
                            <td className="text-right px-3 py-2.5 font-mono font-bold tabular-nums">
                              <span className={day.avgLevel > 0 ? 'text-accent' : 'text-muted-foreground'}>{day.avgLevel.toFixed(1)} m</span>
                            </td>
                            <td className="text-right px-3 py-2.5 font-mono font-bold tabular-nums">
                              <span className={day.avgFlow > 0 ? 'text-success' : 'text-muted-foreground'}>{day.avgFlow.toFixed(1)} m³/hr</span>
                            </td>
                            <td className="text-right px-3 py-2.5 font-mono font-bold tabular-nums">
                              <span className={day.totalConsumption > 0 ? 'text-primary' : 'text-muted-foreground'}>{day.totalConsumption.toFixed(1)} m³</span>
                            </td>
                            {section !== 'oht' && (
                              <td className="text-right px-3 py-2.5 font-mono font-bold tabular-nums">
                                <span className={day.pumpRuntime > 0 ? 'text-warning' : 'text-muted-foreground'}>{formatRuntime(day.pumpRuntime)}</span>
                              </td>
                            )}
                            <td className="text-right px-3 py-2.5 font-mono tabular-nums text-muted-foreground">{day.sampleCount}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border/50 p-6 text-center bg-muted/5">
                <Database className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm font-semibold text-muted-foreground">No Historical Data Yet</p>
                <p className="text-[11px] text-muted-foreground/60 mt-1">Data will be recorded automatically as instruments send readings via MQTT. Check back after some time.</p>
                <div className="flex items-center justify-center gap-2 mt-3">
                  <Clock className="h-3 w-3 text-muted-foreground/40" />
                  <span className="text-[10px] text-muted-foreground/50">7-day rolling window</span>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>

      <style>{`
        @keyframes barGrowH {
          from { transform: scaleY(0); opacity: 0; }
          to { transform: scaleY(1); opacity: 1; }
        }
      `}</style>
    </Card>
  );
});

HistoricalAnalyticsCard.displayName = 'HistoricalAnalyticsCard';
export default HistoricalAnalyticsCard;
