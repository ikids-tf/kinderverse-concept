import { useBoardStore, type BoardSnapshot } from '@/store/boardStore';
import { useBoardsStore, type BoardMeta } from '@/store/boardsStore';
import { idbGet, idbSetRaw } from './idb';
import { cloudPush, cloudDeleteNow, isLocalNewerThan } from '@/lib/cloud';
import { rawLocalSet } from '@/lib/cloudMirror';
import {
  mergeBoardsMeta,
  META_LS_KEY,
  META_CLOUD_KEY,
  SNAP_CLOUD_PREFIX,
  IDB_SNAPSHOTS_KEY,
  type BoardsMetaShape,
} from './boardsMeta';

/* Board persistence (PRD §4.2, 성능작업 2-4 · 결정 C). The board model is in-memory
   (boardStore = live board, boardsStore = list + per-board snapshots). This module
   mirrors it to storage with a debounce so a page refresh restores the boards.

   Split storage (이미지 영속 버그 수정):
   - 경량 META(보드 목록 + activeId + 삭제 톰스톤)는 localStorage에 **동기** 저장 → 앱 시작 시
     activeId가 즉시 준비돼 MyBoardPage가 중복 보드를 만들지 않는다.
   - 무거운 SNAPSHOTS(생성 이미지 data URI 포함)는 **IndexedDB**에 저장 → localStorage
     5MB 한도에 막혀 이미지 저장이 실패하던 문제(새로고침 시 이미지 소실+무한 스피너)
     해결. 구버전 단일 blob(kv:boards:v1)은 최초 1회 IDB로 마이그레이션.

   클라우드 미러(다중 사용자 덮어쓰기 수정):
   - 로컬 IDB는 기존처럼 한 덩어리(blob)로 두되, **클라우드에는 보드별 행**
     (`idb:snapshot:<boardId>`)으로 올린다 — 서로 다른 보드를 만지는 사용자끼리는
     절대 안 부딪히게. 그래서 blob은 idbSetRaw(미러 없음)로 쓰고, 변경된 보드만
     cloudPush한다(참조 비교 diff).
   - 목록(meta)은 localStorage.setItem을 그대로 써서 미러를 태우고, 병합 규칙은
     boardsMeta.ts(합집합+톰스톤)가 담당한다. 삭제는 톰스톤 기록 + 클라우드 행 삭제.
   - 다른 기기의 변경 수신(applyRemote*)은 cloudRealtime이 호출한다. */

const META_KEY = META_LS_KEY; // localStorage: { boards, activeId, removed }
const LEGACY_KEY = 'kv:boards:v1'; // 구버전 전체 blob(이미지 포함) — 1회 마이그레이션
const IDB_SNAPSHOTS = IDB_SNAPSHOTS_KEY; // IndexedDB: Record<boardId, BoardSnapshot>
const DEBOUNCE_MS = 800;

type Meta = BoardsMetaShape;
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

/** 삭제 톰스톤(id→삭제시각). meta의 removed 필드로 영속·클라우드 병합된다. */
let tombstones: Record<string, number> = {};
/** 직전 저장 시점의 보드 id 목록 — 삭제 감지(diff)용. */
let prevBoardIds: string[] | null = null;

function writeMeta(force = false): void {
  if (!hydrated && !force) return; // 복원 전의 빈/부분 상태로 저장본을 덮지 않는다
  try {
    const { boards, activeId } = useBoardsStore.getState();
    // 삭제 감지 → 톰스톤. '전부 사라짐'은 사고(하이드레이션 꼬임 등)로 보고 기록하지 않는다.
    if (prevBoardIds && boards.length > 0) {
      const cur = new Set(boards.map((b) => b.id));
      for (const id of prevBoardIds) if (!cur.has(id)) tombstones[id] = Date.now();
    }
    prevBoardIds = boards.map((b) => b.id);
    // setItem은 cloudMirror 패치를 타고 클라우드(META_CLOUD_KEY)로 push된다.
    localStorage.setItem(
      META_KEY,
      JSON.stringify({ boards, activeId, removed: tombstones } satisfies Meta),
    );
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[persist] meta save failed', e);
  }
}

/** 이 탭이 클라우드로 push한(또는 수신해 이미 반영한) 보드별 스냅샷 참조 — 변경 diff용. */
const lastPushed = new Map<string, BoardSnapshot>();

/** 변경된 보드만 클라우드 보드별 행으로 push, 사라진 보드는 행 삭제. */
function pushChangedSnapshots(snapshots: Record<string, BoardSnapshot>): void {
  for (const [id, snap] of Object.entries(snapshots)) {
    if (lastPushed.get(id) !== snap) {
      lastPushed.set(id, snap);
      cloudPush(SNAP_CLOUD_PREFIX + id, snap);
    }
  }
  for (const id of [...lastPushed.keys()]) {
    if (!(id in snapshots)) {
      lastPushed.delete(id);
      void cloudDeleteNow(SNAP_CLOUD_PREFIX + id);
    }
  }
}

async function write(): Promise<void> {
  if (!hydrated) return; // beforeunload가 복원 전에 오면 빈 상태로 blob을 덮을 수 있다
  // Fold the live board into its snapshot, write the light meta synchronously, then
  // mirror the heavy snapshots (images included) to IndexedDB.
  useBoardsStore.getState().saveActiveLive();
  writeMeta(); // localStorage 미러가 보드 목록(meta)을 클라우드로 올린다
  const { snapshots } = useBoardsStore.getState();
  // 로컬 blob은 raw로(클라우드는 아래 보드별 행이 담당 — 한 덩어리 push는 다중 사용자 덮어쓰기의 원인).
  const ok = await idbSetRaw(IDB_SNAPSHOTS, snapshots);
  if (!ok) {
    // eslint-disable-next-line no-console
    console.warn('[persist] snapshot save to IndexedDB failed — board content not persisted this cycle');
  }
  pushChangedSnapshots(snapshots);
}

let timer: ReturnType<typeof setTimeout> | undefined;
// 하이드레이션이 끝나기 전에는 저장하지 않는다 — 복원되기 전 빈/부분 상태가 저장본을
// 덮어쓰는 것을 막는다(saveActiveLive의 빈-덮어쓰기 가드와 함께 이중 안전).
let hydrated = false;
function scheduleWrite(): void {
  if (!hydrated) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void write(), DEBOUNCE_MS);
}

/* ---------------- remote apply (cloudRealtime이 호출) ---------------- */

/** 로컬 blob을 스토어의 최신 snapshots로 재기록(raw — 미러 없음). */
function writeLocalBlob(): void {
  void idbSetRaw(IDB_SNAPSHOTS, useBoardsStore.getState().snapshots);
}

/**
 * 다른 기기의 목록 변경 수신 — 병합해 적용한다(덮어쓰기 아님).
 * remoteAt(행 updated_at)이 이 탭의 마지막 쓰기보다 오래됐으면 로컬 항목(제목 등)을 우선한다.
 */
export function applyRemoteBoardsMeta(remote: BoardsMetaShape, remoteAt?: string): void {
  const s = useBoardsStore.getState();
  const preferLocal = isLocalNewerThan(META_CLOUD_KEY, remoteAt);
  const merged = mergeBoardsMeta(
    { boards: s.boards, activeId: s.activeId, removed: tombstones },
    remote,
    preferLocal,
  );
  tombstones = merged.removed ?? {};
  prevBoardIds = merged.boards.map((b) => b.id);

  // 톰스톤된 보드의 스냅샷 정리 + 활성 보드가 지워졌으면 전환
  const removedActive = !!s.activeId && !merged.boards.some((b) => b.id === s.activeId);
  const snapshots = { ...s.snapshots };
  let snapsChanged = false;
  for (const id of Object.keys(snapshots)) {
    if (tombstones[id] != null) {
      delete snapshots[id];
      lastPushed.delete(id);
      snapsChanged = true;
    }
  }
  useBoardsStore.setState({
    boards: merged.boards,
    activeId: merged.activeId,
    ...(snapsChanged ? { snapshots } : {}),
  });
  if (removedActive && merged.activeId) {
    const snap = useBoardsStore.getState().snapshots[merged.activeId];
    if (snap) useBoardStore.getState().loadSnapshot(snap);
  }
  // raw 저장 — 수신 반영이 다시 방송/역푸시되는 루프를 막는다(값은 이미 클라우드와 동일).
  rawLocalSet(META_KEY, JSON.stringify(merged));
  if (snapsChanged) writeLocalBlob();
}

/**
 * 다른 기기의 보드 스냅샷 수신. 스토어/로컬 저장소에 반영하되, **활성 보드의 라이브 편집
 * 상태(boardStore)는 건드리지 않는다** — 입력 중 화면이 갈아엎히는 걸 막는다. 이 탭이
 * 그 보드를 이어서 저장하면 LWW로 이 탭 것이 남는다(같은 보드 동시 편집의 원래 한계).
 */
export function applyRemoteSnapshot(id: string, snap: BoardSnapshot): void {
  if (tombstones[id] != null) return; // 이 기기에서 지운 보드 — 무시
  const clean = sanitizeLoading(snap);
  lastPushed.set(id, clean); // 되밀기(재push) 방지
  useBoardsStore.setState((s) => ({ snapshots: { ...s.snapshots, [id]: clean } }));
  writeLocalBlob();
}

/** 다른 기기의 보드 삭제 수신 — 톰스톤을 남기고 목록/스냅샷에서 제거. */
export function applyRemoteSnapshotDelete(id: string): void {
  tombstones[id] = Date.now();
  lastPushed.delete(id);
  const s = useBoardsStore.getState();
  if (!s.boards.some((b) => b.id === id) && !(id in s.snapshots)) return;
  const boards = s.boards.filter((b) => b.id !== id);
  const snapshots = { ...s.snapshots };
  delete snapshots[id];
  let activeId = s.activeId;
  if (activeId === id) {
    activeId = boards[boards.length - 1]?.id ?? null;
    const snap = activeId ? snapshots[activeId] : null;
    if (snap) useBoardStore.getState().loadSnapshot(snap);
  }
  prevBoardIds = boards.map((b) => b.id);
  useBoardsStore.setState({ boards, snapshots, activeId });
  rawLocalSet(META_KEY, JSON.stringify({ boards, activeId, removed: tombstones } satisfies Meta));
  writeLocalBlob();
}

/* ---------------- hydrate ---------------- */

async function hydrateSnapshots(meta: Meta | null, legacy: LegacyBlob | null): Promise<void> {
  let snapshots = await idbGet<Record<string, BoardSnapshot>>(IDB_SNAPSHOTS);
  // First run after the split: migrate the old single-blob (incl. images) into IDB.
  if (!snapshots && legacy) {
    snapshots = legacy.snapshots ?? {};
    await idbSetRaw(IDB_SNAPSHOTS, snapshots);
    try {
      localStorage.removeItem(LEGACY_KEY);
    } catch {
      /* ignore */
    }
    writeMeta(true);
  }
  if (!snapshots) return;
  const clean = sanitizeAll(snapshots);
  useBoardsStore.setState({ snapshots: clean });
  const active = meta?.activeId ?? useBoardsStore.getState().activeId;
  if (active && clean[active]) useBoardStore.getState().loadSnapshot(clean[active]);
}

/** 하이드레이션 완료 표시 — 이후부터 자동저장 허용(그 전 빈 상태는 저장 안 함).
    현재 스냅샷들을 diff 기준(lastPushed)으로 등록해 시작 직후의 무의미한 전체 재push를 막는다
    (클라우드와의 최초 정합은 cloudSync가 이미 맞춰놓았다). */
function markHydrated(): void {
  hydrated = true;
  const { boards, snapshots } = useBoardsStore.getState();
  prevBoardIds = boards.map((b) => b.id);
  for (const [id, s] of Object.entries(snapshots)) lastPushed.set(id, s);
}

/** Hydrate from storage (if present) and start mirroring changes. Call ONCE, before
    the board UI mounts. The board LIST + activeId restore synchronously (from the
    light meta, or the legacy blob on first migration) so MyBoardPage's "ensure one
    board" effect sees the restored activeId and won't create a duplicate; the heavy
    snapshots (images) then load asynchronously from IndexedDB. */
export function initBoardPersistence(): void {
  const meta = loadMeta();
  tombstones = meta?.removed ?? {};
  // Only touch the legacy blob when no new-format meta exists yet (first migration).
  const legacy = meta ? null : loadLegacy();
  const effectiveMeta: Meta | null =
    meta ?? (legacy ? { boards: legacy.boards, activeId: legacy.activeId ?? null } : null);

  if (effectiveMeta && effectiveMeta.boards.length > 0) {
    useBoardsStore.setState({ boards: effectiveMeta.boards, activeId: effectiveMeta.activeId ?? null });
  }

  // 하이드레이션이 끝난 뒤에야 자동저장을 켠다(복원 전 빈 상태가 저장본을 덮지 않게).
  void hydrateSnapshots(effectiveMeta, legacy).finally(markHydrated);

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
