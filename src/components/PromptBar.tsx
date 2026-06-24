import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '@/lib/icons';
import { AI_CHAT_PATH } from '@/lib/nav';
import { useUIStore } from '@/store/uiStore';
import { useRouterStore } from '@/store/routerStore';
import { useBoardStore, type BoardNode } from '@/store/boardStore';
import type { ImageAsset } from '@/board/assets';
import type { WebLink } from '@/board/webLinks';
import { FavoriteCardRail } from './FavoriteCardRail';
import { gameSuggestions, hasGameKeyword, type GameSuggestion } from '@/features/interactive-viewer/resolver/gameSuggest';

/* Board engine modules (prompt/workflow/assets) are heavy and only needed on My
   Board, so they're loaded on demand (keeps them out of the initial bundle). */

// Core generation steps (keywords only) streamed into the input on send.
const GEN_STEPS = ['의도 분석', '자료 구성', '초안 생성', '누리과정 연계', '마무리'];
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/* 보관함 추천 애니메이션 — 섹션(박스) 단위로 순차 재생한다.
   · 나타날 때: 프롬프트바에 가까운 '아래' 박스(boxOrder 0)부터 → 위 박스로.
   · 사라질 때: 반대로 '위' 박스부터 → 아래 박스로(아래가 마지막에 사라진다).
   · 한 박스 안에선 가로 중앙에서 양쪽으로 퍼지고, 다 나오면 박스 배경이 페이드인. */
const LIB_STEP = 58; // 아이템 사이 stagger(ms) — 더 또렷한 순차감
const LIB_ITEM_DUR = 300; // 아이템 페이드 시간
const LIB_BOX_DUR = 240; // 섹션 박스 페이드 시간
const LIB_BOX_GAP = 150; // 섹션(박스) 사이 순차 간격
/** 박스 시작 기준 지연 — boxOrder 0 = 프롬프트바에 가장 가까운(아래) 박스.
    열림은 아래부터(0,1,…), 닫힘은 위부터(반대). */
function libBoxBase(boxOrder: number, boxCount: number, shown: boolean): number {
  return (shown ? boxOrder : boxCount - 1 - boxOrder) * LIB_BOX_GAP;
}
/** i번째 아이템 스타일 — 박스 순서 지연 + 박스 안 중앙→양쪽(열림)/양쪽→중앙(닫힘). */
function libItemStyle(
  i: number,
  count: number,
  shown: boolean,
  reduced: boolean,
  boxOrder = 0,
  boxCount = 1,
): React.CSSProperties {
  if (reduced) return { opacity: shown ? 1 : 0 }; // prefers-reduced-motion — 즉시
  const center = (count - 1) / 2;
  const dist = Math.abs(i - center);
  const within = shown ? dist * LIB_STEP : (center - dist) * LIB_STEP;
  const delay = libBoxBase(boxOrder, boxCount, shown) + within;
  return {
    opacity: shown ? 1 : 0,
    transform: shown ? 'translateY(0) scale(1)' : 'translateY(6px) scale(0.96)',
    transition: `opacity ${LIB_ITEM_DUR}ms ease, transform ${LIB_ITEM_DUR}ms ease`,
    transitionDelay: `${Math.round(Math.max(0, delay))}ms`,
  };
}
/** 섹션 박스(테두리·배경) 스타일 — 열림: 그 박스 아이템이 다 나온 뒤 / 닫힘: 그 박스 차례에 가장 먼저. */
function libBoxStyle(count: number, shown: boolean, reduced: boolean, boxOrder = 0, boxCount = 1): React.CSSProperties {
  if (reduced) return { opacity: shown ? 1 : 0 };
  const base = libBoxBase(boxOrder, boxCount, shown);
  const maxDist = (count - 1) / 2;
  const delay = shown ? Math.round(base + maxDist * LIB_STEP + LIB_ITEM_DUR * 0.45) : Math.round(base);
  return { opacity: shown ? 1 : 0, transition: `opacity ${LIB_BOX_DUR}ms ease`, transitionDelay: `${delay}ms` };
}
/** 닫힘 애니메이션이 끝나기까지 가장 긴 시간(언마운트 지연) — 마지막(아래) 박스 기준. */
function libCloseMs(count: number, reduced: boolean, boxCount = 1): number {
  if (reduced) return 0;
  return Math.round((boxCount - 1) * LIB_BOX_GAP + ((count - 1) / 2) * LIB_STEP + LIB_ITEM_DUR + 60);
}

/* Shared prompt bar shell (CLAUDE.md §2 / SKILL.md §7).
   Persistent at the bottom of every page. Promoted to a common component for
   reuse — the four behaviors are the contract:

   1) Left message icon  → navigate to AI 채팅 page. When the bar is collapsed,
      this same icon is the EXPAND trigger.
   2) Star ↔ Send        → empty input shows the star (favorites); typed input
      shows send.
   3) Star click (empty) → favorite card rail rises above the bar.
   4) Right round toggle → collapse the bar to just the message icon (re-click
      expands).

   M1: routing + interaction only. Actual model dispatch is wired when the router
   lands in M2. */

/** + 업로드 첨부 — 이미지(데이터 URL) 또는 텍스트 문서(내용). 전송 시 보드에 카드로
    올린 뒤 선택해, 입력한 프롬프트가 그 자료에 대한 생성/명령으로 작동한다. */
type PromptAttachment = { id: string; kind: 'image' | 'text'; name: string; dataUrl?: string; text?: string };

/** 단독 선택된 카드 유형에 맞춘 프롬프트바 플레이스홀더(예: 게임뷰어 → "무슨 게임을 만들까요?").
   못 잡으면 null → 일반 선택 안내로 폴백. */
function selectionPlaceholder(node: BoardNode | undefined): string | null {
  if (!node) return null;
  const embed = typeof node.data?.embed === 'string' ? node.data.embed : '';
  if (embed) {
    if (embed.includes('slides-viewer')) return '어떤 슬라이드를 만들까요? (주제·대상·장수)';
    if (embed.includes('game-viewer')) return '무슨 게임을 만들까요?';
    if (embed.includes('video-player')) return '어떤 동영상을 만들까요?';
    if (embed.includes('youtube-viewer')) return '어떤 영상을 찾아 볼까요?';
    if (embed.includes('glb-viewer')) return '어떤 3D 모델을 보여줄까요?';
    if (embed.includes('web-viewer')) return '어떤 웹 자료를 띄울까요?';
    if (embed.includes('magic-viewer')) {
      const m = node.data?.viewerMode;
      if (m === '3d') return '어떤 3D 모델을 보여줄까요?';
      if (m === 'video') return '어떤 동영상을 만들까요?';
      if (m === 'youtube') return '어떤 영상을 찾아 볼까요?';
      return '무엇을 담을까요? (영상·3D·유튜브)';
    }
    return '이 뷰어에 무엇을 담을까요?';
  }
  if (node.data?.doc) return '문서에 무엇을 쓸까요?';
  if (node.data?.role === 'source') return '어떤 자료를 더 찾아 줄까요?';
  if (node.type === 'image' || node.src) return '이 이미지를 어떻게 바꿀까요?';
  if (node.type === 'text') return '무슨 글을 쓸까요?';
  if (node.type === 'frame') return '이 안에 무엇을 만들까요?';
  if (node.type === 'sticky') return '메모에 무엇을 적을까요?';
  return null;
}

export function PromptBar({ variant = 'docked' }: { variant?: 'docked' | 'inline' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<PromptAttachment[]>([]);

  // Generation feedback: stream keyword steps into the input + spin the button.
  const [generating, setGenerating] = useState(false);
  const [genText, setGenText] = useState('');
  const genCancel = useRef(false);
  useEffect(() => () => { genCancel.current = true; }, []);

  // 보드 실생성 상태 — 컴포저/에이전트가 단계마다 갱신하는 진행 메시지를 그대로
  // 입력창에 스트리밍한다(가짜 키워드 애니메이션이 아니라 실제 프로세스).
  const boardGenerating = useBoardStore((s) => s.generating);
  const genActive = useBoardStore((s) => s.genActive);
  const streaming = generating || !!boardGenerating;
  // 스트리밍 중 입력창을 클릭하면 진행 표시를 '바 위 스트립'으로 분리하고 입력창은
  // 플레이스홀더로 복귀 — 입력해 제출하면 생성이 병렬로 추가된다(복수 생성).
  const [statusDetached, setStatusDetached] = useState(false);
  useEffect(() => {
    if (!streaming) setStatusDetached(false); // 모든 생성이 끝나면 원래 모드로
  }, [streaming]);
  const statusInline = streaming && !statusDetached;
  // 생성 중 전송 버튼 호버 — 스피너가 정지(■) 버튼으로 바뀐다.
  const [hoverStop, setHoverStop] = useState(false);

  const collapsed = useUIStore((s) => s.promptBarCollapsed);
  const favoritesOpen = useUIStore((s) => s.favoritesOpen);
  const draft = useUIStore((s) => s.promptDraft);
  const setCollapsed = useUIStore((s) => s.setPromptBarCollapsed);
  const togglePromptBar = useUIStore((s) => s.togglePromptBar);
  const setFavoritesOpen = useUIStore((s) => s.setFavoritesOpen);
  const toggleFavorites = useUIStore((s) => s.toggleFavorites);
  const setDraft = useUIStore((s) => s.setPromptDraft);
  const availableActions = useUIStore((s) => s.availableActions);
  // 동영상 '프롬프트 추가' 작성 모드 — 설정되면 입력창 placeholder가 추천 프롬프트로
  // 바뀌고, 연결한 이미지 썸네일이 바 위에 뜨며, 전송 시 그 프롬프트+이미지로 영상 생성.
  const videoCompose = useUIStore((s) => s.videoCompose);
  // 게임 뷰어 풀스크린 — 입력이 무조건 그 게임으로 가므로 placeholder도 게임 문구로.
  const gameViewerFs = useUIStore((s) => s.gameViewerFsNodeId);
  // 인터랙티브 노드 풀스크린(편집) — 입력이 그 노드 편집으로 간다. 선택 수로 칩/문구를 바꾼다.
  const inodeFs = useUIStore((s) => s.inodeFsDocId);
  const inodeSelCount = useUIStore((s) => s.inodeFsSelCount);
  const setVideoCompose = useUIStore((s) => s.setVideoCompose);

  const sendToRouter = useRouterStore((s) => s.send);
  const boardSelection = useBoardStore((s) => s.selection);

  const leftInset = useUIStore((s) => s.promptBarLeftInset);
  const hasText = draft.trim().length > 0;
  // 작성 모드에선 빈 입력이어도 전송 가능(placeholder 프롬프트를 사용). 첨부만 있어도 전송 가능.
  const canSend = hasText || !!videoCompose || attachments.length > 0;
  const onChatPage = location.pathname === AI_CHAT_PATH;

  // 입력이 길어지면 스크롤 대신 바가 위로 확장 — textarea 높이를 내용에 '정확히' 맞춰 스크롤바
  // 없이 다 보이게 한다(마이보드 바와 동일). 화면을 다 덮지 않게 80vh 안전 상한에서만 스크롤.
  useEffect(() => {
    const el = inputRef.current;
    if (!el || statusInline) return;
    // 접힘 상태에선 textarea 폭이 0(max-w-0)이라 scrollHeight가 여러 줄로 폭주 → 높이가 폭주로
    // 튀어 접힌 바가 세로로 커진다. 접혔을 땐 자동높이를 끄고 CSS 기본 높이로 되돌린다.
    if (collapsed) {
      el.style.height = '';
      el.style.overflowY = 'hidden';
      return;
    }
    const fit = () => {
      // 펼침 전환 중엔 textarea 폭이 아직 0~좁아 scrollHeight가 여러 줄로 폭주(세로로 튐) →
      // 폭이 충분히 확정됐을 때만 측정한다. 전환 완료(transitionend)에 다시 fit이 불려 최종 높이를 잡는다.
      if (el.clientWidth < 60) return;
      el.style.height = 'auto';
      // 내용 높이에 맞춰 위로 확장(스크롤바 없음). 너무 길면 80vh에서만 스크롤(안전장치).
      const maxPx = Math.round(window.innerHeight * 0.8);
      const needed = el.scrollHeight;
      el.style.height = `${Math.min(needed, maxPx)}px`;
      el.style.overflowY = needed > maxPx ? 'auto' : 'hidden';
    };
    fit();
    // 펼침/접힘 전환 중에는 폭이 좁아 높이가 잘못 측정되므로, 폭이 확정되면 재측정해 교정.
    const host = el.parentElement;
    const onEnd = (e: TransitionEvent) => {
      if (e.propertyName === 'max-width') fit();
    };
    host?.addEventListener('transitionend', onEnd as EventListener);
    window.addEventListener('resize', fit);
    return () => {
      host?.removeEventListener('transitionend', onEnd as EventListener);
      window.removeEventListener('resize', fit);
    };
  }, [draft, statusInline, collapsed, videoCompose]);

  // + 버튼 → 파일 선택 → 첨부(이미지: data URL · 텍스트 문서: 내용 읽기).
  function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ''; // 같은 파일을 다시 고를 수 있게 비운다
    for (const f of files) {
      const id = `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const reader = new FileReader();
      if (f.type.startsWith('image/')) {
        reader.onload = () =>
          setAttachments((a) => [...a, { id, kind: 'image', name: f.name, dataUrl: String(reader.result) }]);
        reader.readAsDataURL(f);
      } else {
        reader.onload = () =>
          setAttachments((a) => [...a, { id, kind: 'text', name: f.name, text: String(reader.result).slice(0, 8000) }]);
        reader.readAsText(f);
      }
    }
  }

  // 보관함 추천 — 보드에서 2자 이상 입력하면 태그/주제가 맞는 저장 자료를 바 위에
  // 카드로 띄운다. 클릭 = 복수 선택 토글 → [배치] 버튼 또는 프롬프트 제출로 적용.
  const [assetSugs, setAssetSugs] = useState<ImageAsset[]>([]);
  const [assetSel, setAssetSel] = useState<string[]>([]); // 클릭 순서 유지(배치 순서)
  const assetKey = (a: ImageAsset) => `${a.tag}-${a.createdAt}`;
  useEffect(() => {
    if (!location.pathname.startsWith('/board') || inodeFs || draft.trim().length < 2) {
      setAssetSugs([]);
      setAssetSel([]);
      return;
    }
    const t = setTimeout(() => {
      void import('@/board/assets')
        .then((m) => m.searchAssets(draft.trim(), ['image', 'video']))
        .then((sugs) => {
          setAssetSugs(sugs);
          // 목록이 바뀌면 더 이상 보이지 않는 선택은 비운다.
          const keys = new Set(sugs.map((a) => `${a.tag}-${a.createdAt}`));
          setAssetSel((sel) => sel.filter((k) => keys.has(k)));
        })
        .catch(() => setAssetSugs([]));
    }, 160);
    return () => clearTimeout(t);
  }, [draft, location.pathname, inodeFs]);

  /** 선택한 보관함 자료를 보드의 빈 자리에 그리드로 정렬 배치(겹침 없음). */
  function applySelectedAssets() {
    const chosen = assetSel
      .map((k) => assetSugs.find((a) => assetKey(a) === k))
      .filter((a): a is ImageAsset => !!a);
    if (chosen.length === 0) return;
    setAssetSel([]);
    void import('@/board/workflow').then((m) => m.placeAssetsOnBoard(chosen));
  }

  // 웹링크 보관함 추천 — 웹 검색으로 저장된 링크를 키워드로 찾아 이미지처럼 리스트한다.
  const [webSugs, setWebSugs] = useState<WebLink[]>([]);
  const [webSel, setWebSel] = useState<string[]>([]); // url 기준 복수 선택
  useEffect(() => {
    if (!location.pathname.startsWith('/board') || inodeFs || draft.trim().length < 2) {
      setWebSugs([]);
      setWebSel([]);
      return;
    }
    const t = setTimeout(() => {
      void import('@/board/webLinks')
        .then((m) => m.searchWebLinks(draft.trim()))
        .then((sugs) => {
          setWebSugs(sugs);
          const urls = new Set(sugs.map((s) => s.url));
          setWebSel((sel) => sel.filter((u) => urls.has(u)));
        })
        .catch(() => setWebSugs([]));
    }, 160);
    return () => clearTimeout(t);
  }, [draft, location.pathname, inodeFs]);

  /** 선택한 웹링크를 한 장의 웹 자료 카드로 보드(뷰포트 중앙)에 배치. */
  function applySelectedWebLinks() {
    const chosen = webSel
      .map((u) => webSugs.find((s) => s.url === u))
      .filter((s): s is WebLink => !!s);
    if (chosen.length === 0) return;
    setWebSel([]);
    void import('@/board/composer').then((m) => m.placeWebLinksOnBoard(chosen));
  }

  // 즐겨찾기 레일 마운트 유지(닫힘 애니메이션용) — 보관함 strip 조건에서도 참조하므로
  // 여기서 먼저 선언한다(아래 effect가 토글). 상세 동작은 그 effect 주석 참조.
  const [favRender, setFavRender] = useState(false);
  const [favClosing, setFavClosing] = useState(false);

  // ── 보관함 섹션 열림/닫힘 애니메이션 ──
  // libRender: 마운트 유지(닫힘 애니메이션을 끝까지 재생) · libShown: 펼침 상태 ·
  // libDismissed: 배경/다른 버튼 클릭으로 닫음(같은 키워드로 다시 열리지 않게).
  const prefersReduced = useMemo(
    () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    [],
  );
  // 게임 추천 — 입력에 게임 키워드가 있으면 테마×메커니즘 추천 카드(보관함 박스와 동일 스타일).
  const gameSugs = useMemo<GameSuggestion[]>(
    () => (location.pathname.startsWith('/board') && !inodeFs && hasGameKeyword(draft) ? gameSuggestions(draft) : []),
    [draft, location.pathname, inodeFs],
  );
  const libHasContent = assetSugs.length > 0 || webSugs.length > 0 || gameSugs.length > 0;
  const libCount = Math.max(assetSugs.length, webSugs.length, gameSugs.length);
  // 보이는 박스 수와 각 박스의 '아래(프롬프트바)부터' 순번 — 렌더 순서는 게임(위)→이미지→웹(아래).
  const libBoxCount = (gameSugs.length > 0 ? 1 : 0) + (assetSugs.length > 0 ? 1 : 0) + (webSugs.length > 0 ? 1 : 0);
  const gameBoxOrder = libBoxCount - 1; // 게임 박스는 가장 위
  const assetBoxOrder = libBoxCount - 1 - (gameSugs.length > 0 ? 1 : 0);
  const webBoxOrder = libBoxCount - 1 - (gameSugs.length > 0 ? 1 : 0) - (assetSugs.length > 0 ? 1 : 0);
  const [libDismissed, setLibDismissed] = useState(false);
  const [libRender, setLibRender] = useState(false);
  const [libShown, setLibShown] = useState(false);
  const libActive = libHasContent && !collapsed && !favRender && !libDismissed;
  // 게임 추천 카드 클릭 → Resolver 즉시 합성(새 게임 노드). 입력 비우고 스트립 닫음.
  const pickGame = (s: GameSuggestion) => {
    setDraft('');
    setLibDismissed(true);
    void import('@/board/prompt').then((m) => m.startInteractiveGame(s.prompt));
  };
  // 키워드가 바뀌면 '닫음' 해제 — 다시 입력하면 열린다.
  useEffect(() => { setLibDismissed(false); }, [draft]);
  useEffect(() => {
    if (libActive) {
      setLibRender(true);
      // 다음 프레임에 펼침 → opacity-0에서 트랜지션이 실제로 발동한다.
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setLibShown(true)));
      return () => cancelAnimationFrame(id);
    }
    if (libRender) {
      setLibShown(false); // 역재생 시작
      const t = setTimeout(() => setLibRender(false), libCloseMs(libCount, prefersReduced, libBoxCount));
      return () => clearTimeout(t);
    }
  }, [libActive, libRender, libCount, libBoxCount, prefersReduced]);
  // 배경·다른 버튼 클릭 → 닫기(역애니메이션). 스트립 자신·입력창 클릭은 유지.
  useEffect(() => {
    if (!libActive) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.closest('[data-kv-lib]') || t.closest('textarea')) return;
      setLibDismissed(true);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [libActive]);

  // Keep the favorites rail mounted briefly after closing so it can play the
  // reverse animation (cards descend back behind the bar) before unmounting.
  // (favRender/favClosing은 위 보관함 strip 조건에서 먼저 쓰여 상단에서 선언됨.)
  useEffect(() => {
    if (favoritesOpen) {
      setFavRender(true);
      setFavClosing(false);
      return;
    }
    if (!favRender) return;
    setFavClosing(true);
    const t = setTimeout(() => { setFavRender(false); setFavClosing(false); }, 460);
    return () => clearTimeout(t);
  }, [favoritesOpen, favRender]);

  // Click anywhere outside the rail (background, board cards, other buttons, the
  // input) closes it. Use the CAPTURE phase so it still fires for board nodes,
  // whose onPointerDown calls stopPropagation (which would block a bubble listener).
  useEffect(() => {
    if (!favoritesOpen) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.closest('[aria-label="즐겨찾기 작업"]')) return; // the rail itself
      if (t.closest('button[type="submit"]')) return; // the star button toggles it
      setFavoritesOpen(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [favoritesOpen, setFavoritesOpen]);

  // Page-aware command context: the bar acts on the current screen and its
  // current selection. On My Board it scopes to the selected card(s)/frame.
  // 인터랙티브 노드 편집 중에는 보드 선택이 아니라 '노드 안 요소' 선택 수로 칩/강조를 잡는다.
  const boardSelectionCount = location.pathname.startsWith('/board') ? boardSelection.length : 0;
  const selChipCount = inodeFs ? inodeSelCount : boardSelectionCount;
  const placeholder = (() => {
    // 인터랙티브 노드 풀스크린(편집) — 입력은 그 노드로. 선택 있으면 그 요소에, 없으면 전체.
    if (inodeFs) {
      return inodeSelCount > 0
        ? '고른 요소에 적용 — 예) 탭하면 "안녕" 말하기 · 통통 튀게 · 노란색으로'
        : '이 노드에 무엇을 더할까요? — 예) 토끼 그림 넣어줘 · 배경 하늘색 · "동물 농장" 글자';
    }
    // 게임 뷰어 풀스크린 — 입력은 그 게임 전용. (보드 선택과 무관.)
    if (gameViewerFs) return '무슨 게임을 만들까요?  예) 동물 이름 맞추기 · 과일 짝 맞추기';
    // 동영상 작성 모드 — 추천 프롬프트를 placeholder로(비워서 보내면 이 값을 사용).
    if (videoCompose) {
      const base = videoCompose.placeholder.trim().replace(/\s+/g, ' ').slice(0, 48);
      if (videoCompose.imageSrc) {
        return base ? `${base} — 어떻게 움직이면 좋을지 적어 보세요(비우면 그대로 생성)` : '이 이미지로 만들 영상을 설명해 주세요';
      }
      return base ? `${base} — 더 자세히 적어 보세요(비우면 그대로 생성)` : '만들 영상을 설명해 주세요';
    }
    const p = location.pathname;
    if (p.startsWith('/board')) {
      if (boardSelectionCount === 1) {
        const ph = selectionPlaceholder(useBoardStore.getState().nodes[boardSelection[0]]);
        if (ph) return ph;
      }
      return boardSelectionCount > 0
        ? `선택한 ${boardSelectionCount}개에 명령 — 이미지·메모·카드 생성/수정`
        : '보드에 무엇을 만들까요? 카드를 선택하면 그 대상에 명령해요';
    }
    if (p === '/gallery') return '자료를 검색하거나 “가을 자료 모아줘”처럼 요청하세요';
    if (p === '/folder') return '“가을 활동” 폴더 만들기 · 자료를 정리하세요';
    if (p === '/class') return '우리반·아동에 대해 묻거나 알림장을 작성하세요';
    if (p === '/calendar') return '일정으로 가정통신문·안내문을 만들어 달라고 하세요';
    if (p === AI_CHAT_PATH) return '무엇이든 물어보세요';
    return '무엇이든 말하거나, 보드에서 대상을 선택해 명령하세요';
  })();

  // 'docked' = floating bar pinned to the bottom of the content column (default,
  // used on every page). 'inline' = rendered in normal flow (Home places it
  // between the resource thumbnails and the quick-action pills).
  const docked = variant === 'docked';
  const wrapperClass = docked
    ? 'kv-promptbar pointer-events-none absolute inset-x-0 bottom-0 z-40 flex justify-center px-t4'
    : 'pointer-events-none flex w-full justify-center px-t4';
  const wrapperStyle = docked ? { paddingLeft: leftInset || undefined } : undefined;

  // Behavior 1 — message icon.
  function onMessageIcon() {
    if (collapsed) {
      setCollapsed(false); // expand trigger when collapsed
      return;
    }
    if (!onChatPage) navigate(AI_CHAT_PATH, { viewTransition: true });
  }

  // Behavior 2/3 — star (empty) vs send (typed). 생성 중에는 정지 버튼이 된다.
  function onStarOrSend() {
    if (statusInline) {
      // 정지 — 진행 중인 모든 생성을 즉시 중단(보드 플로우 + 로컬 타이핑 애니메이션).
      genCancel.current = true;
      setGenerating(false);
      setGenText('');
      void import('@/board/workflow').then((m) => m.abortGeneration());
      return;
    }
    // 동영상 작성 모드 — 입력(또는 placeholder) + 연결 이미지로 영상 생성.
    if (videoCompose) {
      runVideoCompose();
      return;
    }
    if (hasText || attachments.length > 0) {
      void runGeneration(draft.trim());
    } else {
      toggleFavorites(); // raise the favorite card rail
    }
  }

  /** 동영상 작성 모드 제출 — 교사가 입력한 프롬프트(userPrompt)와 추천 주제(placeholder)를
      구분해 넘긴다. 이미지→비디오는 입력이 없으면 이미지 그대로+움직임만, 있으면 그 내용만
      반영. 텍스트→비디오는 입력(없으면 추천 주제)으로 장면 생성. */
  function runVideoCompose() {
    const vc = useUIStore.getState().videoCompose;
    if (!vc) return;
    const typed = draft.trim();
    setVideoCompose(null);
    setDraft('');
    void import('@/board/video').then((m) =>
      m.generateVideoForViewer(vc.viewerId, vc.placeholder, vc.imageSrc, { userPrompt: typed }),
    );
  }

  // Dispatch. 보드는 즉시 실행 — 실제 생성 단계가 boardStore.generating으로 입력창에
  // 스트리밍된다. 그 외 페이지는 기존 키워드 타이핑 애니메이션 후 라우터로 보낸다.
  async function runGeneration(text: string) {
    genCancel.current = false;
    setFavoritesOpen(false);
    if (location.pathname.startsWith('/board')) {
      finalizeSend(text);
      return;
    }
    setGenerating(true);
    for (const step of GEN_STEPS) {
      for (let i = 1; i <= step.length; i++) {
        if (genCancel.current) return;
        setGenText(step.slice(0, i));
        await sleep(38);
      }
      if (genCancel.current) return;
      await sleep(340);
    }
    if (genCancel.current) return;
    finalizeSend(text);
  }

  function finalizeSend(text: string) {
    setGenerating(false);
    setGenText('');
    setDraft('');
    const path = location.pathname;

    // 1) My Board → ALWAYS handle on the board (act on the selected card/frame,
    //    or spawn a new card from the prompt). Never navigate to chat.
    //    보관함 추천에서 자료를 선택한 상태로 제출하면: 먼저 보드에 정렬 배치하고
    //    (배치가 그 카드들을 선택함) 프롬프트를 그 카드들에 대한 명령으로 실행.
    if (path.startsWith('/board')) {
      // 업로드 첨부 — 이미지는 이미지 카드, 텍스트 문서는 메모 카드로 보드에 올린 뒤
      // 그 카드들을 선택하고, 입력한 프롬프트를 그 대상에 대한 명령으로 실행한다.
      if (attachments.length > 0) {
        const atts = attachments;
        setAttachments([]);
        const imgAtts = atts.filter((a) => a.kind === 'image' && a.dataUrl);
        // 이미지 첨부 + '생성' 요청 → 첨부를 '스타일 참조(이미지 프롬프트)'로 결과를 생성한다.
        //   예) 이미지 첨부 + "웃고있는 여자 아이 그려줘" → 첨부 화풍으로 그 아이를 새 그림으로.
        //   첨부 자체는 카드로 올리지 않고 입력으로만 소비. 생성 요청이 아니면 기존 동작(아래).
        if (imgAtts.length > 0 && text && /그려|그림|그릴|만들|만드|생성|제작|뽑아|그려줘/.test(text)) {
          void import('@/board/workflow').then((m) =>
            m.generateFromReferenceImages(imgAtts.map((a) => a.dataUrl!), text),
          );
          return;
        }
        void (async () => {
          const ids: string[] = [];
          const wf = await import('@/board/workflow');
          const imgs = imgAtts;
          if (imgs.length) {
            ids.push(
              ...wf.placeAssetsOnBoard(
                imgs.map((a) => ({ tag: a.name.replace(/\.[^.]+$/, ''), url: a.dataUrl!, kind: 'image' })),
              ),
            );
          }
          for (const t of atts.filter((a) => a.kind === 'text' && a.text)) {
            ids.push(wf.spawnMemoCard(t.name.replace(/\.[^.]+$/, ''), t.text!));
          }
          if (ids.length) useBoardStore.getState().setSelection(ids);
          if (text) {
            const pm = await import('@/board/prompt');
            pm.handleBoardPrompt(text);
          }
        })();
        return;
      }
      const chosen = assetSel
        .map((k) => assetSugs.find((a) => assetKey(a) === k))
        .filter((a): a is ImageAsset => !!a);
      if (chosen.length > 0) {
        setAssetSel([]);
        void import('@/board/workflow')
          .then((m) => m.placeAssetsOnBoard(chosen))
          .then(() => import('@/board/prompt'))
          .then((m) => m.handleBoardPrompt(text));
      } else {
        void import('@/board/prompt').then((m) => m.handleBoardPrompt(text));
      }
      return;
    }

    // 2) Pages that handle the prompt in place — search/gather (갤러리) or
    //    create/organize (폴더) — react via their kv:prompt listener; no chat nav.
    const inPlaceTab = path === '/gallery' ? 'doc' : path === '/folder' ? 'folder' : null;
    if (inPlaceTab) {
      window.dispatchEvent(new CustomEvent('kv:prompt', { detail: { tab: inPlaceTab, text } }));
      return;
    }

    // 3) Otherwise dispatch through the Tier0 router (scoped to this page +
    //    selection + available_actions) and open AI 채팅.
    // 선택의 '내용'을 라우터에 전달(P0-2) — 타입/role을 실어 의도 판단 근거로.
    const bNodes = useBoardStore.getState().nodes;
    const selTypes = [...new Set(boardSelection.map((id) => {
      const n = bNodes[id];
      return n ? String((n.data?.role as string) ?? n.type) : '';
    }).filter(Boolean))];
    void sendToRouter({
      text,
      page: path,
      selection: { ids: boardSelection, types: selTypes, count: boardSelection.length },
      available_actions: availableActions,
    });
    if (!onChatPage) navigate(AI_CHAT_PATH, { viewTransition: true });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    onStarOrSend();
  }

  // Enter to send (Shift+Enter = newline). Typing must not trigger board shortcuts —
  // handled by focus-context separation in useKeyboardShortcuts.
  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      // 한글(IME) 조합을 확정하는 Enter는 전송하지 않는다 — 조기 제출로 마지막 글자가
      // 빠지거나, 조합 확정으로 남은 '줘' 같은 어미가 다음 제출로 새어 나가는 것을 막는다.
      if (e.nativeEvent.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      if (canSend) onStarOrSend();
    }
  }

  // Single morphing bar. Collapsing shrinks the controls into the message pill
  // (orange circle); expanding grows them back — both via CSS transitions.
  // Cross-page movement (Home → AI 채팅) morphs through the shared
  // view-transition-name on the form (kv-pbar-vt).
  return (
    <div className={wrapperClass} style={wrapperStyle}>
      {/* 접힘 = 좁은 박스를 가로 중앙에(이전처럼). 박스를 클릭 통과시키고 아이콘만 클릭 가능. */}
      <div className={`relative ${collapsed ? 'w-auto pointer-events-none' : 'w-full max-w-3xl pointer-events-auto'}`}>
        {favRender && !collapsed && <FavoriteCardRail closing={favClosing} />}

        {/* 보관함 추천 — 입력 텍스트와 태그/주제가 맞는 저장 자료. 클릭 = 복수 선택,
            [배치] 버튼 = 보드 빈 자리에 그리드 정렬, 선택 상태로 프롬프트 제출 =
            배치 후 그 카드들에 명령. 화면 가로 폭(양옆 패딩 제외)을 꽉 채우고
            줄바꿈으로 쌓이며, 3줄을 넘으면 세로 스크롤. */}
        {/* 동영상 작성 모드 — 연결한 이미지 썸네일이 바 바로 위 가로 중앙에 떠 있다.
            ✕로 취소(작성 모드 해제). 이미지 없으면(텍스트→비디오) 라벨만. */}
        {videoCompose && !collapsed && (
          <div className="pointer-events-auto absolute bottom-full left-1/2 z-10 mb-t2 flex -translate-x-1/2 flex-col items-center gap-t1">
            {videoCompose.imageSrc && (
              <div className="relative">
                <img
                  src={videoCompose.imageSrc}
                  alt=""
                  className="h-20 w-20 rounded-lg border border-border object-cover shadow-lg"
                />
                <button
                  type="button"
                  onClick={() => setVideoCompose(null)}
                  title="영상 만들기 취소"
                  className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-pill border border-border bg-surface text-fg-2 shadow-md hover:border-accent hover:text-accent"
                >
                  <Icon name="x" size={13} />
                </button>
              </div>
            )}
            <span className="rounded-pill bg-fg/80 px-t3 py-0.5 text-overline text-on-dark shadow-sm">
              🎬 {videoCompose.imageSrc ? '이 이미지로 영상 만들기' : '영상 만들기'}
            </span>
          </div>
        )}

        {libRender && !collapsed && !favRender && !videoCompose && (
          <div
            data-kv-lib
            className="pointer-events-auto absolute bottom-full left-1/2 z-0 flex -translate-x-1/2 flex-col items-center gap-t2"
            style={{ marginBottom: streaming && statusDetached ? 52 : 8 }}
          >
            {(assetSel.length > 0 || webSel.length > 0) && (
              <div className="flex items-center gap-t2" style={{ opacity: libShown ? 1 : 0, transition: 'opacity 150ms ease' }}>
                {assetSel.length > 0 && (
                  <button
                    type="button"
                    onClick={applySelectedAssets}
                    className="rounded-pill bg-accent px-t6 py-t2 text-sm font-semibold text-on-accent shadow-md transition-opacity duration-150 ease-soft hover:opacity-90"
                  >
                    선택한 자료 {assetSel.length}개 배치
                  </button>
                )}
                {webSel.length > 0 && (
                  <button
                    type="button"
                    onClick={applySelectedWebLinks}
                    className="rounded-pill bg-accent px-t6 py-t2 text-sm font-semibold text-on-accent shadow-md transition-opacity duration-150 ease-soft hover:opacity-90"
                  >
                    선택한 웹 자료 {webSel.length}개 배치
                  </button>
                )}
              </div>
            )}
            {/* 게임 추천 — 키워드 매칭 시 테마×메커니즘 카드(가로 줄바꿈+스크롤). 클릭 → 즉시 합성. */}
            {gameSugs.length > 0 && (
              <div className="relative w-max" style={{ maxWidth: `calc(100vw - ${(leftInset || 64) + 48}px)` }}>
                <div
                  className="absolute inset-0 rounded-lg border border-border bg-surface/95 shadow-lg backdrop-blur"
                  style={libBoxStyle(gameSugs.length, libShown, prefersReduced, gameBoxOrder, libBoxCount)}
                />
                <div className="relative p-t2">
                  <span
                    className="mb-t1 flex items-center gap-t1 px-1 text-overline text-fg-2"
                    style={libBoxStyle(gameSugs.length, libShown, prefersReduced, gameBoxOrder, libBoxCount)}
                  >
                    <Icon name="sparkle" size={12} className="text-accent" /> 게임
                  </span>
                  {/* 보관함 이미지 카드와 동일한 톤앤매너 — 썸네일(메커니즘 타일) + 이름. */}
                  <div className="flex w-full flex-wrap items-start gap-t2 overflow-y-auto p-1" style={{ maxHeight: 200 }}>
                    {gameSugs.map((s, i) => (
                      <div key={s.key} className="shrink-0" style={libItemStyle(i, gameSugs.length, libShown, prefersReduced, gameBoxOrder, libBoxCount)}>
                        <button
                          type="button"
                          title={`'${s.label}' 게임 바로 만들기`}
                          onClick={() => pickGame(s)}
                          className="group w-[76px] rounded-sm border border-border bg-surface p-1 text-center shadow-sm transition-colors duration-150 ease-soft hover:border-accent"
                        >
                          <span className="flex h-14 w-full items-center justify-center rounded-xs bg-surface-2">
                            <span aria-hidden className="text-2xl leading-none">{s.emoji}</span>
                          </span>
                          <span className="mt-0.5 block truncate text-[10px] font-medium text-fg-2 group-hover:text-accent">
                            {s.label}
                          </span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {/* 보관함 이미지 — w-max로 콘텐츠 핏(가운데 정렬), 넘치면 max-width에서 줄바꿈.
                배경(테두리·그림자)은 별 레이어라 아이템이 다 나온 뒤 페이드인한다. */}
            {assetSugs.length > 0 && (
              <div className="relative w-max" style={{ maxWidth: `calc(100vw - ${(leftInset || 64) + 48}px)` }}>
                <div
                  className="absolute inset-0 rounded-lg border border-border bg-surface/95 shadow-lg backdrop-blur"
                  style={libBoxStyle(assetSugs.length, libShown, prefersReduced, assetBoxOrder, libBoxCount)}
                />
                <div className="relative flex w-full flex-wrap items-start gap-t2 overflow-y-auto p-t2" style={{ maxHeight: 200 }}>
                  {assetSugs.map((a, i) => {
                    const selected = assetSel.includes(assetKey(a));
                    return (
                      <div key={assetKey(a)} className="shrink-0" style={libItemStyle(i, assetSugs.length, libShown, prefersReduced, assetBoxOrder, libBoxCount)}>
                        <button
                          type="button"
                          title={selected ? `'${a.tag}' 선택 해제` : `'${a.tag}' 선택`}
                          onClick={() => {
                            setAssetSel((sel) =>
                              sel.includes(assetKey(a)) ? sel.filter((k) => k !== assetKey(a)) : [...sel, assetKey(a)],
                            );
                          }}
                          className={`group w-[72px] rounded-sm border bg-surface p-1 text-center shadow-sm transition-colors duration-150 ease-soft ${
                            selected ? 'border-accent ring-2 ring-accent/40' : 'border-border hover:border-accent'
                          }`}
                        >
                          <span className="relative block">
                            <img src={a.url} alt={a.tag} draggable={false} className="h-14 w-full rounded-xs object-cover" />
                            {a.kind === 'video' && (
                              <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                                <span className="flex h-7 w-7 items-center justify-center rounded-pill bg-accent text-white shadow-md ring-2 ring-white/70">
                                  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden className="ml-0.5">
                                    <path d="M8 5.5v13l11-6.5z" />
                                  </svg>
                                </span>
                              </span>
                            )}
                          </span>
                          <span
                            className={`mt-0.5 block truncate text-[10px] font-medium ${
                              selected ? 'text-accent' : 'text-fg-2 group-hover:text-accent'
                            }`}
                          >
                            {a.tag}
                          </span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {webSugs.length > 0 && (
              <div className="relative w-max" style={{ maxWidth: `calc(100vw - ${(leftInset || 64) + 48}px)` }}>
                <div
                  className="absolute inset-0 rounded-lg border border-border bg-surface/95 shadow-lg backdrop-blur"
                  style={libBoxStyle(webSugs.length, libShown, prefersReduced, webBoxOrder, libBoxCount)}
                />
                {/* 라벨은 flex-wrap 밖 헤더로 — flex-wrap의 max-content가 '라벨+썸네일을
                    한 줄'로 합산해 박스가 넓어지던 문제를 피한다(썸네일 기준으로만 콘텐츠 핏). */}
                <div className="relative p-t2">
                  <span
                    className="mb-t1 flex items-center gap-t1 px-1 text-overline text-fg-2"
                    style={libBoxStyle(webSugs.length, libShown, prefersReduced, webBoxOrder, libBoxCount)}
                  >
                    <Icon name="search" size={12} className="text-accent" /> 웹 자료 보관함
                  </span>
                  <div className="flex flex-wrap items-start gap-t2 overflow-y-auto" style={{ maxHeight: 140 }}>
                  {webSugs.map((s, i) => {
                    const selected = webSel.includes(s.url);
                    const favicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(s.domain || s.title)}&sz=64`;
                    return (
                      <div key={s.url} className="shrink-0" style={libItemStyle(i, webSugs.length, libShown, prefersReduced, webBoxOrder, libBoxCount)}>
                        <button
                          type="button"
                          title={selected ? `'${s.title}' 선택 해제` : `'${s.title}' 선택 — ${s.url}`}
                          onClick={() => {
                            setWebSel((sel) => (sel.includes(s.url) ? sel.filter((u) => u !== s.url) : [...sel, s.url]));
                          }}
                          className={`group flex w-[112px] flex-col items-center rounded-sm border bg-surface p-1 text-center shadow-sm transition-colors duration-150 ease-soft ${
                            selected ? 'border-accent ring-2 ring-accent/40' : 'border-border hover:border-accent'
                          }`}
                        >
                          {s.thumb ? (
                            // 대표 이미지 썸네일. 로드 실패 시 파비콘으로 폴백.
                            <img
                              src={s.thumb}
                              alt={s.title}
                              draggable={false}
                              loading="lazy"
                              onError={(e) => {
                                e.currentTarget.src = favicon;
                                e.currentTarget.className = 'h-8 w-8 rounded-sm';
                              }}
                              className="h-14 w-full rounded-xs object-cover"
                            />
                          ) : (
                            <img src={favicon} alt="" draggable={false} className="h-8 w-8 rounded-sm" />
                          )}
                          <span
                            className={`mt-0.5 block w-full truncate text-[10px] font-medium ${
                              selected ? 'text-accent' : 'text-fg-2 group-hover:text-accent'
                            }`}
                          >
                            {s.title}
                          </span>
                          {s.domain && s.domain !== s.title && (
                            <span className="block w-full truncate text-[9px] text-fg-muted">{s.domain}</span>
                          )}
                        </button>
                      </div>
                    );
                  })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 분리된 진행 스트립 — 입력창을 클릭해 되찾으면 스트리밍이 바 '바로 위'에서
            계속된다. 입력창은 플레이스홀더로 복귀, 제출하면 생성이 병렬로 추가. */}
        {streaming && statusDetached && !collapsed && (
          <div className="pointer-events-none absolute bottom-full left-1/2 z-0 mb-t2 -translate-x-1/2">
            <div className="flex items-center gap-t2 rounded-pill border border-border bg-surface/95 py-1.5 pl-t2 pr-t3 shadow-md backdrop-blur">
              <svg className="kv-spin-smooth shrink-0 text-accent" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                <path d="M20.5 12A8.5 8.5 0 0 0 12 3.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
              <span className="max-w-[26rem] truncate font-sans text-sm font-medium text-fg-2">
                {boardGenerating ?? genText}
              </span>
              {genActive > 1 && (
                <span className="shrink-0 rounded-pill bg-accent-soft px-t2 py-0.5 text-[10px] font-semibold text-accent">
                  {genActive}개 작업
                </span>
              )}
            </div>
          </div>
        )}

        {/* 업로드 첨부 트레이 — 이미지 썸네일/문서 칩. ✕로 제거. 전송 시 보드에 카드로
            올라가 그 자료에 대한 생성/명령으로 처리된다. */}
        {attachments.length > 0 && !collapsed && (
          <div className="pointer-events-auto mx-auto mb-t2 flex w-full max-w-3xl flex-wrap items-center gap-t2 px-t2">
            {attachments.map((att) => (
              <div
                key={att.id}
                className="relative flex items-center gap-t2 rounded-lg border border-border bg-surface/95 py-t1 pl-t1 pr-t6 shadow-sm backdrop-blur"
              >
                {att.kind === 'image' ? (
                  <img src={att.dataUrl} alt={att.name} className="h-10 w-10 rounded-md border border-border object-cover" />
                ) : (
                  <span className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-surface-2 text-fg-2">
                    <Icon name="memo" size={18} />
                  </span>
                )}
                <span className="max-w-[10rem] truncate text-xs font-medium text-fg-2">{att.name}</span>
                <button
                  type="button"
                  onClick={() => setAttachments((a) => a.filter((x) => x.id !== att.id))}
                  title="첨부 제거"
                  className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-pill border border-border bg-surface text-fg-2 shadow-sm hover:border-accent hover:text-accent"
                >
                  <Icon name="x" size={11} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className={`kv-pbar-glow ${!collapsed && selChipCount > 0 ? 'kv-pbar-glow-on' : ''}`}>
        <form
          onSubmit={onSubmit}
          className={`kv-pbar-vt relative z-10 mx-auto flex w-full items-end overflow-hidden rounded-2xl border py-t4 transition-all duration-300 ease-soft ${
            collapsed
              ? 'max-w-[3.25rem] gap-0 border-transparent bg-transparent shadow-none'
              : `max-w-3xl gap-t2 px-t2 pl-t3 kv-pbar-glass backdrop-blur shadow-lg ${
                  streaming ? 'kv-pbar-streaming' : selChipCount > 0 ? 'kv-pbar-selected' : 'border-border'
                }`
          }`}
        >
          {/* Message icon — collapsed: orange expand pill · expanded: AI 채팅 nav */}
          <button
            type="button"
            aria-label={collapsed ? '프롬프트바 펼치기' : 'AI 채팅으로 이동'}
            aria-current={!collapsed && onChatPage ? 'page' : undefined}
            onClick={onMessageIcon}
            className={`pointer-events-auto flex shrink-0 items-center justify-center rounded-pill transition-all duration-300 ease-soft ${
              collapsed
                ? 'h-12 w-12 bg-accent text-on-accent shadow-pop hover:scale-105'
                : `h-10 w-10 hover:bg-surface-3 ${onChatPage ? 'text-accent' : 'text-fg-2'}`
            }`}
          >
            <Icon name="message" size={20} />
          </button>

          {/* Collapsible controls — shrink to zero width while closing */}
          <div
            aria-hidden={collapsed}
            className={`flex items-end gap-t2 overflow-hidden transition-[max-width,opacity] duration-300 ease-soft ${
              collapsed ? 'max-w-0 flex-none opacity-0' : 'max-w-full flex-1 opacity-100'
            }`}
          >
            {/* + add — 이미지/텍스트 문서 업로드 → 그와 관련한 생성 요청 */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.txt,.md,.markdown,.csv,.json,text/*"
              multiple
              hidden
              onChange={onPickFiles}
            />
            <button
              type="button"
              aria-label="이미지·문서 첨부"
              title="이미지·텍스트 문서 업로드 — 그 자료로 생성을 요청해요"
              tabIndex={collapsed ? -1 : 0}
              onClick={() => fileInputRef.current?.click()}
              className="flex h-10 w-10 shrink-0 items-center justify-center self-end rounded-pill text-fg-2 transition-colors duration-150 ease-soft hover:bg-surface-3"
            >
              <Icon name="plus" size={20} />
            </button>

            {/* Selection scope chip — the bar's command targets these elements
                (board cards · or interactive-node elements when its overlay is open) */}
            {selChipCount > 0 && !statusInline && (
              <span className="flex shrink-0 items-center gap-t1 self-center rounded-pill bg-accent-soft px-t2 py-1 text-xs font-semibold text-accent">
                <Icon name={inodeFs ? 'cursor' : 'board'} size={12} /> {inodeFs ? '요소 ' : ''}{selChipCount}개 선택
              </span>
            )}

            {/* Input — 생성 중에는 실제 진행 단계가 라이브로 스트리밍된다
                (보드: boardStore.generating · 그 외: 키워드 타이핑).
                클릭하면 진행 표시가 바 위 스트립으로 분리되고 입력창이 돌아온다. */}
            {statusInline ? (
              <div
                role="button"
                title="클릭해서 추가로 입력하기 (생성은 계속 진행돼요)"
                onClick={() => {
                  setStatusDetached(true);
                  setTimeout(() => inputRef.current?.focus(), 0);
                }}
                className="flex min-h-[40px] flex-1 cursor-text items-center gap-t2 self-center px-t1 py-t2"
              >
                {!boardGenerating && <Icon name="sparkle" size={16} className="text-accent" />}
                <span className="truncate font-sans text-body font-medium text-fg">
                  {boardGenerating ?? genText}
                </span>
                <span className="ml-0.5 flex shrink-0 items-center gap-0.5">
                  <span className="kv-typing-dot h-1 w-1 rounded-full bg-fg-muted" />
                  <span className="kv-typing-dot h-1 w-1 rounded-full bg-fg-muted" style={{ animationDelay: '0.15s' }} />
                  <span className="kv-typing-dot h-1 w-1 rounded-full bg-fg-muted" style={{ animationDelay: '0.3s' }} />
                </span>
              </div>
            ) : (
              <textarea
                ref={inputRef}
                rows={1}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                tabIndex={collapsed ? -1 : 0}
                placeholder={placeholder}
                className="min-h-[40px] flex-1 resize-none self-end overflow-hidden bg-transparent px-t1 py-t2 font-sans text-body text-fg placeholder:text-fg-muted focus:outline-none"
              />
            )}

            {/* Behavior 2/3 — star (empty, coral) ↔ send (typed) ↔ spinner (generating) */}
            <button
              type="submit"
              disabled={statusInline || collapsed}
              aria-label={statusInline ? (hoverStop ? '생성 중단' : '생성 중') : canSend ? '전송' : '즐겨찾기 작업'}
              aria-pressed={!hasText && favoritesOpen}
              tabIndex={collapsed ? -1 : 0}
              onMouseEnter={() => setHoverStop(true)}
              onMouseLeave={() => setHoverStop(false)}
              title={statusInline ? (hoverStop ? '생성 중단' : '생성 중 — 호버하면 중단') : undefined}
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-pill transition-colors duration-150 ease-soft ${
                statusInline
                  ? hoverStop
                    ? 'cursor-pointer bg-fg text-on-dark' // 정지 모드 — 잉크색으로 분명하게
                    : 'cursor-wait bg-accent text-on-accent'
                  : hasText
                    ? 'bg-accent text-on-accent hover:bg-accent-hover'
                    : favoritesOpen
                      ? 'bg-accent-hover text-on-accent'
                      : 'bg-accent text-on-accent hover:bg-accent-hover'
              }`}
            >
              {statusInline ? (
                hoverStop ? (
                  // 정지(■) — 클릭하면 진행 중인 생성을 즉시 중단.
                  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
                    <rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" />
                  </svg>
                ) : (
                  // 트랙(연한 링) + 아크 + 선두 점 — 부드럽게 도는 생성 스피너.
                  <svg className="kv-spin-smooth" width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2.5" />
                    <path d="M20.5 12A8.5 8.5 0 0 0 12 3.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                    <circle cx="12" cy="3.5" r="2" fill="currentColor" />
                  </svg>
                )
              ) : (
                <Icon name={canSend ? 'send' : 'star'} size={18} fill={!canSend && favoritesOpen ? 'currentColor' : 'none'} />
              )}
            </button>

            {/* Behavior 4 — right round toggle → collapse */}
            <button
              type="button"
              aria-label="프롬프트바 접기"
              onClick={togglePromptBar}
              tabIndex={collapsed ? -1 : 0}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill border border-border text-fg-muted transition-colors duration-150 ease-soft hover:bg-surface-3"
            >
              <Icon name="chevronDown" size={18} />
            </button>
          </div>
        </form>
        </div>

        {/* AI 면책 안내 — AI 채팅 페이지에서만, 펼쳐졌을 때 */}
        {onChatPage && !collapsed && (
          <p className="pointer-events-none mt-t2 px-t4 text-center text-xs leading-snug text-fg-muted">
            AI가 생성한 내용은 부정확할 수 있어요. 아동 관찰·평가는 근거(사진·메모)를 확인하세요.
          </p>
        )}

        {/* 보드 등에서도 AI 채팅과 같은 높이로 바·글로우를 띄우기 위한 빈 자리.
            안내문(면책 텍스트)은 넣지 않고, 동일한 한 줄 박스만 예약한다.
            접힘 상태에서도 같은 자리를 예약해 아이콘 세로 위치가 펼침과 동일하게 유지된다. */}
        {docked && !onChatPage && (
          <div aria-hidden className="pointer-events-none mt-t2 px-t4 text-xs leading-snug" role="presentation">
            &nbsp;
          </div>
        )}
      </div>
    </div>
  );
}
