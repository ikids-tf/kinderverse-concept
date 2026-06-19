/**
 * layout.ts — 노드 transform(정규화 0..1)을 무대 absolute 스타일로. 렌더러·에디터 공용.
 * (컴포넌트 파일에서 분리해 fast-refresh 경고를 피하고 재사용한다.)
 */
import type { CSSProperties } from "react";
import type { SceneNode, Style } from "../schema/interactiveDoc";

export type NodeTransform = SceneNode["transform"];

export function transformStyle(t: NodeTransform): CSSProperties {
  return {
    left: `${t.x * 100}%`,
    top: `${t.y * 100}%`,
    width: `${t.w * 100}%`,
    height: `${t.h * 100}%`,
    zIndex: t.z,
    opacity: t.opacity,
    transform: `translate(-50%,-50%)${t.rotation ? ` rotate(${t.rotation}deg)` : ""}`,
  };
}

/** 노드 style.cornerRadius → 컨테이너 borderRadius(없으면 빈 객체 = 기본 CSS 유지). */
export function radiusStyle(style?: Style): CSSProperties {
  return typeof style?.cornerRadius === "number" ? { borderRadius: style.cornerRadius } : {};
}

export type Crop = NonNullable<Style["crop"]>;

/**
 * 페이지(라운드)별 크롭을 고른다 — 해당 라운드 값 우선, 없으면 공통 crop(레거시)으로 폴백.
 * 같은 슬롯이라도 페이지마다 다른 그림이 오므로 스케일/위치를 페이지마다 따로 둔다.
 */
export function resolveCrop(style: Style | undefined, round: number): Crop | undefined {
  return style?.cropByRound?.[String(round)] ?? style?.crop;
}

/**
 * crop → 이미지 크롭 스타일. crop 이 있으면 프레임을 cover 로 채우고(잘림은 컨테이너
 * overflow:hidden 이 담당), scale·pan 을 transform 으로 얹는다. 없으면 빈 객체(기본 contain).
 * → 이미지 '크기'는 프레임과 따로 키울 수 있고, 키운 만큼 프레임 영역에서 잘린다.
 */
export function cropImgStyle(c?: Crop): CSSProperties {
  if (!c) return {};
  const base: CSSProperties = { width: "100%", height: "100%", objectFit: "cover" };
  if (c.scale === 1 && !c.x && !c.y) return base;
  return { ...base, transform: `scale(${c.scale}) translate(${(c.x ?? 0) * 100}%, ${(c.y ?? 0) * 100}%)` };
}

/**
 * crop → 이모지/글자 등 비-이미지 콘텐츠의 확대·이동 transform.
 * 이미지처럼 '콘텐츠만' 프레임과 따로 키우고, 키운 만큼 프레임(overflow:hidden)에서 잘리게 한다.
 */
export function cropContentStyle(c?: Crop): CSSProperties {
  if (!c || (c.scale === 1 && !c.x && !c.y)) return {};
  return { transform: `scale(${c.scale}) translate(${(c.x ?? 0) * 100}%, ${(c.y ?? 0) * 100}%)` };
}
