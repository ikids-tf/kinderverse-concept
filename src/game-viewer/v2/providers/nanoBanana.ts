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

// 기본 화풍 = 따뜻한 3D 픽사풍 '렌더'(레퍼런스). 단, 대상은 실제 동물·사물 그대로(의인화 금지) — REALISM_GUARD가 강제.
// 프롬프트에 다른 스타일 요청이 있으면 setImageStyle로 교체되며, 그래도 REALISM_GUARD는 항상 함께 적용된다.
const DEFAULT_ITEM_STYLE =
  "따뜻하고 아늑한 3D 픽사풍 일러스트레이션 — 부드럽고 동글동글 귀여운 느낌이되, 대상은 '실제 동물·사물'의 정확한 생김새 그대로. " +
  "또렷한 캐치라이트가 살아있는 눈, 종 고유의 자연스러운 털·피부·표면 질감(서브서피스 산란)으로 보드랍게. " +
  "황금빛의 부드럽고 따스한 자연광과 은은한 그림자, 얕은 심도의 크리미한 보케로 작은 디오라마처럼 포근하게, " +
  "고해상도·매끈한 렌더, 따뜻한 파스텔 색감, 동화책처럼 사랑스럽고 정감 있는 분위기. " +
  "단 하나의 오브젝트만, 깔끔하고 은은한 단색(살짝 보케) 배경, 무늬·테두리·글자 없음. " +
  "주체는 몸 전체가 프레임 안에 온전히 보이도록 정중앙에 약간 작게 두고 네 가장자리에서 넉넉히 떨어뜨려 " +
  "어느 쪽도(특히 아래쪽 발·다리·하단) 잘리지 않게 한다(클로즈업·과한 확대 금지).";

// 🔴 교육용 사실성 가드 — 화풍(기본/오버라이드)과 무관하게 '항상' 함께 적용된다(buildItemPrompt).
// 이 게임은 아이에게 사실적 지식을 전달하므로, 동물·사물을 의인화하지 않고 종의 특징이 잘 보이는 각도로 그린다.
// (사람 얼굴·표정 카드는 예외 — 표정 자체가 학습 대상.)
const REALISM_GUARD =
  "⚠ 교육용 사실성(필수): 동물·식물·사물은 '실제 모습 그대로' — 정확한 해부학·비율·질감·색으로. " +
  "동물/사물 의인화 절대 금지 — 머리카락·모자·옷·목도리·안경 등 사람 물건 착용, 두 발로 서거나 앞발을 손처럼 쓰기, " +
  "윙크·미소 같은 사람 표정이나 볼터치·주근깨를 동물에 넣기 금지(사람·표정 카드는 예외). " +
  "해당 종 본래의 자연스러운 자세로, 그 종의 식별 특징(예: 코끼리=긴 코·큰 귀·상아, 기린=긴 목)이 한눈에 보이는 " +
  "각도 — 보통 전신이 보이는 옆모습 또는 3/4 측면 — 으로 그린다. " +
  "🔴 꼬리가 있는 동물(원숭이·사자·강아지·고양이·소·여우·다람쥐 등)은 반드시 '꼬리까지' 온전히 그린다 — " +
  "꼬리는 종을 구별하는 중요한 학습 정보다. 꼬리가 프레임 밖으로 잘리거나 몸·다른 사물에 가려 안 보이면 안 되며, " +
  "꼬리 전체가 보이도록 자세·각도(옆모습/꼬리가 보이는 3/4)를 잡는다.";

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
/** 아이템 생성 프롬프트 = 대상 + 화풍 + 교육용 사실성 가드(항상). 화풍이 무엇이든 의인화 금지·특징 각도가 강제된다. */
function buildItemPrompt(subject: string): string {
  return `${subject} — ${itemStyle()} ${REALISM_GUARD}`;
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
      meta: { prompt: buildItemPrompt(prompt), caption: prompt, aspectRatio: ITEM_ASPECT },
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
      meta: { prompt: buildItemPrompt(instruction), caption: instruction, aspectRatio: ITEM_ASPECT },
    });
    return res.ok && res.image ? { assetId: slug(instruction), url: res.image, kind: "generated" } : asset;
  }
}
