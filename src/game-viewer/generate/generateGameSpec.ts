/**
 * generateGameSpec.ts — 프롬프트 → GameSpec (공용 진입점).
 * ------------------------------------------------------------------
 * 1) 임의 소재 콘텐츠 생성(generateContentLLM, emoji→OpenMoji)을 먼저 시도 — "건물↔직업" 등
 *    큐레이션에 없는 요청도 만든다(안전: 표준 emoji만).
 * 2) 실패/무키/emotion → 라우터(routePromptLLM) + buildSpecFromForm 큐레이션으로 폴백.
 * GameSpec 단일 계약이라 어느 입구(자체 하단바·보드 프롬프트바)에서 불러도 동일하게 동작한다.
 */
import type { GameSpec, TemplateId } from "../schema/gameSpec";
import { buildSpecFromForm } from "./buildSpecFromForm";
import { routePromptLLM } from "./llmRouter";
import { generateContentLLM, type GenTemplate } from "./generateContent";

export interface GenerateResult {
  spec: GameSpec;
  /** 결정 경로 — 'content'(emoji 생성) 또는 'curated'(큐레이션 폴백). */
  source: "content" | "curated";
}

/** 프롬프트로 게임 생성. prefer(폼/장르 선택)가 있으면 그 템플릿을 우선. */
export async function generateGameSpec(prompt: string, prefer?: TemplateId): Promise<GenerateResult> {
  // emotion 은 고정 표정이라 콘텐츠 생성 대상 아님 — 바로 큐레이션.
  if (prefer !== "emotion") {
    const gen = await generateContentLLM(prompt, prefer as GenTemplate | undefined);
    if (gen) return { spec: gen, source: "content" };
  }
  const route = await routePromptLLM(prompt, prefer ? { lockTemplate: prefer, baseValues: { ageRange: "3-5" } } : undefined);
  const spec = buildSpecFromForm({ templateId: route.templateId, values: route.values });
  if (route.title) spec.title = route.title;
  return { spec, source: "curated" };
}
