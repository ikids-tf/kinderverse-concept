/**
 * aiInpaint.ts — 생성형 AI(나노바나나/Gemini 이미지) 기반 배경 인페인팅.
 * ------------------------------------------------------------------
 * 객체(mask=1) 영역을 'AI가 생성한 배경'으로 채워, 주변 기존 배경과 연속되게 메운다.
 * PatchMatch(텍스처 복제)가 큰 구멍·부드러운 그라데이션에서 객체 잔상(고스트)을 남기는
 * 한계를 보완 — 모델이 맥락을 이해해 그라데이션·물결·격자를 자연스럽게 이어 그린다.
 *
 * 안전·정확:
 *  · 원본을 통째로 모델에 맡기면 객체 밖 픽셀이 미세하게 변할 수 있다 → 결과 이미지에서
 *    **구멍(팽창 마스크) 안쪽만** 원본 위에 합성하고, 경계는 페더 블렌드로 이음새를 숨긴다.
 *    객체 밖은 원본 픽셀 그대로 유지(연속성 보장).
 *  · 🔴 child-photo/child-video 는 호출부에서 외부 전송 금지 가드를 통과한 자산만 사용.
 *    (보드 이미지 카드는 AI 생성 일러스트 — 외부 전송 허용.)
 *  · 키 없음/모킹/실패 시 false 반환 → 호출부가 PatchMatch→push-pull 로 폴백.
 * 비실시간('저장') 경로 전용(수 초 소요).
 */

import { callGateway } from '@/ai/client';

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

/** 박스 블러 N회로 0/1 마스크 → 0..1 페더 알파. 안쪽은 1로 포화, 경계만 램프. */
function feather(mask: Uint8Array, w: number, h: number, passes: number): Float32Array {
  let cur = Float32Array.from(mask, (v) => (v ? 1 : 0));
  for (let it = 0; it < passes; it++) {
    const next = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        s += cur[yy * w + xx]; n++;
      }
      next[y * w + x] = n ? s / n : 0;
    }
    cur = next;
  }
  // 안쪽이 1로 차오르도록 살짝 증폭(경계 ~passes px 밴드만 램프).
  for (let i = 0; i < w * h; i++) cur[i] = Math.min(1, cur[i] * 1.6);
  return cur;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = url;
  });
}

const INPAINT_PROMPT =
  '첫 번째 이미지는 원본이고, 두 번째 이미지는 마스크입니다. 마스크의 흰색 영역에 있던 사물(피사체)을 ' +
  '완전히 제거하고, 그 빈자리를 주변 배경과 100% 연속되도록 자연스럽게 채워 주세요. ' +
  '배경의 색·조명·그라데이션·질감·무늬를 동일하게 이어서 메우고, 새로운 사물·그림자·글자·테두리는 ' +
  '절대 추가하지 마세요. 흰색 영역 밖의 픽셀은 원본 그대로 유지하고, 원본과 동일한 화풍·해상도·구도를 ' +
  '지키세요. 설명 없이 편집된 이미지 한 장만 출력하세요.';

/**
 * mask(1=객체) 영역을 생성형 AI 배경으로 채워 work 캔버스에 합성한다(제자리 수정).
 * 성공 시 true. 키 없음/모킹/실패 시 false(호출부 폴백).
 */
export async function aiInpaintFill(
  work: HTMLCanvasElement,
  mask: Uint8Array,
  w: number,
  h: number,
  opts?: { caption?: string },
): Promise<boolean> {
  if (w !== work.width || h !== work.height) return false;
  const ctx = work.getContext('2d');
  if (!ctx) return false;

  // 채울 영역 = 객체 마스크 + 헤일로(약간 팽창). 너무 작으면 의미 없음.
  const dilPx = Math.max(2, Math.round(Math.max(w, h) * 0.012));
  const dil = grow(mask, w, h, dilPx);
  let holeCount = 0;
  for (let i = 0; i < w * h; i++) if (dil[i]) holeCount++;
  if (holeCount === 0) return false;

  // 모델 입력: 원본 + 마스크(흰=채울 영역). work 는 ≤1600px 이라 그대로 보낸다.
  const baseUrl = work.toDataURL('image/png');
  const maskCv = document.createElement('canvas');
  maskCv.width = w; maskCv.height = h;
  const mctx = maskCv.getContext('2d');
  if (!mctx) return false;
  const mimg = mctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const v = dil[i] ? 255 : 0;
    mimg.data[i * 4] = mimg.data[i * 4 + 1] = mimg.data[i * 4 + 2] = v;
    mimg.data[i * 4 + 3] = 255;
  }
  mctx.putImageData(mimg, 0, 0);
  const maskUrl = maskCv.toDataURL('image/png');

  let res;
  try {
    res = await callGateway({
      task: 'image',
      provider: 'auto',
      messages: [],
      meta: { images: [baseUrl, maskUrl], prompt: INPAINT_PROMPT, caption: opts?.caption ?? '배경 채움' },
    });
  } catch {
    return false;
  }
  if (!res.ok || res.mocked || !res.image) return false;

  // 결과 이미지를 work 크기로(비율 보존 cover) 그려, 구멍(페더) 영역만 원본 위에 합성.
  let out: HTMLImageElement;
  try {
    out = await loadImage(res.image);
  } catch {
    return false;
  }
  const fillCv = document.createElement('canvas');
  fillCv.width = w; fillCv.height = h;
  const fctx = fillCv.getContext('2d');
  if (!fctx) return false;
  const ow = out.naturalWidth || out.width || w, oh = out.naturalHeight || out.height || h;
  const s = Math.max(w / ow, h / oh); // cover: 비율 보존, 빈틈 없음
  const dw = ow * s, dh = oh * s;
  fctx.imageSmoothingEnabled = true; fctx.imageSmoothingQuality = 'high';
  fctx.drawImage(out, (w - dw) / 2, (h - dh) / 2, dw, dh);
  const fill = fctx.getImageData(0, 0, w, h).data;

  const soft = feather(dil, w, h, Math.max(2, Math.round(dilPx * 0.6)));
  const cur = ctx.getImageData(0, 0, w, h);
  const d = cur.data;
  for (let i = 0; i < w * h; i++) {
    const a = soft[i];
    if (a <= 0) continue;
    const di = i * 4;
    d[di] = Math.round(d[di] * (1 - a) + fill[di] * a);
    d[di + 1] = Math.round(d[di + 1] * (1 - a) + fill[di + 1] * a);
    d[di + 2] = Math.round(d[di + 2] * (1 - a) + fill[di + 2] * a);
    d[di + 3] = 255;
  }
  ctx.putImageData(cur, 0, 0);
  return true;
}
