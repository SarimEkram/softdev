// Minimal promise wrapper around IndexedDB.
// Stores: attempts (append-only log), cards (Leitner state per question).
const DB_NAME = 'softdev';
let dbPromise;

function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      const attempts = db.createObjectStore('attempts', {
        keyPath: 'id', autoIncrement: true,
      });
      attempts.createIndex('qid', 'qid');
      db.createObjectStore('cards', { keyPath: 'qid' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const result = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(result?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const getAll = (store) => run(store, 'readonly', (s) => s.getAll());
export const put = (store, value) => run(store, 'readwrite', (s) => s.put(value));

export function replaceAll(store, values) {
  return run(store, 'readwrite', (s) => {
    s.clear();
    for (const v of values) s.put(v);
  });
}
