import type { InteractiveNode } from './interactiveNode';

/* ════════════════════════════════════════════════════════════════════════
 * 수업 모드 ↔ 인터렉티브 노드 런타임 통합 계약
 *
 * "한 런타임 / 두 경로": 노드 런타임이 단일 실행 엔진이고,
 *   - 직접 경로(풀스크린)와
 *   - 수업 모드 경로(살아있는 슬라이드)
 * 가 같은 진입점 `play(node)`를 호출한다.
 *
 * ⚠ 런타임 측(1·2)은 P0에서 구현한다. 수업 모드 측(3)은 조사로 확정만 했고
 *    이번 핸드오프에서 구현하지 않는다(P1). 조사 결과(3-B 보고):
 *      · StaticSlide 실제 타입 = features/slides 의 Slide(schema/deckspec.ts)
 *      · 렌더 주입 지점 = engine/SlideRenderer.tsx (LAYOUT_COMPONENTS 레지스트리 곁)
 *      · resolveNode = loadInteractiveNode(id) (localStorage 'kv:inodes:v1')
 *      · advance(teacher) = SlidesViewerApp setCurrent / onComplete = 런타임 advanceRequest
 * ════════════════════════════════════════════════════════════════════════ */

/* ─── 1. 노드 런타임 — 단일 실행 엔진 ─── */

export type RuntimeMode = 'standalone' | 'slide';

export interface PlayOptions {
  mount: HTMLElement;
  mode: RuntimeMode;
  autoStart?: boolean; // standalone 기본 true / slide 는 수업 모드 토글을 따름
}

export type NodeRuntimeEvent =
  | 'ready' // 렌더 완료, 조작 가능
  | 'started'
  | 'completed' // 활동 완료조건 충족(있을 때)
  | 'advanceRequest' // "다음 슬라이드로" 요청
  | 'error';

export interface NodePlaybackController {
  start(): void;
  pause(): void;
  reset(): void;
  destroy(): void; // 슬라이드 이탈 시 호출(상태/리소스 해제)
  readonly state: 'idle' | 'playing' | 'completed';
  on(event: NodeRuntimeEvent, handler: (payload?: unknown) => void): () => void; // unsubscribe 반환
}

/** 단일 진입점 — 직접 경로와 수업 모드 경로가 공유 */
export type PlayNode = (node: InteractiveNode, opts: PlayOptions) => NodePlaybackController;

/* ─── 2. 저작(편집) 진입점 — 수업 모드 '편집 상태'에서 사용 ─── */

export interface AuthoringHandle {
  mount(target: HTMLElement, node: InteractiveNode): void;
  getNode(): InteractiveNode; // 현재 편집 결과(수업 중 수정 반영)
  destroy(): void;
}
export type OpenAuthoring = (node: InteractiveNode) => AuthoringHandle;

/* ─── 3. 수업 모드 시퀀스 통합 (P1 — 조사로 확정, 미구현) ─── */

/** 기존 정적 슬라이드 — 실제 타입은 features/slides 의 Slide. */
export interface StaticSlide {
  kind: 'static';
  id: string;
  // ...features/slides Slide 필드(layout·blocks·…)...
}

/** 추가되는 슬라이드 종류: 인터렉티브 노드 참조 */
export interface InteractiveSlide {
  kind: 'interactive';
  id: string;
  nodeId: string; // InteractiveNode 참조 (localStorage 'kv:inodes:v1')
  advance: AdvancePolicy; // 다음 슬라이드로 넘어가는 정책
}

export type LessonSlide = StaticSlide | InteractiveSlide;

/** "이 슬라이드는 언제 끝나는가" (스펙 Q2) */
export type AdvancePolicy =
  | { mode: 'teacher' } // 교사가 수동으로 넘김 (기본 — 기존 next 컨트롤 재사용)
  | { mode: 'onComplete' }; // 활동 완료조건 충족 시 advanceRequest 발생

/**
 * 수업 모드가 슬라이드를 띄울 때 노드 런타임을 꽂는 어댑터 (P1).
 * 수업 모드의 기존 edit↔play 토글이 아래 둘 중 하나를 선택한다.
 */
export interface InteractiveSlideAdapter {
  resolveNode(nodeId: string): Promise<InteractiveNode>; // nodeId → 노드 로드
  play: PlayNode; // play 상태 → 노드 실행
  openAuthoring: OpenAuthoring; // edit 상태 → 노드 편집(수업 중 수정)
}
