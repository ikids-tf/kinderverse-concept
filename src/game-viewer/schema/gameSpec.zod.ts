/**
 * gameSpec.zod.ts — GameSpec 런타임 검증 (STEP 2).
 * ------------------------------------------------------------------
 * gameSpec.ts 의 타입과 1:1 대응하는 zod 스키마. 생성 산출물·캐시 로드·
 * iframe postMessage 등 "신뢰할 수 없는 경로"로 들어온 JSON을 런타임에서 검증한다.
 *
 * - parseGameSpec(json): 검증 통과 시 GameSpec, 실패 시 throw(ZodError).
 * - safeParseGameSpec(json): { ok, spec } | { ok:false, error } — UI 친화 비throw.
 * 둘 다 zod 검증 후 assertSpecIntegrity(assetId 참조 무결성)까지 돌린다.
 */
import { z } from "zod";
import {
  GAME_SPEC_VERSION,
  assertSpecIntegrity,
  type GameSpec,
} from "./gameSpec";

/* ───────────────────────── Asset ───────────────────────── */

const baseAssetShape = {
  id: z.string().min(1),
  label: z.string(),
  labelTtsUrl: z.string().optional(),
  alt: z.string(),
};

const openmojiAsset = z.object({
  ...baseAssetShape,
  source: z.literal("openmoji"),
  ref: z.string().min(1),
});

const teacherAsset = z.object({
  ...baseAssetShape,
  source: z.literal("teacher"),
  uploadId: z.string().min(1),
  processedUrl: z.string().optional(),
  silhouetteUrl: z.string().optional(),
  status: z.enum(["pending", "processing", "ready", "rejected"]),
});

const generatedAsset = z.object({
  ...baseAssetShape,
  source: z.literal("generated"),
  prompt: z.string(),
  url: z.string(),
});

const gameAsset = z.discriminatedUnion("source", [
  openmojiAsset,
  teacherAsset,
  generatedAsset,
]);

/* ───────────────────────── 공통 ───────────────────────── */

const instruction = z.object({
  text: z.string(),
  ttsUrl: z.string().optional(),
});

const ageRange = z.enum(["3-5", "5-7"]);
const ttsLocale = z.enum(["ko-KR", "ja-JP", "en-US"]);
const emotion = z.enum(["happy", "sad", "angry", "scared", "surprised"]);

const rewards = z.object({
  effects: z.array(z.enum(["confetti", "stars", "lottie", "character-cheer"])),
  voicePraise: z.string(),
  voicePraiseTtsUrl: z.string().optional(),
});

/* ───────────────────────── Round ───────────────────────── */

const countingRound = z.object({
  itemAssetId: z.string().min(1),
  count: z.number().int().min(1),
  options: z.array(z.number().int()).min(2),
  scatter: z.enum(["random", "grid"]).optional(),
});

const silhouetteRound = z.object({
  answerAssetId: z.string().min(1),
  optionAssetIds: z.array(z.string().min(1)).min(2),
});

const emotionRound = z.object({
  riveStateMachine: z.string(),
  emotion,
  optionEmotions: z.array(emotion).min(2),
  empathyAction: z
    .object({
      promptText: z.string(),
      promptTtsUrl: z.string().optional(),
      actionLabel: z.string(),
      responseState: z.string(),
    })
    .optional(),
});

const matchingPair = z.object({
  leftAssetId: z.string().min(1),
  rightAssetId: z.string().min(1),
});
const matchingRound = z.object({
  pairs: z.array(matchingPair).min(1),
  relation: z.string(),
});

/* ───────────────────────── GameSpec 판별 유니온 ───────────────────────── */

const baseGameShape = {
  schemaVersion: z.literal(GAME_SPEC_VERSION),
  id: z.string().min(1),
  title: z.string(),
  instruction,
  ageRange,
  theme: z.string(),
  assets: z.array(gameAsset),
  rewards,
  ttsLocale,
};

const gameSpec = z.discriminatedUnion("templateId", [
  z.object({ ...baseGameShape, templateId: z.literal("counting"), rounds: z.array(countingRound).min(1) }),
  z.object({ ...baseGameShape, templateId: z.literal("silhouette"), rounds: z.array(silhouetteRound).min(1) }),
  z.object({ ...baseGameShape, templateId: z.literal("emotion"), rounds: z.array(emotionRound).min(1) }),
  z.object({ ...baseGameShape, templateId: z.literal("matching"), rounds: z.array(matchingRound).min(1) }),
]);

/** 외부 검증용으로도 export (테스트/생성 파이프라인에서 재사용) */
export const gameSpecSchema = gameSpec;

/* ───────────────────────── 엔트리 ───────────────────────── */

/** 검증 통과 시 GameSpec, 실패 시 throw. zod + assetId 참조 무결성 둘 다 본다. */
export function parseGameSpec(json: unknown): GameSpec {
  // zod의 inferred 타입은 GameSpec과 구조 동일하나, 옵셔널/리터럴 분기 차이로
  // 직접 대입이 안 떨어질 수 있어 한 번 단언한다(런타임은 zod가 이미 보장).
  const spec = gameSpec.parse(json) as GameSpec;
  assertSpecIntegrity(spec);
  return spec;
}

export type ParseResult =
  | { ok: true; spec: GameSpec }
  | { ok: false; error: string };

/** UI 친화 비throw 버전 — 에러 메시지를 한 줄로 정리해 돌려준다. */
export function safeParseGameSpec(json: unknown): ParseResult {
  const res = gameSpec.safeParse(json);
  if (!res.success) {
    const first = res.error.issues[0];
    const path = first?.path.join(".") || "(root)";
    return { ok: false, error: `${path}: ${first?.message ?? "invalid GameSpec"}` };
  }
  try {
    assertSpecIntegrity(res.data as GameSpec);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  return { ok: true, spec: res.data as GameSpec };
}
