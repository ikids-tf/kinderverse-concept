/**
 * Resolver — 메커니즘 레시피 레지스트리 + 진입점.
 *
 * getRecipe(메커니즘) → 결정론 build. buildRecipe 는 build 후 safeParse 로 참조무결성을
 * 검증해 BuildResult 로 돌려준다(레시피 버그를 조립 시점에 잡는 안전망 — LLM 대비 핵심 이점).
 *
 * 구현 단계(PROMPTS.md): 1/6 네이티브 3종. 이후 조합/드래그분류/라우팅이 여기에 등록된다.
 */
import { safeParseInteractiveNode } from '../schema/parse';
import type { BuildResult, MechanismId, Recipe, RecipeInput } from './recipeTypes';
import { pairMatch, pathTrace, sequenceOrder } from './recipes/native';
import { branchChoose, combine, tapSelect } from './recipes/combos';
import { slotFill, sortToBin } from './recipes/dragSort';
import { freeCreate, memoryFlip } from './recipes/freeCreate';
import { dressUp } from './recipes/dressUp';

export type { MechanismId, Recipe, RecipeInput, RecipeItem, RecipeBin, RecipePair, BuildResult } from './recipeTypes';

/** 메커니즘 → 레시피. 10종 전부 구현(rhythm-tap 만 realtime-arcade 제외로 보류). */
export const RECIPES: Partial<Record<MechanismId, Recipe>> = {
  'sequence-order': sequenceOrder,
  'path-trace': pathTrace,
  'pair-match': pairMatch,
  'tap-select': tapSelect,
  'branch-choose': branchChoose,
  combine,
  'sort-to-bin': sortToBin,
  'slot-fill': slotFill,
  'free-create': freeCreate,
  'memory-flip': memoryFlip,
  'dress-up': dressUp,
};

export function getRecipe(id: MechanismId): Recipe | undefined {
  return RECIPES[id];
}

/** 구현된 메커니즘 목록(라우팅/디버깅). */
export function implementedMechanisms(): MechanismId[] {
  return Object.keys(RECIPES) as MechanismId[];
}

/**
 * 레시피 조립 + 참조무결성 검증. 성공 시 검증 통과 노드, 실패 시 zod 이슈 요약.
 * (꼬리 호출·레인 통합은 PROMPT 2 — assembleAndPlace.)
 */
export function buildRecipe(id: MechanismId, input: RecipeInput): BuildResult {
  const recipe = getRecipe(id);
  if (!recipe) return { ok: false, errors: `미구현 메커니즘: ${id}` };
  let node;
  try {
    node = recipe.build(input);
  } catch (e) {
    return { ok: false, errors: e instanceof Error ? e.message : String(e) };
  }
  const parsed = safeParseInteractiveNode(node);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues
        .slice(0, 8)
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; '),
    };
  }
  return { ok: true, node: parsed.data };
}
