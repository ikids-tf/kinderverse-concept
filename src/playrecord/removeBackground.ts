// 누끼: 캡처/업로드한 그림의 "배경"을 투명하게 만든다 (클라이언트 전용, 라이브러리 없음).
// 방식: 가장자리 픽셀에서 시작하는 flood-fill — 가장자리 평균색과 비슷한(연결된) 영역만 투명화.
//   → 평면 포스터에서 딴 사각형 그림의 둘레 배경이 제거되고, 가운데 피사체는 남는다.
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export interface RemoveBgOptions {
  tolerance?: number; // 배경으로 간주할 색 차이 (기본 38)
  maxDim?: number; // 처리 해상도 상한 (기본 900px)
}

export async function removeBackground(src: string, opts: RemoveBgOptions = {}): Promise<string> {
  const { tolerance = 38, maxDim = 900 } = opts;
  const img = await loadImage(src);
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
  const w = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
  const h = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return src;
  ctx.drawImage(img, 0, 0, w, h);
  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data;

  // 가장자리 평균색 = 배경 기준색
  let br = 0, bg = 0, bb = 0, n = 0;
  const addRef = (x: number, y: number) => { const i = (y * w + x) * 4; br += d[i]; bg += d[i + 1]; bb += d[i + 2]; n++; };
  for (let x = 0; x < w; x++) { addRef(x, 0); addRef(x, h - 1); }
  for (let y = 0; y < h; y++) { addRef(0, y); addRef(w - 1, y); }
  br /= n; bg /= n; bb /= n;
  const tol2 = tolerance * tolerance;

  const visited = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (x: number, y: number) => { if (x >= 0 && y >= 0 && x < w && y < h) stack.push(y * w + x); };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }

  let removed = 0;
  while (stack.length) {
    const p = stack.pop() as number;
    if (visited[p]) continue;
    visited[p] = 1;
    const i = p * 4;
    const dr = d[i] - br, dg = d[i + 1] - bg, db = d[i + 2] - bb;
    if (dr * dr + dg * dg + db * db > tol2) continue; // 피사체 → 배경 아님, 멈춤
    d[i + 3] = 0; // 투명
    removed++;
    const x = p % w, y = (p - x) / w;
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }

  // 배경이 거의 제거되지 않았으면(=가장자리가 피사체) 원본 유지
  if (removed < w * h * 0.02) return src;
  ctx.putImageData(id, 0, 0);
  return c.toDataURL("image/png");
}
