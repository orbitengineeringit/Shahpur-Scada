function prepareHistorianMonthCredential() {
  const properties = PropertiesService.getScriptProperties();
  let token = properties.getProperty('HISTORIAN_MONTH_TOKEN');
  if (!token) {
    token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
    properties.setProperty('HISTORIAN_MONTH_TOKEN', token);
  }
  console.log('Workbook registrar credential SHA-256: ' + archivePullDigest(token));
}

function scheduleHistorianMonthRollover() {
  provisionNextHistorianMonth();
  if (!ScriptApp.getProjectTriggers().some(trigger => trigger.getHandlerFunction() === 'provisionNextHistorianMonth')) {
    ScriptApp.newTrigger('provisionNextHistorianMonth').timeBased().everyDays(1).atHour(5)
      .inTimezone('Asia/Kolkata').create();
  }
}

function provisionNextHistorianMonth() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    const properties = PropertiesService.getScriptProperties();
    const current = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM');
    const next = new Date(current + '-01T00:00:00.000Z');
    next.setUTCMonth(next.getUTCMonth() + 1);
    const month = next.toISOString().slice(0, 7);
    if (properties.getProperty('HISTORIAN_LAST_PROVISIONED_MONTH') === month) return;
    const folderId = properties.getProperty('ARCHIVE_FOLDER_ID');
    const origin = properties.getProperty('SUPABASE_ARCHIVE_URL');
    const apiKey = properties.getProperty('SUPABASE_PUBLISHABLE_KEY');
    const token = properties.getProperty('HISTORIAN_MONTH_TOKEN');
    const writer = properties.getProperty('HISTORIAN_MONTH_EDITOR');
    const viewer = properties.getProperty('HISTORIAN_MONTH_VIEWER');
    if (!folderId || !/^https:\/\/[a-z]{20}\.supabase\.co$/.test(origin) || !apiKey ||
        !/^[0-9a-f]{64}$/.test(token) ||
        ![writer, viewer].every(address => /^[a-z0-9@.-]+\.iam\.gserviceaccount\.com$/.test(address))) {
      throw new Error('Missing monthly workbook configuration');
    }

    const folder = DriveApp.getFolderById(folderId);
    const title = 'Shahpur SCADA Backup — ' + month;
    const matches = folder.getFilesByName(title);
    let workbook;
    if (matches.hasNext()) {
      workbook = SpreadsheetApp.openById(matches.next().getId());
      if (matches.hasNext()) throw new Error('Multiple monthly workbooks share the same name');
    } else {
      workbook = SpreadsheetApp.create(title, 9000, 30);
      DriveApp.getFileById(workbook.getId()).moveTo(folder);
    }
    const file = DriveApp.getFileById(workbook.getId());
    if (file.getSharingAccess() !== DriveApp.Access.PRIVATE) throw new Error('Monthly workbook link access must be private');
    const raw = workbook.getSheetByName('Raw Backup') || workbook.getSheets()[0].setName('Raw Backup');
    if (raw.getMaxRows() < 8929 || raw.getMaxColumns() !== 30) throw new Error('Unexpected backup grid size');
    const headers = ['Window start UTC', 'Window end UTC', 'SHA-256', 'Historian rows', 'Alarms', 'Aggregates',
      ...Array.from({ length: 24 }, (_, i) => 'Payload ' + (i + 1))];
    const header = raw.getRange(1, 1, 1, headers.length);
    if (raw.getLastRow() === 0) {
      header.setValues([headers]);
      raw.setFrozenRows(1);
    } else if (header.getValues()[0].some((value, index) => value !== headers[index])) {
      throw new Error('Unexpected raw backup header');
    }
    if (!file.getEditors().some(user => user.getEmail() === writer)) file.addEditor(writer);
    if (!file.getViewers().some(user => user.getEmail() === viewer)) file.addViewer(viewer);
    SpreadsheetApp.flush();

    const endpoint = origin + '/rest/v1/rpc/register_historian_backup_month';
    const response = UrlFetchApp.fetch(endpoint, {
      method: 'post', contentType: 'application/json', headers: { apikey: apiKey }, followRedirects: false,
      muteHttpExceptions: true, payload: JSON.stringify({
        registration_token: token, workbook_month: month, workbook_id: workbook.getId(),
      }),
    });
    if (response.getResponseCode() !== 200 || JSON.parse(response.getContentText()) !== true) {
      throw new Error('Monthly workbook registration failed (HTTP ' + response.getResponseCode() + ')');
    }
    properties.setProperty('HISTORIAN_LAST_PROVISIONED_MONTH', month);
  } finally {
    lock.releaseLock();
  }
}
