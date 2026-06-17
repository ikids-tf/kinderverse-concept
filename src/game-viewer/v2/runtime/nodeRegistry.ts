/**
 * nodeRegistry.ts — 노드 id → DOM 엘리먼트 (보상 confetti 원점 계산용).
 * 컴포넌트가 마운트/언마운트 시 등록/해제한다. 단일 플레이어 인스턴스 가정(모듈 전역 OK).
 */
const els = new Map<string, HTMLElement>();

export function registerNode(id: string, el: HTMLElement | null): void {
  if (el) els.set(id, el);
  else els.delete(id);
}

export function nodeRect(id: string): DOMRect | null {
  const el = els.get(id);
  return el ? el.getBoundingClientRect() : null;
}
