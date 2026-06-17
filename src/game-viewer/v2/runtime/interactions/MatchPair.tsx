/**
 * MatchPair.tsx — "관련 있는 친구 짝짓기". 왼쪽은 순서대로, 오른쪽은 셔플.
 * 판정(pairIdx 일치)·시퀀싱은 스토어(matchTap). 여긴 위치·렌더·클릭 전달만.
 */
import { OptionButton } from "./OptionButton";
import { useGame, type MatchItem, type Side } from "../useGame";
import type { SceneNode } from "../../schema/interactiveDoc";

const EMPTY: SceneNode[] = [];

export function MatchPair() {
  const doc = useGame((s) => s.doc);
  const matchLeft = useGame((s) => s.matchLeft);
  const matchRight = useGame((s) => s.matchRight);
  const busy = useGame((s) => s.busy);
  const roundIdx = useGame((s) => s.roundIdx);
  const matchTap = useGame((s) => s.matchTap);
  const nodes = doc?.stage.nodes ?? EMPTY;

  const renderSide = (items: MatchItem[], side: Side) =>
    items.map((m) => {
      const node = nodes.find((n) => n.id === m.slotId);
      if (!node) return null;
      return (
        <OptionButton
          key={`${roundIdx}:${m.slotId}`}
          content={m.content}
          status={m.status}
          t={node.transform}
          disabled={busy || m.status === "locked"}
          enterName="pop"
          onClick={() => matchTap(side, m.slotId)}
        />
      );
    });

  return (
    <>
      {renderSide(matchLeft, "L")}
      {renderSide(matchRight, "R")}
    </>
  );
}
