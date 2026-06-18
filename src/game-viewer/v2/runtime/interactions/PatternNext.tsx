/**
 * PatternNext.tsx — "다음에 올 친구는?". 수열 일부를 정적으로 제시하고, 다음 항을 보기에서 고른다.
 * 판정/시퀀싱은 tap-the-right-one의 tap 액션을 그대로 재사용(보기=tapOptions). 여긴 위치·렌더만.
 *  - patternSeq: 순서대로 보여주는 수열(정적·비활성).
 *  - tapOptions: 셔플된 보기(클릭 → tap). 정답=초록, 오답=빨강+shake.
 */
import { OptionButton } from "./OptionButton";
import { useGame } from "../useGame";
import type { SceneNode } from "../../schema/interactiveDoc";

const EMPTY: SceneNode[] = [];
const noop = () => {};

export function PatternNext() {
  const doc = useGame((s) => s.doc);
  const patternSeq = useGame((s) => s.patternSeq);
  const tapOptions = useGame((s) => s.tapOptions);
  const busy = useGame((s) => s.busy);
  const roundIdx = useGame((s) => s.roundIdx);
  const tap = useGame((s) => s.tap);
  const nodes = doc?.stage.nodes ?? EMPTY;
  const at = (id: string) => nodes.find((n) => n.id === id)?.transform;

  return (
    <>
      {/* 제시 수열 — 정적·비활성(보여주기만) */}
      {patternSeq.map((item) => {
        const t = at(item.slotId);
        return t ? (
          <OptionButton
            key={`seq:${roundIdx}:${item.slotId}`}
            content={item.content}
            status="idle"
            t={t}
            disabled
            enterName="pop"
            onClick={noop}
          />
        ) : null;
      })}
      {/* 보기 — 클릭으로 tap(=tap-the-right-one 판정) */}
      {tapOptions.map((opt) => {
        const t = at(opt.slotId);
        return t ? (
          <OptionButton
            key={`${roundIdx}:${opt.slotId}`}
            content={opt.content}
            status={opt.status}
            t={t}
            disabled={busy || opt.status === "locked"}
            enterName="drop"
            onClick={() => tap(opt.slotId)}
          />
        ) : null;
      })}
    </>
  );
}
