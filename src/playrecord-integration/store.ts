// verse 편집 캔버스(PlayRecordEditor)를 전역 모달로 여닫는 store.
// 어느 화면의 "편집디자인" 버튼이든 openEditor(variant, payload) 로 편집기를 띄운다.
// 여러 문서를 한 번에 편집할 때는 openDeck([...]) 로 덱(deck)을 열어 한 편집기에서
// ◀ n/N ▶ 로 문서를 넘기며 꾸민다. 단일 openEditor 는 문서 1개짜리 덱으로 위임한다.
import { create } from 'zustand';

export interface EditorDoc {
  variant: string;
  payload: unknown;
  title?: string;
}

interface PlayEditorState {
  open: boolean;
  queue: EditorDoc[];
  index: number;
  openEditor: (variant: string, payload: unknown, title?: string) => void;
  openDeck: (items: EditorDoc[]) => void;
  next: () => void;
  prev: () => void;
  close: () => void;
}

export const usePlayEditorStore = create<PlayEditorState>((set) => ({
  open: false,
  queue: [],
  index: 0,
  openEditor: (variant, payload, title) => set({ open: true, queue: [{ variant, payload, title }], index: 0 }),
  openDeck: (items) => {
    if (!items.length) return;
    set({ open: true, queue: items, index: 0 });
  },
  next: () => set((s) => ({ index: Math.min(s.index + 1, s.queue.length - 1) })),
  prev: () => set((s) => ({ index: Math.max(s.index - 1, 0) })),
  close: () => set({ open: false, queue: [], index: 0 }),
}));
