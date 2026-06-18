/**
 * StageBackground.tsx — stage.background가 asset(생성 이미지)이면 무대 전체에 풀블리드로 깐다.
 * 노드 뒤(z 0)에 cover로 깔리고, 없으면 기본 파스텔 그라데이션(.stage-frame) 그대로.
 */
import { useGame } from "./useGame";
import { useAssetUrl } from "./assetStore";

export function StageBackground() {
  const bg = useGame((s) => s.doc?.stage.background);
  const assetId = bg && "type" in bg && bg.type === "asset" ? bg.asset.assetId : undefined;
  const url = useAssetUrl(assetId);
  if (!url) return null;
  return <div className="kv-stage-bg" style={{ backgroundImage: `url("${url}")` }} aria-hidden />;
}
