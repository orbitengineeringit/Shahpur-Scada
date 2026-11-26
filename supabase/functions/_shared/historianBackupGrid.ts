const SLOT_MS = 5 * 60_000;
const IST_MS = 330 * 60_000;
const CHUNK_BYTES = 30000;
const MAX_CHUNKS = 24;

export type BackupSnapshot = {
  historian_logs: string[];
  alarms: string[];
  historian_aggregates: string[];
};

export async function historianBackupGrid(windowStart: string, snapshot: BackupSnapshot) {
  const start = Date.parse(windowStart);
  if (!Number.isFinite(start) || start % SLOT_MS !== 0 ||
    !Array.isArray(snapshot.historian_logs) || !Array.isArray(snapshot.alarms) ||
    !Array.isArray(snapshot.historian_aggregates)) throw new Error('Invalid finalized backup window');
  const startIst = new Date(start + IST_MS);
  const month = startIst.toISOString().slice(0, 7);
  const monthStart = Date.parse(month + '-01T00:00:00Z') - IST_MS;
  const row = 2 + (start - monthStart) / SLOT_MS;
  const records = JSON.stringify({
    historian_logs: snapshot.historian_logs,
    alarms: snapshot.alarms,
    historian_aggregates: snapshot.historian_aggregates,
  });
  const bytes = new TextEncoder().encode(records);
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map(byte => byte.toString(16).padStart(2, '0')).join('');
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
