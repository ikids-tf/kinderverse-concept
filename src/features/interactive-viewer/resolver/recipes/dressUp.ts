/**
 * Resolver — dress-up(날씨 옷입히기). 인형 옷입히기 + 날씨 교육.
 *
 * 흐름: 실내(창밖에 날씨가 보임) + 어린이(실내복) + 옷 3개(정답 1·오답 2).
 *   정답 옷 클릭 → 어린이가 '그 옷 입은 모습'으로 통째 교체(swap) → '밖에 나가기' 가능.
 *   오답 → 흔들기 + 힌트. '밖에 나가기' → 배경만 실외(그 날씨)로 바뀌고 어린이는 그 옷 그대로 → 이야기.
 *
 * ★ '진짜 입은' 느낌의 핵심: 옷을 캐릭터 위에 얹지 않고, AI가 '그 옷 입은 어린이'를 통째로 그려
 *   바꿔치기(swap.to gen: → fillSwapImages 누끼). 그래야 빛·핏이 하나로 어우러진다.
 * ★ 배경 전환: 실내는 캔버스 배경(sceneDesc→generateSceneBackground), 실외는 비-누끼 전체 이미지
 *   요소(sceneImageEl 'bggen:'→fillSceneImages)를 reveal 로 덮는다.
 * ★ 완료 타이밍: sceneEnter 로 '실외 배경'만 숨겨 두고, '밖에 나가기'로 그게 reveal될 때 완료로 잡히게
 *   한다(옷 입는 순간엔 완료 안 됨 — 밖에 나가 이야기까지가 한 흐름).
 * ★ '밖에 나가기' 버튼은 처음부터 보이되 flag(dressed) 게이트 — 옷 입기 전엔 "먼저 입어요" 안내.
 *
 * manualLayout=true(배경·캐릭터·옷·버튼을 정확히 배치).
 */
import type { Behavior, ElementNode, InteractiveNode } from '../../schema/interactiveNode';
import type { Recipe, RecipeInput } from '../recipeTypes';
import type { Connection } from '../../schema/interactiveNode';
import {
  assembleNode,
  conn,
  flag,
  imageEl,
  onAnimate,
  onHide,
  onReveal,
  onSetFlag,
  onSpeak,
  onSwap,
  sceneImageEl,
  shapeEl,
  textEl,
  whenFlag,
} from '../assemble';

const TITLE = 'title';
const DRESSED = 'dressed';
const BG_OUT = 'bg_out';
const KID = 'kid';

function buildDressUp(input: RecipeInput): InteractiveNode {
  const items = input.items ?? [];
  if (items.length < 2) throw new Error('dress-up: 옷 선택지 2개 이상 필요(정답 1 + 오답 1+)');
  const correctIdx = Math.max(0, items.findIndex((it) => it.correct)); // 표시 없으면 첫 번째가 정답
  const actor = input.actorLabel || '어린이';
  const correctLabel = items[correctIdx].label;
  const dressedLabel = `${correctLabel} 착용한 ${actor}`; // 통째 착장 이미지(누끼)

  const itemId = (k: number) => `item_${k + 1}`;
  const allItemIds = items.map((_, i) => itemId(i));
  // 옷 3개 — 하단 좌·중앙 행(오른쪽은 '밖에 나가기' 버튼 자리).
  const itemX = (i: number) => 300 + i * 210;

  const elements: ElementNode[] = [
    sceneImageEl(BG_OUT, input.sceneOutDesc || '바깥 풍경', { z: 2 }), // 실외(숨김→밖에 나가기)
    textEl(TITLE, input.title, { x: 300, y: 22, w: 680, h: 54, z: 30 }),
    textEl('howto', '날씨에 맞는 옷을 골라 탭하거나 끌어다 입혀 주세요', { x: 300, y: 80, w: 680, h: 34, z: 30 }),
    imageEl(KID, actor, { x: 490, y: 190, w: 300, h: 390, z: 5 }),
    ...items.map((it, i) => imageEl(itemId(i), it.label, { x: itemX(i), y: 615, w: 150, h: 150, z: 8 })),
    shapeEl('gobtn_bg', { x: 1006, y: 624, w: 236, h: 84, z: 19 }),
    textEl('gobtn', '밖에 나가기 →', { x: 1006, y: 650, w: 236, h: 34, z: 20 }),
  ];

  const behaviors: Behavior[] = [onHide('hidestart', BG_OUT, 'sceneEnter', [BG_OUT])];
  items.forEach((it, i) => {
    const id = itemId(i);
    if (i === correctIdx) {
      // 정답 — 클릭(tap) 또는 드래그(pathTraverse)로 입힌다. 둘 다 같은 '착장' 체인(swap)으로.
      //   드래그: 옷을 캐릭터(연결된 KID) 위로 끌어다 놓으면 onPathUp이 아이템을 숨기고 이 동작을 발화.
      behaviors.push(onSetFlag(`pick_${i + 1}`, id, 'tap', DRESSED, true, { then: [`swap_${i + 1}`] }));
      behaviors.push(onSetFlag(`drag_${i + 1}`, id, 'pathTraverse', DRESSED, true, { then: [`swap_${i + 1}`] }));
      behaviors.push(
        onSwap(`swap_${i + 1}`, KID, 'afterComplete', { id: 'dressed_img', src: `gen:${dressedLabel}`, assetKind: 'generated' }, { then: [`clr_${i + 1}`] }),
      );
      behaviors.push(onHide(`clr_${i + 1}`, id, 'afterComplete', allItemIds, { then: [`praise_${i + 1}`] }));
      behaviors.push(onSpeak(`praise_${i + 1}`, KID, 'afterComplete', `잘했어요! 오늘 날씨엔 ${correctLabel}이(가) 딱이에요.`));
    } else {
      // 오답 → 흔들기 + 힌트(세지 않음, 게임 안 끝남).
      behaviors.push(onAnimate(`no_${i + 1}`, id, 'tap', 'shake', { then: [`say_${i + 1}`] }));
      behaviors.push(onSpeak(`say_${i + 1}`, id, 'afterComplete', `${it.label}은(는) 오늘 날씨엔 어울리지 않아요. 다른 옷을 골라볼까?`));
    }
  });

  // 밖에 나가기 — 입었으면(flag) 실외 배경 reveal + 이야기, 안 입었으면 안내.
  behaviors.push(onReveal('goout', 'gobtn', 'tap', [BG_OUT], { when: whenFlag(DRESSED, true), then: ['talk'] }));
  behaviors.push(onSpeak('talk', KID, 'afterComplete', '밖으로 나왔어요! 무엇이 보이나요? 오늘 날씨는 어떤가요? 함께 이야기해 봐요.'));
  behaviors.push(onSpeak('needdress', 'gobtn', 'tap', '먼저 날씨에 맞는 옷을 입어요!', { when: whenFlag(DRESSED, false) }));

  // 드래그용 연결(정답 옷 → 캐릭터). hitConnectedAt 가 이 연결로 '캐릭터 위 드롭'을 판정한다.
  const connections: Connection[] = [conn('c_dress', 'path', itemId(correctIdx), KID)];
  return assembleNode(input, { elements, connections, behaviors, flags: [flag(DRESSED)] });
}

export const dressUp: Recipe = { id: 'dress-up', build: buildDressUp, manualLayout: true };
