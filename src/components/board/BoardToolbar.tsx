import { Icon, type IconName } from '@/lib/icons';
import { useBoardStore } from '@/store/boardStore';
import { addNodeCmd, addFrameCmd, toggleLockCmd, type PrimitiveType } from '@/board/commands';

/* Left vertical board toolbar (SKILL §6, PRD §4.3). Select + primitive adders +
   (bottom) lock/home. Every tool has a button path (no keyboard required). */

function viewCenterWorld() {
  const { zoom, panX, panY } = useBoardStore.getState().viewport;
  // approx canvas origin: left rail(68) + toolbar(56)
  const cx = (window.innerWidth - 124) / 2;
  const cy = (window.innerHeight - 120) / 2;
  return { x: (cx - panX) / zoom, y: (cy - panY) / zoom };
}

const TOOLS: Array<{ id: PrimitiveType; icon: IconName; label: string }> = [
  { id: 'text', icon: 'writing', label: '텍스트' },
  { id: 'sticky', icon: 'record', label: '메모' },
  { id: 'image', icon: 'gallery', label: '이미지' },
  { id: 'shape', icon: 'board', label: '도형' },
];

export function BoardToolbar() {
  const selection = useBoardStore((s) => s.selection);
  const resetView = useBoardStore((s) => s.resetView);

  const add = (type: PrimitiveType) => {
    const c = viewCenterWorld();
    addNodeCmd(type, c.x - 90, c.y - 70);
  };

  const addFrame = () => {
    const c = viewCenterWorld();
    addFrameCmd(c.x - 260, c.y - 200, '새 프레임');
  };

  return (
    <div className="pointer-events-auto absolute left-t3 top-t3 z-20 flex flex-col items-center gap-t1 rounded-pill border border-border bg-surface/95 p-t1 shadow-md backdrop-blur">
      <button
        title="선택"
        className="flex h-10 w-10 items-center justify-center rounded-pill bg-surface-3 text-fg"
      >
        <Icon name="cursor" size={18} />
      </button>
      <div className="my-t1 h-px w-6 bg-border" />
      {TOOLS.map((t) => (
        <button
          key={t.id}
          title={t.label}
          onClick={() => add(t.id)}
          className="flex h-10 w-10 items-center justify-center rounded-pill text-fg-2 transition-colors duration-150 ease-soft hover:bg-surface-2 hover:text-fg"
        >
          <Icon name={t.icon} size={18} />
        </button>
      ))}
      <button
        title="프레임 / 캔버스 추가"
        onClick={addFrame}
        className="flex h-10 w-10 items-center justify-center rounded-pill text-fg-2 transition-colors duration-150 ease-soft hover:bg-surface-2 hover:text-fg"
      >
        <Icon name="frame" size={18} />
      </button>
      <div className="my-t1 h-px w-6 bg-border" />
      <button
        title="잠금/해제 (⌘/Ctrl+L)"
        onClick={() => toggleLockCmd(selection)}
        disabled={selection.length === 0}
        className="flex h-10 w-10 items-center justify-center rounded-pill text-fg-2 transition-colors duration-150 ease-soft hover:bg-surface-2 hover:text-fg disabled:opacity-40"
      >
        <Icon name="lock" size={18} />
      </button>
      <button
        title="홈 위치 (⌘/Ctrl+0)"
        onClick={() => resetView()}
        className="flex h-10 w-10 items-center justify-center rounded-pill text-fg-2 transition-colors duration-150 ease-soft hover:bg-surface-2 hover:text-fg"
      >
        <Icon name="home" size={18} />
      </button>
    </div>
  );
}
