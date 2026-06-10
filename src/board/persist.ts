import { useBoardStore, type BoardSnapshot } from '@/store/boardStore';
import { useBoardsStore, type BoardMeta } from '@/store/boardsStore';

/* Board persistence (PRD §4.2, 성능작업 2-4 · 결정 C). The board model is in-memory
   (boardStore = live board, boardsStore = list + per-board snapshots). This module
   mirrors it to localStorage with a debounce so a page refresh restores the boards —
   no schema change, no backend. Live edits are folded into the active snapshot via
   saveActiveLive() right before each write. */

const KEY = 'kv:boards:v1';
const DEBOUNCE_MS = 800;

interface Persisted {
  boards: BoardMeta[];
  snapshots: Record<string, BoardSnapshot>;
  activeId: string | null;
}

/** Read the persisted board blob (null if absent/corrupt). */
export function loadPersisted(): Persisted | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Persisted;
    return p && Array.isArray(p.boards) ? p : null;
  } catch {
    return null;
  }
}

function snapshotForWrite(): Persisted {
  // Fold the live board into its snapshot, then read the full board set.
  useBoardsStore.getState().saveActiveLive();
  const { boards, snapshots, activeId } = useBoardsStore.getState();
  return { boards, snapshots, activeId };
}

function write(retry = true): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(snapshotForWrite()));
  } catch (e) {
    // Quota (image-heavy boards store base64 data URIs) or serialization failure.
    // eslint-disable-next-line no-console
    console.warn('[persist] board save failed', e);
    if (retry) {
      try {
        localStorage.setItem(KEY, JSON.stringify(snapshotForWrite()));
      } catch (e2) {
        // eslint-disable-next-line no-console
        console.warn('[persist] board save retry failed — board not persisted this cycle', e2);
      }
    }
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;
function scheduleWrite(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => write(true), DEBOUNCE_MS);
}

/** Hydrate from localStorage (if present) and start mirroring changes. Call ONCE,
    before the board UI mounts, so a restored activeId is in place before MyBoardPage's
    "ensure one board" effect runs (otherwise it would create a duplicate). */
export function initBoardPersistence(): void {
  const p = loadPersisted();
  if (p && p.boards.length > 0) {
    useBoardsStore.setState({ boards: p.boards, snapshots: p.snapshots ?? {}, activeId: p.activeId ?? null });
    if (p.activeId && p.snapshots?.[p.activeId]) {
      useBoardStore.getState().loadSnapshot(p.snapshots[p.activeId]);
    }
  }

  // Live-board changes (edits, drags, board switches via loadSnapshot) trigger a
  // debounced write. We subscribe to boardStore only — saveActiveLive() mutates
  // boardsStore.snapshots, so subscribing there too would loop.
  useBoardStore.subscribe(scheduleWrite);
  // Best-effort flush on tab close so the last edits aren't lost inside the debounce.
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => write(false));
  }
}
