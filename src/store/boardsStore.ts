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
    const { activeId } = get();
    if (!activeId) return;
    set((s) => ({ snapshots: { ...s.snapshots, [activeId]: useBoardStore.getState().snapshot() } }));
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
