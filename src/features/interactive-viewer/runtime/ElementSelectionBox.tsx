/**
 * 요소 선택 바운드박스 + 모서리 리사이즈 핸들 — 마이보드 선택 링/핸들과 동일 스타일.
 * 마이보드: 링 = ring-2 ring-accent(오프셋 없이 요소를 감쌈), 핸들 = 원형
 *   (rounded-full border-2 border-accent bg-surface). 여기선 .ic-canvas(scale 적용) 안이라
 *   링/핸들 두께·크기를 1/scale로 역보정해 화면상 일정하게 유지한다.
 * box(라이브)를 그대로 받아 너비/높이까지 실시간 반영 → 리사이즈 시 요소와 함께 즉시 움직인다.
 */
interface Props {
  /** 라이브 박스(드래그/리사이즈 즉시 반영). */
  box: { x: number; y: number; w: number; h: number };
  scale: number;
  /** 요소 콘텐츠 라운드(링이 콘텐츠를 따라 둥글게). */
  radius?: number;
  rotation?: number;
  onHandleDown: (e: React.PointerEvent, corner: number) => void;
}

export function ElementSelectionBox({ box, scale, radius = 8, rotation, onHandleDown }: Props) {
  const sz = 12 / scale; // 화면상 ~12px(마이보드 h-3 w-3)
  const bw = Math.max(1, 2 / scale); // 화면상 ~2px(border-2)
  const handleStyle = (cx: number, cy: number, cursor: string): React.CSSProperties => ({
    position: 'absolute',
    left: cx,
    top: cy,
    width: sz,
    height: sz,
    transform: 'translate(-50%, -50%)',
    background: 'var(--surface, #fff)',
    border: `${bw}px solid var(--accent, #f2733e)`,
    borderRadius: 999, // 원형 — 마이보드 rounded-full
    boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
    cursor,
    touchAction: 'none',
    zIndex: 5,
    pointerEvents: 'auto',
  });
  const corners: Array<[number, number, number, string]> = [
    [0, 0, 0, 'nwse-resize'],
    [1, box.w, 0, 'nesw-resize'],
    [2, box.w, box.h, 'nwse-resize'],
    [3, 0, box.h, 'nesw-resize'],
  ];
  return (
    <div
      className="ic-selbox"
      style={{
        position: 'absolute',
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        transform: rotation ? `rotate(${rotation}deg)` : undefined,
        outline: `${bw}px solid var(--accent, #f2733e)`,
        outlineOffset: 0,
        borderRadius: radius,
        pointerEvents: 'none',
        zIndex: 4,
      }}
    >
      {corners.map(([corner, cx, cy, cursor]) => (
        <div key={corner} style={handleStyle(cx, cy, cursor)} onPointerDown={(e) => onHandleDown(e, corner)} />
      ))}
    </div>
  );
}
