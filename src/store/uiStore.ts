import { create } from 'zustand';

/* Global UI slice — prompt bar shell state + per-page action context.
   The prompt bar is a persistent shell across all pages (CLAUDE.md §2, SKILL §7). */

/** 동영상 '프롬프트 추가' 작성 모드 — 카드의 "프롬프트 추가하기"를 누르면 프롬프트 바가
    이 컨텍스트로 들어간다: 입력창엔 추천 프롬프트가 placeholder로, 연결한 이미지 썸네일이
    바 바로 위에 뜨고, 입력한 프롬프트 + 이미지로 영상을 생성한다(없으면 텍스트→비디오). */
export interface VideoComposeCtx {
  /** 이미지→비디오의 첫 프레임(있으면 바 위에 썸네일 표시). 없으면 텍스트→비디오. */
  imageSrc?: string;
  /** 결과를 로드할 대상 동영상 뷰어 id. */
  viewerId: string;
  /** 입력창 placeholder로 보여줄 추천 프롬프트(비워서 보내면 이 값을 사용). */
  placeholder: string;
  /** 표시용 주제 라벨. */
  label: string;
}

interface UIState {
  /** Prompt bar collapsed = only the message icon shows (right round toggle / §7). */
  promptBarCollapsed: boolean;
  /** Favorite card rail risen above the bar (star click on empty input, §7). */
  favoritesOpen: boolean;
  /** Current prompt input draft (lifted so favorites/star↔send can read emptiness). */
  promptDraft: string;

  /** 동영상 프롬프트 작성 모드(설정되면 프롬프트 바가 영상 생성 컨텍스트로 전환). */
  videoCompose: VideoComposeCtx | null;

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
  setVideoCompose: (v: VideoComposeCtx | null) => void;

  /** 게임 뷰어가 풀스크린(보드 포털)으로 떠 있을 때 그 카드 id. 설정되면 프롬프트바 입력은
      보드로 새지 않고 무조건 이 게임 뷰어로 라우팅된다(풀스크린 = 그 게임 전용 컨텍스트). */
  gameViewerFsNodeId: string | null;
  setGameViewerFs: (id: string | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  promptBarCollapsed: false,
  favoritesOpen: false,
  promptDraft: '',
  videoCompose: null,
  availableActions: [],
  promptBarLeftInset: 0,
  gameViewerFsNodeId: null,

  setGameViewerFs: (id) => set({ gameViewerFsNodeId: id }),
  setPromptBarLeftInset: (px) => set({ promptBarLeftInset: px }),
  setPromptBarCollapsed: (v) => set(v ? { promptBarCollapsed: true, favoritesOpen: false } : { promptBarCollapsed: false }),
  togglePromptBar: () =>
    set((s) => ({ promptBarCollapsed: !s.promptBarCollapsed, favoritesOpen: false })),
  setFavoritesOpen: (v) => set({ favoritesOpen: v }),
  toggleFavorites: () => set((s) => ({ favoritesOpen: !s.favoritesOpen })),
  setPromptDraft: (v) => set({ promptDraft: v }),
  setAvailableActions: (actions) => set({ availableActions: actions }),
  // 작성 모드 진입 시 입력 초안을 비워 placeholder(추천 프롬프트)가 보이게 한다.
  setVideoCompose: (v) => set(v ? { videoCompose: v, promptDraft: '', promptBarCollapsed: false, favoritesOpen: false } : { videoCompose: null }),
}));
