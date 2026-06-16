/**
 * buildSpecFromForm.ts — 폼 선택값 → GameSpec 결정적 조립. **LLM 호출 없음.**
 * ------------------------------------------------------------------
 * - 아이템: contentSets 에서 카테고리/관계로 픽 → OpenMoji 에셋.
 * - counting 보기: 정답 ±delta 산술 생성 → 셔플.
 * - seed 를 주면 재현 가능(테스트/캐시 키). 없으면 Math.random.
 * - 반환 전 assertSpecIntegrity 로 무결성 확인 (zod 검증은 gameSpec.zod 생성 후 추가).
 *
 * M1: counting, silhouette, matching 완전 구현. emotion 은 구조만(Rive ref placeholder, M2 배선).
 */
import {
  assertSpecIntegrity,
  type AgeRange,
  type CountingGame,
  type CountingRound,
  type Emotion,
  type EmotionGame,
  type EmotionRound,
  type GameAsset,
  type GameSpec,
  type MatchingGame,
  type MatchingRound,
  type OpenmojiAsset,
  type Rewards,
  type SilhouetteGame,
  type SilhouetteRound,
  type TemplateId,
} from "../schema/gameSpec";
import {
  CONTENT_SETS,
  RELATION_SETS,
  type CategoryId,
  type ContentItem,
  type RelationId,
} from "./contentSets";
import { AGE_DEFAULTS, type FieldValue } from "./templateForms";

/* ───────────────────────── 입력 ───────────────────────── */

export interface FormSelection {
  templateId: TemplateId;
  /** 필드 id → 값 (UI 제공). 누락 시 연령/폼 기본값으로 폴백 */
  values: Record<string, FieldValue>;
  /** 폼 하단 자유 프롬프트 (M1 미사용, M2에서 LLM 미세조정 경로로) */
  optionalPrompt?: string;
  /** 재현용 시드 (선택) */
  seed?: number;
}

/* ───────────────────────── RNG / 유틸 ───────────────────────── */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rngFrom = (seed?: number) => (seed == null ? Math.random : mulberry32(seed));

const randInt = (min: number, max: number, rng: () => number) =>
  Math.floor(rng() * (max - min + 1)) + min;

function shuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const pick = <T>(arr: readonly T[], rng: () => number): T => arr[Math.floor(rng() * arr.length)];
const sampleN = <T>(arr: readonly T[], n: number, rng: () => number): T[] =>
  shuffle(arr, rng).slice(0, Math.min(n, arr.length));

const num = (v: FieldValue | undefined, d: number) => (v == null ? d : Number(v));
const str = <T extends string>(v: FieldValue | undefined, d: T) => ((v ?? d) as T);
const bool = (v: FieldValue | undefined, d: boolean) => (v == null ? d : Boolean(v));

/** counting 보기 숫자 생성: 정답 포함, 1 이상, k개, 셔플 */
function makeCountOptions(count: number, k: number, rng: () => number): number[] {
  const set = new Set<number>([count]);
  let delta = 1;
  while (set.size < k && delta < 50) {
    for (const c of [count - delta, count + delta]) {
      if (c >= 1 && set.size < k) set.add(c);
    }
    delta++;
  }
  return shuffle([...set], rng);
}

const omAsset = (item: ContentItem, idPrefix = ""): OpenmojiAsset => ({
  id: idPrefix + item.ref,
  source: "openmoji",
  ref: item.ref,
  label: item.label,
  alt: item.label,
});

const PRAISES = ["잘했어요!", "정말 멋져요!", "최고예요!", "딩동댕, 맞았어요!"];
const defaultRewards = (rng: () => number): Rewards => ({
  effects: ["confetti", "stars"],
  voicePraise: pick(PRAISES, rng),
});

function dedupeAssets(assets: OpenmojiAsset[]): OpenmojiAsset[] {
  const m = new Map<string, OpenmojiAsset>();
  for (const a of assets) if (!m.has(a.id)) m.set(a.id, a);
  return [...m.values()];
}

/* ───────────────────────── 이미지 기반 빌더 (나만의 게임 만들기) ───────────────────────── */

/** 교사가 고른 재료 — 추천(OpenMoji ref) 또는 업로드(이미지 URL/dataURL). */
export interface PickedImage {
  kind: "openmoji" | "upload";
  /** kind=openmoji 일 때 OpenMoji hexcode. */
  ref?: string;
  /** kind=upload 일 때 이미지 URL(dataURL 등). */
  url?: string;
  label: string;
}

/** 고른 이미지들로 '세기' 게임을 만든다. 각 이미지가 한 라운드(그 그림을 몇 개인지 세기).
   업로드 이미지는 teacher 에셋(가공 전 원본 — 배경제거 등 정규화는 M3), 추천은 openmoji 에셋. */
export function buildCountingFromImages(
  images: PickedImage[],
  values: Record<string, FieldValue>,
): CountingGame {
  const rng = Math.random;
  const age = str<AgeRange>(values.ageRange, "3-5");
  const ad = AGE_DEFAULTS[age];
  const minCount = age === "3-5" ? 1 : 2;
  const maxCount = Math.max(2, ad.maxCount);

  const assets: GameAsset[] = [];
  const rounds: CountingRound[] = [];
  images.forEach((im, i) => {
    const id = `pick-${i}`;
    if (im.kind === "openmoji" && im.ref) {
      assets.push({ id, source: "openmoji", ref: im.ref, label: im.label, alt: im.label });
    } else if (im.kind === "upload" && im.url) {
      assets.push({ id, source: "teacher", uploadId: id, processedUrl: im.url, status: "ready", label: im.label, alt: im.label });
    } else {
      return;
    }
    const count = randInt(minCount, maxCount, rng);
    rounds.push({ itemAssetId: id, count, options: makeCountOptions(count, ad.optionCount, rng), scatter: "random" });
  });

  return {
    schemaVersion: 1,
    id: `counting-mine-${Date.now()}`,
    templateId: "counting",
    title: "내가 고른 그림 세기",
    instruction: { text: "그림이 몇 개인지 세어 볼까요?" },
    ageRange: age,
    theme: "animal",
    ttsLocale: "ko-KR",
    assets,
    rounds,
    rewards: defaultRewards(rng),
  };
}

/** 고른 그림으로 '그림자 맞추기' 게임. 업로드(배경제거 누끼 권장)는 teacher 에셋의 silhouetteUrl로
   CSS 마스크 실루엣, 추천은 openmoji. 각 그림이 정답인 라운드 + 나머지에서 보기 샘플. (≥2장 권장) */
export function buildSilhouetteFromImages(
  images: PickedImage[],
  values: Record<string, FieldValue>,
): SilhouetteGame {
  const rng = Math.random;
  const age = str<AgeRange>(values.ageRange, "3-5");
  const ad = AGE_DEFAULTS[age];
  const valid = images.filter((im) => (im.kind === "openmoji" && im.ref) || (im.kind === "upload" && im.url));
  const optionCount = Math.min(num(values.optionCount, ad.optionCount), Math.max(2, valid.length));

  const assets: GameAsset[] = valid.map((im, i) => {
    const id = `sil-${i}`;
    if (im.kind === "openmoji" && im.ref) {
      return { id, source: "openmoji", ref: im.ref, label: im.label, alt: im.label };
    }
    return { id, source: "teacher", uploadId: id, processedUrl: im.url, silhouetteUrl: im.url, status: "ready", label: im.label, alt: im.label };
  });
  const ids = assets.map((a) => a.id);

  const rounds: SilhouetteRound[] = ids.map((answerId) => {
    const distractors = sampleN(ids.filter((x) => x !== answerId), optionCount - 1, rng);
    return { answerAssetId: answerId, optionAssetIds: shuffle([answerId, ...distractors], rng) };
  });

  return {
    schemaVersion: 1,
    id: `silhouette-mine-${Date.now()}`,
    templateId: "silhouette",
    title: "내가 고른 그림자 맞추기",
    instruction: { text: "그림자를 보고 무엇인지 맞춰 볼까요?" },
    ageRange: age,
    theme: "animal",
    ttsLocale: "ko-KR",
    assets,
    rounds,
    rewards: defaultRewards(rng),
  };
}

/* ───────────────────────── 템플릿별 빌더 ───────────────────────── */

function buildCounting(values: Record<string, FieldValue>, rng: () => number): CountingGame {
  const age = str<AgeRange>(values.ageRange, "3-5");
  const ad = AGE_DEFAULTS[age];
  const category = str<CategoryId>(values.category, "animal");
  const maxCount = Math.max(2, num(values.maxCount, ad.maxCount));
  const roundCount = num(values.rounds, ad.rounds);
  const optionCount = ad.optionCount; // counting 보기 수는 연령에서 도출
  const minCount = age === "3-5" ? 1 : 2;

  const cat = CONTENT_SETS[category];
  const rounds: CountingRound[] = [];
  const assets: OpenmojiAsset[] = [];

  for (let i = 0; i < roundCount; i++) {
    const item = pick(cat.items, rng);
    const count = randInt(minCount, maxCount, rng);
    rounds.push({
      itemAssetId: item.ref,
      count,
      options: makeCountOptions(count, optionCount, rng),
      scatter: "random",
    });
    assets.push(omAsset(item));
  }

  return {
    schemaVersion: 1,
    id: `counting-${category}-${Date.now()}`,
    templateId: "counting",
    title: `${cat.label} 세기 놀이`,
    instruction: { text: "그림이 몇 개인지 세어 볼까요?" },
    ageRange: age,
    theme: category,
    ttsLocale: "ko-KR",
    assets: dedupeAssets(assets),
    rounds,
    rewards: defaultRewards(rng),
  };
}

function buildSilhouette(values: Record<string, FieldValue>, rng: () => number): SilhouetteGame {
  const age = str<AgeRange>(values.ageRange, "3-5");
  const ad = AGE_DEFAULTS[age];
  let category = str<CategoryId>(values.category, "animal");
  if (!CONTENT_SETS[category].goodForSilhouette) category = "animal";
  const roundCount = num(values.rounds, ad.rounds);
  const optionCount = num(values.optionCount, ad.optionCount);

  const items = CONTENT_SETS[category].items;
  const rounds: SilhouetteRound[] = [];
  const assets: OpenmojiAsset[] = [];

  for (let i = 0; i < roundCount; i++) {
    const answer = pick(items, rng);
    const distractors = sampleN(
      items.filter((it) => it.ref !== answer.ref),
      optionCount - 1,
      rng,
    );
    const options = shuffle([answer, ...distractors], rng);
    rounds.push({
      answerAssetId: answer.ref,
      optionAssetIds: options.map((o) => o.ref),
    });
    assets.push(...options.map((o) => omAsset(o)));
  }

  return {
    schemaVersion: 1,
    id: `silhouette-${category}-${Date.now()}`,
    templateId: "silhouette",
    title: `${CONTENT_SETS[category].label} 그림자 맞추기`,
    instruction: { text: "그림자를 보고 무엇인지 맞춰 볼까요?" },
    ageRange: age,
    theme: category,
    ttsLocale: "ko-KR",
    assets: dedupeAssets(assets),
    rounds,
    rewards: defaultRewards(rng),
  };
}

function buildMatching(values: Record<string, FieldValue>, rng: () => number): MatchingGame {
  const age = str<AgeRange>(values.ageRange, "3-5");
  const ad = AGE_DEFAULTS[age];
  const relation = str<RelationId>(values.relation, "animal-food");
  const roundCount = num(values.rounds, ad.rounds);
  const pairCount = num(values.pairCount, ad.pairCount);

  const rel = RELATION_SETS[relation];
  const rounds: MatchingRound[] = [];
  const assets: OpenmojiAsset[] = [];

  for (let i = 0; i < roundCount; i++) {
    const chosen = sampleN(rel.pairs, pairCount, rng);
    rounds.push({
      relation: rel.label,
      pairs: chosen.map((p) => ({
        leftAssetId: "L_" + p.left.ref,
        rightAssetId: "R_" + p.right.ref,
      })),
    });
    for (const p of chosen) {
      assets.push(omAsset(p.left, "L_"));
      assets.push(omAsset(p.right, "R_"));
    }
  }

  return {
    schemaVersion: 1,
    id: `matching-${relation}-${Date.now()}`,
    templateId: "matching",
    title: `${rel.label} 잇기`,
    instruction: { text: "어울리는 것끼리 줄로 이어 볼까요?" },
    ageRange: age,
    theme: relation,
    ttsLocale: "ko-KR",
    assets: dedupeAssets(assets),
    rounds,
    rewards: defaultRewards(rng),
  };
}

function buildEmotion(values: Record<string, FieldValue>, rng: () => number): EmotionGame {
  const age = str<AgeRange>(values.ageRange, "3-5");
  const ad = AGE_DEFAULTS[age];
  const setKind = str<"core" | "all">(values.emotionSet, "core");
  const empathy = bool(values.empathy, true);
  const roundCount = num(values.rounds, ad.rounds);

  const core: Emotion[] = ["happy", "sad", "angry"];
  const all: Emotion[] = ["happy", "sad", "angry", "scared", "surprised"];
  const pool = setKind === "all" ? all : core;
  const optionCount = Math.min(num(values.optionCount, ad.optionCount), pool.length);

  const emotionKo: Record<Emotion, string> = {
    happy: "기쁨", sad: "슬픔", angry: "화남", scared: "무서움", surprised: "놀람",
  };

  const rounds: EmotionRound[] = [];
  for (let i = 0; i < roundCount; i++) {
    const emotion = pick(pool, rng);
    const distractors = sampleN(pool.filter((e) => e !== emotion), optionCount - 1, rng);
    rounds.push({
      riveStateMachine: "character_default", // ⚠️ M2: 실제 Rive 캐릭터/상태머신으로 교체
      emotion,
      optionEmotions: shuffle([emotion, ...distractors], rng),
      empathyAction: empathy
        ? {
            promptText: `친구가 ${emotionKo[emotion]}을 느껴요. 어떻게 해줄까요?`,
            actionLabel: emotion === "happy" ? "함께 기뻐하기" : "안아주기",
            responseState: "comforted",
          }
        : undefined,
    });
  }

  return {
    schemaVersion: 1,
    id: `emotion-${setKind}-${Date.now()}`,
    templateId: "emotion",
    title: "표정 보고 마음 알기",
    instruction: { text: "친구의 표정을 보고 기분을 맞춰 볼까요?" },
    ageRange: age,
    theme: "emotion",
    ttsLocale: "ko-KR",
    assets: [], // Rive 기반 — OpenMoji 에셋 없음
    rounds,
    rewards: defaultRewards(rng),
  };
}

/* ───────────────────────── 엔트리 ───────────────────────── */

export function buildSpecFromForm(sel: FormSelection): GameSpec {
  const rng = rngFrom(sel.seed);
  const { values } = sel;

  let spec: GameSpec;
  switch (sel.templateId) {
    case "counting":
      spec = buildCounting(values, rng);
      break;
    case "silhouette":
      spec = buildSilhouette(values, rng);
      break;
    case "matching":
      spec = buildMatching(values, rng);
      break;
    case "emotion":
      spec = buildEmotion(values, rng);
      break;
    default: {
      const _exhaustive: never = sel.templateId;
      throw new Error(`unknown templateId: ${String(_exhaustive)}`);
    }
  }

  assertSpecIntegrity(spec); // TODO(M1): gameSpec.zod 생성 후 parseGameSpec 으로 교체/병행
  return spec;
}
