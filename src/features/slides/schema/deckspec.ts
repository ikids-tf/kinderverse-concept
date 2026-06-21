/* DeckSpec — 킨더버스 슬라이드 생성의 계약(slides-feature/deckspec.schema.json과 1:1).
   불변식(slides-feature/CLAUDE.md §2):
     1. 텍스트는 절대 이미지에 굽지 않는다 — 모든 글자는 엔진이 렌더(여기 text/bullets).
     2. Claude(장표 에이전트)는 이 JSON만 생성하고, 렌더링은 엔진 전담.
     4. 레이아웃은 아래 LAYOUTS enum으로 고정 — 자유 레이아웃 금지.
   M1(기초 슬라이스)에서는 교사가 이 구조를 '수동으로' 만든다(레이아웃 선택+인라인 편집).
   AI 자동 생성(한 줄 요청→DeckSpec)과 PDF export는 다음 단계. */

export type Category = 'lesson' | 'parent' | 'admin';
/* 슬라이드 테마 — 슬라이드 콘텐츠는 Milray 고정에서 풀려 다양한 전문 스타일 허용(사용자 지시).
   themes.css의 .slides-root[data-theme]와 1:1. 앱 크롬은 Milray 유지. */
export const THEMES = ['warm', 'ivory', 'midnight', 'slate', 'sage', 'bloom', 'mono'] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_LABEL: Record<Theme, string> = {
  warm: '웜 크림',
  ivory: '아이보리',
  midnight: '미드나잇',
  slate: '슬레이트',
  sage: '세이지',
  bloom: '블룸',
  mono: '모노',
};
export type Ratio = '16:9' | '4:3';
export type AgeBand = '3세' | '4세' | '5세' | '혼합';
export type Language = 'ko' | 'ja' | 'en';

export const LAYOUTS = [
  'title',
  'section-divider',
  'big-text',
  'big-stat',
  'two-column',
  'image-feature',
  'bullets',
  'hero-image',
  'photo-grid',
  'quote',
  'chart',
  'interactive',
] as const;
export type Layout = (typeof LAYOUTS)[number];

/** 슬라이드 악센트 역할 — 코랄(기본) 또는 골드(등급/강조 한정). 퍼플 등 임의색 금지. */
export type AccentRole = 'coral' | 'gold';

/** 블록 단위 스타일 오버라이드(교사 미세 조정 — 2단계). 모두 선택(미설정 시 레이아웃/테마 기본).
    color는 토큰 키만(테마 --s-* 로 매핑) — 임의 hex 금지로 테마 일관성 유지. */
export type BlockColor = 'default' | 'secondary' | 'muted' | 'accent' | 'gold';
export interface BlockStyle {
  fontPx?: number; // 캔버스(1280×720) 좌표계 px. 미설정 시 레이아웃 CSS 크기.
  fontFam?: 'serif' | 'sans';
  bold?: boolean;
  color?: BlockColor;
  align?: 'left' | 'center' | 'right';
}
/** 자유 배치 — `.sl` 콘텐츠(패딩) 박스 기준 %. 있으면 흐름에서 빼내 절대 배치.
    xPct/yPct=좌상단, wPct=너비. hPct=높이(이미지/차트처럼 콘텐츠 높이가 자동이 아닌 블록만;
    텍스트는 생략해 내용에 맞춰 자동). rot=회전(도, 박스 중심 기준). */
export interface BlockPos {
  xPct: number;
  yPct: number;
  wPct: number;
  hPct?: number;
  rot?: number;
}

export type TextBlockType = 'title' | 'subtitle' | 'body' | 'caption';
export interface TextBlock {
  type: TextBlockType;
  text: string;
  style?: BlockStyle;
  pos?: BlockPos;
}
export interface BulletsBlock {
  type: 'bullets';
  items: string[];
  style?: BlockStyle;
  pos?: BlockPos;
}
export type ImageRole = 'hero' | 'inline' | 'background' | 'icon';
export interface ImageBlock {
  type: 'image';
  role: ImageRole;
  /** 삽화 내용만. 스타일 접미(style-lock)는 이미지 워커가 덧붙인다(M2). 텍스트 지시 금지. */
  prompt: string;
  characterRef?: string;
  /** 슬라이드 이미지 IDB(slideAssets) 참조 id. 데이터는 덱에 넣지 않는다(용량). */
  assetId?: string | null;
  fit?: 'cover' | 'contain';
  pos?: BlockPos;
}

/** 슬라이드 배경 이미지 — assetId 참조 + 가독용 스크림(dim). */
export interface SlideBackground {
  assetId: string;
  dim?: number; // 0..1 어두운 오버레이(글자 가독성)
  fit?: 'cover' | 'contain';
}
export type ChartType = 'bar' | 'line' | 'pie' | 'radar';
export interface ChartBlock {
  type: 'chart';
  chartType: ChartType;
  data: Record<string, unknown>[];
  caption?: string;
  pos?: BlockPos;
}
export type Block = TextBlock | BulletsBlock | ImageBlock | ChartBlock;

export interface Slide {
  layout: Layout;
  blocks: Block[];
  /** 슬라이드 배경 이미지(선택). */
  background?: SlideBackground;
  /** 상단 오버라인 라벨(섹션·맥락) — 전문 덱의 작은 대문자 트래킹 라벨. 선택. */
  eyebrow?: string;
  /** eyebrow 텍스트 스타일 오버라이드(교사 편집). 선택. */
  eyebrowStyle?: BlockStyle;
  /** eyebrow 자유 배치(freeze/이동). 있으면 흐름에서 빼내 절대 배치 — 다른 블록 이동 시 안 밀림. */
  eyebrowPos?: BlockPos;
  /** 쪽번호 표시 여부(선택). 표지/섹션 구분에는 보통 숨긴다. */
  number?: boolean;
  /** 이 슬라이드의 악센트 색 역할(코랄 기본 / 골드 강조). 선택. */
  accentRole?: AccentRole;
  /** 교사용 진행 멘트(선택). 슬라이드에는 렌더되지 않음. */
  speakerNote?: string;
  /** layout==='interactive' 전용 — 재생할 인터렉티브 노드 docId(localStorage 'kv:inodes:v1'). 수업 모드. */
  nodeId?: string;
  /** layout==='interactive' 전용 — 활동 진행 방식. 'teacher'(기본)=교사 수동, 'onComplete'=완료 시 자동으로 다음 장. */
  advance?: 'teacher' | 'onComplete';
}

export interface DeckSpec {
  category: Category;
  theme: Theme;
  ratio: Ratio;
  ageBand: AgeBand;
  title: string;
  language?: Language;
  slides: Slide[];
}

/* ── 타입 가드 ─────────────────────────────────────────────────────────── */
export const isText = (b: Block): b is TextBlock =>
  b.type === 'title' || b.type === 'subtitle' || b.type === 'body' || b.type === 'caption';
export const isBullets = (b: Block): b is BulletsBlock => b.type === 'bullets';
export const isImage = (b: Block): b is ImageBlock => b.type === 'image';
export const isChart = (b: Block): b is ChartBlock => b.type === 'chart';

/* ── 레이아웃별 기본 블록 — 교사가 새 슬라이드를 추가할 때의 시작 모양 ────────── */
export function defaultBlocks(layout: Layout): Block[] {
  switch (layout) {
    case 'title':
      return [
        { type: 'title', text: '제목을 입력하세요' },
        { type: 'subtitle', text: '부제목' },
      ];
    case 'big-text':
      return [{ type: 'title', text: '한 문장으로 강조할 메시지' }];
    case 'section-divider':
      // eyebrow(슬라이드 필드) + 큰 섹션 제목. 막과 막 사이의 호흡.
      return [{ type: 'title', text: '섹션 제목' }];
    case 'big-stat':
      // caption=라벨(위) · title=큰 수치 · subtitle=맥락(아래)
      return [
        { type: 'caption', text: '핵심 지표' },
        { type: 'title', text: '96%' },
        { type: 'subtitle', text: '무엇을 뜻하는지 한 줄로' },
      ];
    case 'image-feature':
      // 텍스트(제목+본문) 좌 ~58% · 이미지 우 ~42%
      return [
        { type: 'title', text: '제목' },
        { type: 'body', text: '핵심 설명을 두세 문장으로.' },
        { type: 'image', role: 'inline', prompt: '', assetId: null },
      ];
    case 'bullets':
      return [
        { type: 'title', text: '요점' },
        { type: 'bullets', items: ['첫 번째 항목', '두 번째 항목', '세 번째 항목'] },
      ];
    case 'two-column':
      return [
        { type: 'title', text: '제목' },
        { type: 'body', text: '왼쪽 내용을 입력하세요.' },
        { type: 'body', text: '오른쪽 내용을 입력하세요.' },
      ];
    case 'quote':
      return [
        { type: 'body', text: '인용할 문장이나 핵심 메시지를 적어요.' },
        { type: 'caption', text: '— 출처 · 발표자' },
      ];
    case 'hero-image':
      return [
        { type: 'title', text: '제목' },
        { type: 'image', role: 'hero', prompt: '', assetId: null },
      ];
    case 'photo-grid':
      return [
        { type: 'image', role: 'inline', prompt: '', assetId: null },
        { type: 'image', role: 'inline', prompt: '', assetId: null },
        { type: 'image', role: 'inline', prompt: '', assetId: null },
        { type: 'image', role: 'inline', prompt: '', assetId: null },
        { type: 'caption', text: '활동 사진' },
      ];
    case 'chart':
      // 수동 추가 시에도 바로 예쁜 차트가 보이도록 샘플 데이터를 채워 둔다(교사가 값만 바꾸면 됨).
      return [
        { type: 'title', text: '월별 출석 현황' },
        {
          type: 'chart',
          chartType: 'bar',
          data: [
            { label: '3월', value: 18 },
            { label: '4월', value: 21 },
            { label: '5월', value: 20 },
            { label: '6월', value: 23 },
          ],
        },
        { type: 'caption', text: '꾸준히 늘어난 우리 반 출석' },
      ];
    case 'interactive':
      // 인터렉티브 슬라이드는 블록이 없다 — 노드(nodeId) 하나를 전체로 재생.
      return [];
    default:
      return [{ type: 'title', text: '제목' }];
  }
}

/** 새 덱(보드에 슬라이드 뷰어를 처음 올릴 때) — 표지 한 장으로 시작. */
export function defaultDeck(): DeckSpec {
  return {
    category: 'admin',
    theme: 'warm',
    ratio: '16:9',
    ageBand: '혼합',
    title: '새 슬라이드',
    language: 'ko',
    slides: [{ layout: 'title', blocks: defaultBlocks('title') }],
  };
}

/** 레이아웃을 바꿀 때 — 기존 글(제목·본문·불릿)을 가능한 한 새 레이아웃으로 이어 붙인다.
    파괴적 초기화가 아니라 타입별로 텍스트를 옮겨, 표지→불릿 등으로 바꿔도 제목이 남는다. */
export function relayout(slide: Slide, layout: Layout): Slide {
  const next = defaultBlocks(layout);
  // 이전 텍스트를 타입별 큐로 모은다.
  const textPool: Record<TextBlockType, string[]> = { title: [], subtitle: [], body: [], caption: [] };
  let oldBullets: string[] | null = null;
  for (const b of slide.blocks) {
    if (isText(b)) textPool[b.type].push(b.text);
    else if (isBullets(b)) oldBullets = b.items;
  }
  // body가 없으면 title/subtitle을, title이 없으면 body를 — 인접 타입끼리 폴백.
  const fallbackText = (t: TextBlockType): string | undefined => {
    const order: TextBlockType[] = t === 'title' ? ['title', 'subtitle', 'body'] : t === 'body' ? ['body', 'subtitle', 'title'] : [t];
    for (const k of order) if (textPool[k].length) return textPool[k].shift();
    return undefined;
  };
  return {
    ...slide,
    layout,
    blocks: next.map((b) => {
      if (isText(b)) {
        const carried = fallbackText(b.type);
        return carried !== undefined ? { ...b, text: carried } : b;
      }
      if (isBullets(b) && oldBullets && oldBullets.length) {
        const items = oldBullets;
        oldBullets = null;
        return { ...b, items };
      }
      return b;
    }),
  };
}

/* ── 검증 — AI 산출 DeckSpec 게이트(다음 단계에서 장표 에이전트 출력에 사용).
   수동 편집 덱은 항상 유효하지만, 계약을 코드로 박아 둔다(불변식 4의 enforcement). ── */
const CATEGORIES: Category[] = ['lesson', 'parent', 'admin'];
const RATIOS: Ratio[] = ['16:9', '4:3'];
const AGE_BANDS: AgeBand[] = ['3세', '4세', '5세', '혼합'];

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateDeck(deck: unknown): ValidationResult {
  const errors: string[] = [];
  const d = deck as Partial<DeckSpec> | null;
  if (!d || typeof d !== 'object') return { ok: false, errors: ['DeckSpec가 객체가 아닙니다'] };
  if (!CATEGORIES.includes(d.category as Category)) errors.push(`category 무효: ${String(d.category)}`);
  if (!(THEMES as readonly string[]).includes(String(d.theme))) errors.push(`theme 무효: ${String(d.theme)}`);
  if (!RATIOS.includes(d.ratio as Ratio)) errors.push(`ratio 무효: ${String(d.ratio)}`);
  if (!AGE_BANDS.includes(d.ageBand as AgeBand)) errors.push(`ageBand 무효: ${String(d.ageBand)}`);
  if (typeof d.title !== 'string' || !d.title.trim()) errors.push('title이 비어 있습니다');
  if (!Array.isArray(d.slides) || d.slides.length < 1) {
    errors.push('slides가 최소 1장 필요합니다');
  } else {
    d.slides.forEach((s, i) => {
      if (!s || typeof s !== 'object') return errors.push(`slide[${i}]가 객체가 아닙니다`);
      if (!(LAYOUTS as readonly string[]).includes(s.layout)) errors.push(`slide[${i}].layout 무효: ${String(s.layout)}`);
      // 인터렉티브 슬라이드는 블록이 없다(노드 재생) — 블록 요건 면제.
      if (s.layout !== 'interactive' && (!Array.isArray(s.blocks) || s.blocks.length < 1)) errors.push(`slide[${i}].blocks가 비어 있습니다`);
    });
  }
  return { ok: errors.length === 0, errors };
}
