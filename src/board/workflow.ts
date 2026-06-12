import { useBoardStore, newId, type BoardNode } from '@/store/boardStore';
import { buildAgentContext } from '@/ai/context';
import { callGateway } from '@/ai/client';
import { runPlanIdeas, runPlan } from '@/ai/agents/plan';
import { runStudioImages, runStudioWorksheet, planStudioImages, renderStudioImage, KV_ART_STYLE } from '@/ai/agents/studio';
// 의도 어휘는 단일 출처(intent-lexicon) — 로컬 정규식은 '그려' 등이 빠져 어긋났었다(P0-1).
import { IMAGE_RE, coreTopic } from '@/ai/intent-lexicon';
import { findAsset, saveAsset } from './assets';
import { recordSpawnedNodes } from './commands';
import { worldBox } from './geometry';
import { linkedComponent } from './links';
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
}
export interface SourceThumb {
  thumb: string; // image URL (free image site)
  url: string; // source/landing page (clickable)
  title: string;
  source: string; // e.g. flickr / wikimedia
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
/** A full, professional 주간 놀이계획안 document (markdown) from a WeeklyPlanGrid:
    title, meta line, 주간 교육 목표, a 요일×영역 운영 grid table, 영역 연계, 운영
    유의점 — all derived from the generated plan (no fabricated content). Rendered
    as an A4 document card (react-markdown + GFM table). */
export function planDocMarkdown(p: RegistryPayload): string {
  if (p.type !== 'WeeklyPlanGrid') return planText(p);
  const pr = p.props;
  const band = pr.age_band === '0-2' ? '영아(0–2세)' : '유아(3–5세)';
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

/** 보관함 추천 클릭 → 보드 위 빈 자리에 카드 배치(기존 자료·프레임과 겹치지 않게).
    뷰포트 중앙에서 좌우로 번갈아 벌리며, 자리가 없으면 아래 줄로 내려가며 찾는다. */
export function placeAssetOnBoard(asset: { tag: string; url: string }): string {
  const b = useBoardStore.getState();
  const w = 220;
  const h = 200;
  const GAP = 24;
  const c = viewportCenterBoardPoint();
  const obstacles = Object.values(b.nodes).map((n) => ({
    x: n.x,
    y: n.y,
    w: n.w,
    h: Math.max(typeof n.data?.renderH === 'number' ? (n.data.renderH as number) : n.h, 90),
  }));
  const hit = (x: number, y: number) =>
    obstacles.some((o) => x < o.x + o.w + GAP && x + w + GAP > o.x && y < o.y + o.h + GAP && y + h + GAP > o.y);
  let pos: { x: number; y: number } | null = null;
  const x0 = c.x - w / 2;
  const y0 = c.y - h / 2;
  for (let row = 0; row < 60 && !pos; row++) {
    for (let i = 0; i < 41; i++) {
      const x = x0 + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (w + GAP);
      const y = y0 + row * (h + GAP);
      if (!hit(x, y)) { pos = { x, y }; break; }
    }
  }
  if (!pos) pos = { x: x0, y: y0 };
  const id = newId('image');
  b.addNodeRaw({
    id,
    type: 'image',
    x: Math.round(pos.x),
    y: Math.round(pos.y),
    w,
    h,
    src: asset.url,
    text: asset.tag,
    data: { role: 'image', fromLibrary: true },
  });
  recordSpawnedNodes([id], '보관함 자료 추가');
  b.setSelection([id]);
  return id;
}

/* ---- 유튜브 뷰어 + 프롬프트 = 영상 검색 → 뷰어 아래 썸네일 가로 배열 ---- */

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
export async function searchVideosForViewer(viewerId: string, text: string, count = 3): Promise<void> {
  const b = useBoardStore.getState();
  const viewer = b.nodes[viewerId];
  if (!viewer) return;
  const q = ytQuery(text);
  b.beginGen();
  b.setGenerating(`🔎 유튜브에서 '${q}' 영상을 찾고 있어요…`);

  const W = 168;
  const H = 94; // 16:9 썸네일 — 제목 캡션은 카드가 아래로 덧그린다
  const GAPX = 12;
  const GAPY = 20;
  const CAPTION = 34; // 캡션이 카드 아래로 차지하는 대략 높이(겹침 판정용)
  // 뷰어가 리사이즈/스케일된 어떤 크기여도 — 월드 박스 기준으로 그 '아래'에 깐다.
  const vb = worldBox(viewer);
  const rowW = count * W + (count - 1) * GAPX;
  // 이전 검색 결과 등 기존 카드와 겹치면 행 단위로 아래로 비켜 내린다.
  const others = Object.values(b.nodes).filter((n) => n.id !== viewerId);
  const rowHits = (yy: number) =>
    others.some((n) => {
      const o = worldBox(n);
      return vb.x < o.x + o.w + GAPX && vb.x + rowW + GAPX > o.x && yy < o.y + o.h + GAPY && yy + H + CAPTION + GAPY > o.y;
    });
  let rowY = Math.round(vb.y + vb.h + GAPY);
  while (rowHits(rowY)) rowY += H + CAPTION + GAPY;

  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const id = newId('image');
    b.addNodeRaw({
      id,
      type: 'image',
      x: Math.round(vb.x + i * (W + GAPX)),
      y: rowY,
      w: W,
      h: H,
      loading: true,
      data: { role: 'yt-result', ytTarget: viewerId },
    });
    ids.push(id);
  }

  try {
    const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(q)}&n=${count}`);
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
      bb.updateNodeRaw(cardId, {
        src: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
        text: v.title,
        loading: false,
        // thumb: '' — 교차 출처라 캔버스 축소 불가, 원본(이미 480px)을 그대로 표시
        data: { role: 'yt-result', ytTarget: viewerId, ytId: v.id, thumb: '' },
      });
    });
    recordSpawnedNodes(ids.filter((id) => useBoardStore.getState().nodes[id]), '영상 검색');
  } catch (e) {
    // 실패 — 로딩 카드를 거두고 자리에 안내 메모 하나만 남긴다.
    const bb = useBoardStore.getState();
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
