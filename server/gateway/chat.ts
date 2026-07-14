/* Streaming chat endpoint (reference KinderVerse parity).
   Proxies a free-form conversational answer as Server-Sent Events so the AI 채팅
   page can render token-by-token. Keys stay server-side (CLAUDE §1, PRD §7.4):
   the browser only ever talks to /api/ai/chat.

   Wire format = Anthropic SSE (`data: {type:"content_block_delta",
   delta:{type:"text_delta", text}}`), so a single client parser handles every
   provider:
   - Anthropic key → pass the upstream stream through verbatim (real streaming).
   - Gemini key    → one completion, then emit it in small deltas (typewriter).
   - no key        → a canned markdown demo answer, streamed the same way.        */

import type { ServerResponse } from 'node:http';
import type { GatewayConfig } from './handler.js';
import { geminiComplete, openaiComplete, DEFAULT_ANTHROPIC_MODELS, DEFAULT_GEMINI_MODELS, DEFAULT_OPENAI_MODELS } from './providers.js';

export interface ChatStreamBody {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  system?: string;
}

const DEMO_MD = `**데모 모드로 응답하고 있어요.** 실제 모델 연결은 \`.env\`에 API 키만 넣으면 바로 켜집니다.

## 지금도 되는 것
- 카드를 선택하지 않고 무엇이든 입력하면 이렇게 **채팅**으로 답해 드려요.
- 소제목·**굵은 강조**·목록으로 가독성 높게 정리합니다.
- 비교가 필요하면 표도 사용해요.

## 실제 AI 연결
1. 프로젝트 루트 \`.env\`에 \`ANTHROPIC_API_KEY=sk-ant-...\` 를 넣으세요.
2. 개발 서버를 다시 시작하면 실제 Claude가 스트리밍으로 응답합니다.

필요하시면 이어서 더 구체적으로 도와드릴게요.`;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function sseDelta(text: string): string {
  return `data: ${JSON.stringify({
    type: 'content_block_delta',
    delta: { type: 'text_delta', text },
  })}\n\n`;
}

/** Emit a string as gentle ~18-char deltas (typewriter feel) for the non-real
    providers, so demo/Gemini answers stream like the live one. */
async function typewrite(res: ServerResponse, text: string): Promise<void> {
  const chunks = text.match(/[\s\S]{1,18}/g) ?? [];
  for (const c of chunks) {
    res.write(sseDelta(c));
    await sleep(16);
  }
}

function startSse(res: ServerResponse) {
  res.statusCode = 200;
  res.setHeader('content-type', 'text/event-stream; charset=utf-8');
  res.setHeader('cache-control', 'no-cache, no-transform');
  res.setHeader('connection', 'keep-alive');
}

export async function streamChatResponse(
  res: ServerResponse,
  body: ChatStreamBody,
  config: GatewayConfig,
): Promise<void> {
  startSse(res);
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const system = typeof body?.system === 'string' ? body.system : undefined;

  // ---- Anthropic: real streaming, passed through verbatim. 실패(예: 401) 시 폴백으로 흐름. ----
  if (config.anthropicKey) {
    const model = config.models?.['anthropic.mid'] || DEFAULT_ANTHROPIC_MODELS.mid;
    try {
      const upstream = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': config.anthropicKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ model, max_tokens: 2048, stream: true, system, messages }),
      });
      if (upstream.ok && upstream.body) {
        const reader = upstream.body.getReader();
        const dec = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(dec.decode(value, { stream: true }));
        }
        res.write('\n');
        res.end();
        return;
      }
      // !ok(예: 401) → 에러로 끝내지 않고 gemini/openai 폴백으로.
    } catch {
      // 네트워크 실패 → 폴백으로.
    }
  }

  // ---- Gemini: one completion, then typewrite. 실패 시 openai 폴백으로. ----
  if (config.geminiKey) {
    const model = config.models?.['gemini.mid'] || DEFAULT_GEMINI_MODELS.mid;
    try {
      const { text } = await geminiComplete({ apiKey: config.geminiKey, model, system, messages, maxTokens: 2048 });
      await typewrite(res, text || '응답을 생성하지 못했어요. 다시 시도해 주세요.');
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    } catch {
      // 폴백(openai)으로.
    }
  }

  // ---- OpenAI: 폴백 — one completion, then typewrite. ----
  if (config.openaiKey) {
    const model = config.models?.['openai.mid'] || DEFAULT_OPENAI_MODELS.mid;
    try {
      const { text } = await openaiComplete({ apiKey: config.openaiKey, model, system, messages, maxTokens: 2048 });
      await typewrite(res, text || '응답을 생성하지 못했어요. 다시 시도해 주세요.');
    } catch (e) {
      res.write(sseDelta(`⚠️ ${e instanceof Error ? e.message : String(e)}`));
    }
    res.write('data: [DONE]\n\n');
    res.end();
    return;
  }

  // ---- No key: demo answer (keeps the page fully runnable offline). ----
  await typewrite(res, DEMO_MD);
  res.write('data: [DONE]\n\n');
  res.end();
}
