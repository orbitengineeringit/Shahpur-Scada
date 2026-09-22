import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { format, startOfDay, endOfDay } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import StatusBar from '@/components/StatusBar';
import GlobalFilterBar, { GlobalFilters, AssetFilter } from '@/components/GlobalFilterBar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { useScada } from '@/contexts/ScadaContext';
import ExcelJS from 'exceljs';
import { 
  Download, 
  FileSpreadsheet, 
  Loader2, 
  Database, 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft,
  ChevronsRight,
  RefreshCw,
  Waves, 
  Filter, 
  Gauge, 
  Ruler, 
  Activity, 
  FlaskConical, 
  Power, 
  Zap,
  Droplet
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { logError } from '@/lib/errorLogger';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type ExportInterval = 'all' | '1m' | '30m' | '1h' | '1d';
const INTERVAL_MS: Record<Exclude<ExportInterval, 'all'>, number> = {
  '1m': 60_000,
  '30m': 30 * 60_000,
  '1h': 60 * 60_000,
  '1d': 24 * 60 * 60_000,
};
const INTERVAL_LABEL: Record<ExportInterval, string> = {
  'all': 'All data',
  '1m': 'Every 1 minute',
  '30m': 'Every 30 minutes',
  '1h': 'Every 1 hour',
  '1d': 'Every 1 day',
};

// Sensors not installed at Shahpur plant (e.g. WTP only has 2 HT Pumps: WTP-Pump1 & WTP-Pump2)
const UNINSTALLED_TAG_IDS = [
  'WTP-Pump3', 'WTP-Pump4', 'WTP-PT3', 'WTP-PT4', 'WTP-CombinedPT1', 'WTP-CombinedPT2', 'WTP-KW', 'INT-KW',
];
const UNINSTALLED_TAGS_FILTER = `("${UNINSTALLED_TAG_IDS.join('","')}")`;

/** Derive a sub-section label like OHT-1 / OHT-2 from a tag_id (e.g. "OHT1-LT"). */
const getDisplaySection = (section: string, tagId: string): string => {
  const sec = section.toLowerCase();
  if (sec === 'oht') {
    const m = tagId.match(/^OHT[-_\s]*([0-9]+)/i);
    if (m) {
      const num = m[1];
      if (num === '1') return 'OHT - 1 Bus Station';
      if (num === '2') return 'OHT - 2 (Pending Commissioning)';
      return `OHT-${num}`;
    }
    return 'OHT';
  }
  return section.toUpperCase();
};

/** Sort priority: Intake (0) → WTP (1) → OHT-1 (2) → OHT-2 (3) */
const getSectionOrder = (section: string, tagId: string): number => {
  const sec = section.toLowerCase();
  if (sec === 'intake') return 0;
  if (sec === 'wtp') return 1;
  if (sec === 'oht') {
    const m = tagId.match(/^OHT[-_\s]*([0-9]+)/i);
    const n = m ? parseInt(m[1], 10) : 99;
    return 1 + n; // OHT1 -> 2, OHT2 -> 3
  }
  return 99;
};

interface HistorianLog {
  id: string;
  tag_id: string;
  section: string;
  value: number;
  timestamp: string;
  received_at?: string | null;
  tag_config: {
    label: string;
    unit: string;
  } | null;
}

const OhtSvg = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M7 14L5 22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M17 14L19 22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M12 12V22" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    <path d="M8 18H16" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
    <rect x="6" y="4" width="12" height="9" rx="1.5" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.8"/>
    <path d="M9 4C9 3 15 3 15 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="8" y1="10" x2="16" y2="10" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="1 1"/>
  </svg>
);

const IntakeWellSvg = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="5" y="14" width="14" height="7" rx="1" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.8"/>
    <path d="M5 17H19" stroke="currentColor" strokeWidth="1"/>
    <path d="M7 14V7" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M17 14V7" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M5 8L12 3L19 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M12 7V11" stroke="currentColor" strokeWidth="1.2"/>
    <rect x="10.5" y="11" width="3" height="3" rx="0.5" fill="currentColor" stroke="currentColor" strokeWidth="1"/>
  </svg>
);

const WtpSvg = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 21H21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    <path d="M4 21V10L9 7L14 10L19 7V21H4Z" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
    <line x1="7" y1="14" x2="16" y2="14" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 1"/>
    <line x1="7" y1="17" x2="16" y2="17" stroke="currentColor" strokeWidth="1.2" strokeDasharray="1 1"/>
    <path d="M12 11C13 11 14 12 14 13C14 14.5 12 16.5 12 16.5C12 16.5 10 14.5 10 13C10 12 11 11 12 11Z" fill="#38bdf8" stroke="#0284c7" strokeWidth="1"/>
  </svg>
);

const VtPumpSvg = ({ className = "h-4.5 w-4.5" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="8" y="3" width="8" height="7" rx="1.5" fill="currentColor" fillOpacity="0.20" stroke="currentColor" strokeWidth="1.8"/>
    <line x1="10" y1="5" x2="10" y2="8" stroke="currentColor" strokeWidth="1.2"/>
    <line x1="12" y1="5" x2="12" y2="8" stroke="currentColor" strokeWidth="1.2"/>
    <line x1="14" y1="5" x2="14" y2="8" stroke="currentColor" strokeWidth="1.2"/>
    <rect x="7" y="10" width="10" height="2" rx="0.5" fill="currentColor" fillOpacity="0.4" stroke="currentColor" strokeWidth="1"/>
    <path d="M11 12V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    <path d="M13 12V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    <path d="M9 21H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    <path d="M13 14H19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    <path d="M16 12L18 14L16 16" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const LevelTransmitterSvg = ({ className = "h-4.5 w-4.5" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="9" y="3" width="6" height="5" rx="1" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="1.8"/>
    <rect x="8" y="8" width="8" height="1.5" rx="0.5" fill="currentColor" fillOpacity="0.4" stroke="currentColor" strokeWidth="0.8"/>
    <path d="M12 9.5V11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    <path d="M10 12.5C11 12 13 12 14 12.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    <path d="M8.5 15C10.5 14.2 13.5 14.2 15.5 15" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    <path d="M4 18.5C6 18 18 18 20 18.5" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

const PressureTransmitterSvg = ({ className = "h-4.5 w-4.5" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="9" r="6" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.8"/>
    <path d="M12 9L15 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    <circle cx="12" cy="9" r="1" fill="#fff" stroke="currentColor" strokeWidth="0.8"/>
    <rect x="10" y="15" width="4" height="4" rx="0.5" fill="currentColor" fillOpacity="0.4" stroke="currentColor" strokeWidth="1"/>
    <line x1="12" y1="15" x2="12" y2="18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
    <line x1="11" y1="20" x2="13" y2="20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

const FlowTransmitterSvg = ({ className = "h-4.5 w-4.5" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="11" width="2" height="8" rx="0.5" fill="currentColor" fillOpacity="0.4" stroke="currentColor" strokeWidth="0.8"/>
    <rect x="19" y="11" width="2" height="8" rx="0.5" fill="currentColor" fillOpacity="0.4" stroke="currentColor" strokeWidth="0.8"/>
    <rect x="5" y="12" width="14" height="6" fill="currentColor" fillOpacity="0.1" stroke="currentColor" strokeWidth="1.5"/>
    <rect x="9" y="4" width="6" height="6" rx="1.2" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="1.8"/>
    <line x1="12" y1="10" x2="12" y2="12" stroke="currentColor" strokeWidth="2"/>
    <path d="M8 15H16M16 15L13.5 12.5M16 15L13.5 17.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const PhAnalyzerSvg = ({ className = "h-4.5 w-4.5" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M9 3H15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M10.5 3V8L5.5 17C4.5 19 6 21 8.5 21H15.5C18 21 19.5 19 18.5 17L13.5 8V3H10.5Z" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
    <rect x="11.2" y="5" width="1.6" height="11" rx="0.8" fill="currentColor" stroke="currentColor" strokeWidth="0.8"/>
    <rect x="11" y="15" width="2" height="2" rx="0.5" fill="#f59e0b"/>
    <line x1="7.5" y1="15" x2="16.5" y2="15" stroke="currentColor" strokeWidth="1" strokeDasharray="2 1"/>
  </svg>
);

const EnergyMeterSvg = ({ className = "h-4.5 w-4.5" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="4" y="3" width="16" height="18" rx="2" fill="currentColor" fillOpacity="0.1" stroke="currentColor" strokeWidth="1.8"/>
    <rect x="7" y="6" width="10" height="5" rx="0.5" fill="currentColor" fillOpacity="0.3" stroke="currentColor" strokeWidth="1"/>
    <line x1="8.5" y1="8.5" x2="15.5" y2="8.5" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M12 13.5L10 16.5H13L12 19.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
  </svg>
);

const ThermometerSvg = ({ className = "h-4.5 w-4.5" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M14 14.76V3.5C14 2.67 13.33 2 12.5 2C11.67 2 11 2.67 11 3.5V14.76C9.78 15.6 9 17 9 18.5C9 20.43 10.57 22 12.5 22C14.43 22 16 20.43 16 18.5C16 17 15.22 15.6 14 14.76Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="12.5" cy="18.5" r="2" fill="#f43f5e" />
    <path d="M12.5 9V16.5" stroke="#f43f5e" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const getSectionIcon = (section: string) => {
  switch (section.toLowerCase()) {
    case 'intake':
      return <IntakeWellSvg className="h-4.5 w-4.5 mr-1.5" />;
    case 'wtp':
      return <WtpSvg className="h-4.5 w-4.5 mr-1.5" />;
    case 'oht':
      return <OhtSvg className="h-4.5 w-4.5 mr-1.5" />;
    default:
      return <Database className="h-4.5 w-4.5 mr-1.5" />;
  }
};

const getSensorIcon = (tagId: string, label: string) => {
  const normalized = (label + ' ' + tagId).toLowerCase();
  if (normalized.includes('pump')) {
    return <VtPumpSvg className="h-4.5 w-4.5 text-emerald-500 dark:text-emerald-400" />;
  }
  if (normalized.includes('level') || normalized.includes(' rlt') || normalized.includes('-lt')) {
    return <LevelTransmitterSvg className="h-4.5 w-4.5 text-sky-500 dark:text-sky-400" />;
  }
  if (normalized.includes('pressure') || normalized.includes('-pt')) {
    return <PressureTransmitterSvg className="h-4.5 w-4.5 text-purple-500 dark:text-purple-400" />;
  }
  if (normalized.includes('flow') || normalized.includes('-ft') || normalized.includes('totalizer')) {
    return <FlowTransmitterSvg className="h-4.5 w-4.5 text-cyan-500 dark:text-cyan-400" />;
  }
  if (normalized.includes('ph')) {
    return <PhAnalyzerSvg className="h-4.5 w-4.5 text-teal-500 dark:text-teal-400" />;
  }
  if (normalized.includes('temp') || normalized.includes('-tem') || normalized.includes('°c')) {
    return <ThermometerSvg className="h-4.5 w-4.5 text-rose-500 dark:text-rose-400" />;
  }
  if (normalized.includes('kw') || normalized.includes('energy') || normalized.includes('power')) {
    return <EnergyMeterSvg className="h-4.5 w-4.5 text-amber-500 dark:text-amber-400" />;
  }
  return <Gauge className="h-4.5 w-4.5 text-slate-400" />;
};


// Default page sizes based on density
const PAGE_SIZES = {
  fast: 20,
  detailed: 50,
  analytical: 100,
};

const TableRowSkeleton: React.FC = () => (
  <TableRow className="border-b border-border/30">
    <TableCell className="pl-6 py-4"><Skeleton className="h-4 w-36" /></TableCell>
    <TableCell className="py-4"><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
    <TableCell className="py-4"><Skeleton className="h-4 w-28" /></TableCell>
    <TableCell className="text-right pr-6 py-4"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
    <TableCell className="pl-4 py-4"><Skeleton className="h-4 w-12" /></TableCell>
  </TableRow>
);

const HistoryPage: React.FC = () => {
  const today = new Date();
  const [globalFilters, setGlobalFilters] = useState<GlobalFilters>({
    startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
    endDate: today,
    assets: ['all'],
    density: 'detailed',
  });
  const [logs, setLogs] = useState<HistorianLog[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{
    open: boolean;
    phase: 'estimating' | 'fetching' | 'building' | 'done';
    fetched: number;
    total: number;
    estSec: number;
    startedAt: number;
  }>({ open: false, phase: 'estimating', fetched: 0, total: 0, estSec: 0, startedAt: 0 });
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [exportInterval, setExportInterval] = useState<ExportInterval>('all');
  const [pageSizeOverride, setPageSizeOverride] = useState<number | null>(null);
  const autoRefreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { toast } = useToast();
  const { plantName } = useScada();

  const pageSize = pageSizeOverride ?? PAGE_SIZES[globalFilters.density];
  const totalPages = Math.ceil(totalCount / pageSize);

  const getSectionFilters = useCallback((): ('intake' | 'oht' | 'wtp')[] => {
    if (globalFilters.assets.includes('all')) return [];
    const sections = new Set<'intake' | 'oht' | 'wtp'>();
    globalFilters.assets.forEach(a => {
      if (a === 'intake') sections.add('intake');
      else if (a === 'wtp') sections.add('wtp');
      else if (a.startsWith('oht')) sections.add('oht');
    });
    return [...sections];
  }, [globalFilters.assets]);

  // Get specific OHT tag_id prefixes for filtering (e.g., 'OHT1-', 'OHT2-')
  const getOhtTagPrefixes = useCallback((): string[] => {
    if (globalFilters.assets.includes('all')) return [];
    return globalFilters.assets
      .filter(a => a.startsWith('oht-'))
      .map(a => {
        const num = a.split('-')[1];
        return `OHT${num}-`;
      });
  }, [globalFilters.assets]);

  const fetchLogs = useCallback(async (page: number = 1, sizeOverride?: number) => {
    if (!globalFilters.startDate || !globalFilters.endDate) {
      toast({ title: 'Select Date Range', description: 'Please select both start and end dates.', variant: 'destructive' });
      return;
    }

    // Cancel any in-flight request
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();

    setIsLoading(true);
    try {
      const startTime = startOfDay(globalFilters.startDate).toISOString();
      const endTime = endOfDay(globalFilters.endDate).toISOString();
      const sectionFilters = getSectionFilters();
      const ohtPrefixes = getOhtTagPrefixes();
      const currentSize = sizeOverride ?? pageSize;

      // Run count and data queries in parallel (excluding uninstalled sensors & ad-hoc delta noise)
      let countQuery = supabase.from('historian_logs').select('*', { count: 'exact', head: true })
        .gte('timestamp', startTime).lte('timestamp', endTime)
        .not('tag_id', 'in', UNINSTALLED_TAGS_FILTER)
        .or('source.like.%5min%,source.is.null');
      if (sectionFilters.length > 0) countQuery = countQuery.in('section', sectionFilters);
      // Apply specific OHT tag filtering
      if (ohtPrefixes.length > 0 && sectionFilters.includes('oht') && !globalFilters.assets.includes('intake') && !globalFilters.assets.includes('wtp')) {
        const ohtFilter = ohtPrefixes.map(p => `tag_id.like.${p}%`).join(',');
        countQuery = countQuery.or(ohtFilter);
      }

      const offset = (page - 1) * currentSize;
      let dataQuery = supabase.from('historian_logs')
        .select(`id, tag_id, section, value, timestamp, received_at, tag_config:tag_config_id (label, unit)`)
        .gte('timestamp', startTime).lte('timestamp', endTime)
        .not('tag_id', 'in', UNINSTALLED_TAGS_FILTER)
        .or('source.like.%5min%,source.is.null')
        .order('timestamp', { ascending: false })
        .order('section', { ascending: true })
        .order('tag_id', { ascending: true })
        .range(offset, offset + currentSize - 1);
      if (sectionFilters.length > 0) dataQuery = dataQuery.in('section', sectionFilters);
      if (ohtPrefixes.length > 0 && sectionFilters.includes('oht') && !globalFilters.assets.includes('intake') && !globalFilters.assets.includes('wtp')) {
        const ohtFilter = ohtPrefixes.map(p => `tag_id.like.${p}%`).join(',');
        dataQuery = dataQuery.or(ohtFilter);
      }

      const [countResult, dataResult] = await Promise.all([countQuery, dataQuery]);

      if (countResult.error) throw countResult.error;
      if (dataResult.error) throw dataResult.error;

      const total = countResult.count || 0;
      setTotalCount(total);
      const sorted = [...(dataResult.data as unknown as HistorianLog[])].sort((a, b) => {
        const BUCKET_MS = 5 * 60 * 1000;
        const ta = Math.floor(new Date(a.timestamp).getTime() / BUCKET_MS);
        const tb = Math.floor(new Date(b.timestamp).getTime() / BUCKET_MS);
        if (ta !== tb) return tb - ta;
        const oa = getSectionOrder(a.section, a.tag_id);
        const ob = getSectionOrder(b.section, b.tag_id);
        if (oa !== ob) return oa - ob;
        return a.tag_id.localeCompare(b.tag_id);
      });

      // Deduplicate: Ensure exactly 1 entry per tag_id per 5-minute snapshot bucket
      const seenTagBucket = new Set<string>();
      const BUCKET_MS = 5 * 60 * 1000;
      const deduplicated = sorted.filter(log => {
        const bucketTs = Math.floor(new Date(log.timestamp).getTime() / BUCKET_MS);
        const key = `${bucketTs}_${log.tag_id}`;
        if (seenTagBucket.has(key)) return false;
        seenTagBucket.add(key);
        return true;
      });

      setLogs(deduplicated);
      setCurrentPage(page);
      if (page === 1) toast({ title: 'Data Loaded', description: `Loaded ${deduplicated.length} records on this page (${total.toLocaleString()} total found).` });
    } catch (error: any) {
      if (error?.name === 'AbortError') return;
      logError('History.fetchLogs', error);
      toast({ title: 'Error', description: 'Failed to fetch historical data.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [globalFilters.startDate, globalFilters.endDate, getSectionFilters, getOhtTagPrefixes, globalFilters.assets, pageSize, toast]);

  useEffect(() => {
    if (autoRefresh && globalFilters.startDate && globalFilters.endDate) {
      autoRefreshIntervalRef.current = setInterval(() => fetchLogs(currentPage), 30000);
    }
    return () => { if (autoRefreshIntervalRef.current) clearInterval(autoRefreshIntervalRef.current); };
  }, [autoRefresh, globalFilters.startDate, globalFilters.endDate, currentPage, totalCount, fetchLogs]);

  const handlePageChange = useCallback((newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) fetchLogs(newPage);
  }, [totalPages, fetchLogs]);

  const exportToExcel = useCallback(async () => {
    if (!globalFilters.startDate || !globalFilters.endDate) return;
    setIsExporting(true);
    const startedAt = Date.now();
    setExportProgress({ open: true, phase: 'estimating', fetched: 0, total: 0, estSec: 0, startedAt });
    try {
      const startTime = startOfDay(globalFilters.startDate).toISOString();
      const endTime = endOfDay(globalFilters.endDate).toISOString();
      const sectionFilters = getSectionFilters();
      const ohtPrefixes = getOhtTagPrefixes();
      const useOhtFilter = ohtPrefixes.length > 0 && sectionFilters.includes('oht') && !globalFilters.assets.includes('intake') && !globalFilters.assets.includes('wtp');
      const ohtOr = useOhtFilter ? ohtPrefixes.map(p => `tag_id.like.${p}%`).join(',') : null;

      const applyFilters = (q: any) => {
        let r = q.gte('timestamp', startTime).lte('timestamp', endTime)
          .not('tag_id', 'in', UNINSTALLED_TAGS_FILTER)
          .or('source.like.%5min%,source.is.null');
        if (sectionFilters.length > 0) r = r.in('section', sectionFilters);
        if (ohtOr) r = r.or(ohtOr);
        return r;
      };

      // Phase 1: count + estimate
      let countQ = supabase.from('historian_logs').select('*', { count: 'exact', head: true });
      countQ = applyFilters(countQ);
      const { count: total, error: countErr } = await countQ;
      if (countErr) throw countErr;
      const totalCountVal = total || 0;
      // Estimate: ~3500 rows/sec end-to-end on average connection
      const estSec = Math.max(2, Math.ceil(totalCountVal / 3500));
      setExportProgress(p => ({ ...p, phase: 'fetching', total: totalCountVal, estSec }));

      if (totalCountVal === 0) {
        setExportProgress(p => ({ ...p, open: false }));
        toast({ title: 'No Records', description: 'No data to export for the selected range.' });
        return;
      }

      // Phase 2: parallel paginated fetch (8 pages concurrent)
      const PAGE = 1000;
      const totalPages = Math.ceil(totalCountVal / PAGE);
      const CONCURRENCY = 6;
      const allData: HistorianLog[] = new Array(totalCountVal);
      let fetchedSoFar = 0;
      let nextPage = 0;

      const worker = async () => {
        while (true) {
          const pageIdx = nextPage++;
          if (pageIdx >= totalPages) return;
          const from = pageIdx * PAGE;
          const to = from + PAGE - 1;
          let q = supabase.from('historian_logs')
            .select(`id, tag_id, section, value, timestamp, received_at, tag_config:tag_config_id (label, unit)`)
            .order('timestamp', { ascending: false })
            .order('tag_id', { ascending: true })
            .order('id', { ascending: true })
            .range(from, to);
          q = applyFilters(q);
          const { data, error } = await q;
          if (error) throw error;
          if (data) {
            for (let i = 0; i < data.length; i++) allData[from + i] = data[i] as unknown as HistorianLog;
            fetchedSoFar += data.length;
            setExportProgress(p => ({ ...p, fetched: fetchedSoFar }));
          }
        }
      };
      await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

      // Phase 3a: Deduplicate — keep exactly 1 record per tag_id per 5-min snapshot bucket.
      // This mirrors the same dedup applied in the screen fetchLogs path. Without this, the
      // Excel export shows 2x / 4x / 10x duplicate rows when the DB contains both a
      // backend:5min snapshot AND event-driven browser writes for the same tag at the same time.
      const DEDUP_BUCKET_MS = 5 * 60 * 1000;
      const latestPerTagBucket = new Map<string, HistorianLog>();
      for (const log of allData.filter(Boolean) as HistorianLog[]) {
        const bucketTs = Math.floor(new Date(log.timestamp).getTime() / DEDUP_BUCKET_MS);
        const key = `${log.tag_id}|${bucketTs}`;
        const existing = latestPerTagBucket.get(key);
        // Keep the record with the latest actual timestamp within the bucket
        if (!existing || new Date(existing.timestamp).getTime() < new Date(log.timestamp).getTime()) {
          latestPerTagBucket.set(key, log);
        }
      }
      let processed: HistorianLog[] = Array.from(latestPerTagBucket.values());

      // Phase 3b: Further downsample by user-chosen export interval (30m / 1h / 1d etc.)
      if (exportInterval !== 'all') {
        const bucketMs = INTERVAL_MS[exportInterval];
        const latestByBucket = new Map<string, HistorianLog>();
        for (const log of processed) {
          const t = new Date(log.timestamp).getTime();
          const bucket = Math.floor(t / bucketMs);
          const key = `${log.tag_id}|${bucket}`;
          const existing = latestByBucket.get(key);
          if (!existing || new Date(existing.timestamp).getTime() < t) {
            latestByBucket.set(key, log);
          }
        }
        processed = Array.from(latestByBucket.values());
      }

      // Phase 3b: timestamp-first grouping — latest time on top, and within each
      // 5-minute timestamp bucket order by Intake → WTP → OHT-1/2 → tag.
      processed.sort((a, b) => {
        const BUCKET_MS = 5 * 60 * 1000;
        const ta = Math.floor(new Date(a.timestamp).getTime() / BUCKET_MS);
        const tb = Math.floor(new Date(b.timestamp).getTime() / BUCKET_MS);
        if (ta !== tb) return tb - ta;
        const oa = getSectionOrder(a.section, a.tag_id);
        const ob = getSectionOrder(b.section, b.tag_id);
        if (oa !== ob) return oa - ob;
        return a.tag_id.localeCompare(b.tag_id);
      });

      const exportCount = processed.length;

      // Phase 3: build workbook
      setExportProgress(p => ({ ...p, phase: 'building' }));
      const wb = new ExcelJS.Workbook();
      wb.creator = plantName;
      wb.created = new Date();
      const ws = wb.addWorksheet('Historical Records', {
        views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
      });

      ws.columns = [
        { key: 'ts', width: 22 },
        { key: 'section', width: 14 },
        { key: 'sensor', width: 14 },
        { key: 'label', width: 32 },
        { key: 'value', width: 14 },
        { key: 'unit', width: 10 },
        { key: 'received', width: 23 },
      ];

      // Row 1: Title banner
      ws.mergeCells('A1:G1');
      const titleCell = ws.getCell('A1');
      titleCell.value = `💧  ${plantName.toUpperCase()}  —  HISTORICAL RECORDS`;
      titleCell.font = { name: 'Segoe UI', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E7490' } };
      ws.getRow(1).height = 38;

      // Row 2: Period / records / generated info
      ws.mergeCells('A2:G2');
      const infoCell = ws.getCell('A2');
      const startStr = format(globalFilters.startDate, 'd MMM yyyy');
      const endStr = format(globalFilters.endDate, 'd MMM yyyy');
      const genStr = format(new Date(), 'd MMM yyyy HH:mm');
      // Compute actual data range from processed rows (may differ from selected range
      // if data didn't exist for the full selected period — e.g. plant started later).
      let actualStr = '';
      if (processed.length > 0) {
        const times = processed.map(l => new Date(l.timestamp).getTime());
        const minT = new Date(Math.min(...times));
        const maxT = new Date(Math.max(...times));
        const aS = format(minT, 'd MMM yyyy');
        const aE = format(maxT, 'd MMM yyyy');
        const rangeMismatch =
          aS !== startStr || aE !== endStr;
        actualStr = rangeMismatch
          ? `  •  📂 Data Available: ${aS}  →  ${aE}`
          : '';
      }
      const recordsStr = exportInterval === 'all'
        ? `📊 Records: ${exportCount.toLocaleString()}`
        : `📊 ${exportCount.toLocaleString()} of ${totalCountVal.toLocaleString()} records  •  Interval: ${INTERVAL_LABEL[exportInterval]}`;
      infoCell.value = `📅 Selected: ${startStr}  →  ${endStr}${actualStr}     ${recordsStr}     🕒 Generated: ${genStr}`;
      infoCell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF1F2937' } };
      infoCell.alignment = { horizontal: 'center', vertical: 'middle' };
      infoCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF9C3' } };
      ws.getRow(2).height = 26;

      // Row 3 spacer
      ws.getRow(3).height = 6;

      // Row 4: Header
      const headerRow = ws.getRow(4);
      const headers = ['⏱  5-min interval', '🏭  Section', '🔧  Sensor Type', '🏷  Label / Tag', '📈  Value', '⚠  Unit', 'Received at (IST)'];
      const headerColors = ['FF2563EB', 'FFDC2626', 'FF7C3AED', 'FF059669', 'FFEA580C', 'FFCA8A04'];
      headers.forEach((h, i) => {
        const c = headerRow.getCell(i + 1);
        c.value = h;
        c.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF' + headerColors[i].slice(2) } };
        c.alignment = { horizontal: i === 4 ? 'right' : 'left', vertical: 'middle' };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF064E3B' } };
        c.border = {
          top: { style: 'thin', color: { argb: 'FF334155' } },
          bottom: { style: 'medium', color: { argb: 'FF334155' } },
        };
      });
      headerRow.height = 26;
      ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: 7 } };

      // Data rows
      const sectionFill: Record<string, string> = {
        oht: 'FFECFDF5',
        intake: 'FFEFF6FF',
        wtp: 'FFFFFBEB',
      };
      const sectionFont: Record<string, string> = {
        oht: 'FF047857',
        intake: 'FF1D4ED8',
        wtp: 'FFB45309',
      };

      processed.forEach((log, idx) => {
        if (!log) return;
        const isPump = log.tag_id.includes('Pump');
        const label = log.tag_config?.label || log.tag_id;
        const normalized = (label + ' ' + log.tag_id).toLowerCase();
        let sensorType = 'Other';
        if (normalized.includes('pump')) sensorType = 'Pump';
        else if (normalized.includes('level') || normalized.includes('-lt')) sensorType = 'Level';
        else if (normalized.includes('pressure') || normalized.includes('-pt')) sensorType = 'Pressure';
        else if (normalized.includes('totalizer')) sensorType = 'Totalizer';
        else if (normalized.includes('flow') || normalized.includes('-ft')) sensorType = 'Flow';
        else if (normalized.includes('ph')) sensorType = 'pH';
        else if (normalized.includes('turbidity')) sensorType = 'Turbidity';
        else if (normalized.includes('chlorine')) sensorType = 'Chlorine';
        else if (normalized.includes('kw') || normalized.includes('energy')) sensorType = 'Energy';

        const valueOut = isPump ? (Number(log.value) >= 1 ? 'ON' : 'OFF') : Number(log.value);

        const row = ws.addRow({
          ts: format(new Date(log.timestamp), 'yyyy-MM-dd HH:mm:ss'),
          section: getDisplaySection(log.section, log.tag_id),
          sensor: sensorType,
          label,
          value: valueOut,
          unit: log.tag_config?.unit || '',
          received: log.received_at ? format(new Date(log.received_at), 'yyyy-MM-dd HH:mm:ss') : '',
        });

        const sec = log.section.toLowerCase();
        const bg = sectionFill[sec] || (idx % 2 === 0 ? 'FFF8FAFC' : 'FFFFFFFF');
        const secFg = sectionFont[sec] || 'FF334155';

        row.eachCell({ includeEmpty: true }, (cell, col) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
          cell.font = { name: 'Segoe UI', size: 10, color: { argb: 'FF1F2937' } };
          cell.alignment = { vertical: 'middle', horizontal: col === 5 ? 'right' : 'left' };
          cell.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } };
        });
        // Section column bold colored
        const secCell = row.getCell(2);
        secCell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: secFg } };
        // Sensor column bold colored
        const sensorCell = row.getCell(3);
        sensorCell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: secFg } };
        // Value
        const valCell = row.getCell(5);
        if (typeof valueOut === 'number') {
          valCell.numFmt = '#,##0.00####';
          valCell.font = { name: 'Consolas', size: 11, bold: true, color: { argb: 'FF111827' } };
        } else {
          valCell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: valueOut === 'ON' ? 'FF059669' : 'FFDC2626' } };
        }
        // Unit italic muted
        const unitCell = row.getCell(6);
        unitCell.font = { name: 'Segoe UI', size: 9, italic: true, color: { argb: 'FF6B7280' } };
      });

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      const intervalSuffix = exportInterval === 'all' ? '' : `_${exportInterval}`;
      const fileStart = format(globalFilters.startDate!, 'd MMM yyyy');
      const fileEnd = format(globalFilters.endDate!, 'd MMM yyyy');
      const safePlant = (plantName || 'SCADA').replace(/[\\/:*?"<>|]/g, '');
      link.download = `${safePlant} Scada History ${fileStart} to ${fileEnd}${intervalSuffix}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);

      setExportProgress(p => ({ ...p, phase: 'done' }));
      setTimeout(() => setExportProgress(p => ({ ...p, open: false })), 1200);
      toast({ title: 'Export Complete', description: `Exported ${exportCount.toLocaleString()} records to Excel${exportInterval !== 'all' ? ` (${INTERVAL_LABEL[exportInterval]})` : ''}.` });
    } catch (error) {
      logError('History.exportExcel', error);
      setExportProgress(p => ({ ...p, open: false }));
      toast({ title: 'Export Failed', description: 'Failed to generate Excel file.', variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  }, [globalFilters.startDate, globalFilters.endDate, globalFilters.assets, getSectionFilters, getOhtTagPrefixes, toast, plantName, exportInterval]);

  const paginationInfo = useMemo(() => {
    if (totalCount === 0 && logs.length === 0) return null;
    const maxVisible = 5;
    const effectiveTotalPages = Math.max(1, totalPages);
    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(effectiveTotalPages, startPage + maxVisible - 1);
    if (endPage - startPage + 1 < maxVisible) startPage = Math.max(1, endPage - maxVisible + 1);
    const pages = [];
    for (let i = startPage; i <= endPage; i++) pages.push(i);
    return {
      pages,
      totalPages: effectiveTotalPages,
      from: totalCount === 0 ? 0 : ((currentPage - 1) * pageSize) + 1,
      to: Math.min(currentPage * pageSize, totalCount)
    };
  }, [totalPages, currentPage, totalCount, pageSize, logs.length]);

  // Sort current page rows for display: latest timestamp first, then within the
  // same minute Intake → WTP → OHT-1/2 → tag (so user sees all sections together per time).
  const sortedLogs = useMemo(() => {
    return [...logs].sort((a, b) => {
      const BUCKET_MS = 5 * 60 * 1000;
      const ta = Math.floor(new Date(a.timestamp).getTime() / BUCKET_MS);
      const tb = Math.floor(new Date(b.timestamp).getTime() / BUCKET_MS);
      if (ta !== tb) return tb - ta;
      const oa = getSectionOrder(a.section, a.tag_id);
      const ob = getSectionOrder(b.section, b.tag_id);
      if (oa !== ob) return oa - ob;
      return a.tag_id.localeCompare(b.tag_id);
    });
  }, [logs]);

  return (
    <div className="min-h-screen flex flex-col bg-background grid-pattern relative overflow-hidden">
      {/* Floating gradient decorative orbs for premium depth */}
      <div className="floating-orb bg-primary w-[300px] h-[300px] -top-20 -left-20 opacity-[0.04] dark:opacity-[0.06]" />
      <div className="floating-orb bg-accent w-[250px] h-[250px] top-[40%] -right-10 opacity-[0.03] dark:opacity-[0.05]" />
      <div className="floating-orb bg-success w-[300px] h-[300px] -bottom-20 left-[30%] opacity-[0.03] dark:opacity-[0.05]" />

      <main className="flex-1 container mx-auto px-3 sm:px-4 py-5 sm:py-6 md:py-8 relative z-10">
        <div className="flex items-start sm:items-center gap-2.5 sm:gap-3.5 mb-5 sm:mb-6 md:mb-8 opacity-0 animate-fade-in">
          <div className="p-2.5 sm:p-3.5 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/20 border border-primary/20 shadow-md shrink-0">
            <Database className="h-5 w-5 sm:h-6 sm:w-6 text-primary animate-pulse" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl md:text-2xl font-bold tracking-tight text-foreground bg-gradient-to-r from-foreground via-foreground/90 to-muted-foreground bg-clip-text text-shadow-glow">Historical Sensors</h2>
          </div>
        </div>

        <GlobalFilterBar filters={globalFilters} onFiltersChange={setGlobalFilters} onApply={() => fetchLogs(1)} />

        <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-5 opacity-0 animate-fade-in" style={{ animationDelay: '100ms' }}>
          <Button 
            onClick={() => fetchLogs(1)} 
            disabled={isLoading} 
            className="flex-1 sm:flex-none bg-gradient-to-r from-primary via-primary/95 to-cyan-500 hover:from-primary/95 hover:to-cyan-600 text-primary-foreground hover:shadow-lg hover:shadow-primary/20 border-0 font-semibold shadow-md transition-all active:scale-[0.98] duration-200"
          >
            {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading...</> : <><Database className="mr-2 h-4 w-4" />Fetch Data</>}
          </Button>
          <Button 
            onClick={exportToExcel} 
            disabled={isExporting || totalCount === 0} 
            variant="outline" 
            className="flex-1 sm:flex-none border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5 hover:bg-emerald-500/10 hover:border-emerald-500 font-semibold shadow-sm transition-all active:scale-[0.98] duration-200"
          >
            {isExporting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Exporting...</> : <><FileSpreadsheet className="mr-2 h-4 w-4" />Export Excel</>}
          </Button>
          <div className="flex items-center gap-2 glass border border-border/40 px-3 py-1 rounded-xl shadow-sm">
            <Label className="text-xs font-semibold text-muted-foreground whitespace-nowrap">Interval</Label>
            <Select value={exportInterval} onValueChange={(v) => setExportInterval(v as ExportInterval)}>
              <SelectTrigger className="h-8 w-[150px] border-0 bg-transparent text-sm font-semibold focus:ring-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All data</SelectItem>
                <SelectItem value="1m">Every 1 minute</SelectItem>
                <SelectItem value="30m">Every 30 minutes</SelectItem>
                <SelectItem value="1h">Every 1 hour</SelectItem>
                <SelectItem value="1d">Every 1 day</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto justify-center glass border border-border/40 px-3.5 py-1.5 rounded-xl shadow-sm">
            <Switch id="auto-refresh" checked={autoRefresh} onCheckedChange={setAutoRefresh} disabled={totalCount === 0} />
            <Label htmlFor="auto-refresh" className={cn("flex items-center gap-2 cursor-pointer text-sm font-semibold select-none", autoRefresh ? "text-primary" : "text-muted-foreground")}>
              <RefreshCw className={cn("h-4 w-4", autoRefresh && "animate-spin")} /> Auto-Refresh
            </Label>
          </div>
        </div>

        <Card className="opacity-0 animate-fade-in glass-strong border-border/40 relative overflow-hidden shadow-2xl rounded-2xl" style={{ animationDelay: '200ms' }}>
          {/* Accent top gradient line */}
          <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-primary via-accent to-success opacity-85 z-20" />
          
          <CardHeader className="border-b border-border/40 pb-3 sm:pb-4 px-3 sm:px-6 pt-4 sm:pt-6 bg-muted/20">
            <CardTitle className="text-base sm:text-lg font-bold flex flex-wrap items-center gap-x-2 gap-y-1 text-foreground">
              <Database className="h-4 w-4 sm:h-5 sm:w-5 text-primary animate-pulse shrink-0" />
              Historical Records
              {totalCount > 0 && (
                <span className="text-[10px] sm:text-xs font-semibold px-2 sm:px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 sm:ml-2">
                  {totalCount.toLocaleString()} total
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2 sm:p-6">
            {isLoading && logs.length === 0 ? (
              <div className="rounded-xl border border-border/40 overflow-hidden shadow-inner bg-card/30">
                <Table>
                  <TableHeader className="bg-secondary/85 backdrop-blur-md border-b border-border/60">
                    <TableRow className="border-b border-border/50">
                      <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-bold py-4 pl-6">Timestamp</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-bold py-4">Section</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-bold py-4">Label</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-bold py-4 text-right pr-6">Value</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-bold py-4 pl-4">Unit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Array.from({ length: 8 }).map((_, i) => <TableRowSkeleton key={i} />)}
                  </TableBody>
                </Table>
              </div>
            ) : logs.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground glass rounded-xl border border-border/40 p-8 my-4">
                <div className="p-4 rounded-full bg-primary/5 w-16 h-16 flex items-center justify-center mx-auto mb-4 border border-primary/10">
                  <Database className="h-8 w-8 text-primary/60 animate-pulse" />
                </div>
                <p className="text-lg font-bold text-foreground">No records loaded</p>
                <p className="text-sm max-w-xs mx-auto text-muted-foreground mt-1">Select your desired date range and assets above, then click the "Fetch Data" button.</p>
              </div>
            ) : (
              <>
                <div className="rounded-xl border border-border/40 shadow-inner bg-card/30 max-h-[70vh] sm:max-h-[75vh] min-h-[350px] overflow-y-auto overflow-x-auto relative scroll-smooth" style={{ WebkitOverflowScrolling: 'touch' }}>
                  <div className="min-w-[650px] sm:min-w-[760px] w-full">
                    <Table className="w-full min-w-[650px] sm:min-w-[760px]">
                      <TableHeader className="sticky top-0 bg-background/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-border/50 z-20 shadow-sm">
                        <TableRow className="hover:bg-transparent border-0">
                          <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-bold py-3.5 sm:py-4 pl-4 sm:pl-6 border-0">Timestamp</TableHead>
                          <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-bold py-3.5 sm:py-4 border-0">Section</TableHead>
                          <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-bold py-3.5 sm:py-4 border-0">Label</TableHead>
                          <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-bold py-3.5 sm:py-4 text-right pr-4 sm:pr-6 border-0">Value</TableHead>
                          <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-bold py-3.5 sm:py-4 pl-2 sm:pl-4 border-0">Unit</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedLogs.map((log) => {
                          const isPump = log.tag_id.includes('Pump');
                          const isWtp = log.section === 'wtp';
                          const isIntake = log.section === 'intake';
                          const isOht = log.section === 'oht';
                          const displaySection = getDisplaySection(log.section, log.tag_id);
                          
                          // Row dynamic left border and soft background gradient based on section
                          let rowBorderClass = "border-l-4 border-l-transparent";
                          let rowBgClass = "bg-card/45 hover:bg-muted/40 dark:bg-card/15 dark:hover:bg-muted/10";

                          if (isIntake) {
                            rowBorderClass = "border-l-4 border-l-blue-500/80";
                            rowBgClass = "bg-gradient-to-r from-blue-500/[0.03] via-blue-500/[0.005] to-transparent hover:from-blue-500/[0.06] hover:via-blue-500/[0.015] bg-card/10 dark:bg-card/5";
                          } else if (isWtp) {
                            rowBorderClass = "border-l-4 border-l-amber-500/80";
                            rowBgClass = "bg-gradient-to-r from-amber-500/[0.03] via-amber-500/[0.005] to-transparent hover:from-amber-500/[0.06] hover:via-amber-500/[0.015] bg-card/10 dark:bg-card/5";
                          } else if (isOht) {
                            rowBorderClass = "border-l-4 border-l-emerald-500/80";
                            rowBgClass = "bg-gradient-to-r from-emerald-500/[0.03] via-emerald-500/[0.005] to-transparent hover:from-emerald-500/[0.06] hover:via-emerald-500/[0.015] bg-card/10 dark:bg-card/5";
                          }

                          const logDate = new Date(log.timestamp);
                          const dateStr = format(logDate, 'yyyy-MM-dd');
                          const timeStr = format(logDate, 'HH:mm:ss');

                          const normalizedLabel = ((log.tag_config?.label || '') + ' ' + log.tag_id).toLowerCase();
                          
                          // Dynamic border and background casing colors based on parameter type
                          let iconBorderClass = "bg-slate-500/10 border-slate-500/20 dark:bg-slate-500/5 dark:border-slate-500/10";
                          let hoverColorClass = "group-hover:text-slate-900 dark:group-hover:text-white";

                          if (normalizedLabel.includes('pump')) {
                            iconBorderClass = "bg-emerald-500/10 border-emerald-500/20 dark:bg-emerald-950/30 dark:border-emerald-500/30 shadow-sm shadow-emerald-500/5 group-hover:shadow-emerald-500/20 group-hover:border-emerald-500/50";
                            hoverColorClass = "group-hover:text-emerald-500 dark:group-hover:text-emerald-400";
                          } else if (normalizedLabel.includes('level') || normalizedLabel.includes(' rlt') || normalizedLabel.includes('-lt')) {
                            iconBorderClass = "bg-sky-500/10 border-sky-500/20 dark:bg-sky-950/30 dark:border-sky-500/30 shadow-sm shadow-sky-500/5 group-hover:shadow-sky-500/20 group-hover:border-sky-500/50";
                            hoverColorClass = "group-hover:text-sky-500 dark:group-hover:text-sky-400";
                          } else if (normalizedLabel.includes('pressure') || normalizedLabel.includes('-pt')) {
                            iconBorderClass = "bg-purple-500/10 border-purple-500/20 dark:bg-purple-950/30 dark:border-purple-500/30 shadow-sm shadow-purple-500/5 group-hover:shadow-purple-500/20 group-hover:border-purple-500/50";
                            hoverColorClass = "group-hover:text-purple-500 dark:group-hover:text-purple-400";
                          } else if (normalizedLabel.includes('flow') || normalizedLabel.includes('-ft') || normalizedLabel.includes('totalizer')) {
                            iconBorderClass = "bg-cyan-500/10 border-cyan-500/20 dark:bg-cyan-950/30 dark:border-cyan-500/30 shadow-sm shadow-cyan-500/5 group-hover:shadow-cyan-500/20 group-hover:border-cyan-500/50";
                            hoverColorClass = "group-hover:text-cyan-500 dark:group-hover:text-cyan-400";
                          } else if (normalizedLabel.includes('ph')) {
                            iconBorderClass = "bg-teal-500/10 border-teal-500/20 dark:bg-teal-950/30 dark:border-teal-500/30 shadow-sm shadow-teal-500/5 group-hover:shadow-teal-500/20 group-hover:border-teal-500/50";
                            hoverColorClass = "group-hover:text-teal-500 dark:group-hover:text-teal-400";
                          } else if (normalizedLabel.includes('temp') || normalizedLabel.includes('-tem') || normalizedLabel.includes('°c')) {
                            iconBorderClass = "bg-rose-500/10 border-rose-500/20 dark:bg-rose-950/30 dark:border-rose-500/30 shadow-sm shadow-rose-500/5 group-hover:shadow-rose-500/20 group-hover:border-rose-500/50";
                            hoverColorClass = "group-hover:text-rose-500 dark:group-hover:text-rose-400";
                          } else if (normalizedLabel.includes('kw') || normalizedLabel.includes('energy') || normalizedLabel.includes('power')) {
                            iconBorderClass = "bg-amber-500/10 border-amber-500/20 dark:bg-amber-950/30 dark:border-amber-500/30 shadow-sm shadow-amber-500/5 group-hover:shadow-amber-500/20 group-hover:border-amber-500/50";
                            hoverColorClass = "group-hover:text-amber-500 dark:group-hover:text-amber-400";
                          }

                          return (
                            <TableRow 
                              key={log.id} 
                              className={cn(
                                "group border-b border-border/30 transition-all duration-200 cursor-default",
                                rowBorderClass,
                                rowBgClass
                              )}
                            >
                              <TableCell className="py-3.5 sm:py-4 pl-4 sm:pl-6 font-mono text-xs text-muted-foreground whitespace-nowrap">
                                <div className="flex flex-col gap-0.5">
                                  <span className="font-semibold text-foreground/85 text-[11px] sm:text-xs">{dateStr}</span>
                                  <span className="text-[10px] sm:text-[11px] text-muted-foreground/80 flex items-center gap-1.5 font-medium">
                                    <span className={cn(
                                      "w-1.5 h-1.5 rounded-full animate-pulse shrink-0",
                                      isIntake && "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]",
                                      isWtp && "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]",
                                      isOht && "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"
                                    )} />
                                    {timeStr}
                                  </span>
                                  {log.received_at && <span className="text-[9px] text-muted-foreground">Received {format(new Date(log.received_at), 'HH:mm:ss')}</span>}
                                </div>
                              </TableCell>
                              <TableCell className="py-3.5 sm:py-4 whitespace-nowrap">
                                {isWtp && (
                                  <span className="inline-flex items-center px-2.5 py-1 text-xs font-bold rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 backdrop-blur-sm shadow-sm uppercase tracking-wide">
                                    <WtpSvg className="h-3.5 w-3.5 mr-1.5 text-amber-500 dark:text-amber-400" />
                                    WTP
                                  </span>
                                )}
                                {isIntake && (
                                  <span className="inline-flex items-center px-2.5 py-1 text-xs font-bold rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20 backdrop-blur-sm shadow-sm uppercase tracking-wide">
                                    <IntakeWellSvg className="h-3.5 w-3.5 mr-1.5 text-blue-500 dark:text-blue-400" />
                                    Intake
                                  </span>
                                )}
                                {isOht && (
                                  <span className="inline-flex items-center px-2.5 py-1 text-xs font-bold rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 backdrop-blur-sm shadow-sm uppercase tracking-wide">
                                    <OhtSvg className="h-3.5 w-3.5 mr-1.5 text-emerald-500 dark:text-emerald-400" />
                                    {displaySection}
                                  </span>
                                )}
                                {!isWtp && !isIntake && !isOht && (
                                  <Badge variant="outline" className="text-xs uppercase tracking-wide flex items-center">
                                    {getSectionIcon(log.section)}
                                    <span className="ml-1">{log.section.toUpperCase()}</span>
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="py-3.5 sm:py-4 font-semibold text-foreground/90 pl-3 sm:pl-4">
                                <div className="flex items-center gap-2.5 sm:gap-3">
                                  <div className={cn(
                                    "p-1.5 sm:p-2 rounded-xl border flex items-center justify-center transition-all duration-300 group-hover:scale-110 shrink-0",
                                    iconBorderClass
                                  )}>
                                    {getSensorIcon(log.tag_id, log.tag_config?.label || '')}
                                  </div>
                                  <span className={cn(
                                    "text-xs sm:text-sm tracking-wide text-foreground/90 font-bold transition-colors duration-200 truncate max-w-[200px] sm:max-w-none",
                                    hoverColorClass
                                  )}>
                                    {log.tag_config?.label || log.tag_id}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="text-right pr-4 sm:pr-6 py-3.5 sm:py-4 whitespace-nowrap">
                                {isPump ? (
                                  Number(log.value) >= 1 ? (
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.25)] relative animate-pulse">
                                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                                      ON
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 shadow-inner">
                                      <span className="h-2 w-2 rounded-full bg-rose-500/50" />
                                      OFF
                                    </span>
                                  )
                                ) : (
                                  <span className={cn(
                                    "inline-flex items-center px-2.5 sm:px-3 py-1 rounded-xl font-mono font-black text-xs sm:text-sm tracking-wider shadow-sm border backdrop-blur-[2px]",
                                    normalizedLabel.includes('level') || normalizedLabel.includes(' rlt') || normalizedLabel.includes('-lt')
                                      ? "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20 shadow-sky-500/5"
                                      : normalizedLabel.includes('pressure') || normalizedLabel.includes('-pt')
                                      ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20 shadow-purple-500/5"
                                      : normalizedLabel.includes('flow') || normalizedLabel.includes('-ft') || normalizedLabel.includes('totalizer')
                                      ? "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20 shadow-cyan-500/5"
                                      : normalizedLabel.includes('ph')
                                      ? "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20 shadow-teal-500/5"
                                      : normalizedLabel.includes('temp') || normalizedLabel.includes('-tem') || normalizedLabel.includes('°c')
                                      ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 shadow-rose-500/5"
                                      : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 shadow-amber-500/5"
                                  )}>
                                    {Number(log.value).toFixed(2)}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="pl-2 sm:pl-4 py-3.5 sm:py-4 whitespace-nowrap">
                                {log.tag_config?.unit ? (
                                  <span className="inline-flex items-center bg-secondary/50 dark:bg-secondary/20 text-muted-foreground/80 px-2 py-0.5 rounded border border-border/40 text-[10px] font-bold uppercase tracking-wider">
                                    {log.tag_config.unit}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground/30">-</span>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
                {paginationInfo && (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4 mt-4 sm:mt-6 pt-4 border-t border-border/40">
                    <div className="flex items-center justify-between sm:justify-start w-full sm:w-auto gap-3 flex-wrap">
                      <div className="text-xs sm:text-sm text-muted-foreground font-medium">
                        Showing <span className="font-semibold text-foreground">{paginationInfo.from}</span> - <span className="font-semibold text-foreground">{paginationInfo.to}</span> of <span className="font-semibold text-foreground">{totalCount.toLocaleString()}</span> records
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground font-medium">Rows:</span>
                        <Select
                          value={String(pageSize)}
                          onValueChange={(v) => { 
                            const newSize = Number(v); 
                            setPageSizeOverride(newSize); 
                            setCurrentPage(1); 
                            fetchLogs(1, newSize); 
                          }}
                        >
                          <SelectTrigger className="h-8 w-[84px] text-xs font-semibold">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="z-[100]">
                            {[25, 50, 100, 200, 500].map(n => (
                              <SelectItem key={n} value={String(n)} className="text-xs font-medium">{n}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex items-center justify-center gap-1 sm:gap-1.5 w-full sm:w-auto overflow-x-auto py-1">
                      <Button 
                        variant="outline" 
                        size="icon" 
                        className="h-8 w-8 rounded-lg border-border/50 hover:bg-secondary transition-all shrink-0"
                        onClick={() => handlePageChange(1)} 
                        disabled={currentPage === 1 || isLoading || totalPages <= 1}
                        title="First page"
                      >
                        <ChevronsLeft className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="outline" 
                        size="icon" 
                        className="h-8 w-8 rounded-lg border-border/50 hover:bg-secondary transition-all shrink-0"
                        onClick={() => handlePageChange(currentPage - 1)} 
                        disabled={currentPage === 1 || isLoading || totalPages <= 1}
                        title="Previous page"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      {paginationInfo.pages.map(page => (
                        <Button 
                          key={page} 
                          variant={currentPage === page ? 'default' : 'outline'} 
                          className={cn(
                            "h-8 min-w-[32px] sm:min-w-[36px] px-2 rounded-lg transition-all text-xs shrink-0",
                            currentPage === page 
                              ? "bg-primary text-primary-foreground hover:bg-primary/95 shadow-md shadow-primary/15 font-bold" 
                              : "border-border/50 hover:bg-secondary font-medium"
                          )}
                          onClick={() => handlePageChange(page)} 
                          disabled={isLoading || (currentPage === page && totalPages <= 1)}
                        >
                          {page}
                        </Button>
                      ))}
                      <Button 
                        variant="outline" 
                        size="icon" 
                        className="h-8 w-8 rounded-lg border-border/50 hover:bg-secondary transition-all shrink-0"
                        onClick={() => handlePageChange(currentPage + 1)} 
                        disabled={currentPage === totalPages || isLoading || totalPages <= 1}
                        title="Next page"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="outline" 
                        size="icon" 
                        className="h-8 w-8 rounded-lg border-border/50 hover:bg-secondary transition-all shrink-0"
                        onClick={() => handlePageChange(totalPages)} 
                        disabled={currentPage === totalPages || isLoading || totalPages <= 1}
                        title="Last page"
                      >
                        <ChevronsRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </main>
      <StatusBar />
      <ExportProgressDialog state={exportProgress} />
    </div>
  );
};

export default HistoryPage;

interface ExportProgressState {
  open: boolean;
  phase: 'estimating' | 'fetching' | 'building' | 'done';
  fetched: number;
  total: number;
  estSec: number;
  startedAt: number;
}

const ExportProgressDialog: React.FC<{ state: ExportProgressState }> = ({ state }) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!state.open) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [state.open]);

  const elapsedSec = state.startedAt ? (now - state.startedAt) / 1000 : 0;
  const pct = state.total > 0 ? Math.min(99, Math.round((state.fetched / state.total) * 100)) : 0;
  const displayPct = state.phase === 'done' ? 100 : state.phase === 'building' ? Math.max(pct, 95) : pct;

  // Recompute ETA from actual throughput once we have samples
  let remainSec = Math.max(0, state.estSec - elapsedSec);
  if (state.fetched > 50 && state.total > 0 && state.phase === 'fetching') {
    const rate = state.fetched / Math.max(0.5, elapsedSec);
    remainSec = Math.max(0, (state.total - state.fetched) / Math.max(1, rate));
  }
  const formatSec = (s: number) => s < 60 ? `${Math.ceil(s)}s` : `${Math.floor(s / 60)}m ${Math.ceil(s % 60)}s`;

  const phaseLabel: Record<ExportProgressState['phase'], string> = {
    estimating: '🔍 Estimating size…',
    fetching: '📥 Fetching data',
    building: '🎨 Building Excel file',
    done: '✅ Done',
  };

  return (
    <Dialog open={state.open}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-emerald-500" />
            Exporting to Excel
          </DialogTitle>
          <DialogDescription>
            {state.phase === 'estimating'
              ? 'Calculating how much data needs to be exported…'
              : `${state.fetched.toLocaleString()} of ${state.total.toLocaleString()} records`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <Progress value={displayPct} className="h-2" />
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-foreground">{phaseLabel[state.phase]}</span>
            <span className="font-mono text-muted-foreground">{displayPct}%</span>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <div className="rounded-lg border border-border/40 bg-muted/30 p-2.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Approx. time</div>
              <div className="text-sm font-bold text-foreground mt-0.5">
                {state.estSec ? `~${formatSec(state.estSec)}` : '—'}
              </div>
            </div>
            <div className="rounded-lg border border-border/40 bg-muted/30 p-2.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                {state.phase === 'done' ? 'Elapsed' : 'Remaining'}
              </div>
              <div className="text-sm font-bold text-foreground mt-0.5">
                {state.phase === 'done' ? formatSec(elapsedSec) : (state.phase === 'fetching' ? formatSec(remainSec) : '…')}
              </div>
            </div>
          </div>
          {state.phase === 'fetching' && state.total > 5000 && (
            <p className="text-[11px] text-muted-foreground text-center">
              Tip: larger date ranges take longer — please keep this tab open.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
