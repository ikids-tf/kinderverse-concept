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
  /** 상단 회전 핸들 드래그 시작(마이보드 회전 핸들과 동일). */
  onRotateDown: (e: React.PointerEvent) => void;
}

export function ElementSelectionBox({ box, scale, radius = 8, rotation, onHandleDown, onRotateDown }: Props) {
  const sz = 12 / scale; // 화면상 ~12px(마이보드 h-3 w-3)
  const bw = Math.max(1, 2 / scale); // 화면상 ~2px(border-2)
  const rotGap = 30 / scale; // 회전 핸들 띄움 거리(마이보드와 동일 30px)
  const dot = (cx: number, cy: number): React.CSSProperties => ({
    position: 'absolute',
    left: cx,
    top: cy,
    width: sz,
    height: sz,
    transform: 'translate(-50%, -50%)',
    background: 'var(--surface, #fff)',
    border: `${bw}px solid var(--accent, #f2733e)`,
    boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
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
        transformOrigin: 'center center',
        outline: `${bw}px solid var(--accent, #f2733e)`,
        outlineOffset: 0,
        borderRadius: radius,
        pointerEvents: 'none',
        zIndex: 4,
      }}
    >
      {/* 회전 핸들로 잇는 가는 선(상단 중앙 → 회전 핸들) */}
      <div
        style={{
          position: 'absolute',
          left: box.w / 2,
          top: -rotGap,
          width: bw,
          height: rotGap,
          background: 'var(--accent, #f2733e)',
          transform: 'translateX(-50%)',
          opacity: 0.7,
          pointerEvents: 'none',
        }}
      />
      {/* 회전 핸들(원형) */}
      <div
        style={{ ...dot(box.w / 2, -rotGap), borderRadius: 999, cursor: 'grab' }}
        onPointerDown={onRotateDown}
        title="회전 (드래그 · Shift=15°)"
      />
      {/* 모서리 리사이즈 핸들(원형) */}
      {corners.map(([corner, cx, cy, cursor]) => (
        <div key={corner} style={{ ...dot(cx, cy), borderRadius: 999, cursor }} onPointerDown={(e) => onHandleDown(e, corner)} />
      ))}
    </div>
  );
}
