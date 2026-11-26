import { isPumpRunTag } from '@/config/shahpurSensors';
import React, { memo, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useScada } from '@/contexts/ScadaContext';
import { ShieldCheck, Wifi, WifiOff, Activity, Zap, Gauge, BarChart3 } from 'lucide-react';
import { isTagLive } from '@/hooks/useTagConnection';

interface SystemHealthCardProps {
  section: 'intake' | 'wtp';
}

/**
 * System Health Card — Uses actual tag connection status (status field + lastDataTime)
 * to determine which sensors are genuinely online vs offline.
 */

const SystemHealthCard: React.FC<SystemHealthCardProps> = memo(({ section }) => {
  const { intakeTags, wtpTags } = useScada();

  const tags = (section === 'intake' ? intakeTags : wtpTags).filter(t => !t.notInstalled);

  const stats = useMemo(() => {
    const analog = tags.filter(t => t.sensorType === 'analog');
    const digital = tags.filter(t => t.sensorType === 'digital');
    const totalizer = tags.filter(t => t.sensorType === 'totalizer');

    // Online means a recent valid reading, not merely that a reading existed once.
    const isOnline = (t: typeof tags[0]) => isTagLive(t);

    const onlineAnalog = analog.filter(isOnline);
    const onlineDigital = digital.filter(isOnline);
    const onlineTotalizer = totalizer.filter(isOnline);
    const totalOnline = onlineAnalog.length + onlineDigital.length + onlineTotalizer.length;

    // Running pumps (value > 0.5 AND online)
    const pumpSignals = digital.filter(t => isPumpRunTag(t.id));
    const runningPumps = pumpSignals.filter(t => t.value > 0.5 && isOnline(t));

    // Pressure sensors
    const ptTags = tags.filter(t => t.instrumentType === 'pt');

    // Flow
    const flowTag = tags.find(t => t.instrumentType === 'flow');

    // Level
    const ltTags = tags.filter(t => t.instrumentType === 'lt');

    // Energy (intake only)
    const kwTag = tags.find(t => t.instrumentType === 'kw');

    // Water quality (wtp only)
    const phTag = tags.find(t => t.instrumentType === 'ph');
    const taTag = tags.find(t => t.instrumentType === 'turbidity');
    const clTag = tags.find(t => t.instrumentType === 'chlorine');

    return {
      total: tags.length,
      analogCount: analog.length,
      digitalCount: digital.length,
      totalizerCount: totalizer.length,
      totalOnline,
      onlineAnalog: onlineAnalog.length,
      onlineDigital: onlineDigital.length,
      onlineTotalizer: onlineTotalizer.length,
      runningPumps: runningPumps.length,
      totalPumps: pumpSignals.length,
      ptTags,
      flowTag,
      ltTags,
      kwTag,
      phTag,
      taTag,
      clTag,
    };
  }, [tags]);

  const healthPct = stats.total > 0 ? (stats.totalOnline / stats.total) * 100 : 0;
  const healthColor = healthPct >= 75 ? 'success' : healthPct >= 40 ? 'warning' : 'destructive';

  // Build sensor rows for the bar chart
  const sensorRows = useMemo(() => {
    const rows: { label: string; value: number; max: number; unit: string; color: string; online: boolean }[] = [];

    stats.ptTags.forEach(pt => {
      const online = isTagLive(pt);
      rows.push({ label: pt.label.replace(' (PT)', ''), value: pt.value, max: 10, unit: 'Bar', color: 'hsl(var(--primary))', online: !!online });
    });

    stats.ltTags.forEach(lt => {
      const online = isTagLive(lt);
      rows.push({ label: lt.label.replace(' (LT)', ''), value: lt.value, max: lt.id.includes('INT') ? 100 : 10, unit: 'm', color: 'hsl(var(--accent))', online: !!online });
    });

    if (stats.flowTag) {
      const online = isTagLive(stats.flowTag);
      rows.push({ label: 'Flow', value: stats.flowTag.value, max: 200, unit: 'm³/hr', color: 'hsl(var(--success))', online: !!online });
    }

    if (stats.kwTag) {
      const online = isTagLive(stats.kwTag);
      rows.push({ label: 'Energy', value: stats.kwTag.value, max: 100, unit: 'kW', color: 'hsl(38, 92%, 50%)', online: !!online });
    }

    if (stats.phTag) {
      const online = isTagLive(stats.phTag);
      rows.push({ label: 'pH', value: stats.phTag.value, max: 14, unit: 'pH', color: 'hsl(142, 71%, 45%)', online: !!online });
    }
    if (stats.taTag) {
      const online = isTagLive(stats.taTag);
      rows.push({ label: 'Turbidity', value: stats.taTag.value, max: 100, unit: 'NTU', color: 'hsl(38, 92%, 50%)', online: !!online });
    }
    if (stats.clTag) {
      const online = isTagLive(stats.clTag);
      rows.push({ label: 'Chlorine', value: stats.clTag.value, max: 5, unit: 'mg/L', color: 'hsl(199, 89%, 48%)', online: !!online });
    }

    return rows;
  }, [stats]);

  return (
    <Card className="opacity-0 animate-fade-in relative overflow-hidden border-primary/20" style={{ animationDelay: '500ms' }}>
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <div className={`p-1.5 rounded-lg bg-${healthColor}/10 ring-1 ring-${healthColor}/20 shrink-0`}>
            <ShieldCheck className={`h-4 w-4 text-${healthColor}`} />
          </div>
          <span className="truncate font-bold text-sm">System Health</span>
          <span className="text-[10px] font-semibold text-muted-foreground ml-auto px-2 py-0.5 rounded-full bg-muted/80 ring-1 ring-border/50 shrink-0">
            {section.toUpperCase()}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-4">
          {/* ===== HEALTH + PUMPS ===== */}
          <div className="grid grid-cols-2 gap-3">
            {/* Online status */}
            <div className={`rounded-xl p-3 text-center relative overflow-hidden border transition-colors bg-gradient-to-br from-${healthColor}/8 to-transparent border-${healthColor}/15`}>
              <div className="flex items-center justify-center gap-1 mb-1">
                <Activity className={`h-3 w-3 text-${healthColor}`} />
                <span className={`text-[10px] text-${healthColor}/80 uppercase tracking-wider font-bold`}>Status</span>
              </div>
              <div className={`text-2xl font-mono font-bold text-${healthColor} tabular-nums leading-none`}>
                {healthPct.toFixed(0)}%
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5 font-medium">
                {stats.totalOnline}/{stats.total} Online
              </div>
            </div>

            {/* Pump status */}
            <div className={`rounded-xl p-3 text-center relative overflow-hidden border transition-colors ${
              stats.runningPumps > 0
                ? 'bg-gradient-to-br from-success/8 to-transparent border-success/20'
                : 'bg-gradient-to-br from-muted/30 to-transparent border-border/50'
            }`}>
              <div className="flex items-center justify-center gap-1 mb-1">
                <Zap className={`h-3 w-3 ${stats.runningPumps > 0 ? 'text-success' : 'text-muted-foreground'}`} />
                <span className={`text-[10px] uppercase tracking-wider font-bold ${
                  stats.runningPumps > 0 ? 'text-success/80' : 'text-muted-foreground'
                }`}>Pumps</span>
              </div>
              <div className={`text-2xl font-mono font-bold tabular-nums leading-none ${
                stats.runningPumps > 0 ? 'text-success' : 'text-foreground'
              }`}>
                {stats.runningPumps}/{stats.totalPumps}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5 font-medium">
                {section === 'intake' ? 'VT Pumps' : 'HT Pumps'}
              </div>
            </div>
          </div>

          {/* ===== LIVE SENSOR READINGS ===== */}
          <div className="border-t border-border/50 pt-3">
            <div className="text-[10px] text-muted-foreground mb-2 flex items-center gap-1.5 uppercase tracking-wider font-bold">
              <Gauge className="h-3 w-3" />
              Live Readings
            </div>
            <div className="space-y-2">
              {sensorRows.map((row, i) => {
                const pct = Math.min(((row.value - 0) / row.max) * 100, 100);
                return (
                  <div key={i} className="flex items-center gap-2">
                    <div className="flex items-center gap-1 w-[70px] shrink-0">
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${row.online ? 'bg-success' : 'bg-muted-foreground/30'}`} />
                      <span className="text-[9px] font-bold text-muted-foreground truncate">{row.label}</span>
                    </div>
                    <div className="flex-1 h-2 bg-muted/30 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.max(pct, 1)}%`,
                          backgroundColor: row.online ? row.color : 'hsl(var(--muted-foreground) / 0.2)',
                        }}
                      />
                    </div>
                    <span className="text-[9px] font-mono font-bold text-foreground tabular-nums w-[50px] text-right shrink-0">
                      {row.value.toFixed(1)} <span className="text-muted-foreground text-[8px]">{row.unit}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ===== CONNECTIVITY ===== */}
          <div className="border-t border-border/50 pt-3">
            <div className="text-[10px] text-muted-foreground mb-2 flex items-center gap-1.5 uppercase tracking-wider font-bold">
              <BarChart3 className="h-3 w-3" />
              Connectivity
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Analog', online: stats.onlineAnalog, total: stats.analogCount, icon: Wifi },
                { label: 'Digital', online: stats.onlineDigital, total: stats.digitalCount, icon: Activity },
                { label: 'Total', online: stats.totalOnline, total: stats.total, icon: Gauge },
              ].map((item) => {
                const allUp = item.online === item.total && item.total > 0;
                return (
                  <div key={item.label} className={`rounded-lg p-2 text-center border transition-colors ${
                    allUp ? 'bg-success/5 border-success/12' : item.online > 0 ? 'bg-primary/5 border-primary/12' : 'bg-muted/30 border-border/50'
                  }`}>
                    <item.icon className={`h-3 w-3 mx-auto mb-0.5 ${allUp ? 'text-success' : item.online > 0 ? 'text-primary' : 'text-muted-foreground'}`} />
                    <div className="text-[9px] text-muted-foreground uppercase tracking-wider font-bold">{item.label}</div>
                    <div className={`text-sm font-mono font-bold tabular-nums ${allUp ? 'text-success' : 'text-foreground'}`}>
                      {item.online}/{item.total}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

SystemHealthCard.displayName = 'SystemHealthCard';
export default SystemHealthCard;
