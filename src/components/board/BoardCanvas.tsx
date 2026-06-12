import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBoardStore, presentationVisibleSet, type BoardNode, type BoardLink } from '@/store/boardStore';
import { moveNodesCmd, captureNodes, pushRedesign, addLinkCmd, removeLinkCmd, relinkCmd, type NodeSnap } from '@/board/commands';
import { linkSequence } from '@/board/links';
import { mindMapSubtree } from '@/board/composer';
import { regenImageCard, genTextCard } from '@/board/workflow';
import { frameMoveSet, rebindFrameMembership, frameOfPoint } from '@/board/frames';
import { worldBox, renderHeight } from '@/board/geometry';
import { IMG_PLACEHOLDER_ZOOM } from '@/board/imageLod';
import { NodeView } from './NodeView';
import { normalizeMotionNode } from '@/board/motionGeometry';
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
  // 드래그 동안 iframe이 포인터 이벤트를 삼키지 않게(임베드 위에서 pointerup 유실 방지).
  document.body.classList.add('kv-iframe-shield');
}
function unlockTextSelection() {
  if (typeof document === 'undefined') return;
  document.body.style.userSelect = '';
  (document.body.style as unknown as { webkitUserSelect: string }).webkitUserSelect = '';
  document.body.classList.remove('kv-iframe-shield');
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
  const links = useBoardStore((s) => s.links);
  const classroom = useBoardStore((s) => s.classroom);
  const show = useBoardStore((s) => s.show);

  // ── 요소 연결선 — 양 끝이 살아있는 링크만, 순번(1, 2, 3…) 포함 ────────────
  const liveLinks = useMemo(() => links.filter((l) => nodes[l.from] && nodes[l.to]), [links, nodes]);
  const linkSeq = useMemo(() => linkSequence(liveLinks), [liveLinks]);
  // 수업 모드 — 연결망에 포함된 요소만 렌더(나머지 숨김).
  // 슬라이드 쇼 — 현재 슬라이드 한 장만(아이들에게 한 장씩).
  // 프레임이 보이면 그 안의 자식 카드(data.frameId)도 함께 보여야 한다(빈 프레임 방지).
  const classSet = useMemo(
    () => presentationVisibleSet(nodes, classroom, show),
    [classroom, show, nodes],
  );

  // 노드·면(l/r)별로 붙은 링크 목록(생성 순) — 선과 포트가 같은 슬롯을 공유해
  // 연결이 여러 개면 각자 다른 점에서 선이 나간다(한 점 두 갈래 방지).
  const sideMap = useMemo(() => {
    const m = new Map<string, { l: string[]; r: string[] }>();
    const put = (id: string, side: 'l' | 'r', linkId: string) => {
      if (!m.has(id)) m.set(id, { l: [], r: [] });
      m.get(id)![side].push(linkId);
    };
    for (const l of liveLinks) {
      const ab = worldBox(nodes[l.from]);
      const zb = worldBox(nodes[l.to]);
      const l2r = ab.x + ab.w / 2 <= zb.x + zb.w / 2;
      put(l.from, l2r ? 'r' : 'l', l.id);
      put(l.to, l2r ? 'l' : 'r', l.id);
    }
    return m;
  }, [liveLinks, nodes]);

  /** 한 면의 포트 슬롯들 — 붙은 링크들(순서대로) + 마지막에 '새 연결' 슬롯.
      전체가 측변 세로 중앙을 기준으로 나란히 정렬된다. */
  function portSlots(nodeId: string, side: 'l' | 'r'): Array<{ x: number; y: number; linkId?: string }> {
    const n = nodes[nodeId];
    if (!n) return [];
    const b = worldBox(n);
    const list = sideMap.get(nodeId)?.[side] ?? [];
    const total = list.length + 1;
    const gap = 22 / viewport.zoom;
    const x = side === 'l' ? b.x : b.x + b.w;
    const cy = b.y + b.h / 2;
    return Array.from({ length: total }, (_, i) => ({
      x,
      y: cy + (i - (total - 1) / 2) * gap,
      linkId: list[i],
    }));
  }

  /** 링크의 한쪽 끝 좌표 — 그 링크가 차지한 포트 슬롯 위치. */
  function linkAnchor(nodeId: string, side: 'l' | 'r', linkId: string, off: { dx: number; dy: number }) {
    const slots = portSlots(nodeId, side);
    const slot = slots.find((sl) => sl.linkId === linkId) ?? slots[0];
    return { x: slot.x + off.dx, y: slot.y + off.dy };
  }

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

  // ── 연결 포트(호버 시 좌/우 원형 버튼) + 포트 드래그로 선 잇기 ──────────────
  // 텍스트·메모·이미지·영상(임베드)·프레임만 연결 가능(도형·러너 제외).
  const LINKABLE = useMemo(() => new Set(['text', 'sticky', 'image', 'frame']), []);
  const [portsId, setPortsId] = useState<string | null>(null);
  const [linkLine, setLinkLine] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  // 연결 직후 생성 제안 — 빈 메모/이미지 카드를 다른 요소와 이으면
  // "연결된 요소 'X'에 대한 내용/이미지를 생성할까요?" 확인 카드를 띄운다.
  const [proposal, setProposal] = useState<{ id: string; topic: string; kind: 'memo' | 'image' } | null>(null);
  // mode 'new' = 빈 포트에서 새 연결, 'detach' = 연결된 포트를 떼어내 분리/옮기기.
  // from = 고정된(반대쪽) 끝, keepFrom = 고정 끝이 링크의 from인지.
  const lk = useRef<{ mode: 'new' | 'detach'; from: string; x1: number; y1: number; linkId?: string; keepFrom?: boolean } | null>(null);

  /** 월드 좌표에서 연결 가능한 최상위 노드(포트 여유 16px 포함). */
  const linkableAt = useCallback(
    (wx: number, wy: number): BoardNode | null => {
      const s = useBoardStore.getState();
      const pad = 16 / s.viewport.zoom;
      for (let i = s.order.length - 1; i >= 0; i--) {
        const n = s.nodes[s.order[i]];
        if (!n || n.locked || !LINKABLE.has(n.type)) continue;
        const b = worldBox(n);
        if (wx >= b.x - pad && wx <= b.x + b.w + pad && wy >= b.y - pad && wy <= b.y + b.h + pad) return n;
      }
      return null;
    },
    [LINKABLE],
  );

  /** 캔버스 호버 → 포트를 보여줄 노드 추적(드래그/팬/박스/수업 모드 중엔 끔). */
  function onCanvasHover(e: React.PointerEvent) {
    if (lk.current) return; // 연결 드래그 중 — 별도 핸들러가 관리
    if (it.current.mode !== 'idle' || ht.current.mode || classroom || show) {
      if (portsId) setPortsId(null);
      return;
    }
    const w = toWorld(e.clientX, e.clientY);
    const hit = linkableAt(w.x, w.y);
    const next = hit ? hit.id : null;
    if (next !== portsId) setPortsId(next);
  }

  const onLinkMove = useCallback(
    (e: PointerEvent) => {
      const st = lk.current;
      if (!st) return;
      const w = handlePointerToWorld(e.clientX, e.clientY);
      setLinkLine({ x1: st.x1, y1: st.y1, x2: w.x, y2: w.y });
      const t = linkableAt(w.x, w.y);
      setPortsId(t && t.id !== st.from ? t.id : null); // 드롭 대상 하이라이트
    },
    [handlePointerToWorld, linkableAt],
  );

  const onLinkUp = useCallback(
    (e: PointerEvent) => {
      const st = lk.current;
      lk.current = null;
      unlockTextSelection();
      window.removeEventListener('pointermove', onLinkMove);
      window.removeEventListener('pointerup', onLinkUp);
      setLinkLine(null);
      if (!st) return;
      const w = handlePointerToWorld(e.clientX, e.clientY);
      const target = linkableAt(w.x, w.y);
      if (st.mode === 'new') {
        if (target && target.id !== st.from) {
          const created = addLinkCmd(st.from, target.id);
          // 연결 직후 제안 — 상대 요소의 캡션/제목을 주제로:
          //  · 유튜브 뷰어 ↔ 요소 → 뷰어 안 "영상을 찾아 연결할까요?" (뷰어가 처리)
          //  · 빈 메모/이미지 ↔ 요소 → 보드 위 "내용/이미지를 생성할까요?" 팝오버
          if (created) {
            const ss = useBoardStore.getState();
            const pair = [ss.nodes[st.from], ss.nodes[target.id]].filter(Boolean) as BoardNode[];
            const topicOf = (n?: BoardNode) =>
              n ? ((n.text ?? '') || String(n.data?.title ?? '')).split('\n')[0].trim() : '';
            const viewer = pair.find((n) => String(n.data?.embed ?? '').includes('youtube-viewer'));
            if (viewer) {
              const other = pair.find((n) => n !== viewer);
              const topic = topicOf(other);
              if (topic) window.dispatchEvent(new CustomEvent('kv:yt-propose', { detail: { target: viewer.id, topic } }));
            } else {
              // 빈 카드만 제안 — 채워진 이미지끼리 잇는 슬라이드 체인을 방해하지 않게.
              const emptyMemo = (n: BoardNode) =>
                n.type === 'sticky' && !n.data?.embed && !n.data?.doc && !(n.text ?? '').trim();
              const emptyImage = (n: BoardNode) => n.type === 'image' && !n.src && !n.loading;
              const genNode = pair.find((n) => emptyMemo(n) || emptyImage(n));
              const other = pair.find((n) => n !== genNode);
              const topic = topicOf(other);
              if (genNode && topic) {
                setProposal({ id: genNode.id, topic, kind: emptyImage(genNode) ? 'image' : 'memo' });
              }
            }
          }
        }
      } else if (st.linkId) {
        // 떼어내기: 빈 곳 = 연결 해제, 다른 요소 = 옮겨 연결, 제자리(원래 카드/고정 끝) = 유지
        const link = useBoardStore.getState().links.find((l) => l.id === st.linkId);
        if (link) {
          const detached = st.keepFrom ? link.to : link.from; // 원래 붙어 있던(떼어낸) 쪽
          if (!target) relinkCmd(link.id, null);
          else if (target.id !== detached && target.id !== st.from) {
            relinkCmd(link.id, st.keepFrom ? { from: st.from, to: target.id } : { from: target.id, to: st.from });
          }
        }
      }
      setPortsId(null);
    },
    [handlePointerToWorld, linkableAt, onLinkMove],
  );

  /** 포트 pointerdown — 노드 드래그를 막고 연결 드래그를 시작한다.
      detachLink가 있으면 그 연결을 '떼어내는' 드래그(반대쪽 끝은 고정).
      slot = 잡은 포트의 좌표 — 임시 선이 그 점에서 출발한다. */
  function onPortDown(
    e: React.PointerEvent,
    nodeId: string,
    _side: 'l' | 'r',
    slot: { x: number; y: number },
    detachLink?: BoardLink,
  ) {
    e.stopPropagation();
    e.preventDefault();
    const s = useBoardStore.getState();
    const n = s.nodes[nodeId];
    if (!n) return;
    if (detachLink) {
      const otherId = detachLink.from === nodeId ? detachLink.to : detachLink.from;
      const other = s.nodes[otherId];
      if (!other) return;
      // 고정(반대쪽) 끝의 슬롯 위치에서 임시 선이 출발한다.
      const ab = worldBox(s.nodes[detachLink.from]);
      const zb = worldBox(s.nodes[detachLink.to]);
      const l2r = ab.x + ab.w / 2 <= zb.x + zb.w / 2;
      const otherSide: 'l' | 'r' = detachLink.from === otherId ? (l2r ? 'r' : 'l') : (l2r ? 'l' : 'r');
      const anch = linkAnchor(otherId, otherSide, detachLink.id, { dx: 0, dy: 0 });
      lk.current = {
        mode: 'detach',
        from: otherId,
        x1: anch.x,
        y1: anch.y,
        linkId: detachLink.id,
        keepFrom: detachLink.from === otherId,
      };
    } else {
      lk.current = { mode: 'new', from: nodeId, x1: slot.x, y1: slot.y };
    }
    lockTextSelection();
    window.addEventListener('pointermove', onLinkMove);
    window.addEventListener('pointerup', onLinkUp);
  }

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
      const dx = (e.clientX - st.startX) / zoom;
      const dy = (e.clientY - st.startY) / zoom;
      setDrag({ dx, dy });
      // 모션 라인이 연결 카드의 이동을 실시간으로 따라가도록 오프셋을 공유한다.
      useBoardStore.getState().setDragging({ ids: st.dragIds, dx, dy });
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
      // 연결 카드만 끌었으면 모션 라인의 '출발점'도 같은 변위로 따라간다
      // (도착점은 카드 중심에서 파생되므로 저절로 따라온다).
      const b2 = useBoardStore.getState();
      b2.setDragging(null);
      for (const n of Object.values(b2.nodes)) {
        if (n.type !== 'motion' || st.dragIds.includes(n.id)) continue;
        const sId = n.data?.aStart as string | undefined;
        const p = n.data?.p1 as { x: number; y: number } | undefined;
        if (sId && p && st.dragIds.includes(sId)) {
          b2.updateNodeRaw(n.id, { data: { ...n.data, p1: { x: p.x + dx, y: p.y + dy } } });
          normalizeMotionNode(n.id);
        }
      }
      setDrag(null);
      setDragIds([]);
    } else if (st.mode === 'box') {
      const cur = toWorld(e.clientX, e.clientY);
      const x0 = Math.min(cur.x, st.boxStartWorld.x);
      const y0 = Math.min(cur.y, st.boxStartWorld.y);
      const x1 = Math.max(cur.x, st.boxStartWorld.x);
      const y1 = Math.max(cur.y, st.boxStartWorld.y);
      const b = useBoardStore.getState();
      // 수업 모드·슬라이드 쇼 — 화면에 보이는 수업자료만 박스 선택 대상(숨긴 요소 제외).
      const vis = presentationVisibleSet(b.nodes, b.classroom, b.show);
      // Frames are NOT box-selectable — their large box always intersects a box drawn
      // over their interior, which would wrongly pull the frame into the selection and
      // move it when the inner cards are dragged. A frame is selected/moved only via
      // its border strips or title tab. Box-select grabs loose cards/content only.
      const hits = Object.values(b.nodes)
        .filter((n) => n.type !== 'frame' && n.x < x1 && n.x + n.w > x0 && n.y < y1 && n.y + n.h > y0)
        .filter((n) => !vis || vis.has(n.id))
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
    // 모션 라인(이동 애니메이션)을 끌면 연결된 출발/도착 카드도 함께 이동한다.
    const motionExtra = moveIds.flatMap((mid) => {
      const n = b.nodes[mid];
      if (n?.type !== 'motion') return [];
      return [n.data?.aStart, n.data?.aEnd].filter(
        (x): x is string => typeof x === 'string' && !!b.nodes[x],
      );
    });
    if (motionExtra.length) moveIds = [...new Set([...moveIds, ...motionExtra])];
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
      onPointerMove={onCanvasHover}
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
        {!classroom && !show && laneOrder.map((id) => (lanes[id] ? <LaneView key={id} lane={lanes[id]} /> : null))}

        {/* frames render behind (back container layer), other cards on top */}
        {order
          .filter((id) => nodes[id]?.type === 'frame')
          .filter((id) => !classSet || classSet.has(id))
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
            if (classSet && (!classSet.has(e.from) || !classSet.has(e.to))) return null;
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
          .filter((id) => !classSet || classSet.has(id))
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

        {/* ── 요소 연결선 — 포트 드래그로 만든 from→to 곡선. 클릭하면 연결 해제. ── */}
        <svg className="absolute left-0 top-0" width="1" height="1" style={{ overflow: 'visible', pointerEvents: 'none' }}>
          {liveLinks.map((l) => {
            if (classSet && (!classSet.has(l.from) || !classSet.has(l.to))) return null;
            const a = nodes[l.from];
            const z = nodes[l.to];
            const oa = drag && dragIds.includes(l.from) ? drag : { dx: 0, dy: 0 };
            const oz = drag && dragIds.includes(l.to) ? drag : { dx: 0, dy: 0 };
            const ab = worldBox(a);
            const zb = worldBox(z);
            // 면 판정은 sideMap과 동일하게(오프셋 없이) — 슬롯과 선이 항상 같은 점.
            const l2r = ab.x + ab.w / 2 <= zb.x + zb.w / 2;
            const p1 = linkAnchor(l.from, l2r ? 'r' : 'l', l.id, oa);
            const p2 = linkAnchor(l.to, l2r ? 'l' : 'r', l.id, oz);
            const x1 = p1.x;
            const y1 = p1.y;
            const x2 = p2.x;
            const y2 = p2.y;
            const k = (l2r ? 1 : -1) * Math.max(28, Math.min(90, Math.abs(x2 - x1) / 2));
            const d = `M ${x1} ${y1} C ${x1 + k} ${y1}, ${x2 - k} ${y2}, ${x2} ${y2}`;
            return (
              <g key={l.id}>
                <path d={d} fill="none" stroke="var(--accent)" strokeWidth={2 / viewport.zoom} strokeLinecap="round" opacity={0.65} />
                <circle cx={x2} cy={y2} r={3.5 / viewport.zoom} fill="var(--accent)" opacity={0.85} />
                {/* 넉넉한 투명 히트 영역 — 클릭으로 연결 해제(undo 가능) */}
                {!classroom && (
                  <path
                    d={d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={12 / viewport.zoom}
                    style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                    onClick={() => removeLinkCmd(l.id)}
                  >
                    <title>클릭하면 연결 해제</title>
                  </path>
                )}
              </g>
            );
          })}
          {/* 연결 드래그 중 임시 선 */}
          {linkLine && (
            <path
              d={`M ${linkLine.x1} ${linkLine.y1} C ${linkLine.x1 + 40} ${linkLine.y1}, ${linkLine.x2 - 40} ${linkLine.y2}, ${linkLine.x2} ${linkLine.y2}`}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={2 / viewport.zoom}
              strokeDasharray={`${6 / viewport.zoom} ${5 / viewport.zoom}`}
              strokeLinecap="round"
              opacity={0.8}
            />
          )}
        </svg>

        {/* 연결 포트 — 호버한 카드의 좌/우 세로 중앙 원형 버튼.
            빈 포트: 드래그해서 새 연결. 이미 연결된 면: 채워진 포트(드래그=떼어내기 —
            빈 곳에 놓으면 분리, 다른 요소에 놓으면 옮겨 연결) + 그 아래 새 포트가
            하나 더 생겨 또 다른 요소와 가지(1-1) 연결을 만들 수 있다. */}
        {!classroom && !show && portsId && nodes[portsId] && !drag && (() => {
          const pn = nodes[portsId];
          const sz = 14 / viewport.zoom;
          const ring = lk.current && lk.current.from !== portsId; // 드롭 대상 하이라이트
          const dot = (key: string, slot: { x: number; y: number }, side: 'l' | 'r', detach?: BoardLink) => (
            <div
              key={key}
              title={detach ? '드래그해서 떼어내기 — 빈 곳에 놓으면 연결 해제' : '드래그해서 다른 카드와 연결'}
              onPointerDown={(e) => onPortDown(e, pn.id, side, slot, detach)}
              className={`absolute z-30 rounded-full border-2 border-accent shadow-sm transition-colors duration-150 ease-soft ${
                detach || ring ? 'bg-accent' : 'bg-surface hover:bg-accent'
              }`}
              style={{
                left: slot.x,
                top: slot.y,
                width: sz,
                height: sz,
                transform: 'translate(-50%, -50%)',
                cursor: detach ? 'grab' : 'crosshair',
                pointerEvents: 'auto',
                borderWidth: Math.max(1, 2 / viewport.zoom),
              }}
            />
          );
          return (
            <>
              {(['l', 'r'] as const).map((side) => (
                <Fragment key={side}>
                  {portSlots(pn.id, side).map((slot, i) =>
                    dot(
                      `${side}-${i}`,
                      slot,
                      side,
                      slot.linkId ? liveLinks.find((l) => l.id === slot.linkId) : undefined,
                    ),
                  )}
                </Fragment>
              ))}
            </>
          );
        })()}

        {/* 연결 생성 제안 팝오버 — 대상 카드 바로 아래 중앙. 확인 = 메모는 관련
            내용, 이미지는 그 주제의 이미지 생성(둘 다 기존 생성 경로 재사용). */}
        {proposal && nodes[proposal.id] && (() => {
          const pn = nodes[proposal.id];
          const pb = worldBox(pn);
          const z = viewport.zoom;
          const confirm = () => {
            const { id, topic, kind } = proposal;
            setProposal(null);
            if (kind === 'image') {
              void regenImageCard(id, topic);
            } else {
              useBoardStore.getState().updateNodeRaw(id, { text: '✨ 내용을 만들고 있어요…' });
              void genTextCard(id, `${topic}에 대해 아이들과 나눌 핵심 내용을 짧은 메모로 정리해줘`);
            }
          };
          return (
            <div
              className="absolute z-40"
              style={{ left: pb.x + pb.w / 2, top: pb.y + pb.h + 10 / z, transform: 'translateX(-50%)' }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div
                className="rounded-lg border border-border bg-surface text-center shadow-lg"
                style={{ padding: `${10 / z}px ${14 / z}px`, width: 'max-content', maxWidth: 340 / z }}
              >
                <p className="text-fg" style={{ fontSize: 13 / z, margin: 0, marginBottom: 9 / z, lineHeight: 1.45 }}>
                  연결된 요소 <b className="font-semibold text-accent">'{proposal.topic}'</b>
                  {proposal.kind === 'image' ? '의 이미지를 생성할까요?' : '에 대한 내용을 생성할까요?'}
                </p>
                <div className="flex items-center justify-center" style={{ gap: 6 / z }}>
                  <button
                    onClick={confirm}
                    className="rounded-pill bg-accent font-semibold text-on-accent hover:bg-accent-hover"
                    style={{ fontSize: 12 / z, padding: `${5 / z}px ${16 / z}px` }}
                  >
                    확인
                  </button>
                  <button
                    onClick={() => setProposal(null)}
                    className="rounded-pill border border-border bg-surface text-fg-2 hover:bg-surface-2"
                    style={{ fontSize: 12 / z, padding: `${5 / z}px ${16 / z}px` }}
                  >
                    취소
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* 연결 순번 배지 — 1(시작)부터 연결 순서대로, 카드 좌상단에 작게.
            슬라이드 쇼 중에는 표시하지 않는다(아이들 화면을 깨끗하게). */}
        {!show && [...linkSeq.entries()].map(([id, label]) => {
          const n = nodes[id];
          if (!n) return null;
          if (classSet && !classSet.has(id)) return null;
          const b = worldBox(n);
          const o = drag && dragIds.includes(id) ? drag : { dx: 0, dy: 0 };
          const sz = 22 / viewport.zoom;
          return (
            <div
              key={`seq-${id}`}
              className="pointer-events-none absolute z-30 flex items-center justify-center rounded-pill bg-accent font-semibold text-on-accent shadow-sm"
              style={{
                left: b.x + o.dx,
                top: b.y + o.dy,
                minWidth: sz,
                height: sz,
                paddingLeft: 7 / viewport.zoom,
                paddingRight: 7 / viewport.zoom,
                fontSize: 11.5 / viewport.zoom,
                lineHeight: 1,
                whiteSpace: 'nowrap',
                transform: 'translate(-40%, -40%)',
              }}
            >
              {label}
            </div>
          );
        })}
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
