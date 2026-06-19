/**
 * patchInpaint.ts — 패치 기반(PatchMatch) 멀티스케일 인페인팅.
 * ------------------------------------------------------------------
 * 구멍(mask=1)을 주변 배경의 '실제 텍스처 패치'로 채운다. 확산(push-pull)이 만드는 흐릿한
 * 얼룩 대신 진짜 무늬를 복제하므로 타일·격자·물결 같은 구조적 배경도 자연스럽게 메워진다.
 *
 * 핵심:
 *  · Barnes et al. "PatchMatch"(2009)의 근사 최근접 패치 필드(NNF).
 *  · 멀티스케일(coarse→fine): 거친 레벨에서 큰 구조(타일 줄눈)를 먼저 잡고 고운 레벨로 전파.
 *  · 거리 가중 투표: 잘 맞는 패치일수록 크게 반영 → 평균 뭉개짐(얼룩)을 줄이고 또렷하게.
 *  · 채운 구멍만 원해상도로 되샘플 합성(원본 알려진 픽셀은 손대지 않아 선명 유지).
 * 비실시간(‘저장’) 경로 전용 — 클릭마다 쓰는 빠른 경로는 기존 push-pull 유지.
 */

const R = 4; // 패치 반경 (9×9)
const WORK_CAP = 900; // 계산 해상도 상한(성능)
const MAX_HOLE = 240_000; // 작업 해상도 구멍 픽셀 상한(이 이상이면 더 축소)
const ITERS_COARSE = 8;
const ITERS_FINE = 4;
const EPS = (2 * R + 1) * (2 * R + 1) * 3; // 가중치 안정항(완벽 매치≈이 값)

interface Lvl { w: number; h: number; rgb: Float32Array; hole: Uint8Array }

/** 4-이웃 grow px 팽창. */
function grow(mask: Uint8Array, w: number, h: number, px: number): Uint8Array {
  const hole = Uint8Array.from(mask, (v) => (v ? 1 : 0));
  for (let g = 0; g < px; g++) {
    const prev = hole.slice();
    for (let p = 0; p < w * h; p++) {
      if (prev[p]) continue;
      const x = p % w, y = (p / w) | 0;
      if ((x > 0 && prev[p - 1]) || (x < w - 1 && prev[p + 1]) || (y > 0 && prev[p - w]) || (y < h - 1 && prev[p + w])) hole[p] = 1;
    }
  }
  return hole;
}

/** 2×2 평균으로 절반 해상도 레벨 생성(색은 '알려진' 서브픽셀만 평균 → 경계색 보존). */
function downsample(l: Lvl): Lvl {
  const nw = Math.max(2 * R + 2, l.w >> 1), nh = Math.max(2 * R + 2, l.h >> 1);
  const rgb = new Float32Array(nw * nh * 3), hole = new Uint8Array(nw * nh);
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
    let r = 0, g = 0, b = 0, n = 0, anyHole = 0, kn = 0, kr = 0, kg = 0, kb = 0;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const sx = Math.min(l.w - 1, x * 2 + dx), sy = Math.min(l.h - 1, y * 2 + dy), si = sy * l.w + sx;
      r += l.rgb[si * 3]; g += l.rgb[si * 3 + 1]; b += l.rgb[si * 3 + 2]; n++;
      if (l.hole[si]) anyHole = 1; else { kn++; kr += l.rgb[si * 3]; kg += l.rgb[si * 3 + 1]; kb += l.rgb[si * 3 + 2]; }
    }
    const i = y * nw + x; hole[i] = anyHole;
    if (kn > 0) { rgb[i * 3] = kr / kn; rgb[i * 3 + 1] = kg / kn; rgb[i * 3 + 2] = kb / kn; }
    else { rgb[i * 3] = r / n; rgb[i * 3 + 1] = g / n; rgb[i * 3 + 2] = b / n; }
  }
  return { w: nw, h: nh, rgb, hole };
}

/** 한 레벨에서 PatchMatch + 가중 투표 재구성. nnf(소스 좌표)를 반환. */
function solveLevel(lv: Lvl, init: { nx: Int32Array; ny: Int32Array; cw: number; ch: number } | null, iters: number): { nx: Int32Array; ny: Int32Array } {
  const { w, h, rgb, hole } = lv, N = w * h, IW = w + 1;
  // 구멍 적분영상 → 패치 내 구멍 픽셀 수 O(1).
  const integ = new Int32Array(IW * (h + 1));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
    integ[(y + 1) * IW + (x + 1)] = hole[y * w + x] + integ[y * IW + (x + 1)] + integ[(y + 1) * IW + x] - integ[y * IW + x];
  const holeInPatch = (cx: number, cy: number) => integ[(cy + R + 1) * IW + (cx + R + 1)] - integ[(cy - R) * IW + (cx + R + 1)] - integ[(cy + R + 1) * IW + (cx - R)] + integ[(cy - R) * IW + (cx - R)];
  const srcValid = (sx: number, sy: number) => sx >= R && sy >= R && sx < w - R && sy < h - R && holeInPatch(sx, sy) === 0;

  const holeList: number[] = [];
  for (let y = R; y < h - R; y++) for (let x = R; x < w - R; x++) if (hole[y * w + x]) holeList.push(y * w + x);

  const nx = new Int32Array(N), ny = new Int32Array(N), dist = new Float32Array(N);
  for (let p = 0; p < N; p++) { nx[p] = p % w; ny[p] = (p / w) | 0; }

  const pdist = (ax: number, ay: number, bx: number, by: number, best: number): number => {
    let s = 0;
    for (let dy = -R; dy <= R; dy++) {
      let ai = ((ay + dy) * w + (ax - R)) * 3, bi = ((by + dy) * w + (bx - R)) * 3;
      for (let dx = -R; dx <= R; dx++) {
        const dr = rgb[ai] - rgb[bi], dg = rgb[ai + 1] - rgb[bi + 1], db = rgb[ai + 2] - rgb[bi + 2];
        s += dr * dr + dg * dg + db * db; ai += 3; bi += 3;
      }
      if (s >= best) return s;
    }
    return s;
  };

  // NNF 초기화: 상위 레벨 nnf 업샘플(있으면), 없으면 무작위 유효 패치.
  for (const idx of holeList) {
    const x = idx % w, y = (idx / w) | 0;
    let sx = -1, sy = -1;
    if (init) {
      const px = Math.min(init.cw - 1, x >> 1), py = Math.min(init.ch - 1, y >> 1);
      const cand_x = init.nx[py * init.cw + px] * 2 + (x & 1), cand_y = init.ny[py * init.cw + px] * 2 + (y & 1);
      if (srcValid(cand_x, cand_y)) { sx = cand_x; sy = cand_y; }
    }
    if (sx < 0) for (let t = 0; t < 24 && sx < 0; t++) {
      const rxr = R + ((Math.random() * (w - 2 * R)) | 0), ryr = R + ((Math.random() * (h - 2 * R)) | 0);
      if (srcValid(rxr, ryr)) { sx = rxr; sy = ryr; }
    }
    if (sx < 0) { sx = R; sy = R; }
    nx[idx] = sx; ny[idx] = sy; dist[idx] = pdist(x, y, sx, sy, Infinity);
  }

  const maxRad = Math.max(w, h);
  const acc = new Float32Array(N * 3), wsum = new Float32Array(N);
  for (let it = 0; it < iters; it++) {
    const rev = it % 2 === 1, order = rev ? -1 : 1, start = rev ? holeList.length - 1 : 0, end = rev ? -1 : holeList.length, dir = rev ? 1 : -1;
    for (let k = start; k !== end; k += order) {
      const idx = holeList[k], x = idx % w, y = (idx / w) | 0;
      let bX = nx[idx], bY = ny[idx], bD = dist[idx];
      const lx = x - dir;
      if (lx >= R && lx < w - R) { const cx = nx[y * w + lx] + dir, cy = ny[y * w + lx]; if (srcValid(cx, cy)) { const d = pdist(x, y, cx, cy, bD); if (d < bD) { bD = d; bX = cx; bY = cy; } } }
      const uy = y - dir;
      if (uy >= R && uy < h - R) { const cx = nx[uy * w + x], cy = ny[uy * w + x] + dir; if (srcValid(cx, cy)) { const d = pdist(x, y, cx, cy, bD); if (d < bD) { bD = d; bX = cx; bY = cy; } } }
      for (let rad = maxRad; rad >= 1; rad = (rad / 2) | 0) {
        const cx = bX + (((Math.random() * 2 - 1) * rad) | 0), cy = bY + (((Math.random() * 2 - 1) * rad) | 0);
        if (srcValid(cx, cy)) { const d = pdist(x, y, cx, cy, bD); if (d < bD) { bD = d; bX = cx; bY = cy; } }
      }
      nx[idx] = bX; ny[idx] = bY; dist[idx] = bD;
    }
    // 가중 투표 재구성(잘 맞는 패치일수록 크게).
    acc.fill(0); wsum.fill(0);
    for (const idx of holeList) {
      const x = idx % w, y = (idx / w) | 0, sx = nx[idx], sy = ny[idx], wgt = 1 / (dist[idx] + EPS);
      for (let dy = -R; dy <= R; dy++) {
        const qy = y + dy; if (qy < 0 || qy >= h) continue;
        for (let dx = -R; dx <= R; dx++) {
          const qx = x + dx; if (qx < 0 || qx >= w) continue;
          const q = qy * w + qx; if (!hole[q]) continue;
          const si = ((sy + dy) * w + (sx + dx)) * 3, q3 = q * 3;
          acc[q3] += rgb[si] * wgt; acc[q3 + 1] += rgb[si + 1] * wgt; acc[q3 + 2] += rgb[si + 2] * wgt; wsum[q] += wgt;
        }
      }
    }
    for (const idx of holeList) { const ws = wsum[idx]; if (ws <= 0) continue; const i3 = idx * 3; rgb[i3] = acc[i3] / ws; rgb[i3 + 1] = acc[i3 + 1] / ws; rgb[i3 + 2] = acc[i3 + 2] / ws; }
  }
  return { nx, ny };
}

/** 거친 레벨의 채운 rgb를 고운 레벨의 구멍 픽셀에 쌍선형으로 시드. */
function seedFrom(fine: Lvl, coarse: Lvl): void {
  const { w, h, rgb, hole } = fine;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x; if (!hole[p]) continue;
    const u = x / 2, v = y / 2;
    const x0 = Math.min(coarse.w - 1, Math.floor(u)), y0 = Math.min(coarse.h - 1, Math.floor(v));
    const x1 = Math.min(coarse.w - 1, x0 + 1), y1 = Math.min(coarse.h - 1, y0 + 1), tx = u - x0, ty = v - y0;
    const i00 = (y0 * coarse.w + x0) * 3, i10 = (y0 * coarse.w + x1) * 3, i01 = (y1 * coarse.w + x0) * 3, i11 = (y1 * coarse.w + x1) * 3;
    for (let c = 0; c < 3; c++) {
      const top = coarse.rgb[i00 + c] + (coarse.rgb[i10 + c] - coarse.rgb[i00 + c]) * tx;
      const bot = coarse.rgb[i01 + c] + (coarse.rgb[i11 + c] - coarse.rgb[i01 + c]) * tx;
      rgb[p * 3 + c] = top + (bot - top) * ty;
    }
  }
}

function scaledRGB(src: HTMLCanvasElement, sw: number, sh: number): Float32Array {
  const c = document.createElement('canvas'); c.width = sw; c.height = sh;
  const cx = c.getContext('2d')!; cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high'; cx.drawImage(src, 0, 0, sw, sh);
  const d = cx.getImageData(0, 0, sw, sh).data, rgb = new Float32Array(sw * sh * 3);
  for (let i = 0; i < sw * sh; i++) { rgb[i * 3] = d[i * 4]; rgb[i * 3 + 1] = d[i * 4 + 1]; rgb[i * 3 + 2] = d[i * 4 + 2]; }
  return rgb;
}
function scaledHole(mask: Uint8Array, w: number, h: number, sw: number, sh: number): Uint8Array {
  const mc = document.createElement('canvas'); mc.width = w; mc.height = h;
  const mx = mc.getContext('2d')!, img = mx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) if (mask[i]) { img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = img.data[i * 4 + 3] = 255; }
  mx.putImageData(img, 0, 0);
  const sc = document.createElement('canvas'); sc.width = sw; sc.height = sh;
  const sx = sc.getContext('2d')!; sx.imageSmoothingEnabled = true; sx.drawImage(mc, 0, 0, sw, sh);
  const sd = sx.getImageData(0, 0, sw, sh).data, raw = new Uint8Array(sw * sh);
  for (let i = 0; i < sw * sh; i++) raw[i] = sd[i * 4 + 3] > 100 ? 1 : 0;
  return grow(raw, sw, sh, 1);
}

/**
 * mask(1=구멍) 영역을 패치 기반으로 채운다. 제자리(work) 수정. 성공 시 true.
 * 실패(컨텍스트 없음·크기 불일치·구멍 없음)면 false → 호출부가 기존 인페인팅으로 폴백.
 */
export function inpaintPatch(work: HTMLCanvasElement, mask: Uint8Array, w: number, h: number): boolean {
  const ctx = work.getContext('2d');
  if (!ctx || w !== work.width || h !== work.height) return false;
  const holeFull = grow(mask, w, h, 3);
  let holeCount = 0;
  for (let i = 0; i < w * h; i++) if (holeFull[i]) holeCount++;
  if (holeCount === 0) return false;

  let scale = Math.min(1, WORK_CAP / Math.max(w, h));
  const atScale = holeCount * scale * scale;
  if (atScale > MAX_HOLE) scale *= Math.sqrt(MAX_HOLE / atScale);
  const sw = Math.max(4 * R, Math.round(w * scale)), sh = Math.max(4 * R, Math.round(h * scale));

  const base: Lvl = { w: sw, h: sh, rgb: scaledRGB(work, sw, sh), hole: scaledHole(mask, w, h, sw, sh) };
  // 멀티스케일 피라미드(고운→거친).
  const pyr: Lvl[] = [base];
  while (Math.min(pyr[pyr.length - 1].w, pyr[pyr.length - 1].h) > 64) pyr.push(downsample(pyr[pyr.length - 1]));

  // 가장 거친 레벨 구멍 초기색 = 알려진 평균.
  const top = pyr[pyr.length - 1];
  let mr = 0, mg = 0, mb = 0, mn = 0;
  for (let i = 0; i < top.w * top.h; i++) if (!top.hole[i]) { mr += top.rgb[i * 3]; mg += top.rgb[i * 3 + 1]; mb += top.rgb[i * 3 + 2]; mn++; }
  if (mn === 0) return false;
  for (let i = 0; i < top.w * top.h; i++) if (top.hole[i]) { top.rgb[i * 3] = mr / mn; top.rgb[i * 3 + 1] = mg / mn; top.rgb[i * 3 + 2] = mb / mn; }

  // 거친 레벨부터 풀고, 고운 레벨로 색·NNF 전파.
  let prevNnf: { nx: Int32Array; ny: Int32Array; cw: number; ch: number } | null = null;
  for (let L = pyr.length - 1; L >= 0; L--) {
    const lv = pyr[L];
    if (L < pyr.length - 1) seedFrom(lv, pyr[L + 1]); // 거친 결과로 구멍 시드
    const r = solveLevel(lv, prevNnf, L === pyr.length - 1 ? ITERS_COARSE : ITERS_FINE);
    prevNnf = { nx: r.nx, ny: r.ny, cw: lv.w, ch: lv.h };
  }

  // 채운 구멍만 원해상도로 되샘플(쌍선형) — 알려진 픽셀은 손대지 않아 선명 유지.
  const out = ctx.getImageData(0, 0, w, h), d = out.data, frgb = base.rgb;
  const fx = (sw - 1) / Math.max(1, w - 1), fy = (sh - 1) / Math.max(1, h - 1);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x; if (!holeFull[p]) continue;
    const u = x * fx, v = y * fy;
    const x0 = Math.min(sw - 1, Math.floor(u)), y0 = Math.min(sh - 1, Math.floor(v)), x1 = Math.min(sw - 1, x0 + 1), y1 = Math.min(sh - 1, y0 + 1), tx = u - x0, ty = v - y0;
    const i00 = (y0 * sw + x0) * 3, i10 = (y0 * sw + x1) * 3, i01 = (y1 * sw + x0) * 3, i11 = (y1 * sw + x1) * 3, di = p * 4;
    for (let c = 0; c < 3; c++) d[di + c] = Math.max(0, Math.min(255, Math.round(lerp(lerp(frgb[i00 + c], frgb[i10 + c], tx), lerp(frgb[i01 + c], frgb[i11 + c], tx), ty))));
    d[di + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  return true;
}
