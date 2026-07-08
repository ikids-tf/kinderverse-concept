// 놀이기록 디자인 스티커 에셋 해석기.
// 정책: "주제 관련 스티커가 기존 에셋(/assets/deco)에 있으면 가져다 쓰고, 없으면 생성한다."
//   1) THEME_DECO_ASSETS 에 주제 키가 있고 그 PNG 가 실제로 로드되면 재사용(과금 0, 즉시).
//   2) 등록 파일이 없거나(서빙 불가) 주제 키가 없으면 getAssetSmart 로 생성 → 누끼 → localStorage 캐시.
// 주의: dev/prod 정적 서버는 공백·괄호·쉼표·한글이 포함된 파일명을 안정적으로 서빙하지 못한다.
//        따라서 재사용 에셋은 반드시 깨끗한 ASCII 파일명으로 둔다.
import { getAssetSmart } from "./assetLibrary";
import { STICKER_MANIFEST, STICKER_SUBTAGS } from "./stickerManifest";
import { themeFor } from "./layouts";

// 주제(layouts.js THEMES 의 key) → 서빙 가능한 스티커 URL 목록.
// 자동 생성 매니페스트(deco 테마형 일러스트 → stk-*.png 사본) 사용. 일부 깨끗한 기본 PNG 보강.
const FALLBACK_DECO: Record<string, string[]> = {
  summer: ["/assets/deco/sun.png", "/assets/deco/beach.png", "/assets/deco/fruit.png"],
  eco: ["/assets/deco/tree.png", "/assets/deco/flower.png", "/assets/deco/lavender.png"],
  spring: ["/assets/deco/flower.png", "/assets/deco/lavender.png"],
  // 겨울 주제 Pixar 스티커 (gpt-image-1, 투명 PNG) — 돋보기 아이·펭귄·다람쥐·눈송이
  winter: [
    "/generated-assets/stk-winter-1.png",
    "/generated-assets/stk-winter-2.png",
    "/generated-assets/stk-winter-3.png",
    "/generated-assets/stk-winter-4.png",
    "/generated-assets/stk-winter-5.png",
    "/generated-assets/stk-winter-6.png",
  ],
  default: ["/assets/deco/rainbow.png", "/assets/deco/cloud.png", "/assets/deco/sun.png"],
};
// 주제와 무관하게 "꾸미기 그림"에 항상 노출되는 꾸밈 스티커 — 테이프/압정핀(스크랩북 느낌)
const ALWAYS_DECO: string[] = [
  "/generated-assets/deco-tape-1.png",
  "/generated-assets/deco-tape-2.png",
  "/generated-assets/deco-pin-1.png",
  "/generated-assets/deco-check-purple.png",
  "/generated-assets/deco-check-orange.png",
  "/generated-assets/deco-check-blue.png",
  "/generated-assets/deco-gingham-1.png",
  "/generated-assets/deco-gingham-2.png",
  "/generated-assets/deco-gingham-3.png",
];
// 가을 카드 디자인(generated-assets/autumn-record)의 재사용 스티커 — "주제 그림"에 현재 디자인 그대로 노출.
const AUTUMN_RECORD_DECO: string[] = [
  "/generated-assets/autumn-record/deco-persimmon.png",
  "/generated-assets/autumn-record/deco-moon.png",
  "/generated-assets/autumn-record/deco-lantern.png",
  "/generated-assets/autumn-record/deco-songpyeon.png",
  "/generated-assets/autumn-record/ic-1.png",
  "/generated-assets/autumn-record/ic-3.png",
  "/generated-assets/autumn-record/ic-4.png",
  "/generated-assets/autumn-record/ic-5.png",
  "/generated-assets/autumn-record/ic-6.png",
  "/generated-assets/autumn-record/ic-7.png",
  "/generated-assets/autumn-record/ic-8.png",
  "/generated-assets/autumn-record/footer-kids.png",
  "/generated-assets/autumn-record/footer-art.png",
];

const THEME_DECO_ASSETS: Record<string, string[]> = (() => {
  const out: Record<string, string[]> = { ...FALLBACK_DECO };
  for (const [k, urls] of Object.entries(STICKER_MANIFEST)) {
    out[k] = [...(urls as string[]), ...(out[k] || [])];
  }
  // 겨울: 새 Pixar 스티커(돋보기 아이·펭귄·다람쥐·눈송이)를 앞에 둬 자동배치(idx 0~)에 우선 노출 → 레퍼런스 밸런스
  if (FALLBACK_DECO.winter) {
    out.winter = [...FALLBACK_DECO.winter, ...((STICKER_MANIFEST as any).winter || [])];
  }
  // 가을: 카드 디자인 에셋 + 가을·추석(가을 명절) 태그를 모두 "주제 그림"에 노출("가을 태그 주제 모두").
  out.autumn = [
    ...AUTUMN_RECORD_DECO,
    ...((STICKER_MANIFEST as any).autumn || []),
    ...((STICKER_MANIFEST as any).chuseok || []),
  ];
  return out;
})();

export interface StickerAssetRef {
  themeKey: string;
  themeLabel: string;
  idx: number;
}

export interface ResolvedSticker {
  src: string;
  cutout: boolean; // 정적 PNG(이미 투명) = false, 생성본(흰배경 누끼) = true
}

// 이미지가 실제 로드되는지 확인(서빙 불가/누락 파일을 깨진 이미지로 두지 않기 위함). 결과 캐시.
const loadCache = new Map<string, Promise<boolean>>();
function loadable(url: string): Promise<boolean> {
  let p = loadCache.get(url);
  if (!p) {
    p = new Promise<boolean>((res) => {
      const img = new Image();
      let done = false;
      const settle = (v: boolean) => { if (!done) { done = true; res(v); } };
      img.onload = () => settle(img.naturalWidth > 0);
      img.onerror = () => settle(false);
      img.src = url;
      // 안전장치: 대용량 이미지 동시 로드가 stall 돼도 Promise.all 이 멈추지 않게 타임아웃
      setTimeout(() => settle(false), 12000);
    });
    loadCache.set(url, p);
  }
  return p;
}

// 주제 스티커 1개를 해석한다. 기존 에셋이 (실제 로드되면) 재사용, 없으면 생성.
export async function resolveSticker(ref: StickerAssetRef): Promise<ResolvedSticker | null> {
  const pool = THEME_DECO_ASSETS[ref.themeKey];
  if (pool && pool.length) {
    const url = pool[ref.idx % pool.length];
    if (await loadable(url)) return { src: url, cutout: false }; // 재사용
    return null; // 등록됐으나 서빙 불가 → 이모지 유지(불필요한 생성 호출 방지)
  }
  // 등록 주제가 없으면 생성(캐시 우선 — 같은 주제는 다음부터 재사용)
  const label = ref.themeLabel || ref.themeKey;
  const r = await getAssetSmart(`pr-sticker-${ref.themeKey}-${ref.idx}`, label, [label]);
  return r.src ? { src: r.src, cutout: true } : null;
}

// 2단계 태그(주제+세부태그) 기반 배치 — "같은 태그의 비슷한 에셋이 있으면 불러오고, 없으면 생성".
//   1) STICKER_SUBTAGS[theme][subtag] 에 로드 가능한 에셋이 있으면 재사용(과금 0).
//   2) 없으면 같은 주제 전체 pool(THEME_DECO_ASSETS[theme])에서 유사 그림 재사용 시도.
//   3) 그래도 없으면 getAssetSmart 로 생성 → 누끼 → 캐시.
export async function resolveByTag(
  theme: string,
  subtag: string,
  idx: number,
  label?: string
): Promise<ResolvedSticker | null> {
  // 1) 세부태그 정확 매칭 재사용
  const pool = STICKER_SUBTAGS?.[theme]?.[subtag] || [];
  if (pool.length) {
    const url = pool[idx % pool.length];
    if (await loadable(url)) return { src: url, cutout: false };
  }
  // 2) 같은 주제 전체 pool 에서 유사 그림 재사용(세부태그 미매칭/빈 경우)
  const themePool = THEME_DECO_ASSETS[theme] || [];
  for (let i = 0; i < themePool.length; i++) {
    const url = themePool[(idx + i) % themePool.length];
    if (await loadable(url)) return { src: url, cutout: false };
  }
  // 3) 재사용 불가 → 생성(캐시 우선). 캐시 키에 세부태그 포함해 태그별로 안정 재사용.
  const lbl = label || `${theme} ${subtag}`;
  const r = await getAssetSmart(`pr-${theme}-${subtag}-${idx}`, lbl, [subtag]);
  return r.src ? { src: r.src, cutout: true } : null;
}

export function hasThemeStickerAssets(themeKey: string): boolean {
  return !!THEME_DECO_ASSETS[themeKey]?.length;
}

// 놀이기록 payload 의 주제에 맞는 꾸미기 그림(서빙 가능한 에셋) 목록 — 편집 패널 "주제 그림"에 노출.
// themeKey(현재 선택한 템플릿의 주제)를 주면 그걸 우선 사용 → 제목에 주제어가 없어도(예: "8월 놀이기록")
// 선택한 여름/교통 템플릿에 맞는 스티커가 뜬다. 없으면(또는 default) payload 텍스트로 감지.
export function payloadDecoAssets(payload: any, themeKey?: string): Array<{ url: string; label: string }> {
  const text = `${payload?.meta?.theme || ""} ${payload?.header?.title || ""}`;
  const key = (themeKey && themeKey !== "default" && THEME_DECO_ASSETS[themeKey])
    ? themeKey
    : ((themeFor(text) as any)?.key || "default");
  const urls = THEME_DECO_ASSETS[key] || THEME_DECO_ASSETS.default || [];
  const themeList = urls.map((url, i) => ({ url, label: `${key}-${i + 1}` }));
  // 테이프/압정핀 꾸밈 스티커는 항상 노출
  const always = ALWAYS_DECO.map((url, i) => ({ url, label: `deco-${i + 1}` }));
  return [...themeList, ...always];
}
