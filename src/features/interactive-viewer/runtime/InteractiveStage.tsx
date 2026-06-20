/**
 * 인터렉티브 노드 런타임 — 논리 캔버스를 등비로 렌더하고, 편집(선택·다중선택·이동·리사이즈·드롭)과
 * 재생(탭→반응/교체)을 한 컴포넌트가 담당. 보드 카드 미리보기·풀스크린·수업 모드
 * 어댑터가 모두 이 컴포넌트를 공유한다(단일 런타임).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AssetRef, ElementNode, InteractiveNode } from '../schema/interactiveNode';
import { useStageFit } from './useStageFit';
import { cancelAnimations, runAnimate } from './behaviors';
import { ElementSelectionBox } from './ElementSelectionBox';
import './inode.css';

const COLOR_TOKENS: Record<string, string> = {
  'pastel.cream': 'var(--ic-cream)',
  'pastel.coral': 'var(--ic-coral)',
  'pastel.mint': 'var(--ic-mint)',
  'pastel.sky': 'var(--ic-sky)',
  'pastel.peach': 'var(--ic-bg-peach)',
};

function isAssetRef(bg: InteractiveNode['canvas']['background']): bg is AssetRef {
  return typeof bg === 'object' && bg !== null && 'src' in bg;
}
function bgColor(c: string): string {
  return COLOR_TOKENS[c] ?? c;
}

type Box = { x: number; y: number; w: number; h: number };

interface Props {
  doc: InteractiveNode;
  mode: 'play' | 'edit';
  selectedElIds?: string[];
  /** 선택 변경 — additive(shift)는 호출부가 토글해 넘긴다. */
  onSelectEls?: (ids: string[]) => void;
  /** 여러 요소를 한 번에(dx,dy) 이동(한 undo 단계). */
  onMoveElements?: (ids: string[], dx: number, dy: number) => void;
  onResizeElement?: (elId: string, patch: Box) => void;
  onDuplicateElement?: (elId: string) => void;
  onRemoveElement?: (elId: string) => void;
  onDropFiles?: (files: File[], at: { x: number; y: number }) => void;
  /** play 리셋/모드 전환 시 애니메이션·교체 상태 원복. */
  resetNonce?: number;
  /** 미리보기 — 상호작용 차단(보드 카드 썸네일). */
  preview?: boolean;
}

export function InteractiveStage({
  doc,
  mode,
  selectedElIds = [],
  onSelectEls,
  onMoveElements,
  onResizeElement,
  onDuplicateElement,
  onRemoveElement,
  onDropFiles,
  resetNonce = 0,
  preview = false,
}: Props) {
  const cw = doc.canvas.size.w;
  const ch = doc.canvas.size.h;
  const { ref: stageBoxRef, scale, box } = useStageFit(cw, ch, preview ? 6 : 24);
  // 캔버스는 무대 안에서 가운데로 — translate를 직접 계산(거대 박스를 grid가 중앙정렬 못 하는 문제 회피).
  const tx = Math.max(0, (box.w - cw * scale) / 2);
  const ty = Math.max(0, (box.h - ch * scale) / 2);
  const canvasRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const innerRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const dragInfo = useRef<{ ids: string[]; origs: Record<string, { x: number; y: number }>; sx: number; sy: number; sc: number; dx: number; dy: number } | null>(null);
  const [drag, setDrag] = useState<{ ids: string[]; origs: Record<string, { x: number; y: number }>; dx: number; dy: number } | null>(null);
  const resizeInfo = useRef<{ id: string; ax: number; ay: number; rect: DOMRect; box: Box } | null>(null);
  const [resize, setResize] = useState<(Box & { id: string }) | null>(null);
  const [swapped, setSwapped] = useState<Record<string, boolean>>({});
  const [dropping, setDropping] = useState(false);

  const selSet = useMemo(() => new Set(selectedElIds), [selectedElIds]);
  const sorted = useMemo(() => [...doc.elements].sort((a, b) => a.transform.z - b.transform.z), [doc.elements]);

  useEffect(() => {
    if (rootRef.current) cancelAnimations(rootRef.current);
    setSwapped({});
  }, [resetNonce, mode]);

  const tapBehavior = useCallback(
    (elId: string) => doc.behaviors.find((b) => b.target === elId && b.trigger === 'tap'),
    [doc.behaviors],
  );

  // ── 편집: (그룹) 드래그 — 스크린 델타 ÷ scale = 논리 델타, 선택된 모든 요소 함께 이동 ──
  const onWinMove = useCallback((e: PointerEvent) => {
    const d = dragInfo.current;
    if (!d) return;
    d.dx = Math.round((e.clientX - d.sx) / d.sc);
    d.dy = Math.round((e.clientY - d.sy) / d.sc);
    setDrag({ ids: d.ids, origs: d.origs, dx: d.dx, dy: d.dy });
  }, []);
  const onWinUp = useCallback(() => {
    window.removeEventListener('pointermove', onWinMove);
    window.removeEventListener('pointerup', onWinUp);
    const d = dragInfo.current;
    dragInfo.current = null;
    setDrag(null);
    // 🔴 side-effect는 setState 업데이터 밖에서(무한 업데이트 루프 방지).
    if (d && (d.dx !== 0 || d.dy !== 0)) onMoveElements?.(d.ids, d.dx, d.dy);
  }, [onMoveElements, onWinMove]);

  // ── 편집: 모서리 리사이즈(반대 모서리 앵커 고정, 단일 요소) ──
  const onResizeMove = useCallback((e: PointerEvent) => {
    const r = resizeInfo.current;
    if (!r) return;
    const px = (e.clientX - r.rect.left) / scale;
    const py = (e.clientY - r.rect.top) / scale;
    const x = Math.round(Math.min(r.ax, px));
    const y = Math.round(Math.min(r.ay, py));
    const w = Math.max(32, Math.round(Math.abs(px - r.ax)));
    const h = Math.max(32, Math.round(Math.abs(py - r.ay)));
    r.box = { x, y, w, h };
    setResize({ id: r.id, x, y, w, h });
  }, [scale]);
  const onResizeUp = useCallback(() => {
    window.removeEventListener('pointermove', onResizeMove);
    window.removeEventListener('pointerup', onResizeUp);
    const r = resizeInfo.current;
    resizeInfo.current = null;
    setResize(null);
    if (r) onResizeElement?.(r.id, r.box);
  }, [onResizeElement, onResizeMove]);

  useEffect(
    () => () => {
      window.removeEventListener('pointermove', onWinMove);
      window.removeEventListener('pointerup', onWinUp);
      window.removeEventListener('pointermove', onResizeMove);
      window.removeEventListener('pointerup', onResizeUp);
    },
    [onWinMove, onWinUp, onResizeMove, onResizeUp],
  );

  const onElPointerDown = (e: React.PointerEvent, el: ElementNode) => {
    if (preview || mode !== 'edit') return;
    e.stopPropagation();
    // Shift = 선택 토글(드래그 안 함)
    if (e.shiftKey) {
      onSelectEls?.(selSet.has(el.id) ? selectedElIds.filter((i) => i !== el.id) : [...selectedElIds, el.id]);
      return;
    }
    // 다중선택에 포함된 요소 잡으면 그룹 이동, 아니면 단일 선택 후 이동
    const inMulti = selectedElIds.length > 1 && selSet.has(el.id);
    const ids = inMulti ? selectedElIds : [el.id];
    if (!inMulti) onSelectEls?.([el.id]);
    const origs: Record<string, { x: number; y: number }> = {};
    ids.forEach((id) => {
      const E = doc.elements.find((x) => x.id === id);
      if (E) origs[id] = { x: E.transform.x, y: E.transform.y };
    });
    dragInfo.current = { ids, origs, sx: e.clientX, sy: e.clientY, sc: scale, dx: 0, dy: 0 };
    setDrag({ ids, origs, dx: 0, dy: 0 });
    window.addEventListener('pointermove', onWinMove);
    window.addEventListener('pointerup', onWinUp);
  };

  const onHandleDown = (e: React.PointerEvent, el: ElementNode, corner: number) => {
    if (preview || mode !== 'edit') return;
    e.stopPropagation();
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const t = el.transform;
    const ax = corner === 0 || corner === 3 ? t.x + t.w : t.x;
    const ay = corner === 0 || corner === 1 ? t.y + t.h : t.y;
    resizeInfo.current = { id: el.id, ax, ay, rect, box: { x: t.x, y: t.y, w: t.w, h: t.h } };
    setResize({ id: el.id, x: t.x, y: t.y, w: t.w, h: t.h });
    window.addEventListener('pointermove', onResizeMove);
    window.addEventListener('pointerup', onResizeUp);
  };

  /** 동작 실행 — 재생 탭과 편집 미리보기(▶)가 공유. animate=재생, swap=토글. */
  const runBehavior = (el: ElementNode) => {
    const beh = tapBehavior(el.id);
    if (!beh) return;
    if (beh.action === 'animate') {
      const inner = innerRefs.current[el.id];
      if (inner) runAnimate(inner, beh.params.preset, beh.params.repeat);
    } else if (beh.action === 'swap') {
      setSwapped((s) => ({ ...s, [el.id]: !s[el.id] }));
    }
  };

  const onElClick = (e: React.MouseEvent, el: ElementNode) => {
    if (preview || mode !== 'play') return;
    if (!tapBehavior(el.id)) return;
    e.stopPropagation();
    runBehavior(el);
  };

  const onCanvasPointerDown = () => {
    if (!preview && mode === 'edit') onSelectEls?.([]);
  };

  // ── 외부 파일 드롭 ──
  const onDragOver = (e: React.DragEvent) => {
    if (preview || mode !== 'edit' || !onDropFiles) return;
    if (Array.from(e.dataTransfer?.types ?? []).includes('Files')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setDropping(true);
    }
  };
  const onDrop = (e: React.DragEvent) => {
    setDropping(false);
    if (preview || mode !== 'edit' || !onDropFiles) return;
    const files = Array.from(e.dataTransfer?.files ?? []).filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    const at = rect
      ? { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale }
      : { x: cw / 2, y: ch / 2 };
    onDropFiles(files, at);
  };

  const displaySrc = (el: ElementNode): string | undefined => {
    if (swapped[el.id]) {
      const beh = doc.behaviors.find((b) => b.target === el.id && b.action === 'swap');
      if (beh && beh.action === 'swap') return beh.params.to.src;
    }
    return el.src?.src;
  };

  const renderContent = (el: ElementNode) => {
    if (el.kind === 'text') {
      const fontPx = Math.max(14, Math.min(el.transform.h * 0.5, el.transform.w * 0.22));
      return (
        <div className="ic-text" style={{ fontSize: fontPx }}>
          {el.text}
        </div>
      );
    }
    if (el.kind === 'shape') return <div className="ic-shape" />;
    const src = displaySrc(el);
    if (!src) return null;
    const swapBeh = doc.behaviors.find((b) => b.target === el.id && b.action === 'swap');
    const asVideo = el.kind === 'video' || (!!swapped[el.id] && swapBeh?.action === 'swap' && swapBeh.params.mode === 'video');
    if (asVideo) {
      return <video src={src} playsInline controls={mode === 'play' && !preview} autoPlay={mode === 'play' && !preview} muted />;
    }
    return <img src={src} alt={el.text ?? ''} draggable={false} />;
  };

  /** 요소의 현재 박스(드래그/리사이즈 라이브 우선). */
  const boxOf = (el: ElementNode): Box => {
    if (resize && resize.id === el.id) return { x: resize.x, y: resize.y, w: resize.w, h: resize.h };
    if (drag && drag.origs[el.id]) {
      const o = drag.origs[el.id];
      return { x: o.x + drag.dx, y: o.y + drag.dy, w: el.transform.w, h: el.transform.h };
    }
    return { x: el.transform.x, y: el.transform.y, w: el.transform.w, h: el.transform.h };
  };

  // 핸들 박스는 단일 선택일 때만(다중 선택은 외곽선 표시).
  const singleSel = !preview && mode === 'edit' && selectedElIds.length === 1 ? doc.elements.find((e) => e.id === selectedElIds[0]) : undefined;

  return (
    <div
      ref={rootRef}
      className={`kv-inode${dropping ? ' is-dropping' : ''}`}
      data-mode={mode}
      onDragOver={onDragOver}
      onDragLeave={() => setDropping(false)}
      onDrop={onDrop}
    >
      <div ref={stageBoxRef} className="ic-stage">
        <div
          ref={canvasRef}
          className="ic-canvas"
          onPointerDown={onCanvasPointerDown}
          style={{
            width: cw,
            height: ch,
            transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
            transformOrigin: 'top left',
            background: isAssetRef(doc.canvas.background) ? undefined : bgColor(doc.canvas.background),
          }}
        >
          {isAssetRef(doc.canvas.background) && <img className="ic-canvas-bg" src={doc.canvas.background.src} alt="" />}
          {sorted.length === 0 && mode === 'edit' && !preview && (
            <div className="ic-empty">자료를 끌어다 놓거나 왼쪽 도구로 추가하세요</div>
          )}
          {sorted.map((el) => {
            const b = boxOf(el);
            const playable = mode === 'play' && !preview && !!tapBehavior(el.id);
            const cls = ['ic-el'];
            // 다중 선택일 때만 외곽선(단일은 SelectionBox가 그린다).
            if (!preview && mode === 'edit' && selectedElIds.length > 1 && selSet.has(el.id)) cls.push('is-selected');
            if (playable) cls.push('is-playable');
            return (
              <div
                key={el.id}
                className={cls.join(' ')}
                style={{
                  left: b.x,
                  top: b.y,
                  width: b.w,
                  height: b.h,
                  transform: el.transform.rotation ? `rotate(${el.transform.rotation}deg)` : undefined,
                  zIndex: el.transform.z,
                }}
                onPointerDown={(e) => onElPointerDown(e, el)}
                onClick={(e) => onElClick(e, el)}
              >
                <div
                  className="ic-el-inner"
                  ref={(n) => {
                    innerRefs.current[el.id] = n;
                  }}
                  style={{ width: '100%', height: '100%' }}
                >
                  {renderContent(el)}
                </div>
                {/* 편집 모드 — 동작 있는 요소는 호버 시 가운데 ▶로 동작을 미리보기(확인용). */}
                {mode === 'edit' && !preview && tapBehavior(el.id) && (
                  <button
                    className="ic-preview-play"
                    title="동작 미리보기"
                    style={{ transform: `translate(-50%, -50%) scale(${1 / scale})` }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      runBehavior(el);
                    }}
                  >
                    ▶
                  </button>
                )}
              </div>
            );
          })}
          {singleSel && (
            <ElementSelectionBox
              el={singleSel}
              pos={boxOf(singleSel)}
              scale={scale}
              onHandleDown={(e, corner) => onHandleDown(e, singleSel, corner)}
              onDuplicate={() => onDuplicateElement?.(singleSel.id)}
              onRemove={() => onRemoveElement?.(singleSel.id)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
