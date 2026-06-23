/**
 * Resolver — 조합 메커니즘(기존 프리미티브 배선, PROMPT 3).
 * 청사진: docs/resolver-handoff/SKILL.md (청사진 C + 유추표).
 *
 *  - tap-select   : 연결 없음. 정답 item tap → count + animate(grow), 오답 shake. 완료 when counter>=K.
 *  - branch-choose: tap → setFlag + (정답)reveal 결과 + animate, (오답)speak. 분기 = flag 조건. goToScene 아님.
 *  - combine      : A pathTraverse→B → hide(B) + reveal(C) + count. (A+B→C)
 *
 * ★ swap 제약(조사): displaySrc(InteractiveStage.tsx:1222)는 swap.to.src 를 '그대로' 렌더하고
 *   fillTokenImages 는 behavior params 를 안 채운다 → swap.to 에 'gen:' 불가. 그래서 결과 비주얼은
 *   swap 대신 '미리 생성한 숨김 요소를 reveal' 로 만든다(같은 프리미티브, 누끼 이미지 사용 가능).
 *   memory-flip(짝 맞추기)은 페어링 상태가 엔진에 없어 보류(open question A).
 */
import type { Behavior, Connection, ElementNode, InteractiveNode } from '../../schema/interactiveNode';
import type { Recipe, RecipeInput, RecipeItem } from '../recipeTypes';
import {
  assembleNode,
  conn,
  counter,
  flag,
  imageEl,
  onAnimate,
  onCount,
  onHide,
  onMove,
  onReveal,
  onSetFlag,
  onSpeak,
  rowTransforms,
  textEl,
  whenCounter,
  whenFlag,
} from '../assemble';

const CNT = 'cnt';
const WIN = 'win';
const TITLE = 'title';

const winText = (): ElementNode => textEl(WIN, '잘했어요! 🎉', { x: 390, y: 250, w: 500, h: 110, z: 50 });

/** 정답 인덱스 집합 — correct 플래그가 하나라도 있으면 그것만, 없으면 전체(모두 찾기). */
function correctSet(items: RecipeItem[]): Set<number> {
  const flagged = items.map((it, i) => (it.correct ? i : -1)).filter((i) => i >= 0);
  return new Set(flagged.length ? flagged : items.map((_, i) => i));
}

/* ════════════════ 청사진 C — tap-select (정답 고르기 / 찾기) ════════════════ */
function buildTapSelect(input: RecipeInput): InteractiveNode {
  const items = input.items ?? [];
  if (items.length < 2) throw new Error('tap-select: items 2개 이상 필요');
  const correct = correctSet(items);
  const K = correct.size;
  const itemId = (k: number) => `item_${k}`;
  const itemTfs = rowTransforms(items.length);

  const elements: ElementNode[] = [
    textEl(TITLE, input.title, { x: 360, y: 40, w: 560, h: 90, z: 20 }),
    ...items.map((it, i) => imageEl(itemId(i + 1), it.label, itemTfs[i])),
    winText(),
  ];

  const behaviors: Behavior[] = [onHide('hidewin', WIN, 'sceneEnter', [WIN])];
  items.forEach((_, i) => {
    const k = i + 1;
    if (correct.has(i)) {
      // 정답 — 세기 → 키우기(피드백) → 완료 체크.
      behaviors.push(onCount(`tap_${k}`, itemId(k), 'tap', CNT, 1, { then: [`grow_${k}`] }));
      behaviors.push(onAnimate(`grow_${k}`, itemId(k), 'afterComplete', 'grow', { then: ['showwin'] }));
    } else {
      // 오답 — 흔들기(세지 않음).
      behaviors.push(onAnimate(`no_${k}`, itemId(k), 'tap', 'shake'));
    }
  });
  behaviors.push(onReveal('showwin', WIN, 'afterComplete', [WIN], { when: whenCounter(CNT, K) }));

  return assembleNode(input, { elements, behaviors, counters: [counter(CNT, '찾았어요', { x: 600, y: 36 })] });
}

/* ════════════════ branch-choose (상황·표현 선택, 분기=flag) ════════════════
   정답 선택 → flag set → (결과 이미지 reveal) + animate + 승리. 오답 → speak(다시). swap/goToScene 미사용. */
function buildBranchChoose(input: RecipeInput): InteractiveNode {
  const items = input.items ?? [];
  if (items.length < 2) throw new Error('branch-choose: items(선택지) 2개 이상 필요');
  const correct = items.some((it) => it.correct) ? new Set(items.map((it, i) => (it.correct ? i : -1)).filter((i) => i >= 0)) : new Set([0]);
  const choiceId = (k: number) => `choice_${k}`;
  const hasResult = !!input.goalLabel;
  const FLAG = 'chosen';
  const RESULT = 'result';
  const choiceTfs = rowTransforms(items.length, { y: 520, size: 180 });

  const elements: ElementNode[] = [
    textEl(TITLE, input.title, { x: 280, y: 40, w: 720, h: 100, z: 20 }),
    ...items.map((it, i) => imageEl(choiceId(i + 1), it.label, choiceTfs[i])),
    ...(hasResult ? [imageEl(RESULT, input.goalLabel as string, { x: 520, y: 250, w: 240, h: 240, z: 40 })] : []),
    winText(),
  ];

  // 시작 시 숨김 — 승리(+ 결과 이미지).
  const hideTargets = hasResult ? [WIN, RESULT] : [WIN];
  const behaviors: Behavior[] = [onHide('hidestart', WIN, 'sceneEnter', hideTargets)];

  items.forEach((it, i) => {
    const k = i + 1;
    if (correct.has(i)) {
      behaviors.push(onSetFlag(`pick_${k}`, choiceId(k), 'tap', FLAG, true, { then: [`react_${k}`] }));
      behaviors.push(onAnimate(`react_${k}`, choiceId(k), 'afterComplete', 'bounce', { then: [hasResult ? 'showres' : 'winb'] }));
    } else {
      behaviors.push(onAnimate(`no_${k}`, choiceId(k), 'tap', 'shake', { then: [`say_${k}`] }));
      behaviors.push(onSpeak(`say_${k}`, choiceId(k), 'afterComplete', it.speak ?? '다시 골라볼까?'));
    }
  });
  if (hasResult) {
    behaviors.push(onReveal('showres', RESULT, 'afterComplete', [RESULT], { when: whenFlag(FLAG, true), then: ['winb'] }));
  }
  behaviors.push(onReveal('winb', WIN, 'afterComplete', [WIN], { when: whenFlag(FLAG, true) }));

  return assembleNode(input, { elements, behaviors, flags: [flag(FLAG)] });
}

/* ════════════════ combine (A + B → C) ════════════════
   A를 끌어(pathTraverse) B에 놓으면 → B 숨김 + C(결과) 노출 + 세기. swap 대신 숨김요소 reveal. */
function buildCombine(input: RecipeInput): InteractiveNode {
  const items = input.items ?? [];
  if (items.length < 2 || !input.goalLabel) throw new Error('combine: items 2개(A·B) + goalLabel(C) 필요');
  const A = 'a';
  const B = 'b';
  const C = 'c';

  const elements: ElementNode[] = [
    textEl(TITLE, input.title, { x: 360, y: 40, w: 560, h: 90, z: 20 }),
    imageEl(A, items[0].label, { x: 200, y: 540, w: 200, h: 200, z: 6 }),
    imageEl(B, items[1].label, { x: 820, y: 320, w: 200, h: 200, z: 4 }),
    imageEl(C, input.goalLabel, { x: 820, y: 320, w: 220, h: 220, z: 7 }), // 결과(숨김→노출)
    winText(),
  ];

  const connections: Connection[] = [conn('c_ab', 'path', A, B)];

  const behaviors: Behavior[] = [
    onHide('hidestart', WIN, 'sceneEnter', [WIN, C]),
    // A를 B로 끌어다 놓으면 → 합쳐진다.
    onMove('moveA', A, 'pathTraverse', 'c_ab', 1, { then: ['merge'] }),
    onHide('merge', B, 'afterComplete', [A, B], { then: ['revealC'] }), // A·B 사라짐
    onReveal('revealC', C, 'afterComplete', [C], { then: ['countb'] }),
    onCount('countb', C, 'afterComplete', CNT, 1, { then: ['showwin'] }),
    onReveal('showwin', WIN, 'afterComplete', [WIN], { when: whenCounter(CNT, 1) }),
  ];

  return assembleNode(input, { elements, connections, behaviors, counters: [counter(CNT)] });
}

export const tapSelect: Recipe = { id: 'tap-select', build: buildTapSelect };
export const branchChoose: Recipe = { id: 'branch-choose', build: buildBranchChoose };
export const combine: Recipe = { id: 'combine', build: buildCombine };
