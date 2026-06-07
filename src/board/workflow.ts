import { useBoardStore, newId, type BoardNode } from '@/store/boardStore';
import { buildAgentContext } from '@/ai/context';
import { callGateway } from '@/ai/client';
import { runPlanIdeas, runPlan } from '@/ai/agents/plan';
import { runStudioImages, runStudioWorksheet } from '@/ai/agents/studio';
import type { RegistryPayload } from '@/ui-registry/contracts';

/* Workflow-to-board (reference board model): a "새 놀이계획" frame holds a runner
   control; each step spawns BOARD-NATIVE cards inside the frame — image steps →
   image cards with generated images, idea/plan/worksheet → memo/text boxes. All
   spawned cards are normal selectable/draggable/editable board nodes. The frame
   auto-expands to fit new cards (placeInFrame). */

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
export const FRAME_H = 560;
const PAD = 24;
const GAP = 20;

/** Seed a "새 놀이계획" frame + runner control at (x,y). */
export function seedWorkflowFrame(title: string, x: number, y: number): BoardNode[] {
  const frameId = newId('frame');
  const frame: BoardNode = { id: frameId, type: 'frame', x, y, w: FRAME_W, h: FRAME_H, data: { title: title || '새 놀이계획' } };
  const runner: BoardNode = {
    id: newId('runner'),
    type: 'runner',
    x: x + PAD,
    y: y + PAD,
    w: 240,
    h: 0,
    data: { template: 'play_plan', frameId, steps: STEPS.map((s) => ({ ...s, status: 'pending' as const })) } satisfies RunnerData,
  };
  return [frame, runner];
}

/* ---- placement: non-overlapping slot inside the frame + auto-expand ---- */
function expandFrame(frameId: string, needRight: number, needBottom: number) {
  const b = useBoardStore.getState();
  const f = b.nodes[frameId];
  if (!f) return;
  const w = Math.max(f.w, needRight - f.x);
  const h = Math.max(f.h, needBottom - f.y);
  if (w !== f.w || h !== f.h) b.updateNodeRaw(frameId, { w, h });
}

/** Find a free slot inside the frame (width-bounded, height-unbounded) and grow
    the frame to contain it. */
export function placeInFrame(frameId: string, w: number, h: number): { x: number; y: number } {
  const b = useBoardStore.getState();
  const frame = b.nodes[frameId];
  const fx = frame ? frame.x : 0;
  const fy = frame ? frame.y : 0;
  let fw = frame ? frame.w : FRAME_W;
  if (w + PAD * 2 > fw) fw = w + PAD * 2; // frame at least as wide as the card
  const obs = Object.values(b.nodes)
    .filter((n) => n.id !== frameId && n.type !== 'frame')
    .map((n) => ({ x: n.x, y: n.y, w: n.w, h: Math.max(n.h, 90) }));
  const hit = (x: number, y: number) =>
    obs.find((o) => x < o.x + o.w + GAP && x + w + GAP > o.x && y < o.y + o.h + GAP && y + h + GAP > o.y);

  let y = fy + PAD;
  for (let row = 0; row < 400; row++) {
    let x = fx + PAD;
    for (let i = 0; i < 120; i++) {
      if (x + w > fx + fw - PAD) break;
      if (!hit(x, y)) {
        expandFrame(frameId, x + w + PAD, y + h + PAD);
        return { x, y };
      }
      const o = hit(x, y)!;
      x = o.x + o.w + GAP;
    }
    y += h + GAP;
  }
  expandFrame(frameId, fx + w + PAD * 2, y + h + PAD);
  return { x: fx + PAD, y };
}

/* ---- spawn helpers (board-native cards) ---- */
export function spawnTextCard(frameId: string, text: string, color = 'accent-soft', w = 260, role?: string): string {
  const pos = placeInFrame(frameId, w, 120);
  const id = newId('sticky');
  useBoardStore.getState().addNodeRaw({
    id,
    type: 'sticky',
    x: pos.x,
    y: pos.y,
    w,
    h: 120,
    autoH: true,
    text,
    color,
    data: role ? { role, frameId } : { frameId },
  });
  return id;
}

export function spawnImageCard(frameId: string, src: string | undefined, caption: string): string {
  const pos = placeInFrame(frameId, 220, 200);
  const id = newId('image');
  useBoardStore.getState().addNodeRaw({
    id,
    type: 'image',
    x: pos.x,
    y: pos.y,
    w: 220,
    h: 200,
    src,
    text: caption,
    data: { role: 'image', frameId },
  });
  return id;
}

/* ---- runner state ---- */
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
function ideaTexts(runnerId: string): string[] {
  const b = useBoardStore.getState();
  const ideaNodes = Object.values(b.nodes).filter((n) => n.data?.role === 'idea' && n.data?.runnerId === runnerId);
  const selected = ideaNodes.filter((n) => b.selection.includes(n.id));
  const use = selected.length ? selected : ideaNodes;
  return use.map((n) => (n.text ?? '').split('\n')[0]).filter(Boolean);
}

/* ---- payload → board text ---- */
function planText(p: RegistryPayload): string {
  if (p.type === 'WeeklyPlanGrid')
    return [`📋 ${p.props.title}`, ...p.props.days.map((x) => `· ${x.day} ${x.area} — ${x.activity}${x.goal ? ` (목표: ${x.goal})` : ''}`)].join('\n');
  if (p.type === 'ClarifyPrompt') return p.props.question;
  return '계획안';
}
function worksheetText(p: RegistryPayload): string {
  if (p.type === 'WorksheetCard')
    return [`📝 ${p.props.title}`, `목표: ${p.props.objective}`, `준비물: ${p.props.materials.join(', ')}`, ...p.props.steps.map((s, i) => `${i + 1}. ${s}`)].join('\n');
  if (p.type === 'ClarifyPrompt') return p.props.question;
  return '활동지';
}

function topicFor(frameId: string): string {
  const raw = (useBoardStore.getState().nodes[frameId]?.data?.title as string) ?? '놀이계획';
  return /^새\s*놀이계획$/.test(raw.trim()) ? '이번 주 유아 놀이 활동' : raw;
}

/** Run one workflow step: generate → spawn board-native cards into the frame. */
export async function runWorkflowStep(runnerId: string, kind: StepKind): Promise<void> {
  const frameId = getFrameId(runnerId);
  const topic = topicFor(frameId);
  const ctx = buildAgentContext('plan');
  setStep(runnerId, kind, 'running');
  const b = useBoardStore.getState();

  try {
    if (kind === 'idea') {
      const ideas = await runPlanIdeas(topic, ctx);
      ideas.slice(0, 4).forEach((it) => {
        const id = spawnTextCard(frameId, `${it.label}\n${it.desc}`, 'accent-soft', 240, 'idea');
        b.updateNodeRaw(id, { data: { role: 'idea', runnerId, frameId } });
      });
    } else if (kind === 'image') {
      const res = await runStudioImages(topic, ideaTexts(runnerId), ctx);
      if (res.payload.type === 'StudioGallery') res.payload.props.items.forEach((it) => spawnImageCard(frameId, it.url, it.caption));
    } else if (kind === 'plan') {
      const res = await runPlan(topic, ideaTexts(runnerId), ctx);
      spawnTextCard(frameId, planText(res.payload), 'surface-3', 300, 'plan');
    } else if (kind === 'worksheet') {
      const res = await runStudioWorksheet(topic, ctx);
      spawnTextCard(frameId, worksheetText(res.payload), 'gold', 300, 'worksheet');
    }
    setStep(runnerId, kind, 'done');
  } catch (e) {
    setStep(runnerId, kind, 'error');
    // eslint-disable-next-line no-console
    console.error('workflow step failed', e);
  }
}

/* ---- prompt-in-place generation ---- */
const IMAGE_RE = /이미지|그림|사진|도안|일러스트|캐릭터|배경/;

async function genMemo(prompt: string, ctx: string): Promise<string> {
  const res = await callGateway({
    task: 'lane_step',
    tier: 'mid',
    provider: 'auto',
    system: `유치원 교사의 보드 메모를 작성한다. 요청에 맞춰 2~5줄의 간결한 한국어 메모만(머리말·인사·마크다운 없이).\n${ctx}`,
    messages: [{ role: 'user', content: prompt }],
    meta: { kind: 'memo', title: prompt, selected: [] },
    maxTokens: 500,
  });
  return res.ok && res.text ? res.text.trim() : prompt;
}

/** Generate INTO a frame from a free prompt: image keywords → image cards, else memo. */
export async function generateIntoFrame(frameId: string, prompt: string): Promise<void> {
  const ctx = buildAgentContext('studio');
  if (IMAGE_RE.test(prompt)) {
    const res = await runStudioImages(prompt, [], ctx);
    if (res.payload.type === 'StudioGallery') res.payload.props.items.forEach((it) => spawnImageCard(frameId, it.url, it.caption));
  } else {
    const text = await genMemo(prompt, ctx);
    spawnTextCard(frameId, text, 'surface-2', 280);
  }
}

/** Regenerate an image card from a prompt. */
export async function regenImageCard(nodeId: string, prompt: string): Promise<void> {
  const b = useBoardStore.getState();
  b.updateNodeRaw(nodeId, { loading: true });
  const res = await callGateway({ task: 'image', provider: 'auto', messages: [], meta: { prompt, caption: prompt } });
  b.updateNodeRaw(nodeId, { loading: false, src: res.image, text: prompt });
}

/** Generate/replace a memo or text card's content from a prompt. */
export async function genTextCard(nodeId: string, prompt: string): Promise<void> {
  const ctx = buildAgentContext('writing');
  const text = await genMemo(prompt, ctx);
  useBoardStore.getState().updateNodeRaw(nodeId, { text });
}
