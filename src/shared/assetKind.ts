/**
 * 자산 출처/프라이버시 분류 — 단일 진실원본(아동안전 게이팅의 기준).
 *
 * 그동안 assetKind가 3곳에 제각각이었다(인터렉티브 스키마 5값 · 게임뷰어 5값 ·
 * 배경제거 모듈 4값). 출처/프라이버시 '축'은 이 파일 하나로 정규화하고, 목적이
 * 다른 축(배경제거 티어링)은 어댑터로 변환한다(재정의 X).
 *   - 인터렉티브 노드 스키마(features/interactive-viewer)가 이 정의를 가져다 쓴다.
 *   - 배경제거(src/shared/background-removal)는 자체 4값 축을 유지하되,
 *     호출 경계에서 toRemoveBgAssetKind로 매핑한다.
 */
import { z } from 'zod';
import type { AssetKind as RemoveBgAssetKind } from './background-removal/types';

/** 출처/프라이버시 분류값. */
export const ASSET_KINDS = [
  'generated', // AI 생성
  'stock', // 라이브러리/스톡
  'teacher-upload', // 교사 일반 업로드
  'child-photo', // 아동 사진 (민감)
  'child-artwork', // 아동 작품 (민감)
] as const;

export const AssetKind = z.enum(ASSET_KINDS);
export type AssetKind = (typeof ASSET_KINDS)[number];

/**
 * 외부 API 전송 금지 대상(아동 매체). CLAUDE §2.5 — 아동 데이터는 테넌트 격리,
 * 공용 모델 학습/외부 전송 금지. child-photo·child-artwork 모두 보호적으로 포함.
 */
export function isChildMedia(kind: AssetKind): boolean {
  return kind === 'child-photo' || kind === 'child-artwork';
}

/**
 * 배경제거 모듈(src/shared/background-removal)의 AssetKind 축으로 변환.
 * 그 축은 티어링(온디바이스 강제)·전처리 전용 4값이다. 아동 매체는 무조건
 * 'child-photo'로 매핑해 온디바이스 처리를 강제한다(pickTier가 보장).
 */
export function toRemoveBgAssetKind(kind: AssetKind): RemoveBgAssetKind {
  switch (kind) {
    case 'child-photo':
    case 'child-artwork':
      return 'child-photo';
    case 'generated':
      return 'generated';
    case 'stock':
    case 'teacher-upload':
      return 'object';
    default:
      return 'unknown';
  }
}
