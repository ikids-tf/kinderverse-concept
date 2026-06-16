/**
 * imageAsset.ts — 게임 재료용 AI 이미지 생성 (게이트웨이 image task, Gemini).
 * ------------------------------------------------------------------
 * 🔴 유료. 호출부는 교사의 '명시적 버튼'으로만 호출한다(헌장 §4: 유료 생성 = 사전 확인).
 * 단일 사물 · 흰 배경 · 유아 안전 프롬프트로 제약. 반환: data URI(string) 또는 null(실패).
 * OpenMoji/emoji로 안 되는 '정확한 커스텀 그림'(우리 반 마스코트 등)을 채우는 보조 경로.
 */
export type ImgStyle = "clean" | "story" | "sticker" | "photo";

const STYLE_PROMPT: Record<ImgStyle, string> = {
  clean: "단순하고 또렷한 유아용 일러스트, 굵은 외곽선, 평면 색",
  story: "부드러운 수채화풍 동화 일러스트, 파스텔 색감",
  sticker: "귀여운 스티커 스타일, 둥글둥글한 형태, 굵은 외곽선",
  photo: "선명하고 깨끗한 사진",
};

export const STYLE_LABEL: Record<ImgStyle, string> = {
  clean: "또렷한 단순",
  story: "부드러운 동화",
  sticker: "귀여운 스티커",
  photo: "사진풍",
};

export const STYLES: ImgStyle[] = ["clean", "story", "sticker", "photo"];

/** subject + style → AI 이미지(data URI). 실패 시 null. */
export async function generateImageAsset(subject: string, style: ImgStyle): Promise<string | null> {
  const s = subject.trim();
  if (!s) return null;
  const prompt = `${s}, ${STYLE_PROMPT[style]}, 한 개만 화면 중앙에, 흰 배경, 유아에게 안전하고 친근한 그림`;
  try {
    const res = await fetch("/api/ai/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ task: "image", provider: "gemini", messages: [{ role: "user", content: prompt }] }),
    });
    const data = (await res.json()) as { ok?: boolean; image?: string };
    return data?.ok && typeof data.image === "string" ? data.image : null;
  } catch {
    return null;
  }
}
