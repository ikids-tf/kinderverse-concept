/**
 * resolver.ts — 의도(프롬프트) → 제약된 좋은 선택(추천 아키타입) → InteractiveDoc 결정론 조립.
 * ------------------------------------------------------------------
 * PRD의 Resolver(해자) 결정론 경로. LLM 없이 키워드+큐레이션 셋으로 항상 유효·예쁜 문서를 만든다.
 * 🔴 실제 LLM 의도파싱/나노바나나 생성은 이 위에 얹는 seam(parseIntent를 LLM이 대체 가능).
 * 부품은 콘텐츠 무관(직교) — 카테고리만 바꾸면 모든 게임이 새로 나온다.
 */
import type { InteractiveDocInput } from "../schema/interactiveDoc";
import { CATEGORIES, findCategory, type Category, type Item } from "./contentSets";

export type Archetype = "tap-the-right-one" | "match-pair" | "flip-memory";

export interface Intent {
  category: Category;
  archetype?: Archetype; // 명시되면 추천 1순위로
}

export interface Recommendation {
  archetype: Archetype;
  /** 교사 언어 장르명(기술 부품명 노출 금지) */
  title: string;
  emoji: string;
  build: () => { title: string; input: InteractiveDocInput };
}

function shuffle<T>(a: readonly T[]): T[] {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

/** 프롬프트 → 의도. 카테고리를 못 찾으면 null(첫 카테고리로 폴백은 호출부에서). */
export function parseIntent(prompt: string): Intent | null {
  const cat = findCategory(prompt);
  if (!cat) return null;
  let archetype: Archetype | undefined;
  if (/짝|매칭|연결|이어/.test(prompt)) archetype = "match-pair";
  else if (/뒤집|기억|메모리|카드/.test(prompt)) archetype = "flip-memory";
  else if (/맞추|이름|누구|뭐/.test(prompt)) archetype = "tap-the-right-one";
  return { category: cat, archetype };
}

/* ───────────────────────── 아키타입별 결정론 조립 ───────────────────────── */

function assembleTap(cat: Category): InteractiveDocInput {
  const picks = shuffle(cat.items).slice(0, 3);
  const rounds = picks.map((it: Item) => {
    const distractors = shuffle(cat.items.filter((x) => x.label !== it.label)).slice(0, 2);
    const options = shuffle([
      { content: { type: "text" as const, text: it.label }, correct: true },
      ...distractors.map((d) => ({ content: { type: "text" as const, text: d.label } })),
    ]);
    return { cue: { type: "emoji" as const, emoji: it.emoji }, options };
  });
  return {
    meta: { id: `gen_tap_${cat.key}`, title: `${cat.label} 이름 맞추기`, archetype: "tap-the-right-one", createdFrom: "prompt" },
    settings: { difficulty: "toddler", length: rounds.length, mood: "lively", optionCount: 3 },
    stage: {
      background: { colorRole: "pastel.cream" },
      nodes: [
        { id: "cue", type: "image", role: "cue", transform: { x: 0.5, y: 0.3, w: 0.46, h: 0.46 }, animation: { entrance: "pop", idle: "breathe" } },
        { id: "opt0", type: "slot", role: "option", transform: { x: 0.2, y: 0.82, w: 0.24, h: 0.18 } },
        { id: "opt1", type: "slot", role: "option", transform: { x: 0.5, y: 0.82, w: 0.24, h: 0.18 } },
        { id: "opt2", type: "slot", role: "option", transform: { x: 0.8, y: 0.82, w: 0.24, h: 0.18 } },
      ],
    },
    interaction: { kind: "tap-the-right-one", cueSlotId: "cue", optionSlotIds: ["opt0", "opt1", "opt2"], rounds },
    rewards: { confetti: "full" },
  };
}

function assembleMatch(cat: Category): InteractiveDocInput {
  const picks = shuffle(cat.items).slice(0, 3);
  const pairs = picks.map((it: Item) => ({
    left: { type: "emoji" as const, emoji: it.emoji },
    right: { type: "text" as const, text: it.label },
  }));
  return {
    meta: { id: `gen_match_${cat.key}`, title: `${cat.label} 짝 맞추기`, archetype: "match-pair", createdFrom: "prompt" },
    settings: { difficulty: "toddler", length: 1, mood: "lively", optionCount: 3 },
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
    interaction: { kind: "match-pair", leftSlotIds: ["L0", "L1", "L2"], rightSlotIds: ["R0", "R1", "R2"], rounds: [{ pairs }] },
    rewards: { confetti: "full" },
  };
}

function assembleFlip(cat: Category): InteractiveDocInput {
  const faces = shuffle(cat.items).slice(0, 3).map((it: Item) => ({ type: "emoji" as const, emoji: it.emoji }));
  return {
    meta: { id: `gen_flip_${cat.key}`, title: `${cat.label} 카드 뒤집기`, archetype: "flip-memory", createdFrom: "prompt" },
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
    interaction: { kind: "flip-memory", cardSlotIds: ["c0", "c1", "c2", "c3", "c4", "c5"], rounds: [{ faces }] },
    rewards: { confetti: "full" },
  };
}

const ASSEMBLERS: Record<Archetype, (cat: Category) => InteractiveDocInput> = {
  "tap-the-right-one": assembleTap,
  "match-pair": assembleMatch,
  "flip-memory": assembleFlip,
};

/** 카테고리에 어울리는 추천 카드(교사 언어). 의도에 명시된 아키타입이 1순위. */
export function recommend(intent: Intent): Recommendation[] {
  const cat = intent.category;
  const base: Array<{ archetype: Archetype; title: string; emoji: string }> = [
    { archetype: "tap-the-right-one", title: `${cat.label} 이름 맞추기`, emoji: "🔎" },
    { archetype: "match-pair", title: `${cat.label} 짝 맞추기`, emoji: "🔗" },
    { archetype: "flip-memory", title: `${cat.label} 카드 뒤집기`, emoji: "🃏" },
  ];
  const ordered = intent.archetype
    ? [...base.filter((b) => b.archetype === intent.archetype), ...base.filter((b) => b.archetype !== intent.archetype)]
    : base;
  return ordered.map((b) => ({
    ...b,
    build: () => ({ title: b.title, input: ASSEMBLERS[b.archetype](cat) }),
  }));
}

/** 프롬프트 → 추천 목록(결정론). 카테고리 못 찾으면 첫 카테고리로 폴백(빈 결과 금지). */
export function recommendFromPrompt(prompt: string): Recommendation[] {
  const intent = parseIntent(prompt) ?? { category: CATEGORIES[0] };
  return recommend(intent);
}

/** 프롬프트 → 추천(LLM 우선, 실패/키없음 시 결정론 폴백). 자유 표현까지 이해. */
export async function recommendFromPromptAI(prompt: string): Promise<Recommendation[]> {
  const { llmParseIntent } = await import("./llmIntent");
  const intent = (await llmParseIntent(prompt)) ?? parseIntent(prompt) ?? { category: CATEGORIES[0] };
  return recommend(intent);
}
