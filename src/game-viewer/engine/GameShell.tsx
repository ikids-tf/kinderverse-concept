/**
 * GameShell.tsx — 공통 게임 셸 (STEP 3).
 * ------------------------------------------------------------------
 * 템플릿(counting/silhouette…)을 감싸 공통 흐름을 담당한다:
 *   - 라운드 시작 시 지시문 음성 자동 재생 + 다시 듣기 버튼.
 *   - 라운드 진행(별 진행바, 다음 라운드 전환 — Motion).
 *   - 정답 시 보상 오케스트레이션(confetti + 별 팝 + 칭찬 음성, 한 번에).
 *   - 마지막 라운드 후 승리 화면(다시 하기 / 닫기).
 * 라운드 타입은 제네릭 — 템플릿이 자기 타입대로 렌더한다(render-prop).
 *
 * 🔴 오답에 부정 연출 없음: miss()는 부드러운 톤 + 다정한 재시도 음성만.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { palette, radius, shadow, spring, touch } from "../theme";
import type { GameSpec } from "../schema/gameSpec";
import { useGameAudio, type GameAudio, isGameMuted, setGameMuted } from "./useGameAudio";
import { fireConfetti, RewardOverlay, rewardWantsConfetti } from "./rewards";
import { useFullscreen } from "./useFullscreen";

export interface RoundFlow<R> {
  round: R;
  roundIndex: number;
  total: number;
  spec: GameSpec;
  audio: GameAudio;
  /** 정답 — 보상 연출 후 다음 라운드(또는 승리)로. 멱등(중복 호출 무시). */
  solve: () => void;
  /** 오답 — 부드러운 효과음 + 다정한 재시도(부정 연출 없음). */
  miss: () => void;
  /** 현재 라운드 해결됨(보상 연출 중) */
  solved: boolean;
}

const RETRY_LINES = ["다시 해볼까요?", "괜찮아요, 한 번 더!", "천천히 골라 봐요."];

interface GameShellProps<R> {
  spec: GameSpec;
  rounds: R[];
  /** 라운드마다 음성으로 읽어줄 지시문(없으면 spec.instruction.text) */
  roundPrompt?: (round: R, index: number) => string;
  /** 닫기(✕) — 보드 iframe/스타트 화면으로 */
  onExit?: () => void;
  children: (flow: RoundFlow<R>) => ReactNode;
}

export function GameShell<R>({ spec, rounds, roundPrompt, onExit, children }: GameShellProps<R>) {
  const audio = useGameAudio();
  const total = rounds.length;
  const [idx, setIdx] = useState(0);
  const [solved, setSolved] = useState(false);
  const [showReward, setShowReward] = useState(false);
  const [won, setWon] = useState(false);
  const [muted, setMuted] = useState(isGameMuted());
  const { isFs, toggle: toggleFs } = useFullscreen();
  const advanceTimer = useRef<number | null>(null);

  const round = rounds[idx];
  const promptText = round ? (roundPrompt?.(round, idx) ?? spec.instruction.text) : spec.instruction.text;

  // 라운드 시작 시 지시문 자동 음성(전환과 겹치지 않게 살짝 지연).
  useEffect(() => {
    if (won) return;
    const t = window.setTimeout(() => audio.voice(promptText, idx === 0 ? spec.instruction.ttsUrl : undefined), 480);
    return () => window.clearTimeout(t);
    // promptText는 idx에서 파생 — idx만 의존(매 입력마다 재실행 방지).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, won]);

  useEffect(() => () => { if (advanceTimer.current) window.clearTimeout(advanceTimer.current); }, []);

  const solve = useCallback(() => {
    setSolved((already) => {
      if (already) return already;
      if (rewardWantsConfetti(spec.rewards)) fireConfetti();
      else audio.sfx("sparkle");
      audio.praise(spec.rewards.voicePraise, spec.rewards.voicePraiseTtsUrl);
      setShowReward(true);
      advanceTimer.current = window.setTimeout(() => {
        setShowReward(false);
        if (idx + 1 >= total) {
          setWon(true);
          audio.sfx("sparkle");
          setTimeout(() => audio.voice("모두 끝났어요! 정말 잘했어요!"), 300);
        } else {
          setIdx((i) => i + 1);
          setSolved(false);
        }
      }, 1700);
      return true;
    });
  }, [spec.rewards, audio, idx, total]);

  const miss = useCallback(() => {
    audio.sfx("soft");
    const line = RETRY_LINES[Math.min(idx, RETRY_LINES.length - 1)];
    setTimeout(() => audio.voice(line), 240);
  }, [audio, idx]);

  const restart = useCallback(() => {
    setWon(false);
    setSolved(false);
    setShowReward(false);
    setIdx(0);
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      setGameMuted(next);
      if (next) audio.stop();
      return next;
    });
  }, [audio]);

  const filled = Math.min(idx + (solved ? 1 : 0), total);

  return (
    <div
      className="kv-game-shell"
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        color: palette.textSoft,
        overflow: "hidden",
      }}
    >
      {/* 상단바 — 진행 별 + 다시 듣기 + 음소거 + 닫기 (큰 둥근 터치 타깃) */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "14px 18px",
          flex: "0 0 auto",
        }}
      >
        <div style={{ display: "flex", gap: 6, alignItems: "center" }} aria-label={`진행 ${filled} / ${total}`}>
          {Array.from({ length: total }).map((_, i) => (
            <motion.span
              key={i}
              animate={{ scale: i < filled ? 1 : 0.8, opacity: i < filled ? 1 : 0.35 }}
              transition={spring.soft}
              style={{ fontSize: 24, lineHeight: 1 }}
            >
              {i < filled ? "⭐" : "☆"}
            </motion.span>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <RoundButton label="다시 듣기" onClick={() => audio.voice(promptText)}>🔊</RoundButton>
        <RoundButton label={muted ? "소리 켜기" : "소리 끄기"} onClick={toggleMute}>{muted ? "🔇" : "🔈"}</RoundButton>
        <RoundButton label={isFs ? "전체 화면 끄기" : "전체 화면"} onClick={toggleFs}>{isFs ? "🡼" : "⛶"}</RoundButton>
        {onExit && <RoundButton label="닫기" onClick={onExit}>✕</RoundButton>}
      </header>

      {/* 본문 — 현재 라운드 (전환 애니메이션) */}
      <main style={{ position: "relative", flex: 1, minHeight: 0 }}>
        <AnimatePresence mode="wait">
          {!won && round && (
            <motion.div
              key={idx}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={spring.soft}
              style={{ position: "absolute", inset: 0 }}
            >
              {children({ round, roundIndex: idx, total, spec, audio, solve, miss, solved })}
            </motion.div>
          )}
        </AnimatePresence>

        <RewardOverlay show={showReward} />

        {/* 승리 화면 */}
        <AnimatePresence>
          {won && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={spring.bouncy}
              style={{
                position: "absolute",
                inset: 0,
                display: "grid",
                placeItems: "center",
                zIndex: 20,
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 18,
                  padding: "36px 48px",
                  background: palette.outline,
                  borderRadius: radius.card,
                  boxShadow: shadow.lifted,
                }}
              >
                <motion.div
                  animate={{ rotate: [0, -8, 8, -6, 0], scale: [1, 1.15, 1] }}
                  transition={{ duration: 1.2, repeat: Infinity, repeatDelay: 0.5 }}
                  style={{ fontSize: 84, lineHeight: 1 }}
                >
                  🎉
                </motion.div>
                <div style={{ fontSize: 30, fontWeight: 800, color: palette.textSoft }}>참 잘했어요!</div>
                <div style={{ display: "flex", gap: 14 }}>
                  <PillButton tone="primary" onClick={restart}>다시 하기</PillButton>
                  {onExit && <PillButton tone="soft" onClick={onExit}>그만하기</PillButton>}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

/* ───────────────────────── 작은 UI 부품 (파스텔) ───────────────────────── */

function RoundButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      whileTap={{ scale: 0.9 }}
      style={{
        width: 48,
        height: 48,
        borderRadius: radius.pill,
        border: "none",
        background: palette.outline,
        boxShadow: shadow.soft,
        fontSize: 22,
        cursor: "pointer",
        color: palette.textSoft,
        display: "grid",
        placeItems: "center",
      }}
    >
      {children}
    </motion.button>
  );
}

export function PillButton({
  children,
  onClick,
  tone = "primary",
}: {
  children: ReactNode;
  onClick: () => void;
  tone?: "primary" | "soft";
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.94 }}
      whileHover={{ scale: 1.04 }}
      style={{
        minHeight: touch.minTarget - 8,
        padding: "0 28px",
        borderRadius: radius.pill,
        border: "none",
        background: tone === "primary" ? palette.coral : palette.outline,
        color: palette.textOnPastel,
        boxShadow: shadow.soft,
        fontSize: 20,
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      {children}
    </motion.button>
  );
}
