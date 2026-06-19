/**
 * TapTheRightOne.tsx — "누구일까 맞추기". 셔플된 보기를 옵션 슬롯 위치에 버튼으로 렌더.
 * 판정/시퀀싱은 스토어(tap)에 있고, 여기선 위치·렌더·클릭 전달만 한다.
 */
import { OptionButton } from "./OptionButton";
import { useGame } from "../useGame";
import type { SceneNode } from "../../schema/interactiveDoc";

const EMPTY: SceneNode[] = [];

export function TapTheRightOne() {
  const doc = useGame((s) => s.doc);
  const tapOptions = useGame((s) => s.tapOptions);
  const busy = useGame((s) => s.busy);
  const roundIdx = useGame((s) => s.roundIdx);
  const tap = useGame((s) => s.tap);
  const nodes = doc?.stage.nodes ?? EMPTY;

  return (
    <>
      {tapOptions.map((opt) => {
        const node = nodes.find((n) => n.id === opt.slotId);
        if (!node) return null;
        return (
          <OptionButton
            key={`${roundIdx}:${opt.slotId}`}
            content={opt.content}
            status={opt.status}
            t={node.transform}
            style={node.style}
            disabled={busy || opt.status === "locked"}
            enterName="drop"
            onClick={() => tap(opt.slotId)}
          />
        );
      })}
    </>
  );
}
