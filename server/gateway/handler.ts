/* Gateway handler — provider/tier selection, cascade, and mock fallback.
   Transport-agnostic: the Vite dev middleware and any future serverless function
   both call handleGatewayRequest(body, config). (PRD §7.3) */

import type {
  GatewayRequest,
  GatewayResponse,
  Provider,
  Tier,
} from '../../src/ai/gateway/types';
import type { RouterInput } from '../../src/ai/contract';
import type { RecordInput } from '../../src/ai/prompt-record';
import {
  anthropicComplete,
  geminiComplete,
  geminiSearch,
  DEFAULT_ANTHROPIC_MODELS,
  DEFAULT_GEMINI_MODELS,
  type ProviderCallResult,
} from './providers';
import {
  mockRouterOutput,
  mockRecordOutput,
  mockLaneStep,
  mockAgentStep,
  type LaneStepMeta,
} from './mock';
import { generateImage } from './image';

export interface GatewayConfig {
  anthropicKey?: string;
  geminiKey?: string;
  /** Gemini image model, e.g. gemini-2.0-flash-preview-image-generation. */
  imageModel?: string;
  /** Optional model overrides, e.g. { 'anthropic.low': 'claude-haiku-4-5' }. */
  models?: Record<string, string>;
}

function defaultTier(task: string): Tier {
  return task === 'router' ? 'low' : 'mid';
}

function resolveModel(config: GatewayConfig, provider: Provider, tier: Tier): string {
  const override = config.models?.[`${provider}.${tier}`];
  if (override) return override;
  return provider === 'anthropic' ? DEFAULT_ANTHROPIC_MODELS[tier] : DEFAULT_GEMINI_MODELS[tier];
}

function pickProvider(req: GatewayRequest, config: GatewayConfig): Provider | null {
  const wanted = req.provider ?? 'auto';
  const hasA = !!config.anthropicKey;
  const hasG = !!config.geminiKey;
  if (wanted === 'anthropic') return hasA ? 'anthropic' : hasG ? 'gemini' : null;
  if (wanted === 'gemini') return hasG ? 'gemini' : hasA ? 'anthropic' : null;
  // auto — prefer Anthropic (charter default), then Gemini.
  return hasA ? 'anthropic' : hasG ? 'gemini' : null;
}

export async function handleGatewayRequest(
  req: GatewayRequest,
  config: GatewayConfig,
): Promise<GatewayResponse> {
  if (!req || !Array.isArray(req.messages)) {
    return { ok: false, error: 'invalid request' };
  }

  // ---- Image task: dedicated plugin (real when configured, else placeholder). ----
  if (req.task === 'image') {
    const meta = (req.meta ?? {}) as { prompt?: string; caption?: string };
    const { image, real, detail } = await generateImage({
      geminiKey: config.geminiKey,
      model: config.imageModel,
      prompt: meta.prompt ?? meta.caption ?? '유아 활동 개념 일러스트',
      caption: meta.caption ?? '활동',
    });
    return { ok: true, image, mocked: !real, error: real ? undefined : detail };
  }

  // ---- Web search task: Gemini Google Search grounding (real when keyed). ----
  if (req.task === 'search') {
    const query = req.messages.map((m) => m.content).filter(Boolean).join('\n').trim();
    if (!config.geminiKey) {
      return {
        ok: true,
        mocked: true,
        text: `“${query.slice(0, 40)}” 관련 웹 검색은 Gemini 키가 설정되면 켜집니다(데모).`,
      };
    }
    try {
      const model = resolveModel(config, 'gemini', 'low');
      const { text, sources } = await geminiSearch(config.geminiKey, model, query, req.system);
      return { ok: true, text, sources, provider: 'gemini', model };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  const provider = pickProvider(req, config);

  // ---- Mock fallback: no provider key configured. ----
  if (!provider) {
    if (req.task === 'router' && req.meta) {
      const out = mockRouterOutput(req.meta as RouterInput);
      return { ok: true, text: JSON.stringify(out), mocked: true, tier: defaultTier(req.task) };
    }
    if (req.task === 'record' && req.meta) {
      const out = mockRecordOutput(req.meta as RecordInput);
      return { ok: true, text: JSON.stringify(out), mocked: true, tier: defaultTier(req.task) };
    }
    if (req.task === 'lane_step' && req.meta) {
      return {
        ok: true,
        text: mockLaneStep(req.meta as LaneStepMeta),
        mocked: true,
        tier: defaultTier(req.task),
      };
    }
    if ((req.task === 'plan' || req.task === 'studio' || req.task === 'writing' || req.task === 'suitability') && req.meta) {
      return {
        ok: true,
        text: mockAgentStep(req.meta as LaneStepMeta),
        mocked: true,
        tier: defaultTier(req.task),
      };
    }
    return { ok: false, error: 'no AI provider configured (set ANTHROPIC_API_KEY or GEMINI_API_KEY)' };
  }

  const apiKey = provider === 'anthropic' ? config.anthropicKey! : config.geminiKey!;

  // ---- Tier list: requested tier first, then cascade fallback. ----
  const primary: Tier = req.tier && req.tier !== 'auto' ? req.tier : defaultTier(req.task);
  const tiers: Tier[] = [primary, ...(req.fallback ?? [])].filter(
    (t, i, a) => a.indexOf(t) === i,
  );

  let lastError = '';
  for (const tier of tiers) {
    const model = resolveModel(config, provider, tier);
    try {
      const opts = {
        apiKey,
        model,
        system: req.system,
        messages: req.messages,
        json: req.responseFormat === 'json',
        maxTokens: req.maxTokens,
      };
      const result: ProviderCallResult =
        provider === 'anthropic' ? await anthropicComplete(opts) : await geminiComplete(opts);
      return {
        ok: true,
        text: result.text,
        provider,
        model,
        tier,
        usage: result.usage,
      };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      // cascade to next tier (PRD §7.2.3)
    }
  }

  return { ok: false, error: lastError || 'all provider tiers failed', provider };
}
