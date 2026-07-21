/**
 * 놀이 패키지 — 주제 맞춤 시각 프리셋 레지스트리.
 *
 * 목적: buildPlayPackage(composer.ts)가 패키지를 만들 때, 주제("여름"·"바다" 등)를 결정론으로
 * 시각 프리셋(문서 스킨 + 스티커 + 레이아웃)에 매핑해 '디폴트로' 입힌다. 자동 실행이 아니라
 * 그냥 기본 스타일링 — 교사는 그대로 클릭·편집한다(charter §4 L1).
 *
 * 매핑 소스는 신규가 아니라 기존 자산 재사용:
 *  - 명사 매칭: resolveTheme (interactive-viewer 테마팩) — "여름/바다/물놀이/…"를 인식.
 *  - 계절 폴백: 명사 미매칭이면 현재 월→계절로 SEASON_PRESETS 선택(테마팩 season 필드의 설계 의도 실현).
 *  - 스킨 값: DOC_SKIN_FAMILIES(docSkins.ts)의 변형 id를 그대로 가리킨다(색은 --d-* 시맨틱 변수).
 *
 * 확장: 새 계절/주제 = 이 파일의 테이블에 행 추가(+필요 시 themePacks.ts에 계절어). 로직 변경 없음.
 */
import type { DocSkinFamily } from '@/features/doc-edit/docSkins';
import type { LayoutVariant } from './design-spec';
import { resolveTheme } from '@/features/interactive-viewer/resolver/themePacks';

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export interface PackagePreset {
  /** 프리셋 식별자(디버그·추적용). */
  id: string;
  /** 문서 카드 스킨 패밀리 — node.data.docTheme 로 주입(resolveDocSkin 소비). */
  docTheme: DocSkinFamily;
  /** 문서 카드 스킨 변형 id — node.data.docVariant 로 주입(DOC_SKIN_FAMILIES 의 변형). */
  docVariant: string;
  /** 이모지 팔레트 — 아이디어 카드 모서리 스티커(decorateDocStickers)에 쓴다. */
  stickers: string[];
  /** 프레임 레이아웃 배열 변형(미지정 시 composer 가 'default'). */
  layoutVariant?: LayoutVariant;
  /** 커버 일러스트를 받을 문서 role(선택). */
  coverRole?: string;
}

/** 명사 매칭 프리셋 — 키는 themePacks.ts 의 ThemePack.id. */
const THEME_PRESETS: Record<string, PackagePreset> = {
  ocean: {
    id: 'ocean',
    docTheme: 'nature',
    docVariant: 'nature-sea',
    stickers: ['🌊', '🐠', '🐚', '🐙', '⭐'],
    layoutVariant: 'default',
    coverRole: 'plan',
  },
  summer: {
    id: 'summer',
    docTheme: 'nature',
    docVariant: 'nature-sea',
    stickers: ['🌊', '🍉', '☀️', '🏖️', '🐚'],
    layoutVariant: 'default',
    coverRole: 'plan',
  },
  christmas: {
    id: 'christmas',
    docTheme: 'pastel',
    docVariant: 'pastel-sky',
    stickers: ['🎄', '🎁', '⛄', '❄️', '⭐'],
    layoutVariant: 'default',
    coverRole: 'plan',
  },
  halloween: {
    id: 'halloween',
    docTheme: 'nature',
    docVariant: 'nature-autumn-leaf',
    stickers: ['🎃', '👻', '🦇', '🍬', '🕸️'],
    layoutVariant: 'default',
    coverRole: 'plan',
  },
};

/** 계절 폴백 프리셋 — 명사 미매칭 시 현재 계절로 선택(항상 유효한 프리셋 보장). */
const SEASON_PRESETS: Record<Season, PackagePreset> = {
  spring: {
    id: 'spring',
    docTheme: 'pastel',
    docVariant: 'pastel-cherry-blossom',
    stickers: ['🌸', '🌱', '🐝', '🦋', '🌷'],
    layoutVariant: 'default',
    coverRole: 'plan',
  },
  summer: {
    id: 'summer',
    docTheme: 'nature',
    docVariant: 'nature-sea',
    stickers: ['🌊', '🍉', '☀️', '🏖️', '🐚'],
    layoutVariant: 'default',
    coverRole: 'plan',
  },
  autumn: {
    id: 'autumn',
    docTheme: 'nature',
    docVariant: 'nature-autumn-leaf',
    stickers: ['🍂', '🌰', '🍁', '🎃', '🐿️'],
    layoutVariant: 'default',
    coverRole: 'plan',
  },
  winter: {
    id: 'winter',
    docTheme: 'pastel',
    docVariant: 'pastel-sky',
    stickers: ['❄️', '⛄', '✨', '🧤', '☃️'],
    layoutVariant: 'default',
    coverRole: 'plan',
  },
};

/** 현재 월(1~12) → 계절. 봄=3~5 / 여름=6~8 / 가을=9~11 / 겨울=12~2. */
export function currentSeason(month: number = new Date().getMonth() + 1): Season {
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'autumn';
  return 'winter';
}

/**
 * 주제 → 패키지 시각 프리셋. **항상 유효한 프리셋을 반환한다(널 아님)**:
 *  1순위 — 명사 매칭(resolveTheme): 매칭된 테마팩에 프리셋이 있으면 그것.
 *  2순위 — 매칭됐지만 프리셋 미정의면 그 팩의 season 으로 계절 프리셋.
 *  3순위 — 명사 미매칭이면 현재 계절 프리셋(사용자 확정 폴백).
 */
export function resolvePackagePreset(topic: string): PackagePreset {
  const pack = resolveTheme(topic || '');
  if (pack) {
    const byId = THEME_PRESETS[pack.id];
    if (byId) return byId;
    if (pack.season) return SEASON_PRESETS[pack.season];
  }
  return SEASON_PRESETS[currentSeason()];
}
