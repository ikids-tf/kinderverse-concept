/* 스타일 버튼 행(StyleRow) — 선택 블록의 크기·폰트·볼드·정렬·컬러 버튼.
   위치/추종은 BlockEditorOverlay가 책임지고, 여기는 버튼만 렌더(프레젠테이션).
   색은 현재 테마의 --s-* 토큰만(임의 hex 금지). 버튼 mousedown은 호출측(.be-toolbar)에서
   preventDefault로 contentEditable 포커스를 유지한다. */

import { type BlockStyle } from '../schema/deckspec';

const ALIGN_ICON: Record<'left' | 'center' | 'right', string> = {
  left: 'M4 6h16M4 12h10M4 18h13',
  center: 'M4 6h16M7 12h10M5 18h14',
  right: 'M4 6h16M10 12h10M7 18h13',
};

function selEl(): HTMLElement | null {
  return document.querySelector('.stage .sl-sel') as HTMLElement | null;
}
/** 폰트 크기를 읽을 실제 텍스트 요소(자유배치면 래퍼 안의 contentEditable). */
function textEl(): HTMLElement | null {
  const el = selEl();
  if (!el) return null;
  if (el.isContentEditable) return el;
  return (el.querySelector('[contenteditable]') as HTMLElement | null) ?? el;
}

export function StyleRow({ style, onStyle }: { style: BlockStyle | undefined; onStyle: (patch: Partial<BlockStyle>) => void }) {
  const curSize = (): number => {
    if (style?.fontPx) return style.fontPx;
    const t = textEl();
    return t ? Math.round(parseFloat(getComputedStyle(t).fontSize)) : 40;
  };
  const stepSize = (delta: number) => onStyle({ fontPx: Math.max(12, Math.min(280, curSize() + delta)) });

  const themeColor = (v: string): string => {
    const root = document.querySelector('.slides-root');
    return (root ? getComputedStyle(root).getPropertyValue(v).trim() : '') || '#888';
  };
  const COLORS: { key: NonNullable<BlockStyle['color']>; varName: string }[] = [
    { key: 'default', varName: '--s-fg' },
    { key: 'secondary', varName: '--s-fg-2' },
    { key: 'muted', varName: '--s-fg-muted' },
    { key: 'accent', varName: '--s-accent' },
    { key: 'gold', varName: '--s-accent-2' },
  ];
  const curColor = style?.color ?? 'default';
  const curAlign = style?.align ?? 'left';

  return (
    <>
      <button type="button" className={`bt-btn${style?.fontFam === 'serif' ? ' on' : ''}`} title="세리프" onClick={() => onStyle({ fontFam: 'serif' })} style={{ fontFamily: "'Playfair Display','Noto Serif KR',serif" }}>Aa</button>
      <button type="button" className={`bt-btn${style?.fontFam === 'sans' ? ' on' : ''}`} title="산세리프" onClick={() => onStyle({ fontFam: 'sans' })} style={{ fontFamily: "'Hanken Grotesk','Pretendard',sans-serif" }}>Aa</button>
      <span className="bt-sep" />
      <button type="button" className="bt-btn" title="작게" onClick={() => stepSize(-8)}><span style={{ fontSize: 12 }}>A</span>−</button>
      <button type="button" className="bt-btn" title="크게" onClick={() => stepSize(8)}><span style={{ fontSize: 16 }}>A</span>+</button>
      <span className="bt-sep" />
      <button type="button" className={`bt-btn${style?.bold ? ' on' : ''}`} title="굵게" onClick={() => onStyle({ bold: !style?.bold })} style={{ fontWeight: 800 }}>B</button>
      <span className="bt-sep" />
      {(['left', 'center', 'right'] as const).map((a) => (
        <button key={a} type="button" className={`bt-btn${curAlign === a ? ' on' : ''}`} title={`${a} 정렬`} onClick={() => onStyle({ align: a })}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d={ALIGN_ICON[a]} /></svg>
        </button>
      ))}
      <span className="bt-sep" />
      {COLORS.map((c) => (
        <button
          key={c.key}
          type="button"
          className={`bt-swatch${curColor === c.key ? ' on' : ''}`}
          title={`색: ${c.key}`}
          onClick={() => onStyle({ color: c.key })}
          style={{ background: themeColor(c.varName) }}
        />
      ))}
    </>
  );
}
