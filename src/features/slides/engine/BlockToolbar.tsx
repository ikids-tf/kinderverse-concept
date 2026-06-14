/* 블록 스타일 툴바 — 선택된 텍스트/불릿 블록 위에 떠서 크기·폰트·볼드·정렬·컬러를 바꾼다.
   보드의 TextStyleMenu(NodeView) 패턴을 슬라이드 iframe 안에 이식: 마운트 시 선택 요소의
   rect로 위치를 한 번 고정(frozen), 버튼 mousedown은 preventDefault로 contentEditable
   포커스/선택을 유지한다. 색은 현재 테마의 --s-* 토큰만(임의 hex 금지). */

import { useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { type Block, type BlockStyle, isText, isBullets } from '../schema/deckspec';

const ALIGN_ICON: Record<'left' | 'center' | 'right', string> = {
  left: 'M4 6h16M4 12h10M4 18h13',
  center: 'M4 6h16M7 12h10M5 18h14',
  right: 'M4 6h16M10 12h10M7 18h13',
};

function selEl(): HTMLElement | null {
  return document.querySelector('.stage .sl-sel') as HTMLElement | null;
}

export function BlockToolbar({ block, onStyle }: { block: Block; onStyle: (patch: Partial<BlockStyle>) => void }) {
  const style: BlockStyle | undefined = isText(block) || isBullets(block) ? block.style : undefined;
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // 마운트 시 선택 블록 위에 위치 고정(편집으로 크기가 변해도 안 따라 움직임).
  useLayoutEffect(() => {
    const el = selEl();
    const tb = ref.current;
    if (!el || !tb) return;
    const r = el.getBoundingClientRect();
    const tw = tb.offsetWidth || 340;
    const th = tb.offsetHeight || 40;
    let left = r.left + r.width / 2 - tw / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tw - 8));
    let top = r.top - th - 10;
    if (top < 8) top = Math.min(r.bottom + 10, window.innerHeight - th - 8); // 위가 좁으면 아래로
    setPos({ left, top });
  }, []);

  const curSize = (): number => {
    if (style?.fontPx) return style.fontPx;
    const el = selEl();
    return el ? Math.round(parseFloat(getComputedStyle(el).fontSize)) : 40;
  };
  const stepSize = (delta: number) => onStyle({ fontPx: Math.max(12, Math.min(280, curSize() + delta)) });

  // 버튼 클릭이 contentEditable 포커스를 빼앗지 않게(선택 유지).
  const keepFocus = (e: ReactMouseEvent) => e.preventDefault();

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
    <div
      ref={ref}
      className="block-toolbar"
      style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? 'visible' : 'hidden' }}
      onMouseDown={keepFocus}
    >
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
    </div>
  );
}
