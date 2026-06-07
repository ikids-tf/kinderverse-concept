import { Icon } from '@/lib/icons';
import { useBoardStore } from '@/store/boardStore';
import { useHistoryStore } from '@/store/historyStore';
import { addNodeCmd } from '@/board/commands';

/* Always-visible edge controls (PRD §4.3, R9 — keep minimal):
   top-right 수업 모드 · bottom-right zoom/Fit · +추가 · undo/redo. */

export function BoardControls() {
  const viewport = useBoardStore((s) => s.viewport);
  const zoomBy = useBoardStore((s) => s.zoomBy);
  const fit = useBoardStore((s) => s.fit);
  const classroomMode = useBoardStore((s) => s.classroomMode);
  const toggleClassroom = useBoardStore((s) => s.toggleClassroomMode);

  const canUndo = useHistoryStore((s) => s.past.length > 0);
  const canRedo = useHistoryStore((s) => s.future.length > 0);
  const undo = useHistoryStore((s) => s.undo);
  const redo = useHistoryStore((s) => s.redo);

  const addSticky = () => {
    const { zoom, panX, panY } = useBoardStore.getState().viewport;
    const cx = (window.innerWidth - 124) / 2;
    const cy = (window.innerHeight - 120) / 2;
    addNodeCmd('sticky', (cx - panX) / zoom - 90, (cy - panY) / zoom - 70);
  };

  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;

  return (
    <>
      {/* top-right: undo/redo + 수업 모드 */}
      <div className="pointer-events-auto absolute right-t4 top-t3 z-20 flex items-center gap-t2">
        <div className="flex items-center gap-t1 rounded-pill border border-border bg-surface/95 p-t1 shadow-sm backdrop-blur">
          <button
            title="실행취소 (⌘/Ctrl+Z)"
            onClick={undo}
            disabled={!canUndo}
            className="flex h-8 w-8 items-center justify-center rounded-pill text-fg-2 hover:bg-surface-2 disabled:opacity-30"
          >
            <Icon name="arrowLeft" size={16} />
          </button>
          <button
            title="다시실행 (⌘/Ctrl+Shift+Z)"
            onClick={redo}
            disabled={!canRedo}
            className="flex h-8 w-8 items-center justify-center rounded-pill text-fg-2 hover:bg-surface-2 disabled:opacity-30"
          >
            <Icon name="arrowRight" size={16} />
          </button>
        </div>
        <button
          title="수업 모드 (교실 투사)"
          onClick={toggleClassroom}
          className={`flex items-center gap-t1 rounded-pill border px-t3 py-t2 text-sm font-medium shadow-sm transition-colors duration-150 ease-soft ${
            classroomMode
              ? 'border-accent bg-accent text-on-accent'
              : 'border-border bg-surface/95 text-fg-2 hover:bg-surface-2'
          }`}
        >
          <Icon name="present" size={16} /> 수업 모드
        </button>
      </div>

      {/* bottom-right: zoom + Fit + 추가 */}
      <div className="pointer-events-auto absolute bottom-28 right-t4 z-20 flex items-center gap-t2">
        <button
          onClick={addSticky}
          title="추가"
          className="flex h-10 items-center gap-t1 rounded-pill bg-fg px-t4 text-sm font-semibold text-on-dark shadow-md transition-colors duration-150 ease-soft hover:bg-fg-1"
        >
          <Icon name="plus" size={16} /> 추가
        </button>
        <div className="flex items-center gap-t1 rounded-pill border border-border bg-surface/95 p-t1 shadow-md backdrop-blur">
          <button
            title="축소 (⌘/Ctrl+-)"
            onClick={() => zoomBy(1 / 1.1, cx, cy)}
            className="flex h-8 w-8 items-center justify-center rounded-pill text-fg-2 hover:bg-surface-2"
          >
            <Icon name="minus" size={16} />
          </button>
          <span className="w-12 text-center text-overline text-fg-2">
            {Math.round(viewport.zoom * 100)}%
          </span>
          <button
            title="확대 (⌘/Ctrl+=)"
            onClick={() => zoomBy(1.1, cx, cy)}
            className="flex h-8 w-8 items-center justify-center rounded-pill text-fg-2 hover:bg-surface-2"
          >
            <Icon name="plus" size={16} />
          </button>
          <button
            title="전체 맞춤 (Shift+1)"
            onClick={fit}
            className="flex h-8 items-center justify-center rounded-pill px-t2 text-overline text-fg-2 hover:bg-surface-2"
          >
            FIT
          </button>
        </div>
      </div>
    </>
  );
}
