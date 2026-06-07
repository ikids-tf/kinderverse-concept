import { callGateway } from '../client';
import { buildRouterPrompt } from '../prompt';
import {
  validateRouterOutput,
  type RouterInput,
  type RouterOutput,
} from '../contract';

/* Tier0 router agent (SKILL §1, PROMPTS §1).
   Calls the gateway at the low/fast tier, enforces the JSON output contract with
   one self-repair pass, and gates on confidence. Pure orchestration — no content
   generation. */

export interface RouterResult {
  output: RouterOutput;
  provider?: string;
  model?: string;
  mocked?: boolean;
  /** Soft error note (e.g. fell back to a local clarify). */
  warning?: string;
}

/** Pull a JSON object out of a model reply that may be fenced or prefixed. */
function extractJson(text: string): unknown {
  const trimmed = text.trim();
  // Strip ```json ... ``` fences if present.
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : trimmed;
  // Find the outermost {...}.
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('no JSON object found');
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

function localClarify(input: RouterInput, question: string): RouterOutput {
  return {
    page: input.page,
    selection: input.selection,
    available_actions: input.available_actions,
    intent: 'unknown',
    scope: input.selection.count > 0 ? 'selection' : 'new',
    route_to: null,
    suggested_next: [],
    confidence: 0,
    needs_confirmation: true,
    clarify: { question },
  };
}

export async function runRouter(
  input: RouterInput,
  tenantContext?: string,
): Promise<RouterResult> {
  const { system, user } = buildRouterPrompt(input, tenantContext);

  const first = await callGateway({
    task: 'router',
    tier: 'low',
    provider: 'auto',
    responseFormat: 'json',
    fallback: ['mid'],
    cache: ['curriculum', 'tenant_style'],
    system,
    messages: [{ role: 'user', content: user }],
    meta: input,
    maxTokens: 1024,
  });

  if (!first.ok || !first.text) {
    return {
      output: localClarify(input, 'AI 연결에 문제가 있어요. 잠시 후 다시 시도해 주세요.'),
      warning: first.error ?? 'empty response',
      mocked: first.mocked,
    };
  }

  // First parse + validate attempt.
  let parsed: unknown;
  try {
    parsed = extractJson(first.text);
  } catch {
    parsed = null;
  }
  let result = parsed ? validateRouterOutput(parsed) : { ok: false, errors: ['unparseable'] };

  // Self-repair once (SKILL §6 / PROMPTS §6: 검증 실패 시 자기수선 1회).
  if (!result.ok) {
    const repair = await callGateway({
      task: 'router',
      tier: 'low',
      provider: 'auto',
      responseFormat: 'json',
      system,
      messages: [
        { role: 'user', content: user },
        { role: 'assistant', content: first.text },
        {
          role: 'user',
          content: `직전 출력이 스키마를 위반했다(${result.errors.join('; ')}). 설명 없이 올바른 JSON만 다시 출력하라.`,
        },
      ],
      meta: input,
      maxTokens: 1024,
    });
    if (repair.ok && repair.text) {
      try {
        result = validateRouterOutput(extractJson(repair.text));
      } catch {
        // fall through to clarify
      }
    }
  }

  if (!result.ok || !result.value) {
    return {
      output: localClarify(input, '요청을 이해하지 못했어요. 다시 한 번 구체적으로 말씀해 주세요.'),
      provider: first.provider,
      model: first.model,
      mocked: first.mocked,
      warning: result.ok ? undefined : result.errors.join('; '),
    };
  }

  return {
    output: result.value,
    provider: first.provider,
    model: first.model,
    mocked: first.mocked,
  };
}
