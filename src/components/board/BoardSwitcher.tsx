import { useState } from 'react';
import { Icon } from '@/lib/icons';
import { useBoardsStore } from '@/store/boardsStore';
import { KIND_LABEL, type BoardKind } from '@/board/seed';

/* 보드 전환 + 보드 추가 (PRD §4.2). 상단 중앙 플로팅 탭바. */

const ADD_KINDS: BoardKind[] = ['general', 'play_plan', 'play_story', 'observation', 'studio', 'writing'];

export function BoardSwitcher() {
  const boards = useBoardsStore((s) => s.boards);
  const activeId = useBoardsStore((s) => s.activeId);
  const switchBoard = useBoardsStore((s) => s.switchBoard);
  const createBoard = useBoardsStore((s) => s.createBoard);
  const removeBoard = useBoardsStore((s) => s.removeBoard);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="pointer-events-auto absolute left-1/2 top-t3 z-20 flex -translate-x-1/2 items-center gap-t1 rounded-pill border border-border bg-surface/95 p-t1 shadow-md backdrop-blur">
      {/* scrollable tabs */}
      <div className="flex max-w-[46vw] items-center gap-t1 overflow-x-auto">
        {boards.map((b) => {
          const active = b.id === activeId;
          return (
            <span key={b.id} className="group relative flex shrink-0 items-center">
              <button
                onClick={() => switchBoard(b.id)}
                title={b.title}
                className={`max-w-[160px] truncate rounded-pill px-t3 py-t1 text-sm font-medium transition-colors duration-150 ease-soft ${
                  active ? 'bg-fg text-on-dark' : 'text-fg-2 hover:bg-surface-2'
                }`}
              >
                {b.title}
              </button>
              {boards.length > 1 && (
                <button
                  onClick={() => removeBoard(b.id)}
                  aria-label="보드 닫기"
                  className={`ml-[-6px] hidden h-4 w-4 items-center justify-center rounded-full group-hover:flex ${
                    active ? 'text-on-dark/70 hover:text-on-dark' : 'text-fg-muted hover:text-danger'
                  }`}
                >
                  <Icon name="x" size={11} />
                </button>
              )}
            </span>
          );
        })}
      </div>

      {/* 보드 추가 (overflow 밖에 두어 메뉴가 잘리지 않게) */}
      <div className="relative shrink-0">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="보드 추가"
            className="flex h-7 w-7 items-center justify-center rounded-pill text-fg-2 hover:bg-surface-2"
          >
            <Icon name="plus" size={16} />
          </button>
          {menuOpen && (
            <div className="absolute left-0 top-9 z-30 w-44 rounded-xl border border-border bg-surface p-t1 shadow-pop">
              {ADD_KINDS.map((k) => (
                <button
                  key={k}
                  onClick={() => {
                    createBoard(k);
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-t2 rounded-md px-t3 py-t2 text-left text-sm text-fg-1 hover:bg-surface-2"
                >
                  {k === 'general' ? <Icon name="board" size={14} /> : <Icon name="sparkle" size={14} fill="currentColor" />}
                  {KIND_LABEL[k]}
                </button>
              ))}
            </div>
          )}
        </div>
    </div>
  );
}
