import React, { memo, useId, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useScada } from '@/contexts/ScadaContext';
import { BarChart3, Droplets, Gauge, Activity, TrendingUp, Waves } from 'lucide-react';

/**
 * OHT Analytics Card — shows a cross-tank summary for Shahpur OHTs:
 * • Level comparison (bar chart across 2 tanks)
 * • Flow distribution
 * • Overall network health
 */

const TANK_COLORS = [
  'hsl(199, 89%, 48%)',  // OHT-1 primary
  'hsl(38, 92%, 50%)',   // OHT-2 accent
];

const TANK_BG_COLORS = [
  'hsl(199, 89%, 48%, 0.12)',
  'hsl(38, 92%, 50%, 0.12)',
];

interface TankData {
  label: string;
  level: number;
  flow: number;
  pressure: number;
}

const TankLevelBars: React.FC<{ tanks: TankData[] }> = memo(({ tanks }) => {
  const maxLevel = Math.max(...tanks.map(t => t.level), 1);

  return (
    <div className="flex items-end gap-3 h-28 px-2">
      {tanks.map((tank, i) => {
        const heightPct = (tank.level / maxLevel) * 100;
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1.5 group relative">
            <span className="text-[10px] font-mono font-bold text-foreground tabular-nums opacity-0 group-hover:opacity-100 transition-opacity">
              {tank.level.toFixed(1)}%
            </span>
            <div className="w-full flex-1 relative rounded-t-md overflow-hidden bg-muted/30">
              <div
                className="absolute bottom-0 left-0 right-0 rounded-t-md transition-all duration-700 ease-out"
                style={{
                  height: `${Math.max(heightPct, 4)}%`,
                  backgroundColor: TANK_COLORS[i],
                  boxShadow: `0 0 8px ${TANK_COLORS[i]}40`,
                  animation: `barGrow 0.8s ease-out ${i * 0.1}s both`,
                }}
              />
              <div
                className="absolute left-0 right-0 h-1"
                style={{
                  bottom: `${Math.max(heightPct, 4)}%`,
                  background: `linear-gradient(180deg, ${TANK_COLORS[i]}60, transparent)`,
                }}
              />
            </div>
            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">
              {tank.label}
            </span>
            <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-popover text-popover-foreground text-[10px] px-2.5 py-1.5 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-20 border border-border backdrop-blur-sm transition-opacity duration-200">
              {tank.level.toFixed(1)} %
            </div>
          </div>
        );
      })}
    </div>
  );
});
TankLevelBars.displayName = 'TankLevelBars';

const FlowDonut: React.FC<{ tanks: TankData[] }> = memo(({ tanks }) => {
  const totalFlow = tanks.reduce((s, t) => s + t.flow, 0);
  const size = 100;
  const cx = size / 2;
  const cy = size / 2;
  const r = 38;
  const circumference = 2 * Math.PI * r;

  let accumulated = 0;
  const segments = tanks.map((tank, i) => {
    const pct = totalFlow > 0 ? tank.flow / totalFlow : 0;
    const dashLength = pct * circumference;
    const offset = accumulated * circumference;
    accumulated += pct;
    return { dashLength, offset, color: TANK_COLORS[i], label: tank.label, flow: tank.flow, pct };
  });

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
        {segments.map((seg, i) => (
          <circle
            key={i}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth="8"
            strokeDasharray={`${seg.dashLength} ${circumference - seg.dashLength}`}
            strokeDashoffset={-seg.offset}
            strokeLinecap="butt"
            transform={`rotate(-90 ${cx} ${cy})`}
            className="transition-all duration-1000"
          >
            <animate attributeName="stroke-dasharray" from={`0 ${circumference}`} to={`${seg.dashLength} ${circumference - seg.dashLength}`} dur="1s" fill="freeze" begin={`${i * 0.1}s`} />
          </circle>
        ))}
        <text x={cx} y={cy - 4} textAnchor="middle" dominantBaseline="central" className="fill-foreground font-mono font-bold" style={{ fontSize: '14px' }}>
          {totalFlow.toFixed(1)}
        </text>
        <text x={cx} y={cy + 10} textAnchor="middle" dominantBaseline="central" className="fill-muted-foreground" style={{ fontSize: '8px' }}>
          m³/hr
        </text>
      </svg>
      <div className="grid grid-cols-1 gap-y-1.5 flex-1">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
            <span className="text-[10px] text-muted-foreground font-medium">{seg.label}</span>
            <span className="text-[10px] font-mono font-bold text-foreground ml-auto tabular-nums">{seg.flow.toFixed(1)}</span>
          </div>
        ))}
      </div>
    </div>
  );
});
FlowDonut.displayName = 'FlowDonut';

const OhtAnalyticsCard: React.FC = memo(() => {
  const { ohtTags } = useScada();

  const tankData: TankData[] = useMemo(() => {
    return [1, 2].map(num => {
      const prefix = `OHT${num}`;
      const findVal = (key: string) => ohtTags.find(t => t.id === `${prefix}-${key}`)?.value ?? 0;
      return {
        label: num === 1 ? 'OHT - 1 Bus Station' : 'OHT - 2 (Pending Commissioning)',
        level: findVal('LT'),
        flow: findVal('Flow') || findVal('Flow-IN'),
        pressure: findVal('PT'),
      };
    });
  }, [ohtTags]);

  const totalFlow = tankData.reduce((s, t) => s + t.flow, 0);
  const avgLevel = tankData.length > 0 ? tankData.reduce((s, t) => s + t.level, 0) / tankData.length : 0;

  return (
    <Card className="opacity-0 animate-fade-in relative overflow-hidden border-success/20" style={{ animationDelay: '350ms' }}>
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-success/60 to-transparent" />

      <CardHeader className="pb-4">
        <CardTitle className="text-lg flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-success/10 ring-1 ring-success/20 shrink-0">
            <BarChart3 className="h-5 w-5 text-success" />
          </div>
          <span className="truncate font-bold">OHT Network Analytics</span>
          <span className="text-xs font-semibold text-muted-foreground ml-auto px-3 py-1 rounded-full bg-muted/80 ring-1 ring-border/50 shrink-0">
            2 TANKS
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: 'Total Flow', value: `${totalFlow.toFixed(1)}`, unit: 'm³/hr', icon: Waves, color: 'primary', active: totalFlow > 0 },
              { label: 'Avg Level', value: `${avgLevel.toFixed(1)}`, unit: '%', icon: Gauge, color: 'accent', active: avgLevel > 0 },
            ].map((kpi, i) => (
              <div key={i} className={`rounded-2xl p-4 text-center relative overflow-hidden border-2 transition-colors ${
                kpi.active 
                  ? `bg-gradient-to-br from-${kpi.color}/10 to-${kpi.color}/3 border-${kpi.color}/15 hover:border-${kpi.color}/25` 
                  : 'bg-gradient-to-br from-muted/50 to-muted/20 border-border/50'
              }`}>
                <div className={`absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-transparent ${
                  kpi.active ? `via-${kpi.color}/50` : 'via-border/50'
                } to-transparent`} />
                <div className="flex items-center justify-center gap-1.5 mb-2">
                  <kpi.icon className={`h-4 w-4 ${kpi.active ? `text-${kpi.color}` : 'text-muted-foreground'}`} />
                  <span className={`text-[10px] sm:text-xs uppercase tracking-wider font-bold ${
                    kpi.active ? `text-${kpi.color}/80` : 'text-muted-foreground'
                  }`}>{kpi.label}</span>
                </div>
                <div className={`text-2xl sm:text-3xl font-mono font-bold tabular-nums leading-none ${
                    kpi.active ? `text-${kpi.color}` : 'text-foreground'
                }`}>
                  {kpi.value}
                </div>
                {kpi.unit && <div className="text-[10px] sm:text-xs text-muted-foreground mt-1 sm:mt-1.5 font-medium">{kpi.unit}</div>}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mt-6">
            <div className="bg-gradient-to-br from-background to-muted/20 border border-border/50 rounded-2xl p-4 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-accent/30 to-transparent" />
              <div className="text-xs text-muted-foreground mb-5 flex items-center gap-2 uppercase tracking-wider font-bold">
                <div className="p-1.5 rounded-md bg-accent/10">
                  <Droplets className="h-3.5 w-3.5 text-accent" />
                </div>
                Levels
                <span className="ml-auto px-2 py-0.5 rounded-full bg-accent/10 text-[10px] font-mono text-accent font-bold">{avgLevel.toFixed(1)} % avg</span>
              </div>
              <TankLevelBars tanks={tankData} />
            </div>

            <div className="bg-gradient-to-br from-background to-muted/20 border border-border/50 rounded-2xl p-4 shadow-sm relative overflow-hidden flex flex-col justify-between">
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
              <div className="text-xs text-muted-foreground mb-5 flex items-center gap-2 uppercase tracking-wider font-bold">
                <div className="p-1.5 rounded-md bg-primary/10">
                  <TrendingUp className="h-3.5 w-3.5 text-primary" />
                </div>
                Flow Distribution
              </div>
              <div className="flex-1 flex items-center justify-center">
                <FlowDonut tanks={tankData} />
              </div>
            </div>
          </div>
        </div>
      </CardContent>

      <style>{`
        @keyframes barGrow {
          from { transform: scaleY(0); opacity: 0; }
          to { transform: scaleY(1); opacity: 1; }
        }
      `}</style>
    </Card>
  );
});

OhtAnalyticsCard.displayName = 'OhtAnalyticsCard';
export default OhtAnalyticsCard;
