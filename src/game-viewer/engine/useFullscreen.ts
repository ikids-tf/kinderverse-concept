/**
 * useFullscreen.ts — 게임 뷰어 풀스크린 토글.
 * ------------------------------------------------------------------
 * 자기 문서(documentElement)를 네이티브 풀스크린으로. 보드 카드(iframe)는
 * `allow="fullscreen"`이 있어 임베드 상태에서도 iframe이 화면 전체를 채운다
 * (게임 상태 유지 — 별도 오버레이/재로딩 없음). 단독 탭에서도 동일하게 동작.
 */
import { useCallback, useEffect, useState } from "react";

export function useFullscreen() {
  const [isFs, setIsFs] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggle = useCallback(() => {
    // 거부(사용자 제스처 없음 등) 시 reject되므로 조용히 무시(콘솔 노이즈 방지).
    const swallow = () => {};
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(swallow);
    } else {
      document.documentElement.requestFullscreen?.().catch(swallow);
    }
  }, []);

  return { isFs, toggle };
}
