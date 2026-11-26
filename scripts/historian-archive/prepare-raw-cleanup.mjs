import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { validateArchiveRanges } from '../../supabase/functions/_shared/historianArchive.ts';

const sha256 = content => createHash('sha256').update(content).digest('hex');
const validDigest = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);

async function prepare() {
  const [receiptPath, recoveryDirectory, start, mode = 'preview'] = process.argv.slice(2);
  if (!receiptPath || !recoveryDirectory || !start || !['preview', 'delete'].includes(mode)) {
    throw new Error('Usage: node prepare-raw-cleanup.mjs <audit receipt.json> <recovery directory> <window start ISO> [preview|delete]');
  }
  const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
  const windows = validateArchiveRanges(receipt.windows);
  if (!windows.length || windows.reduce((sum, window) => sum + window.count, 0) !== receipt.count) {
    throw new Error('Invalid or incomplete archive receipt');
  }
  const entry = windows.find(window => window.start === start);
  if (!entry || !entry.count || !validDigest(entry.sourceDigest) || !validDigest(entry.recoveryDigest)) {
    throw new Error('Nonempty verified window required');
  }
  const from = new Date(entry.start).toISOString();
  const to = new Date(entry.end).toISOString();
  if (Date.parse(to) - Date.parse(from) > 86400_000 || Date.parse(to) >= Date.now()) {
    throw new Error('Use a closed historical window of at most one UTC day');
  }
  const expectedFile = `${from.slice(0, 10)}-${entry.sourceDigest}.jsonl.gz`;
  if (entry.recoveryFile !== expectedFile) throw new Error('Invalid recovery file reference');
  const restored = gunzipSync(await readFile(join(recoveryDirectory, expectedFile)));
  if (sha256(restored) !== entry.recoveryDigest) throw new Error('Recovery checksum mismatch');
  const rows = restored.toString('utf8').trimEnd().split('\n').map(line => JSON.parse(line));
  if (rows.length !== entry.count || new Set(rows.map(row => row.id)).size !== entry.count || rows.some(row => {
    const at = Date.parse(row.timestamp);
    return typeof row.id !== 'string' || !Number.isFinite(at) || at < Date.parse(from) || at >= Date.parse(to);
  })) throw new Error('Recovery rows do not match the requested window');

  const fingerprint = `WITH candidates AS MATERIALIZED (
  SELECT h.* FROM public.historian_logs AS h
  WHERE h.timestamp >= '${from}'::timestamptz AND h.timestamp < '${to}'::timestamptz
  ${mode === 'delete' ? 'ORDER BY h.timestamp, h.id FOR UPDATE OF h' : ''}
), ordered AS (
  SELECT id, timestamp, to_jsonb(c)::text AS body,
    (row_number() OVER (ORDER BY timestamp, id) - 1) / 250 AS batch
  FROM candidates c
), batches AS (
  SELECT batch, count(*) AS n, encode(sha256(convert_to(string_agg(body, chr(10) ORDER BY timestamp, id), 'UTF8')), 'hex') AS digest
  FROM ordered GROUP BY batch
), fingerprint AS (
  SELECT COALESCE(sum(n), 0) AS n,
    encode(sha256(convert_to(COALESCE(string_agg(digest, chr(10) ORDER BY batch), ''), 'UTF8')), 'hex') AS digest
  FROM batches
)`;
  const matches = `n = ${entry.count} AND digest = '${entry.sourceDigest}'`;
  if (mode === 'preview') {
    console.log(`BEGIN READ ONLY;\nSET LOCAL timezone = 'UTC';\n${fingerprint}\nSELECT n AS source_count, digest, ${matches} AS matches_backup FROM fingerprint;\nCOMMIT;`);
    return;
  }
  console.log(`BEGIN;
SET LOCAL timezone = 'UTC';
SET LOCAL lock_timeout = '5s';
DO $archive_cleanup$
DECLARE deleted_count bigint;
BEGIN
  ${fingerprint}, deleted AS (
    DELETE FROM public.historian_logs h USING candidates c
    WHERE h.id = c.id AND EXISTS (SELECT 1 FROM fingerprint WHERE ${matches})
    RETURNING h.id
  )
  SELECT count(*) INTO deleted_count FROM deleted;
  IF deleted_count <> ${entry.count} THEN
    RAISE EXCEPTION 'Archive cleanup rolled back: expected %, affected %', ${entry.count}, deleted_count;
  END IF;
  RAISE NOTICE 'Deleted % verified historian rows', deleted_count;
END
$archive_cleanup$;
COMMIT;`);
}

prepare().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
