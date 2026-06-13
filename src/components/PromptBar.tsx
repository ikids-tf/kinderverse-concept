import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '@/lib/icons';
import { AI_CHAT_PATH } from '@/lib/nav';
import { useUIStore } from '@/store/uiStore';
import { useRouterStore } from '@/store/routerStore';
import { useBoardStore } from '@/store/boardStore';
import type { ImageAsset } from '@/board/assets';
import type { WebLink } from '@/board/webLinks';
import { FavoriteCardRail } from './FavoriteCardRail';

/* Board engine modules (prompt/workflow/assets) are heavy and only needed on My
   Board, so they're loaded on demand (keeps them out of the initial bundle). */

// Core generation steps (keywords only) streamed into the input on send.
const GEN_STEPS = ['의도 분석', '자료 구성', '초안 생성', '누리과정 연계', '마무리'];
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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

export function PromptBar({ variant = 'docked' }: { variant?: 'docked' | 'inline' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

  const sendToRouter = useRouterStore((s) => s.send);
  const boardSelection = useBoardStore((s) => s.selection);

  const leftInset = useUIStore((s) => s.promptBarLeftInset);
  const hasText = draft.trim().length > 0;
  const onChatPage = location.pathname === AI_CHAT_PATH;

  // 보관함 추천 — 보드에서 2자 이상 입력하면 태그/주제가 맞는 저장 자료를 바 위에
  // 카드로 띄운다. 클릭 = 복수 선택 토글 → [배치] 버튼 또는 프롬프트 제출로 적용.
  const [assetSugs, setAssetSugs] = useState<ImageAsset[]>([]);
  const [assetSel, setAssetSel] = useState<string[]>([]); // 클릭 순서 유지(배치 순서)
  const assetKey = (a: ImageAsset) => `${a.tag}-${a.createdAt}`;
  useEffect(() => {
    if (!location.pathname.startsWith('/board') || draft.trim().length < 2) {
      setAssetSugs([]);
      setAssetSel([]);
      return;
    }
    const t = setTimeout(() => {
      void import('@/board/assets')
        .then((m) => m.searchAssets(draft.trim()))
        .then((sugs) => {
          setAssetSugs(sugs);
          // 목록이 바뀌면 더 이상 보이지 않는 선택은 비운다.
          const keys = new Set(sugs.map((a) => `${a.tag}-${a.createdAt}`));
          setAssetSel((sel) => sel.filter((k) => keys.has(k)));
        })
        .catch(() => setAssetSugs([]));
    }, 160);
    return () => clearTimeout(t);
  }, [draft, location.pathname]);

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
    if (!location.pathname.startsWith('/board') || draft.trim().length < 2) {
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
  }, [draft, location.pathname]);

  /** 선택한 웹링크를 한 장의 웹 자료 카드로 보드(뷰포트 중앙)에 배치. */
  function applySelectedWebLinks() {
    const chosen = webSel
      .map((u) => webSugs.find((s) => s.url === u))
      .filter((s): s is WebLink => !!s);
    if (chosen.length === 0) return;
    setWebSel([]);
    void import('@/board/composer').then((m) => m.placeWebLinksOnBoard(chosen));
  }

  // Keep the favorites rail mounted briefly after closing so it can play the
  // reverse animation (cards descend back behind the bar) before unmounting.
  const [favRender, setFavRender] = useState(false);
  const [favClosing, setFavClosing] = useState(false);
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
  const boardSelectionCount = location.pathname.startsWith('/board') ? boardSelection.length : 0;
  const placeholder = (() => {
    const p = location.pathname;
    if (p.startsWith('/board')) {
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
    if (hasText) {
      void runGeneration(draft.trim());
    } else {
      toggleFavorites(); // raise the favorite card rail
    }
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
      e.preventDefault();
      if (hasText) onStarOrSend();
    }
  }

  // Single morphing bar. Collapsing shrinks the controls into the message pill
  // (orange circle); expanding grows them back — both via CSS transitions.
  // Cross-page movement (Home → AI 채팅) morphs through the shared
  // view-transition-name on the form (kv-pbar-vt).
  return (
    <div className={wrapperClass} style={wrapperStyle}>
      <div className={`pointer-events-auto relative ${collapsed ? 'w-auto' : 'w-full max-w-3xl'}`}>
        {favRender && !collapsed && <FavoriteCardRail closing={favClosing} />}

        {/* 보관함 추천 — 입력 텍스트와 태그/주제가 맞는 저장 자료. 클릭 = 복수 선택,
            [배치] 버튼 = 보드 빈 자리에 그리드 정렬, 선택 상태로 프롬프트 제출 =
            배치 후 그 카드들에 명령. 화면 가로 폭(양옆 패딩 제외)을 꽉 채우고
            줄바꿈으로 쌓이며, 3줄을 넘으면 세로 스크롤. */}
        {(assetSugs.length > 0 || webSugs.length > 0) && !collapsed && !favRender && (
          <div
            className="pointer-events-auto absolute bottom-full left-1/2 z-0 flex -translate-x-1/2 flex-col items-center gap-t2"
            style={{
              marginBottom: streaming && statusDetached ? 52 : 8,
              width: `calc(100vw - ${(leftInset || 64) + 48}px)`,
            }}
          >
            {(assetSel.length > 0 || webSel.length > 0) && (
              <div className="flex items-center gap-t2">
                {assetSel.length > 0 && (
                  <button
                    type="button"
                    onClick={applySelectedAssets}
                    className="rounded-pill bg-accent px-t6 py-t2 text-sm font-semibold text-on-accent shadow-md transition-opacity duration-150 ease-soft hover:opacity-90"
                  >
                    선택한 이미지 {assetSel.length}개 배치
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
            {assetSugs.length > 0 && (
              <div className="flex max-h-[200px] w-full flex-wrap items-start gap-t2 overflow-y-auto rounded-lg border border-border bg-surface/95 p-t2 shadow-lg backdrop-blur">
                {assetSugs.map((a) => {
                  const selected = assetSel.includes(assetKey(a));
                  return (
                    <button
                      key={assetKey(a)}
                      type="button"
                      title={selected ? `'${a.tag}' 선택 해제` : `'${a.tag}' 선택`}
                      onClick={() => {
                        setAssetSel((sel) =>
                          sel.includes(assetKey(a)) ? sel.filter((k) => k !== assetKey(a)) : [...sel, assetKey(a)],
                        );
                      }}
                      className={`group w-[72px] shrink-0 rounded-sm border bg-surface p-1 text-center shadow-sm transition-colors duration-150 ease-soft ${
                        selected ? 'border-accent ring-2 ring-accent/40' : 'border-border hover:border-accent'
                      }`}
                    >
                      <img src={a.url} alt={a.tag} draggable={false} className="h-14 w-full rounded-xs object-cover" />
                      <span
                        className={`mt-0.5 block truncate text-[10px] font-medium ${
                          selected ? 'text-accent' : 'text-fg-2 group-hover:text-accent'
                        }`}
                      >
                        {a.tag}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            {webSugs.length > 0 && (
              <div className="flex max-h-[160px] w-full flex-wrap items-start gap-t2 overflow-y-auto rounded-lg border border-border bg-surface/95 p-t2 shadow-lg backdrop-blur">
                <span className="flex w-full items-center gap-t1 px-1 text-overline text-fg-2">
                  <Icon name="search" size={12} className="text-accent" /> 웹 자료 보관함
                </span>
                {webSugs.map((s) => {
                  const selected = webSel.includes(s.url);
                  const favicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(s.domain || s.title)}&sz=64`;
                  return (
                    <button
                      key={s.url}
                      type="button"
                      title={selected ? `'${s.title}' 선택 해제` : `'${s.title}' 선택 — ${s.url}`}
                      onClick={() => {
                        setWebSel((sel) => (sel.includes(s.url) ? sel.filter((u) => u !== s.url) : [...sel, s.url]));
                      }}
                      className={`group flex w-[112px] shrink-0 flex-col items-center rounded-sm border bg-surface p-1 text-center shadow-sm transition-colors duration-150 ease-soft ${
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
                  );
                })}
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

        <form
          onSubmit={onSubmit}
          className={`kv-pbar-vt relative z-10 mx-auto flex w-full items-center overflow-hidden rounded-2xl border backdrop-blur transition-all duration-300 ease-soft ${
            collapsed
              ? 'max-w-[3.25rem] gap-0 border-transparent bg-transparent p-0 shadow-none'
              : `max-w-3xl gap-t2 border-border bg-surface/95 px-t2 py-t4 pl-t3 shadow-lg ${streaming ? 'kv-pbar-streaming' : ''}`
          }`}
        >
          {/* Message icon — collapsed: orange expand pill · expanded: AI 채팅 nav */}
          <button
            type="button"
            aria-label={collapsed ? '프롬프트바 펼치기' : 'AI 채팅으로 이동'}
            aria-current={!collapsed && onChatPage ? 'page' : undefined}
            onClick={onMessageIcon}
            className={`flex shrink-0 items-center justify-center rounded-pill transition-all duration-300 ease-soft ${
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
            {/* + add (placeholder for attachments/context, wired later) */}
            <button
              type="button"
              aria-label="추가"
              tabIndex={collapsed ? -1 : 0}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill text-fg-2 transition-colors duration-150 ease-soft hover:bg-surface-3"
            >
              <Icon name="plus" size={20} />
            </button>

            {/* Selection scope chip — the bar's command targets these elements */}
            {boardSelectionCount > 0 && !statusInline && (
              <span className="flex shrink-0 items-center gap-t1 self-center rounded-pill bg-accent-soft px-t2 py-1 text-xs font-semibold text-accent">
                <Icon name="board" size={12} /> {boardSelectionCount}개 선택
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
                className="max-h-32 min-h-[40px] flex-1 resize-none self-center bg-transparent px-t1 py-t2 font-sans text-body text-fg placeholder:text-fg-muted focus:outline-none"
              />
            )}

            {/* Behavior 2/3 — star (empty, coral) ↔ send (typed) ↔ spinner (generating) */}
            <button
              type="submit"
              disabled={statusInline || collapsed}
              aria-label={statusInline ? (hoverStop ? '생성 중단' : '생성 중') : hasText ? '전송' : '즐겨찾기 작업'}
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
                <Icon name={hasText ? 'send' : 'star'} size={18} fill={!hasText && favoritesOpen ? 'currentColor' : 'none'} />
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

        {/* AI 면책 안내 — AI 채팅 페이지에서만, 펼쳐졌을 때 */}
        {onChatPage && !collapsed && (
          <p className="pointer-events-none mt-t2 px-t4 text-center text-xs leading-snug text-fg-muted">
            AI가 생성한 내용은 부정확할 수 있어요. 아동 관찰·평가는 근거(사진·메모)를 확인하세요.
          </p>
        )}
      </div>
    </div>
  );
}
