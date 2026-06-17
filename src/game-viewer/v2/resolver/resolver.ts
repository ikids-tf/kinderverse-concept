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

/* ───────────────────────── 노브(교사 설정) → 기술 파라미터 (PRD §5) ───────────────────────── */

export interface Knobs {
  difficulty: "baby" | "toddler" | "senior"; // 보기 수·짝 수
  length: "short" | "normal" | "long"; // 라운드 수(tap)
  mood: "calm" | "lively" | "punchy"; // 모션·보상 강도
}
export const DEFAULT_KNOBS: Knobs = { difficulty: "toddler", length: "normal", mood: "lively" };

const OPTION_COUNT = { baby: 2, toddler: 3, senior: 4 } as const; // 난이도 → 보기 수
const TAP_ROUNDS = { short: 2, normal: 3, long: 5 } as const; // 분량 → 라운드 수
const PAIR_COUNT = { baby: 2, toddler: 3, senior: 4 } as const; // 난이도 → 짝/카드 수

export interface RecommendOpts {
  useImages?: boolean;
  knobs?: Knobs;
}

/* ───────────────────────── 동적 슬롯 레이아웃(보기·짝·카드 수에 맞춰) ───────────────────────── */

type SlotInput = { id: string; type: "slot"; role: "option" | "slot"; transform: { x: number; y: number; w: number; h: number } };

function optionSlots(n: number): SlotInput[] {
  const w = Math.min(0.26, 0.92 / n);
  return Array.from({ length: n }, (_, i) => ({
    id: `opt${i}`, type: "slot", role: "option", transform: { x: (i + 1) / (n + 1), y: 0.82, w, h: 0.18 },
  }));
}
function pairSlots(n: number): { left: SlotInput[]; right: SlotInput[] } {
  const h = Math.min(0.18, 0.7 / n);
  const yOf = (i: number) => (n === 1 ? 0.5 : 0.26 + (i * 0.6) / (n - 1));
  const col = (side: "L" | "R", x: number): SlotInput[] =>
    Array.from({ length: n }, (_, i) => ({ id: `${side}${i}`, type: "slot", role: "slot", transform: { x, y: yOf(i), w: 0.3, h } }));
  return { left: col("L", 0.26), right: col("R", 0.74) };
}
function cardSlots(count: number): SlotInput[] {
  const cols = count <= 4 ? 2 : count <= 6 ? 3 : 4;
  const rows = Math.ceil(count / cols);
  const w = Math.min(0.26, 0.92 / cols);
  const h = Math.min(0.34, 0.84 / rows);
  return Array.from({ length: count }, (_, i) => {
    const r = Math.floor(i / cols), c = i % cols;
    return { id: `c${i}`, type: "slot", role: "slot", transform: { x: (c + 1) / (cols + 1), y: (r + 1) / (rows + 1), w, h } };
  });
}

/* ───────────────────────── 아키타입별 결정론 조립 ───────────────────────── */

function itemContent(it: Item, useImages: boolean) {
  return useImages
    ? { type: "asset" as const, asset: { assetId: it.label } } // assetKey=라벨 → assetStore가 생성·스왑
    : { type: "emoji" as const, emoji: it.emoji };
}

/** 카테고리에서 n개를 뽑되, 모자라면 셔플해 순환(빈 라운드 금지). */
function pickN(items: readonly Item[], n: number): Item[] {
  const out: Item[] = [];
  let pool: Item[] = [];
  while (out.length < n) {
    if (pool.length === 0) pool = shuffle(items);
    const next = pool.pop();
    if (next) out.push(next);
  }
  return out;
}

function assembleTap(cat: Category, useImages: boolean, k: Knobs): InteractiveDocInput {
  const optionCount = OPTION_COUNT[k.difficulty];
  const roundCount = TAP_ROUNDS[k.length];
  const slots = optionSlots(optionCount);
  const rounds = pickN(cat.items, roundCount).map((it) => {
    const distractors = shuffle(cat.items.filter((x) => x.label !== it.label)).slice(0, optionCount - 1);
    const options = shuffle([
      { content: { type: "text" as const, text: it.label }, correct: true },
      ...distractors.map((d) => ({ content: { type: "text" as const, text: d.label } })),
    ]);
    return { cue: itemContent(it, useImages), options };
  });
  return {
    meta: { id: `gen_tap_${cat.key}`, title: `${cat.label} 이름 맞추기`, archetype: "tap-the-right-one", createdFrom: "prompt" },
    settings: { difficulty: k.difficulty, length: roundCount, mood: k.mood, optionCount },
    stage: {
      background: { colorRole: "pastel.cream" },
      nodes: [
        { id: "cue", type: "image", role: "cue", transform: { x: 0.5, y: 0.3, w: 0.46, h: 0.46 }, animation: { entrance: "pop", idle: "breathe" } },
        ...slots,
      ],
    },
    interaction: { kind: "tap-the-right-one", cueSlotId: "cue", optionSlotIds: slots.map((s) => s.id), rounds },
    rewards: { confetti: "full" },
  };
}

function assembleMatch(cat: Category, useImages: boolean, k: Knobs): InteractiveDocInput {
  const n = PAIR_COUNT[k.difficulty];
  const { left, right } = pairSlots(n);
  const pairs = shuffle(cat.items).slice(0, n).map((it) => ({
    left: itemContent(it, useImages),
    right: { type: "text" as const, text: it.label },
  }));
  return {
    meta: { id: `gen_match_${cat.key}`, title: `${cat.label} 짝 맞추기`, archetype: "match-pair", createdFrom: "prompt" },
    settings: { difficulty: k.difficulty, length: 1, mood: k.mood, optionCount: n },
    stage: { nodes: [...left, ...right] },
    interaction: {
      kind: "match-pair",
      leftSlotIds: left.map((s) => s.id),
      rightSlotIds: right.map((s) => s.id),
      rounds: [{ pairs }],
    },
    rewards: { confetti: "full" },
  };
}

function assembleFlip(cat: Category, useImages: boolean, k: Knobs): InteractiveDocInput {
  const n = PAIR_COUNT[k.difficulty];
  const faces = shuffle(cat.items).slice(0, n).map((it) => itemContent(it, useImages));
  const cards = cardSlots(n * 2);
  return {
    meta: { id: `gen_flip_${cat.key}`, title: `${cat.label} 카드 뒤집기`, archetype: "flip-memory", createdFrom: "prompt" },
    settings: { difficulty: k.difficulty, length: 1, mood: k.mood },
    stage: { nodes: cards },
    interaction: { kind: "flip-memory", cardSlotIds: cards.map((s) => s.id), rounds: [{ faces }] },
    rewards: { confetti: "full" },
  };
}

const ASSEMBLERS: Record<Archetype, (cat: Category, useImages: boolean, k: Knobs) => InteractiveDocInput> = {
  "tap-the-right-one": assembleTap,
  "match-pair": assembleMatch,
  "flip-memory": assembleFlip,
};

/** 카테고리에 어울리는 추천 카드(교사 언어). 의도에 명시된 아키타입이 1순위.
    opts.knobs(난이도·분량·분위기)와 opts.useImages가 조립에 반영된다. */
export function recommend(intent: Intent, opts: RecommendOpts = {}): Recommendation[] {
  const cat = intent.category;
  const useImages = opts.useImages ?? false;
  const knobs = opts.knobs ?? DEFAULT_KNOBS;
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
    build: () => ({ title: b.title, input: ASSEMBLERS[b.archetype](cat, useImages, knobs) }),
  }));
}

/** 프롬프트 → 추천 목록(결정론). 카테고리 못 찾으면 첫 카테고리로 폴백(빈 결과 금지). */
export function recommendFromPrompt(prompt: string, opts: RecommendOpts = {}): Recommendation[] {
  const intent = parseIntent(prompt) ?? { category: CATEGORIES[0] };
  return recommend(intent, opts);
}

/** 프롬프트 → 추천(LLM 우선, 실패/키없음 시 결정론 폴백). 자유 표현까지 이해. */
export async function recommendFromPromptAI(prompt: string, opts: RecommendOpts = {}): Promise<Recommendation[]> {
  const { llmParseIntent } = await import("./llmIntent");
  const intent = (await llmParseIntent(prompt)) ?? parseIntent(prompt) ?? { category: CATEGORIES[0] };
  return recommend(intent, opts);
}
