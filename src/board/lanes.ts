import { runPlanIdeas, runPlan } from '@/ai/agents/plan';
import { runStudioImages, runStudioWorksheet } from '@/ai/agents/studio';
import { buildAgentContext } from '@/ai/context';
import type { WeeklyPlanGridProps } from '@/ui-registry/contracts';
import {
  useBoardStore,
  newId,
  type Lane,
  type LaneStep,
  type StepKind,
} from '@/store/boardStore';

/* Workflow Runner (SKILL §9.3) — orchestration only, NOT a new agent.
   Builds a typed lane from a template and runs each step (template order) by
   calling the DEDICATED Tier1 agents (plan / studio) — M6. Progress is
   click-only; a step's selection feeds the next step (§9.1). Concept images go
   through the studio image plugin (labeled, never real child photos — §9.5). */

interface StepTemplate {
  step: StepKind;
  title: string;
  agent: string;
  selectable: boolean;
}

const PLAY_PLAN_TEMPLATE: StepTemplate[] = [
  { step: 'idea', title: '아이디어 리스트', agent: 'agent.plan', selectable: true },
  { step: 'image', title: '활동 사진(개념)', agent: 'agent.studio', selectable: false },
  { step: 'plan', title: '계획안', agent: 'agent.plan', selectable: false },
  { step: 'worksheet', title: '활동지', agent: 'agent.studio', selectable: false },
];

export const LANE_TEMPLATES: Record<string, { title: string; steps: StepTemplate[] }> = {
  play_plan: { title: '놀이계획 워크플로', steps: PLAY_PLAN_TEMPLATE },
};

export function createLane(template: string, request: string, x: number, y: number): Lane {
  const tpl = LANE_TEMPLATES[template] ?? LANE_TEMPLATES.play_plan;
  const steps: LaneStep[] = tpl.steps.map((t, i) => ({
    id: newId('node'),
    step: t.step,
    order: i,
    title: t.title,
    agent: t.agent,
    status: 'pending',
  }));
  return {
    id: newId('lane'),
    x,
    y,
    template,
    title: request.trim() ? request.trim() : tpl.title,
    status: 'active',
    steps,
    unlocked: 0,
  };
}

/** Run one lane step via the dedicated agent. Click-triggered (no cascade). */
export async function runLaneStep(laneId: string, stepId: string): Promise<void> {
  const board = useBoardStore.getState();
  const lane = board.lanes[laneId];
  if (!lane) return;
  const step = lane.steps.find((s) => s.id === stepId);
  if (!step) return;

  // Selections from the previous step feed this one.
  const prev = lane.steps[step.order - 1];
  let priorSelected: string[] = [];
  if (prev?.selected && prev.content) {
    const items = (prev.content as { items?: Array<{ id: string; label: string }> }).items ?? [];
    priorSelected = items.filter((it) => prev.selected!.includes(it.id)).map((it) => it.label);
  }

  const ctx = buildAgentContext(step.step === 'worksheet' || step.step === 'image' ? 'studio' : 'plan');
  board.updateStep(laneId, stepId, { status: 'running', error: undefined });

  try {
    if (step.step === 'idea') {
      const items = await runPlanIdeas(lane.title, ctx);
      board.updateStep(laneId, stepId, { status: 'ready', content: { items } });
    } else if (step.step === 'image') {
      const res = await runStudioImages(lane.title, priorSelected, ctx);
      board.updateStep(laneId, stepId, { status: 'ready', content: res.payload });
    } else if (step.step === 'plan') {
      const res = await runPlan(lane.title, priorSelected, ctx);
      board.updateStep(laneId, stepId, { status: 'ready', content: res.payload });
    } else if (step.step === 'worksheet') {
      // Link to the plan produced earlier in this lane (SKILL §4.1).
      const planStep = lane.steps.find((s) => s.step === 'plan');
      const planProps = planStep?.content as { type?: string; props?: WeeklyPlanGridProps } | undefined;
      const linkPlanId =
        planProps?.type === 'WeeklyPlanGrid' ? planProps.props?.id : undefined;
      const res = await runStudioWorksheet(lane.title, ctx, linkPlanId);
      board.updateStep(laneId, stepId, { status: 'ready', content: res.payload });
    }
  } catch (e) {
    board.updateStep(laneId, stepId, {
      status: 'error',
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
