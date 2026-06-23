/**
 * 주인공(액터) '측면 포즈' 저장 — InteractiveNode 스키마는 동결이라 doc 안에 넣지 않고
 * `${docId}:${elId}` 키로 별도 보관한다. 정면은 doc의 el.src(메인, 시작/끝 정지 상태),
 * 측면은 여기에 두고 런타임이 '이동 중'에만 꺼내 쓴다(이동 방향으로 플립).
 */
const KEY = 'kv:actor-poses:v1';

type PoseMap = Record<string, string>; // `${docId}:${elId}` -> 측면 data URI

function read(): PoseMap {
  if (typeof localStorage === 'undefined') return {};
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return v && typeof v === 'object' ? (v as PoseMap) : {};
  } catch {
    return {};
  }
}
function write(m: PoseMap): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(m)); // localStorage 미러가 클라우드로 동기화
  } catch {
    /* quota 초과 — 무시(측면 포즈는 폴백으로 정면 유지) */
  }
}

/** 액터의 측면 포즈 data URI를 저장(같은 키면 갱신). */
export function saveActorSide(docId: string, elId: string, sideDataUri: string): void {
  const m = read();
  m[`${docId}:${elId}`] = sideDataUri;
  write(m);
}

/** 액터의 측면 포즈 data URI를 읽는다(없으면 null → 런타임은 정면만 사용). */
export function loadActorSide(docId: string, elId: string): string | null {
  return read()[`${docId}:${elId}`] ?? null;
}
