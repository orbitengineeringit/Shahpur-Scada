import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createVerifiedArchiveCache, queryVerifiedArchive, type HistorianArchiveQuery } from '../_shared/historianArchive.ts';
import { googleSheetsAccessToken, loadHistorianSheet } from '../_shared/historianSheets.ts';
import { parseArchiveManifest } from '../_shared/historianWorkerManifest.ts';

const readWindow = createVerifiedArchiveCache(32_000, 5 * 60_000);

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
    const start = Date.parse(query.start);
    const end = Date.parse(query.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 32 * 86400_000 ||
        !Number.isSafeInteger(query.offset) || query.offset < 0 ||
        !Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > 1000 ||
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
    const entries = await parseArchiveManifest(manifest);
    let accessToken: string | undefined;
    return json(await queryVerifiedArchive(entries, query, async entry => {
      accessToken ??= await googleSheetsAccessToken({ clientId: Deno.env.get('HISTORIAN_GOOGLE_CLIENT_ID'),
        clientSecret: Deno.env.get('HISTORIAN_GOOGLE_CLIENT_SECRET'), refreshToken: Deno.env.get('HISTORIAN_GOOGLE_REFRESH_TOKEN'),
        serviceAccount: Deno.env.get('HISTORIAN_GOOGLE_SERVICE_ACCOUNT') });
      return loadHistorianSheet(entry, accessToken);
    }, readWindow));
  } catch (error) {
    console.error('Historian archive read failure:', error instanceof Error ? error.message : 'Unknown error');
    return json({ error: 'Verified historian archive unavailable' }, 502);
  }
});
