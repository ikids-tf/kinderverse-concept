/**
 * FlipMemory.tsx — 같은 카드 뒤집기. 카드 슬롯에 배치, Motion rotateY로 3D 플립.
 * 뒤집기/짝 판정/되돌리기 시퀀싱은 스토어(flipTap). 여긴 위치·플립 연출·클릭 전달만.
 */
import { motion, useReducedMotion } from "motion/react";
import { Positioned, VisualBox } from "../NodeRenderer";
import { useGame, type FlipCard } from "../useGame";
import { theme } from "../../theme";
import type { SceneNode } from "../../schema/interactiveDoc";

type Transform = SceneNode["transform"];
const EMPTY: SceneNode[] = [];

function FlipCardView(props: { card: FlipCard; t: Transform; disabled: boolean; onClick: () => void }) {
  const { card, t, disabled, onClick } = props;
  const reduced = !!useReducedMotion();
  const faceUp = card.status === "up" || card.status === "locked";

  return (
    <Positioned t={t}>
      <motion.button
        type="button"
        className={`flip-card${card.status === "locked" ? " locked" : ""}`}
        style={{ transformStyle: "preserve-3d" }}
        animate={{ rotateY: faceUp ? 180 : 0 }}
        transition={reduced ? { duration: 0 } : theme.motion.spring.soft}
        disabled={disabled || card.status !== "down"}
        onClick={onClick}
      >
        <span className="flip-face back" aria-hidden>❔</span>
        <span className="flip-face front">
          <VisualBox visual={card.content.type === "emoji" ? { emoji: card.content.emoji } : card.content.type === "text" ? { text: card.content.text } : { emoji: "🃏" }} t={t} />
        </span>
      </motion.button>
    </Positioned>
  );
}

export function FlipMemory() {
  const doc = useGame((s) => s.doc);
  const flipCards = useGame((s) => s.flipCards);
  const busy = useGame((s) => s.busy);
  const roundIdx = useGame((s) => s.roundIdx);
  const flipTap = useGame((s) => s.flipTap);
  const nodes = doc?.stage.nodes ?? EMPTY;

  return (
    <>
      {flipCards.map((card) => {
        const node = nodes.find((n) => n.id === card.slotId);
        if (!node) return null;
        return (
          <FlipCardView
            key={`${roundIdx}:${card.slotId}`}
            card={card}
            t={node.transform}
            disabled={busy}
            onClick={() => flipTap(card.slotId)}
          />
        );
      })}
    </>
  );
}
