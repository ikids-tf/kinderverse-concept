/**
 * openmoji.ts — 아이템 ref → OpenMoji SVG URL 리졸버 (STEP 4).
 * ------------------------------------------------------------------
 * - 큐레이션 콘텐츠(contentSets)의 hexcode를 OpenMoji color SVG로 해석한다.
 * - 단일 코드포인트("1F981")와 ZWJ 결합("1F9D1-200D-1F692")을 모두 처리.
 * - 실루엣: 같은 SVG를 CSS mask로 입혀 단색으로 채운다(알파→단색). 추가 에셋 0.
 *
 * 에셋 출처: hfg-gmuend/openmoji (CC BY-SA 4.0). jsDelivr CDN으로 즉시 로드.
 * 오프라인/속도가 필요하면 public/openmoji/ 로 사전 다운로드 후 BASE만 교체.
 */
import type { CSSProperties } from "react";

/** color SVG 베이스. 파일명은 대문자 hex, ZWJ는 하이픈(-200D-)으로 결합된 형태. */
const CDN_BASE = "https://cdn.jsdelivr.net/gh/hfg-gmuend/openmoji@15.0.0/color/svg";

/** ref 정규화 — 대문자, 공백/유니코드 U+ 접두 제거, 코드포인트는 하이픈 결합. */
export function normalizeRef(ref: string): string {
  return ref
    .trim()
    .toUpperCase()
    .replace(/U\+/g, "")
    .replace(/\s+/g, "-");
}

/** ref → OpenMoji color SVG URL. */
export function openmojiUrl(ref: string): string {
  return `${CDN_BASE}/${normalizeRef(ref)}.svg`;
}

/** 실루엣 div 스타일 — SVG를 mask로 입히고 단색으로 채운다. 부모가 크기를 준다. */
export function silhouetteMaskStyle(
  ref: string,
  color: string,
): CSSProperties {
  const url = `url("${openmojiUrl(ref)}")`;
  return {
    backgroundColor: color,
    WebkitMaskImage: url,
    maskImage: url,
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    WebkitMaskPosition: "center",
    maskPosition: "center",
    WebkitMaskSize: "contain",
    maskSize: "contain",
    // 실루엣은 그림자/외곽 없이 또렷하게.
    width: "100%",
    height: "100%",
  };
}

/** 컬러 이미지 스타일 — object-fit으로 비율 유지, 부모가 크기를 준다. */
export const colorImgStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "contain",
  userSelect: "none",
  pointerEvents: "none",
  WebkitUserDrag: "none",
} as CSSProperties & { WebkitUserDrag: string };
