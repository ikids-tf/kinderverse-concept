/**
 * rewards.tsx — 정답 보상 연출 (STEP 3). "화려하지만 정제된".
 * ------------------------------------------------------------------
 * - confetti: 파스텔 팔레트에서만 색을 뽑는다(원색 형광 금지 — 눈 피로).
 * - 별 팝: 화면 중앙에서 별들이 통통 튀어 올랐다 사라진다(Motion).
 * - 칭찬 음성: useGameAudio.praise 가 담당(여기선 시각만). 한 번에 몰아서.
 */
import confetti from "canvas-confetti";
import { AnimatePresence, motion } from "motion/react";
import { palette, spring } from "../theme";
import type { Rewards } from "../schema/gameSpec";

const PASTEL_CONFETTI = [
  palette.coral,
  palette.mint,
  palette.yellow,
  palette.lavender,
  palette.peach,
  palette.success,
];

/** 정돈된 한 방 — 중앙에서 좌우로 부드럽게 번지는 2연발. */
export function fireConfetti(): void {
  const base = {
    spread: 70,
    startVelocity: 38,
    gravity: 0.9,
    scalar: 1.05,
    ticks: 160,
    colors: PASTEL_CONFETTI,
    disableForReducedMotion: true,
  };
  confetti({ ...base, particleCount: 70, origin: { x: 0.5, y: 0.62 } });
  setTimeout(() => {
    confetti({ ...base, particleCount: 40, angle: 60, origin: { x: 0.15, y: 0.7 } });
    confetti({ ...base, particleCount: 40, angle: 120, origin: { x: 0.85, y: 0.7 } });
  }, 140);
}

/** 별 팝 오버레이 — show=true 동안 별들이 튀어오른다. pointer 통과(게임 방해 X). */
export function RewardOverlay({ show }: { show: boolean }) {
  const stars = [
    { x: -120, y: -20, d: 0, s: 1.2 },
    { x: 0, y: -90, d: 0.06, s: 1.6 },
    { x: 120, y: -20, d: 0.12, s: 1.2 },
    { x: -60, y: 40, d: 0.09, s: 1.0 },
    { x: 60, y: 40, d: 0.15, s: 1.0 },
  ];
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="kv-game-reward-overlay"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            pointerEvents: "none",
            zIndex: 30,
          }}
        >
          <div style={{ position: "relative" }}>
            {stars.map((st, i) => (
              <motion.div
                key={i}
                initial={{ scale: 0, x: 0, y: 0, opacity: 0, rotate: -30 }}
                animate={{ scale: st.s, x: st.x, y: st.y, opacity: 1, rotate: 0 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ ...spring.bouncy, delay: st.d }}
                style={{ position: "absolute", fontSize: 56, lineHeight: 1, filter: "drop-shadow(0 6px 10px rgba(120,110,130,.25))" }}
              >
                ⭐
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** confetti 효과가 보상에 포함됐는지(없으면 별만). */
export function rewardWantsConfetti(rewards: Rewards): boolean {
  return rewards.effects.includes("confetti");
}
