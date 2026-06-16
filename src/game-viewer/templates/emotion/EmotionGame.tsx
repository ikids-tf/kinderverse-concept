/**
 * EmotionGame.tsx — emotion 템플릿 (표정 보고 마음 알기, M2).
 * ------------------------------------------------------------------
 * 흐름: ① 친구가 감정을 "연기"(표정 + 그 감정다운 움직임) → ② 아이가 감정 식별 →
 *       ③ 공감 액션("안아주기") → ④ 표정 전이(밝은 얼굴 + 하트) → 보상.
 *
 * 🔴 Rive 대체 주석: 본래 계약(EmotionRound.riveStateMachine)은 Rive 상태머신을
 *    가리킨다. 아직 .riv 에셋이 없어, M2에서는 OpenMoji 표정 + Motion으로 "감정 연기와
 *    표정 전이"를 구현한다(OpenMoji-first 안전 경로). .riv 가 준비되면 이 파일의 얼굴
 *    렌더 레이어만 RiveCharacter 로 교체하면 되고, GameSpec/엔진/흐름은 그대로다.
 */
import { useState } from "react";
import { AnimatePresence, motion, type TargetAndTransition, type Transition } from "motion/react";
import type { EmotionGame as EmotionGameSpec, EmotionRound, Emotion } from "../../schema/gameSpec";
import { Sprite } from "../../assets/Sprite";
import { palette, pastelRotation, radius, shadow, spring, touch } from "../../theme";
import { GameShell, PillButton, type RoundFlow } from "../../engine/GameShell";

/** 감정 → OpenMoji 표정 hexcode. (Rive 에셋이 들어오면 이 매핑은 사용 안 함) */
const EMOTION_FACE: Record<Emotion, string> = {
  happy: "1F600", // 😀
  sad: "1F622", // 😢
  angry: "1F620", // 😠
  scared: "1F628", // 😨
  surprised: "1F632", // 😲
};
/** 공감 후 밝아진 얼굴(표정 전이 목표). */
const COMFORTED_FACE = "1F60A"; // 😊
const EMOTION_KO: Record<Emotion, string> = {
  happy: "기쁨",
  sad: "슬픔",
  angry: "화남",
  scared: "무서움",
  surprised: "놀람",
};

/** 감정다운 idle 움직임 — 표정만으로 부족한 "연기"를 Motion이 채운다. */
function idleMotion(emotion: Emotion): { animate: TargetAndTransition; transition: Transition } {
  switch (emotion) {
    case "happy":
      return { animate: { y: [0, -12, 0] }, transition: { duration: 1.1, repeat: Infinity, ease: "easeInOut" } };
    case "sad":
      return { animate: { rotate: [-3, 3, -3], y: [0, 6, 0] }, transition: { duration: 2.2, repeat: Infinity, ease: "easeInOut" } };
    case "angry":
      return { animate: { x: [0, -6, 6, -6, 6, 0] }, transition: { duration: 0.5, repeat: Infinity, repeatDelay: 0.7 } };
    case "scared":
      return { animate: { x: [0, -3, 3, -3, 3, 0] }, transition: { duration: 0.35, repeat: Infinity } };
    case "surprised":
      return { animate: { scale: [1, 1.1, 1] }, transition: { duration: 0.9, repeat: Infinity, repeatDelay: 0.4 } };
  }
}

export function EmotionGame({ spec, onExit }: { spec: EmotionGameSpec; onExit?: () => void }) {
  return (
    <GameShell
      spec={spec}
      rounds={spec.rounds}
      roundPrompt={() => "이 친구는 어떤 기분일까요?"}
      onExit={onExit}
    >
      {(flow) => <EmotionRoundView key={flow.roundIndex} flow={flow} />}
    </GameShell>
  );
}

const FACE = 210;
const OPTION = 112;

function EmotionRoundView({ flow }: { flow: RoundFlow<EmotionRound> }) {
  const { round, solve, miss, audio, solved } = flow;
  const [phase, setPhase] = useState<"identify" | "empathy">("identify");
  const [comforted, setComforted] = useState(false);
  const [wrong, setWrong] = useState<Emotion | null>(null);

  const empathy = round.empathyAction;

  const choose = (e: Emotion) => {
    if (solved || phase !== "identify") return;
    if (e === round.emotion) {
      audio.sfx("pop");
      if (empathy) {
        setPhase("empathy");
        window.setTimeout(() => audio.voice(empathy.promptText, empathy.promptTtsUrl), 380);
      } else {
        window.setTimeout(solve, 380);
      }
    } else {
      setWrong(e);
      miss();
      window.setTimeout(() => setWrong((w) => (w === e ? null : w)), 480);
    }
  };

  const doEmpathy = () => {
    if (comforted) return;
    setComforted(true); // 표정 전이 트리거
    audio.sfx("sparkle");
    window.setTimeout(() => audio.voice("따뜻한 마음이 전해졌어요!"), 300);
    window.setTimeout(solve, 1050);
  };

  const idle = idleMotion(round.emotion);
  const actionEmoji = round.emotion === "happy" ? "🎉" : "🤗";

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 26,
        padding: "8px 18px 18px",
      }}
    >
      {/* 얼굴 무대 — 감정 연기 / 공감 후 전이 */}
      <div style={{ width: FACE, height: FACE, position: "relative", display: "grid", placeItems: "center" }}>
        <AnimatePresence mode="wait">
          {!comforted ? (
            <motion.div
              key="emotion"
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.6, opacity: 0 }}
              transition={spring.soft}
              style={{ width: FACE, height: FACE, filter: "drop-shadow(0 12px 18px rgba(120,110,130,.22))" }}
            >
              {/* 등장(opacity/scale)과 감정 idle(움직임)을 분리 — 등장은 빠르게, idle은 루프 */}
              <motion.div animate={idle.animate} transition={idle.transition} style={{ width: "100%", height: "100%" }}>
                <Sprite refCode={EMOTION_FACE[round.emotion]} label={EMOTION_KO[round.emotion]} />
              </motion.div>
            </motion.div>
          ) : (
            <motion.div
              key="comforted"
              initial={{ scale: 0.4, opacity: 0, rotate: -10 }}
              animate={{ scale: [0.4, 1.2, 1], opacity: 1, rotate: 0 }}
              transition={{ duration: 0.6, ...spring.bouncy }}
              style={{ width: FACE, height: FACE, filter: "drop-shadow(0 12px 20px rgba(120,110,130,.26))" }}
            >
              <Sprite refCode={COMFORTED_FACE} label="밝아진 얼굴" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* 떠오르는 하트 — 공감 순간 */}
        <AnimatePresence>
          {comforted &&
            [-70, 0, 70].map((dx, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: dx, y: 30, scale: 0.6 }}
                animate={{ opacity: [0, 1, 0], y: -110, scale: 1.2 }}
                transition={{ duration: 1.2, delay: i * 0.12, ease: "easeOut" }}
                style={{ position: "absolute", fontSize: 40, pointerEvents: "none" }}
                aria-hidden
              >
                💕
              </motion.div>
            ))}
        </AnimatePresence>
      </div>

      {/* 하단 — 식별 보기 / 공감 액션 */}
      <div style={{ minHeight: OPTION + 8, display: "grid", placeItems: "center", width: "100%" }}>
        <AnimatePresence mode="wait">
          {phase === "identify" ? (
            <motion.div
              key="options"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={spring.soft}
              style={{ display: "flex", gap: touch.gap, flexWrap: "wrap", justifyContent: "center" }}
            >
              {round.optionEmotions.map((e, i) => (
                <motion.button
                  key={e}
                  type="button"
                  aria-label={EMOTION_KO[e]}
                  onClick={() => choose(e)}
                  disabled={solved}
                  whileTap={{ scale: 0.92 }}
                  whileHover={{ scale: 1.05 }}
                  animate={wrong === e ? { x: [0, -8, 8, -6, 6, 0] } : { x: 0 }}
                  transition={wrong === e ? { duration: 0.42 } : spring.soft}
                  style={{
                    width: OPTION,
                    height: OPTION,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 4,
                    padding: 10,
                    borderRadius: radius.card,
                    border: "none",
                    background: pastelRotation[i % pastelRotation.length],
                    boxShadow: shadow.soft,
                    cursor: solved ? "default" : "pointer",
                  }}
                >
                  <div style={{ width: 56, height: 56 }}>
                    <Sprite refCode={EMOTION_FACE[e]} label={EMOTION_KO[e]} />
                  </div>
                  <span style={{ fontSize: 15, fontWeight: 800, color: palette.textOnPastel }}>{EMOTION_KO[e]}</span>
                </motion.button>
              ))}
            </motion.div>
          ) : (
            <motion.div
              key="empathy"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={spring.soft}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}
            >
              <div style={{ fontSize: 20, fontWeight: 800, color: palette.textSoft, textAlign: "center", maxWidth: 360, lineHeight: 1.45 }}>
                {empathy?.promptText}
              </div>
              {!comforted && empathy && (
                <PillButton tone="primary" onClick={doEmpathy}>
                  {actionEmoji} {empathy.actionLabel}
                </PillButton>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
