/**
 * EditLayer.tsx — 직접 에디터(M1, "고급" 뒤). 레이아웃 편집만.
 * ------------------------------------------------------------------
 * InteractiveDoc.stage.nodes[].transform 를 직접 수정한다(드래그 이동·모서리 리사이즈·방향키 미세이동).
 * 콘텐츠 교체/대화 편집은 기본 경로(M2 Resolver) 담당 — 여긴 정밀 레이아웃 전용(99% 교사는 안 봄).
 * 각 노드는 라운드0 콘텐츠 미리보기 + 역할 배지로 표시한다.
 */
import { useEffect, useRef, useState, type PointerEvent as RPE, type WheelEvent as RWE } from "react";
import { transformStyle, radiusStyle, cropImgStyle, cropContentStyle, resolveCrop } from "../layout";
import { resolveVisual, type Visual } from "../content";
import { useStageSize } from "../stageSize";
import { useGame } from "../useGame";
import { useAssetUrl } from "../assetStore";
import type { ContentBinding, InteractiveDoc, SceneNode } from "../../schema/interactiveDoc";

/** 현재 편집 페이지(라운드) 콘텐츠를 슬롯에 매핑(셔플 없음 — 편집 미리보기용). */
function roundBindings(doc: InteractiveDoc, idx: number): Record<string, ContentBinding> {
  const m: Record<string, ContentBinding> = {};
  const it = doc.interaction;
  const at = <T,>(rounds: readonly T[]): T => rounds[Math.min(idx, rounds.length - 1)] ?? rounds[0];
  if (it.kind === "tap-the-right-one") {
    const r = at(it.rounds);
    m[it.cueSlotId] = r.cue;
    it.optionSlotIds.forEach((id, i) => { if (r.options[i]) m[id] = r.options[i].content; });
  } else if (it.kind === "match-pair") {
    const r = at(it.rounds);
    it.leftSlotIds.forEach((id, i) => { if (r.pairs[i]) m[id] = r.pairs[i].left; });
    it.rightSlotIds.forEach((id, i) => { if (r.pairs[i]) m[id] = r.pairs[i].right; });
  } else if (it.kind === "connect") {
    const r = at(it.rounds);
    it.leftSlotIds.forEach((id, i) => { if (r.links[i]) m[id] = r.links[i].left; });
    it.rightSlotIds.forEach((id, i) => { if (r.links[i]) m[id] = r.links[i].right; });
  } else if (it.kind === "binary-choice") {
    m[it.promptSlotId] = at(it.rounds).prompt;
  } else if (it.kind === "flip-memory") {
    const faces = at(it.rounds).faces;
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

/** 역할 배지를 교사 언어로 — 문제(단서)와 보기(답)를 또렷이 구분. */
const ROLE_LABEL: Record<string, string> = { cue: "문제", option: "보기", prompt: "문제", slot: "칸" };
function roleLabel(node: SceneNode): string {
  return ROLE_LABEL[node.role ?? ""] ?? node.role ?? node.type;
}

/** 현재 편집 페이지 기준 보기 슬롯과 정답 슬롯 집합(tap·pattern-next만 '정답' 개념). */
function optionInfo(doc: InteractiveDoc, idx: number): { options: Set<string>; correct: Set<string> } {
  const options = new Set<string>();
  const correct = new Set<string>();
  const it = doc.interaction;
  if (it.kind === "tap-the-right-one" || it.kind === "pattern-next") {
    const r = it.rounds[Math.min(idx, it.rounds.length - 1)] ?? it.rounds[0];
    it.optionSlotIds.forEach((id, i) => {
      options.add(id);
      if (r.options[i]?.correct) correct.add(id);
    });
  }
  return { options, correct };
}

type Live = { x: number; y: number; w: number; h: number };
type DragState = { px: number; py: number; base: Live; mode: "move" | "resize" };
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const clampWH = (v: number) => Math.max(0.05, Math.min(1, v));

/**
 * 드래그 중엔 로컬 live 상태로만 그려(스토어 미접촉) 부드럽게 움직이고,
 * 릴리스(pointerup) 때 patchNodeTransform 으로 '한 번만' 커밋한다 → undo 1드래그=1스텝.
 */
function EditNodeBox({
  node, binding, selected, isOption, isCorrect, roundIdx,
}: {
  node: SceneNode; binding?: ContentBinding; selected: boolean; isOption: boolean; isCorrect: boolean; roundIdx: number;
}) {
  const { w: sw, h: sh } = useStageSize();
  const selectNode = useGame((s) => s.selectNode);
  const patch = useGame((s) => s.patchNodeTransform);
  const setContent = useGame((s) => s.setNodeContent);
  const setCorrect = useGame((s) => s.setCorrectOption);
  const setStyle = useGame((s) => s.setNodeStyle);
  const setCrop = useGame((s) => s.setNodeCrop); // 페이지(라운드)별 크롭
  const autoEditNodeId = useGame((s) => s.autoEditNodeId);
  const clearAutoEdit = useGame((s) => s.setAutoEditNode);
  const drag = useRef<DragState | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  // 글자 직접 편집(더블클릭) — 답·단서의 텍스트를 그 자리에서 고친다. 이미지는 프롬프트로 교체.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  // 크롭 모드 — 켜면 박스 이동 대신 이미지를 끌어 위치/줌(휠) 조절(object-fit:cover 위).
  const [cropMode, setCropMode] = useState(false);
  const cropDrag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  const t = node.transform;
  // 이 페이지(라운드)의 크롭 — 같은 슬롯이라도 페이지마다 따로 조절된다.
  const curCrop = resolveCrop(node.style, roundIdx);
  const cur = curCrop ?? { scale: 1, x: 0, y: 0 };
  const view: Live = live ?? { x: t.x, y: t.y, w: t.w, h: t.h };

  const down = (e: RPE<HTMLElement>, mode: "move" | "resize") => {
    if (editing) return; // 글자 편집 중엔 드래그 금지
    e.stopPropagation();
    selectNode(node.id);
    // 크롭 모드: 박스를 옮기지 않고 이미지를 패닝(crop.x/y) — 박스 폭 대비 비율로.
    if (cropMode && mode === "move") {
      cropDrag.current = { px: e.clientX, py: e.clientY, x: cur.x, y: cur.y };
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
      return;
    }
    const base: Live = { x: t.x, y: t.y, w: t.w, h: t.h };
    drag.current = { px: e.clientX, py: e.clientY, base, mode };
    setLive(base);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
  };
  const move = (e: RPE<HTMLElement>) => {
    const cd = cropDrag.current;
    if (cd) {
      const nodeW = Math.max(1, t.w * sw), nodeH = Math.max(1, t.h * sh);
      const nx = Math.max(-0.5, Math.min(0.5, cd.x + (e.clientX - cd.px) / nodeW));
      const ny = Math.max(-0.5, Math.min(0.5, cd.y + (e.clientY - cd.py) / nodeH));
      setCrop(node.id, roundIdx, { scale: cur.scale, x: nx, y: ny });
      return;
    }
    const d = drag.current;
    if (!d || !sw || !sh) return;
    const dx = (e.clientX - d.px) / sw;
    const dy = (e.clientY - d.py) / sh;
    const b = d.base;
    if (d.mode === "move") setLive({ ...b, x: clamp01(b.x + dx), y: clamp01(b.y + dy) });
    else setLive({ ...b, w: clampWH(b.w + dx * 2), h: clampWH(b.h + dy * 2) }); // 중심정렬→양쪽
  };
  const up = (e: RPE<HTMLElement>) => {
    if (cropDrag.current) {
      cropDrag.current = null;
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
      return;
    }
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
  // 크롭 줌 — 휠로 scale 조절(1.0~3.0). 크롭 모드일 때만.
  const onWheel = (e: RWE<HTMLElement>) => {
    if (!cropMode) return;
    e.stopPropagation();
    const next = Math.max(1, Math.min(3, cur.scale + (e.deltaY < 0 ? 0.12 : -0.12)));
    setCrop(node.id, roundIdx, { scale: next, x: cur.x, y: cur.y });
  };

  const vis = previewOf(node, binding);
  const imgUrl = useAssetUrl(vis?.assetKey); // 프롬프트로 만든 그림이 준비되면 미리보기도 그림으로
  const isImage = !!imgUrl;
  const hasVisual = !!vis;
  // 이모지/글자 미리보기를 프레임 크기에 맞춰(WYSIWYG) 렌더 → 크기 조절·잘림이 플레이와 같게 보인다.
  const nodeW = view.w * sw, nodeH = view.h * sh;
  const previewPx = nodeW && nodeH
    ? Math.max(16, vis?.emoji ? Math.min(nodeW, nodeH) * 0.56 : Math.min(nodeH * 0.42, nodeW * 0.3))
    : undefined;
  // 콘텐츠 슬롯(답·단서·짝 등)과 텍스트 노드만 글자 편집 허용 — 장식/빈 슬롯은 제외.
  const editable = !!binding || node.type === "text";

  // 일반 화면에서 더블클릭으로 들어온 경우: 이 노드면 편집을 자동으로 연다(1회 소비).
  // 글자/이모지는 글자 입력창을 열고, '이미지'는 입력창 대신 선택만 — 위 핸들(크기·위치)과
  // 아래 프롬프트("이 자리에 넣을 그림")로 고친다(이미지를 텍스트로 덮어쓰지 않게).
  useEffect(() => {
    if (autoEditNodeId === node.id && !editing) {
      if (editable && !isImage) {
        setDraft(vis?.text ?? "");
        setEditing(true);
      }
      clearAutoEdit(null);
    }
  }, [autoEditNodeId, node.id, editable, isImage, editing, vis?.text, clearAutoEdit]);

  // 모서리 라운드 드래그(우상단 안쪽) — ↙ 둥글게 / ↗ 각지게. setNodeStyle(cornerRadius).
  const radiusDown = (e: RPE<HTMLElement>) => {
    e.stopPropagation();
    selectNode(node.id);
    const sx = e.clientX, sy = e.clientY;
    const nodePx = Math.min(t.w * sw, t.h * sh);
    const maxR = Math.max(0, nodePx / 2);
    const r0 = Math.min(typeof node.style?.cornerRadius === "number" ? node.style.cornerRadius : 16, maxR);
    const mv = (ev: PointerEvent) => {
      const d = ((sx - ev.clientX) + (ev.clientY - sy)) / 2;
      setStyle(node.id, { cornerRadius: Math.round(Math.max(0, Math.min(maxR, r0 + d))) });
    };
    const upR = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", upR); };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", upR);
  };

  // 이미지 크기 핸들(좌상단 안쪽) — 프레임과 '따로' 이미지만 확대/축소(crop.scale).
  // 위로 끌면 커지고, 커진 만큼 프레임 영역(edit-img-wrap overflow:hidden)에서 잘린다.
  const imgScaleDown = (e: RPE<HTMLElement>) => {
    e.stopPropagation();
    selectNode(node.id);
    const sy = e.clientY;
    const c0 = resolveCrop(node.style, roundIdx) ?? { scale: 1, x: 0, y: 0 };
    const mv = (ev: PointerEvent) => {
      const d = (sy - ev.clientY) / 140; // 위로 140px = +1.0 배
      const next = Math.max(1, Math.min(4, c0.scale + d));
      setCrop(node.id, roundIdx, { scale: next, x: c0.x, y: c0.y });
    };
    const upS = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", upS); };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", upS);
  };

  const beginEdit = (e: RPE<HTMLElement>) => {
    if (!editable) return;
    e.stopPropagation();
    selectNode(node.id);
    // 이미지는 글자편집 대신 선택만 — 위 핸들(크기·위치)·프롬프트로 그림을 고친다.
    if (isImage) return;
    e.preventDefault();
    setDraft(vis?.text ?? "");
    setEditing(true);
  };
  const commitEdit = () => {
    setEditing(false);
    const txt = draft.trim();
    if (txt) setContent(node.id, { type: "text", text: txt }); // 답/단서를 텍스트로 교체(이미지였어도 글자로)
  };

  return (
    <div
      className={`edit-node${selected ? " selected" : ""}${editable ? " editable" : ""}${isCorrect ? " correct" : ""}${cropMode ? " cropping" : ""}`}
      style={transformStyle({ ...t, x: view.x, y: view.y, w: view.w, h: view.h })}
      onPointerDown={(e) => down(e, "move")}
      onPointerMove={move}
      onPointerUp={up}
      onWheel={onWheel}
      onDoubleClick={beginEdit}
      title={cropMode ? "끌어서 위치 · 휠로 확대/축소" : editable ? "더블클릭하면 글자 수정 · 프롬프트로 그림 교체" : undefined}
    >
      <span className={`edit-badge${isCorrect ? " is-correct" : isOption ? " is-option" : ""}`}>{roleLabel(node)}</span>
      {/* 정답 표시/지정 — 보기(답) 슬롯에만. 정답이면 '✓ 정답', 아니면 누르면 정답으로 바꾼다. */}
      {isOption && (
        isCorrect ? (
          <span className="edit-correct-badge" aria-label="정답">✓ 정답</span>
        ) : (
          <button
            type="button"
            className="edit-correct-set"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setCorrect(node.id); }}
            title="이 보기를 정답으로"
          >
            정답으로
          </button>
        )
      )}
      {editing ? (
        <input
          className="edit-text-input"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
            else if (e.key === "Escape") { e.preventDefault(); setEditing(false); }
          }}
          onBlur={commitEdit}
          aria-label="답 글자 수정"
        />
      ) : (
        vis && (imgUrl
          ? (
            <div className="edit-img-wrap" style={radiusStyle(node.style)}>
              <img
                className={`edit-preview-img${cropMode || curCrop ? " cropped" : ""}`}
                src={imgUrl}
                alt=""
                draggable={false}
                style={cropImgStyle(curCrop)}
              />
            </div>
          )
          : (
            <div className="edit-img-wrap" style={radiusStyle(node.style)}>
              <span
                className="edit-preview"
                style={{ ...(previewPx ? { fontSize: previewPx } : {}), ...cropContentStyle(curCrop) }}
              >
                {vis.emoji ?? vis.text}
              </span>
            </div>
          ))
      )}
      {/* 콘텐츠 편집 컨트롤 — 콘텐츠 크기(좌상단) · 위치 끌기(좌하단). 모서리 라운드(우상단)는 이미지만. */}
      {selected && !editing && hasVisual && (
        <>
          <span
            className="edit-imgscale-handle"
            onPointerDown={imgScaleDown}
            onDoubleClick={(e) => e.stopPropagation()}
            title={isImage ? "이미지 크기 (위로 끌면 크게 · 프레임에 맞춰 잘림)" : "내용 크기 (위로 끌면 크게 · 프레임에 맞춰 잘림)"}
          >
            ⤢
          </span>
          <button
            type="button"
            className={`edit-crop-btn${cropMode ? " on" : ""}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setCropMode((v) => !v); }}
            title="위치 (켜고 끌어 위치·휠로 확대)"
          >
            {cropMode ? "완료" : "✥ 위치"}
          </button>
          {isImage && (
            <span
              className="edit-radius-handle"
              onPointerDown={radiusDown}
              onDoubleClick={(e) => e.stopPropagation()}
              title="모서리 라운드 (드래그: ↙ 둥글게 · ↗ 각지게)"
            />
          )}
        </>
      )}
      {selected && !editing && !cropMode && (
        <span
          className="edit-handle"
          onPointerDown={(e) => down(e, "resize")}
          onPointerMove={move}
          onPointerUp={up}
          title="프레임 크기 (이미지와 따로 조절)"
        />
      )}
    </div>
  );
}

export function EditLayer() {
  const doc = useGame((s) => s.doc);
  const editRoundIdx = useGame((s) => s.editRoundIdx);
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
  const ri = Math.min(editRoundIdx, doc.interaction.rounds.length - 1);
  const bindings = roundBindings(doc, ri);
  const { options, correct } = optionInfo(doc, ri);
  // 빈 곳(노드 아님) 클릭 = 배경 선택 → 프롬프트로 배경 이미지 생성 대상.
  return (
    <div className={`edit-layer${bgSelected ? " bg-on" : ""}`} onPointerDown={() => selectBg(true)}>
      {bgSelected && (
        <span className="edit-bg-badge" aria-live="polite">🖼 배경 선택됨 — 아래 프롬프트로 배경을 만들어 넣어요</span>
      )}
      {doc.stage.nodes.map((n) => (
        <EditNodeBox
          key={n.id}
          node={n}
          binding={bindings[n.id]}
          selected={n.id === selectedNodeId}
          isOption={options.has(n.id)}
          isCorrect={correct.has(n.id)}
          roundIdx={ri}
        />
      ))}
    </div>
  );
}
