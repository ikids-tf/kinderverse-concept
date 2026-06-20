/* 게임 뷰어 진입점 — 보드 카드(iframe)가 same-origin으로 임베드하는 별도 React 루트.
   🔴 게임 화면(.kv-v2)은 파스텔 독립(v2/theme.ts) — 앱 Milray 토큰을 콘텐츠에 적용하지 않는다.
      단, '교사 크롬'(이미지 편집 모달·풀스크린·호버 액션)은 마이보드와 동일해야 하므로
      preflight 없는 chrome.css(토큰 + Tailwind 유틸리티)만 더한다 — 게임 콘텐츠엔 무영향.

   InteractiveDoc 런타임 플레이어(src/game-viewer/v2)를 마운트한다. 엔트리명
   (/game-viewer.html)·보드 계약은 불가침. 옛 GameSpec(v1) 코드는 제거됨(git 이력 보존). */
import { createRoot } from "react-dom/client";
import "./chrome.css"; // 교사 크롬(편집 모달·풀스크린·호버 버튼) — Milray, preflight 제외
import { App } from "../v2/App";

const el = document.getElementById("kv-game-root");
if (el) {
  el.className = "kv-game-root";
  createRoot(el).render(<App />);
}
