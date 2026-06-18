/**
 * Categorize.tsx — "알맞은 곳에 담기". 아이템을 골라(picked) 알맞은 버킷을 탭한다.
 * 판정/시퀀싱은 스토어(catTap). 여긴 위치·렌더·클릭 전달만.
 *  - 버킷: 라벨 고정, 판정 시 잠깐 correct/wrong 플래시.
 *  - 아이템: idle/picked(고름)/locked(담음)/wrong(틀림 흔들).
 */
import { OptionButton } from "./OptionButton";
import { useGame } from "../useGame";
import type { SceneNode } from "../../schema/interactiveDoc";

const EMPTY: SceneNode[] = [];

export function Categorize() {
  const doc = useGame((s) => s.doc);
  const catItems = useGame((s) => s.catItems);
  const catBuckets = useGame((s) => s.catBuckets);
  const busy = useGame((s) => s.busy);
  const roundIdx = useGame((s) => s.roundIdx);
  const catTap = useGame((s) => s.catTap);
  const nodes = doc?.stage.nodes ?? EMPTY;
  const at = (id: string) => nodes.find((n) => n.id === id)?.transform;

  return (
    <>
      {/* 버킷(담는 곳) */}
      {catBuckets.map((b) => {
        const t = at(b.slotId);
        return t ? (
          <OptionButton
            key={`b:${b.slotId}`}
            content={b.content}
            status={b.status}
            t={t}
            disabled={busy}
            enterName="drop"
            onClick={() => catTap(b.slotId)}
          />
        ) : null;
      })}
      {/* 분류할 아이템 */}
      {catItems.map((i) => {
        const t = at(i.slotId);
        return t ? (
          <OptionButton
            key={`${roundIdx}:${i.slotId}`}
            content={i.content}
            status={i.status}
            t={t}
            disabled={busy || i.status === "locked"}
            enterName="pop"
            onClick={() => catTap(i.slotId)}
          />
        ) : null;
      })}
    </>
  );
}
