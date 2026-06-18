/**
 * FindIt.tsx — "숨은그림 찾기". cue가 가리키는 대상을 장면 속 zone에서 찾아 탭.
 * 판정/시퀀싱은 스토어(findTap). 여긴 cue 칩 + zone 탭 타깃 렌더만.
 *  - zone: 반투명 탭 영역(프로토). 찾으면 ✓ + 초록, 빗나가면 빨강+shake.
 *  - 실제 장면 이미지(scene 노드)는 NodeRenderer가 배경으로 그린다.
 */
import { Positioned } from "../NodeRenderer";
import { useGame } from "../useGame";
import type { SceneNode, ContentBinding } from "../../schema/interactiveDoc";

const EMPTY: SceneNode[] = [];

function cueText(c?: ContentBinding | null): string {
  if (!c) return "";
  if (c.type === "text") return c.text;
  if (c.type === "emoji") return c.emoji;
  return "그림";
}

export function FindIt() {
  const doc = useGame((s) => s.doc);
  const findZones = useGame((s) => s.findZones);
  const findList = useGame((s) => s.findList);
  const findIdx = useGame((s) => s.findIdx);
  const busy = useGame((s) => s.busy);
  const findTap = useGame((s) => s.findTap);
  const nodes = doc?.stage.nodes ?? EMPTY;
  const cur = findList[findIdx];

  return (
    <>
      {cur && (
        <div className="find-cue" aria-live="polite">
          🔍 <b>{cueText(cur.cue)}</b> 찾아보세요
        </div>
      )}
      {findZones.map((z) => {
        const node = nodes.find((n) => n.id === z.zoneId);
        if (!node) return null;
        return (
          <Positioned key={z.zoneId} t={node.transform}>
            <button
              type="button"
              className={`find-zone${z.found ? " found" : ""}${z.status === "wrong" ? " wrong" : ""}`}
              disabled={busy || z.found}
              aria-label={z.found ? "찾음" : "여기일까요?"}
              onClick={() => findTap(z.zoneId)}
            >
              {z.found ? "✓" : ""}
            </button>
          </Positioned>
        );
      })}
    </>
  );
}
