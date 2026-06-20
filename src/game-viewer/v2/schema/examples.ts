/**
 * 픽스처 — 스키마가 실제로 작동함을 증명하고, 조립기/런타임의 참조 예시.
 * 입력 타입(InteractiveDocInput)으로 작성 → 기본값 필드는 생략 가능.
 */
import type { InteractiveDocInput } from "./interactiveDoc";

/* 1) 누구일까 동물 맞추기 (M0 핵심 부품 · 코드에 박힌 기본 게임)
   각 페이지(라운드)의 단서 = 동물 라벨 asset. assetId가 contentSets의 라벨이라
   loadDoc→primeImages가 생성을 요청 → assetStore가 실제 이미지(기본 3D 픽사풍)를
   그려 스왑한다(이모지 SVG는 생성 전 잠깐의 시드일 뿐, 곧 그림으로 대체. 배경 제거 미적용).
   🔴 기본 4마리: 코끼리·토끼·펭귄·원숭이 — 보기 텍스트도 이 넷 안에서만 고른다.
      이 정의는 '로컬 저장본'이 아니라 코드(이 fixture)가 출처다(loadExample이 그대로 로드). */
export const tapTheRightOneExample: InteractiveDocInput = {
  meta: {
    id: "ex_animal_guess",
    title: "누굴까? 동물 친구 맞추기",
    archetype: "tap-the-right-one",
    createdFrom: "drop",
  },
  settings: { difficulty: "toddler", length: 4, mood: "lively", optionCount: 3 },
  stage: {
    background: { colorRole: "pastel.cream" },
    nodes: [
      { id: "cue", type: "image", role: "cue", transform: { x: 0.5, y: 0.28, w: 0.5, h: 0.4 }, animation: { entrance: "pop", idle: "breathe" } },
      { id: "opt0", type: "slot", role: "option", transform: { x: 0.2, y: 0.78, w: 0.22, h: 0.16 } },
      { id: "opt1", type: "slot", role: "option", transform: { x: 0.5, y: 0.78, w: 0.22, h: 0.16 } },
      { id: "opt2", type: "slot", role: "option", transform: { x: 0.8, y: 0.78, w: 0.22, h: 0.16 } },
    ],
  },
  interaction: {
    kind: "tap-the-right-one",
    cueSlotId: "cue",
    optionSlotIds: ["opt0", "opt1", "opt2"],
    rounds: [
      {
        cue: { type: "asset", asset: { assetId: "코끼리" } },
        options: [
          { content: { type: "text", text: "코끼리" }, correct: true },
          { content: { type: "text", text: "토끼" } },
          { content: { type: "text", text: "펭귄" } },
        ],
      },
      {
        cue: { type: "asset", asset: { assetId: "토끼" } },
        options: [
          { content: { type: "text", text: "원숭이" } },
          { content: { type: "text", text: "토끼" }, correct: true },
          { content: { type: "text", text: "코끼리" } },
        ],
      },
      {
        cue: { type: "asset", asset: { assetId: "펭귄" } },
        options: [
          { content: { type: "text", text: "펭귄" }, correct: true },
          { content: { type: "text", text: "원숭이" } },
          { content: { type: "text", text: "토끼" } },
        ],
      },
      {
        cue: { type: "asset", asset: { assetId: "원숭이" } },
        options: [
          { content: { type: "text", text: "코끼리" } },
          { content: { type: "text", text: "원숭이" }, correct: true },
          { content: { type: "text", text: "펭귄" } },
        ],
      },
    ],
  },
  extend: [
    { type: "discuss", prompts: ["이 동물은 어디에 살까요?", "무엇을 먹을까요?", "어떤 소리를 낼까요?"], nuri: ["nature-inquiry", "communication"], laneX: 1.1 },
    // 동물 영상 — 게임에 나온 네 동물을 각각 짧은 영상으로(교사가 카드에서 만들기 → 그 동물 이미지가 움직임).
    { type: "watch-video", prompts: ["동물들이 어떻게 움직이는지 영상으로 함께 봐요"], subjects: ["코끼리", "토끼", "펭귄", "원숭이"], nuri: ["nature-inquiry"], laneX: 2.2 },
  ],
  rewards: { confetti: "full" },
};

/* 2) 그림자 ↔ 실물 짝 맞추기 — match-pair (왼쪽=실루엣 그림자, 오른쪽=진짜 모습) */
export const matchPairExample: InteractiveDocInput = {
  meta: { id: "ex_shadow_match", title: "그림자와 친구 짝 맞추기", archetype: "match-pair", createdFrom: "prompt" },
  settings: { length: 1, optionCount: 3 },
  stage: {
    background: { colorRole: "pastel.sky" },
    nodes: [
      { id: "L0", type: "slot", role: "slot", transform: { x: 0.25, y: 0.26, w: 0.28, h: 0.18 } },
      { id: "L1", type: "slot", role: "slot", transform: { x: 0.25, y: 0.52, w: 0.28, h: 0.18 } },
      { id: "L2", type: "slot", role: "slot", transform: { x: 0.25, y: 0.78, w: 0.28, h: 0.18 } },
      { id: "R0", type: "slot", role: "slot", transform: { x: 0.75, y: 0.26, w: 0.28, h: 0.18 } },
      { id: "R1", type: "slot", role: "slot", transform: { x: 0.75, y: 0.52, w: 0.28, h: 0.18 } },
      { id: "R2", type: "slot", role: "slot", transform: { x: 0.75, y: 0.78, w: 0.28, h: 0.18 } },
    ],
  },
  interaction: {
    kind: "match-pair",
    leftSlotIds: ["L0", "L1", "L2"],
    rightSlotIds: ["R0", "R1", "R2"],
    rounds: [
      {
        // 왼쪽 = 검은 그림자(asset variant="silhouette"), 오른쪽 = 진짜 모습(emoji)
        pairs: [
          { left: { type: "asset", asset: { assetId: "asset_rabbit", variant: "silhouette" } }, right: { type: "emoji", emoji: "🐰" } },
          { left: { type: "asset", asset: { assetId: "asset_elephant", variant: "silhouette" } }, right: { type: "emoji", emoji: "🐘" } },
          { left: { type: "asset", asset: { assetId: "asset_giraffe", variant: "silhouette" } }, right: { type: "emoji", emoji: "🦒" } },
        ],
      },
    ],
  },
  rewards: { confetti: "full" },
};

/* 3) 텃밭 뽑기 (reveal-and-collect = tap-the-right-one + reveal 효과) */
export const revealAndCollectExample: InteractiveDocInput = {
  meta: { id: "ex_garden_pull", title: "텃밭에 심긴 채소 맞추기", archetype: "reveal-and-collect", createdFrom: "drop" },
  settings: { difficulty: "toddler", length: 1, mood: "punchy", optionCount: 3 },
  stage: {
    background: { colorRole: "pastel.sky" },
    nodes: [
      { id: "leaf", type: "image", role: "cue", transform: { x: 0.5, y: 0.4, w: 0.3, h: 0.25 } },
      { id: "carrot", type: "image", role: "hidden", transform: { x: 0.5, y: 0.55, w: 0.28, h: 0.4 }, animation: { reaction: "bounce" } },
      { id: "soil", type: "shape", role: "cover", shape: "rect", transform: { x: 0.5, y: 0.78, w: 1, h: 0.3 } },
      { id: "opt0", type: "slot", role: "option", transform: { x: 0.2, y: 0.9, w: 0.22, h: 0.14 } },
      { id: "opt1", type: "slot", role: "option", transform: { x: 0.5, y: 0.9, w: 0.22, h: 0.14 } },
      { id: "opt2", type: "slot", role: "option", transform: { x: 0.8, y: 0.9, w: 0.22, h: 0.14 } },
    ],
  },
  interaction: {
    kind: "tap-the-right-one",
    cueSlotId: "leaf",
    optionSlotIds: ["opt0", "opt1", "opt2"],
    rounds: [
      {
        cue: { type: "asset", asset: { assetId: "asset_carrot_leaf", variant: "leaf-crop" } },
        options: [
          { content: { type: "text", text: "당근" }, correct: true },
          { content: { type: "text", text: "감자" } },
          { content: { type: "text", text: "양파" } },
        ],
      },
    ],
  },
  effects: [
    {
      kind: "reveal",
      coverNodeId: "soil",
      hiddenNodeId: "carrot",
      cueNodeId: "leaf",
      trigger: "correct",
      motion: "pull-up",
      dust: true,
    },
  ],
  extend: [
    { type: "name-create", prompts: ["이 채소로 무슨 요리를 할 수 있을까요?"], nuri: ["nature-inquiry", "communication"], laneX: 1.1 },
  ],
  rewards: { confetti: "full" },
};

/* 4) 감정 맞추고 반응 → 캐릭터 변형 (responsive-state + rive).
   실연동: 무료 커뮤니티 Rive 캐릭터(로그인 곰, JcToon 원작 — public/rive/teddy.riv,
   상태머신 "Login Machine", 트리거 trigSuccess/trigFail)를 연결. 정답→곰 환호, 오답→곰 슬픔. */
export const responsiveStateExample: InteractiveDocInput = {
  meta: { id: "ex_emotion", title: "곰 친구 마음 알기", archetype: "tap-the-right-one", createdFrom: "prompt" },
  settings: { difficulty: "senior", length: 1, optionCount: 3 },
  stage: {
    nodes: [
      { id: "friend", type: "rive", role: "actor", src: "/rive/teddy.riv", stateMachine: "LoginState", transform: { x: 0.5, y: 0.35, w: 0.5, h: 0.5 } },
      { id: "opt0", type: "slot", role: "option", transform: { x: 0.2, y: 0.82, w: 0.22, h: 0.16 } },
      { id: "opt1", type: "slot", role: "option", transform: { x: 0.5, y: 0.82, w: 0.22, h: 0.16 } },
      { id: "opt2", type: "slot", role: "option", transform: { x: 0.8, y: 0.82, w: 0.22, h: 0.16 } },
    ],
  },
  interaction: {
    kind: "tap-the-right-one",
    cueSlotId: "friend",
    optionSlotIds: ["opt0", "opt1", "opt2"],
    rounds: [
      {
        cue: { type: "text", text: "곰 친구를 어떻게 대해줄까요?" },
        options: [
          { content: { type: "emoji", emoji: "🤗" }, correct: true },
          { content: { type: "emoji", emoji: "😠" } },
          { content: { type: "emoji", emoji: "🙈" } },
        ],
      },
    ],
  },
  effects: [
    {
      kind: "responsive-state",
      actorNodeId: "friend",
      stateMachine: "LoginState",
      inputs: {
        correct: { name: "success", value: "trigger" },
        wrong: { name: "fail", value: "trigger" },
      },
      goalState: "happy",
    },
  ],
  rewards: { confetti: "light" },
};

/* ════════ 카탈로그 확장 부품 픽스처 (categorize / order-sequence / find-it / sequence-tap / pattern-next / video) ════════ */

/* 색깔 분류 — categorize */
export const categorizeExample: InteractiveDocInput = {
  meta: { id: "ex_color_sort", title: "색깔 분류 미션", archetype: "categorize", createdFrom: "prompt" },
  settings: { difficulty: "toddler", length: 1, optionCount: 2 },
  stage: { nodes: [
    { id: "b0", type: "slot", role: "slot", transform: { x: .3, y: .25, w: .3, h: .2 } },
    { id: "b1", type: "slot", role: "slot", transform: { x: .7, y: .25, w: .3, h: .2 } },
    { id: "i0", type: "slot", role: "slot", transform: { x: .25, y: .75, w: .18, h: .18 } },
    { id: "i1", type: "slot", role: "slot", transform: { x: .5, y: .75, w: .18, h: .18 } },
    { id: "i2", type: "slot", role: "slot", transform: { x: .75, y: .75, w: .18, h: .18 } },
  ] },
  interaction: { kind: "categorize", itemSlotIds: ["i0", "i1", "i2"], bucketSlotIds: ["b0", "b1"],
    rounds: [{ buckets: [{ type: "text", text: "빨강" }, { type: "text", text: "파랑" }],
      items: [{ content: { type: "emoji", emoji: "🍎" }, bucket: 0 }, { content: { type: "emoji", emoji: "🫐" }, bucket: 1 }, { content: { type: "emoji", emoji: "🍓" }, bucket: 0 }] }] },
  rewards: {},
};

/* 자라는 순서 — order-sequence (+ discuss 확장) */
export const orderSequenceExample: InteractiveDocInput = {
  meta: { id: "ex_grow_order", title: "자라는 순서 맞추기", archetype: "order-sequence", createdFrom: "prompt" },
  settings: { length: 1 },
  stage: { nodes: [
    { id: "s0", type: "slot", transform: { x: .2, y: .5, w: .18, h: .3 } },
    { id: "s1", type: "slot", transform: { x: .4, y: .5, w: .18, h: .3 } },
    { id: "s2", type: "slot", transform: { x: .6, y: .5, w: .18, h: .3 } },
    { id: "s3", type: "slot", transform: { x: .8, y: .5, w: .18, h: .3 } },
  ] },
  interaction: { kind: "order-sequence", slotIds: ["s0", "s1", "s2", "s3"],
    rounds: [{ steps: [{ type: "emoji", emoji: "🌰" }, { type: "emoji", emoji: "🌱" }, { type: "emoji", emoji: "🌷" }, { type: "emoji", emoji: "🍎" }] }] },
  extend: [{ type: "discuss", prompts: ["왜 이 순서라고 생각했어요?"], nuri: ["nature-inquiry", "communication"], laneX: 1.1 }],
  rewards: {},
};

/* 교실에서 찾기 — find-it (zone 노드 사용) */
export const findItExample: InteractiveDocInput = {
  meta: { id: "ex_find_classroom", title: "교실에서 찾아요", archetype: "find-it", createdFrom: "prompt" },
  settings: { length: 1 },
  stage: { nodes: [
    { id: "scene", type: "image", role: "decoration", transform: { x: .5, y: .45, w: 1, h: .8 } },
    { id: "z_hat", type: "zone", transform: { x: .3, y: .4, w: .15, h: .15 } },
    { id: "z_ball", type: "zone", transform: { x: .7, y: .6, w: .15, h: .15 } },
  ] },
  interaction: { kind: "find-it", sceneNodeId: "scene",
    rounds: [{ finds: [{ cue: { type: "text", text: "빨간 모자" }, targetZoneId: "z_hat" }] }] },
  rewards: {},
};

/* 개구리 점프 세기 — sequence-tap (+ move-express 확장) */
export const sequenceTapExample: InteractiveDocInput = {
  meta: { id: "ex_frog_jump", title: "개구리 점프 세기", archetype: "sequence-tap", createdFrom: "prompt" },
  settings: { difficulty: "toddler", length: 1 },
  stage: { nodes: [
    { id: "frog", type: "rive", role: "actor", src: "frog.riv", stateMachine: "jump", transform: { x: .5, y: .3, w: .3, h: .3 } },
    { id: "p0", type: "slot", transform: { x: .25, y: .75, w: .15, h: .15 } },
    { id: "p1", type: "slot", transform: { x: .5, y: .75, w: .15, h: .15 } },
    { id: "p2", type: "slot", transform: { x: .75, y: .75, w: .15, h: .15 } },
  ] },
  interaction: { kind: "sequence-tap", actorNodeId: "frog", stepSlotIds: ["p0", "p1", "p2"],
    rounds: [{ steps: [{ content: { type: "emoji", emoji: "🪷" } }, { content: { type: "emoji", emoji: "🪷" } }, { content: { type: "emoji", emoji: "🪷" } }] }] },
  extend: [{ type: "move-express", prompts: ["개구리처럼 세 번 점프해볼까요?"], nuri: ["physical"], laneX: 1.1 }],
  rewards: {},
};

/* 패턴 잇기 — pattern-next */
export const patternNextExample: InteractiveDocInput = {
  meta: { id: "ex_pattern", title: "다음에 올 친구는?", archetype: "pattern-next", createdFrom: "prompt" },
  settings: { length: 1, optionCount: 3 },
  stage: { nodes: [
    { id: "q0", type: "slot", transform: { x: .15, y: .35, w: .15, h: .18 } },
    { id: "q1", type: "slot", transform: { x: .33, y: .35, w: .15, h: .18 } },
    { id: "q2", type: "slot", transform: { x: .51, y: .35, w: .15, h: .18 } },
    { id: "q3", type: "slot", transform: { x: .69, y: .35, w: .15, h: .18 } },
    { id: "o0", type: "slot", role: "option", transform: { x: .25, y: .78, w: .18, h: .16 } },
    { id: "o1", type: "slot", role: "option", transform: { x: .5, y: .78, w: .18, h: .16 } },
    { id: "o2", type: "slot", role: "option", transform: { x: .75, y: .78, w: .18, h: .16 } },
  ] },
  interaction: { kind: "pattern-next", sequenceSlotIds: ["q0", "q1", "q2", "q3"], optionSlotIds: ["o0", "o1", "o2"],
    rounds: [{ sequence: [{ type: "emoji", emoji: "🔴" }, { type: "emoji", emoji: "🔵" }, { type: "emoji", emoji: "🔴" }, { type: "emoji", emoji: "🔵" }],
      options: [{ content: { type: "emoji", emoji: "🔴" }, correct: true }, { content: { type: "emoji", emoji: "🟡" } }, { content: { type: "emoji", emoji: "🔺" } }] }] },
  rewards: {},
};

/* 영상 보고 맞추기 — video 노드 + video ContentBinding */
export const videoCueExample: InteractiveDocInput = {
  meta: { id: "ex_video_cue", title: "영상 보고 맞추기", archetype: "tap-the-right-one", createdFrom: "prompt" },
  settings: { length: 1, optionCount: 3 },
  stage: { nodes: [
    { id: "clip", type: "video", role: "cue", asset: { assetId: "clip_caterpillar", kind: "curated" }, muted: true, autoplay: true, loop: true, transform: { x: .5, y: .32, w: .6, h: .42 } },
    { id: "opt0", type: "slot", role: "option", transform: { x: .2, y: .8, w: .22, h: .16 } },
    { id: "opt1", type: "slot", role: "option", transform: { x: .5, y: .8, w: .22, h: .16 } },
    { id: "opt2", type: "slot", role: "option", transform: { x: .8, y: .8, w: .22, h: .16 } },
  ] },
  interaction: { kind: "tap-the-right-one", cueSlotId: "clip", optionSlotIds: ["opt0", "opt1", "opt2"],
    rounds: [{ cue: { type: "video", asset: { assetId: "clip_caterpillar", kind: "curated" } },
      options: [{ content: { type: "text", text: "애벌레" }, correct: true }, { content: { type: "text", text: "나비" } }, { content: { type: "text", text: "개미" } }] }] },
  rewards: { confetti: "light" },
};
