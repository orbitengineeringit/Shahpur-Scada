import { isPumpRunTag } from '@/config/shahpurSensors';
import React, { memo, useMemo, useId } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock, Play, BarChart3, Zap, TrendingUp, Timer, Activity, Gauge, Power } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { logError } from '@/lib/errorLogger';
import { useScada } from '@/contexts/ScadaContext';

interface PumpAnalyticsData {
  pump_id: string;
  section: string;
  runtime_seconds: number;
  start_count: number;
  total_runtime_seconds: number;
  total_start_count: number;
  current_state: boolean;
  date: string;
  last_state_change?: string;
  updated_at?: string;
}

interface HistoricalDay {
  date: string;
  runtime_seconds: number;
  start_count: number;
}

interface PumpAnalyticsCardProps {
  section: 'intake' | 'wtp';
}

const formatRuntime = (seconds: number): string => {
  if (seconds <= 0) return '0m';
  const days = Math.floor(seconds / 86400);
  const hrs = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hrs}h`;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
};

const formatDuration = (ms: number): string => {
  if (ms <= 0) return '—';
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
};

// Large animated circular availability gauge
const AvailabilityRing: React.FC<{ pct: number; size?: number }> = memo(({ pct, size = 56 }) => {
  const r = (size - 8) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (pct / 100) * circumference;
  const color = pct >= 75 ? 'hsl(var(--success))' : pct >= 40 ? 'hsl(var(--warning))' : 'hsl(var(--destructive))';
  const bgColor = pct >= 75 ? 'hsl(var(--success) / 0.1)' : pct >= 40 ? 'hsl(var(--warning) / 0.1)' : 'hsl(var(--destructive) / 0.1)';

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r}
        fill={bgColor} stroke="hsl(var(--muted))" strokeWidth="4" />
      <circle cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke={color} strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className="transition-all duration-1000 ease-out"
      >
        <animate attributeName="stroke-dashoffset" from={circumference} to={offset} dur="1.2s" fill="freeze" />
      </circle>
      <text x={size / 2} y={size / 2 + 1} textAnchor="middle" dominantBaseline="central"
        className="fill-foreground font-mono font-bold" style={{ fontSize: '13px' }}>
        {pct.toFixed(0)}%
      </text>
    </svg>
  );
});
AvailabilityRing.displayName = 'AvailabilityRing';

// Smooth SVG wave chart for 7-day trend
const TrendWaveChart: React.FC<{ data: number[]; labels: string[] }> = memo(({ data, labels }) => {
  const uid = useId().replace(/:/g, '');
  const width = 200;
  const height = 44;
  const pad = 4;

  const { linePath, areaPath, dots } = useMemo(() => {
    if (data.length < 2) return { linePath: '', areaPath: '', dots: [] };
    const maxVal = Math.max(...data, 1);
    const pts = data.map((v, i) => ({
      x: pad + (i / (data.length - 1)) * (width - pad * 2),
      y: pad + (1 - v / maxVal) * (height - pad * 2),
      value: v,
    }));

    const line: string[] = [];
    const area: string[] = [`M ${pts[0].x},${height - pad}`, `L ${pts[0].x},${pts[0].y}`];
    for (let i = 0; i < pts.length; i++) {
      if (i === 0) {
        line.push(`M ${pts[i].x},${pts[i].y}`);
      } else {
        const cpx = (pts[i - 1].x + pts[i].x) / 2;
        line.push(`C ${cpx},${pts[i - 1].y} ${cpx},${pts[i].y} ${pts[i].x},${pts[i].y}`);
        area.push(`C ${cpx},${pts[i - 1].y} ${cpx},${pts[i].y} ${pts[i].x},${pts[i].y}`);
      }
    }
    area.push(`L ${pts[pts.length - 1].x},${height - pad}`, 'Z');
    return { linePath: line.join(' '), areaPath: area.join(' '), dots: pts };
  }, [data]);

  if (data.length < 2) return null;

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <defs>
        <linearGradient id={`pump-grad-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.3" />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#pump-grad-${uid})`}>
        <animate attributeName="opacity" from="0" to="1" dur="0.6s" fill="freeze" />
      </path>
      <path d={linePath} fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" strokeLinecap="round">
        <animate attributeName="opacity" from="0" to="1" dur="0.4s" fill="freeze" />
      </path>
      {dots.map((dot, i) => (
        <g key={i}>
          {i === dots.length - 1 && (
            <circle cx={dot.x} cy={dot.y} r="4" fill="hsl(var(--primary))" opacity="0.15">
              <animate attributeName="r" values="4;7;4" dur="2s" repeatCount="indefinite" />
            </circle>
          )}
          <circle cx={dot.x} cy={dot.y} r={i === dots.length - 1 ? 2.5 : 1.5}
            fill={i === dots.length - 1 ? 'hsl(var(--primary))' : 'hsl(var(--primary) / 0.5)'}
            stroke="hsl(var(--background))" strokeWidth="1">
            <animate attributeName="opacity" from="0" to="1" dur="0.3s" begin={`${i * 0.06}s`} fill="freeze" />
          </circle>
          <title>{`${labels[i]}: ${formatRuntime(dot.value)}`}</title>
        </g>
      ))}
    </svg>
  );
});
TrendWaveChart.displayName = 'TrendWaveChart';

const PumpAnalyticsCard: React.FC<PumpAnalyticsCardProps> = memo(({ section }) => {
  const { intakeTags, wtpTags } = useScada();
  const pumpIds = useMemo(() => {
    const tags = section === 'intake' ? intakeTags : wtpTags;
    return tags.filter(t => !t.notInstalled && isPumpRunTag(t.id)).map(t => t.id);
  }, [section, intakeTags, wtpTags]);

  const pumpIdsKey = pumpIds.join(',');

  const { data: queryData, isLoading } = useQuery({
    queryKey: ['pump-analytics', section, pumpIdsKey],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 6);
      const weekAgoStr = weekAgo.toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('pump_analytics')
        .select('*')
        .eq('section', section)
        .in('pump_id', pumpIds)
        .gte('date', weekAgoStr)
        .order('date', { ascending: true });

      if (error) throw error;

      const todayData = (data || []).filter(d => d.date === today) as PumpAnalyticsData[];
      const hist: Record<string, HistoricalDay[]> = {};
      for (const pumpId of pumpIds) {
        hist[pumpId] = (data || [])
          .filter(d => d.pump_id === pumpId)
          .map(d => ({ date: d.date, runtime_seconds: Number(d.runtime_seconds), start_count: d.start_count }));
      }
      return { analytics: todayData, history: hist };
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const analytics = queryData?.analytics ?? [];
  const history = queryData?.history ?? {};

  return (
    <Card className="opacity-0 animate-fade-in relative overflow-hidden border-primary/20" style={{ animationDelay: '300ms' }}>
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

      <CardHeader className="pb-4">
        <CardTitle className="text-lg flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-primary/10 ring-1 ring-primary/20">
            <BarChart3 className="h-5 w-5 text-primary" />
          </div>
          <span className="font-bold">Pump Analytics</span>
          <span className="text-xs font-semibold text-muted-foreground ml-auto px-3 py-1 rounded-full bg-muted/80 ring-1 ring-border/50">
            {section.toUpperCase()}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className={`grid grid-cols-1 sm:grid-cols-2 ${pumpIds.length > 2 ? 'xl:grid-cols-4 lg:grid-cols-2' : ''} gap-4`}>
            {pumpIds.map(id => (
              <Skeleton key={id} className="h-56 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className={`grid grid-cols-1 sm:grid-cols-2 ${pumpIds.length > 2 ? 'xl:grid-cols-4 lg:grid-cols-2' : ''} gap-5`}>
            {pumpIds.map((pumpId) => {
              const data = analytics.find(a => a.pump_id === pumpId);
              const pumpName = (section === 'wtp' ? wtpTags : intakeTags).find(tag => tag.id === pumpId)?.label ?? pumpId;
              if (!data && !history[pumpId]?.length) {
                return <div key={pumpId} className="rounded-2xl border p-5"><strong>{pumpName}</strong><p className="text-sm text-muted-foreground">Runtime history unavailable</p></div>;
              }
              const pumpHistory = history[pumpId] || [];
              const runtimeSec = data?.runtime_seconds || 0;
              const startCount = data?.start_count || 0;
              const totalRuntime = data?.total_runtime_seconds || 0;
              const totalStarts = data?.total_start_count || 0;
              const avgRuntimePerStart = startCount > 0 ? runtimeSec / startCount : 0;
              const elapsedSec = new Date().getHours() * 3600 + new Date().getMinutes() * 60 || 1;
              const availabilityPct = runtimeSec > 0 ? Math.min((runtimeSec / elapsedSec) * 100, 100) : 0;
              const lastChange = data?.last_state_change ? new Date(data.last_state_change) : null;
              const stateDuration = lastChange ? Date.now() - lastChange.getTime() : 0;
              const trendData = pumpHistory.map(h => h.runtime_seconds);
              const trendLabels = pumpHistory.map(h => {
                const d = new Date(h.date);
                return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
              });
              const isRunning = !!data?.current_state;
              const pumpDisplayName = pumpName;

              return (
                <div key={pumpId}
                  className={`rounded-2xl p-5 space-y-4 relative overflow-hidden border-2 transition-all duration-300 ${
                    isRunning
                      ? 'bg-gradient-to-br from-green-500/8 via-background to-green-500/4 border-green-500/30 shadow-[0_0_20px_-3px_hsl(var(--success)/0.2)]'
                      : 'bg-gradient-to-br from-muted/50 to-muted/20 border-border/60 hover:border-primary/25'
                  }`}
                >
                  {/* Running state glow bar */}
                  <div className={`absolute top-0 left-0 right-0 h-[3px] transition-all duration-500 ${
                    isRunning
                      ? 'bg-gradient-to-r from-green-500/50 via-green-400 to-green-500/50'
                      : 'bg-gradient-to-r from-transparent via-border/60 to-transparent'
                  }`} />

                  {/* ===== HEADER — Pump name + Status ===== */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        isRunning ? 'bg-green-500/15 ring-1 ring-green-500/25' : 'bg-muted/60 ring-1 ring-border/40'
                      }`}>
                        <Power className={`h-5 w-5 ${isRunning ? 'text-green-500' : 'text-muted-foreground'}`} />
                      </div>
                      <div>
                        <span className="text-base font-bold text-foreground">{pumpDisplayName}</span>
                        {lastChange && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                            <Timer className="h-3 w-3" />
                            {isRunning ? 'Running' : 'Stopped'} for {formatDuration(stateDuration)}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isRunning && (
                        <Activity className="h-4 w-4 text-green-500 animate-pulse" />
                      )}
                      <span className={`text-xs px-3 py-1.5 rounded-full font-bold tracking-wide ${
                        isRunning
                          ? 'bg-green-500/15 text-green-500 ring-1 ring-green-500/30 shadow-sm'
                          : 'bg-destructive/12 text-destructive ring-1 ring-destructive/20'
                      }`}>
                        {isRunning ? '● RUNNING' : '○ STOPPED'}
                      </span>
                    </div>
                  </div>

                  {/* ===== TODAY SECTION ===== */}
                  <div className="space-y-2.5">
                    <div className="text-xs text-primary font-bold uppercase tracking-widest flex items-center gap-2">
                      <div className="w-4 h-[2px] bg-primary/60 rounded-full" />
                      Today
                      <div className="flex-1 h-[1px] bg-border/50" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {/* Runtime tile */}
                      <div className={`rounded-xl p-3 flex items-center gap-3 transition-colors ${
                        runtimeSec > 0 ? 'bg-primary/8 border border-primary/15' : 'bg-muted/30 border border-transparent'
                      }`}>
                        <div className={`p-1.5 rounded-lg ${runtimeSec > 0 ? 'bg-primary/15' : 'bg-muted/60'}`}>
                          <Clock className={`h-4 w-4 ${runtimeSec > 0 ? 'text-primary' : 'text-muted-foreground'}`} />
                        </div>
                        <div>
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Runtime</div>
                          <div className="text-base font-mono font-bold tabular-nums text-foreground leading-tight">{formatRuntime(runtimeSec)}</div>
                        </div>
                      </div>
                      {/* Starts tile */}
                      <div className={`rounded-xl p-3 flex items-center gap-3 transition-colors ${
                        startCount > 0 ? 'bg-accent/8 border border-accent/15' : 'bg-muted/30 border border-transparent'
                      }`}>
                        <div className={`p-1.5 rounded-lg ${startCount > 0 ? 'bg-accent/15' : 'bg-muted/60'}`}>
                          <Play className={`h-4 w-4 ${startCount > 0 ? 'text-accent' : 'text-muted-foreground'}`} />
                        </div>
                        <div>
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Starts</div>
                          <div className="text-base font-mono font-bold tabular-nums text-foreground leading-tight">{String(startCount)}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ===== LIFETIME SECTION ===== */}
                  <div className="space-y-2.5">
                    <div className="text-xs text-muted-foreground font-bold uppercase tracking-widest flex items-center gap-2">
                      <div className="w-4 h-[2px] bg-muted-foreground/40 rounded-full" />
                      Lifetime
                      <div className="flex-1 h-[1px] bg-border/50" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl p-3 flex items-center gap-3 bg-muted/30 border border-transparent">
                        <div className="p-1.5 rounded-lg bg-muted/60">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div>
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Total Runtime</div>
                          <div className="text-base font-mono font-bold tabular-nums text-foreground leading-tight">{formatRuntime(totalRuntime)}</div>
                        </div>
                      </div>
                      <div className="rounded-xl p-3 flex items-center gap-3 bg-muted/30 border border-transparent">
                        <div className="p-1.5 rounded-lg bg-muted/60">
                          <Play className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div>
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Total Starts</div>
                          <div className="text-base font-mono font-bold tabular-nums text-foreground leading-tight">{String(totalStarts)}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ===== AVG/START + AVAILABILITY ===== */}
                  <div className="flex items-center justify-between border-t border-border/40 pt-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${avgRuntimePerStart > 0 ? 'bg-primary/12' : 'bg-muted/60'}`}>
                        <Zap className={`h-4 w-4 ${avgRuntimePerStart > 0 ? 'text-primary' : 'text-muted-foreground'}`} />
                      </div>
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Avg / Start</div>
                        <div className="text-lg font-mono font-bold tabular-nums text-foreground">
                          {formatRuntime(avgRuntimePerStart)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <AvailabilityRing pct={availabilityPct} size={56} />
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Availability</div>
                        <div className="text-lg font-mono font-bold tabular-nums text-foreground">
                          {availabilityPct.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 7-day trend */}
                  {trendData.length > 1 && (
                    <div className="border-t border-border/40 pt-3">
                      <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5 uppercase tracking-widest font-semibold">
                        <TrendingUp className="h-3 w-3" /> 7-Day Runtime
                      </div>
                      <TrendWaveChart data={trendData} labels={trendLabels} />
                      <div className="flex justify-between mt-1">
                        <span className="text-[9px] text-muted-foreground">{trendLabels[0]}</span>
                        <span className="text-[9px] text-muted-foreground">{trendLabels[trendLabels.length - 1]}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
});

PumpAnalyticsCard.displayName = 'PumpAnalyticsCard';
export default PumpAnalyticsCard;
