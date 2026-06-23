/**
 * Resolver — 메커니즘 레시피 타입 (게임 생성 엔진 v0.2 · PROMPT 1).
 *
 * 레시피 = 결정론 ASSEMBLER. 교사 의도의 '구조'(behavior 배선·연결·상태)를 코드로 조립해
 * 손제작 InteractiveNode를 반환한다. LLM은 '내용'(라벨·정답집합·gen: 프롬프트)만 채우며
 * 구조는 절대 LLM에 맡기지 않는다(불안정 제거 — docs/resolver-handoff/CLAUDE.md §확정 결정).
 *
 * ⚠ B 스키마/Behavior 엔진/꼬리 함수 무변경. 레시피는 기존 프리미티브로만 조립한다.
 *   타깃은 Interactive Viewer(B) 단일 — Game Viewer v2(A)는 폐기, 참조 금지.
 */
import type { InteractiveNode } from '../schema/interactiveNode';

/** v0.2 §4 메커니즘 식별자(동사 매핑 키). rhythm-tap은 realtime-arcade 제외로 보류. */
export type MechanismId =
  | 'sequence-order'
  | 'path-trace'
  | 'pair-match'
  | 'tap-select'
  | 'sort-to-bin'
  | 'slot-fill'
  | 'branch-choose'
  | 'combine'
  | 'memory-flip'
  | 'free-create';

/** 한 항목(내용 슬롯). label 이 곧 'gen:label' 이미지 또는 텍스트가 된다. */
export interface RecipeItem {
  /** 표시/생성 라벨(예: '사과'). 이미지 항목은 `gen:<label>` 로 들어간다. */
  label: string;
  /** tap-select 정답 여부(정답만 count 대상). */
  correct?: boolean;
  /** sort-to-bin/slot-fill — 이 항목이 들어갈 정답 통/빈칸 key. */
  binKey?: string;
  /** 선택 — 도달/정답 시 말풍선 텍스트. */
  speak?: string;
}

/** 분류 통/빈칸(sort-to-bin · slot-fill). */
export interface RecipeBin {
  key: string;
  label: string;
}

/** 짝(pair-match) — left↔right 정답 연결. */
export interface RecipePair {
  left: string;
  right: string;
}

/**
 * 레시피 입력 — '내용'만 가변. 구조는 레시피가 결정론으로 만든다.
 * 위치는 보통 주지 않는다(autoLayout 이 역할대로 배치).
 */
export interface RecipeInput {
  /** 결과 노드 id(= 스토어 docId). */
  docId: string;
  title: string;
  /** 일반 항목(순서·고르기·분류·경로 스톤 등). */
  items?: RecipeItem[];
  /** 분류 통/빈칸(sort-to-bin · slot-fill). */
  bins?: RecipeBin[];
  /** 짝(pair-match). */
  pairs?: RecipePair[];
  /** 액터(이동 캐릭터) 라벨 — sequence-order · path-trace. */
  actorLabel?: string;
  /** 목표 지점 라벨 — path-trace. */
  goalLabel?: string;
  /** 캔버스 배경 토큰('pastel.cream'|'pastel.peach'|'pastel.mint'|'pastel.sky' 또는 '#rrggbb'). */
  background?: string;
  /** 장면 배경(이미지) 설명 — 있으면 꼬리에서 generateSceneBackground 로 그려 캔버스에 깐다.
      없으면 노드 title 로 폴백(compose 와 동일). 색 토큰 배경일 때만 적용. */
  sceneDesc?: string;
}

/** 메커니즘 한 종 — 결정론 build. */
export interface Recipe {
  id: MechanismId;
  /** 손제작 InteractiveNode(1280×800, 위치 생략 가능)를 결정론 조립한다. */
  build(input: RecipeInput): InteractiveNode;
  /** true 면 꼬리에서 autoLayout 을 건너뛴다(레시피가 정밀 수동 배치 — 예: 통/빈칸이 있는 드래그 분류).
      autoLayout 의 역할 분류가 통(bin)·빈칸·라벨을 흩뜨리는 경우에만 켠다. */
  manualLayout?: boolean;
}

/** 레시피 조립 결과 — 참조무결성 검증(safeParse) 포함. */
export interface BuildResult {
  ok: boolean;
  node?: InteractiveNode;
  /** 실패 시 zod 이슈 요약(레시피 버그 진단용). */
  errors?: string;
}
