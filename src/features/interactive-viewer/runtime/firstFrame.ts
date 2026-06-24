/**
 * 게임 '첫 화면' 썸네일 합성 — 갤러리 카드가 빈 배경 대신 '실제 게임 첫 화면'(배경 + 보이는
 * 캐릭터·아이템)을 보여주도록, 노드를 캔버스에 정적으로 그려 한 장으로 굽는다.
 *
 *  · 배경(canvas.background) = cover 로 깐다.
 *  · 시작 시 보이는 이미지 요소(sceneEnter+hide 의 targets 에 없는 것)를 z 순서로 contain 배치.
 *  · 텍스트·도형(제목·버튼 등)은 폰트/스타일 재현이 어려워 생략 — 핵심 시각(캐릭터·아이템)만.
 *
 * 결과는 docId+요소수+배경 기준으로 메모리 캐시. CORS/디코딩 실패 시 null(호출부는 배경 폴백).
 */
import type { InteractiveNode, ElementNode } from '../schema/interactiveNode';

function srcOf(el: ElementNode): string | null {
  const s = (el as { src?: unknown }).src;
  if (typeof s === 'string') return /^(https?:|data:|blob:)/.test(s) ? s : null;
  if (s && typeof s === 'object' && typeof (s as { src?: unknown }).src === 'string') {
    const v = (s as { src: string }).src;
    return /^(https?:|data:|blob:)/.test(v) ? v : null;
  }
  return null;
}

function loadImg(src: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = src;
  });
}

const cache = new Map<string, string>();

/** 노드 첫 화면을 한 장(jpeg dataURL)으로 굽는다. 실패 시 null. maxW=긴 변(가로) 픽셀. */
export async function renderGameFirstFrame(doc: InteractiveNode, maxW = 560): Promise<string | null> {
  const bg = doc.canvas.background;
  const bgId = bg && typeof bg === 'object' ? (bg as { id?: string }).id ?? '' : String(bg ?? '');
  const key = `${doc.id}:${doc.elements?.length ?? 0}:${doc.behaviors?.length ?? 0}:${bgId}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const cw = doc.canvas.size?.w ?? 0;
  const ch = doc.canvas.size?.h ?? 0;
  if (!cw || !ch) return null;
  const scale = Math.min(1, maxW / cw);
  const W = Math.max(1, Math.round(cw * scale));
  const H = Math.max(1, Math.round(ch * scale));
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');
  if (!ctx) return null;

  // 배경(cover) — 없으면 크림 폴백.
  ctx.fillStyle = '#FBEADF';
  ctx.fillRect(0, 0, W, H);
  const bgSrc = bg && typeof bg === 'object' ? (bg as { src?: string }).src : typeof bg === 'string' && /^(https?:|data:)/.test(bg) ? bg : null;
  if (bgSrc) {
    const bi = await loadImg(bgSrc);
    if (bi && bi.width) {
      const r = Math.max(W / bi.width, H / bi.height);
      const dw = bi.width * r;
      const dh = bi.height * r;
      ctx.drawImage(bi, (W - dw) / 2, (H - dh) / 2, dw, dh);
    }
  }

  // 시작 시 숨는 요소(sceneEnter+hide).
  const hidden = new Set<string>();
  for (const b of doc.behaviors ?? []) {
    if (b.trigger === 'sceneEnter' && b.action === 'hide') {
      const targets = (b as { params?: { targets?: string[] } }).params?.targets ?? [];
      for (const t of targets) hidden.add(t);
    }
  }

  // 보이는 이미지 요소만, z 순서로 contain 배치(전체화면 배경 요소는 cover).
  const vis = (doc.elements ?? [])
    .filter((e) => e.kind === 'image' && !hidden.has(e.id) && (e as { hidden?: boolean }).hidden !== true)
    .slice()
    .sort((a, z) => (a.transform.z ?? 0) - (z.transform.z ?? 0));
  for (const e of vis) {
    const s = srcOf(e);
    if (!s) continue;
    const im = await loadImg(s);
    if (!im || !im.width) continue;
    const t = e.transform;
    const x = t.x * scale;
    const y = t.y * scale;
    const w = t.w * scale;
    const h = t.h * scale;
    const isFull = t.w >= cw * 0.98 && t.h >= ch * 0.98;
    const r = isFull ? Math.max(w / im.width, h / im.height) : Math.min(w / im.width, h / im.height);
    const dw = im.width * r;
    const dh = im.height * r;
    ctx.drawImage(im, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }

  try {
    const out = cv.toDataURL('image/jpeg', 0.82); // 타깃이 tainted면 throw → null 폴백
    cache.set(key, out);
    return out;
  } catch {
    return null;
  }
}
