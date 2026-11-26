import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { validateArchiveRanges } from '../../supabase/functions/_shared/historianArchive.ts';

const bucket = 'historian-archive-cache';
const [receiptPath, recoveryDirectory, projectRef] = process.argv.slice(2);
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
if (!receiptPath || !recoveryDirectory || !/^[a-z]{20}$/.test(projectRef ?? '') || !accessToken) {
  throw new Error('Usage with SUPABASE_ACCESS_TOKEN: node seed-read-cache.mjs <audited receipt> <recovery directory> <project ref>');
}

const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
const windows = validateArchiveRanges(receipt.windows);
if (!windows.length || windows.some((window, index) =>
  !window.sourceDigest || !window.recoveryDigest || !window.recoveryFile ||
  basename(window.recoveryFile) !== window.recoveryFile ||
  (index > 0 && windows[index - 1].end !== window.start)) ||
  windows.reduce((sum, window) => sum + window.count, 0) !== receipt.count) {
  throw new Error('Expected a complete, independently audited recovery receipt');
}

const management = `https://api.supabase.com/v1/projects/${projectRef}`;
const storage = `https://${projectRef}.supabase.co/storage/v1`;
const auth = { Authorization: `Bearer ${accessToken}` };
const keysResponse = await fetch(`${management}/api-keys?reveal=true`, { headers: auth, redirect: 'error' });
if (!keysResponse.ok) throw new Error(`Supabase API key lookup failed (${keysResponse.status})`);
const serviceKey = (await keysResponse.json()).find(key => key.name === 'service_role')?.api_key;
if (!serviceKey) throw new Error('Supabase service role key unavailable');
const credentials = { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey };
const request = (url, options) => fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(25000) });
const json = { ...credentials, 'Content-Type': 'application/json' };

let bucketResponse = await request(`${storage}/bucket/${bucket}`, { headers: credentials });
if ([400, 404].includes(bucketResponse.status)) {
  const create = await request(`${storage}/bucket`, { method: 'POST', headers: json,
    body: JSON.stringify({ id: bucket, name: bucket, public: false, file_size_limit: 4 * 1024 * 1024 }) });
  if (!create.ok && create.status !== 409) throw new Error(`Private cache creation failed (${create.status})`);
  bucketResponse = await request(`${storage}/bucket/${bucket}`, { headers: credentials });
}
if (!bucketResponse.ok || (await bucketResponse.json()).public !== false) {
  throw new Error('Historian cache bucket must be private');
}

let cursor = 0;
let bytes = 0;
async function uploadVerifiedWindows() {
  while (cursor < windows.length) {
    const entry = windows[cursor++];
    if (!entry.count) continue;
    const file = await readFile(join(recoveryDirectory, entry.recoveryFile));
    const digest = createHash('sha256').update(gunzipSync(file)).digest('hex');
    if (digest !== entry.recoveryDigest) throw new Error(`Audited file differs for ${entry.start}`);
    const object = `${bucket}/${digest}.jsonl.gz`;
    const name = `${storage}/object/${object}`;
    const upload = await request(name, { method: 'POST',
      headers: { ...credentials, 'Content-Type': 'application/gzip', 'x-upsert': 'true' }, body: file });
    if (!upload.ok) throw new Error(`Cache upload failed for ${entry.start} (${upload.status})`);
    const stored = await request(`${storage}/object/authenticated/${object}`, { headers: credentials });
    if (!stored.ok || !file.equals(Buffer.from(await stored.arrayBuffer()))) {
      throw new Error(`Cache readback differs for ${entry.start}`);
    }
    bytes += file.length;
  }
}
await Promise.all(Array.from({ length: 3 }, uploadVerifiedWindows));

const manifest = windows.map(({ recoveryFile, ...entry }) => entry);
const encoded = 'gzip:' + gzipSync(JSON.stringify(manifest)).toString('base64');
if (encoded.length > 24_576) throw new Error('Archive manifest exceeds the Supabase secret size limit');
const saved = await request(`${management}/secrets`, { method: 'POST',
  headers: { ...auth, 'Content-Type': 'application/json' },
  body: JSON.stringify([{ name: 'HISTORIAN_ARCHIVE_SHEETS', value: encoded }]) });
if (!saved.ok) throw new Error(`Archive manifest update failed (${saved.status})`);
console.log(JSON.stringify({ windows: windows.length, records: receipt.count, uploadedBytes: bytes, verified: true }));
