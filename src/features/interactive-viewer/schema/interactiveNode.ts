import { z } from 'zod';
import { AssetKind } from '@/shared/assetKind';

/* ════════════════════════════════════════════════════════════════════════
 * 킨더버스 · Interactive Viewer — InteractiveNode 스키마 (zod v4)
 *
 * 저작·저장 단위. 게임 뷰어의 InteractiveDoc과는 별개의 자체 완결형 스키마.
 * Behavior(트리거→액션)가 네이티브 모델이며, then/when/state/group으로
 * "낮은 바닥, 높은 천장"을 표현한다.
 *
 * ⚠ 사전검증 산출물 — 재정의/변경 금지(docs/interactive-node.schema.ts에서 이동).
 *   AssetKind만 공유 정의(@/shared/assetKind)로 연결(원본 값과 동일한 5값).
 * ════════════════════════════════════════════════════════════════════════ */

/* ─── 0. Primitives ─── */
export const Id = z.string().min(1);
export const Color = z.string(); // hex('#F2733E') 또는 디자인 토큰('pastel.coral')
export const Point = z.object({ x: z.number(), y: z.number() });

/** 아동안전 프라이버시 분류 — 공유 정의(@/shared/assetKind). */
export { AssetKind };

export const AssetRef = z.object({
  id: Id,
  src: z.string(), // url 또는 저장 키
  assetKind: AssetKind,
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
});

export const Transform = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number().positive(),
  h: z.number().positive(),
  rotation: z.number().default(0),
  z: z.number().int().default(0),
});

/* ─── 1. Elements ─── */
export const ElementKind = z.enum(['image', 'video', 'text', 'shape', 'sprite']);
export const ElementOrigin = z.enum(['upload', 'board-copy', 'board-move']); // 유입 출처

export const ElementNode = z.object({
  id: Id,
  kind: ElementKind,
  src: AssetRef.optional(), // image/video/sprite
  text: z.string().optional(), // kind === 'text'
  origin: ElementOrigin.default('board-copy'),
  assetKind: AssetKind, // 드롭/업로드 시 재평가·승계
  transform: Transform,
});

/* ─── 2. Connections (경로·링크·순서) ─── */
export const ConnectionKind = z.enum(['path', 'link', 'order']);

export const Connection = z.object({
  id: Id,
  kind: ConnectionKind,
  from: Id,
  to: Id,
  points: z.array(Point).optional(), // 다단 경로(잎1→잎2→…)
});

/* ─── 3. State (counter / flag) ─── */
export const Counter = z.object({
  id: Id,
  initial: z.number().int().default(0),
  label: z.string().optional(),
  display: Point.optional(), // 화면 표시 위치
});

export const Flag = z.object({
  id: Id,
  initial: z.boolean().default(false),
});

/* ─── 4. Condition (when) — 분기 ─── */
export const Condition = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('counter'),
    counterId: Id,
    op: z.enum(['>=', '==', '<']),
    value: z.number(),
  }),
  z.object({
    kind: z.literal('flag'),
    flagId: Id,
    is: z.boolean(),
  }),
  z.object({
    kind: z.literal('state'),
    target: Id,
    equals: z.string(),
  }),
]);

/* ─── 5. Behavior (트리거 → 액션) + then/when ─── */
export const Trigger = z.enum([
  'tap',
  'sequenceTap',
  'pathTraverse',
  'sceneEnter',
  'storyAdvance',
  'afterComplete',
]);

export const AnimatePreset = z.enum([
  'bounce', 'jump', 'wiggle', 'grow', 'spin', 'shake', 'float', 'fadeIn', 'fadeOut',
]);
export const SwapMode = z.enum(['image', 'video']);
export const SpeakMode = z.enum(['bubble', 'narration', 'situational']);

/** 모든 액션이 공유하는 제어 필드 */
const BehaviorBase = z.object({
  id: Id,
  target: Id, // 적용 요소 id
  trigger: Trigger,
  after: Id.optional(), // trigger === 'afterComplete' 일 때 선행 Behavior
  when: Condition.optional(), // 조건 충족 시에만 실행
  then: z.array(Id).optional(), // 잇기: 완료 후 이어 실행할 Behavior id(순차/병렬)
  delay: z.number().int().nonnegative().optional(), // ms
});

/** 액션별로 params 가 타입 분리됨 (discriminated on `action`) */
export const Behavior = z.discriminatedUnion('action', [
  BehaviorBase.extend({
    action: z.literal('animate'),
    params: z.object({ preset: AnimatePreset, repeat: z.number().int().optional() }),
  }),
  BehaviorBase.extend({
    action: z.literal('moveAlongPath'),
    params: z.object({
      connectionId: Id, // 사용할 연결(경로)
      speed: z.number().positive().default(1),
      repeat: z.number().int().optional(),
    }),
  }),
  BehaviorBase.extend({
    action: z.literal('swap'),
    params: z.object({ to: AssetRef, mode: SwapMode }),
  }),
  BehaviorBase.extend({
    action: z.literal('playVideo'),
    params: z.object({ src: AssetRef, autoplay: z.boolean().default(false) }),
  }),
  BehaviorBase.extend({
    action: z.literal('speak'),
    params: z.object({ text: z.string(), mode: SpeakMode, voice: z.string().optional() }),
  }),
  BehaviorBase.extend({
    action: z.literal('reveal'),
    params: z.object({ targets: z.array(Id) }),
  }),
  BehaviorBase.extend({
    action: z.literal('hide'),
    params: z.object({ targets: z.array(Id) }),
  }),
  BehaviorBase.extend({
    action: z.literal('count'),
    params: z.object({ counterId: Id, by: z.number().int().default(1) }),
  }),
  BehaviorBase.extend({
    action: z.literal('highlight'),
    params: z.object({ targets: z.array(Id), color: Color.optional() }),
  }),
  BehaviorBase.extend({
    action: z.literal('setFlag'),
    params: z.object({ flagId: Id, value: z.boolean() }),
  }),
  BehaviorBase.extend({
    action: z.literal('goToScene'),
    params: z.object({ sceneId: Id }), // 흐름 제어
  }),
]);

/* ─── 6. Story (말풍선·나레이션·분기 대사) ─── */
export const SpeakSpec = z.object({
  text: z.string(),
  mode: SpeakMode,
  voice: z.string().optional(),
});

export const StoryStep = z.object({
  id: Id,
  move: Id.optional(), // moveAlongPath Behavior id 참조
  speak: SpeakSpec.optional(),
});

export const Branch = z.object({
  id: Id,
  when: Condition,
  toStep: Id, // 조건 충족 시 이동할 step
});

export const StoryGraph = z.object({
  steps: z.array(StoryStep),
  branches: z.array(Branch).optional(),
});

/* ─── 7. Group (재사용 묶음 / 프리팹) ─── */
export const Group = z.object({
  id: Id,
  name: z.string(),
  members: z.array(Id), // 요소/행동 id
});

/* ─── 8. Root — InteractiveNode ─── */
export const Theme = z.literal('pastel-child');

export const SafetyMeta = z.object({
  containsChildAssets: z.boolean().default(false),
  reviewed: z.boolean().default(false),
});

export const Canvas = z.object({
  background: z.union([AssetRef, Color]),
  size: z.object({ w: z.number().positive(), h: z.number().positive() }), // 논리 단위(고정)
});

export const InteractiveNode = z
  .object({
    id: Id,
    title: z.string(),
    theme: Theme.default('pastel-child'),
    canvas: Canvas,
    elements: z.array(ElementNode),
    connections: z.array(Connection).default([]),
    behaviors: z.array(Behavior).default([]),
    story: StoryGraph.optional(),
    counters: z.array(Counter).optional(),
    flags: z.array(Flag).optional(),
    groups: z.array(Group).optional(),
    meta: z.object({
      createdBy: Id,
      safety: SafetyMeta,
      version: z.number().int().default(1),
    }),
  })
  /* ── 참조 무결성 검사: 모든 id 참조가 실제로 존재하는지 ── */
  .superRefine((node, ctx) => {
    const elementIds = new Set(node.elements.map((e) => e.id));
    const behaviorIds = new Set(node.behaviors.map((b) => b.id));
    const connectionIds = new Set(node.connections.map((c) => c.id));
    const counterIds = new Set((node.counters ?? []).map((c) => c.id));
    const flagIds = new Set((node.flags ?? []).map((f) => f.id));

    const bad = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: 'custom', path, message });

    node.connections.forEach((c, i) => {
      if (!elementIds.has(c.from)) bad(['connections', i, 'from'], `미존재 요소: ${c.from}`);
      if (!elementIds.has(c.to)) bad(['connections', i, 'to'], `미존재 요소: ${c.to}`);
    });

    node.behaviors.forEach((b, i) => {
      if (!elementIds.has(b.target)) bad(['behaviors', i, 'target'], `미존재 요소: ${b.target}`);
      if (b.after && !behaviorIds.has(b.after)) bad(['behaviors', i, 'after'], `미존재 동작: ${b.after}`);
      (b.then ?? []).forEach((t, j) => {
        if (!behaviorIds.has(t)) bad(['behaviors', i, 'then', j], `미존재 동작: ${t}`);
      });
      if (b.when) {
        if (b.when.kind === 'counter' && !counterIds.has(b.when.counterId))
          bad(['behaviors', i, 'when', 'counterId'], `미존재 카운터: ${b.when.counterId}`);
        if (b.when.kind === 'flag' && !flagIds.has(b.when.flagId))
          bad(['behaviors', i, 'when', 'flagId'], `미존재 플래그: ${b.when.flagId}`);
      }
      if (b.action === 'moveAlongPath' && !connectionIds.has(b.params.connectionId))
        bad(['behaviors', i, 'params', 'connectionId'], `미존재 연결: ${b.params.connectionId}`);
      if (b.action === 'count' && !counterIds.has(b.params.counterId))
        bad(['behaviors', i, 'params', 'counterId'], `미존재 카운터: ${b.params.counterId}`);
      if (b.action === 'setFlag' && !flagIds.has(b.params.flagId))
        bad(['behaviors', i, 'params', 'flagId'], `미존재 플래그: ${b.params.flagId}`);
    });
  });

/* ─── 9. Types ─── */
/* 값/구조 변경 없음 — 추론 타입 export만 보강(런타임 파일들이 사용). */
export type InteractiveNode = z.infer<typeof InteractiveNode>;
export type ElementNode = z.infer<typeof ElementNode>;
export type Behavior = z.infer<typeof Behavior>;
export type Connection = z.infer<typeof Connection>;
export type Condition = z.infer<typeof Condition>;
export type StoryGraph = z.infer<typeof StoryGraph>;
export type AssetRef = z.infer<typeof AssetRef>;
export type Transform = z.infer<typeof Transform>;
export type Canvas = z.infer<typeof Canvas>;
export type ElementKind = z.infer<typeof ElementKind>;
export type ElementOrigin = z.infer<typeof ElementOrigin>;
export type AnimatePreset = z.infer<typeof AnimatePreset>;
export type SwapMode = z.infer<typeof SwapMode>;
export type Trigger = z.infer<typeof Trigger>;
