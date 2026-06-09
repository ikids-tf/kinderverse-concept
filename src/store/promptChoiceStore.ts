import { create } from 'zustand';

/* 선택 유형과 프롬프트 요청이 '안 맞을 때' 띄우는 안내 팝업 상태(보드 한정).
   handleBoardPrompt가 불일치를 감지하면 open()으로 보류 상태를 채우고,
   PromptChoiceDialog가 이를 읽어 모달을 띄운다. 선택지 실행은 board/selectionApply.
   세션 스코프(보드 콘텐츠와 동일하게 인메모리). */

export type ReqIntent = 'image' | 'worksheet' | 'plan' | 'letter' | 'text';
export type SelKind = 'image' | 'text' | 'mixed';

export interface PromptChoice {
  /** 대상 카드 ids (현재 선택). */
  ids: string[];
  /** 원본 프롬프트 텍스트. */
  text: string;
  /** 프롬프트가 요청한 산출물 유형. */
  intent: ReqIntent;
  /** 선택의 성격(라벨/문구용). */
  selKind: SelKind;
}

interface PromptChoiceState {
  pending: PromptChoice | null;
  open: (c: PromptChoice) => void;
  close: () => void;
}

export const usePromptChoiceStore = create<PromptChoiceState>((set) => ({
  pending: null,
  open: (c) => set({ pending: c }),
  close: () => set({ pending: null }),
}));

export const INTENT_LABEL: Record<ReqIntent, string> = {
  image: '이미지',
  worksheet: '활동지',
  plan: '계획안',
  letter: '통신문',
  text: '메모',
};
