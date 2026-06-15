/**
 * router.ts — 프롬프트 → templateId + 파라미터 (STEP 8, **M1 목업**).
 * ------------------------------------------------------------------
 * M1은 키워드 매칭만. 실제 Router→전문 에이전트(LLM) 연동은 M2.
 * 출력은 폼 값(FormSelection.values)과 호환되어 buildSpecFromForm 으로 바로 흐른다.
 */
import type { AgeRange, TemplateId } from "../schema/gameSpec";
import type { CategoryId, RelationId } from "./contentSets";

export interface RouteResult {
  templateId: TemplateId;
  values: Record<string, string | number | boolean>;
  /** 매칭 신뢰도(목업 — 키워드가 잡혔는지) */
  matched: boolean;
}

const TEMPLATE_KW: Array<{ id: TemplateId; kw: string[] }> = [
  { id: "silhouette", kw: ["그림자", "실루엣", "shadow"] },
  { id: "matching", kw: ["잇기", "연결", "짝", "이어", "매칭"] },
  { id: "emotion", kw: ["표정", "감정", "기분", "마음"] },
  { id: "counting", kw: ["세기", "개수", "숫자", "몇 개", "몇개", "세어"] },
];

const CATEGORY_KW: Array<{ id: CategoryId; kw: string[] }> = [
  { id: "animal", kw: ["동물", "동물원", "사자", "코끼리", "강아지", "고양이"] },
  { id: "fruit", kw: ["과일", "사과", "바나나", "딸기", "포도"] },
  { id: "vehicle", kw: ["탈것", "자동차", "버스", "기차", "비행기", "차"] },
  { id: "food", kw: ["음식", "피자", "햄버거", "케이크", "빵"] },
  { id: "plant", kw: ["식물", "꽃", "나무", "채소", "텃밭"] },
  { id: "job", kw: ["직업", "소방관", "경찰", "의사", "요리사"] },
];

const RELATION_KW: Array<{ id: RelationId; kw: string[] }> = [
  { id: "animal-food", kw: ["먹이", "동물", "음식"] },
  { id: "job-tool", kw: ["도구", "직업", "소방관", "경찰"] },
];

function firstMatch<T extends { kw: string[] }>(items: T[], text: string): T | undefined {
  return items.find((it) => it.kw.some((k) => text.includes(k)));
}

export function routePrompt(prompt: string): RouteResult {
  const text = prompt.trim();
  const tpl = firstMatch(TEMPLATE_KW, text);
  const templateId: TemplateId = tpl?.id ?? "counting";
  const age: AgeRange = /([567])\s*살|[567]\s*세|다섯|여섯|일곱/.test(text) ? "5-7" : "3-5";

  const values: Record<string, string | number | boolean> = { ageRange: age };

  if (templateId === "matching") {
    values.relation = (firstMatch(RELATION_KW, text)?.id ?? "animal-food") as RelationId;
  } else if (templateId === "emotion") {
    values.emotionSet = /전체|다섯|모든/.test(text) ? "all" : "core";
  } else {
    // counting / silhouette → 카테고리
    let cat = firstMatch(CATEGORY_KW, text)?.id ?? "animal";
    if (templateId === "silhouette" && cat === "job") cat = "animal"; // 실루엣 비적합 보정
    values.category = cat;
  }

  return { templateId, values, matched: !!tpl || !!firstMatch(CATEGORY_KW, text) };
}
