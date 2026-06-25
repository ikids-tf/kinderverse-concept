import { create } from 'zustand';

/* 포맷 선택 오버레이 상태 — "○○ 아이디어/놀이계획 만들어줘"를 입력하면 바로 생성하지 않고
   화면 중앙에 '어떤 형식으로 만들까?' 썸네일 선택지를 띄운다(board/prompt 가 감지해 open).
   FormatChoiceOverlay 가 읽어 렌더하고, 선택 시 board/prompt.runFormatChoice 로 생성한다.
   세션 스코프(보드 콘텐츠와 동일 인메모리). */

export type FormatMode = 'idea' | 'plan';
export type FormatChoice = 'idea-list' | 'mindmap' | 'plan-doc' | 'package';

/** 모드별 노출 선택지 — 아이디어=리스트·마인드맵, 놀이계획=+계획문서·패키지. */
export const MODE_CHOICES: Record<FormatMode, FormatChoice[]> = {
  idea: ['idea-list', 'mindmap'],
  plan: ['idea-list', 'mindmap', 'plan-doc', 'package'],
};

interface FormatChoiceState {
  pending: { mode: FormatMode; topic: string; raw: string } | null;
  open: (mode: FormatMode, topic: string, raw: string) => void;
  close: () => void;
}

export const useFormatChoiceStore = create<FormatChoiceState>((set) => ({
  pending: null,
  open: (mode, topic, raw) => set({ pending: { mode, topic, raw } }),
  close: () => set({ pending: null }),
}));
