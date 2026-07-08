// verse 편집 캔버스(PlayRecordEditor)를 전역 모달로 여닫는 store.
// 어느 화면의 "편집디자인" 버튼이든 openEditor(variant, payload) 로 편집기를 띄운다.
import { create } from 'zustand';

interface PlayEditorState {
  open: boolean;
  variant: string;
  payload: unknown;
  openEditor: (variant: string, payload: unknown) => void;
  close: () => void;
}

export const usePlayEditorStore = create<PlayEditorState>((set) => ({
  open: false,
  variant: '',
  payload: null,
  openEditor: (variant, payload) => set({ open: true, variant, payload }),
  close: () => set({ open: false }),
}));
