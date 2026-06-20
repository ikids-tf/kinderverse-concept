import { useEffect, useRef, useState } from 'react';

/** 논리 캔버스(cw×ch)를 측정된 박스 안에 등비로 맞추는 scale을 돌려준다(letterbox). */
export function useStageFit(cw: number, ch: number, pad = 24) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.2);
  const [box, setBox] = useState({ w: 0, h: 0 }); // 측정된 무대 레이아웃 크기(중앙정렬 translate 계산용)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      // 🔴 clientWidth/Height(레이아웃 px) 사용 — getBoundingClientRect는 보드 줌 등 조상
      //    transform이 곱해진 값이라, 그 스케일을 캔버스에 또 적용하면 이중 스케일로 카드를
      //    넘쳐 요소가 카드 밖으로 밀린다. 레이아웃 px로 맞추면 보드 줌은 그 위에 균일 적용된다.
      const w = el.clientWidth;
      const h = el.clientHeight;
      const k = Math.min((w - pad * 2) / cw, (h - pad * 2) / ch);
      if (k > 0 && Number.isFinite(k)) setScale(k);
      if (w > 0 && h > 0) setBox({ w, h });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [cw, ch, pad]);
  return { ref, scale, box };
}
