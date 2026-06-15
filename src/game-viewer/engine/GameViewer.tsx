/**
 * GameViewer.tsx — 진입점 (STEP 3). spec.templateId 로 템플릿을 라우팅한다.
 * ------------------------------------------------------------------
 * - 배경은 파스텔(테마별로 살짝 다른 톤). 게임 화면 안쪽은 Milray 미적용.
 * - 알 수 없는/미구현(M2) templateId 는 친절한 빈 상태로 안내(에러 X).
 */
import { palette, radius, shadow } from "../theme";
import type { GameSpec } from "../schema/gameSpec";
import { CountingGame } from "../templates/counting/CountingGame";
import { SilhouetteGame } from "../templates/silhouette/SilhouetteGame";
import { PillButton } from "./GameShell";

/** 테마(카테고리/관계)별 배경 톤 — 단조로움 방지. */
const BG_BY_THEME: Record<string, string> = {
  animal: palette.bgCream,
  fruit: palette.bgMintTint,
  vehicle: palette.bgSky,
  food: palette.bgCream,
  plant: palette.bgMintTint,
  job: palette.bgLavenderTint,
  emotion: palette.bgLavenderTint,
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
      {(spec.templateId === "emotion" || spec.templateId === "matching") && (
        <ComingSoon title={spec.title} onExit={onExit} />
      )}
    </div>
  );
}

function ComingSoon({ title, onExit }: { title: string; onExit?: () => void }) {
  return (
    <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: 24 }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
          padding: "36px 44px",
          background: palette.outline,
          borderRadius: radius.card,
          boxShadow: shadow.soft,
          textAlign: "center",
          maxWidth: 420,
        }}
      >
        <div style={{ fontSize: 64, lineHeight: 1 }}>🛠️</div>
        <div style={{ fontSize: 24, fontWeight: 800, color: palette.textSoft }}>{title}</div>
        <div style={{ fontSize: 17, color: palette.textOnPastel, lineHeight: 1.5 }}>
          이 놀이는 곧 만나요. 지금은 <b>숫자 세기</b>와 <b>그림자 맞추기</b>를 즐길 수 있어요!
        </div>
        {onExit && <PillButton tone="primary" onClick={onExit}>다른 놀이 고르기</PillButton>}
      </div>
    </div>
  );
}
