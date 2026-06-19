/**
 * OptionButton.tsx — tap/match 공용 보기 버튼.
 * 상태(idle/correct/wrong/picked/locked)에 따라 스타일 + Motion 반응(wrong→shake, locked→bounce).
 * 등장은 enterName 프리셋(드롭/팝). 큰 터치 타깃은 슬롯 transform이 보장.
 */
import { useEffect, useRef } from "react";
import { motion, useAnimationControls, useReducedMotion } from "motion/react";
import { Positioned, VisualBox } from "../NodeRenderer";
import { resolveVisual } from "../content";
import { entrance, reaction } from "../presets";
import { radiusStyle } from "../layout";
import { useGame, type OptStatus } from "../useGame";
import type { ContentBinding, SceneNode, Style } from "../../schema/interactiveDoc";
import type { MoodKey } from "../../theme";

type Transform = SceneNode["transform"];

const STATUS_CLASS: Record<OptStatus, string> = {
  idle: "", correct: "correct", wrong: "wrong", picked: "picked", locked: "locked",
};

export function OptionButton(props: {
  content: ContentBinding;
  status: OptStatus;
  t: Transform;
  style?: Style;
  disabled: boolean;
  enterName: "drop" | "pop";
  onClick: () => void;
}) {
  const { content, status, t, style, disabled, enterName, onClick } = props;
  const reduced = !!useReducedMotion();
  const controls = useAnimationControls();
  const mood = useGame((s) => (s.doc?.settings.mood ?? "lively") as MoodKey);
  const prev = useRef<OptStatus>(status);

  useEffect(() => {
    if (status !== prev.current) {
      prev.current = status;
      const name = status === "wrong" ? "shake" : status === "locked" ? "bounce" : null;
      if (name) {
        const kf = reaction(name, mood, reduced);
        if (kf) void controls.start(kf);
      }
    }
  }, [status, controls, mood, reduced]);

  const ent = entrance(enterName, reduced);

  return (
    <Positioned t={t}>
      <motion.div
        className="node-inner"
        initial={ent?.initial}
        animate={ent?.animate}
        transition={ent?.transition}
      >
        <motion.button
          type="button"
          className={`opt ${STATUS_CLASS[status]}`}
          style={radiusStyle(style)}
          animate={controls}
          disabled={disabled}
          onClick={onClick}
        >
          <VisualBox visual={resolveVisual(content)} t={t} style={style} />
        </motion.button>
      </motion.div>
    </Positioned>
  );
}
