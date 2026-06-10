import { create } from 'zustand';

/* My Board state (SKILL §6, PRD §4.2). The BOARD slice (CLAUDE §5).
   Holds free primitives, workflow lanes, selection, and the viewport. Mutations
   here are RAW (no history); board/commands.ts wraps them as undoable Commands
   and pushes to historyStore (SKILL §6.2). Kept separate from the history module. */

export type NodeType = 'sticky' | 'text' | 'shape' | 'image' | 'frame' | 'runner';

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

/* Serializable content of one board (canvas) — for multi-board save/load. */
export interface BoardSnapshot {
  nodes: Record<string, BoardNode>;
  order: string[];
  lanes: Record<string, Lane>;
  laneOrder: string[];
  viewport: Viewport;
}

interface BoardState {
  nodes: Record<string, BoardNode>;
  order: string[]; // z-order
  lanes: Record<string, Lane>;
  laneOrder: string[];
  selection: string[];
  viewport: Viewport;
  classroomMode: boolean;
  /** Non-null while an AI generation is running → board shows a status pill. */
  generating: string | null;

  // ---- raw node ops ----
  addNodeRaw: (node: BoardNode) => void;
  removeNodeRaw: (id: string) => void;
  updateNodeRaw: (id: string, patch: Partial<BoardNode>) => void;
  moveNodesRaw: (ids: string[], dx: number, dy: number) => void;
  /** Send a node to the back of the z-order (e.g. a frame that wraps others). */
  moveToBackRaw: (id: string) => void;

  // ---- selection ----
  setSelection: (ids: string[]) => void;
  toggleSelection: (id: string) => void;
  clearSelection: () => void;
  selectAll: () => void;

  // ---- viewport ----
  setGenerating: (label: string | null) => void;
  setViewport: (v: Partial<Viewport>) => void;
  zoomBy: (factor: number, cx?: number, cy?: number) => void;
  resetView: () => void;
  fit: () => void;
  /** Center one node in the visible canvas and zoom so it fills the view. */
  focusNode: (id: string) => void;
  toggleClassroomMode: () => void;

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
const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

export const useBoardStore = create<BoardState>((set, get) => ({
  nodes: {},
  order: [],
  lanes: {},
  laneOrder: [],
  selection: [],
  viewport: { zoom: 1, panX: 0, panY: 0 },
  classroomMode: false,
  generating: null,

  setGenerating: (label) => set({ generating: label }),

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

  setSelection: (ids) => set({ selection: ids }),
  toggleSelection: (id) =>
    set((s) => ({
      selection: s.selection.includes(id)
        ? s.selection.filter((x) => x !== id)
        : [...s.selection, id],
    })),
  clearSelection: () => set({ selection: [] }),
  selectAll: () => set((s) => ({ selection: [...s.order] })),

  setViewport: (v) => set((s) => ({ viewport: { ...s.viewport, ...v } })),
  zoomBy: (factor, cx, cy) =>
    set((s) => {
      const { zoom, panX, panY } = s.viewport;
      const next = clampZoom(zoom * factor);
      if (cx === undefined || cy === undefined) {
        return { viewport: { zoom: next, panX, panY } };
      }
      // keep the point under (cx,cy) stationary while zooming
      const k = next / zoom;
      return {
        viewport: { zoom: next, panX: cx - (cx - panX) * k, panY: cy - (cy - panY) * k },
      };
    }),
  resetView: () => set({ viewport: { zoom: 1, panX: 0, panY: 0 } }),
  fit: () => {
    const s = get();
    const items = [
      ...Object.values(s.nodes),
      ...Object.values(s.lanes).map((l) => ({ x: l.x, y: l.y, w: laneWidth(l), h: 320 })),
    ];
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
      viewport: {
        zoom,
        panX: -minX * zoom + pad,
        panY: -minY * zoom + pad,
      },
    });
  },
  focusNode: (id) => {
    const s = get();
    const n = s.nodes[id];
    if (!n) return;
    // Tall auto-height cards report their real height as data.renderH.
    const h = typeof n.data?.renderH === 'number' ? (n.data.renderH as number) : n.h;
    // Visible canvas box = window minus the left rail+toolbar and the bottom prompt bar.
    const railL = 124;
    const padT = 24;
    const padB = 140;
    const gap = 40; // breathing room around the focused node
    const vw = Math.max(240, window.innerWidth - railL - 40);
    const vh = Math.max(240, window.innerHeight - padT - padB);
    // Fill the view but never zoom past 2× (keeps small cards from over-magnifying).
    const zoom = clampZoom(Math.min(vw / (n.w + gap * 2), vh / (h + gap * 2), 2));
    const scx = railL + (window.innerWidth - railL) / 2; // screen center of the canvas area
    const scy = padT + vh / 2;
    set({
      viewport: {
        zoom,
        panX: scx - (n.x + n.w / 2) * zoom,
        panY: scy - (n.y + h / 2) * zoom,
      },
    });
  },
  toggleClassroomMode: () => set((s) => ({ classroomMode: !s.classroomMode })),

  snapshot: () => {
    const { nodes, order, lanes, laneOrder, viewport } = get();
    return { nodes, order, lanes, laneOrder, viewport };
  },
  loadSnapshot: (snap) =>
    set({
      nodes: snap.nodes,
      order: snap.order,
      lanes: snap.lanes,
      laneOrder: snap.laneOrder,
      viewport: snap.viewport,
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
