import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { LNB, BottomTabs } from './LNB';
import { PromptBar } from './PromptBar';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { actionsForPath } from '@/ai/actions';
import { useUIStore } from '@/store/uiStore';

/* App shell (SKILL.md §5).
   Cream canvas, left icon rail (wide) / bottom tabs (narrow), persistent prompt
   bar. The global keyboard handler + undo/redo history are mounted here so they
   live for the whole app session. */

export function AppShell() {
  useKeyboardShortcuts();

  // Register the current page's available_actions so the router only routes
  // within that set (SKILL §3 rule 2, §6.2).
  const location = useLocation();
  const setAvailableActions = useUIStore((s) => s.setAvailableActions);
  useEffect(() => {
    setAvailableActions(actionsForPath(location.pathname));
  }, [location.pathname, setAvailableActions]);

  return (
    <div className="kv-shell flex h-full w-full overflow-hidden bg-bg">
      {/* Left rail — hidden on narrow via container query */}
      <aside className="kv-rail-slot shrink-0">
        <LNB />
      </aside>

      {/* Main column — `relative` so the prompt bar anchors to THIS column
          (clearing the left rail) instead of the whole viewport. */}
      <div className="relative flex min-w-0 flex-1 flex-col">
        <main className="min-h-0 flex-1 overflow-auto">
          <Outlet />
        </main>

        {/* Bottom tabs — shown on narrow via container query */}
        <div className="kv-bottomtabs-slot shrink-0">
          <BottomTabs />
        </div>

        {/* Persistent prompt bar — centered within this content column */}
        <PromptBar />
      </div>
    </div>
  );
}
