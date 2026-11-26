import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { appendWorkerArchiveReceipts, parseArchiveManifest } from '../../supabase/functions/_shared/historianWorkerManifest.ts';

async function run() {
  const args = process.argv.slice(2);
  const zip = args[0] === '--gzip';
  const [basePath, ...workbookPaths] = zip ? args.slice(1) : args;
  if (!basePath) {
    throw new Error('Usage: node extend-read-manifest.mjs [--gzip] <audited-base.json> [receipt-values.json ...]');
  }
  const base = JSON.parse(await readFile(basePath, 'utf8'));
  let ranges = await parseArchiveManifest(JSON.stringify(Array.isArray(base) ? base : base.windows));
  for (const path of workbookPaths) {
    const { spreadsheetId, values } = JSON.parse(await readFile(path, 'utf8'));
    if (!/^[A-Za-z0-9_-]{15,}$/.test(spreadsheetId ?? '') || !Array.isArray(values) ||
        values.some(row => !Array.isArray(row))) throw new Error('Expected the private receipt spreadsheet ID and values grid');
    ranges = await appendWorkerArchiveReceipts(ranges, values, spreadsheetId);
  }
  const json = JSON.stringify(ranges.map(({ spreadsheetId, range, format, start, end, count, sourceDigest }) =>
    ({ spreadsheetId, range, format, start, end, count, sourceDigest })));
  const setting = zip ? 'gzip:' + gzipSync(json).toString('base64') : json;
  if (zip && setting.length > 24_576) throw new Error('Compressed manifest exceeds the Supabase per-secret limit');
  console.log(setting);
}

run().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
