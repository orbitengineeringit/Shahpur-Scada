const SLOT_MS = 5 * 60_000;
const IST_MS = 330 * 60_000;
const CHUNK_BYTES = 30000;
const MAX_CHUNKS = 24;

export type BackupSnapshot = {
  historian_logs: string[];
  alarms: string[];
  historian_aggregates: string[];
};

export async function readHistorianBackupRow(
  row: readonly unknown[],
  expectedStart: string,
  expectedDigest?: string,
): Promise<BackupSnapshot> {
  const start = Date.parse(expectedStart);
  const [from, to, checksum, ...tail] = row;
  const counts = tail.slice(0, 3);
  const chunks = tail.slice(3);
  while (chunks.at(-1) === '' || chunks.at(-1) === null) chunks.pop();
  if (!Number.isFinite(start) || start % SLOT_MS !== 0 || from !== new Date(start).toISOString() ||
      to !== new Date(start + SLOT_MS).toISOString() ||
      typeof checksum !== 'string' || !/^[0-9a-f]{64}$/.test(checksum) ||
      (expectedDigest !== undefined && checksum !== expectedDigest) ||
      counts.length !== 3 || counts.some(count => typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) ||
      !chunks.length || chunks.length > MAX_CHUNKS ||
      chunks.some(chunk => typeof chunk !== 'string' || !chunk.length || chunk.length > CHUNK_BYTES * 4 / 3)) {
    throw new Error('Invalid Sheets API backup row');
  }
  const compressed = Uint8Array.from(chunks.map(chunk => atob(String(chunk))).join(''), char => char.charCodeAt(0));
  const bytes = await new Response(new Blob([compressed]).stream()
    .pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  const digest = await backupDigest(bytes);
  if (digest !== checksum) throw new Error('Sheets API backup checksum mismatch');
  const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as BackupSnapshot;
  if ([data.historian_logs, data.alarms, data.historian_aggregates].some((records, index) =>
    !Array.isArray(records) || records.length !== counts[index] || records.some(record => typeof record !== 'string'))) {
    throw new Error('Sheets API backup counts do not match the payload');
  }
  return data;
}

async function backupDigest(bytes: BufferSource) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function historianBackupSlot(windowStart: string) {
  const start = Date.parse(windowStart);
  if (!Number.isFinite(start) || start % SLOT_MS !== 0) throw new Error('Invalid finalized backup window');
  const startIst = new Date(start + IST_MS);
  const month = startIst.toISOString().slice(0, 7);
  const monthStart = Date.parse(month + '-01T00:00:00Z') - IST_MS;
  const row = 2 + (start - monthStart) / SLOT_MS;
  return { start, month, row };
}

export async function historianBackupGrid(windowStart: string, snapshot: BackupSnapshot) {
  if (!Array.isArray(snapshot.historian_logs) || !Array.isArray(snapshot.alarms) ||
      !Array.isArray(snapshot.historian_aggregates)) throw new Error('Invalid finalized backup window');
  const { start, month, row } = historianBackupSlot(windowStart);
  const records = JSON.stringify({
    historian_logs: snapshot.historian_logs,
    alarms: snapshot.alarms,
    historian_aggregates: snapshot.historian_aggregates,
  });
  const bytes = new TextEncoder().encode(records);
  const hash = await backupDigest(bytes);
  const gzip = new Uint8Array(await new Response(new Blob([bytes]).stream()
    .pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  if (gzip.length > CHUNK_BYTES * MAX_CHUNKS) throw new Error('Backup window exceeds worksheet capacity');
  const cells: (string | number)[] = [new Date(start).toISOString(), new Date(start + SLOT_MS).toISOString(),
    hash, snapshot.historian_logs.length, snapshot.alarms.length, snapshot.historian_aggregates.length];
  for (let offset = 0; offset < gzip.length; offset += CHUNK_BYTES) {
    cells.push(btoa(String.fromCharCode(...gzip.subarray(offset, offset + CHUNK_BYTES))));
  }
  while (cells.length < 6 + MAX_CHUNKS) cells.push('');
  return { month, range: `'Raw Backup'!A${row}:AD${row}`, cells };
}
