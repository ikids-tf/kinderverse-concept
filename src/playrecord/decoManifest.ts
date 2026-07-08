// AssetLibrary 매니페스트 — 주제 → 번들 일러스트 파일(/assets/...).
// deco PNG 는 client/public/assets/deco/ 에 저장된 실제 일러스트.

export interface AssetEntry {
  frame?: string; // BackgroundLayer (A4 풀페이지 프레임)
  content?: string; // ContentImageLayer / Decoration (컷아웃 일러스트)
}

export const ASSET_MANIFEST: Record<string, AssetEntry> = {
  summer: { frame: "/assets/frames/default.png", content: "/assets/deco/sun.png" }, // 해
  weather: { frame: "/assets/frames/default.png", content: "/assets/deco/rain.png" }, // 비구름
  rainbow: { frame: "/assets/frames/default.png", content: "/assets/deco/rainbow.png" }, // 무지개·우산
  water: { frame: "/assets/frames/default.png", content: "/assets/deco/beach.png" }, // 바다·해변
  insect: { frame: "/assets/frames/default.png", content: "/assets/deco/insect.png" }, // 곤충
  flower: { frame: "/assets/frames/default.png", content: "/assets/deco/flower.png" }, // 수국·꽃
  fruit: { frame: "/assets/frames/default.png", content: "/assets/deco/fruit.png" }, // 과일·딸기
  nature: { frame: "/assets/frames/default.png", content: "/assets/deco/tree.png" }, // 나무·식물
  default: { frame: "/assets/frames/default.png", content: "/assets/deco/cloud.png" }, // 흰 구름
};

// 구체 키워드를 먼저, 광범위(여름/날씨)는 나중에 매칭.
const KEYWORDS: Array<[string, string]> = [
  ["비", "weather"], ["장마", "weather"], ["천둥", "weather"], ["번개", "weather"], ["먹구름", "weather"],
  ["무지개", "rainbow"], ["우산", "rainbow"],
  ["곤충", "insect"], ["벌", "insect"], ["무당벌레", "insect"], ["개미", "insect"], ["사슴벌레", "insect"], ["잠자리", "insect"], ["생물", "insect"],
  ["딸기", "fruit"], ["과일", "fruit"], ["열매", "fruit"],
  ["물놀이", "water"], ["바다", "water"], ["해변", "water"], ["모래", "water"], ["얼음", "water"], ["물", "water"],
  ["수국", "flower"], ["라벤더", "flower"], ["꽃", "flower"],
  ["나무", "nature"], ["잎", "nature"], ["식물", "nature"], ["산책", "nature"], ["자연", "nature"],
  ["여름", "summer"], ["햇빛", "summer"], ["날씨", "summer"], ["계절", "summer"],
  ["구름", "default"], ["맑음", "default"],
];

export function assetThemeFor(text = ""): string {
  for (const [kw, key] of KEYWORDS) if (text.includes(kw)) return key;
  return "default";
}

// 데코/콘텐츠 이미지 교체용 갤러리 (편집 패널에서 클릭해 변경)
export const DECO_IMAGES: Array<{ url: string; label: string }> = [
  { url: "/assets/deco/sun.png", label: "해" },
  { url: "/assets/deco/cloud.png", label: "구름" },
  { url: "/assets/deco/rain.png", label: "비구름" },
  { url: "/assets/deco/storm.png", label: "먹구름" },
  { url: "/assets/deco/rainbow.png", label: "무지개" },
  { url: "/assets/deco/beach.png", label: "바다" },
  { url: "/assets/deco/flower.png", label: "꽃" },
  { url: "/assets/deco/lavender.png", label: "라벤더" },
  { url: "/assets/deco/tree.png", label: "나무" },
  { url: "/assets/deco/fruit.png", label: "과일" },
  { url: "/assets/deco/insect.png", label: "곤충" },
  { url: "/assets/deco/bee.png", label: "꿀벌" },
  { url: "/assets/deco/ant.png", label: "개미" },
  { url: "/assets/deco/dragonfly.png", label: "잠자리" },
  { url: "/assets/deco/stagbeetle.png", label: "사슴벌레" },
  // 환경지킴이 꾸미기 스티커 세트 (Pixar 느낌, gpt-image 생성)
  { url: "/generated-assets/eco/01-earth.png", label: "지구" },
  { url: "/generated-assets/eco/02-kid-plant.png", label: "화분 든 아이" },
  { url: "/generated-assets/eco/03-recycle-bin.png", label: "재활용 쓰레기통" },
  { url: "/generated-assets/eco/04-nature.png", label: "자연·꽃" },
  { url: "/generated-assets/eco/05-lightbulb.png", label: "전구" },
];
