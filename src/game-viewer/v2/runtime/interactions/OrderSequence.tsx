/**
 * OrderSequence.tsx — "순서대로 놓기". 셔플된 카드를 정답 순서로 탭.
 * 판정(orderIdx === orderNext)·시퀀싱은 스토어(orderTap). 여긴 위치·렌더·클릭 전달만.
 * 상태(idle/locked/wrong)는 OptionButton이 그대로 표현(locked=초록, wrong=빨강+shake).
 */
import { OptionButton } from "./OptionButton";
import { useGame } from "../useGame";
import type { SceneNode } from "../../schema/interactiveDoc";

const EMPTY: SceneNode[] = [];

export function OrderSequence() {
  const doc = useGame((s) => s.doc);
  const orderSlots = useGame((s) => s.orderSlots);
  const busy = useGame((s) => s.busy);
  const roundIdx = useGame((s) => s.roundIdx);
  const orderTap = useGame((s) => s.orderTap);
  const nodes = doc?.stage.nodes ?? EMPTY;

  return (
    <>
      {orderSlots.map((slot) => {
        const node = nodes.find((n) => n.id === slot.slotId);
        if (!node) return null;
        return (
          <OptionButton
            key={`${roundIdx}:${slot.slotId}`}
            content={slot.content}
            status={slot.status}
            t={node.transform}
            disabled={busy || slot.status === "locked"}
            enterName="pop"
            onClick={() => orderTap(slot.slotId)}
          />
        );
      })}
    </>
  );
}
