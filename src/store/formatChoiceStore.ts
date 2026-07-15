import { create } from 'zustand';

/* 포맷 선택 오버레이 상태 — "○○ 아이디어/놀이계획 만들어줘"를 입력하면 바로 생성하지 않고
   화면 중앙에 '어떤 형식으로 만들까?' 썸네일 선택지를 띄운다(board/prompt 가 감지해 open).
   FormatChoiceOverlay 가 읽어 렌더하고, 선택 시 board/prompt.runFormatChoice 로 생성한다.
   세션 스코프(보드 콘텐츠와 동일 인메모리). */

export type FormatMode = 'idea' | 'plan';
export type FormatChoice = 'idea-list' | 'mindmap' | 'topic-web' | 'plan-doc' | 'package';
/** 놀이계획 vs 프로젝트 수업 — 프로젝트는 하나의 주제를 1주~한 달 단계별로 깊이 탐구(다른 계획 문서). */
export type LessonKind = 'play' | 'project';

/** 모드별 노출 선택지 — 놀이계획='놀이계획 만들어줘' 팝업: 놀이아이디어·마인드맵·주안·패키지 4종. */
export const MODE_CHOICES: Record<FormatMode, FormatChoice[]> = {
  idea: ['idea-list', 'mindmap', 'topic-web'],
  plan: ['idea-list', 'mindmap', 'plan-doc', 'package'],
};

interface FormatChoiceState {
  pending: { mode: FormatMode; topic: string; raw: string; kind: LessonKind } | null;
  open: (mode: FormatMode, topic: string, raw: string, kind?: LessonKind) => void;
  close: () => void;
}

export const useFormatChoiceStore = create<FormatChoiceState>((set) => ({
  pending: null,
  open: (mode, topic, raw, kind = 'play') => set({ pending: { mode, topic, raw, kind } }),
  close: () => set({ pending: null }),
}));
