/**
 * RevealEffect.tsx — 가린 오브젝트를 정답 시 공개(텃밭 뽑기의 핵심).
 * hidden(작물)을 cover(흙) '뒤'에 렌더 → 정답 시 Motion 스프링으로 위로 쑥(overshoot 자연 발생).
 * dust(흙먼지)는 스토어가 sfx로 흘려보내고 useGameEffects가 confetti로 처리.
 */
import { motion, useReducedMotion } from "motion/react";
import { Positioned, VisualBox } from "../NodeRenderer";
import { resolveVisual } from "../content";
import { useStageSize } from "../stageSize";
import { useGame } from "../useGame";
import { theme } from "../../theme";

export function RevealEffect() {
  const reveal = useGame((s) => s.reveal);
  const doc = useGame((s) => s.doc);
  const { h: stageH } = useStageSize();
  const reduced = !!useReducedMotion();

  if (!reveal || !doc) return null;
  const hiddenNode = doc.stage.nodes.find((n) => n.id === reveal.hiddenId);
  const coverNode = doc.stage.nodes.find((n) => n.id === reveal.coverId);
  const dist = stageH * 0.5;
  const pulled = reveal.active;

  // pull-up(y) 기본. fade는 opacity, slide는 동일 y 처리(M0는 pull-up만 사용).
  const animate = reveal.motion === "fade" ? { opacity: pulled ? 1 : 0 } : { y: pulled ? -dist : 0 };
  const transition = !pulled || reduced ? { duration: 0 } : theme.motion.spring.soft;

  return (
    <>
      {hiddenNode && (
        <Positioned t={hiddenNode.transform} registerId={hiddenNode.id}>
          <motion.div className="node-inner" animate={animate} transition={transition}>
            <div className="photo">
              <VisualBox visual={resolveVisual(reveal.hiddenContent)} t={hiddenNode.transform} />
            </div>
          </motion.div>
        </Positioned>
      )}
      {coverNode && (
        <Positioned t={coverNode.transform} registerId={coverNode.id}>
          <div className="node-inner">
            <div className="soil" />
          </div>
        </Positioned>
      )}
    </>
  );
}
