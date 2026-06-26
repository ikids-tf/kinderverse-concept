import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useBoardStore } from '@/store/boardStore';
import { useBoardsStore } from '@/store/boardsStore';
import { kindFromFavorite } from '@/board/seed';
import { BoardCanvas } from '@/components/board/BoardCanvas';
import { BoardTray } from '@/components/board/BoardTray';
import { BoardToolbar } from '@/components/board/BoardToolbar';
import { BoardControls } from '@/components/board/BoardControls';
import { BoardSwitcher } from '@/components/board/BoardSwitcher';
import { PromptChoiceDialog } from '@/components/board/PromptChoiceDialog';

/* My Board = 통합 캔버스 (SKILL §6, PRD §4.2). 멀티 보드: 즐겨찾기/추가로 만든
   각 보드(캔버스)를 전환하며 사용. `?new=<kind>`는 시드된 새 보드를 만든다.
   좁은 화면은 보드 리스트로 폴백(R5). */

export function MyBoardPage() {
  const [params, setParams] = useSearchParams();
  const boards = useBoardsStore((s) => s.boards);
  const activeId = useBoardsStore((s) => s.activeId);
  const createBoard = useBoardsStore((s) => s.createBoard);
  const switchBoard = useBoardsStore((s) => s.switchBoard);
  const saveActiveLive = useBoardsStore((s) => s.saveActiveLive);
  const nodes = useBoardStore((s) => s.nodes);
  const lanes = useBoardStore((s) => s.lanes);
  const handled = useRef(false);

  // Seed a board from ?new= once, or ensure at least one board exists.
  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    const req = params.get('new');
    if (req) {
      createBoard(kindFromFavorite(req));
      setParams({}, { replace: true });
    } else if (!useBoardsStore.getState().activeId) {
      createBoard('general', '기본 보드');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist live edits into the active snapshot when leaving the board.
  useEffect(() => () => saveActiveLive(), [saveActiveLive]);

  const empty = Object.keys(lanes).length === 0 && Object.keys(nodes).length === 0;

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Wide: canvas */}
      <div className="hidden h-full w-full md:block">
        <BoardCanvas />
        <BoardSwitcher />
        <BoardToolbar />
        <BoardControls />
        <PromptChoiceDialog />
        <BoardTray />
        {empty && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <p className="font-display text-h2 text-fg-2">빈 보드</p>
            <p className="mt-t2 max-w-sm text-body text-fg-muted">
              왼쪽 툴바로 카드를 추가하거나, 프롬프트바의 즐겨찾기로 콘텐츠에 맞춘 새 보드를 만들어 보세요.
            </p>
          </div>
        )}
      </div>

      {/* Narrow: board-list fallback (R5) */}
      <div className="block h-full overflow-auto px-t5 pt-t6 pb-40 md:hidden">
        <h1 className="font-display text-h2 font-semibold text-fg">My Board</h1>
        <p className="mt-t2 text-sm text-fg-2">작은 화면에서는 보드 리스트로 표시됩니다.</p>
        <div className="mt-t5 flex flex-col gap-t3">
          {boards.map((b) => (
            <button
              key={b.id}
              onClick={() => switchBoard(b.id)}
              className={`rounded-xl border p-t4 text-left shadow-sm transition-colors duration-150 ease-soft ${
                b.id === activeId ? 'border-accent bg-accent-soft' : 'border-border bg-surface hover:bg-surface-2'
              }`}
            >
              <div className="text-overline text-fg-muted">{b.kind}</div>
              <div className="font-display text-h4 text-fg">{b.title}</div>
            </button>
          ))}
          <button
            onClick={() => createBoard('general')}
            className="rounded-xl border border-dashed border-border px-t4 py-t3 text-sm text-fg-2"
          >
            + 보드 추가
          </button>
        </div>
      </div>
    </div>
  );
}
