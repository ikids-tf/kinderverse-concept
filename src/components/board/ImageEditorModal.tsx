import { useCallback, useEffect, useRef, useState } from 'react';
import { useBoardStore, newId, type BoardNode } from '@/store/boardStore';
import { replaceImageCmd, addImageNodeCmd } from '@/board/commands';
import { makeThumb, THUMB_MAX_W } from '@/board/imageLod';
import { removeBackground, cleanupBackground } from '@/shared/background-removal';
import { prepareSegment, segmentAt, segmentAtPoints } from '@/shared/segment/segment';
import { inpaintPatch } from '@/shared/inpaint/patchInpaint';
import { aiInpaintFill } from '@/shared/inpaint/aiInpaint';
import { saveAsset } from '@/board/assets';
import { showToast } from '@/lib/toast';
import { useZoomModal, type OriginRect } from './useZoomModal';

/* 이미지 편집 모달 — 보드 이미지 카드의 ✏️ '편집' 버튼이 연다.
   기능: ① 배경 제거(누끼, 공용 엔진) ② 요소 지우기(이미지 안 요소를 클릭 → 같은 색
   연결 영역을 선택해 그 부분만 투명하게) ③ 다운로드(PNG). 적용=보드 카드에 반영(⌘Z 복원).
   앱 크롬이므로 Milray 토큰만 사용. */

const MAX_EDIT_EDGE = 1600; // 작업 해상도 상한(성능)

// 'ai' = SAM으로 클릭한 객체를 통째로(맥락 기반) 지움 · 'color' = 같은 색 연결 영역(flood-fill)
// · 'extract' = 객체 분리(클릭→마스킹→수정/저장으로 객체만 따로 복사 + 원본은 배경으로 채움).
type Tool = 'ai' | 'color' | 'extract';
type Pt = { x: number; y: number; label: number }; // SAM 정밀 조절 점(1=추가, 0=빼기)
type Box = { x0: number; y0: number; x1: number; y1: number };

/** 마스크의 바운딩 박스(작업 픽셀 좌표). 없으면 null. */
function maskBBox(mask: Uint8Array, w: number, h: number): Box | null {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let p = 0; p < w * h; p++) {
    if (!mask[p]) continue;
    const x = p % w, y = (p / w) | 0;
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/** 선택 마스크를 '예쁘게' 보여줄 오버레이 타일 — 코랄 반투명 채움 + 또렷한 코랄 외곽선. */
function buildOverlayTile(mask: Uint8Array, w: number, h: number): HTMLCanvasElement {
  const tile = document.createElement('canvas');
  tile.width = w; tile.height = h;
  const ctx = tile.getContext('2d');
  if (!ctx) return tile;
  const od = ctx.createImageData(w, h);
  const p = od.data;
  for (let i = 0; i < w * h; i++) {
    if (!mask[i]) continue;
    const x = i % w, y = (i / w) | 0;
    // 2px 외곽선(또렷하게) — 경계 픽셀 + 그 안쪽 1겹.
    const edge1 =
      x === 0 || x === w - 1 || y === 0 || y === h - 1 ||
      !mask[i - 1] || !mask[i + 1] || !mask[i - w] || !mask[i + w];
    const edge2 = !edge1 && (
      (x > 1 && !mask[i - 2]) || (x < w - 2 && !mask[i + 2]) ||
      (y > 1 && !mask[i - 2 * w]) || (y < h - 2 && !mask[i + 2 * w]));
    p[i * 4] = 242; p[i * 4 + 1] = 115; p[i * 4 + 2] = 62;
    p[i * 4 + 3] = edge1 ? 255 : edge2 ? 230 : 150; // 외곽선=또렷, 내부=면을 채워 '선택됨'을 또렷이
  }
  ctx.putImageData(od, 0, 0);
  return tile;
}

/** 1px 침식(4-이웃) — 경계의 배경 프린지를 한 겹 깎는다. */
function erode1(m: Uint8Array, w: number, h: number): Uint8Array {
  const o = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) {
    if (!m[p]) continue;
    const x = p % w, y = (p / w) | 0;
    if ((x > 0 && !m[p - 1]) || (x < w - 1 && !m[p + 1]) || (y > 0 && !m[p - w]) || (y < h - 1 && !m[p + w])) continue;
    o[p] = 1;
  }
  return o;
}
/** 반경1 박스 블러(0..1) — 마스크 경계를 부드럽게(안티에일리어스 알파). */
function softEdge(m: Uint8Array, w: number, h: number): Float32Array {
  const o = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      s += m[yy * w + xx]; n++;
    }
    o[y * w + x] = n ? s / n : 0;
  }
  return o;
}

/** 마스크 영역만 잘라 투명 배경 PNG 캔버스로(분리 객체) — 경계 페더링으로 깔끔하게.
 *  매팅 모델 정제가 실패할 때의 폴백. box=작업 픽셀 좌표. */
function buildObjectCanvas(work: HTMLCanvasElement, mask: Uint8Array, w: number, box: Box): HTMLCanvasElement {
  const bw = box.x1 - box.x0 + 1, bh = box.y1 - box.y0 + 1;
  const out = document.createElement('canvas');
  out.width = bw; out.height = bh;
  const octx = out.getContext('2d');
  const wctx = work.getContext('2d');
  if (!octx || !wctx) return out;
  // bbox 영역 마스크 → 침식(프린지 제거) → 부드러운 알파(안티에일리어스).
  const m = new Uint8Array(bw * bh);
  for (let yy = 0; yy < bh; yy++) for (let xx = 0; xx < bw; xx++) m[yy * bw + xx] = mask[(box.y0 + yy) * w + (box.x0 + xx)] ? 1 : 0;
  const soft = softEdge(erode1(m, bw, bh), bw, bh);
  const src = wctx.getImageData(box.x0, box.y0, bw, bh);
  const sd = src.data;
  for (let i = 0; i < bw * bh; i++) sd[i * 4 + 3] = Math.round(sd[i * 4 + 3] * soft[i]);
  octx.putImageData(src, 0, 0);
  return out;
}

/** 작업 캔버스를 PNG Blob으로(세그먼트 임베딩 입력용). */
function canvasToBlob(cv: HTMLCanvasElement): Promise<Blob> {
  return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('toBlob 실패'))), 'image/png'));
}

function drawUrlToCanvas(url: string, cap = MAX_EDIT_EDGE): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, cap / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
      const w = Math.max(1, Math.round((img.naturalWidth || 1) * scale));
      const h = Math.max(1, Math.round((img.naturalHeight || 1) * scale));
      const cv = document.createElement('canvas');
      cv.width = w;
      cv.height = h;
      const ctx = cv.getContext('2d');
      if (!ctx) return reject(new Error('no 2d context'));
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      resolve(cv);
    };
    img.onerror = () => reject(new Error('image load failed'));
    img.src = url;
  });
}

/** 클릭한 픽셀과 색이 비슷한 '연결 영역'을 골라 투명하게(요소 지우기). tol=색 거리 허용치. */
function floodErase(work: HTMLCanvasElement, sx: number, sy: number, tol: number): number {
  const ctx = work.getContext('2d');
  if (!ctx) return 0;
  const w = work.width;
  const h = work.height;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const s = sy * w + sx;
  if (d[s * 4 + 3] === 0) return 0; // 이미 투명한 곳 — 무시
  const r0 = d[s * 4], g0 = d[s * 4 + 1], b0 = d[s * 4 + 2];
  const tol2 = tol * tol * 3; // RGB 제곱거리 임계
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let sp = 0;
  stack[sp++] = s;
  seen[s] = 1;
  let erased = 0;
  while (sp > 0) {
    const p = stack[--sp];
    const i = p * 4;
    if (d[i + 3] === 0) continue;
    const dr = d[i] - r0, dg = d[i + 1] - g0, db = d[i + 2] - b0;
    if (dr * dr + dg * dg + db * db > tol2) continue;
    d[i + 3] = 0;
    erased++;
    const x = p % w, y = (p / w) | 0;
    if (x > 0 && !seen[p - 1]) { seen[p - 1] = 1; stack[sp++] = p - 1; }
    if (x < w - 1 && !seen[p + 1]) { seen[p + 1] = 1; stack[sp++] = p + 1; }
    if (y > 0 && !seen[p - w]) { seen[p - w] = 1; stack[sp++] = p - w; }
    if (y < h - 1 && !seen[p + w]) { seen[p + w] = 1; stack[sp++] = p + w; }
  }
  ctx.putImageData(img, 0, 0);
  return erased;
}

/** 마스크를 grow px 팽창(4-이웃) — 객체 경계의 헤일로까지 덮어 인페인팅 자국을 줄인다. */
function growMask(mask: Uint8Array, w: number, h: number, grow: number): Uint8Array {
  const hole = Uint8Array.from(mask, (v) => (v ? 1 : 0));
  for (let g = 0; g < grow; g++) {
    const prev = hole.slice();
    for (let p = 0; p < w * h; p++) {
      if (prev[p]) continue;
      const x = p % w, y = (p / w) | 0;
      if ((x > 0 && prev[p - 1]) || (x < w - 1 && prev[p + 1]) || (y > 0 && prev[p - w]) || (y < h - 1 && prev[p + w])) hole[p] = 1;
    }
  }
  return hole;
}

/**
 * 객체 영역(mask=1)을 지우고 '주변 배경으로 자연스럽게' 채운다(인페인팅). 투명 구멍이 아니라
 * 객체가 없던 것처럼 배경을 메운다. push-pull(pull-push) 피라미드 방식 — 알려진 픽셀만으로
 * 다단계 다운/업샘플해 구멍을 매끄럽게 보간한다(그라데이션·단색 배경에서 특히 자연스럽다).
 * 반환: 채운 픽셀 수(크기 불일치 -1, 없음 0).
 */
function inpaintByMask(work: HTMLCanvasElement, mask: Uint8Array, w: number, h: number): number {
  const ctx = work.getContext('2d');
  if (!ctx) return 0;
  if (w !== work.width || h !== work.height) return -1;
  const N = w * h;
  const hole = growMask(mask, w, h, 3);
  let count = 0;
  for (let i = 0; i < N; i++) if (hole[i]) count++;
  if (count === 0) return 0;

  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  type Lvl = { w: number; h: number; r: Float32Array; g: Float32Array; b: Float32Array; a: Float32Array };
  // 레벨 0 — 구멍은 가중치 0(미지), 나머지는 1(원본 색).
  const l0: Lvl = { w, h, r: new Float32Array(N), g: new Float32Array(N), b: new Float32Array(N), a: new Float32Array(N) };
  for (let p = 0; p < N; p++) {
    if (!hole[p]) { l0.r[p] = d[p * 4]; l0.g[p] = d[p * 4 + 1]; l0.b[p] = d[p * 4 + 2]; l0.a[p] = 1; }
  }
  const levels: Lvl[] = [l0];

  // PULL — 알려진 픽셀만 가중 평균해 절반 해상도로 축소(구멍이 메워질 때까지).
  let cur = l0;
  while (cur.w > 1 || cur.h > 1) {
    const nw = Math.max(1, cur.w >> 1), nh = Math.max(1, cur.h >> 1);
    const nx: Lvl = { w: nw, h: nh, r: new Float32Array(nw * nh), g: new Float32Array(nw * nh), b: new Float32Array(nw * nh), a: new Float32Array(nw * nh) };
    for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
      let sr = 0, sg = 0, sb = 0, sw = 0;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const sx = Math.min(cur.w - 1, x * 2 + dx), sy = Math.min(cur.h - 1, y * 2 + dy);
        const si = sy * cur.w + sx, wt = cur.a[si];
        sr += cur.r[si] * wt; sg += cur.g[si] * wt; sb += cur.b[si] * wt; sw += wt;
      }
      const ni = y * nw + x;
      if (sw > 0) { nx.r[ni] = sr / sw; nx.g[ni] = sg / sw; nx.b[ni] = sb / sw; nx.a[ni] = Math.min(1, sw / 4); }
    }
    levels.push(nx);
    cur = nx;
  }

  // PUSH — 거친 레벨에서 고운 레벨로, 구멍 픽셀을 상위 레벨 색(쌍선형 보간)으로 메운다.
  const bilinear = (lv: Lvl, fx: number, fy: number, out: number[]) => {
    const x0 = Math.max(0, Math.min(lv.w - 1, Math.floor(fx))), y0 = Math.max(0, Math.min(lv.h - 1, Math.floor(fy)));
    const x1 = Math.min(lv.w - 1, x0 + 1), y1 = Math.min(lv.h - 1, y0 + 1);
    const tx = Math.max(0, Math.min(1, fx - x0)), ty = Math.max(0, Math.min(1, fy - y0));
    const i00 = y0 * lv.w + x0, i10 = y0 * lv.w + x1, i01 = y1 * lv.w + x0, i11 = y1 * lv.w + x1;
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    out[0] = lerp(lerp(lv.r[i00], lv.r[i10], tx), lerp(lv.r[i01], lv.r[i11], tx), ty);
    out[1] = lerp(lerp(lv.g[i00], lv.g[i10], tx), lerp(lv.g[i01], lv.g[i11], tx), ty);
    out[2] = lerp(lerp(lv.b[i00], lv.b[i10], tx), lerp(lv.b[i01], lv.b[i11], tx), ty);
  };
  const sm: number[] = [0, 0, 0];
  for (let l = levels.length - 2; l >= 0; l--) {
    const fine = levels[l], coarse = levels[l + 1];
    for (let y = 0; y < fine.h; y++) for (let x = 0; x < fine.w; x++) {
      const fi = y * fine.w + x;
      if (fine.a[fi] >= 1) continue; // 알려진 픽셀은 보존
      bilinear(coarse, (x - 0.5) * 0.5, (y - 0.5) * 0.5, sm);
      const fw = fine.a[fi];
      fine.r[fi] = fine.r[fi] * fw + sm[0] * (1 - fw);
      fine.g[fi] = fine.g[fi] * fw + sm[1] * (1 - fw);
      fine.b[fi] = fine.b[fi] * fw + sm[2] * (1 - fw);
      fine.a[fi] = 1;
    }
  }

  // 구멍 픽셀에만 채운 색을 써넣는다(알파는 불투명 유지 — 배경이 메워진 모습).
  for (let p = 0; p < N; p++) {
    if (hole[p]) { d[p * 4] = l0.r[p]; d[p * 4 + 1] = l0.g[p]; d[p * 4 + 2] = l0.b[p]; d[p * 4 + 3] = 255; }
  }
  ctx.putImageData(img, 0, 0);
  return count;
}

/** 마스크(grow 포함) 영역을 '투명하게' 지운다 — 이미 배경이 없는(컷아웃) 이미지의 섬 객체용.
 *  투명 배경 위에선 인페인팅이 주변(투명/검정)을 끌어와 검은 얼룩이 생기므로 이 경로를 쓴다. */
function eraseMaskTransparent(work: HTMLCanvasElement, mask: Uint8Array, w: number, h: number): number {
  const ctx = work.getContext('2d');
  if (!ctx) return 0;
  if (w !== work.width || h !== work.height) return -1;
  const hole = growMask(mask, w, h, 2);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  let n = 0;
  for (let i = 0; i < w * h; i++) if (hole[i] && d[i * 4 + 3] !== 0) { d[i * 4 + 3] = 0; n++; }
  ctx.putImageData(img, 0, 0);
  return n;
}

/** 선택 객체의 '바깥 테두리 띠'가 대부분 투명인가? → 투명 배경 위 섬 객체로 보고 투명 삭제,
 *  아니면(주변에 배경 픽셀이 있으면) 인페인팅으로 메운다. */
function surroundingMostlyTransparent(work: HTMLCanvasElement, mask: Uint8Array, w: number, h: number): boolean {
  const ctx = work.getContext('2d');
  if (!ctx || w !== work.width || h !== work.height) return false;
  const hole = growMask(mask, w, h, 3);
  const band = growMask(hole, w, h, 8); // hole + 바깥 8px 띠
  const d = ctx.getImageData(0, 0, w, h).data;
  let trans = 0, tot = 0;
  for (let i = 0; i < w * h; i++) {
    if (band[i] && !hole[i]) { tot++; if (d[i * 4 + 3] < 16) trans++; }
  }
  return tot > 0 && trans / tot > 0.6;
}

export function ImageEditorModal({ nodeId, onClose, origin }: { nodeId: string; onClose: () => void; origin?: OriginRect | null }) {
  // 카드 위치에서 커지며 열리고 닫을 때 그 위치로 작아진다 + 배경 조작 차단.
  const { requestClose, onContentTransitionEnd, contentStyle, backdropStyle } = useZoomModal(origin, onClose);
  const viewRef = useRef<HTMLCanvasElement | null>(null); // 화면 표시용
  const workRef = useRef<HTMLCanvasElement | null>(null); // 풀해상도 작업 캔버스
  const undoRef = useRef<ImageData[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('ai');
  const [tol, setTol] = useState(32);
  const [, force] = useState(0);
  // AI 분할 임베딩 캐시 관리 — 작업본이 바뀌면 segVersion을 올려 다음 AI 클릭에서 재준비한다.
  const segVersionRef = useRef(0);
  const segPreparedRef = useRef<string | null>(null);
  const bumpWork = () => { segVersionRef.current++; };

  // 객체 분리(extract) — 선택 마스크 + 예쁜 오버레이 + 정밀 조절 점 + 바운딩박스.
  const extractMaskRef = useRef<{ mask: Uint8Array; w: number; h: number } | null>(null);
  const extractTileRef = useRef<HTMLCanvasElement | null>(null);
  const pointsRef = useRef<Pt[]>([]);
  const [extractBox, setExtractBox] = useState<Box | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const clearExtract = useCallback(() => {
    extractMaskRef.current = null;
    extractTileRef.current = null;
    pointsRef.current = [];
    setExtractBox(null);
    setAdjusting(false);
  }, []);

  const node = useBoardStore.getState().nodes[nodeId];
  const caption = (node?.text || '이미지').split('\n')[0].slice(0, 40) || '이미지';

  const redraw = useCallback(() => {
    const work = workRef.current;
    const view = viewRef.current;
    if (!work || !view) return;
    if (view.width !== work.width || view.height !== work.height) {
      view.width = work.width;
      view.height = work.height;
    }
    const ctx = view.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, view.width, view.height);
    ctx.drawImage(work, 0, 0);
    // 객체 분리 선택 오버레이(있으면) — 작업 이미지 위에 코랄 마스크.
    const tile = extractTileRef.current;
    if (tile && tile.width === view.width && tile.height === view.height) ctx.drawImage(tile, 0, 0);
  }, []);

  // 지워질 영역을 잠깐 '로딩되듯' 코랄로 펄스 표시(선택 피드백) 후 resolve. 끝나면 호출부가 지운다.
  const pulseHighlight = useCallback(
    (mask: Uint8Array, w: number, h: number) =>
      new Promise<void>((resolve) => {
        const view = viewRef.current;
        const ctx = view?.getContext('2d');
        if (!view || !ctx || view.width !== w || view.height !== h) { resolve(); return; }
        // 마스크 타일(코랄 #F2733E = 토큰 --coral. 캔버스 픽셀이라 CSS 변수 대신 RGB 직접 사용).
        const ov = ctx.createImageData(w, h);
        const od = ov.data;
        for (let i = 0; i < w * h; i++) if (mask[i]) { od[i * 4] = 242; od[i * 4 + 1] = 115; od[i * 4 + 2] = 62; od[i * 4 + 3] = 255; }
        const tile = document.createElement('canvas');
        tile.width = w; tile.height = h;
        tile.getContext('2d')?.putImageData(ov, 0, 0);
        const start = performance.now();
        const dur = 680;
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / dur);
          redraw(); // 작업본 다시 그린 위에 펄스 오버레이
          const pulse = 0.25 + 0.4 * (0.5 - 0.5 * Math.cos(t * Math.PI * 4)); // 약 2회 펄스
          ctx.save();
          ctx.globalAlpha = pulse;
          ctx.drawImage(tile, 0, 0);
          ctx.restore();
          if (t < 1) requestAnimationFrame(tick);
          else { redraw(); resolve(); }
        };
        requestAnimationFrame(tick);
      }),
    [redraw],
  );

  // 초기 로드
  useEffect(() => {
    let alive = true;
    const n = useBoardStore.getState().nodes[nodeId];
    if (!n?.src) { onClose(); return; }
    drawUrlToCanvas(n.src)
      .then((cv) => {
        if (!alive) return;
        workRef.current = cv;
        setReady(true);
        requestAnimationFrame(redraw);
      })
      .catch(() => { showToast('이미지를 불러오지 못했어요', 'error'); onClose(); });
    return () => { alive = false; };
    // 노드가 바뀔 때만 1회 로드한다. onClose/redraw를 deps에 넣으면 부모 리렌더 때마다
    // 원본을 다시 로드해 편집 결과를 덮어쓰므로 의도적으로 제외한다(redraw는 안정 콜백).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId]);

  // Esc 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose();
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // 창 크기 변동 시 객체 분리 컨트롤 위치 재계산.
  useEffect(() => {
    const onResize = () => force((n) => n + 1);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const pushUndo = () => {
    const work = workRef.current;
    if (!work) return;
    const ctx = work.getContext('2d');
    if (!ctx) return;
    undoRef.current.push(ctx.getImageData(0, 0, work.width, work.height));
    if (undoRef.current.length > 12) undoRef.current.shift();
    force((n) => n + 1);
  };
  const undo = () => {
    const work = workRef.current;
    const prev = undoRef.current.pop();
    if (!work || !prev) return;
    const ctx = work.getContext('2d');
    if (!ctx) return;
    // 크기가 다르면(배경제거로 해상도 변경) 캔버스 크기를 스냅샷에 맞춘다.
    if (work.width !== prev.width || work.height !== prev.height) {
      work.width = prev.width;
      work.height = prev.height;
    }
    ctx.putImageData(prev, 0, 0);
    redraw();
    bumpWork(); // 작업본이 바뀜 → 다음 AI 클릭은 재준비
    force((n) => n + 1);
  };

  /** 현재 작업본에 대한 SAM 임베딩이 준비됐는지 보장(없으면 계산). segId 반환. */
  const ensurePrepared = useCallback(async () => {
    const work = workRef.current;
    if (!work) throw new Error('no work');
    const segId = `${nodeId}:${segVersionRef.current}`;
    if (segPreparedRef.current === segId) return segId;
    const blob = await canvasToBlob(work);
    await prepareSegment(segId, blob);
    segPreparedRef.current = segId;
    return segId;
  }, [nodeId]);

  /** SAM 점들로 분리할 객체 마스크를 잡아 오버레이/박스를 갱신.
   *  첫 선택(점 1개)은 'whole'로 객체 전체를, 정밀 조절(점 2+)은 'best'로 의도한 경계를 잡는다. */
  const segmentExtract = useCallback(async (points: Pt[]) => {
    if (!workRef.current) return;
    setBusy(
      segPreparedRef.current === `${nodeId}:${segVersionRef.current}`
        ? 'AI가 객체를 분석하고 있어요…'
        : 'AI 준비 중… (처음 한 번은 모델 다운로드로 시간이 걸려요)',
    );
    try {
      const segId = await ensurePrepared();
      // 양성(추가) 점만 있으면 객체 전체를, 음성(빼기) 점이 섞이면 정밀 경계를 잡는다.
      const prefer = points.some((p) => p.label === 0) ? 'best' : 'whole';
      const { mask, w, h } = await segmentAtPoints(segId, points, prefer);
      const box = maskBBox(mask, w, h);
      if (!box) { showToast('객체를 찾지 못했어요 — 다시 클릭해 보세요', 'error'); return; }
      extractMaskRef.current = { mask, w, h };
      extractTileRef.current = buildOverlayTile(mask, w, h);
      pointsRef.current = points;
      setExtractBox(box);
      redraw();
    } catch {
      showToast('AI 분할에 실패했어요', 'error');
    } finally {
      setBusy(null);
    }
  }, [ensurePrepared, nodeId, redraw]);

  const onCanvasClick = async (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (busy) return;
    const view = viewRef.current;
    const work = workRef.current;
    if (!view || !work) return;
    const rect = view.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * work.width);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * work.height);
    if (x < 0 || y < 0 || x >= work.width || y >= work.height) return;

    // 객체 분리 — 첫 클릭=객체 선택, '수정' 모드에선 클릭=영역 추가 / Alt·Shift+클릭=영역 빼기.
    if (tool === 'extract') {
      if (adjusting && pointsRef.current.length > 0) {
        const label = e.altKey || e.shiftKey ? 0 : 1;
        await segmentExtract([...pointsRef.current, { x, y, label }]);
      } else {
        setAdjusting(false);
        await segmentExtract([{ x, y, label: 1 }]);
      }
      return;
    }

    if (tool === 'color') {
      pushUndo();
      const n = floodErase(work, x, y, tol);
      if (n === 0) undoRef.current.pop();
      redraw();
      force((v) => v + 1);
      return;
    }

    // tool === 'ai' — 클릭한 객체를 SAM으로 분할 → 지워질 영역 표시 → 지운다.
    //  · 주변에 배경이 있으면 인페인팅으로 자연스럽게 메우고,
    //  · 이미 배경이 없는(투명) 컷아웃의 섬 객체면 투명하게 삭제한다(검은 얼룩 방지).
    setBusy(
      segPreparedRef.current === `${nodeId}:${segVersionRef.current}`
        ? 'AI가 객체를 분석하고 있어요…'
        : 'AI 준비 중… (처음 한 번은 모델 다운로드로 시간이 걸려요)',
    );
    try {
      const segId = await ensurePrepared();
      const { mask, w, h } = await segmentAt(segId, x, y);
      setBusy(null);
      await pulseHighlight(mask, w, h); // 지워질 영역을 로딩되듯 잠깐 표시
      pushUndo();
      const transparentMode = surroundingMostlyTransparent(work, mask, w, h);
      const n = transparentMode
        ? eraseMaskTransparent(work, mask, w, h)
        : inpaintByMask(work, mask, w, h);
      if (n <= 0) undoRef.current.pop();
      if (n === -1) showToast('마스크 크기가 맞지 않아 다시 시도해 주세요', 'error');
      else bumpWork(); // 픽셀이 바뀜 → 다음 AI 클릭은 임베딩 재준비
      redraw();
      force((v) => v + 1);
    } catch {
      showToast('AI 분할에 실패했어요 — 색 기반으로 시도해 보세요', 'error');
    } finally {
      setBusy(null);
    }
  };

  const onRemoveBg = async () => {
    const work = workRef.current;
    if (!work || busy) return;
    setBusy('배경을 지우고 있어요… (처음 한 번은 조금 걸려요)');
    try {
      const url = work.toDataURL('image/png');
      const r = await removeBackground(url, { assetKind: 'unknown' });
      // 복잡한 배경은 매트에 흩어진 점이 남는다 → 주 피사체만 남기고 노이즈를 자동 제거해
      // 누끼 결과가 곧바로 깨끗하게 보이도록 한다('정리' 버튼은 추가 보정용으로 유지).
      let outUrl = r.dataUrl;
      try {
        const cleaned = await cleanupBackground(r.dataUrl, { level: 1, keepMainOnly: true });
        outUrl = cleaned.dataUrl;
      } catch { /* 정리 실패 시 원본 누끼 유지 */ }
      pushUndo();
      const cv = await drawUrlToCanvas(outUrl);
      workRef.current = cv;
      redraw();
      bumpWork();
      force((v) => v + 1);
    } catch {
      showToast('배경 제거에 실패했어요', 'error');
    } finally {
      setBusy(null);
    }
  };

  const onCleanup = async () => {
    const work = workRef.current;
    if (!work || busy) return;
    setBusy('잔여 점·헤일로를 정리하고 있어요…');
    try {
      const url = work.toDataURL('image/png');
      const r = await cleanupBackground(url, { level: 1 });
      pushUndo();
      const cv = await drawUrlToCanvas(r.dataUrl);
      workRef.current = cv;
      redraw();
      bumpWork();
      force((v) => v + 1);
    } catch {
      showToast('정리에 실패했어요', 'error');
    } finally {
      setBusy(null);
    }
  };

  /** 저장 — 분리 객체를 보드에 별도 복사 + 원본은 그 자리를 배경으로 메운다(인페인팅). */
  const onSaveExtract = async () => {
    const work = workRef.current;
    const m = extractMaskRef.current;
    const box = extractBox;
    if (!work || !m || !box || busy) return;
    setBusy('객체를 정밀하게 분리하고 있어요…');
    try {
      // 1) 분리 객체 PNG — 경계 페더링(침식+안티에일리어스)으로 헤일로 없이 깔끔하게.
      //    (인페인팅 전, 원본이 온전할 때 객체 픽셀을 먼저 떠 둔다.)
      const objUrl = buildObjectCanvas(work, m.mask, m.w, box).toDataURL('image/png');
      // 2) 원본 구멍을 '기존 배경과 연속되게' 채움.
      //    ① 생성형 AI(나노바나나) — 모델이 그라데이션·물결까지 이어 그려 고스트 없이 메운다.
      //    ② 키 없음/실패 시 PatchMatch 멀티스케일(주변 텍스처 복제) → ③ push-pull 확산.
      setBusy('AI가 배경을 자연스럽게 채우고 있어요… (몇 초 걸려요)');
      let filled = false;
      try { filled = await aiInpaintFill(work, m.mask, m.w, m.h, { caption }); } catch { filled = false; }
      if (!filled) {
        setBusy('주변 배경으로 자리를 채우고 있어요…');
        if (!inpaintPatch(work, m.mask, m.w, m.h)) inpaintByMask(work, m.mask, m.w, m.h);
      }
      redraw();
      const baseUrl = work.toDataURL('image/png');
      let baseThumb: string | null = null;
      try { baseThumb = await makeThumb(baseUrl, THUMB_MAX_W, true); } catch { baseThumb = null; }
      const orig = useBoardStore.getState().nodes[nodeId];
      const od = { ...(orig?.data ?? {}), thumb: baseThumb ?? '' };
      replaceImageCmd(nodeId, baseUrl, od, '객체 분리(배경 채움)');
      // 3) 분리 객체를 원본 오른쪽에 새 이미지 노드로(컷아웃처럼 bgRemoved).
      if (orig) {
        const bw = box.x1 - box.x0 + 1, bh = box.y1 - box.y0 + 1;
        const ow = Math.max(48, Math.round((orig.w * bw) / work.width));
        const oh = Math.max(48, Math.round((orig.h * bh) / work.height));
        let objThumb: string | null = null;
        try { objThumb = await makeThumb(objUrl, THUMB_MAX_W, true); } catch { objThumb = null; }
        const node: BoardNode = {
          id: newId('image'),
          type: 'image',
          x: Math.round(orig.x + orig.w + 24),
          y: Math.round(orig.y),
          w: ow,
          h: oh,
          src: objUrl,
          text: `${caption} 분리`,
          data: { label: `${caption} 분리`, bgRemoved: true, thumb: objThumb ?? '' },
        };
        addImageNodeCmd(node, '객체 분리');
        void saveAsset(`${caption} 분리`, 'image', objUrl, caption);
      }
      showToast('객체를 분리했어요 — 보드에 따로 복사됐어요', 'success');
      requestClose();
    } catch {
      showToast('객체 분리에 실패했어요', 'error');
    } finally {
      setBusy(null);
    }
  };

  const onDownload = () => {
    const work = workRef.current;
    if (!work) return;
    work.toBlob((b) => {
      if (!b) return;
      const u = URL.createObjectURL(b);
      const a = document.createElement('a');
      a.href = u;
      a.download = `${caption}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(u), 4000);
    }, 'image/png');
  };

  const onApply = async () => {
    const work = workRef.current;
    if (!work || busy) return;
    setBusy('적용 중…');
    try {
      const url = work.toDataURL('image/png');
      let thumb: string | null = null;
      try { thumb = await makeThumb(url, THUMB_MAX_W, true); } catch { thumb = null; }
      const n = useBoardStore.getState().nodes[nodeId];
      // 편집 결과는 투명 영역을 가지므로 bgRemoved=true로 두어 카드가 컷아웃처럼 보이게 한다.
      const data = { ...(n?.data ?? {}), thumb: thumb ?? '', bgRemoved: true };
      delete (data as Record<string, unknown>).bgLevel; // 편집본은 정리 단계 초기화
      replaceImageCmd(nodeId, url, data, '이미지 편집');
      void saveAsset(`${caption} (편집)`, 'image', url, caption);
      requestClose();
    } finally {
      setBusy(null);
    }
  };

  const btn =
    'inline-flex items-center gap-t1 rounded-pill border px-t3 py-t2 text-sm font-medium transition-colors duration-150 ease-soft';
  const toolBtn = (active: boolean) =>
    `${btn} ${active ? 'border-accent bg-accent text-on-accent' : 'border-border bg-surface text-fg-2 hover:border-accent hover:text-accent'}`;
  const pickTool = (t: Tool) => { setTool(t); if (t !== 'extract') clearExtract(); };

  // 객체 분리 — 수정/저장 버튼 위치(선택 박스 아래) 계산: 작업 픽셀 → 화면 좌표.
  const view = viewRef.current;
  const rect = view?.getBoundingClientRect();
  const extractUi =
    tool === 'extract' && extractBox && rect && view
      ? {
          left: rect.left + ((extractBox.x0 + extractBox.x1) / 2 / view.width) * rect.width,
          top: rect.top + (extractBox.y1 / view.height) * rect.height + 10,
        }
      : null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 120 }}>
      {/* 배경 — 페이드 인/아웃 + 클릭 닫기(배경 조작은 useZoomModal이 차단) */}
      <div
        onClick={requestClose}
        className="absolute inset-0 bg-fg/80 backdrop-blur-sm"
        style={backdropStyle}
      />
      {/* 본문 — 카드 위치에서 커지고/작아진다 */}
      <div
        onClick={requestClose}
        onTransitionEnd={onContentTransitionEnd}
        className="absolute inset-0 flex flex-col"
        style={contentStyle}
      >
      {/* 상단 바 */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex flex-wrap items-center gap-t2 px-t6 py-t3"
      >
        <span className="mr-t2 max-w-[16ch] truncate font-display text-base font-semibold text-on-dark">{caption} 편집</span>
        <button className={toolBtn(tool === 'ai')} onClick={() => pickTool('ai')} title="클릭한 객체를 AI가 통째로 지우고, 그 자리를 주변 배경으로 자연스럽게 채웁니다">
          <Eraser /> AI 객체 지우기
        </button>
        <button className={toolBtn(tool === 'extract')} onClick={() => pickTool('extract')} title="객체를 클릭하면 AI가 마스킹합니다. 수정으로 정밀 조절, 저장하면 객체만 보드에 따로 복사하고 원본 자리는 배경으로 채웁니다">
          <SeparateIcon /> 객체 분리
        </button>
        <button className={toolBtn(tool === 'color')} onClick={() => pickTool('color')} title="클릭한 곳과 같은 색 영역(연결)을 지웁니다">
          색 기반
        </button>
        {tool === 'color' && (
          <label className="inline-flex items-center gap-t2 rounded-pill border border-border bg-surface px-t3 py-t1 text-xs text-fg-2">
            허용범위
            <input type="range" min={6} max={90} value={tol} onChange={(e) => setTol(Number(e.target.value))} className="accent-accent" />
            <span className="w-6 text-right tabular-nums">{tol}</span>
          </label>
        )}
        <button className={toolBtn(false)} onClick={() => void onRemoveBg()} disabled={!!busy} title="배경을 한 번에 제거(누끼)">
          <Scissors /> 배경 제거
        </button>
        <button className={toolBtn(false)} onClick={() => void onCleanup()} disabled={!!busy} title="흩어진 점·헤일로 정리">
          정리
        </button>
        <button className={toolBtn(false)} onClick={undo} disabled={undoRef.current.length === 0 || !!busy} title="실행 취소 (⌘Z)">
          <UndoIcon /> 되돌리기
        </button>
        <div className="flex-1" />
        <button className={toolBtn(false)} onClick={onDownload} disabled={!ready} title="PNG로 다운로드">
          <Download /> 다운로드
        </button>
        <button className={`${btn} border-none bg-accent text-on-accent hover:bg-accent-hover`} onClick={() => void onApply()} disabled={!ready || !!busy}>
          적용
        </button>
        <button className={`${btn} border-border bg-surface text-fg-2 hover:text-fg`} onClick={requestClose} title="닫기 (Esc)">
          닫기
        </button>
      </div>

      {/* 캔버스 영역 — 투명 체커보드 위에 작업 이미지 */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex-1 overflow-hidden"
        style={{ minHeight: 0, display: 'grid', placeItems: 'center', padding: '0 26px 26px' }}
      >
        <div
          style={{
            maxWidth: '92%',
            maxHeight: '100%',
            borderRadius: 12,
            overflow: 'hidden',
            // 투명도 가시화용 체커보드
            backgroundColor: '#fff',
            backgroundImage:
              'linear-gradient(45deg,#e7e0d4 25%,transparent 25%),linear-gradient(-45deg,#e7e0d4 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e7e0d4 75%),linear-gradient(-45deg,transparent 75%,#e7e0d4 75%)',
            backgroundSize: '20px 20px',
            backgroundPosition: '0 0,0 10px,10px -10px,-10px 0',
            boxShadow: '0 24px 64px rgba(0,0,0,.4)',
          }}
        >
          <canvas
            ref={viewRef}
            onClick={onCanvasClick}
            style={{
              display: 'block',
              maxWidth: '100%',
              maxHeight: 'calc(100vh - 120px)',
              objectFit: 'contain',
              cursor: busy ? 'wait' : 'crosshair',
            }}
          />
        </div>
        {(!ready || busy) && (
          <div className="absolute inset-0 grid place-items-center" style={{ pointerEvents: 'none' }}>
            <span className="rounded-pill bg-surface/95 px-t5 py-t3 text-sm font-semibold text-fg-2 shadow-lg">
              {busy ?? '불러오는 중…'}
            </span>
          </div>
        )}
      </div>
      {/* 객체 분리 — 선택 객체 아래에 뜨는 수정/저장 컨트롤 */}
      {extractUi && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ position: 'fixed', left: extractUi.left, top: extractUi.top, transform: 'translateX(-50%)', zIndex: 130 }}
          className="flex items-center gap-t1 rounded-pill bg-fg/90 px-t1 py-t1 shadow-xl backdrop-blur-sm"
        >
          <button
            className={`${btn} ${adjusting ? 'border-accent bg-accent text-on-accent' : 'border-transparent bg-surface text-fg-2 hover:text-accent'}`}
            onClick={() => setAdjusting((v) => !v)}
            disabled={!!busy}
            title="선택 영역을 정밀 조절: 클릭=영역 추가 · Alt(또는 Shift)+클릭=영역 빼기"
          >
            {adjusting ? '✓ 조절 중' : '수정'}
          </button>
          <button
            className={`${btn} border-none bg-accent text-on-accent hover:bg-accent-hover`}
            onClick={() => void onSaveExtract()}
            disabled={!!busy}
            title="객체만 보드에 따로 복사하고, 원본 자리는 배경으로 채웁니다"
          >
            저장
          </button>
        </div>
      )}
      <p onClick={(e) => e.stopPropagation()} className="px-t6 pb-t3 text-center text-xs text-on-dark/70">
        {tool === 'extract'
          ? adjusting
            ? '수정 중: 클릭 = 영역 추가 · Alt(또는 Shift)+클릭 = 영역 빼기 — 정확해지면 저장을 누르세요'
            : '객체 분리: 분리할 객체를 클릭하면 AI가 마스킹합니다 · 아래 수정으로 정밀 조절 · 저장하면 보드에 따로 복사되고 원본은 배경으로 채워져요'
          : tool === 'ai'
            ? 'AI 객체 지우기: 지우려는 객체를 클릭하면 AI가 그 객체만 지우고 자리를 주변 배경으로 자연스럽게 메웁니다 (처음 한 번은 모델 준비로 잠시 걸려요) · ⌘Z 되돌리기'
            : '색 기반: 클릭한 곳과 같은 색 연결 영역을 투명하게 지웁니다 · 허용범위로 덜/더 지우기 · ⌘Z 되돌리기'}
      </p>
      </div>
    </div>
  );
}

/* 인라인 아이콘(툴바 전용) */
function Eraser() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m7 21-4.3-4.3a1 1 0 0 1 0-1.4L13 4.7a2 2 0 0 1 2.8 0l4.5 4.5a2 2 0 0 1 0 2.8L12 21" />
      <path d="M22 21H7" />
      <path d="m5 12 5 5" />
    </svg>
  );
}
function Scissors() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M20 4 8.12 15.88" /><path d="M14.47 14.48 20 20" /><path d="M8.12 8.12 12 12" />
    </svg>
  );
}
function Download() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v12" /><path d="m7 11 5 5 5-5" /><path d="M5 21h14" />
    </svg>
  );
}
function UndoIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 7v6h6" /><path d="M3 13a9 9 0 1 0 3-7.7L3 8" />
    </svg>
  );
}
function SeparateIcon() {
  // 객체를 떼어내는 느낌 — 두 카드가 분리되는 모양.
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="7" width="10" height="13" rx="2" />
      <path d="M16 4h3a2 2 0 0 1 2 2v9" strokeDasharray="3 3" />
    </svg>
  );
}
