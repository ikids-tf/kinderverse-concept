/**
 * RiveActor.tsx — 반응하는 캐릭터 (PRD §9, 우리만의 무기).
 * ------------------------------------------------------------------
 * rive 노드를 Rive 상태머신으로 렌더하고, responsive-state 효과에 따라 선택→input을 발사해
 * 캐릭터를 실제로 변형시킨다(슬픔→위로→행복). 애니 전이는 디자이너가 .riv에 미리 작성.
 * 🔴 .riv 캐릭터 에셋이 아직 없으면(에셋 대기) graceful 플레이스홀더 — 게임은 정상 동작.
 *    에셋이 public/ 에 추가되면 그대로 동작(노드 src 경로). riveBus로 판정 신호를 받는다.
 */
import { useEffect } from "react";
import { useRive, Layout, Fit } from "@rive-app/react-canvas";
import type { SceneNode } from "../schema/interactiveDoc";
import { useGame } from "./useGame";
import { onActor } from "./riveBus";

type RiveSceneNode = Extract<SceneNode, { type: "rive" }>;

export function RiveActor({ node }: { node: RiveSceneNode }) {
  // 이 액터를 참조하는 responsive-state 효과(입력 매핑)를 찾는다.
  const effect = useGame((s) =>
    s.doc?.effects.find((e) => e.kind === "responsive-state" && e.actorNodeId === node.id),
  );

  // 실제 로드 가능한 .riv(절대경로/URL)일 때만 Rive를 띄운다. 바 파일명("friend.riv")은
  // 아직 에셋이 없는 플레이스홀더 상태 → 로드 시도 안 함(콘솔 에러 0). 에셋이 public/이나
  // Storage URL로 들어오면 그대로 로드된다.
  const loadable = /^(https?:|\/)/.test(node.src) && node.src.toLowerCase().endsWith(".riv");
  const { rive, RiveComponent } = useRive(
    loadable
      ? { src: node.src, stateMachines: node.stateMachine, autoplay: true, layout: new Layout({ fit: Fit.Contain }) }
      : null,
  );

  useEffect(() => {
    if (!rive || !effect || effect.kind !== "responsive-state") return;
    const eff = effect;
    return onActor((ev) => {
      if (ev.actorNodeId !== node.id) return;
      try {
        if (ev.outcome === "reset") {
          rive.reset();
          if (eff.stateMachine) rive.play(eff.stateMachine);
          return;
        }
        const map = eff.inputs[ev.outcome];
        if (!map) return;
        const input = rive.stateMachineInputs(eff.stateMachine)?.find((i) => i.name === map.name);
        if (!input) return;
        if (map.value === "trigger") input.fire();
        else if (typeof map.value === "boolean" || typeof map.value === "number") input.value = map.value;
      } catch {
        /* .riv 미준비 등 — 무시(게임은 정상) */
      }
    });
  }, [rive, effect, node.id]);

  return (
    <div className="kv-rive-actor">
      <RiveComponent className="kv-rive-canvas" />
      {!rive && <span className="kv-rive-placeholder" aria-hidden>🧸</span>}
    </div>
  );
}
