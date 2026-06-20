import { InteractiveNode } from './interactiveNode';

/** 엄격 파싱 — 실패 시 throw(ZodError). 저장 직전·신뢰 경계에서 사용. */
export function parseInteractiveNode(input: unknown): InteractiveNode {
  return InteractiveNode.parse(input);
}

/** 안전 파싱 — { success, data | error }. 복원(localStorage 등) 시 사용. */
export function safeParseInteractiveNode(input: unknown) {
  return InteractiveNode.safeParse(input);
}
