import { useBoardStore, type BoardNode } from '@/store/boardStore';
import { generateIntoFrame, regenImageCard, genTextCard, viewportCenterBoardPoint, searchVideosForViewer, activityTextForVideo } from './workflow';
import { parseEmptyPrimitiveRequest } from './primitives';
import { addPrimitivesRowCmd } from './commands';
import { composeFromPrompt, decorateDocCard, redesignFrame, worksheetFromNode, planFromNode } from './composer';
import { usePromptChoiceStore, type ReqIntent, type SelKind } from '@/store/promptChoiceStore';
import {
  contentIntentFast,
  boardOp,
  coreTopic,
  WORKSHEET_RE,
  PLAN_RE,
  VIDEO_RE,
  DESIGN_CMD_RE,
  DECORATE_RE,
  type ContentIntent,
} from '@/ai/intent-lexicon';
import { runBoardOp } from './actions';
import { runRouter } from '@/ai/agents/router';
import { PAGE_ACTIONS } from '@/ai/actions';
import { buildAgentContext } from '@/ai/context';
import type { RouteTarget } from '@/ai/contract';

/** Map the lexicon's rich intent onto the popup's ReqIntent vocabulary.
    coloring is generated through the image path (도안 스타일은 프롬프트에 실림);
    mindmap/record don't apply "onto a selection" — treated as text until the
    router fallback (P1-4) refines them. */
function toReqIntent(ci: ContentIntent | null): ReqIntent {
  switch (ci) {
    case 'worksheet': return 'worksheet';
    case 'plan': return 'plan';
    case 'letter': return 'letter';
    case 'image':
    case 'coloring': return 'image';
    default: return 'text';
  }
}

function openMismatch(sel: BoardNode[], text: string, intent: ReqIntent, selKind: SelKind): void {
  usePromptChoiceStore.getState().open({ ids: sel.map((n) => n.id), text, intent, selKind });
}

/** 프롬프트 안에 든 미디어 링크/주소를 뽑는다(매직 뷰어에 바로 로드용). 없으면 null.
    http(s) URL · 프로토콜 없는 youtube/youtu.be · 맨 11자 유튜브 영상 ID를 인식. */
function extractMediaLink(text: string): string | null {
  const url = text.match(/https?:\/\/\S+/i);
  if (url) return url[0];
  const yt = text.match(/(?:youtu\.be\/[\w-]{11}|(?:www\.)?youtube\.com\/\S+)/i);
  if (yt) return yt[0];
  const t = text.trim();
  if (/^[\w-]{11}$/.test(t)) return t; // 영상 ID만 붙여넣은 경우
  return null;
}

/* Prompt-in-place on My Board: a board prompt ALWAYS acts on the board (never
   navigates to chat).
   - nothing selected → Frame Composer: classify → seed a frame → fill it
   - selection matches the request → act on it in place:
       image card(s)  + image/style → regenerate each
       memo/text(s)   + text        → (re)write each
       doc + 꾸미기      → parent newsletter
       idea/branch + 활동지/계획안   → connected doc
       frame          → generate into it / redesign
   - selection does NOT match the request (e.g. images + "활동지", a shape, or a
     mixed selection) → raise the disambiguation popup (promptChoiceStore) so the
     teacher chooses: 그 자리에 생성 / 성격 바꿔 생성 / 새 프레임.
   Returns true (handled on the board). */
export function handleBoardPrompt(text: string): boolean {
  const b = useBoardStore.getState();
  const sel = b.selection.map((id) => b.nodes[id]).filter(Boolean);

  // 주제 없는 "요소 N개 추가" → 빈 툴바 요소를 가로로 배치(AI 생성 안 함).
  // 선택 유무와 무관하게 가장 먼저 처리 — "이미지 카드 3개 추가해줘"는 항상 빈 카드.
  const prim = parseEmptyPrimitiveRequest(text);
  if (prim) {
    const c = viewportCenterBoardPoint();
    addPrimitivesRowCmd(prim.type, prim.count, c.x, c.y);
    return true;
  }

  // Nothing selected → Frame Composer (a new frame is the right behavior here).
  if (sel.length === 0) {
    void composeFromPrompt(text);
    return true;
  }

  // 영상 뷰어(유튜브·매직 뷰어)가 선택된 채 프롬프트:
  //   · 링크/주소를 입력하면(유튜브·동영상·GLB) 그 뷰어에 바로 로드(매직 뷰어가 인식).
  //   · 그 외 검색어면 유튜브에서 찾아 썸네일 3개를 뷰어 아래에(▶ = 뷰어에서 재생).
  const videoViewer =
    sel.length === 1 &&
    sel[0].type === 'sticky' &&
    /youtube-viewer|magic-viewer/.test(String(sel[0].data?.embed ?? ''))
      ? sel[0]
      : null;
  if (videoViewer) {
    const link = extractMediaLink(text);
    if (link) {
      window.dispatchEvent(new CustomEvent('kv:yt-play', { detail: { videoId: link, target: videoViewer.id } }));
    } else {
      void searchVideosForViewer(videoViewer.id, text);
    }
    return true;
  }

  // 동영상 플레이어가 선택된 채 프롬프트:
  //   · 미디어 링크 → 그 뷰어에 바로 로드(직접 영상 URL 재생).
  //   · 보드 조작 지시(크게/정렬…)가 아니면 → 텍스트→비디오 생성(확인 게이트).
  const videoPlayer =
    sel.length === 1 && sel[0].type === 'sticky' && /video-player/.test(String(sel[0].data?.embed ?? ''))
      ? sel[0]
      : null;
  if (videoPlayer) {
    const link = extractMediaLink(text);
    if (link) {
      window.dispatchEvent(new CustomEvent('kv:yt-play', { detail: { videoId: link, target: videoPlayer.id } }));
      return true;
    }
    const vop = boardOp(text);
    const vgen = /만들|생성|그려|작성|써\s*줘|추가|넣어/.test(text);
    if (!(vop && !vgen)) {
      window.dispatchEvent(
        new CustomEvent('kv:video-confirm', {
          detail: { mode: 'text', viewerId: videoPlayer.id, anchorId: videoPlayer.id, request: text, topic: coreTopic(text) },
        }),
      );
      return true;
    }
    // 순수 보드 조작 → 아래 공통 처리로 폴백
  }

  // 단일 카드 선택 + "영상 만들어줘" → 옆에 동영상 뷰어를 깔고 생성(확인 게이트).
  //   · 이미지 카드 → 이미지→비디오(그 이미지가 첫 프레임)
  //   · 계획/텍스트 카드(또는 계획을 담은 프레임) → 활동 내용 기반 텍스트→비디오
  if (sel.length === 1 && VIDEO_RE.test(text)) {
    const card = sel[0];
    if (card.type === 'image' && card.src) {
      const topic = (card.text ?? '').trim() || String(card.data?.title ?? '').trim() || coreTopic(text);
      window.dispatchEvent(
        new CustomEvent('kv:video-confirm', {
          detail: { mode: 'image', spawnNear: card.id, anchorId: card.id, request: topic, imageSrc: card.src, topic },
        }),
      );
      return true;
    }
    const activity = activityTextForVideo(card.id) || (card.text ?? '').trim();
    if (activity) {
      // 표시용 주제는 짧게(문서 제목/H1) — 본문 활동 텍스트는 request로 그대로 전달된다.
      const topic =
        String(card.data?.title ?? '').trim() ||
        (card.text ?? '').split('\n')[0].replace(/^#+\s*/, '').trim().slice(0, 28) ||
        '활동';
      window.dispatchEvent(
        new CustomEvent('kv:video-confirm', {
          detail: { mode: 'plan', spawnNear: card.id, anchorId: card.id, request: activity, topic },
        }),
      );
      return true;
    }
    // 사용할 내용이 없으면 아래 일반 처리로 폴백
  }

  const fast = contentIntentFast(text);
  const intent = toReqIntent(fast);

  // ── specialized single-target cases (unchanged) ──
  // Single document card + a "decorate / share with parents" prompt → newsletter.
  if (sel.length === 1 && sel[0].type === 'sticky' && sel[0].data?.doc && DECORATE_RE.test(text)) {
    void decorateDocCard(sel[0].id, text);
    return true;
  }
  // Idea / mind-map branch (primary selection) + "활동지/계획안 만들기" → connected doc.
  const primary = sel[0];
  const isActivityCard =
    primary && primary.type === 'sticky' && (primary.data?.role === 'mm-branch' || primary.data?.role === 'idea');
  if (isActivityCard && WORKSHEET_RE.test(text)) {
    void worksheetFromNode(primary.id);
    return true;
  }
  if (isActivityCard && PLAN_RE.test(text)) {
    void planFromNode(primary.id);
    return true;
  }

  // A frame is selected → generate into it (or redesign on a design command).
  const frame = sel.find((n) => n.type === 'frame');
  if (frame) {
    if (frame.data?.composer && DESIGN_CMD_RE.test(text)) void redesignFrame(frame.id, text);
    else void generateIntoFrame(frame.id, text);
    return true;
  }

  // ── 화면 조작 지시(P2): "크게/왼쪽으로/정렬/지워/복사/노란색으로" ──
  // 생성 동사(만들/그려/써…)가 함께 있으면 콘텐츠 요청으로 본다
  // ("크게 그려줘" = 큰 그림 생성, "크게 해줘" = 크기 조절).
  const op = boardOp(text);
  const generative = /만들|생성|그려|작성|써\s*줘|추가|넣어/.test(text);
  if (op && !generative) {
    const done = runBoardOp(sel.map((n) => n.id), op);
    if (done) return true; // 실행 불가 시(대상 없음) 아래 콘텐츠 분기로 폴백
  }

  // ── 사전(fast-path) 미스 → Tier-0 라우터 폴백(P1-4) ──
  // 이전에는 미스가 곧 'text'로 간주되어 선택 카드를 조용히 덮어썼다. 이제
  // 모델에게 의도를 묻고, 모델도 모호하면 기존 'text' 휴리스틱으로 폴백한다.
  if (fast === null) {
    void routeSelectionFallback(sel, text);
    return true;
  }

  applyContentIntent(sel, text, intent);
  return true;
}

/** Homogeneous-selection content application: match → act in place; mismatch → popup. */
function applyContentIntent(sel: BoardNode[], text: string, intent: ReqIntent): void {
  const allImages = sel.every((n) => n.type === 'image');
  const allTextLike = sel.every((n) => n.type === 'sticky' || n.type === 'text');

  if (allImages) {
    // image card(s) + an image or generic-style request → regenerate EACH in place.
    if (intent === 'image' || intent === 'text') {
      sel.forEach((n) => void regenImageCard(n.id, text));
      return;
    }
    openMismatch(sel, text, intent, 'image'); // images + a doc request → ask
    return;
  }
  if (allTextLike) {
    // memo/text card(s) + a text request → (re)write EACH in place.
    if (intent === 'text') {
      sel.forEach((n) => void genTextCard(n.id, text));
      return;
    }
    openMismatch(sel, text, intent, 'text'); // memos + an image/doc request → ask
    return;
  }
  // Mixed types / shapes / anything else with a selection → popup.
  openMismatch(sel, text, intent, 'mixed');
}

const CI_SET = new Set<string>([
  'worksheet', 'coloring', 'image', 'plan', 'letter', 'record_story', 'record_observation', 'mindmap',
]);

/** 라우터 route_to → 선택 적용용 기본 ReqIntent (intent 어휘가 비표준일 때). */
function routeDefault(route: RouteTarget | null): ReqIntent {
  switch (route) {
    case 'studio': return 'image';
    case 'plan': return 'plan';
    case 'writing': return 'letter';
    default: return 'text';
  }
}

/** 사전이 못 알아들은 선택+프롬프트 → Tier-0 라우터(선택 컨텍스트 포함)로 의도
    분류 후 동일 적용 경로 재사용. 라우터마저 모호하면 'text'(제자리 수정) 폴백 —
    "겨울 느낌으로" 같은 스타일 지시의 기존 동작을 보존한다. */
async function routeSelectionFallback(sel: BoardNode[], text: string): Promise<void> {
  useBoardStore.getState().beginGen();
  useBoardStore.getState().setGenerating('🧭 요청을 파악하고 있어요…');
  let intent: ReqIntent = 'text';
  let boardIntent: string | null = null;
  try {
    const selTypes = [...new Set(sel.map((n) => String((n.data?.role as string) ?? n.type)))];
    const res = await runRouter(
      {
        text,
        page: '/board',
        selection: { ids: sel.map((n) => n.id), types: selTypes, count: sel.length },
        available_actions: PAGE_ACTIONS['/board'],
      },
      buildAgentContext('router'),
    );
    const out = res.output;
    if (out.intent?.startsWith('board.')) {
      boardIntent = out.intent.slice('board.'.length);
    } else if (CI_SET.has(out.intent)) {
      intent = toReqIntent(out.intent as ContentIntent);
    } else if (out.route_to && out.confidence >= 0.7) {
      intent = routeDefault(out.route_to);
    }
  } catch {
    intent = 'text'; // 라우터 실패 → 기존 휴리스틱 보존
  } finally {
    useBoardStore.getState().endGen();
  }

  // 모델이 화면 조작으로 판단(어휘에 없던 표현, 예: "요만하게 해줘") → 실행기로.
  if (boardIntent) {
    const done = runBoardOp(sel.map((n) => n.id), { op: boardIntent as never });
    if (done) return;
  }
  applyContentIntent(sel, text, intent);
}
