/**
 * 캔버스 경계 클램프 — 드래그/리사이즈/방향키/붙여넣기가 요소를 화면 밖으로 완전히
 * 밀어내지 못하게 막는다(스케일 폭주 시 좌표가 수천 px로 튀어 요소가 영영 사라지던 버그 방지).
 * 요소는 항상 최소 VISIBLE_MARGIN 만큼 캔버스 안에 남는다 → 언제든 다시 잡아 옮길 수 있다.
 */
import type { ElementNode, InteractiveNode } from '../schema/interactiveNode';

/** 캔버스 안에 반드시 남겨둘 최소 노출(px). */
export const VISIBLE_MARGIN = 40;

/** (x,y)를 캔버스(cw×ch) 안에 최소 VISIBLE_MARGIN 보이도록 클램프(정수 반환). */
export function clampXY(
  x: number,
  y: number,
  w: number,
  h: number,
  cw: number,
  ch: number,
): { x: number; y: number } {
  return {
    x: Math.round(Math.min(cw - VISIBLE_MARGIN, Math.max(VISIBLE_MARGIN - w, x))),
    y: Math.round(Math.min(ch - VISIBLE_MARGIN, Math.max(VISIBLE_MARGIN - h, y))),
  };
}

/** 화면 밖으로 튕겨나간 요소들을 캔버스 안으로 회수(로드 시 1회 정규화). 변경 없으면 동일 참조. */
export function normalizeNode(d: InteractiveNode): InteractiveNode {
  const cw = d.canvas.size.w;
  const ch = d.canvas.size.h;
  let changed = false;
  const elements = d.elements.map((e) => {
    const t = e.transform;
    const { x, y } = clampXY(t.x, t.y, t.w, t.h, cw, ch);
    if (x === t.x && y === t.y) return e;
    changed = true;
    return { ...e, transform: { ...t, x, y } } as ElementNode;
  });
  return changed ? { ...d, elements } : d;
}
