/* 활동지 A4 PNG 합성(다운로드·인쇄) — 제목·안내 텍스트 레이어와 활동 그림을
   정확한 A4 비율(210:297)로 캔버스에 합성한다. 화면 시트(worksheet-sheet.tsx)와
   같은 "시트 너비 비율" 상수를 공유해 화면과 인쇄물이 일치한다. */

import type { WorksheetCardProps, WorksheetLayer } from './contracts';

// A4 세로 @ ~150dpi (210×297mm). 다운로드/인쇄 합성 캔버스 크기.
const A4 = { w: 1240, h: 1754 };
const FONT = 'Pretendard, "Noto Sans KR", "Apple SD Gothic Neo", sans-serif';
const CORAL = '#F2733E';

// 제목·안내 글자 크기를 "시트 너비" 비율로 정의 → 화면(cqw)과 다운로드(캔버스)를 일치.
export const SHEET_TITLE_PCT = 5.6; // 시트 너비의 5.6%
export const SHEET_INSTR_PCT = 2.9; // 시트 너비의 2.9%
const SHEET_TOP_PCT = 3.5; // 상단 여백(시트 높이 대비 — 화면 pt와 맞춤)
const SHEET_SIDE_PCT = 7; // 좌우 여백(시트 너비 대비)

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** 너비에 맞게 폰트 크기를 줄여 한 줄에 들어오게 한다. */
function fitFont(ctx: CanvasRenderingContext2D, text: string, start: number, max: number, weight: string): number {
  let s = start;
  ctx.font = `${weight} ${s}px ${FONT}`;
  while (ctx.measureText(text).width > max && s > 20) {
    s -= 2;
    ctx.font = `${weight} ${s}px ${FONT}`;
  }
  return s;
}

/** 제목+안내 텍스트 레이어와 활동 그림을 정확한 A4 비율로 합성 → PNG dataURI.
   layers가 주어지면 원본 그림 대신 흰 바탕 위에 분리된 조각들을 현재 위치/크기로 합성. */
export async function composeWorksheetA4(
  props: WorksheetCardProps,
  layers?: WorksheetLayer[],
): Promise<string | null> {
  const canvas = document.createElement('canvas');
  canvas.width = A4.w;
  canvas.height = A4.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, A4.w, A4.h);
  try {
    await (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready;
  } catch {
    /* 폰트 준비 실패해도 시스템 폰트로 합성 진행 */
  }

  if (layers && layers.length) {
    // 레이어 분리 모드 — 흰 바탕 위에 각 조각을 시트대비 %(x/y/w/h·scale)로 배치.
    for (const l of layers) {
      try {
        const piece = await loadImage(l.src);
        ctx.drawImage(
          piece,
          (l.x / 100) * A4.w,
          (l.y / 100) * A4.h,
          (l.w / 100) * A4.w * l.scale,
          (l.h / 100) * A4.h * l.scale,
        );
      } catch {
        /* 조각 로드 실패 시 건너뜀 */
      }
    }
  } else if (props.image_url) {
    // 활동 그림 — 지면을 가득 채우도록(cover) 배경에 배치(상단 가운데는 비워 생성됨).
    try {
      const img = await loadImage(props.image_url);
      const scale = Math.max(A4.w / img.width, A4.h / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      ctx.drawImage(img, (A4.w - dw) / 2, (A4.h - dh) / 2, dw, dh);
    } catch {
      /* 그림 로드 실패 시 텍스트만 합성 */
    }
  }

  // 글자 크기·여백을 화면(cqw)과 동일한 "시트 너비 비율"로 계산 → 다운로드 크기 일치.
  const sidePad = Math.round((A4.w * SHEET_SIDE_PCT) / 100);
  const topPad = Math.round((A4.h * SHEET_TOP_PCT) / 100);
  ctx.textAlign = 'center';

  // 제목 — 그림 상단(빈 자리)에 흰 후광으로 또렷하게 오버레이.
  const title = props.title || '활동지';
  const titleSize = fitFont(ctx, title, Math.round((A4.w * SHEET_TITLE_PCT) / 100), A4.w - sidePad * 2, '800');
  ctx.font = `800 ${titleSize}px ${FONT}`;
  ctx.textBaseline = 'alphabetic';
  const titleY = topPad + titleSize;
  ctx.save();
  ctx.shadowColor = 'rgba(255,255,255,0.95)';
  ctx.shadowBlur = 16;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(title, A4.w / 2, titleY); // 후광 두 겹
  ctx.fillText(title, A4.w / 2, titleY);
  ctx.restore();
  ctx.fillStyle = CORAL;
  ctx.fillText(title, A4.w / 2, titleY);
  const y = titleY + Math.round((A4.w * 1) / 100); // 화면 mt-[1cqw]와 동일 간격

  // 안내문(알약 띠) — 그림 위 오버레이.
  if (props.instruction) {
    const insSize = fitFont(ctx, props.instruction, Math.round((A4.w * SHEET_INSTR_PCT) / 100), A4.w - sidePad * 2 - 60, '500');
    ctx.font = `500 ${insSize}px ${FONT}`;
    const tw = ctx.measureText(props.instruction).width;
    const pillW = tw + insSize * 2;
    const pillH = insSize + insSize;
    const pillX = (A4.w - pillW) / 2;
    ctx.fillStyle = '#FBE6D9';
    roundRect(ctx, pillX, y, pillW, pillH, pillH / 2);
    ctx.fill();
    ctx.fillStyle = '#6E6155';
    ctx.textBaseline = 'middle';
    ctx.fillText(props.instruction, A4.w / 2, y + pillH / 2);
    ctx.textBaseline = 'alphabetic';
  }

  return canvas.toDataURL('image/png');
}

/** 합성한 A4 PNG를 내려받는다. */
export async function downloadWorksheetA4(props: WorksheetCardProps, layers?: WorksheetLayer[]): Promise<void> {
  const url = await composeWorksheetA4(props, layers);
  if (!url) return;
  const a = document.createElement('a');
  a.href = url;
  a.download = `${props.title || '활동지'}.png`;
  a.click();
}

/** 합성한 A4 PNG를 인쇄 대화상자로 연다(@page A4). */
export async function printWorksheetA4(props: WorksheetCardProps, layers?: WorksheetLayer[]): Promise<void> {
  const url = await composeWorksheetA4(props, layers);
  if (!url) return;
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${props.title || '활동지'}</title>` +
      '<style>@page{size:A4;margin:0}html,body{margin:0;padding:0}img{width:100%;height:auto;display:block}</style>' +
      `</head><body><img src="${url}" onload="setTimeout(function(){window.focus();window.print();},120)"/></body></html>`,
  );
  w.document.close();
}
