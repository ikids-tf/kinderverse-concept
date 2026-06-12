import { useBoardStore, type BoardNode } from '@/store/boardStore';
import { renderHeight } from '@/board/geometry';

/* 모션(이동 애니메이션) 경로 기하 — 3차 베지어 점 접근·평가, 노드 박스 재계산.
   MotionPathNode(렌더·재생)와 BoardCanvas(연결 카드 드래그 후 출발점 동기화)가
   공유한다. 컴포넌트 파일에서 분리해 둔 순수 함수 모듈(HMR 단위 분리). */

export interface P {
  x: number;
  y: number;
}

/** 점 헐(bbox) 패딩 — 노드 박스가 점들을 여유 있게 감싼다. */
export const PAD = 30;

export function getP(n: BoardNode, k: 'p1' | 'p2' | 'c1' | 'c2'): P {
  const v = n.data?.[k] as P | undefined;
  if (v && typeof v.x === 'number' && typeof v.y === 'number') return v;
  // 폴백 — 좌하 → 우상 대각선
  if (k === 'p1') return { x: PAD, y: n.h - PAD };
  if (k === 'p2') return { x: n.w - PAD, y: PAD };
  const p1 = getP(n, 'p1');
  const p2 = getP(n, 'p2');
  // 구버전 데이터(단일 제어점 c) — 같은 곡선이 되도록 2차→3차 승격:
  // C1 = P1 + ⅔(C−P1), C2 = P2 + ⅔(C−P2).
  const c = n.data?.c as P | undefined;
  if (c && typeof c.x === 'number' && typeof c.y === 'number') {
    return k === 'c1'
      ? { x: p1.x + (2 / 3) * (c.x - p1.x), y: p1.y + (2 / 3) * (c.y - p1.y) }
      : { x: p2.x + (2 / 3) * (c.x - p2.x), y: p2.y + (2 / 3) * (c.y - p2.y) };
  }
  // 기본 — 직선 ⅓·⅔ 지점에서 살짝 위로 휜 곡선
  const t = k === 'c1' ? 1 / 3 : 2 / 3;
  return { x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t - 40 };
}

/** 3차 베지어 한 좌표축 평가 — B(t) = u³P1 + 3u²tC1 + 3ut²C2 + t³P2. */
export function bz(t: number, a: number, b: number, c: number, d: number): number {
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
}

/** 노드의 시각 중심(스케일은 중심 기준이라 x+w/2가 그대로 중심). */
export function centerOf(n: BoardNode): P {
  return { x: n.x + n.w / 2, y: n.y + renderHeight(n) / 2 };
}

/** 점 드래그/연결 카드 이동 후 — 점들의 헐(bbox)로 모션 노드 박스를 다시 감싼다. */
export function normalizeMotionNode(id: string): void {
  const st = useBoardStore.getState();
  const cur = st.nodes[id];
  if (!cur || cur.type !== 'motion') return;
  const e2 = cur.data?.aEnd ? st.nodes[cur.data.aEnd as string] : undefined;
  const pts = [
    getP(cur, 'p1'),
    getP(cur, 'c1'),
    getP(cur, 'c2'),
    e2 ? { x: centerOf(e2).x - cur.x, y: centerOf(e2).y - cur.y } : getP(cur, 'p2'),
  ];
  const minX = Math.min(...pts.map((p) => p.x)) - PAD;
  const minY = Math.min(...pts.map((p) => p.y)) - PAD;
  const maxX = Math.max(...pts.map((p) => p.x)) + PAD;
  const maxY = Math.max(...pts.map((p) => p.y)) + PAD;
  const shift = (p: P): P => ({ x: p.x - minX, y: p.y - minY });
  const data: Record<string, unknown> = {
    ...cur.data,
    p1: shift(getP(cur, 'p1')),
    p2: shift(getP(cur, 'p2')),
    c1: shift(getP(cur, 'c1')),
    c2: shift(getP(cur, 'c2')),
  };
  delete data.c; // 구버전 단일 제어점 — c1/c2로 굳혔으니 제거
  st.updateNodeRaw(id, {
    x: Math.round(cur.x + minX),
    y: Math.round(cur.y + minY),
    w: Math.round(maxX - minX),
    h: Math.round(maxY - minY),
    data,
  });
}
