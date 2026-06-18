/**
 * MaterialsLayer.tsx — 게임 위 '자료(요소)' 자유 레이어 (확장성의 핵심).
 * ------------------------------------------------------------------
 * 교사가 올린 글자/그림/버튼/프레임을 무대 위에 그리고, 드래그 이동·모서리 리사이즈·삭제한다.
 * My Board와 동일한 단축키/복수선택을 지원해 사용자가 혼란스럽지 않게 한다:
 *  - Shift+클릭 누적선택 · 빈 곳 드래그 박스선택 · ⌘/Ctrl+A 전체선택 · Esc 해제
 *  - Delete/Backspace 삭제 · ⌘/Ctrl+D 복제 · ⌘/Ctrl+C·V 복사/붙여넣기 · 방향키 미세이동
 * 편집 UX: 요소 호버 → ✎ → 그 아래 인스펙터. 배경 클릭 = 선택 해제. 인터랙션 엔진 불변.
 */
import { useEffect, useRef, useState, type PointerEvent as RPE } from "react";
import { useStageSize } from "./stageSize";
import { useGame } from "./useGame";
import { useMaterials, type Material, type MaterialStyle } from "./materials";

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const clampWH = (v: number) => Math.max(0.06, Math.min(1, v));
type Live = { x: number; y: number; w: number; h: number; rot: number };
type Drag =
  | { px: number; py: number; base: Live; mode: "resize"; moved: boolean; corner: number }
  | { cx: number; cy: number; startAng: number; startRot: number; mode: "rotate"; moved: boolean }
  | { px: number; py: number; mode: "move"; moved: boolean; group: Record<string, { x: number; y: number }> };

// My Board와 동일: 모서리(4) 핸들 — 0=좌상 1=우상 2=우하 3=좌하.
const CORNERS: Array<{ l: string; t: string; cursor: string }> = [
  { l: "0%", t: "0%", cursor: "nwse-resize" },
  { l: "100%", t: "0%", cursor: "nesw-resize" },
  { l: "100%", t: "100%", cursor: "nwse-resize" },
  { l: "0%", t: "100%", cursor: "nesw-resize" },
];

const BG_SWATCHES = ["var(--coral)", "#FFD66B", "#9BD0F5", "#A7E0B5", "#F6B8D0", "#C9B8F2", "#FFFFFF", "#5B5750"];
const FG_SWATCHES = ["#FFFFFF", "#5B5750", "var(--coral)"];

/** 선택 요소 스타일 인스펙터 — 요소 아래에 뜨는 편집툴. */
function Inspector({ m }: { m: Material }) {
  const update = useMaterials((s) => s.update);
  const setStyle = useMaterials((s) => s.setStyle);
  const editable = m.kind === "text" || m.kind === "button";
  const styled = m.kind === "button" || m.kind === "frame";
  const swatch = (which: "bg" | "fg", c: string) => (
    <button
      key={which + c}
      type="button"
      className={`kv-swatch${m.style?.[which] === c ? " on" : ""}`}
      style={{ background: c }}
      aria-label={`색 ${c}`}
      onClick={() => setStyle(m.id, { [which]: c } as MaterialStyle)}
    />
  );
  return (
    <div className="kv-inspector" onPointerDown={(e) => e.stopPropagation()}>
      {editable && (
        <label className="kv-insp-row">
          <span>글자</span>
          <input value={m.value} onChange={(e) => update(m.id, { value: e.target.value })} placeholder="글자 입력" />
        </label>
      )}
      {styled && (
        <>
          <div className="kv-insp-row">
            <span>{m.kind === "frame" ? "테두리색" : "배경색"}</span>
            <div className="kv-swatches">{BG_SWATCHES.map((c) => swatch("bg", c))}</div>
          </div>
          <label className="kv-insp-row">
            <span>라운드</span>
            <input
              type="range" min={0} max={1} step={0.05}
              value={m.style?.radius ?? 0}
              onChange={(e) => setStyle(m.id, { radius: Number(e.target.value) })}
            />
          </label>
        </>
      )}
      {(m.kind === "button" || m.kind === "text") && (
        <div className="kv-insp-row">
          <span>글자색</span>
          <div className="kv-swatches">{FG_SWATCHES.map((c) => swatch("fg", c))}</div>
        </div>
      )}
      {m.kind === "button" && (
        <button
          type="button"
          className={`kv-insp-correct${m.correct ? " on" : ""}`}
          onClick={() => update(m.id, { correct: !m.correct })}
        >
          {m.correct ? "✓ 정답 버튼" : "정답으로 표시"}
        </button>
      )}
    </div>
  );
}

function MaterialBox({ m, selected, sole, editing }: { m: Material; selected: boolean; sole: boolean; editing: boolean }) {
  const { w: sw, h: sh } = useStageSize();
  const update = useMaterials((s) => s.update);
  const remove = useMaterials((s) => s.remove);
  const select = useMaterials((s) => s.select);
  const setPositions = useMaterials((s) => s.setPositions);
  const setEditId = useMaterials((s) => s.setEditId);
  const connectMode = useMaterials((s) => s.connectMode);
  const connectFrom = useMaterials((s) => s.connectFrom);
  const pickConnect = useMaterials((s) => s.pickConnect);
  const drag = useRef<Drag | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [hover, setHover] = useState(false);
  const [fb, setFb] = useState<"ok" | "no" | null>(null);
  const fbTimer = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const view = live ?? { x: m.x, y: m.y, w: m.w, h: m.h, rot: m.rot ?? 0 };
  const canEdit = m.kind === "text" || m.kind === "button" || m.kind === "frame";

  // 모서리 드래그 → 반대 모서리 고정 박스 리사이즈(회전 반영). My Board resizeBox와 동질.
  const resizeFrom = (d: Extract<Drag, { mode: "resize" }>, e: { clientX: number; clientY: number }): Live => {
    const ndx = (e.clientX - d.px) / sw;
    const ndy = (e.clientY - d.py) / sh;
    const rad = (d.base.rot * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const ldx = ndx * cos + ndy * sin; // 회전 좌표계(로컬)로 변환
    const ldy = -ndx * sin + ndy * cos;
    const sgnW = d.corner === 1 || d.corner === 2 ? 1 : -1; // 우측 모서리면 +
    const sgnH = d.corner === 2 || d.corner === 3 ? 1 : -1; // 하단 모서리면 +
    const w = clampWH(d.base.w + sgnW * ldx);
    const h = clampWH(d.base.h + sgnH * ldy);
    const lcx = (sgnW * (w - d.base.w)) / 2; // 중심 이동(로컬) — 반대 모서리 고정
    const lcy = (sgnH * (h - d.base.h)) / 2;
    const csx = lcx * cos - lcy * sin; // 다시 캔버스 좌표계로
    const csy = lcx * sin + lcy * cos;
    return { x: clamp01(d.base.x + csx), y: clamp01(d.base.y + csy), w, h, rot: d.base.rot };
  };

  const down = (e: RPE<HTMLElement>, mode: "move" | "resize", corner = 2) => {
    e.stopPropagation();
    if (connectMode && mode === "move") { pickConnect(m.id); return; }
    if (mode === "move" && e.shiftKey) { select(m.id, true); return; } // 누적선택(드래그 X)
    // 이미 복수선택에 포함됐으면 선택 유지(그룹 이동), 아니면 단일 선택
    const st = useMaterials.getState();
    const inGroup = st.selectedIds.includes(m.id) && st.selectedIds.length > 1;
    if (!inGroup) select(m.id);
    if (mode === "resize") {
      drag.current = { px: e.clientX, py: e.clientY, base: { x: m.x, y: m.y, w: m.w, h: m.h, rot: m.rot ?? 0 }, mode: "resize", moved: false, corner };
      setLive({ x: m.x, y: m.y, w: m.w, h: m.h, rot: m.rot ?? 0 });
    } else {
      const ids = inGroup ? st.selectedIds : [m.id];
      const group: Record<string, { x: number; y: number }> = {};
      ids.forEach((id) => { const it = st.items.find((x) => x.id === id); if (it) group[id] = { x: it.x, y: it.y }; });
      drag.current = { px: e.clientX, py: e.clientY, mode: "move", moved: false, group };
      if (!inGroup) setLive({ x: m.x, y: m.y, w: m.w, h: m.h, rot: m.rot ?? 0 });
    }
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
  };
  // 회전 핸들 — My Board rotate와 동일(중심 기준 각도, Shift=15° 스냅).
  const rotateDown = (e: RPE<HTMLElement>) => {
    e.stopPropagation();
    select(m.id);
    const r = boxRef.current?.getBoundingClientRect();
    const cx = r ? r.left + r.width / 2 : e.clientX;
    const cy = r ? r.top + r.height / 2 : e.clientY;
    drag.current = { mode: "rotate", cx, cy, startAng: Math.atan2(e.clientY - cy, e.clientX - cx), startRot: m.rot ?? 0, moved: false };
    setLive({ x: m.x, y: m.y, w: m.w, h: m.h, rot: m.rot ?? 0 });
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
  };
  const moveE = (e: RPE<HTMLElement>) => {
    const d = drag.current;
    if (!d || !sw || !sh) return;
    if (d.mode === "rotate") {
      const ang = Math.atan2(e.clientY - d.cy, e.clientX - d.cx);
      let deg = d.startRot + ((ang - d.startAng) * 180) / Math.PI;
      if (e.shiftKey) deg = Math.round(deg / 15) * 15;
      d.moved = true;
      setLive({ x: m.x, y: m.y, w: m.w, h: m.h, rot: deg });
      return;
    }
    const dx = (e.clientX - d.px) / sw;
    const dy = (e.clientY - d.py) / sh;
    if (Math.abs(dx) > 0.004 || Math.abs(dy) > 0.004) d.moved = true;
    if (d.mode === "resize") {
      setLive(resizeFrom(d, e));
    } else {
      const ids = Object.keys(d.group);
      if (ids.length > 1) {
        const map: Record<string, { x: number; y: number }> = {};
        ids.forEach((id) => (map[id] = { x: clamp01(d.group[id].x + dx), y: clamp01(d.group[id].y + dy) }));
        setPositions(map);
      } else {
        const b = d.group[m.id];
        if (b) setLive({ x: clamp01(b.x + dx), y: clamp01(b.y + dy), w: m.w, h: m.h, rot: m.rot ?? 0 });
      }
    }
  };
  const up = (e: RPE<HTMLElement>) => {
    const d = drag.current;
    drag.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    if (d && sw && sh) {
      if (d.mode === "rotate") {
        const ang = Math.atan2(e.clientY - d.cy, e.clientX - d.cx);
        let deg = d.startRot + ((ang - d.startAng) * 180) / Math.PI;
        if (e.shiftKey) deg = Math.round(deg / 15) * 15;
        update(m.id, { rot: ((Math.round(deg) % 360) + 360) % 360 });
      } else if (d.mode === "resize") {
        const r = resizeFrom(d, e);
        update(m.id, { x: r.x, y: r.y, w: r.w, h: r.h });
      } else if (Object.keys(d.group).length > 1) {
        const dx = (e.clientX - d.px) / sw;
        const dy = (e.clientY - d.py) / sh;
        const map: Record<string, { x: number; y: number }> = {};
        Object.keys(d.group).forEach((id) => (map[id] = { x: clamp01(d.group[id].x + dx), y: clamp01(d.group[id].y + dy) }));
        setPositions(map);
      } else {
        const dx = (e.clientX - d.px) / sw;
        const dy = (e.clientY - d.py) / sh;
        const b = d.group[m.id];
        if (b) update(m.id, { x: clamp01(b.x + dx), y: clamp01(b.y + dy) });
        if (!d.moved && m.kind === "button") {
          const ok = !!m.correct;
          setFb(ok ? "ok" : "no");
          if (fbTimer.current) window.clearTimeout(fbTimer.current);
          fbTimer.current = window.setTimeout(() => setFb(null), 750);
        }
      }
    }
    setLive(null);
  };
  useEffect(() => () => { if (fbTimer.current) window.clearTimeout(fbTimer.current); }, []);

  const onFrameFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        update(m.id, { value: reader.result, mediaKind: file.type.startsWith("video/") ? "video" : "image" });
      }
    };
    reader.readAsDataURL(file);
  };

  const radius = m.style?.radius;
  const minPx = Math.min(view.w * sw, view.h * sh);
  const style: React.CSSProperties = {
    left: `${view.x * 100}%`, top: `${view.y * 100}%`,
    width: `${view.w * 100}%`, height: `${view.h * 100}%`,
    transform: `translate(-50%,-50%)${view.rot ? ` rotate(${view.rot}deg)` : ""}`,
  };
  const pxW = view.w * sw;
  const pxH = view.h * sh;
  const emojiPx = Math.max(16, Math.min(pxW, pxH) * 0.8);
  const textPx = Math.max(13, Math.min(pxH * 0.5, pxW * 0.2));
  const btnPx = Math.max(13, Math.min(pxH * 0.42, pxW * 0.16));

  const animCls = !live && !editing && m.anim && m.anim !== "none" ? ` kv-anim-${m.anim}` : "";
  const fbCls = fb ? ` fb-${fb}` : "";
  const pendingCls = connectFrom === m.id ? " connect-pending" : "";
  const showEditBtn = hover && sole && !connectMode && !editing && canEdit;

  return (
    <div
      ref={boxRef}
      data-mid={m.id}
      className={`kv-material kv-mat-${m.kind}${selected ? " selected" : ""}${editing ? " editing" : ""}${animCls}${fbCls}${pendingCls}`}
      style={style}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onPointerDown={(e) => down(e, "move")}
      onPointerMove={moveE}
      onPointerUp={up}
      onDoubleClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent("kv:center", { detail: { cx: m.x * sw } })); }}
    >
      {m.kind === "image" ? (
        <img src={m.value} alt="" draggable={false} />
      ) : m.kind === "text" ? (
        <span
          className={`kv-material-text jua${m.style?.bg ? " kv-boxed" : ""}`}
          style={{
            fontSize: textPx, color: m.style?.fg, background: m.style?.bg,
            borderRadius: m.style?.bg && radius != null ? `${(radius * minPx) / 2}px` : undefined,
          }}
        >
          {m.value}
        </span>
      ) : m.kind === "button" ? (
        <span
          className="kv-material-btn"
          style={{
            fontSize: btnPx, background: m.style?.bg, color: m.style?.fg,
            borderRadius: radius != null ? `${(radius * minPx) / 2}px` : undefined,
          }}
        >
          {m.value}
        </span>
      ) : m.kind === "frame" ? (
        <div
          className="kv-material-frame"
          style={{ borderRadius: radius != null ? `${(radius * minPx) / 2}px` : undefined, borderColor: m.style?.bg }}
        >
          {m.value ? (
            m.mediaKind === "video" ? (
              <video src={m.value} muted loop autoPlay playsInline />
            ) : (
              <img src={m.value} alt="" draggable={false} />
            )
          ) : (
            <span className="kv-frame-empty" aria-hidden>＋</span>
          )}
        </div>
      ) : (
        <span className="kv-material-emoji" style={{ fontSize: emojiPx }}>{m.value}</span>
      )}

      {showEditBtn && (
        <button
          type="button" className="kv-material-edit" title="편집" aria-label="편집"
          onPointerDown={(e) => e.stopPropagation()} onClick={() => setEditId(m.id)}
        >✎</button>
      )}

      {sole && !connectMode && (
        <>
          <button
            type="button" className="kv-material-del" title="삭제" aria-label="삭제"
            onPointerDown={(e) => e.stopPropagation()} onClick={() => remove(m.id)}
          >✕</button>
          {m.kind === "frame" && (
            <>
              <button
                type="button" className="kv-frame-upload" title="미디어 넣기" aria-label="미디어 넣기"
                onPointerDown={(e) => e.stopPropagation()} onClick={() => fileRef.current?.click()}
              >🖼</button>
              <input ref={fileRef} type="file" accept="image/*,video/*" hidden onChange={onFrameFile} />
            </>
          )}
          {/* 바운드박스 — My Board와 동일: 모서리 4개 리사이즈 + 위쪽 회전 핸들(연결선). */}
          <span className="kv-mat-rotline" aria-hidden />
          <span
            className="kv-mat-rot" title="회전 (드래그 · Shift=15°)"
            onPointerDown={rotateDown} onPointerMove={moveE} onPointerUp={up}
          />
          {CORNERS.map((c, i) => (
            <span
              key={i}
              className="kv-mat-corner"
              title="크기 조절 (드래그)"
              style={{ left: c.l, top: c.t, cursor: c.cursor }}
              onPointerDown={(e) => down(e, "resize", i)}
              onPointerMove={moveE}
              onPointerUp={up}
            />
          ))}
        </>
      )}

      {editing && <Inspector m={m} />}
    </div>
  );
}

/** 선 잇기 커넥터 — 무대 위 SVG 오버레이(요소 중심을 잇는다). */
function Connectors() {
  const items = useMaterials((s) => s.items);
  const connections = useMaterials((s) => s.connections);
  const removeConnection = useMaterials((s) => s.removeConnection);
  const connectMode = useMaterials((s) => s.connectMode);
  if (connections.length === 0) return null;
  const pos = new Map(items.map((m) => [m.id, m]));
  return (
    <svg className="kv-connectors" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      {connections.map((c) => {
        const a = pos.get(c.from);
        const b = pos.get(c.to);
        if (!a || !b) return null;
        return (
          <line
            key={c.id} x1={a.x * 100} y1={a.y * 100} x2={b.x * 100} y2={b.y * 100}
            className={`kv-connector-line${connectMode ? " editable" : ""}`}
            onClick={() => connectMode && removeConnection(c.id)}
          />
        );
      })}
    </svg>
  );
}

/** 빈 곳 클릭 = 해제, 빈 곳 드래그 = 박스선택, 단축키(보드 동일). */
const KEEP_SELECTOR =
  ".kv-material, .kv-edit-rail, .kv-rail-fly, .kv-inspector, .kv-gpbar-wrap, .kv-connect-hint, .chrome, .kv-menu, .kv-fs-bar";

function useBoardShortcuts() {
  const [box, setBox] = useState<{ l: number; t: number; r: number; b: number } | null>(null);
  useEffect(() => {
    let start: { x: number; y: number } | null = null;
    let dragging = false;
    const onDown = (e: PointerEvent) => {
      const t = e.target;
      if (e.button !== 0) return;
      if (t instanceof Element && t.closest(KEEP_SELECTOR)) return;
      if (e.shiftKey || (window as Window & { __kvSpace?: boolean }).__kvSpace) return; // 팬은 별도
      start = { x: e.clientX, y: e.clientY };
      dragging = false;
    };
    const onMove = (e: PointerEvent) => {
      if (!start) return;
      if (!dragging && (Math.abs(e.clientX - start.x) > 4 || Math.abs(e.clientY - start.y) > 4)) dragging = true;
      if (dragging) {
        setBox({
          l: Math.min(start.x, e.clientX), t: Math.min(start.y, e.clientY),
          r: Math.max(start.x, e.clientX), b: Math.max(start.y, e.clientY),
        });
      }
    };
    const onUp = (e: PointerEvent) => {
      if (!start) return;
      const st = useMaterials.getState();
      if (dragging) {
        const sel: string[] = [];
        document.querySelectorAll<HTMLElement>(".kv-material[data-mid]").forEach((el) => {
          const r = el.getBoundingClientRect();
          const bx = { l: Math.min(start!.x, e.clientX), t: Math.min(start!.y, e.clientY), r: Math.max(start!.x, e.clientX), b: Math.max(start!.y, e.clientY) };
          if (r.left < bx.r && r.right > bx.l && r.top < bx.b && r.bottom > bx.t) sel.push(el.dataset.mid!);
        });
        st.setSelection(sel);
      } else if (st.selectedId || st.editId) {
        st.select(null);
        st.setEditId(null);
      }
      start = null; dragging = false; setBox(null);
    };
    const isTyping = () => {
      const a = document.activeElement as HTMLElement | null;
      return !!a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable);
    };
    const onKey = (e: KeyboardEvent) => {
      if (isTyping()) return;
      const st = useMaterials.getState();
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === "Escape") { st.select(null); st.setEditId(null); st.setConnectMode(false); return; }
      // 실행취소 / 다시실행 (⌘/Ctrl+Z · ⌘/Ctrl+Shift+Z · Ctrl+Y)
      if (mod && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        if (e.shiftKey) useMaterials.temporal.getState().redo();
        else useMaterials.temporal.getState().undo();
        st.select(null); st.setEditId(null);
        return;
      }
      if (mod && (e.key === "y" || e.key === "Y")) { e.preventDefault(); useMaterials.temporal.getState().redo(); st.select(null); st.setEditId(null); return; }
      if (e.key === "Delete" || e.key === "Backspace") { if (st.selectedIds.length) { e.preventDefault(); st.removeSelected(); } return; }
      if (mod && (e.key === "a" || e.key === "A")) { if (st.items.length) { e.preventDefault(); st.selectAll(); } return; }
      if (mod && (e.key === "d" || e.key === "D")) { if (st.selectedIds.length) { e.preventDefault(); st.duplicateSelected(); } return; }
      if (mod && (e.key === "c" || e.key === "C")) { if (st.selectedIds.length) st.copySelected(); return; }
      if (mod && (e.key === "v" || e.key === "V")) { st.paste(); return; }
      if (e.key.startsWith("Arrow") && st.selectedIds.length) {
        e.preventDefault();
        const step = e.shiftKey ? 0.05 : 0.01;
        if (e.key === "ArrowLeft") st.nudgeSelected(-step, 0);
        else if (e.key === "ArrowRight") st.nudgeSelected(step, 0);
        else if (e.key === "ArrowUp") st.nudgeSelected(0, -step);
        else if (e.key === "ArrowDown") st.nudgeSelected(0, step);
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  return box;
}

export function MaterialsLayer() {
  const items = useMaterials((s) => s.items);
  const selectedIds = useMaterials((s) => s.selectedIds);
  const editId = useMaterials((s) => s.editId);
  const clear = useMaterials((s) => s.clear);
  const docId = useGame((s) => s.doc?.meta.id);
  const box = useBoardShortcuts();

  useEffect(() => { clear(); useMaterials.temporal.getState().clear(); }, [docId, clear]);

  if (items.length === 0 && !box) return null;
  const selSet = new Set(selectedIds);
  return (
    <div className="kv-materials">
      <Connectors />
      {items.map((m) => (
        <MaterialBox
          key={m.id}
          m={m}
          selected={selSet.has(m.id)}
          sole={selectedIds.length === 1 && selSet.has(m.id)}
          editing={m.id === editId}
        />
      ))}
      {box && (
        <div
          className="kv-boxselect"
          style={{ position: "fixed", left: box.l, top: box.t, width: box.r - box.l, height: box.b - box.t }}
          aria-hidden
        />
      )}
    </div>
  );
}
