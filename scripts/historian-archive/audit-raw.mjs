import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { gzipSync, gunzipSync } from 'node:zlib';
import { readVerifiedArchiveRange, validateArchiveRanges } from '../../supabase/functions/_shared/historianArchive.ts';
import { googleSheetsAccessToken, loadHistorianSheet } from '../../supabase/functions/_shared/historianSheets.ts';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

async function audit() {
  const [manifestPath, destination] = process.argv.slice(2);
  if (!manifestPath || !destination) throw new Error('Usage: node audit-raw.mjs <verified-manifest.json> <existing recovery directory>');
  const { SUPABASE_ARCHIVE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_ARCHIVE_TOKEN } = process.env;
  if (!/^https:\/\/[a-z]{20}\.supabase\.co$/.test(SUPABASE_ARCHIVE_URL ?? '') || !SUPABASE_PUBLISHABLE_KEY ||
      !/^[a-f0-9]{64}$/.test(SUPABASE_ARCHIVE_TOKEN ?? '')) throw new Error('Dedicated Supabase archive credentials are required');
  const manifest = validateArchiveRanges(JSON.parse(await readFile(manifestPath, 'utf8')));
  if (!manifest.length || manifest.some((range, i) => range.format !== 'recovery' ||
      (i > 0 && Date.parse(manifest[i - 1].end) !== Date.parse(range.start)))) {
    throw new Error('Expected a contiguous dashboard recovery manifest');
  }
  const token = await googleSheetsAccessToken({ clientId: process.env.HISTORIAN_GOOGLE_CLIENT_ID,
    clientSecret: process.env.HISTORIAN_GOOGLE_CLIENT_SECRET, refreshToken: process.env.HISTORIAN_GOOGLE_REFRESH_TOKEN });
  const receipts = [];
  const seen = new Set();
  for (const entry of manifest) {
    const grid = entry.count ? await loadHistorianSheet(entry, token) : [];
    const readings = await readVerifiedArchiveRange(entry, grid);
    const batchDigests = grid.filter(row => /^\d+$/.test(String(row[0]))).map(row => row[2]);
    const digest = sha256(batchDigests.join('\n'));
    const response = await fetch(`${SUPABASE_ARCHIVE_URL}/rest/v1/rpc/historian_archive_page`, {
      method: 'POST', headers: { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ archive_token: SUPABASE_ARCHIVE_TOKEN, source_table: 'historian_logs',
        range_start: entry.start, range_end: entry.end, page_size: 250, verify_window: true }),
      redirect: 'error', signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`Supabase source verification failed (${response.status})`);
    const source = await response.json();
    if (source.count !== readings.length || source.digest !== digest) throw new Error(`Source mismatch for ${entry.start}`);
    for (const reading of readings) {
      if (seen.has(reading.id)) throw new Error(`Duplicate record across archive windows at ${entry.start}`);
      seen.add(reading.id);
    }
    const output = Buffer.from(readings.map(row => JSON.stringify(row) + '\n').join(''));
    const file = `${new Date(entry.start).toISOString().slice(0, 10)}-${digest}.jsonl.gz`;
    const target = join(destination, file);
    try {
      await writeFile(target, gzipSync(output), { flag: 'wx', mode: 0o600 });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    if (!gunzipSync(await readFile(target)).equals(output)) throw new Error(`Recovery file differs for ${entry.start}`);
    receipts.push({ ...entry, sourceDigest: digest, recoveryFile: file, recoveryDigest: sha256(output) });
    console.error(`Verified ${entry.count} rows for ${entry.start}`);
    await delay(1100);
  }
  console.log(JSON.stringify({ count: seen.size, windows: receipts }));
}

audit().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
