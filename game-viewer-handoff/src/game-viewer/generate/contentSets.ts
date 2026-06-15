/**
 * contentSets.ts — 폼 빌더가 쓰는 큐레이션 콘텐츠.
 * ------------------------------------------------------------------
 * 폼에서 카테고리를 고르면 여기서 아이템(OpenMoji ref + 한국어 라벨)을 뽑아
 * buildSpecFromForm()이 GameSpec 에셋으로 변환한다. (LLM 없음)
 *
 * 🔴 ref 검증 필수: 아래 hexcode는 표준 Unicode 코드포인트 기준으로 채운 "시작 셋"이다.
 *    Claude Code는 각 ref를 OpenMoji(jsDelivr: color/svg/{REF}.svg)에 대조해
 *    404 나는 항목을 교체하고, **실루엣이 깨끗하게 나오는 단일 코드포인트**를 우선한다.
 *    job 카테고리/일부 relation은 ZWJ 시퀀스(하이픈 결합, 예 "1F9D1-200D-1F692")라
 *    openmoji.ts 리졸버가 다중 코드포인트 ref를 처리해야 한다.
 */

export type CategoryId = "animal" | "fruit" | "vehicle" | "food" | "plant" | "job";

export interface ContentItem {
  /** OpenMoji hexcode. 단일("1F981") 또는 ZWJ 결합("1F9D1-200D-1F692") */
  ref: string;
  /** 한국어 라벨 (TTS/접근성에 사용) */
  label: string;
}

export interface ContentCategory {
  id: CategoryId;
  /** 갤러리/폼 표시용 */
  label: string;
  /** 칩 대표 아이콘 ref */
  icon: string;
  /** 실루엣 게임 적합도. job 처럼 형태가 복잡하면 false (실루엣 후보에서 제외) */
  goodForSilhouette: boolean;
  items: ContentItem[];
}

export const CONTENT_SETS: Record<CategoryId, ContentCategory> = {
  animal: {
    id: "animal",
    label: "동물",
    icon: "1F981",
    goodForSilhouette: true,
    items: [
      { ref: "1F981", label: "사자" },
      { ref: "1F418", label: "코끼리" },
      { ref: "1F42F", label: "호랑이" },
      { ref: "1F43B", label: "곰" },
      { ref: "1F430", label: "토끼" },
      { ref: "1F436", label: "강아지" },
      { ref: "1F431", label: "고양이" },
      { ref: "1F992", label: "기린" },
      { ref: "1F43C", label: "판다" },
      { ref: "1F427", label: "펭귄" },
    ],
  },
  fruit: {
    id: "fruit",
    label: "과일",
    icon: "1F34E",
    goodForSilhouette: true,
    items: [
      { ref: "1F34E", label: "사과" },
      { ref: "1F34C", label: "바나나" },
      { ref: "1F347", label: "포도" },
      { ref: "1F353", label: "딸기" },
      { ref: "1F349", label: "수박" },
      { ref: "1F34A", label: "귤" },
      { ref: "1F351", label: "복숭아" },
      { ref: "1F352", label: "체리" },
      { ref: "1F350", label: "배" },
      { ref: "1F34D", label: "파인애플" },
    ],
  },
  vehicle: {
    id: "vehicle",
    label: "탈것",
    icon: "1F697",
    goodForSilhouette: true,
    items: [
      { ref: "1F697", label: "자동차" },
      { ref: "1F68C", label: "버스" },
      { ref: "2708", label: "비행기" },
      { ref: "1F6A2", label: "배" },
      { ref: "1F682", label: "기차" },
      { ref: "1F6B2", label: "자전거" },
      { ref: "1F681", label: "헬리콥터" },
      { ref: "1F69A", label: "트럭" },
      { ref: "1F680", label: "로켓" },
      { ref: "1F692", label: "소방차" },
    ],
  },
  food: {
    id: "food",
    label: "음식",
    icon: "1F355",
    goodForSilhouette: true,
    items: [
      { ref: "1F355", label: "피자" },
      { ref: "1F354", label: "햄버거" },
      { ref: "1F32D", label: "핫도그" },
      { ref: "1F366", label: "아이스크림" },
      { ref: "1F370", label: "케이크" },
      { ref: "1F35E", label: "빵" },
      { ref: "1F369", label: "도넛" },
      { ref: "1F363", label: "초밥" },
    ],
  },
  plant: {
    id: "plant",
    label: "식물",
    icon: "1F337",
    goodForSilhouette: true,
    items: [
      { ref: "1F337", label: "튤립" },
      { ref: "1F33B", label: "해바라기" },
      { ref: "1F339", label: "장미" },
      { ref: "1F333", label: "나무" },
      { ref: "1F335", label: "선인장" },
      { ref: "1F340", label: "네잎클로버" },
      { ref: "1F331", label: "새싹" },
      { ref: "1F344", label: "버섯" },
    ],
  },
  job: {
    // ⚠️ ZWJ 시퀀스 다수. 형태 복잡 → 실루엣 비권장. counting/silhouette보다 matching에 적합.
    id: "job",
    label: "직업",
    icon: "1F9D1-200D-1F692",
    goodForSilhouette: false,
    items: [
      { ref: "1F9D1-200D-1F692", label: "소방관" },
      { ref: "1F46E", label: "경찰" },
      { ref: "1F9D1-200D-1F373", label: "요리사" },
      { ref: "1F9D1-200D-1F3EB", label: "선생님" },
      { ref: "1F9D1-200D-1F33E", label: "농부" },
      { ref: "1F9D1-200D-2695", label: "의사" },
      { ref: "1F9D1-200D-1F680", label: "우주비행사" },
      { ref: "1F9D1-200D-1F3A8", label: "화가" },
    ],
  },
};

/* ───────────────────────── matching 전용: 관계 팩 ───────────────────────── */

export type RelationId = "animal-food" | "job-tool";

export interface RelationPair {
  left: ContentItem;
  right: ContentItem;
}

export interface RelationSet {
  id: RelationId;
  label: string;
  /** 양쪽 칼럼 헤더 */
  leftLabel: string;
  rightLabel: string;
  pairs: RelationPair[];
}

/**
 * ⚠️ 순수 이모지로 표현 가능한 관계는 제한적이다. M2는 아래 2개로 시작하고,
 *    관계 다양화(동물-집, 엄마-아기 등)는 교사/생성 에셋(M3)에서 확장한다
 *    — 이모지 커버리지에 묶이지 않기 때문.
 */
export const RELATION_SETS: Record<RelationId, RelationSet> = {
  "animal-food": {
    id: "animal-food",
    label: "동물 - 먹이",
    leftLabel: "동물",
    rightLabel: "먹이",
    pairs: [
      { left: { ref: "1F430", label: "토끼" }, right: { ref: "1F955", label: "당근" } },
      { left: { ref: "1F412", label: "원숭이" }, right: { ref: "1F34C", label: "바나나" } },
      { left: { ref: "1F43B", label: "곰" }, right: { ref: "1F36F", label: "꿀" } },
      { left: { ref: "1F431", label: "고양이" }, right: { ref: "1F41F", label: "물고기" } },
      { left: { ref: "1F436", label: "강아지" }, right: { ref: "1F9B4", label: "뼈다귀" } },
      { left: { ref: "1F427", label: "펭귄" }, right: { ref: "1F420", label: "열대어" } },
    ],
  },
  "job-tool": {
    id: "job-tool",
    label: "직업 - 도구",
    leftLabel: "직업",
    rightLabel: "도구",
    pairs: [
      { left: { ref: "1F9D1-200D-1F692", label: "소방관" }, right: { ref: "1F692", label: "소방차" } },
      { left: { ref: "1F46E", label: "경찰" }, right: { ref: "1F693", label: "경찰차" } },
      { left: { ref: "1F9D1-200D-1F373", label: "요리사" }, right: { ref: "1F52A", label: "식칼" } },
      { left: { ref: "1F9D1-200D-1F33E", label: "농부" }, right: { ref: "1F69C", label: "트랙터" } },
      { left: { ref: "1F9D1-200D-1F3A8", label: "화가" }, right: { ref: "1F3A8", label: "팔레트" } },
      { left: { ref: "1F9D1-200D-2695", label: "의사" }, right: { ref: "1F489", label: "주사기" } },
    ],
  },
};
