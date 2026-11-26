import { supabase } from '@/integrations/supabase/client';
import type { ArchivedHistorianReading, HistorianArchiveQuery } from '../../supabase/functions/_shared/historianArchive';
import { partitionHistorianDates, type DateWindow } from './historianDateWindows';

export type { DateWindow } from './historianDateWindows';
const archiveHistoryCounts = new Map<string, { count: number; expires: number }>();
let currentCoverage: { ranges: DateWindow[]; expires: number } | undefined;

export async function resolveHistorianDates(start: string, end: string, signal?: AbortSignal) {
  const configuredStart = import.meta.env.VITE_HISTORIAN_ARCHIVE_START;
  const configuredCutoff = import.meta.env.VITE_HISTORIAN_ARCHIVE_CUTOFF;
  const legacy: DateWindow[] = [];
  let floor = -Infinity;
  if (configuredStart || configuredCutoff) {
    floor = Date.parse(configuredStart);
    const cutoff = Date.parse(configuredCutoff);
    if (!Number.isFinite(floor) || !Number.isFinite(cutoff) || floor >= cutoff) {
      throw new Error('Historian archive boundaries are invalid');
    }
    legacy.push({ start: configuredStart, end: configuredCutoff });
    if (Date.parse(end) <= cutoff) return partitionHistorianDates({ start, end }, legacy, floor);
  }
  if (!currentCoverage || currentCoverage.expires <= Date.now()) {
    const timeout = AbortSignal.timeout(6000);
    const { data, error } = await supabase.functions.invoke<{ ranges: DateWindow[] }>('read-historian-archive', {
      body: { operation: 'coverage' }, signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    if (error) throw error;
    if (!Array.isArray(data?.ranges) || data.ranges.some(range =>
      !Number.isFinite(Date.parse(range.start)) || !Number.isFinite(Date.parse(range.end)) ||
      Date.parse(range.start) >= Date.parse(range.end))) throw new Error('Invalid verified backup coverage');
    currentCoverage = { ranges: data.ranges, expires: Date.now() + 60_000 };
  }
  return partitionHistorianDates({ start, end }, [...legacy, ...currentCoverage.ranges], floor);
}

function hasCompleteCoverage(query: DateWindow, coverage: DateWindow[]): boolean {
  let cursor = Date.parse(query.start);
  const end = Date.parse(query.end);
  const ordered = coverage.map(window => ({ start: Date.parse(window.start), end: Date.parse(window.end) }));
  ordered.sort((a, b) => a.start - b.start);
  for (const window of ordered) {
    if (window.start > cursor) break;
    cursor = Math.max(cursor, window.end);
    if (cursor >= end) return true;
  }
  return false;
}

export async function readArchivePage(query: HistorianArchiveQuery, signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(45000);
  const { data, error } = await supabase.functions.invoke<{
    rows: ArchivedHistorianReading[]; count: number; coverage: DateWindow[];
  }>('read-historian-archive', { body: query, signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  if (error) throw error;
  if (!data || !Array.isArray(data.rows) || !Array.isArray(data.coverage) || !Number.isSafeInteger(data.count) ||
      !hasCompleteCoverage(query, data.coverage)) throw new Error('Verified archive coverage is incomplete');
  return data;
}

export function historianDayWindows(range: DateWindow, ascending: boolean, daysPerWindow = 1): DateWindow[] {
  const windows: DateWindow[] = [];
  const until = Date.parse(range.end);
  for (let time = Date.parse(range.start); time < until; ) {
    const next = Math.min(until, (Math.floor(time / 86400_000) + daysPerWindow) * 86400_000);
    windows.push({ start: new Date(time).toISOString(), end: new Date(next).toISOString() });
    time = next;
  }
  return ascending ? windows : windows.reverse();
}

export async function readArchiveHistory(
  range: DateWindow,
  filters: Pick<HistorianArchiveQuery, 'assets' | 'excludeTagIds' | 'snapshotsOnly'>,
  offset: number, limit: number, signal?: AbortSignal,
): Promise<{ count: number; rows: ArchivedHistorianReading[] }> {
  let count = 0;
  const rows: ArchivedHistorianReading[] = [];
  for (const window of historianDayWindows(range, false, 3)) {
    signal?.throwIfAborted();
    const from = Math.max(0, offset - count);
    const remaining = limit - rows.length;
    const key = JSON.stringify({ ...window, ...filters });
    const saved = archiveHistoryCounts.get(key);
    if (saved && saved.expires > Date.now() && (remaining <= 0 || from >= saved.count)) {
      count += saved.count;
      continue;
    }
    const page = await readArchivePage({ ...window, ...filters, offset: remaining > 0 ? from : 0,
      limit: Math.max(1, remaining) }, signal);
    if (remaining > 0) {
      if (page.rows.length !== Math.min(remaining, Math.max(0, page.count - from))) throw new Error('Incomplete archive page');
      rows.push(...page.rows);
    }
    if (archiveHistoryCounts.size >= 128) {
      const oldest = archiveHistoryCounts.keys().next();
      if (!oldest.done) archiveHistoryCounts.delete(oldest.value);
    }
    archiveHistoryCounts.set(key, { count: page.count, expires: Date.now() + 5 * 60_000 });
    count += page.count;
  }
  return { count, rows };
}
