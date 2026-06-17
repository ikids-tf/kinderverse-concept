/**
 * content.ts — ContentBinding(asset/text/emoji)을 화면에 그릴 '비주얼'로 해석한다.
 * ------------------------------------------------------------------
 * M0 임시방편: 실제 이미지 파이프라인(ImageProvider/CutoutProvider)이 붙기 전까지
 * asset/정답텍스트를 이모지로 대체해 의미 있게 플레이되게 한다(레퍼런스 프로토와 동일).
 * 🔴 실제 빌드에선 asset.url(실사진/생성이미지 + 누끼)로 교체된다 — 아래 resolveVisual의
 *    `imageUrl` 분기가 그 자리(seam)다. 지금은 url이 없어 이모지로 폴백한다.
 */
import type { ContentBinding } from "../schema/interactiveDoc";

/** 한 노드에 무엇을 그릴지 — 셋 중 하나가 채워진다. */
export interface Visual {
  emoji?: string;
  text?: string;
  imageUrl?: string;
}

/* 프로토 한정: assetId → 이모지 (실 이미지 파이프라인 전까지). */
const ASSET_EMOJI: Record<string, string> = {
  asset_elephant: "🐘",
  asset_cat: "🐱",
  asset_carrot_leaf: "🌿",
};

/* 프로토 한정: 정답/보기 텍스트 → 이모지 (reveal의 hidden 노드 등에 사용). */
const ANSWER_EMOJI: Record<string, string> = {
  당근: "🥕", 감자: "🥔", 양파: "🧅",
  코끼리: "🐘", 고양이: "🐱", 토끼: "🐰", 강아지: "🐶", 펭귄: "🐧",
  사과나무: "🍎", 소방관: "🧑‍🚒",
};

export const DIFF_LABEL: Record<string, string> = {
  baby: "아기반", toddler: "유아반", senior: "형님반",
};
export const MOOD_LABEL: Record<string, string> = {
  calm: "차분하게", lively: "신나게", punchy: "깜짝깜짝",
};

/** ContentBinding → Visual. asset은 url 있으면 이미지, 없으면 이모지 폴백(M0). */
export function resolveVisual(c: ContentBinding): Visual {
  if (c.type === "emoji") return { emoji: c.emoji };
  if (c.type === "text") return { text: c.text };
  // type === "asset"
  // TODO: asset.url(보드 공유 에셋/생성+누끼)이 생기면 { imageUrl } 로 교체.
  return { emoji: ASSET_EMOJI[c.asset.assetId] ?? "🖼️" };
}

/** 정답 텍스트로 reveal hidden 노드에 보일 이모지를 고른다(프로토). */
export function answerEmoji(text: string | undefined): string {
  return (text && ANSWER_EMOJI[text]) || "🥕";
}
