/**
 * EditLayer.tsx — 직접 에디터(M1, "고급" 뒤). 레이아웃 편집만.
 * ------------------------------------------------------------------
 * InteractiveDoc.stage.nodes[].transform 를 직접 수정한다(드래그 이동·모서리 리사이즈·방향키 미세이동).
 * 콘텐츠 교체/대화 편집은 기본 경로(M2 Resolver) 담당 — 여긴 정밀 레이아웃 전용(99% 교사는 안 봄).
 * 각 노드는 라운드0 콘텐츠 미리보기 + 역할 배지로 표시한다.
 */
import { useEffect, useRef, type PointerEvent as RPE } from "react";
import { transformStyle } from "../layout";
import { resolveVisual, type Visual } from "../content";
import { useStageSize } from "../stageSize";
import { useGame } from "../useGame";
import type { ContentBinding, InteractiveDoc, SceneNode } from "../../schema/interactiveDoc";

/** 라운드0 콘텐츠를 슬롯에 매핑(셔플 없음 — 편집 미리보기용). */
function roundZeroBindings(doc: InteractiveDoc): Record<string, ContentBinding> {
  const m: Record<string, ContentBinding> = {};
  const it = doc.interaction;
  if (it.kind === "tap-the-right-one") {
    const r = it.rounds[0];
    m[it.cueSlotId] = r.cue;
    it.optionSlotIds.forEach((id, i) => { if (r.options[i]) m[id] = r.options[i].content; });
  } else if (it.kind === "match-pair") {
    const r = it.rounds[0];
    it.leftSlotIds.forEach((id, i) => { if (r.pairs[i]) m[id] = r.pairs[i].left; });
    it.rightSlotIds.forEach((id, i) => { if (r.pairs[i]) m[id] = r.pairs[i].right; });
  } else if (it.kind === "connect") {
    const r = it.rounds[0];
    it.leftSlotIds.forEach((id, i) => { if (r.links[i]) m[id] = r.links[i].left; });
    it.rightSlotIds.forEach((id, i) => { if (r.links[i]) m[id] = r.links[i].right; });
  } else if (it.kind === "binary-choice") {
    m[it.promptSlotId] = it.rounds[0].prompt;
  } else if (it.kind === "flip-memory") {
    const faces = it.rounds[0].faces;
    it.cardSlotIds.forEach((id, i) => { const fa = faces[i % faces.length]; if (fa) m[id] = fa; });
  }
  return m;
}

function previewOf(node: SceneNode, binding?: ContentBinding): Visual | null {
  if (binding) return resolveVisual(binding);
  if (node.type === "sticker" && node.emoji) return { emoji: node.emoji };
  if (node.type === "text") return { text: node.text };
  return null;
}

type DragState = { px: number; py: number; x0: number; y0: number; w0: number; h0: number; mode: "move" | "resize" };

function EditNodeBox({ node, binding, selected }: { node: SceneNode; binding?: ContentBinding; selected: boolean }) {
  const { w: sw, h: sh } = useStageSize();
  const selectNode = useGame((s) => s.selectNode);
  const patch = useGame((s) => s.patchNodeTransform);
  const drag = useRef<DragState | null>(null);

  const down = (e: RPE<HTMLElement>, mode: "move" | "resize") => {
    e.stopPropagation();
    selectNode(node.id);
    drag.current = {
      px: e.clientX, py: e.clientY,
      x0: node.transform.x, y0: node.transform.y, w0: node.transform.w, h0: node.transform.h, mode,
    };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
  };
  const move = (e: RPE<HTMLElement>) => {
    const d = drag.current;
    if (!d || !sw || !sh) return;
    const dx = (e.clientX - d.px) / sw;
    const dy = (e.clientY - d.py) / sh;
    if (d.mode === "move") patch(node.id, { x: d.x0 + dx, y: d.y0 + dy });
    else patch(node.id, { w: d.w0 + dx * 2, h: d.h0 + dy * 2 }); // 중심정렬이라 양쪽으로
  };
  const up = (e: RPE<HTMLElement>) => {
    drag.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
  };

  const vis = previewOf(node, binding);
  return (
    <div
      className={`edit-node${selected ? " selected" : ""}`}
      style={transformStyle(node.transform)}
      onPointerDown={(e) => down(e, "move")}
      onPointerMove={move}
      onPointerUp={up}
    >
      <span className="edit-badge">{node.role ?? node.type}</span>
      {vis && <span className="edit-preview">{vis.emoji ?? vis.text}</span>}
      {selected && (
        <span
          className="edit-handle"
          onPointerDown={(e) => down(e, "resize")}
          onPointerMove={move}
          onPointerUp={up}
        />
      )}
    </div>
  );
}

export function EditLayer() {
  const doc = useGame((s) => s.doc);
  const selectedNodeId = useGame((s) => s.selectedNodeId);
  const selectNode = useGame((s) => s.selectNode);
  const patch = useGame((s) => s.patchNodeTransform);

  // 방향키 미세 이동(선택 노드). Shift=큰 스텝.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useGame.getState();
      const id = st.selectedNodeId;
      if (!id || st.mode !== "edit") return;
      const n = st.doc?.stage.nodes.find((x) => x.id === id);
      if (!n) return;
      const step = e.shiftKey ? 0.05 : 0.01;
      if (e.key === "ArrowLeft") patch(id, { x: n.transform.x - step });
      else if (e.key === "ArrowRight") patch(id, { x: n.transform.x + step });
      else if (e.key === "ArrowUp") patch(id, { y: n.transform.y - step });
      else if (e.key === "ArrowDown") patch(id, { y: n.transform.y + step });
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [patch]);

  if (!doc) return null;
  const bindings = roundZeroBindings(doc);
  return (
    <div className="edit-layer" onPointerDown={() => selectNode(null)}>
      {doc.stage.nodes.map((n) => (
        <EditNodeBox key={n.id} node={n} binding={bindings[n.id]} selected={n.id === selectedNodeId} />
      ))}
    </div>
  );
}
