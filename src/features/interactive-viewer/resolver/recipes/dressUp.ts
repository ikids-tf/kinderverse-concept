/**
 * Resolver — dress-up(날씨 옷입히기). 인형 옷입히기 + 날씨 교육.
 *
 * 흐름: 실내(창밖에 날씨) + 어린이(정면·실내복) + 옷 여러 벌.
 *   어떤 옷이든 클릭/드래그 → 어린이가 '그 옷 입은 정면 모습'으로 바뀜(자유 전환) → '밖에 나가기'.
 *   '밖에 나가기' → 제목·설명 숨기고 배경만 실외로, 버튼은 '돌아가기' → 옷차림이 날씨에 맞는지 이야기.
 *   (정답만 입는 게 아니라 무엇이든 입고 나가 본다 — "눈 오는 날 반팔을 입으면 어떨까?" 토론.)
 *
 * ★ 착장 = swap 이 아니라 '착장별 별도 캐릭터 요소를 reveal/hide'.
 *   (엔진의 swapped 는 요소당 boolean 이고 displaySrc 가 '첫 swap'만 보여줘서, 한 요소에 swap 여러 개를
 *   걸면 어떤 옷을 눌러도 첫 옷만 나온다 — InteractiveStage:1219. 그래서 옷마다 'dressed_k' 캐릭터를
 *   따로 두고, 클릭 시 맨몸·다른 착장은 hide, 그 옷 착장만 reveal 한다. 옷별로 정확히 매칭된다.)
 * ★ 정면·얼굴: 캐릭터는 모두 genf:(CHARACTER_FRONT_STYLE — 정면·얼굴 또렷·옷 착장).
 * ★ 배경: 실내=캔버스 배경(sceneDesc), 실외=비-누끼 전체 이미지(sceneImageEl 'bggen:')를 reveal.
 * ★ 입력(클릭+드래그): 각 옷에 tap + pathTraverse + 옷→어린이 연결(끌어다 놓기 판정).
 *
 * manualLayout=true.
 */
import type { Behavior, Connection, ElementNode, InteractiveNode } from '../../schema/interactiveNode';
import type { Recipe, RecipeInput } from '../recipeTypes';
import {
  CANVAS,
  assembleNode,
  conn,
  flag,
  imageEl,
  onHide,
  onReveal,
  onSetFlag,
  onSpeak,
  sceneImageEl,
  shapeEl,
  sheetImageEl,
  textEl,
  whenFlag,
} from '../assemble';

const TITLE = 'title';
const HOWTO = 'howto';
const DRESSED = 'dressed';
const BG_OUT = 'bg_out';
const KID = 'kid';
const GO = 'gobtn';
const GO_BG = 'gobtn_bg';
const BACK = 'backbtn';
const BACK_BG = 'backbtn_bg';
const INDOOR_UI = [TITLE, HOWTO, GO_BG, GO]; // 밖에 나가며 숨길 UI

function buildDressUp(input: RecipeInput): InteractiveNode {
  const items = input.items ?? [];
  if (items.length < 2) throw new Error('dress-up: 옷 선택지 2개 이상 필요');
  const actor = input.actorLabel || '어린이';

  const itemId = (k: number) => `item_${k + 1}`;
  const dressedId = (k: number) => `dressed_${k + 1}`;
  const allDressedIds = items.map((_, i) => dressedId(i));
  const itemX = (i: number) => 300 + i * 210;
  const KIDBOX = { x: 490, y: 185, w: 300, h: 400 }; // 맨몸·모든 착장 같은 자리

  const elements: ElementNode[] = [
    sceneImageEl(BG_OUT, input.sceneOutDesc || '바깥 풍경', { z: 2 }),
    textEl(TITLE, input.title, { x: 300, y: 22, w: 680, h: 54, z: 30 }),
    textEl(HOWTO, '날씨에 맞는 옷을 골라 탭하거나 끌어다 입혀 주세요', { x: 300, y: 80, w: 680, h: 34, z: 30 }),
    // 맨몸 + 착장들 = '모두 같은 아이' 한 장 시트로 생성(sheet:) → 얼굴 일관. 착장들은 숨김.
    sheetImageEl(KID, `실내복 입은 ${actor}`, { ...KIDBOX, z: 5 }),
    ...items.map((it, i) => sheetImageEl(dressedId(i), `${it.label} 입은 ${actor}`, { ...KIDBOX, z: 6 })),
    ...items.map((it, i) => imageEl(itemId(i), it.label, { x: itemX(i), y: 615, w: 150, h: 150, z: 8 })),
    shapeEl(GO_BG, { x: 1006, y: 624, w: 236, h: 84, z: 19 }),
    textEl(GO, '밖에 나가기 →', { x: 1006, y: 650, w: 236, h: 34, z: 20 }),
    shapeEl(BACK_BG, { x: 1006, y: 624, w: 236, h: 84, z: 19 }),
    textEl(BACK, '← 돌아가기', { x: 1006, y: 650, w: 236, h: 34, z: 20 }),
  ];

  // 시작 — 실외 배경·돌아가기 버튼·모든 착장 모습 숨김(맨몸·옷만 보임).
  const behaviors: Behavior[] = [onHide('hidestart', KID, 'sceneEnter', [BG_OUT, BACK_BG, BACK, ...allDressedIds])];

  const connections: Connection[] = [];
  items.forEach((it, i) => {
    const id = itemId(i);
    const k = i + 1;
    const did = dressedId(i);
    const others = [KID, ...allDressedIds.filter((x) => x !== did)]; // 맨몸 + 다른 착장
    // 클릭(tap) 또는 드래그(pathTraverse) → flag set → 맨몸·다른 착장 숨김 → 이 옷 착장 공개 → 한마디.
    behaviors.push(onSetFlag(`pick_${k}`, id, 'tap', DRESSED, true, { then: [`dress_${k}`] }));
    behaviors.push(onSetFlag(`drag_${k}`, id, 'pathTraverse', DRESSED, true, { then: [`dress_${k}`] }));
    behaviors.push(onHide(`dress_${k}`, id, 'afterComplete', others, { then: [`rev_${k}`] }));
    behaviors.push(onReveal(`rev_${k}`, id, 'afterComplete', [did], { then: [`say_${k}`] }));
    behaviors.push(onSpeak(`say_${k}`, did, 'afterComplete', `${it.label}을(를) 입었어요! '밖에 나가기'를 눌러 볼까요?`));
    connections.push(conn(`c_${k}`, 'path', id, KID)); // 끌어다 놓기 판정용
  });

  // 밖에 나가기 — 입었으면 실외 reveal + 돌아가기 표시 + 제목/설명/나가기 숨김 + 이야기.
  behaviors.push(onReveal('goout', GO, 'tap', [BG_OUT, BACK_BG, BACK], { when: whenFlag(DRESSED, true), then: ['hideui'] }));
  behaviors.push(onHide('hideui', GO, 'afterComplete', INDOOR_UI, { then: ['talk'] }));
  behaviors.push(onSpeak('talk', BG_OUT, 'afterComplete', '밖으로 나왔어요! 지금 옷차림이 오늘 날씨에 어울리나요? 춥거나 덥진 않을까요? 함께 이야기해 봐요.'));
  behaviors.push(onSpeak('needdress', GO, 'tap', '먼저 옷을 골라 입어요!', { when: whenFlag(DRESSED, false) }));

  // 돌아가기 — 실외·돌아가기 숨김 + 제목/설명/나가기 되살림(착장은 그대로).
  behaviors.push(onHide('goback', BACK, 'tap', [BG_OUT, BACK_BG, BACK], { then: ['showui'] }));
  behaviors.push(onReveal('showui', BACK, 'afterComplete', INDOOR_UI));

  return assembleNode(input, { elements, connections, behaviors, flags: [flag(DRESSED)] });
}

/* ════════════════ 통합 날씨 전환 옷입히기 ════════════════
   한 게임에 '같은 아이 + 공용 옷 + 날씨별 실내 배경'을 두고, 하단 날씨 썸네일로 창밖 날씨를 바꾼다.
   (멀티레인 없이 reveal/hide — 날씨 전환 = 실내·제목 교체 + 옷 벗기기. 옷은 모든 날씨에서 공용.)
   ★ 같은 아이: 맨몸+착장 모두 sheet:(fillCharacterSheets)로 한 장에 그려 일관. */
function buildWeatherRounds(input: RecipeInput): InteractiveNode {
  const weathers = input.weathers ?? [];
  const clothes = input.items ?? [];
  const actor = input.actorLabel || '어린이';
  if (weathers.length < 2) throw new Error('weather-rounds: 날씨 2개 이상 필요');
  if (clothes.length < 2) throw new Error('weather-rounds: 옷 2개 이상 필요');

  const KIDBOX = { x: 490, y: 168, w: 300, h: 388 };
  const dId = (i: number) => `dressed_${i + 1}`;
  const cId = (i: number) => `item_${i + 1}`;
  const itemX = (i: number) => 250 + i * 180;
  const thumbX = (i: number) => Math.round((CANVAS.w - weathers.length * 178) / 2) + i * 178;

  const allBgin = weathers.map((w) => `bgin_${w.key}`);
  const allTitle = weathers.map((w) => `title_${w.key}`);
  const allDressed = clothes.map((_, i) => dId(i));

  const elements: ElementNode[] = [
    ...weathers.map((w) => sceneImageEl(`bgin_${w.key}`, w.indoor, { z: 1 })), // 날씨별 실내(창밖 날씨)
    ...weathers.map((w) => textEl(`title_${w.key}`, w.title, { x: 280, y: 22, w: 720, h: 54, z: 30 })),
    textEl(HOWTO, '날씨에 맞는 옷을 골라 입혀 주세요', { x: 280, y: 80, w: 720, h: 34, z: 30 }),
    sheetImageEl(KID, `실내복 입은 ${actor}`, { ...KIDBOX, z: 5 }), // 맨몸
    ...clothes.map((c, i) => sheetImageEl(dId(i), `${c.label} 입은 ${actor}`, { ...KIDBOX, z: 6 })), // 착장(숨김)
    ...clothes.map((c, i) => imageEl(cId(i), c.label, { x: itemX(i), y: 562, w: 130, h: 130, z: 8 })), // 공용 옷
    ...weathers.flatMap((w, i) => [
      shapeEl(`tbg_${w.key}`, { x: thumbX(i), y: 706, w: 162, h: 66, z: 28 }),
      textEl(`thumb_${w.key}`, `${w.emoji} ${w.name}`, { x: thumbX(i), y: 728, w: 162, h: 30, z: 29 }),
    ]),
  ];

  // 시작 — 첫 날씨만 보이고 나머지 실내·제목 + 모든 착장 숨김.
  const first = weathers[0];
  const hideStart = [
    ...allBgin.filter((x) => x !== `bgin_${first.key}`),
    ...allTitle.filter((x) => x !== `title_${first.key}`),
    ...allDressed,
  ];
  const behaviors: Behavior[] = [onHide('hidestart', KID, 'sceneEnter', hideStart)];

  // 날씨 썸네일 — 모든 실내·제목·착장 숨김 → 그 날씨 실내·제목 + 맨몸 공개(옷 다시 고르게).
  weathers.forEach((w) => {
    const tid = `thumb_${w.key}`;
    behaviors.push(onHide(`sw_${w.key}`, tid, 'tap', [...allBgin, ...allTitle, ...allDressed], { then: [`swr_${w.key}`] }));
    behaviors.push(onReveal(`swr_${w.key}`, tid, 'afterComplete', [`bgin_${w.key}`, `title_${w.key}`, KID]));
  });

  // 옷 — 클릭하면 맨몸·다른 착장 숨김 → 그 착장 공개 + 한마디(이 날씨에 어울릴지 이야기).
  clothes.forEach((c, i) => {
    const id = cId(i);
    const k = i + 1;
    const did = dId(i);
    const others = [KID, ...allDressed.filter((x) => x !== did)];
    behaviors.push(onHide(`dress_${k}`, id, 'tap', others, { then: [`rev_${k}`] }));
    behaviors.push(onReveal(`rev_${k}`, id, 'afterComplete', [did], { then: [`say_${k}`] }));
    behaviors.push(onSpeak(`say_${k}`, did, 'afterComplete', `${c.label}을(를) 입었어요! 이 날씨에 어울릴까요?`));
  });

  return assembleNode(input, { elements, behaviors });
}

export const dressUp: Recipe = {
  id: 'dress-up',
  build: (i) => (i.weathers?.length ? buildWeatherRounds(i) : buildDressUp(i)),
  manualLayout: true,
};
