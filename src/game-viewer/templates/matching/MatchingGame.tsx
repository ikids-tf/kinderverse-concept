/**
 * MatchingGame.tsx — matching 템플릿 (줄로 잇기, M2).
 * ------------------------------------------------------------------
 * - 좌/우 두 칼럼(동물–먹이, 직업–도구 등)을 보기로 깐다. 우측은 셔플.
 * - 왼쪽 항목을 탭해 고르고 → 어울리는 오른쪽 항목을 탭하면 둘 사이에 줄이 그어진다.
 *   (유아 손가락엔 가로 드래그보다 탭-탭이 관대하다. 줄은 Motion으로 그어지며 스냅감.)
 * - 정답 쌍 → 파스텔 줄 + 스냅 효과음 / 오답 → 부드러운 흔들림 + 다정한 재시도(부정 연출 없음).
 * - 모든 쌍을 이으면 보상(GameShell.solve).
 *
 * 🔴 줄 좌표는 항목의 offset(레이아웃 박스)으로 계산 — Motion의 scale 변형에 영향받지 않아
 *    안정적이다. stageRef(positioned·padless)가 모든 항목의 offsetParent가 되게 둔다.
 */
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import type { MatchingGame as MatchingGameSpec, MatchingRound } from "../../schema/gameSpec";
import { AssetSprite, findAsset } from "../../assets/Sprite";
import { palette, pastelRotation, radius, shadow, spring } from "../../theme";
import { GameShell, type RoundFlow } from "../../engine/GameShell";

/** 라운드마다 한 번만 섞는다(렌더마다 자리가 바뀌지 않게 useMemo로 고정). */
function shuffleOnce<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function MatchingGame({ spec, onExit }: { spec: MatchingGameSpec; onExit?: () => void }) {
  return (
    <GameShell
      spec={spec}
      rounds={spec.rounds}
      roundPrompt={() => "어울리는 것끼리 줄로 이어 볼까요?"}
      onExit={onExit}
    >
      {(flow) => <MatchingRoundView key={flow.roundIndex} flow={flow} spec={spec} />}
    </GameShell>
  );
}

type Anchor = { x: number; y: number };

function MatchingRoundView({ flow, spec }: { flow: RoundFlow<MatchingRound>; spec: MatchingGameSpec }) {
  const { round, solve, miss, audio, solved } = flow;

  const leftIds = round.pairs.map((p) => p.leftAssetId);
  const rightIds = useMemo(() => shuffleOnce(round.pairs.map((p) => p.rightAssetId)), [round]);
  const answerFor = useMemo(() => {
    const m = new Map<string, string>();
    round.pairs.forEach((p) => m.set(p.leftAssetId, p.rightAssetId));
    return m;
  }, [round]);

  const stageRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());
  const [anchors, setAnchors] = useState<Record<string, Anchor>>({});
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 });

  const [activeLeft, setActiveLeft] = useState<string | null>(null);
  const [links, setLinks] = useState<Array<{ leftId: string; rightId: string; color: string }>>([]);
  const [wrong, setWrong] = useState<{ leftId: string; rightId: string } | null>(null);

  // 항목 위치(연결점) 계산 — 왼쪽은 오른쪽 모서리 중앙, 오른쪽은 왼쪽 모서리 중앙.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const recompute = () => {
      const next: Record<string, Anchor> = {};
      const side = (id: string, isLeft: boolean) => {
        const el = itemRefs.current.get(id);
        if (!el) return;
        next[id] = {
          x: isLeft ? el.offsetLeft + el.offsetWidth : el.offsetLeft,
          y: el.offsetTop + el.offsetHeight / 2,
        };
      };
      leftIds.forEach((id) => side(id, true));
      rightIds.forEach((id) => side(id, false));
      setAnchors(next);
      setStageSize({ w: stage.clientWidth, h: stage.clientHeight });
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(stage);
    return () => ro.disconnect();
    // leftIds/rightIds는 round에서 파생 — round만 의존(매 렌더 재구독 방지).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round]);

  const linkedLeft = new Set(links.map((l) => l.leftId));
  const linkedRight = new Set(links.map((l) => l.rightId));

  const tapLeft = (id: string) => {
    if (solved || linkedLeft.has(id)) return;
    audio.sfx("count");
    setActiveLeft((cur) => (cur === id ? null : id));
  };

  const tapRight = (rid: string) => {
    if (solved || linkedRight.has(rid)) return;
    const lid = activeLeft;
    if (!lid) {
      audio.sfx("count"); // 왼쪽을 먼저 골라요 — 부드러운 안내음만
      return;
    }
    if (answerFor.get(lid) === rid) {
      const color = pastelRotation[links.length % pastelRotation.length];
      const next = [...links, { leftId: lid, rightId: rid, color }];
      setLinks(next);
      setActiveLeft(null);
      audio.sfx("pop");
      if (next.length >= round.pairs.length) window.setTimeout(solve, 460);
    } else {
      setWrong({ leftId: lid, rightId: rid });
      setActiveLeft(null);
      miss();
      window.setTimeout(
        () => setWrong((w) => (w && w.leftId === lid && w.rightId === rid ? null : w)),
        480,
      );
    }
  };

  return (
    <div ref={stageRef} style={{ position: "absolute", inset: 0 }}>
      {/* 연결 줄 — 항목 뒤에 깔되 포인터 통과 */}
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${stageSize.w || 1} ${stageSize.h || 1}`}
        preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}
        aria-hidden
      >
        {links.map((l) => {
          const a = anchors[l.leftId];
          const b = anchors[l.rightId];
          if (!a || !b) return null;
          return (
            <motion.line
              key={`${l.leftId}-${l.rightId}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={l.color}
              strokeWidth={9}
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0.4 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.42, ease: "easeOut" }}
            />
          );
        })}
      </svg>

      {/* 두 칼럼 */}
      <div
        style={{
          position: "relative",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: "8px 26px 16px",
          boxSizing: "border-box",
        }}
      >
        <Column>
          {leftIds.map((id) => (
            <ItemCard
              key={id}
              assetLabel={findAsset(spec, id)?.label ?? ""}
              setRef={(el) => itemRefs.current.set(id, el)}
              sprite={findAsset(spec, id)}
              side="left"
              active={activeLeft === id}
              linked={linkedLeft.has(id)}
              shake={wrong?.leftId === id}
              disabled={solved || linkedLeft.has(id)}
              onTap={() => tapLeft(id)}
            />
          ))}
        </Column>
        <Column>
          {rightIds.map((id) => (
            <ItemCard
              key={id}
              assetLabel={findAsset(spec, id)?.label ?? ""}
              setRef={(el) => itemRefs.current.set(id, el)}
              sprite={findAsset(spec, id)}
              side="right"
              active={false}
              linked={linkedRight.has(id)}
              shake={wrong?.rightId === id}
              disabled={solved || linkedRight.has(id)}
              onTap={() => tapRight(id)}
            />
          ))}
        </Column>
      </div>
    </div>
  );
}

function Column({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, justifyContent: "center" }}>
      {children}
    </div>
  );
}

function ItemCard({
  sprite,
  assetLabel,
  setRef,
  side,
  active,
  linked,
  shake,
  disabled,
  onTap,
}: {
  sprite: ReturnType<typeof findAsset>;
  assetLabel: string;
  setRef: (el: HTMLButtonElement | null) => void;
  side: "left" | "right";
  active: boolean;
  linked: boolean;
  shake: boolean;
  disabled: boolean;
  onTap: () => void;
}) {
  return (
    <motion.button
      ref={setRef}
      type="button"
      aria-label={assetLabel}
      onClick={onTap}
      disabled={disabled}
      animate={shake ? { x: [0, -8, 8, -6, 6, 0] } : { scale: active ? 1.06 : 1 }}
      transition={shake ? { duration: 0.42 } : spring.soft}
      whileTap={disabled ? undefined : { scale: 0.94 }}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: side === "right" ? "row-reverse" : "row",
        alignItems: "center",
        gap: 12,
        minWidth: 156,
        height: 84,
        padding: "0 18px",
        borderRadius: radius.card,
        border: active
          ? `3px solid ${palette.coral}`
          : linked
            ? `3px solid ${palette.success}`
            : "3px solid transparent",
        background: palette.outline,
        boxShadow: shadow.soft,
        cursor: disabled ? "default" : "pointer",
        opacity: linked ? 0.96 : 1,
      }}
    >
      <div style={{ width: 54, height: 54, flex: "0 0 auto" }}>
        {sprite && <AssetSprite asset={sprite} mode="color" />}
      </div>
      <span style={{ fontSize: 19, fontWeight: 800, color: palette.textSoft, whiteSpace: "nowrap" }}>
        {assetLabel}
      </span>
      {linked && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: 8,
            right: side === "right" ? undefined : 10,
            left: side === "right" ? 10 : undefined,
            fontSize: 18,
          }}
        >
          ✅
        </span>
      )}
    </motion.button>
  );
}
