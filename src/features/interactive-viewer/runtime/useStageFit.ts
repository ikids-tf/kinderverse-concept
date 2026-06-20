import { useEffect, useRef, useState } from 'react';

/** 논리 캔버스(cw×ch)를 측정된 박스 안에 등비로 맞추는 scale을 돌려준다(letterbox). */
export function useStageFit(cw: number, ch: number, pad = 24) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.2);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const k = Math.min((r.width - pad * 2) / cw, (r.height - pad * 2) / ch);
      if (k > 0 && Number.isFinite(k)) setScale(k);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [cw, ch, pad]);
  return { ref, scale };
}
