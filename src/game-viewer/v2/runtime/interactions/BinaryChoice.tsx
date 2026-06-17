/**
 * BinaryChoice.tsx — OX 퀴즈. prompt는 cue 슬롯으로 렌더(GameStage), 여기선 고정 O/X 버튼.
 * 슬롯 정의가 없는 2지선다라 버튼 위치는 런타임이 고정으로 배치한다(콘텐츠 무관·직교).
 */
import { OptionButton } from "./OptionButton";
import { useGame } from "../useGame";
import type { SceneNode } from "../../schema/interactiveDoc";

type Transform = SceneNode["transform"];

const fixed = (x: number): Transform => ({
  x, y: 0.83, w: 0.3, h: 0.2, rotation: 0, z: 0, opacity: 1, locked: false,
});

export function BinaryChoice() {
  const status = useGame((s) => s.binaryStatus);
  const busy = useGame((s) => s.busy);
  const roundIdx = useGame((s) => s.roundIdx);
  const answerBinary = useGame((s) => s.answerBinary);

  return (
    <>
      <OptionButton
        key={`${roundIdx}:yes`}
        content={{ type: "emoji", emoji: "⭕" }}
        status={status.yes}
        t={fixed(0.32)}
        disabled={busy}
        enterName="pop"
        onClick={() => answerBinary(true)}
      />
      <OptionButton
        key={`${roundIdx}:no`}
        content={{ type: "emoji", emoji: "❌" }}
        status={status.no}
        t={fixed(0.68)}
        disabled={busy}
        enterName="pop"
        onClick={() => answerBinary(false)}
      />
    </>
  );
}
