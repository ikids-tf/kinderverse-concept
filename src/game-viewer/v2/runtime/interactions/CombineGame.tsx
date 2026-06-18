/**
 * CombineGame.tsx — "재료를 모아 만들기". 재료(A+B)를 모두 넣으면 결과(C)가 등장(변신).
 * 판정/시퀀싱은 스토어(combTap). 여긴 위치·렌더·클릭 전달만.
 *  - 재료: idle → 넣으면 locked. 모든 재료 added 시 결과 슬롯이 ?에서 결과로 바뀜.
 */
import { OptionButton } from "./OptionButton";
import { Positioned } from "../NodeRenderer";
import { useGame } from "../useGame";
import type { SceneNode } from "../../schema/interactiveDoc";

const EMPTY: SceneNode[] = [];
const noop = () => {};

export function CombineGame() {
  const doc = useGame((s) => s.doc);
  const combIngredients = useGame((s) => s.combIngredients);
  const combResult = useGame((s) => s.combResult);
  const combRevealed = useGame((s) => s.combRevealed);
  const busy = useGame((s) => s.busy);
  const roundIdx = useGame((s) => s.roundIdx);
  const combTap = useGame((s) => s.combTap);
  const nodes = doc?.stage.nodes ?? EMPTY;
  const at = (id: string) => nodes.find((n) => n.id === id)?.transform;
  const rt = combResult ? at(combResult.slotId) : undefined;

  return (
    <>
      {/* 재료들 */}
      {combIngredients.map((g) => {
        const t = at(g.slotId);
        return t ? (
          <OptionButton
            key={`${roundIdx}:${g.slotId}`}
            content={g.content}
            status={g.added ? "locked" : "idle"}
            t={t}
            disabled={busy || g.added}
            enterName="pop"
            onClick={() => combTap(g.slotId)}
          />
        ) : null;
      })}
      {/* 결과 슬롯 — 모이기 전엔 ?, 모이면 결과 등장 */}
      {combResult && rt &&
        (combRevealed ? (
          <OptionButton
            key={`res:${roundIdx}`}
            content={combResult.content}
            status="locked"
            t={rt}
            disabled
            enterName="pop"
            onClick={noop}
          />
        ) : (
          <Positioned t={rt}>
            <div className="comb-result-empty" aria-hidden>?</div>
          </Positioned>
        ))}
    </>
  );
}
