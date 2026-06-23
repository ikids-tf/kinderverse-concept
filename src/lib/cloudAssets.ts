/**
 * 생성 이미지(큰 base64 data URI) → Supabase Storage 버킷 업로드(이관 시 외부화).
 *
 * 보드 스냅샷·인터랙티브 문서엔 생성 이미지가 base64로 박혀 수 MB가 된다. Postgres 행에
 * 그대로 넣으면 느리고 한도 위험이라(사용자 선택: Storage), 클라우드로 밀기 전 모든
 * `data:image/...` 문자열을 버킷에 파일로 올리고 그 자리에 공개 URL을 끼워 넣는다.
 *  - 콘텐츠 해시로 파일명을 잡아 같은 이미지는 한 번만 올린다(업로드 캐시).
 *  - 다른 기기는 URL을 그대로 <img src>로 받아 렌더한다(역변환 불필요).
 */
import { supabase, isCloudEnabled, ASSET_BUCKET } from './supabase';

/** 이미 올린 이미지: 콘텐츠 해시 → 공개 URL (재업로드 생략). */
const UPLOADED_KEY = 'kv:cloud:uploaded:v1';
function loadUploaded(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(UPLOADED_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}
function saveUploaded(m: Record<string, string>): void {
  try {
    localStorage.setItem(UPLOADED_KEY, JSON.stringify(m));
  } catch {
    /* quota — 업로드 캐시는 best-effort */
  }
}
let uploaded = loadUploaded();

/** djb2 계열 해시(+길이 혼합) — 같은 data URI는 같은 키. 충돌은 길이로 완화. */
function contentHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36) + s.length.toString(36);
}

/** data URI → Blob + 확장자. base64/percent 인코딩 모두 처리. 실패 시 null. */
function dataUriToBlob(uri: string): { blob: Blob; ext: string } | null {
  const m = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(uri);
  if (!m) return null;
  const mime = m[1] || 'application/octet-stream';
  const isB64 = !!m[2];
  const ext = (mime.split('/')[1] || 'bin').split('+')[0];
  try {
    if (isB64) {
      const bin = atob(m[3]);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return { blob: new Blob([arr], { type: mime }), ext };
    }
    return { blob: new Blob([decodeURIComponent(m[3])], { type: mime }), ext };
  } catch {
    return null;
  }
}

/** data URI 하나를 버킷에 올리고 공개 URL을 돌려준다(이미 올렸으면 캐시). 일시 실패는 1회 재시도. */
async function uploadDataUri(uri: string): Promise<string | null> {
  if (!isCloudEnabled() || !supabase) return null;
  const key = contentHash(uri);
  const cached = uploaded[key];
  if (cached) return cached;
  const parsed = dataUriToBlob(uri);
  if (!parsed) return null;
  const path = `${key}.${parsed.ext}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { error } = await supabase.storage
      .from(ASSET_BUCKET)
      .upload(path, parsed.blob, { upsert: true, contentType: parsed.blob.type });
    if (!error || /exists|duplicate/i.test(error.message)) {
      const url = supabase.storage.from(ASSET_BUCKET).getPublicUrl(path).data.publicUrl;
      uploaded = { ...uploaded, [key]: url };
      saveUploaded(uploaded);
      return url;
    }
    if (attempt === 1) {
      // eslint-disable-next-line no-console
      console.warn('[cloud] 이미지 업로드 실패(재시도 후)', error.message);
      return null;
    }
    await new Promise((r) => setTimeout(r, 250)); // 일시 오류 — 잠깐 쉬고 재시도
  }
  return null;
}

/** 동시 업로드 수를 제한해 큰 배치(폴더 등 수십 장)에서 일부가 떨어지는 것을 막는다. */
async function uploadAll(uris: string[], concurrency = 4): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let i = 0;
  const worker = async (): Promise<void> => {
    while (i < uris.length) {
      const u = uris[i++];
      const url = await uploadDataUri(u);
      if (url) map.set(u, url);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, uris.length) }, worker));
  return map;
}

/** base64 미디어 data URI 패턴(이미지·동영상·오디오) — '문자열 전체'는 물론 '문자열 안에 박힌'
    것도 잡는다(폴더의 board 스냅샷처럼 data URI가 JSON 문자열 안에 직렬화돼 들어간 경우 대응). */
const DATA_IMG_RE = /data:(?:image|video|audio)\/[A-Za-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g;

/**
 * 값을 깊이 순회하며 모든 `data:image/*;base64,...`를 업로드해 공개 URL로 바꾼 '새 구조'를 반환.
 * 문자열 전체가 data URI인 경우는 물론, 문자열 '안에 박힌' data URI(직렬화된 JSON 등)도 치환한다.
 * 업로드 실패분은 원본 유지(데이터 보존). 클라우드 비활성이면 원본 그대로.
 */
export async function externalizeAssets<T>(value: T): Promise<T> {
  if (!isCloudEnabled()) return value;
  const uris = new Set<string>();
  const scan = (s: string): void => {
    const found = s.match(DATA_IMG_RE);
    if (found) for (const u of found) if (u.length > 256) uris.add(u);
  };
  const collect = (v: unknown): void => {
    if (typeof v === 'string') scan(v);
    else if (Array.isArray(v)) v.forEach(collect);
    else if (v && typeof v === 'object') for (const k in v as Record<string, unknown>) collect((v as Record<string, unknown>)[k]);
  };
  collect(value);
  if (uris.size === 0) return value;

  const map = await uploadAll([...uris]);
  if (map.size === 0) return value;

  const replaceInString = (s: string): string => {
    let out = s;
    for (const [u, url] of map) if (out.includes(u)) out = out.split(u).join(url); // 전체·부분 모두 치환
    return out;
  };
  const replace = (v: unknown): unknown => {
    if (typeof v === 'string') return replaceInString(v);
    if (Array.isArray(v)) return v.map(replace);
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const k in v as Record<string, unknown>) out[k] = replace((v as Record<string, unknown>)[k]);
      return out;
    }
    return v;
  };
  return replace(value) as T;
}
