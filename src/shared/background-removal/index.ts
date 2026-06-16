/**
 * 배경 제거 공용 엔진 — 공개 진입점.
 * 보드(프롬프트바·인라인 버튼)와 게임뷰어(teacher-assets)가 모두 여기서 import 한다.
 */
export { removeBackground, warmupBackgroundRemoval, pickTier } from './removeBackground';
export { useBackgroundRemoval } from './useBackgroundRemoval';
export type {
  AssetKind,
  RBInput,
  RBProgress,
  RemoveBgOptions,
  RemoveBgResult,
  Tier,
} from './types';
