import type { HistorianArchiveRange } from './historianArchive.ts';
import { historianBackupSlot } from './historianBackupGrid.ts';

export const backupArchiveReadBlockMs = 6 * 3600_000;

export interface BackupReceipt {
  window_start: string;
  month: string;
  digest: string;
  readings: number;
  spreadsheet_id: string;
}

export async function backupReceiptRanges(receipts: BackupReceipt[]): Promise<HistorianArchiveRange[]> {
  const ranges: HistorianArchiveRange[] = [];
  let group: BackupReceipt[] = [];
  let previous = -Infinity;
  const flush = async () => {
    if (!group.length) return;
    const first = group[0];
    const last = group[group.length - 1];
    const from = historianBackupSlot(first.window_start);
    const to = historianBackupSlot(last.window_start);
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256',
      new TextEncoder().encode(group.map(receipt => receipt.digest).join('\n'))));
    ranges.push({
      spreadsheetId: first.spreadsheet_id, range: `'Raw Backup'!A${from.row}:AD${to.row}`,
      start: new Date(from.start).toISOString(), end: new Date(to.start + 300_000).toISOString(),
      count: group.reduce((sum, receipt) => sum + receipt.readings, 0),
      sourceDigest: [...hash].map(byte => byte.toString(16).padStart(2, '0')).join(''),
      format: 'sheets-api',
    });
    group = [];
  };
  for (const receipt of receipts) {
    const { start, month } = historianBackupSlot(receipt.window_start);
    if (start <= previous || month !== receipt.month || !/^[\w-]{20,}$/.test(receipt.spreadsheet_id) ||
        !/^[0-9a-f]{64}$/.test(receipt.digest) || !Number.isSafeInteger(receipt.readings) || receipt.readings < 0) {
      throw new Error('Invalid backup receipt');
    }
    // Bound each Sheets read and keep cache keys stable for completed blocks.
    if (group.length && (start !== previous + 300_000 || start % backupArchiveReadBlockMs === 0 ||
        group[0].spreadsheet_id !== receipt.spreadsheet_id)) await flush();
    group.push(receipt);
    previous = start;
  }
  await flush();
  return ranges;
}
