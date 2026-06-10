import type { BoardNode } from '@/store/boardStore';

/* 노드 기하 헬퍼 — 스케일/회전(node.scale, node.rot)을 반영한 월드 박스를 한 곳에서
   계산한다. 컬링(BoardCanvas)·핏(boardStore)·프레임 멤버십(frames)이 모두 여기서
   import 해, 스케일된 카드도 정확히 화면에 잡히고 프레임이 감싸도록 한다. */

/** 카드의 실제 렌더 높이. node.h는 이미지 캡션·자동높이 카드의 실제 높이를 과소평가
    하므로, NodeView의 사이즈 옵저버가 기록한 data.renderH를 우선 쓴다. */
export function renderHeight(n: BoardNode): number {
  const r = n.data?.renderH;
  return typeof r === 'number' && r > 0 ? r : n.h;
}

/** 균일 스케일(node.scale)을 반영한 축정렬(AABB) 월드 박스. 스케일은 중심 기준이라
    중심점은 불변, 폭/높이만 배율만큼 커진다. 회전은 AABB 근사를 위해 무시한다
    (컬링·멤버십 판정엔 이 근사로 충분). */
export function worldBox(n: BoardNode): { x: number; y: number; w: number; h: number } {
  const s = n.scale ?? 1;
  const h = renderHeight(n);
  if (s === 1) return { x: n.x, y: n.y, w: n.w, h };
  const cx = n.x + n.w / 2;
  const cy = n.y + h / 2;
  const w2 = n.w * s;
  const h2 = h * s;
  return { x: cx - w2 / 2, y: cy - h2 / 2, w: w2, h: h2 };
}
