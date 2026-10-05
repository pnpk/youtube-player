// 音声ファイルの中身と波形を、ブラウザのデータベース(IndexedDB)に保存する。
// どの関数も失敗したら reject するので、呼ぶ側で「保存できなかった」として扱う。
export const STORE_LIMIT_BYTES = 1024 ** 3;

const DB_NAME = 'yt-practice-player';
const DB_VERSION = 1;

// 合計が上限を超えていたら、最後に開いた日時が古いものから消す(keepId は消さない)。消すものの id を返す
export function pickEvictions(files, limitBytes, keepId) {
  let total = files.reduce((sum, f) => sum + f.size, 0);
  const evict = [];
  for (const f of [...files].sort((x, y) => x.lastOpenedAt - y.lastOpenedAt)) {
    if (total <= limitBytes) break;
    if (f.id === keepId) continue;
    evict.push(f.id);
    total -= f.size;
  }
  return evict;
}

// 保存データのうち、履歴に記録がないもの
export function findOrphans(storedIds, historyIds) {
  const keep = new Set(historyIds);
  return storedIds.filter((id) => !keep.has(id));
}

let dbPromise = null;

function openDb() {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('peaks')) db.createObjectStore('peaks', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  // 開けなかったときは、次に呼ばれたときにもう一度試す
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

const done = (request) =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

async function store(name, mode = 'readonly') {
  const db = await openDb();
  return db.transaction(name, mode).objectStore(name);
}

export async function putFile(record) {
  await done((await store('files', 'readwrite')).put(record));
}

export async function getFile(id) {
  return done((await store('files')).get(id));
}

export async function listFiles() {
  const records = await done((await store('files')).getAll());
  return records.map(({ id, size, lastOpenedAt }) => ({ id, size, lastOpenedAt }));
}

export async function putPeaks(id, peaks) {
  await done((await store('peaks', 'readwrite')).put({ id, peaks }));
}

export async function getPeaks(id) {
  const record = await done((await store('peaks')).get(id));
  return record?.peaks ?? null;
}

export async function deleteMedia(id) {
  const db = await openDb();
  const tx = db.transaction(['files', 'peaks'], 'readwrite');
  tx.objectStore('files').delete(id);
  tx.objectStore('peaks').delete(id);
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
