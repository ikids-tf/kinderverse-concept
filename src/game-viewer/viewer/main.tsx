/* 게임 뷰어 진입점 — 보드 카드(iframe)가 same-origin으로 임베드하는 별도 React 루트.
   🔴 앱의 Milray 토큰을 import 하지 않는다(게임 화면은 파스텔 독립 — theme.ts). */
import { createRoot } from "react-dom/client";
import "./game-viewer.css";
import { StartScreen } from "../entry/StartScreen";

const embedded = window.parent !== window;
const el = document.getElementById("kv-game-root");
if (el) {
  el.className = "kv-game-root";
  // 임베드(보드 카드) 시엔 카드 자체가 닫기를 제공하므로 ✕ 생략.
  // 단독 탭으로 열렸을 때만 홈('/')으로 나가는 ✕ 노출.
  createRoot(el).render(
    <StartScreen onExit={embedded ? undefined : () => { window.location.href = "/"; }} />,
  );
}
