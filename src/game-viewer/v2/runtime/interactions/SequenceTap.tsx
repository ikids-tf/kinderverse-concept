/**
 * SequenceTap.tsx — "순서대로 콩콩". 스텝을 순서대로 터치해 세기(액터 연출).
 * 판정/시퀀싱·액터 연출은 스토어(seqTap). 여긴 위치·렌더·클릭 전달만.
 *  - 현재 차례 자리만 활성(picked로 강조), 누른 자리는 locked, 나머지는 idle.
 *  - 액터(개구리 등 rive)는 NodeRenderer가 그리고 riveBus로 매 탭 반응(점프).
 */
import { OptionButton } from "./OptionButton";
import { useGame } from "../useGame";
import type { SceneNode } from "../../schema/interactiveDoc";

const EMPTY: SceneNode[] = [];

export function SequenceTap() {
  const doc = useGame((s) => s.doc);
  const seqSteps = useGame((s) => s.seqSteps);
  const seqIdx = useGame((s) => s.seqIdx);
  const busy = useGame((s) => s.busy);
  const roundIdx = useGame((s) => s.roundIdx);
  const seqTap = useGame((s) => s.seqTap);
  const nodes = doc?.stage.nodes ?? EMPTY;

  return (
    <>
      {seqSteps.map((step, i) => {
        const node = nodes.find((n) => n.id === step.slotId);
        if (!node) return null;
        const status = step.done ? "locked" : i === seqIdx ? "picked" : "idle";
        return (
          <OptionButton
            key={`${roundIdx}:${step.slotId}`}
            content={step.content}
            status={status}
            t={node.transform}
            disabled={busy || step.done || i !== seqIdx}
            enterName="pop"
            onClick={() => seqTap(step.slotId)}
          />
        );
      })}
    </>
  );
}
