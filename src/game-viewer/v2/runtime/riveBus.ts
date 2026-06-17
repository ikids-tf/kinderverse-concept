/**
 * riveBus.ts — 게임 판정 → Rive 액터 입력을 잇는 작은 이벤트 채널.
 * ------------------------------------------------------------------
 * 인터랙션(tap)이 정답/오답을 내면 responsive-state 효과의 actorNodeId로 신호를 보내고,
 * RiveActor가 그 신호를 받아 Rive 상태머신 input을 발사한다(선택 → 캐릭터 변형, PRD §9).
 * 스토어는 DOM/Rive를 직접 모르고 신호만 흘려보낸다(부수효과 격리 — sfx 버스와 동형).
 */
export type ActorOutcome = "correct" | "wrong" | "reset";
export interface ActorEvent {
  actorNodeId: string;
  outcome: ActorOutcome;
}
type Listener = (e: ActorEvent) => void;

const listeners = new Set<Listener>();

export function emitActor(e: ActorEvent): void {
  listeners.forEach((l) => l(e));
}
export function onActor(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
