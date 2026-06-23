/**
 * Resolver — 의도 라우팅 진입점(§8). selectRecipe(동사→메커니즘·명사·연령) → fillSlots(내용 충전:
 * 테마 vocab 결정론 + 의미는 narrow LLM) → {메커니즘, 내용}. 매칭/충전 실패면 null → 폴백.
 *
 * 구조(behaviors)는 절대 LLM에 안 보낸다 — 레시피가 결정론으로 조립한다(assembleAndPlace).
 */
import { fillSlots } from './fillSlots';
import { implementedMechanisms } from './index';
import { selectRecipe } from './selectRecipe';
import type { MechanismId, RecipeInput } from './recipeTypes';

export interface ResolvedIntent {
  mechanism: MechanismId;
  input: Omit<RecipeInput, 'docId'>;
}

/** 교사 프롬프트 → {메커니즘, 내용}. 롱테일/충전 실패면 null(→ composeInteractiveNode 폴백). */
export async function resolveIntent(prompt: string, onBusy?: (m: string | null) => void): Promise<ResolvedIntent | null> {
  const parse = selectRecipe(prompt);
  if (!parse || !implementedMechanisms().includes(parse.mechanism)) return null;
  const input = await fillSlots(prompt, parse, onBusy);
  if (!input) return null;
  return { mechanism: parse.mechanism, input };
}
