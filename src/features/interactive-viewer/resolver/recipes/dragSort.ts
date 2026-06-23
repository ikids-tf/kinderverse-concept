/**
 * Resolver — 드래그 분류 메커니즘(PROMPT 4). 청사진 B: docs/resolver-handoff/SKILL.md.
 *
 *  - sort-to-bin : 아이템을 끌어 '정답 통'에 드롭(분류).
 *  - slot-fill   : 통 대신 '빈칸'에 조각을 드롭(구조 동일 — 시각 차이).
 *
 * ★ 드래그-분류 발동 조건(조사: dragSortBeh, InteractiveStage.tsx:468-476): 아이템이
 *   moveAlongPath + tap/sequenceTap 트리거를 갖고 **이동 타깃이 2종 이상**이어야 '탭 자동이동'
 *   대신 '드래그로 드롭'으로 해석된다. 아이템마다 자기 자신을 정답 통으로 옮기는 move 를 주면
 *   타깃이 N종(≥2) → 자동 활성. 판정(hitConnectedAt :890-906): 드롭 지점에 겹친 '연결된 통'만
 *   인정(count), 틀린 통/빈 곳은 제자리 복귀(onPathUp :960-1004).
 *
 * ★ 통(bin) shape 는 autoLayout 이 '무참조 대형 shape'면 삭제한다(layout.ts:65-68). 여기선
 *   manualLayout=true 로 autoLayout 자체를 건너뛰고 직접 배치한다(통/빈칸/라벨 흩어짐 방지).
 *   그리고 각 통은 아이템→통 연결을 가지므로 참조됨(삭제 대상 아님).
 */
import type { Behavior, Connection, ElementNode, InteractiveNode } from '../../schema/interactiveNode';
import type { Recipe, RecipeInput } from '../recipeTypes';
import { CANVAS, assembleNode, conn, counter, imageEl, onCount, onHide, onMove, onReveal, shapeEl, textEl, whenCounter } from '../assemble';

const CNT = 'cnt';
const WIN = 'win';
const TITLE = 'title';
const MARGIN = 48;

function buildDragSort(input: RecipeInput, mode: 'bin' | 'slot'): InteractiveNode {
  const items = input.items ?? [];
  const bins = input.bins ?? [];
  const what = mode === 'bin' ? 'sort-to-bin' : 'slot-fill';
  if (items.length < 2) throw new Error(`${what}: items 2개 이상 필요(드래그 분류 발동 조건)`);
  if (bins.length < 1) throw new Error(`${what}: bins(${mode === 'bin' ? '통' : '빈칸'}) 1개 이상 필요`);
  const binIndexOf = (key?: string) => {
    const i = bins.findIndex((b) => b.key === key);
    return i >= 0 ? i : 0; // binKey 미지정/오류 → 첫 통
  };

  // 통/빈칸 — 하단 행(가로 균등).
  const M = bins.length;
  const binGap = 32;
  const binW = Math.min(300, (CANVAS.w - 2 * MARGIN - (M - 1) * binGap) / M);
  const binH = 210;
  const binY = CANVAS.h - MARGIN - binH;
  const binsRowW = M * binW + (M - 1) * binGap;
  const binX = (i: number) => Math.round((CANVAS.w - binsRowW) / 2 + i * (binW + binGap));
  const binId = (i: number) => `bin_${i + 1}`;

  // 아이템 — 상단 행(끌어 내려 통에 드롭).
  const N = items.length;
  const itemSize = Math.max(96, Math.min(160, (CANVAS.w - 2 * MARGIN) / N - 16));
  const itemGap = N > 1 ? Math.max(8, Math.min(40, (CANVAS.w - 2 * MARGIN - N * itemSize) / (N - 1))) : 0;
  const itemsRowW = N * itemSize + (N - 1) * itemGap;
  const itemX = (k: number) => Math.round((CANVAS.w - itemsRowW) / 2 + k * (itemSize + itemGap));
  const itemY = 200;
  const itemId = (k: number) => `item_${k + 1}`;

  const elements: ElementNode[] = [textEl(TITLE, input.title, { x: 280, y: 36, w: 720, h: 84, z: 20 })];
  bins.forEach((b, i) => {
    elements.push(shapeEl(binId(i), { x: binX(i), y: binY, w: binW, h: binH, z: 2 }));
    elements.push(textEl(`binlabel_${i + 1}`, b.label, { x: binX(i), y: binY + binH - 48, w: binW, h: 40, z: 3 }));
  });
  items.forEach((it, k) => elements.push(imageEl(itemId(k), it.label, { x: itemX(k), y: itemY, w: itemSize, h: itemSize, z: 6 })));
  elements.push(textEl(WIN, '잘했어요! 🎉', { x: 390, y: 250, w: 500, h: 110, z: 50 }));

  // 각 아이템 → 자기 정답 통으로 path 연결.
  const connections: Connection[] = items.map((it, k) => conn(`c_${k + 1}`, 'path', itemId(k), binId(binIndexOf(it.binKey))));

  // 아이템: tap → moveAlongPath(자기 정답 통) → 세기 → 완료. (move 타깃이 N종 ≥2 → 드래그-분류 활성.)
  const behaviors: Behavior[] = [onHide('hidewin', WIN, 'sceneEnter', [WIN])];
  items.forEach((_, k) => {
    behaviors.push(onMove(`move_${k + 1}`, itemId(k), 'tap', `c_${k + 1}`, 1, { then: [`count_${k + 1}`] }));
    behaviors.push(onCount(`count_${k + 1}`, itemId(k), 'afterComplete', CNT, 1, { then: ['showwin'] }));
  });
  behaviors.push(onReveal('showwin', WIN, 'afterComplete', [WIN], { when: whenCounter(CNT, N) }));

  return assembleNode(input, { elements, connections, behaviors, counters: [counter(CNT, '담았어요', { x: 600, y: 36 })] });
}

export const sortToBin: Recipe = { id: 'sort-to-bin', build: (i) => buildDragSort(i, 'bin'), manualLayout: true };
export const slotFill: Recipe = { id: 'slot-fill', build: (i) => buildDragSort(i, 'slot'), manualLayout: true };
