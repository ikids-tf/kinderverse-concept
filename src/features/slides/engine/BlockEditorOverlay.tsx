/* 블록 편집 오버레이 — 선택 블록 위에 떠서 전문 편집 컨트롤을 제공.
   · 이동: 바운딩 박스의 4변(테두리) 드래그.
   · 리사이즈: 8핸들(좌우=너비, 코너=폰트 비례 스케일).
   · 회전: 상단 회전 핸들(중심 기준, 15°/45°/90° 근처 스냅).
   · 스타일 툴바: 박스 위에 붙어 따라다님(폰트·크기·볼드·정렬·컬러).
   캔버스(.slide-canvas) 화면 rect로 %를 환산하므로 스케일/줌과 무관. 위치는 ref로 imperative
   갱신(setState 렌더 루프 회피). 프레임 본체는 pointer-events:none이라 본문 텍스트 편집을
   가로막지 않고, 테두리/핸들/회전만 잡힌다. 트랜스폼 시작 시 onFreezeStart로 슬라이드의 모든
   블록을 절대좌표로 고정 → 한 블록을 옮겨도 다른 블록이 흐름에서 재정렬(리플로)되지 않는다. */

import { useLayoutEffect, useRef, type PointerEvent as RPE } from 'react';
import { type Block, type BlockPos, type BlockStyle, isText, isBullets } from '../schema/deckspec';
import { StyleRow } from './BlockToolbar';

const CANVAS_W = 1280;
const ROTATE_REACH = 48; // 박스 위로 뻗는 회전 핸들 길이(연결선+핸들) — 툴바를 그 위로 띄울 때 사용.
const selEl = (): HTMLElement | null => document.querySelector<HTMLElement>('.stage .sl-sel');
const canvasEl = (): HTMLElement | null => document.querySelector<HTMLElement>('.stage .slide-canvas');
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

type PosPct = { xPct: number; yPct: number; wPct: number; rot: number };
type Mode = 'move' | 'resize' | 'rotate';
type Handle = 'nw' | 'ne' | 'sw' | 'se' | 'w' | 'e';
type ScreenBox = { left: number; top: number; w: number; h: number; rot: number; cx: number; cy: number };

const HANDLES: Handle[] = ['nw', 'ne', 'sw', 'se', 'w', 'e'];
const HPOS: Record<Handle, { left: string; top: string }> = {
  nw: { left: '0', top: '0' },
  ne: { left: '100%', top: '0' },
  sw: { left: '0', top: '100%' },
  se: { left: '100%', top: '100%' },
  w: { left: '0', top: '50%' },
  e: { left: '100%', top: '50%' },
};
const HCURSOR: Record<Handle, string> = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', w: 'ew-resize', e: 'ew-resize' };

export function BlockEditorOverlay({
  target,
  block,
  style,
  hasPos,
  transformable,
  onStyle,
  onPos,
  onFreezeStart,
}: {
  target: number | 'eyebrow';
  block: Block | null;
  style: BlockStyle | undefined;
  hasPos: boolean;
  transformable: boolean;
  onStyle: (patch: Partial<BlockStyle>) => void;
  onPos: (pos: BlockPos | null) => void;
  onFreezeStart: () => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const drag = useRef<null | { mode: Mode; handle?: Handle; sx: number; sy: number; start: PosPct; startFont: number; cx: number; cy: number }>(null);

  /** 현재 블록 pos(%) — block.pos 우선, 없으면 DOM rect(흐름, rot=0). */
  const currentPos = (): PosPct => {
    if (block && (isText(block) || isBullets(block)) && block.pos) {
      return { xPct: block.pos.xPct, yPct: block.pos.yPct, wPct: block.pos.wPct, rot: block.pos.rot ?? 0 };
    }
    const el = selEl();
    const cv = canvasEl();
    if (el && cv) {
      const r = el.getBoundingClientRect();
      const c = cv.getBoundingClientRect();
      return { xPct: ((r.left - c.left) / c.width) * 100, yPct: ((r.top - c.top) / c.height) * 100, wPct: (r.width / c.width) * 100, rot: 0 };
    }
    return { xPct: 12, yPct: 12, wPct: 50, rot: 0 };
  };
  const currentFont = (): number => {
    if (style?.fontPx) return style.fontPx;
    const el = selEl();
    const t = el?.isContentEditable ? el : ((el?.querySelector('[contenteditable]') as HTMLElement | null) ?? el);
    return t ? Math.round(parseFloat(getComputedStyle(t).fontSize)) : 40;
  };

  /** pos(%) → 화면 박스. 높이는 선택 요소의 offsetHeight(자동) × 스케일. */
  const screenBox = (p: PosPct): ScreenBox | null => {
    const cv = canvasEl();
    const el = selEl();
    if (!cv) return null;
    const c = cv.getBoundingClientRect();
    const scale = c.width / CANVAS_W;
    const w = (p.wPct / 100) * c.width;
    const left = c.left + (p.xPct / 100) * c.width;
    const top = c.top + (p.yPct / 100) * c.height;
    const h = (el?.offsetHeight ?? 60) * scale;
    return { left, top, w, h, rot: p.rot, cx: left + w / 2, cy: top + h / 2 };
  };

  /** 프레임 + 툴바를 화면 박스에 배치(imperative). */
  const apply = (b: { left: number; top: number; w: number; h: number; rot: number }) => {
    const f = frameRef.current;
    if (f) {
      f.style.display = 'block';
      f.style.left = `${b.left}px`;
      f.style.top = `${b.top}px`;
      f.style.width = `${b.w}px`;
      f.style.height = `${b.h}px`;
      f.style.transform = b.rot ? `rotate(${b.rot}deg)` : '';
    }
    const tb = toolbarRef.current;
    if (tb) {
      const cx = b.left + b.w / 2;
      const cy = b.top + b.h / 2;
      const a = (b.rot * Math.PI) / 180;
      const cs = Math.cos(a);
      const sn = Math.sin(a);
      let minY = Infinity;
      for (const [px, py] of [[b.left, b.top], [b.left + b.w, b.top], [b.left + b.w, b.top + b.h], [b.left, b.top + b.h]]) {
        const y = cy + (px - cx) * sn + (py - cy) * cs;
        if (y < minY) minY = y;
      }
      // 회전 핸들(박스 위 ~ROTATE_REACH)을 가리지 않도록 그 위로 띄운다.
      const frameShown = !!frameRef.current && frameRef.current.style.display !== 'none';
      const rotateY = frameShown ? cy + -(b.h / 2 + ROTATE_REACH) * cs : minY;
      const topRef = Math.min(minY, rotateY);
      const tw = tb.offsetWidth || 320;
      const th = tb.offsetHeight || 42;
      const left = clamp(cx - tw / 2, 8, window.innerWidth - tw - 8);
      let topT = topRef - th - 10;
      if (topT < 8) topT = Math.min(b.top + b.h + 12, window.innerHeight - th - 8);
      tb.style.left = `${left}px`;
      tb.style.top = `${topT}px`;
      tb.style.visibility = 'visible';
    }
  };

  const place = () => {
    const b = screenBox(currentPos());
    if (b) apply(b);
  };

  // 매 렌더 후 동기화(드래그 중이 아닐 때). 폰트/텍스트 편집으로 크기가 바뀌어도 따라감.
  useLayoutEffect(() => {
    if (!drag.current) place();
  });
  useLayoutEffect(() => {
    const on = () => {
      if (!drag.current) place();
    };
    window.addEventListener('resize', on);
    window.addEventListener('scroll', on, true);
    const el = selEl();
    const ro = el ? new ResizeObserver(on) : null;
    if (el && ro) ro.observe(el);
    return () => {
      window.removeEventListener('resize', on);
      window.removeEventListener('scroll', on, true);
      ro?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const begin = (mode: Mode, handle?: Handle) => (e: RPE) => {
    e.preventDefault(); // 호환 mousedown 억제 → 스테이지 deselect/텍스트 포커스 방지
    e.stopPropagation();
    onFreezeStart(); // 전체 블록 절대좌표 고정(리플로 차단)
    const start = currentPos();
    const b = screenBox(start);
    drag.current = { mode, handle, sx: e.clientX, sy: e.clientY, start, startFont: currentFont(), cx: b?.cx ?? e.clientX, cy: b?.cy ?? e.clientY };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* headless */
    }
  };
  const onMove = (e: RPE) => {
    const d = drag.current;
    const cv = canvasEl();
    if (!d || !cv) return;
    const c = cv.getBoundingClientRect();
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    const np: PosPct = { ...d.start };
    if (d.mode === 'move') {
      np.xPct = clamp(d.start.xPct + (dx / c.width) * 100, -20, 110);
      np.yPct = clamp(d.start.yPct + (dy / c.height) * 100, -20, 105);
    } else if (d.mode === 'resize' && d.handle) {
      const a = (-d.start.rot * Math.PI) / 180;
      const lx = dx * Math.cos(a) - dy * Math.sin(a); // 박스 로컬 x축 투영(회전 보정)
      const dxPct = (lx / c.width) * 100;
      const west = d.handle.includes('w');
      const east = d.handle.includes('e');
      let nw = d.start.wPct;
      if (west) nw = Math.max(5, d.start.wPct - dxPct);
      else if (east) nw = Math.max(5, d.start.wPct + dxPct);
      np.wPct = nw;
      np.xPct = west ? d.start.xPct + (d.start.wPct - nw) : d.start.xPct; // 서쪽 핸들 = 동쪽 가장자리 고정
      if (d.handle.length === 2) {
        const sc = nw / d.start.wPct; // 코너 → 폰트 비례 스케일
        onStyle({ fontPx: clamp(Math.round(d.startFont * sc), 8, 400) });
      }
    } else if (d.mode === 'rotate') {
      let deg = (Math.atan2(e.clientY - d.cy, e.clientX - d.cx) * 180) / Math.PI + 90;
      deg = ((deg % 360) + 360) % 360;
      if (deg > 180) deg -= 360;
      for (const s of [0, 45, 90, -45, -90, 135, -135, 180]) if (Math.abs(deg - s) < 4) deg = s;
      np.rot = Math.round(deg);
    }
    onPos({ xPct: np.xPct, yPct: np.yPct, wPct: np.wPct, rot: np.rot || undefined });
    const el = selEl();
    const scale = c.width / CANVAS_W;
    apply({ left: c.left + (np.xPct / 100) * c.width, top: c.top + (np.yPct / 100) * c.height, w: (np.wPct / 100) * c.width, h: (el?.offsetHeight ?? 60) * scale, rot: np.rot });
  };
  const onEnd = (e: RPE) => {
    if (!drag.current) return;
    drag.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    place();
  };

  return (
    <>
      {transformable && (
        <div ref={frameRef} className="be-frame" style={{ display: 'none' }}>
          {(['t', 'r', 'b', 'l'] as const).map((s) => (
            <span key={s} className={`be-edge be-edge-${s}`} onPointerDown={begin('move')} onPointerMove={onMove} onPointerUp={onEnd} onPointerCancel={onEnd} />
          ))}
          {HANDLES.map((h) => (
            <span
              key={h}
              className="be-handle"
              style={{ left: HPOS[h].left, top: HPOS[h].top, cursor: HCURSOR[h] }}
              onPointerDown={begin('resize', h)}
              onPointerMove={onMove}
              onPointerUp={onEnd}
              onPointerCancel={onEnd}
            />
          ))}
          <span className="be-rotate-line" />
          <span className="be-rotate" title="회전" onPointerDown={begin('rotate')} onPointerMove={onMove} onPointerUp={onEnd} onPointerCancel={onEnd}>
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M21 12a9 9 0 1 1-3-6.7M21 4v4h-4" />
            </svg>
          </span>
        </div>
      )}
      <div ref={toolbarRef} className="be-toolbar" style={{ visibility: 'hidden' }} onMouseDown={(e) => e.preventDefault()}>
        <StyleRow style={style} onStyle={onStyle} />
        {transformable && hasPos && (
          <>
            <span className="bt-sep" />
            <button type="button" className="bt-btn" title="자동 배치로 되돌리기" onClick={() => onPos(null)}>↺</button>
          </>
        )}
      </div>
    </>
  );
}
