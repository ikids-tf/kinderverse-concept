/**
 * TapTheRightOne.tsx — "누구일까 맞추기". 셔플된 보기를 옵션 슬롯 위치에 버튼으로 렌더.
 * 판정/시퀀싱은 스토어(tap)에 있고, 여기선 위치·렌더·클릭 전달만 한다.
 */
import { OptionButton } from "./OptionButton";
import { useGame } from "../useGame";
import type { SceneNode } from "../../schema/interactiveDoc";

const EMPTY: SceneNode[] = [];
const EMPTY_IDS: string[] = [];

export function TapTheRightOne() {
  const doc = useGame((s) => s.doc);
  const tapOptions = useGame((s) => s.tapOptions);
  const busy = useGame((s) => s.busy);
  const roundIdx = useGame((s) => s.roundIdx);
  const tap = useGame((s) => s.tap);
  const nodes = doc?.stage.nodes ?? EMPTY;
  // 편집 대상 슬롯 = 셔플 전 '정본' 슬롯(optionSlotIds[optionIdx]). 그래야 더블클릭한 보기의 내용을
  // (셔플된 자리가 아니라) 그 보기 자체로 편집한다. tap(채점)은 셔플된 표시 슬롯(opt.slotId)을 쓴다.
  const optionSlotIds = doc?.interaction.kind === "tap-the-right-one" ? doc.interaction.optionSlotIds : EMPTY_IDS;

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
            nodeId={optionSlotIds[opt.optionIdx] ?? opt.slotId}
          />
        );
      })}
    </>
  );
}
