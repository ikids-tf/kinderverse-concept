/**
 * CountingGame.tsx — counting 템플릿 (STEP 5).
 * ------------------------------------------------------------------
 * - 아이템 N개를 흩뿌리고(random/grid), 통통 튀며 등장(Motion spring.bouncy).
 * - 아이템 탭 → bounce + 카운트업 음성("하나!","둘!") + 시각 카운터.
 * - 숫자 보기 버튼(파스텔, 큰 터치 타깃) — 정답 선택 시 보상, 오답은 부드러운 흔들림.
 */
import { useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import type { CountingGame as CountingGameSpec, CountingRound } from "../../schema/gameSpec";
import { AssetSprite, findAsset } from "../../assets/Sprite";
import { palette, pastelRotation, radius, shadow, spring, touch } from "../../theme";
import { GameShell, type RoundFlow } from "../../engine/GameShell";

const ITEM = 88; // 아이템 한 변(px)

export function CountingGame({ spec, onExit }: { spec: CountingGameSpec; onExit?: () => void }) {
  return (
    <GameShell
      spec={spec}
      rounds={spec.rounds}
      roundPrompt={(round) => {
        const label = findAsset(spec, round.itemAssetId)?.label ?? "그림";
        return `${label}가 몇 개 있을까요?`;
      }}
      onExit={onExit}
    >
      {(flow) => <CountingRoundView key={flow.roundIndex} flow={flow} spec={spec} />}
    </GameShell>
  );
}

/** 흩뿌림 좌표(%) — 지터드 그리드로 겹침을 줄인다. random은 지터, grid는 정렬. */
function useScatter(round: CountingRound) {
  return useMemo(() => {
    const n = round.count;
    const cols = Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    const jitter = round.scatter === "grid" ? 0 : 1;
    const pts: Array<{ x: number; y: number; r: number }> = [];
    for (let i = 0; i < n; i++) {
      const c = i % cols;
      const r = Math.floor(i / cols);
      const cellW = 100 / cols;
      const cellH = 100 / rows;
      const jx = (Math.random() - 0.5) * cellW * 0.5 * jitter;
      const jy = (Math.random() - 0.5) * cellH * 0.5 * jitter;
      pts.push({
        x: cellW * (c + 0.5) + jx,
        y: cellH * (r + 0.5) + jy,
        r: (Math.random() - 0.5) * 16 * jitter, // 살짝 기울임
      });
    }
    return pts;
  }, [round]);
}

function CountingRoundView({ flow, spec }: { flow: RoundFlow<CountingRound>; spec: CountingGameSpec }) {
  const { round, audio, solve, miss, solved } = flow;
  const asset = findAsset(spec, round.itemAssetId);
  const pts = useScatter(round);
  const [tapped, setTapped] = useState<Set<number>>(new Set());
  const [wrongOpt, setWrongOpt] = useState<number | null>(null);
  // ref가 동기 진실원 — 아이가 빠르게 연타해도 stale 클로저로 카운트가 누락되지 않게.
  const tappedRef = useRef<Set<number>>(tapped);

  const tapItem = (i: number) => {
    if (tappedRef.current.has(i)) return;
    const next = new Set(tappedRef.current);
    next.add(i);
    tappedRef.current = next;
    setTapped(next);
    audio.count(next.size); // "하나!","둘!"…
  };

  const chooseOption = (opt: number) => {
    if (solved) return;
    if (opt === round.count) {
      solve();
    } else {
      setWrongOpt(opt);
      miss();
      window.setTimeout(() => setWrongOpt((w) => (w === opt ? null : w)), 480);
    }
  };

  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", padding: "4px 18px 18px" }}>
      {/* 센 개수 카운터 (시각) */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 18px",
            background: palette.outline,
            borderRadius: radius.pill,
            boxShadow: shadow.soft,
            fontSize: 20,
            fontWeight: 800,
            color: palette.textSoft,
          }}
        >
          <span aria-hidden>👆</span> 센 개수 {tapped.size}
        </div>
      </div>

      {/* 흩뿌림 영역 — 아이템 탭해서 세기 */}
      <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
        {pts.map((p, i) => (
          <motion.button
            key={i}
            type="button"
            aria-label={asset?.label ?? "그림"}
            onClick={() => tapItem(i)}
            initial={{ scale: 0, opacity: 0 }}
            animate={
              tapped.has(i)
                ? { scale: [1, 1.35, 1.1], opacity: 1, y: [0, -14, 0] }
                : { scale: 1, opacity: 1 }
            }
            transition={tapped.has(i) ? { duration: 0.4 } : { ...spring.bouncy, delay: i * 0.05 }}
            whileTap={{ scale: 0.9 }}
            style={{
              position: "absolute",
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: ITEM,
              height: ITEM,
              marginLeft: -ITEM / 2,
              marginTop: -ITEM / 2,
              transform: `rotate(${p.r}deg)`,
              border: "none",
              background: "transparent",
              padding: 0,
              cursor: "pointer",
              filter: tapped.has(i)
                ? "drop-shadow(0 8px 12px rgba(120,110,130,.28))"
                : "drop-shadow(0 4px 7px rgba(120,110,130,.18))",
            }}
          >
            {asset && <AssetSprite asset={asset} />}
            {tapped.has(i) && (
              <span
                style={{
                  position: "absolute",
                  top: -6,
                  right: -6,
                  minWidth: 26,
                  height: 26,
                  padding: "0 6px",
                  borderRadius: radius.pill,
                  background: palette.success,
                  color: "#2f6b3c",
                  fontSize: 15,
                  fontWeight: 800,
                  display: "grid",
                  placeItems: "center",
                  boxShadow: shadow.soft,
                }}
              >
                {[...tapped].indexOf(i) + 1}
              </span>
            )}
          </motion.button>
        ))}
      </div>

      {/* 숫자 보기 */}
      <div style={{ display: "flex", justifyContent: "center", gap: touch.gap, flexWrap: "wrap", marginTop: 10 }}>
        {round.options.map((opt, i) => (
          <motion.button
            key={opt}
            type="button"
            aria-label={`${opt}개`}
            onClick={() => chooseOption(opt)}
            disabled={solved}
            whileTap={{ scale: 0.92 }}
            whileHover={{ scale: 1.05 }}
            animate={wrongOpt === opt ? { x: [0, -8, 8, -6, 6, 0] } : { x: 0 }}
            transition={wrongOpt === opt ? { duration: 0.42 } : spring.soft}
            style={{
              width: 96,
              height: 96,
              borderRadius: radius.card,
              border: "none",
              background: pastelRotation[i % pastelRotation.length],
              color: palette.textOnPastel,
              fontSize: 44,
              fontWeight: 800,
              cursor: solved ? "default" : "pointer",
              boxShadow: shadow.soft,
            }}
          >
            {opt}
          </motion.button>
        ))}
      </div>
    </div>
  );
}
