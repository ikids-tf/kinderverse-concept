/* 게임 뷰어 진입점 — 보드 카드(iframe)가 same-origin으로 임베드하는 별도 React 루트.
   🔴 앱의 Milray 토큰을 import 하지 않는다(게임 화면은 파스텔 독립 — v2/theme.ts).

   InteractiveDoc 런타임 플레이어(src/game-viewer/v2)를 마운트한다. 엔트리명
   (/game-viewer.html)·보드 계약은 불가침. 옛 GameSpec(v1) 코드는 제거됨(git 이력 보존). */
import { createRoot } from "react-dom/client";
import { App } from "../v2/App";

const el = document.getElementById("kv-game-root");
if (el) {
  el.className = "kv-game-root";
  createRoot(el).render(<App />);
}
