import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createVerifiedArchiveCache, queryVerifiedArchive, readArchiveRecovery, type HistorianArchiveQuery, type HistorianArchiveRange } from '../_shared/historianArchive.ts';
import { googleSheetsAccessToken, loadHistorianSheet } from '../_shared/historianSheets.ts';
import { parseArchiveManifest } from '../_shared/historianWorkerManifest.ts';
import { backupArchiveReadBlockMs, backupReceiptRanges, type BackupReceipt } from '../_shared/historianBackupReceipts.ts';

const cacheBucket = 'historian-archive-cache';
const readWindow = createVerifiedArchiveCache(48_000, 15 * 60_000, async entry => {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceKey) return;
  try {
    const response = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/authenticated/${cacheBucket}/${entry.recoveryDigest}.jsonl.gz`,
      { headers: { Authorization: `Bearer ${serviceKey}` }, signal: AbortSignal.timeout(8000), redirect: 'error' },
    );
    if (response.ok && response.body) return await readArchiveRecovery(entry, response.body);
    await response.body?.cancel();
    console.warn('Historian storage cache miss:', response.status);
  } catch (error) {
    console.warn('Historian storage cache unavailable:', error instanceof Error ? error.name : 'Unknown error');
  }
});

let manifestCache: ReturnType<typeof parseArchiveManifest> | undefined;
let sheetsToken: { value: Promise<string>; expires: number } | undefined;
let nextSheetReadAt = 0;
let pendingSheetReads = Promise.resolve();

function getSheetsToken() {
  if (sheetsToken && sheetsToken.expires > Date.now()) return sheetsToken.value;
  const value = googleSheetsAccessToken({ clientId: Deno.env.get('HISTORIAN_GOOGLE_CLIENT_ID'),
    clientSecret: Deno.env.get('HISTORIAN_GOOGLE_CLIENT_SECRET'),
    refreshToken: Deno.env.get('HISTORIAN_GOOGLE_REFRESH_TOKEN'),
    serviceAccount: Deno.env.get('HISTORIAN_GOOGLE_SERVICE_ACCOUNT') });
  sheetsToken = { value, expires: Date.now() + 50 * 60_000 };
  void value.catch(() => { if (sheetsToken?.value === value) sheetsToken = undefined; });
  return value;
}

function readSheetFallback(entry: HistorianArchiveRange) {
  const loading = pendingSheetReads.then(async () => {
    const wait = nextSheetReadAt - Date.now();
    if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
    nextSheetReadAt = Date.now() + 1200;
    return loadHistorianSheet(entry, await getSheetsToken());
  });
  pendingSheetReads = loading.then(() => {}, () => {});
  return loading;
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { ...cors, 'Cache-Control': 'private, no-store' } });
}

function validFilter(values: unknown, max: number): boolean {
  return values === undefined || (Array.isArray(values) && values.length <= max &&
    values.every(value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(value)));
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!);
  const { data: { user }, error } = await client.auth.getUser(auth.slice(7));
  if (error || !user) return json({ error: 'Unauthorized' }, 401);

  let query: HistorianArchiveQuery;
  try {
    query = await request.json();
    if ((query as HistorianArchiveQuery & { operation?: string }).operation === 'coverage') {
      const manifest = Deno.env.get('HISTORIAN_ARCHIVE_SHEETS');
      if (!manifest) return json({ error: 'Historian archive is not configured' }, 503);
      const pinned = await (manifestCache ??= parseArchiveManifest(manifest));
      const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        { auth: { persistSession: false, autoRefreshToken: false } });
      const [first, last] = await Promise.all([
        admin.from('historian_backup_receipts').select('window_start').order('window_start').limit(1).maybeSingle(),
        admin.from('historian_backup_shadow_checkpoint').select('next_window').eq('id', true).maybeSingle(),
      ]);
      if (first.error || last.error) return json({ error: 'Verified backup coverage unavailable' }, 502);
      const start = Math.max(Date.parse(pinned[pinned.length - 1].end), Date.parse(first.data?.window_start ?? ''));
      // Let recent database samples settle before serving them from immutable backups.
      const end = Math.min(Date.parse(last.data?.next_window ?? ''), Math.floor((Date.now() - 30 * 60_000) / 300_000) * 300_000);
      const ranges = [{ start: pinned[0].start, end: pinned[pinned.length - 1].end }];
      if (start < end) ranges.push({ start: new Date(start).toISOString(), end: new Date(end).toISOString() });
      return json({ ranges });
    }
    const start = Date.parse(query.start);
    const end = Date.parse(query.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 32 * 86400_000 ||
        !Number.isSafeInteger(query.offset) || query.offset < 0 ||
        !Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > 3000 ||
        !validFilter(query.tagIds, 128) || !validFilter(query.sections, 16) || !validFilter(query.excludeTagIds, 128) ||
        !validFilter(query.assets, 5) || (query.assets && query.assets.some(value => !['all', 'intake', 'wtp', 'oht-1', 'oht-2'].includes(value))) ||
        (query.snapshotsOnly !== undefined && typeof query.snapshotsOnly !== 'boolean') ||
        (query.ascending !== undefined && typeof query.ascending !== 'boolean')) throw new Error();
  } catch {
    return json({ error: 'Invalid archive query' }, 400);
  }

  try {
    const manifest = Deno.env.get('HISTORIAN_ARCHIVE_SHEETS');
    if (!manifest) return json({ error: 'Historian archive is not configured' }, 503);
    const pinned = await (manifestCache ??= parseArchiveManifest(manifest));
    const pinnedEnd = Date.parse(pinned[pinned.length - 1].end);
    const entries = [...pinned];
    if (Date.parse(query.end) > pinnedEnd) {
      const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        { auth: { persistSession: false, autoRefreshToken: false } });
      const start = Math.max(pinnedEnd, Math.floor(Date.parse(query.start) / backupArchiveReadBlockMs) * backupArchiveReadBlockMs);
      const end = Math.ceil(Date.parse(query.end) / backupArchiveReadBlockMs) * backupArchiveReadBlockMs;
      const receipts: BackupReceipt[] = [];
      const pageSize = 1000;
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await admin.from('historian_backup_receipts')
          .select('window_start,month,digest,readings,historian_backup_workbooks!inner(spreadsheet_id)')
          .gte('window_start', new Date(start).toISOString()).lt('window_start', new Date(end).toISOString())
          .order('window_start').range(offset, offset + pageSize - 1);
        if (error) throw new Error('Verified backup receipts unavailable');
        for (const row of data) {
          const workbook = row.historian_backup_workbooks as unknown as { spreadsheet_id: string };
          receipts.push({ window_start: row.window_start, month: row.month, digest: row.digest,
            readings: row.readings, spreadsheet_id: workbook.spreadsheet_id });
        }
        if (data.length < pageSize) break;
      }
      entries.push(...await backupReceiptRanges(receipts));
    }
    return json(await queryVerifiedArchive(entries, query, readSheetFallback, readWindow));
  } catch (error) {
    console.error('Historian archive read failure:', error instanceof Error ? error.message : 'Unknown error');
    return json({ error: 'Verified historian archive unavailable' }, 502);
  }
});
