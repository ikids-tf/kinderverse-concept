// 놀이기록 렌더 엔진 — DesignFrame(자유 캔버스) + 요소 렌더러/편집기(ControlPanel·EditableEl·DesignEl 등).
// components/BoardItem.jsx 에서 추출한 자립형 모듈. 공용 디자인 캔버스로 재사용된다.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Rnd } from "react-rnd";
import { X, Image as ImageIcon, Copy, FlipHorizontal, RotateCw, RefreshCw } from "lucide-react";
import { cutout as runCutout } from "./cutout";
import { DECO_IMAGES } from "./decoManifest";
import "./playrecord.css";

// A4 1장 높이(px). 프레임이 이보다 높으면(여러 장짜리 문서) 각 A4 경계에 안내선을 그린다.
const A4_PAGE_H = 1123;

export function DesignFrame({ data, selected, zoom = 1, onChange, photos, decoAssets, onRegenerate }) {
  const { frame, elements = [] } = data;
  const wrapRef = useRef(null);
  const [scale, setScale] = useState(0.33);
  const [activeId, setActiveId] = useState(null);
  const [editId, setEditId] = useState(null);
  const [lightboxSrc, setLightboxSrc] = useState(null); // 사진 크게보기
  const [selIds, setSelIds] = useState([]); // 복수 선택(shift/cmd 클릭)
  // 레이어 순서(z-order) 버튼 직후에는 선택 요소를 '실제 배열 순서 z'로 렌더 → 앞으로/뒤로 결과가 즉시 눈에 보임.
  // (평소엔 선택한 스티커를 위로 띄워(z20) 편집을 돕지만, 그러면 '맨 앞'을 눌러도 이미 위에 있어 변화가 안 보인다.)
  const [flatZ, setFlatZ] = useState(false);
  // 꾸미기 그림 갤러리(요소 미선택 시) — 기본 닫힘. 사용자가 '꾸미기 그림' 버튼으로 연다.
  const [showDeco, setShowDeco] = useState(false);
  const histRef = useRef([]); // 실행취소 스택(요소 배열 스냅샷, 무제한)

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth / frame.w);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [frame.w]);

  // 모든 요소 변경의 단일 통로 — 변경 직전 스냅샷을 실행취소 스택에 push(무제한)
  const commit = (nextElements) => {
    histRef.current.push(elements);
    onChange?.({ elements: nextElements });
  };
  const undo = () => {
    if (!histRef.current.length) return;
    onChange?.({ elements: histRef.current.pop() });
  };
  const updateEl = (id, patch) =>
    commit(elements.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const removeEl = (id) => commit(elements.filter((e) => e.id !== id));
  const removeMany = (ids) => commit(elements.filter((e) => !ids.includes(e.id)));
  // 요소 이동 — 복수 선택 시 선택된 요소들을 같은 델타로 함께 이동
  const moveEl = (id, x, y) => {
    const el = elements.find((e) => e.id === id);
    if (!el) return;
    if (selIds.length > 1 && selIds.includes(id)) {
      const dx = Math.round(x) - el.x, dy = Math.round(y) - el.y;
      commit(elements.map((e) => (selIds.includes(e.id) && !e.locked ? { ...e, x: e.x + dx, y: e.y + dy } : e)));
    } else {
      commit(elements.map((e) => (e.id === id ? { ...e, x: Math.round(x), y: Math.round(y) } : e)));
    }
  };
  // 선택 — shift/cmd/ctrl 시 복수 토글, 아니면 단일
  const selectEl = (id, e) => {
    setFlatZ(false); // 새 선택/재클릭 → 편집용 띄우기(z20) 복귀
    if (e && (e.shiftKey || e.metaKey || e.ctrlKey)) {
      setSelIds((prev) => {
        const base = prev.length ? prev : (activeId ? [activeId] : []);
        return base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
      });
    } else {
      setSelIds([id]);
    }
    setActiveId(id);
  };
  const duplicateEl = (id) => {
    const src = elements.find((e) => e.id === id);
    if (!src) return;
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = `el_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    copy.x = Math.round((copy.x || 0) + 18);
    copy.y = Math.round((copy.y || 0) + 18);
    commit([...elements, copy]);
    setActiveId(copy.id); setSelIds([copy.id]);
  };
  // 빈 공간 선택(아무 요소도 선택 안 됨) 상태에서 꾸미기 그림을 누르면 새 스티커로 추가
  const addDecoEl = (url) => {
    const W = 130, n = elements.length, off = (n % 6) * 16 - 40;
    const el = {
      id: `el_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      type: "image", src: url, fit: "contain", cutout: false, sticker: true,
      x: Math.round(frame.w / 2 - W / 2 + off), y: Math.round(frame.h / 2 - W / 2 + off),
      w: W, h: W, rotation: 0, style: { radius: 0 },
    };
    commit([...elements, el]);
    setActiveId(el.id); setSelIds([el.id]);
  };
  const deselect = () => { setActiveId(null); setSelIds([]); setEditId(null); };

  // 두 사각형이 겹치는지
  const overlaps = (a, b) =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  // 겹친 레이어 위에서 클릭(드래그 아님) → 순서는 그대로 두고 "아래 겹친 요소"를 선택만 (비파괴)
  const cycleSelect = (id) => {
    const cur = elements.find((e) => e.id === id);
    if (!cur) return;
    // 겹치고 잠금 아닌 요소들을 배열(시각 아래→위) 순서로. cur 포함.
    const stack = elements.filter((e) => !e.locked && overlaps(e, cur));
    if (stack.length <= 1) return; // 겹친 게 없으면 선택 유지
    const idx = stack.findIndex((e) => e.id === id);
    const next = stack[(idx - 1 + stack.length) % stack.length]; // 시각적으로 바로 아래로 순환
    setActiveId(next.id); setSelIds([next.id]);
  };

  // 명시적 z-순서 변경 (잠금 배경은 항상 최하단 유지)
  const reorder = (id, where) => {
    const cur = elements.find((e) => e.id === id);
    if (!cur || cur.locked) return;
    const rest = elements.filter((e) => e.id !== id);
    let lo = 0; // 잠금(배경) 레이어 개수 = 이동 가능한 하한
    while (lo < rest.length && rest[lo].locked) lo++;
    const curIdx = elements.findIndex((e) => e.id === id);
    let at;
    if (where === "front") at = rest.length;
    else if (where === "back") at = lo;
    else if (where === "forward") at = Math.min(rest.length, curIdx + 1);
    else at = Math.max(lo, curIdx - 1); // backward
    commit([...rest.slice(0, at), cur, ...rest.slice(at)]);
    setFlatZ(true); // 재정렬 결과를 실제 순서 그대로 즉시 보여줌(다음 선택/이동 때 해제)
  };

  const rndScale = scale * (zoom || 1);
  const activeEl = selected ? elements.find((e) => e.id === activeId && !e.locked) : null;
  // 편집 패널을 선택 요소 '반대편'에 띄운다 — 요소가 문서 오른쪽 절반에 있으면 패널을 왼쪽으로
  // 보내 선택한 리소스를 가리지 않게(좁은 카드의 문서 위 오버레이에서만 좌우 플립, 집중 편집은
  // 패널이 이미 문서 밖이라 CSS에서 무시).
  const panelSide = activeEl && activeEl.x + (activeEl.w || 0) / 2 > frame.w / 2 ? 'left' : 'right';

  // 요소 복사/붙여넣기/복제 (편집 디자인 내부). 보드 단축키와 충돌 않게 stopPropagation.
  const outerRef = useRef(null);
  const elClip = useRef(null);
  const pasteEl = () => {
    const src = elClip.current;
    if (!src) return;
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = `el_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    copy.x = Math.round((copy.x || 0) + 18);
    copy.y = Math.round((copy.y || 0) + 18);
    elClip.current = JSON.parse(JSON.stringify(copy)); // 연속 붙여넣기 누적 오프셋
    commit([...elements, copy]);
    setActiveId(copy.id); setSelIds([copy.id]);
  };
  const onFrameKey = (e) => {
    if (editId) return; // 텍스트 편집 중엔 무시
    const mod = e.metaKey || e.ctrlKey;
    const cur = elements.find((el) => el.id === activeId && !el.locked);
    const k = e.key.toLowerCase();
    if (mod && k === "z" && !e.shiftKey) { e.stopPropagation(); e.preventDefault(); undo(); }
    else if (mod && k === "c" && cur) { e.stopPropagation(); elClip.current = JSON.parse(JSON.stringify(cur)); }
    else if (mod && k === "v" && elClip.current) { e.stopPropagation(); e.preventDefault(); pasteEl(); }
    else if (mod && k === "d" && cur) { e.stopPropagation(); e.preventDefault(); elClip.current = JSON.parse(JSON.stringify(cur)); pasteEl(); }
    else if (e.key === "Delete" || e.key === "Backspace") {
      const ids = (selIds.length ? selIds : (cur ? [cur.id] : [])).filter((id) => { const el = elements.find((x) => x.id === id); return el && !el.locked; });
      if (ids.length) { e.stopPropagation(); removeMany(ids); setActiveId(null); setSelIds([]); }
    }
    else if (e.key === "Escape") { setActiveId(null); setSelIds([]); }
  };
  // 요소 선택 시 프레임에 포커스 → 단축키가 프레임에서 처리(보드 핸들러로 새지 않게)
  useEffect(() => {
    if (selected && activeId && !editId) outerRef.current?.focus({ preventScroll: true });
  }, [activeId, editId, selected]);

  return (
    <div className={`dframe-outer${activeId || showDeco ? " pe-panel-open" : ""}`} ref={outerRef} tabIndex={-1} onKeyDown={onFrameKey} style={{ outline: "none" }}>
      <div className="dframe-wrap" ref={wrapRef} style={frame.h > A4_PAGE_H + 4 ? { overflowY: "auto", overflowX: "hidden" } : undefined}>
        <div
          className="dframe"
          onMouseDown={(e) => { if (selected && !e.target.closest(".del")) deselect(); }}
          style={{
            width: frame.w,
            height: frame.h,
            background: frame.bg,
            transform: `scale(${scale})`,
          }}
        >
          {elements.map((el) =>
            selected && !el.locked ? (
              <EditableEl
                key={el.id}
                el={el}
                scale={rndScale}
                active={selIds.includes(el.id)}
                flatZ={flatZ}
                editing={editId === el.id}
                onSelect={(e) => selectEl(el.id, e)}
                onCycle={() => cycleSelect(el.id)}
                onEdit={() => setEditId(el.id)}
                onEndEdit={() => setEditId(null)}
                onEnlarge={(src) => src && setLightboxSrc(src)}
                onChange={(p) => updateEl(el.id, p)}
                onMove={(x, y) => moveEl(el.id, x, y)}
                onDuplicate={() => duplicateEl(el.id)}
                onDelete={() => { removeEl(el.id); setActiveId(null); setSelIds([]); }}
                onRegenerate={onRegenerate}
              />
            ) : (
              // 잠긴(locked) 요소는 정적 렌더 + 클릭 통과(pointerEvents:none) → 위에 겹친
              // 잠긴 스티커/데코가 아래 편집 텍스트·사진 선택을 막지 않게 한다.
              <DesignEl key={el.id} el={el} frozen={selected} />
            )
          )}
          {/* A4 페이지 경계 안내선 — 프레임이 A4 1장보다 높으면(다중 페이지) 각 경계에 점선.
              class="a4-guide" 는 PNG 저장 시 제외(편집 보조선일 뿐, 인쇄물엔 안 나옴). */}
          {frame.h > A4_PAGE_H + 4 &&
            Array.from({ length: Math.floor((frame.h - 4) / A4_PAGE_H) }, (_, i) => (i + 1) * A4_PAGE_H)
              .filter((y) => y < frame.h - 4)
              .map((y, i) => (
                <div key={`a4g${y}`} className="a4-guide" style={{ position: "absolute", left: 0, top: y, width: frame.w, height: 0, borderTop: "2px dashed #d0a53f", pointerEvents: "none", zIndex: 9998 }}>
                  <span style={{ position: "absolute", right: 12, top: -30, fontSize: 16, lineHeight: 1, color: "#a9741f", background: "#fff7e4", padding: "5px 14px", borderRadius: 12, fontFamily: "'SUIT', sans-serif", fontWeight: 700, border: "1.5px solid #e7cf94", whiteSpace: "nowrap" }}>
                    ↑ {i + 1}페이지 · {i + 2}페이지 ↓
                  </span>
                </div>
              ))}
        </div>
        {/* 스크롤 스페이서 — .dframe 는 position:absolute(레이아웃 높이 0)라, 여러 장(A4 초과) 문서에서
            래퍼가 스크롤되도록 스케일된 문서 높이만큼 자리를 차지하는 빈 블록을 둔다. */}
        {frame.h > A4_PAGE_H + 4 && <div aria-hidden style={{ height: Math.ceil(frame.h * scale), width: 1, pointerEvents: "none" }} />}
      </div>

      {/* 컨트롤 패널 — 카드 바깥(오른쪽)에 띄워 내용을 가리지 않음 */}
      {activeEl && (
        <ControlPanel
          el={activeEl}
          side={panelSide}
          photos={photos}
          decoAssets={decoAssets}
          onChange={(p) => updateEl(activeEl.id, p)}
          onReorder={(where) => reorder(activeEl.id, where)}
          onEnlarge={(src) => src && setLightboxSrc(src)}
          onRemove={() => {
            removeEl(activeEl.id);
            setActiveId(null); setSelIds([]);
          }}
          onClose={() => { setActiveId(null); setSelIds([]); }}
        />
      )}
      {/* 요소 미선택 상태의 편집툴(꾸미기 갤러리)은 기본 닫힘 — 버튼을 눌러야 열린다. */}
      {selected && !activeEl && Array.isArray(decoAssets) && decoAssets.length > 0 && !showDeco && (
        <button className="dpanel-fab" onPointerDown={(e) => e.stopPropagation()} onClick={() => setShowDeco(true)} title="꾸미기 그림 추가">
          ✨ 꾸미기 그림
        </button>
      )}
      {selected && !activeEl && Array.isArray(decoAssets) && decoAssets.length > 0 && showDeco && (
        <div className="dpanel" onPointerDown={(e) => e.stopPropagation()}>
          <div className="dpanel-head">
            <span>꾸미기 그림 추가</span>
            <button className="dpanel-x" onClick={() => setShowDeco(false)} title="닫기">×</button>
          </div>
          <div className="dpanel-sublabel">그림을 누르면 캔버스에 추가돼요</div>
          <div className="dpanel-gallery">
            {decoAssets.map((g) => (
              <button key={g.url} className="dpanel-thumb" title={g.label} onClick={() => addDecoEl(g.url)}>
                <img src={g.url} alt={g.label} draggable={false} />
              </button>
            ))}
          </div>
        </div>
      )}
      <PhotoLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
    </div>
  );
}

// 사진 크게보기 라이트박스 (pv-lightbox 스타일 재사용)
function PhotoLightbox({ src, onClose }) {
  useEffect(() => {
    if (!src) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [src, onClose]);
  if (!src) return null;
  return createPortal(
    <div className="pv-lightbox" onClick={onClose} role="dialog" aria-modal="true">
      <button className="pv-lb-x" onClick={onClose} aria-label="닫기"><X size={22} /></button>
      <img src={src} alt="확대 사진" onClick={(e) => e.stopPropagation()} draggable={false} />
    </div>,
    document.body
  );
}

// ── 우측 고정 컨트롤 패널 (선택된 요소 1개를 한 곳에서 편집) ──
function ControlPanel({ el, side = 'right', onChange, onReorder, onRemove, onClose, photos, decoAssets, onEnlarge }) {
  const s = el.style || {};
  const isText = el.type === "text";
  const isImage = el.type === "image" || el.type === "photo";
  const onUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onChange({ src: reader.result });
    reader.readAsDataURL(file);
    e.target.value = "";
  };
  const setStyle = (patch) => onChange({ style: { ...s, ...patch } });
  const baseFs = s._basefs ?? s.fontSize ?? 14;
  const setSize = (mult) => setStyle({ _basefs: baseFs, fontSize: Math.round(baseFs * mult) });
  const stop = (e) => e.stopPropagation();

  // 텍스트 레이어 분류 (TitleTextLayer / ContentTextLayer)
  const isTitle = el.textRole === "title";
  // 역할별 스타일 프리셋 (한 번의 onChange 로 textRole + style 동시 변경)
  const applyPreset = (role) =>
    role === "title"
      ? onChange({ textRole: "title", style: { ...s, weight: 800, stroke: "#FFFFFF", strokeWidth: 3 } })
      : onChange({ textRole: "content", style: { ...s, weight: 400, stroke: undefined, strokeWidth: undefined } });

  // 통합 편집 패널 — 타입은 칩으로만 표시(도형/텍스트/이미지 공통 도구)
  const typeChip = isText ? (isTitle ? "제목" : "본문") : isImage ? "이미지" : "도형";

  return (
    <div
      className={"dpanel" + (side === 'left' ? " dpanel-left" : "")}
      onPointerDown={stop}
      onMouseDown={stop}
      onWheel={stop}
      onDoubleClick={stop}
    >
      <div className="dpanel-head">
        <span>
          편집 <span className="dpanel-chip">{typeChip}</span>
        </span>
        <button className="dpanel-x" onClick={onClose} title="닫기">
          <X size={13} />
        </button>
      </div>

      {/* 레이어 순서 (z-order) — 자주 쓰므로 패널 상단에 둔다(갤러리 아래로 스크롤 불필요) */}
      {onReorder && (
        <div className="dpanel-sec">
          <div className="dpanel-label">레이어 순서</div>
          <div className="dpanel-btn-row">
            <button className="dpanel-size" title="맨 앞으로" onClick={() => onReorder("front")}>⤒ 맨 앞</button>
            <button className="dpanel-size" title="앞으로" onClick={() => onReorder("forward")}>↑ 앞</button>
            <button className="dpanel-size" title="뒤로" onClick={() => onReorder("backward")}>↓ 뒤</button>
            <button className="dpanel-size" title="맨 뒤로" onClick={() => onReorder("back")}>⤓ 맨 뒤</button>
          </div>
        </div>
      )}

      {/* 투명도 */}
      <div className="dpanel-sec">
        <div className="dpanel-label">투명도</div>
        <input
          type="range"
          min="0"
          max="100"
          value={Math.round((s.opacity ?? 1) * 100)}
          onChange={(e) => setStyle({ opacity: Number(e.target.value) / 100 })}
        />
      </div>

      {/* 색상 (텍스트=글자색 / 도형=배경) */}
      {!isImage && (
        <div className="dpanel-sec">
          <div className="dpanel-label">색상</div>
          {/* 스포이드/직접 선택 (네이티브 컬러 피커) */}
          <div className="dpanel-eyedrop">
            <input
              type="color"
              className="dpanel-color-input"
              value={(() => {
                const c = isText ? s.color : s.bg;
                return typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c) ? c : "#ffffff";
              })()}
              onInput={(e) => setStyle(isText ? { color: e.target.value } : { bg: e.target.value })}
              title="스포이드 / 직접 색 선택"
            />
            <span className="dpanel-eyedrop-label">스포이드 / 직접 선택</span>
          </div>
          {COLOR_GROUPS.map((g) => (
            <div key={g.name} className="dpanel-grp">
              <div className="dpanel-grp-name">{g.name}</div>
              <div className="dpanel-sw-row">
                {g.colors.map((c, i) => (
                  <button
                    key={i}
                    className="del-sw"
                    style={{ background: c }}
                    title={c}
                    onClick={() => setStyle(isText ? { color: c } : { bg: c })}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 텍스트: 레이어 종류(제목/본문) 프리셋 */}
      {isText && (
        <div className="dpanel-sec">
          <div className="dpanel-label">텍스트 종류</div>
          <div className="dpanel-btn-row">
            <button
              className={"dpanel-size" + (isTitle ? " on" : "")}
              onClick={() => applyPreset("title")}
            >
              제목
            </button>
            <button
              className={"dpanel-size" + (!isTitle ? " on" : "")}
              onClick={() => applyPreset("content")}
            >
              본문
            </button>
          </div>
        </div>
      )}

      {/* 텍스트: 폰트 + 크기 */}
      {isText && (
        <>
          <div className="dpanel-sec">
            <div className="dpanel-label">글꼴</div>
            <div className="dpanel-btn-row">
              {FONTS.map((f) => (
                <button
                  key={f.name}
                  className={"del-font" + (s.fontFamily === f.css ? " on" : "")}
                  style={{ fontFamily: f.css }}
                  onClick={() => setStyle({ fontFamily: f.css })}
                  title={f.name}
                >
                  가
                </button>
              ))}
            </div>
          </div>
          <div className="dpanel-sec">
            <div className="dpanel-label">크기</div>
            <div className="dpanel-btn-row">
              <button className="dpanel-size" onClick={() => setSize(0.82)}>작게</button>
              <button className="dpanel-size" onClick={() => setSize(1)}>중간</button>
              <button className="dpanel-size" onClick={() => setSize(1.4)}>크게</button>
            </div>
          </div>
          {/* 텍스트 외곽선(stroke) */}
          <div className="dpanel-sec">
            <div className="dpanel-label">외곽선</div>
            <div className="dpanel-btn-row">
              <button
                className={"dpanel-size" + (s.stroke ? "" : " on")}
                onClick={() => setStyle({ stroke: undefined, strokeWidth: undefined })}
              >없음</button>
              <button
                className={"dpanel-size" + (s.stroke ? " on" : "")}
                onClick={() => setStyle({ stroke: s.stroke || "#FFFFFF", strokeWidth: s.strokeWidth ?? 3 })}
              >켜기</button>
            </div>
            {s.stroke && (
              <>
                <div className="dpanel-btn-row" style={{ marginTop: 6 }}>
                  <button className={"dpanel-size" + ((s.strokeWidth ?? 3) <= 2 ? " on" : "")} onClick={() => setStyle({ strokeWidth: 2 })}>얇게</button>
                  <button className={"dpanel-size" + ((s.strokeWidth ?? 3) === 3 ? " on" : "")} onClick={() => setStyle({ strokeWidth: 3 })}>보통</button>
                  <button className={"dpanel-size" + ((s.strokeWidth ?? 3) >= 5 ? " on" : "")} onClick={() => setStyle({ strokeWidth: 5 })}>두껍게</button>
                </div>
                <div className="dpanel-eyedrop" style={{ marginTop: 6 }}>
                  <input
                    type="color"
                    className="dpanel-color-input"
                    value={typeof s.stroke === "string" && /^#[0-9a-fA-F]{6}$/.test(s.stroke) ? s.stroke : "#ffffff"}
                    onInput={(e) => setStyle({ stroke: e.target.value })}
                    title="외곽선 색"
                  />
                  <span className="dpanel-eyedrop-label">외곽선 색</span>
                </div>
                <div className="dpanel-sw-row" style={{ marginTop: 6 }}>
                  {["#FFFFFF", "#000000", "#5B53A8", "#E0791A", "#3E72A8", "#B05A82"].map((c) => (
                    <button key={c} className="del-sw" style={{ background: c }} title={c} onClick={() => setStyle({ stroke: c })} />
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* 이미지/사진: 직접 업로드 · 첨부 사진 선택 · 비우기 · 꾸미기 그림 */}
      {isImage && (
        <div className="dpanel-sec">
          {el.src && (
            <button
              className="dpanel-upload"
              style={{ marginBottom: 8, background: "#5B53A8", color: "#fff", borderColor: "#5B53A8" }}
              title="사진 크게 보기 (더블클릭으로도 가능)"
              onClick={() => onEnlarge?.(el.src)}
            >
              🔍 크게 보기
            </button>
          )}
          {el.src && (
            <button
              className="dpanel-upload"
              style={{ marginBottom: 8, background: el.silhouette ? "#474747" : "#fff", color: el.silhouette ? "#fff" : "#474747", borderColor: "#474747" }}
              title="그림을 진회색 그림자(실루엣)로 바꿉니다 — 그림자 짝짓기용"
              onClick={() => onChange({ silhouette: !el.silhouette })}
            >
              {el.silhouette ? "🌑 원래 색으로" : "🌑 그림자로 바꾸기"}
            </button>
          )}
          {el.src && el.silhouette && (
            <div className="dpanel-sec" style={{ marginBottom: 8 }}>
              <div className="dpanel-label">그림자 색 (검정 ~ 연회색)</div>
              <input
                type="range" min="0" max="70"
                value={Math.round((el.shadowLevel ?? 0.28) * 100)}
                onChange={(e) => onChange({ shadowLevel: Number(e.target.value) / 100 })}
              />
            </div>
          )}
          <div className="dpanel-label">사진 넣기</div>
          <label className="dpanel-upload" title="내 기기에서 사진 업로드">
            <input type="file" accept="image/*" hidden onChange={onUpload} />
            ⬆ 직접 업로드
          </label>
          {Array.isArray(photos) && photos.length > 0 && (
            <>
              <div className="dpanel-sublabel">첨부한 사진</div>
              <div className="dpanel-gallery">
                {photos.map((src, i) => (
                  <button
                    key={i}
                    className={"dpanel-thumb" + (el.src === src ? " on" : "")}
                    title={`사진 ${i + 1}`}
                    onClick={() => onChange({ src })}
                  >
                    <img src={src} alt={`사진 ${i + 1}`} draggable={false} />
                  </button>
                ))}
              </div>
            </>
          )}
          {el.src && (
            <button className="dpanel-size" style={{ marginTop: 6 }} onClick={() => onChange({ src: null })}>
              사진 자리 비우기
            </button>
          )}
          {Array.isArray(decoAssets) && decoAssets.length > 0 && (
            <>
              <div className="dpanel-sublabel">주제 그림</div>
              <div className="dpanel-gallery">
                {decoAssets.map((g) => (
                  <button
                    key={g.url}
                    className={"dpanel-thumb" + (el.src === g.url ? " on" : "")}
                    title={g.label}
                    onClick={() => onChange({ src: g.url, cutout: false })}
                  >
                    <img src={g.url} alt={g.label} draggable={false} />
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="dpanel-sublabel">꾸미기 그림</div>
          <div className="dpanel-gallery">
            {DECO_IMAGES.map((g) => (
              <button
                key={g.url}
                className={"dpanel-thumb" + (el.src === g.url ? " on" : "")}
                title={g.label}
                onClick={() => onChange({ src: g.url, cutout: true })}
              >
                <img src={g.url} alt={g.label} draggable={false} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 사진 프레임: 비율 가이드 + 테두리 두께 · 색 */}
      {isImage && (
        <div className="dpanel-sec">
          <div className="dpanel-label">사진 비율 (가로:세로)</div>
          <div className="dpanel-btn-row">
            {[["4:3", 4 / 3], ["3:4", 3 / 4], ["1:1", 1], ["16:9", 16 / 9]].map(([lbl, r]) => (
              <button
                key={lbl}
                className="dpanel-size"
                title={`${lbl} 비율로 맞춤`}
                onClick={() => onChange({ h: Math.max(40, Math.round(el.w / r)) })}
              >
                {lbl}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 10, color: "#9b8b7d", marginTop: 4 }}>크기 조절 시 비율이 유지돼요 (모서리 드래그)</div>

          <div className="dpanel-label" style={{ marginTop: 10 }}>테두리 두께 <span style={{ color: "#9b8b7d", fontWeight: 400 }}>{s.strokeWidth || 0}px</span></div>
          <input
            type="range"
            min="0"
            max="40"
            value={s.strokeWidth || 0}
            onChange={(e) => setStyle({ stroke: s.stroke || "#ffffff", strokeWidth: Number(e.target.value) })}
          />

          <div className="dpanel-label" style={{ marginTop: 8 }}>테두리 색</div>
          <div className="dpanel-eyedrop">
            <input
              type="color"
              className="dpanel-color-input"
              value={typeof s.stroke === "string" && /^#[0-9a-fA-F]{6}$/.test(s.stroke) ? s.stroke : "#ffffff"}
              onInput={(e) => setStyle({ stroke: e.target.value, strokeWidth: s.strokeWidth || 12 })}
              title="스포이드 / 직접 색 선택"
            />
            <span className="dpanel-eyedrop-label">스포이드 / 직접 선택</span>
          </div>
          {COLOR_GROUPS.filter((g) => g.name !== "그라데이션").map((g) => (
            <div key={g.name} className="dpanel-grp">
              <div className="dpanel-grp-name">{g.name}</div>
              <div className="dpanel-sw-row">
                {g.colors.map((c, i) => (
                  <button
                    key={i}
                    className="del-sw"
                    style={{ background: c }}
                    title={c}
                    onClick={() => setStyle({ stroke: c, strokeWidth: s.strokeWidth || 12 })}
                  />
                ))}
              </div>
            </div>
          ))}
          <div className="dpanel-grp">
            <div className="dpanel-grp-name">기본</div>
            <div className="dpanel-sw-row">
              {["#ffffff", "#223160", "#000000", "#e07a5f", "#f2c14e", "#3fae6a", "#3b82d6"].map((c, i) => (
                <button key={i} className="del-sw" style={{ background: c }} title={c} onClick={() => setStyle({ stroke: c, strokeWidth: s.strokeWidth || 12 })} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 회전 — 직접 각도 입력 + 버튼 + 슬라이더 */}
      <div className="dpanel-sec">
        <div className="dpanel-label">회전</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
          <input
            type="number"
            min="-360"
            max="360"
            step="1"
            value={Math.round(el.rotation || 0)}
            onPointerDown={(e) => e.stopPropagation()}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "" || v === "-") return; // 입력 중
              onChange({ rotation: Math.max(-360, Math.min(360, Math.round(Number(v) || 0))) });
            }}
            style={{ width: 64, textAlign: "center", border: "1px solid var(--border,#ddd)", borderRadius: 7, padding: "5px 6px", fontSize: 12 }}
          />
          <span style={{ color: "#9b8b7d", fontSize: 12 }}>도(°)</span>
        </div>
        <div className="dpanel-btn-row">
          <button className="dpanel-size" title="왼쪽으로 15°" onClick={() => onChange({ rotation: Math.round((el.rotation || 0) - 15) })}>↺ -15°</button>
          <button className="dpanel-size" title="오른쪽으로 15°" onClick={() => onChange({ rotation: Math.round((el.rotation || 0) + 15) })}>↻ +15°</button>
          <button className="dpanel-size" title="회전 초기화" onClick={() => onChange({ rotation: 0 })}>초기화</button>
        </div>
        <input
          type="range"
          min="-180"
          max="180"
          value={Math.round(el.rotation || 0)}
          onChange={(e) => onChange({ rotation: Number(e.target.value) })}
        />
      </div>

      <div className="dpanel-btn-row" style={{ marginTop: "auto" }}>
        <button
          className={"dpanel-size" + (el.hidden ? " on" : "")}
          onClick={() => onChange({ hidden: !el.hidden })}
        >
          {el.hidden ? "보이기" : "숨기기"}
        </button>
        <button className="dpanel-del" style={{ marginTop: 0, flex: 1 }} onClick={onRemove}>
          <X size={12} /> 삭제
        </button>
      </div>
    </div>
  );
}

function elTextStyle(s = {}) {
  const valign =
    s.valign === "top" ? "flex-start" : s.valign === "bottom" ? "flex-end" : "center";
  const st = {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    justifyContent: valign,
    textAlign: s.align || "left",
    whiteSpace: "pre-line",
    fontSize: s.fontSize,
    fontWeight: s.weight,
    fontFamily: s.fontFamily,
    color: s.color,
    lineHeight: 1.35,
  };
  if (s.stroke) {
    // 외곽선: stroke 를 글자 뒤에 먼저 그려(paintOrder) 본문이 또렷하게
    st.WebkitTextStrokeWidth = (s.strokeWidth ?? 3) + "px";
    st.WebkitTextStrokeColor = s.stroke;
    st.paintOrder = "stroke fill";
  }
  return st;
}

// 유아 친화 대표 폰트 (index.html / index.css 에서 로드)
const FONTS = [
  { name: "팝(ONE Mobile POP)", css: "'ONE Mobile POP', sans-serif" },
  { name: "둥근(Cafe24)", css: "'Cafe24Ssurround', sans-serif" },
  { name: "동글(Jua)", css: "'Jua', sans-serif" },
  { name: "굵은둥근(Black Han Sans)", css: "'Black Han Sans', sans-serif" },
  { name: "본문(SUIT)", css: "'SUIT', sans-serif" },
  { name: "손글씨(Gaegu)", css: "'Gaegu', cursive" },
  { name: "손글씨·또렷(나눔펜)", css: "'Nanum Pen Script', cursive" },
  { name: "굵은(Do Hyeon)", css: "'Do Hyeon', sans-serif" },
];

// 색상 팔레트 (파스텔 / 그라데이션 / 팬톤)
const COLOR_GROUPS = [
  {
    name: "파스텔",
    colors: ["#FFD1DC", "#FFE5B4", "#FFFAC8", "#D6F5D6", "#CDE7F0", "#D7CCF0", "#FBE4E7", "#E2F0CB", "#FADADD", "#C7CEEA"],
  },
  {
    name: "그라데이션",
    colors: [
      "linear-gradient(135deg,#FBC2EB,#A6C1EE)",
      "linear-gradient(135deg,#FDCBF1,#E6DEE9)",
      "linear-gradient(135deg,#A1C4FD,#C2E9FB)",
      "linear-gradient(135deg,#D4FC79,#96E6A1)",
      "linear-gradient(135deg,#FFECD2,#FCB69F)",
      "linear-gradient(135deg,#FFF1EB,#ACE0F9)",
      "linear-gradient(135deg,#FAD0C4,#FFD1FF)",
      "linear-gradient(135deg,#A18CD1,#FBC2EB)",
    ],
  },
  {
    // 한 컬러(따뜻한 베이지 계열)의 채도 변화 — 옅은 톤부터 진한 톤까지
    name: "채도",
    colors: [
      "hsl(28, 30%, 92%)",
      "hsl(28, 35%, 87%)",
      "hsl(28, 40%, 82%)",
      "hsl(28, 44%, 76%)",
      "hsl(28, 47%, 70%)",
      "hsl(28, 50%, 63%)",
      "hsl(28, 52%, 56%)",
      "hsl(28, 54%, 49%)",
      "hsl(28, 55%, 42%)",
      "hsl(28, 56%, 35%)",
      "hsl(28, 57%, 28%)",
      "hsl(28, 58%, 22%)",
    ],
  },
];

// 누끼(배경 제거) 이미지 — el.cutout 일 때만 사용. 브라우저 flood-fill 결과를 캐시.
function CutoutImg({ src, fit, style }) {
  const [shown, setShown] = useState(src);
  useEffect(() => {
    let alive = true;
    setShown(src);
    if (src) runCutout(src).then((out) => { if (alive) setShown(out); }).catch(() => {});
    return () => { alive = false; };
  }, [src]);
  return (
    <img
      src={shown}
      alt=""
      draggable={false}
      style={{ ...style, objectFit: fit }}
      onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
      onLoad={(e) => { e.currentTarget.style.visibility = "visible"; }}
    />
  );
}

function EditableEl({ el, scale, active, flatZ, editing, onSelect, onCycle, onEdit, onEndEdit, onEnlarge, onChange, onMove, onDuplicate, onDelete, onRegenerate }) {
  const [regenBusy, setRegenBusy] = useState(false);
  const s = el.style || {};
  const fill = { width: "100%", height: "100%", boxSizing: "border-box" };
  const isImage = el.type === "image" || el.type === "photo";
  const draggedRef = useRef(false);
  const dragStartRef = useRef(null);
  const clickTimer = useRef(null);

  // 회전 핸들 드래그 → 상자 중심 기준으로 기울임(피그마식). shift=15° 스냅.
  const onRotateStart = (e) => {
    e.stopPropagation();
    e.preventDefault();
    const rnd = e.currentTarget.closest(".del");
    if (!rnd) return;
    const rect = rnd.getBoundingClientRect();
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2; // 회전 중심(회전해도 불변)
    const startA = Math.atan2(e.clientY - cy, e.clientX - cx);
    const startRot = el.rotation || 0;
    const move = (ev) => {
      const a = Math.atan2(ev.clientY - cy, ev.clientX - cx);
      let deg = startRot + (a - startA) * 180 / Math.PI;
      deg = ((Math.round(deg) % 360) + 360) % 360;
      if (deg > 180) deg -= 360;
      if (ev.shiftKey) deg = Math.round(deg / 15) * 15;
      onChange({ rotation: deg });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const imgRadius = isImage ? (s.radius ?? 12) : 12;
  const imgBorder = s.stroke && s.strokeWidth ? `${s.strokeWidth}px solid ${s.stroke}` : undefined;
  let inner;
  if (el.type === "shape") {
    inner = <div style={{ ...fill, background: s.bg, borderRadius: s.radius || 0, border: s.stroke && s.strokeWidth ? `${s.strokeWidth}px solid ${s.stroke}` : undefined, boxShadow: s.shadow }} />;
  } else if (isImage) {
    inner = el.src ? (
      el.cutout ? (
        <CutoutImg src={el.src} fit={el.fit || "contain"} style={{ ...fill, borderRadius: imgRadius }} />
      ) : (
        <img
          src={el.src}
          alt=""
          draggable={false}
          style={{ ...fill, boxSizing: "border-box", objectFit: el.fit || "contain", borderRadius: imgRadius, border: imgBorder, ...(el.silhouette ? { filter: `brightness(0) invert(${el.shadowLevel ?? 0.28})` } : null) }}
          onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
          onLoad={(e) => { e.currentTarget.style.visibility = "visible"; }}
        />
      )
    ) : (
      <div className="dframe-imgph" style={{ ...fill, borderRadius: imgRadius, border: imgBorder }}>
        <ImageIcon size={Math.max(18, Math.min(56, Math.round(Math.min(el.w, el.h) * 0.4)))} strokeWidth={1.6} />
      </div>
    );
  } else if (el.type === "text") {
    inner = editing ? (
      <textarea
        className="del-text-input"
        ref={(node) => {
          // autoFocus 대신 preventScroll 로 포커스 → transform 보드에서 화면 점프 방지
          if (node && document.activeElement !== node) node.focus({ preventScroll: true });
        }}
        value={el.text}
        style={{ ...fill, ...elTextStyle(s), display: "block", textAlign: s.align || "left" }}
        onChange={(e) => onChange({ text: e.target.value })}
        onBlur={onEndEdit}
        onPointerDown={(e) => e.stopPropagation()}
      />
    ) : (
      <div style={{ ...fill, ...elTextStyle(s), overflow: "hidden" }}>{el.text}</div>
    );
  }

  return (
    <Rnd
      size={{ width: el.w, height: el.h }}
      position={{ x: el.x, y: el.y }}
      scale={scale}
      bounds={el.sticker ? undefined : "parent"}
      lockAspectRatio={isImage}
      disableDragging={editing || el.pinned}
      enableResizing={active && !editing && !el.pinned}
      onMouseDown={onSelect}
      onPointerDown={(e) => e.stopPropagation()}
      onDragStart={(e, d) => { dragStartRef.current = { x: d.x, y: d.y }; draggedRef.current = false; }}
      onDrag={(e, d) => {
        // 화면상 3px 이상 움직여야 '드래그'로 인정 → 클릭 시 미세 흔들림(jitter)으로 스티커가 틀어지는 것 방지
        const st = dragStartRef.current;
        if (st && (Math.abs(d.x - st.x) * (scale || 1) > 3 || Math.abs(d.y - st.y) * (scale || 1) > 3)) draggedRef.current = true;
      }}
      onDragStop={(e, d) => {
        // 실제 드래그(임계값 초과)가 아니면 위치를 갱신하지 않음 → 클릭/선택만 했는데 배열이 틀어지는 문제 방지
        if (!draggedRef.current) return;
        if (onMove) onMove(d.x, d.y);
        else onChange({ x: Math.round(d.x), y: Math.round(d.y) });
      }}
      onResizeStop={(e, dir, ref, delta, pos) => {
        const nw = Math.round(parseFloat(ref.style.width));
        const nh = Math.round(parseFloat(ref.style.height));
        const patch = { w: nw, h: nh, x: Math.round(pos.x), y: Math.round(pos.y) };
        // 텍스트 박스를 드래그로 확대/축소하면 글자도 함께 스케일(상자만 커지지 않게)
        if (el.type === "text" && el.h && el.w) {
          const ratio = el.sticker ? nh / el.h : (nw / el.w + nh / el.h) / 2;
          const base = s.fontSize || 14;
          patch.style = { ...s, fontSize: Math.max(8, Math.round(base * ratio)) };
        }
        onChange(patch);
      }}
      className={"del" + (active ? " del-active" : "")}
      // 도형은 선택해도 z-순서를 올리지 않음(z=1 유지) → 위에 놓인 사진·텍스트를 가리지 않고 함께 보며 편집(Canva 식)
      // ⚠ 회전은 Rnd 박스(`rotate` 속성)가 아니라 아래 .del-inner 의 transform 으로 적용한다.
      //    react-rnd 는 위치를 `transform: translate()` 로 주는데, CSS 의 `rotate` 속성은 그 translate 의 '바깥'에
      //    적용돼(스펙상 rotate 후 transform) translate 가 회전된 좌표계에서 일어난다. 그러면 회전 요소가
      //    선택(EditableEl)/해제(DesignEl) 토글 시 (R−I)·(x,y) 만큼 위치가 튀는 버그가 생긴다.
      //    회전을 내부 래퍼로 옮기면 박스는 순수 translate(위치)만 → DesignEl(left/top+rotate)과 정확히 일치.
      // 선택한 텍스트만 편집을 위해 위로 띄우되(z20), 이미지·사진·도형은 띄우지 않는다(실제 순서 그대로 = WYSIWYG).
      // → 이미지도 '앞으로/맨 앞' 레이어 이동이 즉시 눈에 보인다(띄우면 선택 시 이미 위라 이동이 안 보였음).
      style={{ zIndex: active && !flatZ && el.type === "text" ? 20 : 1 }}
    >
      {active && !editing && (
        <div
          className="del-fbar"
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: "absolute", left: "50%", bottom: "100%", marginBottom: 8,
            transform: `translateX(-50%) scale(${1 / (scale || 1)})`,
            transformOrigin: "bottom center",
          }}
        >
          {onDuplicate && <button title="복사" onClick={onDuplicate}><Copy size={13} /></button>}
          {isImage && <button title="좌우반전" onClick={() => onChange({ flipH: !el.flipH })}><FlipHorizontal size={13} /></button>}
          <button title="회전 +15°" onClick={() => onChange({ rotation: Math.round((el.rotation || 0) + 15) })}><RotateCw size={13} /></button>
          {onDelete && <button title="삭제" className="del-fbar-x" onClick={onDelete}><X size={13} /></button>}
        </div>
      )}
      {active && !editing && (
        <div
          className="del-rotate"
          onPointerDown={onRotateStart}
          onMouseDown={(e) => e.stopPropagation()}
          title="드래그하여 회전 (Shift=15° 단위)"
          style={{
            position: "absolute", left: "50%", top: "100%", marginTop: 10,
            transform: `translateX(-50%) scale(${1 / (scale || 1)})`,
            transformOrigin: "top center",
          }}
        >
          <RotateCw size={12} />
        </div>
      )}
      {active && !editing && el.type === "image" && onRegenerate && (
        <button
          className="del-regen"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          disabled={regenBusy}
          title="AI로 이 스티커 다시 생성"
          onClick={async () => { if (regenBusy) return; setRegenBusy(true); try { await onRegenerate(el); } finally { setRegenBusy(false); } }}
          style={{
            position: "absolute", left: "50%", top: "100%", marginTop: 40,
            transform: `translateX(-50%) scale(${1 / (scale || 1)})`,
            transformOrigin: "top center", whiteSpace: "nowrap",
          }}
        >
          <RefreshCw size={12} style={{ animation: regenBusy ? "prspin 0.8s linear infinite" : undefined }} />
          {regenBusy ? "생성 중…" : "재생성"}
        </button>
      )}
      <div
        className="del-inner"
        style={{
          opacity: el.hidden ? 0.25 : s.opacity ?? 1,
          outline: el.hidden ? "1.5px dashed var(--accent)" : undefined,
          background: isImage ? s.bg : undefined,
          borderRadius: isImage ? imgRadius : 12,
          boxShadow: isImage ? s.shadow : undefined,
          // 회전+좌우반전을 여기서 적용(박스가 아니라 내용에). DesignEl 과 동일한 순서(rotate→scaleX)·중심 기준.
          transform: [el.rotation ? `rotate(${el.rotation}deg)` : "", el.flipH ? "scaleX(-1)" : ""].filter(Boolean).join(" ") || undefined,
        }}
        onDoubleClick={
          el.type === "text"
            ? () => {
                clearTimeout(clickTimer.current); // 더블클릭은 순서변경 취소하고 편집
                onEdit();
              }
            : isImage && el.src
              ? () => { clearTimeout(clickTimer.current); onEnlarge?.(el.src); } // 사진 더블클릭 = 크게보기
              : undefined
        }
        /* 클릭 = 그 요소를 '선택만'. 사진 더블클릭 = 크게보기. */
      >
        {inner}
      </div>
    </Rnd>
  );
}

export function DesignEl({ el, frozen }) {
  if (el.hidden) return null; // 숨긴 레이어 → 정적/최종 출력에서 제외
  const base = {
    position: "absolute",
    left: el.x,
    top: el.y,
    width: el.w,
    height: el.h,
    // frozen(편집 캔버스의 잠긴 요소) → 클릭 통과: 겹친 편집 요소를 가리지 않음.
    ...(frozen ? { pointerEvents: "none" } : null),
    transform: [el.rotation ? `rotate(${el.rotation}deg)` : "", el.flipH ? "scaleX(-1)" : ""].filter(Boolean).join(" ") || undefined,
  };
  const s = el.style || {};

  // 곡선 점선 화살표 커넥터 (스토리형 흐름) — 여러 색 세그먼트를 한 SVG로
  if (el.type === "connector") {
    return (
      <svg
        style={{ position: "absolute", left: el.x, top: el.y, overflow: "visible", pointerEvents: "none", opacity: s.opacity ?? 1 }}
        width={el.w}
        height={el.h}
      >
        {(el.segments || []).map((seg, i) => (
          <g key={i}>
            <path d={seg.d} fill="none" stroke={seg.color} strokeWidth={seg.sw || 3.5} strokeDasharray={seg.dash || "1.5 9"} strokeLinecap="round" />
            {seg.head && <path d={seg.head} fill={seg.color} />}
          </g>
        ))}
      </svg>
    );
  }

  if (el.type === "shape") {
    return <div style={{ ...base, boxSizing: "border-box", background: s.bg, borderRadius: s.radius || 0, opacity: s.opacity ?? 1, border: s.stroke && s.strokeWidth ? `${s.strokeWidth}px solid ${s.stroke}` : undefined, boxShadow: s.shadow }} />;
  }
  if (el.type === "text") {
    return (
      <div
        style={{
          ...base,
          ...elTextStyle(s),
          opacity: s.opacity ?? 1,
          overflow: "hidden",
        }}
      >
        {el.text}
      </div>
    );
  }
  if (el.type === "image" || el.type === "photo") {
    const radius = s.radius ?? 12;
    const border = s.stroke && s.strokeWidth ? `${s.strokeWidth}px solid ${s.stroke}` : undefined;
    if (el.src) {
      if (el.cutout) {
        return <CutoutImg src={el.src} fit={el.fit || "contain"} style={{ ...base, borderRadius: radius, opacity: s.opacity ?? 1, boxShadow: s.shadow }} />;
      }
      return (
        <img
          src={el.src}
          alt=""
          draggable={false}
          style={{ ...base, boxSizing: "border-box", objectFit: el.fit || "cover", borderRadius: radius, border, boxShadow: s.shadow, opacity: s.opacity ?? 1, ...(el.silhouette ? { filter: `brightness(0) invert(${el.shadowLevel ?? 0.28})` } : null) }}
          onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
          onLoad={(e) => { e.currentTarget.style.visibility = "visible"; }}
        />
      );
    }
    return (
      <div className="dframe-imgph" style={{ ...base, boxSizing: "border-box", borderRadius: radius, border, boxShadow: s.shadow }}>
        <ImageIcon size={Math.max(18, Math.min(56, Math.round(Math.min(el.w, el.h) * 0.4)))} strokeWidth={1.6} />
      </div>
    );
  }
  return null;
}

// 템플릿 미리보기 썸네일 — A4 DesignDoc 을 정적(DesignEl)으로 축소 렌더. 비인터랙티브.
