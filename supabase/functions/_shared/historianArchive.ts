export interface ArchivedHistorianReading {
  id: string;
  tag_id: string;
  section: string | null;
  value: number | null;
  timestamp: string;
  received_at: string | null;
  tag_config_id: string | null;
  source: string | null;
}

type Cell = string | number | boolean | null;
type Grid = readonly (readonly Cell[])[];

export interface HistorianArchiveRange {
  spreadsheetId: string;
  range: string;
  format: 'recovery' | 'worker';
  start: string;
  end: string;
  count: number;
  sourceDigest?: string;
  recoveryDigest?: string;
}

export interface HistorianArchiveQuery {
  start: string;
  end: string;
  offset: number;
  limit: number;
  tagIds?: string[];
  sections?: string[];
  assets?: string[];
  excludeTagIds?: string[];
  snapshotsOnly?: boolean;
  ascending?: boolean;
}

async function digest(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...hash].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function assertBatch(count: number, checksum: string): void {
  if (!Number.isSafeInteger(count) || count < 1 || count > 250 || !/^[a-f0-9]{64}$/.test(checksum)) {
    throw new Error('Invalid historian archive batch metadata');
  }
}

function collectReadings(records: string[], readings: ArchivedHistorianReading[]): void {
  for (const record of records) {
    const row: ArchivedHistorianReading = JSON.parse(record);
    if (typeof row?.id !== 'string' || typeof row.tag_id !== 'string' ||
        typeof row.timestamp !== 'string' || !Number.isFinite(Date.parse(row.timestamp)) ||
        (row.value !== null && !Number.isFinite(row.value))) {
      throw new Error('Invalid archived historian reading');
    }
    readings.push(row);
  }
}

/** Verify and decode each packed batch written through the dashboard export flow. */
export async function* readRecoveryBatches(grid: Grid, preserveBatchOffsets = false): AsyncGenerator<string[]> {
  let nextBatch: number | undefined = preserveBatchOffsets ? undefined : 0;
  for (const row of grid) {
    if (!row.some(cell => cell !== null && cell !== '')) continue;
    if (row[0] === 'Date window') { nextBatch = preserveBatchOffsets ? undefined : 0; continue; }
    if (row[0] === 'Batch' && row[2] === 'SHA-256') continue;
    const part = String(row[0]);
    if (nextBatch === undefined && /^(0|[1-9]\d*)$/.test(part)) nextBatch = Number(part);
    if (!Number.isSafeInteger(nextBatch) || part !== String(nextBatch)) {
      throw new Error('Missing or out-of-order historian recovery batch');
    }
    nextBatch = Number(nextBatch) + 1;
    const count = Number(row[1]);
    const checksum = String(row[2]);
    assertBatch(count, checksum);
    const chunks = row.slice(3).filter(cell => cell !== null && cell !== '').map(cell => {
      if (typeof cell !== 'string' || !cell.startsWith('b64:')) throw new Error('Invalid archive cell encoding');
      return atob(cell.slice(4));
    });
    const bytes = Uint8Array.from(chunks.join(''), char => char.charCodeAt(0));
    if (await digest(bytes) !== checksum) throw new Error('Historian recovery batch checksum mismatch');
    const records = new TextDecoder('utf-8', { fatal: true }).decode(bytes).split('\n');
    if (records.length !== count) throw new Error('Historian recovery batch count mismatch');
    yield records;
  }
}

export async function readRecoveryGrid(grid: Grid): Promise<ArchivedHistorianReading[]> {
  const readings: ArchivedHistorianReading[] = [];
  for await (const records of readRecoveryBatches(grid)) collectReadings(records, readings);
  return readings;
}

/** Decode the row-per-record format written by the private archive worker. */
export async function* readWorkerBatches(grid: Grid): AsyncGenerator<string[]> {
  let index = grid[0]?.[0] === 'Batch SHA-256' ? 1 : 0;
  while (index < grid.length) {
    const row = grid[index];
    const checksum = String(row[0]);
    const count = Number(row[1]);
    assertBatch(count, checksum);
    const batch = grid.slice(index, index + count);
    if (batch.length !== count || batch.some((row, offset) => typeof row[2] !== 'string' || (offset > 0 && row[0]))) {
      throw new Error('Incomplete historian archive batch');
    }
    const records = batch.map(row => String(row[2]));
    if (await digest(new TextEncoder().encode(records.join('\n'))) !== checksum) {
      throw new Error('Historian archive batch checksum mismatch');
    }
    yield records;
    index += count;
  }
}

export async function readArchiveGrid(grid: Grid): Promise<ArchivedHistorianReading[]> {
  const readings: ArchivedHistorianReading[] = [];
  for await (const records of readWorkerBatches(grid)) collectReadings(records, readings);
  return readings;
}

export function validateArchiveRanges(ranges: HistorianArchiveRange[]): HistorianArchiveRange[] {
  const ordered = [...ranges].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  let previousEnd = -Infinity;
  for (const entry of ordered) {
    const start = Date.parse(entry.start);
    const end = Date.parse(entry.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || start < previousEnd ||
        !/^[A-Za-z0-9_-]{15,}$/.test(entry.spreadsheetId) || typeof entry.range !== 'string' || !entry.range ||
        !['worker', 'recovery'].includes(entry.format) || !Number.isSafeInteger(entry.count) || entry.count < 0 ||
        (entry.sourceDigest !== undefined && !/^[a-f0-9]{64}$/.test(entry.sourceDigest)) ||
        (entry.recoveryDigest !== undefined && !/^[a-f0-9]{64}$/.test(entry.recoveryDigest))) {
      throw new Error('Invalid or overlapping historian archive ranges');
    }
    previousEnd = end;
  }
  return ordered;
}

export async function readVerifiedArchiveRange(entry: HistorianArchiveRange, grid: Grid): Promise<ArchivedHistorianReading[]> {
  const readings = await (entry.format === 'worker' ? readArchiveGrid(grid) : readRecoveryGrid(grid));
  if (entry.sourceDigest !== undefined) {
    const checksums = entry.format === 'worker'
      ? grid.map(row => row[0]).filter(cell => typeof cell === 'string' && /^[a-f0-9]{64}$/.test(cell))
      : grid.filter(row => /^\d+$/.test(String(row[0]))).map(row => row[2]);
    if (await digest(new TextEncoder().encode(checksums.join('\n'))) !== entry.sourceDigest) {
      throw new Error('Archive content does not match the audited source checksum');
    }
  }
  return checkArchiveReadings(entry, readings);
}

function checkArchiveReadings(entry: HistorianArchiveRange, readings: ArchivedHistorianReading[]) {
  const start = Date.parse(entry.start);
  const end = Date.parse(entry.end);
  if (readings.length !== entry.count || new Set(readings.map(row => row.id)).size !== entry.count ||
      readings.some(row => Date.parse(row.timestamp) < start || Date.parse(row.timestamp) >= end)) {
    throw new Error('Archive rows do not match verified coverage');
  }
  return readings;
}

/** Read a private cache object pinned to the independently audited recovery file. */
export async function readArchiveRecovery(entry: HistorianArchiveRange, compressed: ReadableStream<Uint8Array>) {
  if (!entry.recoveryDigest) throw new Error('Missing recovery file checksum');
  const bytes = await new Response(compressed.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  if (await digest(new Uint8Array(bytes)) !== entry.recoveryDigest) throw new Error('Recovery file checksum mismatch');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (!text.endsWith('\n')) throw new Error('Incomplete recovery file');
  const readings: ArchivedHistorianReading[] = [];
  collectReadings(text.slice(0, -1).split('\n'), readings);
  return checkArchiveReadings(entry, readings);
}

type LoadArchiveGrid = (entry: HistorianArchiveRange) => Promise<Grid>;

export function createVerifiedArchiveCache(maxRows: number, ttlMs: number, loadRecovery?: (
  entry: HistorianArchiveRange,
) => Promise<ArchivedHistorianReading[] | undefined>) {
  const windows = new Map<string, { rows: readonly ArchivedHistorianReading[]; expires: number }>();
  const pending = new Map<string, Promise<readonly ArchivedHistorianReading[]>>();
  let storedRows = 0;

  return async function readWindow(entry: HistorianArchiveRange, loadGrid: LoadArchiveGrid) {
    if (!entry.count) return readVerifiedArchiveRange(entry, []);
    if (!entry.sourceDigest || entry.count > maxRows) {
      return readVerifiedArchiveRange(entry, await loadGrid(entry));
    }

    const key = JSON.stringify([entry.spreadsheetId, entry.range, entry.format, entry.start, entry.end, entry.count, entry.sourceDigest, entry.recoveryDigest]);
    const previous = windows.get(key);
    if (previous) {
      windows.delete(key);
      if (previous.expires > Date.now()) {
        windows.set(key, previous);
        return previous.rows;
      }
      storedRows -= previous.rows.length;
    }

    const current = pending.get(key);
    if (current) return current;
    const loading = (async () => {
      const rows = (entry.recoveryDigest ? await loadRecovery?.(entry) : undefined)
        ?? await readVerifiedArchiveRange(entry, await loadGrid(entry));
      while (storedRows + rows.length > maxRows) {
        const oldest = windows.entries().next();
        if (oldest.done) break;
        const [oldKey, oldWindow] = oldest.value;
        windows.delete(oldKey);
        storedRows -= oldWindow.rows.length;
      }
      windows.set(key, { rows, expires: Date.now() + ttlMs });
      storedRows += rows.length;
      return rows;
    })();
    pending.set(key, loading);
    try {
      return await loading;
    } finally {
      pending.delete(key);
    }
  };
}

export async function queryVerifiedArchive(
  entries: HistorianArchiveRange[], query: HistorianArchiveQuery,
  loadGrid: LoadArchiveGrid,
  readWindow = async (entry: HistorianArchiveRange, load: LoadArchiveGrid): Promise<readonly ArchivedHistorianReading[]> =>
    readVerifiedArchiveRange(entry, entry.count === 0 ? [] : await load(entry)),
): Promise<{ count: number; rows: ArchivedHistorianReading[]; coverage: { start: string; end: string }[] }> {
  const start = Date.parse(query.start);
  const end = Date.parse(query.end);
  const relevant = validateArchiveRanges(entries).filter(entry => Date.parse(entry.start) < end && Date.parse(entry.end) > start);
  if (!query.ascending) relevant.reverse();
  const tagIds = new Set(query.tagIds);
  const sections = new Set(query.sections);
  const assets = new Set(query.assets);
  const excluded = new Set(query.excludeTagIds);
  const rows: ArchivedHistorianReading[] = [];
  let count = 0;
  for (const entry of relevant) {
    const readings = await readWindow(entry, loadGrid);
    const matching = readings.filter(row => {
      const timestamp = Date.parse(row.timestamp);
      const section = row.section ?? '';
      if (assets.size) {
        const tag = row.tag_id.toUpperCase();
        const oht1 = /^OHT-?1(?:[^0-9]|$)/.test(tag);
        const oht2 = /^OHT-?2(?:[^0-9]|$)/.test(tag);
        if ((tag.startsWith('OHT') && !oht1 && !oht2) || /WARD|MOHGAON|MOH_/.test(tag)) return false;
        if (!assets.has('all') && !(assets.has(section) || (assets.has('oht-1') && oht1) || (assets.has('oht-2') && oht2))) return false;
      }
      return timestamp >= start && timestamp < end && (!tagIds.size || tagIds.has(row.tag_id)) &&
        (!sections.size || sections.has(section)) && !excluded.has(row.tag_id) &&
        (!query.snapshotsOnly || row.source == null || row.source.includes('5min'));
    });
    matching.sort((a, b) => (query.ascending ? 1 : -1) * (Date.parse(a.timestamp) - Date.parse(b.timestamp)) ||
      (a.section ?? '').localeCompare(b.section ?? '') || a.tag_id.localeCompare(b.tag_id) || a.id.localeCompare(b.id));
    const from = Math.max(0, query.offset - count);
    if (rows.length < query.limit && from < matching.length) {
      rows.push(...matching.slice(from, from + query.limit - rows.length));
    }
    count += matching.length;
  }
  const coverage = relevant.map(entry => ({ start: entry.start, end: entry.end }));
  return { count, rows, coverage };
}
