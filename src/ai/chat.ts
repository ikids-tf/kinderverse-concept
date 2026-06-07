import { PEDAGOGY_FOUNDATION } from './pedagogy';
import { buildAgentContext } from './context';

/* Streaming conversational chat (reference KinderVerse parity).
   The browser calls /api/ai/chat (SSE) — keys stay server-side. This module owns
   (1) the editorial system prompt that shapes answer style, and (2) the SSE
   parser that surfaces text deltas to the caller. */

export interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
}

export const CHAT_ENDPOINT = '/api/ai/chat';

/* ---- L0/L1/format/L3 system prompt (편집 디자인 답변 스타일) ---- */

const CHAT_L0 = `너는 킨더버스(KinderVerse)의 AI 교육 도우미다. 유치원·어린이집 교사를 돕는다. 모든 답변은 한국어로, 전문 편집 디자이너가 다듬은 듯 가독성 높게 작성한다.`;

const CHAT_FORMAT = `[형식 규칙]
- 맨 앞에 1~2문장으로 핵심을 먼저 말하는 '도입'을 둔다.
- 본문은 \`##\` 소제목으로 구역을 나누고, 핵심어는 **굵게** 강조한다.
- 나열은 \`-\` 목록 또는 번호 목록으로, 비교·정리가 필요하면 마크다운 표를 사용한다.
- 문단은 2~3문장으로 짧게 끊어 시각적 여백을 준다.
- 마지막에 한 문장으로 '마무리'하거나 다음 행동을 제안한다.

[어조] 따뜻하고 전문적이며 과장 없이. 유아교육 현장(누리과정/표준보육과정) 맥락을 반영한다.
[안전] 특정 아동에 대한 관찰·평가 단정은 근거(사진·교사메모) 없이는 하지 말고, 일반적 지침으로 답한다. 아동 식별정보는 일반화한다.`;

/** Assemble the chat system prompt: L0 + L1(Pedagogy) + format + L3(tenant/learned). */
export function buildChatSystem(): string {
  const l3 = buildAgentContext('chat').trim();
  return [
    CHAT_L0,
    PEDAGOGY_FOUNDATION,
    CHAT_FORMAT,
    l3 ? `[테넌트/교사 컨텍스트]\n${l3}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

/* ---- SSE client: parse Anthropic-style text deltas ---- */

export interface StreamChatOpts {
  system?: string;
  signal?: AbortSignal;
  onDelta: (text: string) => void;
}

/** Stream a conversational answer, calling onDelta for each text chunk.
    Resolves when the stream ends; rejects on transport error / abort. */
export async function streamChat(messages: ChatMsg[], opts: StreamChatOpts): Promise<void> {
  const res = await fetch(CHAT_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages, system: opts.system }),
    signal: opts.signal,
  });
  if (!res.ok || !res.body) throw new Error(`chat HTTP ${res.status}`);

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });

    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const data = t.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      try {
        const evt = JSON.parse(data) as {
          type?: string;
          delta?: { type?: string; text?: string };
        };
        if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta' && evt.delta.text) {
          opts.onDelta(evt.delta.text);
        }
      } catch {
        /* partial/non-JSON keepalive line — keep reading */
      }
    }
  }
}
