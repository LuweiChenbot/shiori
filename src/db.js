// IndexedDB persistence. Book records (small, listed on the shelf) are kept apart
// from book files (large, only read when a book is opened).

const DB_NAME = 'shiori';
const VERSION = 1;
let dbPromise;

function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('books', { keyPath: 'id' });
      db.createObjectStore('files', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run(stores, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let result;
    Promise.resolve(fn(tx)).then((r) => (result = r), reject);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

const req = (r) => new Promise((resolve, reject) => {
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});

export const db = {
  allBooks: () => run(['books'], 'readonly', (tx) => req(tx.objectStore('books').getAll())),
  getBook: (id) => run(['books'], 'readonly', (tx) => req(tx.objectStore('books').get(id))),
  putBook: (book) => run(['books'], 'readwrite', (tx) => req(tx.objectStore('books').put(book))),
  getFile: (id) => run(['files'], 'readonly', (tx) => req(tx.objectStore('files').get(id))),
  addBook: (book, file) =>
    run(['books', 'files'], 'readwrite', (tx) => {
      tx.objectStore('books').put(book);
      tx.objectStore('files').put({ id: book.id, ...file });
    }),
  deleteBook: (id) =>
    run(['books', 'files'], 'readwrite', (tx) => {
      tx.objectStore('books').delete(id);
      tx.objectStore('files').delete(id);
    }),
};

// Ask the browser not to evict our data under storage pressure (best effort).
export function requestPersistence() {
  navigator.storage?.persist?.().catch(() => {});
}

export function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
