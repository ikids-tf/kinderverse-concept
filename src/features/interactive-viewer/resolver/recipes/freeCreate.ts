/**
 * Resolver — free-create(꾸미기) + memory-flip.
 *
 *  - free-create : 캐릭터 꾸미기(승패 없는 열린 놀이). 두 형태 —
 *     ① 레이어드(기본): base 캐릭터 고정 + 우측 팔레트에서 부위별(모자·목도리…) 선택지를 탭하면
 *        그 그림이 캐릭터 위에 '입혀'진다(같은 부위는 하나만 — exclusive). 입력 actorLabel(주인공)
 *        + bins(부위 카테고리, 머리위→아래 순) + items(선택지, binKey=부위). 진짜 '꾸미기 활동'.
 *     ② 토글(레거시 폴백): bins/items 없이 pairs 만 오면 슬롯이 두 모습을 번갈아 보임(옛 동작).
 *  - memory-flip : 카드 뒤집어 공개. 시작=뒷면(CARD_BACK), tap → swap 으로 앞면(gen) 공개 + 세기.
 *
 * ★ 누끼: imageEl 의 'gen:라벨' 은 fillTokenImages 가 그림+누끼(투명)로 채운다 → 액세서리가
 *   base 위에 투명하게 얹힌다. swap.to 의 'gen:' 은 place.ts 의 fillSwapImages(별도 패스)가 채운다.
 * ★ 배치: 레이어드는 액세서리를 base 의 정확한 지점에 얹어야 해 manualLayout=true(autoLayout 생략).
 *
 * ⚠ memory-flip 한계: 엔진에 '두 장 뒤집어 짝 비교' 상태가 없어 '뒤집어 공개(다 뒤집으면 완료)' 형태.
 */
import type { Behavior, ElementNode, InteractiveNode } from '../../schema/interactiveNode';
import type { Recipe, RecipeInput } from '../recipeTypes';
import {
  CARD_BACK_URI,
  DEFAULT_INTRO,
  assembleNode,
  counter,
  fixedImageEl,
  flag,
  imageEl,
  onCount,
  onHide,
  onReveal,
  onSetFlag,
  onSpeak,
  onSwap,
  rowTransforms,
  textEl,
  whenCounter,
  whenFlag,
} from '../assemble';

const CNT = 'cnt';
const WIN = 'win';
const TITLE = 'title';

/* ════════════════ free-create ① 레이어드 꾸미기 ════════════════
   base 캐릭터 고정 + 부위별 팔레트. 팔레트 탭 → 같은 부위 오버레이 전부 숨김 → 내 것만 공개. */
function buildLayered(input: RecipeInput): InteractiveNode {
  const subject = input.actorLabel || '친구';
  const cats = (input.bins ?? []).slice(0, 3);
  const allItems = input.items ?? [];
  // 부위(카테고리)별로 선택지 묶기(부위당 최대 4) — 빈 부위는 제외.
  const groups = cats
    .map((c) => ({ cat: c, opts: allItems.filter((it) => (it.binKey ?? cats[0].key) === c.key).slice(0, 4) }))
    .filter((g) => g.opts.length);
  if (!groups.length) throw new Error('free-create(layered): 부위별 선택지가 필요해요');

  // base 캐릭터 — 좌측 큰 영역(세로형).
  const baseX = 140;
  const baseY = 200;
  const baseW = 380;
  const baseH = 470;
  const ovW = 300;
  const ovH = 165;
  const ovX = Math.round(baseX + baseW / 2 - ovW / 2);
  const ovStep = groups.length > 1 ? Math.min(200, Math.round((baseH - ovH - 16) / (groups.length - 1))) : 0;

  const elements: ElementNode[] = [
    textEl(TITLE, input.title, { x: 280, y: 26, w: 720, h: 64, z: 30 }),
    textEl('howto', '마음대로 꾸며 보세요! 오른쪽에서 골라 탭하면 입혀져요 ✨', { x: 280, y: 92, w: 720, h: 40, z: 30 }),
    imageEl('base', subject, { x: baseX, y: baseY, w: baseW, h: baseH, z: 5 }),
  ];
  const behaviors: Behavior[] = [];
  const allOverlayIds: string[] = [];

  groups.forEach((g, i) => {
    const ovY = baseY + 8 + i * ovStep;
    const blockY = 168 + i * 200;
    // 부위 이름(팔레트 헤더).
    elements.push(textEl(`lbl_${i}`, g.cat.label, { x: 580, y: blockY, w: 660, h: 34, z: 12 }));

    const catOvIds = g.opts.map((_, k) => `ov_${i}_${k}`);
    allOverlayIds.push(...catOvIds);

    g.opts.forEach((opt, k) => {
      const ovId = `ov_${i}_${k}`;
      const palId = `pal_${i}_${k}`;
      // base 위에 얹힐 오버레이(시작 숨김, 부위별로 살짝 아래로 스택).
      elements.push(imageEl(ovId, opt.label, { x: ovX, y: ovY, w: ovW, h: ovH, z: 20 + i }));
      // 우측 팔레트 썸네일(항상 보임).
      elements.push(imageEl(palId, opt.label, { x: 580 + k * 138, y: blockY + 44, w: 120, h: 120, z: 13 }));
      // 탭 → 같은 부위 오버레이 전부 숨김 → 내 것만 공개(부위당 하나만 입혀짐).
      behaviors.push(onHide(`hid_${i}_${k}`, palId, 'tap', catOvIds, { then: [`rev_${i}_${k}`] }));
      behaviors.push(onReveal(`rev_${i}_${k}`, palId, 'afterComplete', [ovId]));
    });
  });

  // 시작 — 모든 오버레이 숨김(맨몸에서 시작해 골라 입힌다) + 도입 안내(열린 놀이 초대).
  behaviors.unshift(
    onHide('hide_all', 'base', 'sceneEnter', allOverlayIds),
    onSpeak('intro', TITLE, 'sceneEnter', input.introText ?? DEFAULT_INTRO['free-create'], { delay: 600 }),
  );

  return assembleNode(input, { elements, behaviors }); // 승리조건 없음(열린결말)
}

/* ════════════════ free-create ② 토글(레거시 폴백) ════════════════
   pairs 만 올 때 — 각 슬롯이 두 모습(left↔right)을 탭으로 번갈아 보인다. */
function buildToggle(input: RecipeInput): InteractiveNode {
  const pairs = input.pairs ?? [];
  if (pairs.length < 1) throw new Error('free-create: 꾸밀 부위(bins+items) 또는 슬롯(pairs)이 필요해요');
  const slotId = (k: number) => `slot_${k}`;
  const tfs = rowTransforms(pairs.length, { y: 300, size: 210 });

  const elements: ElementNode[] = [
    textEl(TITLE, input.title, { x: 280, y: 40, w: 720, h: 84, z: 20 }),
    textEl('howto', '탭하면 모습이 바뀌어요 ✨ 마음대로 꾸며 보세요!', { x: 220, y: 130, w: 840, h: 46, z: 19 }),
    ...pairs.map((p, i) => imageEl(slotId(i + 1), p.left, tfs[i])),
  ];
  const behaviors: Behavior[] = [
    // 도입 안내 — 탭하면 바뀌는 열린 놀이임을 알려 준다.
    onSpeak('intro', TITLE, 'sceneEnter', input.introText ?? DEFAULT_INTRO['free-create'], { delay: 600 }),
    ...pairs.map((p, i) =>
      onSwap(`toggle_${i + 1}`, slotId(i + 1), 'tap', { id: `opt_${i + 1}`, src: `gen:${p.right}`, assetKind: 'generated' }),
    ),
  ];
  return assembleNode(input, { elements, behaviors });
}

function buildFreeCreate(input: RecipeInput): InteractiveNode {
  // 부위(bins)+선택지(items)가 있으면 레이어드 꾸미기, 아니면 레거시 토글.
  if ((input.bins?.length ?? 0) >= 1 && (input.items?.length ?? 0) >= 1) return buildLayered(input);
  return buildToggle(input);
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

  const behaviors: Behavior[] = [
    onHide('hidewin', WIN, 'sceneEnter', [WIN]),
    // 도입 안내 — 뒤집기 놀이의 규칙으로 시작.
    onSpeak('intro', TITLE, 'sceneEnter', input.introText ?? DEFAULT_INTRO['memory-flip'], { delay: 600 }),
  ];
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
  behaviors.push(onReveal('showwin', WIN, 'afterComplete', [WIN], { when: whenCounter(CNT, n), then: ['winsay'] }));
  behaviors.push(onSpeak('winsay', WIN, 'afterComplete', input.winText ?? `카드 ${n}장을 모두 뒤집었어요! 참 잘했어요!`));

  return assembleNode(input, {
    elements,
    behaviors,
    counters: [counter(CNT, `뒤집었어요 · 모두 ${n}장`, { x: 600, y: 36 })],
    flags: items.map((_, i) => flag(flagId(i + 1))),
  });
}

// 레이어드 꾸미기는 액세서리를 base 정확한 지점에 얹으므로 autoLayout 생략(manualLayout).
export const freeCreate: Recipe = { id: 'free-create', build: buildFreeCreate, manualLayout: true };
export const memoryFlip: Recipe = { id: 'memory-flip', build: buildMemoryFlip };
