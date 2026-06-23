/* 최소 IndexedDB 래퍼 (단일 object store, 키-값). 보드 스냅샷은 생성 이미지의
   base64 data URI를 품어 수 MB가 되기 쉬운데, localStorage(~5MB)에 넣으면 두 번째
   이미지부터 QuotaExceededError로 저장이 실패한다 → 새로고침 시 이미지가 사라지고
   loading 상태가 남아 무한 스피너가 됐다. IDB는 용량이 훨씬 커(보통 수백 MB~) 이를
   해결한다. 값은 구조화 복제로 저장되므로 JSON 직렬화도 불필요. */

import { cloudPush } from '@/lib/cloud';

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

/** Write a value by key — '로컬만'. 클라우드 미러 없음(클라우드에서 받은 값을 되쓸 때 루프 방지용). */
export async function idbSetRaw(key: string, value: unknown): Promise<boolean> {
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

/** Write a value by key + 클라우드 미러('idb:'+key). 모든 IDB 쓰기가 이 함수를 거치므로
    보드 스냅샷·폴더·갤러리 이미지(image-assets)·슬라이드 이미지·동영상·웹링크 등 IDB 자료 전체가
    자동으로 공유 공간에 동기화된다(자격증명 없으면 cloudPush는 no-op). */
export async function idbSet(key: string, value: unknown): Promise<boolean> {
  const ok = await idbSetRaw(key, value);
  cloudPush('idb:' + key, value);
  return ok;
}

/** object store의 모든 키 — 시작 동기화에서 '클라우드에 없는 로컬 항목'을 올릴 때 쓴다. */
export async function idbKeys(): Promise<string[]> {
  try {
    const db = await openDb();
    return await new Promise<string[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAllKeys();
      req.onsuccess = () => resolve((req.result as IDBValidKey[]).map(String));
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}
