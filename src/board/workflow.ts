import { useBoardStore, newId, type BoardNode } from '@/store/boardStore';
import { buildAgentContext } from '@/ai/context';
import { callGateway } from '@/ai/client';
import { runPlanIdeas, runPlan } from '@/ai/agents/plan';
import { runStudioImages, runStudioWorksheet, planStudioImages, renderStudioImage, KV_ART_STYLE } from '@/ai/agents/studio';
// 의도 어휘는 단일 출처(intent-lexicon) — 로컬 정규식은 '그려' 등이 빠져 어긋났었다(P0-1).
import { IMAGE_RE, coreTopic } from '@/ai/intent-lexicon';
import { findAsset, saveAsset } from './assets';
import { removeBackground, cleanupBackground, type AssetKind } from '@/shared/background-removal';
import { makeThumb, THUMB_MAX_W } from './imageLod';
import { showToast } from '@/lib/toast';
import { saveWebLinks } from './webLinks';
import { fitFrameToChildren, frameSubtree } from './frames';
import { recordSpawnedNodes, replaceImageCmd, addImageNodeCmd } from './commands';
import { worldBox } from './geometry';
import { linkedComponent } from './links';
import { ageLabel, type RegistryPayload } from '@/ui-registry/contracts';

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
  // autoH 문서는 node.h가 '최소 높이'일 뿐 — 실제 렌더 높이(data.renderH)로 막아야
  // 긴 계획안 아래 영역을 빈 곳으로 착각해 카드가 문서 위에 겹치지 않는다.
  const obs = Object.values(b.nodes)
    .filter((n) => n.id !== frameId && n.type !== 'frame')
    .map((n) => ({
      x: n.x,
      y: n.y,
      w: n.w,
      h: Math.max(typeof n.data?.renderH === 'number' ? (n.data.renderH as number) : 0, n.h, 90),
    }));
  const hit = (x: number, y: number) =>
    obs.find((o) => x < o.x + o.w + GAP && x + w + GAP > o.x && y < o.y + o.h + GAP && y + h + GAP > o.y);

  let y = fy + PAD;
  for (let row = 0; row < 400; row++) {
    let x = fx + PAD;
    for (let i = 0; i < 120; i++) {
      if (x + w > fx + fw - PAD) break;
      const o = hit(x, y); // single obstacle scan per cell (was called twice)
      if (!o) {
        expandFrame(frameId, x + w + PAD, y + h + PAD);
        return { x, y };
      }
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

/** Frame header — a large display-serif title placed top-left inside the frame.
    Anchored to the frame's actual origin (NOT 0,0) so an early fitFrameToChildren
    during fill can't drag the whole frame back to the canvas origin. */
export function spawnHeaderCard(frameId: string, text: string): string {
  const f = useBoardStore.getState().nodes[frameId];
  const id = newId('text');
  useBoardStore.getState().addNodeRaw({
    id,
    type: 'text',
    x: f ? f.x + PAD : 0,
    y: f ? f.y + PAD : 0,
    w: 560,
    h: 44,
    autoH: true,
    text,
    data: { role: 'header', frameId },
  });
  return id;
}

/** A4 "paper" document card (가정통신문·활동지·계획 등). Width follows A4 page
    proportion; height grows with content (autoH). Rendered as a document.
    Portrait (480) by default; the 주간 놀이계획 passes landscape (PLAN_DOC_W). */
export const DOC_WIDTH = 480; // A4 portrait page width at board scale (≈210:297)
export const PLAN_DOC_W = 680; // 주간 놀이계획 = A4 landscape (가로) — fits the weekly grid
export function spawnDocCard(frameId: string, text: string, role?: string, width = DOC_WIDTH): string {
  const pos = placeInFrame(frameId, width, 240);
  const id = newId('sticky');
  useBoardStore.getState().addNodeRaw({
    id,
    type: 'sticky',
    x: pos.x,
    y: pos.y,
    w: width,
    h: 240,
    autoH: true,
    text,
    color: 'paper',
    data: role ? { role, frameId, doc: true } : { frameId, doc: true },
  });
  return id;
}

/** A web-source card: a topic-image thumbnail grid (free image sites) + clickable
    search link rows (YouTube·Google·Pinterest·Pixabay). NodeView renders each as
    an anchor that opens directly — no raw URLs. */
export interface SourceLink {
  title: string;
  url: string;
  domain: string;
  /** 페이지 대표 이미지(og:image). 있으면 파비콘 대신 썸네일로 보여준다. */
  thumb?: string;
  /** iframe 임베드 가능(X-Frame-Options/CSP 통과)? true일 때만 웹뷰어로 연다. */
  embeddable?: boolean;
}
export interface SourceThumb {
  thumb: string; // image URL (free image site)
  url: string; // source/landing page (clickable)
  title: string;
  source: string; // e.g. flickr / wikimedia
  /** iframe 임베드 가능? true일 때만 웹뷰어로 연다(아니면 새 탭). */
  embeddable?: boolean;
}
export function spawnSourceCard(
  frameId: string,
  summary: string,
  links: SourceLink[],
  thumbs: SourceThumb[] = [],
): string {
  const pos = placeInFrame(frameId, 340, 220);
  const id = newId('sticky');
  useBoardStore.getState().addNodeRaw({
    id,
    type: 'sticky',
    x: pos.x,
    y: pos.y,
    w: 340,
    h: 220,
    autoH: true,
    color: 'surface-2',
    data: { role: 'source', frameId, links, thumbs, summary },
  });
  return id;
}

export function spawnImageCard(
  frameId: string,
  src: string | undefined,
  caption: string,
  loading = false,
): string {
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
    loading,
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
export function planText(p: RegistryPayload): string {
  if (p.type === 'WeeklyPlanGrid')
    return [`📋 ${p.props.title}`, ...p.props.days.map((x) => `· ${x.day} ${x.area} — ${x.activity}${x.goal ? ` (목표: ${x.goal})` : ''}`)].join('\n');
  if (p.type === 'ClarifyPrompt') return p.props.question;
  return '계획안';
}
/** 놀이아이디어(PlayIdeaList) 리치 마크다운 — 각 아이디어를 놀이명(H3)·배움영역·놀이 소개·
    놀이 방법(번호)·놀이팁(불릿)으로 정리(feature: play_idea 출력 형식). 내보내기·폴백 텍스트용.
    선택형 인터랙션은 NodeView(idealist)가, 이 마크다운은 문서 렌더/저장이 담당한다. */
export function playIdeaListMarkdown(
  items: Array<{ label: string; desc?: string; area?: string; intro?: string; steps?: string[]; tips?: string[] }>,
  title: string,
): string {
  const out: string[] = [`# 💡 ${title} ${items.length}가지`];
  items.forEach((it) => {
    out.push('');
    out.push(`### ${it.label}`);
    if (it.area && it.area.trim()) out.push(`**배움영역** ${it.area.trim()}`);
    const intro = (it.intro || it.desc || '').trim();
    if (intro) {
      out.push('');
      out.push(intro);
    }
    const steps = (it.steps ?? []).filter((s) => s && s.trim());
    if (steps.length) {
      out.push('');
      steps.forEach((s, i) => out.push(`${i + 1}. ${s.trim()}`));
    }
    const tips = (it.tips ?? []).filter((t) => t && t.trim());
    if (tips.length) {
      out.push('');
      out.push('**놀이팁**');
      tips.forEach((t) => out.push(`- ${t.trim()}`));
    }
  });
  return out.join('\n');
}

/** A full, professional 주간 놀이계획안 document (markdown) from a WeeklyPlanGrid:
    title, meta line, 주간 교육 목표, a 요일×영역 운영 grid table, 영역 연계, 운영
    유의점 — all derived from the generated plan (no fabricated content). Rendered
    as an A4 document card (react-markdown + GFM table). */
export function planDocMarkdown(p: RegistryPayload): string {
  if (p.type !== 'WeeklyPlanGrid') return planText(p);
  const pr = p.props;
  const band = ageLabel(pr);
  const cur = pr.curriculum === 'standard' ? '표준보육과정' : '누리과정';
  const cell = (s?: string) => (s && s.trim() ? s.replace(/\|/g, '/').replace(/\n+/g, ' ').trim() : '—');
  const areas = [...new Set(pr.days.map((d) => d.area).filter((a) => !!a && !!a.trim()))];
  const goals = [...new Set(pr.days.map((d) => d.goal).filter((g): g is string => !!g && !!g.trim()))];

  const out: string[] = [];
  out.push(`# ${pr.title}`);
  out.push(`**대상** ${band} · **교육과정** ${cur} · **운영 기간** 주 5일`);
  if (goals.length) {
    out.push('');
    out.push('## 주간 교육 목표');
    goals.forEach((g) => out.push(`- ${g}`));
  }
  out.push('');
  out.push('## 요일별 놀이 운영');
  out.push('| 요일 | 누리과정 영역 | 놀이 활동 | 준비물 | 놀이 목표 |');
  out.push('| --- | --- | --- | --- | --- |');
  pr.days.forEach((d) => out.push(`| ${cell(d.day)} | ${cell(d.area)} | ${cell(d.activity)} | ${cell(d.materials)} | ${cell(d.goal)} |`));
  if (areas.length) {
    out.push('');
    out.push('---'); // decorative divider (decoration primitive)
    out.push('## 누리과정 영역 연계');
    out.push(areas.join(' · '));
  }
  if (pr.notes && pr.notes.trim()) {
    out.push('');
    out.push('## 운영 시 유의점');
    // Callout box — render the notes as a blockquote (styled in .kv-doc-md).
    pr.notes.trim().split(/\n+/).forEach((line) => out.push(`> ${line}`));
  }
  return out.join('\n');
}

/** 프로젝트 수업 계획 렌더 — '요일별'이 아니라 '단계별(준비→도입→전개→마무리)'로 하나의 주제를
    1주~한 달 깊이 탐구하는 흐름으로 정리한다(프로젝트 접근법). WeeklyPlanGrid payload의 days를
    '프로젝트 단계'로 해석해 표로 렌더(runPlan project 모드가 단계 행을 만든다). */
export function projectDocMarkdown(p: RegistryPayload): string {
  if (p.type !== 'WeeklyPlanGrid') return planText(p);
  const pr = p.props;
  const band = ageLabel(pr);
  const cur = pr.curriculum === 'standard' ? '표준보육과정' : '누리과정';
  const cell = (s?: string) => (s && s.trim() ? s.replace(/\|/g, '/').replace(/\n+/g, ' ').trim() : '—');
  const areas = [...new Set(pr.days.map((d) => d.area).filter((a) => !!a && !!a.trim()))];
  const goals = [...new Set(pr.days.map((d) => d.goal).filter((g): g is string => !!g && !!g.trim()))];
  const title = /프로젝트/.test(pr.title) ? pr.title : `${pr.title} 프로젝트`;

  const out: string[] = [];
  out.push(`# ${title}`);
  out.push(`**대상** ${band} · **교육과정** ${cur} · **운영 기간** 주제·유아 흥미에 따라 1주~한 달(하나의 주제를 깊이 탐구)`);
  if (goals.length) {
    out.push('');
    out.push('## 프로젝트 목표');
    goals.forEach((g) => out.push(`- ${g}`));
  }
  out.push('');
  out.push('## 단계별 프로젝트 전개');
  out.push('| 단계 | 영역·성격 | 탐구·표상 활동 | 준비물·자원 | 기대 경험 |');
  out.push('| --- | --- | --- | --- | --- |');
  pr.days.forEach((d) => out.push(`| ${cell(d.day)} | ${cell(d.area)} | ${cell(d.activity)} | ${cell(d.materials)} | ${cell(d.goal)} |`));
  if (areas.length) {
    out.push('');
    out.push('---');
    out.push('## 누리과정 영역 연계');
    out.push(areas.join(' · '));
  }
  if (pr.notes && pr.notes.trim()) {
    out.push('');
    out.push('## 운영 시 유의점');
    pr.notes.trim().split(/\n+/).forEach((line) => out.push(`> ${line}`));
  }
  return out.join('\n');
}

export function worksheetText(p: RegistryPayload): string {
  if (p.type === 'WorksheetCard') {
    const meta = [p.props.type, p.props.style_label].filter(Boolean).join(' · ');
    return [
      `📝 ${p.props.title}`,
      ...(meta ? [meta] : []),
      `목표: ${p.props.objective}`,
      `준비물: ${p.props.materials.join(', ')}`,
      ...p.props.steps.map((s, i) => `${i + 1}. ${s}`),
    ].join('\n');
  }
  if (p.type === 'ClarifyPrompt') return p.props.question;
  return '활동지';
}

export function topicFor(frameId: string): string {
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
      // 정식 주간 놀이계획 문서(A4 가로) — 요약 텍스트가 아니라 composer와 동일한 문서 카드.
      const res = await runPlan(topic, ideaTexts(runnerId), ctx);
      const id = spawnDocCard(frameId, planDocMarkdown(res.payload), 'plan', PLAN_DOC_W);
      const cur = useBoardStore.getState().nodes[id];
      if (cur) useBoardStore.getState().updateNodeRaw(id, { data: { ...(cur.data ?? {}), payload: res.payload } });
    } else if (kind === 'worksheet') {
      // 활동지 = 인쇄용 A4 시트(생성 그림 + 제목/안내 텍스트 레이어). payload를 카드에
      // 실어야 NodeView가 WorksheetSheet로 렌더한다 — 텍스트 문서로 떨어지지 않게.
      const res = await runStudioWorksheet(topic, ctx);
      const id = spawnDocCard(frameId, worksheetText(res.payload), 'worksheet');
      const cur = useBoardStore.getState().nodes[id];
      if (cur) useBoardStore.getState().updateNodeRaw(id, { data: { ...(cur.data ?? {}), payload: res.payload } });
    }
    setStep(runnerId, kind, 'done');
  } catch (e) {
    setStep(runnerId, kind, 'error');
    // eslint-disable-next-line no-console
    console.error('workflow step failed', e);
  }
}

/* ---- prompt-in-place generation ---- */

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

/** Generate INTO a frame from a free prompt: image keywords → image cards, else memo.
    컴포저와 같은 UX — 카드를 스피너로 먼저 깔고 앞에서부터 채우며, 진행 단계를
    boardStore.generating으로 스트리밍한다(프롬프트바·상태 필에 표시). */
export async function generateIntoFrame(frameId: string, prompt: string): Promise<void> {
  const ctx = buildAgentContext('studio');
  const say = (m: string) => useBoardStore.getState().setGenerating(m);
  useBoardStore.getState().beginGen(); // 복수 생성 추적 — 마지막 작업만 메시지를 비운다
  try {
    if (IMAGE_RE.test(prompt)) {
      say('🖼️ 그림 구성을 잡고 있어요…');
      const plan = await planStudioImages(prompt, [], ctx);
      // 보관함 조회 — 같은 이름의 단일 요소는 생성 없이 즉시 재사용(컴포저와 동일).
      const hits = await Promise.all(plan.specs.map((s) => findAsset(s.caption, 'image').catch(() => undefined)));
      const ids = plan.specs.map((s, i) => spawnImageCard(frameId, hits[i]?.url, s.caption, !hits[i]));
      const b2 = useBoardStore.getState();
      ids.forEach((cid, i) => {
        if (!hits[i]) return;
        const c = b2.nodes[cid];
        if (c) b2.updateNodeRaw(cid, { data: { ...(c.data ?? {}), fromLibrary: true } });
      });
      const proms = plan.specs.map((s, i) =>
        hits[i] ? null : renderStudioImage(s, plan.style).catch(() => ({ url: undefined as string | undefined, mocked: false })),
      );
      const total = proms.filter(Boolean).length;
      let done = 0;
      for (let i = 0; i < proms.length; i++) {
        const p = proms[i];
        if (!p) continue;
        say(`🎨 '${plan.specs[i].caption}' 그리는 중… (${done + 1}/${total})`);
        const img = await p;
        done += 1;
        useBoardStore.getState().updateNodeRaw(ids[i], { loading: false, src: img.url });
        // 성공작은 캡션 태그로 보관함(자산 DB)에 자동 저장 — 다음 요청에서 재사용.
        if (img.url && !img.mocked) void saveAsset(plan.specs[i].caption, 'image', img.url, plan.title);
      }
    } else {
      say('🗒️ 메모를 작성하고 있어요…');
      const text = await genMemo(prompt, ctx);
      spawnTextCard(frameId, text, 'surface-2', 280);
    }
  } finally {
    useBoardStore.getState().endGen();
  }
}

/** 선택에서 대상 프레임을 찾는다 — 프레임 자체가 선택됐거나 선택 카드가 속한 프레임. */
function selectionFrameId(): string | undefined {
  const b = useBoardStore.getState();
  for (const id of b.selection) {
    const n = b.nodes[id];
    if (!n) continue;
    if (n.type === 'frame' && !n.data?.sub) return id;
    const fid = n.data?.frameId as string | undefined;
    if (fid && b.nodes[fid]?.type === 'frame') return fid;
  }
  return undefined;
}

/** '마지막으로 작업한 프레임'의 프록시 — 보드는 왼→오 시간순으로 자라므로
    최우측 최상위 프레임이 가장 최근 작업이다. */
function lastWorkedFrame(): BoardNode | undefined {
  const frames = Object.values(useBoardStore.getState().nodes).filter(
    (n) => n.type === 'frame' && !n.data?.sub,
  );
  if (frames.length === 0) return undefined;
  return frames.reduce((a, f) => (f.x + f.w > a.x + a.w ? f : a));
}

/** 뷰포트 팬을 부드럽게(ease-out cubic) — 순간이동이 아니라 '어디로 이동했는지'가
    인지되게. 거리에 비례해 200~420ms. prefers-reduced-motion이면 즉시 적용.
    새 애니메이션/취소가 오면 토큰이 무효화돼, 진행 중이던 RAF 루프가 이후의
    카메라 연출(예: 계획안 스트리밍 시작 팬)을 덮어쓰지 않는다. */
let panAnimToken = 0;

/** 진행 중인 팬 애니메이션 중단 — 다른 카메라 연출을 시작하기 전에 호출. */
export function cancelPanAnimation(): void {
  panAnimToken++;
}

export function animatePanBy(dx: number, dy: number): void {
  const b = useBoardStore.getState();
  const from = { x: b.viewport.panX, y: b.viewport.panY };
  const token = ++panAnimToken;
  if (typeof window === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    b.setViewport({ panX: from.x + dx, panY: from.y + dy });
    return;
  }
  const dist = Math.hypot(dx, dy);
  const dur = Math.min(420, Math.max(200, dist * 0.25));
  const t0 = performance.now();
  const ease = (t: number) => 1 - Math.pow(1 - t, 3);
  const step = (now: number) => {
    if (token !== panAnimToken) return; // 취소/대체됨 — 카메라를 더 건드리지 않는다
    const t = Math.min(1, (now - t0) / dur);
    const k = ease(t);
    useBoardStore.getState().setViewport({ panX: from.x + dx * k, panY: from.y + dy * k });
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** 주어진 박스를 기준으로 '가장 가까운 오른쪽 빈 자리'의 x를 돌려준다 — 박스와 세로로 겹치는
    (같은 가로 띠) 카드만 장애물로 보고, box.x에서 폭 box.w가 들어갈 첫 빈 x를 찾는다(보드 전체
    오른쪽 끝까지 가지 않음 — 교사가 보던 화면 근처). movingIds(자기 자신·자식)는 장애물 제외.
    슬라이드(slideFrameToEmpty)와 신규 배치(놀이계획 단일 문서 등)가 같은 규칙을 공유한다. */
export function nearestEmptyRightX(box: { x: number; y: number; w: number; h: number }, movingIds?: Set<string>): number {
  const b = useBoardStore.getState();
  const GAP = 80;
  const bandTop = box.y - GAP;
  const bandBot = box.y + box.h + GAP;
  const intervals = Object.values(b.nodes)
    .filter((n) => !movingIds?.has(n.id) && n.type !== 'motion')
    .map(worldBox)
    .filter((o) => o.y < bandBot && o.y + o.h > bandTop) // 세로로 겹치는 카드만
    .map((o) => [o.x - GAP, o.x + o.w + GAP] as [number, number])
    .sort((a, z) => a[0] - z[0]);
  const merged: [number, number][] = [];
  for (const iv of intervals) {
    const last = merged[merged.length - 1];
    if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
    else merged.push([iv[0], iv[1]]);
  }
  let cand = box.x;
  for (const [s, e] of merged) {
    if (cand < e && cand + box.w > s) cand = e; // 그 구간과 겹치면 오른쪽으로 밀기
  }
  return cand;
}

/** 생성 완료된 프레임(+자식 전체)을 '지금 자리에서 가장 가까운 오른쪽 빈 자리'로 옮긴다 —
    같은 가로 띠(세로로 겹치는) 카드만 장애물로 보고 그 오른쪽 첫 빈 자리로 보낸다(보드 전체
    오른쪽 끝까지 가지 않음 — 교사가 보던 화면 근처에 둔다). 이동하는 동안 카메라가 같은 양
    따라가 결과물은 화면 그 자리(중앙)에 머문 채(밖으로 안 나가게) 함께 이동한다.
    중앙에서 생성→포커스한 뒤 호출. 현재 자리가 이미 빈 곳이면 움직이지 않는다. */
export function slideFrameToEmpty(frameId: string): void {
  const b = useBoardStore.getState();
  const frame = b.nodes[frameId];
  if (!frame) return;
  // 프레임 자신 + 자기 자식(중첩 포함)만 옮긴다 — frameMoveSet은 '겹친 남의 카드'까지
  // 끌어오고 프레임 자신은 빼므로 여기엔 부적합. frameSubtree(자식) + 프레임 id를 쓴다.
  const ids = [frameId, ...frameSubtree(frameId).filter((id) => b.nodes[id]?.type !== 'motion')];
  const moving = new Set(ids);
  const fb = worldBox(frame);
  // 같은 가로 띠에서 '오른쪽으로 가장 가까운' 빈 자리(보드 끝이 아니라 지금 보던 줄의 옆 여백).
  const dx = Math.round(nearestEmptyRightX(fb, moving) - fb.x);
  if (dx <= 0) return; // 현재 자리가 이미 빈 곳 — 이동 불필요
  const zoom = b.viewport.zoom;
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduce) {
    b.moveNodesRaw(ids, dx, 0);
    b.setViewport({ ...b.viewport, panX: b.viewport.panX - dx * zoom });
    return;
  }
  const token = ++panAnimToken; // cancelPanAnimation 토큰 공유 — 다른 카메라 연출과 충돌 방지
  const startPan = b.viewport.panX;
  const dur = Math.min(820, Math.max(420, dx * 0.3));
  const t0 = performance.now();
  const ease = (t: number) => 1 - Math.pow(1 - t, 3);
  let applied = 0;
  const apply = (want: number) => {
    const inc = want - applied;
    const st = useBoardStore.getState();
    if (inc) {
      st.moveNodesRaw(ids, inc, 0);
      applied = want;
    }
    // 카메라가 같은 양만큼 따라가 → 결과물은 화면 그 자리에 머문다(존재가 화면 밖으로 안 나감).
    st.setViewport({ ...st.viewport, panX: startPan - want * zoom });
  };
  const step = (now: number) => {
    if (token !== panAnimToken) return; // 취소/대체됨
    const t = Math.min(1, (now - t0) / dur);
    apply(Math.round(dx * ease(t)));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  // rAF가 스로틀(백그라운드 탭 등)되어도 최종 위치는 보장 — 타임아웃으로 마무리한다.
  setTimeout(() => {
    if (token === panAnimToken && applied < dx) apply(dx);
  }, dur + 140);
}

/** 배치된 카드 묶음이 화면 밖이면 뷰포트를 '최소한으로' 팬해 보이게 한다(줌 유지).
    이미 화면 안이면 움직이지 않는다 — 작업 중이던 시선·흐름을 깨지 않기 위해. */
function ensureBoxVisible(ids: string[]): void {
  const b = useBoardStore.getState();
  const ns = ids.map((id) => b.nodes[id]).filter((n): n is BoardNode => !!n);
  if (ns.length === 0) return;
  const x1 = Math.min(...ns.map((n) => n.x));
  const y1 = Math.min(...ns.map((n) => n.y));
  const x2 = Math.max(...ns.map((n) => n.x + n.w));
  const y2 = Math.max(...ns.map((n) => n.y + n.h));
  const { zoom, panX, panY } = b.viewport;
  const railW = 64;
  const cw = Math.max(320, (typeof window !== 'undefined' ? window.innerWidth : 1200) - railW);
  const ch = Math.max(320, typeof window !== 'undefined' ? window.innerHeight : 800);
  const M = 40; // 가장자리 여백
  const BOTTOM = 120; // 하단 프롬프트바가 덮는 영역
  const sx1 = x1 * zoom + panX;
  const sy1 = y1 * zoom + panY;
  const sx2 = x2 * zoom + panX;
  const sy2 = y2 * zoom + panY;
  let dx = 0;
  let dy = 0;
  if (sx1 < M) dx = M - sx1;
  else if (sx2 > cw - M) dx = cw - M - sx2;
  if (sy1 < M) dy = M - sy1;
  else if (sy2 > ch - BOTTOM) dy = ch - BOTTOM - sy2;
  if (dx !== 0 || dy !== 0) animatePanBy(dx, dy);
}

/** 보관함 자료 N개를 '작업 맥락'에 배치한다(겹침 없음, 배치 후 선택 상태).
    ① 선택된 프레임(또는 선택 카드의 프레임)이 있으면 그 안에 — 흐름에 합류.
    ② 없으면 마지막 작업 프레임(최우측) 오른쪽에 그리드로 나란히 — 왼→오 시간순 유지.
    ③ 프레임이 없으면 뷰포트 중앙에서 겹침 회피 탐색(기존 동작).
    배치가 화면 밖이면 뷰포트를 최소한으로 팬해서 보여준다. */
export function placeAssetsOnBoard(
  assets: Array<{ tag: string; url: string; kind?: string; videoAssetId?: string }>,
): string[] {
  if (assets.length === 0) return [];
  const w = 220;
  const h = 200;
  const GAP = 24;

  // 보관함 자료 → 보드 노드. 영상(kind==='video')은 동영상 뷰어 카드로(데이터는 videoAssetId로
  // IDB에서 자동 로드 — NodeView 복원 로직), 그 외는 이미지 카드로 만든다.
  const makeNode = (asset: (typeof assets)[number], x: number, y: number, frameId?: string): string => {
    const b = useBoardStore.getState();
    if (asset.kind === 'video' && asset.videoAssetId) {
      const id = newId('sticky');
      b.addNodeRaw({
        id,
        type: 'sticky',
        x: Math.round(x),
        y: Math.round(y),
        w,
        h,
        autoH: false,
        text: asset.tag,
        data: {
          embed: '/video-player.html',
          title: asset.tag,
          videoAssetId: asset.videoAssetId,
          fromLibrary: true,
          ...(frameId ? { frameId } : {}),
        },
      });
      return id;
    }
    const id = newId('image');
    b.addNodeRaw({
      id,
      type: 'image',
      x: Math.round(x),
      y: Math.round(y),
      w,
      h,
      src: asset.url,
      text: asset.tag,
      data: { role: 'image', fromLibrary: true, ...(frameId ? { frameId } : {}) },
    });
    return id;
  };

  // ① 선택 프레임 안에 — placeInFrame이 빈 칸을 찾고 프레임을 늘린다.
  const selFid = selectionFrameId();
  if (selFid) {
    const ids = assets.map((asset) => {
      const pos = placeInFrame(selFid, w, h);
      return makeNode(asset, pos.x, pos.y, selFid);
    });
    fitFrameToChildren(selFid);
    recordSpawnedNodes(ids, '보관함 자료 추가');
    useBoardStore.getState().setSelection(ids);
    ensureBoxVisible(ids);
    return ids;
  }

  const b = useBoardStore.getState();
  const cols = Math.min(assets.length, 4);
  const rows = Math.ceil(assets.length / cols);
  const bw = cols * w + (cols - 1) * GAP; // 그리드 전체 폭
  const bh = rows * h + (rows - 1) * GAP; // 그리드 전체 높이
  const obstacles = Object.values(b.nodes).map((n) => ({
    x: n.x,
    y: n.y,
    w: n.w,
    h: Math.max(typeof n.data?.renderH === 'number' ? (n.data.renderH as number) : n.h, 90),
  }));
  const hit = (x: number, y: number) =>
    obstacles.some((o) => x < o.x + o.w + GAP && x + bw + GAP > o.x && y < o.y + o.h + GAP && y + bh + GAP > o.y);
  let pos: { x: number; y: number } | null = null;

  // ② 마지막 작업 프레임 오른쪽, 위 모서리 정렬 — 오른쪽/아래로만 밀며 빈 자리 탐색
  //    (왼쪽 과거 영역은 침범하지 않는다).
  const last = lastWorkedFrame();
  if (last) {
    const x0 = last.x + last.w + 48;
    const y0 = last.y;
    for (let row = 0; row < 60 && !pos; row++) {
      for (let i = 0; i < 41; i++) {
        const x = x0 + i * (w + GAP);
        const y = y0 + row * (h + GAP);
        if (!hit(x, y)) { pos = { x, y }; break; }
      }
    }
  }

  // ③ 프레임이 없는 보드 — 뷰포트 중앙에서 좌우로 번갈아 벌리며 탐색.
  if (!pos) {
    const c = viewportCenterBoardPoint();
    const x0 = c.x - bw / 2;
    const y0 = c.y - bh / 2;
    for (let row = 0; row < 60 && !pos; row++) {
      for (let i = 0; i < 41; i++) {
        const x = x0 + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (w + GAP);
        const y = y0 + row * (h + GAP);
        if (!hit(x, y)) { pos = { x, y }; break; }
      }
    }
    if (!pos) pos = { x: x0, y: y0 };
  }

  const ids = assets.map((asset, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    return makeNode(asset, pos!.x + col * (w + GAP), pos!.y + row * (h + GAP));
  });
  recordSpawnedNodes(ids, '보관함 자료 추가');
  b.setSelection(ids);
  ensureBoxVisible(ids);
  return ids;
}

/** 보관함 추천 클릭 → 보드 위 빈 자리에 카드 한 장 배치(겹침 회피). */
export function placeAssetOnBoard(asset: { tag: string; url: string }): string {
  return placeAssetsOnBoard([asset])[0];
}

/** 업로드한 텍스트 문서 → 내용을 담은 메모 카드로 보드에 올리고 id 반환(프롬프트가 이 카드를
    선택 대상으로 삼아 "이걸로 활동지 만들어줘"처럼 작동하게 한다). */
export function spawnMemoCard(title: string, content: string): string {
  const b = useBoardStore.getState();
  const c = viewportCenterBoardPoint();
  const body = content.trim().slice(0, 4000);
  const id = newId('sticky');
  b.addNodeRaw({
    id,
    type: 'sticky',
    x: Math.round(c.x),
    y: Math.round(c.y),
    w: 300,
    h: 220,
    autoH: true,
    text: title ? `${title}\n\n${body}` : body,
    data: { role: 'memo', uploaded: true },
  });
  recordSpawnedNodes([id], '문서 업로드');
  ensureBoxVisible([id]);
  return id;
}

/* ---- 유튜브 뷰어 + 프롬프트 = 영상 검색 → 뷰어 아래 썸네일 가로 배열 ---- */

/* ---- 생성 중단(정지 버튼) — 공유 AbortController ----------------------------
   진행 중인 모든 생성 플로우가 같은 시그널을 본다. abortGeneration()이 호출되면
   스트리밍 fetch는 즉시 끊기고, 루프형 플로우는 다음 체크포인트에서 멈추며,
   프롬프트바 상태는 바로 초기화된다. 다음 생성은 새 컨트롤러로 시작한다. */
let genCtrl: AbortController | null = null;

/** 현재 생성 세대의 AbortSignal — 플로우 시작 시 받아 체크포인트마다 확인한다. */
export function genSignal(): AbortSignal {
  if (!genCtrl || genCtrl.signal.aborted) genCtrl = new AbortController();
  return genCtrl.signal;
}

/** 정지 버튼 — 진행 중인 생성을 모두 중단하고 상태를 초기화한다. */
export function abortGeneration(): void {
  genCtrl?.abort();
  genCtrl = null;
  cancelPanAnimation(); // 따라가던 카메라도 멈춘다
  useBoardStore.getState().resetGen();
}

/* ---- 유튜브: 링크 연결 → 교사 맞춤 영상 추천 ---- */

/** 연결된 자료의 내용 → 유아교육 현장에 맞는 유튜브 검색어(저가 LLM, 실패 시
    휴리스틱). 예: "봄 꽃 심기" 계획 카드 → "봄 꽃 심기 유아 활동". */
async function ytTeacherQuery(content: string): Promise<string> {
  const base = coreTopic(content.split('\n')[0]) || content.split('\n')[0].slice(0, 24);
  try {
    const res = await callGateway({
      task: 'lane_step',
      tier: 'low',
      provider: 'auto',
      system:
        '유치원 교사가 수업에 쓸 유튜브 검색어를 만든다. 입력 자료의 핵심 주제를 뽑아 유아교육 맥락(유아·동요·활동·놀이 중 어울리는 1개)을 결합한 한국어 검색어 한 줄만 출력한다. 8단어 이내, 따옴표·설명 금지.',
      messages: [{ role: 'user', content: content.slice(0, 600) }],
      meta: { kind: 'memo', title: 'yt-query', selected: [] },
      maxTokens: 60,
    });
    const q = res.ok && res.text ? res.text.trim().split('\n')[0].replace(/["'「」]/g, '').trim() : '';
    if (q && q.length <= 40) return q;
  } catch {
    /* 폴백으로 */
  }
  return `${base} 유아 활동`;
}

/** 계획안의 '놀이 활동' 추출 — payload(WeeklyPlanGrid)의 days가 정답이고,
    없으면 문서 마크다운 표('놀이 활동' 열)를 파싱한다. */
function planActivities(node: BoardNode): { day?: string; activity: string }[] {
  const p = node.data?.payload as
    | { type?: string; props?: { days?: { day?: string; activity?: string }[] } }
    | undefined;
  if (p?.type === 'WeeklyPlanGrid' && Array.isArray(p.props?.days)) {
    return p.props.days
      .map((d) => ({ day: d.day, activity: (d.activity ?? '').trim() }))
      .filter((d) => d.activity);
  }
  const out: { day?: string; activity: string }[] = [];
  let actIdx = -1;
  for (const ln of (node.text ?? '').split('\n')) {
    if (!/^\s*\|/.test(ln)) {
      actIdx = -1; // 표가 끝나면 리셋(다음 표에서 다시 헤더 탐색)
      continue;
    }
    if (/^[\s|:-]+$/.test(ln)) continue; // |---| 구분행
    const cells = ln.replace(/^\s*\||\|\s*$/g, '').split('|').map((c) => c.trim());
    if (actIdx < 0) {
      actIdx = cells.findIndex((c) => c.includes('활동'));
      continue; // 헤더 행
    }
    if (cells[actIdx]) out.push({ day: cells[0], activity: cells[actIdx] });
  }
  return out;
}

/** 활동 문장들 → 활동별 유튜브 검색어(저가 LLM 한 번, 실패 시 핵심어 휴리스틱). */
async function activityQueries(acts: string[]): Promise<string[]> {
  const fallback = acts.map((a) => {
    const ws = a.replace(/[^\d가-힣A-Za-z\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 2);
    return [...ws.slice(0, 4), '유아'].join(' ');
  });
  try {
    const res = await callGateway({
      task: 'lane_step',
      tier: 'low',
      provider: 'auto',
      system:
        '각 줄은 유치원 놀이 활동 설명이다. 줄마다 그 활동 영상을 찾기 좋은 유튜브 검색어 하나로 바꿔라(핵심 활동어 3~5단어 + "유아"). 입력과 같은 줄 수를 유지하고 검색어만 출력한다.',
      messages: [{ role: 'user', content: acts.join('\n') }],
      meta: { kind: 'memo', title: 'yt-activity-queries', selected: [] },
      maxTokens: 400,
    });
    if (res.ok && res.text) {
      const qs = res.text
        .trim()
        .split('\n')
        .map((s) => s.replace(/^\d+[.)]\s*/, '').replace(/["'「」]/g, '').trim())
        .filter(Boolean);
      if (qs.length === acts.length) return qs;
    }
  } catch {
    /* 폴백으로 */
  }
  return fallback;
}

/** 계획안 연결 — 요일별 '놀이 활동' 수만큼 활동마다 맞는 영상 1개씩을 찾아
    같은 행에 나열한다(캡션 앞에 요일 표시). */
export async function searchVideosForPlan(
  viewerId: string,
  items: { day?: string; activity: string }[],
): Promise<void> {
  const b = useBoardStore.getState();
  if (!b.nodes[viewerId] || items.length === 0) return;
  const signal = genSignal();
  b.beginGen();
  b.setGenerating(`🔎 놀이 활동 ${items.length}개에 맞는 영상을 찾고 있어요…`);

  const row = spawnVideoRow(viewerId, items.length);
  if (!row) {
    useBoardStore.getState().endGen();
    return;
  }
  const { ids, vb, rowY, wrapFrameId } = row;

  try {
    const queries = await activityQueries(items.map((it) => it.activity));
    if (signal.aborted) throw new Error('aborted');
    const results = await Promise.all(
      queries.map((q) =>
        fetch(`/api/youtube/search?q=${encodeURIComponent(q)}&n=1`, { signal })
          .then((r) => r.json() as Promise<{ ok: boolean; results?: { id: string; title: string }[] }>)
          .then((j) => (j.ok && j.results?.[0] ? j.results[0] : null))
          .catch(() => null),
      ),
    );
    const bb = useBoardStore.getState();
    let filled = 0;
    // 활동(태그)별 영상 링크 모음 — 아래에서 web-links 보관함에 저장한다.
    const byActivity = new Map<string, Array<{ title: string; url: string; domain: string; thumb: string }>>();
    ids.forEach((cardId, i) => {
      if (!bb.nodes[cardId]) return;
      const v = results[i];
      if (!v) {
        bb.removeNodeRaw(cardId); // 이 활동은 결과 없음 — 빈 카드는 거둔다
        return;
      }
      filled += 1;
      const day = items[i].day ? `(${items[i].day}) ` : '';
      const prev = bb.nodes[cardId];
      bb.updateNodeRaw(cardId, {
        src: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
        text: `${day}${v.title}`,
        loading: false,
        // 기존 data 보존 — frameId를 떨어뜨리면 프레임이 카드를 더는 감싸지 않는다.
        data: { ...(prev?.data ?? {}), role: 'yt-result', ytTarget: viewerId, ytId: v.id, thumb: '' },
      });
      const act = items[i].activity.trim();
      if (act) {
        const link = {
          title: v.title,
          url: `https://www.youtube.com/watch?v=${v.id}`,
          domain: 'youtube.com',
          thumb: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
        };
        (byActivity.get(act) ?? byActivity.set(act, []).get(act)!).push(link);
      }
    });
    if (filled === 0) throw new Error('검색 결과 없음');
    // 활동별로 영상을 web-links 보관함에 저장 — 프롬프트바에서 활동/영상 제목 키워드로 추천.
    byActivity.forEach((links, act) => void saveWebLinks(act, links));
    // 결과까지 채운 뒤 프레임을 다시 핏 — 두 번째 묶음도 확실히 감싼다.
    if (wrapFrameId && useBoardStore.getState().nodes[wrapFrameId]) fitFrameToChildren(wrapFrameId);
    recordSpawnedNodes(
      [...ids.filter((id) => useBoardStore.getState().nodes[id]), ...(wrapFrameId && useBoardStore.getState().nodes[wrapFrameId] ? [wrapFrameId] : [])],
      '활동별 영상 검색',
    );
  } catch (e) {
    const bb = useBoardStore.getState();
    ids.forEach((id) => bb.removeNodeRaw(id));
    if (!signal.aborted) {
      const noteId = newId('sticky');
      bb.addNodeRaw({
        id: noteId,
        type: 'sticky',
        x: Math.round(vb.x),
        y: rowY,
        w: 320,
        h: 80,
        autoH: true,
        text: `⚠️ 활동 영상을 찾지 못했어요 — 네트워크를 확인하고 다시 시도해 주세요.\n(${e instanceof Error ? e.message : String(e)})`,
        data: { color: 'accent-soft' },
      });
      recordSpawnedNodes([noteId], '영상 검색 실패 안내');
    }
  } finally {
    useBoardStore.getState().endGen();
  }
}

/** 유튜브 뷰어에 자료를 '선으로 연결'하면(BoardCanvas 링크 완료 훅) — 먼저
    연결된 자료를 '분석'한다:
    · 계획안(또는 그 계획안을 감싼 프레임, 활동 표를 가진 어떤 문서든) →
      '놀이 활동'을 추출해 활동 수만큼 활동마다 영상 1개씩 추천
    · 활동이 없는 일반 자료 → 내용으로 교사 맞춤 검색어를 만들어 추천 3개. */
export async function recommendVideosForLink(viewerId: string, content: string, sourceId?: string): Promise<void> {
  const b = useBoardStore.getState();
  b.beginGen();
  b.setGenerating('📋 연결한 자료를 분석하고 있어요…');
  try {
    const st = useBoardStore.getState();
    let src = sourceId ? st.nodes[sourceId] : undefined;
    const isPlanish = (n?: BoardNode) =>
      !!n && (n.data?.role === 'plan' || (n.data?.payload as { type?: string } | undefined)?.type === 'WeeklyPlanGrid');

    // 프레임에 연결했으면(문서 대신 프레임 모서리에 선이 걸리는 경우가 흔하다) —
    // 프레임 안에서 계획안/활동 표 문서를 찾아 그걸 분석 대상으로 쓴다.
    if (src?.type === 'frame') {
      const kids = Object.values(st.nodes).filter((n) => n.data?.frameId === src!.id);
      src =
        kids.find(isPlanish) ??
        kids.find((n) => planActivities(n).length >= 2) ??
        src;
    }

    const acts = src && src.type !== 'frame' ? planActivities(src) : [];
    // 계획안으로 판별되면 활동 1개부터, 일반 문서는 활동 표가 분명할 때(2개 이상)만.
    const planMode = src ? (isPlanish(src) ? acts.length >= 1 : acts.length >= 2) : false;
    if (planMode) {
      await searchVideosForPlan(viewerId, acts);
      return;
    }
    const q = await ytTeacherQuery(content);
    await searchVideosForViewer(viewerId, q, 5); // 적합한 자료 최대 5개(결과가 적으면 그만큼)
  } finally {
    useBoardStore.getState().endGen();
  }
}

/** 계획/텍스트 카드(또는 그 문서를 담은 프레임)에서 '영상화할 활동 텍스트'를 뽑는다.
    recommendVideosForLink의 소스 해석을 재사용 — 프레임이면 안의 계획 문서를 찾고,
    활동 표가 있으면 활동들을(제목과 함께) 모으고, 없으면 제목+본문 일부를 돌려준다.
    연결당 영상 1개라 buildVeoPrompt가 이 텍스트를 한 장면으로 요약한다. */
export function activityTextForVideo(sourceId: string): string {
  const st = useBoardStore.getState();
  let src = st.nodes[sourceId];
  if (!src) return '';
  const isPlanish = (n?: BoardNode) =>
    !!n && (n.data?.role === 'plan' || (n.data?.payload as { type?: string } | undefined)?.type === 'WeeklyPlanGrid');
  if (src.type === 'frame') {
    const fid = src.id;
    const kids = Object.values(st.nodes).filter((n) => n.data?.frameId === fid);
    src =
      kids.find(isPlanish) ??
      kids.find((n) => planActivities(n).length >= 2) ??
      kids.find((n) => !!(n.text ?? '').trim() || !!n.data?.doc) ??
      src;
  }
  if (!src || src.type === 'frame') return '';
  const acts = planActivities(src).map((a) => a.activity).filter(Boolean);
  const title = String(src.data?.title ?? '').trim();
  if (acts.length) return [title, ...acts].filter(Boolean).join(' / ').slice(0, 600);
  const body = (src.text ?? '').trim();
  return ([title, body].filter(Boolean).join('\n') || title).slice(0, 600);
}

/** 계획안(또는 그 계획을 담은 프레임)에서 '활동 이미지'를 만든다 — 계획 안의 활동
    개수만큼(최대 5·최소 1) 활동마다 1장씩, 그 활동을 하는 유아의 모습을 그려 프레임
    '오른쪽에 세로로' 배치한다. 자리(스피너)를 먼저 깔고 활동별로 채운다(앞→뒤). */
export async function generateActivityImages(sourceId: string): Promise<void> {
  const b = useBoardStore.getState();
  const start = b.nodes[sourceId];
  if (!start) return;
  // 소스 해석 — 프레임이면 안에서 계획 문서를 찾고, 그 프레임을 배치 기준으로 쓴다.
  const isPlanish = (n?: BoardNode) =>
    !!n && (n.data?.role === 'plan' || (n.data?.payload as { type?: string } | undefined)?.type === 'WeeklyPlanGrid');
  let planNode: BoardNode | undefined;
  let frameId: string | undefined; // 활동 이미지를 '안에' 넣을 프레임(있으면)
  if (start.type === 'frame') {
    const kids = Object.values(b.nodes).filter((n) => n.data?.frameId === start.id);
    planNode = kids.find(isPlanish) ?? kids.find((n) => planActivities(n).length >= 1);
    frameId = start.id;
  } else {
    planNode = start;
    frameId = (start.data?.frameId as string | undefined) && b.nodes[start.data!.frameId as string] ? (start.data!.frameId as string) : undefined;
  }
  const acts = (planNode ? planActivities(planNode) : [])
    .map((a) => a.activity.trim())
    .filter(Boolean)
    .slice(0, 5); // 최대 5장
  // 활동을 못 뽑으면 제목 1개로라도(최소 1장) — 계획 제목 기반 대표 활동 이미지.
  const list = acts.length ? acts : [String(planNode?.data?.title ?? planNode?.text ?? '놀이 활동').split('\n')[0].replace(/[#*]/g, '').trim() || '놀이 활동'];

  // 계획안(문서) '바로 오른쪽'에 세로로 — 프레임이 있으면 그 안에 넣고(같이 이동·저장),
  // 끝나면 프레임을 늘려 감싼다. 기준은 계획 문서의 월드 박스(프레임 전체가 아니라).
  const ref = planNode ?? start;
  const rb = worldBox(ref);
  const W = 240;
  const IMG_H = 200; // 그림 영역
  const CAP = 44; // 활동명 캡션(길면 2줄) 여유
  const GAP = 28; // 카드 사이 세로 간격(겹침 방지)
  const STEP = IMG_H + CAP + GAP;
  const colX = Math.round(rb.x + rb.w + 32); // 계획안 오른쪽 + 여백
  const topY = Math.round(rb.y);

  b.beginGen();
  b.setGenerating('🎨 계획안의 활동을 분석해 활동 이미지를 그리고 있어요…');
  // 1) 자리 먼저 — 활동 수만큼 세로 스피너 카드(프레임 안 자식으로 태깅).
  const ids: string[] = [];
  list.forEach((act, i) => {
    const id = newId('image');
    b.addNodeRaw({
      id, type: 'image',
      x: colX, y: topY + i * STEP, w: W, h: IMG_H, autoH: true,
      loading: true, text: heuristicActivityName(act), // 캡션 = 짧은 활동명(즉시 근사, 아래서 정제)
      data: { role: 'image', activityImage: true, ...(frameId ? { frameId } : {}) },
    });
    ids.push(id);
  });
  // 프레임이 새 이미지 열을 감싸도록 즉시 한 번 늘려 둔다(생성 전에도 자리 확보).
  if (frameId) fitFrameToChildren(frameId);

  // 캡션용 짧은 활동명(문장 설명 → "여름 놀이 정하기" 등). 이미지 프롬프트는 원문(상세)을 쓴다.
  const names = await shortActivityNames(list);

  // 2) 활동별로 채운다 — 먼저 보관함/갤러리에 유사 자료가 있으면 가져다 쓰고(생성 비용 0),
  //    없을 때만 '그 활동을 하는 유아의 모습'을 새로 그린다.
  for (let i = 0; i < list.length; i++) {
    const act = list[i];
    if (!useBoardStore.getState().nodes[ids[i]]) continue; // 사용자가 지운 경우
    // 재사용은 '정확히 같은 활동명'일 때만(findAsset). 퍼지/카테고리 검색은 '동물' 같은 단어가
    // 든 활동에 엉뚱한 그림(예: 숲 주제에 오리)을 끌어와 금지 — 정확히 맞지 않으면 새로 그린다.
    const reuse = await findAsset(act, 'image').catch(() => undefined);
    if (reuse?.url) {
      const cur = useBoardStore.getState().nodes[ids[i]];
      useBoardStore.getState().updateNodeRaw(ids[i], {
        loading: false,
        src: reuse.url,
        text: names[i],
        data: { ...(cur?.data ?? {}), fromLibrary: true },
      });
      continue;
    }
    b.setGenerating(`🎨 '${act.slice(0, 18)}' 활동 이미지를 그리는 중… (${i + 1}/${list.length})`);
    try {
      const prompt =
        `유아(어린이)들이 '${act}' 놀이/활동을 즐겁고 활기차게 하고 있는 장면. 활동하는 동작이 분명히 드러나게. ${KV_ART_STYLE}`;
      const res = await callGateway({ task: 'image', provider: 'auto', messages: [], meta: { prompt, caption: names[i] } });
      if (!useBoardStore.getState().nodes[ids[i]]) continue; // 생성 사이 사용자가 지운 경우
      useBoardStore.getState().updateNodeRaw(ids[i], { loading: false, src: res.image, text: names[i] });
      if (res.image && !res.mocked) void saveAsset(act, 'image', res.image, planNode ? String(planNode.data?.title ?? '놀이 활동') : undefined);
    } catch {
      if (useBoardStore.getState().nodes[ids[i]]) useBoardStore.getState().updateNodeRaw(ids[i], { loading: false });
    }
  }

  recordSpawnedNodes(ids.filter((id) => useBoardStore.getState().nodes[id]), '활동 이미지');
  // 캡션 높이가 측정된 뒤 프레임을 정확히 다시 감싼다(이미지 열이 프레임 안에 들어오게).
  if (frameId) {
    await new Promise((r) => setTimeout(r, 260));
    fitFrameToChildren(frameId);
  }
  useBoardStore.getState().endGen();
}

/** 활동 설명 문장 → 카드 캡션용 '짧은 활동명'(휴리스틱, LLM 미가용/폴백용).
    "모두가 좋아하는 여름 놀이를 정해 서로 이야기하며 결정한다." → "여름 놀이 정하기" 근사. */
function heuristicActivityName(s: string): string {
  let t = s.split('\n')[0].replace(/[#*]/g, '').trim();
  t = t.split(/[.!?。·…]/)[0]; // 첫 문장만
  t = t.replace(/\s*(?:하며|하면서|하고\s*나서|한\s*뒤|한\s*후|해\s*보며|해보며|하여|해서)\b[\s\S]*$/u, '').trim(); // 연결절 제거
  t = t.replace(/(?:한다|그린다|만든다|본다|나눈다|정한다|결정한다|탐색한다|표현한다|익힌다|알아본다|살펴본다)\.?$/u, '').trim(); // 서술 종결 제거
  if (t.length > 16) t = t.slice(0, 16).trim();
  return t || s.slice(0, 16).trim();
}

/** 활동 설명들을 카드 캡션용 '짧은 활동명'으로 일괄 변환(LLM 저티어 우선, 휴리스틱 폴백).
    이미지 프롬프트는 원문(상세)을 쓰되, 카드에 보이는 캡션만 짧은 활동명으로 정리한다. */
async function shortActivityNames(activities: string[]): Promise<string[]> {
  const fallback = activities.map(heuristicActivityName);
  if (activities.length === 0) return [];
  try {
    const res = await callGateway({
      task: 'list-subjects', tier: 'low', provider: 'auto', responseFormat: 'json',
      system: '유아 활동 설명을 카드에 붙일 짧은 활동명으로 바꾼다. 명사 중심의 간결한 이름만.',
      messages: [{ role: 'user', content:
        `아래 활동 설명들을 각각 "짧은 활동명"으로 바꿔라(6~12자, 명사구, 예: "여름날씨 탐색하기" · "여름과일 색칠하기" · "여름 놀이 정하기"). 순서와 개수를 그대로 유지한다.\n${activities.map((a, i) => `${i + 1}. ${a}`).join('\n')}\nJSON만: {"names":[...]}` }],
      maxTokens: 300,
    });
    if (res.ok && !res.mocked && res.text) {
      const m = res.text.match(/\{[\s\S]*\}/);
      if (m) {
        const names = (JSON.parse(m[0]) as { names?: unknown[] }).names;
        if (Array.isArray(names) && names.length === activities.length) {
          return names.map((n, i) => {
            const s = String(n ?? '').trim();
            return s && s.length <= 20 ? s : fallback[i];
          });
        }
      }
    }
  } catch { /* 폴백 */ }
  return fallback;
}

/** "여러 그림을 각각 그려줘" 요청에서 각각 그릴 대상의 짧은 목록을 뽑는다(LLM 우선, 사전 폴백). */
async function seriesSubjects(prompt: string, max: number): Promise<string[]> {
  try {
    const res = await callGateway({
      task: 'list-subjects', tier: 'low', provider: 'auto', responseFormat: 'json',
      system: "교사의 '여러 그림을 각각 그려줘' 요청에서 '각각 그릴 대상'의 짧은 한국어 단어 목록을 뽑아라. JSON 배열만 출력. 요청 범주에 맞게.",
      messages: [{ role: 'user', content: `요청: "${prompt}"\n각각 그릴 대상을 짧은 한국어로 최대 ${max}개. 예) 여러가지 감정 → ["기쁨","슬픔","화남","놀람","무서움"] · 여러 동물 → ["사자","토끼","펭귄"]. JSON 배열만:` }],
      maxTokens: 200,
    });
    if (res.ok && !res.mocked && res.text) {
      const m = res.text.match(/\[[\s\S]*\]/);
      if (m) {
        const arr = JSON.parse(m[0]) as unknown[];
        const items = arr.map((x) => String(x).trim()).filter((x) => x.length >= 1 && x.length <= 20);
        if (items.length) return items.slice(0, max);
      }
    }
  } catch { /* 폴백 */ }
  // 폴백 — 흔한 범주 사전(LLM 미가용/실패 시).
  const has = (re: RegExp) => re.test(prompt);
  let list: string[] = [];
  if (has(/감정|기분|표정|마음|느낌|정서/)) list = ['기쁨', '슬픔', '화남', '놀람', '무서움', '졸림'];
  else if (has(/동물/)) list = ['사자', '코끼리', '토끼', '펭귄', '곰', '원숭이'];
  else if (has(/과일/)) list = ['사과', '바나나', '딸기', '포도', '귤', '수박'];
  else if (has(/채소|야채/)) list = ['당근', '감자', '양파', '옥수수', '토마토', '브로콜리'];
  else if (has(/사계절|계절/)) list = ['봄', '여름', '가을', '겨울'];
  else if (has(/색깔|색|컬러/)) list = ['빨강', '주황', '노랑', '초록', '파랑', '보라'];
  else if (has(/직업/)) list = ['경찰', '소방관', '의사', '요리사', '선생님', '농부'];
  else if (has(/날씨/)) list = ['맑음', '비', '눈', '구름', '바람', '천둥'];
  return list.slice(0, max);
}

/** http(s) URL을 data URI로(스타일 참조 입력용). data:면 그대로, 실패하면 원본 반환. */
async function toDataUri(src: string): Promise<string> {
  if (src.startsWith('data:')) return src;
  try {
    const blob = await (await fetch(src)).blob();
    return await new Promise<string>((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result));
      fr.onerror = rej;
      fr.readAsDataURL(blob);
    });
  } catch { return src; }
}

/**
 * 선택한 이미지를 '화풍 참조'로, 지시한 여러 대상을 각각 '새 이미지 카드'로 그린다(원본은 그대로).
 * "이 스타일로 여러가지 감정을 각각 다른 카드에 그려줘" 같은 요청 — in-place 재생성이 아니라 카드 추가.
 * 원본 오른쪽에 그리드로 자리(스피너)를 먼저 깔고, 대상마다 참조 이미지+지시로 1장씩 채운다.
 */
export async function generateStyledSeriesFromImage(sourceId: string, prompt: string): Promise<void> {
  const b = useBoardStore.getState();
  const source = b.nodes[sourceId];
  if (!source || source.type !== 'image' || !source.src) return;
  b.beginGen();
  b.setGenerating('🎨 요청을 살펴보고 있어요…');
  try {
    const items = await seriesSubjects(prompt, 6);
    if (items.length === 0) {
      b.setGenerating('무엇을 각각 그릴지 잘 모르겠어요 — 예) "여러 감정", "동물 5가지"');
      await new Promise((r) => setTimeout(r, 2000));
      return;
    }
    const styleSrc = await toDataUri(source.src);
    const styleTopic = (source.text ?? '').trim() || String(source.data?.title ?? '').trim();

    // 원본 오른쪽에 그리드(최대 3열)로 빈 카드 먼저 — 자리 확보 + 진행 표시.
    const sb = worldBox(source);
    const W = Math.min(320, Math.max(180, Math.round(source.w) || 240));
    const H = Math.min(320, Math.max(180, Math.round(source.h) || 240));
    const GAP = 28;
    const cols = Math.min(items.length, 3);
    const x0 = Math.round(sb.x + sb.w + 40);
    const y0 = Math.round(sb.y);
    const ids: string[] = [];
    items.forEach((it, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const id = newId('image');
      b.addNodeRaw({
        id, type: 'image',
        x: x0 + col * (W + GAP), y: y0 + row * (H + GAP), w: W, h: H, autoH: true,
        loading: true, text: it.slice(0, 40), data: { role: 'image' },
      });
      ids.push(id);
    });

    // 대상마다 '참조 이미지와 같은 화풍'으로 새 그림 1장(원본은 입력으로만 — 수정하지 않음).
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      b.setGenerating(`🎨 '${it}' 그리는 중… (${i + 1}/${items.length})`);
      try {
        const genPrompt =
          `첨부한 그림과 똑같은 화풍·색감·선·질감·구도로 '${it}'${styleTopic ? ` (${styleTopic} 같은 화풍)` : ''}을(를) 분명하게 표현한 '새 그림' 한 장을 그려라. 단일 주체, 배경은 단순하게, 글자·테두리 없음. ${KV_ART_STYLE}`;
        const meta = styleSrc.startsWith('data:')
          ? { images: [styleSrc], prompt: genPrompt, caption: it }
          : { prompt: genPrompt, caption: it };
        const res = await callGateway({ task: 'image', provider: 'auto', messages: [], meta });
        if (!useBoardStore.getState().nodes[ids[i]]) continue; // 사용자가 지운 경우
        if (res.ok && res.image) {
          useBoardStore.getState().updateNodeRaw(ids[i], { loading: false, src: res.image, text: it.slice(0, 40) });
          if (!res.mocked) void saveAsset(it, 'image', res.image, styleTopic || undefined);
        } else {
          useBoardStore.getState().updateNodeRaw(ids[i], { loading: false });
        }
      } catch {
        if (useBoardStore.getState().nodes[ids[i]]) useBoardStore.getState().updateNodeRaw(ids[i], { loading: false });
      }
    }
    recordSpawnedNodes(ids.filter((id) => useBoardStore.getState().nodes[id]), '스타일 시리즈 그림');
  } finally {
    useBoardStore.getState().endGen();
  }
}

/**
 * 첨부(참조) 이미지를 '이미지 프롬프트(스타일 참조)'로 써서 지시 내용을 생성해 보드에 올린다.
 * 프롬프트바에 이미지를 첨부하고 "웃고있는 여자 아이 그려줘" → 첨부 화풍으로 그 아이를 새 그림으로.
 * '각각/여러가지'면 대상 목록을 뽑아 시리즈로, 아니면 지시 한 건을 1장으로. 화면 중앙에 그리드 배치.
 * 첨부 이미지는 카드로 올리지 않는다(스타일 입력으로만 소비) — 결과 카드만 남긴다.
 */
export async function generateFromReferenceImages(refs: string[], prompt: string): Promise<void> {
  const styleRefs = refs.filter((u) => typeof u === 'string' && u.startsWith('data:'));
  const b = useBoardStore.getState();
  b.beginGen();
  b.setGenerating('🎨 첨부한 그림을 참고하고 있어요…');
  try {
    const series = /각각|여러\s*가지|여러\s*개|여러\s*장/.test(prompt);
    const subj = prompt
      .replace(/(이\s*스타일로|이\s*화풍으로|같은\s*(스타일|화풍)으?로|첨부(한)?\s*(이미지|그림|사진)(을|를|로|으로)?)/g, ' ')
      .replace(/(그려\s*줘|그려|그림으로|그림|그릴|만들어\s*줘|만들|생성(해)?|제작|뽑아|해\s*줘|줘|주세요)/g, ' ')
      .replace(/\s+/g, ' ').trim();
    const items = (series ? await seriesSubjects(prompt, 6) : [subj || prompt.trim()]).filter(Boolean);
    if (items.length === 0) { b.setGenerating('무엇을 그릴지 잘 모르겠어요'); await new Promise((r) => setTimeout(r, 1800)); return; }

    // 화면 중앙 기준 그리드(최대 3열) — 참조는 입력일 뿐 카드로 올리지 않는다.
    const c = viewportCenterBoardPoint();
    const W = 260, H = 260, GAP = 28;
    const cols = Math.min(items.length, 3), rows = Math.ceil(items.length / cols);
    const x0 = Math.round(c.x - (cols * W + (cols - 1) * GAP) / 2);
    const y0 = Math.round(c.y - (rows * H + (rows - 1) * GAP) / 2);
    const ids: string[] = [];
    items.forEach((it, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const id = newId('image');
      b.addNodeRaw({
        id, type: 'image',
        x: x0 + col * (W + GAP), y: y0 + row * (H + GAP), w: W, h: H, autoH: true,
        loading: true, text: it.slice(0, 40), data: { role: 'image' },
      });
      ids.push(id);
    });

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      b.setGenerating(`🎨 '${it.slice(0, 18)}' 그리는 중… (${i + 1}/${items.length})`);
      try {
        const genPrompt =
          `첨부한 그림과 똑같은 화풍·색감·선·질감·분위기로 '${it}'을(를) 분명하게 표현한 '새 그림' 한 장을 그려라. 첨부 그림을 그대로 편집하지 말고 같은 스타일의 새 그림. 단일 주체, 배경은 단순하게, 글자·테두리 없음. ${KV_ART_STYLE}`;
        const meta = styleRefs.length ? { images: styleRefs, prompt: genPrompt, caption: it } : { prompt: genPrompt, caption: it };
        const res = await callGateway({ task: 'image', provider: 'auto', messages: [], meta });
        if (!useBoardStore.getState().nodes[ids[i]]) continue;
        if (res.ok && res.image) {
          useBoardStore.getState().updateNodeRaw(ids[i], { loading: false, src: res.image, text: it.slice(0, 40) });
          if (!res.mocked) void saveAsset(it, 'image', res.image);
        } else {
          useBoardStore.getState().updateNodeRaw(ids[i], { loading: false });
        }
      } catch {
        if (useBoardStore.getState().nodes[ids[i]]) useBoardStore.getState().updateNodeRaw(ids[i], { loading: false });
      }
    }
    const live = ids.filter((id) => useBoardStore.getState().nodes[id]);
    recordSpawnedNodes(live, '참조 그림 생성');
    if (live.length) useBoardStore.getState().setSelection(live);
  } finally {
    useBoardStore.getState().endGen();
  }
}

/** 동영상 플레이어(빈) 뷰어를 보드에 추가하고 id를 돌려준다. nearId가 있으면 그
    카드 오른쪽 옆에, 없으면 화면 중앙에. 카드 선택+"영상 만들어줘" 트리거가 쓴다. */
export function spawnVideoPlayer(nearId?: string): string {
  const b = useBoardStore.getState();
  const W = 640;
  const H = 420;
  const GAP = 40;
  const near = nearId ? b.nodes[nearId] : undefined;
  let x: number;
  let y: number;
  if (near) {
    const nb = worldBox(near);
    x = Math.round(nb.x + nb.w + GAP);
    y = Math.round(nb.y);
  } else {
    const c = viewportCenterBoardPoint();
    x = Math.round(c.x - W / 2);
    y = Math.round(c.y - H / 2);
  }
  const id = newId('sticky');
  b.addNodeRaw({
    id,
    type: 'sticky',
    x,
    y,
    w: W,
    h: H,
    autoH: false,
    text: '동영상 플레이어',
    data: { embed: '/video-player.html', title: '동영상 플레이어' },
  });
  recordSpawnedNodes([id], '동영상 뷰어 추가');
  return id;
}

/** 슬라이드 뷰어(빈) 카드를 보드에 추가하고 id를 돌려준다. 인스턴스마다 고유 ?id=deck_…로
    덱(localStorage 키)을 분리한다(덱이 섞이지 않게). 선택 없이 "○○ 슬라이드 만들어줘" 트리거가 쓴다.
    nearId가 있으면 그 카드 오른쪽 옆에, 없으면 화면 중앙에. */
export function spawnSlidesViewer(nearId?: string): string {
  const b = useBoardStore.getState();
  const W = 720;
  const H = 470;
  const GAP = 40;
  const near = nearId ? b.nodes[nearId] : undefined;
  let x: number;
  let y: number;
  if (near) {
    const nb = worldBox(near);
    x = Math.round(nb.x + nb.w + GAP);
    y = Math.round(nb.y);
  } else {
    const c = viewportCenterBoardPoint();
    x = Math.round(c.x - W / 2);
    y = Math.round(c.y - H / 2);
  }
  const id = newId('sticky');
  b.addNodeRaw({
    id,
    type: 'sticky',
    x,
    y,
    w: W,
    h: H,
    autoH: false,
    text: '슬라이드',
    data: { embed: `/slides-viewer.html?id=${newId('deck')}`, title: '슬라이드' },
  });
  recordSpawnedNodes([id], '슬라이드 뷰어 추가');
  return id;
}

// (제거됨) spawnGameFromImages — 게임뷰어(/game-viewer.html) iframe 카드 스포너. "이 이미지로 게임"은
// 이제 board/prompt.createInteractiveGameFromImages가 보드 네이티브 인터랙티브 노드로 만든다(게임뷰어 미사용).
// game-viewer.html 엔트리·NodeView 임베드 렌더는 기존 보드 호환용으로만 잔존.

/** 웹 자료 뷰어를 깐다 — 외부 웹페이지를 iframe(web-viewer.html)으로 카드 안에 띄운다.
    카드 옆(near) 또는 화면 중앙에 생성한 뒤 포커스 + 가장 가까운 빈자리로 슬라이드(겹침 방지).
    ※ 사이트가 iframe을 막으면 뷰어가 '새 탭에서 열기'를 안내한다. */
export function spawnWebViewer(url: string, title?: string, nearId?: string): string {
  const b = useBoardStore.getState();
  const W = 760;
  const H = 560;
  const GAP = 40;
  const near = nearId ? b.nodes[nearId] : undefined;
  let x: number;
  let y: number;
  if (near) {
    const nb = worldBox(near);
    x = Math.round(nb.x + nb.w + GAP);
    y = Math.round(nb.y);
  } else {
    const c = viewportCenterBoardPoint();
    x = Math.round(c.x - W / 2);
    y = Math.round(c.y - H / 2);
  }
  const params = new URLSearchParams({ src: url });
  if (title) params.set('title', title);
  const id = newId('sticky');
  b.addNodeRaw({
    id,
    type: 'sticky',
    x,
    y,
    w: W,
    h: H,
    autoH: false,
    text: '웹 뷰어',
    data: { embed: `/web-viewer.html?${params.toString()}`, title: title || '웹 자료', webUrl: url },
  });
  recordSpawnedNodes([id], '웹 뷰어 추가');
  useBoardStore.getState().focusNode(id);
  slideFrameToEmpty(id); // 다른 요소와 겹치지 않게 가장 가까운 오른쪽 빈자리로
  return id;
}

/** "공룡 영상 검색해줘" → 검색어만 남긴다(영상/검색/지시 어미 제거). */
function ytQuery(text: string): string {
  const q = text
    .replace(/(동영상|영상|비디오|유튜브|유투브)/g, ' ')
    .replace(/(검색|찾아|틀어|보여|재생|추천|올려)\s*(해|줘|주세요|봐|볼래|줄래)*\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return q || text.trim();
}

/** 유튜브 뷰어 카드를 선택하고 영상을 요청하면: 로딩 썸네일 카드를 뷰어 바로
    아래 가로로 깔고 → 검색 결과(제목+썸네일)로 채운다. 썸네일의 ▶를 누르면
    그 영상이 뷰어에서 바로 재생된다(NodeView의 kv:yt-play 이벤트). */
/* 썸네일 행 공통 상수 — 단일 검색·활동별 검색이 같은 레이아웃을 쓴다. */
const YT_W = 168;
const YT_H = 94; // 16:9 썸네일 — 제목 캡션은 카드가 아래로 덧그린다
const YT_GAPX = 12;
const YT_GAPY = 12; // 썸네일 행끼리(2번째 묶음 등)의 세로 간격·겹침 여백
const YT_TOP_GAP = 72; // 뷰어 ↔ 첫 썸네일 행 간격 — 시각적 분리를 위해 넉넉히
const YT_CAPTION = 34; // 캡션이 카드 아래로 차지하는 대략 높이(겹침 판정용)

/** 뷰어 아래 '가로 중앙'에 로딩 썸네일 행을 깔고, 즉시 뷰어+썸네일을 프레임으로
    감싼다(이미 프레임 안이면 합류). 단일/활동별 검색이 공유하는 골격. */
function spawnVideoRow(
  viewerId: string,
  count: number,
): { ids: string[]; vb: { x: number; y: number; w: number; h: number }; rowX: number; rowY: number; wrapFrameId?: string } | null {
  const b = useBoardStore.getState();
  const viewer = b.nodes[viewerId];
  if (!viewer) return null;
  // 뷰어가 리사이즈/스케일된 어떤 크기여도 — 월드 박스 기준으로 그 '아래'에 깐다.
  const vb = worldBox(viewer);
  const rowW = count * YT_W + (count - 1) * YT_GAPX;
  const rowX = Math.round(vb.x + (vb.w - rowW) / 2); // 뷰어 기준 '가로 중앙'
  // 이전 검색 결과 등 기존 카드와 겹치면 행 단위로 아래로 비켜 내린다.
  // 단, 프레임은 '담는 그릇'이라 장애물에서 제외한다 — 뷰어가 이미 프레임 안에 있을 때
  // 프레임의 큰 박스에 걸려 썸네일 행이 프레임 바닥까지 밀려나던 버그를 막는다.
  const others = Object.values(b.nodes).filter((n) => n.id !== viewerId && n.type !== 'frame');
  const rowHits = (yy: number) =>
    others.some((n) => {
      const o = worldBox(n);
      return rowX < o.x + o.w + YT_GAPX && rowX + rowW + YT_GAPX > o.x && yy < o.y + o.h + YT_GAPY && yy + YT_H + YT_CAPTION + YT_GAPY > o.y;
    });
  let rowY = Math.round(vb.y + vb.h + YT_TOP_GAP);
  while (rowHits(rowY)) rowY += YT_H + YT_CAPTION + YT_GAPY;

  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const id = newId('image');
    b.addNodeRaw({
      id,
      type: 'image',
      x: Math.round(rowX + i * (YT_W + YT_GAPX)),
      y: rowY,
      w: YT_W,
      h: YT_H,
      loading: true,
      data: { role: 'yt-result', ytTarget: viewerId },
    });
    ids.push(id);
  }

  // 프레임 멤버십 태깅 — 반드시 '지금'의 스토어에서 읽는다. 위에서 addNodeRaw로 카드를
  // 막 만들었으므로, 함수 시작 시 캡처한 b.nodes(과거 스냅샷)에는 새 카드가 없어
  // 태깅이 조용히 누락된다(= 두 번째 묶음이 프레임에 안 들어가던 원인).
  const tag = (nid: string, frameId: string) => {
    const n = useBoardStore.getState().nodes[nid];
    if (n) useBoardStore.getState().updateNodeRaw(nid, { data: { ...(n.data ?? {}), frameId } });
  };

  // 썸네일이 깔리는 '즉시' 뷰어+썸네일을 한 프레임으로 감싼다(이미 프레임 안이면 합류).
  let wrapFrameId = viewer.data?.frameId as string | undefined;
  if (wrapFrameId && useBoardStore.getState().nodes[wrapFrameId]?.type === 'frame') {
    const fid = wrapFrameId;
    ids.forEach((cid) => tag(cid, fid));
    fitFrameToChildren(fid);
  } else {
    const PAD = 28;
    wrapFrameId = newId('frame');
    const x1 = Math.round(Math.min(vb.x, rowX) - PAD);
    const y1 = Math.round(vb.y - PAD);
    const x2 = Math.round(Math.max(vb.x + vb.w, rowX + rowW) + PAD);
    const y2 = Math.round(rowY + YT_H + YT_CAPTION + PAD);
    b.addNodeRaw({
      id: wrapFrameId,
      type: 'frame',
      x: x1,
      y: y1,
      w: x2 - x1,
      h: y2 - y1,
      data: { title: '동영상 모음' },
    });
    tag(viewerId, wrapFrameId);
    ids.forEach((cid) => tag(cid, wrapFrameId!));
    void autoTitleFrame(wrapFrameId); // 내용 기반 자동 제목(비동기)
  }
  return { ids, vb, rowX, rowY, wrapFrameId };
}

/** 동영상 모음 프레임의 고유 규칙을 복원한다 — 유튜브 뷰어는 상단에, 썸네일은
    뷰어 아래 가로 중앙 행으로(읽기 순서 보존). 뷰어가 살짝 밀렸거나 썸네일이
    섞여 있어도 '뷰어 위·썸네일 아래' 구조로 되돌린다. 정렬 버튼이 이 프레임에서
    호출한다(범용 행/열 정돈 대신). 동영상 프레임이 아니면 false. */
export function relayoutVideoFrame(frameId: string): boolean {
  const b = useBoardStore.getState();
  const frame = b.nodes[frameId];
  if (!frame || frame.type !== 'frame') return false;
  const kids = Object.values(b.nodes).filter((n) => n.data?.frameId === frameId && n.id !== frameId);
  const viewer = kids.find((n) => String(n.data?.embed ?? '').includes('youtube-viewer'));
  const thumbs = kids.filter((n) => n.data?.role === 'yt-result');
  if (!viewer || thumbs.length === 0) return false;
  const vb = worldBox(viewer);
  // 썸네일을 현재 읽기 순서(y→x)대로 정렬해 순서를 보존한다.
  thumbs.sort((a, z) => a.y - z.y || a.x - z.x);
  // 한 줄 개수 — 뷰어 폭의 약 1.4배까지 허용(원래 한 줄에 넉넉히 들어가던 모습 유지).
  const perRow = Math.max(1, Math.floor((vb.w * 1.4 + YT_GAPX) / (YT_W + YT_GAPX)));
  const rows = Math.ceil(thumbs.length / perRow);
  const vcx = vb.x + vb.w / 2; // 뷰어 가로 중앙 — 행을 이 아래 가운데로 깐다
  let y = Math.round(vb.y + vb.h + YT_TOP_GAP);
  for (let r = 0; r < rows; r++) {
    const rowItems = thumbs.slice(r * perRow, (r + 1) * perRow);
    const rowW = rowItems.length * YT_W + (rowItems.length - 1) * YT_GAPX;
    let x = Math.round(vcx - rowW / 2);
    for (const t of rowItems) {
      // yt-result는 고정 크기 — 위치만 격자로 되돌리고 스케일/회전은 초기화.
      b.updateNodeRaw(t.id, { x, y, scale: 1, rot: 0 });
      x += YT_W + YT_GAPX;
    }
    y += YT_H + YT_CAPTION + YT_GAPY;
  }
  fitFrameToChildren(frameId);
  return true;
}

export async function searchVideosForViewer(viewerId: string, text: string, count = 5): Promise<void> {
  const b = useBoardStore.getState();
  if (!b.nodes[viewerId]) return;
  const q = ytQuery(text);
  const signal = genSignal(); // 정지 버튼 — 검색 fetch가 즉시 끊긴다
  b.beginGen();
  b.setGenerating(`🔎 유튜브에서 '${q}' 영상을 찾고 있어요…`);

  const row = spawnVideoRow(viewerId, count);
  if (!row) {
    useBoardStore.getState().endGen();
    return;
  }
  const { ids, vb, rowY, wrapFrameId } = row;

  try {
    const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(q)}&n=${count}`, { signal });
    const json = (await res.json()) as {
      ok: boolean;
      results?: { id: string; title: string; channel?: string }[];
      error?: string;
    };
    const results = json.ok && json.results?.length ? json.results : null;
    if (!results) throw new Error(json.error || '검색 결과 없음');
    const bb = useBoardStore.getState();
    ids.forEach((cardId, i) => {
      if (!bb.nodes[cardId]) return; // 기다리는 동안 사용자가 지운 카드
      const v = results[i];
      if (!v) {
        bb.removeNodeRaw(cardId); // 결과가 모자라면 빈 카드는 거둔다
        return;
      }
      const prev = bb.nodes[cardId];
      bb.updateNodeRaw(cardId, {
        src: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
        text: v.title,
        loading: false,
        // thumb: '' — 교차 출처라 캔버스 축소 불가, 원본(이미 480px)을 그대로 표시.
        // 기존 data 보존 — frameId를 떨어뜨리면 프레임이 카드를 더는 감싸지 않는다.
        data: { ...(prev?.data ?? {}), role: 'yt-result', ytTarget: viewerId, ytId: v.id, thumb: '' },
      });
    });
    // 결과까지 채운 뒤 프레임을 다시 핏 — 두 번째 묶음도 확실히 감싼다.
    if (wrapFrameId && useBoardStore.getState().nodes[wrapFrameId]) fitFrameToChildren(wrapFrameId);
    // 찾은 영상을 web-links 보관함에 저장(검색어 태그 + 영상 제목) — 프롬프트바에서
    // 같은/제목 키워드를 치면 이미지처럼 썸네일과 함께 다시 추천된다.
    void saveWebLinks(
      q,
      results.map((v) => ({
        title: v.title,
        url: `https://www.youtube.com/watch?v=${v.id}`,
        domain: 'youtube.com',
        thumb: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
      })),
    );
    recordSpawnedNodes(
      [...ids.filter((id) => useBoardStore.getState().nodes[id]), ...(wrapFrameId && useBoardStore.getState().nodes[wrapFrameId] ? [wrapFrameId] : [])],
      '영상 검색',
    );
  } catch (e) {
    const bb = useBoardStore.getState();
    if (signal.aborted) {
      // 정지 버튼 — 로딩 카드만 조용히 거둔다(안내 메모 없음).
      ids.forEach((id) => bb.removeNodeRaw(id));
      return;
    }
    // 실패 — 로딩 카드를 거두고 자리에 안내 메모 하나만 남긴다.
    ids.forEach((id) => bb.removeNodeRaw(id));
    const noteId = newId('sticky');
    bb.addNodeRaw({
      id: noteId,
      type: 'sticky',
      x: Math.round(vb.x),
      y: rowY,
      w: 320,
      h: 80,
      autoH: true,
      text: `⚠️ '${q}' 영상을 찾지 못했어요 — 네트워크를 확인하고 다시 요청해 주세요.\n(${e instanceof Error ? e.message : String(e)})`,
      data: { color: 'accent-soft' },
    });
    recordSpawnedNodes([noteId], '영상 검색 실패 안내');
  } finally {
    useBoardStore.getState().endGen();
  }
}

/** 놀이 패키지용 — 활동 목록만큼 '활동별' 영상 썸네일을 만든다. 활동마다 유튜브에서 1개씩
    찾아(없으면 그 칸은 거둔다) yt-result 카드로 채우고, 클릭하면 그 영상이 같은 유튜브 뷰어에서
    바로 재생된다(kv:yt-play). 검색은 무키 결과 파싱이라 추가 비용 없음.
    ★ spawnVideoRow를 쓰지 않고 카드를 '패키지 frameId의 멤버로 직접' 만든다 — spawnVideoRow는
    뷰어를 별도 '동영상 모음' 프레임으로 재부모화해 패키지에서 떼어냈다. 멤버로 두면
    designComposedFrame의 동영상 띠가 뷰어와 함께 한 프레임 안에 배치한다. */
export async function fillActivityVideos(viewerId: string, frameId: string, topic: string, activities: string[]): Promise<string[]> {
  const b = useBoardStore.getState();
  const viewer = b.nodes[viewerId];
  if (!viewer) return [];
  const acts = activities.map((a) => a.trim()).filter(Boolean).slice(0, 6);
  if (!acts.length) return [];
  const signal = genSignal();
  // 로딩 썸네일을 프레임 멤버로 직접 배치(뷰어 아래 임시 위치 — 최종 정렬은 designComposedFrame).
  const ids = acts.map((_, i) => {
    const id = newId('image');
    b.addNodeRaw({
      id, type: 'image',
      x: Math.round(viewer.x + i * (YT_W + YT_GAPX)), y: Math.round(viewer.y + viewer.h + YT_TOP_GAP),
      w: YT_W, h: YT_H, loading: true,
      data: { role: 'yt-result', ytTarget: viewerId, frameId },
    });
    return id;
  });
  try {
    // 활동별 1개씩 병렬 검색(짧은 질의 = 주제 + 활동명).
    const results = await Promise.all(
      acts.map((a) =>
        fetch(`/api/youtube/search?q=${encodeURIComponent(`${topic} ${a}`.trim().slice(0, 60))}&n=1`, { signal })
          .then((r) => r.json() as Promise<{ ok: boolean; results?: { id: string; title: string }[] }>)
          .then((j) => (j.ok && j.results?.length ? j.results[0] : null))
          .catch(() => null),
      ),
    );
    const bb = useBoardStore.getState();
    ids.forEach((cardId, i) => {
      if (!bb.nodes[cardId]) return; // 기다리는 동안 지워진 카드
      const v = results[i];
      if (!v) {
        bb.removeNodeRaw(cardId); // 결과 없는 활동은 빈 카드를 거둔다
        return;
      }
      const prev = bb.nodes[cardId];
      bb.updateNodeRaw(cardId, {
        src: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
        text: v.title,
        loading: false,
        data: { ...(prev?.data ?? {}), role: 'yt-result', ytTarget: viewerId, ytId: v.id, frameId, thumb: '' },
      });
    });
    return ids.filter((id) => useBoardStore.getState().nodes[id]);
  } catch {
    // 실패/중단 — 로딩 썸네일만 조용히 거둔다(패키지 전체는 계속).
    const bb = useBoardStore.getState();
    ids.forEach((id) => { if (bb.nodes[id]?.loading) bb.removeNodeRaw(id); });
    return [];
  }
}

/* ---- 프레임으로 묶기 → 내용 분석 자동 제목 ---- */

/** 흔한 일반어 — 제목 키워드로 의미가 없어 제외. */
const TITLE_STOP = new Set([
  '영상', '동영상', '유튜브', '이미지', '사진', '자료', '카드', '메모', '프레임', '뷰어',
  '모음', '모음집', '하이라이트', '전편', '연속', '재생', '인기', '동요', '동화',
]);

/** LLM 없이도 그럴듯한 제목 — 자식 텍스트에서 최빈 키워드를 뽑는다. */
function keywordTitle(texts: string[], kids: BoardNode[]): string {
  const freq = new Map<string, number>();
  for (const t of texts) {
    for (const raw of t.split(/[^0-9A-Za-z가-힣]+/)) {
      const w = raw.trim();
      if (w.length < 2 || w.length > 10 || TITLE_STOP.has(w)) continue;
      freq.set(w, (freq.get(w) ?? 0) + 1);
    }
  }
  const top = [...freq.entries()].sort((a, z) => z[1] - a[1])[0];
  const allVideo = kids.every((n) => n.data?.role === 'yt-result' || typeof n.data?.embed === 'string');
  if (top && top[1] >= 2) return `${top[0]} ${allVideo ? '동영상' : '자료'} 모음`;
  if (allVideo) return '동영상 모음';
  if (kids.every((n) => n.type === 'image')) return '이미지 모음';
  return '자료 모음';
}

/** 선택을 프레임으로 묶은 직후 — 자식 내용(캡션·메모·문서·임베드 제목)을 분석해
    어울리는 짧은 제목을 자동으로 붙인다. 저가 티어 LLM 한 번, 키가 없거나 실패
    하면 키워드 휴리스틱 폴백. 그새 사용자가 제목을 직접 바꿨으면 덮어쓰지 않는다. */
export async function autoTitleFrame(frameId: string): Promise<void> {
  const b = useBoardStore.getState();
  const frame = b.nodes[frameId];
  if (!frame) return;
  const kids = Object.values(b.nodes).filter((n) => n.data?.frameId === frameId);
  const texts = kids
    .map((n) => ((typeof n.data?.title === 'string' && n.data.title) || n.text || '').split('\n')[0].trim())
    .filter(Boolean)
    .slice(0, 12);
  if (!kids.length || !texts.length) return;

  let title = '';
  try {
    const res = await callGateway({
      task: 'writing',
      provider: 'auto',
      tier: 'low',
      maxTokens: 40,
      messages: [{
        role: 'user',
        content:
          `다음은 유아 교사의 보드에서 한 프레임으로 묶인 자료들의 제목/내용이다. ` +
          `이 묶음 전체에 어울리는 간단한 한국어 제목을 4~12자로 딱 하나만, 따옴표나 설명 없이 출력하라.\n` +
          texts.map((t) => `- ${t.slice(0, 60)}`).join('\n'),
      }],
    });
    if (res.ok && res.text && !res.mocked) {
      title = res.text.trim().split('\n')[0].replace(/^["'「『]+|["'」』.]+$/g, '').slice(0, 20);
    }
  } catch { /* 키 없음/실패 → 휴리스틱 폴백 */ }
  if (!title) title = keywordTitle(texts, kids);
  if (!title) return;

  const cur = useBoardStore.getState().nodes[frameId];
  if (!cur) return; // 기다리는 동안 프레임이 지워짐(undo 등)
  const curTitle = (cur.data?.title as string) ?? '';
  if (curTitle && curTitle !== '새 프레임') return; // 사용자가 먼저 이름 지음
  useBoardStore.getState().updateNodeRaw(frameId, { data: { ...(cur.data ?? {}), title } });
}

/** 형제 그림 참조 표현 — "옆에 있는/이 프레임/연결된/다른 그림들과 스타일 통일·맞춰" 류.
    ("옆모습으로" 같은 일반 표현은 잡지 않도록 명사 결합을 요구한다.) */
const SIBLING_REF_RE =
  /옆에\s*있는|옆\s*(이미지|그림|카드)|이\s*프레임|프레임\s*(안|속)|연결된|연결돼\s*있는|이어진|다른\s*(이미지|그림|카드)들?|(스타일|화풍|느낌|분위기)[\s\S]{0,12}?(통일|맞춰|맞게|똑같|같게)|통일시/;

/** Regenerate an image card from a prompt.
    - 실패하면 원본 그림·캡션을 그대로 유지하고 실패 안내만 띄운다(조용한 손상 방지).
    - 성공하면 이전 표시용 썸네일(data.thumb)을 무효화 — 보드는 thumb||src를 그리므로
      이걸 지우지 않으면 새 그림이 생성돼도 옛 그림이 계속 보인다.
    - 캡션은 프롬프트 원문이 아니라 핵심 주제만("거북이를 탄 토끼로 바꿔줘 이미지를"
      → "거북이를 탄 토끼"). 스타일 수정("더 밝게 해줘")이면 원래 캡션을 유지한다.
    - "옆에 있는/이 프레임/다른 그림들과 스타일 통일" — 모델은 옆 그림을 볼 수 없으므로
      같은 프레임 형제 캡션들을 '같은 시리즈' 맥락으로 풀어서 실어준다. */
export async function regenImageCard(nodeId: string, prompt: string): Promise<void> {
  const b = useBoardStore.getState();
  const orig = b.nodes[nodeId];
  if (!orig) return;
  b.beginGen();
  b.setGenerating('🎨 이미지를 다시 그리고 있어요…');
  b.updateNodeRaw(nodeId, { loading: true });
  try {
    const origCaption = (orig.text ?? '').trim();
    const subject = coreTopic(prompt);
    // 새 주제인가? — 그리기/교체 동사가 있거나, 명령 어미가 없는 맨 주제어("겨울 풍경").
    const isCommand = /(줘|주세요|줄래|주라|달라|다오)/.test(prompt);
    const isNewSubject = /그려|그리|바꿔|바꾸|만들|생성/.test(prompt);
    const caption = (!isCommand || isNewSubject) && subject.length >= 2 ? subject : origCaption || subject;
    // 스타일/부분 수정(캡션 유지)이면 원래 주제를 프롬프트에 함께 실어 무엇을 그릴지
    // 알려준다("더 밝게 해줘"만으로는 대상이 없다). 새 주제면 프롬프트가 이미 대상 포함.
    let genPrompt = caption === origCaption && origCaption ? `${origCaption} — ${prompt}` : prompt;
    // 형제 그림 참조 → 시리즈 맥락 주입. 참조 소스는 두 가지를 합친다:
    //  ① 같은 프레임(data.frameId) 안의 이미지들  ② 선(links)으로 연결된 연결망의 이미지들.
    if (SIBLING_REF_RE.test(prompt)) {
      const refIds = new Set<string>();
      const frameId = orig.data?.frameId as string | undefined;
      if (frameId) {
        for (const n of Object.values(b.nodes))
          if (n.id !== nodeId && n.data?.frameId === frameId) refIds.add(n.id);
      }
      const live = b.links.filter((l) => b.nodes[l.from] && b.nodes[l.to]);
      for (const id of linkedComponent(nodeId, live)) if (id !== nodeId) refIds.add(id);
      const sibs = [...refIds]
        .map((id) => b.nodes[id])
        .filter((n) => n?.type === 'image')
        .map((n) => (n.text ?? '').trim())
        .filter(Boolean);
      if (sibs.length) {
        const frameTopic = frameId
          ? (((b.nodes[frameId]?.data?.title as string | undefined) ?? '').trim())
          : '';
        genPrompt =
          `${caption}${frameTopic ? ` — '${frameTopic}' 시리즈의 한 장` : ''}. ` +
          `같은 시리즈의 다른 그림들(${sibs.join(', ')})과 동일한 화풍·색감·구도·배경 톤으로 통일. 지시: ${prompt}`;
      }
    }
    const res = await callGateway({
      task: 'image',
      provider: 'auto',
      messages: [],
      meta: { prompt: `${genPrompt} — ${KV_ART_STYLE}`, caption },
    });
    const fresh = useBoardStore.getState().nodes[nodeId];
    if (!fresh) return; // 기다리는 동안 카드가 지워짐
    if (res.ok && res.image) {
      const data = { ...(fresh.data ?? {}) };
      delete data.thumb; // 새 src 기준으로 ensureThumb가 다시 만든다
      delete data.fromLibrary; // 이제 새로 생성된 그림
      useBoardStore.getState().updateNodeRaw(nodeId, { loading: false, src: res.image, text: caption, data });
    } else {
      useBoardStore.getState().updateNodeRaw(nodeId, { loading: false }); // 원본 유지
      useBoardStore.getState().setGenerating('⚠️ 이미지 수정에 실패했어요 — 원본 그림을 유지해요');
      await new Promise((r) => setTimeout(r, 2400)); // 안내가 읽힐 시간
    }
  } finally {
    useBoardStore.getState().endGen();
  }
}

/**
 * 이미지 노드의 배경을 제거(누끼)해 투명 PNG로 만들고 갤러리(보관함)에 저장한다. 보드 전역
 * 공용 엔진(@/shared/background-removal — 온디바이스 BiRefNet/MIT, WebGPU+워커)을 호출한다.
 * 프롬프트바·인라인 버튼이 모두 이 함수 하나를 거친다(로직 중복 없음).
 * - mode 'replace'(기본): 그 자리 교체(되돌리기 가능 — replaceImageCmd). 레이아웃 보존.
 * - mode 'newNode': 원본은 두고 옆에 누끼 결과를 새 노드로.
 * - assetKind: 엔진 안전 티어 분기에 사용(child-photo·unknown은 무조건 온디바이스).
 * - 첫 호출은 모델 다운로드로 더 걸려 진행 상태를 보여준다. 실패 시 원본 유지.
 */
export async function removeBgFromNode(
  nodeId: string,
  opts: { mode?: 'replace' | 'newNode'; assetKind?: AssetKind } = {},
): Promise<void> {
  const mode = opts.mode ?? 'replace';
  const assetKind: AssetKind = opts.assetKind ?? 'unknown';
  const b = useBoardStore.getState();
  const orig = b.nodes[nodeId];
  if (!orig || orig.type !== 'image' || !orig.src) {
    showToast('배경을 제거할 이미지를 먼저 선택해 주세요', 'error');
    return;
  }
  const src = orig.src;
  const caption = (orig.text ?? '').trim() || String(orig.data?.title ?? '').trim() || '이미지';
  // 이미 배경제거된 이미지를 또 제거하면 = "잔여 노이즈 불만족" → 모델을 다시 돌리지 않고
  // (재실행은 잘린 점을 다시 잡아 더 지저분해진다) 알파만 정리(despeckle)한다. 단계마다 강하게.
  const alreadyRemoved = orig.data?.bgRemoved === true;
  const cleanupLevel = alreadyRemoved ? (Number(orig.data?.bgLevel) || 1) : 0; // 0=첫 제거(모델)
  const level = cleanupLevel + 1;
  b.beginGen();
  b.setGenerating(
    cleanupLevel > 0
      ? `✂️ 잔여 점·헤일로를 정리하고 있어요… (${cleanupLevel}단계)`
      : '✂️ 배경을 지우고 있어요… (처음 한 번은 조금 걸려요)',
  );
  b.updateNodeRaw(nodeId, { loading: true });
  try {
    // 첫 제거 = 모델(누끼) / 재실행 = 모델 없이 알파 노이즈 정리(빠르고 깨끗).
    const png = cleanupLevel > 0
      ? (await cleanupBackground(src, { level: cleanupLevel })).dataUrl
      : (await removeBackground(src, { assetKind })).dataUrl;
    const fresh = useBoardStore.getState().nodes[nodeId];
    if (!fresh) return; // 기다리는 동안 카드가 지워짐
    // 표시용 썸네일을 투명 PNG로 직접 굽는다(알파 보존; 비동기 ensureThumb의 흰배경 합성·레이스 회피).
    let thumb: string | null = null;
    try {
      thumb = await makeThumb(png, THUMB_MAX_W, true);
    } catch {
      thumb = null;
    }
    const nextData = { ...(fresh.data ?? {}), thumb: thumb ?? '', bgRemoved: true, bgLevel: level };

    if (mode === 'newNode') {
      const id = newId('image');
      addImageNodeCmd(
        {
          id,
          type: 'image',
          x: fresh.x + 28,
          y: fresh.y + 28,
          w: fresh.w,
          h: fresh.h,
          scale: fresh.scale,
          src: png,
          text: `${caption} (배경제거)`,
          data: { ...nextData, role: 'image' },
        } as BoardNode,
        '배경 제거',
      );
    } else {
      replaceImageCmd(nodeId, png, nextData, '배경 제거'); // 그 자리 교체 + ⌘Z 복원
    }

    // 첫 제거만 갤러리(보관함)에 저장 — 재실행(정리)은 중복 저장하지 않는다.
    if (cleanupLevel === 0) await saveAsset(`${caption} (배경제거)`, 'image', png, caption);
    useBoardStore.getState().setGenerating(
      cleanupLevel > 0
        ? `✅ 잔여 점을 정리했어요 (${cleanupLevel}단계) — 더 남았으면 한 번 더 누르세요`
        : '✅ 배경을 지웠어요 — 갤러리에 저장했어요 (점이 남았으면 한 번 더 누르세요)',
    );
    await new Promise((r) => setTimeout(r, 1600));
  } catch {
    useBoardStore.getState().updateNodeRaw(nodeId, { loading: false }); // 원본 유지
    useBoardStore.getState().setGenerating('⚠️ 배경 제거에 실패했어요 — 원본을 유지해요');
    await new Promise((r) => setTimeout(r, 2400));
  } finally {
    useBoardStore.getState().endGen();
  }
}

/** Generate/replace a memo or text card's content from a prompt. */
export async function genTextCard(nodeId: string, prompt: string): Promise<void> {
  const ctx = buildAgentContext('writing');
  const text = await genMemo(prompt, ctx);
  useBoardStore.getState().updateNodeRaw(nodeId, { text });
}

/** Board point at the center of the current viewport (board coords). */
export function viewportCenterBoardPoint(): { x: number; y: number } {
  const { zoom, panX, panY } = useBoardStore.getState().viewport;
  const railW = 64; // left icon rail; canvas fills the area to its right
  const cw = Math.max(320, (typeof window !== 'undefined' ? window.innerWidth : 1200) - railW);
  const ch = Math.max(320, typeof window !== 'undefined' ? window.innerHeight : 800);
  return { x: (cw / 2 - panX) / zoom, y: (ch / 2 - panY) / zoom };
}

/** 새 문서의 '겹치지 않는 좌상단' 자리 — 기존 콘텐츠의 오른쪽, 가장 위 콘텐츠와
    상단을 맞춘 자리에서 시작한다. 그 열(오른쪽 옆)에 이미 자료가 있으면 그 아래로
    내려가며 빈자리를 찾고, 한 열이 꽉 차면 한 칸 더 오른쪽 열로 넘어간다.
    빈 보드면 현재 뷰 중앙 기준. (w,h = 새 문서의 대략 크기 — 세로는 넉넉히 추정) */
export function openDocSpot(w: number, h: number): { x: number; y: number } {
  const b = useBoardStore.getState();
  const boxes = Object.values(b.nodes)
    .filter((n) => n.type !== 'motion')
    .map(worldBox);
  if (boxes.length === 0) {
    const c = viewportCenterBoardPoint();
    return { x: Math.round(c.x - w / 2), y: Math.round(c.y - 160) };
  }
  const GAP = 48;
  const top = Math.min(...boxes.map((bx) => bx.y)); // 가장 위 콘텐츠와 상단 정렬
  const rightEdge = Math.max(...boxes.map((bx) => bx.x + bx.w)); // 모든 콘텐츠의 오른쪽 끝
  const hit = (x: number, y: number) =>
    boxes.some((o) => x < o.x + o.w + GAP && x + w + GAP > o.x && y < o.y + o.h + GAP && y + h + GAP > o.y);
  // 첫 열은 '기존 콘텐츠 바로 오른쪽'. 위→아래로 빈자리 스캔, 막히면 다음 열로.
  for (let col = 0; col < 16; col++) {
    const x = rightEdge + GAP + col * (w + GAP);
    for (let row = 0; row < 60; row++) {
      const y = top + row * (h + GAP);
      if (!hit(x, y)) return { x: Math.round(x), y: Math.round(y) };
    }
  }
  return { x: Math.round(rightEdge + GAP), y: Math.round(top) };
}

/** Anchor point for NEW composed content. Returns a CENTER point whose content —
    which may extend up to `reserveLeft` px to the LEFT of that center (a composer
    frame ≈360; a radial mind map ≈660) — starts cleanly to the RIGHT of ALL
    existing content (every frame AND every loose card), with a fixed gap. The
    viewport pans so that start edge sits near the left of the canvas, so the teacher
    sees generation begin in empty space. Empty board → viewport center. */
export function composeOrigin(reserveLeft = 360): { x: number; y: number } {
  const b = useBoardStore.getState();
  const nodes = Object.values(b.nodes);
  if (nodes.length === 0) return viewportCenterBoardPoint();
  const GAP = 220; // clear breathing room between existing content and the new start
  const rightEdge = Math.max(...nodes.map((n) => n.x + n.w));
  const topEdge = Math.min(...nodes.map((n) => n.y));
  const leftStart = rightEdge + GAP; // left edge of the new content
  const cx = leftStart + reserveLeft; // center = start + how far the content reaches left
  const cy = topEdge + 320;
  const { zoom } = b.viewport;
  const ch = Math.max(320, typeof window !== 'undefined' ? window.innerHeight : 800);
  // Pan so the new content's START edge is ~180px from the canvas left (in view),
  // pushing the existing content off to the left.
  b.setViewport({ panX: 180 - leftStart * zoom, panY: ch / 2 - cy * zoom });
  return { x: cx, y: cy };
}
