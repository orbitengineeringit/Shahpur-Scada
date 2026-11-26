// Bound Apps Script. Set ARCHIVE_SECRET and ARCHIVE_FOLDER_ID in Script Properties.
function doPost(e) {
  try {
    const properties = PropertiesService.getScriptProperties();
    const secret = properties.getProperty('ARCHIVE_SECRET');
    const request = JSON.parse(e.postData.contents);
    if (!secret || !Number.isSafeInteger(request.sentAt) ||
        Math.abs(Date.now() - request.sentAt) > 300000 || typeof request.body !== 'string') {
      throw new Error('Invalid request');
    }
    const signed = String(request.sentAt) + '.' + request.body;
    const signature = hex(Utilities.computeHmacSha256Signature(signed, secret));
    if (!equalSignature(signature, request.signature)) throw new Error('Invalid signature');
    const batch = JSON.parse(request.body);
    const result = archiveBatch(batch, properties.getProperty('ARCHIVE_FOLDER_ID'));
    return reply({ ok: true, ...result });
  } catch (error) {
    return reply({ ok: false, error: String(error.message) });
  }
}

function hex(bytes) {
  return bytes.map(byte => ((byte + 256) % 256).toString(16).padStart(2, '0')).join('');
}

function equalSignature(expected, actual) {
  if (typeof actual !== 'string' || expected.length !== actual.length) return false;
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= expected.charCodeAt(i) ^ actual.charCodeAt(i);
  return difference === 0;
}

function reply(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}

function archiveBatch(batch, folderId, readBack = false) {
  if (!folderId || !/^[a-z_]+$/.test(batch.table) || !/^\d{4}-\d{2}$/.test(batch.month) ||
      !/^[a-f0-9]{64}$/.test(batch.digest) || !Number.isInteger(batch.part) || batch.part < 1 ||
      !['write', 'read'].includes(batch.action)) throw new Error('Invalid archive batch');
  if (batch.action === 'write' && (!Array.isArray(batch.records) || batch.records.length === 0 ||
      batch.records.length > 250 || batch.records.some(row => typeof row !== 'string' || !row.startsWith('{') || row.length > 45000))) {
    throw new Error('Invalid archive rows');
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const name = `Shahpur ${batch.month} ${batch.table} ${batch.part}`;
    const folder = DriveApp.getFolderById(folderId);
    const files = folder.getFilesByName(name);
    let workbook;
    if (files.hasNext()) {
      workbook = SpreadsheetApp.openById(files.next().getId());
      if (files.hasNext()) throw new Error('Duplicate archive workbook names');
    } else {
      if (batch.action === 'read') throw new Error('Archive workbook missing');
      workbook = SpreadsheetApp.create(name, 1000, 3);
      DriveApp.getFileById(workbook.getId()).moveTo(folder);
    }
    const sheet = workbook.getSheets()[0];
    if (!sheet.getLastRow()) sheet.appendRow(['Batch SHA-256', 'Row count', 'Original record JSON']);
    const last = sheet.getLastRow();
    const marker = last > 1 && sheet.getRange(2, 1, last - 1).createTextFinder(batch.digest).matchEntireCell(true).findNext();
    let row = marker ? marker.getRow() : last + 1;
    if (!marker) {
      if (batch.action === 'read') throw new Error('Archive batch missing');
      const end = row + batch.records.length - 1;
      if (end > 100000) throw new Error('Archive part capacity reached');
      if (end > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), end - sheet.getMaxRows());
      const cells = batch.records.map((record, index) => index === 0
        ? [batch.digest, batch.records.length, record] : ['', '', record]);
      sheet.getRange(row, 1, cells.length, 3).setValues(cells);
      SpreadsheetApp.flush();
    }
    const count = sheet.getRange(row, 2).getValue();
    const result = { spreadsheetId: workbook.getId(), sheetName: sheet.getName(), row, count };
    if (batch.action === 'read' || readBack) result.records = sheet.getRange(row, 3, count, 1).getValues().map(cell => cell[0]);
    return result;
  } finally {
    lock.releaseLock();
  }
}
