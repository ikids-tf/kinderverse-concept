/**
 * layout.ts — 노드 transform(정규화 0..1)을 무대 absolute 스타일로. 렌더러·에디터 공용.
 * (컴포넌트 파일에서 분리해 fast-refresh 경고를 피하고 재사용한다.)
 */
import type { CSSProperties } from "react";
import type { SceneNode } from "../schema/interactiveDoc";

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
