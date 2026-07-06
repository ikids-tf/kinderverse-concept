/**
 * Resolver — 네이티브 메커니즘 3종(거의 무작업, B에 이미 다 있는 프리미티브).
 * 청사진: docs/resolver-handoff/SKILL.md (실동작 게임 덤프에서 추출한 검증된 정답 배선).
 *
 *  - sequence-order : Connection(order) + sequenceTap + count + moveAlongPath + when counter>=N
 *  - path-trace     : Connection(path)  + pathTraverse + moveAlongPath (액터를 경로 따라 목표로)
 *  - pair-match     : Connection(link)  + pathTraverse + moveAlongPath + count (left↔right 짝)
 *
 * 모든 레시피는 항목 수 파라미터로 '동일 배선'을 반복 생성하고, 참조무결성을 코드로 보장한다.
 * ★ count 액션 + when counter>=N 완료 경로는 항상 첨부(LLM 단독이 빠뜨려 완료 불능이던 버그 차단).
 */
import type { Behavior, Connection, ElementNode, InteractiveNode } from '../../schema/interactiveNode';
import type { Recipe, RecipeInput } from '../recipeTypes';
import {
  DEFAULT_INTRO,
  assembleNode,
  conn,
  counter,
  imageEl,
  onCount,
  onHide,
  onMove,
  onReveal,
  onSpeak,
  rowTransforms,
  shapeEl,
  textEl,
  whenCounter,
} from '../assemble';

const CNT = 'cnt';
const WIN = 'win';
const TITLE = 'title';
const ACTOR = 'actor';

const winText = (): ElementNode => textEl(WIN, '잘했어요! 🎉', { x: 390, y: 250, w: 500, h: 110, z: 50 });

/* ════════════════ 청사진 A — sequence-order ════════════════
   순서 강제(sequenceTap) + 세기(count) + 액터 이동(moveAlongPath) + 완료(when counter>=N). */
function buildSequenceOrder(input: RecipeInput): InteractiveNode {
  const items = input.items ?? [];
  if (items.length < 2) throw new Error('sequence-order: items 2개 이상 필요');
  const n = items.length;
  const itemId = (k: number) => `item_${k}`;

  const itemTfs = rowTransforms(n);
  const elements: ElementNode[] = [
    textEl(TITLE, input.title, { x: 360, y: 40, w: 560, h: 90, z: 20 }),
    imageEl(ACTOR, input.actorLabel ?? '캐릭터', { x: 110, y: 300, w: 200, h: 200, z: 5 }),
    ...items.map((it, i) => imageEl(itemId(i + 1), it.label, itemTfs[i])),
    winText(),
  ];

  const connections: Connection[] = items.map((_, i) => conn(`c_${i + 1}`, 'order', ACTOR, itemId(i + 1)));

  const behaviors: Behavior[] = [
    onHide('hidewin', WIN, 'sceneEnter', [WIN]),
    // 도입 안내 — 순서 놀이의 규칙으로 시작(introText 계약, 없으면 결정론 기본).
    onSpeak('intro', TITLE, 'sceneEnter', input.introText ?? DEFAULT_INTRO['sequence-order'], { delay: 600 }),
  ];
  items.forEach((it, i) => {
    const k = i + 1;
    // 순서대로 탭 → 세기 → 그 항목으로 액터 이동 → 구호.
    behaviors.push(onCount(`tap_${k}`, itemId(k), 'sequenceTap', CNT, 1, { then: [`move_${k}`] }));
    behaviors.push(onMove(`move_${k}`, ACTOR, 'afterComplete', `c_${k}`, 1, { then: [`speak_${k}`] }));
    // 숫자 구호 — 항목 speak 이 없으면 'k!'를 외쳐 순서 세기의 리듬을 만든다(수 세기 경험).
    behaviors.push(onSpeak(`speak_${k}`, itemId(k), 'afterComplete', it.speak ?? `${k}!`, { then: ['showwin'] }));
  });
  // 완료 — 모든 이동이 showwin 으로 수렴, when counter>=N 일 때만 승리 노출.
  behaviors.push(onReveal('showwin', WIN, 'afterComplete', [WIN], { when: whenCounter(CNT, n), then: ['winsay'] }));
  behaviors.push(onSpeak('winsay', WIN, 'afterComplete', input.winText ?? `와, ${n}개를 순서대로 다 해냈어요! 참 잘했어요!`));
  // 오답 훅 — 엔진(sequenceTap 오답)이 id 'wrongsay' 행동을 찾으면 그 연출을 쓴다(없으면 엔진 기본 안내).
  if (input.wrongText) behaviors.push(onSpeak('wrongsay', TITLE, 'afterComplete', input.wrongText));

  return assembleNode(input, {
    elements,
    connections,
    behaviors,
    counters: [counter(CNT, `세었어요 · 모두 ${n}개`, { x: 600, y: 36 })],
  });
}

/* ════════════════ path-trace ════════════════
   액터를 경로(Connection path)를 따라 목표 지점으로 끌어다(pathTraverse) 이동시킨다.
   items(있으면)는 길 위의 디딤돌(장식)이 되어 연결 points 를 형성한다. */
function buildPathTrace(input: RecipeInput): InteractiveNode {
  const stones = input.items ?? [];
  const goalId = 'goal';
  const hasGoalImg = !!input.goalLabel;

  const stoneTfs = rowTransforms(Math.max(stones.length, 1), { y: 420, size: 110, z: 3 });
  const points: Array<{ x: number; y: number }> = stones.map((_, i) => ({
    x: stoneTfs[i].x + stoneTfs[i].w / 2,
    y: stoneTfs[i].y + stoneTfs[i].h / 2,
  }));

  const elements: ElementNode[] = [
    textEl(TITLE, input.title, { x: 360, y: 40, w: 560, h: 90, z: 20 }),
    imageEl(ACTOR, input.actorLabel ?? '캐릭터', { x: 110, y: 560, w: 200, h: 200, z: 5 }),
    hasGoalImg
      ? imageEl(goalId, input.goalLabel as string, { x: 980, y: 300, w: 200, h: 200, z: 4 })
      : shapeEl(goalId, { x: 980, y: 320, w: 220, h: 180, z: 4 }),
    ...stones.map((s, i) => imageEl(`stone_${i + 1}`, s.label, stoneTfs[i])),
    winText(),
  ];

  // 액터→목표 경로(디딤돌 points 경유). pathTraverse 트리거가 이 연결에 걸린다.
  const connections: Connection[] = [conn('c_path', 'path', ACTOR, goalId, points.length ? points : undefined)];

  const behaviors: Behavior[] = [
    onHide('hidewin', WIN, 'sceneEnter', [WIN]),
    // 도입 안내 — 끌어서 데려다 주는 놀이임을 알려 준다.
    onSpeak('intro', TITLE, 'sceneEnter', input.introText ?? DEFAULT_INTRO['path-trace'], { delay: 600 }),
    // 액터를 끌어(pathTraverse) 목표 위에 놓으면 → 경로 따라 이동 → 세기 → 완료.
    onMove('trace', ACTOR, 'pathTraverse', 'c_path', 1, { then: ['arrive'] }),
    onCount('arrive', ACTOR, 'afterComplete', CNT, 1, { then: ['showwin'] }),
    onReveal('showwin', WIN, 'afterComplete', [WIN], { when: whenCounter(CNT, 1), then: ['winsay'] }),
    // 완료 축하 — 도착의 기쁨을 함께.
    onSpeak('winsay', WIN, 'afterComplete', input.winText ?? '와, 끝까지 잘 데려다 주었어요! 참 잘했어요!'),
  ];

  return assembleNode(input, {
    elements,
    connections,
    behaviors,
    counters: [counter(CNT)],
  });
}

/* ════════════════ pair-match ════════════════
   left 를 끌어(pathTraverse) 연결된 right 위에 놓으면 짝 성립(이동+세기). 완료 when counter>=쌍수. */
function buildPairMatch(input: RecipeInput): InteractiveNode {
  const pairs = input.pairs ?? [];
  if (pairs.length < 1) throw new Error('pair-match: pairs 1쌍 이상 필요');
  const n = pairs.length;
  const leftId = (k: number) => `left_${k}`;
  const rightId = (k: number) => `right_${k}`;

  // right = 상단 행(고정), left = 하단 행(autoLayout 이 moveAlongPath 대상 = actor 로 재배치).
  const rightTfs = rowTransforms(n, { y: 170, size: 170, z: 4 });
  const leftTfs = rowTransforms(n, { y: 560, size: 170, z: 5 });

  const elements: ElementNode[] = [
    textEl(TITLE, input.title, { x: 360, y: 40, w: 560, h: 90, z: 20 }),
    ...pairs.map((p, i) => imageEl(rightId(i + 1), p.right, rightTfs[i])),
    ...pairs.map((p, i) => imageEl(leftId(i + 1), p.left, leftTfs[i])),
    winText(),
  ];

  const connections: Connection[] = pairs.map((_, i) => conn(`c_${i + 1}`, 'link', leftId(i + 1), rightId(i + 1)));

  const behaviors: Behavior[] = [
    onHide('hidewin', WIN, 'sceneEnter', [WIN]),
    // 도입 안내 — 짝을 찾아 끌어다 잇는 놀이임을 알려 준다.
    onSpeak('intro', TITLE, 'sceneEnter', input.introText ?? DEFAULT_INTRO['pair-match'], { delay: 600 }),
  ];
  pairs.forEach((_, i) => {
    const k = i + 1;
    behaviors.push(onMove(`match_${k}`, leftId(k), 'pathTraverse', `c_${k}`, 1, { then: [`count_${k}`] }));
    behaviors.push(onCount(`count_${k}`, leftId(k), 'afterComplete', CNT, 1, { then: ['showwin'] }));
  });
  behaviors.push(onReveal('showwin', WIN, 'afterComplete', [WIN], { when: whenCounter(CNT, n), then: ['winsay'] }));
  behaviors.push(onSpeak('winsay', WIN, 'afterComplete', input.winText ?? `${n}쌍 짝을 모두 찾았어요! 참 잘했어요!`));

  return assembleNode(input, {
    elements,
    connections,
    behaviors,
    counters: [counter(CNT, `짝 · 모두 ${n}쌍`, { x: 600, y: 36 })],
  });
}

export const sequenceOrder: Recipe = { id: 'sequence-order', build: buildSequenceOrder };
export const pathTrace: Recipe = { id: 'path-trace', build: buildPathTrace };
export const pairMatch: Recipe = { id: 'pair-match', build: buildPairMatch };
