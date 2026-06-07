import { useEffect, useRef, useState } from 'react';
import { useBoardStore } from '@/store/boardStore';
import { moveNodesCmd } from '@/board/commands';
import { NodeView } from './NodeView';
import { LaneView } from './LaneView';

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

  const [spaceDown, setSpaceDown] = useState(false);
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const [dragIds, setDragIds] = useState<string[]>([]);
  const [box, setBox] = useState<Box | null>(null);

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
    // dragging a frame carries every card overlapping it (frame group-move)
    let moveIds = ids;
    if (b.nodes[id]?.type === 'frame') {
      moveIds = [id, ...containedNodeIds(id)];
    }
    it.current = { ...it.current, mode: 'drag', startX: e.clientX, startY: e.clientY, dragIds: moveIds };
    setDragIds(moveIds);
    setDrag({ dx: 0, dy: 0 });
    beginWindowTracking();
  }

  /** Cards overlapping a frame (move together with it). */
  function containedNodeIds(frameId: string): string[] {
    const b = useBoardStore.getState();
    const f = b.nodes[frameId];
    if (!f) return [];
    return Object.values(b.nodes)
      .filter(
        (n) =>
          n.id !== frameId &&
          n.type !== 'frame' &&
          n.x < f.x + f.w &&
          n.x + n.w > f.x &&
          n.y < f.y + f.h &&
          n.y + Math.max(n.h, 60) > f.y,
      )
      .map((n) => n.id);
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
          .map((id) => {
            const n = nodes[id];
            const sel = selection.includes(id);
            return (
              <NodeView
                key={id}
                node={n}
                selected={sel}
                onPointerDown={onNodePointerDown}
                dx={drag && dragIds.includes(id) ? drag.dx : 0}
                dy={drag && dragIds.includes(id) ? drag.dy : 0}
              />
            );
          })}

        {order
          .filter((id) => nodes[id] && nodes[id].type !== 'frame')
          .map((id) => {
            const n = nodes[id];
            const sel = selection.includes(id);
            return (
              <NodeView
                key={id}
                node={n}
                selected={sel}
                onPointerDown={onNodePointerDown}
                dx={drag && dragIds.includes(id) ? drag.dx : 0}
                dy={drag && dragIds.includes(id) ? drag.dy : 0}
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
    </div>
  );
}
