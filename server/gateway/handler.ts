/* Gateway handler — provider/tier selection, cascade, and mock fallback.
   Transport-agnostic: the Vite dev middleware and any future serverless function
   both call handleGatewayRequest(body, config). (PRD §7.3) */

import type {
  GatewayRequest,
  GatewayResponse,
  Provider,
  Tier,
} from '../../src/ai/gateway/types.js';
import type { RouterInput } from '../../src/ai/contract.js';
import type { RecordInput } from '../../src/ai/prompt-record.js';
import {
  anthropicComplete,
  geminiComplete,
  openaiComplete,
  geminiSearch,
  DEFAULT_ANTHROPIC_MODELS,
  DEFAULT_GEMINI_MODELS,
  DEFAULT_OPENAI_MODELS,
  type ProviderCallResult,
} from './providers.js';
import {
  mockRouterOutput,
  mockRecordOutput,
  mockLaneStep,
  mockAgentStep,
  type LaneStepMeta,
} from './mock.js';
import { generateImage, editImage, detectImageElements, askImage } from './image.js';
import { synthSpeech } from './tts.js';

export interface GatewayConfig {
  anthropicKey?: string;
  geminiKey?: string;
  /** OpenAI(GPT) — 폴백 프로바이더(다른 모델 부재/실패 시). */
  openaiKey?: string;
  /** Gemini image model, e.g. gemini-2.0-flash-preview-image-generation. */
  imageModel?: string;
  /** Gemini Veo video model, e.g. veo-3.0-generate-001 (전용 영상 엔드포인트에서 사용). */
  videoModel?: string;
  /** NCP CLOVA Voice (task "tts") — 키 없으면 클라이언트가 브라우저 TTS 로 폴백. */
  clovaId?: string;
  clovaSecret?: string;
  /** CLOVA 화자 오버라이드(톤별). 미설정 시 'nara'. */
  clovaSpeakerBright?: string;
  clovaSpeakerCalm?: string;
  /** Optional model overrides, e.g. { 'anthropic.low': 'claude-haiku-4-5' }. */
  models?: Record<string, string>;
}

function defaultTier(task: string): Tier {
  return task === 'router' ? 'low' : 'mid';
}

function resolveModel(config: GatewayConfig, provider: Provider, tier: Tier): string {
  const override = config.models?.[`${provider}.${tier}`];
  if (override) return override;
  if (provider === 'anthropic') return DEFAULT_ANTHROPIC_MODELS[tier];
  if (provider === 'openai') return DEFAULT_OPENAI_MODELS[tier];
  return DEFAULT_GEMINI_MODELS[tier];
}

/** 시도할 프로바이더를 순서대로 — 키 있는 것만. 원하는(wanted) 프로바이더 먼저, 그 다음
    헌장 순서(anthropic→gemini)로, 마지막에 OpenAI 폴백. 한 프로바이더가 실패하면 다음으로
    캐스케이드(무효 anthropic 키가 있어도 gemini/openai 로 넘어감). */
function providerOrder(req: GatewayRequest, config: GatewayConfig): Provider[] {
  const has: Record<Provider, boolean> = {
    anthropic: !!config.anthropicKey,
    gemini: !!config.geminiKey,
    openai: !!config.openaiKey,
  };
  const wanted = req.provider ?? 'auto';
  const order: Provider[] = [];
  const push = (p: Provider) => {
    if (has[p] && !order.includes(p)) order.push(p);
  };
  if (wanted !== 'auto') push(wanted);
  // auto 및 폴백 순서: 헌장 기본(anthropic→gemini) 다음 OpenAI.
  push('anthropic');
  push('gemini');
  push('openai');
  return order;
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
    const meta = (req.meta ?? {}) as {
      prompt?: string;
      caption?: string;
      aspectRatio?: string;
      images?: string[];
      image?: string;
    };
    // 입력 이미지가 있으면 편집(인페인팅·변형) 경로, 없으면 텍스트→이미지 생성.
    const imgs = meta.images ?? (meta.image ? [meta.image] : undefined);
    if (imgs && imgs.length > 0) {
      const { image, real, detail } = await editImage({
        geminiKey: config.geminiKey,
        model: config.imageModel,
        prompt: meta.prompt ?? '이미지를 자연스럽게 편집',
        caption: meta.caption ?? '편집',
        images: imgs,
      });
      return { ok: true, image, mocked: !real, error: real ? undefined : detail };
    }
    const { image, real, detail } = await generateImage({
      geminiKey: config.geminiKey,
      openaiKey: config.openaiKey,
      openaiImageModel: config.models?.['openai.image'],
      model: config.imageModel,
      prompt: meta.prompt ?? meta.caption ?? '유아 활동 개념 일러스트',
      caption: meta.caption ?? '활동',
      aspectRatio: meta.aspectRatio,
    });
    return { ok: true, image, mocked: !real, error: real ? undefined : detail };
  }

  // ---- Detect task: Gemini vision element detection (레이어 분리용 경계상자). ----
  if (req.task === 'detect') {
    const meta = (req.meta ?? {}) as { image?: string; max?: number };
    const { regions, mocked, detail } = await detectImageElements({
      geminiKey: config.geminiKey,
      image: meta.image ?? '',
      max: meta.max,
    });
    return { ok: true, regions, mocked, error: mocked ? detail : undefined };
  }

  // ---- Vision Q&A task: 이미지 한 장에 대한 단답 질문(예: 주인공 방향 분석). ----
  if (req.task === 'vision') {
    const meta = (req.meta ?? {}) as { image?: string; question?: string };
    const { text, mocked, detail } = await askImage({
      geminiKey: config.geminiKey,
      image: meta.image ?? '',
      question: meta.question ?? '',
    });
    return { ok: true, text, mocked, error: mocked ? detail : undefined };
  }

  // ---- TTS task: CLOVA Voice 합성(키 있으면 real mp3, 없으면 mocked → 브라우저 폴백). ----
  if (req.task === 'tts') {
    const meta = (req.meta ?? {}) as { text?: string; tone?: 'bright' | 'calm'; locale?: string };
    const { audio, real, detail } = await synthSpeech({
      clientId: config.clovaId,
      clientSecret: config.clovaSecret,
      speakerBright: config.clovaSpeakerBright,
      speakerCalm: config.clovaSpeakerCalm,
      text: meta.text ?? '',
      tone: meta.tone,
      locale: meta.locale,
    });
    return { ok: true, audio, mocked: !real, error: real ? undefined : detail };
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

  const providers = providerOrder(req, config);

  // ---- Mock fallback: no provider key configured. ----
  if (providers.length === 0) {
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
    return { ok: false, error: 'no AI provider configured (set OPENAI_API_KEY / ANTHROPIC_API_KEY / GEMINI_API_KEY)' };
  }

  // ---- Tier list: requested tier first, then cascade fallback. ----
  const primary: Tier = req.tier && req.tier !== 'auto' ? req.tier : defaultTier(req.task);
  const tiers: Tier[] = [primary, ...(req.fallback ?? [])].filter(
    (t, i, a) => a.indexOf(t) === i,
  );

  // 프로바이더 간 캐스케이드 — 한 프로바이더의 모든 tier 실패 시 다음 프로바이더(→ OpenAI 폴백)로.
  let lastError = '';
  let lastProvider: Provider | undefined;
  for (const provider of providers) {
    const apiKey =
      provider === 'openai' ? config.openaiKey! : provider === 'anthropic' ? config.anthropicKey! : config.geminiKey!;
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
          provider === 'openai'
            ? await openaiComplete(opts)
            : provider === 'anthropic'
              ? await anthropicComplete(opts)
              : await geminiComplete(opts);
        return { ok: true, text: result.text, provider, model, tier, usage: result.usage };
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
        lastProvider = provider;
        // cascade: next tier, then next provider (PRD §7.2.3 + OpenAI 폴백)
      }
    }
  }

  return { ok: false, error: lastError || 'all provider tiers failed', provider: lastProvider };
}
