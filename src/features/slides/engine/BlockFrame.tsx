/* 블록 프레임 — 선택된 블록 위에 떠서 '드래그로 이동(grip)' + '너비 조절(resize)'을 제공.
   캔버스(.slide-canvas)의 화면상 rect로 %를 환산하므로 스케일/줌과 무관하게 정확하다
   (화면 delta ÷ 캔버스 화면폭 = 논리 캔버스 %). 프레임은 pointer-events:none이라 본문
   텍스트 클릭/편집을 가로막지 않고, 손잡이(grip/resize/reset)만 잡힌다.
   위치는 ref로 'imperative' 갱신한다 — setState 루프(무한 렌더) 회피. */

import { useLayoutEffect, useRef, type PointerEvent as RPE } from 'react';
import type { BlockPos } from '../schema/deckspec';

const selEl = (): HTMLElement | null => document.querySelector<HTMLElement>('.stage .sl-sel');
const canvasEl = (): HTMLElement | null => document.querySelector<HTMLElement>('.stage .slide-canvas');
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

interface Box {
  l: number;
  t: number;
  w: number;
  h: number;
}

export function BlockFrame({ hasPos, onPos }: { hasPos: boolean; onPos: (pos: BlockPos | null) => void }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const drag = useRef<null | { mode: 'move' | 'resize'; sx: number; sy: number; start: BlockPos }>(null);

  // 프레임을 블록(또는 명시 box)에 맞춘다 — DOM 직접 갱신(렌더 루프 없음).
  const place = (box?: Box) => {
    const f = frameRef.current;
    if (!f) return;
    let b = box;
    if (!b) {
      const el = selEl();
      if (!el) {
        f.style.display = 'none';
        return;
      }
      const r = el.getBoundingClientRect();
      b = { l: r.left, t: r.top, w: r.width, h: r.height };
    }
    f.style.display = 'block';
    f.style.left = `${b.l}px`;
    f.style.top = `${b.t}px`;
    f.style.width = `${b.w}px`;
    f.style.height = `${b.h}px`;
  };
  useLayoutEffect(() => {
    if (!drag.current) place();
  });
  useLayoutEffect(() => {
    const on = () => {
      if (!drag.current) place();
    };
    window.addEventListener('resize', on);
    window.addEventListener('scroll', on, true);
    return () => {
      window.removeEventListener('resize', on);
      window.removeEventListener('scroll', on, true);
    };
  }, []);

  // 현재 블록 pos(%) — pos가 없어도 화면 rect에서 계산(첫 드래그 시작점).
  const curPos = (): BlockPos => {
    const el = selEl();
    const cv = canvasEl();
    if (el && cv) {
      const r = el.getBoundingClientRect();
      const c = cv.getBoundingClientRect();
      return {
        xPct: ((r.left - c.left) / c.width) * 100,
        yPct: ((r.top - c.top) / c.height) * 100,
        wPct: (r.width / c.width) * 100,
      };
    }
    return { xPct: 12, yPct: 12, wPct: 50 };
  };

  const start = (mode: 'move' | 'resize') => (e: RPE) => {
    e.preventDefault();
    e.stopPropagation();
    drag.current = { mode, sx: e.clientX, sy: e.clientY, start: curPos() };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* headless */
    }
  };
  const move = (e: RPE) => {
    const d = drag.current;
    const cv = canvasEl();
    if (!d || !cv) return;
    const c = cv.getBoundingClientRect();
    const dx = ((e.clientX - d.sx) / c.width) * 100;
    const dy = ((e.clientY - d.sy) / c.height) * 100;
    let np: BlockPos;
    if (d.mode === 'move') {
      const w = d.start.wPct;
      np = { xPct: clamp(d.start.xPct + dx, 0, 100 - w), yPct: clamp(d.start.yPct + dy, 0, 97), wPct: w };
    } else {
      np = { xPct: d.start.xPct, yPct: d.start.yPct, wPct: clamp(d.start.wPct + dx, 8, 100 - d.start.xPct) };
    }
    onPos(np);
    const h = frameRef.current?.offsetHeight ?? 0;
    place({ l: c.left + (np.xPct / 100) * c.width, t: c.top + (np.yPct / 100) * c.height, w: (np.wPct / 100) * c.width, h });
  };
  const end = (e: RPE) => {
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
    <div ref={frameRef} className="block-frame" style={{ display: 'none' }}>
      <button
        type="button"
        className="bf-grip"
        title="드래그로 이동"
        onPointerDown={start('move')}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden>
          <circle cx="8" cy="6" r="1.6" /><circle cx="8" cy="12" r="1.6" /><circle cx="8" cy="18" r="1.6" />
          <circle cx="16" cy="6" r="1.6" /><circle cx="16" cy="12" r="1.6" /><circle cx="16" cy="18" r="1.6" />
        </svg>
      </button>
      <span
        className="bf-resize"
        title="너비 조절"
        onPointerDown={start('resize')}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      />
      {hasPos && (
        <button type="button" className="bf-reset" title="자동 배치로 되돌리기" onPointerDown={(e) => e.preventDefault()} onClick={() => onPos(null)}>↺</button>
      )}
    </div>
  );
}
