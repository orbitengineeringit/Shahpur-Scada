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
import { logError, logWarn } from '@/lib/errorLogger';
import { readArchiveHistory, readArchivePage, resolveHistorianDates, type DateWindow } from '@/lib/historianArchiveClient';
import { ALL_SENSORS } from '@/config/shahpurSensors';
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

// Sensors not installed at Shahpur plant (WTP only has 2 HT Pumps; Shahpur only has 2 OHTs — legacy OHT-3/4 from Mohgaon excluded)
const UNINSTALLED_TAG_IDS = [
  'WTP-Pump3', 'WTP-Pump4', 'WTP-PT3', 'WTP-PT4', 'WTP-CombinedPT1', 'WTP-CombinedPT2', 'WTP-KW', 'INT-KW',
  'OHT3-PT', 'OHT3-PT1', 'OHT3-PT2', 'OHT3-LT', 'OHT3-Flow', 'OHT3-Flow-IN', 'OHT3-Flow-OUT', 'OHT3-Totalizer', 'OHT3-DecrTotalizer', 'OHT3-FCV', 'OHT3-EFM1-1', 'OHT3-EFM2-1', 'OHT3-EFM2-2', 'OHT3-LEVEL', 'OHT3-PT-1',
  'OHT4-PT', 'OHT4-PT1', 'OHT4-PT2', 'OHT4-LT', 'OHT4-Flow', 'OHT4-Flow-IN', 'OHT4-Flow-OUT', 'OHT4-Totalizer', 'OHT4-DecrTotalizer', 'OHT4-FCV', 'OHT4-LEVEL', 'OHT4-PT-1',
];
const UNINSTALLED_TAGS_FILTER = `("${UNINSTALLED_TAG_IDS.join('","')}")`;

const archiveHistoryFilters = (assets: AssetFilter[]) => ({
  assets, excludeTagIds: UNINSTALLED_TAG_IDS, snapshotsOnly: true,
});

export const isLegacyMohgaonTag = (tagId: string): boolean => {
  const t = (tagId || '').toUpperCase();
  return (
    (t.startsWith('OHT') && !t.startsWith('OHT1') && !t.startsWith('OHT-1') && !t.startsWith('OHT2') && !t.startsWith('OHT-2')) ||
    t.includes('WARD') ||
    t.includes('MOHGAON') ||
    t.includes('MOH_')
  );
};

export const matchesSelectedAssets = (log: { tag_id: string; section?: string }, assets: AssetFilter[]): boolean => {
  if (isLegacyMohgaonTag(log.tag_id)) return false;
  const tid = (log.tag_id || '').toUpperCase();
  if (assets.includes('all')) {
    if (log.section?.toLowerCase() === 'oht' || tid.startsWith('OHT')) {
      return tid.startsWith('OHT1') || tid.startsWith('OHT-1') || tid.startsWith('OHT2') || tid.startsWith('OHT-2');
    }
    return true;
  }
  return assets.some(a => {
    if (a === 'intake') return log.section?.toLowerCase() === 'intake' || log.tag_id.startsWith('INT-');
    if (a === 'wtp') return log.section?.toLowerCase() === 'wtp' || log.tag_id.startsWith('WTP-');
    if (a === 'oht-1') return (log.section?.toLowerCase() === 'oht' || log.tag_id.startsWith('OHT')) && (log.tag_id.startsWith('OHT1-') || log.tag_id.startsWith('OHT1'));
    if (a === 'oht-2') return (log.section?.toLowerCase() === 'oht' || log.tag_id.startsWith('OHT')) && (log.tag_id.startsWith('OHT2-') || log.tag_id.startsWith('OHT2'));
    return false;
  });
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const applyAssetFiltersToQuery = (query: any, assets: AssetFilter[]) => {
  if (assets.includes('all')) return query;

  const hasIntake = assets.includes('intake');
  const hasWtp = assets.includes('wtp');
  const hasOht1 = assets.includes('oht-1');
  const hasOht2 = assets.includes('oht-2');

  const conditions: string[] = [];
  if (hasIntake) conditions.push('section.eq.intake');
  if (hasWtp) conditions.push('section.eq.wtp');
  if (hasOht1) conditions.push('tag_id.like.OHT1-%');
  if (hasOht2) conditions.push('tag_id.like.OHT2-%');

  if (conditions.length === 1) {
    if (hasIntake) return query.eq('section', 'intake');
    if (hasWtp) return query.eq('section', 'wtp');
    if (hasOht1) return query.like('tag_id', 'OHT1-%');
    if (hasOht2) return query.like('tag_id', 'OHT2-%');
  } else if (conditions.length > 1) {
    if (hasIntake && hasWtp && !hasOht1 && !hasOht2) {
      return query.in('section', ['intake', 'wtp']);
    }
    return query.or(conditions.join(','));
  }
  return query;
};

/** Derive a sub-section label like OHT-1 / OHT-2 from a tag_id (e.g. "OHT1-LT"). */
const getDisplaySection = (section: string, tagId: string): string => {
  const sec = section.toLowerCase();
  if (sec === 'oht') {
    const m = tagId.match(/^OHT[-_\s]*([0-9]+)/i);
    if (m) {
      const num = m[1];
      if (num === '1') return 'OHT - 1 Bus Station';
      if (num === '2') return 'OHT - 2';
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

export interface ExportProgressState {
  open: boolean;
  phase: 'estimating' | 'fetching' | 'building' | 'done';
  fetched: number;
  total: number;
  buildCurrent: number;
  buildTotal: number;
  estSec: number;
  startedAt: number;
}

/** Network retry helper with exponential backoff and jitter */
async function fetchWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 600
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      if (attempt === maxRetries) break;
      const delay = baseDelayMs * Math.pow(1.8, attempt) + Math.random() * 200;
      await new Promise(res => setTimeout(res, delay));
    }
  }
  throw lastError;
}

const historySensors = new Map(ALL_SENSORS.map(sensor => [sensor.id, sensor]));

export function describeHistoryReading(log: HistorianLog, sensor = historySensors.get(log.tag_id)) {
  const isFeedback = sensor?.mqttKey?.endsWith('_FB') || /^WTP-Trip[12]$/.test(log.tag_id);
  const feedback = isFeedback ? (sensor?.instrumentType === 'valve' ? 'Valve feedback' : 'Drive feedback') : undefined;
  const label = log.tag_config?.label || sensor?.label || log.tag_id;
  const normalized = (label + ' ' + log.tag_id).toLowerCase();
  let sensorType = 'Other';
  if (feedback) sensorType = feedback;
  else if (sensor?.instrumentType === 'pt' || sensor?.instrumentType === 'combined_pt') sensorType = 'Pressure';
  else if (normalized.includes('pump')) sensorType = 'Pump';
  else if (normalized.includes('level') || normalized.includes('-lt')) sensorType = 'Level';
  else if (normalized.includes('pressure') || normalized.includes('-pt')) sensorType = 'Pressure';
  else if (normalized.includes('totalizer')) sensorType = 'Totalizer';
  else if (normalized.includes('flow') || normalized.includes('-ft')) sensorType = 'Flow';
  else if (normalized.includes('ph')) sensorType = 'pH';
  else if (normalized.includes('turbidity')) sensorType = 'Turbidity';
  else if (normalized.includes('chlorine')) sensorType = 'Chlorine';
  else if (normalized.includes('kw') || normalized.includes('energy')) sensorType = 'Energy';

  const valueOut = log.value == null ? '—' : sensor?.type === 'digital' && !isFeedback
    ? (log.value === 1 ? 'ON' : 'OFF') : Number(log.value);
  return { label, sensorType, valueOut };
}

/** Fail-safe clean CSV download fallback if browser runs out of memory on astronomical datasets */
function downloadCsvFallback(rows: HistorianLog[], fileName: string, plant: string) {
  const header = ['Reading timestamp (source)', 'Section', 'Sensor Type', 'Label / Tag', 'Value', 'Unit', 'Received timestamp (source)', 'Saved value'];
  const lines: string[] = [
    `# Plant: ${plant || 'SCADA'} - Historical Data Export\r\n`,
    header.join(',') + '\r\n',
  ];
  for (let i = 0; i < rows.length; i++) {
    const log = rows[i];
    if (!log) continue;
    const { label, sensorType, valueOut } = describeHistoryReading(log);
    const [ts, rec, savedValue] = historyExportSourceFields(log);
    const sec = getDisplaySection(log.section, log.tag_id);
    const safeLabel = `"${String(label).replace(/"/g, '""')}"`;
    const safeUnit = `"${String(log.tag_config?.unit || '').replace(/"/g, '""')}"`;
    lines.push(`${ts},"${sec}",${sensorType},${safeLabel},${valueOut},${safeUnit},${rec},${savedValue}\r\n`);
  }
  const blob = new Blob(lines, { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName.replace(/\.xlsx$/i, '.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

function historyExportSourceFields(log: Pick<HistorianLog, 'timestamp' | 'received_at' | 'value'>): [string, string, string] {
  return [log.timestamp, log.received_at ?? '', log.value == null ? '' : String(log.value)];
}

interface HistorianLog {
  id: string;
  tag_id: string;
  section: string;
  value: number | null;
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
  const [exportProgress, setExportProgress] = useState<ExportProgressState>({
    open: false,
    phase: 'estimating',
    fetched: 0,
    total: 0,
    buildCurrent: 0,
    buildTotal: 0,
    estSec: 0,
    startedAt: 0,
  });
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [exportInterval, setExportInterval] = useState<ExportInterval>('all');
  const [pageSizeOverride, setPageSizeOverride] = useState<number | null>(null);
  const autoRefreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { toast } = useToast();
  const { plantName } = useScada();

  const pageSize = pageSizeOverride ?? PAGE_SIZES[globalFilters.density];
  const totalPages = Math.ceil(totalCount / pageSize);

  const fetchLogs = useCallback(async (page: number = 1, sizeOverride?: number) => {
    if (!globalFilters.startDate || !globalFilters.endDate) {
      toast({ title: 'Select Date Range', description: 'Please select both start and end dates.', variant: 'destructive' });
      return;
    }

    // Cancel any in-flight request
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    try {
      const startTime = startOfDay(globalFilters.startDate).toISOString();
      const endTime = new Date(endOfDay(globalFilters.endDate).getTime() + 1).toISOString();
      const windows = await resolveHistorianDates(startTime, endTime, controller.signal);
      const currentSize = sizeOverride ?? pageSize;
      const offset = (page - 1) * currentSize;
      let total = 0;
      const rows: HistorianLog[] = [];
      for (const window of windows.reverse()) {
        const from = Math.max(0, offset - total);
        const limit = currentSize - rows.length;
        if (window.archived) {
          const result = await readArchiveHistory(window, archiveHistoryFilters(globalFilters.assets), from, limit, controller.signal);
          total += result.count;
          rows.push(...result.rows.map(row => ({ ...row, section: row.section ?? '', tag_config: null })));
          continue;
        }
        const countQuery = supabase.from('historian_logs').select('*', { count: 'exact', head: true })
          .gte('timestamp', window.start).lt('timestamp', window.end)
          .not('tag_id', 'in', UNINSTALLED_TAGS_FILTER).or('source.like.%5min%,source.is.null')
          .abortSignal(controller.signal);
        const dataQuery = supabase.from('historian_logs')
          .select('id, tag_id, section, value, timestamp, received_at, tag_config:tag_config_id (label, unit)')
          .gte('timestamp', window.start).lt('timestamp', window.end)
          .not('tag_id', 'in', UNINSTALLED_TAGS_FILTER).or('source.like.%5min%,source.is.null')
          .order('timestamp', { ascending: false }).order('section').order('tag_id').order('id')
          .range(from, from + Math.max(1, limit) - 1).abortSignal(controller.signal);
        const [countResult, dataResult] = await Promise.all([
          applyAssetFiltersToQuery(countQuery, globalFilters.assets),
          limit > 0 ? applyAssetFiltersToQuery(dataQuery, globalFilters.assets) : null,
        ]);
        if (countResult.error) throw countResult.error;
        if (dataResult?.error) throw dataResult.error;
        total += countResult.count ?? 0;
        rows.push(...(dataResult?.data ?? []) as HistorianLog[]);
      }
      if (controller.signal.aborted) return;
      setTotalCount(total);
      const filteredData = rows.filter(log => matchesSelectedAssets(log, globalFilters.assets));
      const sorted = [...filteredData].sort((a, b) => {
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
    } catch (error: unknown) {
      if (controller.signal.aborted) return;
      logError('History.fetchLogs', error);
      toast({ title: 'Error', description: 'Failed to fetch historical data.', variant: 'destructive' });
    } finally {
      if (abortControllerRef.current === controller) setIsLoading(false);
    }
  }, [globalFilters.startDate, globalFilters.endDate, globalFilters.assets, pageSize, toast]);

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
    setExportProgress({
      open: true,
      phase: 'estimating',
      fetched: 0,
      total: 0,
      buildCurrent: 0,
      buildTotal: 0,
      estSec: 0,
      startedAt,
    });

    try {
      const startMs = startOfDay(globalFilters.startDate).getTime();
      const endMs = endOfDay(globalFilters.endDate).getTime() + 1;
      const windows = await resolveHistorianDates(new Date(startMs).toISOString(), new Date(endMs).toISOString());
      const archiveFilters = archiveHistoryFilters(globalFilters.assets);

      // 1. Pre-fetch tag configs and merge with static sensors
      // Eliminates expensive nested PostgREST joins on 100k+ rows
      const staticMap = new Map<string, { label: string; unit: string }>(
        ALL_SENSORS.map(s => [s.id, { label: s.label, unit: s.unit }])
      );
      const tagConfigMap = new Map<string, { label: string; unit: string }>();
      try {
        const { data: tagConfigs } = await supabase
          .from('tag_config')
          .select('id, tag_id, label, unit');
        if (tagConfigs) {
          for (const tc of tagConfigs) {
            if (tc.tag_id) tagConfigMap.set(tc.tag_id, { label: tc.label || tc.tag_id, unit: tc.unit || '' });
            if (tc.id) tagConfigMap.set(tc.id, { label: tc.label || tc.tag_id, unit: tc.unit || '' });
          }
        }
      } catch (tcErr) {
        logWarn('History.exportExcel', 'Failed to pre-fetch tag_config map, falling back to static sensor config', tcErr);
      }

      const getLabelAndUnit = (tagId: string, tagConfigId?: string | null) => {
        const fromDb = (tagConfigId && tagConfigMap.get(tagConfigId)) || tagConfigMap.get(tagId);
        if (fromDb) return fromDb;
        const fromStatic = staticMap.get(tagId);
        if (fromStatic) return fromStatic;
        return { label: tagId, unit: '' };
      };

      // 2. Count & Estimate Phase (with retry & asset-aware fallback estimation)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const applyFilters = (q: any, window: DateWindow) => {
        const r = q.gte('timestamp', window.start).lt('timestamp', window.end)
          .not('tag_id', 'in', UNINSTALLED_TAGS_FILTER)
          .or('source.like.%5min%,source.is.null');
        return applyAssetFiltersToQuery(r, globalFilters.assets);
      };

      let totalCountVal = 0;
      try {
        const liveCounts = await Promise.all(windows.filter(window => !window.archived).map(async window => {
          const { count, error: countErr } = await fetchWithRetry(async () => await applyFilters(
            supabase.from('historian_logs').select('*', { count: 'exact', head: true }), window,
          ), 2, 500);
          if (countErr) throw countErr;
          return count ?? 0;
        }));
        totalCountVal = liveCounts.reduce((sum, count) => sum + count, 0);
        for (const archive of windows.filter(window => window.archived)) {
          const archiveDays = (Date.parse(archive.end) - Date.parse(archive.start)) / 86400_000;
          const tags = ALL_SENSORS.filter(sensor =>
            !sensor.notInstalled && matchesSelectedAssets({ tag_id: sensor.id, section: sensor.section }, globalFilters.assets)
          ).length;
          totalCountVal += Math.ceil(archiveDays * Math.max(1, tags) * 288);
        }
      } catch (countErr) {
        logWarn('History.exportExcel', 'Exact count failed or timed out, estimating total rows', countErr);
        const days = Math.max(1, Math.ceil((endMs - startMs) / (24 * 3600 * 1000)));
        const tagMultiplier = ALL_SENSORS.filter(sensor =>
          !sensor.notInstalled && matchesSelectedAssets({ tag_id: sensor.id, section: sensor.section }, globalFilters.assets)
        ).length;
        totalCountVal = days * tagMultiplier * 288;
      }

      if (totalCountVal === 0) {
        setExportProgress(p => ({ ...p, open: false }));
        toast({ title: 'No Records', description: 'No data to export for the selected range.' });
        return;
      }

      const estSec = Math.max(3, Math.ceil(totalCountVal / 3500));
      setExportProgress(p => ({
        ...p,
        phase: 'fetching',
        total: totalCountVal,
        estSec,
      }));

      // 3. Time-Slice Partitioning:
      // Break the date range into 1-day (24h) windows.
      // In PostgreSQL, querying a 1-day slice keeps maximum offset < 10,000 rows,
      // completely eliminating deep-offset (OFFSET 80,000+) degradation and statement timeouts!
      const SLICE_DURATION_MS = 24 * 60 * 60 * 1000;
      type TimeSlice = DateWindow & { archived: boolean };

      const slices: TimeSlice[] = [];
      for (const window of windows.reverse()) {
        const from = Date.parse(window.start);
        for (let t = Date.parse(window.end); t > from; t -= SLICE_DURATION_MS) {
          const start = new Date(Math.max(from, t - SLICE_DURATION_MS)).toISOString();
          slices.push({ start, end: new Date(t).toISOString(), archived: window.archived });
        }
      }

      // 4. Fetch matching readings in parallel, keyed by their original database ID.
      const reportSortBucketMs = 5 * 60 * 1000;
      const exportedReadings = new Map<string, HistorianLog>();
      let fetchedSoFar = 0;
      let nextSliceIdx = 0;
      const SLICE_CONCURRENCY = 3;

      const sliceWorker = async () => {
        while (true) {
          const sliceIdx = nextSliceIdx++;
          if (sliceIdx >= slices.length) return;
          const slice = slices[sliceIdx];
          const pageSize = slice.archived ? 3000 : 1000;

          let offset = 0;
          while (true) {
            const from = offset;
            const to = from + pageSize - 1;
            let hasMoreArchiveRows = false;

            const pageRows = await fetchWithRetry(async () => {
              if (slice.archived) {
                const result = await readArchivePage({ start: slice.start, end: slice.end,
                  ...archiveFilters, offset: from, limit: pageSize });
                if (result.rows.length !== Math.min(pageSize, Math.max(0, result.count - from))) {
                  throw new Error('Incomplete archive export page');
                }
                hasMoreArchiveRows = from + result.rows.length < result.count;
                return result.rows;
              }
              let q = supabase
                .from('historian_logs')
                .select('id, tag_id, section, value, timestamp, received_at, tag_config_id')
                .gte('timestamp', slice.start).lt('timestamp', slice.end)
                .not('tag_id', 'in', UNINSTALLED_TAGS_FILTER)
                .or('source.like.%5min%,source.is.null')
                .order('timestamp', { ascending: false })
                .order('tag_id', { ascending: true })
                .order('id', { ascending: true })
                .range(from, to);

              q = applyAssetFiltersToQuery(q, globalFilters.assets);
              const { data, error } = await q;
              if (error) throw error;
              return data || [];
            }, slice.archived ? 1 : 3, 500);

            if (!pageRows || pageRows.length === 0) break;

            for (let r = 0; r < pageRows.length; r++) {
              const raw = pageRows[r];
              if (!matchesSelectedAssets({ ...raw, section: raw.section ?? '' }, globalFilters.assets)) continue;

              const cfg = getLabelAndUnit(raw.tag_id, raw.tag_config_id);
              const log: HistorianLog = {
                id: raw.id,
                tag_id: raw.tag_id,
                section: raw.section ?? '',
                value: raw.value,
                timestamp: raw.timestamp,
                received_at: raw.received_at,
                tag_config: cfg,
              };

              exportedReadings.set(log.id, log);
            }

            fetchedSoFar += pageRows.length;
            setExportProgress(p => ({
              ...p,
              fetched: fetchedSoFar,
              total: Math.max(p.total, fetchedSoFar),
            }));

            if (slice.archived ? !hasMoreArchiveRows : pageRows.length < pageSize) break;
            offset += pageSize;
          }
        }
      };

      await Promise.all(
        Array.from({ length: Math.min(SLICE_CONCURRENCY, slices.length) }, () => sliceWorker())
      );

      // 5. Asset Filtering & Interval Downsampling
      let processed = Array.from(exportedReadings.values());
      exportedReadings.clear();

      if (exportInterval !== 'all') {
        const bucketMs = INTERVAL_MS[exportInterval];
        const latestByBucket = new Map<string, HistorianLog>();
        for (const log of processed) {
          const t = new Date(log.timestamp).getTime();
          const bucket = Math.floor(t / bucketMs);
          const key = `${log.section}|${log.tag_id}|${bucket}`;
          const existing = latestByBucket.get(key);
          if (!existing || new Date(existing.timestamp).getTime() < t) {
            latestByBucket.set(key, log);
          }
        }
        processed = Array.from(latestByBucket.values());
      }

      // Sort: timestamp descending, section order, tag_id
      // Pre-calculate bucketTs and section order for lightning-fast sort without millions of Date allocations
      const processedWithSortKeys = processed.map(log => ({
        log,
        bucketTs: Math.floor(new Date(log.timestamp).getTime() / reportSortBucketMs),
        secOrder: getSectionOrder(log.section, log.tag_id),
      }));

      processedWithSortKeys.sort((a, b) => {
        if (a.bucketTs !== b.bucketTs) return b.bucketTs - a.bucketTs;
        if (a.secOrder !== b.secOrder) return a.secOrder - b.secOrder;
        return a.log.tag_id.localeCompare(b.log.tag_id);
      });

      processed = processedWithSortKeys.map(x => x.log);

      const exportCount = processed.length;
      if (exportCount === 0) {
        setExportProgress(p => ({ ...p, open: false }));
        toast({ title: 'No Records', description: 'No data to export after applying filters.' });
        return;
      }

      const intervalSuffix = exportInterval === 'all' ? '' : `_${exportInterval}`;
      const fileStart = format(globalFilters.startDate!, 'd MMM yyyy');
      const fileEnd = format(globalFilters.endDate!, 'd MMM yyyy');
      const safePlant = (plantName || 'SCADA').replace(/[\\/:*?"<>|]/g, '');
      const downloadFileName = `${safePlant} Scada History ${fileStart} to ${fileEnd}${intervalSuffix}.xlsx`;

      // 6. Excel Row Limit & Memory Guard (Excel hard limit is 1,048,576 rows per worksheet)
      if (exportCount > 1000000) {
        setExportProgress(p => ({
          ...p,
          phase: 'building',
          buildCurrent: exportCount,
          buildTotal: exportCount,
        }));
        downloadCsvFallback(processed, downloadFileName, plantName);
        setExportProgress(p => ({ ...p, phase: 'done' }));
        setTimeout(() => setExportProgress(p => ({ ...p, open: false })), 1200);
        toast({
          title: 'Exported as CSV (Excel Row Limit)',
          description: `Dataset has ${exportCount.toLocaleString()} records (>10 lakh Excel limit) and was cleanly exported as CSV.`,
        });
        return;
      }

      // 7. Memory-Optimized Excel Generation
      setExportProgress(p => ({
        ...p,
        phase: 'building',
        buildCurrent: 0,
        buildTotal: exportCount,
      }));

      const wb = new ExcelJS.Workbook();
      wb.creator = plantName;
      wb.created = new Date();
      const ws = wb.addWorksheet('Historical Records', {
        views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
      });

      ws.columns = [
        { key: 'ts', width: 36 },
        { key: 'section', width: 16 },
        { key: 'sensor', width: 14 },
        { key: 'label', width: 32 },
        { key: 'value', width: 14 },
        { key: 'unit', width: 10 },
        { key: 'received', width: 36 },
        { key: 'savedValue', width: 24 },
      ];

      // Row 1: Title banner
      ws.mergeCells('A1:H1');
      const titleCell = ws.getCell('A1');
      titleCell.value = `💧  ${plantName.toUpperCase()}  —  HISTORICAL RECORDS`;
      titleCell.font = { name: 'Segoe UI', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E7490' } };
      ws.getRow(1).height = 38;

      // Row 2: Info banner
      ws.mergeCells('A2:H2');
      const infoCell = ws.getCell('A2');
      const startStr = format(globalFilters.startDate, 'd MMM yyyy');
      const endStr = format(globalFilters.endDate, 'd MMM yyyy');
      const genStr = format(new Date(), 'd MMM yyyy HH:mm');
      let actualStr = '';
      if (processed.length > 0) {
        let minTimestamp = Infinity;
        let maxTimestamp = -Infinity;
        for (const log of processed) {
          const timestamp = new Date(log.timestamp).getTime();
          if (timestamp < minTimestamp) minTimestamp = timestamp;
          if (timestamp > maxTimestamp) maxTimestamp = timestamp;
        }
        const minT = new Date(minTimestamp);
        const maxT = new Date(maxTimestamp);
        const aS = format(minT, 'd MMM yyyy');
        const aE = format(maxT, 'd MMM yyyy');
        if (aS !== startStr || aE !== endStr) {
          actualStr = `  •  📂 Data Available: ${aS}  →  ${aE}`;
        }
      }
      const recordsStr = exportInterval === 'all'
        ? `📊 Records: ${exportCount.toLocaleString()}`
        : `📊 ${exportCount.toLocaleString()} records  •  Interval: ${INTERVAL_LABEL[exportInterval]}`;
      infoCell.value = `📅 Selected: ${startStr}  →  ${endStr}${actualStr}     ${recordsStr}     🕒 Generated: ${genStr}`;
      infoCell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF1F2937' } };
      infoCell.alignment = { horizontal: 'center', vertical: 'middle' };
      infoCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF9C3' } };
      ws.getRow(2).height = 26;

      // Row 3: Spacer
      ws.getRow(3).height = 6;

      // Row 4: Header
      const headerRow = ws.getRow(4);
      const headers = ['Reading timestamp (source)', '🏭  Section', '🔧  Sensor Type', '🏷  Label / Tag', '📈  Value', '⚠  Unit', 'Received timestamp (source)', 'Saved value'];
      const headerColors = ['FF2563EB', 'FFDC2626', 'FF7C3AED', 'FF059669', 'FFEA580C', 'FFCA8A04', 'FF0891B2', 'FF60A5FA'];
      headers.forEach((h, i) => {
        const c = headerRow.getCell(i + 1);
        c.value = h;
        c.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: headerColors[i] } };
        c.alignment = { horizontal: i === 4 ? 'right' : 'left', vertical: 'middle' };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF064E3B' } };
        c.border = {
          top: { style: 'thin', color: { argb: 'FF334155' } },
          bottom: { style: 'medium', color: { argb: 'FF334155' } },
        };
      });
      headerRow.height = 26;
      ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: 8 } };

      // Shared style constants (reused by reference across all rows)
      const STYLES = {
        fontBase: { name: 'Segoe UI', size: 10, color: { argb: 'FF1F2937' } },
        fontNum: { name: 'Consolas', size: 11, bold: true, color: { argb: 'FF111827' } },
        fontPumpOn: { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF059669' } },
        fontPumpOff: { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFDC2626' } },
        fontUnit: { name: 'Segoe UI', size: 9, italic: true, color: { argb: 'FF6B7280' } },
        fontOht: { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF047857' } },
        fontIntake: { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF1D4ED8' } },
        fontWtp: { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFB45309' } },
        fontDefaultSec: { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF334155' } },
        borderHair: { bottom: { style: 'hair' as const, color: { argb: 'FFE5E7EB' } } },
        alignLeft: { vertical: 'middle' as const, horizontal: 'left' as const },
        alignRight: { vertical: 'middle' as const, horizontal: 'right' as const },
        fillOht: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFECFDF5' } },
        fillIntake: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFEFF6FF' } },
        fillWtp: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFFFBEB' } },
        fillEven: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF8FAFC' } },
        fillOdd: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFFFFFF' } },
      };

      const isLargeExport = exportCount > 35000;
      const CHUNK_SIZE = 2000;

      for (let i = 0; i < exportCount; i++) {
        const log = processed[i];
        if (!log) continue;
        const { label, sensorType, valueOut } = describeHistoryReading(log);
        const [sourceTimestamp, sourceReceivedAt, savedValue] = historyExportSourceFields(log);
        const secDisplay = getDisplaySection(log.section, log.tag_id);

        // Add row via array of values (fastest in ExcelJS)
        const row = ws.addRow([
          sourceTimestamp,
          secDisplay,
          sensorType,
          label,
          valueOut,
          log.tag_config?.unit || '',
          sourceReceivedAt,
          savedValue,
        ]);

        const secLower = log.section.toLowerCase();
        const secFont = secLower === 'oht' ? STYLES.fontOht : secLower === 'intake' ? STYLES.fontIntake : secLower === 'wtp' ? STYLES.fontWtp : STYLES.fontDefaultSec;
        const rowFill = secLower === 'oht' ? STYLES.fillOht : secLower === 'intake' ? STYLES.fillIntake : secLower === 'wtp' ? STYLES.fillWtp : (i % 2 === 0 ? STYLES.fillEven : STYLES.fillOdd);

        // Apply fast cell-level styling using shared references
        for (let colIdx = 1; colIdx <= headers.length; colIdx++) {
          const cell = row.getCell(colIdx);
          if (!isLargeExport) {
            cell.fill = rowFill;
          }
          cell.border = STYLES.borderHair;
          cell.alignment = colIdx === 5 ? STYLES.alignRight : STYLES.alignLeft;
          if (colIdx === 2 || colIdx === 3) {
            cell.font = secFont;
          } else if (colIdx === 5) {
            if (typeof valueOut === 'number') {
              cell.numFmt = '#,##0.00#####';
              cell.font = STYLES.fontNum;
            } else {
              cell.font = valueOut === 'ON' ? STYLES.fontPumpOn : STYLES.fontPumpOff;
            }
          } else if (colIdx === 6) {
            cell.font = STYLES.fontUnit;
          } else {
            cell.font = STYLES.fontBase;
          }
        }

        if (i > 0 && i % CHUNK_SIZE === 0) {
          setExportProgress(p => ({
            ...p,
            buildCurrent: i,
            buildTotal: exportCount,
          }));
          await new Promise(r => setTimeout(r, 0));
        }
      }

      setExportProgress(p => ({
        ...p,
        buildCurrent: exportCount,
        buildTotal: exportCount,
      }));
      await new Promise(r => setTimeout(r, 10));

      try {
        const buffer = await wb.xlsx.writeBuffer() as ArrayBuffer;
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = downloadFileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);

        setExportProgress(p => ({ ...p, phase: 'done' }));
        setTimeout(() => setExportProgress(p => ({ ...p, open: false })), 1200);
        toast({
          title: 'Export Complete',
          description: `Exported ${exportCount.toLocaleString()} records to Excel${exportInterval !== 'all' ? ` (${INTERVAL_LABEL[exportInterval]})` : ''}.`,
        });
      } catch (excelErr) {
        logWarn('History.exportExcel', 'ExcelJS buffer generation failed, falling back to clean CSV', excelErr);
        downloadCsvFallback(processed, downloadFileName, plantName);
        setExportProgress(p => ({ ...p, phase: 'done' }));
        setTimeout(() => setExportProgress(p => ({ ...p, open: false })), 1200);
        toast({
          title: 'Downloaded as CSV',
          description: `Large dataset (${exportCount.toLocaleString()} records) exported as CSV for stability.`,
        });
      }
    } catch (error) {
      logError('History.exportExcel', error);
      setExportProgress(p => ({ ...p, open: false }));
      toast({ title: 'Export Failed', description: 'Failed to generate export file. Please try again or select a shorter interval.', variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  }, [globalFilters.startDate, globalFilters.endDate, globalFilters.assets, toast, plantName, exportInterval]);

  const paginationInfo = useMemo(() => {
    if (totalCount === 0 && logs.length === 0) return null;
    const maxVisible = 5;
    const effectiveTotalPages = Math.max(1, totalPages);
    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    const endPage = Math.min(effectiveTotalPages, startPage + maxVisible - 1);
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
            <h2 className="text-lg sm:text-xl md:text-2xl font-bold tracking-tight text-foreground bg-gradient-to-r from-foreground via-foreground/90 to-muted-foreground bg-clip-text text-shadow-glow">Historical Data</h2>
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
                          const historyValue = describeHistoryReading(log).valueOut;
                          const isPump = historyValue === 'ON' || historyValue === 'OFF';
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
                          const fraction = log.timestamp.match(/:\d{2}(\.\d+)/)?.[1] ?? '';
                          const timeStr = format(logDate, 'HH:mm:ss') + fraction;

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
                                  <time dateTime={log.timestamp} title={log.timestamp} className="text-[10px] sm:text-[11px] text-muted-foreground/80 flex items-center gap-1.5 font-medium">
                                    <span className={cn(
                                      "w-1.5 h-1.5 rounded-full animate-pulse shrink-0",
                                      isIntake && "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]",
                                      isWtp && "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]",
                                      isOht && "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"
                                    )} />
                                    {timeStr}
                                  </time>
                                  {log.received_at && <time dateTime={log.received_at} title={log.received_at} className="text-[9px] text-muted-foreground">Received {format(new Date(log.received_at), 'HH:mm:ss')}</time>}
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
                              <TableCell title={log.value == null ? undefined : String(log.value)} className="text-right pr-4 sm:pr-6 py-3.5 sm:py-4 whitespace-nowrap">
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
                                    {historyValue}
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

const ExportProgressDialog: React.FC<{ state: ExportProgressState }> = ({ state }) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!state.open) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [state.open]);

  const elapsedSec = state.startedAt ? (now - state.startedAt) / 1000 : 0;

  // Progress computation:
  // Fetching phase covers 0% to 85%
  // Building phase covers 85% to 99%
  // Done covers 100%
  let displayPct = 0;
  if (state.phase === 'done') {
    displayPct = 100;
  } else if (state.phase === 'building') {
    const buildFraction = state.buildTotal > 0 ? (state.buildCurrent / state.buildTotal) : 0;
    displayPct = Math.min(99, Math.max(85, Math.round(85 + buildFraction * 14)));
  } else if (state.phase === 'fetching') {
    const fetchPct = state.total > 0 ? Math.round((state.fetched / state.total) * 85) : 0;
    displayPct = Math.min(85, Math.max(5, fetchPct));
  } else {
    displayPct = 5;
  }

  // Recompute ETA from actual throughput
  let remainSec = Math.max(0, state.estSec - elapsedSec);
  if (state.fetched > 50 && state.total > 0 && state.phase === 'fetching') {
    const rate = state.fetched / Math.max(0.5, elapsedSec);
    remainSec = Math.max(0, (state.total - state.fetched) / Math.max(1, rate));
  } else if (state.phase === 'building' && state.buildTotal > 0) {
    const buildRate = Math.max(1, state.buildCurrent / Math.max(0.5, elapsedSec));
    remainSec = Math.max(0, (state.buildTotal - state.buildCurrent) / buildRate);
  }

  const formatSec = (s: number) => s < 60 ? `${Math.ceil(s)}s` : `${Math.floor(s / 60)}m ${Math.ceil(s % 60)}s`;

  const phaseLabel: Record<ExportProgressState['phase'], string> = {
    estimating: '🔍 Estimating dataset…',
    fetching: `📥 Fetching data (${displayPct}%)`,
    building: `🎨 Building Excel file (${state.buildCurrent.toLocaleString()} / ${state.buildTotal.toLocaleString()})`,
    done: '✅ Export Complete',
  };

  const getSubDescription = () => {
    if (state.phase === 'estimating') return 'Calculating records for selected date range…';
    if (state.phase === 'fetching') return `${state.fetched.toLocaleString()} of ${state.total.toLocaleString()} records fetched`;
    if (state.phase === 'building') return `Formatting ${state.buildTotal.toLocaleString()} rows into Excel worksheet…`;
    return `${state.buildTotal.toLocaleString()} records exported successfully`;
  };

  return (
    <Dialog open={state.open}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-emerald-500" />
            Exporting Historical Data
          </DialogTitle>
          <DialogDescription>
            {getSubDescription()}
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
                {state.phase === 'done' ? formatSec(elapsedSec) : (state.phase === 'fetching' || state.phase === 'building' ? formatSec(remainSec) : '…')}
              </div>
            </div>
          </div>
          {(state.phase === 'fetching' || state.phase === 'building') && state.total > 5000 && (
            <p className="text-[11px] text-muted-foreground text-center">
              Processing in optimized time windows — keep this tab open.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
