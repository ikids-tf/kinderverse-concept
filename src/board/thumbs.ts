import { idbGet, idbSet } from './idb';

/* 갤러리 썸네일 캐시 — 보관함 자산은 풀해상도 base64 data URI(평균 ~1.4MB)라
   128장을 그리드에 그대로 그리면 ~183MB가 메모리에 올라와 갤러리 진입이 느려진다.
   자산별로 작은 썸네일(긴 변 384px · JPEG 0.72 ≈ 30KB)을 한 번 구워 IDB에 캐시해
   그리드는 썸네일만 쓴다(풀해상도는 뷰어/다운로드에서만). 키는 자산 id(태그+생성시각)로
   안정적이라 새로고침해도 재사용된다. */

const KEY = 'gallery-thumbs:v1';
const MAX_EDGE = 384;
const QUALITY = 0.72;

let cache: Record<string, string> | null = null;
const inflight = new Map<string, Promise<string>>(); // 같은 id 동시 생성 합치기

async function loadCache(): Promise<Record<string, string>> {
  if (!cache) cache = (await idbGet<Record<string, string>>(KEY)) ?? {};
  return cache;
}

/* 새 썸네일이 생길 때마다 IDB에 쓰면 잦은 쓰기가 되므로 1초 디바운스로 모아 저장. */
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave(): void {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (cache) void idbSet(KEY, cache);
  }, 1000);
}

/** 풀 data URI를 긴 변 384px JPEG로 축소. 이미 작거나 실패하면 원본을 그대로 반환. */
function downscale(fullUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      try {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (!w || !h) return resolve(fullUrl);
        const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
        if (scale >= 1) return resolve(fullUrl); // 이미 충분히 작으면 그대로
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(w * scale));
        cv.height = Math.max(1, Math.round(h * scale));
        const ctx = cv.getContext('2d');
        if (!ctx) return resolve(fullUrl);
        ctx.drawImage(img, 0, 0, cv.width, cv.height);
        // 투명 영역이 있으면(누끼 PNG 등) JPEG로 구우면 검게 합성되므로 알파를 보존한 PNG로.
        let hasAlpha = false;
        try {
          const corners = [[0, 0], [cv.width - 1, 0], [0, cv.height - 1], [cv.width - 1, cv.height - 1]];
          hasAlpha = corners.some(([x, y]) => ctx.getImageData(x, y, 1, 1).data[3] < 250);
        } catch {
          hasAlpha = false; // cross-origin 등으로 픽셀을 못 읽으면 JPEG 폴백
        }
        resolve(hasAlpha ? cv.toDataURL('image/png') : cv.toDataURL('image/jpeg', QUALITY));
      } catch {
        resolve(fullUrl);
      }
    };
    img.onerror = () => resolve(fullUrl);
    img.src = fullUrl;
  });
}

/** 자산 썸네일(캐시 우선). 캐시에 없으면 풀 url에서 한 번 구워 IDB에 저장한다. */
export async function getThumb(id: string, fullUrl: string): Promise<string> {
  const c = await loadCache();
  if (c[id]) return c[id];
  let p = inflight.get(id);
  if (!p) {
    p = downscale(fullUrl).then((thumb) => {
      c[id] = thumb;
      scheduleSave();
      inflight.delete(id);
      return thumb;
    });
    inflight.set(id, p);
  }
  return p;
}
