import { useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '@/lib/icons';
import { AI_CHAT_PATH } from '@/lib/nav';
import { useUIStore } from '@/store/uiStore';
import { useRouterStore } from '@/store/routerStore';
import { useBoardStore } from '@/store/boardStore';
import { FavoriteCardRail } from './FavoriteCardRail';

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

export function PromptBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

  // Behavior 1 — message icon.
  function onMessageIcon() {
    if (collapsed) {
      setCollapsed(false); // expand trigger when collapsed
      return;
    }
    if (!onChatPage) navigate(AI_CHAT_PATH);
  }

  // Behavior 2/3 — star (empty) vs send (typed).
  function onStarOrSend() {
    if (hasText) {
      // Dispatch through the Tier0 router (M2). Selection = scope; the current
      // page's available_actions bound where it can route.
      const text = draft.trim();
      setDraft('');
      setFavoritesOpen(false);
      void sendToRouter({
        text,
        page: location.pathname,
        selection: {
          ids: boardSelection,
          types: [],
          count: boardSelection.length,
        },
        available_actions: availableActions,
      });
      if (!onChatPage) navigate(AI_CHAT_PATH);
    } else {
      toggleFavorites(); // raise the favorite card rail
    }
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

  // --- Collapsed state: only the message icon remains. ---
  if (collapsed) {
    return (
      <div
        className="kv-promptbar pointer-events-none absolute inset-x-0 bottom-0 z-40 flex justify-center px-t4"
        style={{ paddingLeft: leftInset || undefined }}
      >
        <button
          type="button"
          aria-label="프롬프트바 펼치기"
          onClick={onMessageIcon}
          className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-pill bg-fg text-on-dark shadow-pop transition-transform duration-150 ease-soft hover:scale-105"
        >
          <Icon name="message" size={20} />
        </button>
      </div>
    );
  }

  return (
    <div
      className="kv-promptbar pointer-events-none absolute inset-x-0 bottom-0 z-40 flex justify-center px-t4"
      style={{ paddingLeft: leftInset || undefined }}
    >
      <div className="pointer-events-auto w-full max-w-3xl">
        {favoritesOpen && <FavoriteCardRail />}

        <form
          onSubmit={onSubmit}
          className="flex items-end gap-t2 rounded-2xl border border-border bg-surface/95 p-t2 pl-t3 shadow-lg backdrop-blur"
        >
          {/* Behavior 1 — left message icon → AI 채팅 */}
          <button
            type="button"
            aria-label="AI 채팅으로 이동"
            aria-current={onChatPage ? 'page' : undefined}
            onClick={onMessageIcon}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-pill transition-colors duration-150 ease-soft hover:bg-surface-3 ${
              onChatPage ? 'text-accent' : 'text-fg-2'
            }`}
          >
            <Icon name="message" size={20} />
          </button>

          {/* + add (placeholder for attachments/context, wired later) */}
          <button
            type="button"
            aria-label="추가"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill text-fg-2 transition-colors duration-150 ease-soft hover:bg-surface-3"
          >
            <Icon name="plus" size={20} />
          </button>

          {/* Input */}
          <textarea
            ref={inputRef}
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="무엇이든 말하거나, 보드에서 대상을 선택해 명령하세요"
            className="max-h-32 min-h-[40px] flex-1 resize-none self-center bg-transparent px-t1 py-t2 font-sans text-body text-fg placeholder:text-fg-muted focus:outline-none"
          />

          {/* Behavior 2/3 — star (empty) ↔ send (typed) */}
          <button
            type="submit"
            aria-label={hasText ? '전송' : '즐겨찾기 작업'}
            aria-pressed={!hasText && favoritesOpen}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-pill transition-colors duration-150 ease-soft ${
              hasText
                ? 'bg-accent text-on-accent hover:bg-accent-hover'
                : favoritesOpen
                  ? 'bg-accent-soft text-accent'
                  : 'text-accent hover:bg-accent-soft'
            }`}
          >
            <Icon name={hasText ? 'send' : 'star'} size={18} fill={!hasText && favoritesOpen ? 'currentColor' : 'none'} />
          </button>

          {/* Behavior 4 — right round toggle → collapse */}
          <button
            type="button"
            aria-label="프롬프트바 접기"
            onClick={togglePromptBar}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill border border-border text-fg-muted transition-colors duration-150 ease-soft hover:bg-surface-3"
          >
            <Icon name="chevronDown" size={18} />
          </button>
        </form>
      </div>
    </div>
  );
}
