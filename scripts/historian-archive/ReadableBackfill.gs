// Exact ranges from the reconciled raw backup receipt. Superseded ranges are omitted.
const readableRecoveryWorkbooks = [
  ['1xJtipPQqQxoZdhuJTcHpuND7P4tmtFrS7qA4TED5sc8', '1:7,9:16,18:50,52:86,88:122,124:158,160:194,196:230,232:266'],
  ['1kI4vVUvlkK__J08jF2dEaEaRCsuFQtQlw566oGnDp6I', '1:32,34:61,63:90,92:119,121:153,155:189,191:224,226:260,262:296,298:332,334:368,370:404,406:440,442:471,473:504,506:535,537:566,568:598,600:629,631:660,662:692,694:723,725:754,756:786,788:821,823:858,860:894,896:931,933:962,964:998,1000:1034'],
  ['12_8jinHP4JSrjOCsSW--OrB6Q4DYBVkEjlUgKxtQyGE', '1:34,36:65,67:101,103:137,139:173,175:209,211:245,247:281,283:317,319:353,355:389,391:425,427:461,463:497,499:533,535:569,571:605,607:641,643:677,679:699,701:719,721:751,753:778,780:789,811:819,831:833,835:837,851:853,847:849'],
];

function backfillReadableHistory(properties, deadline) {
  const key = 'READABLE_RECOVERY_NEXT';
  const groups = readableRecoveryWorkbooks.flatMap(([id, ranges]) =>
    ranges.split(',').map(pair => [id, ...pair.split(':').map(Number)]));
  let next = Number(properties.getProperty(key) || 0);
  if (properties.getProperty('READABLE_RECOVERY_SORTED') === 'true') return;
  const destination = SpreadsheetApp.openById('1qYIdik4BxOfTnHVrUUEIFSZa5wknCiLImW6joeblh6M');
  let sourceId;
  let source;
  while (next < groups.length && Date.now() < deadline) {
    const [id, first, last] = groups[next];
    if (sourceId !== id) {
      source = SpreadsheetApp.openById(id).getSheetByName('Sheet1');
      sourceId = id;
    }
    const grid = source.getRange(first, 1, last - first + 1, 8).getValues();
    const readings = [];
    for (const [part, count, digest, ...chunks] of grid) {
      if (!Number.isSafeInteger(Number(part)) || typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest)) continue;
      const bytes = chunks.filter(Boolean).flatMap(chunk => Utilities.base64Decode(chunk.slice(4)));
      const text = Utilities.newBlob(bytes).getDataAsString('UTF-8');
      const records = text.split('\n');
      if (archivePullDigest(text) !== digest || records.length !== Number(count)) throw new Error('Recovery batch differs at row ' + first);
      readings.push(...records.map(JSON.parse));
    }
    if (!readings.length) throw new Error('Archived interval is empty at row ' + first);
    writeReadableReadings(destination, readings);
    SpreadsheetApp.flush();
    properties.setProperty(key, String(++next));
  }
  if (next === groups.length) {
    for (const name of Object.keys(readableTags)) {
      const tab = destination.getSheetByName(name);
      if (tab.getLastRow() > 2) tab.getRange(2, 1, tab.getLastRow() - 1, tab.getLastColumn()).sort(3);
    }
    SpreadsheetApp.flush();
    properties.setProperty('READABLE_RECOVERY_SORTED', 'true');
  }
  console.log('Readable older history: ' + next + '/' + groups.length + ' saved ranges.');
}

function seedFullReadableHistory() {
  const lock = LockService.getUserLock();
  lock.waitLock(20000);
  try {
    backfillReadableHistory(PropertiesService.getScriptProperties(), Date.now() + 250000);
  } finally {
    lock.releaseLock();
  }
}
