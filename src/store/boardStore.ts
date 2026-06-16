import { create } from 'zustand';
import { worldBox, renderHeight } from '@/board/geometry';
import { linkedComponent } from '@/board/links';

/* My Board state (SKILL §6, PRD §4.2). The BOARD slice (CLAUDE §5).
   Holds free primitives, workflow lanes, selection, and the viewport. Mutations
   here are RAW (no history); board/commands.ts wraps them as undoable Commands
   and pushes to historyStore (SKILL §6.2). Kept separate from the history module. */

export type NodeType = 'sticky' | 'text' | 'shape' | 'image' | 'frame' | 'runner' | 'motion';

export interface BoardNode {
  id: string;
  type: NodeType;
  x: number;
  y: number;
  w: number;
  h: number;
  text?: string;
  color?: string; // semantic token name for sticky/shape, e.g. 'accent-soft'
  locked?: boolean;
  /** 균일 스케일 배율(중심 기준). 핸들 드래그로 조절(기본 1). */
  scale?: number;
  /** 회전 각(도, 중심 기준). 회전 핸들로 조절(기본 0). */
  rot?: number;
  /** group id — nodes sharing a groupId move/select together. */
  group?: string;
  // ---- card extras (reference board model) ----
  src?: string; // image data URI (image card)
  loading?: boolean; // image card generating
  /** height grows to fit content (no scroll) — sticky/text/memo cards. */
  autoH?: boolean;
  /** frame title / role tags / runner state, etc. */
  data?: Record<string, unknown>;
}

/* ---- Workflow lane (SKILL §9) ---- */
export type StepKind = 'idea' | 'image' | 'plan' | 'worksheet' | 'letter';
export type StepStatus = 'pending' | 'running' | 'ready' | 'error';

export interface LaneStep {
  id: string;
  step: StepKind;
  order: number;
  title: string;
  agent: string;
  status: StepStatus;
  /** Generated content (shape depends on kind). */
  content?: unknown;
  /** Multi-select within this node → feeds the next step (SKILL §9.1). */
  selected?: string[];
  error?: string;
}

export interface Lane {
  id: string;
  x: number;
  y: number;
  template: string;
  title: string;
  status: 'active' | 'saved';
  steps: LaneStep[];
  /** Highest step index unlocked (progress is click-only). */
  unlocked: number;
}

export interface Viewport {
  zoom: number;
  panX: number;
  panY: number;
}

/** 요소 사이의 연결선(포트 드래그) — from→to 방향이 순번 계산의 기준. */
export interface BoardLink {
  id: string;
  from: string;
  to: string;
}

/* Serializable content of one board (canvas) — for multi-board save/load. */
export interface BoardSnapshot {
  nodes: Record<string, BoardNode>;
  order: string[];
  lanes: Record<string, Lane>;
  laneOrder: string[];
  viewport: Viewport;
  /** 요소 연결선 — 이전 스냅샷에는 없을 수 있다(로드 시 [] 폴백). */
  links?: BoardLink[];
}

/** 수업 모드·슬라이드 쇼에서 '화면에 보이는' 노드 집합(= 렌더·선택 대상). 슬라이드
    쇼는 현재 한 장, 수업 모드는 연결망/선택 묶음. 프레임이 보이면 그 자식 카드
    (data.frameId)도 포함. 둘 다 아니면 null(제한 없음 — 일반 편집). 렌더(classSet)·
    박스 선택·전체 선택이 모두 이 한 정의를 공유해 숨긴 요소는 선택되지 않는다. */
export function presentationVisibleSet(
  nodes: Record<string, BoardNode>,
  classroom: { ids: string[] } | null,
  show: { ids: string[]; index: number; group?: boolean } | null,
): Set<string> | null {
  const primary = show ? (show.group ? show.ids : [show.ids[show.index]]) : classroom ? classroom.ids : null;
  if (!primary) return null;
  const set = new Set(primary);
  // 프레임이 보이면 그 하위 노드(중첩 프레임과 손주까지 재귀)도 함께 보인다.
  const addChildren = (fid: string, seen: Set<string>) => {
    if (seen.has(fid)) return;
    seen.add(fid);
    for (const n of Object.values(nodes)) {
      if (n.data?.frameId !== fid) continue;
      set.add(n.id);
      if (n.type === 'frame') addChildren(n.id, seen);
    }
  };
  const seen = new Set<string>();
  for (const id of primary) if (nodes[id]?.type === 'frame') addChildren(id, seen);
  return set;
}

interface BoardState {
  nodes: Record<string, BoardNode>;
  order: string[]; // z-order
  lanes: Record<string, Lane>;
  laneOrder: string[];
  selection: string[];
  viewport: Viewport;
  links: BoardLink[];
  classroomMode: boolean;
  /** 수업 모드 — 연결망만 남기고 숨김 + 가로 정렬. 종료 시 원위치 복원용 저장본. */
  classroom: {
    ids: string[];
    saved: Array<{ id: string; x: number; y: number }>;
    savedViewport: Viewport;
  } | null;
  /** 슬라이드 쇼 — 연결 순서대로 한 장씩 풀스크린처럼(나머지 숨김 + 포커스 줌).
      group: 이동 애니메이션 묶음 — 한 장씩 대신 연결된 형태 그대로 전체를 풀로. */
  show: { ids: string[]; index: number; savedViewport: Viewport; group?: boolean } | null;
  startShow: (ids: string[], group?: boolean) => void;
  stepShow: (dir: 1 | -1) => void;
  endShow: () => void;
  /** Non-null while an AI generation is running → board shows a status pill. */
  generating: string | null;
  /** 동시 진행 중인 생성 작업 수 — 복수 생성 지원. 모두 끝나야 메시지가 사라진다. */
  genActive: number;

  // ---- raw node ops ----
  addNodeRaw: (node: BoardNode) => void;
  removeNodeRaw: (id: string) => void;
  updateNodeRaw: (id: string, patch: Partial<BoardNode>) => void;
  moveNodesRaw: (ids: string[], dx: number, dy: number) => void;
  /** Send a node to the back of the z-order (e.g. a frame that wraps others). */
  moveToBackRaw: (id: string) => void;

  // ---- links (요소 연결선) ----
  addLinkRaw: (link: BoardLink) => void;
  removeLinkRaw: (id: string) => void;

  // ---- selection ----
  setSelection: (ids: string[]) => void;
  toggleSelection: (id: string) => void;
  clearSelection: () => void;
  selectAll: () => void;

  // ---- viewport ----
  setGenerating: (label: string | null) => void;
  /** 생성 작업 시작/종료 표시 — endGen은 마지막 작업이 끝났을 때만 메시지를 비운다. */
  beginGen: () => void;
  endGen: () => void;
  /** 생성 중단(정지 버튼) — 카운터·메시지를 즉시 초기화한다. */
  resetGen: () => void;
  setViewport: (v: Partial<Viewport>) => void;
  zoomBy: (factor: number, cx?: number, cy?: number) => void;
  resetView: () => void;
  fit: () => void;
  /** Center one node in the visible canvas and zoom so it fills the view. */
  focusNode: (id: string, maxZoom?: number) => void;
  /** 노드를 100%(zoom 1) 실제 크기로 화면(프롬프트바 위 영역) 중앙에 둔다 — 더블클릭. */
  centerNodeActualSize: (id: string) => void;
  /** 여러 노드의 합집합 박스를 화면에 풀로 맞춘다(모션 묶음 그룹 쇼 등). */
  focusBounds: (ids: string[], maxZoom?: number) => void;
  toggleClassroomMode: () => void;
  /** 노드 드래그 진행 중 오프셋(월드 px) — 모션 라인이 연결 카드를 실시간 추적용. */
  dragging: { ids: string[]; dx: number; dy: number } | null;
  setDragging: (d: { ids: string[]; dx: number; dy: number } | null) => void;

  // ---- multi-board snapshot ----
  snapshot: () => BoardSnapshot;
  loadSnapshot: (snap: BoardSnapshot) => void;

  // ---- lanes ----
  addLaneRaw: (lane: Lane) => void;
  removeLaneRaw: (id: string) => void;
  updateLane: (id: string, patch: Partial<Lane>) => void;
  updateStep: (laneId: string, stepId: string, patch: Partial<LaneStep>) => void;
}

const ZOOM_MIN = 0.2;
const ZOOM_MAX = 3;
// NaN/Infinity 차단: zoom 계산이 한 번이라도 NaN이 되면 transform=scale(NaN)으로
// 보드 전체가 사라진다(복구 불가). 비유한값은 1로 떨어뜨려 절대 전파되지 않게 한다.
const clampZoom = (z: number) => (Number.isFinite(z) ? Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)) : 1);
const finite = (n: number, fallback: number) => (Number.isFinite(n) ? n : fallback);
/** 뷰포트를 항상 유한값으로 — pan은 0, zoom은 1로 폴백. 모든 뷰포트 쓰기의 안전망. */
const safeViewport = (v: Viewport): Viewport => ({
  zoom: clampZoom(v.zoom),
  panX: finite(v.panX, 0),
  panY: finite(v.panY, 0),
});

export const useBoardStore = create<BoardState>((set, get) => ({
  nodes: {},
  order: [],
  lanes: {},
  laneOrder: [],
  selection: [],
  viewport: { zoom: 1, panX: 0, panY: 0 },
  links: [],
  classroomMode: false,
  classroom: null,
  show: null,
  generating: null,
  genActive: 0,
  dragging: null,
  setDragging: (d) => set({ dragging: d }),

  startShow: (ids, group = false) => {
    if (!ids.length) return;
    set((s) => ({ show: { ids, index: 0, savedViewport: { ...s.viewport }, group }, selection: [] }));
    if (group) get().focusBounds(ids, 2);
    else get().focusNode(ids[0], 3);
  },
  stepShow: (dir) => {
    const s = get();
    if (!s.show || s.show.group) return;
    const i = Math.min(s.show.ids.length - 1, Math.max(0, s.show.index + dir));
    if (i === s.show.index) return;
    set({ show: { ...s.show, index: i } });
    get().focusNode(s.show.ids[i], 3);
  },
  endShow: () => {
    const s = get();
    if (!s.show) return;
    set({ viewport: s.show.savedViewport, show: null });
  },

  setGenerating: (label) => set({ generating: label }),
  beginGen: () => set((s) => ({ genActive: s.genActive + 1 })),
  endGen: () =>
    set((s) => {
      const n = Math.max(0, s.genActive - 1);
      return { genActive: n, ...(n === 0 ? { generating: null } : {}) };
    }),
  resetGen: () => set({ genActive: 0, generating: null }),

  addNodeRaw: (node) =>
    set((s) => ({ nodes: { ...s.nodes, [node.id]: node }, order: [...s.order, node.id] })),

  removeNodeRaw: (id) =>
    set((s) => {
      const nodes = { ...s.nodes };
      delete nodes[id];
      return {
        nodes,
        order: s.order.filter((x) => x !== id),
        selection: s.selection.filter((x) => x !== id),
      };
    }),

  updateNodeRaw: (id, patch) =>
    set((s) => (s.nodes[id] ? { nodes: { ...s.nodes, [id]: { ...s.nodes[id], ...patch } } } : {})),

  moveNodesRaw: (ids, dx, dy) =>
    set((s) => {
      const nodes = { ...s.nodes };
      for (const id of ids) {
        const n = nodes[id];
        if (n && !n.locked) nodes[id] = { ...n, x: n.x + dx, y: n.y + dy };
      }
      return { nodes };
    }),

  moveToBackRaw: (id) =>
    set((s) => (s.nodes[id] ? { order: [id, ...s.order.filter((x) => x !== id)] } : {})),

  addLinkRaw: (link) => set((s) => ({ links: [...s.links, link] })),
  removeLinkRaw: (id) => set((s) => ({ links: s.links.filter((l) => l.id !== id) })),

  setSelection: (ids) => set({ selection: ids }),
  toggleSelection: (id) =>
    set((s) => ({
      selection: s.selection.includes(id)
        ? s.selection.filter((x) => x !== id)
        : [...s.selection, id],
    })),
  clearSelection: () => set({ selection: [] }),
  selectAll: () =>
    set((s) => {
      // 수업 모드·슬라이드 쇼에서는 화면에 보이는 수업자료만(숨긴 요소 제외).
      const vis = presentationVisibleSet(s.nodes, s.classroom, s.show);
      return { selection: vis ? s.order.filter((id) => vis.has(id)) : [...s.order] };
    }),

  setViewport: (v) => set((s) => ({ viewport: safeViewport({ ...s.viewport, ...v }) })),
  zoomBy: (factor, cx, cy) =>
    set((s) => {
      // 현재 뷰포트가 이미 오염돼 있어도(NaN) 여기서 정상값으로 회복시킨다.
      const { zoom, panX, panY } = safeViewport(s.viewport);
      const next = clampZoom(zoom * factor);
      if (cx === undefined || cy === undefined) {
        return { viewport: { zoom: next, panX, panY } };
      }
      // keep the point under (cx,cy) stationary while zooming
      const k = next / zoom;
      return {
        viewport: safeViewport({ zoom: next, panX: cx - (cx - panX) * k, panY: cy - (cy - panY) * k }),
      };
    }),
  resetView: () => set({ viewport: { zoom: 1, panX: 0, panY: 0 } }),
  fit: () => {
    const s = get();
    // 노드/레인 박스에 NaN 좌표가 하나라도 끼면 Math.min/max가 전부 NaN이 돼
    // zoom=NaN으로 보드가 사라진다 → 유한한 박스만 사용한다.
    const items = [
      ...Object.values(s.nodes).map(worldBox),
      ...Object.values(s.lanes).map((l) => ({ x: l.x, y: l.y, w: laneWidth(l), h: 320 })),
    ].filter((b) => Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.w) && Number.isFinite(b.h));
    if (items.length === 0) {
      set({ viewport: { zoom: 1, panX: 0, panY: 0 } });
      return;
    }
    const minX = Math.min(...items.map((i) => i.x));
    const minY = Math.min(...items.map((i) => i.y));
    const maxX = Math.max(...items.map((i) => i.x + i.w));
    const maxY = Math.max(...items.map((i) => i.y + i.h));
    const pad = 80;
    const vw = window.innerWidth - 180;
    const vh = window.innerHeight - 200;
    const zoom = clampZoom(Math.min(vw / (maxX - minX + pad * 2), vh / (maxY - minY + pad * 2), 1));
    set({
      viewport: safeViewport({
        zoom,
        panX: -minX * zoom + pad,
        panY: -minY * zoom + pad,
      }),
    });
  },
  focusNode: (id, maxZoom = 2) => {
    const s = get();
    const n = s.nodes[id];
    if (!n) return;
    // Tall auto-height cards report their real height as data.renderH; fold in the
    // node's uniform scale so a scaled-up card still fits the view exactly.
    const sc = n.scale ?? 1;
    const h = renderHeight(n) * sc;
    const w = n.w * sc;
    // Measure the ACTUAL canvas box (not a window heuristic) and the bottom prompt
    // bar, so the focused item lands exactly where the user sees center — and its
    // horizontal center lines up with the prompt bar's center.
    const doc = typeof document !== 'undefined' ? document : null;
    const canvas = doc?.querySelector('[data-kv-canvas]') as HTMLElement | null;
    const cr = canvas
      ? canvas.getBoundingClientRect()
      : ({ left: 0, top: 0, width: window.innerWidth, height: window.innerHeight } as DOMRect);
    const pbar = doc?.querySelector('.kv-pbar-vt') as HTMLElement | null;
    const pr = pbar ? pbar.getBoundingClientRect() : undefined;
    const padX = 48;
    const padTop = 24;
    const gap = 40; // breathing room around the focused node
    // Usable area ends just above the prompt bar (fallback: a fixed bottom inset).
    const bottomY = pr ? pr.top - 16 : cr.top + cr.height - 140;
    const availW = Math.max(240, cr.width - padX * 2);
    const availH = Math.max(240, bottomY - cr.top - padTop);
    // Fill the view but never zoom past maxZoom (keeps small cards from over-magnifying;
    // 슬라이드 쇼는 3×까지 허용 — 교실 화면에서 한 장이 크게 보이도록).
    const zoom = clampZoom(Math.min(availW / (w + gap * 2), availH / (h + gap * 2), maxZoom));
    // Center is invariant under center-anchored scale — use the geometric center.
    const ncx = n.x + n.w / 2;
    const ncy = n.y + renderHeight(n) / 2;
    // Horizontal target = the prompt bar's center; vertical = canvas area above it.
    const targetX = pr ? pr.left + pr.width / 2 : cr.left + cr.width / 2;
    const targetY = cr.top + padTop + availH / 2;
    set({
      viewport: safeViewport({
        zoom,
        panX: targetX - cr.left - ncx * zoom,
        panY: targetY - cr.top - ncy * zoom,
      }),
    });
  },
  centerNodeActualSize: (id) => {
    const s = get();
    const n = s.nodes[id];
    if (!n) return;
    // 실제 크기(zoom 1). 노드의 기하 중심을 캔버스(프롬프트바 위) 중앙에 맞춘다.
    const doc = typeof document !== 'undefined' ? document : null;
    const canvas = doc?.querySelector('[data-kv-canvas]') as HTMLElement | null;
    const cr = canvas
      ? canvas.getBoundingClientRect()
      : ({ left: 0, top: 0, width: window.innerWidth, height: window.innerHeight } as DOMRect);
    const pbar = doc?.querySelector('.kv-pbar-vt') as HTMLElement | null;
    const pr = pbar ? pbar.getBoundingClientRect() : undefined;
    const padTop = 24;
    const bottomY = pr ? pr.top - 16 : cr.top + cr.height - 140;
    const ncx = n.x + n.w / 2;
    const ncy = n.y + renderHeight(n) / 2; // center invariant under center-anchored scale
    // 가로는 프롬프트바 중앙, 세로는 캔버스 영역(상단~프롬프트바) 중앙.
    const targetX = pr ? pr.left + pr.width / 2 : cr.left + cr.width / 2;
    const targetY = cr.top + padTop + (bottomY - (cr.top + padTop)) / 2;
    set({ viewport: safeViewport({ zoom: 1, panX: targetX - cr.left - ncx, panY: targetY - cr.top - ncy }) });
  },
  focusBounds: (ids, maxZoom = 2) => {
    const s = get();
    const boxes = ids
      .map((id) => s.nodes[id])
      .filter(Boolean)
      .map((n) => worldBox(n));
    if (!boxes.length) return;
    const minX = Math.min(...boxes.map((b) => b.x));
    const minY = Math.min(...boxes.map((b) => b.y));
    const maxX = Math.max(...boxes.map((b) => b.x + b.w));
    const maxY = Math.max(...boxes.map((b) => b.y + b.h));
    const w = maxX - minX;
    const h = maxY - minY;
    // focusNode와 같은 측정 — 실제 캔버스 박스 + 프롬프트 바 위까지를 가용 영역으로.
    const doc = typeof document !== 'undefined' ? document : null;
    const canvas = doc?.querySelector('[data-kv-canvas]') as HTMLElement | null;
    const cr = canvas
      ? canvas.getBoundingClientRect()
      : ({ left: 0, top: 0, width: window.innerWidth, height: window.innerHeight } as DOMRect);
    const pbar = doc?.querySelector('.kv-pbar-vt') as HTMLElement | null;
    const pr = pbar ? pbar.getBoundingClientRect() : undefined;
    const padX = 48;
    const padTop = 24;
    const gap = 40;
    const bottomY = pr ? pr.top - 16 : cr.top + cr.height - 140;
    const availW = Math.max(240, cr.width - padX * 2);
    const availH = Math.max(240, bottomY - cr.top - padTop);
    const zoom = clampZoom(Math.min(availW / (w + gap * 2), availH / (h + gap * 2), maxZoom));
    const cx = minX + w / 2;
    const cy = minY + h / 2;
    const targetX = pr ? pr.left + pr.width / 2 : cr.left + cr.width / 2;
    const targetY = cr.top + padTop + availH / 2;
    set({
      viewport: safeViewport({ zoom, panX: targetX - cr.left - cx * zoom, panY: targetY - cr.top - cy * zoom }),
    });
  },
  /* 수업 모드. 연결된 요소가 선택돼 있으면: 그 연결망만 남기고 전부 숨기고,
     순번(1→2→3…) 순서대로 가로 한 줄(세로 중앙 정렬)로 배치 + 화면에 맞춘다.
     종료(다시 누름): 원위치·원래 뷰로 복원. 연결 없는 선택이면 기존처럼 시각 토글만. */
  toggleClassroomMode: () => {
    const s = get();
    // ── 종료: 위치·뷰 복원 ──
    if (s.classroom) {
      const nodes = { ...s.nodes };
      for (const p of s.classroom.saved) {
        if (nodes[p.id]) nodes[p.id] = { ...nodes[p.id], x: p.x, y: p.y };
      }
      set({ nodes, viewport: s.classroom.savedViewport, classroom: null, classroomMode: false });
      return;
    }
    // ── 진입 ── 수업 집합(chain) 결정. 선이 연결돼 있지 않아도 선택만으로 진입.
    //  • 선택 없음 → 기존 시각 토글(되돌리기 가능)
    //  • 단일 선택 → 연결망에 속하면 그 묶음 전체(워크플로 레인 편의), 아니면 그 하나만
    //  • 복수 선택 → 선택한 그대로(연결 무관). 화면상 좌→우·위→아래 순으로 정렬
    const live = s.links.filter((l) => s.nodes[l.from] && s.nodes[l.to]);
    const selected = s.selection.filter((id) => s.nodes[id]);
    let chain: string[];
    if (selected.length === 0) {
      set({ classroomMode: !s.classroomMode });
      return;
    } else if (selected.length === 1) {
      const comp = linkedComponent(selected[0], live).filter((id) => s.nodes[id]);
      chain = comp.length >= 2 ? comp : selected;
    } else {
      chain = [...selected].sort((a, z) => {
        const ba = worldBox(s.nodes[a]);
        const bz = worldBox(s.nodes[z]);
        return ba.x - bz.x || ba.y - bz.y;
      });
    }
    // 이동 애니메이션(모션 라인)은 출발·도착 카드와 한 몸 — 묶음의 어느 하나만
    // 선택해도 전체(선+연결 카드)를 수업에 데려간다. 카드를 공유하는 라인이
    // 이어져 있으면 연쇄적으로 확장한다.
    const cluster = new Set(chain);
    for (let grew = true; grew; ) {
      grew = false;
      for (const n of Object.values(s.nodes)) {
        if (n.type !== 'motion') continue;
        const member = [n.id, n.data?.aStart, n.data?.aEnd].filter(
          (x): x is string => typeof x === 'string' && !!s.nodes[x],
        );
        if (member.some((x) => cluster.has(x)) && !member.every((x) => cluster.has(x))) {
          member.forEach((x) => cluster.add(x));
          grew = true;
        }
      }
    }
    const hasMotion = [...cluster].some((id) => s.nodes[id].type === 'motion');
    if (cluster.size > chain.length) {
      const extra = [...cluster]
        .filter((id) => !chain.includes(id))
        .sort((a, z) => {
          const ba = worldBox(s.nodes[a]);
          const bz = worldBox(s.nodes[z]);
          return ba.x - bz.x || ba.y - bz.y;
        });
      chain = [...chain, ...extra];
    }
    // 프레임은 모든 하위 노드(중첩 프레임과 그 손주까지 재귀)를 함께 데리고 다닌다 —
    // 레인 항목은 최상위 프레임이고, 하위는 프레임과 같은 변위로 따라 움직여 배치를 유지한다.
    const descendantsOf = (fid: string, seen = new Set<string>()): string[] => {
      if (seen.has(fid)) return [];
      seen.add(fid);
      const out: string[] = [];
      for (const id of Object.keys(s.nodes)) {
        if (s.nodes[id].data?.frameId !== fid) continue;
        out.push(id);
        if (s.nodes[id].type === 'frame') out.push(...descendantsOf(id, seen));
      }
      return out;
    };
    const childSet = new Set<string>();
    for (const id of chain)
      if (s.nodes[id].type === 'frame') descendantsOf(id).forEach((c) => childSet.add(c));
    // 레인 항목 = chain에서 '다른 프레임의 자식'은 제외(이중 배치 방지).
    const layout = chain.filter((id) => !childSet.has(id));

    // 복원용 저장 — 레인 항목 + 모든 프레임 자식까지.
    const saved = [...new Set([...layout, ...childSet])].map((id) => ({
      id,
      x: s.nodes[id].x,
      y: s.nodes[id].y,
    }));
    // 화면 맞춤(fit과 동일 계산, 대상만 한정) — 정렬 후·모션 묶음 공용.
    const fitTo = (ns: Record<string, BoardNode>) => {
      const nb = layout.map((id) => worldBox(ns[id]));
      const minX = Math.min(...nb.map((b) => b.x));
      const minY = Math.min(...nb.map((b) => b.y));
      const maxX = Math.max(...nb.map((b) => b.x + b.w));
      const maxY = Math.max(...nb.map((b) => b.y + b.h));
      const pad = 80;
      const vw = window.innerWidth - 180;
      const vh = window.innerHeight - 200;
      const zoom = clampZoom(
        Math.min(vw / (maxX - minX + pad * 2), vh / (maxY - minY + pad * 2), 1.4),
      );
      return safeViewport({
        zoom,
        panX: (vw + 180 - (maxX - minX) * zoom) / 2 - minX * zoom - 90,
        panY: -minY * zoom + Math.max(pad, (vh + 200 - (maxY - minY) * zoom) / 2 - 100),
      });
    };
    // 모션 묶음 — 가로 정렬로 흐트러뜨리지 않고 '연결된 형태 그대로' 보여준다
    // (선·출발·도착의 상대 배치가 곧 수업 내용이므로 위치는 건드리지 않는다).
    if (hasMotion) {
      set({
        classroom: { ids: layout, saved, savedViewport: { ...s.viewport } },
        classroomMode: true,
        selection: [],
        viewport: fitTo(s.nodes),
      });
      return;
    }
    // 순번 순서 그대로 가로 정렬 — 첫 요소의 현재 위치를 기준점으로.
    const GAP = 48;
    const boxes = layout.map((id) => worldBox(s.nodes[id]));
    let X = Math.min(...boxes.map((b) => b.x));
    const yCenter = boxes[0].y + boxes[0].h / 2;
    const nodes = { ...s.nodes };
    for (const id of layout) {
      const n = nodes[id];
      const sc = n.scale ?? 1;
      const rh = renderHeight(n);
      // 월드 좌단을 X에, 월드 세로 중앙을 yCenter에 — 스케일된 카드도 정확히.
      const nx = Math.round(X - n.w / 2 + (n.w * sc) / 2);
      const ny = Math.round(yCenter - rh / 2);
      // 프레임이면 자식들을 같은 변위(dx, dy)로 함께 이동.
      if (n.type === 'frame') {
        const dx = nx - n.x;
        const dy = ny - n.y;
        for (const cid of descendantsOf(id)) {
          const c = nodes[cid];
          if (c) nodes[cid] = { ...c, x: c.x + dx, y: c.y + dy };
        }
      }
      nodes[id] = { ...n, x: nx, y: ny };
      X += n.w * sc + GAP;
    }
    // 정렬된 레인에 화면 맞춤.
    set({
      nodes,
      classroom: { ids: layout, saved, savedViewport: { ...s.viewport } },
      classroomMode: true,
      selection: [],
      viewport: fitTo(nodes),
    });
  },

  snapshot: () => {
    const { nodes, order, lanes, laneOrder, viewport, links } = get();
    return { nodes, order, lanes, laneOrder, viewport, links };
  },
  loadSnapshot: (snap) =>
    set({
      nodes: snap.nodes,
      order: snap.order,
      lanes: snap.lanes,
      laneOrder: snap.laneOrder,
      viewport: safeViewport(snap.viewport),
      links: snap.links ?? [],
      classroom: null,
      classroomMode: false,
      show: null,
      selection: [],
      generating: null,
    }),

  addLaneRaw: (lane) =>
    set((s) => ({ lanes: { ...s.lanes, [lane.id]: lane }, laneOrder: [...s.laneOrder, lane.id] })),
  removeLaneRaw: (id) =>
    set((s) => {
      const lanes = { ...s.lanes };
      delete lanes[id];
      return { lanes, laneOrder: s.laneOrder.filter((x) => x !== id) };
    }),
  updateLane: (id, patch) =>
    set((s) => (s.lanes[id] ? { lanes: { ...s.lanes, [id]: { ...s.lanes[id], ...patch } } } : {})),
  updateStep: (laneId, stepId, patch) =>
    set((s) => {
      const lane = s.lanes[laneId];
      if (!lane) return {};
      return {
        lanes: {
          ...s.lanes,
          [laneId]: {
            ...lane,
            steps: lane.steps.map((st) => (st.id === stepId ? { ...st, ...patch } : st)),
          },
        },
      };
    }),
}));

// DEV-only debug handle so the board store can be inspected/driven from the
// browser console (e.g. preview harness). No-op in production builds.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __kvBoard?: typeof useBoardStore }).__kvBoard = useBoardStore;
}

export const LANE_STEP_WIDTH = 340;
export const LANE_GAP = 24;
export function laneWidth(lane: Lane): number {
  return lane.steps.length * (LANE_STEP_WIDTH + LANE_GAP) + LANE_GAP;
}

let _idSeq = 0;
export const newId = (prefix: string) => `${prefix}_${++_idSeq}_${Date.now().toString(36)}`;
