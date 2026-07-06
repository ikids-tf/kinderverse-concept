/**
 * Resolver — 조립 빌더(요소·행동·노드 팩토리).
 *
 * 레시피가 공유하는 결정론 헬퍼. 스키마 출력 타입(z.infer)을 그대로 만들어 safeParse 를
 * 항상 통과시킨다(rotation/z/origin/assetKind/meta 등 필수값을 빠짐없이 채움).
 * 위치는 기본값만 주고, 정밀 배치는 autoLayout(layout.ts)에 위임한다.
 *
 * id 는 한 build 내에서만 유일하면 된다(레인 통합 시 offsetLane 이 전부 재매핑).
 * 안정적·가독 id(item_1, tap_1 …)로 결정론 출력 + 디버깅 용이.
 */
import type {
  Behavior,
  Connection,
  ElementNode,
  InteractiveNode,
  Transform,
} from '../schema/interactiveNode';
import type { MechanismId, RecipeInput } from './recipeTypes';

/**
 * 도입 안내 기본 문구(메커니즘별 결정론 테이블) — 대사 계약(introText)이 비어 오는
 * 룰 폴백 경로에서도 놀이가 '어떻게 하는지' 안내로 시작하도록 보장한다.
 * 레시피가 `input.introText ?? DEFAULT_INTRO[mech]` 로 소비(fillSlots 는 채우지 않음 — 여기가 바닥).
 */
export const DEFAULT_INTRO: Record<MechanismId, string> = {
  'sequence-order': '순서를 잘 보고 차례대로 눌러 볼까요?',
  'path-trace': '친구를 살살 끌어서 길을 따라 데려다 줄까요?',
  'pair-match': '서로 어울리는 짝을 찾아 끌어다 이어 볼까요?',
  'tap-select': '맞는 것을 모두 찾아서 눌러 볼까요?',
  'sort-to-bin': '어디에 들어갈지 생각해서 알맞은 곳에 담아 볼까요?',
  'slot-fill': '빈칸에 꼭 맞는 조각을 끌어다 채워 볼까요?',
  'branch-choose': '어떤 것이 맞을지 잘 생각해서 골라 볼까요?',
  combine: '두 가지를 합치면 무엇이 될까요? 끌어서 합쳐 봐요!',
  'memory-flip': '카드를 하나씩 뒤집어서 무엇이 숨어 있는지 볼까요?',
  'free-create': '마음에 드는 것을 골라서 예쁘게 꾸며 볼까요?',
  'dress-up': '오늘 날씨에 어울리는 옷을 골라 입혀 볼까요?',
  'shadow-quiz': '그림자만 보고 누구인지 알아맞혀 볼까요? 아래에서 골라 눌러요!',
};

/** Counter/Flag 는 스키마가 '값(zod)'으로만 export → 인덱스 접근으로 타입 파생. */
type Counter = NonNullable<InteractiveNode['counters']>[number];
type Flag = NonNullable<InteractiveNode['flags']>[number];

export const CANVAS = { w: 1280, h: 800 } as const;

/** 부분 transform → 완전 transform(필수값 보강). */
export function tf(t: Partial<Transform> = {}): Transform {
  return { x: 0, y: 0, w: 160, h: 160, rotation: 0, z: 1, ...t };
}

/** 텍스트 요소. */
export function textEl(id: string, text: string, t: Partial<Transform> = {}): ElementNode {
  return {
    id,
    kind: 'text',
    text,
    origin: 'upload',
    assetKind: 'teacher-upload',
    transform: tf({ w: 480, h: 84, ...t }),
  };
}

/** 이미지 요소 — `gen:label` 로 두면 fillTokenImages 가 실제 그림+누끼로 채운다. */
export function imageEl(id: string, label: string, t: Partial<Transform> = {}): ElementNode {
  return {
    id,
    kind: 'image',
    src: { id: `a_${id}`, src: `gen:${label}`, assetKind: 'generated' },
    origin: 'upload',
    assetKind: 'generated',
    transform: tf({ w: 180, h: 180, ...t }),
  };
}

/** 정면 캐릭터 이미지 요소 — `genf:라벨` 로 두면 fillTokenImages 가 CHARACTER_FRONT_STYLE
    (정면·얼굴 또렷·옷 착장)로 채운다. 옷입히기처럼 아이가 정면을 보고 얼굴이 보여야 하는 게임용. */
export function frontImageEl(id: string, label: string, t: Partial<Transform> = {}): ElementNode {
  return {
    id,
    kind: 'image',
    src: { id: `a_${id}`, src: `genf:${label}`, assetKind: 'generated' },
    origin: 'upload',
    assetKind: 'generated',
    transform: tf({ w: 300, h: 390, ...t }),
  };
}

/** 캐릭터 시트 요소 — `sheet:라벨` 로 두면 place.fillCharacterSheets 가 '같은 아이 한 장 시트'를
    한꺼번에 그려(같은 얼굴 보장) 컷별로 채운다. 옷입히기의 맨몸·각 착장(모두 같은 아이)용. */
export function sheetImageEl(id: string, label: string, t: Partial<Transform> = {}): ElementNode {
  return {
    id,
    kind: 'image',
    src: { id: `a_${id}`, src: `sheet:${label}`, assetKind: 'generated' },
    origin: 'upload',
    assetKind: 'generated',
    transform: tf({ w: 300, h: 390, ...t }),
  };
}

/** 그림자(실루엣) 이미지 요소 — `shadow:label` 로 두면 place.fillShadowImages 가 정답을 한 번 그려
    그 원본의 실루엣(그림자)을 만들어 채운다(같은 라벨의 `gen:` 정답 선택지와 원본을 공유 → 그림자와
    정답 그림이 정확히 일치). shadow-quiz(누구의 그림자일까?)의 질문용. */
export function shadowImageEl(id: string, label: string, t: Partial<Transform> = {}): ElementNode {
  return {
    id,
    kind: 'image',
    src: { id: `a_${id}`, src: `shadow:${label}`, assetKind: 'generated' },
    origin: 'upload',
    assetKind: 'generated',
    transform: tf({ w: 300, h: 300, ...t }),
  };
}

/** 단색 도형(분류 통·빈칸 판 등). src 없음. */
export function shapeEl(id: string, t: Partial<Transform> = {}): ElementNode {
  return {
    id,
    kind: 'shape',
    origin: 'upload',
    assetKind: 'teacher-upload',
    transform: tf({ w: 240, h: 180, ...t }),
  };
}

/** 카드 뒷면(균일 '?' 파스텔) — memory-flip 시작 상태. 앞면(gen)은 swap.to 로 둔다. */
export const CARD_BACK_URI =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="240" viewBox="0 0 200 240"><rect x="8" y="8" width="184" height="224" rx="26" fill="#F7D9C4" stroke="#E8A87C" stroke-width="5"/><text x="100" y="158" font-size="120" text-anchor="middle" fill="#D98B5F" font-family="sans-serif" font-weight="700">?</text></svg>`,
  );

/** 고정 이미지 요소 — 생성/누끼 아님(데이터 URI·URL 직접). 카드 뒷면 등. */
export function fixedImageEl(id: string, srcUri: string, t: Partial<Transform> = {}): ElementNode {
  return {
    id,
    kind: 'image',
    src: { id: `a_${id}`, src: srcUri, assetKind: 'generated' },
    origin: 'upload',
    assetKind: 'generated',
    transform: tf({ w: 180, h: 180, ...t }),
  };
}

/** 전체 화면 '배경' 이미지 요소 — `bggen:라벨` 로 두면 fillSceneImages(place.ts)가 누끼 없이
    풀블리드 장면 이미지로 채운다(토큰 누끼와 구분 — 배경은 잘라내면 안 됨). dress-up '밖에 나가기' 등. */
export function sceneImageEl(id: string, label: string, t: Partial<Transform> = {}): ElementNode {
  return {
    id,
    kind: 'image',
    src: { id: `a_${id}`, src: `bggen:${label}`, assetKind: 'generated' },
    origin: 'upload',
    assetKind: 'generated',
    transform: tf({ x: 0, y: 0, w: CANVAS.w, h: CANVAS.h, z: 1, ...t }),
  };
}

/* ─── 행동(트리거→액션) 생성자 — discriminated union 을 정확히 만든다 ─── */

interface Ctl {
  when?: Behavior['when'];
  then?: string[];
  after?: string;
  delay?: number;
}

export const onHide = (id: string, target: string, trigger: Behavior['trigger'], targets: string[], ctl: Ctl = {}): Behavior => ({
  id, target, trigger, action: 'hide', params: { targets }, ...ctl,
});

export const onReveal = (id: string, target: string, trigger: Behavior['trigger'], targets: string[], ctl: Ctl = {}): Behavior => ({
  id, target, trigger, action: 'reveal', params: { targets }, ...ctl,
});

export const onCount = (id: string, target: string, trigger: Behavior['trigger'], counterId: string, by = 1, ctl: Ctl = {}): Behavior => ({
  id, target, trigger, action: 'count', params: { counterId, by }, ...ctl,
});

export const onMove = (id: string, target: string, trigger: Behavior['trigger'], connectionId: string, speed = 1, ctl: Ctl = {}): Behavior => ({
  id, target, trigger, action: 'moveAlongPath', params: { connectionId, speed }, ...ctl,
});

export const onAnimate = (id: string, target: string, trigger: Behavior['trigger'], preset: NonNullable<Extract<Behavior, { action: 'animate' }>['params']['preset']>, ctl: Ctl = {}): Behavior => ({
  id, target, trigger, action: 'animate', params: { preset }, ...ctl,
});

export const onSpeak = (id: string, target: string, trigger: Behavior['trigger'], text: string, ctl: Ctl = {}): Behavior => ({
  id, target, trigger, action: 'speak', params: { text, mode: 'bubble' }, ...ctl,
});

export const onSetFlag = (id: string, target: string, trigger: Behavior['trigger'], flagId: string, value: boolean, ctl: Ctl = {}): Behavior => ({
  id, target, trigger, action: 'setFlag', params: { flagId, value }, ...ctl,
});

export const onSwap = (id: string, target: string, trigger: Behavior['trigger'], to: Extract<Behavior, { action: 'swap' }>['params']['to'], ctl: Ctl = {}): Behavior => ({
  id, target, trigger, action: 'swap', params: { to, mode: 'image' }, ...ctl,
});

/** counter 조건(완료 게이트). */
export const whenCounter = (counterId: string, value: number, op: '>=' | '==' | '<' = '>='): Behavior['when'] => ({
  kind: 'counter', counterId, op, value,
});

/** flag 조건. */
export const whenFlag = (flagId: string, is: boolean): Behavior['when'] => ({ kind: 'flag', flagId, is });

/* ─── 연결 ─── */

export const conn = (id: string, kind: Connection['kind'], from: string, to: string, points?: Connection['points']): Connection => ({
  id, kind, from, to, ...(points ? { points } : {}),
});

/* ─── 상태 ─── */

export const counter = (id: string, label?: string, display?: Counter['display']): Counter => ({
  id, initial: 0, ...(label ? { label } : {}), ...(display ? { display } : {}),
});

export const flag = (id: string, initial = false): Flag => ({ id, initial });

/* ─── 루트 노드 조립 ─── */

export interface NodeParts {
  elements: ElementNode[];
  connections?: Connection[];
  behaviors?: Behavior[];
  counters?: Counter[];
  flags?: Flag[];
}

/** 손제작 InteractiveNode(1280×800) — 모든 필수 필드 보강. */
export function assembleNode(input: RecipeInput, parts: NodeParts): InteractiveNode {
  const bg = input.background && /^(pastel\.|#)/.test(input.background) ? input.background : 'pastel.cream';
  return {
    id: input.docId,
    title: (input.title || '인터랙티브').slice(0, 40),
    theme: 'pastel-child',
    canvas: { background: bg, size: { w: CANVAS.w, h: CANVAS.h } },
    elements: parts.elements,
    connections: parts.connections ?? [],
    behaviors: parts.behaviors ?? [],
    ...(parts.counters && parts.counters.length ? { counters: parts.counters } : {}),
    ...(parts.flags && parts.flags.length ? { flags: parts.flags } : {}),
    meta: { createdBy: 'teacher', safety: { containsChildAssets: false, reviewed: false }, version: 1 },
  };
}

/** 항목들을 한 줄(가로 균등)로 깔기 — autoLayout 미적용 시의 기본 배치(겹침 방지). */
export function rowTransforms(n: number, opts: { y?: number; size?: number; z?: number } = {}): Transform[] {
  const size = opts.size ?? 160;
  const y = opts.y ?? 560;
  const z = opts.z ?? 2;
  const M = 48;
  const span = CANVAS.w - 2 * M;
  const gap = n > 1 ? Math.min(40, (span - n * size) / (n - 1)) : 0;
  const rowW = n * size + (n - 1) * Math.max(0, gap);
  const startX = Math.round((CANVAS.w - rowW) / 2);
  return Array.from({ length: n }, (_, i) => tf({ x: Math.round(startX + i * (size + Math.max(0, gap))), y, w: size, h: size, z }));
}
