import { createHash, createHmac } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { gzipSync, gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';

const sources = {
  historian_logs: ['id', 'timestamp'],
  historian_aggregates: ['id', 'bucket_start'],
  consumption_data: ['id', 'date'],
  pump_analytics: ['id', 'date'],
  alarms: ['id', 'created_at'],
  telemetry_corrections: ['historian_id', 'corrected_at'],
  data_exports: ['id', 'created_at'],
};

const batchSize = 200;
const monthFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit',
});

export function archiveMonth(timestamp) {
  const parts = monthFormat.formatToParts(new Date(timestamp));
  return `${parts.find(part => part.type === 'year').value}-${parts.find(part => part.type === 'month').value}`;
}

export function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}

export function checksum(records) {
  return createHash('sha256').update(records.join('\n')).digest('hex');
}

async function atomicWrite(file, data) {
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, data, { mode: 0o600, flush: true });
  await rename(temp, file);
}

async function post(batch) {
  const body = JSON.stringify(batch);
  const sentAt = Date.now();
  const signature = createHmac('sha256', process.env.ARCHIVE_SECRET).update(`${sentAt}.${body}`).digest('hex');
  const response = await fetch(process.env.ARCHIVE_SCRIPT_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body, sentAt, signature }), signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error(`Apps Script HTTP ${response.status}`);
  const result = await response.json();
  if (!result.ok) throw new Error(`Apps Script: ${result.error}`);
  return result;
}

async function verifyBatch(directory, target, records) {
  const digest = checksum(records);
  const name = join(directory, `${target.table}-${target.month}-${digest}`);
  const contents = gzipSync(records.join('\n'));
  await atomicWrite(`${name}.jsonl.gz`, contents);
  const restored = gunzipSync(await readFile(`${name}.jsonl.gz`)).toString('utf8');
  if (checksum(restored.split('\n')) !== digest) throw new Error(`Recovery copy mismatch: ${digest}`);

  for (let attempt = 0; ; attempt++) {
    try {
      await post({ ...target, digest, action: 'write', records });
      const remote = await post({ ...target, digest, action: 'read' });
      if (remote.count !== records.length || checksum(remote.records) !== digest) {
        throw new Error(`Google readback mismatch: ${digest}`);
      }
      const { records: readback, ...location } = remote;
      await atomicWrite(`${name}.verified.json`, JSON.stringify({ ...target, digest, ...location }, null, 2));
      return;
    } catch (error) {
      if (attempt === 3) throw error;
      await delay(2000 * 2 ** attempt);
    }
  }
}

async function collectPage(table, key, timestamp, before, after, cursor, countOnly = false) {
  const base = new URL(process.env.SUPABASE_URL);
  const url = new URL(`/rest/v1/${table}`, base);
  url.searchParams.set('select', '*');
  url.searchParams.set('order', `${timestamp}.asc,${key}.asc`);
  url.searchParams.set('limit', String(batchSize));
  url.searchParams.set(timestamp, `lt.${before}`);
  if (after) url.searchParams.append(timestamp, `gte.${after}`);
  if (cursor) url.searchParams.set('or', `(${timestamp}.gt.${cursor.timestamp},and(${timestamp}.eq.${cursor.timestamp},${key}.gt.${cursor.key}))`);
  const token = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const response = await fetch(url, {
    method: countOnly ? 'HEAD' : 'GET',
    headers: { apikey: token, Authorization: `Bearer ${token}`, ...(countOnly && { Prefer: 'count=exact' }) },
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`${table} read failed with HTTP ${response.status}`);
  if (countOnly) {
    const match = response.headers.get('content-range')?.match(/\/(\d+)$/);
    if (!match) throw new Error(`${table}: exact source count unavailable`);
    return Number(match[1]);
  }
  return await response.json();
}

async function archiveExportFile(directory, row, destinationFor) {
  if (!row.file_path) return;
  const path = row.file_path.split('/');
  if (path.some(segment => !segment || segment === '.' || segment === '..')) throw new Error('Invalid export object path');
  const url = new URL(`/storage/v1/object/authenticated/data-exports/${path.map(encodeURIComponent).join('/')}`, process.env.SUPABASE_URL);
  const token = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const response = await fetch(url, { headers: { apikey: token, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`Export object ${row.id} read failed with HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const digest = createHash('sha256').update(bytes).digest('hex');
  await atomicWrite(join(directory, `export-object-${digest}.bin`), bytes);
  const month = archiveMonth(row.created_at);
  const chunkSize = 24000;
  const chunkCount = Math.max(1, Math.ceil(bytes.length / chunkSize));
  for (let start = 0; start < chunkCount; start += 40) {
    const records = Array.from({ length: Math.min(40, chunkCount - start) }, (_, index) => {
      const chunkIndex = start + index;
      return canonical({ export_id: row.id, path: row.file_path, sha256: digest, bytes: bytes.length,
        chunk_index: chunkIndex, chunk_count: chunkCount,
        base64: bytes.subarray(chunkIndex * chunkSize, (chunkIndex + 1) * chunkSize).toString('base64') });
    });
    const destination = destinationFor(`export-files-${month}`, records.length);
    await verifyBatch(directory, { table: 'export_files', month, part: destination.part }, records);
    destination.count += records.length;
  }
}

export async function archiveTable(directory, table, before, after) {
  const [key, timestamp] = sources[table];
  const checkpointFile = join(directory, `${table}.json`);
  let checkpoint = { before, after, cursor: null, count: 0, parts: {}, completed: false };
  try {
    checkpoint = JSON.parse(await readFile(checkpointFile, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (checkpoint.before !== before || checkpoint.after !== after) throw new Error(`Checkpoint window changed for ${table}`);
  if (checkpoint.completed) return checkpoint;

  function destinationFor(partition, count) {
    const destination = checkpoint.parts[partition] ??= { part: 1, count: 0 };
    if (destination.count + count >= 80000) {
      destination.part++;
      destination.count = 0;
    }
    return destination;
  }

  while (true) {
    const rows = await collectPage(table, key, timestamp, before, after, checkpoint.cursor);
    if (!rows.length) {
      const sourceCount = await collectPage(table, key, timestamp, before, after, null, true);
      if (sourceCount !== checkpoint.count) {
        throw new Error(`${table}: verified ${checkpoint.count} rows but source counts ${sourceCount}. Reconcile before cleanup.`);
      }
      checkpoint.completed = true;
      await atomicWrite(checkpointFile, JSON.stringify(checkpoint, null, 2));
      return checkpoint;
    }
    const monthly = new Map();
    for (const row of rows) {
      if (table === 'data_exports') await archiveExportFile(directory, row, destinationFor);
      const month = archiveMonth(row[timestamp]);
      if (!monthly.has(month)) monthly.set(month, []);
      monthly.get(month).push(canonical(row));
    }
    for (const [month, records] of monthly) {
      const destination = destinationFor(month, records.length);
      await verifyBatch(directory, { table, month, part: destination.part }, records);
      destination.count += records.length;
    }
    checkpoint.cursor = { key: rows.at(-1)[key], timestamp: rows.at(-1)[timestamp] };
    checkpoint.count += rows.length;
    await atomicWrite(checkpointFile, JSON.stringify(checkpoint, null, 2));
  }
}

async function main() {
  const [directory, before, after, selectedTable] = process.argv.slice(2);
  if (!directory || !Number.isFinite(Date.parse(before)) || (after && !Number.isFinite(Date.parse(after))) ||
      (after && Date.parse(after) >= Date.parse(before)) || (selectedTable && !Object.hasOwn(sources, selectedTable))) {
    throw new Error('Usage: node backup.mjs <recovery directory> <ISO cutoff> [ISO start] [source table]');
  }
  for (const key of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'ARCHIVE_SCRIPT_URL', 'ARCHIVE_SECRET']) {
    if (!process.env[key]) throw new Error(`Missing ${key}`);
  }
  const script = new URL(process.env.ARCHIVE_SCRIPT_URL);
  if (script.origin !== 'https://script.google.com' || !script.pathname.endsWith('/exec')) {
    throw new Error('ARCHIVE_SCRIPT_URL must be a deployed Apps Script /exec URL');
  }
  await mkdir(directory, { recursive: true });
  for (const table of selectedTable ? [selectedTable] : Object.keys(sources)) {
    const result = await archiveTable(directory, table, before, after ?? null);
    console.log(`${table}: ${result.count} records verified`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
