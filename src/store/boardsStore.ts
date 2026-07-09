import { create } from 'zustand';
import { useBoardStore, newId, type BoardSnapshot } from './boardStore';
import { seedSnapshot, KIND_LABEL, type BoardKind } from '@/board/seed';

/* Multi-board manager (PRD §4.2). The active board's live editing state lives in
   boardStore; this store holds the board list + each board's saved snapshot and
   orchestrates create/switch (save current live → load target). Session-scoped
   (consistent with board content, which has always been in-memory). */

export interface BoardMeta {
  id: string;
  title: string;
  kind: BoardKind;
}

interface BoardsState {
  boards: BoardMeta[];
  snapshots: Record<string, BoardSnapshot>;
  activeId: string | null;

  /** Create a seeded board for a kind, make it active, load it live. */
  createBoard: (kind: BoardKind, title?: string) => string;
  /** Save current live board, switch active to id, load it live. */
  switchBoard: (id: string) => void;
  removeBoard: (id: string) => void;
  renameBoard: (id: string, title: string) => void;
  /** Persist the live board into the active snapshot (call before leaving). */
  saveActiveLive: () => void;
}

let n = 0;
function autoTitle(kind: BoardKind): string {
  n += 1;
  return kind === 'general' ? `보드 ${n}` : `${KIND_LABEL[kind]} ${n}`;
}

export const useBoardsStore = create<BoardsState>((set, get) => ({
  boards: [],
  snapshots: {},
  activeId: null,

  saveActiveLive: () => {
    const { activeId, snapshots } = get();
    if (!activeId) return;
    const live = useBoardStore.getState().snapshot();
    // ★ 사고 방지 — 빈 라이브 보드로 '내용 있는' 저장본을 덮어쓰지 않는다. 하이드레이션
    //   전/일시적 빈 상태나 전체 새로고침 사이에 빈 보드가 자동저장돼 콘텐츠를 날리던 문제.
    //   (보드를 정말 비우려면 보드 자체를 삭제하면 된다.)
    const liveEmpty = Object.keys(live.nodes).length === 0 && (live.laneOrder?.length ?? 0) === 0;
    const prev = snapshots[activeId];
    const prevHadContent = !!prev && Object.keys(prev.nodes ?? {}).length > 0;
    if (liveEmpty && prevHadContent) {
      // eslint-disable-next-line no-console
      console.warn('[boards] skip save — live board empty but saved snapshot has content (overwrite blocked)');
      return;
    }
    set((s) => ({ snapshots: { ...s.snapshots, [activeId]: live } }));
  },

  createBoard: (kind, title) => {
    get().saveActiveLive();
    const id = newId('board');
    const snap = seedSnapshot(kind);
    set((s) => ({
      boards: [...s.boards, { id, title: title ?? autoTitle(kind), kind }],
      snapshots: { ...s.snapshots, [id]: snap },
      activeId: id,
    }));
    useBoardStore.getState().loadSnapshot(snap);
    return id;
  },

  switchBoard: (id) => {
    if (get().activeId === id) return;
    get().saveActiveLive();
    set({ activeId: id });
    const snap = get().snapshots[id];
    if (snap) useBoardStore.getState().loadSnapshot(snap);
  },

  removeBoard: (id) =>
    set((s) => {
      const snapshots = { ...s.snapshots };
      delete snapshots[id];
      const boards = s.boards.filter((b) => b.id !== id);
      let activeId = s.activeId;
      if (activeId === id) {
        activeId = boards[boards.length - 1]?.id ?? null;
        const snap = activeId ? snapshots[activeId] : null;
        if (snap) useBoardStore.getState().loadSnapshot(snap);
      }
      return { boards, snapshots, activeId };
    }),

  renameBoard: (id, title) =>
    set((s) => ({ boards: s.boards.map((b) => (b.id === id ? { ...b, title } : b)) })),
}));

// 개발용 — 콘솔/프리뷰 하네스에서 보드 목록·스냅샷 점검 및 복구에 쓴다(__kvBoard 와 동일 패턴).
// 프로덕션 빌드에선 no-op.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __kvBoards?: typeof useBoardsStore }).__kvBoards = useBoardsStore;
}
