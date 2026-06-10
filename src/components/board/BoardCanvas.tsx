import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBoardStore, type BoardNode } from '@/store/boardStore';
import { moveNodesCmd } from '@/board/commands';
import { mindMapSubtree } from '@/board/composer';
import { frameMoveSet, rebindFrameMembership } from '@/board/frames';
import { IMG_PLACEHOLDER_ZOOM } from '@/board/imageLod';
import { NodeView } from './NodeView';
import { LaneView } from './LaneView';

// Memoized node — on pan/zoom the viewport changes but each node's props (node,
// selected, dx, dy, onPointerDown) don't, so memo skips re-rendering every card.
// Requires a STABLE onPointerDown (see onNodePointerDownStable below).
const MemoNodeView = memo(NodeView);

/* The infinite canvas surface (SKILL §6). Pan (space+drag / wheel), zoom
   (ctrl/⌘+wheel toward cursor), drag-box selection on empty space, node drag
   (committed as one undoable move). Renders free primitives + workflow lanes. */

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

  const inView = (n: BoardNode | undefined): boolean =>
    !!n && n.x < visible.right && n.x + n.w > visible.left && n.y < visible.bottom && n.y + n.h > visible.top;

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
      const hits = Object.values(b.nodes)
        .filter((n) => n.x < x1 && n.x + n.w > x0 && n.y < y1 && n.y + n.h > y0)
        .map((n) => n.id);
      if (hits.length || !e.shiftKey) b.setSelection(hits);
      setBox(null);
    }
    st.mode = 'idle';
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  }

  function beginWindowTracking() {
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }

  function onBackgroundPointerDown(e: React.PointerEvent) {
    if (e.button === 1 || spaceDown) {
      // pan
      it.current = {
        ...it.current,
        mode: 'pan',
        startX: e.clientX,
        startY: e.clientY,
        startPan: { x: viewport.panX, y: viewport.panY },
      };
      beginWindowTracking();
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

  function onWheel(e: React.WheelEvent) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const rect = ref.current!.getBoundingClientRect();
      useBoardStore.getState().zoomBy(factor, e.clientX - rect.left, e.clientY - rect.top);
    } else {
      useBoardStore
        .getState()
        .setViewport({ panX: viewport.panX - e.deltaX, panY: viewport.panY - e.deltaY });
    }
  }

  return (
    <div
      ref={ref}
      onPointerDown={onBackgroundPointerDown}
      onWheel={onWheel}
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
