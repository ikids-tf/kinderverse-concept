/* eslint-disable react-refresh/only-export-components --
   엔진 레지스트리 모듈 — 레이아웃 컴포넌트 + LAYOUT_COMPONENTS(매핑) + LAYOUT_META(피커
   메타)를 한 모듈로 묶는다(엔진 계약). 핫리로드 단위 분리가 목적이 아니라 의도된 동거다. */

/* 레이아웃 컴포넌트 — DeckSpec의 layout enum → React 컴포넌트(불변식 3·4).
   모든 글자는 contentEditable로 렌더(이미지에 굽지 않음 — 불변식 1).
   블록 단위 스타일 오버라이드(크기·컬러·정렬·볼드·폰트)는 TextBlockView가 inline로 적용.
   색·폰트·간격 기본은 slides.css의 테마 토큰(--s-*). */

import type { CSSProperties, FC, ReactNode } from 'react';
import {
  type Slide,
  type Layout,
  type TextBlockType,
  type BlockStyle,
  type BlockPos,
  isText,
  isBullets,
  isImage,
} from '../schema/deckspec';
import { SlideImage } from './SlideImage';

/** 자유 배치 — pos가 있으면 흐름에서 빼내 캔버스(%) 절대 좌표로. */
function posStyle(pos?: BlockPos): CSSProperties | undefined {
  return pos ? { position: 'absolute', left: `${pos.xPct}%`, top: `${pos.yPct}%`, width: `${pos.wPct}%` } : undefined;
}

/** 편집 핸들러 — 모두 뷰어에서 '최신 상태'에 함수형으로 적용(편집/구조변경 경쟁 방지). */
export interface EditHandlers {
  onText: (blockIndex: number, text: string) => void;
  setBulletItem: (blockIndex: number, itemIndex: number, text: string) => void;
  mutateBullets: (blockIndex: number, fn: (items: string[]) => string[]) => void;
  /** 블록 선택(플로팅 스타일 툴바 대상). */
  select: (blockIndex: number) => void;
  /** 선택 블록 스타일 오버라이드 패치. */
  setBlockStyle: (blockIndex: number, patch: Partial<BlockStyle>) => void;
  /** 이미지 블록의 이미지 선택(피커 열기). */
  pickImage: (blockIndex: number) => void;
}
export interface LayoutProps {
  slide: Slide;
  editable: boolean;
  h: EditHandlers;
  /** 현재 선택된 블록 인덱스(없으면 null). */
  selected: number | null;
}

/* ── 블록 조회 헬퍼 ───────────────────────────────────────────────────── */
function findText(slide: Slide, type: TextBlockType): { index: number } | null {
  for (let i = 0; i < slide.blocks.length; i++) {
    const b = slide.blocks[i];
    if (isText(b) && b.type === type) return { index: i };
  }
  return null;
}
function findAllText(slide: Slide, type: TextBlockType): { index: number }[] {
  const out: { index: number }[] = [];
  slide.blocks.forEach((b, i) => {
    if (isText(b) && b.type === type) out.push({ index: i });
  });
  return out;
}
function findBullets(slide: Slide): { items: string[]; index: number; style?: BlockStyle; pos?: BlockPos } | null {
  for (let i = 0; i < slide.blocks.length; i++) {
    const b = slide.blocks[i];
    if (isBullets(b)) return { items: b.items, index: i, style: b.style, pos: b.pos };
  }
  return null;
}
function findImages(slide: Slide): { index: number; assetId?: string | null; fit?: 'cover' | 'contain' }[] {
  const out: { index: number; assetId?: string | null; fit?: 'cover' | 'contain' }[] = [];
  slide.blocks.forEach((b, i) => {
    if (isImage(b)) out.push({ index: i, assetId: b.assetId, fit: b.fit });
  });
  return out;
}

/* ── 블록 스타일 오버라이드 → inline CSS. 색은 테마 토큰(--s-*)으로만(임의 hex 금지). ── */
const SERIF_STACK = "'Playfair Display','Noto Serif KR',Georgia,serif";
const SANS_STACK = "'Hanken Grotesk','Pretendard',sans-serif";
const COLOR_VAR: Record<NonNullable<BlockStyle['color']>, string | undefined> = {
  default: undefined,
  secondary: 'var(--s-fg-2)',
  muted: 'var(--s-fg-muted)',
  accent: 'var(--s-accent)',
  gold: 'var(--s-accent-2)',
};
function blockStyleToCss(s?: BlockStyle): CSSProperties {
  if (!s) return {};
  const css: CSSProperties = {};
  if (s.fontPx) css.fontSize = `${s.fontPx}px`;
  if (s.fontFam) css.fontFamily = s.fontFam === 'serif' ? SERIF_STACK : SANS_STACK;
  if (s.bold) css.fontWeight = 700;
  if (s.color && COLOR_VAR[s.color]) css.color = COLOR_VAR[s.color];
  if (s.align) css.textAlign = s.align;
  return css;
}

/* ── 인라인 편집 가능한 텍스트 — commit on blur(타이핑 중 부모 리렌더 없음 → 캐럿 안정).
   onFocus로 블록 선택, inlineStyle로 오버라이드 적용. ── */
const Editable: FC<{
  tag?: 'h1' | 'p' | 'div' | 'span';
  value: string;
  editable: boolean;
  placeholder?: string;
  className?: string;
  inlineStyle?: CSSProperties;
  onSelect?: () => void;
  onCommit: (text: string) => void;
}> = ({ tag: Tag = 'div', value, editable, placeholder, className, inlineStyle, onSelect, onCommit }) => (
  <Tag
    className={className}
    style={inlineStyle}
    contentEditable={editable}
    suppressContentEditableWarning
    spellCheck={false}
    data-ph={placeholder}
    onFocus={onSelect}
    onBlur={(e) => {
      const t = (e.currentTarget.textContent ?? '').trim();
      if (t !== value) onCommit(t);
    }}
  >
    {value}
  </Tag>
);

/** 텍스트 블록 1개 — 스타일 오버라이드 + 선택 윤곽을 자동 배선. */
const TextBlockView: FC<{
  slide: Slide;
  index: number;
  tag?: 'h1' | 'p' | 'div' | 'span';
  className?: string;
  placeholder?: string;
  editable: boolean;
  selected: number | null;
  h: EditHandlers;
}> = ({ slide, index, tag, className, placeholder, editable, selected, h }) => {
  const b = slide.blocks[index];
  const text = isText(b) ? b.text : '';
  const style = isText(b) ? b.style : undefined;
  const pos = isText(b) ? b.pos : undefined;
  const el = (
    <Editable
      tag={tag}
      className={`${className ?? ''}${selected === index ? ' sl-sel' : ''}`}
      value={text}
      editable={editable}
      placeholder={placeholder}
      inlineStyle={blockStyleToCss(style)}
      onSelect={editable ? () => h.select(index) : undefined}
      onCommit={(x) => h.onText(index, x)}
    />
  );
  return pos ? <div className="sl-free" style={posStyle(pos)}>{el}</div> : el;
};

/** 상단 오버라인(eyebrow) — 작은 대문자 트래킹 라벨. accentRole==='gold'면 골드. */
const Eyebrow: FC<{ slide: Slide }> = ({ slide }) =>
  slide.eyebrow ? (
    <span className={`sl-eyebrow${slide.accentRole === 'gold' ? ' is-gold' : ''}`}>{slide.eyebrow}</span>
  ) : null;

/** 자리표시 박스 — 삽화/차트(다음 단계에서 실제 콘텐츠로 교체). */
const Placeholder: FC<{ icon: string; label?: string; sub?: string }> = ({ icon, label, sub }) => (
  <div className="sl-ph">
    <span className="ph-ic" aria-hidden>{icon}</span>
    {label && <span className="ph-label">{label}</span>}
    {sub && <span className="ph-sub">{sub}</span>}
  </div>
);

/* ── 레이아웃들 ───────────────────────────────────────────────────────── */
const TitleLayout: FC<LayoutProps> = ({ slide, editable, h, selected }) => {
  const t = findText(slide, 'title');
  const s = findText(slide, 'subtitle');
  return (
    <div className="sl sl--title">
      <Eyebrow slide={slide} />
      {t && <TextBlockView slide={slide} index={t.index} tag="h1" className="sl-title" placeholder="제목" editable={editable} selected={selected} h={h} />}
      {s && <TextBlockView slide={slide} index={s.index} tag="p" className="sl-subtitle" placeholder="부제목" editable={editable} selected={selected} h={h} />}
    </div>
  );
};

const SectionDividerLayout: FC<LayoutProps> = ({ slide, editable, h, selected }) => {
  const t = findText(slide, 'title');
  return (
    <div className="sl sl--section">
      <Eyebrow slide={slide} />
      {t && <TextBlockView slide={slide} index={t.index} tag="h1" className="sl-title" placeholder="섹션 제목" editable={editable} selected={selected} h={h} />}
    </div>
  );
};

const BigTextLayout: FC<LayoutProps> = ({ slide, editable, h, selected }) => {
  const t = findText(slide, 'title');
  return (
    <div className="sl sl--big">
      <Eyebrow slide={slide} />
      {t && <TextBlockView slide={slide} index={t.index} tag="h1" className="sl-title" placeholder="강조할 한 문장" editable={editable} selected={selected} h={h} />}
    </div>
  );
};

const BigStatLayout: FC<LayoutProps> = ({ slide, editable, h, selected }) => {
  const label = findText(slide, 'caption');
  const num = findText(slide, 'title');
  const ctx = findText(slide, 'subtitle');
  return (
    <div className="sl sl--stat">
      <Eyebrow slide={slide} />
      {label && <TextBlockView slide={slide} index={label.index} className="sl-stat-label" placeholder="지표 이름" editable={editable} selected={selected} h={h} />}
      {num && <TextBlockView slide={slide} index={num.index} tag="div" className="sl-stat-num" placeholder="00%" editable={editable} selected={selected} h={h} />}
      {ctx && <TextBlockView slide={slide} index={ctx.index} className="sl-stat-ctx" placeholder="무엇을 뜻하는지 한 줄" editable={editable} selected={selected} h={h} />}
    </div>
  );
};

const TwoColumnLayout: FC<LayoutProps> = ({ slide, editable, h, selected }) => {
  const t = findText(slide, 'title');
  const bodies = findAllText(slide, 'body').slice(0, 2);
  return (
    <div className="sl sl--two">
      <Eyebrow slide={slide} />
      {t && <TextBlockView slide={slide} index={t.index} tag="h1" className="sl-title" placeholder="제목" editable={editable} selected={selected} h={h} />}
      <div className="sl-cols">
        {bodies.map((b) => (
          <TextBlockView key={b.index} slide={slide} index={b.index} tag="div" className="sl-body" placeholder="내용" editable={editable} selected={selected} h={h} />
        ))}
      </div>
    </div>
  );
};

const ImageFeatureLayout: FC<LayoutProps> = ({ slide, editable, h, selected }) => {
  const t = findText(slide, 'title');
  const body = findText(slide, 'body');
  return (
    <div className="sl sl--feature">
      <div className="sl-feature-text">
        <Eyebrow slide={slide} />
        {t && <TextBlockView slide={slide} index={t.index} tag="h1" className="sl-title" placeholder="제목" editable={editable} selected={selected} h={h} />}
        {body && <TextBlockView slide={slide} index={body.index} tag="div" className="sl-body" placeholder="핵심 설명" editable={editable} selected={selected} h={h} />}
      </div>
      <div className="sl-feature-img">
        {(() => {
          const img = findImages(slide)[0];
          return img ? (
            <SlideImage assetId={img.assetId} fit={img.fit} editable={editable} onPick={() => h.pickImage(img.index)} />
          ) : (
            <Placeholder icon="🖼️" label="삽화" />
          );
        })()}
      </div>
    </div>
  );
};

const BulletsLayout: FC<LayoutProps> = ({ slide, editable, h, selected }) => {
  const t = findText(slide, 'title');
  const bl = findBullets(slide);
  const bulletCss = blockStyleToCss(bl?.style);
  return (
    <div className="sl sl--bullets">
      <Eyebrow slide={slide} />
      {t && <TextBlockView slide={slide} index={t.index} tag="h1" className="sl-title" placeholder="제목" editable={editable} selected={selected} h={h} />}
      {bl && (
        <div className={bl.pos ? 'sl-free' : undefined} style={posStyle(bl.pos)}>
        <ul className={`sl-bullets${selected === bl.index ? ' sl-sel' : ''}`}>
          {bl.items.map((it, i) => (
            <li key={i}>
              <Editable
                tag="span"
                className="btxt"
                value={it}
                editable={editable}
                placeholder="항목"
                inlineStyle={bulletCss}
                onSelect={editable ? () => h.select(bl.index) : undefined}
                onCommit={(x) => h.setBulletItem(bl.index, i, x)}
              />
              {editable && bl.items.length > 1 && (
                <button
                  type="button"
                  className="bullet-del"
                  title="항목 삭제"
                  onClick={() => h.mutateBullets(bl.index, (items) => items.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              )}
            </li>
          ))}
          {editable && bl.items.length < 7 && (
            <button
              type="button"
              className="bullet-add"
              onClick={() => h.mutateBullets(bl.index, (items) => [...items, ''])}
            >
              + 항목 추가
            </button>
          )}
        </ul>
        </div>
      )}
    </div>
  );
};

const QuoteLayout: FC<LayoutProps> = ({ slide, editable, h, selected }) => {
  const q = findText(slide, 'body');
  const c = findText(slide, 'caption');
  return (
    <div className="sl sl--quote">
      <Eyebrow slide={slide} />
      {q && <TextBlockView slide={slide} index={q.index} tag="div" className="sl-quote" placeholder="인용·핵심 메시지" editable={editable} selected={selected} h={h} />}
      {c && <TextBlockView slide={slide} index={c.index} tag="div" className="sl-caption" placeholder="출처 · 발표자" editable={editable} selected={selected} h={h} />}
    </div>
  );
};

const HeroImageLayout: FC<LayoutProps> = ({ slide, editable, h, selected }) => {
  const t = findText(slide, 'title');
  const img = findImages(slide)[0];
  return (
    <div className="sl sl--hero">
      <Eyebrow slide={slide} />
      {t && <TextBlockView slide={slide} index={t.index} tag="h1" className="sl-title" placeholder="제목" editable={editable} selected={selected} h={h} />}
      {img ? (
        <SlideImage assetId={img.assetId} fit={img.fit} editable={editable} onPick={() => h.pickImage(img.index)} />
      ) : (
        <Placeholder icon="🖼️" label="삽화" />
      )}
    </div>
  );
};

const PhotoGridLayout: FC<LayoutProps> = ({ slide, editable, h, selected }) => {
  const imgs = findImages(slide).slice(0, 4);
  const c = findText(slide, 'caption');
  return (
    <div className="sl sl--grid">
      <Eyebrow slide={slide} />
      <div className="sl-grid">
        {imgs.length > 0
          ? imgs.map((im) => (
              <SlideImage key={im.index} assetId={im.assetId} fit={im.fit} editable={editable} onPick={() => h.pickImage(im.index)} />
            ))
          : [0, 1, 2, 3].map((i) => <Placeholder key={i} icon="🖼️" />)}
      </div>
      {c && <TextBlockView slide={slide} index={c.index} tag="div" className="sl-caption" placeholder="사진 설명" editable={editable} selected={selected} h={h} />}
    </div>
  );
};

const ChartLayout: FC<LayoutProps> = ({ slide, editable, h, selected }) => {
  const t = findText(slide, 'title');
  const c = findText(slide, 'caption');
  return (
    <div className="sl sl--chart">
      <Eyebrow slide={slide} />
      {t && <TextBlockView slide={slide} index={t.index} tag="h1" className="sl-title" placeholder="제목" editable={editable} selected={selected} h={h} />}
      <Placeholder icon="📊" label="차트 자리" sub="Recharts 차트(막대·꺾은선·원·레이더)는 다음 단계에서 연결돼요" />
      {c && <TextBlockView slide={slide} index={c.index} tag="div" className="sl-caption" placeholder="차트 설명" editable={editable} selected={selected} h={h} />}
    </div>
  );
};

export const LAYOUT_COMPONENTS: Record<Layout, FC<LayoutProps>> = {
  title: TitleLayout,
  'section-divider': SectionDividerLayout,
  'big-text': BigTextLayout,
  'big-stat': BigStatLayout,
  'two-column': TwoColumnLayout,
  'image-feature': ImageFeatureLayout,
  bullets: BulletsLayout,
  'hero-image': HeroImageLayout,
  'photo-grid': PhotoGridLayout,
  quote: QuoteLayout,
  chart: ChartLayout,
};

/* ── 레이아웃 선택 메뉴용 메타(라벨 + 16:9 미니 와이어프레임) ───────────────── */
const fr = <rect x="1" y="1" width="62" height="34" rx="3" fill="none" stroke="var(--border)" />;
const bar = (x: number, y: number, w: number, h: number, c = 'var(--fg-muted)') => (
  <rect x={x} y={y} width={w} height={h} rx="1.5" fill={c} />
);
const mini = (children: ReactNode): ReactNode => (
  <svg viewBox="0 0 64 36" aria-hidden>
    {fr}
    {children}
  </svg>
);

export const LAYOUT_META: { id: Layout; label: string; icon: ReactNode }[] = [
  { id: 'title', label: '표지', icon: mini(<>{bar(10, 10, 8, 2, 'var(--accent)')}{bar(10, 15, 30, 6, 'var(--fg-2)')}{bar(10, 25, 20, 3)}</>) },
  { id: 'section-divider', label: '섹션', icon: mini(<>{bar(9, 8, 9, 2, 'var(--accent)')}{bar(9, 14, 36, 9, 'var(--fg-2)')}{bar(50, 26, 6, 6, 'var(--surface-3)')}</>) },
  { id: 'big-text', label: '강조', icon: mini(<>{bar(10, 13, 44, 10, 'var(--fg-2)')}</>) },
  { id: 'big-stat', label: '지표', icon: mini(<>{bar(24, 7, 16, 2.5)}{bar(17, 12, 30, 13, 'var(--accent)')}{bar(21, 28, 22, 2.5)}</>) },
  { id: 'two-column', label: '두 단', icon: mini(<>{bar(10, 8, 24, 4, 'var(--accent)')}{bar(10, 16, 22, 13)}{bar(38, 16, 16, 13)}</>) },
  { id: 'image-feature', label: '이미지', icon: mini(<>{bar(8, 9, 20, 3, 'var(--accent)')}{bar(8, 15, 22, 2.5)}{bar(8, 20, 17, 2.5)}{bar(36, 8, 20, 20, 'var(--surface-3)')}</>) },
  { id: 'bullets', label: '요점', icon: mini(<>{bar(10, 8, 24, 4, 'var(--accent)')}{bar(12, 17, 28, 2.5)}{bar(12, 23, 28, 2.5)}{bar(12, 29, 20, 2.5)}</>) },
  { id: 'hero-image', label: '삽화', icon: mini(<>{bar(10, 8, 24, 4, 'var(--accent)')}{bar(10, 15, 44, 14, 'var(--surface-3)')}</>) },
  { id: 'photo-grid', label: '사진', icon: mini(<>{bar(10, 8, 20, 9, 'var(--surface-3)')}{bar(34, 8, 20, 9, 'var(--surface-3)')}{bar(10, 20, 20, 9, 'var(--surface-3)')}{bar(34, 20, 20, 9, 'var(--surface-3)')}</>) },
  { id: 'quote', label: '인용', icon: mini(<>{bar(12, 11, 40, 4)}{bar(12, 19, 30, 4)}{bar(12, 28, 14, 2.5, 'var(--accent)')}</>) },
  { id: 'chart', label: '차트', icon: mini(<>{bar(12, 22, 6, 7, 'var(--accent)')}{bar(22, 16, 6, 13, 'var(--fg-muted)')}{bar(32, 12, 6, 17, 'var(--accent)')}{bar(42, 19, 6, 10, 'var(--fg-muted)')}</>) },
];
