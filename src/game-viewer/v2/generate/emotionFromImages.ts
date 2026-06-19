/**
 * emotionFromImages.ts — 보드에서 고른 '감정 사진'으로 마음알기(감정 맞추기) 게임 조립.
 * ------------------------------------------------------------------
 * 교사가 보드 이미지(웃는/우는 아이 등)를 골라 "이 이미지로 감정 맞추기 게임 만들어줘"라고 하면,
 * 각 사진의 표정을 vision으로 분석해(감정 라벨) → 그 사진이 단서(cue), 감정 단어가 보기인
 * tap-the-right-one 게임을 만든다. 정답 = 분석된 감정. 생성 0(고른 사진이 그대로 단서로 등장).
 * 🔴 새 API 없음 — @/ai/client(task:'vision' → /api/ai/run). 사진은 ready asset으로 미리 박는다.
 */
import { callGateway } from "@/ai/client";
import type { InteractiveDocInput } from "../schema/interactiveDoc";
import { CATEGORIES } from "../resolver/contentSets";
import { OPTION_COUNT, optionSlots, shuffle, type Knobs } from "../resolver/resolver";
import { useAssetStore } from "../runtime/assetStore";

const EMOTION = CATEGORIES.find((c) => c.key === "emotion");
/** 감정 라벨 풀(기쁨·슬픔·화남·놀람·무서움·졸림 …) — 보기·정답 단어. */
const EMOTION_LABELS: string[] = (EMOTION?.items ?? []).map((it) => it.label);

/** 보드 이미지로 감정 게임을 만들 수 있는 시드인지(감정 카테고리 존재 + 시드 있음). */
export function canBuildEmotionGame(seeds: string[]): boolean {
  return EMOTION_LABELS.length >= 2 && seeds.length > 0;
}

/** 사진 한 장의 표정을 감정 라벨 하나로 분류(vision). 실패/모호 시 첫 라벨 폴백. */
async function classifyEmotion(image: string): Promise<string> {
  try {
    const res = await callGateway({
      task: "vision",
      provider: "auto",
      messages: [],
      meta: {
        image,
        question:
          `이 그림 속 인물의 표정이 나타내는 감정을 다음 중 하나의 '단어'로만 답해요(설명 금지): ${EMOTION_LABELS.join(", ")}`,
      },
    });
    const t = (res.text || "").trim();
    const hit = EMOTION_LABELS.find((l) => t.includes(l));
    if (hit) return hit;
  } catch {
    /* 폴백 ↓ */
  }
  return EMOTION_LABELS[0] ?? "기쁨";
}

/** 시드 사진들(보드 이미지) → 마음알기 tap 게임 InteractiveDocInput.
    각 라운드: 사진 cue + 감정 단어 보기(정답 = 분석 감정). 사진은 ready asset으로 미리 박는다. */
export async function buildEmotionGameFromImages(seeds: string[], knobs: Knobs): Promise<InteractiveDocInput> {
  const imgs = seeds.slice(0, 6); // 라운드 과다 방지(최대 6장)
  const emotions = await Promise.all(imgs.map(classifyEmotion));

  // 시드 사진을 ready asset으로 미리 박는다 → cue가 생성 없이 그 사진으로 뜬다(assetStore가 건너뜀).
  const assetIds = imgs.map((_, i) => `kv_emo_img_${i}`);
  useAssetStore.setState((s) => {
    const map = { ...s.map };
    imgs.forEach((url, i) => {
      map[assetIds[i]] = { status: "ready", url };
    });
    return { map };
  });

  // 보기 수 = 난이도 노브, 단 감정 라벨 수 이하(부족하면 줄임).
  const optionCount = Math.max(2, Math.min(OPTION_COUNT[knobs.difficulty], EMOTION_LABELS.length));
  const slots = optionSlots(optionCount);
  const rounds = imgs.map((_, i) => {
    const correct = emotions[i];
    const distractors = shuffle(EMOTION_LABELS.filter((l) => l !== correct)).slice(0, optionCount - 1);
    const options = shuffle([
      { content: { type: "text" as const, text: correct }, correct: true },
      ...distractors.map((d) => ({ content: { type: "text" as const, text: d } })),
    ]);
    return { cue: { type: "asset" as const, asset: { assetId: assetIds[i] } }, options };
  });

  return {
    meta: { id: "gen_emotion_from_imgs", title: "마음 알기 — 감정 맞추기", archetype: "tap-the-right-one", createdFrom: "prompt" },
    settings: { difficulty: knobs.difficulty, length: rounds.length, mood: knobs.mood, optionCount },
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
