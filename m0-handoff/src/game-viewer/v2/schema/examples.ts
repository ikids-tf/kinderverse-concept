/**
 * 픽스처 — 스키마가 실제로 작동함을 증명하고, 조립기/런타임의 참조 예시.
 * 입력 타입(InteractiveDocInput)으로 작성 → 기본값 필드는 생략 가능.
 */
import type { InteractiveDocInput } from "./interactiveDoc";

/* 1) 누구일까 동물 맞추기 (M0 핵심 부품) */
export const tapTheRightOneExample: InteractiveDocInput = {
  meta: {
    id: "ex_animal_guess",
    title: "누굴까? 동물 친구 맞추기",
    archetype: "tap-the-right-one",
    createdFrom: "drop",
  },
  settings: { difficulty: "toddler", length: 2, mood: "lively", optionCount: 3 },
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
        cue: { type: "asset", asset: { assetId: "asset_elephant", cutout: "ready" } },
        options: [
          { content: { type: "text", text: "코끼리" }, correct: true },
          { content: { type: "text", text: "토끼" } },
          { content: { type: "text", text: "강아지" } },
        ],
      },
      {
        cue: { type: "asset", asset: { assetId: "asset_cat", cutout: "ready" } },
        options: [
          { content: { type: "text", text: "펭귄" } },
          { content: { type: "text", text: "고양이" }, correct: true },
          { content: { type: "text", text: "코끼리" } },
        ],
      },
    ],
  },
  rewards: { confetti: "full" },
};

/* 2) 유사 개념 짝 맞추기 (소방서=소방관 …) — match-pair */
export const matchPairExample: InteractiveDocInput = {
  meta: { id: "ex_concept_match", title: "관련 있는 친구 찾기", archetype: "match-pair", createdFrom: "prompt" },
  settings: { length: 1, optionCount: 3 },
  stage: {
    nodes: [
      { id: "L0", type: "slot", role: "slot", transform: { x: 0.25, y: 0.3, w: 0.3, h: 0.18 } },
      { id: "L1", type: "slot", role: "slot", transform: { x: 0.25, y: 0.55, w: 0.3, h: 0.18 } },
      { id: "R0", type: "slot", role: "slot", transform: { x: 0.75, y: 0.3, w: 0.3, h: 0.18 } },
      { id: "R1", type: "slot", role: "slot", transform: { x: 0.75, y: 0.55, w: 0.3, h: 0.18 } },
    ],
  },
  interaction: {
    kind: "match-pair",
    leftSlotIds: ["L0", "L1"],
    rightSlotIds: ["R0", "R1"],
    rounds: [
      {
        pairs: [
          { left: { type: "emoji", emoji: "🚒" }, right: { type: "text", text: "소방관" } },
          { left: { type: "emoji", emoji: "🍎" }, right: { type: "text", text: "사과나무" } },
        ],
      },
    ],
  },
  rewards: {},
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
  rewards: { confetti: "full" },
};

/* 4) 감정 맞추고 반응 → 표정 변화 (responsive-state + rive) */
export const responsiveStateExample: InteractiveDocInput = {
  meta: { id: "ex_emotion", title: "친구 마음 알아주기", archetype: "tap-the-right-one", createdFrom: "prompt" },
  settings: { difficulty: "senior", length: 1, optionCount: 3 },
  stage: {
    nodes: [
      { id: "friend", type: "rive", role: "actor", src: "friend.riv", stateMachine: "emotion", transform: { x: 0.5, y: 0.35, w: 0.5, h: 0.5 } },
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
        cue: { type: "text", text: "친구가 슬퍼요. 어떻게 해줄까요?" },
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
      stateMachine: "emotion",
      inputs: {
        correct: { name: "comfort", value: "trigger" },
        wrong: { name: "confused", value: "trigger" },
      },
      goalState: "happy",
    },
  ],
  rewards: { confetti: "light" },
};
