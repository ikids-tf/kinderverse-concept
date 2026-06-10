import { useBoardStore } from '@/store/boardStore';

/* 이미지 LOD (성능작업 2-2 · 결정 A). 이미지 카드의 원본(data URI, node.src)은
   보존하고 — 확대/편집/내보내기/저장은 계속 원본 사용 — 보드 "표시용"만
   클라이언트 <canvas>로 만든 ~400px 썸네일(node.data.thumb)로 그린다.
   줌이 IMG_PLACEHOLDER_ZOOM 미만이면 NodeView가 이미지를 단색 플레이스홀더 +
   제목으로 강등한다(디코드 0). 스키마 변경 없음(data 가방에 thumb 한 칸). */

/** 보드 표시용 썸네일의 최대 가로 px. */
export const THUMB_MAX_W = 400;
/** 이 줌 미만에서는 이미지 카드를 플레이스홀더로 강등. */
export const IMG_PLACEHOLDER_ZOOM = 0.3;

/** 썸네일 인코딩(표시 전용이라 JPEG 0.8 — 투명 영역은 흰 배경으로 합성). */
const THUMB_QUALITY = 0.8;
/** 동시에 디코드/축소할 이미지 수 — 시드 직후 수백 장 burst로 인한 jank 방지. */
const MAX_CONCURRENT = 4;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** 원본 data URI → ≤maxW 썸네일 data URI. 원본이 이미 작으면 null(원본 그대로 표시). */
export async function makeThumb(src: string, maxW = THUMB_MAX_W): Promise<string | null> {
  const img = await loadImage(src);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h || w <= maxW) return null; // 축소 불필요 — 원본 사용
  const scale = maxW / w;
  const cv = document.createElement('canvas');
  cv.width = maxW;
  cv.height = Math.max(1, Math.round(h * scale));
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#fff'; // JPEG는 알파가 없으므로 투명부를 흰색으로
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.drawImage(img, 0, 0, cv.width, cv.height);
  return cv.toDataURL('image/jpeg', THUMB_QUALITY);
}

/* 진행 중/완료(생성 불필요 포함) 추적 — 같은 노드에 중복 작업 방지. 결과는
   node.data.thumb에 기록된다: 문자열=썸네일, ''=원본이 이미 작거나 실패(원본 표시). */
const inflight = new Set<string>();
let running = 0;
const queue: string[] = [];

async function run(nodeId: string): Promise<void> {
  running++;
  try {
    const cur = useBoardStore.getState().nodes[nodeId];
    if (!cur || cur.type !== 'image' || !cur.src || cur.data?.thumb !== undefined) return;
    let thumb: string | null = null;
    try {
      thumb = await makeThumb(cur.src);
    } catch {
      thumb = null; // 디코드 실패 → 원본 표시로 폴백
    }
    const fresh = useBoardStore.getState().nodes[nodeId];
    if (!fresh) return; // 삭제됨
    useBoardStore.getState().updateNodeRaw(nodeId, { data: { ...(fresh.data ?? {}), thumb: thumb ?? '' } });
  } finally {
    running--;
    inflight.delete(nodeId);
    const next = queue.shift();
    if (next) void run(next);
  }
}

/** 이미지 카드에 표시용 썸네일이 없으면 백그라운드로 생성(동시 4개 제한 큐).
    NodeView가 마운트/“src 변경” 시 호출 — 컬링 덕에 화면에 보인 카드만 처리된다. */
export function ensureThumb(nodeId: string): void {
  const n = useBoardStore.getState().nodes[nodeId];
  if (!n || n.type !== 'image' || !n.src || n.loading) return;
  if (n.data?.thumb !== undefined) return; // 이미 처리됨('' 포함)
  if (inflight.has(nodeId)) return;
  inflight.add(nodeId);
  if (running < MAX_CONCURRENT) void run(nodeId);
  else queue.push(nodeId);
}
