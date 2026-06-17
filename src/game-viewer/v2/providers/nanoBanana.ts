/**
 * nanoBanana.ts — ImageProvider 실구현(나노바나나/Gemini). 기존 게이트웨이 재사용.
 * ------------------------------------------------------------------
 * 🔴 새 API 클라이언트 없음 — @/ai/client(task:'image' → /api/ai/run). 키는 서버에만.
 * 게임 아이템용 스타일락: 단일 오브젝트 + 흰 배경 + 글자 없음(누끼·카드 배치에 깔끔).
 * 호출은 비동기(수 초) — 절대 크리티컬 패스에 두지 않는다(assetStore가 시드→스왑 관리).
 */
import { callGateway } from "@/ai/client";
import type { ImageProvider, ImageAsset } from "./providers";
import { assertNotChildPhoto } from "./providers";

const GAME_ITEM_STYLE =
  "밝고 둥근 파스텔 유아 그림책 일러스트, 단 하나의 오브젝트만, 균일한 흰 배경, " +
  "그림자·무늬·테두리·글자 없음, 또렷한 닫힌 외곽선, 화면 중앙 넉넉한 여백";

function slug(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\-가-힣]/g, "").slice(0, 24) || "x";
}

export class NanoBananaImageProvider implements ImageProvider {
  async generate(prompt: string): Promise<ImageAsset[]> {
    const res = await callGateway({
      task: "image",
      provider: "auto",
      messages: [],
      meta: { prompt: `${prompt} — ${GAME_ITEM_STYLE}`, caption: prompt },
    });
    if (!res.ok || !res.image) return [];
    return [{ assetId: slug(prompt), url: res.image, kind: "generated" }];
  }

  async editVariant(asset: ImageAsset, instruction: string): Promise<ImageAsset> {
    assertNotChildPhoto(asset); // 🔴 외부 전송 전 가드(child-photo 금지)
    const res = await callGateway({
      task: "image",
      provider: "auto",
      messages: [],
      meta: { prompt: `${instruction} — ${GAME_ITEM_STYLE}`, caption: instruction },
    });
    return res.ok && res.image ? { assetId: slug(instruction), url: res.image, kind: "generated" } : asset;
  }
}
