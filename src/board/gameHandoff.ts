/**
 * gameHandoff.ts — 갓 깐 게임 뷰어 카드로 넘길 생성 요청(prompt+시드) 임시 보관소.
 * ------------------------------------------------------------------
 * 보드에서 이미지를 골라 "이 이미지로 게임 만들어줘"라고 하면 게임 뷰어 카드를 새로 깐다.
 * 이때 prompt+seedImages를 window 이벤트로 곧장 쏘면, 그 카드의 NodeView 리스너가 아직 안
 * 붙어 유실될 수 있다. 그래서 nodeId로 큐에 담아 두고, NodeView가 iframe 준비(kv-game-ready)
 * 시 한 번 소비한다(타이밍 무의존, 중복 생성 0).
 */
export interface GameHandoff {
  prompt: string;
  seedImages?: string[];
}

const pending = new Map<string, GameHandoff>();

/** 게임 생성 요청을 카드(nodeId)에 큐잉 — NodeView가 ready 시 consume. */
export function queueGameCreate(nodeId: string, handoff: GameHandoff): void {
  pending.set(nodeId, handoff);
}

/** 카드의 큐된 생성 요청을 꺼내며 제거(1회성). 없으면 null. */
export function consumeGameCreate(nodeId: string): GameHandoff | null {
  const h = pending.get(nodeId);
  if (h) pending.delete(nodeId);
  return h ?? null;
}
