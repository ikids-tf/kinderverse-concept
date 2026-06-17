import { useBoardStore, type BoardNode } from '@/store/boardStore';
import { generateIntoFrame, regenImageCard, genTextCard, viewportCenterBoardPoint, searchVideosForViewer, activityTextForVideo, spawnVideoPlayer, slideFrameToEmpty, generateActivityImages, removeBgFromNode } from './workflow';
import { parseEmptyPrimitiveRequest } from './primitives';
import { addPrimitivesRowCmd, addPresetNodeCmd, deleteNodesCmd } from './commands';
import { composeFromPrompt, composeCutoutFromPrompt, decorateDocCard, redesignFrame, worksheetFromNode, planFromNode, consultBehavior } from './composer';
import { usePromptChoiceStore, type ReqIntent, type SelKind } from '@/store/promptChoiceStore';
import {
  contentIntentFast,
  boardOp,
  vesselIntent,
  requestedCount,
  coreTopic,
  isBehaviorConsult,
  normalizePlayTheme,
  WORKSHEET_RE,
  PLAN_RE,
  VIDEO_RE,
  DESIGN_CMD_RE,
  DECORATE_RE,
  BG_REMOVE_RE,
  type ContentIntent,
  type VesselMatch,
} from '@/ai/intent-lexicon';
import { runBoardOp } from './actions';
import { generateSlidesForViewer } from './slides';
import { runRouter } from '@/ai/agents/router';
import { PAGE_ACTIONS } from '@/ai/actions';
import { buildAgentContext } from '@/ai/context';
import { showToast } from '@/lib/toast';
import type { RouteTarget } from '@/ai/contract';

/** 입력 정규화(보수적) — 앞뒤 공백·따옴표 정리, 줄 안 공백 축약(줄바꿈은 보존).
    오타·자모분해 교정은 과교정으로 오인식 위험이 있어 넣지 않는다. */
function normalizeInput(text: string): string {
  return normalizePlayTheme(text
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // zero-width 제거
    .replace(/^[“”"'`\s]+|[“”"'`\s]+$/g, '') // 앞뒤 따옴표·공백
    .replace(/[ \t\u00A0]+/g, ' ') // 줄 안 공백(탭·nbsp 포함) 축약
    .replace(/ *\n */g, '\n')); // 줄 경계 공백 정리 + 흔한 놀이 주제 오타 교정(몰놀이→물놀이)
}

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

/** 그릇(메모/노트/텍스트)을 화면 중앙에 즉시 생성하고 남는 말을 초기 내용으로 채운 뒤
    바로 편집(autoEdit) 상태로 둔다. 무료·L1(되돌리기 가능) — '그릇 우선'의 실행부.
    메모/노트는 sticky(노트는 괘선 deco), 텍스트는 text 노드. */
function createVessel(v: VesselMatch): void {
  const c = viewportCenterBoardPoint();
  const label = v.kind === 'note' ? '노트' : v.kind === 'text' ? '텍스트' : '메모';
  let id: string;
  if (v.kind === 'text') {
    const patch: Partial<BoardNode> = { autoH: true, data: { autoEdit: true } };
    if (v.content) patch.text = v.content;
    id = addPresetNodeCmd('text', c.x, c.y, patch, '텍스트 추가');
  } else {
    const patch: Partial<BoardNode> =
      v.kind === 'note'
        ? { color: 'surface-2', w: 220, h: 160, autoH: false, data: { deco: 'note', autoEdit: true } }
        : { data: { autoEdit: true } };
    if (v.content) patch.text = v.content;
    id = addPresetNodeCmd('sticky', c.x, c.y, patch, v.kind === 'note' ? '노트 추가' : '메모 추가');
  }
  // 회복 UX(P1.5): 방금 만든 그릇을 1탭으로 되돌릴 수 있게 — 오인식이어도 즉시 복구.
  showToast(`${label} 추가`, 'success', 5000, { label: '실행취소', run: () => deleteNodesCmd([id]) });
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
/** "투명/배경 없이 + 생성" 프롬프트에서 배경 관련 표현만 떼어내 깔끔한 생성 주제를 남긴다.
    (이미지 모델은 투명을 못 만드므로 단색 배경에 단일 오브젝트로 생성한 뒤 누끼한다.) */
function stripBgKeywords(text: string): string {
  return text
    .replace(/투명\s*(한)?\s*배경\s*(에다가|에다|에서|위에|으로|에)?/g, ' ')
    .replace(/배경\s*(을|를)?\s*(없이|빼고|제거(하고|해서|한)?|지우고|지운|없는)/g, ' ')
    .replace(/뒷?배경\s*(없이|제거|삭제)/g, ' ')
    .replace(/누끼\s*(로|를|만)?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function handleBoardPrompt(text: string): boolean {
  const b = useBoardStore.getState();
  const sel = b.selection.map((id) => b.nodes[id]).filter(Boolean);

  // 입력 정규화(앞뒤 공백·따옴표, 줄 안 공백) — 다운스트림 매칭이 일관되게.
  text = normalizeInput(text);

  // 의미 없는 요청 어미만 들어오면 무시 — 한글 IME 잔여('줘'·'주세요' 등)가 단독 제출돼
  // 엉뚱한 카드를 만들던 문제 방지(근본 원인은 PromptBar IME-Enter, 여기선 이중 안전장치).
  if (/^(줘|줴|주|주세요|줄래|주라|다오|요|해)$/u.test(text.trim())) return true;

  // 게임 뷰어 카드가 단독 선택돼 있으면 — 보드 프롬프트를 그 카드의 게임 생성으로 보낸다.
  // (게임뷰어 하단바 하이브리드: 임베드 소형 카드는 보드 프롬프트바로 제어. NodeView가 iframe에 전달)
  if (sel.length === 1 && typeof sel[0].data?.embed === 'string' && sel[0].data.embed.includes('game-viewer')) {
    window.dispatchEvent(new CustomEvent('kv:game-create', { detail: { nodeId: sel[0].id, prompt: text } }));
    return true;
  }

  // 배경 제거(누끼) 의도 — 선택된 이미지가 없을 때.
  if (BG_REMOVE_RE.test(text) && !sel.some((n) => n.type === 'image' && n.src)) {
    // "투명 배경으로 ○○ 그려줘"처럼 '생성' 요청이면 → 컷아웃 컴포저로 단색 배경·단일
    // 오브젝트를 생성한 뒤 그 자리에서 배경 제거(투명 PNG 한 장)로 한 번에 만든다.
    //  · 생성 동사(그려/만들/생성…)가 있고  · 기존 이미지를 가리키는 말(이 이미지/사진…)이
    //    아니어야 생성으로 본다(후자는 대상 선택 안내).
    const cleaned = stripBgKeywords(text);
    const hasGenVerb = /(그려|그림|만들|만드|생성|제작|그릴|뽑아|꾸며)/.test(cleaned);
    const refsExisting = /(이|그|저|요|현재|선택)\s*(이미지|사진|그림|그거|것)/.test(text);
    if (hasGenVerb && !refsExisting && cleaned.replace(/\s/g, '').length >= 2) {
      showToast('투명 배경 그림을 만들고 있어요', 'success');
      void composeCutoutFromPrompt(cleaned);
      return true;
    }
    // 생성 대상이 없는 순수 '배경 제거' 요청 → 대상 이미지를 먼저 고르라고 안내.
    showToast('배경을 지울 이미지를 먼저 선택해 주세요', 'error');
    return true;
  }

  // 주제 없는 "요소 N개 추가" → 빈 툴바 요소를 가로로 배치(AI 생성 안 함).
  // 선택 유무와 무관하게 가장 먼저 처리 — "이미지 카드 3개 추가해줘"는 항상 빈 카드.
  const prim = parseEmptyPrimitiveRequest(text);
  if (prim) {
    const c = viewportCenterBoardPoint();
    addPrimitivesRowCmd(prim.type, prim.count, c.x, c.y);
    return true;
  }

  // 그릇 우선(메모/노트/텍스트) — 그릇어가 있으면 그 그릇을 만들고 남는 말은 초기 내용으로.
  // "운동회 메모 만들어줘"가 통신문으로 새던 오라우팅을 무료·즉시·L1로 차단(패널 P1a).
  // 보드 조작 지시(지워/크게/정렬…)는 boardOp로 가드해 기존 경로에 맡긴다.
  const vessel = vesselIntent(text);
  if (vessel && !boardOp(text)) {
    createVessel(vessel);
    return true;
  }

  // 그릇 우선(뷰어): "동영상"·"영상"·"비디오"처럼 뷰어 단어만 들어오면(주제·생성동사 없이)
  // 빈 동영상 플레이어를 깔고 "무엇을 할지" 묻는다(영상 생성 / 자료 연결) — 활동 이미지가
  // 엉뚱하게 생성되던 문제 차단(메모와 같은 그릇 우선). 실제 생성은 "○○ 동영상 만들어줘"에서만.
  if (/^(동영상|영상|비디오|클립)(\s*(플레이어|뷰어|보기))?$/.test(text.trim())) {
    const vid = spawnVideoPlayer();
    useBoardStore.getState().focusNode(vid);
    slideFrameToEmpty(vid); // 다른 요소와 겹치지 않게 가장 가까운 오른쪽 빈자리로(컴포저와 동일)
    window.dispatchEvent(new CustomEvent('kv:viewer-ask', { detail: { viewerId: vid } }));
    return true;
  }

  // 동영상 생성 요청은 선택이 없어도 '동영상'으로 만든다 — 컴포저(이미지/문서)로 새지 않게.
  // 화면 중앙에 동영상 뷰어를 깔고 카메라를 맞춘 뒤(교사에게 보이게) 텍스트→비디오(확인 게이트).
  if (sel.length === 0 && VIDEO_RE.test(text)) {
    const vid = spawnVideoPlayer();
    useBoardStore.getState().focusNode(vid);
    slideFrameToEmpty(vid); // 생성 동영상도 다른 요소와 겹치지 않게 오른쪽 빈자리로
    window.dispatchEvent(
      new CustomEvent('kv:video-confirm', {
        detail: { mode: 'text', viewerId: vid, anchorId: vid, request: text, topic: coreTopic(text) },
      }),
    );
    return true;
  }

  // Nothing selected → Frame Composer (a new frame is the right behavior here).
  if (sel.length === 0) {
    // 안전한 폴백: 선택이 필요한 보드 조작(지워/크게/정렬/이동…)인데 대상이 없으면
    // 빈 문서를 만들지 말고 무엇을 고를지 안내만 한다("이 메모 지워줘"가 문서로 새던 문제).
    // 아동 행동 상담 질문("아이가 안 먹고 앉아만 있어 어떻게 하면 좋을까?") → 요소 선택을
    // 요구하지 말고 기본형 문서에 발달·심리 기반 전문 상담 답변을 생성한다.
    // boardOp 가드보다 먼저 — 상담 문장에 '크게 운다'처럼 조작어가 섞여도 상담이 우선.
    if (isBehaviorConsult(text)) {
      void consultBehavior(text);
      return true;
    }
    const noTargetOp = boardOp(text);
    const wantsGen = /만들|생성|그려|작성|써\s*줘|추가|넣어/.test(text);
    if (noTargetOp && !wantsGen) {
      showToast('먼저 적용할 요소를 선택해 주세요', 'error');
      return true;
    }
    // 비용 안전망(P1.5): 다개수 이미지 생성은 과금이 곱으로 늘어 사전 확인(정성적 경고).
    //   단일 이미지·계획·통신문 등은 즉시 — 빠른 워크플로를 해치지 않게 '돈 곱연산'만 게이트.
    const ci0 = contentIntentFast(text);
    const cnt0 = requestedCount(text) ?? 1;
    if ((ci0 === 'image' || ci0 === 'coloring') && cnt0 >= 2) {
      window.dispatchEvent(
        new CustomEvent('kv:gen-confirm', { detail: { count: cnt0, run: () => void composeFromPrompt(text) } }),
      );
      return true;
    }
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

  // 슬라이드 뷰어가 선택된 채 프롬프트: 한 줄 요청 → 장표 에이전트가 DeckSpec 생성 → 뷰어에 로드.
  //   · 순수 보드 조작(크게/정렬/지워…)이면 아래 공통 처리로 폴백.
  //   · 그 외(주제·생성 요청)는 모두 슬라이드 생성으로 — "봄 나비 관찰 수업"만 입력해도 만든다.
  const slidesViewer =
    sel.length === 1 && sel[0].type === 'sticky' && /slides-viewer/.test(String(sel[0].data?.embed ?? ''))
      ? sel[0]
      : null;
  if (slidesViewer) {
    const sop = boardOp(text);
    const sgen = /만들|생성|그려|작성|써\s*줘|추가|넣어|짜\s*줘|구성|기획/.test(text);
    if (!(sop && !sgen)) {
      void generateSlidesForViewer(slidesViewer.id, text);
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

  // 이미지 선택 + "배경 제거/누끼/투명 배경" → 공용 엔진으로 누끼 → 갤러리 저장.
  // 일반 이미지 재생성(applyContentIntent)보다 먼저 — "배경"이 스타일 지시로 새는 것 방지.
  // 선택에 이미지가 하나라도 있으면 그 이미지들에 적용(혼합 선택도 허용).
  const bgTargets = sel.filter((n) => n.type === 'image' && n.src);
  if (bgTargets.length > 0 && BG_REMOVE_RE.test(text)) {
    bgTargets.forEach((n) => void removeBgFromNode(n.id));
    return true;
  }

  const fast = contentIntentFast(text);
  const intent = toReqIntent(fast);

  // 계획안(또는 계획을 담은 프레임) 선택 + '활동 이미지' 요청 → 계획 활동마다 1장씩
  // (최대 5·최소 1) 그 활동을 하는 유아 모습을 프레임 오른쪽에 세로로 그린다.
  // 일반 이미지 생성/프레임 채우기로 새지 않도록 프레임 분기보다 먼저 처리한다.
  const planish = (n: BoardNode) =>
    n.data?.role === 'plan' || (n.data?.payload as { type?: string } | undefined)?.type === 'WeeklyPlanGrid';
  const wantsActivityImg = fast === 'image' || fast === 'coloring' || /활동\s*(이미지|그림|사진)/.test(text);
  if (sel.length === 1 && wantsActivityImg) {
    const n = sel[0];
    const isPlanSel =
      planish(n) ||
      (n.type === 'frame' && Object.values(b.nodes).some((k) => k.data?.frameId === n.id && planish(k)));
    if (isPlanSel) {
      void generateActivityImages(n.id);
      return true;
    }
  }

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
