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

// 기본 화풍 = 따뜻한 3D 픽사풍(레퍼런스 정밀 반영). 프롬프트에 다른 스타일 요청이 있으면 setImageStyle로 교체.
const DEFAULT_ITEM_STYLE =
  "따뜻하고 아늑한 3D 픽사풍 일러스트레이션 — 동글동글 통통한 비율의 귀여운 캐릭터, " +
  "큼직하고 반짝이는 둥근 눈(또렷한 캐치라이트)·작은 코·발그레한 볼과 옅은 주근깨·부드러운 미소, " +
  "폭신한 머리카락과 손뜨개·니트 같은 사실적인 질감, 서브서피스가 살아있는 보드라운 피부. " +
  "황금빛의 부드럽고 따스한 자연광과 은은한 그림자, 얕은 심도의 크리미한 보케로 작은 디오라마처럼 포근하게, " +
  "고해상도·매끈한 렌더, 따뜻한 파스텔 색감, 동화책처럼 사랑스럽고 정감 있는 분위기. " +
  "단 하나의 오브젝트만, 깔끔하고 은은한 단색(살짝 보케) 배경, 무늬·테두리·글자 없음. " +
  "주체는 몸 전체가 프레임 안에 온전히 보이도록 정중앙에 약간 작게 두고 네 가장자리에서 넉넉히 떨어뜨려 " +
  "어느 쪽도(특히 아래쪽 발·다리·하단) 잘리지 않게 한다(클로즈업·과한 확대 금지).";

// 게임 아이템 이미지는 정사각형(1:1)으로 — 카드·슬롯 배치에 균일하게.
const ITEM_ASPECT = "1:1";

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
      meta: { prompt: `${prompt} — ${itemStyle()}`, caption: prompt, aspectRatio: ITEM_ASPECT },
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
      meta: { prompt: `${instruction} — ${itemStyle()}`, caption: instruction, aspectRatio: ITEM_ASPECT },
    });
    return res.ok && res.image ? { assetId: slug(instruction), url: res.image, kind: "generated" } : asset;
  }
}
