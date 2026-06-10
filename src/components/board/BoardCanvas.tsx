import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBoardStore, type BoardNode } from '@/store/boardStore';
import { moveNodesCmd, captureNodes, pushRedesign, type NodeSnap } from '@/board/commands';
import { mindMapSubtree } from '@/board/composer';
import { frameMoveSet, rebindFrameMembership, frameOfPoint } from '@/board/frames';
import { worldBox, renderHeight } from '@/board/geometry';
import { IMG_PLACEHOLDER_ZOOM } from '@/board/imageLod';
import { NodeView } from './NodeView';
import { LaneView } from './LaneView';

// Memoized node — on pan/zoom the viewport changes but each node's props (node,
// selected, dx, dy, onPointerDown) don't, so memo skips re-rendering every card.
// Requires a STABLE onPointerDown (see onNodePointerDownStable below).
const MemoNodeView = memo(NodeView);

/** Walk up from the wheel target to the canvas root: is the cursor over an element
    with its own vertical scroll that can STILL scroll in this wheel direction?
    If so, the wheel should scroll that content (doc/frame) instead of zooming. */
function scrollableUnderCursor(target: EventTarget | null, deltaY: number, root: HTMLElement | null): boolean {
  let el = target as HTMLElement | null;
  while (el && el !== root) {
    if (el.scrollHeight > el.clientHeight + 1) {
      const oy = getComputedStyle(el).overflowY;
      if (oy === 'auto' || oy === 'scroll') {
        const atTop = el.scrollTop <= 0;
        const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
        if (deltaY < 0 ? !atTop : !atBottom) return true; // room to scroll this way
      }
    }
    el = el.parentElement;
  }
  return false;
}

/* The infinite canvas surface (SKILL §6). Pan (space+drag / wheel), zoom
   (ctrl/⌘+wheel toward cursor), drag-box selection on empty space, node drag
   (committed as one undoable move). Renders free primitives + workflow lanes. */

/** Suppress the browser's native text selection (blue highlight) while a board
    drag is in flight — a background/box drag must not sweep-select node text.
    Applied synchronously on pointer-down so no selection ever starts; restored on
    pointer-up. Editing fields re-enable selection via CSS (user-select:text). */
function lockTextSelection() {
  if (typeof document === 'undefined') return;
  document.body.style.userSelect = 'none';
  (document.body.style as unknown as { webkitUserSelect: string }).webkitUserSelect = 'none';
  window.getSelection?.()?.removeAllRanges();
}
function unlockTextSelection() {
  if (typeof document === 'undefined') return;
  document.body.style.userSelect = '';
  (document.body.style as unknown as { webkitUserSelect: string }).webkitUserSelect = '';
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function BoardCanvas() {
  const ref = useRef<HTMLDivElement>(null);
  const nodes = useBoardStore((s) => s.nodes);
  const order = useBoardStore((s) => s.order);
  const lanes = useBoardStore((s) => s.lanes);
  const laneOrder = useBoardStore((s) => s.laneOrder);
  const selection = useBoardStore((s) => s.selection);
  const viewport = useBoardStore((s) => s.viewport);
  const generating = useBoardStore((s) => s.generating);

  // Mind-map connection edges (frame.data.edges). Recompute only when nodes/order
  // change — NOT on every drag frame (drag is local state, doesn't touch the store).
  const edgeList = useMemo(() => {
    const out: Array<{ from: string; to: string }> = [];
    for (const id of order) {
      const n = nodes[id];
      const edges = n?.type === 'frame' ? (n.data?.edges as Array<{ from: string; to: string }> | undefined) : undefined;
      if (Array.isArray(edges)) out.push(...edges);
    }
    return out;
  }, [order, nodes]);

  const [spaceDown, setSpaceDown] = useState(false);
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const [dragIds, setDragIds] = useState<string[]>([]);
  const [box, setBox] = useState<Box | null>(null);

  // Canvas size — tracked for viewport culling (recompute the visible rect on resize).
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Viewport culling (SKILL §6 / perf) ──────────────────────────────────────
  // Only render nodes whose AABB intersects the visible board rect, expanded by a
  // 50% margin on each side so cards never pop in at the edge mid-pan.
  const visible = useMemo(() => {
    const cw = size.w || (typeof window !== 'undefined' ? window.innerWidth : 1200);
    const ch = size.h || (typeof window !== 'undefined' ? window.innerHeight : 800);
    const { zoom, panX, panY } = viewport;
    const left = -panX / zoom;
    const top = -panY / zoom;
    const right = (cw - panX) / zoom;
    const bottom = (ch - panY) / zoom;
    const mx = (right - left) * 0.5;
    const my = (bottom - top) * 0.5;
    return { left: left - mx, top: top - my, right: right + mx, bottom: bottom + my };
  }, [size, viewport]);

  // Always render these regardless of the viewport: the current selection (covers
  // the card being edited — editing starts from a click that selects it), nodes
  // being dragged, and mind-map edge endpoints (so connection lines never dangle).
  const keepIds = useMemo(() => {
    const s = new Set<string>(selection);
    for (const id of dragIds) s.add(id);
    for (const e of edgeList) {
      s.add(e.from);
      s.add(e.to);
    }
    return s;
  }, [selection, dragIds, edgeList]);

  const inView = (n: BoardNode | undefined): boolean => {
    if (!n) return false;
    const b = worldBox(n); // 스케일된 카드도 정확히 컬링되도록 월드 박스 사용
    return b.x < visible.right && b.x + b.w > visible.left && b.y < visible.bottom && b.y + b.h > visible.top;
  };

  // 저줌 LOD(2-2): 줌이 임계 미만이면 이미지 카드를 플레이스홀더로 강등.
  // boolean이라 임계를 넘나들 때만 prop이 바뀌어 memo 효과를 해치지 않는다.
  const lodImages = viewport.zoom < IMG_PLACEHOLDER_ZOOM;

  // Stable identity for the node pointer-down handler (latest-ref pattern) so
  // memo(NodeView) can skip unchanged cards on the pan/zoom hot path — a fresh
  // inline handler each render would otherwise defeat the memo.
  const nodePointerDownRef = useRef<(e: React.PointerEvent, id: string) => void>(() => {});
  const onNodePointerDownStable = useCallback(
    (e: React.PointerEvent, id: string) => nodePointerDownRef.current(e, id),
    [],
  );
  // onNodePointerDown is a hoisted function declaration below; keep the ref current.
  nodePointerDownRef.current = onNodePointerDown;

  // Interaction bookkeeping kept in a ref so window listeners read latest values.
  const it = useRef<{
    mode: 'idle' | 'pan' | 'drag' | 'box';
    startX: number;
    startY: number;
    startPan: { x: number; y: number };
    dragIds: string[];
    boxStartWorld: { x: number; y: number };
  }>({ mode: 'idle', startX: 0, startY: 0, startPan: { x: 0, y: 0 }, dragIds: [], boxStartWorld: { x: 0, y: 0 } });

  // ── Scale / rotate handles (single-selection overlay) ───────────────────────
  // A corner handle scales the node uniformly (중심 기준); the top handle rotates
  // it. Both write node.scale / node.rot raw during the drag, then commit one
  // undoable step on release. shift while rotating snaps to 15°.
  const ht = useRef<{
    mode: 'resize' | 'rotate' | null;
    id: string;
    cx: number;
    cy: number;
    startScale: number;
    startRot: number;
    startDist: number;
    startAng: number;
    before: NodeSnap[];
  }>({ mode: null, id: '', cx: 0, cy: 0, startScale: 1, startRot: 0, startDist: 1, startAng: 0, before: [] });

  const handlePointerToWorld = useCallback((clientX: number, clientY: number) => {
    const rect = ref.current?.getBoundingClientRect();
    const { zoom, panX, panY } = useBoardStore.getState().viewport;
    return { x: (clientX - (rect?.left ?? 0) - panX) / zoom, y: (clientY - (rect?.top ?? 0) - panY) / zoom };
  }, []);

  const onHandleMove = useCallback(
    (e: PointerEvent) => {
      const st = ht.current;
      if (!st.mode) return;
      const w = handlePointerToWorld(e.clientX, e.clientY);
      if (st.mode === 'resize') {
        const d = Math.hypot(w.x - st.cx, w.y - st.cy);
        const scale = Math.min(6, Math.max(0.3, st.startScale * (d / st.startDist)));
        useBoardStore.getState().updateNodeRaw(st.id, { scale: Math.round(scale * 100) / 100 });
      } else {
        const ang = Math.atan2(w.y - st.cy, w.x - st.cx);
        let deg = st.startRot + ((ang - st.startAng) * 180) / Math.PI;
        if (e.shiftKey) deg = Math.round(deg / 15) * 15; // shift = 15° 스냅
        useBoardStore.getState().updateNodeRaw(st.id, { rot: (((Math.round(deg) % 360) + 360) % 360) });
      }
    },
    [handlePointerToWorld],
  );

  const onHandleUp = useCallback(() => {
    const st = ht.current;
    unlockTextSelection();
    window.removeEventListener('pointermove', onHandleMove);
    window.removeEventListener('pointerup', onHandleUp);
    if (st.mode && st.before.length) pushRedesign([st.id], st.before, st.mode === 'resize' ? '크기 조절' : '회전');
    st.mode = null;
  }, [onHandleMove]);

  const onHandleDown = useCallback(
    (e: React.PointerEvent, id: string, kind: 'resize' | 'rotate') => {
      e.stopPropagation();
      e.preventDefault();
      const n = useBoardStore.getState().nodes[id];
      if (!n) return;
      const cx = n.x + n.w / 2;
      const cy = n.y + renderHeight(n) / 2;
      const w = handlePointerToWorld(e.clientX, e.clientY);
      ht.current = {
        mode: kind,
        id,
        cx,
        cy,
        startScale: n.scale ?? 1,
        startRot: n.rot ?? 0,
        startDist: Math.hypot(w.x - cx, w.y - cy) || 1,
        startAng: Math.atan2(w.y - cy, w.x - cx),
        before: captureNodes([id]),
      };
      lockTextSelection();
      window.addEventListener('pointermove', onHandleMove);
      window.addEventListener('pointerup', onHandleUp);
    },
    [handlePointerToWorld, onHandleMove, onHandleUp],
  );

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLTextAreaElement)) setSpaceDown(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceDown(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  function toWorld(clientX: number, clientY: number) {
    const rect = ref.current!.getBoundingClientRect();
    const { zoom, panX, panY } = useBoardStore.getState().viewport;
    return { x: (clientX - rect.left - panX) / zoom, y: (clientY - rect.top - panY) / zoom };
  }

  function onPointerMove(e: PointerEvent) {
    const st = it.current;
    if (st.mode === 'pan') {
      const dx = e.clientX - st.startX;
      const dy = e.clientY - st.startY;
      useBoardStore.getState().setViewport({ panX: st.startPan.x + dx, panY: st.startPan.y + dy });
    } else if (st.mode === 'drag') {
      const zoom = useBoardStore.getState().viewport.zoom;
      setDrag({ dx: (e.clientX - st.startX) / zoom, dy: (e.clientY - st.startY) / zoom });
    } else if (st.mode === 'box') {
      const cur = toWorld(e.clientX, e.clientY);
      setBox({
        x: Math.min(cur.x, st.boxStartWorld.x),
        y: Math.min(cur.y, st.boxStartWorld.y),
        w: Math.abs(cur.x - st.boxStartWorld.x),
        h: Math.abs(cur.y - st.boxStartWorld.y),
      });
    }
  }

  function onPointerUp(e: PointerEvent) {
    const st = it.current;
    if (st.mode === 'drag') {
      const zoom = useBoardStore.getState().viewport.zoom;
      const dx = (e.clientX - st.startX) / zoom;
      const dy = (e.clientY - st.startY) / zoom;
      moveNodesCmd(st.dragIds, dx, dy);
      rebindFrameMembership(st.dragIds); // re-parent cards dragged onto/off a frame
      setDrag(null);
      setDragIds([]);
    } else if (st.mode === 'box') {
      const cur = toWorld(e.clientX, e.clientY);
      const x0 = Math.min(cur.x, st.boxStartWorld.x);
      const y0 = Math.min(cur.y, st.boxStartWorld.y);
      const x1 = Math.max(cur.x, st.boxStartWorld.x);
      const y1 = Math.max(cur.y, st.boxStartWorld.y);
      const b = useBoardStore.getState();
      // Frames are NOT box-selectable — their large box always intersects a box drawn
      // over their interior, which would wrongly pull the frame into the selection and
      // move it when the inner cards are dragged. A frame is selected/moved only via
      // its border strips or title tab. Box-select grabs loose cards/content only.
      const hits = Object.values(b.nodes)
        .filter((n) => n.type !== 'frame' && n.x < x1 && n.x + n.w > x0 && n.y < y1 && n.y + n.h > y0)
        .map((n) => n.id);
      if (hits.length || !e.shiftKey) b.setSelection(hits);
      setBox(null);
    }
    st.mode = 'idle';
    unlockTextSelection();
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  }

  function beginWindowTracking() {
    lockTextSelection(); // 배경/박스/노드 드래그 중 텍스트가 파랑색으로 선택되지 않게
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }

  /** Start a viewport pan from a pointer-down (middle button or space-drag).
      Shared by the background AND nodes so the middle button only ever pans the
      canvas — it must never drag a card/frame/image. */
  function startPan(e: React.PointerEvent) {
    const vp = useBoardStore.getState().viewport;
    it.current = {
      ...it.current,
      mode: 'pan',
      startX: e.clientX,
      startY: e.clientY,
      startPan: { x: vp.panX, y: vp.panY },
    };
    beginWindowTracking();
  }

  function onBackgroundPointerDown(e: React.PointerEvent) {
    if (e.button === 1 || spaceDown) {
      startPan(e);
      return;
    }
    // box select
    if (!e.shiftKey) useBoardStore.getState().clearSelection();
    it.current = { ...it.current, mode: 'box', boxStartWorld: toWorld(e.clientX, e.clientY) };
    setBox({ x: it.current.boxStartWorld.x, y: it.current.boxStartWorld.y, w: 0, h: 0 });
    beginWindowTracking();
  }

  function onNodePointerDown(e: React.PointerEvent, id: string) {
    e.stopPropagation();
    // Middle button (or space-drag) over a card = pan the canvas, never move the
    // card. The node swallows the event (stopPropagation), so handle pan here too.
    if (e.button === 1 || spaceDown) {
      startPan(e);
      return;
    }
    const b = useBoardStore.getState();
    let ids: string[];
    if (e.shiftKey) {
      b.toggleSelection(id);
      ids = b.selection.includes(id) ? b.selection.filter((x) => x !== id) : [...b.selection, id];
    } else if (b.selection.includes(id)) {
      ids = b.selection;
    } else {
      b.setSelection([id]);
      ids = [id];
    }
    // include group members
    const groups = new Set(ids.map((i) => b.nodes[i]?.group).filter(Boolean));
    if (groups.size) {
      ids = Object.values(b.nodes)
        .filter((n) => ids.includes(n.id) || (n.group && groups.has(n.group)))
        .map((n) => n.id);
      b.setSelection(ids);
    }
    // Mind-map hierarchy: clicking a parent card selects + moves its whole subtree
    // (center → branches → sub-branches + their images/docs), like a frame's children.
    const clicked = b.nodes[id];
    const mmFrame =
      clicked?.data?.role === 'mm-branch' || clicked?.data?.role === 'mm-center'
        ? (clicked.data?.frameId as string | undefined)
        : undefined;
    let moveIds = ids;
    if (mmFrame && !e.shiftKey) {
      const subtree = [id, ...mindMapSubtree(mmFrame, id)];
      ids = subtree;
      b.setSelection(subtree);
      moveIds = subtree;
    } else if (b.nodes[id]?.type === 'frame') {
      // dragging a frame carries its children (tagged + overlapping) — frame group-move
      moveIds = [id, ...frameMoveSet(id)];
    }
    it.current = { ...it.current, mode: 'drag', startX: e.clientX, startY: e.clientY, dragIds: moveIds };
    setDragIds(moveIds);
    setDrag({ dx: 0, dy: 0 });
    beginWindowTracking();
  }

  function onBackgroundDoubleClick(e: React.MouseEvent) {
    // Double-click inside a frame's box (click-through interior) → focus that frame;
    // on truly empty canvas → fit all. (A card's own dblclick stops propagation.)
    const w = toWorld(e.clientX, e.clientY);
    const fid = frameOfPoint(w.x, w.y);
    const b = useBoardStore.getState();
    if (fid) b.focusNode(fid);
    else b.fit();
  }

  function onWheel(e: React.WheelEvent) {
    if (e.deltaY === 0) return; // horizontal-only wheel/trackpad — ignore
    const forceZoom = e.ctrlKey || e.metaKey;
    // Over scrollable content (a doc/frame with its own scroll) that can still move
    // in this direction → let the browser scroll it natively. ctrl/⌘ forces zoom.
    if (!forceZoom && scrollableUnderCursor(e.target, e.deltaY, ref.current)) return;
    // Default: zoom toward the cursor (background or non-scrolling content).
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const rect = ref.current!.getBoundingClientRect();
    useBoardStore.getState().zoomBy(factor, e.clientX - rect.left, e.clientY - rect.top);
  }

  return (
    <div
      ref={ref}
      data-kv-canvas
      onPointerDown={onBackgroundPointerDown}
      onWheel={onWheel}
      onDoubleClick={onBackgroundDoubleClick}
      className="relative h-full w-full overflow-hidden bg-bg"
      style={{ cursor: spaceDown ? 'grab' : 'default', touchAction: 'none' }}
    >
      {/* dotted grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.5]"
        style={{
          backgroundImage: 'radial-gradient(var(--sand-line) 1px, transparent 1px)',
          backgroundSize: `${24 * viewport.zoom}px ${24 * viewport.zoom}px`,
          backgroundPosition: `${viewport.panX}px ${viewport.panY}px`,
        }}
      />

      {/* world */}
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{ transform: `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})` }}
      >
        {laneOrder.map((id) => (lanes[id] ? <LaneView key={id} lane={lanes[id]} /> : null))}

        {/* frames render behind (back container layer), other cards on top */}
        {order
          .filter((id) => nodes[id]?.type === 'frame')
          .filter((id) => keepIds.has(id) || inView(nodes[id]))
          .map((id) => {
            const n = nodes[id];
            const sel = selection.includes(id);
            return (
              <MemoNodeView
                key={id}
                node={n}
                selected={sel}
                onPointerDown={onNodePointerDownStable}
                dx={drag && dragIds.includes(id) ? drag.dx : 0}
                dy={drag && dragIds.includes(id) ? drag.dy : 0}
                lod={lodImages}
              />
            );
          })}

        {/* mind-map connection lines — above the frame bg, below the cards. Edges
            live on the mind-map frame as data.edges = [{from,to}] node-id pairs. */}
        <svg className="pointer-events-none absolute left-0 top-0" width="1" height="1" style={{ overflow: 'visible' }}>
          {edgeList.map((e) => {
            const a = nodes[e.from];
            const z = nodes[e.to];
            if (!a || !z) return null;
            const oa = drag && dragIds.includes(a.id) ? drag : { dx: 0, dy: 0 };
            const oz = drag && dragIds.includes(z.id) ? drag : { dx: 0, dy: 0 };
            const ah = typeof a.data?.renderH === 'number' ? a.data.renderH : a.h;
            const zh = typeof z.data?.renderH === 'number' ? z.data.renderH : z.h;
            return (
              <line
                key={`${e.from}-${e.to}`}
                x1={a.x + oa.dx + a.w / 2}
                y1={a.y + oa.dy + ah / 2}
                x2={z.x + oz.dx + z.w / 2}
                y2={z.y + oz.dy + zh / 2}
                stroke="var(--accent)"
                strokeWidth={2}
                strokeLinecap="round"
                opacity={0.45}
              />
            );
          })}
        </svg>

        {order
          .filter((id) => nodes[id] && nodes[id].type !== 'frame')
          .filter((id) => keepIds.has(id) || inView(nodes[id]))
          .map((id) => {
            const n = nodes[id];
            const sel = selection.includes(id);
            return (
              <MemoNodeView
                key={id}
                node={n}
                selected={sel}
                onPointerDown={onNodePointerDownStable}
                dx={drag && dragIds.includes(id) ? drag.dx : 0}
                dy={drag && dragIds.includes(id) ? drag.dy : 0}
                lod={lodImages}
              />
            );
          })}

        {/* 스케일·회전 핸들 — 단일 선택 시에만(드래그/박스 중엔 숨김). 러너 제외. */}
        {selection.length === 1 && !drag && !box && nodes[selection[0]] && nodes[selection[0]].type !== 'runner' && (
          <SelectionHandles node={nodes[selection[0]]} zoom={viewport.zoom} onHandleDown={onHandleDown} />
        )}

        {/* selection box */}
        {box && (
          <div
            className="pointer-events-none absolute border border-accent bg-accent/10"
            style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
          />
        )}
      </div>

      {/* generating status pill — screen-fixed, above the world (SKILL §6: 5 states).
          Floats at top-center while any AI generation is running so the board never
          looks frozen. pointer-events-none so it never blocks canvas interaction. */}
      {generating && (
        <div className="pointer-events-none absolute left-1/2 top-5 z-30 -translate-x-1/2">
          <div className="flex items-center gap-2.5 rounded-pill border border-border bg-surface py-2 pl-3 pr-4 shadow-lg">
            <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-accent-soft border-t-accent" />
            <span className="text-sm font-medium text-fg">{generating}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* 단일 선택 노드의 스케일·회전 핸들. 노드와 같은 transform(중심 회전·스케일)을 따라
   네 모서리(스케일)와 상단(회전) 핸들을 월드 좌표에 그린다. 핸들 크기는 zoom으로
   역보정해 화면상 ~12px로 일정하게 유지한다(world div가 zoom배 스케일되므로). */
function SelectionHandles({
  node,
  zoom,
  onHandleDown,
}: {
  node: BoardNode;
  zoom: number;
  onHandleDown: (e: React.PointerEvent, id: string, kind: 'resize' | 'rotate') => void;
}) {
  const s = node.scale ?? 1;
  const r = ((node.rot ?? 0) * Math.PI) / 180;
  const h = renderHeight(node);
  const cx = node.x + node.w / 2;
  const cy = node.y + h / 2;
  const hw = (node.w * s) / 2;
  const hh = (h * s) / 2;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const rot = (ox: number, oy: number) => ({ x: cx + ox * cos - oy * sin, y: cy + ox * sin + oy * cos });
  const corners = [rot(-hw, -hh), rot(hw, -hh), rot(hw, hh), rot(-hw, hh)];
  const cursors = ['nwse-resize', 'nesw-resize', 'nwse-resize', 'nesw-resize'];
  const topMid = rot(0, -hh);
  // 회전된 up 벡터 (sin, -cos) 방향으로 회전 핸들을 30px 띄운다.
  const rotHandle = { x: topMid.x + sin * (30 / zoom), y: topMid.y - cos * (30 / zoom) };
  const sz = 12 / zoom; // 화면상 ~12px
  const bw = Math.max(1, 1.5 / zoom);
  const dot = (x: number, y: number): React.CSSProperties => ({
    position: 'absolute',
    left: x,
    top: y,
    width: sz,
    height: sz,
    transform: 'translate(-50%, -50%)',
    borderWidth: bw,
  });
  return (
    <>
      {/* 회전 핸들로 잇는 가는 선 */}
      <svg className="pointer-events-none absolute left-0 top-0" width="1" height="1" style={{ overflow: 'visible' }}>
        <line
          x1={topMid.x}
          y1={topMid.y}
          x2={rotHandle.x}
          y2={rotHandle.y}
          stroke="var(--accent)"
          strokeWidth={1 / zoom}
          opacity={0.7}
        />
      </svg>
      {/* 모서리 스케일 핸들 */}
      {corners.map((c, i) => (
        <div
          key={i}
          onPointerDown={(e) => onHandleDown(e, node.id, 'resize')}
          className="border-accent bg-surface shadow-sm"
          style={{ ...dot(c.x, c.y), cursor: cursors[i], borderStyle: 'solid', borderRadius: 2 }}
          title="크기 조절 (드래그)"
        />
      ))}
      {/* 회전 핸들(원형) */}
      <div
        onPointerDown={(e) => onHandleDown(e, node.id, 'rotate')}
        className="border-accent bg-surface shadow-sm"
        style={{ ...dot(rotHandle.x, rotHandle.y), cursor: 'grab', borderStyle: 'solid', borderRadius: '9999px' }}
        title="회전 (드래그 · Shift=15°)"
      />
    </>
  );
}
