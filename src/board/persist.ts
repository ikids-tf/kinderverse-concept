import { useBoardStore, type BoardSnapshot } from '@/store/boardStore';
import { useBoardsStore, type BoardMeta } from '@/store/boardsStore';
import { idbGet, idbSet } from './idb';

/* Board persistence (PRD §4.2, 성능작업 2-4 · 결정 C). The board model is in-memory
   (boardStore = live board, boardsStore = list + per-board snapshots). This module
   mirrors it to storage with a debounce so a page refresh restores the boards.

   Split storage (이미지 영속 버그 수정):
   - 경량 META(보드 목록 + activeId)는 localStorage에 **동기** 저장 → 앱 시작 시
     activeId가 즉시 준비돼 MyBoardPage가 중복 보드를 만들지 않는다.
   - 무거운 SNAPSHOTS(생성 이미지 data URI 포함)는 **IndexedDB**에 저장 → localStorage
     5MB 한도에 막혀 이미지 저장이 실패하던 문제(새로고침 시 이미지 소실+무한 스피너)
     해결. 구버전 단일 blob(kv:boards:v1)은 최초 1회 IDB로 마이그레이션. */

const META_KEY = 'kv:boards:meta:v1'; // localStorage: { boards, activeId }
const LEGACY_KEY = 'kv:boards:v1'; // 구버전 전체 blob(이미지 포함) — 1회 마이그레이션
const IDB_SNAPSHOTS = 'snapshots'; // IndexedDB: Record<boardId, BoardSnapshot>
const DEBOUNCE_MS = 800;

interface Meta {
  boards: BoardMeta[];
  activeId: string | null;
}
interface LegacyBlob {
  boards: BoardMeta[];
  snapshots: Record<string, BoardSnapshot>;
  activeId: string | null;
}

/* ---------------- hydrate-time sanitation ---------------- */

/** 새로고침 직후엔 진행 중인 생성이 없다 — 떠 있던 로딩 플래그를 모두 끈다.
    이미지 src 저장이 실패해 loading:true 노드가 남으면 무한 스피너가 되므로, 복원
    시점에 loading / data.loading / data.loadingDoc 를 해제해 스피너를 멈춘다(이미지가
    실제로 보존됐다면 src가 그대로 있으니 정상 렌더, 유실됐다면 빈 플레이스홀더). */
function sanitizeLoading(snap: BoardSnapshot): BoardSnapshot {
  let touched = false;
  const nodes: BoardSnapshot['nodes'] = {};
  for (const [id, n] of Object.entries(snap.nodes)) {
    const d = n.data as Record<string, unknown> | undefined;
    const dataLoading = !!(d && (d.loading || d.loadingDoc));
    if (n.loading || dataLoading) {
      touched = true;
      nodes[id] = {
        ...n,
        loading: false,
        ...(dataLoading ? { data: { ...d, loading: false, loadingDoc: false } } : {}),
      };
    } else {
      nodes[id] = n;
    }
  }
  return touched ? { ...snap, nodes } : snap;
}

function sanitizeAll(snaps: Record<string, BoardSnapshot>): Record<string, BoardSnapshot> {
  const out: Record<string, BoardSnapshot> = {};
  for (const [id, s] of Object.entries(snaps)) out[id] = sanitizeLoading(s);
  return out;
}

/* ---------------- read ---------------- */

function loadMeta(): Meta | null {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return null;
    const m = JSON.parse(raw) as Meta;
    return m && Array.isArray(m.boards) ? m : null;
  } catch {
    return null;
  }
}

function loadLegacy(): LegacyBlob | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as LegacyBlob;
    return p && Array.isArray(p.boards) ? p : null;
  } catch {
    return null;
  }
}

/* ---------------- write ---------------- */

function writeMeta(): void {
  try {
    const { boards, activeId } = useBoardsStore.getState();
    localStorage.setItem(META_KEY, JSON.stringify({ boards, activeId } satisfies Meta));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[persist] meta save failed', e);
  }
}

async function write(): Promise<void> {
  // Fold the live board into its snapshot, write the light meta synchronously, then
  // mirror the heavy snapshots (images included) to IndexedDB.
  useBoardsStore.getState().saveActiveLive();
  writeMeta();
  const { snapshots } = useBoardsStore.getState();
  const ok = await idbSet(IDB_SNAPSHOTS, snapshots);
  if (!ok) {
    // eslint-disable-next-line no-console
    console.warn('[persist] snapshot save to IndexedDB failed — board content not persisted this cycle');
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;
function scheduleWrite(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void write(), DEBOUNCE_MS);
}

/* ---------------- hydrate ---------------- */

async function hydrateSnapshots(meta: Meta | null, legacy: LegacyBlob | null): Promise<void> {
  let snapshots = await idbGet<Record<string, BoardSnapshot>>(IDB_SNAPSHOTS);
  // First run after the split: migrate the old single-blob (incl. images) into IDB.
  if (!snapshots && legacy) {
    snapshots = legacy.snapshots ?? {};
    await idbSet(IDB_SNAPSHOTS, snapshots);
    try {
      localStorage.removeItem(LEGACY_KEY);
    } catch {
      /* ignore */
    }
    writeMeta();
  }
  if (!snapshots) return;
  const clean = sanitizeAll(snapshots);
  useBoardsStore.setState({ snapshots: clean });
  const active = meta?.activeId ?? useBoardsStore.getState().activeId;
  if (active && clean[active]) useBoardStore.getState().loadSnapshot(clean[active]);
}

/** Hydrate from storage (if present) and start mirroring changes. Call ONCE, before
    the board UI mounts. The board LIST + activeId restore synchronously (from the
    light meta, or the legacy blob on first migration) so MyBoardPage's "ensure one
    board" effect sees the restored activeId and won't create a duplicate; the heavy
    snapshots (images) then load asynchronously from IndexedDB. */
export function initBoardPersistence(): void {
  const meta = loadMeta();
  // Only touch the legacy blob when no new-format meta exists yet (first migration).
  const legacy = meta ? null : loadLegacy();
  const effectiveMeta: Meta | null =
    meta ?? (legacy ? { boards: legacy.boards, activeId: legacy.activeId ?? null } : null);

  if (effectiveMeta && effectiveMeta.boards.length > 0) {
    useBoardsStore.setState({ boards: effectiveMeta.boards, activeId: effectiveMeta.activeId ?? null });
  }

  void hydrateSnapshots(effectiveMeta, legacy);

  // Live-board changes (edits, drags, board switches via loadSnapshot) trigger a
  // debounced write. Subscribe to boardStore only — saveActiveLive() mutates
  // boardsStore.snapshots, so subscribing there too would loop.
  useBoardStore.subscribe(scheduleWrite);
  // Best-effort flush on tab close — meta is synchronous; the IDB write is async and
  // may not finish, but the debounced writes during the session keep it current.
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      writeMeta();
      void write();
    });
  }
}
