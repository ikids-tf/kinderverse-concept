/* 레이어 분리 — 생성된 활동지 그림을 분석(게이트웨이 detect)해 요소별 경계상자를
   받고, 각 요소를 클라이언트에서 잘라내(canvas) 이동·스케일 가능한 레이어로 만든다.
   서버는 경계상자만 돌려주고(키 없으면 mock), 실제 크롭은 브라우저에서 수행한다. */

import { callGateway } from './client';
import type { WorksheetLayer } from '@/ui-registry/contracts';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Gemini 마스크(흰색=요소)를 잘라낸 영역의 알파 채널로 적용 → 모양대로 오림.
   마스크 밝기를 그대로 알파로 써서 가장자리도 부드럽게 처리. */
function applyMaskAlpha(ctx: CanvasRenderingContext2D, w: number, h: number, mask: HTMLImageElement) {
  const mc = document.createElement('canvas');
  mc.width = w;
  mc.height = h;
  const mctx = mc.getContext('2d');
  if (!mctx) return;
  mctx.drawImage(mask, 0, 0, w, h); // 마스크를 상자 크기로 리사이즈
  const md = mctx.getImageData(0, 0, w, h).data;
  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data;
  for (let p = 0; p < w * h; p++) {
    // 마스크는 흑백 → R 채널을 알파로(검정=배경=투명, 흰색=요소=불투명).
    d[p * 4 + 3] = Math.min(d[p * 4 + 3], md[p * 4]);
  }
  ctx.putImageData(id, 0, 0);
}

/** 폴백 — 가장자리부터 흰색(근접)을 플러드필로 지워 투명 처리(흰 배경 활동지용).
   요소 안쪽의 흰색(윤곽선에 둘러싸인)은 유지된다. */
function removeWhiteBackground(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data;
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  const T = 232; // 흰색 임계값
  const isWhite = (i: number) => d[i] >= T && d[i + 1] >= T && d[i + 2] >= T;
  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const p = y * w + x;
    if (seen[p]) return;
    seen[p] = 1;
    if (isWhite(p * 4)) {
      d[p * 4 + 3] = 0; // 투명
      stack.push(x, y);
    }
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  while (stack.length) {
    const y = stack.pop()!;
    const x = stack.pop()!;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
  ctx.putImageData(id, 0, 0);
}

/** [ymin,xmin,ymax,xmax] (0–1000) 영역을 원본에서 잘라 모양대로 오린 투명 PNG +
   시트대비 % 위치로. mask가 있으면 마스크 알파, 없으면 흰배경 제거로 오린다. */
async function cropRegion(
  img: HTMLImageElement,
  region: { box: [number, number, number, number]; label: string; mask?: string },
  i: number,
): Promise<WorksheetLayer | null> {
  const [ymin, xmin, ymax, xmax] = region.box;
  const sx = (xmin / 1000) * img.naturalWidth;
  const sy = (ymin / 1000) * img.naturalHeight;
  const sw = ((xmax - xmin) / 1000) * img.naturalWidth;
  const sh = ((ymax - ymin) / 1000) * img.naturalHeight;
  if (sw < 4 || sh < 4) return null;
  const w = Math.round(sw);
  const h = Math.round(sh);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);

  // 모양대로 오리기 — 마스크 우선, 실패 시 흰배경 제거.
  let masked = false;
  if (region.mask) {
    try {
      const m = await loadImage(region.mask);
      applyMaskAlpha(ctx, w, h, m);
      masked = true;
    } catch {
      masked = false;
    }
  }
  if (!masked) {
    try {
      removeWhiteBackground(ctx, w, h);
    } catch {
      /* getImageData 실패(tainted) 시 사각형 그대로 둠 */
    }
  }

  let src: string;
  try {
    src = canvas.toDataURL('image/png');
  } catch {
    return null; // tainted canvas (cross-origin) — skip
  }
  return {
    id: `layer-${Date.now().toString(36)}-${i}`,
    label: region.label,
    src,
    x: xmin / 10,
    y: ymin / 10,
    w: (xmax - xmin) / 10,
    h: (ymax - ymin) / 10,
    scale: 1,
  };
}

/** 활동지 그림을 요소 레이어들로 분리한다. 실패/빈 결과는 빈 배열. */
export async function separateImageLayers(
  imageUrl: string,
): Promise<{ layers: WorksheetLayer[]; mocked: boolean; error?: string }> {
  if (!imageUrl) return { layers: [], mocked: false, error: 'no image' };
  const res = await callGateway({ task: 'detect', provider: 'auto', messages: [], meta: { image: imageUrl } });
  const regions = res.regions ?? [];
  if (regions.length === 0) return { layers: [], mocked: !!res.mocked, error: res.error };
  let img: HTMLImageElement;
  try {
    img = await loadImage(imageUrl);
  } catch (e) {
    return { layers: [], mocked: !!res.mocked, error: e instanceof Error ? e.message : 'image load failed' };
  }
  const cropped = await Promise.all(
    regions.map((r, i) => cropRegion(img, { box: r.box, label: r.label, mask: r.mask }, i)),
  );
  const layers = cropped.filter((l): l is WorksheetLayer => l !== null);
  return { layers, mocked: !!res.mocked, error: res.error };
}
