import assert from 'node:assert/strict';
import { createHmac, generateKeyPairSync, verify } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { gunzipSync, gzipSync } from 'node:zlib';
import { archiveMonth, archiveTable, canonical, checksum } from '../scripts/historian-archive/backup.mjs';
import { createVerifiedArchiveCache, queryVerifiedArchive, readArchiveGrid, readArchiveRecovery, readRecoveryGrid } from '../supabase/functions/_shared/historianArchive.ts';
import { googleSheetsAccessToken, loadHistorianSheet } from '../supabase/functions/_shared/historianSheets.ts';
import { appendWorkerArchiveReceipts } from '../supabase/functions/_shared/historianWorkerManifest.ts';
import { historianBackupGrid, readHistorianBackupRow } from '../supabase/functions/_shared/historianBackupGrid.ts';
import { backupReceiptRanges } from '../supabase/functions/_shared/historianBackupReceipts.ts';
import { stationReadings } from '../supabase/functions/_shared/historianReadable.ts';
import { partitionHistorianDates } from '../src/lib/historianDateWindows.ts';

test('history, trends and export split the legacy archive, live gap and new backup at exact boundaries', () => {
  const time = hour => `2026-11-26T0${hour}:00:00.000Z`;
  const range = (start, end) => ({ start: time(start), end: time(end) });
  const archived = [range(4, 7), range(0, 2)];
  assert.deepEqual(partitionHistorianDates(range(0, 9), archived, Date.parse(time(1))), [
    { ...range(1, 2), archived: true }, { ...range(2, 4), archived: false },
    { ...range(4, 7), archived: true }, { ...range(7, 9), archived: false },
  ]);
  assert.deepEqual(partitionHistorianDates(range(3, 5), archived), [
    { ...range(3, 4), archived: false }, { ...range(4, 5), archived: true },
  ]);
});

test('monthly backup receipts preserve gaps, fixed row ranges and workbook boundaries', async () => {
  const rows = [
    ['2026-11-30T18:20:00Z', '2026-11', 'private-November-workbook'],
    ['2026-11-30T18:25:00Z', '2026-11', 'private-November-workbook'],
    ['2026-11-30T18:30:00Z', '2026-12', 'private-December-workbook'],
    ['2026-11-30T18:40:00Z', '2026-12', 'private-December-workbook'],
  ].map(([window_start, month, spreadsheet_id], i) => ({ window_start, month, spreadsheet_id,
    readings: i, digest: String(i).repeat(64) }));
  const entries = await backupReceiptRanges(rows);
  assert.deepEqual(entries.map(({ range, count }) => [range, count]), [
    ["'Raw Backup'!A8640:AD8641", 1], ["'Raw Backup'!A2:AD2", 2], ["'Raw Backup'!A4:AD4", 3],
  ]);
  assert.equal(entries[0].sourceDigest, checksum(rows.slice(0, 2).map(row => row.digest)));
  await assert.rejects(backupReceiptRanges([...rows].reverse()), /Invalid backup receipt/);
});

test('automatic station tabs preserve zero, null and separate OHT records', () => {
  const sample = { timestamp: '2026-11-30T18:30:00Z', received_at: null, source: 'snapshot-5min' };
  const grouped = stationReadings([
    { ...sample, section: 'oht', id: '2', tag_id: 'OHT2-LT', value: 0 },
    { ...sample, section: 'oht', id: '1', tag_id: 'OHT1-LT', value: null },
  ]);
  assert.deepEqual(grouped.get('OHT_1_Logs')[0].slice(2), [sample.timestamp, 'OHT1-LT', '', '', sample.source]);
  assert.deepEqual(grouped.get('OHT_2_Logs')[0].slice(2), [sample.timestamp, 'OHT2-LT', 0, '', sample.source]);
  assert.equal(grouped.get('Intake_Logs').length, 0);
});

test('Sheets API shadow maps IST monthly slots deterministically and preserves source JSON bytes', async () => {
  const start = '2026-11-30T18:30:00.000Z';
  const rows = { historian_logs: ['{"value":9007199254740993,"tag_id":"WTP-1"}'],
    alarms: ['{"message":"पंप"}'], historian_aggregates: [] };
  const a = await historianBackupGrid(start, rows);
  const b = await historianBackupGrid(start, rows);
  assert.deepEqual(a, b);
  assert.equal(a.month, '2026-12');
  assert.equal(a.range, "'Raw Backup'!A2:AD2");
  assert.deepEqual(a.cells.slice(3, 6), [1, 1, 0]);
  const compressed = Buffer.concat(a.cells.slice(6).filter(Boolean).map(chunk => Buffer.from(chunk, 'base64')));
  const raw = gunzipSync(compressed).toString('utf8');
  assert.deepEqual(JSON.parse(raw), rows);
  assert.equal(a.cells[2], checksum([raw]));
  assert.match((await historianBackupGrid('2026-11-30T18:25:00.000Z', rows)).range, /A8641:AD8641$/);
  await assert.rejects(historianBackupGrid('2026-11-30T18:31:00.000Z', rows), /Invalid finalized/);
});

test('verified Sheets API ranges preserve original history filters and reject missing or changed windows', async () => {
  const start = '2026-11-26T08:00:00.000Z';
  const next = '2026-11-26T08:05:00.000Z';
  const end = '2026-11-26T08:10:00.000Z';
  const reading = { id: 'one', tag_id: 'OHT2-LT', section: 'oht', timestamp: start, value: 0 };
  const snapshot = { historian_logs: [JSON.stringify(reading)], alarms: [], historian_aggregates: [] };
  const first = await historianBackupGrid(start, snapshot);
  const last = await historianBackupGrid(next, { ...snapshot, historian_logs: [] });
  const grid = [first.cells, last.cells];
  const manifest = [{
    spreadsheetId: 'private-workbook-test', range: 'Raw Backup!A2:AD3', format: 'sheets-api',
    start, end, count: 1, sourceDigest: checksum([first.cells[2], last.cells[2]]),
  }];
  const query = { start, end, assets: ['oht-2'], limit: 10, offset: 0 };
  assert.deepEqual(await readHistorianBackupRow(first.cells, start, first.cells[2]), snapshot);
  const damaged = [...first.cells];
  damaged[3] = 2;
  await assert.rejects(readHistorianBackupRow(damaged, start), /counts/);
  assert.deepEqual(await queryVerifiedArchive(manifest, query, async () => grid), {
    coverage: [{ start, end }], count: 1, rows: [reading],
  });
  assert.equal((await queryVerifiedArchive(manifest, { ...query, assets: ['oht-1'] }, async () => grid)).count, 0);
  await assert.rejects(queryVerifiedArchive(manifest, query, async () => [first.cells]), /coverage/);
  await assert.rejects(queryVerifiedArchive(manifest, query, async () => [...grid].reverse()), /checksum/);
});

test('private recovery cache checks exact archived bytes and avoids a Sheets read', async () => {
  const row = { id: 'sample', tag_id: 'WTP-PT1', section: 'wtp', timestamp: '2026-11-05T00:05:00Z', value: 0 };
  const raw = JSON.stringify(row) + '\n';
  const entry = { spreadsheetId: 'archive-workbook-test', range: 'Sheet1!A2:H2', format: 'recovery',
    start: '2026-11-05T00:00:00Z', end: '2026-11-05T01:00:00Z', count: 1,
    sourceDigest: 'a'.repeat(64), recoveryDigest: checksum([JSON.stringify(row), '']) };
  const compressed = () => new Blob([gzipSync(raw)]).stream();
  const cached = createVerifiedArchiveCache(100, 1000, range => readArchiveRecovery(range, compressed()));
  const loadSheets = () => { throw new Error('Verified storage hit must not read Google Sheets'); };
  assert.deepEqual(await cached(entry, loadSheets), [row]);
  await assert.rejects(readArchiveRecovery({ ...entry, recoveryDigest: 'b'.repeat(64) }, compressed()), /checksum mismatch/);
  await assert.rejects(readArchiveRecovery({ ...entry, count: 2 }, compressed()), /verified coverage/);
});

test('backfill verifies readback and resumes without appending a completed window', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'shahpur-archive-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const cutoff = '2026-11-05T00:00:00Z';
  const record = { id: '1', timestamp: '2026-10-31T18:30:00Z', value: 0, received_at: null, tag_id: 'WTP-1' };
  const exportRow = { id: 'report-1', created_at: record.timestamp, file_path: 'reports/test file.zip' };
  const exportBytes = Buffer.alloc(25000, 0x9a);
  assert.equal(archiveMonth(record.timestamp), '2026-11');
  const secret = 'fixture-secret';
  const variables = { SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture',
    ARCHIVE_SCRIPT_URL: 'https://script.google.com/macros/s/fixture/exec', ARCHIVE_SECRET: secret };
  const original = Object.fromEntries(Object.keys(variables).map(key => [key, process.env[key]]));
  Object.assign(process.env, variables);
  t.after(() => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const batches = new Map();
  const mockedFetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (new URL(url).hostname === 'fixture.invalid') {
      if (new URL(url).pathname.startsWith('/storage/')) {
        assert.match(new URL(url).pathname, /data-exports\/reports\/test%20file\.zip$/);
        return new Response(exportBytes);
      }
      if (options.method === 'HEAD') return new Response(null, { headers: { 'Content-Range': '0-0/1' } });
      const row = new URL(url).pathname.endsWith('/data_exports') ? exportRow : record;
      return Response.json(new URL(url).searchParams.has('or') ? [] : [row]);
    }
    const { body, sentAt, signature } = JSON.parse(options.body);
    assert.equal(signature, createHmac('sha256', secret).update(`${sentAt}.${body}`).digest('hex'));
    const batch = JSON.parse(body);
    if (batch.action === 'write') batches.set(batch.digest, batch.records);
    const records = batches.get(batch.digest);
    return Response.json({ ok: true, count: records.length, records, spreadsheetId: 'sheet-fixture', row: 2 });
  });
  const checkpoint = await archiveTable(directory, 'historian_logs', cutoff, null);
  assert.equal(checkpoint.count, 1);
  assert.equal(checkpoint.completed, true);
  const digest = checksum([canonical(record)]);
  assert.equal(batches.size, 1);
  const files = await readdir(directory);
  const gzipFile = files.find(file => file.endsWith('.jsonl.gz'));
  assert.deepEqual(JSON.parse(gunzipSync(await readFile(join(directory, gzipFile)))), record);
  const receipt = JSON.parse(await readFile(join(directory, `historian_logs-2026-11-${digest}.verified.json`)));
  assert.equal(receipt.digest, digest);
  assert.equal(receipt.spreadsheetId, 'sheet-fixture');
  const requests = mockedFetch.mock.callCount();
  await archiveTable(directory, 'historian_logs', cutoff, null);
  assert.equal(mockedFetch.mock.callCount(), requests);

  await archiveTable(directory, 'data_exports', cutoff, null);
  const chunks = [...batches.values()].flat().map(JSON.parse).filter(row => row.export_id === exportRow.id);
  assert.equal(chunks.length, 2);
  assert.deepEqual(Buffer.concat(chunks.map(chunk => Buffer.from(chunk.base64, 'base64'))), exportBytes);
  assert.deepEqual(await readFile(join(directory, `export-object-${chunks[0].sha256}.bin`)), exportBytes);
});

test('owner-run pull advances its watermark only after matching Sheets readback', async () => {
  const source = await readFile(new URL('../scripts/historian-archive/Pull.gs', import.meta.url), 'utf8');
  const time = '2026-11-30T18:25:00.000Z';
  const rows = [time, '2026-11-30T18:30:00.000Z'].map((timestamp, i) => ({
    time: timestamp, id: 'reading-' + i, body: JSON.stringify({ id: 'reading-' + i, value: i }),
  }));
  const properties = new Map([
    ['ARCHIVE_SOURCE_STARTS', JSON.stringify({ historian_logs: time })], ['ARCHIVE_FOLDER_ID', 'fixture'],
  ]);
  let corrupt = true;
  const writes = new Map();
  const clock = class extends Date { static now() { return Date.parse('2026-11-30T18:45:00.000Z'); } };
  const runner = runInNewContext(`${source}\narchivePullPage = function (_, table, start, end, cursor, verify) {
    if (verify) return {count: 2, digest: fixtureDigest(fixtureDigest(fixtureRows.map(row => row.body).join('\\n')))};
    return cursor ? [] : fixtureRows;
  }; archivePullDigest = function (s) { return fixtureDigest(s); }; archivePullRun;`, {
    Date: clock, fixtureRows: rows, fixtureDigest: value => checksum([value]),
    LockService: { getUserLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: key => properties.get(key), setProperty: (key, value) => properties.set(key, value),
    }) },
    Utilities: { formatDate: date => new Date(date.getTime() + 330 * 60000).toISOString().slice(0, 7) },
    archiveBatch: batch => {
      if (batch.action === 'write') writes.set(batch.digest, batch.records);
      const records = writes.get(batch.digest);
      return { spreadsheetId: 'fixture_archive_sheet', sheetName: 'Sheet1', row: 2,
        count: records.length, records: corrupt ? ['{}'] : records };
    },
  });
  assert.throws(runner, /readback mismatch/);
  assert.equal(properties.has('ARCHIVE_CURSOR_historian_logs'), false);
  corrupt = false;
  runner();
  assert.equal(writes.size, 2);
  const receipt = [...writes.values()].map(records => JSON.parse(records[0])).find(row => row.table === 'historian_logs');
  assert.deepEqual(receipt.location, { spreadsheetId: 'fixture_archive_sheet', sheetName: 'Sheet1', firstRow: 2, lastRow: 3 });
  assert.deepEqual(JSON.parse(properties.get('ARCHIVE_CURSOR_historian_logs')), {
    start: '2026-11-30T18:35:00.000Z', count: 2, parts: { '2026-11': { part: 1, count: 2 } },
  });
});

test('scheduled backup retries a late raw reading and waits for the finalized hourly bucket', async () => {
  const source = await readFile(new URL('../scripts/historian-archive/Pull.gs', import.meta.url), 'utf8');
  const rawStart = '2026-11-25T21:50:00.000Z';
  const hourlyStart = '2026-11-25T21:00:00.000Z';
  const raw = [
    { id: 'late', time: '2026-11-25T21:51:00.000Z', body: '{"id":"late","value":0}' },
    { id: 'original', time: '2026-11-25T21:53:00.000Z', body: '{"id":"original","value":2}' },
  ];
  const hourly = [{ id: 'hour', time: hourlyStart, body: '{"id":"hour","avg_value":1}' }];
  const properties = new Map([
    ['ARCHIVE_SOURCE_STARTS', JSON.stringify({ historian_logs: rawStart, historian_aggregates: hourlyStart })],
    ['ARCHIVE_FOLDER_ID', 'fixture'],
  ]);
  let lateRead = false;
  let now = '2026-11-25T22:08:00.000Z';
  const writes = new Map();
  const sourceCalls = [];
  const digest = text => checksum([text]);
  function page(_, table, start, end, cursor, verify) {
    sourceCalls.push({ table, start, end });
    if (table === 'historian_logs' && verify) lateRead = true;
    const data = table === 'historian_logs' ? (lateRead ? raw : raw.slice(1)) : hourly;
    const rows = data.filter(row => row.time >= start && row.time < end && (!cursor || row.time > cursor.time));
    if (verify) return { count: rows.length, digest: digest(rows.length ? checksum(rows.map(row => row.body)) : '') };
    return rows;
  }
  const runner = runInNewContext(`${source}\narchivePullPage = fixturePage; archivePullDigest = fixtureDigest; archivePullRun;`, {
    Date: class extends Date { static now() { return Date.parse(now); } },
    fixturePage: page, fixtureDigest: digest,
    LockService: { getUserLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: key => properties.get(key), setProperty: (key, value) => properties.set(key, value),
    }) },
    Utilities: { formatDate: () => '2026-11' },
    archiveBatch: batch => {
      const key = [batch.table, batch.part, batch.digest].join('/');
      if (batch.action === 'write') {
        writes.set(key, batch.records);
      }
      const records = writes.get(key);
      return { spreadsheetId: 'fixture_data_sheet_' + batch.part, sheetName: 'Sheet1', row: 2, count: records.length, records };
    },
  });
  runner();
  assert.equal(sourceCalls.some(call => call.table === 'historian_aggregates'), false);
  const receipts = () => [...writes].filter(([key]) => key.startsWith('pull_verification/'))
    .map(([, records]) => JSON.parse(records[0]));
  assert.equal(receipts().length, 1);
  assert.equal(receipts()[0].count, 2);
  assert.equal(receipts()[0].location.spreadsheetId, 'fixture_data_sheet_2');
  assert.equal([...writes.keys()].filter(key => key.startsWith('pull_historian_logs/')).length, 2);
  assert.equal(JSON.parse(properties.get('ARCHIVE_CURSOR_historian_logs')).count, 2);
  now = '2026-11-25T22:12:00.000Z';
  runner();
  assert.equal(receipts().find(receipt => receipt.table === 'historian_aggregates').count, 1);
  assert.equal(JSON.parse(properties.get('ARCHIVE_CURSOR_historian_aggregates')).start, '2026-11-25T22:00:00.000Z');
});

test('worker receipts extend archive reads with exact readings and explicit empty windows', async () => {
  const start = '2026-11-25T22:05:00.000Z';
  const end = '2026-11-25T22:10:00.000Z';
  const emptyEnd = '2026-11-25T22:15:00.000Z';
  const pinned = [{ start: '2026-11-25T21:45:00.000Z', end: start, count: 24,
    sourceDigest: 'a'.repeat(64), format: 'recovery', spreadsheetId: 'fixture_base_sheet', range: 'A1:H3' }];
  const reading = { id: 'new-reading', tag_id: 'WTP-Flow-OUT', value: 0, timestamp: start };
  const body = canonical(reading);
  const batchDigest = checksum([body]);
  const first = { table: 'historian_logs', start, end, count: 1, digest: checksum([batchDigest]),
    location: { spreadsheetId: 'fixture_data_sheet', sheetName: "Owner's data", firstRow: 2, lastRow: 2 } };
  const empty = { table: 'historian_logs', start: end, end: emptyEnd, count: 0, digest: checksum([]), location: null };
  const gridOf = receipts => receipts.map(receipt => {
    const record = JSON.stringify(receipt);
    return [checksum([record]), 1, record];
  });
  const entries = await appendWorkerArchiveReceipts(pinned, gridOf([first, empty]), 'fixture_receipt_sheet');
  assert.equal(entries[1].range, "'Owner''s data'!A2:C2");
  const found = await queryVerifiedArchive(entries, { start, end: emptyEnd, offset: 0, limit: 10 }, async entry => {
    assert.equal(entry.spreadsheetId, 'fixture_data_sheet');
    return [[batchDigest, 1, body]];
  });
  assert.deepEqual(found.rows, [reading]);
  assert.equal(found.coverage.length, 2);
  await assert.rejects(appendWorkerArchiveReceipts(pinned, gridOf([empty]), 'fixture_receipt_sheet'), /coverage gap/);
  await assert.rejects(appendWorkerArchiveReceipts(pinned, gridOf([first, { ...first, digest: 'f'.repeat(64) }]),
    'fixture_receipt_sheet'), /Conflicting/);
});

test('both Sheets formats restore original historian records and fail on damage', async () => {
  const fixture = [
    { id: 'a', tag_id: 'INT-Flow-आउट', section: 'intake', value: 0, timestamp: '2026-09-22T08:45:00.123456+00:00', received_at: null, tag_config_id: 'tag-id', source: 'backend:5min' },
    { id: 'b', tag_id: 'WTP-Flow-OUT', section: 'wtp', value: null, timestamp: '2026-09-22T08:50:00+00:00', received_at: '2026-09-22T08:54:59.000001+00:00', tag_config_id: null, source: null },
  ];
  const records = fixture.map(canonical);
  const sha = checksum(records);
  const bytes = Buffer.from(records.join('\n'));
  const split = bytes.indexOf(Buffer.from('आ')) + 1;
  const recovery = [
    ['Date window', '2026-09-22 UTC'], ['Batch', 'Records', 'SHA-256'],
    [0, '2', sha, `b64:${bytes.subarray(0, split).toString('base64')}`, `b64:${bytes.subarray(split).toString('base64')}`],
  ];
  const archive = [['Batch SHA-256', 'Row count', 'Original record JSON'], [sha, 2, records[0]], ['', '', records[1]]];
  assert.deepEqual(await readRecoveryGrid(recovery), fixture);
  assert.deepEqual(await readArchiveGrid(archive), fixture);
  await assert.rejects(readRecoveryGrid(recovery.map(row => row.slice(0, 4))), /checksum mismatch/);
  await assert.rejects(readArchiveGrid(archive.slice(0, 2)), /Incomplete historian archive batch/);
});

test('verified archive serves exact filtered records across ranges and rejects incomplete coverage', async () => {
  const records = [
    { id: 'first', tag_id: 'WTP-Flow-OUT', section: 'wtp', timestamp: '2026-09-22T08:45:00.001234+00:00', value: 0 },
    { id: 'second', tag_id: 'WTP-Flow-OUT', section: 'wtp', timestamp: '2026-09-23T08:45:00+00:00', value: null },
  ];
  const ranges = [22, 23].map((day, index) => ({
    start: `2026-09-${day}T00:00:00Z`, end: `2026-09-${day + 1}T00:00:00Z`, count: 1,
    format: 'worker', range: `A${index + 2}:C${index + 2}`, spreadsheetId: 'fixture_test_sheet',
  }));
  const loadGrid = async entry => {
    const body = canonical(records[ranges.indexOf(entry)]);
    return [[checksum([body]), 1, body]];
  };
  const query = { start: ranges[0].start, end: ranges[1].end, tagIds: ['WTP-Flow-OUT'], offset: 1, limit: 1 };
  const pinned = ranges.map((entry, i) => ({ ...entry, sourceDigest: checksum([checksum([canonical(records[i])])]) }));
  assert.equal((await queryVerifiedArchive(pinned, query, entry => loadGrid(ranges.find(r => r.start === entry.start)))).count, 2);
  const changed = canonical({ ...records[0], value: 1 });
  await assert.rejects(queryVerifiedArchive([pinned[0]], query,
    async () => [[checksum([changed]), 1, changed]]), /audited source checksum/);
  const result = await queryVerifiedArchive(ranges, query, loadGrid);
  assert.equal(result.count, 2);
  assert.deepEqual(result.rows, [records[0]]);
  assert.equal((await queryVerifiedArchive(ranges, { ...query, assets: ['oht-1'] }, loadGrid)).count, 0);
  assert.equal((await queryVerifiedArchive(ranges, { ...query, assets: ['wtp'], snapshotsOnly: true }, loadGrid)).count, 2);
  assert.equal((await queryVerifiedArchive(ranges, { ...query, excludeTagIds: ['WTP-Flow-OUT'] }, loadGrid)).count, 0);
  await assert.rejects(queryVerifiedArchive([...ranges, ranges[0]], query, loadGrid), /overlapping/);
  await assert.rejects(queryVerifiedArchive(ranges, query, async () => []), /verified coverage/);
});

test('archive pages share verified Sheet reads and never cache a failed checksum', async () => {
  const records = ['a', 'b'].map((id, i) => ({
    id, tag_id: 'WTP-Flow-OUT', section: 'wtp', timestamp: `2026-09-2${i + 2}T08:45:00+00:00`, value: i,
  }));
  const entries = records.map((record, i) => ({
    spreadsheetId: 'fixture_test_sheet', range: `A${i + 2}:C${i + 2}`, format: 'worker', count: 1,
    start: `2026-09-2${i + 2}T00:00:00Z`, end: `2026-09-2${i + 3}T00:00:00Z`,
    sourceDigest: checksum([checksum([canonical(record)])]),
  }));
  const readWindow = createVerifiedArchiveCache(1, 60_000);
  let sheetReads = 0;
  let damaged = true;
  async function load(entry) {
    sheetReads++;
    const original = records[entries.indexOf(entry)];
    const body = canonical(damaged ? { ...original, value: 123 } : original);
    return [[checksum([body]), 1, body]];
  }
  function page(entry) {
    return queryVerifiedArchive(entries, { start: entry.start, end: entry.end, offset: 0, limit: 1 }, load, readWindow);
  }
  await assert.rejects(page(entries[0]), /audited source checksum/);
  damaged = false;
  const pages = await Promise.all([page(entries[0]), page(entries[0])]);
  assert.deepEqual(pages.map(result => result.rows), [[records[0]], [records[0]]]);
  assert.equal(sheetReads, 2);
  assert.deepEqual((await page(entries[0])).rows, [records[0]]);
  assert.equal(sheetReads, 2);
  await page(entries[1]);
  await page(entries[0]);
  assert.equal(sheetReads, 4);
});

test('Google Sheets retries a temporary failure and returns the original grid', async t => {
  const grid = [['Date window', '2026-09-22']];
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    requests++;
    return requests === 1 ? new Response('Unavailable', { status: 503 }) : Response.json({ values: grid });
  });
  assert.deepEqual(await loadHistorianSheet({ spreadsheetId: 'fixture_test_sheet', range: 'A1:B1' }, 'fixture'), grid);
  assert.equal(requests, 2);
});

test('archive service account signs an assertion limited to Google Sheets read-only access', async t => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const email = 'test@fixture.iam.gserviceaccount.com';
  const serviceAccount = JSON.stringify({client_email: email, private_key_id: 'a'.repeat(40),
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' })});
  t.mock.method(globalThis, 'fetch', async (url, { body }) => {
    assert.equal(url, 'https://oauth2.googleapis.com/token');
    assert.equal(body.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
    const [header, payload, signature] = body.get('assertion').split('.');
    const claims = JSON.parse(Buffer.from(payload, 'base64url'));
    assert.equal(claims.iss, email);
    assert.equal(claims.aud, url);
    assert.equal(claims.scope, 'https://www.googleapis.com/auth/spreadsheets.readonly');
    assert.equal(claims.exp - claims.iat, 3600);
    assert.equal(claims.sub, undefined);
    assert.ok(verify('sha256', Buffer.from(header + '.' + payload), publicKey, Buffer.from(signature, 'base64url')));
    return Response.json({ access_token: 'fixture-only' });
  });
  assert.equal(await googleSheetsAccessToken({ serviceAccount }), 'fixture-only');
});

test('readable history groups all four Shahpur stations without inventing readings', async () => {
  const source = await readFile(new URL('../scripts/historian-archive/Readable.gs', import.meta.url), 'utf8');
  const saved = new Map();
  const group = runInNewContext(`${source}
    writeReadableTab = (_, name, rows) => recordTab(name, rows);
    writeReadableReadings;`, {
    recordTab: (name, rows) => saved.set(name, rows),
  });
  const timestamp = '2026-11-25T20:30:00+00:00';
  const readings = [
    { section: 'intake', tag_id: 'INT-LT', value: 0, timestamp },
    { section: 'wtp', tag_id: 'WTP-PH', value: 8.91, timestamp },
    { section: 'oht', tag_id: 'OHT1-LT', value: 44, timestamp },
  ];
  const workbook = { getSheetByName: () => undefined };
  group(workbook, readings);
  assert.deepEqual([...saved.keys()], ['Intake_Logs', 'WTP_Logs', 'OHT_1_Logs', 'OHT_2_Logs']);
  assert.equal(saved.get('Intake_Logs').get(timestamp).get('INT-LT').value, 0);
  assert.equal(saved.get('WTP_Logs').get(timestamp).get('WTP-PH').value, 8.91);
  assert.equal(saved.get('OHT_1_Logs').get(timestamp).get('OHT1-LT').value, 44);
  assert.equal(saved.get('OHT_2_Logs').size, 0);
  group(workbook, [...readings, { section: 'oht', tag_id: 'OHT2-Flow', value: -2786.41, timestamp }]);
  assert.equal(saved.get('OHT_2_Logs').get(timestamp).get('OHT2-Flow').value, -2786.41);
});

test('readable history appends after a sorted tail and updates a retried timestamp in place', async () => {
  const source = await readFile(new URL('../scripts/historian-archive/Readable.gs', import.meta.url), 'utf8');
  const first = '2026-11-25T20:30:00+00:00';
  const next = '2026-11-25T20:35:00+00:00';
  const stamps = [first];
  const reads = [];
  const writes = [];
  const headers = ['Date (IST)', 'Time (IST)', 'ISO Timestamp', 'INT-LT'];
  const sheet = {
    getLastColumn: () => headers.length, getLastRow: () => stamps.length + 1,
    getMaxRows: () => 100, getMaxColumns: () => 10,
    getRange(row, col, count = 1) {
      return {
        getValues() {
          if (row === 1) return [headers];
          reads.push([row, count]);
          return stamps.slice(row - 2, row - 2 + count).map(stamp => [stamp]);
        },
        setNumberFormat() {},
        setValues(rows) {
          writes.push(row);
          rows.forEach((values, i) => { stamps[row - 2 + i] = values[2]; });
        },
      };
    },
  };
  const write = runInNewContext(source + '\nwriteReadableTab;', {
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'true' }) },
    Utilities: { formatDate: () => 'fixture' },
  });
  const rows = new Map([[next, new Map([['INT-LT', { value: 0 }]])]]);
  write({ getSheetByName: () => sheet }, 'Intake_Logs', rows);
  assert.deepEqual(reads, [[2, 1]]);
  write({ getSheetByName: () => sheet }, 'Intake_Logs', rows);
  assert.deepEqual(writes, [3, 3]);
  assert.deepEqual(stamps, [first, next]);
});
