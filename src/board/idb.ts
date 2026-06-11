/* 최소 IndexedDB 래퍼 (단일 object store, 키-값). 보드 스냅샷은 생성 이미지의
   base64 data URI를 품어 수 MB가 되기 쉬운데, localStorage(~5MB)에 넣으면 두 번째
   이미지부터 QuotaExceededError로 저장이 실패한다 → 새로고침 시 이미지가 사라지고
   loading 상태가 남아 무한 스피너가 됐다. IDB는 용량이 훨씬 커(보통 수백 MB~) 이를
   해결한다. 값은 구조화 복제로 저장되므로 JSON 직렬화도 불필요. */

const DB_NAME = 'kv-board';
const STORE = 'kv';
const VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

/** Read a value by key (undefined if absent or IDB unavailable). */
export async function idbGet<T = unknown>(key: string): Promise<T | undefined> {
  try {
    const db = await openDb();
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined;
  }
}

/** Write a value by key. Returns false if IDB is unavailable or the write fails. */
export async function idbSet(key: string, value: unknown): Promise<boolean> {
  try {
    const db = await openDb();
    return await new Promise<boolean>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key); // 구조화 복제는 이 시점의 값 스냅샷
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch {
    return false;
  }
}
