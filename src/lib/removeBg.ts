/**
 * removeBg.ts — 기존 호출부 호환 셸. 실제 로직은 공용 엔진(@/shared/background-removal)에 있다.
 * 기존 시그니처 `removeBg(src) → 투명 PNG dataURL | null` 유지(게임뷰어 등 import 체인 보존).
 * @imgly(AGPL)는 더 이상 쓰지 않는다 — 온디바이스 BiRefNet(MIT)로 일원화.
 */
import { removeBackground, type AssetKind } from '@/shared/background-removal';

/** src(dataURL/URL/Blob) → 배경 제거된 투명 PNG dataURL. 실패 시 null.
    assetKind 미지정 시 'unknown'(=무조건 온디바이스, 안전 기본값). */
export async function removeBg(src: string, assetKind: AssetKind = 'unknown'): Promise<string | null> {
  try {
    const r = await removeBackground(src, { assetKind });
    return r.dataUrl;
  } catch {
    return null;
  }
}
