import { useBoardStore, newId } from '@/store/boardStore';
import { recordSpawnedNodes, captureNodes, pushRedesign } from './commands';
import {
  spawnTextCard,
  spawnDocCard,
  spawnImageCard,
  spawnHeaderCard,
  spawnSourceCard,
  generateIntoFrame,
  placeInFrame,
  planText,
  planDocMarkdown,
  worksheetText,
  topicFor,
  DOC_WIDTH,
  viewportCenterBoardPoint,
  composeOrigin,
  PLAN_DOC_W,
  type SourceLink,
  type SourceThumb,
} from './workflow';
import { designComposedFrame, fitFrameToChildren } from './frames';
import { decorateComposedFrame, decorateDocStickers } from './decorate';
import { ruleBasedVariant, asLayoutVariant, ruleBasedSpec } from './design-spec';
import { runDesignDirector } from '@/ai/agents/design';
import { pickTemplate, type FrameTemplate, type FrameRegion, type FillAgent } from './templates';
import { runRouter } from '@/ai/agents/router';
import { runPlanIdeas, runPlan } from '@/ai/agents/plan';
import { runStudioImages, runStudioWorksheet, KV_ART_STYLE } from '@/ai/agents/studio';
import { runRecord } from '@/ai/agents/record';
import { runWriting } from '@/ai/agents/writing';
import { callGateway } from '@/ai/client';
import { buildAgentContext } from '@/ai/context';
import { PAGE_ACTIONS } from '@/ai/actions';
import { SUGGESTION_HIDE_BELOW, type RouterOutput, type RecordMode, type RouteTarget } from '@/ai/contract';
import type { RegistryPayload } from '@/ui-registry/contracts';

/* Frame Composer (core page brain). A board prompt with nothing selected →
   classify intent (reuse runRouter) → pick a frame template → seed a frame →
   fill it with the right mix of cards via the existing Tier1 agents → attach
   next-step chips. Orchestration only — no new model contract. */

/** A next-step recommendation chip stored on the frame node (data.nextSteps). */
export interface ComposerChip {
  id: string;
  label: string;
  action: FillAgent | 'generate';
  prompt?: string;
  status: 'idle' | 'running' | 'done';
}

const COLORING_RE = /도안|색칠|컬러링/;
/** Mind-map synonyms (생각그물·주제망·놀이 확장맵·아이디어 맵·관심사 확장 …). */
const MINDMAP_RE = /마인드\s*맵|생각\s*그물|주제\s*망|놀이\s*확장\s*맵?|놀이\s*아이디어\s*맵|아이디어\s*맵|관심사\s*확장|확장\s*맵/;
let composing = false; // guard against double-submit racing frame creation

/* ---------------- entry ---------------- */

export async function composeFromPrompt(text: string): Promise<void> {
  if (composing) return;
  composing = true;
  const created: string[] = [];
  try {
    const b = useBoardStore.getState();
    const routerRes = await runRouter(
      {
        text,
        page: '/board',
        selection: { ids: b.selection, types: [], count: b.selection.length },
        available_actions: PAGE_ACTIONS['/board'],
      },
      buildAgentContext('router'),
    );
    const out = routerRes.output;

    // Mind map (생각그물·주제망·놀이 확장맵) — a radial map, built separately.
    if (out.route_to === 'mindmap' || MINDMAP_RE.test(text)) {
      const ids = await buildMindMap(text);
      recordSpawnedNodes(ids, '마인드맵 생성');
      return;
    }

    const template = pickTemplate(out.route_to);
    const variant = ruleBasedVariant(out.route_to); // Design Director — arrange (rule-based)
    const complexity = estimateComplexity(text, out);
    const recordMode: RecordMode = out.mode ?? 'story';

    // Seed the frame — beside existing content (panning there), else viewport center.
    const c = composeOrigin();
    const frameId = newId('frame');
    b.addNodeRaw({
      id: frameId,
      type: 'frame',
      x: Math.round(c.x - 360),
      y: Math.round(c.y - 200),
      w: 720,
      h: 420,
      data: { title: frameTitle(text, template), templateId: template.id, composer: true, variant },
    });
    created.push(frameId);

    // Designed header (top-left of the frame) — placed precisely by designComposedFrame.
    created.push(spawnHeaderCard(frameId, frameTitle(text, template)));

    // Low confidence → clarify as a card (stay on the board).
    if (out.needs_confirmation && out.clarify) {
      created.push(spawnTextCard(frameId, `❓ ${out.clarify.question}`, 'accent-soft', 300, 'clarify'));
    }

    // Fill regions (core only for simple; core+expand for complex).
    const ctx = buildAgentContext('plan');
    const regions = template.regions
      .filter((r) => complexity === 'complex' || r.tier === 'core')
      .sort((a, z) => a.order - z.order);
    let planId: string | undefined;
    for (const region of regions) {
      try {
        const agent = effectiveAgent(region, template, text);
        const res = await fillRegion(frameId, agent, text, ctx, planId, recordMode);
        created.push(...res.ids);
        if (res.planId) planId = res.planId;
      } catch {
        created.push(spawnTextCard(frameId, `⚠️ ‘${region.id}’ 생성에 실패했어요. 다시 시도해 주세요.`, 'accent-soft', 280, region.role));
      }
    }

    // Next-step chips on the frame.
    attachNextSteps(frameId, template, out.suggested_next);
    b.setSelection([frameId]);

    // Hybrid Design Director (content-aware arrange + decorate) runs while the
    // auto-height documents settle; the rule-based spec is its built-in fallback.
    const [spec] = await Promise.all([
      runDesignDirector({ topic: text, routeTo: out.route_to, components: summarizeComponents(frameId) }).catch(
        () => ruleBasedSpec(out.route_to), // a director throw must not abandon layout + undo-record
      ),
      new Promise((r) => setTimeout(r, 260)),
    ]);
    const fnode = useBoardStore.getState().nodes[frameId];
    if (fnode) {
      useBoardStore.getState().updateNodeRaw(frameId, { data: { ...(fnode.data ?? {}), variant: spec.variant, stickers: spec.stickers } });
    }
    designComposedFrame(frameId, spec.variant);
    decorateComposedFrame(frameId, text, spec.stickers);
    if (spec.coverRole) void generateCoverFor(frameId, spec.coverRole, text);
    recordSpawnedNodes(created, 'AI 보드 생성');
  } finally {
    composing = false;
  }
}

/* ---------------- mind map (생각그물 — radial layout + connection lines) ---------------- */

function mindMapTopic(text: string): string {
  const cleaned = text
    .replace(MINDMAP_RE, '')
    .replace(/(만들어\s*줘|만들어|그려\s*줘|해\s*줘|짜\s*줘|주제|에\s*대한|에\s*대해|로|을|를|으로)\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || '오늘의 주제';
}

/** Build a radial mind map: the topic at the center, activity branches around it
    connected by lines, with concept images on a few branches. Returns spawned ids
    (the caller records them as one undoable step). No `composing` guard — it runs
    inside composeFromPrompt's guard. */
async function buildMindMap(text: string): Promise<string[]> {
  const b = useBoardStore.getState();
  const created: string[] = [];
  const topic = mindMapTopic(text);
  const ctx = buildAgentContext('plan');
  const c = composeOrigin(); // beside existing content (pans there), else viewport center

  // Frame container (groups + saves + holds the edge list).
  const frameId = newId('frame');
  b.addNodeRaw({
    id: frameId, type: 'frame', x: Math.round(c.x - 420), y: Math.round(c.y - 340), w: 840, h: 680,
    data: { title: topic.slice(0, 18) || '생각그물', mindmap: true, composer: true },
  });
  created.push(frameId);

  // Center node — the topic.
  const CW = 230, CH = 92;
  const centerId = newId('sticky');
  b.addNodeRaw({
    id: centerId, type: 'sticky', x: Math.round(c.x - CW / 2), y: Math.round(c.y - CH / 2), w: CW, h: CH, autoH: true,
    text: topic, color: 'accent', data: { role: 'mm-center', frameId },
  });
  created.push(centerId);

  const edges: Array<{ from: string; to: string }> = [];

  // Activity branches, radial around the center.
  const ideas = await runPlanIdeas(topic, ctx, 7);
  const branches = ideas.slice(0, 8);
  const N = Math.max(branches.length, 1);
  const R = 360, BW = 220;
  const branchIds: string[] = [];
  branches.forEach((idea, i) => {
    const ang = -Math.PI / 2 + (2 * Math.PI / N) * i;
    const id = newId('sticky');
    b.addNodeRaw({
      id, type: 'sticky',
      x: Math.round(c.x + R * Math.cos(ang) - BW / 2),
      y: Math.round(c.y + R * Math.sin(ang) - 44),
      w: BW, h: 84, autoH: true,
      text: `${idea.label}\n${idea.desc}`, color: 'accent-soft', data: { role: 'mm-branch', frameId },
    });
    branchIds.push(id);
    edges.push({ from: centerId, to: id });
    created.push(id);
  });

  const persistEdges = () => {
    const fr = useBoardStore.getState().nodes[frameId];
    if (fr) useBoardStore.getState().updateNodeRaw(frameId, { data: { ...(fr.data ?? {}), edges: [...edges] } });
  };
  persistEdges(); // center→branch lines appear immediately (before images/web resolve)

  // Concept images (branch leaves) + a web 자료 node, fetched in parallel.
  const [imgRes, web] = await Promise.all([
    runStudioImages(topic, branches.slice(0, 3).map((i) => i.label), ctx, 'image'),
    buildWebSource(topic).catch(() => null),
  ]);
  if (imgRes.payload.type === 'StudioGallery') {
    imgRes.payload.props.items.slice(0, 3).forEach((it, i) => {
      if (!branchIds[i]) return;
      const ang = -Math.PI / 2 + (2 * Math.PI / N) * i;
      const id = newId('image');
      b.addNodeRaw({
        id, type: 'image',
        x: Math.round(c.x + (R + 215) * Math.cos(ang) - 80),
        y: Math.round(c.y + (R + 215) * Math.sin(ang) - 70),
        w: 160, h: 140, src: it.url, text: it.caption, data: { role: 'mm-leaf', frameId },
      });
      edges.push({ from: branchIds[i], to: id });
      created.push(id);
    });
  }

  // Web 자료 node — clickable links/thumbnails, connected to the center.
  if (web) {
    const wid = newId('sticky');
    b.addNodeRaw({
      id: wid, type: 'sticky',
      x: Math.round(c.x - 170), y: Math.round(c.y + R + 160),
      w: 340, h: 200, autoH: true, color: 'surface-2',
      data: { role: 'source', frameId, links: web.links, thumbs: web.thumbs, summary: web.summary },
    });
    edges.push({ from: centerId, to: wid });
    created.push(wid);
  }

  persistEdges(); // final edges (incl. branch-leaf images + web source)

  useBoardStore.getState().setSelection([frameId]);
  await new Promise((r) => setTimeout(r, 260));
  fitFrameToChildren(frameId);
  return created;
}

/** Append edges to a mind-map frame's edge list (re-reads fresh state). */
function addMindMapEdges(frameId: string, more: Array<{ from: string; to: string }>): void {
  const fr = useBoardStore.getState().nodes[frameId];
  if (!fr) return;
  const edges = [...((fr.data?.edges as Array<{ from: string; to: string }>) ?? []), ...more];
  useBoardStore.getState().updateNodeRaw(frameId, { data: { ...(fr.data ?? {}), edges } });
}

/** Expand a mind-map branch into 3 sub-activities, fanned further out along the
    branch's outward direction and connected to it (click the ＋ on a branch). */
export async function expandMindMapBranch(branchId: string): Promise<void> {
  const b = useBoardStore.getState();
  const branch = b.nodes[branchId];
  const frameId = branch?.data?.frameId as string | undefined;
  if (!branch || !frameId) return;
  const center = Object.values(b.nodes).find((n) => n.data?.frameId === frameId && n.data?.role === 'mm-center');
  if (!center) return;

  const bx = branch.x + branch.w / 2;
  const by = branch.y + (typeof branch.data?.renderH === 'number' ? branch.data.renderH : branch.h) / 2;
  const cx = center.x + center.w / 2;
  const cy = center.y + center.h / 2;
  const ang = Math.atan2(by - cy, bx - cx);
  const dist = Math.hypot(bx - cx, by - cy) || 360;

  const label = (branch.text ?? '').split('\n')[0].trim() || '활동';
  const subs = (await runPlanIdeas(label, buildAgentContext('plan'), 3)).slice(0, 3);
  if (subs.length === 0) return;

  const SW = 184, R2 = dist + 210;
  const created: string[] = [];
  const edges: Array<{ from: string; to: string }> = [];
  subs.forEach((idea, i) => {
    const a = ang + (i - (subs.length - 1) / 2) * 0.5; // fan around the branch direction
    const id = newId('sticky');
    b.addNodeRaw({
      id, type: 'sticky',
      x: Math.round(cx + R2 * Math.cos(a) - SW / 2),
      y: Math.round(cy + R2 * Math.sin(a) - 32),
      w: SW, h: 60, autoH: true,
      text: `${idea.label}\n${idea.desc}`, color: 'surface-2', data: { role: 'mm-branch', frameId },
    });
    edges.push({ from: branchId, to: id });
    created.push(id);
  });

  addMindMapEdges(frameId, edges);
  await new Promise((r) => setTimeout(r, 220));
  fitFrameToChildren(frameId);
  recordSpawnedNodes(created, '가지 확장');
}

/** Make an A4 activity worksheet from a selected idea/branch and connect it (in a
    mind map) or place it in the frame. ("이 활동으로 활동지 만들기") */
export async function worksheetFromNode(nodeId: string): Promise<void> {
  const b = useBoardStore.getState();
  const node = b.nodes[nodeId];
  if (!node) return;
  const frameId = node.data?.frameId as string | undefined;
  const activity = (node.text ?? '').split('\n')[0].trim() || (node.text ?? '활동');

  // Loading doc placed to the right of the source card.
  const id = newId('sticky');
  b.addNodeRaw({
    id, type: 'sticky',
    x: Math.round(node.x + node.w + 48), y: Math.round(node.y), w: DOC_WIDTH, h: 240, autoH: true,
    text: '✏️ 활동지를 만들고 있어요…', color: 'paper',
    data: { doc: true, role: 'worksheet', loadingDoc: true, ...(frameId ? { frameId } : {}) },
  });
  if (frameId && Array.isArray(useBoardStore.getState().nodes[frameId]?.data?.edges)) {
    addMindMapEdges(frameId, [{ from: nodeId, to: id }]);
  }
  useBoardStore.getState().setSelection([id]);

  try {
    const res = await runStudioWorksheet(activity, buildAgentContext('studio'));
    const cur = useBoardStore.getState().nodes[id];
    b.updateNodeRaw(id, {
      text: worksheetText(res.payload),
      data: { ...(cur?.data ?? {}), doc: true, role: 'worksheet', payload: res.payload, loadingDoc: false },
    });
  } catch {
    const cur = useBoardStore.getState().nodes[id];
    b.updateNodeRaw(id, { text: `‘${activity}’ 활동지 생성에 실패했어요.`, data: { ...(cur?.data ?? {}), loadingDoc: false } });
  }
  if (frameId) {
    await new Promise((r) => setTimeout(r, 260));
    fitFrameToChildren(frameId);
  }
  recordSpawnedNodes([id], '활동지 만들기');
}

/* ---------------- classification ---------------- */

function estimateComplexity(text: string, r: RouterOutput): 'simple' | 'complex' {
  const t = text.trim();
  if (t.length > 38) return 'complex';
  if (/그리고|및|랑|[,+]|[0-9]+\s*(개|장|가지)/.test(t)) return 'complex';
  if (r.route_to === 'plan') return 'complex'; // a weekly plan implies ideas + grid + images
  if (/활동지|도안|이미지|계획|통신문|평가/.test(t) && /와|과|랑|,|그리고/.test(t)) return 'complex';
  return 'simple';
}

function frameTitle(text: string, t: FrameTemplate): string {
  const cleaned = text
    .replace(/(만들어\s*줘|만들어|그려\s*줘|해\s*줘|작성해\s*줘|짜\s*줘|추천해\s*줘|찾아\s*줘)\s*$/g, '')
    .trim();
  return (cleaned || t.title).slice(0, 24);
}

function effectiveAgent(region: FrameRegion, template: FrameTemplate, prompt: string): FillAgent {
  if (template.id === 'studio' && region.id === 'core') {
    return COLORING_RE.test(prompt) ? 'studio.coloring' : 'studio.worksheet';
  }
  return region.agent;
}

/* ---------------- region fill (reuse Tier1 agents → board cards) ---------------- */

interface FillResult {
  ids: string[];
  planId?: string;
}

async function fillRegion(
  frameId: string,
  agent: FillAgent,
  topic: string,
  ctx: string,
  planId: string | undefined,
  recordMode: RecordMode,
): Promise<FillResult> {
  const ids: string[] = [];
  switch (agent) {
    case 'plan.ideas': {
      const ideas = await runPlanIdeas(topic, ctx);
      ideas.slice(0, 4).forEach((it) => ids.push(spawnTextCard(frameId, `${it.label}\n${it.desc}`, 'accent-soft', 240, 'idea')));
      return { ids };
    }
    case 'plan.grid': {
      const res = await runPlan(topic, [], ctx);
      // Full professional plan document, landscape A4 (fits the weekly grid table).
      const cid = spawnDocCard(frameId, planDocMarkdown(res.payload), 'plan', PLAN_DOC_W);
      stashPayload(cid, res.payload);
      ids.push(cid);
      const pid = res.payload.type === 'WeeklyPlanGrid' ? res.payload.props.id : undefined;
      return { ids, planId: pid };
    }
    case 'studio.images':
    case 'studio.coloring': {
      const res = await runStudioImages(topic, [], ctx, agent === 'studio.coloring' ? '도안' : 'image');
      if (res.payload.type === 'StudioGallery') {
        res.payload.props.items.forEach((it) => ids.push(spawnImageCard(frameId, it.url, it.caption)));
      }
      return { ids };
    }
    case 'studio.worksheet': {
      const res = await runStudioWorksheet(topic, ctx, planId);
      const cid = spawnDocCard(frameId, payloadText(res.payload), 'worksheet');
      stashPayload(cid, res.payload);
      ids.push(cid);
      return { ids };
    }
    case 'writing.letter': {
      const res = await runWriting(topic, ctx);
      const cid = spawnDocCard(frameId, payloadText(res.payload), 'letter');
      stashPayload(cid, res.payload);
      ids.push(cid);
      return { ids };
    }
    case 'record': {
      const res = await runRecord({ text: topic, mode: recordMode, grounding: { photos: [], teacher_notes: [topic] } }, ctx);
      const cid = spawnDocCard(frameId, payloadText(res.payload), 'record');
      stashPayload(cid, res.payload);
      ids.push(cid);
      return { ids };
    }
    case 'source.web': {
      const cid = await spawnWebSource(frameId, topic);
      if (cid) ids.push(cid);
      return { ids };
    }
    case 'memo':
    default: {
      // generateIntoFrame spawns directly (image-kw → image, else memo) — diff to capture ids.
      const before = new Set(Object.keys(useBoardStore.getState().nodes));
      await generateIntoFrame(frameId, topic);
      Object.keys(useBoardStore.getState().nodes)
        .filter((k) => !before.has(k))
        .forEach((k) => ids.push(k));
      return { ids };
    }
  }
}

/** Build web-자료 data → topic thumbnails (free image sites) + curated search links
    (YouTube·Google·Pinterest·Pixabay). Shared by the source card + the mind map. */
async function buildWebSource(topic: string): Promise<{ summary: string; links: SourceLink[]; thumbs: SourceThumb[] }> {
  const res = await callGateway({
    task: 'search',
    system:
      '유치원 교사를 위한 웹 자료를 찾는다. 첫 줄에 "IMG: " 뒤에 이 주제를 가장 잘 보여주는 영어 이미지 검색 키워드 2~3개(구체적·시각적 명사 위주, 아동/유아 주제면 children 포함)를 중요한 순서로 공백 구분해 적고, 다음 줄부터 한국어 1~2문장(80자 내외)으로 핵심 자료와 수업 활용 팁을 평문으로 요약하라(머리말·목록·마크다운 금지).',
    messages: [{ role: 'user', content: `${topic} 관련 유아 수업 자료/아이디어를 찾아줘` }],
  });

  const text = res.ok && res.text ? res.text.trim() : '';
  // First "IMG: <keywords>" gives the image-search terms; strip EVERY IMG: fragment
  // from the blurb (the model sometimes repeats it mid/末-text).
  const im = text.match(/IMG:\s*([^\n]+)/i);
  const imgQuery = im ? im[1].trim() : '';
  const blurb = text.replace(/IMG:[^\n]*/gi, ' ');
  const clean = blurb.replace(/[*#>_`|]/g, '').replace(/\s+/g, ' ').trim();
  const summary = clean
    ? clean.length > 150
      ? `${clean.slice(0, 150).replace(/\S*$/, '').trim()}…`
      : clean
    : `‘${topic}’ 관련 무료 자료와 검색 링크입니다.`;

  // Real topic thumbnails from free image sites (Openverse — CC images, no key).
  const thumbs = await fetchFreeImages(imgQuery || topic);

  // Curated search shortcuts — always relevant, open the topic search directly.
  const q = encodeURIComponent(topic);
  const links: SourceLink[] = [
    { title: '유튜브에서 영상 검색', url: `https://www.youtube.com/results?search_query=${q}`, domain: 'youtube.com' },
    { title: '구글 이미지 검색', url: `https://www.google.com/search?tbm=isch&q=${q}`, domain: 'google.com' },
    { title: 'Pinterest 활동 아이디어', url: `https://www.pinterest.com/search/pins/?q=${q}`, domain: 'pinterest.com' },
    { title: 'Pixabay 무료 이미지', url: `https://pixabay.com/images/search/${q}/`, domain: 'pixabay.com' },
  ];
  return { summary, links, thumbs };
}

/** Web 자료 card placed inside a frame via placeInFrame (composer source region). */
async function spawnWebSource(frameId: string, topic: string): Promise<string | null> {
  const { summary, links, thumbs } = await buildWebSource(topic);
  return spawnSourceCard(frameId, summary, links, thumbs);
}

/** Fetch topic image thumbnails from Openverse (aggregated free/CC image sites,
    no API key). Each result links back to its source page. Openverse AND-matches
    every term, so a long keyword string returns nothing — cascade to fewer words
    until we get hits. Best-effort (no thumbnails on failure). */
async function fetchFreeImages(query: string): Promise<SourceThumb[]> {
  const words = query.trim().split(/\s+/).filter(Boolean);
  // 2 words is the sweet spot (enough results + on-topic); fall back to 3 then 1.
  const candidates = [words.slice(0, 2).join(' '), words.slice(0, 3).join(' '), words[0] || query]
    .filter((q, i, a) => q && a.indexOf(q) === i);
  for (const q of candidates) {
    try {
      const r = await fetch(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=6&mature=false`);
      if (!r.ok) continue;
      const j = (await r.json()) as {
        results?: Array<{ thumbnail?: string; foreign_landing_url?: string; url?: string; title?: string; source?: string }>;
      };
      const items = (j.results ?? [])
        .filter((x) => x.thumbnail)
        .slice(0, 4)
        .map((x) => ({
          thumb: x.thumbnail as string,
          url: x.foreign_landing_url || x.url || '#',
          title: (x.title || '이미지').slice(0, 40),
          source: x.source || '',
        }));
      if (items.length) return items;
    } catch {
      /* try the next, shorter candidate */
    }
  }
  return [];
}

/** Stash the source RegistryPayload on a card (for save fidelity + future detail edit). */
function stashPayload(id: string, payload: RegistryPayload): void {
  const b = useBoardStore.getState();
  const n = b.nodes[id];
  if (n) b.updateNodeRaw(id, { data: { ...(n.data ?? {}), payload } });
}

/** Flatten a RegistryPayload to a board-card text preview. */
function payloadText(p: RegistryPayload): string {
  switch (p.type) {
    case 'WeeklyPlanGrid':
      return planText(p);
    case 'WorksheetCard':
      return worksheetText(p);
    case 'LetterPreview':
      return `✉️ ${p.props.title}\n${p.props.body}`;
    case 'RecordDraftCard':
      return `📝 ${p.props.child_label}\n${p.props.observations.map((o) => `· ${o.text}`).join('\n')}${p.props.summary ? `\n\n${p.props.summary}` : ''}`;
    case 'PlayStoryCard':
      return `📖 ${p.props.title}\n${p.props.narrative}${p.props.family_note ? `\n\n가정: ${p.props.family_note}` : ''}`;
    case 'AssessmentReport':
      return `📋 ${p.props.child_label}\n${p.props.domains.map((d) => `· ${d.area}: ${d.observation}`).join('\n')}\n\n${p.props.summary}`;
    case 'StudioGallery':
      return p.props.title;
    case 'ClarifyPrompt':
      return `❓ ${p.props.question}`;
    default:
      return '';
  }
}

/* ---------------- next-step chips ---------------- */

function attachNextSteps(frameId: string, template: FrameTemplate, suggested: RouterOutput['suggested_next']): void {
  const chips: ComposerChip[] = [];
  const seen = new Set<string>();
  for (const ns of template.nextSteps) {
    if (seen.has(ns.label)) continue;
    seen.add(ns.label);
    chips.push({ id: newId('chip'), label: ns.label, action: ns.action, prompt: ns.prompt, status: 'idle' });
  }
  for (const s of suggested) {
    if (s.confidence < SUGGESTION_HIDE_BELOW || seen.has(s.label)) continue;
    seen.add(s.label);
    chips.push({ id: newId('chip'), label: s.label, action: 'generate', prompt: s.label, status: 'idle' });
  }
  const top = chips.slice(0, 4);
  if (top.length === 0) return;
  const b = useBoardStore.getState();
  const frame = b.nodes[frameId];
  if (frame) b.updateNodeRaw(frameId, { data: { ...(frame.data ?? {}), nextSteps: top } });
}

const FILL_AGENTS = new Set<string>([
  'plan.ideas', 'plan.grid', 'studio.images', 'studio.coloring', 'studio.worksheet', 'writing.letter', 'record', 'memo', 'source.web',
]);

function setChipStatus(frameId: string, chipId: string, status: ComposerChip['status']): void {
  const b = useBoardStore.getState();
  const frame = b.nodes[frameId];
  const chips = (frame?.data?.nextSteps as ComposerChip[] | undefined) ?? [];
  b.updateNodeRaw(frameId, { data: { ...(frame?.data ?? {}), nextSteps: chips.map((c) => (c.id === chipId ? { ...c, status } : c)) } });
}

function planIdOf(frameId: string): string | undefined {
  const b = useBoardStore.getState();
  for (const n of Object.values(b.nodes)) {
    if (n.data?.frameId === frameId) {
      const p = n.data?.payload as RegistryPayload | undefined;
      if (p?.type === 'WeeklyPlanGrid') return p.props.id;
    }
  }
  return undefined;
}

/** Run a frame chip → expand inside the same frame (cards land via placeInFrame). */
export async function runComposerChip(frameId: string, chipId: string): Promise<void> {
  const b = useBoardStore.getState();
  const frame = b.nodes[frameId];
  const chip = (frame?.data?.nextSteps as ComposerChip[] | undefined)?.find((c) => c.id === chipId);
  if (!chip || chip.status === 'running') return;
  setChipStatus(frameId, chipId, 'running');
  try {
    const agent: FillAgent = FILL_AGENTS.has(chip.action) ? (chip.action as FillAgent) : 'memo';
    const topic = chip.prompt?.trim() || topicFor(frameId);
    const res = await fillRegion(frameId, agent, topic, buildAgentContext('plan'), planIdOf(frameId), 'story');
    recordSpawnedNodes(res.ids, '확장');
    setChipStatus(frameId, chipId, 'done');
    // Re-arrange into the designed layout so the new card lands in its proper slot
    // (활동지/웹 자료 → bottom row), then wrap the frame (after cards measure) and
    // decorate any newly added document with theme stickers.
    await new Promise((r) => setTimeout(r, 260));
    // re-read fresh — the `frame` captured at the top is stale after generation.
    const fdata = useBoardStore.getState().nodes[frameId]?.data;
    designComposedFrame(frameId, asLayoutVariant(fdata?.variant));
    decorateComposedFrame(frameId, topicFor(frameId), fdata?.stickers as string[] | undefined);
  } catch {
    setChipStatus(frameId, chipId, 'idle');
  }
}

/* ---------------- Design Director helpers (P2) ---------------- */

/** Summarize a frame's current cards (role + short title) for the director. */
function summarizeComponents(frameId: string): Array<{ role: string; title: string }> {
  const b = useBoardStore.getState();
  const out: Array<{ role: string; title: string }> = [];
  for (const n of Object.values(b.nodes)) {
    if (n.data?.frameId !== frameId || n.id === frameId) continue;
    const role = (n.data?.role as string) || n.type;
    if (role === 'header') continue;
    const title = (n.text ?? '').replace(/[#*>_`|]/g, '').split('\n').find((l) => l.trim())?.slice(0, 40) ?? role;
    out.push({ role, title });
  }
  return out;
}

/** Background-generate ONE cover illustration for a document the director flagged. */
async function generateCoverFor(frameId: string, role: string, topic: string): Promise<void> {
  const doc = Object.values(useBoardStore.getState().nodes).find(
    (n) => n.data?.frameId === frameId && n.data?.role === role,
  );
  if (!doc || doc.data?.coverImage) return;
  try {
    const img = await callGateway({
      task: 'image',
      provider: 'auto',
      messages: [],
      meta: { prompt: `${topic} 표지 일러스트, 글자 없음 — ${KV_ART_STYLE}`, caption: topic },
    });
    if (!img.image) return;
    const cur = useBoardStore.getState().nodes[doc.id];
    if (cur) useBoardStore.getState().updateNodeRaw(doc.id, { data: { ...(cur.data ?? {}), coverImage: img.image } });
    await new Promise((r) => setTimeout(r, 260));
    fitFrameToChildren(frameId);
  } catch {
    /* cover is optional — silently skip on failure */
  }
}

/* ---------------- P4: free-form design commands on a selected frame ---------------- */

/** A selected composer frame + a design command ("사진 크게 / 겨울 느낌으로 / 2열로
    정리") → the Design Director re-decides the layout variant + sticker palette and
    re-arranges/re-decorates the frame in place. One undoable step (L1). */
export async function redesignFrame(frameId: string, command: string): Promise<void> {
  const b = useBoardStore.getState();
  const frame = b.nodes[frameId];
  if (!frame || frame.type !== 'frame') return;
  const topic = topicFor(frameId);

  // All nodes that belong to this frame (direct children + sub-frame + nested ideas).
  const direct = Object.values(b.nodes).filter((n) => n.data?.frameId === frameId);
  const subIds = direct.filter((n) => n.type === 'frame' && n.data?.sub).map((n) => n.id);
  const nested = Object.values(b.nodes).filter((n) => subIds.includes(n.data?.frameId as string));
  const ids = [frameId, ...direct.map((n) => n.id), ...nested.map((n) => n.id)];
  const before = captureNodes(ids);

  const routeTo: RouteTarget | null = frame.data?.templateId === 'studio' ? 'studio' : null;
  const spec = await runDesignDirector({
    topic,
    routeTo,
    components: summarizeComponents(frameId),
    instruction: command,
  });

  const fnode = useBoardStore.getState().nodes[frameId];
  if (fnode) {
    useBoardStore.getState().updateNodeRaw(frameId, { data: { ...(fnode.data ?? {}), variant: spec.variant, stickers: spec.stickers } });
  }
  designComposedFrame(frameId, spec.variant);
  decorateComposedFrame(frameId, topic, spec.stickers);
  useBoardStore.getState().setSelection([frameId]);
  pushRedesign(ids, before, '디자인 변경');

  if (spec.coverRole) void generateCoverFor(frameId, spec.coverRole, topic);
}

/* ---------------- decorate a document → parent-shareable illustrated newsletter ---------------- */

const NEWSLETTER_W = 500; // A4-ish portrait newsletter for parents

/** Selected document card + "꾸며줘/예쁘게/부모 공유" → a warm, illustrated
    "주간 놀이 소식지" for parents: rewrites the doc in a friendly tone and adds a
    cover image + activity illustrations (embedded in the card, not raw URLs). */
export async function decorateDocCard(nodeId: string, _prompt: string): Promise<void> {
  const b = useBoardStore.getState();
  const node = b.nodes[nodeId];
  if (!node) return;
  const frameId = node.data?.frameId as string | undefined;
  const source = node.text ?? '';
  const title = (source.match(/^#\s*(.+)$/m)?.[1] ?? source.split('\n')[0] ?? '주간 놀이')
    .replace(/[#*]/g, '')
    .trim();
  const topic = title.replace(/주간\s*(놀이)?\s*계획안?|\(.*?\)/g, '').trim() || title;

  // Spawn the newsletter card immediately with a loading placeholder.
  const id = newId('sticky');
  const pos = frameId
    ? placeInFrame(frameId, NEWSLETTER_W, 360)
    : (() => {
        const c = viewportCenterBoardPoint();
        return { x: Math.round(c.x - NEWSLETTER_W / 2), y: Math.round(c.y - 180) };
      })();
  b.addNodeRaw({
    id,
    type: 'sticky',
    x: pos.x,
    y: pos.y,
    w: NEWSLETTER_W,
    h: 360,
    autoH: true,
    text: '✨ 학부모용 주간 놀이 소식지를 예쁘게 만들고 있어요…',
    color: 'paper',
    data: { doc: true, role: 'newsletter', loadingDoc: true, ...(frameId ? { frameId } : {}) },
  });
  b.setSelection([id]);

  try {
    // Warm parent newsletter text + themed illustrations, in parallel.
    const [letter, gallery] = await Promise.all([
      genNewsletter(source, buildAgentContext('writing')),
      runStudioImages(topic, [], buildAgentContext('studio'), 'image'),
    ]);
    let cover: string | undefined;
    let docImages: string[] = [];
    if (gallery.payload.type === 'StudioGallery') {
      const urls = gallery.payload.props.items.map((it) => it.url).filter((u): u is string => !!u);
      cover = urls[0];
      docImages = urls.slice(1, 3);
    }
    const cur = useBoardStore.getState().nodes[id];
    b.updateNodeRaw(id, {
      text: letter,
      data: { ...(cur?.data ?? {}), doc: true, role: 'newsletter', coverImage: cover, docImages, loadingDoc: false },
    });
    decorateDocStickers(id, topic, 3); // theme stickers on the parent newsletter
  } catch {
    const cur = useBoardStore.getState().nodes[id];
    b.updateNodeRaw(id, { text: source, data: { ...(cur?.data ?? {}), loadingDoc: false } });
  }

  if (frameId) {
    await new Promise((r) => setTimeout(r, 260));
    fitFrameToChildren(frameId);
  }
  recordSpawnedNodes([id], '소식지 꾸미기');
}

/** Rewrite a plan/worksheet document into a warm, parent-facing weekly newsletter. */
async function genNewsletter(sourceDoc: string, ctx: string): Promise<string> {
  const res = await callGateway({
    task: 'writing',
    tier: 'mid',
    provider: 'auto',
    fallback: ['high'],
    system: `너는 유치원 교사를 돕는 문장 에이전트다. 학부모에게 보내는 따뜻하고 정중한 글을 쓴다. 사실을 지어내지 말고 원본 내용에 근거하라.\n${ctx}`,
    messages: [
      {
        role: 'user',
        content: `다음 주간 놀이계획을 학부모에게 공유하는 '주간 놀이 소식지'로 다시 써라.\n구성: 1) 따뜻한 인사말 2) "## 이번 주 놀이 이야기" (요일별 핵심을 친근한 말투로 2~4줄) 3) "## 가정에서 함께해요" (집에서 할 수 있는 제안 1~2가지) 4) 짧은 맺음말.\n제목은 "# "로, 소제목은 "## "로, 핵심 낱말은 **굵게**. "가정에서 함께해요"의 제안은 "> "로 시작하는 인용 블록(콜아웃)으로 감싸라. 280~480자, 이모지 1~3개 가볍게. 마크다운만 출력(코드펜스·머리말 금지).\n\n[원본 계획]\n${sourceDoc.slice(0, 1600)}`,
      },
    ],
    meta: { kind: 'newsletter', title: '주간 소식지', selected: [] },
    maxTokens: 1200,
  });
  const t = res.ok && res.text ? res.text.trim() : '';
  return t ? t.replace(/^```[a-z]*\n?/i, '').replace(/```$/,'').trim() : sourceDoc;
}
