import { useBoardStore, newId } from '@/store/boardStore';
import { useTrayStore, type TrayItem } from '@/store/trayStore';

/** '3 / 4' → 0.75 (w/h). 파싱 실패 시 1. */
function ratioNum(s: string): number {
  const [a, b] = s.split('/').map((x) => parseFloat(x.trim()));
  return a && b ? a / b : 1;
}

/** 보드 캔버스 DOM(rect) — data-kv-canvas 속성으로 찾는다(없으면 null). */
function canvasRect(): DOMRect | null {
  if (typeof document === 'undefined') return null;
  const el = document.querySelector('[data-kv-canvas]');
  return el ? el.getBoundingClientRect() : null;
}

/** 화면(client) 좌표 → 보드 월드 좌표(캔버스 rect + 뷰포트 pan/zoom 기준). */
function clientToWorld(cx: number, cy: number): { x: number; y: number } {
  const rect = canvasRect();
  const { zoom, panX, panY } = useBoardStore.getState().viewport;
  return { x: (cx - (rect?.left ?? 0) - panX) / zoom, y: (cy - (rect?.top ?? 0) - panY) / zoom };
}

const NODE_W = 240;

/** 트레이 자료를 월드 좌표 (wx,wy)를 '중심'으로 이미지 노드 배치 + 트레이에서 제거. */
export function placeTrayItem(item: TrayItem, wx: number, wy: number): string {
  const h = Math.round(NODE_W / ratioNum(item.ratio));
  const id = newId('img');
  useBoardStore.getState().addNodeRaw({
    id,
    type: 'image',
    x: Math.round(wx - NODE_W / 2),
    y: Math.round(wy - h / 2),
    w: NODE_W,
    h,
    src: item.src,
    text: item.title,
    data: {},
  });
  useTrayStore.getState().remove(item.id);
  return id;
}

/** 트레이 자료를 보드 화면 '중앙'에 배치(클릭 배치). */
export function placeTrayItemAtCenter(item: TrayItem): string {
  const rect = canvasRect();
  const cx = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
  const cy = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
  const w = clientToWorld(cx, cy);
  return placeTrayItem(item, w.x, w.y);
}
