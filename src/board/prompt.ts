import { useBoardStore, newId, type BoardNode } from '@/store/boardStore';
import { useInteractiveStore } from '@/features/interactive-viewer/store/interactiveStore';
import { applyInteractivePrompt } from '@/features/interactive-viewer/authoring/applyPrompt';
import { runFullCreation, cleanGameTopic } from '@/features/interactive-viewer/authoring/createChain';
import { buildTeacherCard, ensurePrompts } from '@/features/interactive-viewer/resolver/teacherCard';
import { saveToLibrary } from '@/features/interactive-viewer/store/library';
import { saveGameCard } from '@/features/interactive-viewer/store/gameCards';
import { generateIntoFrame, regenImageCard, genTextCard, viewportCenterBoardPoint, searchVideosForViewer, activityTextForVideo, spawnVideoPlayer, spawnSlidesViewer, slideFrameToEmpty, generateActivityImages, removeBgFromNode, generateStyledSeriesFromImage } from './workflow';
import { urlToAssetRef, makeImageElement, makeTextElement, withElementAdded } from '@/features/interactive-viewer/runtime/assetIngest';
import { ASSET_KINDS, type AssetKind } from '@/shared/assetKind';
import { parseEmptyPrimitiveRequest } from './primitives';
import { addPrimitivesRowCmd, addPresetNodeCmd, deleteNodesCmd } from './commands';
import { composeFromPrompt, composeCutoutFromPrompt, decorateDocCard, redesignFrame, worksheetFromNode, planFromNode, consultBehavior, generateIdeaList, generateTopicWeb, buildPlayPackage } from './composer';
import { useFormatChoiceStore, type FormatMode, type FormatChoice, type LessonKind } from '@/store/formatChoiceStore';
import { usePromptChoiceStore, type ReqIntent, type SelKind } from '@/store/promptChoiceStore';
import { useUIStore } from '@/store/uiStore';
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
  MINDMAP_RE,
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

/** "이 스타일로 여러 대상을 '각각/다른 카드'로 그려줘" — 선택 이미지를 화풍 참조로 시리즈 생성하는 신호. */
const STYLE_SERIES_RE = /각각|여러\s*가지|여러\s*개|여러\s*장|다른\s*(이미지\s*)?카드|새\s*(이미지\s*)?카드|별도\s*(의)?\s*카드|각\s*카드/;

/** "이 이미지(들)로 ○○ 게임 만들어줘" — 선택 이미지를 게임 뷰어 시드로 보내는 신호.
    게임/놀이/퀴즈/마음알기 어휘 + 생성 동사가 함께 있어야 게임 생성으로 본다(스타일 재생성과 구분). */
const GAME_WORD_RE = /게임|놀이|퀴즈|마음\s*알기|맞추기|맞히기|마음\s*읽기/;
const GAME_GEN_RE = /만들|만드|생성|제작|구성|꾸며|짜\s*줘|짜\b/;

/** "○○ 게임/퀴즈 만들어줘"(선택·이미지 없이) → 보드에 인터랙티브 노드를 만들고 전체 구성.
    강한 신호(게임/퀴즈/인터랙티브)는 단독으로, 약한 신호(맞추기/마음알기)는 활동지·계획·도안이
    아닐 때만 인터랙티브 게임으로 본다(활동지/도안 요청을 가로채지 않게). */
const STRONG_GAME_RE = /게임|퀴즈|인터랙티브|인터렉티브/;
const SOFT_GAME_RE = /맞추기|맞히기|마음\s*알기|마음\s*읽기/;
function isNewInteractiveGame(text: string): boolean {
  if (!GAME_GEN_RE.test(text)) return false;
  if (STRONG_GAME_RE.test(text)) return true;
  return SOFT_GAME_RE.test(text) && !WORKSHEET_RE.test(text) && !PLAN_RE.test(text) && !/도안|색칠/.test(text);
}

/* cleanGameTopic — 생성 사슬과 함께 createChain.ts 로 이동(진행 표시·교사 카드가 같은 주제어를 쓰도록). */

/* ─── 포맷 선택(아이디어 / 놀이계획·수업) ─── "○○ 아이디어/놀이계획/수업/활동/프로젝트 수업
   만들어줘"는 바로 생성하지 않고 리스트·마인드맵·계획문서·패키지 중 무엇으로 만들지 화면 중앙
   오버레이로 고르게 한다. 단 활동지·이미지·슬라이드 등 '구체적 산출물'이 함께 지정되면
   그 전용 경로로 보낸다(아래 FMT_SPECIFIC_RE 가드). */
const FMT_GEN_RE = /만들|만드|생성|짜\s*줘|구성|기획|추천|뽑아|줘|해\s*줘/;
const FMT_PLAN_RE = /놀이\s*계획|계획안|주간\s*계획|수업\s*계획|일일\s*계획|연간\s*계획|주안|월안|교육\s*계획|프로젝트\s*수업|프로젝트|수업|활동(?!지)/;
const FMT_IDEA_RE = /아이디어|생각\s*그물|브레인\s*스토밍|놀이\s*거리/;
// 더 구체적인 산출물이 지정된 요청은 오버레이로 가로채지 않고 각자 경로로 보낸다
// (예: "수업 슬라이드", "활동 이미지", "활동지", "수업 동영상").
const FMT_SPECIFIC_RE = /슬라이드|장표|이미지|사진|일러스트|삽화|동영상|영상|비디오|클립|활동지|워크시트|도안|색칠|컬러링|통신문|안내문|안내장|공지|편지|소식지|관찰|게임|퀴즈|환경판|게시판|포스터/;
/* 슬라이드(장표·프레젠테이션) 요청 — 선택이 없어도 슬라이드 뷰어를 깔고 장표 에이전트로 생성한다.
   (슬라이드 전용 경로가 없어 "○○ 슬라이드 만들어줘"가 활동지/스튜디오로 새던 오라우팅 차단.) */
const SLIDE_RE = /슬라이드|장표|프레젠테이션|프리젠테이션|피피티|\bppt\b/i;
/* 뷰어 단어만(주제·생성동사 없이) — 빈 슬라이드 뷰어만 깐다(동영상 그릇 우선과 동일). */
const SLIDE_BARE_RE = /^(슬라이드|장표|프레젠테이션|프리젠테이션|피피티|ppt)(\s*(뷰어|보기|만들기))?$/i;
function fmtTopic(text: string): string {
  // coreTopic 은 끝 '이/가'를 조사로 깎아 '물놀이'→'물놀' 식으로 명사를 훼손한다 →
  // 여기선 포맷/주제어/생성동사만 직접 제거해 주제 명사를 보존한다.
  const t = text
    .replace(FMT_PLAN_RE, ' ')
    .replace(FMT_IDEA_RE, ' ')
    .replace(/[을를이가은는]?\s*주제로(\s*한)?|에\s*(대한|관한|대해|관해)|관련(된)?|관한|위한/g, ' ')
    .replace(/활동\s*할\s*수\s*있는|할\s*수\s*있는|해\s*볼\s*만한|할\s*만한/g, ' ')
    .replace(/만들어\s*줘|만들어|만들|만드(라|는)?|생성(해\s*줘|해|하라)?|짜\s*줘|구성(해\s*줘|해)?|기획(해\s*줘|해)?|추천(해\s*줘|해)?|뽑아\s*줘|뽑아|해\s*줘|해\s*주세요|주세요|줘|줄래/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return t || text.trim();
}
// 프로젝트 수업 — 하나의 주제를 1주~한 달 깊이 탐구. 계획 문서가 일반 주간계획과 다르다.
const FMT_PROJECT_RE = /프로젝트\s*수업|프로젝트\s*활동|프로젝트(?!\s*수업)/;
// 특정 계획 하위유형(일/주/월) — 팝업 없이 바로 그 유형 문서로 라우팅한다(composeFromPrompt→detectPlanKind).
// 일반 '놀이계획/계획안'(하위유형 없음)만 포맷 선택 팝업. (사용자 지시: 유형 명시 요청은 직접 생성.)
const SPECIFIC_PLAN_RE = /일안|주안|월안|일간|주간|월간|일일\s*(놀이\s*)?계획|주간\s*(놀이\s*)?계획|월간\s*(놀이\s*)?계획|연간/;
// 아이디어(놀이 아이디어 리스트) — 팝업 없이 바로 생성. 단 '아이디어 맵/주제망/생각그물'은 mindmap 경로.
const IDEA_DIRECT_RE = /아이디어|놀이\s*거리/;
/** 일반 '놀이계획'(하위유형 없음) 요청이면 포맷 선택 오버레이 모드를 돌려준다. 특정 유형(일/주/월안·아이디어)은
    직접 라우팅하므로 null(가로채지 않음). */
function detectFormatChoice(text: string): { mode: FormatMode; topic: string; kind: LessonKind } | null {
  if (!FMT_GEN_RE.test(text)) return null;
  if (FMT_SPECIFIC_RE.test(text)) return null; // 구체적 산출물(활동지·이미지·슬라이드 등)은 전용 경로로
  if (SPECIFIC_PLAN_RE.test(text)) return null; // 일/주/월안 명시 → 직접 생성(팝업 X)
  if (FMT_IDEA_RE.test(text)) return null;       // 아이디어·생각그물·브레인스토밍 → 직접(아이디어 분기/mindmap)
  const kind: LessonKind = FMT_PROJECT_RE.test(text) ? 'project' : 'play';
  if (FMT_PLAN_RE.test(text)) return { mode: 'plan', topic: fmtTopic(text), kind }; // 일반 놀이계획만 팝업
  return null;
}
/** 포맷 선택 오버레이에서 고른 형식으로 생성한다(FormatChoiceOverlay → 여기). */
export function runFormatChoice(choice: FormatChoice, topic: string, kind: LessonKind = 'play'): void {
  const t = (topic || '놀이').trim();
  switch (choice) {
    case 'idea-list':
      void generateIdeaList(t);
      break;
    case 'mindmap':
      void composeFromPrompt(`${t} 마인드맵`, 'mindmap');
      break;
    case 'topic-web':
      void generateTopicWeb(t);
      break;
    case 'plan-doc': {
      // 원문(pending.raw)에서 계획 유형(일안/주안/월안)을 판별해 그 키워드를 요청에 보존 → composePlanDocStream 이 라우팅.
      const raw = useFormatChoiceStore.getState().pending?.raw || topic || '';
      const req = kind === 'project' ? `${t} 프로젝트 수업 계획`
        : /월간|월안/.test(raw) ? `${t} 월간 놀이계획`
        : /일간|일안|일일/.test(raw) ? `${t} 일일 놀이계획`
        : `${t} 주간 놀이계획`;
      void composeFromPrompt(req, 'plan');
      break;
    }
    case 'package':
      void buildPlayPackage(t, kind);
      break;
  }
}

/** 보드에 인터랙티브 노드를 만들고 프롬프트로 게임 전체를 구성한다(디렉터).
    카드는 store.docs[docId]를 구독하므로 구성이 끝나면 게임이 자동으로 나타난다.
    구성은 store.mutate라 카드 풀스크린의 실행취소로도 되돌릴 수 있다. */
async function createInteractiveGame(text: string): Promise<void> {
  // 제출 = 항상 '새 게임 생성'. (비슷한 저장 게임 재사용은 프롬프트바 추천 썸네일 클릭으로만 —
  //  gameSuggestions 의 reuse 카드 → pickGame → spawnSavedGameOnBoard. 썸네일을 무시하고 제출하면 새로 만든다.)
  const c = viewportCenterBoardPoint();
  const docId = newId('inode');
  const nodeId = addPresetNodeCmd(
    'interactive',
    c.x,
    c.y,
    { w: 720, h: 450, autoH: false, data: { docId } },
    '인터랙티브 게임',
  );
  const board = useBoardStore.getState();
  board.focusNode(nodeId);
  slideFrameToEmpty(nodeId); // 다른 요소와 겹치지 않게 가까운 빈자리로
  board.beginGen();
  // 진행 표시 — 교사가 입력한 '주제'를 항상 앞에 보여 주고, 파이프라인의 구체적 단계를 뒤에 잇는다.
  const topic = cleanGameTopic(text);
  board.setGenerating(`🎮 「${topic}」 놀이를 준비하는 중…`);
  const onBusy = (m: string | null) => board.setGenerating(m ? `「${topic}」 ${m}` : `🎮 「${topic}」 놀이를 만드는 중…`);
  try {
    // 생성 본문(디자인 에이전트 → 조립 → 폴백 → 라이브러리·교사 카드)은 공용 사슬 하나로 —
    // 노드/풀스크린/패키지 경로와 완전히 같은 품질을 보장한다(createChain.runFullCreation).
    const r = await runFullCreation(docId, text, onBusy);
    showToast(r.message, r.ok ? 'success' : 'error');
    // 실패로 빈 노드만 남으면 정리 — 보드에 빈 '인터랙티브' 카드가 잔류하지 않게(거짓 성공 제거).
    if (!r.ok) {
      const d = useInteractiveStore.getState().peek(docId);
      if (!d || d.elements.length === 0) deleteNodesCmd([nodeId]);
    }
  } finally {
    board.endGen();
  }
}

/** 추천 스트립·외부에서 '게임 만들기'를 직접 트리거 — 새 인터랙티브 노드 생성 + Resolver 합성. */
export function startInteractiveGame(text: string): void {
  void createInteractiveGame(normalizeInput(text));
}

function validAssetKind(k?: string): AssetKind {
  return k && (ASSET_KINDS as readonly string[]).includes(k) ? (k as AssetKind) : 'teacher-upload';
}

/** "이 이미지(들)로 ○○ 게임 만들어줘" — 선택 이미지를 인터랙티브 노드 요소로 배치한 뒤 그 이미지들로
    게임을 구성한다. applyInteractivePrompt는 요소가 있으면 editInteractiveNode로 분기해 기존 이미지를
    보존(toSafeDoc가 src를 KEEP로 치환 → 픽셀을 LLM에 미전송, 아동 프라이버시 안전)하며 상호작용을 입힌다.
    게임뷰어 iframe 대신 보드 네이티브 인터랙티브 노드로 일원화. */
async function createInteractiveGameFromImages(imgs: Array<{ src: string; kind?: string }>, text: string): Promise<void> {
  const c = viewportCenterBoardPoint();
  const docId = newId('inode');
  const nodeId = addPresetNodeCmd('interactive', c.x, c.y, { w: 720, h: 450, autoH: false, data: { docId } }, '인터랙티브 게임');
  const board = useBoardStore.getState();
  board.focusNode(nodeId);
  slideFrameToEmpty(nodeId);
  board.beginGen();
  const topic = cleanGameTopic(text);
  board.setGenerating(`🎮 「${topic}」 놀이를 준비하는 중…`);
  try {
    const store = useInteractiveStore.getState();
    store.ensure(docId);
    // 1) 선택 이미지를 1280×800 캔버스에 그리드로 배치(보드 복사 — 원본은 보드에 유지).
    const CANVAS = { w: 1280, h: 800 };
    const list = imgs.slice(0, 8); // 과밀 방지
    const cols = Math.max(1, Math.ceil(Math.sqrt(list.length)));
    const rows = Math.max(1, Math.ceil(list.length / cols));
    const cw = CANVAS.w / (cols + 1);
    const ch = (CANVAS.h - 140) / (rows + 1);
    for (let i = 0; i < list.length; i++) {
      const ref = await urlToAssetRef(list[i].src, validAssetKind(list[i].kind));
      const at = { x: Math.round(cw * ((i % cols) + 1)), y: Math.round(110 + ch * (Math.floor(i / cols) + 1)) };
      const el = makeImageElement(ref, 'board-copy', at, CANVAS);
      store.mutate(docId, (doc) => withElementAdded(doc, el));
    }
    // 2) 배치된 이미지로 '모두 찾기 놀이'를 결정론으로 배선한다. 인터랙티브 노드 시스템은 '제공
    //    이미지로 자동 게임 구성'을 지원하지 않으므로(compose·resolver는 라벨로 이미지를 새로 생성,
    //    엔진 frozen, editInteractiveNode는 최소수정이라 게임을 안 만듦) — 목표(모두 눌러 보기)와
    //    승리 연출까지 코드로 입힌다: 요소별 flag 가드(재탭 중복 카운트 방지) → count → 칭찬 speak,
    //    다 누르면 숨겨 둔 승리 텍스트 reveal(교사는 노드 프롬프트바로 규칙을 더 다듬을 수 있음).
    const PRAISE = ['잘했어요! 🎉', '멋져요! 👏', '최고예요! ⭐', '와, 좋아요! 😊', '신나요! 🥳', '대단해요! 💖'];
    board.setGenerating(`🎮 「${topic}」 놀이를 만드는 중…`);
    store.mutate(docId, (doc) => {
      const imgEls = doc.elements.filter((e) => e.kind === 'image' && e.origin === 'board-copy');
      const n = imgEls.length;
      const CNT = 'cnt';
      const title = makeTextElement(`${topic} — 그림을 모두 눌러 보세요!`, { x: CANVAS.w / 2, y: 70 });
      // 승리 텍스트 — sceneEnter 로 숨겼다가 카운터가 목표에 닿으면 reveal(다른 요소 위에 보이게 z 상향).
      const winBase = makeTextElement(`와, 그림 ${n}개를 모두 눌러 봤어요! 🎉`, { x: CANVAS.w / 2, y: CANVAS.h / 2 - 40 });
      const win = { ...winBase, transform: { ...winBase.transform, z: 9 } };
      const flags = imgEls.map((el) => ({ id: `found_${el.id}`, initial: false }));
      const behaviors = imgEls.flatMap((el, i) => {
        const F = `found_${el.id}`;
        return [
          // flag 가드 — 아직 안 누른 그림만 반응(재탭해도 카운터가 다시 오르지 않게).
          { id: `tap_${el.id}`, target: el.id, trigger: 'tap' as const, action: 'animate' as const, params: { preset: 'bounce' as const }, when: { kind: 'flag' as const, flagId: F, is: false }, then: [`flag_${el.id}`] },
          { id: `flag_${el.id}`, target: el.id, trigger: 'afterComplete' as const, action: 'setFlag' as const, params: { flagId: F, value: true }, then: [`cnt_${el.id}`] },
          { id: `cnt_${el.id}`, target: el.id, trigger: 'afterComplete' as const, action: 'count' as const, params: { counterId: CNT, by: 1 }, then: [`say_${el.id}`] },
          { id: `say_${el.id}`, target: el.id, trigger: 'afterComplete' as const, action: 'speak' as const, params: { text: PRAISE[i % PRAISE.length], mode: 'bubble' as const }, then: ['showwin'] },
        ];
      });
      const finish = [
        { id: 'hidewin', target: win.id, trigger: 'sceneEnter' as const, action: 'hide' as const, params: { targets: [win.id] } },
        { id: 'showwin', target: win.id, trigger: 'afterComplete' as const, action: 'reveal' as const, params: { targets: [win.id] }, when: { kind: 'counter' as const, counterId: CNT, op: '>=' as const, value: n } },
      ];
      return {
        ...doc,
        title: `${topic} 놀이`,
        elements: [title, ...doc.elements, win],
        behaviors: [...(doc.behaviors ?? []), ...behaviors, ...finish],
        counters: [...(doc.counters ?? []), { id: CNT, initial: 0, label: `눌러 봤어요 · 모두 ${n}개`, display: { x: 600, y: 36 } }],
        flags: [...(doc.flags ?? []), ...flags],
      };
    });
    showToast('고른 이미지로 놀이를 만들었어요 — 그림을 모두 눌러 보세요', 'success');
    // 라이브러리 등록 + 교사 카드(모든 게임은 교사 카드를 갖는다).
    const doc = useInteractiveStore.getState().peek(docId);
    if (doc && doc.elements.length > 0) {
      saveToLibrary(doc);
      saveGameCard(docId, ensurePrompts(buildTeacherCard('tap-select', topic, doc.title), topic));
    }
  } finally {
    board.endGen();
  }
}

/** 저장된 게임(docId)을 보드에 올려 바로 쓰게 한다 — 추천 '재사용' 카드 클릭. 생성 없음. */
export function spawnSavedGameOnBoard(docId: string): void {
  useInteractiveStore.getState().ensure(docId); // 문서 보장(없으면 빈 기본)
  const c = viewportCenterBoardPoint();
  const nodeId = addPresetNodeCmd('interactive', c.x, c.y, { w: 720, h: 450, autoH: false, data: { docId } }, '인터랙티브 게임');
  const board = useBoardStore.getState();
  board.focusNode(nodeId);
  slideFrameToEmpty(nodeId);
}

/** 보드에서 인터랙티브 노드가 단독 선택된 채 프롬프트 — 그 노드(docId)에 바로 게임을
    구성/수정한다. applyInteractivePrompt가 분기: 빈 노드 → 전체 구성(runFullCreation),
    그 외 → 맥락 인지 편집. 풀스크린(kv:inode-prompt)과 완전히 동일한 경로. */
async function promptInteractiveNode(nodeId: string, docId: string, text: string): Promise<void> {
  const board = useBoardStore.getState();
  board.focusNode(nodeId);
  board.beginGen();
  board.setGenerating('🎮 인터랙티브 게임을 만들고 있어요…');
  try {
    useInteractiveStore.getState().ensure(docId);
    const r = await applyInteractivePrompt(docId, text, [], (m) =>
      board.setGenerating(m ?? '🎮 인터랙티브 게임을 만들고 있어요…'),
    );
    showToast(r.message, r.ok ? 'success' : 'error');
  } finally {
    board.endGen();
  }
}

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
    (이미지 모델은 투명을 못 만드므로 단색 배경에 단일 오브젝트로 생성한 뒤 누끼한다.)
    조사 변형(배경"이/가/은/는" 제거된·없는·투명한)·"누끼따진"·"PNG로"까지 함께 제거한다. */
function stripBgKeywords(text: string): string {
  return text
    .replace(/누끼\s*(따진|딴|로|를|만)?/g, ' ')
    .replace(/투명\s*(한|하게|으로)?\s*배경\s*(에다가|에다|에서|위에|으로|에)?/g, ' ')
    .replace(
      /뒷?배경\s*(이|가|은|는|을|를|도|만)?\s*(완전히\s*)?(제거|삭제|지우|지워|지운|없애|없애줘|없이|없는|없게|빼고|빼|뺀|날려|날리|날린|투명|딴|따)(된|진|한|하고|해서|해|줘|준|돼|서)?/g,
      ' ',
    )
    .replace(/\bpng\s*(파일|이미지)?\s*(로|으로)?/gi, ' ')
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

  // 🔴 게임 뷰어 풀스크린이면 — 선택/컴포저로 새지 않고 무조건 그 게임 뷰어로 라우팅한다.
  // (풀스크린 = 그 게임 전용 컨텍스트. 보드 프롬프트바가 포털 위에 떠 있어도 입력은 게임으로.)
  const fsViewerId = useUIStore.getState().gameViewerFsNodeId;
  if (fsViewerId) {
    window.dispatchEvent(new CustomEvent('kv:game-create', { detail: { nodeId: fsViewerId, prompt: text } }));
    return true;
  }

  // 🔵 인터랙티브 노드 풀스크린(편집)이면 — 입력은 그 노드로. 선택 요소가 있으면 그 요소에,
  //    없으면 노드 전체 맥락으로 AI가 적용한다(InteractiveOverlay가 kv:inode-prompt를 받음).
  const fsInodeId = useUIStore.getState().inodeFsDocId;
  if (fsInodeId) {
    window.dispatchEvent(new CustomEvent('kv:inode-prompt', { detail: { docId: fsInodeId, prompt: text } }));
    return true;
  }

  // 게임 뷰어 카드가 단독 선택돼 있으면 — 보드 프롬프트를 그 카드의 게임 생성으로 보낸다.
  // (게임뷰어 하단바 하이브리드: 임베드 소형 카드는 보드 프롬프트바로 제어. NodeView가 iframe에 전달)
  if (sel.length === 1 && typeof sel[0].data?.embed === 'string' && sel[0].data.embed.includes('game-viewer')) {
    window.dispatchEvent(new CustomEvent('kv:game-create', { detail: { nodeId: sel[0].id, prompt: text } }));
    return true;
  }

  // 인터랙티브 노드가 단독 선택된 채 프롬프트 — 그 노드(docId)에 바로 게임을 구성/수정한다.
  //   · 순수 보드 조작(크게/정렬/지워…)이면 아래 공통 처리로 폴백.
  //   · 그 외(주제·생성·수정 요청)는 모두 이 노드의 게임 생성/편집으로(풀스크린과 동일 경로).
  // (인터랙티브 노드는 type==='interactive'라 아래 선택-적용 분기가 못 잡아 모호 팝업으로 새던 것 차단.)
  const inodeDocId = sel.length === 1 && sel[0].type === 'interactive' ? sel[0].data?.docId : undefined;
  if (typeof inodeDocId === 'string') {
    const iop = boardOp(text);
    const igen = /만들|만드|생성|그려|작성|써\s*줘|추가|넣어|넣고|짜\s*줘|구성|기획|바꿔|바꾸|수정|편집|고쳐|꾸며/.test(text);
    if (!(iop && !igen)) {
      void promptInteractiveNode(sel[0].id, inodeDocId, text);
      return true;
    }
    // 순수 보드 조작(크게/정렬/지워…) → 아래 공통 처리로 폴백
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

  // 슬라이드 요청은 선택이 없어도 '슬라이드'로 만든다 — 활동지/스튜디오로 새지 않게.
  //   · 뷰어 단어만("슬라이드"/"장표") → 빈 슬라이드 뷰어만 깐다(그릇 우선).
  //   · "○○ 슬라이드 만들어줘" → 뷰어를 깔고 장표 에이전트로 바로 DeckSpec 생성.
  if (sel.length === 0 && SLIDE_RE.test(text)) {
    const dv = spawnSlidesViewer();
    useBoardStore.getState().focusNode(dv);
    slideFrameToEmpty(dv); // 다른 요소와 겹치지 않게 가까운 빈자리로
    const sgen = /만들|생성|그려|작성|써\s*줘|추가|넣어|짜\s*줘|구성|기획|해\s*줘|줘/.test(text);
    if (!SLIDE_BARE_RE.test(text.trim()) && sgen) void generateSlidesForViewer(dv, text);
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
    // 인터랙티브 게임 — "○○ 게임/퀴즈 만들어줘" → 보드에 인터랙티브 노드를 만들고 구성(디렉터).
    // 활동지/계획/도안 컴포저(아래 composeFromPrompt)로 새지 않도록 그 앞에서 가로챈다.
    // 아이디어 요청 → 놀이아이디어 리스트로 바로 생성(팝업 없이). 단 '아이디어 맵/주제망/생각그물'은
    // 제외 → 아래 composeFromPrompt 가 mindmap 으로 라우팅. (사용자 지시: 유형 명시 요청은 직접 생성.)
    if (FMT_GEN_RE.test(text) && !FMT_SPECIFIC_RE.test(text) && IDEA_DIRECT_RE.test(text) && !MINDMAP_RE.test(text)) {
      void generateIdeaList(fmtTopic(text));
      return true;
    }
    // 일반 '놀이계획/계획안'(하위유형 없음)만 포맷 선택 오버레이(리스트·마인드맵·계획·패키지)를 띄운다.
    // 일안·주안·월안·주제망은 여기서 가로채지 않고 아래 composeFromPrompt 로 직접 라우팅한다.
    // (게임 분기보다 먼저 — "물놀이 놀이 계획"의 둘째 '놀이'가 게임 키워드로 오인돼 게임이 만들어지지 않게.)
    const fmt = detectFormatChoice(text);
    if (fmt) {
      useFormatChoiceStore.getState().open(fmt.mode, fmt.topic, text, fmt.kind);
      return true;
    }
    if (isNewInteractiveGame(text)) {
      void createInteractiveGame(text);
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

  // 이미지 1장 선택 + "이 스타일로 여러가지 ~ 각각/다른 카드에 그려줘" → 선택 카드는 그대로 두고,
  // 그 화풍을 참조해 지시한 각 대상을 '새 이미지 카드'로 추가한다(in-place 재생성 아님).
  if (
    sel.length === 1 && sel[0].type === 'image' && sel[0].src &&
    STYLE_SERIES_RE.test(text) && /그려|그림|그릴|만들|생성|표현/.test(text)
  ) {
    void generateStyledSeriesFromImage(sel[0].id, text);
    return true;
  }

  // 이미지(들) 선택 + "이 이미지로 ○○ 게임 만들어줘" → 인터랙티브 노드를 만들고 선택 이미지를
  // 그 노드의 요소로 배치한 뒤 그 이미지들로 게임을 구성한다(감정 사진 → 마음알기 게임).
  // 게임뷰어 iframe 미사용 — 보드 네이티브 인터랙티브 노드로 일원화.
  // 일반 이미지 재생성(applyContentIntent)으로 새지 않도록 콘텐츠 분기보다 먼저 처리.
  const gameImgs = sel.filter((n) => n.type === 'image' && n.src);
  if (gameImgs.length > 0 && gameImgs.length === sel.length && GAME_WORD_RE.test(text) && GAME_GEN_RE.test(text)) {
    void createInteractiveGameFromImages(gameImgs.map((n) => ({ src: n.src as string, kind: n.data?.assetKind as string | undefined })), text);
    showToast('고른 이미지로 게임을 만들고 있어요', 'success');
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
