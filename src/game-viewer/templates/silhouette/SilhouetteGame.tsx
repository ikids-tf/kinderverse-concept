/**
 * SilhouetteGame.tsx — silhouette 템플릿 (STEP 6).
 * ------------------------------------------------------------------
 * - 정답 에셋을 단색 실루엣으로 크게 표시.
 * - 보기 에셋(컬러) 버튼들.
 * - 정답 선택 → 실루엣이 컬러로 모핑 + 스케일 인(Motion) → 보상.
 * - 오답 → 부드러운 흔들림 + 다정한 재시도(부정 연출 없음).
 */
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { SilhouetteGame as SilhouetteGameSpec, SilhouetteRound } from "../../schema/gameSpec";
import { AssetSprite, findAsset } from "../../assets/Sprite";
import { palette, pastelRotation, radius, shadow, spring, touch } from "../../theme";
import { GameShell, type RoundFlow } from "../../engine/GameShell";

const STAGE = 240; // 실루엣 무대 한 변(px)
const OPTION = 116;

export function SilhouetteGame({ spec, onExit }: { spec: SilhouetteGameSpec; onExit?: () => void }) {
  return (
    <GameShell
      spec={spec}
      rounds={spec.rounds}
      roundPrompt={() => "이 그림자는 무엇일까요?"}
      onExit={onExit}
    >
      {(flow) => <SilhouetteRoundView key={flow.roundIndex} flow={flow} spec={spec} />}
    </GameShell>
  );
}

function SilhouetteRoundView({ flow, spec }: { flow: RoundFlow<SilhouetteRound>; spec: SilhouetteGameSpec }) {
  const { round, solve, miss, solved } = flow;
  const answer = findAsset(spec, round.answerAssetId);
  const [revealed, setRevealed] = useState(false);
  const [wrongId, setWrongId] = useState<string | null>(null);

  const choose = (id: string) => {
    if (solved || revealed) return;
    if (id === round.answerAssetId) {
      setRevealed(true); // 실루엣 → 컬러 모핑
      window.setTimeout(solve, 420); // 모핑이 시작되면 보상 오케스트레이션
    } else {
      setWrongId(id);
      miss();
      window.setTimeout(() => setWrongId((w) => (w === id ? null : w)), 480);
    }
  };

  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 28, padding: "8px 18px 18px" }}>
      {/* 실루엣 무대 */}
      <div style={{ width: STAGE, height: STAGE, position: "relative", display: "grid", placeItems: "center" }}>
        <AnimatePresence mode="wait">
          {!revealed ? (
            <motion.div
              key="sil"
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={spring.soft}
              style={{ width: STAGE, height: STAGE, filter: "drop-shadow(0 10px 16px rgba(120,110,130,.22))" }}
            >
              {answer && <AssetSprite asset={answer} mode="silhouette" color={palette.textSoft} />}
            </motion.div>
          ) : (
            <motion.div
              key="color"
              initial={{ scale: 0.4, opacity: 0, rotate: -12 }}
              animate={{ scale: [0.4, 1.18, 1], opacity: 1, rotate: 0 }}
              transition={{ duration: 0.6, ...spring.bouncy }}
              style={{ width: STAGE, height: STAGE, filter: "drop-shadow(0 12px 18px rgba(120,110,130,.26))" }}
            >
              {answer && <AssetSprite asset={answer} mode="color" />}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 정답 이름(공개 후 시각 보조) */}
      <div style={{ height: 30 }}>
        <AnimatePresence>
          {revealed && answer && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              style={{ fontSize: 26, fontWeight: 800, color: palette.textSoft }}
            >
              {answer.label}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 보기(컬러) */}
      <div style={{ display: "flex", gap: touch.gap, flexWrap: "wrap", justifyContent: "center" }}>
        {round.optionAssetIds.map((id, i) => {
          const opt = findAsset(spec, id);
          if (!opt) return null;
          return (
            <motion.button
              key={id}
              type="button"
              aria-label={opt.label}
              onClick={() => choose(id)}
              disabled={solved || revealed}
              whileTap={{ scale: 0.92 }}
              whileHover={{ scale: 1.05 }}
              animate={wrongId === id ? { x: [0, -8, 8, -6, 6, 0] } : { x: 0 }}
              transition={wrongId === id ? { duration: 0.42 } : spring.soft}
              style={{
                width: OPTION,
                height: OPTION,
                padding: 14,
                borderRadius: radius.card,
                border: "none",
                background: pastelRotation[i % pastelRotation.length],
                cursor: solved || revealed ? "default" : "pointer",
                boxShadow: shadow.soft,
              }}
            >
              <AssetSprite asset={opt} mode="color" />
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
