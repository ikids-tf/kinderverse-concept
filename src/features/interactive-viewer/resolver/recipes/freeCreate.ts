/**
 * Resolver — free-create + memory-flip (PROMPT 6 / open question A, swap.to 누끼 패스로 가능).
 *
 *  - free-create : 프리셋 슬롯 꾸미기. 슬롯 tap → swap 으로 옵션 A↔B 토글. 승리조건 없음(열린결말).
 *  - memory-flip : 카드 뒤집어 공개. 시작=뒷면(CARD_BACK), tap → swap 으로 앞면(gen) 공개 + 세기.
 *
 * ★ swap.to.src 의 'gen:라벨' 은 place.ts 의 fillSwapImages(별도 누끼 패스)가 채운다
 *   (fillTokenImages 는 elements 만 훑으므로). 두 레시피 다 이 패스에 의존.
 *
 * ⚠ memory-flip 한계: 엔진에 '두 장 뒤집어 짝 비교' 상태가 없어 '뒤집어 공개(다 뒤집으면 완료)'
 *   형태다. 턴제 짝맞추기는 B 엔진 확장이 필요(범위 밖) — 본 버전은 뒤집기·인지·세기 학습용.
 *   한 번 뒤집은 카드는 flag 가드로 다시 세지 않는다(중복 카운트 방지).
 */
import type { Behavior, ElementNode, InteractiveNode } from '../../schema/interactiveNode';
import type { Recipe, RecipeInput } from '../recipeTypes';
import {
  CARD_BACK_URI,
  assembleNode,
  counter,
  fixedImageEl,
  flag,
  imageEl,
  onCount,
  onHide,
  onReveal,
  onSetFlag,
  onSwap,
  rowTransforms,
  textEl,
  whenCounter,
  whenFlag,
} from '../assemble';

const CNT = 'cnt';
const WIN = 'win';
const TITLE = 'title';

/* ════════════════ free-create (프리셋 토글 꾸미기) ════════════════ */
function buildFreeCreate(input: RecipeInput): InteractiveNode {
  const pairs = input.pairs ?? [];
  if (pairs.length < 1) throw new Error('free-create: pairs(슬롯 옵션 A/B) 1개 이상 필요');
  const slotId = (k: number) => `slot_${k}`;
  const tfs = rowTransforms(pairs.length, { y: 300, size: 210 });

  const elements: ElementNode[] = [
    textEl(TITLE, input.title, { x: 280, y: 40, w: 720, h: 84, z: 20 }),
    // 안내 — 승리조건 없는 열린 놀이라 '무엇을 하는지'를 분명히 보여 준다.
    textEl('howto', '탭하면 모습이 바뀌어요 ✨ 마음대로 꾸며 보세요!', { x: 220, y: 130, w: 840, h: 46, z: 19 }),
    ...pairs.map((p, i) => imageEl(slotId(i + 1), p.left, tfs[i])),
  ];
  // 슬롯 tap → 옵션 A(메인 src)↔B(swap.to) 토글. fillSwapImages 가 to.src 'gen:' 를 채움.
  const behaviors: Behavior[] = pairs.map((p, i) =>
    onSwap(`toggle_${i + 1}`, slotId(i + 1), 'tap', { id: `opt_${i + 1}`, src: `gen:${p.right}`, assetKind: 'generated' }),
  );
  return assembleNode(input, { elements, behaviors }); // 승리조건 없음(열린결말)
}

/* ════════════════ memory-flip (뒤집어 공개) ════════════════ */
function buildMemoryFlip(input: RecipeInput): InteractiveNode {
  const items = input.items ?? [];
  if (items.length < 2) throw new Error('memory-flip: items(카드) 2개 이상 필요');
  const n = items.length;
  const cardId = (k: number) => `card_${k}`;
  const flagId = (k: number) => `flip_${k}`;
  const tfs = rowTransforms(n, { y: 270, size: 180 });

  const elements: ElementNode[] = [
    textEl(TITLE, input.title, { x: 280, y: 40, w: 720, h: 90, z: 20 }),
    ...items.map((_, i) => fixedImageEl(cardId(i + 1), CARD_BACK_URI, tfs[i])), // 시작=뒷면
    textEl(WIN, '다 뒤집었어요! 🎉', { x: 390, y: 250, w: 500, h: 110, z: 50 }),
  ];

  const behaviors: Behavior[] = [onHide('hidewin', WIN, 'sceneEnter', [WIN])];
  items.forEach((it, i) => {
    const k = i + 1;
    // 아직 안 뒤집은 카드만(when flag false) tap → 앞면 공개 → 가드 set → 세기.
    behaviors.push(
      onSwap(`flip_${k}`, cardId(k), 'tap', { id: `front_${k}`, src: `gen:${it.label}`, assetKind: 'generated' }, {
        when: whenFlag(flagId(k), false),
        then: [`mark_${k}`],
      }),
    );
    behaviors.push(onSetFlag(`mark_${k}`, cardId(k), 'afterComplete', flagId(k), true, { then: [`count_${k}`] }));
    behaviors.push(onCount(`count_${k}`, cardId(k), 'afterComplete', CNT, 1, { then: ['showwin'] }));
  });
  behaviors.push(onReveal('showwin', WIN, 'afterComplete', [WIN], { when: whenCounter(CNT, n) }));

  return assembleNode(input, {
    elements,
    behaviors,
    counters: [counter(CNT, '뒤집었어요', { x: 600, y: 36 })],
    flags: items.map((_, i) => flag(flagId(i + 1))),
  });
}

export const freeCreate: Recipe = { id: 'free-create', build: buildFreeCreate };
export const memoryFlip: Recipe = { id: 'memory-flip', build: buildMemoryFlip };
