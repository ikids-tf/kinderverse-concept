import { create } from 'zustand';

/* Global UI slice — prompt bar shell state + per-page action context.
   The prompt bar is a persistent shell across all pages (CLAUDE.md §2, SKILL §7). */

interface UIState {
  /** Prompt bar collapsed = only the message icon shows (right round toggle / §7). */
  promptBarCollapsed: boolean;
  /** Favorite card rail risen above the bar (star click on empty input, §7). */
  favoritesOpen: boolean;
  /** Current prompt input draft (lifted so favorites/star↔send can read emptiness). */
  promptDraft: string;

  /**
   * Actions available on the current page. The router only routes within this set
   * (SKILL §3 rule 2, §7). Populated per page; consumed by the (future) router.
   */
  availableActions: string[];

  /** Left inset (px) for the prompt bar so it centers within the page's content
      area, clearing any page-level left panel (e.g. AI chat aside). */
  promptBarLeftInset: number;

  setPromptBarLeftInset: (px: number) => void;
  setPromptBarCollapsed: (v: boolean) => void;
  togglePromptBar: () => void;
  setFavoritesOpen: (v: boolean) => void;
  toggleFavorites: () => void;
  setPromptDraft: (v: string) => void;
  setAvailableActions: (actions: string[]) => void;
}

export const useUIStore = create<UIState>((set) => ({
  promptBarCollapsed: false,
  favoritesOpen: false,
  promptDraft: '',
  availableActions: [],
  promptBarLeftInset: 0,

  setPromptBarLeftInset: (px) => set({ promptBarLeftInset: px }),
  setPromptBarCollapsed: (v) => set(v ? { promptBarCollapsed: true, favoritesOpen: false } : { promptBarCollapsed: false }),
  togglePromptBar: () =>
    set((s) => ({ promptBarCollapsed: !s.promptBarCollapsed, favoritesOpen: false })),
  setFavoritesOpen: (v) => set({ favoritesOpen: v }),
  toggleFavorites: () => set((s) => ({ favoritesOpen: !s.favoritesOpen })),
  setPromptDraft: (v) => set({ promptDraft: v }),
  setAvailableActions: (actions) => set({ availableActions: actions }),
}));
