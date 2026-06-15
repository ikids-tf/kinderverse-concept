/**
 * Sprite.tsx — OpenMoji 에셋을 컬러/실루엣으로 그리는 공용 컴포넌트.
 * 부모가 크기를 정한다(템플릿이 motion.div 로 감싸 애니메이션). 읽기 의존 0 —
 * 라벨은 aria-label/alt 로만(시각). 로드 실패 시 조용히 빈 칸(게임 흐름 유지).
 */
import { useState } from "react";
import type { GameAsset, GameSpec } from "../schema/gameSpec";
import { colorImgStyle, openmojiUrl, silhouetteMaskStyle } from "./openmoji";

/** spec.assets 에서 id로 에셋을 찾는다(없으면 undefined — 호출부에서 방어). */
export function findAsset(spec: GameSpec, id: string): GameAsset | undefined {
  return spec.assets.find((a) => a.id === id);
}

interface SpriteProps {
  /** OpenMoji hexcode (단일 또는 ZWJ 결합) */
  refCode: string;
  /** 접근성 라벨(한국어). 화면 텍스트는 보조이므로 시각 라벨은 별도 */
  label: string;
  /** 'color' = 원본 컬러, 'silhouette' = 단색 실루엣 */
  mode?: "color" | "silhouette";
  /** 실루엣 색 (mode='silhouette'일 때) */
  color?: string;
}

export function Sprite({ refCode, label, mode = "color", color = "#5A5A66" }: SpriteProps) {
  const [failed, setFailed] = useState(false);

  if (mode === "silhouette") {
    return <div role="img" aria-label={label} style={silhouetteMaskStyle(refCode, color)} />;
  }

  if (failed) {
    // 폴백: 로드 실패해도 자리는 지킨다(레이아웃 안 깨지게).
    return <div aria-label={label} role="img" style={{ width: "100%", height: "100%" }} />;
  }

  return (
    <img
      src={openmojiUrl(refCode)}
      alt={label}
      draggable={false}
      style={colorImgStyle}
      onError={() => setFailed(true)}
    />
  );
}

/**
 * AssetSprite — GameAsset(출처 무관)을 그린다. 템플릿은 에셋 출처를 몰라도 된다
 * (GameSpec 계약의 핵심). M1은 openmoji-only지만 teacher/generated도 흡수한다.
 */
export function AssetSprite({
  asset,
  mode = "color",
  color,
}: {
  asset: GameAsset;
  mode?: "color" | "silhouette";
  color?: string;
}) {
  if (asset.source === "openmoji") {
    return <Sprite refCode={asset.ref} label={asset.label} mode={mode} color={color} />;
  }
  // teacher/generated — 처리된 이미지 URL을 직접 사용.
  const url =
    asset.source === "teacher"
      ? mode === "silhouette"
        ? asset.silhouetteUrl ?? asset.processedUrl
        : asset.processedUrl
      : asset.url;
  if (!url) return <div role="img" aria-label={asset.label} style={{ width: "100%", height: "100%" }} />;
  return <img src={url} alt={asset.label} draggable={false} style={colorImgStyle} />;
}
