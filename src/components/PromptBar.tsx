import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '@/lib/icons';
import { AI_CHAT_PATH } from '@/lib/nav';
import { useUIStore } from '@/store/uiStore';
import { useRouterStore } from '@/store/routerStore';
import { useBoardStore } from '@/store/boardStore';
import { handleBoardPrompt } from '@/board/prompt';
import { FavoriteCardRail } from './FavoriteCardRail';

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

  // Behavior 2/3 — star (empty) vs send (typed).
  function onStarOrSend() {
    if (generating) return;
    if (hasText) {
      void runGeneration(draft.trim());
    } else {
      toggleFavorites(); // raise the favorite card rail
    }
  }

  // Stream the core generation steps (keywords only) into the input, then dispatch.
  async function runGeneration(text: string) {
    genCancel.current = false;
    setGenerating(true);
    setFavoritesOpen(false);
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
    if (path.startsWith('/board')) {
      handleBoardPrompt(text);
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
    void sendToRouter({
      text,
      page: path,
      selection: { ids: boardSelection, types: [], count: boardSelection.length },
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
      <div className={`pointer-events-auto ${collapsed ? 'w-auto' : 'w-full max-w-3xl'}`}>
        {favRender && !collapsed && <FavoriteCardRail closing={favClosing} />}

        <form
          onSubmit={onSubmit}
          className={`kv-pbar-vt relative z-10 mx-auto flex w-full items-center overflow-hidden rounded-2xl border backdrop-blur transition-all duration-300 ease-soft ${
            collapsed
              ? 'max-w-[3.25rem] gap-0 border-transparent bg-transparent p-0 shadow-none'
              : 'max-w-3xl gap-t2 border-border bg-surface/95 p-t2 pl-t3 shadow-lg'
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
            {boardSelectionCount > 0 && !generating && (
              <span className="flex shrink-0 items-center gap-t1 self-center rounded-pill bg-accent-soft px-t2 py-1 text-xs font-semibold text-accent">
                <Icon name="board" size={12} /> {boardSelectionCount}개 선택
              </span>
            )}

            {/* Input — replaced by streaming keyword steps while generating */}
            {generating ? (
              <div className="flex min-h-[40px] flex-1 items-center gap-t2 self-center px-t1 py-t2">
                <Icon name="sparkle" size={16} className="text-accent" />
                <span className="font-sans text-body font-medium text-fg">{genText}</span>
                <span className="ml-0.5 flex items-center gap-0.5">
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
              disabled={generating || collapsed}
              aria-label={generating ? '생성 중' : hasText ? '전송' : '즐겨찾기 작업'}
              aria-pressed={!hasText && favoritesOpen}
              tabIndex={collapsed ? -1 : 0}
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-pill transition-colors duration-150 ease-soft ${
                generating
                  ? 'cursor-wait bg-accent text-on-accent'
                  : hasText
                    ? 'bg-accent text-on-accent hover:bg-accent-hover'
                    : favoritesOpen
                      ? 'bg-accent-hover text-on-accent'
                      : 'bg-accent text-on-accent hover:bg-accent-hover'
              }`}
            >
              {generating ? (
                <span className="kv-spin h-[18px] w-[18px] rounded-full border-2 border-white/40 border-t-white" />
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
