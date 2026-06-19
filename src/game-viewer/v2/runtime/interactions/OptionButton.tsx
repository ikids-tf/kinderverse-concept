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
import { useCanInlineEdit } from "../editContext";
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
  /** 보기 슬롯 노드 id — 주어지면 교사 미리보기에서 더블클릭으로 내용을 바로 편집(없으면 편집 불가). */
  nodeId?: string;
}) {
  const { content, status, t, style, disabled, enterName, onClick, nodeId } = props;
  const reduced = !!useReducedMotion();
  const controls = useAnimationControls();
  const mood = useGame((s) => (s.doc?.settings.mood ?? "lively") as MoodKey);
  const roundIdx = useGame((s) => s.roundIdx);
  const canEdit = useCanInlineEdit() && !!nodeId;
  const editInline = useGame((s) => s.editNodeInline);
  const prev = useRef<OptStatus>(status);
  // 교사 미리보기에서만: 단일 탭(정답 확인)을 잠깐 미뤄 더블클릭(편집)과 구분한다.
  // 아이 플레이(집중/전체화면)에선 canEdit=false라 지연 없이 즉시 반응한다.
  const tapTimer = useRef<number | null>(null);
  useEffect(() => () => { if (tapTimer.current) window.clearTimeout(tapTimer.current); }, []);
  const handleClick = () => {
    if (!canEdit) { onClick(); return; }
    if (tapTimer.current) window.clearTimeout(tapTimer.current);
    tapTimer.current = window.setTimeout(() => { tapTimer.current = null; onClick(); }, 240);
  };
  const handleDouble = () => {
    if (!canEdit || !nodeId) return;
    if (tapTimer.current) { window.clearTimeout(tapTimer.current); tapTimer.current = null; }
    editInline(nodeId);
  };

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
          className={`opt ${STATUS_CLASS[status]}${canEdit ? " kv-editable" : ""}`}
          style={radiusStyle(style)}
          animate={controls}
          disabled={disabled}
          onClick={handleClick}
          onDoubleClick={canEdit ? handleDouble : undefined}
          title={canEdit ? "더블클릭하면 보기 내용을 고쳐요" : undefined}
        >
          <VisualBox visual={resolveVisual(content)} t={t} style={style} round={roundIdx} />
        </motion.button>
      </motion.div>
    </Positioned>
  );
}
