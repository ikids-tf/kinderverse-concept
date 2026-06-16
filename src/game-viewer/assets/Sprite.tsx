/**
 * Sprite.tsx — OpenMoji 에셋을 컬러/실루엣으로 그리는 공용 컴포넌트.
 * 부모가 크기를 정한다(템플릿이 motion.div 로 감싸 애니메이션). 읽기 의존 0 —
 * 라벨은 aria-label/alt 로만(시각). 로드 실패 시 조용히 빈 칸(게임 흐름 유지).
 */
import { useEffect, useState } from "react";
import type { GameAsset, GameSpec } from "../schema/gameSpec";
import { colorImgStyle, maskStyleFromUrl, openmojiUrl, refWithoutVS, silhouetteMaskStyle } from "./openmoji";

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
  // 0=원본 ref, 1=FE0F 제거 폴백, 2=실패(빈 칸). refCode 바뀌면 0으로 리셋.
  const [stage, setStage] = useState<0 | 1 | 2>(0);
  useEffect(() => setStage(0), [refCode]);

  if (mode === "silhouette") {
    return <div role="img" aria-label={label} style={silhouetteMaskStyle(refCode, color)} />;
  }

  if (stage === 2) {
    // 폴백: 로드 실패해도 자리는 지킨다(레이아웃 안 깨지게).
    return <div aria-label={label} role="img" style={{ width: "100%", height: "100%" }} />;
  }

  const src = stage === 0 ? openmojiUrl(refCode) : openmojiUrl(refWithoutVS(refCode));
  return (
    <img
      src={src}
      alt={label}
      draggable={false}
      style={colorImgStyle}
      onError={() => {
        // 1차 실패 → FE0F 뺀 파일명으로 재시도(있으면), 그래도 실패면 빈 칸.
        setStage((s) => (s === 0 && refWithoutVS(refCode) !== normalizeRefSafe(refCode) ? 1 : 2));
      }}
    />
  );
}

/** refWithoutVS 비교용 — 정규화된 원본(대문자/하이픈)과 동일한지 보려고. */
function normalizeRefSafe(ref: string): string {
  return ref.trim().toUpperCase().replace(/U\+/g, "").replace(/\s+/g, "-");
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
  // teacher/generated — 처리된 이미지 URL. 실루엣은 누낀 이미지를 CSS 마스크로 단색화.
  const colorUrl = asset.source === "teacher" ? asset.processedUrl : asset.url;
  const silUrl = asset.source === "teacher" ? asset.silhouetteUrl ?? asset.processedUrl : asset.url;
  if (mode === "silhouette") {
    if (!silUrl) return <div role="img" aria-label={asset.label} style={{ width: "100%", height: "100%" }} />;
    return <div role="img" aria-label={asset.label} style={maskStyleFromUrl(silUrl, color ?? "#5A5A66")} />;
  }
  if (!colorUrl) return <div role="img" aria-label={asset.label} style={{ width: "100%", height: "100%" }} />;
  return <img src={colorUrl} alt={asset.label} draggable={false} style={colorImgStyle} />;
}
