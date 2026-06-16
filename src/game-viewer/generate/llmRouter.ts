/**
 * llmRouter.ts — 프롬프트 → templateId + 폼 파라미터 (M2, 실제 LLM 라우터).
 * ------------------------------------------------------------------
 * 게이트웨이(/api/ai/run)를 직접 호출(키는 서버에만)해, 교사의 자유 한국어 요청을
 * 4 템플릿 중 하나 + 큐레이션 파라미터(category/relation/emotionSet/ageRange)로 매핑한다.
 *
 * 🔴 안전: 콘텐츠(아이템·보기·에셋)는 LLM이 만들지 않는다 — buildSpecFromForm 이 큐레이션
 *    셋(contentSets)에서 OpenMoji ref로 '결정적'으로 조립한다. LLM은 '의도→파라미터'만 한다
 *    (CLAUDE.md §3: Router=얇음, 결정형 도구=에셋). 무근거 생성·부적절 에셋이 구조적으로 불가.
 * 실패/무키/형식오류 시 키워드 라우터(router.ts)로 폴백 — 입구는 항상 동작한다.
 */
import type { AgeRange, TemplateId } from "../schema/gameSpec";
import { CONTENT_SETS, RELATION_SETS, type CategoryId, type RelationId } from "./contentSets";
import { routePrompt, type RouteResult } from "./router";

export interface LlmRouteResult extends RouteResult {
  /** LLM이 제안한 짧은 제목(있으면 spec.title로 반영). */
  title?: string;
  /** 결정 경로(텔레메트리/디버그). */
  source: "llm" | "keyword";
}

const CATEGORIES = Object.keys(CONTENT_SETS) as CategoryId[];
const RELATIONS = Object.keys(RELATION_SETS) as RelationId[];
const TEMPLATES: TemplateId[] = ["counting", "silhouette", "emotion", "matching"];

function systemPrompt(): string {
  return [
    "너는 유아(3~7세) 놀이 생성기의 라우터다. 교사의 한국어 요청에 가장 알맞은 놀이 템플릿과 파라미터를 고른다.",
    "설명·코드펜스 없이 아래 JSON 한 개만 출력한다:",
    '{"templateId":"counting|silhouette|emotion|matching","category":"<카테고리>","relation":"<관계>","emotionSet":"core|all","ageRange":"3-5|5-7","title":"<짧은 한국어 제목>"}',
    "- counting=개수 세기, silhouette=검은 실루엣 보고 맞추기, emotion=표정·감정 맞추기, matching=어울리는 것 줄로 잇기.",
    `- category (counting·silhouette 전용, 하나만): ${CATEGORIES.join(", ")}.`,
    `- relation (matching 전용, 하나만): ${RELATIONS.join(", ")}.`,
    "- emotionSet (emotion 전용): core(기쁨·슬픔·화남) 또는 all(5가지).",
    "- ageRange: 쉽거나 수가 적으면 3-5, 큰 아이거나 수가 많으면 5-7.",
    "- category·relation은 위 목록에 있는 값만 쓴다. 요청 소재가 목록에 없으면 가장 비슷한 것을 고른다.",
    "- 해당 없는 필드는 생략 가능. title은 요청을 반영한 짧은 제목(예: '동물원 동물 세기').",
  ].join("\n");
}

interface RawOut {
  templateId?: unknown;
  category?: unknown;
  relation?: unknown;
  emotionSet?: unknown;
  ageRange?: unknown;
  title?: unknown;
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** 코드펜스/잡설 섞여 와도 첫 JSON 객체만 뽑는다. */
function extractJson(text: string): string {
  const m = text.match(/\{[\s\S]*\}/);
  return m ? m[0] : text;
}

/** LLM 출력 → 검증된 RouteResult. 목록 밖 값/누락은 안전 기본값으로 보정. 불가면 null. */
function toRoute(raw: RawOut): LlmRouteResult | null {
  const tid = str(raw.templateId) as TemplateId;
  if (!TEMPLATES.includes(tid)) return null;
  const ageRange: AgeRange = str(raw.ageRange) === "5-7" ? "5-7" : "3-5";
  const values: Record<string, string | number | boolean> = { ageRange };

  if (tid === "matching") {
    const rel = str(raw.relation) as RelationId;
    values.relation = RELATIONS.includes(rel) ? rel : "animal-food";
  } else if (tid === "emotion") {
    values.emotionSet = str(raw.emotionSet) === "all" ? "all" : "core";
  } else {
    let cat = str(raw.category) as CategoryId;
    if (!CATEGORIES.includes(cat)) cat = "animal";
    if (tid === "silhouette" && cat === "job") cat = "animal"; // 실루엣 비적합 보정
    values.category = cat;
  }

  const title = str(raw.title).slice(0, 40) || undefined;
  return { templateId: tid, values, matched: true, title, source: "llm" };
}

/** 프롬프트 → 라우팅. 게이트웨이 LLM(task=router, low tier) → 검증. 실패 시 키워드 폴백. */
export async function routePromptLLM(prompt: string): Promise<LlmRouteResult> {
  const keyword = (): LlmRouteResult => ({ ...routePrompt(prompt), source: "keyword" });
  const text = prompt.trim();
  if (!text) return keyword();
  try {
    const res = await fetch("/api/ai/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        task: "router",
        tier: "low",
        provider: "auto",
        responseFormat: "json",
        system: systemPrompt(),
        messages: [{ role: "user", content: text }],
        maxTokens: 220,
      }),
    });
    const data = (await res.json()) as { ok?: boolean; text?: string };
    if (!data?.ok || typeof data.text !== "string") return keyword();
    const raw = JSON.parse(extractJson(data.text)) as RawOut;
    return toRoute(raw) ?? keyword();
  } catch {
    return keyword();
  }
}
