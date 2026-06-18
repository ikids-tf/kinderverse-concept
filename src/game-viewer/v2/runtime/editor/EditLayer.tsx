/**
 * EditLayer.tsx — 직접 에디터(M1, "고급" 뒤). 레이아웃 편집만.
 * ------------------------------------------------------------------
 * InteractiveDoc.stage.nodes[].transform 를 직접 수정한다(드래그 이동·모서리 리사이즈·방향키 미세이동).
 * 콘텐츠 교체/대화 편집은 기본 경로(M2 Resolver) 담당 — 여긴 정밀 레이아웃 전용(99% 교사는 안 봄).
 * 각 노드는 라운드0 콘텐츠 미리보기 + 역할 배지로 표시한다.
 */
import { useEffect, useRef, useState, type PointerEvent as RPE } from "react";
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

type Live = { x: number; y: number; w: number; h: number };
type DragState = { px: number; py: number; base: Live; mode: "move" | "resize" };
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const clampWH = (v: number) => Math.max(0.05, Math.min(1, v));

/**
 * 드래그 중엔 로컬 live 상태로만 그려(스토어 미접촉) 부드럽게 움직이고,
 * 릴리스(pointerup) 때 patchNodeTransform 으로 '한 번만' 커밋한다 → undo 1드래그=1스텝.
 */
function EditNodeBox({ node, binding, selected }: { node: SceneNode; binding?: ContentBinding; selected: boolean }) {
  const { w: sw, h: sh } = useStageSize();
  const selectNode = useGame((s) => s.selectNode);
  const patch = useGame((s) => s.patchNodeTransform);
  const drag = useRef<DragState | null>(null);
  const [live, setLive] = useState<Live | null>(null);

  const t = node.transform;
  const view: Live = live ?? { x: t.x, y: t.y, w: t.w, h: t.h };

  const down = (e: RPE<HTMLElement>, mode: "move" | "resize") => {
    e.stopPropagation();
    selectNode(node.id);
    const base: Live = { x: t.x, y: t.y, w: t.w, h: t.h };
    drag.current = { px: e.clientX, py: e.clientY, base, mode };
    setLive(base);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
  };
  const move = (e: RPE<HTMLElement>) => {
    const d = drag.current;
    if (!d || !sw || !sh) return;
    const dx = (e.clientX - d.px) / sw;
    const dy = (e.clientY - d.py) / sh;
    const b = d.base;
    if (d.mode === "move") setLive({ ...b, x: clamp01(b.x + dx), y: clamp01(b.y + dy) });
    else setLive({ ...b, w: clampWH(b.w + dx * 2), h: clampWH(b.h + dy * 2) }); // 중심정렬→양쪽
  };
  const up = (e: RPE<HTMLElement>) => {
    const d = drag.current;
    drag.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    if (d && sw && sh) {
      const dx = (e.clientX - d.px) / sw;
      const dy = (e.clientY - d.py) / sh;
      const b = d.base;
      if (d.mode === "move") patch(node.id, { x: b.x + dx, y: b.y + dy });
      else patch(node.id, { w: b.w + dx * 2, h: b.h + dy * 2 });
    }
    setLive(null);
  };

  const vis = previewOf(node, binding);
  return (
    <div
      className={`edit-node${selected ? " selected" : ""}`}
      style={transformStyle({ ...t, x: view.x, y: view.y, w: view.w, h: view.h })}
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
  const bgSelected = useGame((s) => s.bgSelected);
  const selectBg = useGame((s) => s.selectBg);
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
  // 빈 곳(노드 아님) 클릭 = 배경 선택 → 프롬프트로 배경 이미지 생성 대상.
  return (
    <div className={`edit-layer${bgSelected ? " bg-on" : ""}`} onPointerDown={() => selectBg(true)}>
      {bgSelected && (
        <span className="edit-bg-badge" aria-live="polite">🖼 배경 선택됨 — 아래 프롬프트로 배경을 만들어 넣어요</span>
      )}
      {doc.stage.nodes.map((n) => (
        <EditNodeBox key={n.id} node={n} binding={bindings[n.id]} selected={n.id === selectedNodeId} />
      ))}
    </div>
  );
}
