import { readFile } from 'node:fs/promises';
import { queryVerifiedArchive } from '../../supabase/functions/_shared/historianArchive.ts';
import { historianBackupGrid, readHistorianBackupRow } from '../../supabase/functions/_shared/historianBackupGrid.ts';
import { googleSheetsAccessToken, loadHistorianSheet } from '../../supabase/functions/_shared/historianSheets.ts';
import { checksum } from './backup.mjs';

const [receiptPath, credentialsPath, mode] = process.argv.slice(2);
if (!receiptPath || !credentialsPath) throw new Error('Usage: verify-api-backup.mjs <receipt.json> <credentials.json>');

const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
const { spreadsheetId, windows } = receipt;
if (!/^[\w-]{20,}$/.test(spreadsheetId) || !Array.isArray(windows) || !windows.length || windows.length > 288) {
  throw new Error('A workbook and up to one day of source receipts are required');
}
const empty = { historian_logs: [], alarms: [], historian_aggregates: [] };
const firstSlot = await historianBackupGrid(windows[0].start, empty);
const lastSlot = await historianBackupGrid(windows.at(-1).start, empty);
if (firstSlot.month !== lastSlot.month) throw new Error('Run the audit separately for each workbook month');
const entry = {
  start: windows[0].start,
  end: new Date(Date.parse(windows.at(-1).start) + 300_000).toISOString(),
  range: firstSlot.range.split(':')[0] + ':' + lastSlot.range.split(':')[1],
  spreadsheetId,
  count: windows.reduce((count, window) => count + window.historian, 0),
  sourceDigest: checksum(windows.map(window => window.digest)),
  format: 'sheets-api',
};
const credentials = await readFile(credentialsPath, 'utf8');
const accessToken = await googleSheetsAccessToken({ serviceAccount: credentials });
const grid = await loadHistorianSheet(entry, accessToken);
if (grid.length !== windows.length) throw new Error('Missing Google Sheets backup windows');
let alarms = 0;
let aggregates = 0;
for (const [index, row] of grid.entries()) {
  const expected = windows[index];
  const data = await readHistorianBackupRow(row, expected.start, expected.digest);
  if (data.historian_logs.length !== expected.historian || data.alarms.length !== expected.alarms ||
      data.historian_aggregates.length !== expected.aggregates) throw new Error('Source receipt counts differ');
  alarms += expected.alarms;
  aggregates += expected.aggregates;
}

const query = { start: entry.start, end: entry.end, offset: 0, limit: Math.max(1, entry.count), ascending: true };
const { rows } = await queryVerifiedArchive([entry], query, async () => grid);
const stationTabs = { intake: 'Intake_Logs', wtp: 'WTP_Logs', 'oht-1': 'OHT_1_Logs', 'oht-2': 'OHT_2_Logs' };
const grouped = new Map(Object.values(stationTabs).map(name => [name, []]));
for (const row of rows) {
  const oht = /^OHT-?([12])(?:[^0-9]|$)/i.exec(row.tag_id)?.[1];
  const name = stationTabs[oht ? 'oht-' + oht : row.section] ?? 'Other_Logs';
  if (!grouped.has(name)) grouped.set(name, []);
  grouped.get(name).push(row);
}
const stations = Object.fromEntries([...grouped].map(([name, records]) => [name, records.length]));
if (mode === '--publish-readable') {
  const token = await googleSheetsAccessToken({ serviceAccount: credentials, access: 'write' });
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const google = async (suffix, body) => {
    const response = await fetch(url + suffix, {
      method: body ? 'POST' : 'GET', headers, body: body && JSON.stringify(body), signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Readable pilot Sheet request failed (${response.status})`);
    return response.json();
  };
  const meta = await google('?fields=properties(title),sheets(properties(sheetId,title))');
  if (!meta.properties.title.startsWith('Shahpur SCADA Backup Pilot')) throw new Error('Expected a Shahpur pilot workbook');
  const date = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' });
  const time = new Intl.DateTimeFormat('en-GB', { timeStyle: 'medium', timeZone: 'Asia/Kolkata' });
  const labels = ['Date (IST)', 'Time (IST)', 'ISO Timestamp', 'Instrument', 'Value', 'Received at', 'Source'];
  const tables = [...grouped].map(([title, records]) => {
    const values = [labels, ...records.map(row => [date.format(Date.parse(row.timestamp)), time.format(Date.parse(row.timestamp)),
      row.timestamp, row.tag_id, row.value ?? '', row.received_at ?? '', row.source ?? ''])];
    return { title, values };
  });
  const existing = table => meta.sheets.some(sheet => sheet.properties.title === table.title);
  if (tables.some(existing) && !tables.every(existing)) throw new Error('Readable pilot tabs are only partially present');
  if (!tables.some(existing)) {
    let id = Math.max(...meta.sheets.map(sheet => sheet.properties.sheetId)) + 1;
    const requests = tables.flatMap(({ title, values }) => {
      const sheetId = id++;
      const range = { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: labels.length };
      return [
        { addSheet: { properties: { sheetId, title, gridProperties: {
          rowCount: Math.max(20, values.length + 1), columnCount: labels.length, frozenRowCount: 1,
        } } } },
        { updateCells: { start: { sheetId, rowIndex: 0, columnIndex: 0 }, rows: values.map(row => ({
          values: row.map(value => ({ userEnteredValue: typeof value === 'number' ? { numberValue: value } : { stringValue: value } })),
        })), fields: 'userEnteredValue' } },
        { repeatCell: { range, cell: { userEnteredFormat: {
          backgroundColor: { red: .11, green: .16, blue: .24 },
          textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
        } }, fields: 'userEnteredFormat' } },
        ...[120, 100, 250, 250, 120, 250, 180].map((pixelSize, startIndex) => ({
          updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex, endIndex: startIndex + 1 },
            properties: { pixelSize }, fields: 'pixelSize' },
        })),
      ];
    });
    if (Buffer.byteLength(JSON.stringify({ requests })) > 2_000_000) {
      throw new Error('Readable pilot exceeds the Sheets batch size budget');
    }
    await google(':batchUpdate', { requests });
  }
  const params = new URLSearchParams({ valueRenderOption: 'UNFORMATTED_VALUE' });
  for (const table of tables) params.append('ranges', `'${table.title}'!A:G`);
  const saved = await google('/values:batchGet?' + params);
  for (const [index, table] of tables.entries()) {
    const actual = saved.valueRanges?.[index]?.values;
    if (actual?.length !== table.values.length || !table.values.every((row, rowIndex) =>
      row.every((cell, col) => (actual[rowIndex]?.[col] ?? '') === cell))) {
      throw new Error('Readable tab differs from the source: ' + table.title);
    }
  }
}
console.log(JSON.stringify({ entry, verifiedWindows: windows.length, alarms, aggregates, stations }));
