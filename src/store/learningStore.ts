import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/* 자가고도화 (PRD §8). 클라이언트 학습 루프 — 로컬 영속(누적 데이터).
   루프: [생성]→[교사 편집/채택]→[신호+diff 저장]→[distill: 선호·exemplar 갱신]
   →[다음 생성에 주입]→채택률↑/편집량↓ (§8.2). 백엔드 distill은 추후 GitHub
   Actions로 이전; 여기선 distill()이 그 배치를 대신한다. */

export type LengthPref = 'concise' | 'detailed' | 'unknown';

export interface EditEvent {
  id: string;
  task: string; // 'writing' | 'record' | ...
  artifactType: string; // 'LetterPreview' | 'RecordDraftCard' | ...
  beforeLen: number;
  afterLen: number;
  accepted: boolean; // true = 수정 없이 채택, false = 편집함
  tone?: string;
  ts: number;
}

export interface Exemplar {
  id: string;
  task: string;
  artifactType: string;
  excerpt: string;
  score: number;
}

export interface LearnedPrefs {
  lengthPref: LengthPref;
  tone?: string;
  notes: string[];
}

interface LearningState {
  events: EditEvent[];
  prefs: LearnedPrefs;
  exemplars: Exemplar[];

  recordEdit: (e: { task: string; artifactType: string; before: string; after: string; tone?: string }) => void;
  recordAccept: (e: { task: string; artifactType: string; content: string; tone?: string }) => void;
  distill: () => void;
  reset: () => void;

  // selectors
  acceptanceRate: () => number;
  avgEditDelta: () => number; // 평균 길이 변화(음수=줄임)
}

let seq = 0;
const id = (p: string) => `${p}_${++seq}_${Date.now().toString(36)}`;

const EMPTY_PREFS: LearnedPrefs = { lengthPref: 'unknown', notes: [] };

export const useLearningStore = create<LearningState>()(
  persist(
    (set, get) => ({
      events: [],
      prefs: EMPTY_PREFS,
      exemplars: [],

      recordEdit: ({ task, artifactType, before, after, tone }) => {
        const changed = before.trim() !== after.trim();
        set((s) => ({
          events: [
            ...s.events,
            {
              id: id('ev'),
              task,
              artifactType,
              beforeLen: before.length,
              afterLen: after.length,
              accepted: !changed,
              tone,
              ts: Date.now(),
            },
          ],
        }));
        get().distill();
      },

      recordAccept: ({ task, artifactType, content, tone }) => {
        set((s) => ({
          events: [
            ...s.events,
            { id: id('ev'), task, artifactType, beforeLen: content.length, afterLen: content.length, accepted: true, tone, ts: Date.now() },
          ],
          exemplars: [
            { id: id('ex'), task, artifactType, excerpt: content.slice(0, 240), score: 1 },
            ...s.exemplars,
          ].slice(0, 8),
        }));
        get().distill();
      },

      /* Consolidate signals → learned prefs (the "nightly distill"). */
      distill: () => {
        const { events } = get();
        if (events.length === 0) {
          set({ prefs: EMPTY_PREFS });
          return;
        }
        const edits = events.filter((e) => !e.accepted);
        const deltas = edits.map((e) => e.afterLen - e.beforeLen);
        const avgDelta = deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : 0;
        const lengthPref: LengthPref =
          deltas.length < 1 ? 'unknown' : avgDelta < -20 ? 'concise' : avgDelta > 40 ? 'detailed' : 'unknown';

        // tone from accepted/edited tone signals (most frequent)
        const toneCounts: Record<string, number> = {};
        for (const e of events) if (e.tone) toneCounts[e.tone] = (toneCounts[e.tone] ?? 0) + 1;
        const tone = Object.entries(toneCounts).sort((a, b) => b[1] - a[1])[0]?.[0];

        const notes: string[] = [];
        if (lengthPref === 'concise') notes.push('교사는 더 간결한 문장을 선호합니다(편집 시 분량을 줄임).');
        if (lengthPref === 'detailed') notes.push('교사는 더 풍부한 서술을 선호합니다(편집 시 분량을 늘림).');
        if (tone) notes.push(`선호 톤: ${tone}.`);

        set({ prefs: { lengthPref, tone, notes } });
      },

      reset: () => set({ events: [], prefs: EMPTY_PREFS, exemplars: [] }),

      acceptanceRate: () => {
        const { events } = get();
        if (events.length === 0) return 0;
        return events.filter((e) => e.accepted).length / events.length;
      },
      avgEditDelta: () => {
        const edits = get().events.filter((e) => !e.accepted);
        if (edits.length === 0) return 0;
        return edits.reduce((a, e) => a + (e.afterLen - e.beforeLen), 0) / edits.length;
      },
    }),
    {
      name: 'kv-learning',
      partialize: (s) => ({ events: s.events, prefs: s.prefs, exemplars: s.exemplars }),
    },
  ),
);

/* L3 prompt injection — learned preferences + a top exemplar (RAG, §8.1).
   "지난번엔 이렇게 쓰셨더라고요"를 다음 생성에 선반영. */
export function buildLearnedContext(task?: string): string {
  const s = useLearningStore.getState();
  const lines: string[] = [];
  if (s.prefs.notes.length) {
    lines.push('[학습된 교사 선호]');
    lines.push(...s.prefs.notes.map((n) => `- ${n}`));
  }
  const ex = task ? s.exemplars.find((e) => e.task === task) : s.exemplars[0];
  if (ex) {
    lines.push(`[우수 산출물 예시(참고 톤/형식)]\n${ex.excerpt}`);
  }
  return lines.join('\n');
}
