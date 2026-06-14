/* 다중 선택 오버레이 — 2개 이상 선택 시 합쳐진 바운딩 박스. 박스를 드래그하면 선택된
   블록 전체가 같은 델타로 이동(onFreezeMove → 뷰어의 freezeAndMove). 리사이즈/회전은 단일
   선택에서만(여긴 이동·삭제 전용). 위치는 ref로 imperative 갱신(렌더 루프 회피). */

import { useLayoutEffect, useRef, type PointerEvent as RPE } from 'react';

const canvasEl = (): HTMLElement | null => document.querySelector<HTMLElement>('.stage .slide-canvas');

export function MultiSelectOverlay({
  indices,
  onFreezeMove,
}: {
  indices: number[];
  onFreezeMove: (dxPct: number, dyPct: number) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const drag = useRef<null | { lastX: number; lastY: number }>(null);

  // 선택 블록들의 화면 rect 합집합으로 박스를 맞춘다.
  const place = () => {
    const cv = canvasEl();
    const box = boxRef.current;
    if (!cv || !box) return;
    let l = Infinity;
    let t = Infinity;
    let r = -Infinity;
    let b = -Infinity;
    let found = false;
    indices.forEach((i) => {
      const el = cv.querySelector<HTMLElement>(`[data-bi="${i}"]`);
      if (!el) return;
      const rc = el.getBoundingClientRect();
      l = Math.min(l, rc.left);
      t = Math.min(t, rc.top);
      r = Math.max(r, rc.right);
      b = Math.max(b, rc.bottom);
      found = true;
    });
    if (!found) {
      box.style.display = 'none';
      return;
    }
    box.style.display = 'block';
    box.style.left = `${l}px`;
    box.style.top = `${t}px`;
    box.style.width = `${r - l}px`;
    box.style.height = `${b - t}px`;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indices]);

  const begin = (e: RPE) => {
    e.preventDefault();
    e.stopPropagation();
    drag.current = { lastX: e.clientX, lastY: e.clientY };
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
    const sdx = e.clientX - d.lastX;
    const sdy = e.clientY - d.lastY;
    const c = cv.getBoundingClientRect();
    onFreezeMove((sdx / c.width) * 100, (sdy / c.height) * 100);
    const box = boxRef.current;
    if (box) {
      box.style.left = `${parseFloat(box.style.left) + sdx}px`;
      box.style.top = `${parseFloat(box.style.top) + sdy}px`;
    }
    d.lastX = e.clientX;
    d.lastY = e.clientY;
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
    <div ref={boxRef} className="be-multi" style={{ display: 'none' }} onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
      <span className="be-multi-count">{indices.length}개 선택 · 드래그로 함께 이동</span>
    </div>
  );
}
