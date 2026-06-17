import { useCallback, useEffect, useRef, useState } from 'react';

/* 카드 위치에서 '커지며 열리고' 닫을 때 다시 '그 위치로 작아지는' 모달 공용 훅.
   + 열려 있는 동안 배경(보드) 스크롤·줌·터치를 막는다(휠/터치 캡처 차단 + body 스크롤 잠금).
   사용처: 이미지 편집 모달, 이미지 풀스크린(크게 보기). */

export type OriginRect = { x: number; y: number; w: number; h: number };

export function useZoomModal(origin: OriginRect | null | undefined, onClose: () => void) {
  const [shown, setShown] = useState(false);
  const closing = useRef(false);

  // 마운트 직후 한 프레임 뒤 'shown'으로 전환 → 카드 위치(작게)에서 전체(크게)로 트랜지션.
  useEffect(() => {
    const r = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(r);
  }, []);

  // 배경 조작 차단 — 오버레이가 화면을 덮어 보드(캔버스 엘리먼트)로 포인터/휠이 도달하지
  // 못하므로 보드 팬·줌·선택은 자연히 막힌다. 페이지 자체 스크롤만 추가로 잠근다.
  // (전역 휠 차단은 하지 않는다 — 모달 내부 스크롤 가능한 콘텐츠를 막지 않기 위해.)
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  const requestClose = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    setShown(false); // 역방향 트랜지션 시작 → transform 끝나면 onClose
  }, []);

  const onContentTransitionEnd = useCallback(
    (e: React.TransitionEvent) => {
      if (closing.current && e.propertyName === 'transform') onClose();
    },
    [onClose],
  );

  // 카드 중심을 변환 원점으로 — 그 지점에서 자라고/줄어든다.
  const vw = typeof window !== 'undefined' ? window.innerWidth : 0;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 0;
  const cx = origin ? origin.x + origin.w / 2 : vw / 2;
  const cy = origin ? origin.y + origin.h / 2 : vh / 2;

  const contentStyle: React.CSSProperties = {
    transformOrigin: `${cx}px ${cy}px`,
    transform: shown ? 'scale(1)' : 'scale(0.08)',
    opacity: shown ? 1 : 0,
    transition: 'transform 240ms cubic-bezier(.22,.61,.36,1), opacity 200ms ease',
    willChange: 'transform, opacity',
  };
  const backdropStyle: React.CSSProperties = {
    opacity: shown ? 1 : 0,
    transition: 'opacity 200ms ease',
  };

  return { shown, requestClose, onContentTransitionEnd, contentStyle, backdropStyle };
}
