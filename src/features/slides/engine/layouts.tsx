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
  type Theme,
  type TextBlockType,
  type BlockStyle,
  type BlockPos,
  type ChartBlock,
  isText,
  isBullets,
  isImage,
  isChart,
} from '../schema/deckspec';
import { SlideImage } from './SlideImage';
import { SlideChart } from './SlideChart';
import { InteractiveSlideLayout } from './InteractiveSlideLayout';

/** 자유 배치 — pos가 있으면 흐름에서 빼내 캔버스(%) 절대 좌표로(+높이·회전). */
function posStyle(pos?: BlockPos): CSSProperties | undefined {
  if (!pos) return undefined;
  const css: CSSProperties = {
    position: 'absolute',
    left: `${pos.xPct}%`,
    top: `${pos.yPct}%`,
    width: `${pos.wPct}%`,
  };
  if (pos.hPct != null) css.height = `${pos.hPct}%`;
  if (pos.rot) {
    css.transform = `rotate(${pos.rot}deg)`;
    css.transformOrigin = 'center center';
  }
  return css;
}

/** 현재 선택 — 다중 블록(Set) + eyebrow 단일. 빈 Set + eyebrow=false면 선택 없음. */
export interface Selection {
  blocks: ReadonlySet<number>;
  eyebrow: boolean;
}
export const NO_SELECTION: Selection = { blocks: new Set(), eyebrow: false };

/** 편집 핸들러 — 모두 뷰어에서 '최신 상태'에 함수형으로 적용(편집/구조변경 경쟁 방지). */
export interface EditHandlers {
  onText: (blockIndex: number, text: string) => void;
  setBulletItem: (blockIndex: number, itemIndex: number, text: string) => void;
  mutateBullets: (blockIndex: number, fn: (items: string[]) => string[]) => void;
  /** 블록 선택. 'eyebrow'는 슬라이드 오버라인 라벨. additive(Shift)=토글 다중선택. */
  select: (target: number | 'eyebrow', additive?: boolean) => void;
  /** 선택 블록 스타일 오버라이드 패치. */
  setBlockStyle: (blockIndex: number, patch: Partial<BlockStyle>) => void;
  /** 이미지 블록의 이미지 선택(피커 열기). */
  pickImage: (blockIndex: number) => void;
  /** eyebrow(오버라인 라벨) 텍스트 편집 → slide.eyebrow. */
  onEyebrow: (text: string) => void;
}
export interface LayoutProps {
  slide: Slide;
  /** 현재 덱 테마 — 차트 등 토큰을 JS로 읽어야 하는 컴포넌트에 전달(SVG는 var() 불가). */
  theme: Theme;
  editable: boolean;
  h: EditHandlers;
  /** 현재 선택(다중 블록 + eyebrow). */
  selected: Selection;
  /** 썸네일 렌더(인터렉티브 슬라이드를 정적으로). 대부분 레이아웃은 무시. */
  thumbnail?: boolean;
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
/** (a타입, b타입) 텍스트 블록을 '인접(등장 순서)' 기준으로 짝지어 반환 — cards/steps/stat-row 등
    '쌍' 레이아웃용. a 뒤에 처음 오는 b가 그 쌍이다. 타입별 위치 zip은 쌍 한쪽이 삭제됐을 때
    이후 쌍 전체가 엇짝으로 렌더되므로 쓰지 않는다(짝 잃은 블록은 렌더에서 빠질 뿐 섞이진 않음). */
function zipText(slide: Slide, a: TextBlockType, b: TextBlockType): { a: number; b: number }[] {
  const out: { a: number; b: number }[] = [];
  let pending: number | null = null;
  slide.blocks.forEach((blk, i) => {
    if (!isText(blk)) return;
    if (blk.type === a) pending = i;
    else if (blk.type === b && pending != null) {
      out.push({ a: pending, b: i });
      pending = null;
    }
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
interface ImgInfo {
  index: number;
  assetId?: string | null;
  fit?: 'cover' | 'contain';
  pos?: BlockPos;
}
function findImages(slide: Slide): ImgInfo[] {
  const out: ImgInfo[] = [];
  slide.blocks.forEach((b, i) => {
    if (isImage(b)) out.push({ index: i, assetId: b.assetId, fit: b.fit, pos: b.pos });
  });
  return out;
}
function findChart(slide: Slide): { block: ChartBlock; index: number } | null {
  for (let i = 0; i < slide.blocks.length; i++) {
    const b = slide.blocks[i];
    if (isChart(b)) return { block: b, index: i };
  }
  return null;
}

/** 이미지 블록 렌더 — pos 있으면 자유배치(절대 박스), 없으면 흐름(슬롯 채움) + data-bi(측정용). */
const FreeImage: FC<{ info: ImgInfo; editable: boolean; onPick: () => void }> = ({ info, editable, onPick }) =>
  info.pos ? (
    <div className="sl-free sl-free-media" data-bi={info.index} style={posStyle(info.pos)}>
      <SlideImage assetId={info.assetId} fit={info.fit} editable={editable} onPick={onPick} />
    </div>
  ) : (
    <SlideImage assetId={info.assetId} fit={info.fit} editable={editable} dataBi={info.index} onPick={onPick} />
  );

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
  /** 흐름 모드에서 이 요소가 곧 블록 박스 — 측정/선택용 data-bi(블록 인덱스 또는 'eyebrow'). */
  dataBi?: number | string;
  /** additive=Shift(다중선택 토글). Shift면 caret 포커스를 막아 텍스트 편집 대신 선택만. */
  onSelect?: (additive: boolean) => void;
  onCommit: (text: string) => void;
}> = ({ tag: Tag = 'div', value, editable, placeholder, className, inlineStyle, dataBi, onSelect, onCommit }) => (
  <Tag
    className={className}
    style={inlineStyle}
    contentEditable={editable}
    suppressContentEditableWarning
    spellCheck={false}
    data-ph={placeholder}
    data-bi={dataBi}
    onPointerDown={
      onSelect
        ? (e) => {
            onSelect(e.shiftKey);
            // Shift=다중선택: caret 포커스를 막고 기존 편집을 블러(객체 모드 → Delete 등 가능).
            if (e.shiftKey) { e.preventDefault(); (document.activeElement as HTMLElement | null)?.blur(); }
          }
        : undefined
    }
    onFocus={onSelect ? () => onSelect(false) : undefined}
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
  selected: Selection;
  h: EditHandlers;
}> = ({ slide, index, tag, className, placeholder, editable, selected, h }) => {
  const b = slide.blocks[index];
  const text = isText(b) ? b.text : '';
  const style = isText(b) ? b.style : undefined;
  const pos = isText(b) ? b.pos : undefined;
  const isSel = selected.blocks.has(index);
  const el = (
    <Editable
      tag={tag}
      className={`${className ?? ''}${!pos && isSel ? ' sl-sel' : ''}`}
      dataBi={pos ? undefined : index}
      value={text}
      editable={editable}
      placeholder={placeholder}
      inlineStyle={blockStyleToCss(style)}
      onSelect={editable ? (add) => h.select(index, add) : undefined}
      onCommit={(x) => h.onText(index, x)}
    />
  );
  return pos ? (
    <div className={`sl-free${isSel ? ' sl-sel' : ''}`} data-bi={index} style={posStyle(pos)}>
      {el}
    </div>
  ) : el;
};

/** 상단 오버라인(eyebrow) — 작은 대문자 트래킹 라벨. accentRole==='gold'면 골드.
    편집 모드에선 인라인 편집/선택(비어 있어도 클릭해 추가). 보기 모드에선 값이 있을 때만. */
const Eyebrow: FC<{ slide: Slide; editable: boolean; selected: Selection; h: EditHandlers }> = ({
  slide,
  editable,
  selected,
  h,
}) => {
  if (!editable && !slide.eyebrow) return null;
  const isSel = selected.eyebrow;
  const pos = slide.eyebrowPos;
  const el = (
    <Editable
      tag="span"
      className={`sl-eyebrow${slide.accentRole === 'gold' ? ' is-gold' : ''}${!pos && isSel ? ' sl-sel' : ''}`}
      dataBi={pos ? undefined : 'eyebrow'}
      value={slide.eyebrow ?? ''}
      editable={editable}
      placeholder="오버라인 라벨"
      inlineStyle={blockStyleToCss(slide.eyebrowStyle)}
      onSelect={editable ? () => h.select('eyebrow') : undefined}
      onCommit={(x) => h.onEyebrow(x)}
    />
  );
  return pos ? (
    <div className={`sl-free${isSel ? ' sl-sel' : ''}`} data-bi="eyebrow" style={posStyle(pos)}>
      {el}
    </div>
  ) : el;
};

/** 자리표시 박스 — 삽화/차트(다음 단계에서 실제 콘텐츠로 교체). */
const Placeholder: FC<{ icon: string; label?: string; sub?: string }> = ({ icon, label, sub }) => (
  <div className="sl-ph">
    <span className="ph-ic" aria-hidden>{icon}</span>
    {label && <span className="ph-label">{label}</span>}
    {sub && <span className="ph-sub">{sub}</span>}
  </div>
);

/** 불릿류 아이템 리스트 — bullets/agenda/checklist 공용(항목 편집·추가·삭제 + pos/freeze 지원). */
const ItemList: FC<{
  slide: Slide;
  listClass: string;
  editable: boolean;
  selected: Selection;
  h: EditHandlers;
}> = ({ slide, listClass, editable, selected, h }) => {
  const bl = findBullets(slide);
  if (!bl) return null;
  const bulletCss = blockStyleToCss(bl.style);
  const isSel = selected.blocks.has(bl.index);
  return (
    <div
      className={`${bl.pos ? 'sl-free' : 'sl-bullets-wrap'}${bl.pos && isSel ? ' sl-sel' : ''}`}
      data-bi={bl.pos ? bl.index : undefined}
      style={posStyle(bl.pos)}
    >
      <ul className={`${listClass}${!bl.pos && isSel ? ' sl-sel' : ''}`} data-bi={bl.pos ? undefined : bl.index}>
        {bl.items.map((it, i) => (
          <li key={i}>
            <Editable
              tag="span"
              className="btxt"
              value={it}
              editable={editable}
              placeholder="항목"
              inlineStyle={bulletCss}
              onSelect={editable ? (add) => h.select(bl.index, add) : undefined}
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
          <button type="button" className="bullet-add" onClick={() => h.mutateBullets(bl.index, (items) => [...items, ''])}>
            + 항목 추가
          </button>
        )}
      </ul>
    </div>
  );
};

/* ── 레이아웃들 ───────────────────────────────────────────────────────── */
const TitleLayout: FC<LayoutProps> = ({ slide, editable, h, selected }) => {
  const t = findText(slide, 'title');
  const s = findText(slide, 'subtitle');
  const img = findImages(slide)[0];
  const text = (
    <>
      <Eyebrow slide={slide} editable={editable} selected={selected} h={h} />
      {t && <TextBlockView slide={slide} index={t.index} tag="h1" className="sl-title" placeholder="제목" editable={editable} selected={selected} h={h} />}
      {s && <TextBlockView slide={slide} index={s.index} tag="p" className="sl-subtitle" placeholder="부제목" editable={editable} selected={selected} h={h} />}
    </>
  );
  // 커버 아트(image 블록)가 있으면 좌 텍스트 / 우 엣지 투 엣지 아트 패널의 '전문 표지'.
  if (img) {
    return (
      <div className="sl sl--title has-art">
        <div className="sl-title-text">{text}</div>
        <div className="sl-title-art">
          <SlideImage assetId={img.assetId} fit={img.fit ?? 'cover'} editable={editable} dataBi={img.index} onPick={() => h.pickImage(img.index)} />
        </div>
      </div>
    );
  }
  return <div className="sl sl--title">{text}</div>;
};

const SectionDividerLayout: FC<LayoutProps> = ({ slide, editable, h, selected }) => {
  const t = findText(slide, 'title');
  const s = findText(slide, 'subtitle');
  return (
    <div className="sl sl--section">
      <Eyebrow slide={slide} editable={editable} selected={selected} h={h} />
      {t && <TextBlockView slide={slide} index={t.index} tag="h1" className="sl-title" placeholder="섹션 제목" editable={editable} selected={selected} h={h} />}
      {s && <TextBlockView slide={slide} index={s.index} tag="p" className="sl-section-sub" placeholder="한 줄 소개(선택)" editable={editable} selected={selected} h={h} />}
    </div>
  );
};

const AgendaLayout: FC<LayoutProps> = ({ slide, editable, h, selected }) => {
  const t = findText(slide, 'title');
  return (
    <div className="sl sl--agenda">
      <Eyebrow slide={slide} editable={editable} selected={selected} h={h} />
      {t && <TextBlockView slide={slide} index={t.index} tag="h1" className="sl-title" placeholder="오늘의 순서" editable={editable} selected={selected} h={h} />}
      <ItemList slide={slide} listClass="sl-agenda" editable={editable} selected={selected} h={h} />
    </div>
  );
};

const ChecklistLayout: FC<LayoutProps> = ({ slide, editable, h, selected }) => {
  const t = findText(slide, 'title');
  return (
    <div className="sl sl--check">
      <Eyebrow slide={slide} editable={editable} selected={selected} h={h} />
      {t && <TextBlockView slide={slide} index={t.index} tag="h1" className="sl-title" placeholder="준비물 체크" editable={editable} selected={selected} h={h} />}
      <ItemList slide={slide} listClass="sl-checklist" editable={editable} selected={selected} h={h} />
    </div>
  );
};

const CardsLayout: FC<LayoutProps> = ({ slide, editable, h, selected }) => {
  const t = findText(slide, 'title');
  const cards = zipText(slide, 'subtitle', 'body').slice(0, 4);
  return (
    <div className="sl sl--cards">
      <Eyebrow slide={slide} editable={editable} selected={selected} h={h} />
      {t && <TextBlockView slide={slide} index={t.index} tag="h1" className="sl-title" placeholder="제목" editable={editable} selected={selected} h={h} />}
      <div className="sl-cards">
        {cards.map((c) => (
          <div key={c.a} className="sl-card">
            <TextBlockView slide={slide} index={c.a} tag="div" className="sl-card-t" placeholder="카드 제목" editable={editable} selected={selected} h={h} />
            <TextBlockView slide={slide} index={c.b} tag="div" className="sl-card-b" placeholder="한 줄 설명" editable={editable} selected={selected} h={h} />
          </div>
        ))}
      </div>
    </div>
  );
};

const StepsLayout: FC<LayoutProps> = ({ slide, editable, h, selected }) => {
  const t = findText(slide, 'title');
  const steps = zipText(slide, 'subtitle', 'body').slice(0, 4);
  return (
    <div className="sl sl--steps">
      <Eyebrow slide={slide} editable={editable} selected={selected} h={h} />
      {t && <TextBlockView slide={slide} index={t.index} tag="h1" className="sl-title" placeholder="진행 순서" editable={editable} selected={selected} h={h} />}
      <div className="sl-steps">
        {steps.map((c) => (
          <div key={c.a} className="sl-step">
            <TextBlockView slide={slide} index={c.a} tag="div" className="sl-step-t" placeholder="단계 이름" editable={editable} selected={selected} h={h} />
            <TextBlockView slide={slide} index={c.b} tag="div" className="sl-step-b" placeholder="설명" editable={editable} selected={selected} h={h} />
          </div>
        ))}
      </div>
    </div>
  );
};

const CompareLayout: FC<LayoutProps> = ({ slide, editable, h, selected }) => {
  const t = findText(slide, 'title');
  const cols = zipText(slide, 'subtitle', 'body').slice(0, 2);
  return (
    <div className="sl sl--compare">
      <Eyebrow slide={slide} editable={editable} selected={selected} h={h} />
      {t && <TextBlockView slide={slide} index={t.index} tag="h1" className="sl-title" placeholder="제목" editable={editable} selected={selected} h={h} />}
      <div className="sl-compare">
        {cols.map((c) => (
          <div key={c.a} className="sl-comp-col">
            <TextBlockView slide={slide} index={c.a} tag="div" className="sl-comp-h" placeholder="라벨" editable={editable} selected={selected} h={h} />
            <TextBlockView slide={slide} index={c.b} tag="div" className="sl-comp-b" placeholder="내용" editable={editable} selected={selected} h={h} />
          </div>
        ))}
      </div>
    </div>
  );
};

const StatRowLayout: FC<LayoutProps> = ({ slide, editable, h, selected }) => {
  const t = findText(slide, 'title');
  const stats = zipText(slide, 'subtitle', 'caption').slice(0, 3);
  return (
    <div className="sl sl--stats">
      <Eyebrow slide={slide} editable={editable} selected={selected} h={h} />
      {t && <TextBlockView slide={slide} index={t.index} tag="h1" className="sl-title" placeholder="제목" editable={editable} selected={selected} h={h} />}
      <div className="sl-stats">
        {stats.map((c) => (
          <div key={c.a} className="sl-stat-cell">
            <TextBlockView slide={slide} index={c.a} tag="div" className="num" placeholder="00%" editable={editable} selected={selected} h={h} />
            <TextBlockView slide={slide} index={c.b} tag="div" className="lab" placeholder="라벨" editable={editable} selected={selected} h={h} />
          </div>
        ))}
      </div>
    </div>
  );
};

const ImageFullLayout: FC<LayoutProps> = ({ slide, editable, h, selected }) => {
  const t = findText(slide, 'title');
  const s = findText(slide, 'subtitle');
  const img = findImages(slide)[0];
  return (
    <div className="sl sl--full">
      {/* 미디어·스크림은 absolute(z0) — 텍스트는 흐름(z1)이라 freeze 좌표계(.sl 기준)가 유지된다. */}
      <div className="sl-full-media">
        {img ? (
          <SlideImage assetId={img.assetId} fit={img.fit ?? 'cover'} editable={editable} dataBi={img.index} onPick={() => h.pickImage(img.index)} />
        ) : (
          <Placeholder icon="🖼️" label="배경 이미지" />
        )}
      </div>
      <div className="sl-full-scrim" aria-hidden />
      <Eyebrow slide={slide} editable={editable} selected={selected} h={h} />
      {t && <TextBlockView slide={slide} index={t.index} tag="h1" className="sl-title" placeholder="제목" editable={editable} selected={selected} h={h} />}
      {s && <TextBlockView slide={slide} index={s.index} tag="p" className="sl-subtitle" placeholder="한 줄 부제" editable={editable} selected={selected} h={h} />}
    </div>
  );
};

const BigTextLayout: FC<LayoutProps> = ({ slide, editable, h, selected }) => {
  const t = findText(slide, 'title');
  return (
    <div className="sl sl--big">
      <Eyebrow slide={slide} editable={editable} selected={selected} h={h} />
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
      <Eyebrow slide={slide} editable={editable} selected={selected} h={h} />
      {label && <TextBlockView slide={slide} index={label.index} className="sl-stat-label" placeholder="지표 이름" editable={editable} selected={selected} h={h} />}
      {num && <TextBlockView slide={slide} index={num.index} tag="div" className="sl-stat-num" placeholder="00%" editable={editable} selected={selected} h={h} />}
      {ctx && <TextBlockView slide={slide} index={ctx.index} className="sl-stat-ctx" placeholder="무엇을 뜻하는지 한 줄" editable={editable} selected={selected} h={h} />}
    </div>
  );
};

const TwoColumnLayout: FC<LayoutProps> = ({ slide, editable, h, selected }) => {
  const t = findText(slide, 'title');
  const bodies = findAllText(slide, 'body').slice(0, 2);
  const heads = findAllText(slide, 'subtitle').slice(0, 2);
  // subtitle 2개가 있으면 컬럼 헤더가 있는 '전문 두 단'(설명+근거에 라벨).
  const withHeads = heads.length === 2 && bodies.length === 2;
  return (
    <div className="sl sl--two">
      <Eyebrow slide={slide} editable={editable} selected={selected} h={h} />
      {t && <TextBlockView slide={slide} index={t.index} tag="h1" className="sl-title" placeholder="제목" editable={editable} selected={selected} h={h} />}
      <div className="sl-cols">
        {withHeads
          ? bodies.map((b, i) => (
              <div key={b.index} className="sl-col">
                <TextBlockView slide={slide} index={heads[i].index} tag="div" className="sl-col-h" placeholder="컬럼 제목" editable={editable} selected={selected} h={h} />
                <TextBlockView slide={slide} index={b.index} tag="div" className="sl-body" placeholder="내용" editable={editable} selected={selected} h={h} />
              </div>
            ))
          : bodies.map((b) => (
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
        <Eyebrow slide={slide} editable={editable} selected={selected} h={h} />
        {t && <TextBlockView slide={slide} index={t.index} tag="h1" className="sl-title" placeholder="제목" editable={editable} selected={selected} h={h} />}
        {body && <TextBlockView slide={slide} index={body.index} tag="div" className="sl-body" placeholder="핵심 설명" editable={editable} selected={selected} h={h} />}
      </div>
      <div className="sl-feature-img">
        {(() => {
          const img = findImages(slide)[0];
          return img ? (
            // 활동·핵심 삽화는 contain 기본 — 주제(활동 모습)가 잘리지 않게.
            <FreeImage info={{ ...img, fit: img.fit ?? 'contain' }} editable={editable} onPick={() => h.pickImage(img.index)} />
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
  return (
    <div className="sl sl--bullets">
      <Eyebrow slide={slide} editable={editable} selected={selected} h={h} />
      {t && <TextBlockView slide={slide} index={t.index} tag="h1" className="sl-title" placeholder="제목" editable={editable} selected={selected} h={h} />}
      <ItemList slide={slide} listClass="sl-bullets" editable={editable} selected={selected} h={h} />
    </div>
  );
};

const QuoteLayout: FC<LayoutProps> = ({ slide, editable, h, selected }) => {
  const q = findText(slide, 'body');
  const c = findText(slide, 'caption');
  return (
    <div className="sl sl--quote">
      <Eyebrow slide={slide} editable={editable} selected={selected} h={h} />
      {q && <TextBlockView slide={slide} index={q.index} tag="div" className="sl-quote" placeholder="인용·핵심 메시지" editable={editable} selected={selected} h={h} />}
      {c && <TextBlockView slide={slide} index={c.index} tag="div" className="sl-caption" placeholder="출처 · 발표자" editable={editable} selected={selected} h={h} />}
    </div>
  );
};

const HeroImageLayout: FC<LayoutProps> = ({ slide, editable, h, selected }) => {
  const t = findText(slide, 'title');
  const s = findText(slide, 'subtitle');
  const img = findImages(slide)[0];
  return (
    <div className="sl sl--hero">
      <Eyebrow slide={slide} editable={editable} selected={selected} h={h} />
      {t && <TextBlockView slide={slide} index={t.index} tag="h1" className="sl-title" placeholder="제목" editable={editable} selected={selected} h={h} />}
      {s && <TextBlockView slide={slide} index={s.index} tag="p" className="sl-hero-sub" placeholder="한 줄 부제(선택)" editable={editable} selected={selected} h={h} />}
      {img ? (
        <FreeImage info={img} editable={editable} onPick={() => h.pickImage(img.index)} />
      ) : (
        <Placeholder icon="🖼️" label="삽화" />
      )}
    </div>
  );
};

const PhotoGridLayout: FC<LayoutProps> = ({ slide, editable, h, selected }) => {
  const imgs = findImages(slide).slice(0, 6); // 2~6장 — 개수에 맞춰 그리드가 변한다(data-count).
  const c = findText(slide, 'caption');
  return (
    <div className="sl sl--grid">
      <Eyebrow slide={slide} editable={editable} selected={selected} h={h} />
      <div className="sl-grid" data-count={imgs.length > 0 ? imgs.length : 4}>
        {imgs.length > 0
          ? imgs.map((im) => (
              // 콘텐츠 삽화는 contain 기본 — 그리드 칸에 맞춰 '잘리지 않고' 전체가 보이게(교사 요청).
              <FreeImage key={im.index} info={{ ...im, fit: im.fit ?? 'contain' }} editable={editable} onPick={() => h.pickImage(im.index)} />
            ))
          : [0, 1, 2, 3].map((i) => <Placeholder key={i} icon="🖼️" />)}
      </div>
      {c && <TextBlockView slide={slide} index={c.index} tag="div" className="sl-caption" placeholder="사진 설명" editable={editable} selected={selected} h={h} />}
    </div>
  );
};

const ChartLayout: FC<LayoutProps> = ({ slide, theme, editable, h, selected }) => {
  const t = findText(slide, 'title');
  const c = findText(slide, 'caption');
  const chart = findChart(slide);
  return (
    <div className="sl sl--chart">
      <Eyebrow slide={slide} editable={editable} selected={selected} h={h} />
      {t && <TextBlockView slide={slide} index={t.index} tag="h1" className="sl-title" placeholder="제목" editable={editable} selected={selected} h={h} />}
      {chart ? (
        chart.block.pos ? (
          <div className="sl-free sl-free-media" data-bi={chart.index} style={posStyle(chart.block.pos)}>
            <SlideChart block={chart.block} theme={theme} />
          </div>
        ) : (
          <SlideChart block={chart.block} theme={theme} dataBi={chart.index} />
        )
      ) : (
        <Placeholder icon="📊" label="차트 자리" sub="차트 레이아웃에 차트 블록을 추가하세요" />
      )}
      {c && <TextBlockView slide={slide} index={c.index} tag="div" className="sl-caption" placeholder="차트 설명" editable={editable} selected={selected} h={h} />}
    </div>
  );
};

export const LAYOUT_COMPONENTS: Record<Layout, FC<LayoutProps>> = {
  title: TitleLayout,
  'section-divider': SectionDividerLayout,
  agenda: AgendaLayout,
  'big-text': BigTextLayout,
  'big-stat': BigStatLayout,
  'stat-row': StatRowLayout,
  'two-column': TwoColumnLayout,
  compare: CompareLayout,
  cards: CardsLayout,
  steps: StepsLayout,
  'image-feature': ImageFeatureLayout,
  'image-full': ImageFullLayout,
  bullets: BulletsLayout,
  checklist: ChecklistLayout,
  'hero-image': HeroImageLayout,
  'photo-grid': PhotoGridLayout,
  quote: QuoteLayout,
  chart: ChartLayout,
  interactive: InteractiveSlideLayout,
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
  { id: 'agenda', label: '차례', icon: mini(<>{bar(10, 7, 20, 4, 'var(--accent)')}{bar(10, 15, 5, 3, 'var(--accent)')}{bar(19, 15, 28, 3)}{bar(10, 21, 5, 3, 'var(--accent)')}{bar(19, 21, 24, 3)}{bar(10, 27, 5, 3, 'var(--accent)')}{bar(19, 27, 26, 3)}</>) },
  { id: 'big-text', label: '강조', icon: mini(<>{bar(10, 13, 44, 10, 'var(--fg-2)')}</>) },
  { id: 'big-stat', label: '지표', icon: mini(<>{bar(24, 7, 16, 2.5)}{bar(17, 12, 30, 13, 'var(--accent)')}{bar(21, 28, 22, 2.5)}</>) },
  { id: 'stat-row', label: '지표 나열', icon: mini(<>{bar(9, 11, 14, 9, 'var(--accent)')}{bar(9, 23, 12, 2.5)}{bar(25, 11, 14, 9, 'var(--accent)')}{bar(25, 23, 12, 2.5)}{bar(41, 11, 14, 9, 'var(--accent)')}{bar(41, 23, 12, 2.5)}</>) },
  { id: 'two-column', label: '두 단', icon: mini(<>{bar(10, 8, 24, 4, 'var(--accent)')}{bar(10, 16, 22, 13)}{bar(38, 16, 16, 13)}</>) },
  { id: 'compare', label: '비교', icon: mini(<>{bar(10, 7, 22, 3.5, 'var(--accent)')}{bar(9, 14, 21, 15, 'var(--surface-3)')}{bar(34, 14, 21, 15, 'var(--surface-3)')}{bar(9, 14, 21, 2.5, 'var(--accent)')}{bar(34, 14, 21, 2.5, 'var(--fg-muted)')}</>) },
  { id: 'cards', label: '카드', icon: mini(<>{bar(10, 7, 22, 3.5, 'var(--accent)')}{bar(9, 14, 14, 15, 'var(--surface-3)')}{bar(25, 14, 14, 15, 'var(--surface-3)')}{bar(41, 14, 14, 15, 'var(--surface-3)')}</>) },
  { id: 'steps', label: '단계', icon: mini(<>{bar(10, 7, 22, 3.5, 'var(--accent)')}<circle cx="14" cy="18" r="3" fill="var(--accent)" /><circle cx="32" cy="18" r="3" fill="var(--accent)" /><circle cx="50" cy="18" r="3" fill="var(--accent)" />{bar(9, 24, 10, 2.5)}{bar(27, 24, 10, 2.5)}{bar(45, 24, 10, 2.5)}</>) },
  { id: 'image-feature', label: '이미지', icon: mini(<>{bar(8, 9, 20, 3, 'var(--accent)')}{bar(8, 15, 22, 2.5)}{bar(8, 20, 17, 2.5)}{bar(36, 8, 20, 20, 'var(--surface-3)')}</>) },
  { id: 'image-full', label: '풀 이미지', icon: mini(<>{bar(1, 1, 62, 34, 'var(--surface-3)')}{bar(8, 22, 26, 5, 'var(--fg-2)')}{bar(8, 29, 18, 2.5, 'var(--fg-muted)')}</>) },
  { id: 'bullets', label: '요점', icon: mini(<>{bar(10, 8, 24, 4, 'var(--accent)')}{bar(12, 17, 28, 2.5)}{bar(12, 23, 28, 2.5)}{bar(12, 29, 20, 2.5)}</>) },
  { id: 'checklist', label: '체크', icon: mini(<>{bar(10, 7, 22, 3.5, 'var(--accent)')}{bar(9, 14, 22, 6, 'var(--surface-3)')}{bar(33, 14, 22, 6, 'var(--surface-3)')}{bar(9, 23, 22, 6, 'var(--surface-3)')}{bar(33, 23, 22, 6, 'var(--surface-3)')}</>) },
  { id: 'hero-image', label: '삽화', icon: mini(<>{bar(10, 8, 24, 4, 'var(--accent)')}{bar(10, 15, 44, 14, 'var(--surface-3)')}</>) },
  { id: 'photo-grid', label: '사진', icon: mini(<>{bar(10, 8, 20, 9, 'var(--surface-3)')}{bar(34, 8, 20, 9, 'var(--surface-3)')}{bar(10, 20, 20, 9, 'var(--surface-3)')}{bar(34, 20, 20, 9, 'var(--surface-3)')}</>) },
  { id: 'quote', label: '인용', icon: mini(<>{bar(12, 11, 40, 4)}{bar(12, 19, 30, 4)}{bar(12, 28, 14, 2.5, 'var(--accent)')}</>) },
  { id: 'chart', label: '차트', icon: mini(<>{bar(12, 22, 6, 7, 'var(--accent)')}{bar(22, 16, 6, 13, 'var(--fg-muted)')}{bar(32, 12, 6, 17, 'var(--accent)')}{bar(42, 19, 6, 10, 'var(--fg-muted)')}</>) },
  { id: 'interactive', label: '인터렉티브', icon: mini(<>{bar(14, 10, 36, 16, 'var(--surface-3)')}<circle cx="32" cy="18" r="4" fill="var(--accent)" />{bar(26, 29, 12, 2.5, 'var(--accent)')}</>) },
];
