import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { format, subHours, subDays, startOfDay, endOfDay } from 'date-fns';
import { CalendarIcon, Loader2, TrendingUp, History, RefreshCw, Activity, BarChart3, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { logError } from '@/lib/errorLogger';
import { historianDayWindows, readArchivePage, splitHistorianRange } from '@/lib/historianArchiveClient';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Area,
  AreaChart,
  ComposedChart,
  Cell,
  Dot,
} from 'recharts';

interface SensorTrendModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tagId: string;
  label: string;
  unit: string;
  section: 'intake' | 'oht' | 'wtp';
  highSetpoint?: number;
  lowSetpoint?: number;
  currentValue?: number;
  digital?: boolean;
}

interface TrendDataPoint {
  timestamp: string;
  value: number;
  time: string;
  min?: number;
  max?: number;
  avg?: number;
  roc?: number;
  zone?: 'critical-high' | 'high' | 'normal' | 'low' | 'critical-low';
  zoneColor?: string;
}

// Color zones for value ranges
const getZoneInfo = (value: number, highSetpoint?: number, lowSetpoint?: number, min?: number, max?: number) => {
  const effectiveHigh = highSetpoint ?? (max ?? 100);
  const effectiveLow = lowSetpoint ?? (min ?? 0);
  const range = effectiveHigh - effectiveLow;
  
  if (value >= effectiveHigh) return { zone: 'critical-high' as const, color: 'hsl(0, 85%, 55%)' }; // Red
  if (value >= effectiveHigh - range * 0.15) return { zone: 'high' as const, color: 'hsl(35, 92%, 50%)' }; // Orange
  if (value <= effectiveLow) return { zone: 'critical-low' as const, color: 'hsl(280, 70%, 55%)' }; // Purple
  if (value <= effectiveLow + range * 0.15) return { zone: 'low' as const, color: 'hsl(200, 80%, 50%)' }; // Blue
  return { zone: 'normal' as const, color: 'hsl(142, 71%, 45%)' }; // Green
};

const ZONE_COLORS = {
  'critical-high': 'hsl(0, 85%, 55%)',
  'high': 'hsl(35, 92%, 50%)',
  'normal': 'hsl(142, 71%, 45%)',
  'low': 'hsl(200, 80%, 50%)',
  'critical-low': 'hsl(280, 70%, 55%)',
};

const ZONE_LABELS = {
  'critical-high': 'Critical High',
  'high': 'Warning High',
  'normal': 'Normal',
  'low': 'Warning Low',
  'critical-low': 'Critical Low',
};

const SensorTrendModal: React.FC<SensorTrendModalProps> = ({
  open,
  onOpenChange,
  tagId,
  label,
  unit,
  section,
  highSetpoint,
  lowSetpoint,
  currentValue,
  digital = false,
}) => {
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState<'realtime' | 'historical'>('realtime');
  const [activeTrend, setActiveTrend] = useState<'value' | 'range' | 'roc'>('value');
  const [realtimeData, setRealtimeData] = useState<TrendDataPoint[]>([]);
  const [historicalData, setHistoricalData] = useState<TrendDataPoint[]>([]);
  const [historicalError, setHistoricalError] = useState(false);
  const historicalRequest = useRef<AbortController | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const today = useMemo(() => new Date(), []);
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: subDays(today, 1),
    to: today,
  });
  const [timeRange, setTimeRange] = useState<string>('1h');
  const realtimeIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const MAX_REALTIME_POINTS = 60;

  const processedData = useMemo(() => {
    const rawData = activeTab === 'realtime' ? realtimeData : historicalData;
    if (rawData.length < 2) return rawData;
    return rawData.map((point, index, arr) => {
      const windowSize = Math.min(10, index + 1);
      const window = arr.slice(Math.max(0, index - windowSize + 1), index + 1);
      const values = window.map(p => p.value);
      const zoneInfo = getZoneInfo(point.value, highSetpoint, lowSetpoint);
      // Rate of change
      const prevVal = index > 0 ? arr[index - 1].value : point.value;
      const roc = point.value - prevVal;
      return {
        ...point,
        min: Math.min(...values),
        max: Math.max(...values),
        avg: parseFloat((values.reduce((a, b) => a + b, 0) / values.length).toFixed(3)),
        zone: zoneInfo.zone,
        zoneColor: zoneInfo.color,
        roc: parseFloat(roc.toFixed(4)),
      };
    });
  }, [realtimeData, historicalData, activeTab, highSetpoint, lowSetpoint]);

  const fetchRealtimeData = useCallback(async () => {
    try {
      const hoursBack = timeRange === '1h' ? 1 : timeRange === '6h' ? 6 : 24;
      const startTime = subHours(new Date(), hoursBack).toISOString();
      const { data, error } = await supabase
        .from('historian_logs')
        .select('timestamp, value')
        .eq('tag_id', tagId)
        .not('value', 'is', null)
        .eq('section', section)
        .gte('timestamp', startTime)
        .order('timestamp', { ascending: false })
        .limit(MAX_REALTIME_POINTS);
      if (error) { logError('SensorTrend.fetchRealtime', error); return; }
      if (data) {
        const formattedData: TrendDataPoint[] = data.slice().reverse().map((item) => ({
          timestamp: item.timestamp,
          value: Number(item.value),
          time: format(new Date(item.timestamp), 'HH:mm:ss'),
        }));
        setRealtimeData(formattedData.slice(-MAX_REALTIME_POINTS));
      }
    } catch (error) { logError('SensorTrend.fetchRealtime', error); }
  }, [tagId, section, timeRange]);

  const fetchHistoricalData = useCallback(async () => {
    historicalRequest.current?.abort();
    const controller = new AbortController();
    historicalRequest.current = controller;
    setIsLoading(true);
    setHistoricalError(false);
    try {
      const startTime = startOfDay(dateRange.from).toISOString();
      const endTime = new Date(endOfDay(dateRange.to).getTime() + 1).toISOString();
      const { archive, live } = splitHistorianRange(startTime, endTime);
      const PAGE_SIZE = 1000;
      const allData: { timestamp: string; value: number | null }[] = [];
      if (archive) {
        for (const window of historianDayWindows(archive, true)) {
          for (let offset = 0; ; offset += PAGE_SIZE) {
            const result = await readArchivePage({ ...window, tagIds: [tagId], sections: [section],
              ascending: true, offset, limit: PAGE_SIZE }, controller.signal);
            allData.push(...result.rows);
            if (offset + result.rows.length >= result.count) break;
            if (result.rows.length !== PAGE_SIZE) throw new Error('Incomplete archive trend page');
          }
        }
      }
      if (live) {
        for (let offset = 0; ; offset += PAGE_SIZE) {
          const { data, error } = await supabase.from('historian_logs').select('timestamp, value')
            .eq('tag_id', tagId).eq('section', section).not('value', 'is', null)
            .gte('timestamp', live.start).lt('timestamp', live.end)
            .order('timestamp', { ascending: true }).order('id', { ascending: true })
            .range(offset, offset + PAGE_SIZE - 1).abortSignal(controller.signal);
          if (error) throw error;
          allData.push(...(data ?? []));
          if (!data || data.length < PAGE_SIZE) break;
        }
      }
      if (!controller.signal.aborted) {
        setHistoricalData(allData.filter(item => item.value !== null).map(item => ({
          timestamp: item.timestamp,
          value: Number(item.value),
          time: format(new Date(item.timestamp), 'MMM dd HH:mm'),
        })));
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        logError('SensorTrend.fetchHistorical', error);
        setHistoricalData([]);
        setHistoricalError(true);
      }
    } finally {
      if (historicalRequest.current === controller) setIsLoading(false);
    }
  }, [tagId, section, dateRange]);

  useEffect(() => {
    if (open && activeTab === 'realtime') {
      fetchRealtimeData();
      realtimeIntervalRef.current = setInterval(fetchRealtimeData, 5000);
    }
    return () => { if (realtimeIntervalRef.current) { clearInterval(realtimeIntervalRef.current); realtimeIntervalRef.current = null; } };
  }, [open, activeTab, fetchRealtimeData]);

  useEffect(() => {
    if (open && activeTab === 'historical') fetchHistoricalData();
    return () => historicalRequest.current?.abort();
  }, [open, activeTab, fetchHistoricalData]);

  useEffect(() => {
    if (open && activeTab === 'realtime' && currentValue !== undefined) {
      setRealtimeData((prev) => {
        const newPoint: TrendDataPoint = { timestamp: new Date().toISOString(), value: currentValue, time: format(new Date(), 'HH:mm:ss') };
        return [...prev, newPoint].slice(-MAX_REALTIME_POINTS);
      });
    }
  }, [open, activeTab, currentValue]);

  const yDomain = useMemo(() => {
    const values = processedData.map((d) => d.value);
    if (values.length === 0) return [0, 10];
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const yPadding = (maxValue - minValue) * 0.1 || 1;
    return [
      Math.min(minValue - yPadding, lowSetpoint ?? minValue),
      Math.max(maxValue + yPadding, highSetpoint ?? maxValue),
    ];
  }, [processedData, highSetpoint, lowSetpoint]);

  // Color-coded dot renderer
  const renderColorDot = (props: any) => {
    const { cx, cy, payload } = props;
    if (!cx || !cy) return null;
    const color = payload?.zoneColor || 'hsl(var(--primary))';
    return <circle cx={cx} cy={cy} r={3.5} fill={color} stroke="hsl(var(--background))" strokeWidth={1.5} />;
  };

  const CustomTooltip = ({ active, payload, label: tooltipLabel }: any) => {
    if (!active || !payload || !payload.length) return null;
    const dataPoint = payload[0]?.payload;
    const savedTimestamp = activeTab === 'historical' ? dataPoint?.timestamp : undefined;
    const zoneName = dataPoint?.zone ? ZONE_LABELS[dataPoint.zone as keyof typeof ZONE_LABELS] : '';
    const zoneColor = dataPoint?.zoneColor || 'hsl(var(--primary))';
    
    return (
      <div className="bg-card/95 backdrop-blur-md border border-border/60 rounded-xl p-2.5 sm:p-3 shadow-2xl max-w-[220px]">
        <p className="text-[10px] text-muted-foreground mb-1.5 font-medium break-all">
          {savedTimestamp ? <time dateTime={savedTimestamp}>{savedTimestamp}</time> : tooltipLabel}
        </p>
        {zoneName && (
          <div className="flex items-center gap-1.5 mb-1.5 pb-1.5 border-b border-border/30">
            <div className="w-2.5 h-2.5 rounded-full ring-1 ring-background shrink-0" style={{ backgroundColor: zoneColor }} />
            <span className="text-[10px] font-semibold" style={{ color: zoneColor }}>{zoneName}</span>
          </div>
        )}
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center gap-1.5 text-xs py-0.5">
            <div className="w-2 h-2 rounded-full ring-1 ring-background shrink-0" style={{ backgroundColor: entry.color || zoneColor }} />
            <span className="text-muted-foreground text-[10px] truncate">{entry.name}:</span>
            <span className="font-mono font-bold tabular-nums text-[10px]" style={{ color: entry.color || zoneColor }}>
              {activeTab === 'realtime' && typeof entry.value === 'number' ? entry.value.toFixed(2) : entry.value}
            </span>
          </div>
        ))}
      </div>
    );
  };

  const chartAnimationProps = { animationDuration: 800, animationEasing: 'ease-out' as const };

  // Generate gradient stops for multi-color line based on data zones
  const colorSegments = useMemo(() => {
    if (processedData.length < 2) return [];
    return processedData.map((d, i) => ({
      offset: i / (processedData.length - 1),
      color: d.zoneColor || 'hsl(142, 71%, 45%)',
    }));
  }, [processedData]);

  const renderTrendChart = () => {
    if (processedData.length === 0) {
      return (
        <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
          <p>No data available</p>
        </div>
      );
    }

    const gridProps = { strokeDasharray: "3 3", stroke: 'hsl(var(--border) / 0.3)' };
    const xAxisProps = {
      dataKey: "time" as const,
      tick: { fontSize: isMobile ? 8 : 10, fill: 'hsl(var(--muted-foreground))' },
      interval: "preserveStartEnd" as const,
      axisLine: { stroke: 'hsl(var(--border) / 0.5)' },
      tickLine: false,
    };
    const yAxisProps = {
      domain: yDomain,
      tick: { fontSize: isMobile ? 8 : 10, fill: 'hsl(var(--muted-foreground))' },
      tickFormatter: (val: number) => val.toFixed(1),
      axisLine: { stroke: 'hsl(var(--border) / 0.5)' },
      tickLine: false,
      width: isMobile ? 32 : 40,
    };

    const gradientId = `trend-multicolor-${activeTrend}`;

    switch (activeTrend) {
      case 'value':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={processedData}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
                  {colorSegments.map((seg, i) => (
                    <stop key={i} offset={`${(seg.offset * 100).toFixed(1)}%`} stopColor={seg.color} />
                  ))}
                </linearGradient>
                <linearGradient id={`${gradientId}-fill`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.01} />
                </linearGradient>
                {/* Zone bands */}
                {highSetpoint !== undefined && (
                  <linearGradient id="zone-high-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(0, 85%, 55%)" stopOpacity={0.08} />
                    <stop offset="100%" stopColor="hsl(0, 85%, 55%)" stopOpacity={0.02} />
                  </linearGradient>
                )}
              </defs>
              <CartesianGrid {...gridProps} />
              <XAxis {...xAxisProps} />
              <YAxis {...yAxisProps} />
              <Tooltip content={<CustomTooltip />} />
              {highSetpoint !== undefined && (
                <ReferenceLine y={highSetpoint} stroke="hsl(0, 85%, 55%)" strokeDasharray="6 4" strokeWidth={1.5}
                  label={{ value: `⚠ High: ${highSetpoint}`, fill: 'hsl(0, 85%, 55%)', fontSize: isMobile ? 8 : 10, fontWeight: 700 }} />
              )}
              {lowSetpoint !== undefined && (
                <ReferenceLine y={lowSetpoint} stroke="hsl(200, 80%, 50%)" strokeDasharray="6 4" strokeWidth={1.5}
                  label={{ value: `⚠ Low: ${lowSetpoint}`, fill: 'hsl(200, 80%, 50%)', fontSize: isMobile ? 8 : 10, fontWeight: 700 }} />
              )}
              <Area
                type={digital ? 'stepAfter' : 'linear'}
                dataKey="value"
                name="Value"
                stroke={`url(#${gradientId})`}
                strokeWidth={2.5}
                fill={`url(#${gradientId}-fill)`}
                dot={false}
                activeDot={renderColorDot}
                {...chartAnimationProps}
              />
            </AreaChart>
          </ResponsiveContainer>
        );

      case 'range':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={processedData}>
              <defs>
                <linearGradient id="range-max-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(0, 85%, 55%)" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="hsl(0, 85%, 55%)" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="range-avg-grad" x1="0" y1="0" x2="1" y2="0">
                  {colorSegments.map((seg, i) => (
                    <stop key={i} offset={`${(seg.offset * 100).toFixed(1)}%`} stopColor={seg.color} />
                  ))}
                </linearGradient>
              </defs>
              <CartesianGrid {...gridProps} />
              <XAxis {...xAxisProps} />
              <YAxis {...yAxisProps} />
              <Tooltip content={<CustomTooltip />} />
              {highSetpoint !== undefined && <ReferenceLine y={highSetpoint} stroke="hsl(0, 85%, 55%)" strokeDasharray="6 4" strokeWidth={1.5} />}
              {lowSetpoint !== undefined && <ReferenceLine y={lowSetpoint} stroke="hsl(200, 80%, 50%)" strokeDasharray="6 4" strokeWidth={1.5} />}
              <Area type={digital ? 'stepAfter' : 'linear'} dataKey="max" name="Maximum" stroke="hsl(0, 75%, 60%)" strokeWidth={1.5} fill="url(#range-max-grad)" dot={false}
                activeDot={{ r: 3, fill: 'hsl(0, 85%, 55%)', stroke: 'hsl(var(--background))', strokeWidth: 1.5 }} {...chartAnimationProps} />
              <Area type={digital ? 'stepAfter' : 'linear'} dataKey="min" name="Minimum" stroke="hsl(200, 70%, 55%)" strokeWidth={1.5} fill="hsl(var(--background))" fillOpacity={1} dot={false}
                activeDot={{ r: 3, fill: 'hsl(200, 80%, 50%)', stroke: 'hsl(var(--background))', strokeWidth: 1.5 }} {...chartAnimationProps} />
              <Line type={digital ? 'stepAfter' : 'linear'} dataKey="avg" name="Average" stroke="url(#range-avg-grad)" strokeWidth={2.5} dot={false}
                activeDot={renderColorDot} {...chartAnimationProps} />
            </ComposedChart>
          </ResponsiveContainer>
        );

      case 'roc':
        // Rate of Change: bar chart showing positive (green) and negative (red) changes
        const rocValues = processedData.map(d => d.roc || 0);
        const maxRoc = Math.max(...rocValues.map(Math.abs), 0.1);
        return (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={processedData}>
              <defs>
                <linearGradient id="roc-positive" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0.7} />
                  <stop offset="100%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0.15} />
                </linearGradient>
                <linearGradient id="roc-negative" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(0, 85%, 55%)" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="hsl(0, 85%, 55%)" stopOpacity={0.7} />
                </linearGradient>
              </defs>
              <CartesianGrid {...gridProps} />
              <XAxis {...xAxisProps} />
              <YAxis
                domain={[-maxRoc * 1.2, maxRoc * 1.2]}
                tick={{ fontSize: isMobile ? 8 : 10, fill: 'hsl(var(--muted-foreground))' }}
                tickFormatter={(val: number) => val.toFixed(2)}
                axisLine={{ stroke: 'hsl(var(--border) / 0.5)' }}
                tickLine={false}
                width={isMobile ? 38 : 48}
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={0} stroke="hsl(var(--muted-foreground) / 0.5)" strokeWidth={1.5} />
              <Area
                type={digital ? 'stepAfter' : 'linear'}
                dataKey="roc"
                name="Rate of Change"
                stroke="none"
                fill="url(#roc-positive)"
                baseValue={0}
                {...chartAnimationProps}
              />
              <Line
                type={digital ? 'stepAfter' : 'linear'}
                dataKey="roc"
                name="Δ Change"
                strokeWidth={2.5}
                dot={false}
                activeDot={(props: any) => {
                  const { cx, cy, payload } = props;
                  if (!cx || !cy) return null;
                  const color = (payload?.roc || 0) >= 0 ? 'hsl(142, 71%, 45%)' : 'hsl(0, 85%, 55%)';
                  return <circle cx={cx} cy={cy} r={4} fill={color} stroke="hsl(var(--background))" strokeWidth={2} />;
                }}
              >
                {processedData.map((entry, index) => (
                  <Cell key={index} stroke={(entry.roc || 0) >= 0 ? 'hsl(142, 71%, 45%)' : 'hsl(0, 85%, 55%)'} />
                ))}
              </Line>
            </ComposedChart>
          </ResponsiveContainer>
        );

      default:
        return null;
    }
  };

  // Zone legend
  const ZoneLegend = () => {
    const activeZones = useMemo(() => {
      const zones = new Set(processedData.map(d => d.zone).filter(Boolean));
      return Array.from(zones) as (keyof typeof ZONE_COLORS)[];
    }, [processedData]);

    if (activeZones.length === 0) return null;
    
    const allZones: (keyof typeof ZONE_COLORS)[] = ['critical-high', 'high', 'normal', 'low', 'critical-low'];
    
    return (
      <div className="flex flex-wrap gap-2 sm:gap-3 justify-center">
        {allZones.map(zone => (
          <div key={zone} className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded-lg text-[9px] sm:text-[10px] font-semibold border transition-all",
            activeZones.includes(zone) 
              ? "border-border/60 bg-muted/40 opacity-100" 
              : "border-transparent opacity-40"
          )}>
            <div className="w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-black/10" style={{ backgroundColor: ZONE_COLORS[zone] }} />
            <span>{ZONE_LABELS[zone]}</span>
          </div>
        ))}
      </div>
    );
  };

  // Current value zone badge
  const CurrentZoneBadge = () => {
    if (currentValue === undefined) return null;
    const zoneInfo = getZoneInfo(currentValue, highSetpoint, lowSetpoint);
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border" style={{ 
        borderColor: zoneInfo.color + '40',
        backgroundColor: zoneInfo.color + '15',
      }}>
        <div className="w-3 h-3 rounded-full animate-pulse" style={{ backgroundColor: zoneInfo.color }} />
        <span className="text-xs font-bold" style={{ color: zoneInfo.color }}>{ZONE_LABELS[zoneInfo.zone]}</span>
      </div>
    );
  };

  const StatBox: React.FC<{ label: string; value: string; color: string; bgColor?: string }> = ({ label, value, color, bgColor }) => (
    <div className="rounded-xl p-2.5 sm:p-3 border border-border/50 text-center hover:border-primary/20 transition-all" 
      style={{ background: bgColor || 'hsl(var(--muted) / 0.3)' }}>
      <p className="text-[9px] sm:text-[10px] text-muted-foreground mb-1 uppercase tracking-wider font-semibold">{label}</p>
      <p className="text-base sm:text-lg font-mono font-bold tabular-nums" style={{ color }}>{value}</p>
    </div>
  );

  const realtimeStats = useMemo(() => {
    if (realtimeData.length === 0) return null;
    const values = realtimeData.map(d => d.value);
    const currentVal = values[values.length - 1];
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const avgVal = values.reduce((a, b) => a + b, 0) / values.length;
    return {
      current: { val: currentVal.toFixed(2), zone: getZoneInfo(currentVal, highSetpoint, lowSetpoint) },
      min: { val: minVal.toFixed(2), zone: getZoneInfo(minVal, highSetpoint, lowSetpoint) },
      max: { val: maxVal.toFixed(2), zone: getZoneInfo(maxVal, highSetpoint, lowSetpoint) },
      avg: { val: avgVal.toFixed(2), zone: getZoneInfo(avgVal, highSetpoint, lowSetpoint) },
    };
  }, [realtimeData, highSetpoint, lowSetpoint]);

  const historicalStats = useMemo(() => {
    if (historicalData.length === 0) return null;
    const values = historicalData.map(d => d.value);
    const latestVal = values[values.length - 1];
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const avgVal = values.reduce((a, b) => a + b, 0) / values.length;
    return {
      latest: { val: latestVal.toFixed(2), zone: getZoneInfo(latestVal, highSetpoint, lowSetpoint) },
      min: { val: minVal.toFixed(2), zone: getZoneInfo(minVal, highSetpoint, lowSetpoint) },
      max: { val: maxVal.toFixed(2), zone: getZoneInfo(maxVal, highSetpoint, lowSetpoint) },
      avg: { val: avgVal.toFixed(2), zone: getZoneInfo(avgVal, highSetpoint, lowSetpoint) },
    };
  }, [historicalData, highSetpoint, lowSetpoint]);

  const trendButtons = [
    { key: 'value' as const, icon: TrendingUp, label: 'Color Trend', shortLabel: 'Trend' },
    { key: 'range' as const, icon: BarChart3, label: 'Min/Max/Avg', shortLabel: 'Range' },
    { key: 'roc' as const, icon: ArrowUpDown, label: 'Rate of Change', shortLabel: 'RoC' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="w-[calc(100vw-16px)] max-w-5xl h-[92vh] flex flex-col p-3 sm:p-5 overflow-hidden gap-2 sm:gap-4 rounded-xl">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 sm:gap-3">
            <div className="p-1.5 sm:p-2 rounded-xl bg-primary/10 ring-1 ring-primary/20 shrink-0">
              <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-sm sm:text-lg truncate block">{label}</span>
              <span className="text-[10px] sm:text-sm text-muted-foreground font-normal">({unit})</span>
            </div>
            <CurrentZoneBadge />
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'realtime' | 'historical')} className="flex-1 flex flex-col overflow-hidden min-h-0">
          <TabsList className="grid w-full grid-cols-2 mb-2 sm:mb-4 shrink-0">
            <TabsTrigger value="realtime" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
              <Activity className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden xs:inline sm:inline">Realtime</span>
              <span className="xs:hidden sm:hidden">Live</span>
            </TabsTrigger>
            <TabsTrigger value="historical" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
              <History className="h-3 w-3 sm:h-4 sm:w-4" />
              <span>Historical</span>
            </TabsTrigger>
          </TabsList>

          {/* Trend Type Selector */}
          <div className="flex gap-1.5 sm:gap-2 mb-2 sm:mb-4 shrink-0">
            {trendButtons.map(({ key, icon: Icon, label: btnLabel, shortLabel }) => (
              <Button
                key={key}
                variant={activeTrend === key ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveTrend(key)}
                className="flex items-center gap-1 sm:gap-2 flex-1 text-xs px-2 sm:px-3"
              >
                <Icon className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
                <span className="hidden sm:inline truncate">{btnLabel}</span>
                <span className="sm:hidden truncate">{shortLabel}</span>
              </Button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto min-h-0 space-y-3 sm:space-y-4 pr-0.5">
            <TabsContent value="realtime" className="space-y-3 sm:space-y-4 mt-0">
              {/* Controls */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <Select value={timeRange} onValueChange={setTimeRange}>
                  <SelectTrigger className="w-[120px] sm:w-[150px] h-8 sm:h-9 text-xs sm:text-sm">
                    <SelectValue placeholder="Time Range" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1h">Last 1 Hour</SelectItem>
                    <SelectItem value="6h">Last 6 Hours</SelectItem>
                    <SelectItem value="24h">Last 24 Hours</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={fetchRealtimeData} className="h-8 sm:h-9 text-xs sm:text-sm px-2 sm:px-3">
                  <RefreshCw className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Refresh</span>
                </Button>
              </div>

              {/* Live value banner */}
              {currentValue !== undefined && (() => {
                const zoneInfo = getZoneInfo(currentValue, highSetpoint, lowSetpoint);
                return (
                  <div className="rounded-xl p-3 sm:p-4 flex items-center justify-between border" style={{
                    borderColor: zoneInfo.color + '30',
                    background: `linear-gradient(135deg, ${zoneInfo.color}15, transparent)`,
                  }}>
                    <div className="flex items-center gap-2 sm:gap-3">
                      <div className="w-3 h-3 rounded-full animate-pulse shadow-lg shrink-0" style={{ backgroundColor: zoneInfo.color, boxShadow: `0 0 12px ${zoneInfo.color}60` }} />
                      <span className="text-xs sm:text-sm text-muted-foreground font-medium">Live Value:</span>
                    </div>
                    <span className="text-2xl sm:text-3xl font-mono font-bold tabular-nums" style={{ color: zoneInfo.color }}>
                      {currentValue.toFixed(2)} <span className="text-base sm:text-lg text-muted-foreground">{unit}</span>
                    </span>
                  </div>
                );
              })()}

              {/* Zone Legend */}
              <ZoneLegend />

              {/* Chart */}
              <div className="h-[180px] sm:h-[300px] w-full bg-gradient-to-br from-card/80 to-card/40 rounded-xl p-2 sm:p-4 border border-border/50">
                {renderTrendChart()}
              </div>

              {/* Stats - color coded */}
              {realtimeStats && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                  <StatBox label="Current" value={realtimeStats.current.val} color={realtimeStats.current.zone.color} bgColor={realtimeStats.current.zone.color + '10'} />
                  <StatBox label="Minimum" value={realtimeStats.min.val} color={realtimeStats.min.zone.color} bgColor={realtimeStats.min.zone.color + '10'} />
                  <StatBox label="Maximum" value={realtimeStats.max.val} color={realtimeStats.max.zone.color} bgColor={realtimeStats.max.zone.color + '10'} />
                  <StatBox label="Average" value={realtimeStats.avg.val} color={realtimeStats.avg.zone.color} bgColor={realtimeStats.avg.zone.color + '10'} />
                </div>
              )}
            </TabsContent>

            <TabsContent value="historical" className="space-y-3 sm:space-y-4 mt-0">
              {/* Date controls */}
              <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="justify-start text-left font-normal text-xs sm:text-sm h-8 sm:h-9 flex-1 min-w-0 sm:flex-none sm:min-w-[200px]">
                      <CalendarIcon className="mr-1.5 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
                      <span className="truncate">
                        {format(dateRange.from, 'dd MMM')} – {format(dateRange.to, 'dd MMM')}
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="range"
                      defaultMonth={dateRange.from}
                      selected={{ from: dateRange.from, to: dateRange.to }}
                      onSelect={(range) => {
                        if (range?.from) {
                          const toDate = range.to ? (range.to > today ? today : range.to) : range.from;
                          setDateRange({ from: range.from, to: toDate });
                        }
                      }}
                      numberOfMonths={isMobile ? 1 : 2}
                      disabled={{ after: today }}
                      toDate={today}
                    />
                  </PopoverContent>
                </Popover>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={fetchHistoricalData} disabled={isLoading} className="h-8 sm:h-9 text-xs sm:text-sm px-2 sm:px-3">
                    {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-1.5" />}
                    <span className="hidden sm:inline ml-1">Fetch</span>
                  </Button>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{historicalData.length} pts</span>
                </div>
              </div>

              {/* Zone Legend */}
              <ZoneLegend />

              {/* Chart */}
              <div className="bg-gradient-to-br from-card/80 to-card/40 rounded-xl p-2 sm:p-4 border border-border/50">
                <div className="overflow-x-auto">
                  <div
                    className="h-[180px] sm:h-[300px]"
                    style={{
                      width: historicalData.length > 200 ? `${Math.max(800, historicalData.length * 4)}px` : '100%',
                      minWidth: '100%'
                    }}
                  >
                    {isLoading ? (
                      <div className="h-full flex items-center justify-center">
                        <div className="flex flex-col items-center gap-3">
                          <Loader2 className="h-8 w-8 sm:h-10 sm:w-10 animate-spin text-primary" />
                          <p className="text-xs sm:text-sm text-muted-foreground">Loading...</p>
                        </div>
                      </div>
                    ) : historicalError ? (
                      <p role="alert" className="h-full flex items-center justify-center text-sm text-destructive">
                        Historical readings could not be loaded for this range.
                      </p>
                    ) : renderTrendChart()}
                  </div>
                </div>
              </div>

              {/* Stats - color coded */}
              {historicalStats && !isLoading && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                  <StatBox label="Latest" value={historicalStats.latest.val} color={historicalStats.latest.zone.color} bgColor={historicalStats.latest.zone.color + '10'} />
                  <StatBox label="Minimum" value={historicalStats.min.val} color={historicalStats.min.zone.color} bgColor={historicalStats.min.zone.color + '10'} />
                  <StatBox label="Maximum" value={historicalStats.max.val} color={historicalStats.max.zone.color} bgColor={historicalStats.max.zone.color + '10'} />
                  <StatBox label="Average" value={historicalStats.avg.val} color={historicalStats.avg.zone.color} bgColor={historicalStats.avg.zone.color + '10'} />
                </div>
              )}
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default SensorTrendModal;
