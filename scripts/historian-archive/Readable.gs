// Readable tabs are built from verified raw windows. The first sheet stays intact.
function writeReadableHistory(receipts) {
  const byWorkbook = new Map();
  for (const receipt of receipts) {
    if (!receipt.count) continue;
    const id = receipt.location.spreadsheetId;
    if (!byWorkbook.has(id)) byWorkbook.set(id, []);
    byWorkbook.get(id).push(receipt);
  }
  for (const [id, group] of byWorkbook) {
    const workbook = SpreadsheetApp.openById(id);
    const source = workbook.getSheetByName(group[0].location.sheetName);
    const first = Math.min(...group.map(r => r.location.firstRow));
    const last = Math.max(...group.map(r => r.location.lastRow));
    const grid = source.getRange(first, 1, last - first + 1, 3).getValues();
    const readings = [];
    for (const { location, count, digest } of group) {
      const cells = grid.slice(location.firstRow - first, location.lastRow - first + 1);
      const hashes = [];
      for (let i = 0; i < cells.length;) {
        const [hash, size] = cells[i];
        if (!Number.isInteger(size) || size < 1 || i + size > cells.length) throw new Error('Incomplete readable source batch');
        const records = cells.slice(i, i + size).map(row => row[2]);
        if (archivePullDigest(records.join('\n')) !== hash) throw new Error('Readable source batch differs');
        readings.push(...records.map(JSON.parse));
        hashes.push(hash);
        i += size;
      }
      if (cells.length !== count || archivePullDigest(hashes.join('\n')) !== digest) throw new Error('Readable window differs');
    }
    writeReadableReadings(workbook, readings);
  }
}

const readableTags = {
  Intake_Logs: 'INT-LT INT-Pump1 INT-PT1 INT-Pump2 INT-PT2 INT-HeaderPT INT-Flow-IN INT-Flow-OUT INT-Totalizer-IN INT-Totalizer-OUT',
  WTP_Logs: 'WTP-Flow-OUT WTP-PH WTP-TA WTP-CL WTP-LT-CW WTP-LT-BW WTP-ROF-FB1 WTP-LOH-FB1 WTP-LOH-FB2 WTP-Pump1 WTP-PT1 WTP-Pump2 WTP-PT2 WTP-HeaderPT WTP-TA-IN WTP-Totalizer-OUT WTP-Trip1 WTP-Trip2',
  OHT_1_Logs: 'OHT1-LT OHT1-PT OHT1-Flow OHT1-Totalizer OHT1-PT2 OHT1-DecrTotalizer',
  OHT_2_Logs: 'OHT2-LT OHT2-PT OHT2-Flow OHT2-Totalizer OHT2-Totalizer2',
};

function writeReadableReadings(workbook, readings) {
    const tabs = new Map(Object.keys(readableTags).map(name => [name, new Map()]));
    for (const row of readings) {
      const tag = row.tag_id;
      const tab = /^OHT-?1(?:[^0-9]|$)/i.test(tag) ? 'OHT_1_Logs'
        : /^OHT-?2(?:[^0-9]|$)/i.test(tag) ? 'OHT_2_Logs'
        : row.section === 'intake' ? 'Intake_Logs' : row.section === 'wtp' ? 'WTP_Logs' : 'Other_Logs';
      if (!tabs.has(tab)) tabs.set(tab, new Map());
      const times = tabs.get(tab);
      if (!times.has(row.timestamp)) times.set(row.timestamp, new Map());
      const values = times.get(row.timestamp);
      const current = values.get(tag);
      if (!current || Date.parse(row.received_at || row.timestamp) >= Date.parse(current.received_at || current.timestamp)) values.set(tag, row);
    }
    for (const [name, times] of tabs) {
      if (times.size || !workbook.getSheetByName(name)) writeReadableTab(workbook, name, times);
    }
}

function writeReadableTab(workbook, name, times) {
  const sheet = workbook.getSheetByName(name) || workbook.insertSheet(name);
  const columns = sheet.getLastColumn();
  const fixed = ['Date (IST)', 'Time (IST)', 'ISO Timestamp'];
  const headers = columns ? sheet.getRange(1, 1, 1, columns).getValues()[0]
    : [...fixed, ...(readableTags[name]?.split(' ') || [])];
  if (fixed.some((label, i) => headers[i] !== label)) throw new Error('Unexpected readable header on ' + name);
  const known = new Set(headers.slice(3));
  const newTags = new Set();
  for (const values of times.values()) for (const tag of values.keys()) if (!known.has(tag)) newTags.add(tag);
  headers.push(...[...newTags].sort());
  if (headers.length > sheet.getMaxColumns()) sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  if (headers.length !== columns) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setBackground('#1e293b').setFontColor('#ffffff').setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setFrozenColumns(3);
    sheet.setColumnWidths(1, 2, 115);
    sheet.setColumnWidth(3, 235);
    if (headers.length > 3) sheet.setColumnWidths(4, headers.length - 3, 175);
  }
  const last = Math.max(1, sheet.getLastRow());
  const prior = last > 1 ? sheet.getRange(2, 3, last - 1, 1).getValues() : [];
  const byTime = new Map(prior.map(([stamp], i) => [stamp, i + 2]));
  const ordered = [...times].sort(([a], [b]) => a.localeCompare(b));
  const pending = [];
  for (const [stamp, values] of ordered) {
    const date = new Date(stamp);
    const row = [Utilities.formatDate(date, 'Asia/Kolkata', 'dd-MMM-yyyy'),
      Utilities.formatDate(date, 'Asia/Kolkata', 'hh:mm:ss a'), stamp,
      ...headers.slice(3).map(tag => {
        const value = values.get(tag)?.value;
        const pump = /^(?:INT|WTP)-Pump[12]$|^WTP-.*_RUN_FB$/.test(tag);
        return pump && (value === 0 || value === 1) ? (value === 1 ? 'RUNNING' : 'STOPPED') : value ?? '';
      })];
    const index = byTime.get(stamp);
    if (index) sheet.getRange(index, 1, 1, headers.length).setValues([row]);
    else pending.push(row);
  }
  if (!pending.length) return;
  if (last + pending.length > sheet.getMaxRows()) {
    sheet.insertRowsAfter(sheet.getMaxRows(), last + pending.length - sheet.getMaxRows());
  }
  sheet.getRange(last + 1, 1, pending.length, 3).setNumberFormat('@');
  sheet.getRange(last + 1, 1, pending.length, headers.length).setValues(pending);
}

function seedReadableHistory() {
  const lock = LockService.getUserLock();
  lock.waitLock(20000);
  try {
    const properties = PropertiesService.getScriptProperties();
    const windows = refreshReadableHistory(properties, properties.getProperty('ARCHIVE_FOLDER_ID'), cutoffArchiveMonth(Date.now() - 600000));
    console.log('Readable history populated from ' + windows + ' saved windows.');
  } finally {
    lock.releaseLock();
  }
}

function cutoffArchiveMonth(at) {
  return Utilities.formatDate(new Date(at), 'Asia/Kolkata', 'yyyy-MM');
}

function refreshReadableHistory(properties, folderId, month) {
  const files = DriveApp.getFolderById(folderId).getFilesByName('Shahpur ' + month + ' pull_verification 1');
  if (!files.hasNext()) return 0;
  const sheet = SpreadsheetApp.openById(files.next().getId()).getSheets()[0];
  if (files.hasNext()) throw new Error('Duplicate verification workbook names');
  const key = 'READABLE_CURSOR_' + month;
  const first = Number(properties.getProperty(key) || 1) + 1;
  const last = Math.min(sheet.getLastRow(), first + 249);
  if (last < first) return 0;
  const receipts = sheet.getRange(first, 1, last - first + 1, 3).getValues().map(([hash, count, body]) => {
    if (count !== 1 || archivePullDigest(body) !== hash) throw new Error('Verification receipt checksum differs');
    return JSON.parse(body);
  }).filter(r => r.table === 'historian_logs' && r.count > 0);
  writeReadableHistory(receipts);
  SpreadsheetApp.flush();
  properties.setProperty(key, String(last));
  return receipts.length;
}
