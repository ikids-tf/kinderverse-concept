/**
 * useGame.ts — 런타임 플레이어 상태머신 (Zustand).
 * ------------------------------------------------------------------
 * 레퍼런스 프로토(player-prototype.html)의 `Player` 객체를 React/Zustand로 옮긴 것.
 * 게임 로직은 새로 발명하지 않는다 — 시퀀싱/판정은 레퍼런스를 그대로 따른다.
 *
 * 부수효과(TTS·confetti·dust)는 여기서 직접 일으키지 않고 sfx 이벤트로 흘려보낸다
 * (useGameEffects가 소비). 시각 반응(cue cheer, option shake/bounce)은 상태/nonce를
 * 컴포넌트가 보고 Motion으로 재생한다. → 스토어는 뷰/DOM에 직접 의존하지 않는다.
 *
 * zundo(undo/redo)는 직접 에디터(M1) 관심사라 런타임 스토어엔 적용하지 않는다(설치만).
 */
import { create } from "zustand";
import { temporal } from "zundo";
import {
  parseInteractiveDoc,
} from "../schema/parse";
import type { ContentBinding, InteractiveDoc, InteractiveDocInput } from "../schema/interactiveDoc";
import { FIXTURES, type ExampleKey } from "./fixtures";
import { answerEmoji } from "./content";
import { primeImages } from "./assetStore";
import { getBaseOverride, primeAssets } from "./savedGames";
import { emitActor } from "./riveBus";

export type Phase = "start" | "playing" | "extend" | "finished";
export type OptStatus = "idle" | "correct" | "wrong" | "picked" | "locked";
export type Side = "L" | "R";

export interface TapOption {
  slotId: string;
  content: ContentBinding;
  correct: boolean;
  status: OptStatus;
  /** 라운드 options 배열에서의 원래 인덱스(셔플 전) — 편집 시 셔플된 자리 대신 정본 슬롯을 찾는 데 쓴다. */
  optionIdx: number;
}
export interface MatchItem {
  slotId: string;
  content: ContentBinding;
  pairIdx: number;
  status: OptStatus;
}
export interface FlipCard {
  slotId: string;
  content: ContentBinding;
  faceKey: string; // 같은 faceKey끼리 짝
  status: "down" | "up" | "locked";
}
export interface OrderSlot {
  slotId: string;
  content: ContentBinding;
  orderIdx: number; // 정답 순서(0..n-1)
  status: "idle" | "locked" | "wrong";
}
export interface SeqItem {
  slotId: string;
  content: ContentBinding; // 정적 제시(패턴 잇기의 보여주는 수열)
}
export interface CatItem {
  slotId: string;
  content: ContentBinding;
  bucket: number; // 정답 버킷 index
  status: OptStatus; // idle/picked/locked/wrong
}
export interface CatBucket {
  slotId: string;
  content: ContentBinding;
  index: number;
  status: OptStatus; // idle/correct/wrong (판정 플래시)
}
export interface FindZone {
  zoneId: string;
  found: boolean;
  status: "idle" | "wrong";
}
export interface FindStep {
  cue: ContentBinding; // 무엇을 찾을지
  targetZoneId: string;
}
export interface SeqTapStep {
  slotId: string;
  content: ContentBinding;
  count: number; // 이 자리를 몇 번 눌러야 완료(보통 1)
  hits: number;
  done: boolean;
}
export interface CombineIng {
  slotId: string;
  content: ContentBinding;
  count: number; // 이 재료를 몇 번 넣어야 함(보통 1)
  hits: number;
  added: boolean;
}
export interface RevealView {
  coverId: string;
  hiddenId: string;
  hiddenContent: ContentBinding;
  active: boolean;
  motion: "pull-up" | "slide" | "fade";
  dust: boolean;
}
export interface Sfx {
  seq: number;
  kind: "say" | "confetti" | "dust";
  text?: string;
  originId?: string;
}

export interface GameStore {
  doc: InteractiveDoc | null;
  exampleKey: ExampleKey | null;
  /** 편집 중인 '내 놀이' id(있으면) — 저장 시 새로 만들지 않고 이 항목을 갱신한다. 기본 게임이면 null. */
  savedGameId: string | null;
  /** 새 게임 로드마다 +1 — 편집 undo 히스토리 초기화 신호(로드는 같은 id여도 새 세션). */
  loadSeq: number;
  phase: Phase;
  roundIdx: number;
  totalRounds: number;
  score: number;
  maxScore: number;
  busy: boolean;
  banner: { ok: boolean; text: string } | null;
  showNext: boolean;
  ttsEnabled: boolean;

  // 확장활동(extend) — 게임 클리어 후 끊김없이 이어지는 교사 진행 단계(레인 오른쪽)
  extendIdx: number;

  // tap-the-right-one
  cueSlotId: string | null;
  cueContent: ContentBinding | null;
  cueReactSeq: number;
  tapOptions: TapOption[];
  reveal: RevealView | null;

  // pattern-next — 정적 수열 제시(patternSeq) + 보기는 tapOptions/tap 재사용
  patternSeq: SeqItem[];

  // categorize — 아이템을 골라(catPick) 알맞은 버킷으로
  catItems: CatItem[];
  catBuckets: CatBucket[];
  catPick: string | null; // 현재 고른 아이템 slotId
  catDone: number;

  // find-it — 장면 속 zone을 cue 순서대로 찾기
  findZones: FindZone[];
  findList: FindStep[];
  findIdx: number; // 현재 찾는 차례

  // sequence-tap — 스텝을 순서대로 터치해 세기(액터 연출)
  seqSteps: SeqTapStep[];
  seqIdx: number; // 현재 눌러야 할 자리

  // combine — 재료를 모으면(A+B) 결과(C)가 나타남
  combIngredients: CombineIng[];
  combResult: { slotId: string; content: ContentBinding } | null;
  combRevealed: boolean;

  // match-pair · connect (동일 메커니즘)
  matchLeft: MatchItem[];
  matchRight: MatchItem[];
  matchPick: { side: Side; slotId: string; pairIdx: number } | null;
  matched: number;

  // binary-choice (O/X) — prompt는 cueSlotId/cueContent 재사용
  binaryAnswer: boolean | null;
  binaryStatus: { yes: OptStatus; no: OptStatus };

  // flip-memory
  flipCards: FlipCard[];
  flipPick: string | null; // 첫 번째로 뒤집은 카드 slotId
  flipMatched: number;

  // order-sequence
  orderSlots: OrderSlot[];
  orderNext: number; // 다음에 눌러야 할 정답 순서

  // effects bus
  sfx: Sfx | null;

  // 직접 에디터(M1, "고급" 뒤) — 레이아웃 편집(노드 transform)
  mode: "play" | "edit";
  selectedNodeId: string | null;
  bgSelected: boolean; // 편집 모드에서 '배경'을 선택했는지(프롬프트로 배경 생성 대상)
  /** 편집 중인 라운드(페이지) 인덱스 — 편집 미리보기·콘텐츠 수정 대상(play의 roundIdx와 별개). */
  editRoundIdx: number;
  /** 일반 화면 더블클릭 편집 → 편집 레이어가 이 노드의 글자 편집을 자동으로 연다(1회 소비). */
  autoEditNodeId: string | null;

  loadExample: (key: ExampleKey) => void;
  loadDoc: (input: InteractiveDocInput, key?: ExampleKey | null, savedId?: string | null) => void;
  start: () => void;
  tap: (slotId: string) => void;
  matchTap: (side: Side, slotId: string) => void;
  answerBinary: (value: boolean) => void;
  flipTap: (slotId: string) => void;
  orderTap: (slotId: string) => void;
  catTap: (slotId: string) => void;
  findTap: (zoneId: string) => void;
  seqTap: (slotId: string) => void;
  combTap: (slotId: string) => void;
  next: () => void;
  finish: () => void;
  enterExtend: (idx: number) => void;
  nextExtend: () => void;
  restart: () => void;
  /** 그만하기 — 게임을 멈추고 시작(인트로) 화면으로 되돌린다(점수·진행 초기화). */
  stop: () => void;
  toggleTts: () => void;
  setMode: (mode: "play" | "edit") => void;
  selectNode: (id: string | null) => void;
  selectBg: (v: boolean) => void;
  setBackgroundImage: (assetId: string | null) => void;
  /** 편집: 선택 노드(슬롯) 콘텐츠를 교체(프롬프트로 만든 그림/글자 적용). roundIdx 미지정 시 현재 편집 페이지.
   *  비동기 생성이 끝나는 시점엔 편집 페이지가 바뀌어 있을 수 있어, 호출부가 제출 시점 페이지를 넘긴다. */
  setNodeContent: (nodeId: string, content: ContentBinding, roundIdx?: number) => void;
  /** 편집: 보기 슬롯을 정답으로 지정(tap·pattern-next). 현재 편집 페이지에서 그 보기만 correct=true. */
  setCorrectOption: (nodeId: string) => void;
  patchNodeTransform: (id: string, patch: Partial<{ x: number; y: number; w: number; h: number }>) => void;
  /** 편집: 노드 style 병합(모서리 라운드·크롭 등). doc 교체라 undo 가능. */
  setNodeStyle: (id: string, patch: Partial<NonNullable<SceneNode["style"]>>) => void;
  /** 편집: 특정 페이지(라운드)의 크롭만 설정 — 같은 슬롯이라도 페이지마다 따로 조절. */
  setNodeCrop: (id: string, round: number, crop: { scale: number; x: number; y: number }) => void;
  /** 편집: 편집할 페이지(라운드) 선택(범위 클램프). */
  setEditRound: (idx: number) => void;
  /** 편집: 현재 페이지(라운드)를 복제해 다음에 새 페이지를 추가하고 그 페이지로 이동. */
  addRound: () => void;
  /** 편집: 현재 페이지(라운드) 삭제(최소 1개는 유지). */
  removeRound: () => void;
  /** 일반(플레이) 화면에서 노드를 더블클릭 → 편집 레이어로 들어가 그 노드(보던 페이지) 편집을 바로 연다. */
  editNodeInline: (nodeId: string) => void;
  /** 자동 편집 대상 설정/해제(편집 레이어가 소비 후 null). */
  setAutoEditNode: (id: string | null) => void;
}

/* ── 타이머 관리 (라운드 시퀀싱) ── */
let timers: ReturnType<typeof setTimeout>[] = [];
function later(fn: () => void, ms: number): void {
  timers.push(setTimeout(fn, ms));
}
function clearTimers(): void {
  timers.forEach(clearTimeout);
  timers = [];
}

/* ── 유틸 ── */
function shuffle<T>(a: readonly T[]): T[] {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}
function pick<T>(a: readonly T[]): T {
  return a[Math.floor(Math.random() * a.length)];
}
const PRAISE = ["딩동댕!", "맞았어요!", "최고예요!"] as const;

function maxScoreOf(doc: InteractiveDoc): number {
  const it = doc.interaction;
  if (it.kind === "match-pair") return it.rounds.reduce((s, r) => s + r.pairs.length, 0);
  if (it.kind === "connect") return it.rounds.reduce((s, r) => s + r.links.length, 0);
  if (it.kind === "flip-memory") return it.rounds.reduce((s, r) => s + r.faces.length, 0);
  if (it.kind === "order-sequence") return it.rounds.reduce((s, r) => s + r.steps.length, 0);
  if (it.kind === "categorize") return it.rounds.reduce((s, r) => s + r.items.length, 0);
  if (it.kind === "find-it") return it.rounds.reduce((s, r) => s + r.finds.length, 0);
  if (it.kind === "sequence-tap") return it.rounds.reduce((s, r) => s + r.steps.length, 0);
  return it.rounds.length; // tap-the-right-one · binary-choice · pattern-next · combine
}

/** 모든 인터랙션 변형은 rounds 배열을 가진다 — 라운드(페이지) 배열만 교체해 새 인터랙션을 만든다(kind 보존). */
function withRounds(
  it: InteractiveDoc["interaction"],
  fn: (rounds: unknown[]) => unknown[],
): InteractiveDoc["interaction"] {
  const src = (it as unknown as { rounds: readonly unknown[] }).rounds;
  return { ...(it as object), rounds: fn([...src]) } as InteractiveDoc["interaction"];
}
/** 라운드(페이지) 깊은 복제 — 라운드는 순수 데이터(콘텐츠 바인딩)라 JSON 복제로 충분·안전. */
function cloneRound(r: unknown): unknown {
  return JSON.parse(JSON.stringify(r));
}

/** 한 라운드의 뷰 상태 슬라이스를 결정론적으로 조립(셔플 제외). */
interface RoundView {
  cueSlotId: string | null;
  cueContent: ContentBinding | null;
  tapOptions: TapOption[];
  reveal: RevealView | null;
  matchLeft: MatchItem[];
  matchRight: MatchItem[];
  binaryAnswer: boolean | null;
  binaryStatus: { yes: OptStatus; no: OptStatus };
  flipCards: FlipCard[];
  orderSlots: OrderSlot[];
  patternSeq: SeqItem[];
  catItems: CatItem[];
  catBuckets: CatBucket[];
  findZones: FindZone[];
  findList: FindStep[];
  seqSteps: SeqTapStep[];
  combIngredients: CombineIng[];
  combResult: { slotId: string; content: ContentBinding } | null;
  question: string;
}
function emptyRound(): RoundView {
  return {
    cueSlotId: null,
    cueContent: null,
    tapOptions: [],
    reveal: null,
    matchLeft: [],
    matchRight: [],
    binaryAnswer: null,
    binaryStatus: { yes: "idle", no: "idle" },
    flipCards: [],
    orderSlots: [],
    patternSeq: [],
    catItems: [],
    catBuckets: [],
    findZones: [],
    findList: [],
    seqSteps: [],
    combIngredients: [],
    combResult: null,
    question: "",
  };
}

/** 좌(순서)·우(셔플)를 pairIdx로 잇는 공용 빌더 — match-pair·connect 공유. */
function buildPairs(
  leftSlotIds: string[],
  rightSlotIds: string[],
  pairs: { left: ContentBinding; right: ContentBinding }[],
): { matchLeft: MatchItem[]; matchRight: MatchItem[] } {
  const lefts = pairs.map((p, i) => ({ content: p.left, idx: i }));
  const rights = shuffle(pairs.map((p, i) => ({ content: p.right, idx: i })));
  const matchLeft: MatchItem[] = [];
  leftSlotIds.forEach((slotId, i) => {
    const l = lefts[i];
    if (l) matchLeft.push({ slotId, content: l.content, pairIdx: l.idx, status: "idle" });
  });
  const matchRight: MatchItem[] = [];
  rightSlotIds.forEach((slotId, i) => {
    const rr = rights[i];
    if (rr) matchRight.push({ slotId, content: rr.content, pairIdx: rr.idx, status: "idle" });
  });
  return { matchLeft, matchRight };
}

function buildRound(doc: InteractiveDoc, idx: number): RoundView {
  const it = doc.interaction;

  if (it.kind === "tap-the-right-one") {
    const round = it.rounds[idx];
    // 셔플하되 원래 인덱스(optionIdx)를 함께 옮겨, 편집 시 셔플된 자리가 아닌 정본 슬롯을 찾을 수 있게 한다.
    const shuffled = shuffle(round.options.map((o, oi) => ({ o, oi })));
    const tapOptions: TapOption[] = [];
    it.optionSlotIds.forEach((slotId, i) => {
      const e = shuffled[i];
      if (e) tapOptions.push({ slotId, content: e.o.content, correct: e.o.correct, status: "idle", optionIdx: e.oi });
    });

    const revealEff = doc.effects.find((e) => e.kind === "reveal");
    let reveal: RevealView | null = null;
    if (revealEff && revealEff.kind === "reveal") {
      const ans = round.options.find((o) => o.correct);
      const ansText = ans && ans.content.type === "text" ? ans.content.text : undefined;
      reveal = {
        coverId: revealEff.coverNodeId,
        hiddenId: revealEff.hiddenNodeId,
        hiddenContent: { type: "emoji", emoji: answerEmoji(ansText) },
        active: false,
        motion: revealEff.motion,
        dust: revealEff.dust,
      };
    }

    const question =
      doc.meta.archetype === "reveal-and-collect"
        ? "흙에 뭐가 심겼을까요?"
        : round.cue.type === "text"
          ? round.cue.text
          : "이건 누구일까요?";

    return { ...emptyRound(), cueSlotId: it.cueSlotId, cueContent: round.cue, tapOptions, reveal, question };
  }

  if (it.kind === "match-pair") {
    const { matchLeft, matchRight } = buildPairs(it.leftSlotIds, it.rightSlotIds, it.rounds[idx].pairs);
    return { ...emptyRound(), matchLeft, matchRight, question: "관련 있는 친구끼리 짝지어요" };
  }

  if (it.kind === "connect") {
    const { matchLeft, matchRight } = buildPairs(it.leftSlotIds, it.rightSlotIds, it.rounds[idx].links);
    return { ...emptyRound(), matchLeft, matchRight, question: "관계있는 친구끼리 이어요" };
  }

  if (it.kind === "binary-choice") {
    const round = it.rounds[idx];
    return {
      ...emptyRound(),
      cueSlotId: it.promptSlotId,
      cueContent: round.prompt,
      binaryAnswer: round.answer,
      question: round.prompt.type === "text" ? round.prompt.text : "맞을까요, 아닐까요?",
    };
  }

  if (it.kind === "flip-memory") {
    const round = it.rounds[idx];
    // 각 face를 2장씩 깐 뒤 셔플 → 카드 슬롯에 배치. faceKey로 짝 판정.
    const deck: { content: ContentBinding; faceKey: string }[] = [];
    round.faces.forEach((face, i) => {
      const faceKey = `f${i}`;
      deck.push({ content: face, faceKey }, { content: face, faceKey });
    });
    const shuffledDeck = shuffle(deck);
    const flipCards: FlipCard[] = [];
    it.cardSlotIds.forEach((slotId, i) => {
      const c = shuffledDeck[i];
      if (c) flipCards.push({ slotId, content: c.content, faceKey: c.faceKey, status: "down" });
    });
    return { ...emptyRound(), flipCards, question: "같은 카드를 찾아 뒤집어요" };
  }

  if (it.kind === "order-sequence") {
    const round = it.rounds[idx];
    // steps = 정답 순서. 슬롯엔 셔플 배치, orderIdx로 정답 순서 기억.
    const indexed = round.steps.map((content, orderIdx) => ({ content, orderIdx }));
    const shuffled = shuffle(indexed);
    const orderSlots: OrderSlot[] = [];
    it.slotIds.forEach((slotId, i) => {
      const e = shuffled[i];
      if (e) orderSlots.push({ slotId, content: e.content, orderIdx: e.orderIdx, status: "idle" });
    });
    return { ...emptyRound(), orderSlots, question: "순서대로 눌러볼까요?" };
  }

  if (it.kind === "pattern-next") {
    const round = it.rounds[idx];
    // 수열은 순서대로 정적 제시(셔플 안 함), 보기만 셔플 — 판정은 tap(=tap-the-right-one) 재사용.
    const patternSeq: SeqItem[] = [];
    it.sequenceSlotIds.forEach((slotId, i) => {
      const c = round.sequence[i];
      if (c) patternSeq.push({ slotId, content: c });
    });
    const shuffled = shuffle(round.options.map((o, oi) => ({ o, oi })));
    const tapOptions: TapOption[] = [];
    it.optionSlotIds.forEach((slotId, i) => {
      const e = shuffled[i];
      if (e) tapOptions.push({ slotId, content: e.o.content, correct: e.o.correct, status: "idle", optionIdx: e.oi });
    });
    return { ...emptyRound(), patternSeq, tapOptions, question: "다음에 올 친구는 무엇일까요?" };
  }

  if (it.kind === "categorize") {
    const round = it.rounds[idx];
    // 버킷은 주어진 순서 그대로(라벨 고정), 아이템만 셔플 배치.
    const catBuckets: CatBucket[] = [];
    it.bucketSlotIds.forEach((slotId, i) => {
      const c = round.buckets[i];
      if (c) catBuckets.push({ slotId, content: c, index: i, status: "idle" });
    });
    const shuffled = shuffle(round.items);
    const catItems: CatItem[] = [];
    it.itemSlotIds.forEach((slotId, i) => {
      const e = shuffled[i];
      if (e) catItems.push({ slotId, content: e.content, bucket: e.bucket, status: "idle" });
    });
    return { ...emptyRound(), catItems, catBuckets, question: "알맞은 곳에 담아볼까요?" };
  }

  if (it.kind === "find-it") {
    const round = it.rounds[idx];
    const findList: FindStep[] = round.finds.map((f) => ({ cue: f.cue, targetZoneId: f.targetZoneId }));
    // 장면의 모든 zone 노드를 탭 가능한 후보로(정답은 findList가 지정).
    const findZones: FindZone[] = doc.stage.nodes
      .filter((n) => n.type === "zone")
      .map((n) => ({ zoneId: n.id, found: false, status: "idle" as const }));
    const first = findList[0]?.cue;
    const what = first ? (first.type === "text" ? first.text : first.type === "emoji" ? first.emoji : "그것") : "그것";
    return { ...emptyRound(), findZones, findList, question: `${what}을(를) 찾아보세요` };
  }

  if (it.kind === "sequence-tap") {
    const round = it.rounds[idx];
    const slots = it.stepSlotIds ?? [];
    const seqSteps: SeqTapStep[] = [];
    slots.forEach((slotId, i) => {
      const stp = round.steps[i];
      if (stp) seqSteps.push({ slotId, content: stp.content, count: stp.count, hits: 0, done: false });
    });
    return { ...emptyRound(), seqSteps, question: "순서대로 콩콩 눌러볼까요?" };
  }

  if (it.kind === "combine") {
    const round = it.rounds[idx];
    const combIngredients: CombineIng[] = [];
    it.ingredientSlotIds.forEach((slotId, i) => {
      const ing = round.ingredients[i];
      if (ing) combIngredients.push({ slotId, content: ing.content, count: ing.count, hits: 0, added: false });
    });
    const combResult = { slotId: it.resultSlotId, content: round.result };
    return { ...emptyRound(), combIngredients, combResult, question: "재료를 모아 만들어볼까요?" };
  }

  // 미지원 인터랙션 — 빈 라운드.
  return emptyRound();
}

/** doc 로드 시 새로 세팅할 상태(loadExample/loadDoc 공용). */
function freshState(doc: InteractiveDoc, key: ExampleKey | null): Partial<GameStore> {
  return {
    doc,
    exampleKey: key,
    savedGameId: null,
    phase: "start",
    roundIdx: 0,
    totalRounds: doc.interaction.rounds.length,
    score: 0,
    maxScore: maxScoreOf(doc),
    busy: false,
    banner: null,
    showNext: false,
    ttsEnabled: doc.settings.tts.enabled,
    extendIdx: 0,
    cueSlotId: null,
    cueContent: null,
    cueReactSeq: 0,
    tapOptions: [],
    reveal: null,
    matchLeft: [],
    matchRight: [],
    matchPick: null,
    matched: 0,
    binaryAnswer: null,
    binaryStatus: { yes: "idle", no: "idle" },
    flipCards: [],
    flipPick: null,
    flipMatched: 0,
    orderSlots: [],
    orderNext: 0,
    patternSeq: [],
    catItems: [],
    catBuckets: [],
    catPick: null,
    catDone: 0,
    findZones: [],
    findList: [],
    findIdx: 0,
    seqSteps: [],
    seqIdx: 0,
    combIngredients: [],
    combResult: null,
    combRevealed: false,
    sfx: null,
    mode: "play",
    selectedNodeId: null,
    bgSelected: false,
    editRoundIdx: 0,
    autoEditNodeId: null,
  };
}

export const useGame = create<GameStore>()(temporal((set, get) => {
  const bump = (s: Omit<Sfx, "seq">) =>
    set((st) => ({ sfx: { seq: (st.sfx?.seq ?? 0) + 1, ...s } }));

  // responsive-state(PRD §9): 판정 결과를 Rive 액터로 흘려보낸다(선택 → 캐릭터 변형).
  const fireActor = (outcome: "correct" | "wrong") => {
    const eff = get().doc?.effects.find((e) => e.kind === "responsive-state");
    if (eff && eff.kind === "responsive-state") emitActor({ actorNodeId: eff.actorNodeId, outcome });
  };

  /** 라운드 진입 — 뷰 슬라이스 세팅 + 질문 읽어주기 예약. */
  const enterRound = (idx: number) => {
    const doc = get().doc;
    if (!doc) return;
    const rv = buildRound(doc, idx);
    set({
      roundIdx: idx,
      busy: false,
      banner: null,
      showNext: false,
      cueSlotId: rv.cueSlotId,
      cueContent: rv.cueContent,
      tapOptions: rv.tapOptions,
      reveal: rv.reveal,
      matchLeft: rv.matchLeft,
      matchRight: rv.matchRight,
      matchPick: null,
      matched: 0,
      binaryAnswer: rv.binaryAnswer,
      binaryStatus: rv.binaryStatus,
      flipCards: rv.flipCards,
      flipPick: null,
      flipMatched: 0,
      orderSlots: rv.orderSlots,
      orderNext: 0,
      patternSeq: rv.patternSeq,
      catItems: rv.catItems,
      catBuckets: rv.catBuckets,
      catPick: null,
      catDone: 0,
      findZones: rv.findZones,
      findList: rv.findList,
      findIdx: 0,
      seqSteps: rv.seqSteps,
      seqIdx: 0,
      combIngredients: rv.combIngredients,
      combResult: rv.combResult,
      combRevealed: false,
    });
    later(() => bump({ kind: "say", text: rv.question }), 350);
  };

  /** 정답 마무리(점수·환호·보상·배너·다음). reveal일 땐 약간 지연 후 호출. */
  const finishCorrect = () => {
    const st = get();
    set({ score: st.score + 1, cueReactSeq: st.cueReactSeq + 1 });
    set({ banner: { ok: true, text: pick(PRAISE) } });
    bump({ kind: "confetti", originId: st.cueSlotId ?? undefined });
    bump({ kind: "say", text: "딩동댕! 맞았어요" });
    afterCorrect();
  };

  const afterCorrect = () => {
    const st = get();
    const last = st.roundIdx >= st.totalRounds - 1;
    if (last) later(() => get().finish(), 1500);
    else set({ showNext: true });
  };

  return {
    doc: null,
    exampleKey: null,
    savedGameId: null,
    loadSeq: 0,
    phase: "start",
    roundIdx: 0,
    totalRounds: 0,
    score: 0,
    maxScore: 0,
    busy: false,
    banner: null,
    showNext: false,
    ttsEnabled: true,
    extendIdx: 0,
    cueSlotId: null,
    cueContent: null,
    cueReactSeq: 0,
    tapOptions: [],
    reveal: null,
    matchLeft: [],
    matchRight: [],
    matchPick: null,
    matched: 0,
    binaryAnswer: null,
    binaryStatus: { yes: "idle", no: "idle" },
    flipCards: [],
    flipPick: null,
    flipMatched: 0,
    orderSlots: [],
    orderNext: 0,
    patternSeq: [],
    catItems: [],
    catBuckets: [],
    catPick: null,
    catDone: 0,
    findZones: [],
    findList: [],
    findIdx: 0,
    seqSteps: [],
    seqIdx: 0,
    combIngredients: [],
    combResult: null,
    combRevealed: false,
    sfx: null,
    mode: "play",
    selectedNodeId: null,
    bgSelected: false,
    editRoundIdx: 0,
    autoEditNodeId: null,

    loadExample: (key) => {
      // 기본 게임 편집본(오버라이드)이 있으면 코드 기본값 대신 그걸 연다 — '기본이 바뀐' 상태로.
      const override = getBaseOverride(key);
      if (override) {
        primeAssets(override.assets);
        get().loadDoc(override.doc, key);
        return;
      }
      clearTimers();
      set((s) => ({ ...freshState(parseInteractiveDoc(FIXTURES[key].input), key), loadSeq: s.loadSeq + 1 }));
    },

    loadDoc: (input, key = null, savedId = null) => {
      clearTimers();
      const doc = parseInteractiveDoc(input);
      set((s) => ({ ...freshState(doc, key), savedGameId: savedId, loadSeq: s.loadSeq + 1 }));
      // 생성 이미지가 필요한 asset 콘텐츠가 있으면 비동기 시작(시드는 이미 이모지로 즉시 플레이).
      primeImages(doc);
    },

    start: () => {
      set({ phase: "playing" });
      enterRound(0);
    },

    tap: (slotId) => {
      const st = get();
      if (st.busy || st.phase !== "playing") return;
      const opt = st.tapOptions.find((o) => o.slotId === slotId);
      if (!opt || opt.status !== "idle") return;

      if (opt.correct) {
        set({
          busy: true,
          tapOptions: st.tapOptions.map((o) =>
            o.slotId === slotId ? { ...o, status: "correct" } : o,
          ),
        });
        fireActor("correct"); // 반응 캐릭터: 위로/행복 전이
        if (st.reveal) {
          // 흙에서 쑥 뽑히는 연출 → 약간의 텀을 두고 정답 마무리.
          set({ reveal: { ...st.reveal, active: true } });
          const rv = st.reveal;
          if (rv.dust) later(() => bump({ kind: "dust", originId: rv.coverId }), 240);
          const ans = st.tapOptions.find((o) => o.correct);
          const ansText = ans && ans.content.type === "text" ? ans.content.text : "";
          if (ansText) later(() => bump({ kind: "say", text: `${ansText}이에요!` }), 520);
          later(finishCorrect, 360);
        } else {
          finishCorrect();
        }
      } else {
        set({
          banner: { ok: false, text: "다시 해볼까요?" },
          tapOptions: st.tapOptions.map((o) =>
            o.slotId === slotId ? { ...o, status: "wrong" } : o,
          ),
        });
        fireActor("wrong"); // 반응 캐릭터: 갸웃(부드러운 격려)
        bump({ kind: "say", text: "다시 해볼까요?" });
        later(() => {
          set((s) => ({
            banner: null,
            tapOptions: s.tapOptions.map((o) =>
              o.slotId === slotId ? { ...o, status: "idle" } : o,
            ),
          }));
        }, 1100);
      }
    },

    matchTap: (side, slotId) => {
      const st = get();
      if (st.busy) return;
      const list = side === "L" ? st.matchLeft : st.matchRight;
      const item = list.find((m) => m.slotId === slotId);
      if (!item || item.status === "locked") return;

      const setStatus = (sd: Side, id: string, status: OptStatus) =>
        set((s) => {
          const key = sd === "L" ? "matchLeft" : "matchRight";
          return {
            [key]: (sd === "L" ? s.matchLeft : s.matchRight).map((m) =>
              m.slotId === id ? { ...m, status } : m,
            ),
          } as Partial<GameStore>;
        });

      // 첫 선택
      if (!st.matchPick) {
        set({ matchPick: { side, slotId, pairIdx: item.pairIdx } });
        setStatus(side, slotId, "picked");
        return;
      }
      // 같은 칸 다시 → 취소
      if (st.matchPick.side === side && st.matchPick.slotId === slotId) {
        set({ matchPick: null });
        setStatus(side, slotId, "idle");
        return;
      }

      const prev = st.matchPick;
      if (prev.pairIdx === item.pairIdx) {
        // 짝 성공 → 둘 다 잠금
        setStatus(prev.side, prev.slotId, "locked");
        setStatus(side, slotId, "locked");
        const matched = st.matched + 1;
        set({ matchPick: null, matched, score: st.score + 1 });
        const total = st.matchLeft.length;
        if (matched >= total) {
          set({ busy: true, banner: { ok: true, text: "다 맞혔어요!" } });
          bump({ kind: "confetti" });
          bump({ kind: "say", text: "딩동댕! 다 맞혔어요" });
          later(afterCorrect, 900);
        } else {
          bump({ kind: "say", text: "좋아요!" });
        }
      } else {
        // 짝 실패 → 둘 다 흔들고 리셋
        setStatus(prev.side, prev.slotId, "wrong");
        setStatus(side, slotId, "wrong");
        set({ matchPick: null, banner: { ok: false, text: "다시 해볼까요?" } });
        bump({ kind: "say", text: "다시 해볼까요?" });
        const a = prev, b = { side, slotId };
        later(() => {
          setStatus(a.side, a.slotId, "idle");
          setStatus(b.side, b.slotId, "idle");
          set({ banner: null });
        }, 900);
      }
    },

    answerBinary: (value) => {
      const st = get();
      if (st.busy || st.phase !== "playing" || st.binaryAnswer === null) return;
      const which = value ? "yes" : "no";
      if (value === st.binaryAnswer) {
        set({ busy: true, binaryStatus: { ...st.binaryStatus, [which]: "correct" } });
        finishCorrect(); // confetti는 cueSlotId(=promptSlotId) 원점
      } else {
        set({
          banner: { ok: false, text: "다시 해볼까요?" },
          binaryStatus: { ...st.binaryStatus, [which]: "wrong" },
        });
        bump({ kind: "say", text: "다시 해볼까요?" });
        later(() => {
          set((s) => ({ banner: null, binaryStatus: { ...s.binaryStatus, [which]: "idle" } }));
        }, 1100);
      }
    },

    flipTap: (slotId) => {
      const st = get();
      if (st.busy || st.phase !== "playing") return;
      const card = st.flipCards.find((c) => c.slotId === slotId);
      if (!card || card.status !== "down") return; // 이미 뒤집힘/잠금

      const setCard = (id: string, status: FlipCard["status"]) =>
        set((s) => ({ flipCards: s.flipCards.map((c) => (c.slotId === id ? { ...c, status } : c)) }));

      // 첫 번째 카드
      if (!st.flipPick) {
        setCard(slotId, "up");
        set({ flipPick: slotId });
        return;
      }

      // 두 번째 카드 — 비교
      const firstId = st.flipPick;
      const first = st.flipCards.find((c) => c.slotId === firstId);
      setCard(slotId, "up");
      set({ flipPick: null, busy: true }); // 판정 동안 입력 잠금

      if (first && first.faceKey === card.faceKey) {
        later(() => {
          setCard(firstId, "locked");
          setCard(slotId, "locked");
          const matched = get().flipMatched + 1;
          const total = get().flipCards.length / 2;
          set({ flipMatched: matched, score: get().score + 1 });
          if (matched >= total) {
            set({ banner: { ok: true, text: "다 맞혔어요!" } });
            bump({ kind: "confetti" });
            bump({ kind: "say", text: "딩동댕! 다 맞혔어요" });
            later(afterCorrect, 900);
          } else {
            set({ busy: false });
            bump({ kind: "say", text: "좋아요!" });
          }
        }, 380);
      } else {
        set({ banner: { ok: false, text: "다시 해볼까요?" } });
        bump({ kind: "say", text: "다시 해볼까요?" });
        later(() => {
          setCard(firstId, "down");
          setCard(slotId, "down");
          set({ busy: false, banner: null });
        }, 950);
      }
    },

    orderTap: (slotId) => {
      const st = get();
      if (st.busy || st.phase !== "playing") return;
      const slot = st.orderSlots.find((o) => o.slotId === slotId);
      if (!slot || slot.status === "locked") return;
      const setStatus = (id: string, status: OrderSlot["status"]) =>
        set((s) => ({ orderSlots: s.orderSlots.map((o) => (o.slotId === id ? { ...o, status } : o)) }));

      if (slot.orderIdx === st.orderNext) {
        // 정답 순서 → 잠금, 다음으로
        setStatus(slotId, "locked");
        const next = st.orderNext + 1;
        set({ orderNext: next, score: st.score + 1 });
        if (next >= st.orderSlots.length) {
          set({ busy: true, banner: { ok: true, text: "다 맞혔어요!" } });
          bump({ kind: "confetti" });
          bump({ kind: "say", text: "딩동댕! 순서를 맞혔어요" });
          later(afterCorrect, 900);
        } else {
          bump({ kind: "say", text: "좋아요!" });
        }
      } else {
        // 순서 틀림 → 흔들고 리셋(진행 유지)
        setStatus(slotId, "wrong");
        set({ banner: { ok: false, text: "다시 해볼까요?" } });
        bump({ kind: "say", text: "다시 해볼까요?" });
        later(() => {
          // 아직 'wrong'일 때만 되돌린다(그 사이 정답으로 잠겼으면 건드리지 않음).
          set((s) => ({
            orderSlots: s.orderSlots.map((o) => (o.slotId === slotId && o.status === "wrong" ? { ...o, status: "idle" } : o)),
            banner: s.banner && !s.banner.ok ? null : s.banner,
          }));
        }, 900);
      }
    },

    catTap: (slotId) => {
      const st = get();
      if (st.busy || st.phase !== "playing") return;

      // 1) 아이템 탭 → 고르기/취소(한 번에 하나만 picked)
      const item = st.catItems.find((i) => i.slotId === slotId);
      if (item) {
        if (item.status === "locked") return;
        if (st.catPick === slotId) {
          set((s) => ({ catPick: null, catItems: s.catItems.map((i) => (i.slotId === slotId ? { ...i, status: "idle" } : i)) }));
        } else {
          set((s) => ({
            catPick: slotId,
            catItems: s.catItems.map((i) =>
              i.slotId === slotId ? { ...i, status: "picked" } : i.status === "picked" ? { ...i, status: "idle" } : i,
            ),
          }));
        }
        return;
      }

      // 2) 버킷 탭 → 판정(아이템을 먼저 골라야 동작)
      const bucket = st.catBuckets.find((b) => b.slotId === slotId);
      if (!bucket || !st.catPick) return;
      const picked = st.catItems.find((i) => i.slotId === st.catPick);
      if (!picked) return;

      if (picked.bucket === bucket.index) {
        // 정답 → 아이템 잠금, 버킷 잠깐 초록
        const done = st.catDone + 1;
        set((s) => ({
          catItems: s.catItems.map((i) => (i.slotId === picked.slotId ? { ...i, status: "locked" } : i)),
          catBuckets: s.catBuckets.map((b) => (b.slotId === bucket.slotId ? { ...b, status: "correct" } : b)),
          catPick: null,
          catDone: done,
          score: s.score + 1,
        }));
        if (done >= st.catItems.length) {
          set({ busy: true, banner: { ok: true, text: "다 담았어요!" } });
          bump({ kind: "confetti" });
          bump({ kind: "say", text: "딩동댕! 다 분류했어요" });
          later(afterCorrect, 900);
        } else {
          bump({ kind: "say", text: "좋아요!" });
          later(() => set((s) => ({
            catBuckets: s.catBuckets.map((b) => (b.slotId === bucket.slotId && b.status === "correct" ? { ...b, status: "idle" } : b)),
          })), 600);
        }
      } else {
        // 오답 → 아이템·버킷 흔들고 리셋, 고르기 해제
        set((s) => ({
          banner: { ok: false, text: "다시 해볼까요?" },
          catItems: s.catItems.map((i) => (i.slotId === picked.slotId ? { ...i, status: "wrong" } : i)),
          catBuckets: s.catBuckets.map((b) => (b.slotId === bucket.slotId ? { ...b, status: "wrong" } : b)),
          catPick: null,
        }));
        bump({ kind: "say", text: "다시 해볼까요?" });
        later(() => {
          set((s) => ({
            banner: s.banner && !s.banner.ok ? null : s.banner,
            catItems: s.catItems.map((i) => (i.slotId === picked.slotId && i.status === "wrong" ? { ...i, status: "idle" } : i)),
            catBuckets: s.catBuckets.map((b) => (b.slotId === bucket.slotId && b.status === "wrong" ? { ...b, status: "idle" } : b)),
          }));
        }, 900);
      }
    },

    findTap: (zoneId) => {
      const st = get();
      if (st.busy || st.phase !== "playing") return;
      const zone = st.findZones.find((z) => z.zoneId === zoneId);
      if (!zone || zone.found) return;
      const target = st.findList[st.findIdx]?.targetZoneId;

      if (zoneId === target) {
        // 찾음 → 표시, 점수, 다음 cue
        set((s) => ({
          findZones: s.findZones.map((z) => (z.zoneId === zoneId ? { ...z, found: true, status: "idle" } : z)),
          score: s.score + 1,
        }));
        const nextIdx = st.findIdx + 1;
        if (nextIdx >= st.findList.length) {
          set({ busy: true, banner: { ok: true, text: "다 찾았어요!" } });
          bump({ kind: "confetti", originId: zoneId });
          bump({ kind: "say", text: "딩동댕! 다 찾았어요" });
          later(afterCorrect, 900);
        } else {
          const nx = st.findList[nextIdx].cue;
          const what = nx.type === "text" ? nx.text : nx.type === "emoji" ? nx.emoji : "그것";
          set({ findIdx: nextIdx });
          bump({ kind: "say", text: `찾았다! 이번엔 ${what}` });
        }
      } else {
        // 빗나감 → 흔들고 리셋
        set((s) => ({
          banner: { ok: false, text: "거기엔 없어요!" },
          findZones: s.findZones.map((z) => (z.zoneId === zoneId ? { ...z, status: "wrong" } : z)),
        }));
        bump({ kind: "say", text: "거기엔 없어요. 다시 찾아봐요" });
        later(() => {
          set((s) => ({
            banner: s.banner && !s.banner.ok ? null : s.banner,
            findZones: s.findZones.map((z) => (z.zoneId === zoneId && z.status === "wrong" ? { ...z, status: "idle" } : z)),
          }));
        }, 900);
      }
    },

    seqTap: (slotId) => {
      const st = get();
      if (st.busy || st.phase !== "playing") return;
      const cur = st.seqSteps[st.seqIdx];
      if (!cur || cur.slotId !== slotId || cur.done) return; // 현재 차례만 반응(순서대로)

      // 액터(개구리 등) 점프 연출 — 매 탭마다.
      const doc = st.doc;
      const actorId = doc && doc.interaction.kind === "sequence-tap" ? doc.interaction.actorNodeId : undefined;
      if (actorId) emitActor({ actorNodeId: actorId, outcome: "correct" });

      const hits = cur.hits + 1;
      const idx = st.seqIdx;
      if (hits < cur.count) {
        // 같은 자리 더 눌러야 함 — 카운트만 올림.
        set((s) => ({ seqSteps: s.seqSteps.map((x, i) => (i === idx ? { ...x, hits } : x)) }));
        bump({ kind: "say", text: String(hits) });
        return;
      }
      // 이 자리 완료 → 다음으로
      set((s) => ({
        seqSteps: s.seqSteps.map((x, i) => (i === idx ? { ...x, hits, done: true } : x)),
        seqIdx: idx + 1,
        score: s.score + 1,
      }));
      if (idx + 1 >= st.seqSteps.length) {
        set({ busy: true, banner: { ok: true, text: "다 했어요!" } });
        bump({ kind: "confetti", originId: slotId });
        bump({ kind: "say", text: "딩동댕! 다 셌어요" });
        later(afterCorrect, 900);
      } else {
        bump({ kind: "say", text: String(idx + 2) });
      }
    },

    combTap: (slotId) => {
      const st = get();
      if (st.busy || st.phase !== "playing") return;
      const ing = st.combIngredients.find((g) => g.slotId === slotId);
      if (!ing || ing.added) return;

      const hits = ing.hits + 1;
      if (hits < ing.count) {
        // 같은 재료 더 넣어야 함.
        set((s) => ({ combIngredients: s.combIngredients.map((g) => (g.slotId === slotId ? { ...g, hits } : g)) }));
        bump({ kind: "say", text: String(hits) });
        return;
      }
      // 이 재료 다 넣음
      const next = st.combIngredients.map((g) => (g.slotId === slotId ? { ...g, hits, added: true } : g));
      set({ combIngredients: next });
      if (next.every((g) => g.added)) {
        // 전부 모임 → 결과 등장(변신)
        set({ busy: true, combRevealed: true, banner: { ok: true, text: "짠! 만들어졌어요" }, score: st.score + 1 });
        bump({ kind: "confetti", originId: st.combResult?.slotId });
        bump({ kind: "say", text: "딩동댕! 만들어졌어요" });
        later(afterCorrect, 1100);
      } else {
        bump({ kind: "say", text: "좋아요!" });
      }
    },

    next: () => {
      enterRound(get().roundIdx + 1);
    },

    finish: () => {
      // 마지막 라운드를 마치면 완료 화면을 띄운다(다시하기·그만하기·확장활동 선택).
      // 확장활동은 자동으로 넘기지 않고 '확장 활동' 버튼을 눌러 들어간다(enterExtend).
      set({ busy: false, showNext: false, banner: null, phase: "finished" });
      bump({ kind: "say", text: "참 잘했어요!" });
    },

    enterExtend: (idx) => {
      const doc = get().doc;
      if (!doc || idx < 0 || idx >= doc.extend.length) {
        set({ phase: "finished", busy: false });
        return;
      }
      set({ phase: "extend", extendIdx: idx, busy: false, banner: null });
      // 진입 시 첫 질문을 읽어준다(교사 진행형 — 화면은 카드, 음성은 TTS).
      const act = doc.extend[idx];
      const line = act.prompts[0];
      if (act.tts !== false && line) later(() => bump({ kind: "say", text: line }), 450);
    },

    nextExtend: () => {
      const { doc, extendIdx } = get();
      if (!doc) return;
      if (extendIdx + 1 >= doc.extend.length) {
        set({ phase: "finished" });
        bump({ kind: "say", text: "참 잘했어요!" });
      } else {
        get().enterExtend(extendIdx + 1);
      }
    },

    restart: () => {
      const key = get().exampleKey;
      if (key) { get().loadExample(key); return; }
      // 생성/편집 게임(예제 키 없음) — 점수·진행 초기화 후 처음부터 다시 재생.
      clearTimers();
      set({ phase: "playing", roundIdx: 0, score: 0, banner: null, showNext: false });
      enterRound(0);
    },

    // 그만하기 — 게임을 멈추고 시작(인트로) 화면으로. 점수·진행 초기화(다시 ▶ 시작 가능).
    stop: () => {
      clearTimers();
      set({ phase: "start", roundIdx: 0, score: 0, banner: null, showNext: false });
    },

    toggleTts: () => {
      const next = !get().ttsEnabled;
      set({ ttsEnabled: next });
    },

    setMode: (mode) => {
      clearTimers();
      const doc = get().doc;
      // 편집↔플레이 전환 시 진행 상태를 초기화하고 시작 오버레이로(편집된 doc 그대로 사용).
      set({
        mode,
        phase: "start",
        extendIdx: 0,
        busy: false,
        banner: null,
        showNext: false,
        selectedNodeId: null,
        bgSelected: false,
        editRoundIdx: 0,
        autoEditNodeId: null,
        roundIdx: 0,
        totalRounds: doc ? doc.interaction.rounds.length : 0,
        score: 0,
        maxScore: doc ? maxScoreOf(doc) : 0,
        cueSlotId: null,
        cueContent: null,
        tapOptions: [],
        reveal: null,
        matchLeft: [],
        matchRight: [],
        matchPick: null,
        matched: 0,
        binaryAnswer: null,
        binaryStatus: { yes: "idle", no: "idle" },
        flipCards: [],
        flipPick: null,
        flipMatched: 0,
        orderSlots: [],
        orderNext: 0,
        patternSeq: [],
        catItems: [],
        catBuckets: [],
        catPick: null,
        catDone: 0,
        findZones: [],
        findList: [],
        findIdx: 0,
        seqSteps: [],
        seqIdx: 0,
        combIngredients: [],
        combResult: null,
        combRevealed: false,
      });
    },

    selectNode: (id) => set({ selectedNodeId: id, bgSelected: id ? false : get().bgSelected }),

    selectBg: (v) => set({ bgSelected: v, selectedNodeId: v ? null : get().selectedNodeId }),

    // 배경 이미지 적용 — stage.background를 asset(assetId) 바인딩으로(URL은 assetStore가 보유).
    // assetId=null이면 배경 제거(파스텔 기본으로). doc 교체라 undo 가능.
    setBackgroundImage: (assetId) => {
      const doc = get().doc;
      if (!doc) return;
      const background = assetId
        ? ({
            type: "asset" as const,
            asset: { assetId, kind: "generated" as const, variant: "full" as const, cutout: "none" as const, styleLock: false },
          })
        : undefined;
      set({ doc: { ...doc, stage: { ...doc.stage, background } } });
    },

    // 선택 노드(슬롯)의 현재 편집 페이지(editRoundIdx) 콘텐츠를 교체 — 프롬프트로 만든 그림/글자를 적용.
    // 편집 미리보기에 보이는 페이지(EditLayer.roundBindings와 동일 매핑). doc 교체라 undo 가능.
    setNodeContent: (nodeId, content, roundIdx) => {
      const doc = get().doc;
      if (!doc) return;
      const it = doc.interaction;
      const ri = roundIdx ?? get().editRoundIdx;
      const rAt = <T,>(rounds: readonly T[], mut: (r: T) => T): T[] => rounds.map((r, i) => (i === ri ? mut(r) : r));
      let changed = false;
      let interaction = it;
      if (it.kind === "tap-the-right-one") {
        const oi = it.optionSlotIds.indexOf(nodeId);
        if (nodeId === it.cueSlotId) { changed = true; interaction = { ...it, rounds: rAt(it.rounds, (r) => ({ ...r, cue: content })) }; }
        else if (oi >= 0) { changed = true; interaction = { ...it, rounds: rAt(it.rounds, (r) => (r.options[oi] ? { ...r, options: r.options.map((o, j) => (j === oi ? { ...o, content } : o)) } : r)) }; }
      } else if (it.kind === "binary-choice") {
        if (nodeId === it.promptSlotId) { changed = true; interaction = { ...it, rounds: rAt(it.rounds, (r) => ({ ...r, prompt: content })) }; }
      } else if (it.kind === "match-pair") {
        const li = it.leftSlotIds.indexOf(nodeId), ri = it.rightSlotIds.indexOf(nodeId);
        if (li >= 0 || ri >= 0) { changed = true; interaction = { ...it, rounds: rAt(it.rounds, (r) => ({ ...r, pairs: r.pairs.map((p, j) => (li >= 0 && j === li ? { ...p, left: content } : ri >= 0 && j === ri ? { ...p, right: content } : p)) })) }; }
      } else if (it.kind === "connect") {
        const li = it.leftSlotIds.indexOf(nodeId), ri = it.rightSlotIds.indexOf(nodeId);
        if (li >= 0 || ri >= 0) { changed = true; interaction = { ...it, rounds: rAt(it.rounds, (r) => ({ ...r, links: r.links.map((p, j) => (li >= 0 && j === li ? { ...p, left: content } : ri >= 0 && j === ri ? { ...p, right: content } : p)) })) }; }
      } else if (it.kind === "flip-memory") {
        const ci = it.cardSlotIds.indexOf(nodeId);
        if (ci >= 0) { changed = true; interaction = { ...it, rounds: rAt(it.rounds, (r) => ({ ...r, faces: r.faces.map((f, j) => (j === ci % r.faces.length ? content : f)) })) }; }
      }
      if (!changed) return;
      set({ doc: { ...doc, interaction } });
    },

    setCorrectOption: (nodeId) => {
      const doc = get().doc;
      if (!doc) return;
      const it = doc.interaction;
      if (it.kind !== "tap-the-right-one" && it.kind !== "pattern-next") return;
      const oi = it.optionSlotIds.indexOf(nodeId);
      if (oi < 0) return;
      const ri = get().editRoundIdx;
      const rAt = <T,>(rounds: readonly T[], mut: (r: T) => T): T[] => rounds.map((r, i) => (i === ri ? mut(r) : r));
      const interaction = {
        ...it,
        rounds: rAt(it.rounds, (r) => ({ ...r, options: r.options.map((o, j) => ({ ...o, correct: j === oi })) })),
      };
      set({ doc: { ...doc, interaction } });
    },

    patchNodeTransform: (id, patch) => {
      const doc = get().doc;
      if (!doc) return;
      const c01 = (v: number) => Math.max(0, Math.min(1, v));
      const cwh = (v: number) => Math.max(0.05, Math.min(1, v));
      const nodes = doc.stage.nodes.map((n) => {
        if (n.id !== id) return n;
        const tr = { ...n.transform };
        if (patch.x !== undefined) tr.x = c01(patch.x);
        if (patch.y !== undefined) tr.y = c01(patch.y);
        if (patch.w !== undefined) tr.w = cwh(patch.w);
        if (patch.h !== undefined) tr.h = cwh(patch.h);
        return { ...n, transform: tr };
      });
      set({ doc: { ...doc, stage: { ...doc.stage, nodes } } });
    },

    setNodeStyle: (id, patch) => {
      const doc = get().doc;
      if (!doc) return;
      const nodes = doc.stage.nodes.map((n) =>
        n.id === id ? { ...n, style: { ...(n.style ?? {}), ...patch } } : n,
      );
      set({ doc: { ...doc, stage: { ...doc.stage, nodes } } });
    },

    setNodeCrop: (id, round, crop) => {
      const doc = get().doc;
      if (!doc) return;
      const key = String(round);
      const nodes = doc.stage.nodes.map((n) => {
        if (n.id !== id) return n;
        const style = { ...(n.style ?? {}) };
        style.cropByRound = { ...(style.cropByRound ?? {}), [key]: crop };
        return { ...n, style };
      });
      set({ doc: { ...doc, stage: { ...doc.stage, nodes } } });
    },

    setEditRound: (idx) => {
      const doc = get().doc;
      const n = doc ? doc.interaction.rounds.length : 0;
      if (!n) return;
      set({
        editRoundIdx: Math.max(0, Math.min(n - 1, Math.floor(idx))),
        selectedNodeId: null,
        bgSelected: false,
      });
    },

    // 현재 페이지(라운드)를 복제해 '맨 끝'에 추가하고 그 페이지로 이동 — "다른 동물 한 장 더"의 시작점.
    // ⚠️ 끝에 붙인다(중간 삽입 ❌). 크롭은 라운드 '인덱스'로 저장(style.cropByRound)되므로, 중간에
    //    끼워 넣으면 뒤 페이지들의 인덱스가 밀려 다른 페이지의 크기/위치가 어긋난다. 끝 추가는 기존
    //    인덱스를 그대로 보존한다. 복제라 어떤 인터랙션 종류든 스키마상 유효한 라운드가 보장된다.
    addRound: () => {
      const doc = get().doc;
      if (!doc) return;
      const idx = get().editRoundIdx;
      const rounds = doc.interaction.rounds;
      const src = rounds[idx] ?? rounds[rounds.length - 1];
      const interaction = withRounds(doc.interaction, (rs) => {
        rs.push(cloneRound(src));
        return rs;
      });
      const newDoc = { ...doc, interaction };
      set({
        doc: newDoc,
        editRoundIdx: interaction.rounds.length - 1, // 맨 끝(새로 추가된) 페이지로 이동
        totalRounds: interaction.rounds.length,
        maxScore: maxScoreOf(newDoc),
        selectedNodeId: null,
        bgSelected: false,
      });
    },

    removeRound: () => {
      const doc = get().doc;
      if (!doc) return;
      const rounds = doc.interaction.rounds;
      if (rounds.length <= 1) return; // 최소 1개 유지(스키마 rounds.min(1))
      const idx = get().editRoundIdx;
      const interaction = withRounds(doc.interaction, (rs) => {
        rs.splice(idx, 1);
        return rs;
      });
      // 삭제로 idx 이후 라운드 인덱스가 1씩 당겨짐 → 노드별 cropByRound 키도 재정렬(크롭이 다른 페이지로 어긋나지 않게).
      const nodes = doc.stage.nodes.map((n) => {
        const cbr = n.style?.cropByRound;
        if (!cbr) return n;
        const next: Record<string, { scale: number; x: number; y: number }> = {};
        for (const k of Object.keys(cbr)) {
          const i = Number(k);
          if (i === idx) continue;                       // 삭제된 페이지의 크롭 제거
          next[i > idx ? String(i - 1) : k] = cbr[k];    // 뒤 페이지는 한 칸 당김
        }
        return { ...n, style: { ...(n.style ?? {}), cropByRound: next } };
      });
      const newDoc = { ...doc, interaction, stage: { ...doc.stage, nodes } };
      set({
        doc: newDoc,
        editRoundIdx: Math.min(idx, interaction.rounds.length - 1),
        totalRounds: interaction.rounds.length,
        maxScore: maxScoreOf(newDoc),
        selectedNodeId: null,
        bgSelected: false,
      });
    },

    // 일반(플레이) 화면에서 문제·보기를 더블클릭 → 편집 레이어로 들어가 그 노드의 글자 편집을 바로 연다.
    // '보던 페이지'(roundIdx)를 그대로 편집하도록 editRoundIdx에 옮겨 담는다(setMode가 0으로 리셋하므로 뒤에 설정).
    editNodeInline: (nodeId) => {
      const st = get();
      if (!st.doc) return;
      const round = Math.max(0, Math.min(st.roundIdx, st.doc.interaction.rounds.length - 1));
      st.setMode("edit");
      set({ editRoundIdx: round, selectedNodeId: nodeId, autoEditNodeId: nodeId });
    },

    setAutoEditNode: (id) => set({ autoEditNodeId: id }),
  };
}, {
  // 에디터 undo/redo — doc(노드 transform)만 추적, doc 객체가 바뀔 때만 기록(equality).
  // 드래그는 커밋-온-릴리스라 1드래그=1기록(EditLayer가 release 때만 patchNodeTransform).
  // 게임/모드 전환 시 GameStage가 clear()로 세션 단위 리셋.
  partialize: (s) => ({ doc: s.doc }),
  equality: (a, b) => a.doc === b.doc,
  limit: 100,
}));
