/* Server-side provider adapters — direct API calls, no SDK/framework
   (CLAUDE.md §1, PRD §7.4). Runs only in Node (Vite dev middleware / serverless);
   API keys never reach the browser. */

import type { GatewayMessage, Tier } from '../../src/ai/gateway/types.js';

export interface ProviderCallOpts {
  apiKey: string;
  model: string;
  system?: string;
  messages: GatewayMessage[];
  json?: boolean;
  maxTokens?: number;
}

export interface ProviderCallResult {
  text: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}

/* ---- Tier → model maps (overridable via env) ---- */

export const DEFAULT_ANTHROPIC_MODELS: Record<Tier, string> = {
  low: 'claude-haiku-4-5', // router: 저가·고속 (PRD §7.1)
  mid: 'claude-sonnet-4-6',
  high: 'claude-opus-4-8',
};

export const DEFAULT_GEMINI_MODELS: Record<Tier, string> = {
  low: 'gemini-2.5-flash',
  mid: 'gemini-2.5-flash',
  high: 'gemini-2.5-pro',
};

// OpenAI — 로컬 테스트 전용(charter §1 은 Anthropic+Gemini 기본). OPENAI_API_KEY 가
// 설정된 개발 환경에서만 auto 가 이 프로바이더를 고른다. 프로덕션은 키 미설정 → 무영향.
// 비용 최소화: 전 tier 를 최저가 텍스트 모델(gpt-4o-mini)로. 필요 시 KV_OPENAI_MODEL_* 로 상향.
export const DEFAULT_OPENAI_MODELS: Record<Tier, string> = {
  low: 'gpt-4o-mini',
  mid: 'gpt-4o-mini',
  high: 'gpt-4o-mini',
};

// OpenAI 이미지(gpt-image-1) — 로컬 테스트 이미지 생성. 비용 최소화 기본값: 미디엄 품질 + 최소 사이즈.
export const DEFAULT_OPENAI_IMAGE_MODEL = 'gpt-image-1';
export const DEFAULT_OPENAI_IMAGE_QUALITY = 'medium'; // low | medium | high | auto
export const DEFAULT_OPENAI_IMAGE_SIZE = '1024x1024'; // gpt-image-1 최소(정사각) = 최저가

/* ---- Anthropic Messages API (direct fetch) ---- */

export async function anthropicComplete(opts: ProviderCallOpts): Promise<ProviderCallResult> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': opts.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 1024,
      system: opts.system,
      messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`anthropic ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const text = (data.content ?? [])
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('');
  return { text, usage: data.usage };
}

/* ---- OpenAI Chat Completions (direct fetch, no SDK) — 로컬 테스트 전용 ---- */

export async function openaiComplete(opts: ProviderCallOpts): Promise<ProviderCallResult> {
  const messages: Array<{ role: string; content: string }> = [];
  if (opts.system) messages.push({ role: 'system', content: opts.system });
  for (const m of opts.messages) messages.push({ role: m.role, content: m.content });

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${opts.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 1024,
      messages,
      ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`openai ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const text = data.choices?.[0]?.message?.content ?? '';
  return {
    text,
    usage: {
      input_tokens: data.usage?.prompt_tokens,
      output_tokens: data.usage?.completion_tokens,
    },
  };
}

/* ---- Gemini generateContent (direct fetch) ---- */

export async function geminiComplete(opts: ProviderCallOpts): Promise<ProviderCallResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    opts.model,
  )}:generateContent?key=${encodeURIComponent(opts.apiKey)}`;

  const body: Record<string, unknown> = {
    contents: opts.messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    generationConfig: {
      maxOutputTokens: opts.maxTokens ?? 1024,
      ...(opts.json ? { responseMimeType: 'application/json' } : {}),
    },
  };
  if (opts.system) {
    body.systemInstruction = { parts: [{ text: opts.system }] };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`gemini ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  const text = (data.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? '')
    .join('');
  return {
    text,
    usage: {
      input_tokens: data.usageMetadata?.promptTokenCount,
      output_tokens: data.usageMetadata?.candidatesTokenCount,
    },
  };
}

/* ---- Gemini grounded web search (Google Search tool) ---- */

export interface SearchResult {
  text: string;
  sources: Array<{ title?: string; url: string }>;
}

export async function geminiSearch(
  apiKey: string,
  model: string,
  query: string,
  system?: string,
): Promise<SearchResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts: [{ text: query }] }],
    tools: [{ google_search: {} }],
    generationConfig: { maxOutputTokens: 900 },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`gemini search ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      groundingMetadata?: { groundingChunks?: Array<{ web?: { uri?: string; title?: string } }> };
    }>;
  };
  const cand = data.candidates?.[0];
  const text = (cand?.content?.parts ?? []).map((p) => p.text ?? '').join('');
  const sources = (cand?.groundingMetadata?.groundingChunks ?? [])
    .map((c) => ({ title: c.web?.title, url: c.web?.uri ?? '' }))
    .filter((s) => s.url);
  return { text, sources };
}
