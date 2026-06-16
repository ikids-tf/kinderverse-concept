/**
 * generateGameSpec.ts — 프롬프트 → GameSpec (STEP 8 · M2 LLM 라우터).
 * ------------------------------------------------------------------
 * 프롬프트를 LLM 라우터(routePromptLLM, 게이트웨이)로 templateId + 파라미터로 매핑한 뒤,
 * buildSpecFromForm 으로 GameSpec을 결정적으로 조립한다(콘텐츠는 큐레이션 OpenMoji — 안전).
 * LLM 실패/무키 시 키워드 라우터로 폴백하므로 입구는 항상 동작한다.
 * GameSpec 단일 계약이라 엔진/입구는 생성 방식을 모른다.
 */
import type { GameSpec } from "../schema/gameSpec";
import { buildSpecFromForm } from "./buildSpecFromForm";
import { routePromptLLM } from "./llmRouter";

export interface GenerateResult {
  spec: GameSpec;
  /** 라우터가 의도를 잡았는지(못 잡으면 기본=동물 세기). */
  matched: boolean;
  /** 결정 경로 — 'llm'(게이트웨이) 또는 'keyword'(폴백). */
  source: "llm" | "keyword";
}

/** 프롬프트로 게임 생성. LLM 라우팅 → 결정적 빌드. */
export async function generateGameSpec(prompt: string): Promise<GenerateResult> {
  const route = await routePromptLLM(prompt);
  const spec = buildSpecFromForm({ templateId: route.templateId, values: route.values });
  if (route.title) spec.title = route.title; // LLM이 제안한 맞춤 제목 반영
  return { spec, matched: route.matched, source: route.source };
}
