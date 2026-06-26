import { useMemo } from 'react';
import { useBoardStore } from '@/store/boardStore';

const PANEL_W = 440;
const PANEL_MAX_H = 300;
const PAD = 60; // 콘텐츠 둘레 월드 여백

/** 보드 미니맵 네비게이터 — 자료가 있는 영역만 작게(요소=사각형) 보여주고, 현재 보이는 화면을
    코랄 사각 라인으로 표시. 패널을 클릭/드래그하면 그 지점으로 보드 화면이 이동한다. 심플 버전. */
export function BoardMinimap() {
  const nodes = useBoardStore((s) => s.nodes);
  const viewport = useBoardStore((s) => s.viewport);
  const setViewport = useBoardStore((s) => s.setViewport);

  // 콘텐츠 경계 + 요소 사각형은 nodes에만 의존 — 팬/줌(viewport) 때 재계산하지 않게 메모.
  const map = useMemo(() => {
    const list = Object.values(nodes).filter((n) => n.type !== 'runner' && n.type !== 'motion');
    if (!list.length) return null;
    const minX = Math.min(...list.map((n) => n.x));
    const minY = Math.min(...list.map((n) => n.y));
    const maxX = Math.max(...list.map((n) => n.x + n.w));
    const maxY = Math.max(...list.map((n) => n.y + n.h));
    const cw = maxX - minX + PAD * 2;
    const ch = maxY - minY + PAD * 2;
    const ox = minX - PAD;
    const oy = minY - PAD;
    const scale = Math.min(PANEL_W / cw, PANEL_MAX_H / ch);
    const panelW = Math.max(240, Math.round(cw * scale));
    const panelH = Math.max(140, Math.round(ch * scale));
    const rects = list.map((n) => {
      const isFrame = n.type === 'frame';
      const isLoose = !isFrame && !n.data?.frameId; // 프레임 밖(자유 배치) 자료
      const cls = isFrame
        ? 'absolute rounded-[1px] border border-fg/30' // 프레임 — 외곽선
        : isLoose
          ? 'absolute rounded-[1px] bg-fg/75' // 프레임 밖 자료 — 진하게 또렷이
          : 'absolute rounded-[1px] bg-fg/25'; // 프레임 안 요소 — 연한 회색
      const min = isLoose ? 4 : 2;
      return (
        <div
          key={n.id}
          className={cls}
          style={{
            left: (n.x - ox) * scale,
            top: (n.y - oy) * scale,
            width: Math.max(min, n.w * scale),
            height: Math.max(min, n.h * scale),
          }}
        />
      );
    });
    return { ox, oy, scale, panelW, panelH, rects };
  }, [nodes]);

  if (!map) {
    return (
      <div
        className="absolute left-0 z-30 rounded-lg border border-border bg-surface px-t3 py-t2 text-overline text-fg-muted shadow-lg"
        style={{ top: 'calc(100% + 8px)', width: PANEL_W }}
      >
        보드가 비어 있어요
      </div>
    );
  }
  const { ox, oy, scale, panelW, panelH, rects } = map;

  // 현재 보이는 영역(월드) → 미니맵 좌표.
  const canvas = typeof document !== 'undefined' ? document.querySelector('[data-kv-canvas]')?.getBoundingClientRect() : null;
  const vW = canvas?.width ?? window.innerWidth;
  const vH = canvas?.height ?? window.innerHeight;
  const vx = (-viewport.panX / viewport.zoom - ox) * scale;
  const vy = (-viewport.panY / viewport.zoom - oy) * scale;
  const vw = (vW / viewport.zoom) * scale;
  const vh = (vH / viewport.zoom) * scale;

  // 패널 위 한 점(client) → 그 월드 지점을 화면 중앙에 두도록 뷰포트 이동.
  const panTo = (clientX: number, clientY: number, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    const worldX = ox + (clientX - rect.left) / scale;
    const worldY = oy + (clientY - rect.top) / scale;
    const cvs = document.querySelector('[data-kv-canvas]')?.getBoundingClientRect();
    const W = cvs?.width ?? window.innerWidth;
    const H = cvs?.height ?? window.innerHeight;
    setViewport({ panX: W / 2 - worldX * viewport.zoom, panY: H / 2 - worldY * viewport.zoom });
  };

  return (
    <div
      className="absolute left-0 z-30 rounded-lg border border-border bg-surface p-t2 shadow-lg"
      style={{ top: 'calc(100% + 8px)' }}
    >
      <div
        className="relative cursor-crosshair touch-none overflow-hidden rounded-md bg-surface-2"
        style={{ width: panelW, height: panelH }}
        onPointerDown={(e) => { try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 합성 이벤트 등 */ } panTo(e.clientX, e.clientY, e.currentTarget); }}
        onPointerMove={(e) => { if (e.buttons) panTo(e.clientX, e.clientY, e.currentTarget); }}
      >
        {rects}
        <div
          className="pointer-events-none absolute border-2 border-accent bg-accent/10"
          style={{ left: vx, top: vy, width: Math.max(6, vw), height: Math.max(6, vh) }}
        />
      </div>
    </div>
  );
}
