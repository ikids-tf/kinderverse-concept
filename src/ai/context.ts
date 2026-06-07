import { buildTenantContext } from '@/store/classStore';
import { buildLearnedContext } from '@/store/learningStore';

/* Combined L3 context for every Tier1 agent: 우리반(테넌트) + 학습된 교사 선호/exemplar.
   Realizes "데이터가 쌓일수록 똑똑해진다" — the same generation call carries both
   the class context (§4.4) and the self-improvement signals (§8). */
export function buildAgentContext(task?: string): string {
  return [buildTenantContext(), buildLearnedContext(task)].filter((s) => s.trim()).join('\n\n');
}
