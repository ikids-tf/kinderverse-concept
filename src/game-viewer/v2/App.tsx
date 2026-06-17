/**
 * App.tsx — v2 게임 뷰어 루트. main.tsx가 이 컴포넌트를 #kv-game-root에 마운트한다.
 * ------------------------------------------------------------------
 * 🔴 Milray Park 미적용. theme.ts 파스텔 토큰을 CSS 변수로 루트에 주입(STEP 2) → player.css가 소비.
 * M0: 픽스처를 직접 투입(Resolver/추천카드는 M2). 첫 화면은 '동물 맞추기'.
 */
import { useEffect, type CSSProperties } from "react";
import "../viewer/game-viewer.css"; // Jua 폰트 + #kv-game-root 베이스
import "./runtime/player.css";
import { theme, cssVars } from "./theme";
import { useGame } from "./runtime/useGame";
import { useGameEffects } from "./runtime/useGameEffects";
import { useBoardBridge } from "./runtime/useBoardBridge";
import { GameStage } from "./runtime/GameStage";

/** theme.ts 토큰 → 무대 컨테이너 CSS 변수(STEP 2). cssVars()에 없는 그림자·폰트만 보강. */
const rootVars: Record<string, string> = {
  ...cssVars(),
  "--shadow": theme.shadow.card,
  "--shadow-sm": theme.shadow.soft,
  "--shadow-reward": theme.shadow.reward,
  "--font-display": theme.fonts.display,
  "--font-sans": theme.fonts.body,
};
const rootStyle = {
  ...rootVars,
  fontFamily: "var(--font-sans)",
  color: "var(--ink)",
  background: "var(--bg)",
  minHeight: "100%",
} as CSSProperties;

export function App() {
  const loadExample = useGame((s) => s.loadExample);
  useGameEffects();
  useBoardBridge(); // 보드 메인 프롬프트바 → 게임 생성 + 교사 크롬 가시성(임베드 시)
  useEffect(() => {
    loadExample("animal");
  }, [loadExample]);

  return (
    <div className="kv-v2" style={rootStyle}>
      <GameStage />
    </div>
  );
}
