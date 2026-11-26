// Run as the owner of the private archive. All credentials stay in Script Properties.
function prepareArchivePullCredential() {
  const properties = PropertiesService.getScriptProperties();
  let token = properties.getProperty('SUPABASE_ARCHIVE_TOKEN');
  if (!token) {
    token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
    properties.setProperty('SUPABASE_ARCHIVE_TOKEN', token);
  }
  console.log('Archive credential SHA-256: ' + archivePullDigest(token));
}

function archivePullDigest(value) {
  return hex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8));
}

function archivePullPage(properties, table, start, end, cursor, verifyWindow = false) {
  const origin = properties.getProperty('SUPABASE_ARCHIVE_URL');
  const key = properties.getProperty('SUPABASE_PUBLISHABLE_KEY');
  const token = properties.getProperty('SUPABASE_ARCHIVE_TOKEN');
  if (!/^https:\/\/[a-z]{20}\.supabase\.co$/.test(origin) || !key || !token) {
    throw new Error('Configure the Supabase archive URL, publishable key and dedicated archive token');
  }
  const response = UrlFetchApp.fetch(origin + '/rest/v1/rpc/historian_archive_page', {
    method: 'post', contentType: 'application/json', headers: { apikey: key }, muteHttpExceptions: true,
    followRedirects: false,
    payload: JSON.stringify({ archive_token: token, source_table: table,
      range_start: start, range_end: end, cursor_time: cursor?.time ?? null,
      cursor_id: cursor?.id ?? null, page_size: 250, verify_window: verifyWindow }),
  });
  if (response.getResponseCode() !== 200) {
    throw new Error('Archive source read failed (' + table + ', HTTP ' + response.getResponseCode() + ')');
  }
  const rows = JSON.parse(response.getContentText());
  if (verifyWindow) {
    if (Number.isSafeInteger(rows?.count) && typeof rows.digest === 'string') return rows;
    throw new Error('Unexpected archive verification response');
  }
  if (!Array.isArray(rows)) throw new Error('Unexpected archive page');
  return rows;
}

function scheduleArchivePull() {
  const handler = 'archivePullRun';
  if (!ScriptApp.getProjectTriggers().some(trigger => trigger.getHandlerFunction() === handler)) {
    ScriptApp.newTrigger(handler).timeBased().everyMinutes(5).create();
  }
}

function archivePullRun() {
  const lock = LockService.getUserLock();
  if (!lock.tryLock(1000)) return;
  try {
    const properties = PropertiesService.getScriptProperties();
    const starts = JSON.parse(properties.getProperty('ARCHIVE_SOURCE_STARTS') || '{}');
    const folderId = properties.getProperty('ARCHIVE_FOLDER_ID');
    if (!folderId || Object.keys(starts).length === 0) throw new Error('Configure source bounds and archive folder');
    const startedAt = Date.now();
    const safeTime = startedAt - 600000;
    const deadline = startedAt + 210000;
    const retriedTables = new Set();

    // One page from each source per pass keeps alarms and aggregates moving while raw readings backfill.
    let progressed;
    do {
      progressed = false;
      for (const [table, first] of Object.entries(starts)) {
        if (Date.now() >= deadline) return;
        const property = 'ARCHIVE_CURSOR_' + table;
        const state = JSON.parse(properties.getProperty(property) || JSON.stringify({ start: first, count: 0 }));
        const start = Date.parse(state.start);
        if (!Number.isFinite(start)) throw new Error('Invalid date for ' + table);
        // Hourly rows are keyed by the opening of a bucket but only finalized after its close.
        const step = table === 'historian_aggregates' ? 3600000
          : ['consumption_data', 'pump_analytics'].includes(table) ? 86400000 : 300000;
        const cutoff = Math.floor(safeTime / step) * step;
        if (start >= cutoff) continue;
        const rawHistorian = table === 'historian_logs';
        const month = Utilities.formatDate(new Date(start), 'Asia/Kolkata', 'yyyy-MM');
        const end = state.end || new Date(Math.min(cutoff, start + (rawHistorian ? 3600000 : 86400000))).toISOString();
        if (Date.parse(end) > cutoff) continue;
        const partition = state.parts?.[month] || { part: 1, count: 0 };
        // Each window stays in one workbook, including windows that cross a month boundary.
        state.parts = { [month]: partition };
        const rows = archivePullPage(properties, table, state.start, end, state.cursor);
        if (!rows.length) {
          const source = archivePullPage(properties, table, state.start, end, null, true);
          const capturedDigest = archivePullDigest((state.pageDigests || []).join('\n'));
          if (source.count !== (state.windowCount || 0) || source.digest !== capturedDigest) {
            // Leave the unverified pages in Drive and rewrite this same window in a fresh part.
            // Never publish a receipt for pages that differ from the source.
            if (state.windowCount) {
              partition.part++;
              partition.count = 0;
            }
            const rewind = { start: state.start, end, count: state.count - (state.windowCount || 0), parts: state.parts };
            properties.setProperty(property, JSON.stringify(rewind));
            if (retriedTables.has(table)) throw new Error('Source kept changing during backup: ' + table + ', ' + state.start + ' to ' + end);
            retriedTables.add(table);
            progressed = true;
            continue;
          }
          if (source.count > 0 || rawHistorian) {
            if (rawHistorian && source.count > 0 && !state.location) throw new Error('Verified historian window has no Sheet range');
            const records = [JSON.stringify({ table, start: state.start, end, count: source.count,
              digest: source.digest, ...(rawHistorian ? { location: state.location || null } : {}) })];
            const receipt = { table: 'pull_verification', month, part: 1, digest: archivePullDigest(records[0]) };
            archiveBatch({ ...receipt, action: 'write', records }, folderId);
            const restored = archiveBatch({ ...receipt, action: 'read' }, folderId);
            if (restored.count !== 1 || restored.records[0] !== records[0]) throw new Error('Verification receipt readback mismatch');
          }
          state.start = end;
          delete state.end;
          delete state.cursor;
          delete state.pageDigests;
          delete state.windowCount;
          delete state.location;
        } else {
          const records = rows.map(row => row.body);
          if (!state.windowCount && partition.count + records.length >= 80000) {
            partition.part++;
            partition.count = 0;
          }
          const digest = archivePullDigest(records.join('\n'));
          const batch = { table: 'pull_' + table, month, part: partition.part, digest };
          archiveBatch({ ...batch, action: 'write', records }, folderId);
          const restored = archiveBatch({ ...batch, action: 'read' }, folderId);
          if (restored.count !== records.length || archivePullDigest(restored.records.join('\n')) !== digest) {
            throw new Error('Google readback mismatch: ' + table + ', ' + month);
          }
          if (rawHistorian) {
            const { spreadsheetId, sheetName, row } = restored;
            if (!/^[A-Za-z0-9_-]{15,}$/.test(spreadsheetId) || typeof sheetName !== 'string' || !sheetName ||
                !Number.isSafeInteger(row) || row < 2) throw new Error('Missing historian Sheet location');
            const location = state.location || { spreadsheetId, sheetName, firstRow: row, lastRow: row - 1 };
            if (location.spreadsheetId !== spreadsheetId || location.sheetName !== sheetName ||
                row !== location.lastRow + 1) throw new Error('Historian Sheet pages are not contiguous');
            location.lastRow = row + restored.count - 1;
            state.location = location;
          }
          partition.count += records.length;
          state.end = end;
          const { id, time } = rows[rows.length - 1];
          state.cursor = { id, time };
          state.pageDigests = state.pageDigests || [];
          state.pageDigests.push(digest);
          state.windowCount = (state.windowCount || 0) + rows.length;
          state.count += rows.length;
        }
        properties.setProperty(property, JSON.stringify(state));
        progressed = true;
      }
    } while (progressed && Date.now() < deadline);
    try {
      refreshReadableHistory(properties, folderId, cutoffArchiveMonth(safeTime));
      backfillReadableHistory(properties, deadline);
    } catch (error) {
      console.warn('Readable tabs will retry: ' + error.message);
    }
  } finally {
    lock.releaseLock();
  }
}
