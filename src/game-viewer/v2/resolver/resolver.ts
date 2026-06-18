/**
 * resolver.ts — 의도(프롬프트) → 제약된 좋은 선택(추천 아키타입) → InteractiveDoc 결정론 조립.
 * ------------------------------------------------------------------
 * PRD의 Resolver(해자) 결정론 경로. LLM 없이 키워드+큐레이션 셋으로 항상 유효·예쁜 문서를 만든다.
 * 🔴 실제 LLM 의도파싱/나노바나나 생성은 이 위에 얹는 seam(parseIntent를 LLM이 대체 가능).
 * 부품은 콘텐츠 무관(직교) — 카테고리만 바꾸면 모든 게임이 새로 나온다.
 */
import type { InteractiveDocInput } from "../schema/interactiveDoc";
import {
  CATEGORIES, findCategory, SEQUENCES, findSequence,
  type Category, type Item, type Sequence,
} from "./contentSets";

export type Archetype =
  | "tap-the-right-one"
  | "match-pair"
  | "flip-memory"
  | "binary-choice"
  | "connect"
  | "categorize"
  | "pattern-next"
  | "order-sequence";

/** order-sequence는 카테고리가 아니라 순서형 콘텐츠를 쓴다(직교). */
type CategoryArchetype = Exclude<Archetype, "order-sequence">;

export interface Intent {
  category: Category;
  archetype?: Archetype; // 명시되면 추천 1순위로
  sequence?: Sequence; // order-sequence일 때 쓸 순서형 콘텐츠
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
  // order-sequence는 카테고리 없이 순서형 콘텐츠로 동작 — 먼저 검사.
  if (/순서대로|순서|차례|자라는|커지는|작은\s*것부터|큰\s*것부터/.test(prompt)) {
    return {
      category: findCategory(prompt) ?? CATEGORIES[0],
      archetype: "order-sequence",
      sequence: findSequence(prompt) ?? SEQUENCES[0],
    };
  }
  const cat = findCategory(prompt);
  if (!cat) return null;
  let archetype: Archetype | undefined;
  if (/ox|오엑스|맞을까|틀릴|참\s*거짓|일까요|맞나요/i.test(prompt)) archetype = "binary-choice";
  else if (/분류|나누|나눠|나눔|모으|구분|담기|골라\s*담/.test(prompt)) archetype = "categorize";
  else if (/패턴|규칙|다음에?\s*올|이어지는|다음\s*차례/.test(prompt)) archetype = "pattern-next";
  else if (/관계|연결|이어|이을|이으|어울리/.test(prompt)) archetype = "connect";
  else if (/짝|매칭|같은/.test(prompt)) archetype = "match-pair";
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
/** categorize — 윗줄 버킷(담는 곳) n개. */
function bucketSlots(n: number): SlotInput[] {
  const w = Math.min(0.34, 0.8 / n);
  return Array.from({ length: n }, (_, i) => ({
    id: `b${i}`, type: "slot", role: "slot", transform: { x: (i + 1) / (n + 1), y: 0.24, w, h: 0.2 },
  }));
}
/** categorize — 아랫줄 분류할 아이템 n개(한 줄). */
function catItemSlots(n: number): SlotInput[] {
  const w = Math.min(0.18, 0.9 / n);
  return Array.from({ length: n }, (_, i) => ({
    id: `i${i}`, type: "slot", role: "slot", transform: { x: (i + 1) / (n + 1), y: 0.78, w, h: 0.18 },
  }));
}
/** pattern-next — 제시 수열 n칸(한 줄). */
function patternSeqSlots(n: number): SlotInput[] {
  const w = Math.min(0.16, 0.8 / n);
  return Array.from({ length: n }, (_, i) => ({
    id: `q${i}`, type: "slot", role: "slot", transform: { x: (i + 1) / (n + 1), y: 0.36, w, h: 0.18 },
  }));
}
/** order-sequence — 가운데 한 줄(셔플 배치될 자리). */
function orderRowSlots(n: number): SlotInput[] {
  const w = Math.min(0.2, 0.86 / n);
  return Array.from({ length: n }, (_, i) => ({
    id: `s${i}`, type: "slot", role: "slot", transform: { x: (i + 1) / (n + 1), y: 0.5, w, h: 0.3 },
  }));
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

/** 한글 조사 은/는 선택(받침 유무). OX 진술을 자연스럽게. */
function josa(word: string): string {
  const c = word.charCodeAt(word.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return "는"; // 한글 음절이 아니면 기본
  return (c - 0xac00) % 28 === 0 ? "는" : "은";
}

/** OX 퀴즈 — 같은 카테고리(참) vs 다른 카테고리(거짓) 진술을 번갈아. 결정론, 새 콘텐츠 0. */
function assembleBinary(cat: Category, _useImages: boolean, k: Knobs): InteractiveDocInput {
  const roundCount = TAP_ROUNDS[k.length];
  const others = CATEGORIES.filter((c) => c.key !== cat.key);
  const truePool = shuffle(cat.items);
  const rounds = Array.from({ length: roundCount }, (_, i) => {
    const isTrue = i % 2 === 0;
    const it = isTrue ? truePool[i % truePool.length] : shuffle(shuffle(others)[0].items)[0];
    return {
      prompt: { type: "text" as const, text: `${it.emoji} ${it.label}${josa(it.label)} ${cat.label}이에요` },
      answer: isTrue,
    };
  });
  return {
    meta: { id: `gen_ox_${cat.key}`, title: `${cat.label} OX 퀴즈`, archetype: "binary-choice", createdFrom: "prompt" },
    settings: { difficulty: k.difficulty, length: roundCount, mood: k.mood },
    stage: {
      background: { colorRole: "pastel.cream" },
      nodes: [{ id: "prompt", type: "slot", role: "cue", transform: { x: 0.5, y: 0.34, w: 0.8, h: 0.34 } }],
    },
    interaction: { kind: "binary-choice", promptSlotId: "prompt", rounds },
    rewards: { confetti: "light" },
  };
}

/** 관계 잇기 — 큐레이션 관계 쌍을 좌(순서)·우(셔플 런타임)로. match-pair와 같은 메커니즘. */
function assembleConnect(cat: Category, _useImages: boolean, k: Knobs): InteractiveDocInput {
  const n = Math.min(PAIR_COUNT[k.difficulty], cat.relations.length);
  const { left, right } = pairSlots(n);
  const links = shuffle(cat.relations).slice(0, n).map((p) => ({
    left: { type: "emoji" as const, emoji: p.left.emoji },
    right: { type: "emoji" as const, emoji: p.right.emoji },
  }));
  return {
    meta: { id: `gen_connect_${cat.key}`, title: `${cat.label} 관계 잇기`, archetype: "connect", createdFrom: "prompt" },
    settings: { difficulty: k.difficulty, length: 1, mood: k.mood, optionCount: n },
    stage: { nodes: [...left, ...right] },
    interaction: {
      kind: "connect",
      leftSlotIds: left.map((s) => s.id),
      rightSlotIds: right.map((s) => s.id),
      rounds: [{ links }],
    },
    rewards: { confetti: "full" },
  };
}

/** 분류 담기 — 의도 카테고리 + 다른 카테고리를 두 버킷으로, 아이템을 섞어 분류. */
function assembleCategorize(cat: Category, useImages: boolean, k: Knobs): InteractiveDocInput {
  const per = PAIR_COUNT[k.difficulty]; // 버킷당 아이템 수(2/3/4)
  const other = shuffle(CATEGORIES.filter((c) => c.key !== cat.key))[0] ?? cat;
  const buckets = [
    { type: "text" as const, text: cat.label },
    { type: "text" as const, text: other.label },
  ];
  const items = shuffle([
    ...pickN(cat.items, per).map((it) => ({ content: itemContent(it, useImages), bucket: 0 })),
    ...pickN(other.items, per).map((it) => ({ content: itemContent(it, useImages), bucket: 1 })),
  ]);
  const bSlots = bucketSlots(2);
  const iSlots = catItemSlots(items.length);
  return {
    meta: { id: `gen_cat_${cat.key}`, title: `${cat.label}·${other.label} 분류하기`, archetype: "categorize", createdFrom: "prompt" },
    settings: { difficulty: k.difficulty, length: 1, mood: k.mood },
    stage: { nodes: [...bSlots, ...iSlots] },
    interaction: {
      kind: "categorize",
      bucketSlotIds: bSlots.map((s) => s.id),
      itemSlotIds: iSlots.map((s) => s.id),
      rounds: [{ buckets, items }],
    },
    rewards: { confetti: "full" },
  };
}

/** 패턴 잇기 — 두 아이템으로 ABAB 수열, 다음 항(A)을 보기에서 고르기. */
function assemblePatternNext(cat: Category, useImages: boolean, k: Knobs): InteractiveDocInput {
  const optionCount = OPTION_COUNT[k.difficulty];
  const picks = pickN(cat.items, Math.max(3, optionCount));
  const [a, b] = picks;
  const sequence = [a, b, a, b].map((it) => itemContent(it, useImages));
  const wrongPool = [b, ...picks.slice(2)];
  const options = shuffle([
    { content: itemContent(a, useImages), correct: true },
    ...shuffle(wrongPool).slice(0, optionCount - 1).map((it) => ({ content: itemContent(it, useImages) })),
  ]);
  const qSlots = patternSeqSlots(4);
  const oSlots = optionSlots(optionCount);
  return {
    meta: { id: `gen_pattern_${cat.key}`, title: `${cat.label} 패턴 잇기`, archetype: "pattern-next", createdFrom: "prompt" },
    settings: { difficulty: k.difficulty, length: 1, mood: k.mood, optionCount },
    stage: { nodes: [...qSlots, ...oSlots] },
    interaction: {
      kind: "pattern-next",
      sequenceSlotIds: qSlots.map((s) => s.id),
      optionSlotIds: oSlots.map((s) => s.id),
      rounds: [{ sequence, options }],
    },
    rewards: { confetti: "full" },
  };
}

/** 순서 맞추기 — 순서형 콘텐츠(SEQUENCES)의 정답 순서를 steps로(런타임이 셔플). 카테고리 무관. */
const ORDER_STEPS = { baby: 3, toddler: 4, senior: 5 } as const;
function assembleOrderSequence(seq: Sequence, useImages: boolean, k: Knobs): InteractiveDocInput {
  const n = Math.min(ORDER_STEPS[k.difficulty], seq.items.length);
  const steps = seq.items.slice(0, n).map((it) => itemContent(it, useImages));
  const slots = orderRowSlots(n);
  return {
    meta: { id: `gen_order_${seq.key}`, title: `${seq.label} 순서 맞추기`, archetype: "order-sequence", createdFrom: "prompt" },
    settings: { difficulty: k.difficulty, length: 1, mood: k.mood },
    stage: { nodes: slots },
    interaction: { kind: "order-sequence", slotIds: slots.map((s) => s.id), rounds: [{ steps }] },
    rewards: { confetti: "full" },
  };
}

const ASSEMBLERS: Record<CategoryArchetype, (cat: Category, useImages: boolean, k: Knobs) => InteractiveDocInput> = {
  "tap-the-right-one": assembleTap,
  "match-pair": assembleMatch,
  "flip-memory": assembleFlip,
  "binary-choice": assembleBinary,
  "connect": assembleConnect,
  "categorize": assembleCategorize,
  "pattern-next": assemblePatternNext,
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
    { archetype: "binary-choice", title: `${cat.label} OX 퀴즈`, emoji: "⭕" },
    { archetype: "connect", title: `${cat.label} 관계 잇기`, emoji: "🧩" },
    { archetype: "categorize", title: `${cat.label} 분류 담기`, emoji: "🧺" },
    { archetype: "pattern-next", title: `${cat.label} 패턴 잇기`, emoji: "🔵" },
    { archetype: "order-sequence", title: `${intent.sequence?.label ?? "순서"} 순서 맞추기`, emoji: "🪜" },
  ];
  const ordered = intent.archetype
    ? [...base.filter((b) => b.archetype === intent.archetype), ...base.filter((b) => b.archetype !== intent.archetype)]
    : base;
  // 카드는 3장 유지(요청 아키타입이 1순위로 앞에 옴).
  return ordered.slice(0, 3).map((b) => ({
    ...b,
    build: () => ({
      title: b.title,
      input:
        b.archetype === "order-sequence"
          ? assembleOrderSequence(intent.sequence ?? SEQUENCES[0], useImages, knobs)
          : ASSEMBLERS[b.archetype](cat, useImages, knobs),
    }),
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
