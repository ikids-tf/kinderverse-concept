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
/** 관계 잇기(connect)용 좌-우 연관 쌍. */
export interface Relation {
  left: Item;
  right: Item;
}
export interface Category {
  key: string;
  label: string;
  /** 프롬프트에서 이 카테고리를 가리키는 키워드 */
  keywords: string[];
  items: Item[];
  /** 관계 잇기용 큐레이션 쌍(동물-먹이 등). */
  relations: Relation[];
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
    relations: [
      { left: { emoji: "🐰", label: "토끼" }, right: { emoji: "🥕", label: "당근" } },
      { left: { emoji: "🐶", label: "강아지" }, right: { emoji: "🦴", label: "뼈다귀" } },
      { left: { emoji: "🐵", label: "원숭이" }, right: { emoji: "🍌", label: "바나나" } },
      { left: { emoji: "🐧", label: "펭귄" }, right: { emoji: "🐟", label: "물고기" } },
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
    relations: [
      { left: { emoji: "🍎", label: "사과" }, right: { emoji: "🌳", label: "나무" } },
      { left: { emoji: "🍌", label: "바나나" }, right: { emoji: "🐵", label: "원숭이" } },
      { left: { emoji: "🍓", label: "딸기" }, right: { emoji: "🍰", label: "케이크" } },
      { left: { emoji: "🍊", label: "귤" }, right: { emoji: "🧃", label: "주스" } },
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
    relations: [
      { left: { emoji: "🚒", label: "소방차" }, right: { emoji: "🔥", label: "불" } },
      { left: { emoji: "✈️", label: "비행기" }, right: { emoji: "☁️", label: "하늘" } },
      { left: { emoji: "🚀", label: "로켓" }, right: { emoji: "🌙", label: "달" } },
      { left: { emoji: "🚌", label: "버스" }, right: { emoji: "🚏", label: "정류장" } },
    ],
  },
  {
    key: "veg",
    label: "채소",
    keywords: ["채소", "야채", "vegetable"],
    items: [
      { emoji: "🥕", label: "당근" },
      { emoji: "🥔", label: "감자" },
      { emoji: "🧅", label: "양파" },
      { emoji: "🌽", label: "옥수수" },
      { emoji: "🍅", label: "토마토" },
      { emoji: "🥦", label: "브로콜리" },
    ],
    relations: [
      { left: { emoji: "🥕", label: "당근" }, right: { emoji: "🐰", label: "토끼" } },
      { left: { emoji: "🌽", label: "옥수수" }, right: { emoji: "🍿", label: "팝콘" } },
      { left: { emoji: "🥔", label: "감자" }, right: { emoji: "🍟", label: "감자튀김" } },
      { left: { emoji: "🍅", label: "토마토" }, right: { emoji: "🍝", label: "파스타" } },
    ],
  },
  {
    key: "job",
    label: "직업",
    keywords: ["직업", "일하는", "사람들", "job"],
    items: [
      { emoji: "👮", label: "경찰" },
      { emoji: "🧑‍🚒", label: "소방관" },
      { emoji: "🧑‍⚕️", label: "의사" },
      { emoji: "🧑‍🍳", label: "요리사" },
      { emoji: "🧑‍🏫", label: "선생님" },
      { emoji: "🧑‍🌾", label: "농부" },
    ],
    relations: [
      { left: { emoji: "🧑‍🚒", label: "소방관" }, right: { emoji: "🚒", label: "소방차" } },
      { left: { emoji: "🧑‍⚕️", label: "의사" }, right: { emoji: "💉", label: "주사" } },
      { left: { emoji: "🧑‍🍳", label: "요리사" }, right: { emoji: "🍳", label: "프라이팬" } },
      { left: { emoji: "🧑‍🌾", label: "농부" }, right: { emoji: "🌾", label: "벼" } },
    ],
  },
  {
    // 감정/표정 — '감정 맞추기' 같은 정서 학습 놀이. 표정 이모지가 곧 단서라 시드가 또렷하고,
    // tap(표정 보고 감정 고르기)·match·categorize 모두 자연스럽게 조립된다.
    key: "emotion",
    label: "감정",
    keywords: ["감정", "기분", "표정", "마음", "정서", "느낌", "emotion", "feeling"],
    items: [
      { emoji: "😊", label: "기쁨" },
      { emoji: "😢", label: "슬픔" },
      { emoji: "😠", label: "화남" },
      { emoji: "😲", label: "놀람" },
      { emoji: "😨", label: "무서움" },
      { emoji: "😴", label: "졸림" },
    ],
    relations: [
      { left: { emoji: "😊", label: "기쁨" }, right: { emoji: "🎁", label: "선물" } },
      { left: { emoji: "😢", label: "슬픔" }, right: { emoji: "💧", label: "눈물" } },
      { left: { emoji: "😴", label: "졸림" }, right: { emoji: "🛏️", label: "침대" } },
      { left: { emoji: "😨", label: "무서움" }, right: { emoji: "👻", label: "유령" } },
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

/** 순서형 콘텐츠(order-sequence용) — 카테고리와 직교. items는 '정답 순서'대로 둔다. */
export interface Sequence {
  key: string;
  label: string;
  keywords: string[];
  /** 올바른 순서대로(런타임이 셔플 후 이 순서로 맞히게 함). */
  items: Item[];
}

export const SEQUENCES: Sequence[] = [
  {
    key: "number",
    label: "숫자",
    keywords: ["숫자", "번호", "수 세기", "1234", "하나둘"],
    items: [
      { emoji: "1️⃣", label: "하나" },
      { emoji: "2️⃣", label: "둘" },
      { emoji: "3️⃣", label: "셋" },
      { emoji: "4️⃣", label: "넷" },
      { emoji: "5️⃣", label: "다섯" },
    ],
  },
  {
    key: "size",
    label: "크기",
    keywords: ["크기", "작은", "큰", "커지", "작아"],
    items: [
      { emoji: "🐭", label: "쥐" },
      { emoji: "🐰", label: "토끼" },
      { emoji: "🐶", label: "강아지" },
      { emoji: "🐘", label: "코끼리" },
    ],
  },
  {
    key: "grow",
    label: "자라기",
    keywords: ["자라", "성장", "씨앗", "새싹"],
    items: [
      { emoji: "🌰", label: "씨앗" },
      { emoji: "🌱", label: "새싹" },
      { emoji: "🌿", label: "잎" },
      { emoji: "🌷", label: "꽃" },
      { emoji: "🍎", label: "열매" },
    ],
  },
  {
    key: "day",
    label: "하루",
    keywords: ["하루", "아침", "낮", "저녁", "밤", "시간 순"],
    items: [
      { emoji: "🌅", label: "아침" },
      { emoji: "☀️", label: "낮" },
      { emoji: "🌇", label: "저녁" },
      { emoji: "🌙", label: "밤" },
    ],
  },
];

export function findSequence(prompt: string): Sequence | null {
  return SEQUENCES.find((s) => s.keywords.some((k) => prompt.includes(k))) ?? null;
}
