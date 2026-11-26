import { readWorkerBatches, validateArchiveRanges, type HistorianArchiveRange } from './historianArchive.ts';

type ReceiptGrid = Parameters<typeof readWorkerBatches>[0];

export async function parseArchiveManifest(setting: string): Promise<HistorianArchiveRange[]> {
  const json = setting.startsWith('gzip:')
    ? await new Response(new Blob([Uint8Array.from(atob(setting.slice(5)), byte => byte.charCodeAt(0))])
      .stream().pipeThrough(new DecompressionStream('gzip'))).text()
    : setting;
  const entries = validateArchiveRanges(JSON.parse(json));
  if (!entries.length || entries.some(entry => !entry.sourceDigest)) throw new Error('Archive source audit receipts are missing');
  if (entries.some((entry, i) => i > 0 && Date.parse(entries[i - 1].end) !== Date.parse(entry.start))) {
    throw new Error('Historian archive manifest has a coverage gap');
  }
  return entries;
}

/** Extend pinned coverage with checksummed receipts from the private worker workbook. */
export async function appendWorkerArchiveReceipts(
  pinned: HistorianArchiveRange[], grid: ReceiptGrid, receiptSpreadsheetId: string,
): Promise<HistorianArchiveRange[]> {
  const existing = validateArchiveRanges(pinned);
  if (!existing.length || existing.some(entry => !entry.sourceDigest)) throw new Error('Audited base archive is required');
  const byStart = new Map(existing.map(entry => [Date.parse(entry.start), entry]));
  const cutoff = Date.parse(existing[existing.length - 1].end);
  for await (const records of readWorkerBatches(grid)) {
    for (const record of records) {
      const { table, start, end, count, digest, location } = JSON.parse(record);
      if (table !== 'historian_logs') continue;
      if (typeof start !== 'string' || typeof end !== 'string' || !Number.isSafeInteger(count) || count < 0 ||
          typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest)) throw new Error('Invalid historian verification receipt');
      if (Date.parse(end) <= cutoff) continue;

      let spreadsheetId = receiptSpreadsheetId;
      let range = 'A1';
      if (count > 0) {
        if (!location || typeof location.spreadsheetId !== 'string' || typeof location.sheetName !== 'string' || !location.sheetName ||
            !Number.isSafeInteger(location.firstRow) || location.firstRow < 2 ||
            !Number.isSafeInteger(location.lastRow) || location.lastRow - location.firstRow + 1 !== count) {
          throw new Error('Missing historian verification receipt location');
        }
        spreadsheetId = location.spreadsheetId;
        range = `'${location.sheetName.replaceAll("'", "''")}'!A${location.firstRow}:C${location.lastRow}`;
      } else if (location !== null) {
        throw new Error('Invalid empty historian verification receipt');
      }

      const entry: HistorianArchiveRange = { start, end, count, sourceDigest: digest, range, spreadsheetId, format: 'worker' };
      const previous = byStart.get(Date.parse(start));
      if (previous && (previous.end !== entry.end || previous.count !== entry.count || previous.sourceDigest !== entry.sourceDigest ||
          previous.range !== entry.range || previous.spreadsheetId !== entry.spreadsheetId || previous.format !== entry.format)) {
        throw new Error('Conflicting historian verification receipts');
      }
      byStart.set(Date.parse(start), previous ?? entry);
    }
  }
  const entries = validateArchiveRanges([...byStart.values()]);
  if (entries.some((entry, i) => i > 0 && Date.parse(entries[i - 1].end) !== Date.parse(entry.start))) {
    throw new Error('Historian verification receipts have a coverage gap');
  }
  return entries;
}
