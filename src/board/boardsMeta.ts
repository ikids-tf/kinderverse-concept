import type { BoardMeta } from '@/store/boardsStore';

/* 보드 목록(meta)의 클라우드 병합 규칙 — '통째로 교체(LWW)'가 남의 새 보드를 지우던 문제의 해법.
   목록은 항상 합집합으로 합치고, 삭제는 톰스톤(removed: id→삭제시각)으로 표현한다.
   톰스톤이 있으면 어느 쪽 목록에 남아 있어도 제외 — "옛 탭이 옛 목록을 push해서
   방금 만든 보드가 사라지는" 것과 "지운 보드가 병합으로 되살아나는" 것을 동시에 막는다. */

/** 보드 저장 키 — persist(쓰기)·cloudSync(시작 병합)·cloudRealtime(수신)이 공유. */
export const META_LS_KEY = 'kv:boards:meta:v1';
export const META_CLOUD_KEY = 'ls:' + META_LS_KEY;
/** 클라우드의 보드별 스냅샷 행 접두사(행 = 보드 하나). */
export const SNAP_CLOUD_PREFIX = 'idb:snapshot:';
/** 구버전 클라이언트가 쓰던 '전 보드 한 덩어리' 행 — 읽기 보충용으로만 쓰고 더는 갱신하지 않는다. */
export const LEGACY_SNAPSHOTS_CLOUD_KEY = 'idb:snapshots';
/** 로컬 IndexedDB의 스냅샷 블롭 키(로컬 구조는 기존 그대로 한 덩어리 유지). */
export const IDB_SNAPSHOTS_KEY = 'snapshots';

export interface BoardsMetaShape {
  boards: BoardMeta[];
  activeId: string | null;
  /** 삭제 톰스톤: 보드 id → 삭제 시각(ms). 오래된 항목은 병합 시 정리된다. */
  removed?: Record<string, number>;
}

/** 톰스톤 보존 기간 — 이보다 오래 오프라인이던 탭의 부활까지는 범위 밖(LWW 모델의 한계와 동일). */
const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function mergeTombstones(
  a: Record<string, number> | undefined,
  b: Record<string, number> | undefined,
): Record<string, number> {
  const cutoff = Date.now() - TOMBSTONE_TTL_MS;
  const out: Record<string, number> = {};
  for (const m of [a, b]) {
    for (const [id, ts] of Object.entries(m ?? {})) {
      if (typeof ts !== 'number' || ts <= cutoff) continue;
      if (out[id] == null || ts > out[id]) out[id] = ts;
    }
  }
  return out;
}

/**
 * 두 목록을 병합한다. 순서는 remote 우선(공유 진실 쪽 순서 유지) + local 전용 보드는 뒤에.
 * 같은 id가 양쪽에 있으면 기본은 remote 항목(제목 등)을 쓰고, preferLocal이면 local 항목을
 * 쓴다 — '로컬 마지막 쓰기가 클라우드 행보다 최신'일 때(이름변경 직후 등) 호출부가 지정.
 * activeId는 '이 기기'의 것 우선(다른 사람 활성 보드로 화면이 튀지 않게).
 */
export function mergeBoardsMeta(
  local: BoardsMetaShape | null,
  remote: BoardsMetaShape | null,
  preferLocal = false,
): BoardsMetaShape {
  const removed = mergeTombstones(local?.removed, remote?.removed);

  const chosen = new Map<string, BoardMeta>();
  const order: string[] = [];
  for (const b of remote?.boards ?? []) {
    if (!b || typeof b.id !== 'string' || removed[b.id] != null || chosen.has(b.id)) continue;
    chosen.set(b.id, b);
    order.push(b.id);
  }
  for (const b of local?.boards ?? []) {
    if (!b || typeof b.id !== 'string' || removed[b.id] != null) continue;
    if (!chosen.has(b.id)) {
      chosen.set(b.id, b);
      order.push(b.id);
    } else if (preferLocal) chosen.set(b.id, b);
  }
  const boards = order.map((id) => chosen.get(id)!);

  let activeId = local?.activeId ?? remote?.activeId ?? null;
  if (activeId && !chosen.has(activeId)) activeId = boards[boards.length - 1]?.id ?? null;

  return { boards, activeId, removed };
}

/** 병합 결과가 remote와 실질적으로 다른가(다르면 역푸시가 필요하다는 뜻). */
export function metaDiffers(merged: BoardsMetaShape, remote: BoardsMetaShape | null): boolean {
  if (!remote) return true;
  const ids = (m: BoardsMetaShape) =>
    (m.boards ?? []).map((b) => `${b.id}\t${b.title}`).join('\n');
  if (ids(merged) !== ids(remote)) return true;
  const tombs = (m: BoardsMetaShape) => Object.keys(m.removed ?? {}).sort().join(',');
  return tombs(merged) !== tombs(remote);
}
