/**
 * localStorage 전역 미러 — `setItem`을 가로채 '앱 자료' 키를 모두 클라우드로 동기화한다.
 * 이걸로 흩어진 localStorage 저장(보드 목록·게임·라이브러리·포즈·갤러리 좋아요·수업기록·게임뷰어
 * 저장본·슬라이드 덱·우리반 등)을 한 군데서 빠짐없이 미러한다. 자격증명 없으면 cloudPush가 no-op.
 *
 * 루프 방지: 클라우드에서 받은 값을 되쓸 땐 rawLocalSet()을 써서 미러를 타지 않는다.
 */
import { cloudPush } from './cloud';

/** 앱 자료로 보고 동기화할 키 접두사. (image-assets 등은 IDB라 여기 없음 — idb.ts가 담당.) */
const APP_PREFIXES = ['kv:', 'kv-deck-'];
/** 동기화에서 제외(기기-로컬 전용·내부 캐시). */
const DENY = new Set(['kv:cloud:uploaded:v1', 'kv:boards:v1']);

function shouldMirror(k: string): boolean {
  if (DENY.has(k)) return false;
  return APP_PREFIXES.some((p) => k.startsWith(p));
}

let original: ((key: string, value: string) => void) | null = null;

/** 미러를 타지 않는 원본 setItem(클라우드 적용 시 사용). */
export function rawLocalSet(key: string, value: string): void {
  try {
    (original ?? localStorage.setItem.bind(localStorage))(key, value);
  } catch {
    /* quota — best effort */
  }
}

/** 앱 시작 시 1회 호출 — setItem을 패치한다. */
export function installLocalStorageMirror(): void {
  if (original || typeof localStorage === 'undefined') return;
  original = localStorage.setItem.bind(localStorage);
  localStorage.setItem = (key: string, value: string): void => {
    original!(key, value);
    if (!shouldMirror(key)) return;
    let parsed: unknown = value;
    try {
      parsed = JSON.parse(value);
    } catch {
      /* 비-JSON 값은 문자열 그대로 */
    }
    cloudPush('ls:' + key, parsed);
  };
}

/** 동기화 대상 localStorage 키인지(시작 동기화의 migrate-up에서 사용). */
export function isMirroredKey(k: string): boolean {
  return shouldMirror(k);
}
