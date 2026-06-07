import { callGateway } from '../client';
import { extractJson } from '../json';
import { buildRecordPrompt, type RecordInput } from '../prompt-record';
import { validateRegistryPayload, type RegistryPayload } from '@/ui-registry/contracts';

/* Tier1 record agent (agent.record). Two modes inherit Pedagogy Foundation.
   Calls the gateway at the mid tier, enforces the AUI payload contract with one
   self-repair pass, and falls back to a ClarifyPrompt on failure. */

export interface RecordResult {
  payload: RegistryPayload;
  provider?: string;
  model?: string;
  mocked?: boolean;
  warning?: string;
}

function clarify(question: string): RegistryPayload {
  return { type: 'ClarifyPrompt', props: { question } };
}

export async function runRecord(input: RecordInput, tenantContext?: string): Promise<RecordResult> {
  const { system, user } = buildRecordPrompt(input, tenantContext);

  const first = await callGateway({
    task: 'record',
    tier: 'mid',
    provider: 'auto',
    responseFormat: 'json',
    fallback: ['high'],
    cache: ['curriculum', 'tenant_style'],
    system,
    messages: [{ role: 'user', content: user }],
    meta: input,
    maxTokens: 1500,
  });

  if (!first.ok || !first.text) {
    return {
      payload: clarify('기록 생성에 문제가 있어요. 잠시 후 다시 시도해 주세요.'),
      warning: first.error ?? 'empty response',
      mocked: first.mocked,
    };
  }

  let result;
  try {
    result = validateRegistryPayload(extractJson(first.text));
  } catch {
    result = { ok: false, errors: ['unparseable'] as string[] };
  }

  // Self-repair once (SKILL §6 / PROMPTS §6).
  if (!result.ok) {
    const repair = await callGateway({
      task: 'record',
      tier: 'mid',
      provider: 'auto',
      responseFormat: 'json',
      system,
      messages: [
        { role: 'user', content: user },
        { role: 'assistant', content: first.text },
        {
          role: 'user',
          content: `직전 출력이 스키마/근거 규칙을 위반했다(${result.errors.join('; ')}). 설명 없이 올바른 JSON만 다시 출력하라. 근거가 부족하면 ClarifyPrompt로.`,
        },
      ],
      meta: input,
      maxTokens: 1500,
    });
    if (repair.ok && repair.text) {
      try {
        result = validateRegistryPayload(extractJson(repair.text));
      } catch {
        /* fall through */
      }
    }
  }

  if (!result.ok || !result.value) {
    return {
      payload: clarify('기록을 작성할 근거가 부족해요. 관찰 내용이나 사진을 알려주세요.'),
      provider: first.provider,
      model: first.model,
      mocked: first.mocked,
      warning: result.ok ? undefined : result.errors.join('; '),
    };
  }

  return {
    payload: result.value,
    provider: first.provider,
    model: first.model,
    mocked: first.mocked,
  };
}
