/**
 * fixtures.ts — 플레이 가능한 픽스처 레지스트리(교사 크롬의 게임 전환기).
 * M0: tap-the-right-one · match-pair · reveal.
 * M1 부품 확장: binary-choice · connect · flip-memory (선언적 부품, 런타임 재사용).
 * 스키마 검증된 examples.ts는 그대로 두고, M1 픽스처는 여기 InteractiveDocInput으로 둔다.
 */
import {
  tapTheRightOneExample,
  matchPairExample,
  revealAndCollectExample,
  orderSequenceExample,
  patternNextExample,
  categorizeExample,
  findItExample,
  responsiveStateExample,
} from "../schema/examples";
import type { InteractiveDocInput } from "../schema/interactiveDoc";

/* binary-choice — OX 퀴즈. prompt 노드(cue로 렌더) + 고정 O/X 버튼. */
const binaryChoiceExample: InteractiveDocInput = {
  meta: { id: "ex_ox", title: "맞을까? 틀릴까?", archetype: "binary-choice", createdFrom: "prompt" },
  settings: { difficulty: "toddler", length: 3, mood: "lively" },
  stage: {
    background: { colorRole: "pastel.cream" },
    nodes: [{ id: "prompt", type: "slot", role: "cue", transform: { x: 0.5, y: 0.34, w: 0.78, h: 0.34 } }],
  },
  interaction: {
    kind: "binary-choice",
    promptSlotId: "prompt",
    rounds: [
      { prompt: { type: "text", text: "🍎 사과는 과일이에요" }, answer: true },
      { prompt: { type: "text", text: "🐱 고양이는 하늘을 날아요" }, answer: false },
      { prompt: { type: "text", text: "☀️ 해는 낮에 떠요" }, answer: true },
    ],
  },
  rewards: { confetti: "light" },
};

/* connect — 관계 잇기(동물–먹이). match-pair와 동일 메커니즘, links로 표현. */
const connectExample: InteractiveDocInput = {
  meta: { id: "ex_connect", title: "관계있는 친구 잇기", archetype: "connect", createdFrom: "prompt" },
  settings: { difficulty: "senior", length: 1, mood: "lively" },
  stage: {
    nodes: [
      { id: "L0", type: "slot", role: "slot", transform: { x: 0.26, y: 0.26, w: 0.3, h: 0.18 } },
      { id: "L1", type: "slot", role: "slot", transform: { x: 0.26, y: 0.54, w: 0.3, h: 0.18 } },
      { id: "L2", type: "slot", role: "slot", transform: { x: 0.26, y: 0.82, w: 0.3, h: 0.16 } },
      { id: "R0", type: "slot", role: "slot", transform: { x: 0.74, y: 0.26, w: 0.3, h: 0.18 } },
      { id: "R1", type: "slot", role: "slot", transform: { x: 0.74, y: 0.54, w: 0.3, h: 0.18 } },
      { id: "R2", type: "slot", role: "slot", transform: { x: 0.74, y: 0.82, w: 0.3, h: 0.16 } },
    ],
  },
  interaction: {
    kind: "connect",
    leftSlotIds: ["L0", "L1", "L2"],
    rightSlotIds: ["R0", "R1", "R2"],
    rounds: [
      {
        links: [
          { left: { type: "emoji", emoji: "🐰" }, right: { type: "emoji", emoji: "🥕" } },
          { left: { type: "emoji", emoji: "🐶" }, right: { type: "emoji", emoji: "🦴" } },
          { left: { type: "emoji", emoji: "🐵" }, right: { type: "emoji", emoji: "🍌" } },
        ],
      },
    ],
  },
  rewards: { confetti: "full" },
};

/* flip-memory — 같은 카드 뒤집기(3쌍/6장). faces는 각각 2번 등장(런타임이 페어링). */
const flipMemoryExample: InteractiveDocInput = {
  meta: { id: "ex_flip", title: "같은 카드 찾기", archetype: "flip-memory", createdFrom: "prompt" },
  settings: { difficulty: "toddler", length: 1, mood: "punchy" },
  stage: {
    nodes: [
      { id: "c0", type: "slot", role: "slot", transform: { x: 0.25, y: 0.32, w: 0.24, h: 0.32 } },
      { id: "c1", type: "slot", role: "slot", transform: { x: 0.5, y: 0.32, w: 0.24, h: 0.32 } },
      { id: "c2", type: "slot", role: "slot", transform: { x: 0.75, y: 0.32, w: 0.24, h: 0.32 } },
      { id: "c3", type: "slot", role: "slot", transform: { x: 0.25, y: 0.72, w: 0.24, h: 0.32 } },
      { id: "c4", type: "slot", role: "slot", transform: { x: 0.5, y: 0.72, w: 0.24, h: 0.32 } },
      { id: "c5", type: "slot", role: "slot", transform: { x: 0.75, y: 0.72, w: 0.24, h: 0.32 } },
    ],
  },
  interaction: {
    kind: "flip-memory",
    cardSlotIds: ["c0", "c1", "c2", "c3", "c4", "c5"],
    rounds: [
      {
        faces: [
          { type: "emoji", emoji: "🦁" },
          { type: "emoji", emoji: "🐸" },
          { type: "emoji", emoji: "🐼" },
        ],
      },
    ],
  },
  rewards: { confetti: "full" },
};

/* partial-cue — 그림자(실루엣)만 보고 누군지 맞추기. cue asset의 variant="silhouette". */
const silhouetteExample: InteractiveDocInput = {
  meta: { id: "ex_silhouette", title: "그림자로 누군지 맞추기", archetype: "tap-the-right-one", createdFrom: "prompt" },
  settings: { difficulty: "toddler", length: 2, mood: "lively", optionCount: 3 },
  stage: {
    background: { colorRole: "pastel.sky" },
    nodes: [
      { id: "cue", type: "image", role: "cue", transform: { x: 0.5, y: 0.3, w: 0.44, h: 0.44 }, animation: { entrance: "pop", idle: "breathe" } },
      { id: "opt0", type: "slot", role: "option", transform: { x: 0.2, y: 0.82, w: 0.24, h: 0.18 } },
      { id: "opt1", type: "slot", role: "option", transform: { x: 0.5, y: 0.82, w: 0.24, h: 0.18 } },
      { id: "opt2", type: "slot", role: "option", transform: { x: 0.8, y: 0.82, w: 0.24, h: 0.18 } },
    ],
  },
  interaction: {
    kind: "tap-the-right-one",
    cueSlotId: "cue",
    optionSlotIds: ["opt0", "opt1", "opt2"],
    rounds: [
      {
        cue: { type: "asset", asset: { assetId: "asset_rabbit", variant: "silhouette" } },
        options: [
          { content: { type: "text", text: "토끼" }, correct: true },
          { content: { type: "text", text: "코끼리" } },
          { content: { type: "text", text: "펭귄" } },
        ],
      },
      {
        cue: { type: "asset", asset: { assetId: "asset_giraffe", variant: "silhouette" } },
        options: [
          { content: { type: "text", text: "강아지" } },
          { content: { type: "text", text: "기린" }, correct: true },
          { content: { type: "text", text: "고양이" } },
        ],
      },
    ],
  },
  rewards: { confetti: "full" },
};

export const FIXTURES: Record<string, { label: string; input: InteractiveDocInput }> = {
  animal: { label: "🐘 동물 맞추기", input: tapTheRightOneExample },
  silhouette: { label: "🌑 그림자 맞추기", input: silhouetteExample },
  match: { label: "🔗 짝 맞추기", input: matchPairExample },
  garden: { label: "🌱 텃밭 뽑기", input: revealAndCollectExample },
  ox: { label: "⭕ OX 퀴즈", input: binaryChoiceExample },
  connect: { label: "🧩 관계 잇기", input: connectExample },
  flip: { label: "🃏 카드 뒤집기", input: flipMemoryExample },
  order: { label: "🌱 순서대로", input: orderSequenceExample },
  pattern: { label: "🔵 패턴 잇기", input: patternNextExample },
  categorize: { label: "🧺 분류 담기", input: categorizeExample },
  findit: { label: "🔍 숨은그림 찾기", input: findItExample },
  emotion: { label: "😊 마음 알기", input: responsiveStateExample },
};

export type ExampleKey = keyof typeof FIXTURES;
export const FIXTURE_KEYS = Object.keys(FIXTURES);
