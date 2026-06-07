import { useBoardStore, newId, type BoardNode } from '@/store/boardStore';
import { buildAgentContext } from '@/ai/context';
import { runPlanIdeas, runPlan } from '@/ai/agents/plan';
import { runStudioImages, runStudioWorksheet } from '@/ai/agents/studio';
import type { RegistryPayload } from '@/ui-registry/contracts';

/* Workflow-to-board (reference board model): a "새 놀이계획" frame holds a runner
   control; each step spawns BOARD-NATIVE cards inside the frame — image steps →
   image cards with generated images, idea/plan/worksheet → memo/text boxes. All
   spawned cards are normal selectable/draggable/editable board nodes. */

export type StepKind = 'idea' | 'image' | 'plan' | 'worksheet';

export interface RunnerStep {
  kind: StepKind;
  label: string;
  status: 'pending' | 'running' | 'done' | 'error';
}

export interface RunnerData {
  template: string;
  frameId: string;
  steps: RunnerStep[];
}

const STEPS: Array<{ kind: StepKind; label: string }> = [
  { kind: 'idea', label: '아이디어' },
  { kind: 'image', label: '활동 이미지' },
  { kind: 'plan', label: '계획안' },
  { kind: 'worksheet', label: '활동지' },
];

export const FRAME_W = 1180;
export const FRAME_H = 760;

/** Seed a "새 놀이계획" frame + runner control at (x,y). Returns nodes to add. */
export function seedWorkflowFrame(title: string, x: number, y: number): BoardNode[] {
  const frameId = newId('frame');
  const frame: BoardNode = {
    id: frameId,
    type: 'frame',
    x,
    y,
    w: FRAME_W,
    h: FRAME_H,
    data: { title: title || '새 놀이계획' },
  };
  const runner: BoardNode = {
    id: newId('runner'),
    type: 'runner',
    x: x + 24,
    y: y + 24,
    w: 240,
    h: 0,
    data: {
      template: 'play_plan',
      frameId,
      steps: STEPS.map((s) => ({ ...s, status: 'pending' as const })),
    } satisfies RunnerData,
  };
  return [frame, runner];
}

/* ---- placement: non-overlapping slot inside the frame ---- */
function freeSpotInFrame(frameId: string, w: number, h: number): { x: number; y: number } {
  const b = useBoardStore.getState();
  const frame = b.nodes[frameId];
  const pad = 20;
  const gap = 20;
  const fx = frame ? frame.x : 0;
  const fy = frame ? frame.y : 0;
  const fw = frame ? frame.w : FRAME_W;
  const fh = frame ? frame.h : FRAME_H;
  // obstacles: cards inside (exclude the frame itself)
  const obs = Object.values(b.nodes)
    .filter((n) => n.id !== frameId && n.type !== 'frame')
    .map((n) => ({ x: n.x, y: n.y, w: n.w, h: Math.max(n.h, 90) }));
  const hit = (x: number, y: number) =>
    obs.find((o) => x < o.x + o.w + gap && x + w + gap > o.x && y < o.y + o.h + gap && y + h + gap > o.y);
  let y = fy + pad;
  for (let row = 0; row < 40; row++) {
    let x = fx + pad;
    for (let i = 0; i < 60; i++) {
      if (x + w > fx + fw - pad) break;
      if (!hit(x, y)) return { x, y };
      const o = hit(x, y)!;
      x = o.x + o.w + gap;
    }
    y += h + gap;
    if (y + h > fy + fh - pad) break;
  }
  return { x: fx + pad, y: fy + fh + gap }; // overflow → just below the frame
}

function memoCard(text: string, color: string, role: StepKind, runnerId: string, w = 240): BoardNode {
  const pos = freeSpotInFrame(getFrameId(runnerId), w, 120);
  return {
    id: newId('sticky'),
    type: 'sticky',
    x: pos.x,
    y: pos.y,
    w,
    h: 120,
    autoH: true,
    text,
    color,
    data: { role, runnerId },
  };
}

function getFrameId(runnerId: string): string {
  const r = useBoardStore.getState().nodes[runnerId];
  return (r?.data?.frameId as string) ?? '';
}

function setStep(runnerId: string, kind: StepKind, status: RunnerStep['status']) {
  const b = useBoardStore.getState();
  const r = b.nodes[runnerId];
  if (!r) return;
  const data = r.data as unknown as RunnerData;
  const steps = data.steps.map((s) => (s.kind === kind ? { ...s, status } : s));
  b.updateNodeRaw(runnerId, { data: { ...data, steps } });
}

/** Idea texts feeding the next step: selected idea cards if any, else all. */
function ideaTexts(runnerId: string): string[] {
  const b = useBoardStore.getState();
  const ideaNodes = Object.values(b.nodes).filter(
    (n) => n.data?.role === 'idea' && n.data?.runnerId === runnerId,
  );
  const selected = ideaNodes.filter((n) => b.selection.includes(n.id));
  const use = selected.length ? selected : ideaNodes;
  return use.map((n) => (n.text ?? '').split('\n')[0]).filter(Boolean);
}

function planText(p: RegistryPayload): string {
  if (p.type === 'WeeklyPlanGrid') {
    const d = p.props;
    return [
      `📋 ${d.title}`,
      ...d.days.map((x) => `· ${x.day} ${x.area} — ${x.activity}${x.goal ? ` (목표: ${x.goal})` : ''}`),
    ].join('\n');
  }
  if (p.type === 'ClarifyPrompt') return p.props.question;
  return '계획안';
}
function worksheetText(p: RegistryPayload): string {
  if (p.type === 'WorksheetCard') {
    const w = p.props;
    return [
      `📝 ${w.title}`,
      `목표: ${w.objective}`,
      `준비물: ${w.materials.join(', ')}`,
      ...w.steps.map((s, i) => `${i + 1}. ${s}`),
    ].join('\n');
  }
  if (p.type === 'ClarifyPrompt') return p.props.question;
  return '활동지';
}

/** Run one workflow step: generate → spawn board-native cards into the frame. */
export async function runWorkflowStep(runnerId: string, kind: StepKind): Promise<void> {
  const b = useBoardStore.getState();
  const runner = b.nodes[runnerId];
  if (!runner) return;
  const rawTitle = (b.nodes[getFrameId(runnerId)]?.data?.title as string) ?? '놀이계획';
  // The default frame name "새 놀이계획" reads as "bird" to the model — use a clear
  // topic for generation while keeping the frame's display title. Renamed frames
  // (the teacher's real topic) drive generation directly.
  const frameTitle = /^새\s*놀이계획$/.test(rawTitle.trim()) ? '이번 주 유아 놀이 활동' : rawTitle;
  const ctx = buildAgentContext('plan');
  setStep(runnerId, kind, 'running');

  try {
    if (kind === 'idea') {
      const ideas = await runPlanIdeas(frameTitle, ctx);
      ideas.slice(0, 4).forEach((it) => {
        b.addNodeRaw(memoCard(`${it.label}\n${it.desc}`, 'accent-soft', 'idea', runnerId, 240));
      });
    } else if (kind === 'image') {
      const res = await runStudioImages(frameTitle, ideaTexts(runnerId), ctx);
      if (res.payload.type === 'StudioGallery') {
        res.payload.props.items.forEach((it) => {
          const fid = getFrameId(runnerId);
          const pos = freeSpotInFrame(fid, 220, 200);
          b.addNodeRaw({
            id: newId('image'),
            type: 'image',
            x: pos.x,
            y: pos.y,
            w: 220,
            h: 200,
            src: it.url,
            text: it.caption,
            data: { role: 'image', runnerId },
          });
        });
      }
    } else if (kind === 'plan') {
      const res = await runPlan(frameTitle, ideaTexts(runnerId), ctx);
      b.addNodeRaw(memoCard(planText(res.payload), 'surface-3', 'plan', runnerId, 300));
    } else if (kind === 'worksheet') {
      const res = await runStudioWorksheet(frameTitle, ctx);
      b.addNodeRaw(memoCard(worksheetText(res.payload), 'gold', 'worksheet', runnerId, 300));
    }
    setStep(runnerId, kind, 'done');
  } catch (e) {
    setStep(runnerId, kind, 'error');
    // eslint-disable-next-line no-console
    console.error('workflow step failed', e);
  }
}
