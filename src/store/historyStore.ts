import { create } from 'zustand';

/* Undo/Redo command history (SKILL.md §6.2).
   Skeleton for M1: the stack + push/undo/redo machinery exists and is verifiable
   with empty stacks. Real board actions get bound to this module in M4.

   Design notes:
   - History is SEPARATE from board state (this store holds only commands).
   - Every reversible board action becomes a Command with do()/undo().
   - L1 actions (draft generation, classification, layout, AI apply/merge) are
     undoable. L3 (external send, permanent delete) are NOT pushed here — they go
     through confirm modals, never a bare Ctrl+Z (see §6.2 / autonomy gates).
   - Persistence: session-only for M1. (Durable history is a later decision.)
*/

export interface Command {
  /** Stable id for debugging / telemetry. */
  id: string;
  /** Human-readable label, e.g. "카드 이동", "AI 생성 적용". */
  label: string;
  /** Apply / re-apply the change (used on initial run and on redo). */
  do: () => void;
  /** Reverse the change. */
  undo: () => void;
  /**
   * Autonomy level. Only L1 belongs in the undo stack. L3 must never be pushed
   * (guarded in `push`). Defaults to 'L1'.
   */
  level?: 'L1' | 'L2';
}

interface HistoryState {
  past: Command[];
  future: Command[];
  limit: number;

  /** Run a command immediately and record it (clears the redo branch). */
  execute: (cmd: Command) => void;
  /** Record an already-applied command without running do() again. */
  push: (cmd: Command) => void;

  undo: () => void;
  redo: () => void;

  canUndo: () => boolean;
  canRedo: () => boolean;
  clear: () => void;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  past: [],
  future: [],
  limit: 100,

  execute: (cmd) => {
    cmd.do();
    get().push(cmd);
  },

  push: (cmd) => {
    if (cmd.level && cmd.level !== 'L1' && cmd.level !== 'L2') return;
    set((s) => {
      const past = [...s.past, cmd];
      // Trim to the configured limit (drop oldest).
      if (past.length > s.limit) past.splice(0, past.length - s.limit);
      return { past, future: [] };
    });
  },

  undo: () => {
    const { past } = get();
    if (past.length === 0) return;
    const cmd = past[past.length - 1];
    cmd.undo();
    set((s) => ({
      past: s.past.slice(0, -1),
      future: [cmd, ...s.future],
    }));
  },

  redo: () => {
    const { future } = get();
    if (future.length === 0) return;
    const cmd = future[0];
    cmd.do();
    set((s) => ({
      past: [...s.past, cmd],
      future: s.future.slice(1),
    }));
  },

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,
  clear: () => set({ past: [], future: [] }),
}));
