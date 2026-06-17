/**
 * contentSets.ts — 큐레이션된 카테고리/아이템(결정론적 조립용).
 * ------------------------------------------------------------------
 * Resolver가 프롬프트 의도를 이 '좋은 블록' 안에서 고른다 → 결과가 못나질 수 없음(바운드 생성).
 * M1까지는 아이템=이모지(프로토). M3에서 OpenMoji/실사진/생성이미지로 승격(같은 label 키 유지).
 */
export interface Item {
  emoji: string;
  label: string;
}
export interface Category {
  key: string;
  label: string;
  /** 프롬프트에서 이 카테고리를 가리키는 키워드 */
  keywords: string[];
  items: Item[];
}

export const CATEGORIES: Category[] = [
  {
    key: "animal",
    label: "동물",
    keywords: ["동물", "동물원", "짐승", "animal"],
    items: [
      { emoji: "🦁", label: "사자" },
      { emoji: "🐘", label: "코끼리" },
      { emoji: "🐰", label: "토끼" },
      { emoji: "🐧", label: "펭귄" },
      { emoji: "🐸", label: "개구리" },
      { emoji: "🐵", label: "원숭이" },
      { emoji: "🐼", label: "판다" },
    ],
  },
  {
    key: "fruit",
    label: "과일",
    keywords: ["과일", "먹을것", "fruit"],
    items: [
      { emoji: "🍎", label: "사과" },
      { emoji: "🍌", label: "바나나" },
      { emoji: "🍓", label: "딸기" },
      { emoji: "🍇", label: "포도" },
      { emoji: "🍊", label: "귤" },
      { emoji: "🍉", label: "수박" },
    ],
  },
  {
    key: "vehicle",
    label: "탈것",
    keywords: ["탈것", "자동차", "교통", "vehicle", "차"],
    items: [
      { emoji: "🚗", label: "자동차" },
      { emoji: "🚌", label: "버스" },
      { emoji: "🚒", label: "소방차" },
      { emoji: "✈️", label: "비행기" },
      { emoji: "🚀", label: "로켓" },
      { emoji: "🚲", label: "자전거" },
    ],
  },
];

export function findCategory(prompt: string): Category | null {
  return (
    CATEGORIES.find((c) => c.keywords.some((k) => prompt.includes(k))) ??
    // 카테고리명이 없으면 아이템명(예: "바나나")으로도 유추
    CATEGORIES.find((c) => c.items.some((it) => prompt.includes(it.label))) ??
    null
  );
}
