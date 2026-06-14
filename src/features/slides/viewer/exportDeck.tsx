/* 슬라이드 내보내기 — 각 슬라이드를 오프스크린에서 1280×720으로 렌더 → html-to-image로 캡처 →
   jsPDF(PDF) / pptxgenjs(PPTX, 슬라이드당 1장 이미지)로 조립. 차트·이미지·폰트가 화면에 보이는
   그대로 정확히 담긴다. 데이터는 전부 브라우저 안에서 처리(외부 전송 없음 — 프라이버시).
   무거운 라이브러리는 동적 import로 '내보낼 때만' 로드(초기 번들 경량 유지). */

import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { DeckSpec } from '../schema/deckspec';
import { SlideRenderer } from '../engine/SlideRenderer';
import type { EditHandlers } from '../engine/layouts';

const NOOP: EditHandlers = {
  onText: () => {},
  setBulletItem: () => {},
  mutateBullets: () => {},
  select: () => {},
  setBlockStyle: () => {},
  pickImage: () => {},
  onEyebrow: () => {},
};

const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
const safeName = (t: string) => t.trim().replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60) || '슬라이드';

/** 모든 슬라이드를 오프스크린에 렌더 → 각 .slide-canvas를 PNG(data URL)로 캡처. */
async function captureSlides(deck: DeckSpec): Promise<string[]> {
  const { toPng } = await import('html-to-image');
  const host = document.createElement('div');
  host.className = 'slides-root';
  host.setAttribute('data-theme', deck.theme);
  host.style.cssText = 'position:fixed; left:-99999px; top:0; width:1280px; height:auto; display:block; background:#fff; z-index:-1; pointer-events:none;';
  document.body.appendChild(host);
  const root = createRoot(host);
  root.render(
    createElement(
      'div',
      null,
      deck.slides.map((s, i) => createElement(SlideRenderer, { key: i, slide: s, theme: deck.theme, editable: false, h: NOOP, pageNumber: i + 1 })),
    ),
  );
  // 폰트 + 이미지(IDB) + 차트(ResizeObserver) 렌더 대기.
  try {
    await document.fonts.ready;
  } catch {
    /* noop */
  }
  await wait(900);
  const nodes = Array.from(host.querySelectorAll<HTMLElement>('.slide-canvas'));
  const images: string[] = [];
  for (const node of nodes) {
    images.push(await toPng(node, { width: 1280, height: 720, pixelRatio: 2, cacheBust: true }));
  }
  root.unmount();
  host.remove();
  return images;
}

async function toPdf(deck: DeckSpec, images: string[]) {
  const JsPDF = (await import('jspdf')).jsPDF;
  const pdf = new JsPDF({ orientation: 'landscape', unit: 'px', format: [1280, 720], compress: true });
  images.forEach((img, i) => {
    if (i > 0) pdf.addPage([1280, 720], 'landscape');
    pdf.addImage(img, 'PNG', 0, 0, 1280, 720);
  });
  pdf.save(`${safeName(deck.title)}.pdf`);
}

async function toPptx(deck: DeckSpec, images: string[]) {
  const PptxGen = (await import('pptxgenjs')).default;
  const pptx = new PptxGen();
  pptx.defineLayout({ name: 'KV16x9', width: 13.333, height: 7.5 });
  pptx.layout = 'KV16x9';
  images.forEach((img) => {
    pptx.addSlide().addImage({ data: img, x: 0, y: 0, w: 13.333, h: 7.5 });
  });
  await pptx.writeFile({ fileName: `${safeName(deck.title)}.pptx` });
}

export async function exportDeck(deck: DeckSpec, format: 'pdf' | 'pptx') {
  if (!deck.slides.length) return;
  const images = await captureSlides(deck);
  if (format === 'pdf') await toPdf(deck, images);
  else await toPptx(deck, images);
}
