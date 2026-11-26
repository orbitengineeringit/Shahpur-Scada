import { readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { readArchiveGrid, readRecoveryBatches, readRecoveryGrid } from '../../supabase/functions/_shared/historianArchive.ts';

async function restore() {
  const [format, input, expectedCount, output] = process.argv.slice(2);
  const count = Number(expectedCount);
  if (!['recovery', 'worker', 'alarms', 'aggregates'].includes(format) || !input || !output || !Number.isSafeInteger(count) || count < 1) {
    throw new Error('Usage: node restore-sheet.mjs <recovery|worker|alarms|aggregates> <Sheets values.json> <expected source count> <output.jsonl.gz>');
  }
  const document = JSON.parse(await readFile(input, 'utf8'));
  const grid = Array.isArray(document) ? document : document.values;
  if (!Array.isArray(grid) || grid.some(row => !Array.isArray(row))) throw new Error('Sheets values must contain a grid');
  let readings;
  if (format === 'alarms' || format === 'aggregates') {
    readings = [];
    const dateField = format === 'alarms' ? 'created_at' : 'bucket_start';
    for await (const records of readRecoveryBatches(grid, format === 'aggregates')) {
      for (const record of records) {
        const row = JSON.parse(record);
        if (typeof row?.id !== 'string' || typeof row[dateField] !== 'string' || !Number.isFinite(Date.parse(row[dateField]))) {
          throw new Error(`Invalid archived ${format} record`);
        }
        readings.push(row);
      }
    }
  } else {
    readings = await (format === 'recovery' ? readRecoveryGrid(grid) : readArchiveGrid(grid));
  }
  if (readings.length !== count || new Set(readings.map(row => row.id)).size !== count) {
    throw new Error(`Restored ${readings.length} rows. Expected ${count} unique source records.`);
  }
  await writeFile(output, gzipSync(readings.map(row => JSON.stringify(row)).join('\n') + '\n'), { flag: 'wx', mode: 0o600 });
  console.log(`Restored and verified ${count} original records (${format})`);
}

restore().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
