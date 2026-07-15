import { useBoardStore, newId, type BoardNode } from '@/store/boardStore';
import { useBoardsStore } from '@/store/boardsStore';
import { recordSpawnedNodes, captureNodes, pushRedesign, addPresetNodeCmd, addLinkCmd } from './commands';
import { relatedWorksheetTheme } from './links';
import { useInteractiveStore } from '@/features/interactive-viewer/store/interactiveStore';
import { applyInteractivePrompt } from '@/features/interactive-viewer/authoring/applyPrompt';
import { gridDeOverlap } from './align';
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
  playIdeaListMarkdown,
  topicWebMarkdown,
  monthlyPlanMarkdown,
  dailyPlanMarkdown,
  projectDocMarkdown,
  worksheetText,
  topicFor,
  DOC_WIDTH,
  viewportCenterBoardPoint,
  composeOrigin,
  cancelPanAnimation,
  animatePanBy,
  slideFrameToEmpty,
  nearestEmptyRightX,
  openDocSpot,
  generateActivityImages,
  fillActivityVideos,
  genSignal,
  removeBgFromNode,
  PLAN_DOC_W,
  type SourceLink,
  type SourceThumb,
} from './workflow';
import { designComposedFrame, fitFrameToChildren } from './frames';
import { worldBox } from './geometry';
import { saveWebLinks } from './webLinks';
import { decorateComposedFrame, decorateDocStickers, decorateMindMapStickers } from './decorate';
import { ruleBasedVariant, asLayoutVariant, ruleBasedSpec } from './design-spec';
import { runDesignDirector } from '@/ai/agents/design';
import { pickTemplate, type FrameTemplate, type FrameRegion, type FillAgent } from './templates';
import { runRouter } from '@/ai/agents/router';
import { runPlanIdeas, runPlayIdeaList, runTopicWeb, runMonthlyPlan, runWeeklyPlan, runDailyPlan, runPlan, runMindMapActivities, type MindActivity, type IdeaItem } from '@/ai/agents/plan';
import { runStudioImages, runStudioWorksheet, planStudioImages, renderStudioImage, KV_ART_STYLE, KV_CUTOUT_STYLE } from '@/ai/agents/studio';
import { findAsset, saveAsset } from './assets';
import { runRecord } from '@/ai/agents/record';
import { runWriting } from '@/ai/agents/writing';
import { callGateway } from '@/ai/client';
import { extractJson } from '@/ai/json';
import { streamChat } from '@/ai/chat';
import { buildAgentContext } from '@/ai/context';
import { PAGE_ACTIONS } from '@/ai/actions';
import { showToast } from '@/lib/toast';
import { SUGGESTION_HIDE_BELOW, type RouterOutput, type RecordMode, type RouteTarget } from '@/ai/contract';
import type { RegistryPayload, WorksheetCardProps } from '@/ui-registry/contracts';
import type { LessonKind } from '@/store/formatChoiceStore';
import { buildWorksheetEditorPayload } from '@/playrecord-integration/fromWorksheet';
import { stashEditorPayload, editorEmbedUrl, editorCardSize } from '@/playrecord-integration/spawnEditorCard';

/* Frame Composer (core page brain). A board prompt with nothing selected →
   classify intent (reuse runRouter) → pick a frame template → seed a frame →
   fill it with the right mix of cards via the existing Tier1 agents → attach
   next-step chips. Orchestration only — no new model contract. */

/** A next-step recommendation chip stored on the frame node (data.nextSteps). */
export interface ComposerChip {
  id: string;
  label: string;
  action: FillAgent | 'generate' | 'idea_plan' | 'idea_mindmap' | 'idea_image';
  prompt?: string;
  status: 'idle' | 'running' | 'done';
}

// 의도 표면형은 단일 출처(intent-lexicon)에서 가져온다 — 층간 어휘 불일치 제거(P0-1).
import {
  COLORING_RE,
  IMAGE_RE as MEDIA_RE,
  WORKSHEET_RE as WORKSHEET_REQ_RE,
  MINDMAP_RE,
  coreTopic,
} from '@/ai/intent-lexicon';

/* ---------------- entry ---------------- */

/** 진행 단계 메시지 — 프롬프트바·보드 상태 필에 라이브로 스트리밍된다. */
const say = (m: string) => useBoardStore.getState().setGenerating(m);

export async function composeFromPrompt(
  text: string,
  forceRoute?: RouteTarget,
  /** 마인드맵 전용 — 센터(주제) 노드를 이 값으로 강제한다(아이디어 다중선택 시 포괄 주제).
      미전달이면 text에서 mindMapTopic으로 추출. */
  opts?: { mindTopic?: string },
): Promise<void> {
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
      const ids = await buildMindMap(text, opts?.mindTopic);
      recordSpawnedNodes(ids, '마인드맵 생성');
      return;
    }

    const template = pickTemplate(out.route_to);
    const variant = ruleBasedVariant(out.route_to); // Design Director — arrange (rule-based)
    const complexity = estimateComplexity(text, out);
    const recordMode: RecordMode = out.mode ?? 'story';
    say(`📐 '${frameTitle(text, template)}' 프레임을 준비하고 있어요…`);

    // ★ 놀이계획 단일 문서 플로우 — A4 세로 시트가 프롬프트바 위 실사이즈로 즉시
    //   배치되고, 초안이 맨 위부터 스트리밍된 뒤 정식 문서로 정리된다.
    //   패키지(아이디어·이미지 동반)는 complexity === 'complex'(명시 요청)일 때만.
    if (template.id === 'play_plan' && complexity === 'simple') {
      await composePlanDocStream(text, template, created, (id) => {
        frameId = id; // finally의 clearFrameLoading이 에러 시에도 working 해제
      });
      // 빈 상태 중단 시 시트/프레임이 이미 거둬졌을 수 있다 — 살아있는 것만 기록.
      recordSpawnedNodes(created.filter((id) => useBoardStore.getState().nodes[id]), 'AI 보드 생성');
      return;
    }

    // Seed the frame — beside ALL existing content (panning there), else viewport
    // center. The frame appears IMMEDIATELY with a loading state so the teacher sees
    // it land and knows generation is running (cleared once the content is laid out).
    // If a previous composer frame exists, TOP-ALIGN the new frame to it (and match
    // heights at the end) so the frames sit neatly side by side.
    // 생성은 '화면 중앙'에서 시작 — 교사가 만들어지는 과정을 그 자리에서 본다
    // (완료 후 slideFrameToEmpty로 오른쪽 빈 곳으로 옮긴다).
    const vc = viewportCenterBoardPoint();
    // 병렬 생성(복수 작업) — 동시에 시작한 다른 컴포즈와 겹치지 않게 아래 레인으로 비켜 배치.
    const parallelLane = Math.max(0, useBoardStore.getState().genActive - 1);
    frameId = newId('frame');
    b.addNodeRaw({
      id: frameId,
      type: 'frame',
      x: Math.round(vc.x - 360),
      y: Math.round(vc.y - 210) + parallelLane * 640,
      w: 720,
      h: 420,
      data: { title: frameTitle(text, template), templateId: template.id, composer: true, variant, loading: true, working: true, loadingLabel: '✨ AI가 자료를 만들고 있어요…', sourcePrompt: text },
    });
    created.push(frameId);
    // 생성물이 교사에게 바로 보이게 — 새 프레임을 화면 중앙으로 카메라 포커스(채워지는
    // 과정을 그 자리에서 지켜보게 한다). 병렬 레인(동시 생성)일 때는 카메라 경합을 피해 생략.
    if (parallelLane === 0) useBoardStore.getState().focusNode(frameId);

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
    const abortSig = genSignal(); // 정지 버튼 — 다음 영역부터 멈춘다
    for (const region of regions) {
      if (abortSig.aborted) break;
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
    // 완료된 생성물을 오른쪽 빈 곳으로 슬라이드(카메라가 동행해 화면 안에 머문 채 이동).
    // 병렬 레인은 카메라 경합을 피해 생략(각자 제자리에 둔다).
    if (parallelLane === 0) slideFrameToEmpty(frameId);
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

/** 투명 배경 컷아웃 생성 — "투명 배경에 ○○ 그려줘". 장식 배경을 그리는 일반 컴포저와
    달리 **단색 순백 배경에 단일 오브젝트만** 생성(누끼가 깨끗이 떨어지게)한 뒤, 그 자리에서
    배경을 제거한다. 결과 = 프레임 1개 + 투명 PNG 이미지 카드 1장.
    (장식 scene을 그리는 KV_ART_STYLE로 생성하면 RMBG가 배경을 전경으로 오인해 못 지운다.) */
export async function composeCutoutFromPrompt(request: string): Promise<void> {
  const b = useBoardStore.getState();
  b.beginGen();
  say('🎨 투명 배경 그림을 만들고 있어요…');
  const created: string[] = [];
  let frameId: string | undefined;
  try {
    const ctx = buildAgentContext('studio');
    // 깔끔한 주제 추출(오타 교정 + 주제어) — 단일 이미지 spec.
    const plan = await planStudioImages(request, [], ctx, 'image', { simple: true });
    const spec = plan.specs[0] ?? { caption: request, prompt: request };
    const title = (plan.title || spec.caption || request).slice(0, 18);

    // 프레임 + 헤더 + 빈 이미지 카드(스피너)를 화면 중앙에 즉시 배치 — 만들어지는 과정을 그 자리에서.
    const vc = viewportCenterBoardPoint();
    const parallelLane = Math.max(0, useBoardStore.getState().genActive - 1);
    frameId = newId('frame');
    b.addNodeRaw({
      id: frameId,
      type: 'frame',
      x: Math.round(vc.x - 150),
      y: Math.round(vc.y - 175) + parallelLane * 640,
      w: 300,
      h: 350,
      data: { title, composer: true, loading: true, working: true, loadingLabel: '✨ 투명 이미지를 만들고 있어요…', sourcePrompt: request },
    });
    created.push(frameId);
    if (parallelLane === 0) useBoardStore.getState().focusNode(frameId);
    created.push(spawnHeaderCard(frameId, title));
    const cardId = spawnImageCard(frameId, undefined, spec.caption, true);
    created.push(cardId);

    // 단색 배경·단일 오브젝트 스타일로 생성 → 누끼가 깨끗하게 떨어진다.
    say(`🖼️ '${spec.caption}' 그리는 중…`);
    const img = await renderStudioImage(spec, KV_CUTOUT_STYLE).catch(
      () => ({ url: undefined as string | undefined, mocked: false }),
    );
    clearFrameLoading(frameId);
    if (!img.url) {
      useBoardStore.getState().updateNodeRaw(cardId, { loading: false }); // 실패 — 빈 카드만 남김
    } else {
      useBoardStore.getState().updateNodeRaw(cardId, { loading: false, src: img.url });
      // 그 자리에서 배경 제거(제자리 교체) → 투명 PNG.
      await removeBgFromNode(cardId, { mode: 'replace', assetKind: 'generated' });
      // 누끼 후 자동 정리(디스펙클) 1패스 — 모서리 잔여 점·희미한 가장자리를 약하게 제거해
      // 배경에 지저분한 내용물이 남지 않게 한다(침식 없는 약한 정리 → 본체는 그대로).
      if (useBoardStore.getState().nodes[cardId]?.data?.bgRemoved) {
        await removeBgFromNode(cardId, { mode: 'replace', assetKind: 'generated' });
      }
      useBoardStore.getState().setSelection([cardId]);
    }
    fitFrameToChildren(frameId);
    if (parallelLane === 0) slideFrameToEmpty(frameId);
  } finally {
    if (frameId) clearFrameLoading(frameId);
    recordSpawnedNodes(created.filter((id) => useBoardStore.getState().nodes[id]), 'AI 투명 이미지 생성');
    useBoardStore.getState().endGen();
  }
}

/* ---------------- 단일 계획안 — A4 세로 + 스트리밍 생성 ---------------- */

/** 초안 스트리밍용 시스템 프롬프트 — 채팅 답변이 아니라 '계획안 문서 초안' 톤.
    도입·맺음말·메타 발화 없이 본문 마크다운만 위에서부터 흘려보낸다. */
const PLAN_DRAFT_SYSTEM = `너는 유치원·어린이집 주간 놀이계획 초안을 쓰는 문서 작가다.
요청 주제로 한국어 마크다운 초안을 즉시 본문부터 작성한다. 인사말·설명·맺음말 금지. 형식:
# (제목 — 주제가 드러나게)
**대상** 유아(3–5세) · **교육과정** 누리과정 · **운영 기간** 주 5일
## 주간 교육 목표
- (기대하는 경험형 문장 4~5개 — "~을 경험한다 / ~에 관심을 가진다")
## 요일별 놀이 운영
| 요일 | 누리과정 영역 | 놀이 활동 | 준비물 |
|---|---|---|---|
(월~금 5행 — 활동은 유아가 주어인 놀이 전개 1문장, 준비물 2~4가지)
## 운영 시 유의점
- (놀이 흐름에 따른 융통성 1문장 + 안전 유의점 1~2개)`;

/** 프로젝트 수업 초안용 시스템 — 요일별이 아니라 '단계별(준비→도입→전개→마무리)'로 하나의
    주제를 1주~한 달 깊이 탐구하는 흐름(프로젝트 접근법). */
const PROJECT_DRAFT_SYSTEM = `너는 유치원·어린이집 '프로젝트 수업' 계획 초안을 쓰는 문서 작가다.
일반 주간 놀이계획과 다르다 — 하나의 주제를 1주~한 달간 단계별로 점점 깊이 탐구한다. 한국어 마크다운만 즉시 본문부터. 인사말·설명·맺음말 금지. 형식:
# (주제) 프로젝트
**대상** 유아(3–5세) · **교육과정** 누리과정 · **운영 기간** 주제·흥미에 따라 1주~한 달
## 프로젝트 목표
- (기대 경험형 문장 4~5개)
## 단계별 프로젝트 전개
| 단계 | 영역·성격 | 탐구·표상 활동 | 준비물·자원 | 기대 경험 |
|---|---|---|---|---|
(준비·도입 → 전개(현장학습·전문가 면담·표상) → 마무리(전시·평가) 5~6행. 단계는 "주차 · 단계명". 활동은 유아 주어, 단계가 갈수록 깊어지게.)
## 운영 시 유의점
- (기간 융통성 1문장 + 안전 + 가정·지역 연계)`;

/** ★ 놀이계획 단일 문서 생성 — ① A4 세로 시트를 감싼 프레임이 프롬프트바(캔버스)
    가로 중앙·상단에 실사이즈(zoom 1)로 즉시 배치되고 ② 초안이 문서 맨 위부터
    스트리밍(채팅 페이지와 동일한 SSE)된 뒤 ③ runPlan이 초안을 유지·다듬어 정식
    계획안 문서로 정리한다. 확장(아이디어·이미지·활동지…)은 프레임 칩으로 하나씩. */
/** 요청 텍스트에서 계획 유형(일안/주안/월안)을 판별. 프로젝트는 별도(isProject)로 처리. */
function detectPlanKind(text: string): 'daily' | 'weekly' | 'monthly' {
  if (/월간|월안/.test(text)) return 'monthly';
  if (/일간|일안|일일\s*(놀이)?\s*계획/.test(text)) return 'daily';
  return 'weekly';
}

async function composePlanDocStream(
  text: string,
  template: FrameTemplate,
  created: string[],
  onFrame?: (id: string) => void,
): Promise<string> {
  const b = useBoardStore.getState();
  const isProject = /프로젝트/.test(text); // 프로젝트 수업 — 단계별 심화 계획(요일별 아님)
  const planKind = isProject ? 'project' : detectPlanKind(text); // 일안/주안/월안 라우팅
  const DOC_W = DOC_WIDTH; // 480 — A4 세로 비율 폭(보드 스케일)
  const DOC_H = Math.round((DOC_W * 297) / 210); // ≈679 — A4 세로 높이
  const PAD = 28;
  const frameW = DOC_W + PAD * 2;
  const frameH = DOC_H + PAD * 2;

  // 빈 자리 — 현재 화면에서 '가장 가까운 오른쪽 여백'(보드 맨 오른쪽 끝이 아니라 컴포저와 동일
  //   규칙). 빈 보드면 현재 뷰 중심. nearestEmptyRightX가 같은 띠의 카드만 피해 첫 빈 자리를 준다.
  const all = Object.values(b.nodes);
  const vc = viewportCenterBoardPoint();
  const startX = Math.round(vc.x - frameW / 2);
  const startY = Math.round(vc.y - frameH / 2);
  const fx = all.length ? Math.round(nearestEmptyRightX({ x: startX, y: startY, w: frameW, h: frameH })) : startX;
  const fy = startY;

  const frameId = newId('frame');
  b.addNodeRaw({
    id: frameId,
    type: 'frame',
    x: fx,
    y: fy,
    w: frameW,
    h: frameH,
    data: { title: frameTitle(text, template), templateId: template.id, composer: true, working: true, sourcePrompt: text },
  });
  created.push(frameId);
  onFrame?.(frameId);

  // A4 세로 문서가 빈 시트로 즉시 나타난다 — autoH지만 minHeight = A4 높이라
  // 내용이 짧아도 처음부터 '종이 한 장'으로 보인다.
  const docId = newId('sticky');
  b.addNodeRaw({
    id: docId,
    type: 'sticky',
    x: fx + PAD,
    y: fy + PAD,
    w: DOC_W,
    h: DOC_H,
    autoH: true,
    text: '',
    color: 'paper',
    data: { role: 'plan', frameId, doc: true },
  });
  created.push(docId);

  // 실사이즈(zoom 1)로 — 프레임을 캔버스(=프롬프트바) 가로 중앙, 상단에 보이게 팬.
  // 직전의 부드러운 팬(보관함 배치 등)이 아직 RAF로 돌고 있으면 카메라를 도로
  // 끌고 가므로 반드시 먼저 중단한다 — 교사는 생성 시작을 화면 상단에서 본다.
  cancelPanAnimation();
  const railW = 64;
  const cw = Math.max(320, (typeof window !== 'undefined' ? window.innerWidth : 1200) - railW);
  const TOP = 84; // 문서 상단의 화면 y(상단 툴바 아래)
  b.setViewport({ zoom: 1, panX: Math.round(cw / 2 - (fx + frameW / 2)), panY: Math.round(TOP - fy) });

  // ① 초안 스트리밍 — 문서 맨 위부터 글이 흘러내린다(80ms 스로틀로 카드 갱신).
  //    내용이 화면보다 길어지면 카메라가 '쓰는 곳'을 따라 아래로 이동해(채팅
  //    자동 스크롤처럼) 교사가 실사이즈 글씨로 계속 읽을 수 있다.
  const signal = genSignal(); // 정지 버튼 — 스트리밍 fetch가 즉시 끊긴다
  say('📝 계획안 초안을 위에서부터 작성하고 있어요…');
  let draft = '';
  let flushTimer: number | undefined;
  const BOTTOM_GUARD = 150; // 프롬프트바 위 여유 — 쓰는 줄이 이 선 위에 머문다
  const followStream = () => {
    const st = useBoardStore.getState();
    const d = st.nodes[docId];
    if (!d) return;
    const rh = Math.max(typeof d.data?.renderH === 'number' ? (d.data.renderH as number) : 0, d.h);
    const { zoom, panY } = st.viewport;
    const ch = Math.max(320, typeof window !== 'undefined' ? window.innerHeight : 800);
    const bottomOnScreen = (d.y + rh) * zoom + panY;
    const limit = ch - BOTTOM_GUARD;
    // 아래로만 따라간다(위로 되돌리지 않음 — 흔들림 방지). 80ms마다 한 줄 남짓의
    // 작은 델타라 직접 세팅으로도 충분히 부드럽다.
    if (bottomOnScreen > limit) st.setViewport({ panY: panY - (bottomOnScreen - limit) });
  };
  const flush = () => {
    if (useBoardStore.getState().nodes[docId]) {
      useBoardStore.getState().updateNodeRaw(docId, { text: draft });
      followStream();
    }
  };
  try {
    await streamChat([{ role: 'user', content: `${isProject ? '프로젝트 수업 계획' : '주간 놀이계획'} 초안: ${text}` }], {
      system: isProject ? PROJECT_DRAFT_SYSTEM : PLAN_DRAFT_SYSTEM,
      signal,
      onDelta: (t) => {
        draft += t;
        if (flushTimer === undefined) {
          flushTimer = window.setTimeout(() => {
            flushTimer = undefined;
            flush();
          }, 80);
        }
      },
    });
  } catch {
    /* 초안 스트림 실패/중단 — 중단이면 아래에서 바로 끝낸다 */
  }
  if (flushTimer !== undefined) {
    clearTimeout(flushTimer);
    flushTimer = undefined;
  }
  flush();

  // 정지 버튼 — 초안까지만 남기고 즉시 종료(정리 단계·표지 생성 생략).
  // 아직 한 글자도 못 썼다면 빈 시트를 남기지 않고 통째로 거둔다.
  if (signal.aborted) {
    if (!draft.trim()) {
      const b2 = useBoardStore.getState();
      b2.removeNodeRaw(docId);
      b2.removeNodeRaw(frameId);
    }
    clearFrameLoading(frameId); // 제목 탭 스피너 끄기(중단)
    return frameId;
  }

  // ② 문서로 정리 — 구조화 에이전트(runPlan)가 초안 내용을 유지하며 정식 계획안으로.
  say('📐 문서 형태로 정리하고 있어요…');
  try {
    const ctx = buildAgentContext('plan');
    const req = draft.trim() ? `${text}\n\n[방금 작성한 초안 — 내용을 유지하며 구조화할 것]\n${draft.slice(0, 4000)}` : text;
    // 유형별 구조화 에이전트로 라우팅 — 프로젝트=runPlan(단계심화) / 월안=runMonthlyPlan / 일안=runDailyPlan / 주안=runWeeklyPlan.
    let res, md;
    if (planKind === 'project') {
      res = await runPlan(req, [], ctx, { project: true });
      md = projectDocMarkdown(res.payload);
    } else if (planKind === 'monthly') {
      res = await runMonthlyPlan(req, ctx);
      md = res.payload.type === 'MonthlyPlan' ? monthlyPlanMarkdown(res.payload.props) : planDocMarkdown(res.payload);
    } else if (planKind === 'daily') {
      res = await runDailyPlan(req, ctx);
      md = res.payload.type === 'DailyPlan' ? dailyPlanMarkdown(res.payload.props) : planDocMarkdown(res.payload);
    } else {
      res = await runWeeklyPlan(req, ctx);
      md = planDocMarkdown(res.payload);
    }
    useBoardStore.getState().updateNodeRaw(docId, { text: md });
    stashPayload(docId, res.payload);
  } catch {
    // 초안이 살아 있으면 그대로 둔다 — 내용은 이미 읽을 수 있는 상태.
    if (!draft.trim()) {
      useBoardStore.getState().updateNodeRaw(docId, { text: '⚠️ 계획안 생성에 실패했어요. 다시 시도해 주세요.' });
    }
  }
  clearFrameLoading(frameId); // 문서 정리 완료 — 제목 탭 스피너 끄기(이 경로엔 정리 코드가 없어 무한 스피너가 됐었다)

  if (signal.aborted) return frameId; // 정리 단계 중 정지 — 칩·표지 생략

  // 확장 칩(아이디어 카드·활동 이미지·활동지·가정통신문) — 하나씩 확장 플로우의 입구.
  attachNextSteps(frameId, template, []);
  useBoardStore.getState().setSelection([frameId]);
  await new Promise((r) => setTimeout(r, 300)); // 문서 실제 높이 측정 대기
  fitFrameToChildren(frameId);
  // 완성 — 따라가던 카메라를 문서 맨 위로 부드럽게 복귀(완성본을 처음부터 읽도록).
  const stEnd = useBoardStore.getState();
  const fEnd = stEnd.nodes[frameId];
  if (fEnd) {
    const dyBack = TOP - (fEnd.y * stEnd.viewport.zoom + stEnd.viewport.panY);
    if (Math.abs(dyBack) > 8) animatePanBy(0, dyBack);
  }
  void generateCoverFor(frameId, 'plan', text); // 얇은 와이드 배너 표지(백그라운드)
  return frameId;
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
async function buildMindMap(text: string, topicOverride?: string): Promise<string[]> {
  // 센터(주제)는 포괄 주제 우선 — 주어지면(아이디어 다중선택 등) 그 값을, 아니면 text에서 추출.
  const topic = topicOverride?.trim() || mindMapTopic(text);
  const ctx = buildAgentContext('plan');
  // 3계층(대주제 → 소주제 → 놀이아이디어) 생각그물 — topic_web 데이터로 구성.
  //   topic_web 은 main_topic/subtopics[].play_ideas[] 를 주므로 center→소주제→놀이아이디어로 seed 한다.
  const web = await runTopicWeb(topic, ctx, { subtopicCount: 4, ideaCountPerSubtopic: 3 }).catch(() => null);
  if (web && web.payload.type === 'TopicWeb') {
    const props = web.payload.props as { subtopics?: Array<{ subtopic?: string; play_ideas?: string[] }> };
    const subs = (props.subtopics ?? [])
      .map((s) => ({ subtopic: String(s.subtopic || '').trim(), play_ideas: (s.play_ideas ?? []).map((p) => String(p).trim()).filter(Boolean) }))
      .filter((s) => s.subtopic);
    // 660 = a radial map reaches ~660px left of its center; reserving it keeps the map clear of existing content.
    if (subs.length) return seedMindMapWeb(topic, subs.slice(0, 6), composeOrigin(660));
  }
  // 폴백: 구형 평면(대주제 → 활동) 생각그물.
  const acts = await runMindMapActivities(topic, ctx, 7, topicOverride?.trim() ? text : undefined);
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
    linkMindMap(centerId, id);
    created.push(id);
  });

  decorateMindMapStickers(frameId, topic); // one theme sticker per card

  // Image leaf placeholders (loading spinner) appear immediately; filled when ready.
  const leafIds: string[] = [];
  for (let i = 0; i < 3 && branchIds[i]; i++) {
    const id = newId('image');
    b.addNodeRaw({ id, type: 'image', x: Math.round(c.x), y: Math.round(c.y), w: 160, h: 140, loading: true, data: { role: 'mm-leaf', frameId } });
    leafIds.push(id);
    linkMindMap(branchIds[i], id);
    created.push(id);
  }
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
    linkMindMap(centerId, wid);
    created.push(wid);
  }

  useBoardStore.getState().setSelection([frameId]);
  await new Promise((r) => setTimeout(r, 260));
  layoutMindMap(frameId); // re-layout now heights are measured + images/source added
  return created;
}

/** 3계층 생각그물 — 대주제(mm-center) → 소주제(mm-branch) → 놀이아이디어(mm-branch).
    topic_web 데이터로 seed. layoutMindMap 이 center→top branch(소주제)→sub branch(놀이아이디어)를
    이미 방사 트리로 배치한다. (개념 이미지 leaf 는 생략 — 3계층 구조를 깔끔히 보이게.) */
async function seedMindMapWeb(
  topic: string,
  subtopics: Array<{ subtopic: string; play_ideas: string[] }>,
  c: { x: number; y: number },
): Promise<string[]> {
  const b = useBoardStore.getState();
  const created: string[] = [];

  const frameId = newId('frame');
  b.addNodeRaw({
    id: frameId, type: 'frame', x: Math.round(c.x - 460), y: Math.round(c.y - 380), w: 920, h: 760,
    data: { title: topic.slice(0, 18) || '생각그물', mindmap: true, composer: true },
  });
  created.push(frameId);

  // 대주제(center).
  const CW = 230, CH = 92;
  const centerId = newId('sticky');
  b.addNodeRaw({
    id: centerId, type: 'sticky', x: Math.round(c.x - CW / 2), y: Math.round(c.y - CH / 2), w: CW, h: CH, autoH: true,
    text: topic, color: 'accent', data: { role: 'mm-center', frameId },
  });
  created.push(centerId);

  const mkAct = (label: string): MindActivity => ({ id: newId('act'), label, method: '', materials: '', area: '' });

  // 소주제(중간 가지) → 각 놀이아이디어(바깥 가지). 둘 다 mm-branch(레이아웃이 계층별로 자동 배치).
  subtopics.forEach((s) => {
    const sid = newId('sticky');
    b.addNodeRaw({
      id: sid, type: 'sticky', x: Math.round(c.x), y: Math.round(c.y), w: 188, h: 60, autoH: true,
      text: s.subtopic, color: 'accent-soft', data: { role: 'mm-branch', frameId, activity: mkAct(s.subtopic), subtopic: true },
    });
    linkMindMap(centerId, sid);
    created.push(sid);
    s.play_ideas.slice(0, 4).forEach((p) => {
      const pid = newId('sticky');
      b.addNodeRaw({
        id: pid, type: 'sticky', x: Math.round(c.x), y: Math.round(c.y), w: 158, h: 52, autoH: true,
        text: p, color: 'surface-2', data: { role: 'mm-branch', frameId, activity: mkAct(p) },
      });
      linkMindMap(sid, pid);
      created.push(pid);
    });
  });

  decorateMindMapStickers(frameId, topic);
  layoutMindMap(frameId);

  // 웹 자료 노드(중심에 연결) — 클릭 가능한 링크/썸네일.
  const web = await buildWebSource(topic).catch(() => null);
  if (web) {
    const wid = newId('sticky');
    b.addNodeRaw({
      id: wid, type: 'sticky', x: Math.round(c.x), y: Math.round(c.y), w: 340, h: 200, autoH: true, color: 'surface-2',
      data: { role: 'source', frameId, links: web.links, thumbs: web.thumbs, summary: web.summary },
    });
    linkMindMap(centerId, wid);
    created.push(wid);
  }

  useBoardStore.getState().setSelection([frameId]);
  await new Promise((r) => setTimeout(r, 260));
  layoutMindMap(frameId);
  return created;
}

/* ---------------- mind-map tree + radial layout ---------------- */

/** 마인드맵 연결 = 보드 요소 링크(store.links)와 통일 — 별도 선(frame.data.edges)을 그리지
    않고, 호버 시 뜨는 원형 포트로 잇고 떼며 liveLinks 곡선으로 렌더된다. 중복·자기연결은 무시. */
function linkMindMap(from: string, to: string): void {
  if (from === to) return;
  const b = useBoardStore.getState();
  if (b.links.some((l) => (l.from === from && l.to === to) || (l.from === to && l.to === from))) return;
  b.addLinkRaw({ id: newId('link'), from, to });
}

/** parent → [child ids] map — 같은 프레임 멤버(data.frameId)끼리 이어진 요소 링크에서.
    방향(from→to)은 생성 시 부모→자식으로 넣으므로 계층이 보존된다. */
function childrenMap(frameId: string): Map<string, string[]> {
  const b = useBoardStore.getState();
  const m = new Map<string, string[]>();
  for (const l of b.links) {
    if (b.nodes[l.from]?.data?.frameId === frameId && b.nodes[l.to]?.data?.frameId === frameId) {
      if (!m.has(l.from)) m.set(l.from, []);
      m.get(l.from)!.push(l.to);
    }
  }
  return m;
}

/** Legacy 이관 — 옛 마인드맵 선(frame.data.edges)을 요소 링크(store.links)로 1회 변환하고
    edges를 제거한다. 신규 맵은 처음부터 링크라 무영향. 변환이 있었으면 true. */
export function migrateMindMapEdges(): boolean {
  const b = useBoardStore.getState();
  let changed = false;
  for (const id of Object.keys(b.nodes)) {
    const n = b.nodes[id];
    if (n?.type !== 'frame') continue;
    const edges = n.data?.edges as Array<{ from: string; to: string }> | undefined;
    if (!Array.isArray(edges) || edges.length === 0) continue;
    for (const e of edges) if (b.nodes[e.from] && b.nodes[e.to]) linkMindMap(e.from, e.to);
    const nd = { ...(n.data ?? {}) };
    delete nd.edges;
    b.updateNodeRaw(id, { data: nd });
    changed = true;
  }
  return changed;
}

/** id의 후손(자식·손주…) — 요소 링크 그래프의 from→to 방향만 따라 내려간다.
    프레임 소속(data.frameId)과 무관 → 카드가 프레임 밖으로 나가도 부모→자식 동반 이동이
    유지된다(자식을 끌면 부모는 절대 포함 안 됨: 방향 역행 안 함). 사이클 안전. */
export function linkDescendants(id: string): string[] {
  const b = useBoardStore.getState();
  const out = new Map<string, string[]>(); // from → [to]
  for (const l of b.links) {
    if (!out.has(l.from)) out.set(l.from, []);
    out.get(l.from)!.push(l.to);
  }
  const res: string[] = [];
  const seen = new Set<string>([id]);
  const stack = [...(out.get(id) ?? [])];
  while (stack.length) {
    const x = stack.pop()!;
    if (seen.has(x)) continue;
    seen.add(x);
    res.push(x);
    for (const c of out.get(x) ?? []) stack.push(c);
  }
  return res;
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
  // 변형 선택자(U+FE0F)는 문자 클래스에 두면 결합문자로 오인되므로 먼저 떼어낸 뒤
  // 이모지 범위를 공백으로 치환한다.
  const noEmoji = title
    .replace(/️/g, '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{1F1E6}-\u{1F1FF}]/gu, ' ');
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
    subs.forEach((a) => {
      const id = newId('sticky');
      b.addNodeRaw({
        id, type: 'sticky', x: branch.x, y: branch.y, w: 190, h: 84, autoH: true,
        text: branchText(a), color: 'surface-2', data: { role: 'mm-branch', frameId, activity: a },
      });
      linkMindMap(branchId, id);
      created.push(id);
    });

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
  if (frameId && useBoardStore.getState().nodes[frameId]?.data?.mindmap) {
    linkMindMap(nodeId, id);
  }
  useBoardStore.getState().setSelection([id]);
  useBoardStore.getState().setGenerating('✏️ 활동지를 만들고 있어요…');

  try {
    // 이 카드가 잇는 놀이 주제(연결된 이미지 카드 캡션 등)를 헤더 '주제' 시드로.
    const theme = relatedWorksheetTheme(b.nodes, b.links, nodeId);
    const res = await runStudioWorksheet(activity, buildAgentContext('studio'), undefined, theme ? { theme } : undefined);
    fillPlaceholderDoc(id, worksheetText(res.payload), res.payload);
  } catch {
    failPlaceholderDoc(id, `‘${activity}’ 활동지 생성에 실패했어요.`);
  } finally {
    useBoardStore.getState().setGenerating(null);
  }
  if (frameId) {
    await new Promise((r) => setTimeout(r, 260));
    fitFrameToChildren(frameId);
  }
  recordSpawnedNodes([id], '활동지 만들기');
}

/** 아이디어 리스트 — 주제로 놀이 아이디어 ~20가지를 간단한 목록 문서(doc 카드)로 만든다.
    포맷 선택 오버레이의 '아이디어 리스트' 선택 시 호출(board/prompt.runFormatChoice). 기존 ideas 에이전트 재사용. */
export async function generateIdeaList(topic: string): Promise<void> {
  const b = useBoardStore.getState();
  b.beginGen();
  const t = (topic || '놀이').trim();
  const vc = viewportCenterBoardPoint();
  const frameId = newId('frame');
  b.addNodeRaw({
    id: frameId,
    type: 'frame',
    x: Math.round(vc.x - 350),
    y: Math.round(vc.y - 230),
    w: 700,
    h: 460,
    data: { title: `${t} 아이디어`, composer: true, loading: true, working: true, loadingLabel: '💡 놀이 아이디어를 모으고 있어요…', sourcePrompt: topic },
  });
  b.focusNode(frameId);
  try {
    const ideas = await runPlayIdeaList(t, buildAgentContext('plan'), 6).catch(() => [] as IdeaItem[]);
    const md = ideas.length
      ? playIdeaListMarkdown(ideas, `${t} 놀이 아이디어`)
      : `# 💡 ${t} 놀이 아이디어\n\n아이디어 생성에 실패했어요. 다시 시도해 주세요.`;
    // role 'idealist' → NodeView가 선택형 행으로 렌더(각 아이디어 클릭 선택). text는 내보내기·폴백용.
    const cardId = spawnDocCard(frameId, md, 'idealist', 660);
    if (ideas.length) {
      const cur = useBoardStore.getState().nodes[cardId];
      useBoardStore.getState().updateNodeRaw(cardId, {
        data: { ...(cur?.data ?? {}), ideaItems: ideas, selectedIdeaIds: [], ideaTitle: `${t} 놀이 아이디어` },
      });
      attachIdeaChips(frameId); // 프레임 하단 추천: 놀이계획·마인드맵·활동 이미지(선택/자동선택 아이디어 기준)
    }
    slideFrameToEmpty(frameId);
    recordSpawnedNodes([frameId], '아이디어 리스트');
  } finally {
    const cur = useBoardStore.getState().nodes[frameId];
    if (cur) useBoardStore.getState().updateNodeRaw(frameId, { data: { ...(cur.data ?? {}), loading: false, working: false } });
    useBoardStore.getState().endGen();
  }
}

/** 놀이중심 주제망(topic_web) — 대주제→소주제→놀이아이디어 2단계 + 환경구성 + 예상질문을
    담은 구조화 카드 하나를 프레임에 만든다. 기존 '마인드맵'(공간형 radial)과 별개의 산출물.
    포맷 선택 오버레이의 '놀이중심 주제망' 선택 시 호출(board/prompt.runFormatChoice). */
export async function generateTopicWeb(topic: string): Promise<void> {
  const b = useBoardStore.getState();
  b.beginGen();
  const t = (topic || '놀이').trim();
  const vc = viewportCenterBoardPoint();
  const frameId = newId('frame');
  b.addNodeRaw({
    id: frameId,
    type: 'frame',
    x: Math.round(vc.x - 390),
    y: Math.round(vc.y - 260),
    w: 780,
    h: 520,
    data: { title: `${t} 주제망`, composer: true, loading: true, working: true, loadingLabel: '🕸️ 놀이주제망을 짜고 있어요…', sourcePrompt: topic },
  });
  b.focusNode(frameId);
  try {
    const res = await runTopicWeb(t, buildAgentContext('plan')).catch(() => null);
    const payload = res?.payload;
    if (payload && payload.type === 'TopicWeb') {
      const cardId = spawnDocCard(frameId, topicWebMarkdown(payload.props), 'topicweb', 740);
      const cur = useBoardStore.getState().nodes[cardId];
      if (cur) useBoardStore.getState().updateNodeRaw(cardId, { data: { ...(cur.data ?? {}), payload } });
    } else {
      spawnDocCard(frameId, `# 🕸️ ${t} 놀이주제망\n\n주제망 생성에 실패했어요. 다시 시도해 주세요.`, 'topicweb', 740);
    }
    slideFrameToEmpty(frameId);
    recordSpawnedNodes([frameId], '놀이주제망');
  } finally {
    const cur = useBoardStore.getState().nodes[frameId];
    if (cur) useBoardStore.getState().updateNodeRaw(frameId, { data: { ...(cur.data ?? {}), loading: false, working: false } });
    useBoardStore.getState().endGen();
  }
}

/** 아이디어 리스트 프레임 하단 추천 칩 — 선택(또는 자동선택) 아이디어로 확장. */
function attachIdeaChips(frameId: string): void {
  const b = useBoardStore.getState();
  const frame = b.nodes[frameId];
  if (!frame) return;
  const chips: ComposerChip[] = [
    { id: newId('chip'), label: '놀이계획 생성', action: 'idea_plan', status: 'idle' },
    { id: newId('chip'), label: '마인드맵', action: 'idea_mindmap', status: 'idle' },
    { id: newId('chip'), label: '활동 이미지', action: 'idea_image', status: 'idle' },
  ];
  b.updateNodeRaw(frameId, { data: { ...(frame.data ?? {}), nextSteps: chips } });
}

const IDEA_ACTION_LABEL: Record<string, string> = {
  idea_plan: '놀이계획을 만들어요',
  idea_mindmap: '마인드맵을 그려요',
  idea_image: '활동 이미지를 그려요',
};

/** 아이디어 리스트 추천 칩 실행 — 선택한 아이디어(없으면 자동 선택) 기준으로 확장 생성.
    생성물은 기존 경로(composeFromPrompt forceRoute) 재사용해 자체 프레임으로 만든다. */
async function runIdeaExpansion(frameId: string, chipId: string, action: ComposerChip['action']): Promise<void> {
  const b = useBoardStore.getState();
  const card = Object.values(b.nodes).find((n) => n.data?.frameId === frameId && n.data?.role === 'idealist');
  const items = (card?.data?.ideaItems as IdeaItem[] | undefined) ?? [];
  if (!items.length) {
    setChipStatus(frameId, chipId, 'idle');
    showToast('먼저 아이디어를 생성해 주세요', 'error');
    return;
  }
  const selIds = (card?.data?.selectedIdeaIds as string[] | undefined) ?? [];
  let selected = items.filter((it) => selIds.includes(it.id)); // 복수 선택
  const auto = selected.length === 0;
  if (auto) selected = [items[Math.floor(Date.now() / 1000) % items.length]]; // 미선택 → 20개 중 자동 선택 1개
  setChipStatus(frameId, chipId, 'idle'); // 즉시 재사용 가능(생성은 자체 로딩 프레임에서 진행)
  const labels = selected.map((s) => s.label);
  const joined = labels.join(', ');
  const who = auto ? `자동 선택 ‘${labels[0]}’` : labels.length > 1 ? `선택한 ${labels.length}개 아이디어` : `‘${labels[0]}’`;
  showToast(`${who}(으)로 ${IDEA_ACTION_LABEL[action] ?? '생성해요'}`, 'success');
  // 라벨 중심 프롬프트 — 선택 아이디어(들)에 정확히 초점을 맞춘다(desc 동봉 시 plan 주제가 드리프트했음).
  // 복수 선택이면 라벨을 묶어 한 결과물에 함께 반영(주간 계획=여러 활동, 마인드맵=여러 가지, 이미지=함께 그린 장면).
  if (action === 'idea_plan') void composeFromPrompt(`${joined} 놀이계획`, 'plan');
  else if (action === 'idea_mindmap') {
    // 마인드맵 센터(주제)는 '아이디어를 포괄한 주제'로 — 여러 개 고르면 리스트/프레임 제목의
    //   핵심(예: "여름 놀이 아이디어" → "여름"), 하나면 그 아이디어 자체(소주제). 선택 라벨을 그대로
    //   이어붙인 긴 문자열이 센터가 되던 문제를 막는다.
    let mindTopic: string | undefined;
    if (labels.length > 1) {
      const rawTitle = String(card?.data?.ideaTitle ?? b.nodes[frameId]?.data?.title ?? '').trim();
      mindTopic = rawTitle.replace(/놀이|프로젝트|아이디어|패키지|리스트|목록/g, ' ').replace(/\s+/g, ' ').trim() || undefined;
    }
    void composeFromPrompt(joined, 'mindmap', { mindTopic });
  } else if (action === 'idea_image') void composeFromPrompt(`${joined} 활동 장면 그림`, 'studio');
}

/** 활동지가 '필요한' 활동을 고른다 — 세기·분류·짝짓기·선긋기·색칠·그리기·쓰기·미로 등
    워크시트로 풀기 좋은 활동을 우선하고, 부족하면 앞 활동으로 채워 최소 2개(최대 3개)를 보장한다. */
const WORKSHEET_HINT_RE = /세기|개수|수\s|숫자|분류|짝|짝짓기|연결|잇기|선\s*긋기|색칠|색종이|그리기|그려|쓰기|따라\s*쓰기|미로|찾기|패턴|규칙|비교|순서|모양|도형|같은|다른|구분|만들기|꾸미기|관찰|기록/;
function pickWorksheetActivities(activities: string[], topic: string): string[] {
  const acts = activities.map((a) => a.trim()).filter(Boolean);
  const suited = acts.filter((a) => WORKSHEET_HINT_RE.test(a));
  const ordered = [...suited, ...acts.filter((a) => !suited.includes(a))];
  const picks = ordered.slice(0, 3);
  while (picks.length < 2) picks.push(`${topic} 활동 ${picks.length + 1}`); // 활동이 모자라도 최소 2개
  return picks;
}

/** 활동지 중복 제거 — 활동/생성프롬프트 문자열을 정규화(공백·활동지 상투어·꼬리 번호 제거)한 키로 묶어
    같은 내용 활동지가 한 번만 생성되게 한다. 서로 다른 활동은 그대로 유지(패키지는 여러 장 유지, 중복만 제거).
    예전엔 레거시(계획 활동) 루프와 Planner 자산 루프가 같은 주제 활동지를 각각 만들어 거의 똑같은
    활동지가 3~4장 생기던 문제를 이 합침·중복제거로 없앤다. */
function dedupeWorksheetJobs(jobs: string[]): string[] {
  const norm = (s: string) =>
    String(s || '')
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/활동지|워크시트|을주제로|를주제로|주제로|만\d+세가?|할수있는|만들기|해요/g, '')
      .replace(/\d+$/, '')
      .trim();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const j of jobs) {
    const raw = String(j || '').trim();
    if (!raw) continue;
    const key = norm(raw) || raw.toLowerCase(); // 상투어만 있어 비면 원문으로 폴백(과잉 병합 방지)
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(raw);
  }
  return out;
}

/** 이미지 링크 카드를 패키지 프레임 '안'에 만든다(role 'source' + frameId 멤버) — 활동수만큼,
    클릭하면 해당 사이트(구글 이미지 검색)로 이동해 자료를 확인한다(임베드 안 함 → 새 탭).
    designComposedFrame이 우측 자료 스택에 배치한다. 반환 = 만든 카드 id(없으면 undefined). */
function spawnImageLinksCard(frameId: string, topic: string, activities: string[]): string | undefined {
  const b = useBoardStore.getState();
  const acts = activities.map((a) => a.trim()).filter(Boolean);
  if (!acts.length) return undefined;
  const shortAct = (a: string) => (a.length > 22 ? `${a.slice(0, 22)}…` : a);
  const q = (a: string) => encodeURIComponent(`${topic} ${a.slice(0, 28)}`);
  const links = acts.map((a) => ({ title: `🖼 ${shortAct(a)}`, url: `https://www.google.com/search?tbm=isch&q=${q(a)}`, domain: 'google.com' }));
  const id = newId('sticky');
  // ★ 프레임 '안'에서 시작 — (0,0) 원점에 두면 fitFrameToChildren이 프레임을 원점으로 끌어당겨
  //   패키지 전체가 보드 좌상단(다른 패키지들 위)으로 점프해 겹친다. 최종 위치는 designComposedFrame가 잡는다.
  const fr = b.nodes[frameId];
  const sx = fr ? Math.round(fr.x + 28) : 0;
  const sy = fr ? Math.round(fr.y + 28) : 0;
  b.addNodeRaw({
    id,
    type: 'sticky',
    x: sx,
    y: sy,
    w: 360,
    h: 200,
    autoH: true,
    color: 'surface-2',
    data: { role: 'source', frameId, summary: `${topic} 활동별 이미지 자료 (활동 ${links.length}개) — 클릭하면 해당 사이트에서 열려요`, links, thumbs: [] },
  });
  return id;
}

/** 패키지 게임 생성(인터랙티브 노드) — 견고하게. 리졸버/이미지 실패로 빈 노드가 남던 문제를 막기
    위해, 생성 후 비어 있으면 한 번 더 시도한다. 그래도 비면 실패를 알리고 노드에 표식을 남긴다
    (무음 실패 → 빈 카드 잔류 방지). 자체 gen 카운터로 진행 표시를 유지한다. */
async function runPackageGame(docId: string, topic: string): Promise<void> {
  useInteractiveStore.getState().ensure(docId);
  const gb = useBoardStore.getState();
  gb.beginGen();
  gb.setGenerating(`🎮 「${topic}」 게임을 만들고 있어요…`);
  const onBusy = (m: string | null) => gb.setGenerating(m ?? `🎮 「${topic}」 게임을 만들고 있어요…`);
  const isEmpty = () => (useInteractiveStore.getState().peek(docId)?.elements.length ?? 0) === 0;
  try {
    // 빈 노드에 온 프롬프트는 생성 동사 유무와 무관하게 전체 구성(runFullCreation)으로 흐른다 —
    // 이 경로도 이제 디자인 에이전트·교사 카드까지 다른 경로와 같은 사슬을 탄다.
    await applyInteractivePrompt(docId, `${topic} 놀이 게임`, [], onBusy).catch(() => null);
    if (isEmpty()) await applyInteractivePrompt(docId, `${topic} 게임`, [], onBusy).catch(() => null);
    // 2차 시도까지 비었으면 조용히 끝내지 않는다 — 교사에게 알리고 게임 노드에 실패 표식.
    if (isEmpty()) {
      showToast('패키지 게임 생성에 실패했어요 — 게임 카드를 선택해 다시 요청해 주세요', 'error');
      const bNow = useBoardStore.getState();
      const gameNode = Object.values(bNow.nodes).find((n) => n.type === 'interactive' && n.data?.docId === docId);
      if (gameNode) bNow.updateNodeRaw(gameNode.id, { data: { ...(gameNode.data ?? {}), genFailed: true } });
    }
  } finally {
    gb.endGen();
  }
}

/* ---------------- Package Planner (동적 패키지 설계도) ----------------
   놀이 패키지를 '하드코딩된 고정 자료 세트'가 아니라, Package Planner가 주제별로
   설계한 JSON(play_ideas 12 + assets 6)으로 동적 구성한다. Planner는 실제 콘텐츠를
   만들지 않는다 — 각 자료의 generation_prompt(무엇을 만들지 지시문)만 낸다. composer가
   그 프롬프트를 기존 생성 함수(fillRegion/runStudioWorksheet/runPackageGame/
   fillActivityVideos)에 넘겨 실제 콘텐츠를 만든다. */

type AssetType =
  | 'real_photo_image'
  | 'generated_image'
  | 'worksheet'
  | 'game'
  | 'science_video_subframe'
  | 'song_video_subframe';

type CallTarget =
  | 'fillRegion'
  | 'runStudioWorksheet'
  | 'runPackageGame'
  | 'fillActivityVideos';

interface PlayIdea {
  id: string;
  type: string;
  asset_types: AssetType[];
  title: string;
  description: string;
}

interface PackageAsset {
  id: string;
  source_play_id: string;
  asset_type: AssetType;
  type_label: string;
  call_target: CallTarget;
  activity_type: string;
  title: string;
  generation_prompt: string;
  description: string;
}

interface PlayPackagePlan {
  theme: string;
  age: number;
  package: {
    play_ideas: PlayIdea[];
    assets: PackageAsset[];
  };
}

/** 정확히 이 6종 자산이 각각 1개씩 있어야 유효한 패키지 설계도. */
const REQUIRED_ASSET_TYPES: AssetType[] = [
  'real_photo_image',
  'generated_image',
  'worksheet',
  'game',
  'science_video_subframe',
  'song_video_subframe',
];

/** asset_type → call_target 정규 매핑(모델이 틀리게 줘도 이 표로 강제 → 디스패치 안전). */
const CALL_TARGET_BY_ASSET: Record<AssetType, CallTarget> = {
  real_photo_image: 'fillRegion',
  generated_image: 'fillRegion',
  worksheet: 'runStudioWorksheet',
  game: 'runPackageGame',
  science_video_subframe: 'fillActivityVideos',
  song_video_subframe: 'fillActivityVideos',
};

const DEFAULT_TYPE_LABEL: Record<AssetType, string> = {
  real_photo_image: '실사 사진',
  generated_image: '생성 이미지',
  worksheet: '활동지',
  game: '놀이 게임',
  science_video_subframe: '탐구 영상',
  song_video_subframe: '동요 영상',
};

function isAssetType(s: string): s is AssetType {
  return (REQUIRED_ASSET_TYPES as string[]).includes(s);
}

/** Package Planner 시스템 프롬프트 — JSON만. 실제 콘텐츠 금지, generation_prompt만 생성. */
const PACKAGE_PLANNER_SYSTEM = `너는 킨더버스 '놀이 패키지 플래너'다. 유아 놀이/프로젝트 패키지를 구성하는 '설계도(JSON)'만 만든다.
너는 실제 콘텐츠(이미지·활동지·게임·영상)를 직접 생성하지 않는다 — 각 자료를 만들 '생성 프롬프트(generation_prompt)'만 작성한다.
인사말·설명·코드펜스 없이 아래 형식의 JSON 객체 하나만 출력한다.

{
  "theme": string,
  "age": number,
  "package": {
    "play_ideas": [ 12개 — { "id": string, "type": string, "asset_types": string[], "title": string, "description": string } ],
    "assets": [ 6개 — 아래 6개 asset_type을 각각 정확히 1개씩 ]
  }
}

[play_ideas — 12개]
- 서로 겹치지 않는 유아 놀이 아이디어 12개. title 8~16자(놀이임이 드러나게), description 1~2문장(놀이 전개).
- type: 놀이 유형 키워드(탐색·조작·신체·역할·표현·관찰 등 중 하나).
- asset_types: 이 아이디어로 만들기 좋은 자료 유형(아래 asset_type 값들의 부분집합).

[assets — 정확히 6개, asset_type 하나씩]
각 asset = { "id", "source_play_id", "asset_type", "type_label", "call_target", "activity_type", "title", "generation_prompt", "description" }
- asset_type 과 call_target 은 반드시 아래 쌍을 지킨다:
  · "real_photo_image"        → "fillRegion"
  · "generated_image"         → "fillRegion"
  · "worksheet"               → "runStudioWorksheet"
  · "game"                    → "runPackageGame"
  · "science_video_subframe"  → "fillActivityVideos"
  · "song_video_subframe"     → "fillActivityVideos"
- source_play_id: play_ideas 중 하나의 id.
- type_label: 한국어 표시명(예: 실사 사진 / 생성 이미지 / 활동지 / 놀이 게임 / 탐구 영상 / 동요 영상).
- generation_prompt: 그 자료를 실제로 생성할 한국어 지시문(콘텐츠 자체가 아니라 '무엇을 만들지'). 이미지는 장면·구도, 활동지는 활동 유형, 게임은 놀이 게임 주제, 영상은 검색 주제.
- activity_type: 연결된 놀이 유형 키워드.`;

/** asset_type에 따라 영상 검색 쿼리를 분기 — 프레임 UI는 동일, 검색 로직만 다르다. */
function getVideoQuery(asset: PackageAsset, theme: string): string {
  if (asset.asset_type === 'song_video_subframe') {
    return `${theme} 유아 동요 율동 ${asset.title}`;
  }
  if (asset.asset_type === 'science_video_subframe') {
    return `${asset.title} 유아 탐구 실험 ${theme}`;
  }
  return asset.generation_prompt;
}

/** Planner 출력 최소 검증 + 정규화. 6종 자산이 모두 있고 generation_prompt가 채워졌는지 확인하고
    call_target을 표준 매핑으로 강제한다. 하나라도 빠지면 null(→ 폴백). */
function validatePackagePlan(obj: unknown, theme: string, age: number): PlayPackagePlan | null {
  if (!obj || typeof obj !== 'object') return null;
  const root = obj as { theme?: unknown; age?: unknown; package?: { play_ideas?: unknown; assets?: unknown } };
  const pkg = root.package;
  if (!pkg || typeof pkg !== 'object') return null;
  const rawIdeas = Array.isArray(pkg.play_ideas) ? pkg.play_ideas : [];
  const rawAssets = Array.isArray(pkg.assets) ? pkg.assets : [];
  if (!rawIdeas.length || !rawAssets.length) return null;

  const ideas: PlayIdea[] = rawIdeas
    .map((it, i): PlayIdea | null => {
      const o = (it ?? {}) as Record<string, unknown>;
      const title = String(o.title ?? '').trim();
      if (!title) return null;
      return {
        id: String(o.id ?? `pi_${i + 1}`),
        type: String(o.type ?? 'play'),
        asset_types: Array.isArray(o.asset_types) ? o.asset_types.map(String).filter(isAssetType) : [],
        title,
        description: String(o.description ?? '').trim(),
      };
    })
    .filter((x): x is PlayIdea => x !== null);
  if (!ideas.length) return null;

  // 6종 asset_type을 각각 1개씩 — 첫 유효 자산만 채택. 하나라도 없으면 무효.
  const byType = new Map<AssetType, PackageAsset>();
  for (const it of rawAssets) {
    const o = (it ?? {}) as Record<string, unknown>;
    const at = String(o.asset_type ?? '');
    if (!isAssetType(at) || byType.has(at)) continue;
    const gp = String(o.generation_prompt ?? '').trim();
    if (!gp) continue;
    byType.set(at, {
      id: String(o.id ?? `as_${at}`),
      source_play_id: String(o.source_play_id ?? ideas[0].id),
      asset_type: at,
      type_label: String(o.type_label ?? DEFAULT_TYPE_LABEL[at]),
      call_target: CALL_TARGET_BY_ASSET[at], // 표준 매핑 강제
      activity_type: String(o.activity_type ?? ideas[0].type),
      title: String(o.title ?? ideas[0].title).trim() || ideas[0].title,
      generation_prompt: gp,
      description: String(o.description ?? '').trim(),
    });
  }
  const assets = REQUIRED_ASSET_TYPES.map((t) => byType.get(t)).filter((x): x is PackageAsset => x !== undefined);
  if (assets.length !== REQUIRED_ASSET_TYPES.length) return null;

  return {
    theme: String(root.theme ?? theme) || theme,
    age: typeof root.age === 'number' ? root.age : age,
    package: { play_ideas: ideas, assets },
  };
}

/** Planner 실패/무키 시의 결정적 폴백 설계도 — 12 아이디어 + 6 자산(각 1개). */
function fallbackPackagePlan(theme: string, age: number): PlayPackagePlan {
  const t = (theme || '놀이').trim();
  const ideas: PlayIdea[] = Array.from({ length: 12 }, (_, i) => ({
    id: `pi_${i + 1}`,
    type: 'play',
    asset_types: [],
    title: `${t} 놀이 ${i + 1}`,
    description: `${t}을(를) 주제로 유아가 직접 탐색하고 표현하는 놀이 ${i + 1}.`,
  }));
  const mk = (at: AssetType, title: string, gp: string): PackageAsset => ({
    id: `as_${at}`,
    source_play_id: ideas[0].id,
    asset_type: at,
    type_label: DEFAULT_TYPE_LABEL[at],
    call_target: CALL_TARGET_BY_ASSET[at],
    activity_type: 'play',
    title,
    generation_prompt: gp,
    description: title,
  });
  const assets: PackageAsset[] = [
    mk('real_photo_image', `${t} 실사 사진`, `${t}의 실제 모습을 담은 사실적인 사진 스타일 이미지 한 장`),
    mk('generated_image', `${t} 활동 장면`, `${t} 놀이를 즐기는 유아들의 밝은 일러스트 이미지 한 장`),
    mk('worksheet', `${t} 활동지`, `${t}을(를) 주제로 만 ${age}세가 할 수 있는 활동지`),
    mk('game', `${t} 게임`, `${t} 놀이 게임`),
    mk('science_video_subframe', `${t} 탐구`, `${t}`),
    mk('song_video_subframe', `${t} 동요`, `${t}`),
  ];
  return { theme: t, age, package: { play_ideas: ideas, assets } };
}

/** Package Planner 호출 → JSON 파싱 → 최소 검증. 실패하면 결정적 폴백 설계도를 돌려준다
    (항상 유효한 PlayPackagePlan 반환 — 호출부는 null 걱정 없이 실행만 한다). */
async function buildPackagePlan(theme: string, ctx: string, kind: LessonKind, raw?: string): Promise<PlayPackagePlan> {
  const age = 5; // 만 3~5세 대표값(누리 대상). 연령 슬롯이 생기면 여기로 주입.
  const kindLabel = kind === 'project' ? '프로젝트' : '놀이';
  const ground = raw?.trim() && raw.trim() !== theme ? `\n[요청 원문]\n${raw.trim().slice(0, 400)}` : '';
  const tenant = ctx.trim() ? `\n[테넌트/교사 컨텍스트]\n${ctx.trim().slice(0, 600)}` : '';
  try {
    const res = await callGateway({
      task: 'plan',
      tier: 'mid',
      provider: 'auto',
      responseFormat: 'json',
      fallback: ['high'],
      system: PACKAGE_PLANNER_SYSTEM,
      messages: [
        {
          role: 'user',
          content: `주제: "${theme}"\n대상 연령: 만 ${age}세\n패키지 성격: ${kindLabel}${ground}${tenant}\n\n위 규칙대로 play_ideas 12개와 assets 6개(asset_type 하나씩)를 담은 JSON만 출력하라.`,
        },
      ],
      meta: { kind: 'package', title: theme, selected: [] },
      maxTokens: 4000,
    });
    if (res.ok && res.text) {
      const parsed = validatePackagePlan(extractJson(res.text), theme, age);
      if (parsed) return parsed;
    }
  } catch {
    /* 네트워크·파싱 실패 → 폴백 */
  }
  return fallbackPackagePlan(theme, age);
}

/** 컨텍스트 — 자산 실행이 참조하는 프레임/스켈레톤 핸들. */
interface PackageAssetExecCtx {
  frameId: string;
  ctx: string;
  planId?: string;
  theme: string;
  created: string[];
  ytId: string;
  vFrameId: string;
  /** 기존 구성의 활동 영상 쿼리 — Planner 영상 자산과 합쳐 한 번의 검색으로 채운다
      (동영상 서브프레임은 단일 슬롯이라 동시 호출을 피한다). */
  activities: string[];
}

/** ★ 추가(additive) 실행 — Planner 설계도의 자산을 '기존 구성 위에' 얹는다. 게임은 단일 슬롯이라
    메인 블록에서 먼저 실행하고(빈 노드 방지), 여기서는 이미지·활동지 자산을 새 카드로 추가하고,
    영상 자산은 기존 활동 영상 쿼리와 합쳐 같은 서브프레임에 한 번에 채운다(동시 호출 충돌 방지).
    영상은 asset_type으로 검색 쿼리만 분기(getVideoQuery). */
async function executePackageAssets(plan: PlayPackagePlan, ex: PackageAssetExecCtx): Promise<void> {
  const assets = plan.package.assets;
  const videoAssets = assets.filter((a) => a.call_target === 'fillActivityVideos');
  const tasks: Promise<void>[] = [];

  for (const asset of assets) {
    if (asset.call_target === 'fillRegion') {
      // real_photo_image · generated_image → 스튜디오 이미지 1장 추가(생성 프롬프트 사용).
      tasks.push(
        fillRegion(ex.frameId, 'studio.images', asset.generation_prompt, ex.ctx, undefined, 'story', undefined, 1)
          .then((r) => { ex.created.push(...r.ids); })
          .catch(() => {}),
      );
    }
    // worksheet: 호출부(buildPlayPackage)에서 레거시 활동지와 합쳐 중복 제거 후 생성 → 여기선 만들지 않는다.
    // runPackageGame: 단일 게임 슬롯 → 메인 블록에서 먼저 실행. fillActivityVideos: 아래에서 묶어 실행.
  }

  // 동영상 — 같은 서브프레임(vFrameId)·뷰어(ytId)에 Planner 영상 자산(탐구·동요) + 기존 활동 영상을
  //   한 번에 채운다. topic=''로 넘겨 미리 만든 완성 쿼리를 그대로 검색에 쓴다(자산 영상 우선, 총 6개).
  const assetQueries = videoAssets.map((a) => getVideoQuery(a, ex.theme));
  const activityQueries = ex.activities.map((a) => `${ex.theme} ${a}`.trim());
  const videoQueries = [...assetQueries, ...activityQueries].map((s) => s.trim()).filter(Boolean).slice(0, 6);
  if (videoQueries.length) {
    tasks.push(
      fillActivityVideos(ex.ytId, ex.vFrameId, '', videoQueries)
        .then((vids) => { ex.created.push(...vids); })
        .catch(() => {}),
    );
  }

  await Promise.all(tasks);
}

/** 놀이/프로젝트 패키지 — 한 주제 프레임에 ① 기존 구성(아이디어 리스트·계획 문서·시청각자료 5장·활동
    예시 이미지·활동지≥2·활동별 동영상·게임·이미지 링크)을 그대로 유지하고, ② 그 위에 Package Planner가
    주제/연령/요청에 맞춰 동적 설계한 자산(실사/생성 이미지·활동지·탐구/동요 영상)을 '추가로' 함께 얹는다.
    게임·동영상 서브프레임은 단일 슬롯이라 Planner 프롬프트로 그 슬롯을 채운다(중복 생성 없음). Planner는
    콘텐츠를 직접 만들지 않고 generation_prompt만 내며, executePackageAssets가 call_target별 기존 생성
    함수로 실행한다. kind='project'면 계획 문서가 단계별 프로젝트 계획(1주~한 달 심화)으로 바뀐다. */
export async function buildPlayPackage(topic: string, kind: LessonKind = 'play'): Promise<void> {
  const b = useBoardStore.getState();
  b.beginGen();
  const t = (topic || '놀이').trim();
  const isProject = kind === 'project';
  const kindLabel = isProject ? '프로젝트' : '놀이';
  const ctx = buildAgentContext('plan');
  const vc = viewportCenterBoardPoint();
  const W0 = 2100, H0 = 1700;
  const fY = Math.round(vc.y - H0 / 2);
  // ★ '보고 있는 자료 바로 오른쪽'에 생성 — 교사가 바로 찾게. 화면(뷰포트) 오른쪽 끝보다 훨씬 멀리
  //   (화면 밖 오른쪽) 떨어진 옛 자료(아웃라이어 — 예: 멀리 둔 테스트 자료)는 기준에서 빼고, '현재
  //   화면 또는 그 왼쪽' 자료 중 가장 오른쪽 끝 옆(+240)에 둔다. 그 자리가 어떤 자료와 겹치면(가까이
  //   자료가 있으면) 전체의 오른쪽 끝으로 물러나 절대 겹치지 않게 한다. 빈 보드면 현재 화면 중앙.
  const existing = Object.values(b.nodes).filter((n) => n.type !== 'motion' && n.type !== 'runner');
  const rightEnd = (pool: typeof existing) => Math.max(...pool.map((n) => { const w = worldBox(n); return w.x + w.w; }));
  let fX: number;
  if (!existing.length) {
    fX = Math.round(vc.x - W0 / 2);
  } else {
    const railW = 64;
    const cw = Math.max(320, (typeof window !== 'undefined' ? window.innerWidth : 1200) - railW);
    const viewRight = (cw - b.viewport.panX) / b.viewport.zoom; // 화면 오른쪽 끝의 보드 x
    const nearby = existing.filter((n) => n.x <= viewRight + 200); // 화면 밖 오른쪽으로 멀리 떨어진 건 제외
    fX = Math.round(rightEnd(nearby.length ? nearby : existing) + 240);
    // 그 자리가 어떤 자료와도 안 겹치는지 확인 — 겹치면(그 y대에 가까운 자료가 있으면) 전체 오른쪽 끝으로.
    const hit = existing.some((n) => { const w = worldBox(n); return fX < w.x + w.w && fX + W0 > w.x && fY < w.y + w.h && fY + H0 > w.y; });
    if (hit) fX = Math.round(rightEnd(existing) + 240);
  }
  const frameId = newId('frame');
  b.addNodeRaw({
    id: frameId,
    type: 'frame',
    x: fX,
    y: fY,
    w: W0,
    h: H0,
    data: { title: `${t} ${kindLabel} 패키지`, composer: true, loading: true, working: true, loadingLabel: `📦 ${kindLabel} 패키지를 준비하는 중…`, sourcePrompt: topic },
  });
  const created: string[] = [frameId];
  // 동영상 뷰어는 패키지의 핵심이라 크게(16:10, 안에서 16:9 영상 재생). 게임도 같은 높이대.
  const VID_W = 640, VID_H = 400, GAME_W = 720, GAME_H = 450;
  try {
    // 카메라를 새 프레임(오른쪽 빈 곳)으로 옮겨 만들어지는 과정을 그 자리에서 보게 한다.
    useBoardStore.getState().focusNode(frameId);
    await new Promise((r) => setTimeout(r, 80)); // 카메라 정착 잠깐
    // ── 스켈레톤 먼저 ── 프레임 + 모든 섹션이 '로딩 자리'를 즉시 잡는다(전체 구조가 바로 보이고
    //    각 섹션이 생성되는 대로 그 자리에서 채워진다 — 기다리는 동안 화면이 계속 살아 있게).
    say('📦 패키지 자리를 잡는 중 — 각 자료가 채워집니다…');
    // 아이디어 리스트(선택형) — 로딩 placeholder. 채워지면 ideaItems가 들어가 행으로 렌더된다.
    const ideaCardId = spawnDocCard(frameId, `# 💡 ${t} ${kindLabel} 아이디어\n\n아이디어를 모으는 중…`, 'idealist', 520);
    {
      const c = useBoardStore.getState().nodes[ideaCardId];
      useBoardStore.getState().updateNodeRaw(ideaCardId, { data: { ...(c?.data ?? {}), loadingDoc: true, ideaTitle: `${t} ${kindLabel} 아이디어` } });
    }
    created.push(ideaCardId);
    // 동영상 — 패키지 프레임 '안의 서브 프레임'에 유튜브 뷰어 + 활동별 썸네일을 묶어 정리해 넣는다
    //   (프레임 안에 프레임). 썸네일 클릭 → 이 뷰어에서 바로 재생. designComposedFrame은 videoBand
    //   서브프레임을 건드리지 않고(아이디어 프레임으로 오인 X), 최종 위치는 gridDeOverlap가 한 단위로 정돈.
    const vFrameId = newId('frame');
    b.addNodeRaw({ id: vFrameId, type: 'frame', x: fX + 24, y: fY + 560, w: VID_W + 56, h: VID_H + 260, data: { title: '동영상', composer: true, sub: true, videoBand: true, frameId } });
    const ytId = newId('sticky');
    b.addNodeRaw({ id: ytId, type: 'sticky', x: fX + 24 + 28, y: fY + 560 + 46, w: VID_W, h: VID_H, autoH: false, text: '유튜브', data: { embed: '/youtube-viewer.html', title: `${t} 동영상`, role: 'video', frameId: vFrameId } });
    // 게임 — 인터랙티브 노드 placeholder(빈 노드, 생성 후 채워짐).
    const gameDocId = newId('inode');
    const gameNodeId = addPresetNodeCmd('interactive', fX + 24 + (VID_W + 56) + 40 + GAME_W / 2, fY + 560 + GAME_H / 2, { w: GAME_W, h: GAME_H, autoH: false, data: { docId: gameDocId, frameId } }, '인터랙티브 게임');
    created.push(vFrameId, ytId, gameNodeId);
    b.setSelection([frameId]); // addPresetNodeCmd가 게임 노드를 선택 → 프레임 선택으로 되돌림
    gridDeOverlap(frameId); // 스켈레톤 1차 정돈(자리 안정)

    // ── Package Planner ── 주제/연령/요청에 따라 패키지 설계도(JSON)를 동적으로 받는다:
    //   play_ideas 12 + assets 6. 실패해도 항상 유효한 폴백 설계도를 반환한다(호출부는 null 걱정 없음).
    //   이 설계도의 자산은 '기존 구성' 위에 추가로 얹힌다(하드룰: 기존 유지 + 추가 함께 구성).
    say('🧭 패키지 구성을 설계하고 있어요…');
    const plan = await buildPackagePlan(t, ctx, kind, topic);

    // 아이디어 리스트 — ★ 기존 방식(runPlanIdeas) 그대로 12개. 활동명 품질("~색칠하기·~만들기·여름
    //   과일탐구" 스타일)을 위해 검증된 아이디어 에이전트를 쓴다. Planner의 play_ideas는 '자산 설계용'
    //   이라 여기 표시 리스트와 별개(폴백 시 제너릭 이름이 리스트로 새지 않게 분리).
    let ideas: IdeaItem[] = [];

    // 게임 먼저 시작(단일 게임 슬롯) — 이미지 배치가 API를 점유하기 전에 시작해 빈 노드로 남던 문제를
    //   막는다. 프롬프트는 Planner의 game 자산에서, 없으면 주제로 폴백. 비동기·자체 gen 카운터.
    const gameAsset = plan.package.assets.find((a) => a.asset_type === 'game');
    void runPackageGame(gameDocId, gameAsset?.generation_prompt || t);

    // ── 1단계 병렬 채움(기존 구성 유지) ── 아이디어 12 · 계획 문서 · 시청각자료 5장(주제 핵심 사물 낱장 그림 카드).
    //    계획은 프로젝트면 단계별 프로젝트 계획, 아니면 주간 놀이계획. 시청각자료는 같은 캡션만 재사용.
    let planId: string | undefined;
    await Promise.all([
      runPlanIdeas(t, ctx, 12)
        .then((res) => {
          ideas = res;
          if (!res.length) return;
          const md = `# 💡 ${t} ${kindLabel} 아이디어 ${res.length}가지\n\n` + res.map((it, i) => `${i + 1}. **${it.label}**${it.desc ? ` — ${it.desc}` : ''}`).join('\n');
          const c = useBoardStore.getState().nodes[ideaCardId];
          if (c) useBoardStore.getState().updateNodeRaw(ideaCardId, { text: md, data: { ...(c.data ?? {}), ideaItems: res, selectedIdeaIds: [], loadingDoc: false } });
        })
        .catch(() => {}),
      (async () => {
        say(isProject ? '📚 프로젝트 단계 계획을 짜고 있어요…' : '📅 주간 놀이계획을 작성하고 있어요…');
        const res = await runPlan(t, [], ctx, isProject ? { project: true } : undefined);
        const md = isProject ? projectDocMarkdown(res.payload) : planDocMarkdown(res.payload);
        const cid = spawnDocCard(frameId, md, 'plan', PLAN_DOC_W);
        stashPayload(cid, res.payload);
        created.push(cid);
        if (res.payload.type === 'WeeklyPlanGrid') planId = res.payload.props.id;
      })().catch(() => {}),
      fillRegion(frameId, 'studio.images', `${t} 핵심 사물·요소 낱장 그림 카드 (단일 사물 하나씩, 활동 장면 아님)`, ctx, undefined, 'story', undefined, 5).then((r) => created.push(...r.ids)).catch(() => {}),
    ]);

    // 계획(WeeklyPlanGrid)의 활동/단계 목록 추출(없으면 아이디어 라벨로 폴백) — 2단계 입력.
    const planCard = Object.values(useBoardStore.getState().nodes).find((n) => n.data?.frameId === frameId && n.data?.role === 'plan');
    const planPay = planCard?.data?.payload as { type?: string; props?: { days?: Array<{ activity?: string }> } } | undefined;
    let activities = planPay?.type === 'WeeklyPlanGrid' ? (planPay.props?.days ?? []).map((d) => String(d.activity ?? '').trim()).filter(Boolean) : [];
    if (!activities.length) activities = ideas.slice(0, 5).map((it) => it.label);
    activities = activities.slice(0, 6);

    // ── 2단계 병렬 채움 ── 기존 구성(활동 예시 이미지 · 활동지 · 활동별 동영상) 위에 Planner 자산
    //    (실사/생성 이미지 · 탐구/동요 영상)을 함께 얹는다. 영상은 같은 서브프레임에 한 번에.
    // ★ 활동지는 레거시(계획 활동)와 Planner 설계 활동지를 '하나의 목록'으로 합쳐 정규화 키로 중복
    //   제거한 뒤 한 경로에서만 생성한다 — 같은 주제 활동지가 두 경로에서 각각 만들어져 거의 똑같은
    //   활동지가 여러 장 생기던 문제 해결(사용자 선택: 여러 장 유지, 중복만 제거). Planner 활동지는
    //   여기서 처리하므로 executePackageAssets는 더 이상 활동지를 만들지 않는다.
    const worksheetJobs = dedupeWorksheetJobs([
      ...pickWorksheetActivities(activities, t),
      ...plan.package.assets.filter((a) => a.call_target === 'runStudioWorksheet').map((a) => a.generation_prompt),
    ]);
    say('🎨 활동별 자료를 만들고 있어요…');
    await Promise.all([
      // (기존) 활동 예시 이미지 — 계획 활동수만큼(최대 5). 같은 활동명 자료만 보관함에서 재사용.
      generateActivityImages(frameId).catch(() => {}),
      // 활동지 — 중복 제거된 목록만큼 각각 A4 워크시트로(레거시 + Planner 통합).
      (async () => {
        for (const job of worksheetJobs) {
          const cid = spawnPlaceholderDoc(frameId, 'worksheet');
          created.push(cid);
          try {
            const res = await runStudioWorksheet(job, buildAgentContext('studio'), planId);
            fillPlaceholderDoc(cid, payloadText(res.payload), res.payload);
          } catch {
            failPlaceholderDoc(cid, `‘${job}’ 활동지 생성에 실패했어요.`);
          }
        }
      })(),
      // (추가) Planner 설계도 자산 — 이미지 새 카드 추가 + 영상 자산은 기존 활동 영상과 합쳐 채움.
      executePackageAssets(plan, { frameId, ctx, planId, theme: t, created, ytId, vFrameId, activities }),
    ]);
    // 동영상 서브프레임을 내용(뷰어 + 썸네일)에 맞춰 감싼다(프레임 안에 프레임이 깔끔히 닫히게).
    fitFrameToChildren(vFrameId);

    // 이미지 링크 — 프레임 '안' 우측에 활동수만큼. 클릭하면 해당 사이트로 이동해 자료를 확인한다.
    //   (designComposedFrame 전에 멤버로 만들어야 우측 자료 스택에 배치된다.)
    const linkCardId = spawnImageLinksCard(frameId, t, activities);
    if (linkCardId) created.push(linkCardId);

    // ── 마무리 정돈 ── 채워진 문서 높이(renderH)가 안정된 뒤 컬럼+동영상 띠 배치 + 겹침 해소 + 핏.
    say('🪄 패키지를 정리하고 있어요…');
    await new Promise((r) => setTimeout(r, 480)); // 방금 채워진 autoH 문서의 실제 높이 측정 대기
    designComposedFrame(frameId, asLayoutVariant(undefined));
    await new Promise((r) => setTimeout(r, 360));
    gridDeOverlap(frameId);

    b.setSelection([frameId]);
    recordSpawnedNodes(created.filter((id) => useBoardStore.getState().nodes[id]), `${kindLabel} 패키지`);
    // 이미지 로드·문서 높이가 더 늦게 바뀔 수 있어 잠시 뒤 한 번 더 정돈하고, 완성된 프레임 전체가
    // 화면 중앙에 보이도록 다시 핏(비동기·블로킹 없음) — 겹침 잔여 제거 + 최종 크기에 맞춘 줌.
    setTimeout(() => {
      if (!useBoardStore.getState().nodes[frameId]) return;
      gridDeOverlap(frameId);
      useBoardStore.getState().focusNode(frameId);
    }, 1000);
  } finally {
    const cur = useBoardStore.getState().nodes[frameId];
    if (cur) useBoardStore.getState().updateNodeRaw(frameId, { data: { ...(cur.data ?? {}), loading: false, working: false } });
    useBoardStore.getState().endGen();
  }
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
  if (frameId && useBoardStore.getState().nodes[frameId]?.data?.mindmap) {
    linkMindMap(nodeId, id);
  }
  useBoardStore.getState().setSelection([id]);
  useBoardStore.getState().setGenerating('📋 계획안을 만들고 있어요…');

  try {
    // 기본 계획 생성 경로 → 새 구조(주안 WeeklyPlan). planDocMarkdown 이 WeeklyPlan 을 위임 렌더.
    const res = await runWeeklyPlan(activity, buildAgentContext('plan'), { seed });
    fillPlaceholderDoc(id, planDocMarkdown(res.payload), res.payload);
  } catch {
    failPlaceholderDoc(id, `‘${activity}’ 계획안 생성에 실패했어요.`);
  } finally {
    useBoardStore.getState().setGenerating(null);
  }
  if (frameId) {
    await new Promise((r) => setTimeout(r, 260));
    fitFrameToChildren(frameId);
  }
  recordSpawnedNodes([id], '계획안 만들기');
}

/* ---------------- 아이디어 ↔ 문서 링크 생성 (보드 연결 확인창) ----------------
   BoardCanvas onLinkUp 에서 아이디어 리스트↔문서를 이으면 확인 팝오버가 뜨고,
   여기 두 함수가 실제 생성을 한다(기존 planFromNode/generateIdeaList 배관 재사용). */

/** 대상 문서 노드의 유형 → 생성할 문서 종류·라벨. record/letter 등은 근거 없는 생성을 피해
    안전하게 놀이계획으로 폴백(하드룰 4: 무근거 생성 금지). */
export type IdeaDocKind = 'plan' | 'project' | 'worksheet';
export function classifyDocTarget(node: { data?: Record<string, unknown>; text?: string } | undefined): {
  kind: IdeaDocKind;
  label: string;
} {
  const role = node?.data?.role;
  const text = node?.text ?? '';
  if (role === 'worksheet') return { kind: 'worksheet', label: '활동지' };
  if (role === 'plan' && /프로젝트/.test(text)) return { kind: 'project', label: '프로젝트 수업' };
  if (role === 'plan') return { kind: 'plan', label: '주간 놀이계획' };
  return { kind: 'plan', label: '놀이계획' };
}

/** 아이디어 리스트 노드가 맞는지(선택형 아이디어를 담은 문서). */
export function isIdeaListNode(node: { data?: Record<string, unknown> } | undefined): boolean {
  return node?.data?.role === 'idealist' || Array.isArray(node?.data?.ideaItems);
}

/** 아이디어로부터 문서를 생성한다 — 대상 문서(targetDocId)의 유형으로, 아이디어 노드의
    '선택된' 아이디어(없으면 전체)를 입력 삼아 새 문서 카드를 만들고 아이디어→문서로 잇는다. */
export async function genDocFromIdeas(ideaNodeId: string, targetDocId: string): Promise<void> {
  const b = useBoardStore.getState();
  const ideaNode = b.nodes[ideaNodeId];
  const target = b.nodes[targetDocId];
  if (!ideaNode || !target) return;
  const items = Array.isArray(ideaNode.data?.ideaItems) ? (ideaNode.data.ideaItems as IdeaItem[]) : [];
  const selIds = Array.isArray(ideaNode.data?.selectedIdeaIds) ? (ideaNode.data.selectedIdeaIds as string[]) : [];
  let selected = items.filter((it) => selIds.includes(it.id));
  if (!selected.length) selected = items; // 미선택 → 전체 아이디어로
  const labels = selected.map((it) => it.label).filter(Boolean);
  if (!labels.length) {
    showToast('사용할 아이디어가 없어요 — 아이디어를 먼저 골라 주세요', 'error');
    return;
  }
  const { kind, label } = classifyDocTarget(target);
  const isProject = kind === 'project';
  const topic = (String(ideaNode.data?.ideaTitle ?? '') || labels[0] || '놀이').replace(/\s*놀이 아이디어$/, '').trim();

  const id = newId('sticky');
  const width = kind === 'worksheet' ? DOC_WIDTH : PLAN_DOC_W;
  b.beginGen();
  b.addNodeRaw({
    id,
    type: 'sticky',
    x: Math.round(ideaNode.x + ideaNode.w + 48),
    y: Math.round(ideaNode.y),
    w: width,
    h: 260,
    autoH: true,
    text: `📋 ${label}을(를) 만들고 있어요…`,
    color: 'paper',
    data: { doc: true, role: kind === 'worksheet' ? 'worksheet' : 'plan', loadingDoc: true },
  });
  addLinkCmd(ideaNodeId, id); // 아이디어 → 새 문서 연결(부모→자식)
  useBoardStore.getState().setSelection([id]);
  useBoardStore.getState().setGenerating(`📋 ${label}을(를) 만들고 있어요…`);
  try {
    if (kind === 'worksheet') {
      const res = await runStudioWorksheet(labels.join(', '), buildAgentContext('studio'));
      fillPlaceholderDoc(id, worksheetText(res.payload), res.payload);
    } else {
      const res = await runPlan(topic, labels, buildAgentContext('plan'), isProject ? { project: true } : undefined);
      fillPlaceholderDoc(id, isProject ? projectDocMarkdown(res.payload) : planDocMarkdown(res.payload), res.payload);
    }
    showToast(`${label}을(를) 만들었어요`, 'success');
  } catch {
    failPlaceholderDoc(id, `${label} 생성에 실패했어요 — 다시 시도해 주세요.`);
  } finally {
    useBoardStore.getState().setGenerating(null);
    useBoardStore.getState().endGen();
  }
  recordSpawnedNodes([id], `${label} 생성`);
}

/** 문서(docNodeId)를 근거로 아이디어 count개를 만들어, 연결된 아이디어 리스트 노드(ideaNodeId)를 채운다. */
export async function genIdeasFromDoc(docNodeId: string, ideaNodeId: string, count = 12): Promise<void> {
  const b = useBoardStore.getState();
  const doc = b.nodes[docNodeId];
  const ideaNode = b.nodes[ideaNodeId];
  if (!doc || !ideaNode) return;
  const docText = (doc.text ?? '').trim();
  if (!docText) {
    showToast('참고할 문서 내용이 없어요', 'error');
    return;
  }
  const topic =
    (coreTopic(docText.replace(/^#\s+/, '')) || docText.split('\n')[0].replace(/^#\s+/, '')).slice(0, 24).trim() || '놀이';

  b.beginGen();
  useBoardStore.getState().updateNodeRaw(ideaNodeId, {
    data: { ...(ideaNode.data ?? {}), ideaLoading: true },
  });
  useBoardStore.getState().setGenerating('💡 이 문서로 놀이 아이디어를 모으고 있어요…');
  try {
    // runPlanIdeas 는 grounding 인자가 없어 요청문에 문서를 실어 근거로 삼는다.
    const req = `${topic}\n\n[아래 문서의 주제·활동 흐름에 어울리는 새로운 놀이 아이디어를 제안해줘 — 문서에 이미 있는 활동과 겹치지 않게]\n${docText.slice(0, 1400)}`;
    const ideas = await runPlanIdeas(req, buildAgentContext('plan'), count);
    const cur = useBoardStore.getState().nodes[ideaNodeId];
    if (!ideas.length || !cur) {
      showToast('아이디어를 만들지 못했어요 — 다시 시도해 주세요', 'error');
      return;
    }
    const md = `# 💡 ${topic} 놀이 아이디어 ${ideas.length}가지\n\n${ideas
      .map((it, i) => `${i + 1}. **${it.label}**${it.desc ? ` — ${it.desc}` : ''}`)
      .join('\n')}`;
    useBoardStore.getState().updateNodeRaw(ideaNodeId, {
      text: md,
      data: {
        ...(cur.data ?? {}),
        doc: true,
        role: 'idealist',
        ideaItems: ideas,
        selectedIdeaIds: [],
        ideaTitle: `${topic} 놀이 아이디어`,
        ideaLoading: false,
      },
    });
    showToast('💡 아이디어를 만들었어요', 'success');
  } catch {
    const cur = useBoardStore.getState().nodes[ideaNodeId];
    if (cur) useBoardStore.getState().updateNodeRaw(ideaNodeId, { data: { ...(cur.data ?? {}), ideaLoading: false } });
    showToast('아이디어 생성에 실패했어요 — 다시 시도해 주세요', 'error');
  } finally {
    useBoardStore.getState().setGenerating(null);
    useBoardStore.getState().endGen();
  }
  recordSpawnedNodes([ideaNodeId], '문서 → 아이디어');
}

/** 활동 노드 → '월간계획안(월안)' 문서 생성. 주간계획안 만들기와 동일한 흐름이되
    한 달(5주차) 놀이 흐름으로 생성하고, data.monthly 로 표시해 '편집디자인'이 월안 캔버스로 열리게 한다. */
export async function monthlyPlanFromNode(nodeId: string): Promise<void> {
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
    text: '📅 월간계획안을 만들고 있어요…', color: 'paper',
    data: { doc: true, role: 'plan', monthly: true, loadingDoc: true, ...(frameId ? { frameId } : {}) },
  });
  if (frameId && useBoardStore.getState().nodes[frameId]?.data?.mindmap) {
    linkMindMap(nodeId, id);
  }
  useBoardStore.getState().setSelection([id]);
  useBoardStore.getState().setGenerating('📅 월간계획안을 만들고 있어요…');

  try {
    const res = await runMonthlyPlan(activity, buildAgentContext('plan'), { seed });
    const text = res.payload.type === 'MonthlyPlan' ? monthlyPlanMarkdown(res.payload.props) : planText(res.payload);
    const cur = useBoardStore.getState().nodes[id];
    b.updateNodeRaw(id, {
      text,
      data: { ...(cur?.data ?? {}), doc: true, role: 'plan', monthly: true, payload: res.payload, loadingDoc: false },
    });
  } catch {
    const cur = useBoardStore.getState().nodes[id];
    b.updateNodeRaw(id, { text: `‘${activity}’ 월간계획안 생성에 실패했어요.`, data: { ...(cur?.data ?? {}), loadingDoc: false } });
  } finally {
    useBoardStore.getState().setGenerating(null);
  }
  if (frameId) {
    await new Promise((r) => setTimeout(r, 260));
    fitFrameToChildren(frameId);
  }
  recordSpawnedNodes([id], '월간계획안 만들기');
}

/** 활동/주안 노드 → '일일 놀이계획안(일안)' 문서 생성. 도입→전개→마무리+평가+확장까지 실행 단위로.
    주안 카드에서 만들면 그 주제·놀이를 상위 맥락(weeklyContext)으로 상속한다. */
export async function dailyPlanFromNode(nodeId: string): Promise<void> {
  const b = useBoardStore.getState();
  const node = b.nodes[nodeId];
  if (!node) return;
  const frameId = node.data?.frameId as string | undefined;
  const act = node.data?.activity as MindActivity | undefined;
  const activity = act?.label || (node.text ?? '').split('\n')[0].replace(/^#+\s*/, '').trim() || '활동';
  const seed = [activity, act?.method, act?.area].filter((s): s is string => !!s && !!s.trim());
  // 주안(WeeklyPlan) 카드에서 만들면 그 문서를 상위 맥락으로.
  const pl = node.data?.payload as { type?: string } | undefined;
  const weeklyContext = pl?.type === 'WeeklyPlan' ? (node.text ?? '').slice(0, 1200) : undefined;

  const id = newId('sticky');
  b.addNodeRaw({
    id, type: 'sticky',
    x: Math.round(node.x + node.w + 48), y: Math.round(node.y), w: PLAN_DOC_W, h: 260, autoH: true,
    text: '🗓️ 일일 놀이계획안을 만들고 있어요…', color: 'paper',
    data: { doc: true, role: 'plan', loadingDoc: true, ...(frameId ? { frameId } : {}) },
  });
  if (frameId && useBoardStore.getState().nodes[frameId]?.data?.mindmap) {
    linkMindMap(nodeId, id);
  }
  useBoardStore.getState().setSelection([id]);
  useBoardStore.getState().setGenerating('🗓️ 일일 놀이계획안을 만들고 있어요…');

  try {
    const res = await runDailyPlan(activity, buildAgentContext('plan'), { seed, weeklyContext });
    const text = res.payload.type === 'DailyPlan' ? dailyPlanMarkdown(res.payload.props) : planText(res.payload);
    const cur = useBoardStore.getState().nodes[id];
    b.updateNodeRaw(id, {
      text,
      data: { ...(cur?.data ?? {}), doc: true, role: 'plan', payload: res.payload, loadingDoc: false },
    });
  } catch {
    const cur = useBoardStore.getState().nodes[id];
    b.updateNodeRaw(id, { text: `‘${activity}’ 일일 놀이계획안 생성에 실패했어요.`, data: { ...(cur?.data ?? {}), loadingDoc: false } });
  } finally {
    useBoardStore.getState().setGenerating(null);
  }
  if (frameId) {
    await new Promise((r) => setTimeout(r, 260));
    fitFrameToChildren(frameId);
  }
  recordSpawnedNodes([id], '일일 계획안 만들기');
}

/* ---------------- classification ---------------- */

function estimateComplexity(text: string, r: RouterOutput): 'simple' | 'complex' {
  const t = text.trim();
  // 놀이계획 — 기본은 '계획안 단일 문서'(simple). 정교한 문서 하나를 먼저 주고
  // 아이디어·이미지 등은 확장 칩으로 하나씩 붙인다. 패키지(동반 자료)는 명시 요청에만.
  if (r.route_to === 'plan') {
    return /패키지|세트|한\s*번에|한꺼번에|전부|모두\s*다?|아이디어|이미지|사진|도안|활동지|통신문/.test(t)
      ? 'complex'
      : 'simple';
  }
  if (t.length > 38) return 'complex';
  if (/그리고|및|랑|[,+]|[0-9]+\s*(개|장|가지)/.test(t)) return 'complex';
  if (/활동지|도안|이미지|계획|통신문|평가/.test(t) && /와|과|랑|,|그리고/.test(t)) return 'complex';
  return 'simple';
}

function frameTitle(text: string, t: FrameTemplate): string {
  // 핵심 주제만 — 명령 어미 이후 꼬리("그려줘 각각")까지 제거(프롬프트 원문 노출 방지).
  return (coreTopic(text) || t.title).slice(0, 24);
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

/** 문서 플레이스홀더 — 생성 '전에' 빈 카드(스피너)를 깔아 onSpawn(디자인 디렉터)이
    최종 자리를 잡게 한다. 내용은 fillPlaceholderDoc이 같은 자리에서 채운다. */
function spawnPlaceholderDoc(frameId: string, role: string, onSpawn?: (ids: string[]) => void): string {
  const cid = spawnDocCard(frameId, '', role);
  const b = useBoardStore.getState();
  const n = b.nodes[cid];
  if (n) b.updateNodeRaw(cid, { data: { ...(n.data ?? {}), loadingDoc: true } });
  onSpawn?.([cid]);
  return cid;
}

/** 플레이스홀더에 생성 결과 채우기 — 위치는 그대로, 내용·payload만 갱신.
    단, 활동지(WorksheetCard) 중 편집 디자인 템플릿 유형(props.template_variant)은
    이미지 시트 대신 '편집디자인 카드(iframe)'로 제자리 변환한다(생성 시점부터 편집디자인). */
function fillPlaceholderDoc(cid: string, text: string, payload: RegistryPayload): void {
  const b = useBoardStore.getState();
  const n = b.nodes[cid];
  if (!n) return;
  if (payload.type === 'WorksheetCard' && (payload.props as WorksheetCardProps).template_variant) {
    if (fillWorksheetEditorCard(cid, payload.props as WorksheetCardProps)) return;
  }
  const data = { ...(n.data ?? {}) };
  delete data.loadingDoc;
  b.updateNodeRaw(cid, { text, data: { ...data, payload } });
}

/** 활동지 placeholder → 편집디자인 카드로 제자리 변환. 성공하면 true.
    payload 를 stash 하고 노드를 embed(iframe) 카드로 바꾼다(doc/role/payload 정리). */
function fillWorksheetEditorCard(cid: string, props: WorksheetCardProps): boolean {
  const variant = props.template_variant;
  if (!variant) return false;
  const editorPayload = buildWorksheetEditorPayload(variant, {
    title: props.title,
    theme: props.theme,
    topic: props.topic,
    instruction: props.instruction,
    type: props.type,
  });
  if (!editorPayload) return false; // 빌더 미등록 → 일반 채움으로 폴백
  const editId = stashEditorPayload(variant, editorPayload);
  const b = useBoardStore.getState();
  const n = b.nodes[cid];
  if (!n) return false;
  const data = { ...(n.data ?? {}) };
  delete data.loadingDoc;
  delete data.doc;
  delete data.role;
  delete data.payload;
  const { w, h } = editorCardSize(variant); // 가로형(이름표 등)은 가로 카드로
  b.updateNodeRaw(cid, {
    w,
    h,
    autoH: false,
    text: '편집디자인',
    data: { ...data, embed: editorEmbedUrl(editId), title: '편집디자인' },
  });
  return true;
}

/** fillPlaceholderDoc의 에러 짝 — 위치·data 유지, loadingDoc만 해제하고 실패 메시지로 채운다. */
function failPlaceholderDoc(cid: string, text: string): void {
  const b = useBoardStore.getState();
  const n = b.nodes[cid];
  if (!n) return;
  const data = { ...(n.data ?? {}) };
  delete data.loadingDoc;
  b.updateNodeRaw(cid, { text, data });
}

async function fillRegion(
  frameId: string,
  agent: FillAgent,
  topic: string,
  ctx: string,
  planId: string | undefined,
  recordMode: RecordMode,
  /** 칩 확장 등에서 전달 — 플레이스홀더 카드가 깔리는 '즉시' 호출돼 디자인
      디렉터가 생성 전에 자리를 잡는다(생성 → 완료 후 정렬 점프의 시각 혼선 제거).
      전달되면 이미지의 임시 가로줄 배치(layoutImagesRow)는 생략된다. */
  onSpawn?: (ids: string[]) => void,
  /** studio.images 전용 — 생성할 이미지 장수 고정(놀이 패키지의 시청각자료 5장 등).
      미전달이면 플래너가 요청문/기본값으로 정한다. */
  imageCount?: number,
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
      const plan = await planStudioImages(topic, [], ctx, kindStr, simple ? { simple: true } : imageCount ? { count: imageCount } : undefined);
      // 보관함 재사용은 '같은 캡션(정확)'일 때만 — 퍼지/카테고리 검색은 엉뚱한 그림(숲 주제에 오리 등)을
      // 끌어와 금지. 정확히 맞는 자료만 가져다 쓰고 나머지는 새로 생성한다.
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
      // 자리 먼저 잡기 — 칩 확장(onSpawn)은 디자인 디렉터가 생성 전에 최종 슬롯으로
      // 정렬하고, 새 프레임 컴포즈는 기존처럼 '가로 한 줄' 임시 배치를 쓴다.
      if (onSpawn) onSpawn(cardIds);
      else layoutImagesRow(frameId, cardIds);
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
      const signal = genSignal(); // 정지 버튼 — 남은 카드 생성을 다음 장부터 멈춘다
      for (let i = 0; i < proms.length; i++) {
        const p = proms[i];
        if (!p) continue;
        if (signal.aborted) {
          // 아직 채워지지 않은 로딩 카드는 거둔다(스피너가 영원히 남지 않게).
          const bb = useBoardStore.getState();
          for (let j = i; j < proms.length; j++) {
            if (proms[j] && bb.nodes[cardIds[j]]?.loading) bb.removeNodeRaw(cardIds[j]);
          }
          break;
        }
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
      // 자리 먼저 — 빈 플레이스홀더(생성 중 스피너)를 깔고 onSpawn으로 정렬한 뒤,
      // 생성이 끝나면 '그 자리에서' 내용만 채운다(완료 후 점프·겹침 제거).
      const signal = genSignal();
      const cid = spawnPlaceholderDoc(frameId, 'worksheet', onSpawn);
      ids.push(cid);
      const res = await runStudioWorksheet(topic, ctx, planId);
      if (signal.aborted) {
        useBoardStore.getState().removeNodeRaw(cid);
        return { ids: [] };
      }
      fillPlaceholderDoc(cid, payloadText(res.payload), res.payload);
      return { ids };
    }
    case 'writing.letter': {
      say('💌 통신문을 작성하고 있어요…');
      const signal = genSignal();
      const cid = spawnPlaceholderDoc(frameId, 'letter', onSpawn);
      ids.push(cid);
      const res = await runWriting(topic, ctx);
      if (signal.aborted) {
        useBoardStore.getState().removeNodeRaw(cid);
        return { ids: [] };
      }
      fillPlaceholderDoc(cid, payloadText(res.payload), res.payload);
      return { ids };
    }
    case 'record': {
      say('📝 기록 초안을 작성하고 있어요…');
      const signal = genSignal();
      const cid = spawnPlaceholderDoc(frameId, 'record', onSpawn);
      ids.push(cid);
      const res = await runRecord({ text: topic, mode: recordMode, grounding: { photos: [], teacher_notes: [topic] } }, ctx);
      if (signal.aborted) {
        useBoardStore.getState().removeNodeRaw(cid);
        return { ids: [] };
      }
      fillPlaceholderDoc(cid, payloadText(res.payload), res.payload);
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

  const hostOf = (u: string) => {
    try {
      return new URL(u).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  };

  // Real grounded result pages from Gemini Google Search (when keyed). Each is a
  // vertexaisearch redirect that hides the real page — so we unfurl it server-side
  // (follow redirect → parse og:image/title) to get the actual URL, title and a
  // real preview thumbnail, exactly like the YouTube viewer pulls i.ytimg.com.
  const rawSources = (res.sources ?? []).filter((s) => s.url).slice(0, 5);
  const unfurled = await Promise.all(rawSources.map((s) => unfurlLink(s.url)));
  const realLinks: SourceLink[] = rawSources.map((s, i) => {
    const u = unfurled[i];
    const finalUrl = u?.url || s.url;
    const host = hostOf(finalUrl);
    const isRedirect = /vertexaisearch|grounding-api-redirect/.test(host);
    const title = (u?.title || s.title || host || '웹 자료').slice(0, 80);
    return {
      title,
      url: finalUrl,
      domain: isRedirect ? (s.title || '').slice(0, 40) : host,
      ...(u?.thumb ? { thumb: u.thumb } : {}),
      // 서버 unfurl이 X-Frame-Options/CSP로 확인한 임베드 가능 여부만 신뢰(없으면 false).
      embeddable: u?.embeddable === true,
    };
  });

  // Topic thumbnails: prefer the real page previews (og:image); fall back to free
  // image sites (Openverse) only when no link yielded a usable preview.
  const linkThumbs: SourceThumb[] = realLinks
    .filter((l) => l.thumb)
    .map((l) => ({ thumb: l.thumb as string, url: l.url, title: l.title, source: l.domain, embeddable: l.embeddable }));
  const thumbs = linkThumbs.length ? linkThumbs : await fetchFreeImages(imgQuery || topic);

  // Curated search shortcuts — always relevant, open the topic search directly.
  const q = encodeURIComponent(topic);
  const curated: SourceLink[] = [
    { title: '유튜브에서 영상 검색', url: `https://www.youtube.com/results?search_query=${q}`, domain: 'youtube.com' },
    { title: '구글 이미지 검색', url: `https://www.google.com/search?tbm=isch&q=${q}`, domain: 'google.com' },
    { title: 'Pinterest 활동 아이디어', url: `https://www.pinterest.com/search/pins/?q=${q}`, domain: 'pinterest.com' },
    { title: 'Pixabay 무료 이미지', url: `https://pixabay.com/images/search/${q}/`, domain: 'pixabay.com' },
  ];
  const links: SourceLink[] = [...realLinks, ...curated];

  // 찾은 링크를 키워드 보관함(web-links DB)에 저장 — 프롬프트바에서 같은 키워드를
  // 입력하면 이미지처럼 다시 추천된다. 실제 검색 결과 우선, 없으면 큐레이션 링크.
  // 그라운딩 링크는 리다이렉트 URL이라 페이지별 이미지를 가져올 수 없어, 함께 받은
  // 주제 이미지(Openverse)를 각 링크의 대표 썸네일로 붙여 저장한다(없으면 파비콘 폴백).
  const toSave = (realLinks.length ? realLinks : curated).map((l, i) => ({
    ...l,
    thumb: l.thumb || (thumbs.length ? thumbs[i % thumbs.length].thumb : undefined),
  }));
  void saveWebLinks(topic, toSave);

  return { summary, links, thumbs };
}

/** 유튜브 뷰어에 연결한 자료로 '웹 검색' — 뷰어 바로 아래에 웹 자료 카드를 깔고
    (이미 프레임 안이면 합류, 아니면 뷰어와 한 프레임으로 묶는다), 찾은 링크는
    web-links 보관함에 저장된다(buildWebSource 내부). */
export async function searchWebForLink(viewerId: string, content: string, _sourceId?: string): Promise<void> {
  const b = useBoardStore.getState();
  if (!b.nodes[viewerId]) return;
  b.beginGen();
  b.setGenerating('🔎 연결한 자료로 웹에서 자료를 찾고 있어요…');
  try {
    const topic = (content.split('\n')[0] || content).trim().slice(0, 60) || content.trim();
    const { summary, links, thumbs } = await buildWebSource(topic);
    spawnSourceUnderViewer(viewerId, summary, links, thumbs);
  } finally {
    useBoardStore.getState().endGen();
  }
}

/** 뷰어 바로 아래에 웹 자료(role:'source') 카드를 깔고 뷰어와 한 프레임으로 묶는다. */
function spawnSourceUnderViewer(viewerId: string, summary: string, links: SourceLink[], thumbs: SourceThumb[]): string | null {
  const b = useBoardStore.getState();
  const viewer = b.nodes[viewerId];
  if (!viewer) return null;
  const vb = worldBox(viewer);
  const W = 360;
  const H = 240;
  const x = Math.round(vb.x + (vb.w - W) / 2);
  const y = Math.round(vb.y + vb.h + 12);
  const id = newId('sticky');
  b.addNodeRaw({
    id, type: 'sticky', x, y, w: W, h: H, autoH: true, color: 'surface-2',
    data: { role: 'source', links, thumbs, summary },
  });
  let frameId = viewer.data?.frameId as string | undefined;
  if (frameId && b.nodes[frameId]?.type === 'frame') {
    b.updateNodeRaw(id, { data: { ...(b.nodes[id]?.data ?? {}), frameId } });
    fitFrameToChildren(frameId);
  } else {
    const PAD = 28;
    frameId = newId('frame');
    const x1 = Math.round(Math.min(vb.x, x) - PAD);
    const y1 = Math.round(vb.y - PAD);
    const x2 = Math.round(Math.max(vb.x + vb.w, x + W) + PAD);
    const y2 = Math.round(y + H + PAD);
    b.addNodeRaw({ id: frameId, type: 'frame', x: x1, y: y1, w: x2 - x1, h: y2 - y1, data: { title: '웹 자료' } });
    const tag = (nid: string) => {
      const n = useBoardStore.getState().nodes[nid];
      if (n) useBoardStore.getState().updateNodeRaw(nid, { data: { ...(n.data ?? {}), frameId } });
    };
    tag(viewerId);
    tag(id);
  }
  recordSpawnedNodes([id], '웹 자료 추가');
  return id;
}

/** 프롬프트바 웹링크 추천 → 선택한 링크들을 한 장의 웹 자료 카드로 뷰포트 중앙에 배치. */
export function placeWebLinksOnBoard(
  links: Array<{ title: string; url: string; domain: string; thumb?: string; embeddable?: boolean }>,
): string | null {
  if (links.length === 0) return null;
  const b = useBoardStore.getState();
  const c = viewportCenterBoardPoint();
  const W = 360;
  const id = newId('sticky');
  const thumbs: SourceThumb[] = links
    .filter((l) => l.thumb)
    .map((l) => ({ thumb: l.thumb as string, url: l.url, title: l.title, source: l.domain, embeddable: l.embeddable }));
  b.addNodeRaw({
    id, type: 'sticky', x: Math.round(c.x - W / 2), y: Math.round(c.y - 120), w: W, h: 240, autoH: true, color: 'surface-2',
    data: {
      role: 'source',
      links: links.map((l) => ({ title: l.title, url: l.url, domain: l.domain, ...(l.thumb ? { thumb: l.thumb } : {}), embeddable: l.embeddable === true })),
      ...(thumbs.length ? { thumbs } : {}),
      summary: '보관함에서 가져온 웹 자료입니다.',
    },
  });
  recordSpawnedNodes([id], '웹 자료 배치');
  b.setSelection([id]);
  return id;
}

/** 링크 미리보기 — 서버 언퍼를 엔드포인트(/api/unfurl)로 리다이렉트를 따라가
    실제 URL·제목·og:image를 받아온다. 실패하면 null(파비콘 폴백). */
async function unfurlLink(url: string): Promise<{ url: string; thumb?: string; title?: string; embeddable?: boolean } | null> {
  try {
    const r = await fetch(`/api/unfurl?url=${encodeURIComponent(url)}`);
    const j = (await r.json()) as { ok?: boolean; url?: string; thumb?: string; title?: string; embeddable?: boolean };
    return j?.ok ? { url: j.url || url, thumb: j.thumb, title: j.title, embeddable: j.embeddable } : null;
  } catch {
    return null;
  }
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
      if (p?.type === 'WeeklyPlanGrid' || p?.type === 'WeeklyPlan') return p.props.id;
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
  // 아이디어 리스트 추천 칩 — 선택(또는 자동선택)한 아이디어 기준으로 확장(놀이계획·마인드맵·활동 이미지).
  if (chip.action === 'idea_plan' || chip.action === 'idea_mindmap' || chip.action === 'idea_image') {
    await runIdeaExpansion(frameId, chipId, chip.action);
    return;
  }
  // 활동 이미지 추가(studio.images) + 프레임에 계획안이 있으면 — 일반 갤러리 대신
  // '계획 활동마다 1장씩(최대 5)'을 프레임 오른쪽에 세로로 그린다(활동 정확 분석).
  const hasPlan = Object.values(b.nodes).some(
    (n) => n.data?.frameId === frameId &&
      (n.data?.role === 'plan' || (n.data?.payload as { type?: string } | undefined)?.type === 'WeeklyPlanGrid'),
  );
  if (chip.action === 'studio.images' && hasPlan) {
    try {
      await generateActivityImages(frameId);
      setChipStatus(frameId, chipId, 'done');
    } catch {
      setChipStatus(frameId, chipId, 'idle');
    }
    return;
  }
  // fillRegion이 진행 메시지(say)를 띄우므로 begin/endGen 짝이 필요 — 없으면
  // 마지막 메시지("…그리는 중 (3/3)")가 생성이 끝나도 영원히 남는다.
  b.beginGen();
  try {
    const agent: FillAgent = FILL_AGENTS.has(chip.action) ? (chip.action as FillAgent) : 'memo';
    const topic = chip.prompt?.trim() || topicFor(frameId);
    // ★ 자리 먼저, 생성은 그 자리에서 — 플레이스홀더가 깔리는 즉시 디자인 디렉터가
    //   최종 슬롯으로 정렬한다(기존: 생성 → 문서 위 겹침 → 완료 후 정렬 점프).
    const arrangeEarly = (spawned: string[]) => {
      if (!spawned.length) return;
      const fdata = useBoardStore.getState().nodes[frameId]?.data;
      designComposedFrame(frameId, asLayoutVariant(fdata?.variant));
      fitFrameToChildren(frameId);
    };
    const res = await fillRegion(frameId, agent, topic, buildAgentContext('plan'), planIdOf(frameId), 'story', arrangeEarly);
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
  } finally {
    useBoardStore.getState().endGen(); // 마지막 작업일 때만 메시지가 사라진다
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
    // 표지는 문서 위 얇은 배너(maxHeight 110)로 깔리므로 가로로 넓은 16:9로 생성 —
    // object-cover 크롭에서 잘려나가는 면적을 최소화한다.
    const img = await callGateway({
      task: 'image',
      provider: 'auto',
      messages: [],
      meta: {
        prompt: `${topic} 표지 일러스트, 가로로 넓은 와이드 배너 구도(위아래 여백 없이 가로 파노라마), 글자 없음 — ${KV_ART_STYLE}`,
        caption: topic,
        aspectRatio: '16:9',
      },
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

/* 아동 행동 상담 — 교사가 아이의 이상/걱정 행동을 질문하면(예: "아이가 먹지 않고
   앉아만 있어 어떻게 하면 좋을까?") 기본형 문서에 전문 상담 답변을 생성한다.
   유아 발달·아동심리 관점으로 상태를 해석하고, 교실/가정 지원 방안과 관찰 기록
   가이드를 담아 — 학부모 상담·기록·조기 대처에 바로 쓰는 문서로. 진단이 아니라
   관찰 기반 참고 자료임을 명시한다(무근거 단정 금지). */
const CONSULT_SYSTEM =
  '너는 유아교육 현장의 교사를 돕는 아동 행동 상담 전문가다. 유아 발달심리학(예: 에릭슨 심리사회 발달, 애착이론, 기질, 자기조절 발달)과 아동·보육 현장 지식에 근거해, 교사가 묘사한 아이 행동을 해석하고 실행 가능한 지원 방안을 제시한다. ' +
  '원칙: (1) 진단하지 말 것 — 가능한 해석을 "~일 수 있어요"처럼 가설로 제시한다. (2) 교사가 말하지 않은 사실을 지어내지 말 것 — 더 확인이 필요한 부분은 관찰 항목으로 돌린다. (3) 따뜻하고 전문적인 어조. (4) 마크다운만 출력(코드펜스·머리말 금지).\n' +
  '아래 구조로 작성하라(섹션 제목 그대로 사용):\n' +
  '# (행동을 요약한 제목)\n' +
  '## 관찰된 행동\n교사가 말한 내용을 객관적 행동 서술로 1~3줄.\n' +
  '## 발달·심리학적 해석\n가능한 원인을 발달·정서·기질·환경 관점에서 2~4가지, 각 "~일 수 있어요" 가설로(가능하면 이론·개념 이름을 가볍게 근거로). 글머리표.\n' +
  '## 교실에서의 지원 방안\n바로 적용 가능한 단계별 전략 3~5가지(글머리표, 구체적 지침).\n' +
  '## 가정 연계 · 학부모 상담 포인트\n학부모와 나눌 대화 포인트·가정 제안을 "> " 인용 블록(콜아웃)으로.\n' +
  '## 더 관찰·기록할 점\n판단을 정교화할 관찰·기록 항목 3~5가지(빈도·상황·맥락, 글머리표).\n' +
  '## 전문가 의뢰를 고려할 신호\n지속·심화 시 전문기관 연계를 고려할 신호 2~3가지(글머리표).\n' +
  '마지막 줄에 "> ⚠️ 이 자료는 진단이 아니라 관찰에 근거한 참고용이며, 지속적 관찰과 전문가 협의가 필요해요." 콜아웃. 핵심 낱말은 **굵게**. 700~1100자.';

export async function consultBehavior(text: string): Promise<void> {
  const b = useBoardStore.getState();
  // 기존 콘텐츠와 겹치지 않는 자리 — 오른쪽 옆, 가장 위 콘텐츠와 상단을 맞춘 빈자리에
  // 놓는다(막혔으면 그 아래/다음 열). 카메라가 이 자리를 화면 상단 중앙으로 잡아 준다.
  const spot = openDocSpot(DOC_WIDTH, 760);
  const docX = spot.x;
  const docY = spot.y;
  const id = newId('sticky');
  b.addNodeRaw({
    id, type: 'sticky',
    x: docX, y: docY, w: DOC_WIDTH, h: 300, autoH: true,
    text: '🧑‍⚕️ 아동 행동을 분석하고 상담 자료를 정리하고 있어요…', color: 'paper',
    data: { doc: true, role: 'record', loadingDoc: true, sourcePrompt: text },
  });
  b.setSelection([id]);
  b.beginGen();
  b.setGenerating('🧑‍⚕️ 발달·심리 관점으로 아이 행동을 살펴보고 있어요…');

  // 실사이즈(zoom 1)로 — 문서를 캔버스 가로 중앙·상단(상단 툴바 아래)에서 시작하게 팬.
  // 진행 중이던 부드러운 팬이 카메라를 끌고 가지 않도록 먼저 중단한다.
  cancelPanAnimation();
  const railW = 64;
  const cw = Math.max(320, (typeof window !== 'undefined' ? window.innerWidth : 1200) - railW);
  const TOP = 84; // 문서 상단의 화면 y(상단 툴바 아래)
  b.setViewport({ zoom: 1, panX: Math.round(cw / 2 - (docX + DOC_WIDTH / 2)), panY: Math.round(TOP - docY) });

  // 놀이계획처럼 — 문서 맨 위부터 글이 흘러내리도록 스트리밍(80ms 스로틀). 첫 토큰이
  // 오면 로딩 플레이스홀더를 지우고 그 자리에 실제 글을 써 내려간다. 정지 버튼 지원.
  // 내용이 화면(프롬프트바 위)보다 길어지면 '쓰는 곳'을 따라 카메라가 아래로 이동해
  // 교사가 실사이즈 글씨로 끝까지 읽을 수 있게 한다(채팅 자동 스크롤처럼).
  const signal = genSignal();
  let draft = '';
  let started = false;
  let flushTimer: number | undefined;
  const BOTTOM_GUARD = 150; // 프롬프트바 위 여유 — 쓰는 줄이 이 선 위에 머문다
  const followStream = () => {
    const st = useBoardStore.getState();
    const d = st.nodes[id];
    if (!d) return;
    const rh = Math.max(typeof d.data?.renderH === 'number' ? (d.data.renderH as number) : 0, d.h);
    const { zoom, panY } = st.viewport;
    const ch = Math.max(320, typeof window !== 'undefined' ? window.innerHeight : 800);
    const bottomOnScreen = (d.y + rh) * zoom + panY;
    const limit = ch - BOTTOM_GUARD;
    if (bottomOnScreen > limit) st.setViewport({ panY: Math.round(panY - (bottomOnScreen - limit)) }); // 아래로만 따라간다
  };
  // 카메라 추적은 rAF 루프로 — renderH(실제 높이)는 ResizeObserver가 한 프레임 늦게
  // 갱신하므로, flush 때 한 번만 보지 말고 매 프레임 확인해 갱신 즉시 따라간다.
  let following = true;
  const followLoop = () => {
    if (!following) return;
    followStream();
    requestAnimationFrame(followLoop);
  };
  requestAnimationFrame(followLoop);
  const flush = () => {
    if (useBoardStore.getState().nodes[id]) {
      const cur = useBoardStore.getState().nodes[id];
      useBoardStore.getState().updateNodeRaw(id, { text: draft, data: { ...(cur?.data ?? {}), loadingDoc: false } });
    }
  };
  try {
    await streamChat([{ role: 'user', content: `다음은 교사가 관찰한 아이 행동에 대한 질문이야:\n"${text}"\n\n전문 상담 문서를 작성해줘.` }], {
      system: CONSULT_SYSTEM,
      signal,
      onDelta: (t) => {
        draft += t;
        started = true;
        if (flushTimer === undefined) {
          flushTimer = window.setTimeout(() => { flushTimer = undefined; flush(); }, 80);
        }
      },
    });
  } catch {
    /* 스트림 실패/중단 — 아래에서 마무리 */
  }
  if (flushTimer !== undefined) { clearTimeout(flushTimer); flushTimer = undefined; }
  if (!started || !draft.trim()) {
    failPlaceholderDoc(id, '상담 자료 생성에 실패했어요. 다시 시도해 주세요.');
  } else {
    flush();
  }
  // 마지막 줄까지 따라가도록 — 최종 renderH가 ResizeObserver로 반영될 시간을 준 뒤 추적 종료.
  await new Promise((r) => setTimeout(r, 700));
  following = false;
  useBoardStore.getState().endGen();
  recordSpawnedNodes([id], '아동 행동 상담');
}

// ⏸️ [보류/구버전] 확장 활동의 옛 '보드-누수' 방식 — 결과를 MyBoard sticky로 빼고 전역 카메라 이동(stretch-canvas 이슈로 제거됨).
//    노드 내부 레인 방식(authoring/extendLane.ts extendActivityInNode + resolver/extend.ts resolverExtend)으로 대체됨.
//    현재 호출부 0(의도적 보류). 참조용 보존 — 부활 시 내부 레인 방식 권장, 이 보드-누수 방식은 쓰지 말 것. 삭제 금지(2026-06-29).
const EXTEND_SYSTEM =
  '너는 유아 교사를 돕는 계획 에이전트다. 방금 아이들이 한 인터랙티브 놀이의 주제를 이어받아, 교실에서 바로 이어 할 수 있는 "확장 활동" 한 장을 만든다. ' +
  '마크다운으로 작성: "## ✨ 확장 활동" 제목 + 한 줄 소개 + "### 이야기 나누기"(발문 3~4개 글머리표) + "### 함께 해보기"(몸·미술·자연 등 2~3가지, 각 한 줄) + "### 가정 연계"(1~2줄, "> " 콜아웃). ' +
  '누리과정 영역을 가볍게 곁들여도 좋다. 아이 눈높이의 따뜻한 한국어, 350~600자. 사실을 지어내지 말고 주제에 충실히.';

/** 인터랙티브 놀이 '확장 활동' — 게임 카드 오른쪽(없으면 빈 자리)에 교사용 활동 문서 카드를
    만들고 주제 기반으로 내용을 생성한 뒤 카메라를 그쪽으로 옮긴다(보드가 오른쪽으로 확장). */
export async function extendInteractiveActivity(title: string, anchorNodeId?: string): Promise<void> {
  const b = useBoardStore.getState();
  const anchor = anchorNodeId ? b.nodes[anchorNodeId] : undefined;
  let docX: number;
  let docY: number;
  if (anchor) {
    docX = Math.round(anchor.x + anchor.w + 96); // 게임 카드 오른쪽
    docY = Math.round(anchor.y);
  } else {
    const spot = openDocSpot(DOC_WIDTH, 600);
    docX = spot.x;
    docY = spot.y;
  }
  const id = newId('sticky');
  b.addNodeRaw({
    id, type: 'sticky',
    x: docX, y: docY, w: DOC_WIDTH, h: 280, autoH: true,
    text: '✨ 확장 활동을 준비하고 있어요…', color: 'paper',
    data: { doc: true, role: 'plan', loadingDoc: true },
  });
  b.setSelection([id]);
  cancelPanAnimation();
  b.focusNode(id, 1); // 새 카드로 카메라 이동(보드가 오른쪽으로 확장된 것처럼)
  b.beginGen();
  b.setGenerating('✨ 확장 활동을 만들고 있어요…');
  let text = '';
  try {
    const res = await callGateway({
      task: 'plan', tier: 'mid', provider: 'auto', fallback: ['high'],
      system: EXTEND_SYSTEM,
      messages: [{ role: 'user', content: `방금 아이들이 한 인터랙티브 놀이 제목: "${title}".\n이 놀이를 마친 뒤 교실에서 이어서 할 확장 활동 한 장을 만들어줘.` }],
      meta: { kind: 'interactive_extend' },
      maxTokens: 1200,
    });
    if (res.ok && !res.mocked && res.text) text = res.text.trim();
  } catch {
    /* 아래에서 폴백 메시지 */
  }
  const cur = useBoardStore.getState().nodes[id];
  if (cur) {
    b.updateNodeRaw(id, {
      text: text || '확장 활동 생성에 실패했어요(AI 키 설정이 필요할 수 있어요). 다시 시도해 주세요.',
      data: { ...(cur.data ?? {}), loadingDoc: false },
    });
  }
  b.endGen();
  recordSpawnedNodes([id], '확장 활동');
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
