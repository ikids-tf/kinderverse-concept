/**
 * GameViewer.tsx — 진입점 (STEP 3). spec.templateId 로 템플릿을 라우팅한다.
 * ------------------------------------------------------------------
 * - 배경은 파스텔(테마별로 살짝 다른 톤). 게임 화면 안쪽은 Milray 미적용.
 * - 4종 템플릿(counting/silhouette/emotion/matching) 모두 렌더(판별 유니온).
 */
import { palette } from "../theme";
import type { GameSpec } from "../schema/gameSpec";
import { CountingGame } from "../templates/counting/CountingGame";
import { SilhouetteGame } from "../templates/silhouette/SilhouetteGame";
import { EmotionGame } from "../templates/emotion/EmotionGame";
import { MatchingGame } from "../templates/matching/MatchingGame";

/** 테마(카테고리/관계)별 배경 톤 — 단조로움 방지. */
const BG_BY_THEME: Record<string, string> = {
  animal: palette.bgCream,
  fruit: palette.bgMintTint,
  vehicle: palette.bgSky,
  food: palette.bgCream,
  plant: palette.bgMintTint,
  job: palette.bgLavenderTint,
  emotion: palette.bgLavenderTint,
  // matching 테마 = 관계 id
  "animal-food": palette.bgMintTint,
  "job-tool": palette.bgSky,
};

export function GameViewer({ spec, onExit }: { spec: GameSpec; onExit?: () => void }) {
  const bg = BG_BY_THEME[spec.theme] ?? palette.bgCream;

  return (
    <div
      className="kv-game-viewer"
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        background: bg,
        overflow: "hidden",
      }}
    >
      {spec.templateId === "counting" && <CountingGame spec={spec} onExit={onExit} />}
      {spec.templateId === "silhouette" && <SilhouetteGame spec={spec} onExit={onExit} />}
      {spec.templateId === "emotion" && <EmotionGame spec={spec} onExit={onExit} />}
      {spec.templateId === "matching" && <MatchingGame spec={spec} onExit={onExit} />}
    </div>
  );
}
