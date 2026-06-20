/**
 * 요소 선택 바운드박스 + 모서리 리사이즈 핸들 — 마이보드 SelectionHandles와 동일 손끝감각.
 * .ic-canvas(논리좌표, scale 적용) 안에 요소와 같은 위치로 렌더하고, 핸들은 1/scale로
 * 역보정해 화면상 ~12px로 일정하게. 리사이즈 계산은 InteractiveStage가 담당(onHandleDown).
 */
import type { ElementNode } from '../schema/interactiveNode';

interface Props {
  el: ElementNode;
  /** 드래그 중 라이브 위치(있으면 우선). */
  pos: { x: number; y: number };
  scale: number;
  onHandleDown: (e: React.PointerEvent, corner: number) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}

export function ElementSelectionBox({ el, pos, scale, onHandleDown, onDuplicate, onRemove }: Props) {
  const w = el.transform.w;
  const h = el.transform.h;
  const sz = 12 / scale;
  const bw = Math.max(1, 2 / scale);
  const handle = (cx: number, cy: number, cursor: string): React.CSSProperties => ({
    position: 'absolute',
    left: cx,
    top: cy,
    width: sz,
    height: sz,
    transform: 'translate(-50%, -50%)',
    background: '#fff',
    border: `${bw}px solid var(--ic-coral, #ff9e7d)`,
    borderRadius: 3,
    cursor,
    touchAction: 'none',
    zIndex: 5,
  });
  const corners: Array<[number, number, number, string]> = [
    [0, 0, 0, 'nwse-resize'],
    [1, w, 0, 'nesw-resize'],
    [2, w, h, 'nwse-resize'],
    [3, 0, h, 'nesw-resize'],
  ];
  return (
    <div
      className="ic-selbox"
      style={{
        position: 'absolute',
        left: pos.x,
        top: pos.y,
        width: w,
        height: h,
        transform: el.transform.rotation ? `rotate(${el.transform.rotation}deg)` : undefined,
        outline: `${Math.max(1, 2 / scale)}px solid var(--ic-coral, #ff9e7d)`,
        outlineOffset: 2 / scale,
        pointerEvents: 'none',
        zIndex: 4,
      }}
    >
      {corners.map(([corner, cx, cy, cursor]) => (
        <div
          key={corner}
          style={{ ...handle(cx, cy, cursor), pointerEvents: 'auto' }}
          onPointerDown={(e) => onHandleDown(e, corner)}
        />
      ))}
      {/* 호버 액션 메뉴 — 박스 우상단 위에, 역스케일로 화면 크기 유지(마이보드 호버 메뉴와 동일 위치감). */}
      <div
        style={{
          position: 'absolute',
          left: w,
          top: 0,
          transform: `translate(-100%, -100%) scale(${1 / scale})`,
          transformOrigin: 'right bottom',
          display: 'flex',
          gap: 4,
          marginBottom: 6,
          pointerEvents: 'auto',
        }}
      >
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate();
          }}
          title="복제 (⌘/Ctrl+D)"
          className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-surface/95 text-xs text-fg-2 shadow-sm hover:border-accent hover:bg-accent hover:text-on-accent"
        >
          ⧉
        </button>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          title="삭제 (Delete)"
          className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-surface/95 text-xs text-fg-2 shadow-sm hover:border-danger hover:bg-danger-soft hover:text-danger"
        >
          🗑
        </button>
      </div>
    </div>
  );
}
