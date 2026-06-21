/**
 * 인터렉티브 노드 런타임 — 논리 캔버스를 등비로 렌더하고, 편집(선택·다중선택·이동·리사이즈·드롭)과
 * 재생(탭→반응/교체)을 한 컴포넌트가 담당. 보드 카드 미리보기·풀스크린·수업 모드
 * 어댑터가 모두 이 컴포넌트를 공유한다(단일 런타임).
 */
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { AssetRef, Connection, ElementNode, InteractiveNode } from '../schema/interactiveNode';
import { useStageFit } from './useStageFit';
import { cancelAnimations, runAnimate } from './behaviors';
import { ElementSelectionBox } from './ElementSelectionBox';
import { clampXY } from './geometry';
import { linkSequence } from '@/board/links';
import { Icon } from '@/lib/icons';
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

/** 글자 요소 — 바운드박스(w×h)에 맞춰 폰트 크기를 자동으로 키우/줄여 채운다(반응형).
 *  이진 탐색으로 가로·세로 모두 넘치지 않는 최대 폰트를 찾는다. w/h/text 변할 때마다 재계산. */
function FitText({ text, w, h }: { text: string; w: number; h: number }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const spanRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const box = boxRef.current;
    const span = spanRef.current;
    if (!box || !span) return;
    const availW = box.clientWidth;
    const availH = box.clientHeight;
    if (availW <= 0 || availH <= 0) return;
    let lo = 6;
    let hi = Math.max(8, availH);
    let best = lo;
    for (let i = 0; i < 11; i++) {
      const mid = (lo + hi) / 2;
      span.style.fontSize = `${mid}px`;
      const fits = span.scrollWidth <= availW + 0.5 && span.scrollHeight <= availH + 0.5;
      if (fits) {
        best = mid;
        lo = mid;
      } else {
        hi = mid;
      }
    }
    span.style.fontSize = `${best}px`;
  }, [text, w, h]);
  return (
    <div ref={boxRef} className="ic-text">
      <span ref={spanRef} className="ic-text-span">
        {text}
      </span>
    </div>
  );
}

/** 이미지 다운로드(마이보드 downloadImage와 동일) — 파일명 안전화. */
function downloadImageUrl(src: string, name?: string): void {
  const a = document.createElement('a');
  a.href = src;
  a.download = `${(name || 'kinderverse').replace(/[\\/:*?"<>|]/g, '_')}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

interface Props {
  doc: InteractiveNode;
  mode: 'play' | 'edit';
  selectedElIds?: string[];
  /** 선택 변경 — additive(shift)는 호출부가 토글해 넘긴다. */
  onSelectEls?: (ids: string[]) => void;
  /** 여러 요소를 한 번에(dx,dy) 이동(한 undo 단계). */
  onMoveElements?: (ids: string[], dx: number, dy: number) => void;
  onResizeElement?: (elId: string, patch: Box) => void;
  /** 회전 커밋(도, 0~359). */
  onRotateElement?: (elId: string, rotation: number) => void;
  /** 글자 더블클릭 인라인 편집 커밋. */
  onEditText?: (elId: string, text: string) => void;
  /** 이미지 요소 호버 액션 — 마이보드 카드와 동일(편집 모달 / 풀스크린). origin = 화면 사각형. */
  onEditImage?: (elId: string, origin: { x: number; y: number; w: number; h: number }) => void;
  onFullscreenImage?: (elId: string, origin: { x: number; y: number; w: number; h: number }) => void;
  /** 포트 드래그로 두 요소 연결(from→to). */
  onAddConnection?: (from: string, to: string) => void;
  /** 연결선 클릭 해제. */
  onRemoveConnection?: (id: string) => void;
  /** 포트 떼어내기로 연결 끝을 다른 요소로 옮김(한 undo 단계). */
  onRelinkConnection?: (id: string, from: string, to: string) => void;
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
  onRotateElement,
  onEditText,
  onEditImage,
  onFullscreenImage,
  onAddConnection,
  onRemoveConnection,
  onRelinkConnection,
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
  // 회전(라이브 미리보기 + 커밋) — 마이보드 회전 핸들과 동일 수식.
  const rotateInfo = useRef<{ id: string; cx: number; cy: number; rect: DOMRect; startRot: number; startAng: number; deg: number } | null>(null);
  const [rotate, setRotate] = useState<{ id: string; deg: number } | null>(null);
  const [swapped, setSwapped] = useState<Record<string, boolean>>({});
  const [dropping, setDropping] = useState(false);
  // 글자 더블클릭 인라인 편집 / 호버 시 연결 포트(hoverElId) / 연결 드래그 중 임시 선(linking).
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [hoverElId, setHoverElId] = useState<string | null>(null);
  const [linking, setLinking] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  // 연결 드래그 상태기계 — 마이보드와 동일: 'new'=빈 포트에서 새 연결, 'detach'=연결된 포트를
  // 떼어내 분리/옮기기. from=고정(반대) 끝, keepFrom=고정 끝이 연결의 from인지.
  const lk = useRef<{ mode: 'new' | 'detach'; from: string; x1: number; y1: number; connId?: string; keepFrom?: boolean } | null>(null);
  const linkRectRef = useRef<DOMRect | null>(null);
  const textEditRef = useRef<HTMLTextAreaElement>(null);

  const selSet = useMemo(() => new Set(selectedElIds), [selectedElIds]);
  const sorted = useMemo(() => [...doc.elements].sort((a, b) => a.transform.z - b.transform.z), [doc.elements]);
  // 연결 순번 라벨(1, 1-1, 2 …) — 마이보드와 동일 규칙(@/board/links 재사용).
  const linkLabels = useMemo(() => linkSequence(doc.connections), [doc.connections]);

  // 🔴 드래그/리사이즈 핸들러가 매 렌더 새 identity가 되면, 선택 직후 인스펙터 마운트로 인한
  //    리렌더의 cleanup이 방금 붙인 window 리스너를 떼어내 드래그가 즉시 죽는다. 가변값을
  //    ref로 읽어 핸들러를 영구 고정한다(리스너는 pointerup·언마운트에서만 제거).
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const onMoveRef = useRef(onMoveElements);
  onMoveRef.current = onMoveElements;
  const onResizeRef = useRef(onResizeElement);
  onResizeRef.current = onResizeElement;
  const onRotateRef = useRef(onRotateElement);
  onRotateRef.current = onRotateElement;
  const onAddConnRef = useRef(onAddConnection);
  onAddConnRef.current = onAddConnection;
  const onRemoveConnRef = useRef(onRemoveConnection);
  onRemoveConnRef.current = onRemoveConnection;
  const onRelinkRef = useRef(onRelinkConnection);
  onRelinkRef.current = onRelinkConnection;
  // 연결 hit-test/적중 판정용 최신 요소·연결 목록(고정 핸들러에서 읽음).
  const elsRef = useRef(doc.elements);
  elsRef.current = doc.elements;
  const connsRef = useRef(doc.connections);
  connsRef.current = doc.connections;

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
    if (d && (d.dx !== 0 || d.dy !== 0)) onMoveRef.current?.(d.ids, d.dx, d.dy);
  }, [onWinMove]);

  // ── 편집: 모서리 리사이즈(반대 모서리 앵커 고정, 단일 요소) ──
  const onResizeMove = useCallback((e: PointerEvent) => {
    const r = resizeInfo.current;
    if (!r) return;
    const sc = scaleRef.current;
    const px = (e.clientX - r.rect.left) / sc;
    const py = (e.clientY - r.rect.top) / sc;
    const x = Math.round(Math.min(r.ax, px));
    const y = Math.round(Math.min(r.ay, py));
    const w = Math.max(32, Math.round(Math.abs(px - r.ax)));
    const h = Math.max(32, Math.round(Math.abs(py - r.ay)));
    r.box = { x, y, w, h };
    setResize({ id: r.id, x, y, w, h });
  }, []);
  const onResizeUp = useCallback(() => {
    window.removeEventListener('pointermove', onResizeMove);
    window.removeEventListener('pointerup', onResizeUp);
    const r = resizeInfo.current;
    resizeInfo.current = null;
    setResize(null);
    if (r) onResizeRef.current?.(r.id, r.box);
  }, [onResizeMove]);

  // ── 편집: 회전(중심 기준, 마이보드 회전 핸들과 동일 수식. Shift=15° 스냅) ──
  const onRotateMove = useCallback((e: PointerEvent) => {
    const r = rotateInfo.current;
    if (!r) return;
    const sc = scaleRef.current;
    const px = (e.clientX - r.rect.left) / sc;
    const py = (e.clientY - r.rect.top) / sc;
    const ang = Math.atan2(py - r.cy, px - r.cx);
    let deg = r.startRot + ((ang - r.startAng) * 180) / Math.PI;
    if (e.shiftKey) deg = Math.round(deg / 15) * 15;
    deg = (((Math.round(deg) % 360) + 360) % 360);
    r.deg = deg;
    setRotate({ id: r.id, deg });
  }, []);
  const onRotateUp = useCallback(() => {
    window.removeEventListener('pointermove', onRotateMove);
    window.removeEventListener('pointerup', onRotateUp);
    const r = rotateInfo.current;
    rotateInfo.current = null;
    setRotate(null);
    if (r) onRotateRef.current?.(r.id, r.deg);
  }, [onRotateMove]);

  // 커서(논리 좌표) 아래 연결 가능한 최상위 요소(여유 pad 포함). 고정 핸들러에서 호출.
  const hitElementAt = useCallback((x: number, y: number): ElementNode | null => {
    const pad = 16 / scaleRef.current;
    return (
      [...elsRef.current]
        .sort((a, b) => b.transform.z - a.transform.z)
        .find((el) => {
          const t = el.transform;
          return x >= t.x - pad && x <= t.x + t.w + pad && y >= t.y - pad && y <= t.y + t.h + pad;
        }) ?? null
    );
  }, []);

  // ── 편집: 연결 드래그(마이보드 onLinkMove/onLinkUp 동일 로직) ──
  const onLinkMove = useCallback((e: PointerEvent) => {
    const st = lk.current;
    const rect = linkRectRef.current;
    if (!st || !rect) return;
    const sc = scaleRef.current;
    const x = (e.clientX - rect.left) / sc;
    const y = (e.clientY - rect.top) / sc;
    setLinking({ x1: st.x1, y1: st.y1, x2: x, y2: y });
    const t = hitElementAt(x, y);
    setHoverElId(t && t.id !== st.from ? t.id : null); // 드롭 대상 하이라이트
  }, [hitElementAt]);
  const onLinkUp = useCallback((e: PointerEvent) => {
    window.removeEventListener('pointermove', onLinkMove);
    window.removeEventListener('pointerup', onLinkUp);
    const st = lk.current;
    lk.current = null;
    setLinking(null);
    const rect = linkRectRef.current;
    if (!st || !rect) {
      setHoverElId(null);
      return;
    }
    const sc = scaleRef.current;
    const x = (e.clientX - rect.left) / sc;
    const y = (e.clientY - rect.top) / sc;
    const target = hitElementAt(x, y);
    if (st.mode === 'new') {
      if (target && target.id !== st.from) onAddConnRef.current?.(st.from, target.id);
    } else if (st.connId) {
      // 떼어내기: 빈 곳=해제, 다른 요소=옮겨 연결, 제자리=유지.
      const conn = connsRef.current.find((c) => c.id === st.connId);
      if (conn) {
        const detached = st.keepFrom ? conn.to : conn.from; // 떼어낸 쪽
        if (!target) onRemoveConnRef.current?.(conn.id);
        else if (target.id !== detached && target.id !== st.from) {
          onRelinkRef.current?.(conn.id, st.keepFrom ? st.from : target.id, st.keepFrom ? target.id : st.from);
        }
      }
    }
    setHoverElId(null);
  }, [onLinkMove, hitElementAt]);

  // cleanup은 언마운트에서만(deps []). 핸들러가 영구 고정이라 리렌더 중 리스너가
  // 떨어지지 않는다 — 위 ref 주석 참조.
  useEffect(
    () => () => {
      window.removeEventListener('pointermove', onWinMove);
      window.removeEventListener('pointerup', onWinUp);
      window.removeEventListener('pointermove', onResizeMove);
      window.removeEventListener('pointerup', onResizeUp);
      window.removeEventListener('pointermove', onLinkMove);
      window.removeEventListener('pointerup', onLinkUp);
      window.removeEventListener('pointermove', onRotateMove);
      window.removeEventListener('pointerup', onRotateUp);
    },
    [onWinMove, onWinUp, onResizeMove, onResizeUp, onLinkMove, onLinkUp, onRotateMove, onRotateUp],
  );

  // 포트 pointerdown — 빈 슬롯이면 새 연결, 연결된 슬롯이면 떼어내기(반대 끝 고정).
  const onPortDown = (
    e: React.PointerEvent,
    elId: string,
    _side: 'l' | 'r',
    slot: { x: number; y: number },
    detachConn?: Connection,
  ) => {
    if (preview || mode !== 'edit') return;
    e.stopPropagation();
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    linkRectRef.current = rect;
    if (detachConn) {
      const otherId = detachConn.from === elId ? detachConn.to : detachConn.from;
      const s = sidesOf(detachConn);
      const otherSide = detachConn.from === otherId ? s.from : s.to;
      const anch = linkAnchor(otherId, otherSide, detachConn.id);
      lk.current = { mode: 'detach', from: otherId, x1: anch.x, y1: anch.y, connId: detachConn.id, keepFrom: detachConn.from === otherId };
      setLinking({ x1: anch.x, y1: anch.y, x2: anch.x, y2: anch.y });
    } else {
      lk.current = { mode: 'new', from: elId, x1: slot.x, y1: slot.y };
      setLinking({ x1: slot.x, y1: slot.y, x2: slot.x, y2: slot.y });
    }
    window.addEventListener('pointermove', onLinkMove);
    window.addEventListener('pointerup', onLinkUp);
  };

  const onElPointerDown = (e: React.PointerEvent, el: ElementNode) => {
    if (preview || mode !== 'edit') return;
    if (editingTextId === el.id) return; // 인라인 편집 중인 글자는 드래그 시작 안 함(텍스트 선택 허용)
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

  const onRotateDown = (e: React.PointerEvent, el: ElementNode) => {
    if (preview || mode !== 'edit') return;
    e.stopPropagation();
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const b = boxOf(el);
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const px = (e.clientX - rect.left) / scale;
    const py = (e.clientY - rect.top) / scale;
    const startRot = el.transform.rotation ?? 0;
    rotateInfo.current = { id: el.id, cx, cy, rect, startRot, startAng: Math.atan2(py - cy, px - cx), deg: startRot };
    setRotate({ id: el.id, deg: startRot });
    window.addEventListener('pointermove', onRotateMove);
    window.addEventListener('pointerup', onRotateUp);
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

  // ── 편집: 글자 더블클릭 → 인라인 편집 ──
  const onElDoubleClick = (e: React.MouseEvent, el: ElementNode) => {
    if (preview || mode !== 'edit' || el.kind !== 'text') return;
    e.stopPropagation();
    onSelectEls?.([el.id]);
    setEditingTextId(el.id);
  };
  const commitTextEdit = () => {
    const id = editingTextId;
    setEditingTextId(null);
    if (id) onEditText?.(id, textEditRef.current?.value ?? '');
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
      if (editingTextId === el.id) {
        // 편집 textarea도 박스에 맞춰 — 대략적 폰트(자동맞춤은 커밋 후 FitText가 처리).
        const fontPx = Math.max(14, Math.min(el.transform.h * 0.5, (el.transform.w * 0.9) / Math.max(1, (el.text ?? '').length) * 1.6));
        return (
          <textarea
            ref={textEditRef}
            className="ic-text-edit"
            defaultValue={el.text}
            style={{ fontSize: fontPx }}
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            onPointerDown={(e) => e.stopPropagation()}
            onBlur={commitTextEdit}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                commitTextEdit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setEditingTextId(null);
              }
            }}
          />
        );
      }
      return <FitText text={el.text ?? ''} w={boxOf(el).w} h={boxOf(el).h} />;
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
      const p = clampXY(o.x + drag.dx, o.y + drag.dy, el.transform.w, el.transform.h, cw, ch);
      return { x: p.x, y: p.y, w: el.transform.w, h: el.transform.h };
    }
    return { x: el.transform.x, y: el.transform.y, w: el.transform.w, h: el.transform.h };
  };

  /** 요소의 현재 회전(라이브 우선) — 드래그 회전 중이면 미리보기 값. */
  const rotDeg = (el: ElementNode): number => (rotate && rotate.id === el.id ? rotate.deg : el.transform.rotation ?? 0);

  // ── 연결 기하(마이보드 sideMap/portSlots/linkAnchor 동일 규칙) ──
  /** 연결의 두 끝이 각각 어느 면(l/r)에 붙는지 — 왼쪽 요소의 오른면 ↔ 오른쪽 요소의 왼면. */
  const sidesOf = (c: Connection): { from: 'l' | 'r'; to: 'l' | 'r' } => {
    const a = doc.elements.find((e) => e.id === c.from);
    const z = doc.elements.find((e) => e.id === c.to);
    const ax = a ? a.transform.x + a.transform.w / 2 : 0;
    const zx = z ? z.transform.x + z.transform.w / 2 : 0;
    const l2r = ax <= zx;
    return { from: l2r ? 'r' : 'l', to: l2r ? 'l' : 'r' };
  };
  /** 요소·면별 붙은 연결 목록(생성 순) — 선과 포트가 같은 슬롯을 공유. */
  const sideMap = useMemo(() => {
    const m = new Map<string, { l: string[]; r: string[] }>();
    const put = (id: string, side: 'l' | 'r', cid: string) => {
      if (!m.has(id)) m.set(id, { l: [], r: [] });
      m.get(id)![side].push(cid);
    };
    for (const c of doc.connections) {
      const s = sidesOf(c);
      put(c.from, s.from, c.id);
      put(c.to, s.to, c.id);
    }
    return m;
    // sidesOf는 doc.elements에 의존 → 두 배열을 deps로.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.connections, doc.elements]);
  /** 한 면의 포트 슬롯 — 붙은 연결들(순서대로) + 마지막 '새 연결' 빈 슬롯. */
  const portSlots = (elId: string, side: 'l' | 'r'): Array<{ x: number; y: number; connId?: string }> => {
    const el = doc.elements.find((e) => e.id === elId);
    if (!el) return [];
    const b = boxOf(el);
    const list = sideMap.get(elId)?.[side] ?? [];
    const total = list.length + 1; // +1 = 다중 연결용 새 포트
    const gap = 22 / scale;
    const x = side === 'l' ? b.x : b.x + b.w;
    const cy = b.y + b.h / 2;
    return Array.from({ length: total }, (_, i) => ({ x, y: cy + (i - (total - 1) / 2) * gap, connId: list[i] }));
  };
  /** 연결의 한쪽 끝 좌표 = 그 연결이 차지한 포트 슬롯 위치. */
  const linkAnchor = (elId: string, side: 'l' | 'r', connId: string): { x: number; y: number } => {
    const slots = portSlots(elId, side);
    const slot = slots.find((s) => s.connId === connId) ?? slots[0];
    return { x: slot.x, y: slot.y };
  };
  /** 두 점 사이 부드러운 곡선 path(마이보드 연결선과 동일한 모양). */
  const curve = (x1: number, y1: number, x2: number, y2: number): string => {
    const k = (x1 <= x2 ? 1 : -1) * Math.max(28, Math.min(120, Math.abs(x2 - x1) / 2));
    return `M ${x1} ${y1} C ${x1 + k} ${y1}, ${x2 - k} ${y2}, ${x2} ${y2}`;
  };

  const showLinkUi = mode === 'edit' && !preview;

  // 캔버스 호버 → 포트 표시 요소 추적(요소/리사이즈/연결 드래그 중엔 끔).
  const onCanvasHover = (e: React.PointerEvent) => {
    if (!showLinkUi || lk.current || drag || resize) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;
    const hit = hitElementAt(x, y);
    const next = hit ? hit.id : null;
    if (next !== hoverElId) setHoverElId(next);
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
          onPointerMove={onCanvasHover}
          onPointerLeave={() => {
            if (!lk.current) setHoverElId(null);
          }}
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

          {/* 요소 연결선 — 포트↔포트 곡선(클릭하면 해제) + 연결 드래그 중 임시 선. */}
          {(doc.connections.length > 0 || linking) && (
            <svg className="ic-links" width={cw} height={ch} viewBox={`0 0 ${cw} ${ch}`} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}>
              {doc.connections.map((c) => {
                if (!doc.elements.some((e) => e.id === c.from) || !doc.elements.some((e) => e.id === c.to)) return null;
                const s = sidesOf(c);
                const p1 = linkAnchor(c.from, s.from, c.id);
                const p2 = linkAnchor(c.to, s.to, c.id);
                const d = curve(p1.x, p1.y, p2.x, p2.y);
                return (
                  <g key={c.id}>
                    <path d={d} fill="none" stroke="var(--ic-coral)" strokeWidth={3 / scale} strokeLinecap="round" opacity={0.7} />
                    <circle cx={p2.x} cy={p2.y} r={5 / scale} fill="var(--ic-coral)" opacity={0.85} />
                    {showLinkUi && (
                      <path
                        d={d}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={16 / scale}
                        style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                        onClick={() => onRemoveConnection?.(c.id)}
                      >
                        <title>클릭하면 연결 해제</title>
                      </path>
                    )}
                  </g>
                );
              })}
              {linking && (
                <path
                  d={curve(linking.x1, linking.y1, linking.x2, linking.y2)}
                  fill="none"
                  stroke="var(--ic-coral)"
                  strokeWidth={3 / scale}
                  strokeDasharray={`${8 / scale} ${6 / scale}`}
                  strokeLinecap="round"
                  opacity={0.85}
                />
              )}
            </svg>
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
                  transform: rotDeg(el) ? `rotate(${rotDeg(el)}deg)` : undefined,
                  transformOrigin: 'center center',
                  zIndex: el.transform.z,
                }}
                onPointerDown={(e) => onElPointerDown(e, el)}
                onClick={(e) => onElClick(e, el)}
                onDoubleClick={(e) => onElDoubleClick(e, el)}
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
                {/* 연결 순번 라벨(연결된 요소만) — 마이보드 규칙. */}
                {showLinkUi && linkLabels.has(el.id) && (
                  <span className="ic-seq" style={{ transform: `translate(-50%, -50%) scale(${1 / scale})` }}>
                    {linkLabels.get(el.id)}
                  </span>
                )}
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
                {/* 이미지 요소 호버 액션 — 마이보드 카드와 동일(편집·다운로드·풀스크린). */}
                {mode === 'edit' && !preview && el.kind === 'image' && el.src?.src && (
                  <div
                    className="ic-img-actions"
                    style={{ position: 'absolute', top: 0, right: 0, transform: `scale(${1 / scale})`, transformOrigin: 'top right' }}
                  >
                    <button
                      type="button"
                      aria-label="이미지 편집"
                      title="이미지 편집 (배경 제거·요소 지우기)"
                      className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface/95 text-fg-2 shadow-sm transition-colors duration-150 ease-soft hover:border-accent hover:bg-accent hover:text-on-accent"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        const r = (e.currentTarget.closest('.ic-el') as HTMLElement | null)?.getBoundingClientRect();
                        onEditImage?.(el.id, r ? { x: r.left, y: r.top, w: r.width, h: r.height } : { x: 0, y: 0, w: 0, h: 0 });
                      }}
                    >
                      <Icon name="edit" size={15} />
                    </button>
                    <button
                      type="button"
                      aria-label="다운로드"
                      title="다운로드"
                      className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface/95 text-fg-2 shadow-sm transition-colors duration-150 ease-soft hover:border-accent hover:text-accent"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (el.src?.src) downloadImageUrl(el.src.src, el.text);
                      }}
                    >
                      <Icon name="download" size={14} />
                    </button>
                    <button
                      type="button"
                      aria-label="크게 보기"
                      title="크게 보기 (풀스크린)"
                      className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface/95 text-fg-2 shadow-sm transition-colors duration-150 ease-soft hover:border-accent hover:text-accent"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        const r = (e.currentTarget.closest('.ic-el') as HTMLElement | null)?.getBoundingClientRect();
                        onFullscreenImage?.(el.id, r ? { x: r.left, y: r.top, w: r.width, h: r.height } : { x: 0, y: 0, w: 0, h: 0 });
                      }}
                    >
                      <Icon name="present" size={14} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {singleSel && (
            <ElementSelectionBox
              box={boxOf(singleSel)}
              scale={scale}
              radius={singleSel.kind === 'shape' ? 18 : 8}
              rotation={rotDeg(singleSel)}
              onHandleDown={(e, corner) => onHandleDown(e, singleSel, corner)}
              onRotateDown={(e) => onRotateDown(e, singleSel)}
            />
          )}

          {/* 연결 포트 레이어 — 호버(또는 연결 드롭 대상) 요소의 좌·우 슬롯.
              빈 슬롯=새 연결, 채워진 슬롯=떼어내기. 마이보드 포트 렌더와 동일.
              요소·리사이즈 드래그 중엔 숨김(좌표가 흔들리므로). */}
          {showLinkUi && hoverElId && editingTextId !== hoverElId && !drag && !resize &&
            doc.elements.some((e) => e.id === hoverElId) &&
            (() => {
              const sz = 16 / scale;
              const bw = Math.max(1, 2 / scale);
              const ring = !!lk.current && lk.current.from !== hoverElId; // 드롭 대상 강조
              const dot = (key: string, slot: { x: number; y: number; connId?: string }, side: 'l' | 'r') => {
                const detach = slot.connId ? doc.connections.find((c) => c.id === slot.connId) : undefined;
                const filled = !!detach || ring;
                return (
                  <button
                    key={key}
                    title={detach ? '드래그해서 떼어내기 — 빈 곳에 놓으면 연결 해제' : '드래그해서 다른 요소와 연결'}
                    onPointerDown={(e) => onPortDown(e, hoverElId, side, slot, detach)}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      position: 'absolute',
                      left: slot.x,
                      top: slot.y,
                      width: sz,
                      height: sz,
                      transform: 'translate(-50%, -50%)',
                      borderRadius: 999,
                      border: `${bw}px solid var(--ic-coral)`,
                      background: filled ? 'var(--ic-coral)' : '#fff',
                      boxShadow: '0 2px 6px rgba(87, 75, 62, 0.25)',
                      cursor: detach ? 'grab' : 'crosshair',
                      zIndex: 7,
                      pointerEvents: 'auto',
                    }}
                  />
                );
              };
              return (
                <>
                  {(['l', 'r'] as const).map((side) => (
                    <Fragment key={side}>
                      {portSlots(hoverElId, side).map((slot, i) => dot(`${side}-${i}`, slot, side))}
                    </Fragment>
                  ))}
                </>
              );
            })()}
        </div>
      </div>
    </div>
  );
}
