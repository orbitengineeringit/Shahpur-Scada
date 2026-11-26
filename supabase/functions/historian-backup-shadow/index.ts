import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { historianBackupGrid, type BackupSnapshot } from '../_shared/historianBackupGrid.ts';
import { googleSheetsAccessToken } from '../_shared/historianSheets.ts';
import { writeHistorianStationTabs } from '../_shared/historianReadableSheets.ts';
import type { ArchivedHistorianReading } from '../_shared/historianArchive.ts';

function respond(code: number, status: string, detail: Record<string, unknown> = {}) {
  return Response.json({ status, ...detail }, { status: code, headers: { 'Cache-Control': 'no-store' } });
}

Deno.serve(async request => {
  if (request.method !== 'POST') return respond(405, 'method_not_allowed');
  const key = Deno.env.get('HISTORIAN_SHADOW_CRON_KEY');
  const received = request.headers.get('x-backup-key');
  const signature = request.headers.get('x-backup-signature');
  const hex = /^[a-f0-9]{64}$/;
  if (!key || !hex.test(key) || (!hex.test(received ?? '') && !hex.test(signature ?? ''))) {
    return respond(401, 'unauthorized');
  }

  let windowStart: string;
  let scheduled: boolean;
  try {
    const body = await request.json();
    scheduled = body?.scheduled === true;
    const start = Date.parse(body?.windowStart);
    if (typeof body?.windowStart !== 'string' || !Number.isFinite(start) ||
        start % 300_000 !== 0 || start + 900_000 > Date.now()) throw new Error();
    windowStart = new Date(start).toISOString();
  } catch {
    return respond(400, 'invalid_window');
  }

  if (scheduled) {
    if (!signature || !hex.test(signature)) return respond(401, 'unauthorized');
    const encoder = new TextEncoder();
    const verifier = await crypto.subtle.importKey('raw', encoder.encode(key),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const bytes = Uint8Array.from(signature.match(/../g)!, byte => Number.parseInt(byte, 16));
    if (!await crypto.subtle.verify('HMAC', verifier, bytes, encoder.encode(windowStart))) {
      return respond(401, 'unauthorized');
    }
  } else {
    if (!received || !hex.test(received)) return respond(401, 'unauthorized');
    let difference = 0;
    for (let i = 0; i < key.length; i++) difference |= key.charCodeAt(i) ^ received.charCodeAt(i);
    if (difference !== 0) return respond(401, 'unauthorized');
  }

  try {
    const serviceAccount = Deno.env.get('HISTORIAN_SHADOW_GOOGLE_WRITER');
    const workbooks = JSON.parse(Deno.env.get('HISTORIAN_SHADOW_MONTH_WORKBOOKS') ?? '{}');
    if (!serviceAccount) return respond(503, 'unconfigured');
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    if (scheduled) {
      const { data, error } = await db.from('historian_backup_shadow_checkpoint')
        .select('next_window,end_window').eq('id', true).single();
      if (error || !data) throw new Error('Checkpoint unavailable');
      if (Date.parse(data.next_window) !== Date.parse(windowStart) || Date.parse(windowStart) >= Date.parse(data.end_window)) {
        return respond(409, 'checkpoint_mismatch', { windowStart });
      }
    }
    const readSnapshot = async () => {
      const { data, error } = await db.rpc('historian_backup_snapshot', { window_start: windowStart });
      if (error || !data) throw new Error('Source snapshot unavailable');
      return data as BackupSnapshot;
    };
    const snapshot = await readSnapshot();
    const grid = await historianBackupGrid(windowStart, snapshot);
    const { data: configured, error: workbookError } = await db.from('historian_backup_workbooks')
      .select('spreadsheet_id,readable_next').eq('month', grid.month).maybeSingle();
    if (workbookError) throw new Error('Backup workbook registry unavailable');
    const workbook = configured?.spreadsheet_id ?? (!scheduled ? workbooks?.[grid.month] : undefined);
    if (typeof workbook !== 'string' || !/^[\w-]{20,}$/.test(workbook)) return respond(503, 'month_unconfigured');

    const token = await googleSheetsAccessToken({
      clientId: undefined, clientSecret: undefined, refreshToken: undefined, serviceAccount, access: 'write',
    });
    const base = `https://sheets.googleapis.com/v4/spreadsheets/${workbook}/values`;
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const readRow = async (): Promise<unknown[]> => {
      const response = await fetch(`${base}/${encodeURIComponent(grid.range)}?valueRenderOption=UNFORMATTED_VALUE`, {
        headers, redirect: 'error', signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`Sheet read failed (${response.status})`);
      const { values } = await response.json();
      if (values === undefined) return [];
      if (!Array.isArray(values) || values.length > 1 || !Array.isArray(values[0] ?? [])) {
        throw new Error('Invalid backup row');
      }
      return values[0] ?? [];
    };
    const matches = (row: unknown[]) =>
      row.length <= grid.cells.length && grid.cells.every((cell, i) => (row[i] ?? '') === cell);
    const existing = await readRow();
    const alreadyPresent = existing.some(cell => cell !== '' && cell !== null);
    if (alreadyPresent && !matches(existing)) return respond(409, 'row_conflict', { windowStart });
    if (!alreadyPresent) {
      const response = await fetch(`${base}:batchUpdate`, {
        method: 'POST', headers, redirect: 'error', signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({ valueInputOption: 'RAW', data: [{ range: grid.range, values: [grid.cells] }] }),
      });
      if (!response.ok) throw new Error(`Sheet write failed (${response.status})`);
      await response.body?.cancel();
      if (!matches(await readRow())) return respond(502, 'readback_mismatch', { windowStart });
    }
    const positions = scheduled
      ? await writeHistorianStationTabs(workbook, token, configured!.readable_next,
        snapshot.historian_logs.map(record => JSON.parse(record) as ArchivedHistorianReading))
      : {};
    const current = await historianBackupGrid(windowStart, await readSnapshot());
    if (current.cells[2] !== grid.cells[2]) return respond(409, 'source_changed', { windowStart });
    const [, , digest, historian, alarms, aggregates] = grid.cells;
    if (scheduled) {
      const { data, error } = await db.rpc('ack_historian_backup', {
        expected_start: windowStart, workbook_month: grid.month, verified_digest: digest,
        reading_count: historian, station_positions: positions,
      });
      if (error) throw new Error('Checkpoint update failed');
      if (!data) return respond(409, 'checkpoint_mismatch', { windowStart });
    }
    return respond(200, alreadyPresent ? 'already_verified' : 'verified', {
      windowStart, digest, historian, alarms, aggregates,
    });
  } catch (error) {
    console.error('Historian backup pilot failed', error instanceof Error ? error.message : 'Unknown failure');
    return respond(502, 'backup_failed');
  }
});
