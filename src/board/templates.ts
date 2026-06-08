import type { RouteTarget } from '@/ai/contract';

/* Data-driven frame templates for the Frame Composer (src/board/composer.ts).
   The router's route_to selects a template; the composer fills its regions with
   existing Tier1 agents and attaches the next-step chips. Adding a template is a
   table edit (mirrors PAGE_ACTIONS / LANE_TEMPLATES). */

export type ComposerIntent = 'play_plan' | 'mindmap' | 'observation' | 'studio' | 'writing' | 'general';

export type FillAgent =
  | 'plan.ideas'
  | 'plan.grid'
  | 'studio.images'
  | 'studio.coloring'
  | 'studio.worksheet'
  | 'writing.letter'
  | 'record'
  | 'memo'
  | 'source.web';

export interface FrameRegion {
  id: string;
  agent: FillAgent;
  /** core = always filled (simple & complex); expand = complex only. */
  tier: 'core' | 'expand';
  /** run/placement order within the frame. */
  order: number;
  /** BoardNode.data.role tag for the spawned card(s). */
  role?: string;
}

export interface NextStepDef {
  action: FillAgent | 'generate';
  label: string;
  /** Optional follow-up seed; defaults to the frame topic. */
  prompt?: string;
}

export interface FrameTemplate {
  id: ComposerIntent;
  title: string;
  routeMatch: (RouteTarget | null)[];
  regions: FrameRegion[];
  nextSteps: NextStepDef[];
}

export const FRAME_TEMPLATES: Record<ComposerIntent, FrameTemplate> = {
  play_plan: {
    id: 'play_plan',
    title: '놀이계획',
    routeMatch: ['plan'],
    regions: [
      { id: 'ideas', agent: 'plan.ideas', tier: 'expand', order: 0, role: 'idea' },
      { id: 'plan', agent: 'plan.grid', tier: 'core', order: 1, role: 'plan' },
      { id: 'images', agent: 'studio.images', tier: 'expand', order: 2, role: 'image' },
    ],
    nextSteps: [
      { action: 'studio.worksheet', label: '활동지 추가' },
      { action: 'writing.letter', label: '가정통신문 작성' },
      { action: 'source.web', label: '웹에서 자료 찾기' },
    ],
  },
  mindmap: {
    id: 'mindmap',
    title: '생각그물',
    routeMatch: ['mindmap'],
    // buildMindMap (composer.ts) handles the radial layout itself before pickTemplate
    // is reached; this entry only keeps FRAME_TEMPLATES exhaustive. regions/chips nominal.
    regions: [{ id: 'branches', agent: 'plan.ideas', tier: 'core', order: 0, role: 'mm-branch' }],
    nextSteps: [
      { action: 'studio.images', label: '활동 이미지 추가' },
      { action: 'source.web', label: '웹에서 자료 찾기' },
    ],
  },
  observation: {
    id: 'observation',
    title: '관찰기록',
    routeMatch: ['record'],
    regions: [{ id: 'record', agent: 'record', tier: 'core', order: 0, role: 'record' }],
    nextSteps: [
      { action: 'writing.letter', label: '가정통신문으로' },
      { action: 'source.web', label: '발달 참고자료 찾기' },
    ],
  },
  studio: {
    id: 'studio',
    title: '활동지·도안',
    // 'core' agent is swapped worksheet↔coloring by the composer per the prompt.
    routeMatch: ['studio'],
    regions: [
      { id: 'core', agent: 'studio.worksheet', tier: 'core', order: 0, role: 'worksheet' },
      { id: 'images', agent: 'studio.images', tier: 'expand', order: 1, role: 'image' },
    ],
    nextSteps: [
      { action: 'studio.coloring', label: '색칠 도안 추가' },
      { action: 'writing.letter', label: '안내문 작성' },
      { action: 'source.web', label: '웹에서 자료 찾기' },
    ],
  },
  writing: {
    id: 'writing',
    title: '가정통신문',
    routeMatch: ['writing'],
    regions: [{ id: 'letter', agent: 'writing.letter', tier: 'core', order: 0, role: 'letter' }],
    nextSteps: [
      { action: 'studio.images', label: '장식 이미지 추가' },
      { action: 'source.web', label: '웹에서 자료 찾기' },
    ],
  },
  general: {
    id: 'general',
    title: '보드',
    routeMatch: ['router', null],
    regions: [{ id: 'memo', agent: 'memo', tier: 'core', order: 0 }],
    nextSteps: [
      { action: 'source.web', label: '웹에서 자료 찾기' },
      { action: 'generate', label: '관련 카드 추가' },
    ],
  },
};

/** Pick a template by the router's route_to (falls back to general). */
export function pickTemplate(routeTo: RouteTarget | null): FrameTemplate {
  for (const t of Object.values(FRAME_TEMPLATES)) {
    if (t.routeMatch.includes(routeTo)) return t;
  }
  return FRAME_TEMPLATES.general;
}
