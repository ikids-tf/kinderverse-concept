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

// ── A4 인쇄 헤더 서식(주제·영역·활동명·반·이름) — 화면(worksheet-sheet)과 상수 공유 ──
export const HEADER_LABEL_PCT = 2.5; // 라벨(주제/영역/활동명/반/이름)
export const HEADER_THEME_PCT = 3.7; // 주제 값(강조)
export const HEADER_META_PCT = 3.0; // 영역 값
export const HEADER_TITLE_PCT = 5.0; // 활동명 값(강조)
export const HEADER_FIELD_PCT = 3.0; // 반/이름 기입란
export const HEADER_SIDE_PCT = 6; // 헤더 좌우 여백
export const FOOTER_BAND_H_PCT = 7; // 교사 안내 푸터 높이(시트 높이 대비)
const HEADER_LABEL_COLOR = '#9A8E82'; // 라벨 muted
const HEADER_LINE_COLOR = '#DCD3C7'; // 구분선/기입란 선

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

  // ── 상단 헤더(주제·영역·활동명·반·이름) — 흰 밴드 위 좌측 정렬 A4 서식 ──
  const hpad = Math.round((A4.w * HEADER_SIDE_PCT) / 100);
  const theme = props.theme || props.topic || '';
  const area = props.area || props.type || '';
  const actTitle = props.title || '활동지';

  const labelSize = Math.round((A4.w * HEADER_LABEL_PCT) / 100);
  const themeSize = Math.round((A4.w * HEADER_THEME_PCT) / 100);
  const metaSize = Math.round((A4.w * HEADER_META_PCT) / 100);
  const hTitleSize = Math.round((A4.w * HEADER_TITLE_PCT) / 100);
  const fieldSize = Math.round((A4.w * HEADER_FIELD_PCT) / 100);

  // 행 baseline 위치(그림 위 흰 밴드 안에서 3줄).
  const topPad = Math.round((A4.h * 3.2) / 100);
  const areaX = Math.round(A4.w * 0.62);
  const row1 = topPad + themeSize; // 주제 / 영역
  const row2 = row1 + Math.round(hTitleSize * 0.6) + hTitleSize; // 활동명
  const row3 = row2 + Math.round(fieldSize * 1.1) + fieldSize; // 반 / 이름
  const headerBottom = row3 + Math.round((A4.h * 2) / 100);

  // 흰 밴드로 그림 상단을 덮어 헤더 서식을 또렷하게 + 하단 구분선.
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, A4.w, headerBottom);
  ctx.strokeStyle = HEADER_LINE_COLOR;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(hpad, headerBottom - 2);
  ctx.lineTo(A4.w - hpad, headerBottom - 2);
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  // 라벨+값 한 쌍(공유 baseline, 값이 우측 한계를 넘으면 폰트 축소). 반환: 값 끝 x.
  const drawLV = (label: string, value: string, x: number, by: number, valSize: number, color: string, weight: string, maxRight: number): number => {
    ctx.font = `700 ${labelSize}px ${FONT}`;
    ctx.fillStyle = HEADER_LABEL_COLOR;
    ctx.fillText(label, x, by);
    const lw = ctx.measureText(label).width;
    const vx = x + lw + Math.round(valSize * 0.4);
    let vs = valSize;
    ctx.font = `${weight} ${vs}px ${FONT}`;
    while (vx + ctx.measureText(value).width > maxRight && vs > 18) {
      vs -= 2;
      ctx.font = `${weight} ${vs}px ${FONT}`;
    }
    ctx.fillStyle = color;
    ctx.fillText(value, vx, by);
    return vx + ctx.measureText(value).width;
  };

  // Row1: 주제(강조·코랄) 좌 / 영역 우.  Row2: 활동명(강조).
  drawLV('주제', theme, hpad, row1, themeSize, CORAL, '800', areaX - Math.round(A4.w * 0.02));
  drawLV('영역', area, areaX, row1, metaSize, '#5A4F45', '700', A4.w - hpad);
  drawLV('활동명', actTitle, hpad, row2, hTitleSize, '#2E2A26', '800', A4.w - hpad);

  // Row3: 반 ____  이름 ____ (손으로 적는 기입란).
  const drawField = (label: string, x: number, by: number, lineW: number): number => {
    ctx.font = `700 ${fieldSize}px ${FONT}`;
    ctx.fillStyle = HEADER_LABEL_COLOR;
    ctx.fillText(label, x, by);
    const lw = ctx.measureText(label).width;
    const lineX = x + lw + Math.round(fieldSize * 0.4);
    ctx.strokeStyle = HEADER_LINE_COLOR;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(lineX, by + Math.round(fieldSize * 0.15));
    ctx.lineTo(lineX + lineW, by + Math.round(fieldSize * 0.15));
    ctx.stroke();
    return lineX + lineW;
  };
  const classEnd = drawField('반', hpad, row3, Math.round(A4.w * 0.22));
  drawField('이름', classEnd + Math.round(A4.w * 0.05), row3, Math.round(A4.w * 0.28));

  // ── 활동 안내문(알약 띠) — 헤더 아래, 활동 그림 위 오버레이 ──
  if (props.instruction) {
    const insSize = fitFont(ctx, props.instruction, Math.round((A4.w * SHEET_INSTR_PCT) / 100), A4.w - hpad * 2 - 60, '500');
    ctx.textAlign = 'center';
    ctx.font = `500 ${insSize}px ${FONT}`;
    const tw = ctx.measureText(props.instruction).width;
    const pillW = tw + insSize * 2;
    const pillH = insSize * 2;
    const pillX = (A4.w - pillW) / 2;
    const pillY = headerBottom + Math.round((A4.h * 1.2) / 100);
    ctx.fillStyle = '#FBE6D9';
    roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
    ctx.fill();
    ctx.fillStyle = '#6E6155';
    ctx.textBaseline = 'middle';
    ctx.fillText(props.instruction, A4.w / 2, pillY + pillH / 2);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
  }

  // ── 하단 교사 안내 푸터(objective) — 있으면 얇은 저채도 띠에 한 줄 ──
  if (props.objective && props.objective.trim()) {
    const fH = Math.round((A4.h * FOOTER_BAND_H_PCT) / 100);
    const fy = A4.h - fH;
    ctx.fillStyle = '#FBF7F1';
    ctx.fillRect(0, fy, A4.w, fH);
    ctx.strokeStyle = HEADER_LINE_COLOR;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, fy + 1.5);
    ctx.lineTo(A4.w, fy + 1.5);
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${labelSize}px ${FONT}`;
    ctx.fillStyle = CORAL;
    ctx.fillText('교사 안내', hpad, fy + fH / 2);
    const lblW = ctx.measureText('교사 안내').width;
    const goalX = hpad + lblW + Math.round(labelSize * 0.8);
    const goalSize = fitFont(ctx, props.objective, metaSize, A4.w - goalX - hpad, '500');
    ctx.font = `500 ${goalSize}px ${FONT}`;
    ctx.fillStyle = '#5A4F45';
    ctx.fillText(props.objective, goalX, fy + fH / 2);
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
