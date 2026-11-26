import { readableLabels, readableTabs, stationReadings, type ReadableCell } from './historianReadable.ts';
import type { ArchivedHistorianReading } from './historianArchive.ts';

type SheetProperties = {
  title: string;
  sheetId: number;
  gridProperties: { rowCount: number; columnCount: number };
};

export async function writeHistorianStationTabs(
  workbook: string,
  token: string,
  stationPositions: Record<string, number>,
  readings: ArchivedHistorianReading[],
) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${workbook}`;
  const request = async <T>(path: string, payload?: unknown): Promise<T> => {
    const response = await fetch(url + path, {
      method: payload === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      redirect: 'error', signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Station sheets request failed (${response.status})`);
    return response.json() as Promise<T>;
  };
  const { sheets } = await request<{ sheets: { properties: SheetProperties }[] }>(
    '?fields=sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))',
  );
  const properties = new Map(sheets.map(sheet => [sheet.properties.title, sheet.properties]));
  let nextId = Math.max(0, ...sheets.map(sheet => sheet.properties.sheetId)) + 1;
  const data: { range: string; values: ReadableCell[][] }[] = [];
  const changes: unknown[] = [];
  const next = { ...stationPositions };
  const grouped = stationReadings(readings);
  for (const name of readableTabs) {
    const rows = grouped.get(name)!;
    const position = stationPositions[name] ?? 2;
    if (!Number.isSafeInteger(position) || position < 2) throw new Error('Invalid station sheet checkpoint');
    const existing = properties.get(name);
    if (!existing && position !== 2) throw new Error('Missing populated station tab');
    if (!existing && (name !== 'Other_Logs' || rows.length)) {
      changes.push({ addSheet: { properties: { sheetId: nextId++, title: name, gridProperties: {
        rowCount: Math.max(1000, position + rows.length), columnCount: readableLabels.length, frozenRowCount: 1,
      } } } });
    } else if (existing && rows.length && position + rows.length - 1 > existing.gridProperties.rowCount) {
      changes.push({ appendDimension: { sheetId: existing.sheetId, dimension: 'ROWS',
        length: Math.max(1000, position + rows.length - 1 - existing.gridProperties.rowCount) } });
    }
    if (!existing && name === 'Other_Logs' && !rows.length) continue;
    data.push({ range: `'${name}'!A1:G1`, values: [readableLabels] });
    if (rows.length) data.push({ range: `'${name}'!A${position}:G${position + rows.length - 1}`, values: rows });
    next[name] = position + rows.length;
  }
  if (changes.length) await request(':batchUpdate', { requests: changes });
  const params = new URLSearchParams({ valueRenderOption: 'UNFORMATTED_VALUE' });
  data.forEach(block => params.append('ranges', block.range));
  const read = async () => {
    const { valueRanges } = await request<{ valueRanges: { values?: ReadableCell[][] }[] }>('/values:batchGet?' + params);
    if (valueRanges?.length !== data.length) throw new Error('Missing station sheet ranges');
    return valueRanges;
  };
  const matches = (actual: ReadableCell[][], expected: ReadableCell[][]) =>
    actual.length <= expected.length && expected.every((row, i) =>
      row.every((cell, j) => (actual[i]?.[j] ?? '') === cell));
  const existing = await read();
  const missing = data.filter(({ values }, index) => {
    const prior = existing[index].values ?? [];
    if (!prior.some(row => row.some(cell => cell !== ''))) return true;
    if (!matches(prior, values)) throw new Error('Station sheet contains conflicting readings');
    return false;
  });
  if (missing.length) {
    const payload = { valueInputOption: 'RAW', data: missing };
    if (new TextEncoder().encode(JSON.stringify(payload)).length > 2_000_000) throw new Error('Station sheet write is too large');
    await request('/values:batchUpdate', payload);
    const saved = await read();
    if (!data.every(({ values }, index) => matches(saved[index].values ?? [], values))) {
      throw new Error('Station sheet readback failed');
    }
  }
  return next;
}
