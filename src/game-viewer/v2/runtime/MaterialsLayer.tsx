/**
 * MaterialsLayer.tsx — 게임 위 '자료(요소)' 자유 레이어 (확장성의 핵심).
 * ------------------------------------------------------------------
 * 교사가 올린 스티커/글자/그림을 무대 위에 그리고, 드래그 이동·모서리 리사이즈·삭제한다.
 * 드래그 좌표는 EditLayer와 동일(무대 픽셀로 나눠 정규화). 레이어는 pointer-events:none이라
 * 빈 곳 클릭은 게임으로 통과하고, 개별 자료만 이벤트를 받는다(게임 플레이 방해 0).
 * 새 게임 로드(doc.meta.id 변경) 시 자료를 비운다(활동 단위).
 */
import { useEffect, useRef, useState, type PointerEvent as RPE } from "react";
import { useStageSize } from "./stageSize";
import { useGame } from "./useGame";
import { useMaterials, type Material } from "./materials";

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const clampWH = (v: number) => Math.max(0.06, Math.min(1, v));
type Live = { x: number; y: number; w: number; h: number };
type Drag = { px: number; py: number; base: Live; mode: "move" | "resize" };

function MaterialBox({ m, selected }: { m: Material; selected: boolean }) {
  const { w: sw, h: sh } = useStageSize();
  const update = useMaterials((s) => s.update);
  const remove = useMaterials((s) => s.remove);
  const select = useMaterials((s) => s.select);
  const drag = useRef<Drag | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  const view = live ?? { x: m.x, y: m.y, w: m.w, h: m.h };

  const down = (e: RPE<HTMLElement>, mode: "move" | "resize") => {
    e.stopPropagation();
    select(m.id);
    drag.current = { px: e.clientX, py: e.clientY, base: { x: m.x, y: m.y, w: m.w, h: m.h }, mode };
    setLive({ x: m.x, y: m.y, w: m.w, h: m.h });
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
  };
  const moveE = (e: RPE<HTMLElement>) => {
    const d = drag.current;
    if (!d || !sw || !sh) return;
    const dx = (e.clientX - d.px) / sw;
    const dy = (e.clientY - d.py) / sh;
    const b = d.base;
    if (d.mode === "move") setLive({ ...b, x: clamp01(b.x + dx), y: clamp01(b.y + dy) });
    else setLive({ ...b, w: clampWH(b.w + dx * 2), h: clampWH(b.h + dy * 2) });
  };
  const up = (e: RPE<HTMLElement>) => {
    const d = drag.current;
    drag.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    if (d && sw && sh) {
      const dx = (e.clientX - d.px) / sw;
      const dy = (e.clientY - d.py) / sh;
      const b = d.base;
      if (d.mode === "move") update(m.id, { x: clamp01(b.x + dx), y: clamp01(b.y + dy) });
      else update(m.id, { w: clampWH(b.w + dx * 2), h: clampWH(b.h + dy * 2) });
    }
    setLive(null);
  };

  const style: React.CSSProperties = {
    left: `${view.x * 100}%`,
    top: `${view.y * 100}%`,
    width: `${view.w * 100}%`,
    height: `${view.h * 100}%`,
    transform: "translate(-50%,-50%)",
  };
  // 폰트는 무대 픽셀 기준으로 계산(컨테이너 쿼리 단위 대신 — 게임 렌더러와 동일 방식).
  const pxW = view.w * sw;
  const pxH = view.h * sh;
  const emojiPx = Math.max(16, Math.min(pxW, pxH) * 0.8);
  const textPx = Math.max(13, Math.min(pxH * 0.5, pxW * 0.2));

  return (
    <div
      className={`kv-material kv-mat-${m.kind}${selected ? " selected" : ""}`}
      style={style}
      onPointerDown={(e) => down(e, "move")}
      onPointerMove={moveE}
      onPointerUp={up}
    >
      {m.kind === "image" ? (
        <img src={m.value} alt="" draggable={false} />
      ) : m.kind === "text" ? (
        <span className="kv-material-text jua" style={{ fontSize: textPx }}>{m.value}</span>
      ) : (
        <span className="kv-material-emoji" style={{ fontSize: emojiPx }}>{m.value}</span>
      )}
      {selected && (
        <>
          <button
            type="button"
            className="kv-material-del"
            title="자료 삭제"
            aria-label="자료 삭제"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => remove(m.id)}
          >
            ✕
          </button>
          <span className="kv-material-handle" onPointerDown={(e) => down(e, "resize")} onPointerMove={moveE} onPointerUp={up} />
        </>
      )}
    </div>
  );
}

export function MaterialsLayer() {
  const items = useMaterials((s) => s.items);
  const selectedId = useMaterials((s) => s.selectedId);
  const clear = useMaterials((s) => s.clear);
  const docId = useGame((s) => s.doc?.meta.id);

  // 새 게임(활동)으로 바뀌면 자료를 비운다.
  useEffect(() => {
    clear();
  }, [docId, clear]);

  if (items.length === 0) return null;
  return (
    <div className="kv-materials">
      {items.map((m) => (
        <MaterialBox key={m.id} m={m} selected={m.id === selectedId} />
      ))}
    </div>
  );
}
