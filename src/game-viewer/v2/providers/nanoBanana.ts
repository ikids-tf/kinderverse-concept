/**
 * nanoBanana.ts — ImageProvider 실구현(나노바나나/Gemini). 기존 게이트웨이 재사용.
 * ------------------------------------------------------------------
 * 🔴 새 API 클라이언트 없음 — @/ai/client(task:'image' → /api/ai/run). 키는 서버에만.
 * 게임 아이템용 스타일락: 단일 오브젝트 + 흰 배경 + 글자 없음(누끼·카드 배치에 깔끔).
 * 호출은 비동기(수 초) — 절대 크리티컬 패스에 두지 않는다(assetStore가 시드→스왑 관리).
 */
import { callGateway } from "@/ai/client";
import type { ImageProvider, ImageAsset } from "./providers";
import { assertNotChildMedia } from "./providers";

// 기본 화풍 = 귀여운 3D 픽사 애니메이션. 프롬프트에 다른 스타일 요청이 있으면 setImageStyle로 교체.
const DEFAULT_ITEM_STYLE =
  "귀여운 3D 픽사 애니메이션 스타일, 둥글둥글하고 부드러운 입체 캐릭터, 매끈한 렌더링과 포근한 조명, " +
  "단 하나의 오브젝트만, 균일한 흰 배경, 무늬·테두리·글자 없음, 화면 중앙 넉넉한 여백";

let styleOverride: string | null = null;
/** 게임 아이템 이미지 화풍 오버라이드 — 프롬프트에 다른 스타일 요청 시 지정. null이면 기본(귀여운 3D 픽사). */
export function setImageStyle(style: string | null): void {
  styleOverride = style && style.trim() ? style.trim() : null;
}
/** 현재 적용 화풍(오버라이드 우선, 없으면 기본 픽사 3D). */
function itemStyle(): string {
  return styleOverride ?? DEFAULT_ITEM_STYLE;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\-가-힣]/g, "").slice(0, 24) || "x";
}

export class NanoBananaImageProvider implements ImageProvider {
  async generate(prompt: string): Promise<ImageAsset[]> {
    const res = await callGateway({
      task: "image",
      provider: "auto",
      messages: [],
      meta: { prompt: `${prompt} — ${itemStyle()}`, caption: prompt },
    });
    if (!res.ok || !res.image) return [];
    return [{ assetId: slug(prompt), url: res.image, kind: "generated" }];
  }

  async editVariant(asset: ImageAsset, instruction: string): Promise<ImageAsset> {
    assertNotChildMedia(asset); // 🔴 외부 전송 전 가드(child-photo/child-video 금지)
    const res = await callGateway({
      task: "image",
      provider: "auto",
      messages: [],
      meta: { prompt: `${instruction} — ${itemStyle()}`, caption: instruction },
    });
    return res.ok && res.image ? { assetId: slug(instruction), url: res.image, kind: "generated" } : asset;
  }
}
