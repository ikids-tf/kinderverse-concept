import { useBoardStore, newId, type BoardNode } from '@/store/boardStore';
import { useBoardsStore } from '@/store/boardsStore';
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
import { decorateComposedFrame, decorateDocStickers, decorateMindMapStickers } from './decorate';
import { ruleBasedVariant, asLayoutVariant, ruleBasedSpec } from './design-spec';
import { runDesignDirector } from '@/ai/agents/design';
import { pickTemplate, type FrameTemplate, type FrameRegion, type FillAgent } from './templates';
import { runRouter } from '@/ai/agents/router';
import { runPlanIdeas, runPlan, runMindMapActivities, type MindActivity } from '@/ai/agents/plan';
import { runStudioImages, runStudioWorksheet, planStudioImages, renderStudioImage, KV_ART_STYLE } from '@/ai/agents/studio';
import { findAsset, saveAsset } from './assets';
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

// 의도 표면형은 단일 출처(intent-lexicon)에서 가져온다 — 층간 어휘 불일치 제거(P0-1).
import {
  COLORING_RE,
  IMAGE_RE as MEDIA_RE,
  WORKSHEET_RE as WORKSHEET_REQ_RE,
  MINDMAP_RE,
} from '@/ai/intent-lexicon';

/* ---------------- entry ---------------- */

/** 진행 단계 메시지 — 프롬프트바·보드 상태 필에 라이브로 스트리밍된다. */
const say = (m: string) => useBoardStore.getState().setGenerating(m);

export async function composeFromPrompt(text: string, forceRoute?: RouteTarget): Promise<void> {
  // 복수 생성 허용 — 단일 실행 가드 대신 genActive 카운터로 동시 작업을 추적한다.
  useBoardStore.getState().beginGen();
  say('🧭 요청을 분석하고 있어요…');
  const created: string[] = [];
  let frameId: string | undefined; // hoisted so `finally` can clear the loading flag
  try {
    const b = useBoardStore.getState();
    let out: RouterOutput;
    if (forceRoute) {
      // 정정 칩(P3-10) 등에서 유형을 직접 지정 — 라우터 호출 생략.
      out = {
        page: '/board',
        selection: { ids: [], types: [], count: 0 },
        available_actions: PAGE_ACTIONS['/board'],
        intent: 'generate',
        scope: 'new',
        route_to: forceRoute,
        suggested_next: [],
        confidence: 1,
      };
    } else {
      // 선택의 '내용'(타입/role)을 라우터에 전달 — 의도 판단 근거 강화(P0-2).
      const selTypes = [...new Set(b.selection.map((id) => {
        const n = b.nodes[id];
        return n ? String((n.data?.role as string) ?? n.type) : '';
      }).filter(Boolean))];
      const routerRes = await runRouter(
        {
          text,
          page: '/board',
          selection: { ids: b.selection, types: selTypes, count: b.selection.length },
          available_actions: PAGE_ACTIONS['/board'],
        },
        buildAgentContext('router'),
      );
      out = routerRes.output;
    }

    // Mind map (생각그물·주제망·놀이 확장맵) — a radial map, built separately.
    // 라우터가 확신 있게(≥0.7) 다른 에이전트로 보냈으면 정규식이 덮어쓰지 않는다(P1-6);
    // 정규식은 라우터가 라우팅하지 못했을 때의 보조 신호로만 쓴다.
    const routerConfident = !!out.route_to && out.confidence >= 0.7;
    if (out.route_to === 'mindmap' || (!routerConfident && MINDMAP_RE.test(text))) {
      useBoardStore.getState().setGenerating('🧠 생각그물을 그리고 있어요…');
      const ids = await buildMindMap(text);
      recordSpawnedNodes(ids, '마인드맵 생성');
      return;
    }

    const template = pickTemplate(out.route_to);
    const variant = ruleBasedVariant(out.route_to); // Design Director — arrange (rule-based)
    const complexity = estimateComplexity(text, out);
    const recordMode: RecordMode = out.mode ?? 'story';
    say(`📐 '${frameTitle(text, template)}' 프레임을 준비하고 있어요…`);

    // Seed the frame — beside ALL existing content (panning there), else viewport
    // center. The frame appears IMMEDIATELY with a loading state so the teacher sees
    // it land and knows generation is running (cleared once the content is laid out).
    // If a previous composer frame exists, TOP-ALIGN the new frame to it (and match
    // heights at the end) so the frames sit neatly side by side.
    const refFrame = rightmostComposerFrame();
    const c = composeOrigin();
    // 병렬 생성(복수 작업) — 동시에 시작한 다른 컴포즈와 같은 원점을 계산해 겹치지
    // 않도록, 진행 중 작업 수만큼 아래 레인으로 비켜 배치한다.
    const parallelLane = Math.max(0, useBoardStore.getState().genActive - 1);
    frameId = newId('frame');
    b.addNodeRaw({
      id: frameId,
      type: 'frame',
      x: Math.round(c.x - 360),
      y: (refFrame ? Math.round(refFrame.y) : Math.round(c.y - 200)) + parallelLane * 640,
      w: 720,
      h: 420,
      data: { title: frameTitle(text, template), templateId: template.id, composer: true, variant, loading: true, working: true, loadingLabel: '✨ AI가 자료를 만들고 있어요…', sourcePrompt: text },
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
    const ranAgents = new Set<FillAgent>();
    for (const region of regions) {
      try {
        const agent = effectiveAgent(region, template, text);
        // 같은 에이전트가 같은 프롬프트로 두 번 돌지 않게(스튜디오 core가 그리기
        // 요청으로 studio.images로 스왑되면 expand images 영역과 중복 → 10개 요청이
        // 20장 생성되던 버그).
        if (ranAgents.has(agent)) continue;
        ranAgents.add(agent);
        const res = await fillRegion(frameId, agent, text, ctx, planId, recordMode);
        created.push(...res.ids);
        if (res.planId) planId = res.planId;
      } catch {
        created.push(spawnTextCard(frameId, `⚠️ ‘${region.id}’ 생성에 실패했어요. 다시 시도해 주세요.`, 'accent-soft', 280, region.role));
      }
    }

    // Next-step chips on the frame.
    say('🪄 배치를 다듬고 있어요…');
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
    clearFrameLoading(frameId); // content is laid out → drop the in-frame loading state
    // 병렬 레인으로 비켜 배치된 프레임은 기준 프레임에 재정렬하지 않는다(다시 겹침 방지).
    if (refFrame && parallelLane === 0) alignFrameToReference(frameId, refFrame.id); // neat side-by-side: top + equal height
    if (spec.coverRole) void generateCoverFor(frameId, spec.coverRole, text);
    recordSpawnedNodes(created, 'AI 보드 생성');
  } finally {
    useBoardStore.getState().endGen(); // 마지막 작업일 때만 메시지가 사라진다
    if (frameId) clearFrameLoading(frameId); // safety: never leave a frame stuck loading
  }
}

/** Clear a frame's in-progress flags (loading 오버레이 + 제목 탭 working 스피너). */
function clearFrameLoading(frameId: string): void {
  const f = useBoardStore.getState().nodes[frameId];
  if (f?.data?.loading || f?.data?.working) {
    const data = { ...f.data };
    delete data.loading;
    delete data.loadingLabel;
    delete data.working;
    useBoardStore.getState().updateNodeRaw(frameId, { data });
  }
}

/** The rightmost top-level composer frame (the "parent" a new frame lands beside).
    Excludes mind-map and nested sub-frames. */
function rightmostComposerFrame(): BoardNode | undefined {
  const frames = Object.values(useBoardStore.getState().nodes).filter(
    (n) => n.type === 'frame' && n.data?.composer && !n.data?.sub && !n.data?.mindmap,
  );
  if (frames.length === 0) return undefined;
  return frames.reduce((a, f) => (f.x + f.w > a.x + a.w ? f : a));
}

/** Every node that belongs to a frame (direct children + sub-frame grandchildren). */
function frameDescendants(frameId: string): string[] {
  const nodes = Object.values(useBoardStore.getState().nodes);
  const direct = nodes.filter((n) => n.data?.frameId === frameId);
  const out = direct.map((n) => n.id);
  const subIds = direct.filter((n) => n.type === 'frame').map((n) => n.id);
  for (const n of nodes) if (subIds.includes(n.data?.frameId as string)) out.push(n.id);
  return out;
}

/** Make `newFrameId` sit neatly beside `refFrameId`: same TOP edge + equal HEIGHT
    (the taller of the two, so neither clips). The existing parent frame grows to
    match if the new one is taller — so the two read as an aligned pair. */
function alignFrameToReference(newFrameId: string, refFrameId: string): void {
  const b = useBoardStore.getState();
  const nf = b.nodes[newFrameId];
  const rf = b.nodes[refFrameId];
  if (!nf || !rf || nf.type !== 'frame' || rf.type !== 'frame') return;

  // Top-align: shift the new frame + all its children so its top matches the ref.
  const dy = Math.round(rf.y - nf.y);
  if (dy !== 0) {
    b.updateNodeRaw(newFrameId, { y: nf.y + dy });
    frameDescendants(newFrameId).forEach((id) => {
      const k = b.nodes[id];
      if (k) b.updateNodeRaw(id, { y: k.y + dy });
    });
  }
  // Equal height — grow whichever frame is shorter to the taller one. Pin it via
  // data.alignedH so a later content re-fit (e.g. an async cover image) can't break
  // the alignment by shrinking the frame back to its own content height.
  const h = Math.max(rf.h, nf.h);
  const nfCur = b.nodes[newFrameId];
  b.updateNodeRaw(newFrameId, { h, data: { ...(nfCur?.data ?? {}), alignedH: h } });
  if (rf.h !== h) b.updateNodeRaw(refFrameId, { h, data: { ...(rf.data ?? {}), alignedH: h } });
}

/* ---------------- mind map (생각그물 — radial layout + connection lines) ---------------- */

function mindMapTopic(text: string): string {
  // Drop "…에 대한 / 관련" connectors and the mind-map words anywhere, then strip
  // trailing request verbs/particles repeatedly (one pass leaves residue like
  // "공룡에 대한" → keep looping until only the subject remains).
  let s = text
    .replace(/에\s*대한|에\s*대해|에\s*관한|에\s*관해|관련(된)?/g, ' ')
    .replace(MINDMAP_RE, ' ');
  let prev = '';
  while (s !== prev) {
    prev = s;
    s = s.replace(/\s*(만들어\s*줘|만들어|그려\s*줘|그려|해\s*줘|짜\s*줘|작성해?\s*줘?|보여\s*줘|주제로|주제|로|으로)\s*$/u, '');
  }
  return s.replace(/\s+/g, ' ').trim() || '오늘의 주제';
}

/** Build a radial mind map: the topic at the center, activity branches around it
    connected by lines, with concept images on a few branches. Returns spawned ids
    (the caller records them as one undoable step). No `composing` guard — it runs
    inside composeFromPrompt's guard. */
async function buildMindMap(text: string): Promise<string[]> {
  const topic = mindMapTopic(text);
  const ctx = buildAgentContext('plan');
  const acts = await runMindMapActivities(topic, ctx, 7);
  // 660 = a radial map reaches ~660px left of its center (branch + image leaf);
  // reserving it keeps the whole map clear of existing content.
  return seedMindMap(topic, acts.slice(0, 8), composeOrigin(660), ctx);
}

/** Format a mind-map branch card: bold 활동명 + 놀이 전개 + 준비물 + 연계 영역. */
function branchText(a: MindActivity): string {
  const lines = [a.label];
  if (a.method) lines.push(a.method);
  if (a.materials) lines.push(`🧰 ${a.materials}`);
  if (a.area) lines.push(`🔗 ${a.area}`);
  return lines.join('\n');
}

/** Render a radial mind map at center `c` from pre-supplied activities — NO model
    call here; the caller supplies the activities (buildMindMap / openDocOnBoard).
    Builds frame + center + rich activity branches + concept images + a web-source
    node, then lays everything out as a clean radial tree. Returns spawned ids. */
async function seedMindMap(
  topic: string,
  acts: MindActivity[],
  c: { x: number; y: number },
  ctx: string,
): Promise<string[]> {
  const b = useBoardStore.getState();
  const created: string[] = [];

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
  const persistEdges = () => {
    const fr = useBoardStore.getState().nodes[frameId];
    if (fr) useBoardStore.getState().updateNodeRaw(frameId, { data: { ...(fr.data ?? {}), edges: [...edges] } });
  };

  // Activity branches — rich, field-usable cards (positioned by layoutMindMap).
  const BW = 220;
  const branchIds: string[] = [];
  acts.forEach((a) => {
    const id = newId('sticky');
    b.addNodeRaw({
      id, type: 'sticky', x: Math.round(c.x), y: Math.round(c.y), w: BW, h: 96, autoH: true,
      text: branchText(a), color: 'accent-soft', data: { role: 'mm-branch', frameId, activity: a },
    });
    branchIds.push(id);
    edges.push({ from: centerId, to: id });
    created.push(id);
  });

  decorateMindMapStickers(frameId, topic); // one theme sticker per card

  // Image leaf placeholders (loading spinner) appear immediately; filled when ready.
  const leafIds: string[] = [];
  for (let i = 0; i < 3 && branchIds[i]; i++) {
    const id = newId('image');
    b.addNodeRaw({ id, type: 'image', x: Math.round(c.x), y: Math.round(c.y), w: 160, h: 140, loading: true, data: { role: 'mm-leaf', frameId } });
    leafIds.push(id);
    edges.push({ from: branchIds[i], to: id });
    created.push(id);
  }
  persistEdges();
  layoutMindMap(frameId); // clean radial-tree placement, lines appear immediately

  // Concept images + a web 자료 node, fetched in parallel; fill the placeholders.
  const [imgRes, web] = await Promise.all([
    runStudioImages(topic, acts.slice(0, 3).map((a) => a.label), ctx, 'image'),
    buildWebSource(topic).catch(() => null),
  ]);
  const items = imgRes.payload.type === 'StudioGallery' ? imgRes.payload.props.items : [];
  leafIds.forEach((lid, i) => {
    const it = items[i];
    const cur = useBoardStore.getState().nodes[lid];
    if (cur) useBoardStore.getState().updateNodeRaw(lid, { loading: false, src: it?.url, text: it?.caption ?? '' });
  });

  // Web 자료 node — clickable links/thumbnails, connected to the center.
  if (web) {
    const wid = newId('sticky');
    b.addNodeRaw({
      id: wid, type: 'sticky', x: Math.round(c.x), y: Math.round(c.y), w: 340, h: 200, autoH: true, color: 'surface-2',
      data: { role: 'source', frameId, links: web.links, thumbs: web.thumbs, summary: web.summary },
    });
    edges.push({ from: centerId, to: wid });
    created.push(wid);
  }
  persistEdges();

  useBoardStore.getState().setSelection([frameId]);
  await new Promise((r) => setTimeout(r, 260));
  layoutMindMap(frameId); // re-layout now heights are measured + images/source added
  return created;
}

/* ---------------- mind-map tree + radial layout ---------------- */

type MindEdge = { from: string; to: string };

/** parent → [child ids] map from a frame's stored edges. */
function childrenMap(frameId: string): Map<string, string[]> {
  const edges = (useBoardStore.getState().nodes[frameId]?.data?.edges as MindEdge[]) ?? [];
  const m = new Map<string, string[]>();
  for (const e of edges) {
    if (!m.has(e.from)) m.set(e.from, []);
    m.get(e.from)!.push(e.to);
  }
  return m;
}

/** All descendant node ids of `id` in the mind-map tree (excludes `id` itself).
    Used for hierarchy select/move — a parent carries its whole subtree. */
export function mindMapSubtree(frameId: string, id: string): string[] {
  const cm = childrenMap(frameId);
  const out: string[] = [];
  const seen = new Set<string>();
  const stack = [...(cm.get(id) ?? [])];
  while (stack.length) {
    const x = stack.pop()!;
    if (seen.has(x)) continue;
    seen.add(x);
    out.push(x);
    for (const c of cm.get(x) ?? []) stack.push(c);
  }
  return out;
}

/** Lay the mind map out as a clean radial tree: the center stays fixed; top-level
    branches get even angular slots; each branch's sub-branches fan within its own
    sector (so edges radiate outward and never cross); concept images sit beside
    their branch; the web-source gets its own slot. Wide doc cards (worksheet/plan)
    keep their manual placement. Re-run after any structural change so existing
    cards re-arrange neatly. A final overlap pass guarantees no collisions. */
function layoutMindMap(frameId: string): void {
  const b = useBoardStore.getState();
  const center = Object.values(b.nodes).find((n) => n.data?.frameId === frameId && n.data?.role === 'mm-center');
  if (!center) return;
  const cm = childrenMap(frameId);
  const cx = center.x + center.w / 2;
  const cy = center.y + cardHeight(center) / 2;
  const place = (id: string, ang: number, R: number) => {
    const n = b.nodes[id];
    if (!n) return;
    b.updateNodeRaw(id, { x: Math.round(cx + R * Math.cos(ang) - n.w / 2), y: Math.round(cy + R * Math.sin(ang) - cardHeight(n) / 2) });
  };
  const angleOf = (id: string) => {
    const n = b.nodes[id];
    return n ? Math.atan2(n.y + cardHeight(n) / 2 - cy, n.x + n.w / 2 - cx) : 0;
  };

  const direct = cm.get(center.id) ?? [];
  const topBranches = direct.filter((id) => b.nodes[id]?.data?.role === 'mm-branch');
  const sideNodes = direct.filter((id) => b.nodes[id] && b.nodes[id].data?.role !== 'mm-branch'); // web source etc.
  topBranches.sort((a, z) => angleOf(a) - angleOf(z)); // stable angular order

  const total = Math.max(topBranches.length + sideNodes.length, 1);
  const R1 = 380;
  const slotAng = (i: number) => -Math.PI / 2 + ((2 * Math.PI) / total) * i;
  const sectorHalf = Math.min(0.6, (Math.PI / total) * 0.8);
  let slot = 0;

  topBranches.forEach((bid) => {
    const ang = slotAng(slot++);
    place(bid, ang, R1);
    const kids = cm.get(bid) ?? [];
    const subs = kids.filter((id) => b.nodes[id]?.data?.role === 'mm-branch');
    const leaves = kids.filter((id) => b.nodes[id]?.data?.role === 'mm-leaf');
    subs.forEach((sid, j) => {
      const t = subs.length === 1 ? 0 : (j / (subs.length - 1) - 0.5) * 2; // -1..1 across the sector
      place(sid, ang + t * sectorHalf, R1 + 250 + (j % 2) * 64);
    });
    leaves.forEach((lid, j) => place(lid, ang + (j % 2 ? sectorHalf : -sectorHalf) * 0.9, R1 + 195));
  });
  sideNodes.forEach((sid) => place(sid, slotAng(slot++), R1 + 40));

  // Backstop: nudge any residual overlaps outward (skip wide docs so they stay put).
  const movable = Object.values(b.nodes)
    .filter((n) => n.data?.frameId === frameId && n.type !== 'frame' && n.data?.role !== 'mm-center' && !n.data?.doc)
    .map((n) => n.id);
  resolveOverlaps(frameId, movable, cx, cy);
  fitFrameToChildren(frameId);
}

/* ---------------- document → board ("마이보드에서 보기") ---------------- */

/** Strip emoji + mind-map/document filler words from a title to get the subject. */
function docTopic(title: string): string {
  const noEmoji = title.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}️\u{1F1E6}-\u{1F1FF}]/gu, ' ');
  const s = noEmoji.replace(MINDMAP_RE, ' ').replace(/계획안?|문서|주제/g, ' ');
  return s.replace(/\s+/g, ' ').trim() || mindMapTopic(title);
}

/** From a chat document (markdown) → open a fresh, dedicated board with the FULL
    document on the LEFT and a mind map reflecting its structure on the RIGHT.
    Sections become branches (fallback: model ideas). Called by the chat
    "마이보드에서 보기" action; the page then navigates to /board. */
export async function openDocOnBoard(doc: { title: string; markdown: string }): Promise<void> {
  const topic = docTopic(doc.title);
  // Dedicated board so the document + map present cleanly side by side.
  useBoardsStore.getState().createBoard('general', topic.slice(0, 16) || '문서 보드');
  useBoardStore.getState().setGenerating('🧠 문서를 보드로 펼치고 있어요…');
  const created: string[] = [];
  try {
    const ctx = buildAgentContext('plan');
    const base = viewportCenterBoardPoint();

    // Left — the full document, as an A4 paper card (kv-doc-md markdown).
    const docW = PLAN_DOC_W;
    const docX = Math.round(base.x - docW - 360);
    const docY = Math.round(base.y - 320);
    const docId = newId('sticky');
    useBoardStore.getState().addNodeRaw({
      id: docId, type: 'sticky', x: docX, y: docY, w: docW, h: 360, autoH: true,
      text: doc.markdown, color: 'paper', data: { doc: true, role: 'plan' },
    });
    created.push(docId);

    const center = { x: Math.round(base.x + 360), y: Math.round(base.y) };

    // Frame the document (left) + map (right) into view at a readable zoom, anchored
    // near the top — the document is tall, so the teacher scrolls down to read on.
    // Deterministic (no measured-height dependency); run now for the generating
    // period and again at the end so the final framing wins decisively.
    const cw = Math.max(320, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 64);
    const frameBoth = () => {
      const minX = docX;
      const maxX = center.x + 580; // map extent incl. outer image leaves
      const midX = (minX + maxX) / 2;
      const zoom = Math.min(0.82, Math.max(0.3, cw / (maxX - minX + 240)));
      useBoardStore.getState().setViewport({
        zoom,
        panX: cw / 2 - midX * zoom,
        panY: 96 - (docY - 40) * zoom,
      });
    };
    frameBoth();

    // Right — a mind map of concrete, runnable activities grounded in THIS document
    // (so the teacher gets actionable play ideas, not a copy of the doc's headers).
    const acts = await runMindMapActivities(topic, ctx, 7, doc.markdown);
    const mapIds = await seedMindMap(topic, acts.slice(0, 8), center, ctx);
    created.push(...mapIds);
    frameBoth(); // final framing once the whole composition exists
    recordSpawnedNodes(created, '문서 → 보드');
  } finally {
    useBoardStore.getState().setGenerating(null);
  }
}

/** Append edges to a mind-map frame's edge list (re-reads fresh state). */
function addMindMapEdges(frameId: string, more: Array<{ from: string; to: string }>): void {
  const fr = useBoardStore.getState().nodes[frameId];
  if (!fr) return;
  const edges = [...((fr.data?.edges as Array<{ from: string; to: string }>) ?? []), ...more];
  useBoardStore.getState().updateNodeRaw(frameId, { data: { ...(fr.data ?? {}), edges } });
}

/** Effective height of a card for collision: prefer the measured renderH; for an
    unmeasured auto-height card assume a generous minimum so freshly-added siblings
    (still at their seed height) are treated as tall as they will render. */
function cardHeight(n: BoardNode): number {
  if (typeof n.data?.renderH === 'number') return n.data.renderH;
  if (n.type === 'sticky') return Math.max(n.h, 120);
  return n.h;
}

/** True if a w×h box at (x,y) overlaps any card in the frame (with a gap).
    `excludeId` skips one node (used when re-placing a card already in the store). */
function overlapsFrameNode(frameId: string, x: number, y: number, w: number, h: number, excludeId?: string): boolean {
  const b = useBoardStore.getState();
  const GAP = 28;
  for (const n of Object.values(b.nodes)) {
    if (n.type === 'frame' || n.id === excludeId || n.data?.frameId !== frameId) continue;
    const nh = cardHeight(n);
    if (x < n.x + n.w + GAP && x + w + GAP > n.x && y < n.y + nh + GAP && y + h + GAP > n.y) return true;
  }
  return false;
}

/** Find a non-overlapping spot near a ray from (cx,cy): push outward, fanning the
    angle slightly if blocked, so expanded cards never collide with existing ones. */
function freeRadialSpot(frameId: string, cx: number, cy: number, angle: number, w: number, h: number, startR: number, excludeId?: string): { x: number; y: number } {
  for (let r = startR; r < startR + 1500; r += 44) {
    for (const da of [0, 0.16, -0.16, 0.32, -0.32, 0.5, -0.5, 0.7, -0.7]) {
      const x = Math.round(cx + r * Math.cos(angle + da) - w / 2);
      const y = Math.round(cy + r * Math.sin(angle + da) - h / 2);
      if (!overlapsFrameNode(frameId, x, y, w, h, excludeId)) return { x, y };
    }
  }
  return { x: Math.round(cx + startR * Math.cos(angle) - w / 2), y: Math.round(cy + startR * Math.sin(angle) - h / 2) };
}

/** After cards have rendered (heights now measured), push any still-overlapping
    card outward along its own ray from (cx,cy) until it clears. Guarantees no
    overlap regardless of how tall the text wrapped. */
function resolveOverlaps(frameId: string, ids: string[], cx: number, cy: number): void {
  const b = useBoardStore.getState();
  for (const id of ids) {
    const n = b.nodes[id];
    if (!n) continue;
    const h = cardHeight(n);
    const ccx = n.x + n.w / 2;
    const ccy = n.y + h / 2;
    if (!overlapsFrameNode(frameId, n.x, n.y, n.w, h, id)) continue;
    const ang = Math.atan2(ccy - cy, ccx - cx);
    const r0 = Math.hypot(ccx - cx, ccy - cy);
    const spot = freeRadialSpot(frameId, cx, cy, ang, n.w, h, r0 + 24, id);
    b.updateNodeRaw(id, { x: spot.x, y: spot.y });
  }
}

/** Expand a mind-map branch into 3 sub-activities, fanned further out along the
    branch's outward direction and connected to it (click the ＋ on a branch). */
export async function expandMindMapBranch(branchId: string): Promise<void> {
  const b = useBoardStore.getState();
  const branch = b.nodes[branchId];
  const frameId = branch?.data?.frameId as string | undefined;
  if (!branch || !frameId) return;

  const act = branch.data?.activity as MindActivity | undefined;
  const label = act?.label || (branch.text ?? '').split('\n')[0].trim() || '활동';
  const ground = act ? `${act.method}\n준비물: ${act.materials}` : (branch.text ?? '');
  useBoardStore.getState().setGenerating('🌱 하위 활동을 펼치고 있어요…');
  try {
    const subs = (await runMindMapActivities(label, buildAgentContext('plan'), 3, ground)).slice(0, 3);
    if (subs.length === 0) return;

    const created: string[] = [];
    const edges: Array<{ from: string; to: string }> = [];
    subs.forEach((a) => {
      const id = newId('sticky');
      b.addNodeRaw({
        id, type: 'sticky', x: branch.x, y: branch.y, w: 190, h: 84, autoH: true,
        text: branchText(a), color: 'surface-2', data: { role: 'mm-branch', frameId, activity: a },
      });
      edges.push({ from: branchId, to: id });
      created.push(id);
    });

    addMindMapEdges(frameId, edges);
    decorateMindMapStickers(frameId, label); // sticker the new sub-branches
    await new Promise((r) => setTimeout(r, 240)); // let cards render so heights are measured
    layoutMindMap(frameId); // re-arrange the WHOLE map cleanly — no crossing lines / overlaps
    recordSpawnedNodes(created, '가지 확장');
  } finally {
    useBoardStore.getState().setGenerating(null);
  }
}

/** Make an A4 activity worksheet from a selected idea/branch and connect it (in a
    mind map) or place it in the frame. ("이 활동으로 활동지 만들기") */
export async function worksheetFromNode(nodeId: string): Promise<void> {
  const b = useBoardStore.getState();
  const node = b.nodes[nodeId];
  if (!node) return;
  const frameId = node.data?.frameId as string | undefined;
  const act = node.data?.activity as MindActivity | undefined;
  const activity = act?.label || (node.text ?? '').split('\n')[0].trim() || (node.text ?? '활동');

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
  useBoardStore.getState().setGenerating('✏️ 활동지를 만들고 있어요…');

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
  } finally {
    useBoardStore.getState().setGenerating(null);
  }
  if (frameId) {
    await new Promise((r) => setTimeout(r, 260));
    fitFrameToChildren(frameId);
  }
  recordSpawnedNodes([id], '활동지 만들기');
}

/** Make a full A4 주간 놀이계획안 from a selected idea/branch and connect it — the
    mind-map idea → a ready-to-use plan in one click ("이 활동으로 계획안 만들기"). */
export async function planFromNode(nodeId: string): Promise<void> {
  const b = useBoardStore.getState();
  const node = b.nodes[nodeId];
  if (!node) return;
  const frameId = node.data?.frameId as string | undefined;
  const act = node.data?.activity as MindActivity | undefined;
  const activity = act?.label || (node.text ?? '').split('\n')[0].trim() || '활동';
  const seed = [activity, act?.method, act?.area].filter((s): s is string => !!s && !!s.trim());

  const id = newId('sticky');
  b.addNodeRaw({
    id, type: 'sticky',
    x: Math.round(node.x + node.w + 48), y: Math.round(node.y), w: PLAN_DOC_W, h: 260, autoH: true,
    text: '📋 계획안을 만들고 있어요…', color: 'paper',
    data: { doc: true, role: 'plan', loadingDoc: true, ...(frameId ? { frameId } : {}) },
  });
  if (frameId && Array.isArray(useBoardStore.getState().nodes[frameId]?.data?.edges)) {
    addMindMapEdges(frameId, [{ from: nodeId, to: id }]);
  }
  useBoardStore.getState().setSelection([id]);
  useBoardStore.getState().setGenerating('📋 계획안을 만들고 있어요…');

  try {
    const res = await runPlan(activity, seed, buildAgentContext('plan'));
    const cur = useBoardStore.getState().nodes[id];
    b.updateNodeRaw(id, {
      text: planDocMarkdown(res.payload),
      data: { ...(cur?.data ?? {}), doc: true, role: 'plan', payload: res.payload, loadingDoc: false },
    });
  } catch {
    const cur = useBoardStore.getState().nodes[id];
    b.updateNodeRaw(id, { text: `‘${activity}’ 계획안 생성에 실패했어요.`, data: { ...(cur?.data ?? {}), loadingDoc: false } });
  } finally {
    useBoardStore.getState().setGenerating(null);
  }
  if (frameId) {
    await new Promise((r) => setTimeout(r, 260));
    fitFrameToChildren(frameId);
  }
  recordSpawnedNodes([id], '계획안 만들기');
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
    // Studio covers BOTH media and learning sheets — pick by the request:
    //   색칠/도안 → coloring · 활동지/워크시트 → worksheet · 그림/사진/영상 등 → 단독 이미지.
    if (COLORING_RE.test(prompt)) return 'studio.coloring';
    if (WORKSHEET_REQ_RE.test(prompt)) return 'studio.worksheet';
    if (MEDIA_RE.test(prompt)) return 'studio.images';
    return 'studio.worksheet';
  }
  return region.agent;
}

/* ---------------- image row layout + library reuse ---------------- */

/** 이미지 카드를 스폰 직후 '가로 한 줄'(헤더 아래)로 정렬 — placeInFrame의 줄바꿈
    배치(세로 그리드)로 로딩되다가 완료 후 가로로 점프하던 어색함을 없앤다. */
function layoutImagesRow(frameId: string, cardIds: string[]): void {
  const b = useBoardStore.getState();
  const fr = b.nodes[frameId];
  if (!fr || cardIds.length === 0) return;
  const PAD = 28;
  const GAP = 24;
  const members = Object.values(b.nodes).filter((n) => n.data?.frameId === frameId);
  const header = members.find((n) => n.data?.role === 'header');
  const headerH = header
    ? (typeof header.data?.renderH === 'number' ? (header.data.renderH as number) : header.h)
    : 0;
  const y = header ? header.y + headerH + 20 : fr.y + PAD;
  let x = fr.x + PAD;
  for (const id of cardIds) {
    const n = b.nodes[id];
    if (!n) continue;
    b.updateNodeRaw(id, { x: Math.round(x), y: Math.round(y) });
    x += n.w + GAP;
  }
  fitFrameToChildren(frameId);
}

interface LibNoticeItem {
  cardId: string;
  caption: string;
  prompt: string;
  style: string;
  kind: 'image' | '도안';
}

/** "새로 생성" — 보관함에서 재사용한 카드들을 취소하고 새 이미지로 다시 생성한다.
    새로 생성된 그림은 다시 보관함에 저장(최신본 갱신). */
export async function regenerateLibraryCards(frameId: string): Promise<void> {
  const b = useBoardStore.getState();
  const fr = b.nodes[frameId];
  const notice = fr?.data?.libNotice as { items: LibNoticeItem[] } | undefined;
  if (!fr || !notice?.items?.length) return;
  b.updateNodeRaw(frameId, { data: { ...fr.data, libNotice: undefined } });
  notice.items.forEach((it) => {
    const c = b.nodes[it.cardId];
    if (c) b.updateNodeRaw(it.cardId, { loading: true, data: { ...(c.data ?? {}), fromLibrary: false } });
  });
  await Promise.all(
    notice.items.map(async (it) => {
      const img = await renderStudioImage({ caption: it.caption, prompt: it.prompt }, it.style).catch(
        () => ({ url: undefined as string | undefined, mocked: false }),
      );
      const cur = useBoardStore.getState().nodes[it.cardId];
      if (cur) useBoardStore.getState().updateNodeRaw(it.cardId, { loading: false, ...(img.url ? { src: img.url } : {}) });
      if (img.url && !img.mocked) void saveAsset(it.caption, it.kind, img.url);
    }),
  );
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
      say('💡 놀이 아이디어를 뽑고 있어요…');
      const ideas = await runPlanIdeas(topic, ctx);
      ideas.slice(0, 4).forEach((it) => ids.push(spawnTextCard(frameId, `${it.label}\n${it.desc}`, 'accent-soft', 240, 'idea')));
      return { ids };
    }
    case 'plan.grid': {
      say('📅 주간 놀이계획을 작성하고 있어요…');
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
      // A pure "draw X" request → ONE simple drawing of the subject (no worksheet,
      // no activity captions); expansion lives in the frame's action chips.
      const simple = agent === 'studio.images' && MEDIA_RE.test(topic) && !WORKSHEET_REQ_RE.test(topic);
      const kindStr: 'image' | '도안' = agent === 'studio.coloring' ? '도안' : 'image';
      say(kindStr === '도안' ? '🖍️ 도안 구성을 잡고 있어요…' : '🖼️ 그림 구성을 잡고 있어요…');
      // 1) 캡션 계획 → 보관함(자산 DB) 조회 — 같은 이름이 이미 있으면 생성 없이 재사용.
      const plan = await planStudioImages(topic, [], ctx, kindStr, simple ? { simple: true } : undefined);
      const hits = await Promise.all(plan.specs.map((s) => findAsset(s.caption, kindStr).catch(() => undefined)));
      // 2) 카드 N장을 먼저 전부 배치 — 보관함 히트는 즉시 채움, 나머지는 스피너.
      const cardIds = plan.specs.map((s, i) => spawnImageCard(frameId, hits[i]?.url, s.caption, !hits[i]));
      ids.push(...cardIds);
      const b = useBoardStore.getState();
      cardIds.forEach((cid, i) => {
        if (!hits[i]) return;
        const c = b.nodes[cid];
        if (c) b.updateNodeRaw(cid, { data: { ...(c.data ?? {}), fromLibrary: true } });
      });
      // 처음부터 '가로 한 줄'로 배치(스폰 시 세로 그리드 → 완료 후 가로로 점프하던 문제 제거).
      layoutImagesRow(frameId, cardIds);
      // 프레임 전체 로딩 오버레이를 끄고 카드별 스피너로 전환(가려지면 안 보임).
      const fr = b.nodes[frameId];
      if (fr?.data?.loading) b.updateNodeRaw(frameId, { data: { ...fr.data, loading: false } });
      // 보관함 재사용 안내 + "새로 생성" 취소 액션(프레임 데이터에 기록 → NodeView가 렌더).
      const libItems = plan.specs
        .map((s, i) => ({ cardId: cardIds[i], caption: s.caption, prompt: s.prompt, style: plan.style, kind: kindStr, hit: !!hits[i] }))
        .filter((it) => it.hit);
      if (libItems.length) {
        const f2 = useBoardStore.getState().nodes[frameId];
        if (f2) useBoardStore.getState().updateNodeRaw(frameId, { data: { ...f2.data, libNotice: { items: libItems } } });
      }
      // 3) 미스만 병렬 생성하되 '맨 앞부터 차례로' 공개. 성공작은 보관함에 자동 저장.
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
        useBoardStore.getState().updateNodeRaw(cardIds[i], { loading: false, src: img.url });
        if (img.url && !img.mocked) void saveAsset(plan.specs[i].caption, kindStr, img.url, plan.title);
      }
      return { ids };
    }
    case 'studio.worksheet': {
      say('✏️ 활동지를 설계하고 있어요…');
      const res = await runStudioWorksheet(topic, ctx, planId);
      const cid = spawnDocCard(frameId, payloadText(res.payload), 'worksheet');
      stashPayload(cid, res.payload);
      ids.push(cid);
      return { ids };
    }
    case 'writing.letter': {
      say('💌 통신문을 작성하고 있어요…');
      const res = await runWriting(topic, ctx);
      const cid = spawnDocCard(frameId, payloadText(res.payload), 'letter');
      stashPayload(cid, res.payload);
      ids.push(cid);
      return { ids };
    }
    case 'record': {
      say('📝 기록 초안을 작성하고 있어요…');
      const res = await runRecord({ text: topic, mode: recordMode, grounding: { photos: [], teacher_notes: [topic] } }, ctx);
      const cid = spawnDocCard(frameId, payloadText(res.payload), 'record');
      stashPayload(cid, res.payload);
      ids.push(cid);
      return { ids };
    }
    case 'source.web': {
      say('🔎 웹에서 참고 자료를 찾고 있어요…');
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
  // 활동지는 생성된 시트 이미지 자체가 시각물 — 일반 표지 일러스트를 덧붙이지 않는다.
  const dp = doc.data?.payload as { type?: string; props?: { image_url?: string } } | undefined;
  if (dp?.type === 'WorksheetCard' && dp.props?.image_url) return;
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
  useBoardStore.getState().setGenerating('🎨 보드를 다시 디자인하고 있어요…');
  let spec;
  try {
    spec = await runDesignDirector({
      topic,
      routeTo,
      components: summarizeComponents(frameId),
      instruction: command,
    });
  } finally {
    useBoardStore.getState().setGenerating(null);
  }

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
  useBoardStore.getState().setGenerating('✨ 학부모용 소식지를 꾸미고 있어요…');

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
  } finally {
    useBoardStore.getState().setGenerating(null);
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
