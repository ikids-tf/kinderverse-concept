/* eslint-disable react-refresh/only-export-components --
   엔진 레지스트리 모듈 — 레이아웃 컴포넌트 + LAYOUT_COMPONENTS(매핑) + LAYOUT_META(피커
   메타)를 한 모듈로 묶는다(엔진 계약). 핫리로드 단위 분리가 목적이 아니라 의도된 동거다. */

/* 레이아웃 컴포넌트 — DeckSpec의 layout enum → React 컴포넌트(불변식 3·4).
   모든 글자는 여기서 contentEditable로 렌더(이미지에 굽지 않음 — 불변식 1).
   삽화/차트는 자리표시(placeholder)만 — AI 삽화·Recharts는 다음 단계에서 채운다.
   색·폰트·간격은 slides.css의 토큰 클래스만 사용(하드코딩 금지).
   디자인: Claude Design 원칙(과감한 위계·비균일 여백·비대칭 편집)을 Milray 토큰으로. */

import type { FC, ReactNode } from 'react';
import {
  type Slide,
  type Layout,
  type TextBlockType,
  isText,
  isBullets,
  isImage,
} from '../schema/deckspec';

/** 편집 핸들러 — 모두 뷰어에서 '최신 상태'에 함수형으로 적용(편집/구조변경 경쟁 방지). */
export interface EditHandlers {
  onText: (blockIndex: number, text: string) => void;
  setBulletItem: (blockIndex: number, itemIndex: number, text: string) => void;
  mutateBullets: (blockIndex: number, fn: (items: string[]) => string[]) => void;
}
export interface LayoutProps {
  slide: Slide;
  editable: boolean;
  h: EditHandlers;
}

/* ── 블록 조회 헬퍼 ───────────────────────────────────────────────────── */
function findText(slide: Slide, type: TextBlockType): { text: string; index: number } | null {
  for (let i = 0; i < slide.blocks.length; i++) {
    const b = slide.blocks[i];
    if (isText(b) && b.type === type) return { text: b.text, index: i };
  }
  return null;
}
function findAllText(slide: Slide, type: TextBlockType): { text: string; index: number }[] {
  const out: { text: string; index: number }[] = [];
  slide.blocks.forEach((b, i) => {
    if (isText(b) && b.type === type) out.push({ text: b.text, index: i });
  });
  return out;
}
function findBullets(slide: Slide): { items: string[]; index: number } | null {
  for (let i = 0; i < slide.blocks.length; i++) {
    const b = slide.blocks[i];
    if (isBullets(b)) return { items: b.items, index: i };
  }
  return null;
}
function findImages(slide: Slide): { index: number }[] {
  const out: { index: number }[] = [];
  slide.blocks.forEach((b, i) => {
    if (isImage(b)) out.push({ index: i });
  });
  return out;
}

/* ── 인라인 편집 가능한 텍스트 — commit on blur(타이핑 중 부모 리렌더 없음 → 캐럿 안정).
   value가 비면 slides.css의 [data-ph]:empty::before로 placeholder 표시. ── */
const Editable: FC<{
  tag?: 'h1' | 'p' | 'div' | 'span';
  value: string;
  editable: boolean;
  placeholder?: string;
  className?: string;
  onCommit: (text: string) => void;
}> = ({ tag: Tag = 'div', value, editable, placeholder, className, onCommit }) => (
  <Tag
    className={className}
    contentEditable={editable}
    suppressContentEditableWarning
    spellCheck={false}
    data-ph={placeholder}
    onBlur={(e) => {
      const t = (e.currentTarget.textContent ?? '').trim();
      if (t !== value) onCommit(t);
    }}
  >
    {value}
  </Tag>
);

/** 상단 오버라인(eyebrow) — 작은 대문자 트래킹 라벨. 전문 덱의 시그니처 디테일.
    accentRole==='gold'면 골드, 아니면 코랄. 없으면 렌더 안 함. (편집은 2단계.) */
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
const TitleLayout: FC<LayoutProps> = ({ slide, editable, h }) => {
  const t = findText(slide, 'title');
  const s = findText(slide, 'subtitle');
  return (
    <div className="sl sl--title">
      <Eyebrow slide={slide} />
      {t && <Editable tag="h1" className="sl-title" value={t.text} editable={editable} placeholder="제목" onCommit={(x) => h.onText(t.index, x)} />}
      {s && <Editable tag="p" className="sl-subtitle" value={s.text} editable={editable} placeholder="부제목" onCommit={(x) => h.onText(s.index, x)} />}
    </div>
  );
};

const SectionDividerLayout: FC<LayoutProps> = ({ slide, editable, h }) => {
  const t = findText(slide, 'title');
  return (
    <div className="sl sl--section">
      <Eyebrow slide={slide} />
      {t && <Editable tag="h1" className="sl-title" value={t.text} editable={editable} placeholder="섹션 제목" onCommit={(x) => h.onText(t.index, x)} />}
    </div>
  );
};

const BigTextLayout: FC<LayoutProps> = ({ slide, editable, h }) => {
  const t = findText(slide, 'title');
  return (
    <div className="sl sl--big">
      <Eyebrow slide={slide} />
      {t && <Editable tag="h1" className="sl-title" value={t.text} editable={editable} placeholder="강조할 한 문장" onCommit={(x) => h.onText(t.index, x)} />}
    </div>
  );
};

/** big-stat — caption=라벨(위) · title=큰 수치 · subtitle=맥락(아래). 수치를 첫눈에. */
const BigStatLayout: FC<LayoutProps> = ({ slide, editable, h }) => {
  const label = findText(slide, 'caption');
  const num = findText(slide, 'title');
  const ctx = findText(slide, 'subtitle');
  return (
    <div className="sl sl--stat">
      <Eyebrow slide={slide} />
      {label && <Editable className="sl-stat-label" value={label.text} editable={editable} placeholder="지표 이름" onCommit={(x) => h.onText(label.index, x)} />}
      {num && <Editable tag="div" className="sl-stat-num" value={num.text} editable={editable} placeholder="00%" onCommit={(x) => h.onText(num.index, x)} />}
      {ctx && <Editable className="sl-stat-ctx" value={ctx.text} editable={editable} placeholder="무엇을 뜻하는지 한 줄" onCommit={(x) => h.onText(ctx.index, x)} />}
    </div>
  );
};

const TwoColumnLayout: FC<LayoutProps> = ({ slide, editable, h }) => {
  const t = findText(slide, 'title');
  const bodies = findAllText(slide, 'body').slice(0, 2);
  return (
    <div className="sl sl--two">
      <Eyebrow slide={slide} />
      {t && <Editable tag="h1" className="sl-title" value={t.text} editable={editable} placeholder="제목" onCommit={(x) => h.onText(t.index, x)} />}
      <div className="sl-cols">
        {bodies.map((b) => (
          <Editable key={b.index} tag="div" className="sl-body" value={b.text} editable={editable} placeholder="내용" onCommit={(x) => h.onText(b.index, x)} />
        ))}
      </div>
    </div>
  );
};

/** image-feature — 텍스트(제목+본문) 좌 ~58% · 이미지 우 ~42%. 비대칭 편집 레이아웃. */
const ImageFeatureLayout: FC<LayoutProps> = ({ slide, editable, h }) => {
  const t = findText(slide, 'title');
  const body = findText(slide, 'body');
  return (
    <div className="sl sl--feature">
      <div className="sl-feature-text">
        <Eyebrow slide={slide} />
        {t && <Editable tag="h1" className="sl-title" value={t.text} editable={editable} placeholder="제목" onCommit={(x) => h.onText(t.index, x)} />}
        {body && <Editable tag="div" className="sl-body" value={body.text} editable={editable} placeholder="핵심 설명" onCommit={(x) => h.onText(body.index, x)} />}
      </div>
      <div className="sl-feature-img">
        <Placeholder icon="🖼️" label="삽화" sub="이미지 연결은 다음 단계" />
      </div>
    </div>
  );
};

const BulletsLayout: FC<LayoutProps> = ({ slide, editable, h }) => {
  const t = findText(slide, 'title');
  const bl = findBullets(slide);
  return (
    <div className="sl sl--bullets">
      <Eyebrow slide={slide} />
      {t && <Editable tag="h1" className="sl-title" value={t.text} editable={editable} placeholder="제목" onCommit={(x) => h.onText(t.index, x)} />}
      {bl && (
        <ul className="sl-bullets">
          {bl.items.map((it, i) => (
            <li key={i}>
              <Editable
                tag="span"
                className="btxt"
                value={it}
                editable={editable}
                placeholder="항목"
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
      )}
    </div>
  );
};

const QuoteLayout: FC<LayoutProps> = ({ slide, editable, h }) => {
  const q = findText(slide, 'body');
  const c = findText(slide, 'caption');
  return (
    <div className="sl sl--quote">
      <Eyebrow slide={slide} />
      {q && <Editable tag="div" className="sl-quote" value={q.text} editable={editable} placeholder="인용·핵심 메시지" onCommit={(x) => h.onText(q.index, x)} />}
      {c && <Editable tag="div" className="sl-caption" value={c.text} editable={editable} placeholder="출처 · 발표자" onCommit={(x) => h.onText(c.index, x)} />}
    </div>
  );
};

const HeroImageLayout: FC<LayoutProps> = ({ slide, editable, h }) => {
  const t = findText(slide, 'title');
  return (
    <div className="sl sl--hero">
      <Eyebrow slide={slide} />
      {t && <Editable tag="h1" className="sl-title" value={t.text} editable={editable} placeholder="제목" onCommit={(x) => h.onText(t.index, x)} />}
      <Placeholder icon="🖼️" label="삽화 자리" sub="AI 삽화 생성은 다음 단계에서 채워져요" />
    </div>
  );
};

const PhotoGridLayout: FC<LayoutProps> = ({ slide, editable, h }) => {
  const imgs = findImages(slide);
  const c = findText(slide, 'caption');
  const cells = imgs.length ? imgs : [{ index: -1 }, { index: -2 }, { index: -3 }, { index: -4 }];
  return (
    <div className="sl sl--grid">
      <Eyebrow slide={slide} />
      <div className="sl-grid">
        {cells.slice(0, 4).map((im) => (
          <Placeholder key={im.index} icon="🖼️" />
        ))}
      </div>
      {c && <Editable tag="div" className="sl-caption" value={c.text} editable={editable} placeholder="사진 설명" onCommit={(x) => h.onText(c.index, x)} />}
    </div>
  );
};

const ChartLayout: FC<LayoutProps> = ({ slide, editable, h }) => {
  const t = findText(slide, 'title');
  const c = findText(slide, 'caption');
  return (
    <div className="sl sl--chart">
      <Eyebrow slide={slide} />
      {t && <Editable tag="h1" className="sl-title" value={t.text} editable={editable} placeholder="제목" onCommit={(x) => h.onText(t.index, x)} />}
      <Placeholder icon="📊" label="차트 자리" sub="Recharts 차트(막대·꺾은선·원·레이더)는 다음 단계에서 연결돼요" />
      {c && <Editable tag="div" className="sl-caption" value={c.text} editable={editable} placeholder="차트 설명" onCommit={(x) => h.onText(c.index, x)} />}
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
