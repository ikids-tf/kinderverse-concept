import { create } from 'zustand';
import { runRouter } from '@/ai/agents/router';
import { runRecord } from '@/ai/agents/record';
import { runPlan } from '@/ai/agents/plan';
import { runStudioWorksheet } from '@/ai/agents/studio';
import { runWriting } from '@/ai/agents/writing';
import { buildAgentContext } from '@/ai/context';
import { streamChat, buildChatSystem, type ChatMsg } from '@/ai/chat';
import { callGateway } from '@/ai/client';
import { KV_ART_STYLE } from '@/ai/agents/studio';
import { contentIntentFast, imageSubject, coreTopic, requestedCount } from '@/ai/intent-lexicon';
import type { RouterInput, RouterOutput, RouteTarget } from '@/ai/contract';
import type { RegistryPayload } from '@/ui-registry/contracts';

/** 채팅에서 '그림/이미지 생성' 요청인지 — 활동지·도안·계획 등은 우선순위에서 먼저 걸러지고(intent==='image'),
    생성 동사가 있을 때만 그림 생성으로 본다("그림책 뭐야?" 같은 단순 질문 제외). */
const IMG_VERB_RE = /(그려|그리|만들|생성|뽑아|그려\s*줘|만들어)/;
export function isImageRequest(text: string): boolean {
  return contentIntentFast(text) === 'image' && IMG_VERB_RE.test(text);
}

/** 생성한 그림(채팅 턴에 인라인 표시). */
export interface ChatImages {
  status: 'generating' | 'done' | 'error';
  urls: string[];
  caption?: string;
  mocked?: boolean;
}

/** Routes whose Tier1 agent runs inline in chat (M3/M6/M7). */
export const INLINE_ROUTES: RouteTarget[] = ['record', 'plan', 'studio', 'writing'];

/** Conversational answer streamed onto a turn (reference KinderVerse parity). */
export interface ChatAnswer {
  content: string;
  streaming: boolean;
  error?: boolean;
}

/* Only one conversational stream is in flight at a time (mirrors the reference). */
let activeChatAbort: AbortController | null = null;

/* Task-state slice (CLAUDE.md §5 — 전역/보드/태스크 분리).
   Holds the running router conversation surfaced on the AI chat page, plus the
   AUI result of any Tier1 agent run for a turn. */

export interface RouterTurn {
  id: string;
  text: string;
  status: 'routing' | 'done' | 'error';
  output?: RouterOutput;
  provider?: string;
  model?: string;
  mocked?: boolean;
  warning?: string;
  // Streamed conversational answer (the headline reply, reference style).
  chat?: ChatAnswer;
  // 생성한 그림(이미지 요청 턴) — 게이트웨이 task:'image'로 만든 그림을 인라인 표시.
  image?: ChatImages;
  // Tier1 agent result (e.g. record) rendered via the AUI registry.
  resultStatus?: 'running' | 'done' | 'error';
  result?: RegistryPayload;
  resultMocked?: boolean;
  resultWarning?: string;
}

interface RouterState {
  turns: RouterTurn[];
  send: (input: RouterInput) => Promise<void>;
  /** Run the Tier1 agent the router chose for a turn and store its AUI payload. */
  runResult: (turnId: string) => Promise<void>;
  clear: () => void;
}

let seq = 0;
const nextId = () => `turn_${++seq}`;

export const useRouterStore = create<RouterState>((set, get) => ({
  turns: [],

  send: async (input) => {
    const id = nextId();
    // Build chat history from prior turns BEFORE appending this one.
    const history: ChatMsg[] = [];
    for (const t of get().turns) {
      history.push({ role: 'user', content: t.text });
      if (t.chat?.content) history.push({ role: 'assistant', content: t.chat.content });
    }
    history.push({ role: 'user', content: input.text });

    // (0) 그림/이미지 생성 요청 — 게이트웨이 task:'image'로 만들어 인라인 표시(텍스트 스트림·라우터 생략).
    if (isImageRequest(input.text)) {
      set((s) => ({
        turns: [...s.turns, { id, text: input.text, status: 'done', image: { status: 'generating', urls: [] } }],
      }));
      const subject = imageSubject(input.text) || coreTopic(input.text) || input.text.trim();
      const n = Math.min(4, Math.max(1, requestedCount(input.text) ?? 1));
      try {
        const results = await Promise.all(
          Array.from({ length: n }, () =>
            callGateway({
              task: 'image',
              provider: 'auto',
              messages: [],
              meta: { prompt: `${subject} — ${KV_ART_STYLE}`, caption: subject },
            }),
          ),
        );
        const urls = results.map((r) => r.image).filter((u): u is string => !!u);
        const mocked = results.some((r) => r.mocked);
        set((s) => ({
          turns: s.turns.map((t) =>
            t.id === id
              ? {
                  ...t,
                  image: { status: urls.length ? 'done' : 'error', urls, caption: subject, mocked },
                  chat: urls.length
                    ? { content: `'${subject}' 그림이에요. 다르게 그리고 싶으면 말씀해 주세요.`, streaming: false }
                    : { content: '그림을 만들지 못했어요. 다시 시도해 주세요.', streaming: false, error: true },
                }
              : t,
          ),
        }));
      } catch (e) {
        set((s) => ({
          turns: s.turns.map((t) =>
            t.id === id
              ? {
                  ...t,
                  image: { status: 'error', urls: [], caption: subject },
                  chat: { content: `⚠️ 그림 생성 오류: ${e instanceof Error ? e.message : String(e)}`, streaming: false, error: true },
                }
              : t,
          ),
        }));
      }
      return;
    }

    set((s) => ({
      turns: [...s.turns, { id, text: input.text, status: 'routing', chat: { content: '', streaming: true } }],
    }));

    // (1) Streamed conversational answer — the headline reply (reference style).
    if (activeChatAbort) activeChatAbort.abort();
    const ctrl = new AbortController();
    activeChatAbort = ctrl;
    const streamP = streamChat(history, {
      system: buildChatSystem(),
      signal: ctrl.signal,
      onDelta: (delta) => {
        set((s) => ({
          turns: s.turns.map((t) =>
            t.id === id ? { ...t, chat: { content: (t.chat?.content ?? '') + delta, streaming: true } } : t,
          ),
        }));
      },
    })
      .then(() => {
        set((s) => ({
          turns: s.turns.map((t) =>
            t.id === id && t.chat ? { ...t, chat: { ...t.chat, streaming: false } } : t,
          ),
        }));
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        set((s) => ({
          turns: s.turns.map((t) =>
            t.id === id
              ? {
                  ...t,
                  chat: {
                    content: t.chat?.content || `⚠️ ${e instanceof Error ? e.message : String(e)}`,
                    streaming: false,
                    error: true,
                  },
                }
              : t,
          ),
        }));
      })
      .finally(() => {
        if (activeChatAbort === ctrl) activeChatAbort = null;
      });

    // (2) Router (task detection) runs in parallel → surfaced as a contextual action.
    const routerP = (async () => {
      try {
        const result = await runRouter(input, buildAgentContext('router'));
        set((s) => ({
          turns: s.turns.map((t) =>
            t.id === id
              ? {
                  ...t,
                  status: 'done',
                  output: result.output,
                  provider: result.provider,
                  model: result.model,
                  mocked: result.mocked,
                  warning: result.warning,
                }
              : t,
          ),
        }));
      } catch (e) {
        set((s) => ({
          turns: s.turns.map((t) =>
            t.id === id ? { ...t, status: 'error', warning: e instanceof Error ? e.message : String(e) } : t,
          ),
        }));
      }
    })();

    await Promise.allSettled([streamP, routerP]);
  },

  runResult: async (turnId) => {
    let target: RouterTurn | undefined;
    set((s) => {
      target = s.turns.find((t) => t.id === turnId);
      return {
        turns: s.turns.map((t) => (t.id === turnId ? { ...t, resultStatus: 'running' } : t)),
      };
    });
    const output = target?.output;
    if (!target || !output || !output.route_to || !INLINE_ROUTES.includes(output.route_to)) {
      set((s) => ({
        turns: s.turns.map((t) =>
          t.id === turnId ? { ...t, resultStatus: 'error', resultWarning: '이 라우트는 인라인 실행을 지원하지 않습니다.' } : t,
        ),
      }));
      return;
    }

    const ctx = buildAgentContext(output.route_to);
    try {
      let payload: RegistryPayload;
      let mocked: boolean | undefined;
      let warning: string | undefined;
      if (output.route_to === 'record') {
        const res = await runRecord(
          { text: target.text, mode: output.mode ?? 'story', grounding: { photos: [], teacher_notes: [target.text] } },
          ctx,
        );
        payload = res.payload;
        mocked = res.mocked;
        warning = res.warning;
      } else if (output.route_to === 'plan') {
        const res = await runPlan(target.text, [], ctx);
        payload = res.payload;
        mocked = res.mocked;
        warning = res.warning;
      } else if (output.route_to === 'writing') {
        const res = await runWriting(target.text, ctx);
        payload = res.payload;
        mocked = res.mocked;
        warning = res.warning;
      } else {
        const res = await runStudioWorksheet(target.text, ctx);
        payload = res.payload;
        mocked = res.mocked;
        warning = res.warning;
      }
      set((s) => ({
        turns: s.turns.map((t) =>
          t.id === turnId
            ? { ...t, resultStatus: 'done', result: payload, resultMocked: mocked, resultWarning: warning }
            : t,
        ),
      }));
    } catch (e) {
      set((s) => ({
        turns: s.turns.map((t) =>
          t.id === turnId
            ? { ...t, resultStatus: 'error', resultWarning: e instanceof Error ? e.message : String(e) }
            : t,
        ),
      }));
    }
  },

  clear: () => set({ turns: [] }),
}));
