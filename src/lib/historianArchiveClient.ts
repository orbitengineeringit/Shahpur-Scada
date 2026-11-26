import { supabase } from '@/integrations/supabase/client';
import type { ArchivedHistorianReading, HistorianArchiveQuery } from '../../supabase/functions/_shared/historianArchive';

export type DateWindow = { start: string; end: string };

export function splitHistorianRange(start: string, end: string): { archive?: DateWindow; live?: DateWindow } {
  const configuredStart = import.meta.env.VITE_HISTORIAN_ARCHIVE_START;
  const configuredCutoff = import.meta.env.VITE_HISTORIAN_ARCHIVE_CUTOFF;
  if (!configuredStart && !configuredCutoff) return { live: { start, end } };
  const floor = Date.parse(configuredStart);
  const cutoff = Date.parse(configuredCutoff);
  if (!Number.isFinite(floor) || !Number.isFinite(cutoff) || floor >= cutoff) {
    throw new Error('Historian archive boundaries are invalid');
  }
  const from = Date.parse(start);
  const until = Date.parse(end);
  const archiveStart = Math.max(from, floor);
  const archiveEnd = Math.min(until, cutoff);
  const liveStart = Math.max(from, cutoff);
  return {
    archive: archiveStart < archiveEnd ? { start: new Date(archiveStart).toISOString(), end: new Date(archiveEnd).toISOString() } : undefined,
    live: liveStart < until ? { start: new Date(liveStart).toISOString(), end } : undefined,
  };
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

export function historianDayWindows(range: DateWindow, ascending: boolean): DateWindow[] {
  const windows: DateWindow[] = [];
  const until = Date.parse(range.end);
  for (let time = Date.parse(range.start); time < until; ) {
    const next = Math.min(until, time + 86400_000);
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
  for (const window of historianDayWindows(range, false)) {
    const from = Math.max(0, offset - count);
    const remaining = limit - rows.length;
    const page = await readArchivePage({ ...window, ...filters, offset: remaining > 0 ? from : 0,
      limit: Math.max(1, remaining) }, signal);
    if (remaining > 0) {
      if (page.rows.length !== Math.min(remaining, Math.max(0, page.count - from))) throw new Error('Incomplete archive page');
      rows.push(...page.rows);
    }
    count += page.count;
  }
  return { count, rows };
}
