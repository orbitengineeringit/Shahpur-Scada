export type DateWindow = { start: string; end: string };
export type HistorianDateWindow = DateWindow & { archived: boolean };

export function partitionHistorianDates(range: DateWindow, archived: DateWindow[], floor = -Infinity): HistorianDateWindow[] {
  let cursor = Math.max(Date.parse(range.start), floor);
  const end = Date.parse(range.end);
  const parts: HistorianDateWindow[] = [];
  const add = (from: number, to: number, archive: boolean) => {
    if (from >= to) return;
    parts.push({ start: new Date(from).toISOString(), end: new Date(to).toISOString(), archived: archive });
  };
  const ranges = archived.map(window => ({ start: Date.parse(window.start), end: Date.parse(window.end) }))
    .sort((a, b) => a.start - b.start);
  for (const window of ranges) {
    const from = Math.max(cursor, window.start);
    const to = Math.min(end, window.end);
    if (from >= to) continue;
    add(cursor, from, false);
    add(from, to, true);
    cursor = to;
  }
  add(cursor, end, false);
  return parts;
}
