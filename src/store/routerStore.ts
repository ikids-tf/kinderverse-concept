import { create } from 'zustand';
import { runRouter } from '@/ai/agents/router';
import { runRecord } from '@/ai/agents/record';
import { runPlan } from '@/ai/agents/plan';
import { runStudioWorksheet } from '@/ai/agents/studio';
import { runWriting } from '@/ai/agents/writing';
import { buildAgentContext } from '@/ai/context';
import type { RouterInput, RouterOutput, RouteTarget } from '@/ai/contract';
import type { RegistryPayload } from '@/ui-registry/contracts';

/** Routes whose Tier1 agent runs inline in chat (M3/M6/M7). */
export const INLINE_ROUTES: RouteTarget[] = ['record', 'plan', 'studio', 'writing'];

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

export const useRouterStore = create<RouterState>((set) => ({
  turns: [],

  send: async (input) => {
    const id = nextId();
    set((s) => ({
      turns: [...s.turns, { id, text: input.text, status: 'routing' }],
    }));

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
          t.id === id
            ? { ...t, status: 'error', warning: e instanceof Error ? e.message : String(e) }
            : t,
        ),
      }));
    }
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
