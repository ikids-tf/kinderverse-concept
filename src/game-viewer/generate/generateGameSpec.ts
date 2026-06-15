/**
 * generateGameSpec.ts — 프롬프트 → GameSpec (STEP 8, **M1 목업**).
 * ------------------------------------------------------------------
 * M1은 routePrompt(키워드) → buildSpecFromForm(결정적 조립). LLM 호출 없음.
 * M2에서 이 함수만 전문 에이전트(LLM) 호출로 교체하면 입구는 그대로 동작한다
 * (GameSpec 단일 계약이라 엔진/입구는 생성 방식을 모른다).
 */
import type { GameSpec } from "../schema/gameSpec";
import { buildSpecFromForm } from "./buildSpecFromForm";
import { routePrompt } from "./router";

export interface GenerateResult {
  spec: GameSpec;
  /** 목업 라우터가 키워드를 잡았는지(못 잡으면 기본=동물 세기) */
  matched: boolean;
}

/** 프롬프트로 게임 생성(목업). 비동기 시그니처 — M2 LLM 교체 시 그대로 await. */
export async function generateGameSpec(prompt: string): Promise<GenerateResult> {
  const route = routePrompt(prompt);
  const spec = buildSpecFromForm({ templateId: route.templateId, values: route.values });
  return { spec, matched: route.matched };
}
