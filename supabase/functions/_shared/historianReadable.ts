import type { ArchivedHistorianReading } from './historianArchive.ts';

export const readableTabs = ['Intake_Logs', 'WTP_Logs', 'OHT_1_Logs', 'OHT_2_Logs', 'Other_Logs'] as const;
export const readableLabels = ['Date (IST)', 'Time (IST)', 'ISO Timestamp', 'Instrument', 'Value', 'Received at', 'Source'];
export type ReadableTab = typeof readableTabs[number];
export type ReadableCell = string | number;

const date = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' });
const time = new Intl.DateTimeFormat('en-GB', { timeStyle: 'medium', timeZone: 'Asia/Kolkata' });

export function stationReadings(readings: ArchivedHistorianReading[]) {
  const tables = new Map<ReadableTab, ReadableCell[][]>(readableTabs.map(name => [name, []]));
  const ordered = [...readings].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp) ||
    (a.section ?? '').localeCompare(b.section ?? '') || a.tag_id.localeCompare(b.tag_id) || a.id.localeCompare(b.id));
  for (const row of ordered) {
    const oht = /^OHT-?([12])(?:[^0-9]|$)/i.exec(row.tag_id)?.[1];
    const name = oht === '1' ? 'OHT_1_Logs' : oht === '2' ? 'OHT_2_Logs'
      : row.section === 'wtp' ? 'WTP_Logs' : row.section === 'intake' ? 'Intake_Logs' : 'Other_Logs';
    const at = Date.parse(row.timestamp);
    tables.get(name)!.push([date.format(at), time.format(at), row.timestamp, row.tag_id, row.value ?? '',
      row.received_at ?? '', row.source ?? '']);
  }
  return tables;
}
