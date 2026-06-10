import { useBoardStore, newId, type BoardNode } from '@/store/boardStore';
import { useHistoryStore } from '@/store/historyStore';

/** Primitive node types addable from the toolbar (frame/runner are seeded). */
export type PrimitiveType = 'sticky' | 'text' | 'shape' | 'image';

/* Board command factories (SKILL §6.2). Every reversible board action becomes a
   Command(do/undo) pushed to the history module, so ⌘/Ctrl+Z works for real.
   L1 actions (add/move/delete/duplicate/layout) only — L3 (external send,
   permanent delete of saved bundles) goes through confirm modals, not bare undo. */

const board = () => useBoardStore.getState();
const history = () => useHistoryStore.getState();

const DEFAULTS: Record<PrimitiveType, Partial<BoardNode>> = {
  sticky: { w: 200, h: 120, color: 'accent-soft', text: '', autoH: true },
  text: { w: 240, h: 48, text: '텍스트', autoH: true },
  shape: { w: 160, h: 120, color: 'surface-3' },
  image: { w: 200, h: 150, text: '이미지 카드' },
};

/** Add a primitive at board coordinates (cmd: undoable). */
export function addNodeCmd(type: PrimitiveType, x: number, y: number): string {
  const id = newId(type);
  const node: BoardNode = { id, type, x, y, w: 180, h: 140, ...DEFAULTS[type] } as BoardNode;
  history().execute({
    id: newId('cmd'),
    label: `${type} 추가`,
    do: () => {
      board().addNodeRaw(node);
      board().setSelection([id]);
    },
    undo: () => board().removeNodeRaw(id),
  });
  return id;
}

/** Add a frame (back container) at board coordinates (cmd: undoable). */
export function addFrameCmd(x: number, y: number, title = '프레임'): string {
  const id = newId('frame');
  const node: BoardNode = { id, type: 'frame', x, y, w: 520, h: 400, data: { title } };
  history().execute({
    id: newId('cmd'),
    label: '프레임 추가',
    do: () => {
      board().addNodeRaw(node);
      board().setSelection([id]);
    },
    undo: () => board().removeNodeRaw(id),
  });
  return id;
}

/** Wrap the selected nodes in a new frame that encloses them (toolbar 프레임 on a
    selection). Tags each as a child (data.frameId) so they move together, and sends
    the frame to the back so it sits behind its contents (incl. nested frames). */
const WRAP_PAD = 36;
function realH(n: BoardNode): number {
  const r = n.data?.renderH;
  return typeof r === 'number' && r > 0 ? r : n.h;
}
export function wrapSelectionInFrameCmd(ids: string[], title = '새 프레임'): string | undefined {
  const b = board();
  const nodes = ids.map((id) => b.nodes[id]).filter(Boolean) as BoardNode[];
  if (nodes.length === 0) return undefined;
  const minX = Math.min(...nodes.map((n) => n.x));
  const minY = Math.min(...nodes.map((n) => n.y));
  const maxX = Math.max(...nodes.map((n) => n.x + n.w));
  const maxY = Math.max(...nodes.map((n) => n.y + realH(n)));
  const fid = newId('frame');
  const frame: BoardNode = {
    id: fid,
    type: 'frame',
    x: Math.round(minX - WRAP_PAD),
    y: Math.round(minY - WRAP_PAD),
    w: Math.round(maxX - minX + WRAP_PAD * 2),
    h: Math.round(maxY - minY + WRAP_PAD * 2),
    data: { title },
  };
  // Prior frameId per child, to restore on undo.
  const prev = nodes.map((n) => ({ id: n.id, frameId: n.data?.frameId as string | undefined }));
  const tag = () => {
    board().addNodeRaw(frame);
    board().moveToBackRaw(fid); // behind its contents
    prev.forEach((p) => {
      const n = board().nodes[p.id];
      if (n) board().updateNodeRaw(p.id, { data: { ...(n.data ?? {}), frameId: fid } });
    });
    board().setSelection([fid]);
  };
  history().execute({
    id: newId('cmd'),
    label: '프레임으로 묶기',
    do: tag,
    undo: () => {
      prev.forEach((p) => {
        const n = board().nodes[p.id];
        if (!n) return;
        const data = { ...(n.data ?? {}) };
        if (p.frameId) data.frameId = p.frameId;
        else delete data.frameId;
        board().updateNodeRaw(p.id, { data });
      });
      board().removeNodeRaw(fid);
    },
  });
  return fid;
}

/** Commit a finished drag as one undoable move (call once on drag end). */
export function moveNodesCmd(ids: string[], dx: number, dy: number) {
  if ((dx === 0 && dy === 0) || ids.length === 0) return;
  history().execute({
    id: newId('cmd'),
    label: '이동',
    do: () => board().moveNodesRaw(ids, dx, dy),
    undo: () => board().moveNodesRaw(ids, -dx, -dy),
  });
}

/** Delete the given nodes (cmd: re-adds on undo). */
export function deleteNodesCmd(ids: string[]) {
  const snapshot = ids.map((id) => board().nodes[id]).filter(Boolean) as BoardNode[];
  if (snapshot.length === 0) return;
  // Skip locked nodes.
  const removable = snapshot.filter((n) => !n.locked);
  if (removable.length === 0) return;
  history().execute({
    id: newId('cmd'),
    label: '삭제',
    do: () => removable.forEach((n) => board().removeNodeRaw(n.id)),
    undo: () => removable.forEach((n) => board().addNodeRaw(n)),
  });
}

/** Duplicate the selection (offset +24,+24). */
export function duplicateNodesCmd(ids: string[]) {
  const clones = ids
    .map((id) => board().nodes[id])
    .filter(Boolean)
    .map((n) => ({ ...(n as BoardNode), id: newId((n as BoardNode).type), x: (n as BoardNode).x + 24, y: (n as BoardNode).y + 24, group: undefined }));
  if (clones.length === 0) return;
  history().execute({
    id: newId('cmd'),
    label: '복제',
    do: () => {
      clones.forEach((c) => board().addNodeRaw(c));
      board().setSelection(clones.map((c) => c.id));
    },
    undo: () => clones.forEach((c) => board().removeNodeRaw(c.id)),
  });
}

/** Group / ungroup the selection. */
export function groupNodesCmd(ids: string[]) {
  if (ids.length < 2) return;
  const gid = newId('grp');
  const prev = ids.map((id) => ({ id, group: board().nodes[id]?.group }));
  history().execute({
    id: newId('cmd'),
    label: '그룹',
    do: () => ids.forEach((id) => board().updateNodeRaw(id, { group: gid })),
    undo: () => prev.forEach((p) => board().updateNodeRaw(p.id, { group: p.group })),
  });
}

export function ungroupNodesCmd(ids: string[]) {
  const prev = ids.map((id) => ({ id, group: board().nodes[id]?.group }));
  if (prev.every((p) => !p.group)) return;
  history().execute({
    id: newId('cmd'),
    label: '그룹 해제',
    do: () => ids.forEach((id) => board().updateNodeRaw(id, { group: undefined })),
    undo: () => prev.forEach((p) => board().updateNodeRaw(p.id, { group: p.group })),
  });
}

/** Edit text (sticky/text) as one undoable change. */
export function editTextCmd(id: string, before: string, after: string) {
  if (before === after) return;
  history().execute({
    id: newId('cmd'),
    label: '텍스트 편집',
    do: () => board().updateNodeRaw(id, { text: after }),
    undo: () => board().updateNodeRaw(id, { text: before }),
  });
}

/** Record nodes the composer/chips already spawned (raw) as ONE undoable step.
   The spawn helpers add nodes immediately (placeInFrame needs them present for
   collision checks), so we push an already-applied command: undo removes the
   batch, redo re-adds it. One compose / chip click = one ⌘Z. */
export function recordSpawnedNodes(ids: string[], label = 'AI 생성') {
  const snapshot = ids.map((id) => board().nodes[id]).filter(Boolean) as BoardNode[];
  if (snapshot.length === 0) return;
  history().push({
    id: newId('cmd'),
    label,
    do: () => snapshot.forEach((n) => board().addNodeRaw(n)),
    undo: () => snapshot.forEach((n) => board().removeNodeRaw(n.id)),
  });
}

/* ---- undoable redesign (Design Director P4) ---- */
export interface NodeSnap {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color?: string;
  data?: Record<string, unknown>;
}

function snapNodes(ids: string[]): NodeSnap[] {
  const b = board();
  const out: NodeSnap[] = [];
  for (const id of ids) {
    const n = b.nodes[id];
    if (n) out.push({ id, x: n.x, y: n.y, w: n.w, h: n.h, color: n.color, data: n.data ? { ...n.data } : undefined });
  }
  return out;
}

function restoreNodes(snaps: NodeSnap[]) {
  snaps.forEach((s) => board().updateNodeRaw(s.id, { x: s.x, y: s.y, w: s.w, h: s.h, color: s.color, data: s.data }));
}

/** Capture a before-snapshot of node geometry+data (for an undoable redesign). */
export function captureNodes(ids: string[]): NodeSnap[] {
  return snapNodes(ids);
}

/** Push an already-applied layout/decoration change as ONE undoable step (the
    redesign mutates positions+data in place, so we record before→after). */
export function pushRedesign(ids: string[], before: NodeSnap[], label = '디자인 변경') {
  const after = snapNodes(ids);
  history().push({
    id: newId('cmd'),
    label,
    do: () => restoreNodes(after),
    undo: () => restoreNodes(before),
  });
}

/** Delete a frame AND its child cards (data.frameId) as one undoable step. */
export function deleteFrameCmd(frameId: string) {
  const b = board();
  const frame = b.nodes[frameId];
  if (!frame || frame.type !== 'frame') return;
  const all = [frame, ...Object.values(b.nodes).filter((n) => n.data?.frameId === frameId)].filter(
    (n) => !n.locked,
  );
  if (all.length === 0) return;
  history().execute({
    id: newId('cmd'),
    label: '프레임 삭제',
    do: () => all.forEach((n) => board().removeNodeRaw(n.id)),
    undo: () => all.forEach((n) => board().addNodeRaw(n)),
  });
}

/** Toggle lock on the selection (lock itself is reversible; not L3). */
export function toggleLockCmd(ids: string[]) {
  const snap = ids.map((id) => ({ id, locked: board().nodes[id]?.locked }));
  if (snap.length === 0) return;
  const anyUnlocked = snap.some((s) => !s.locked);
  history().execute({
    id: newId('cmd'),
    label: anyUnlocked ? '잠금' : '잠금 해제',
    do: () => snap.forEach((s) => board().updateNodeRaw(s.id, { locked: anyUnlocked })),
    undo: () => snap.forEach((s) => board().updateNodeRaw(s.id, { locked: s.locked })),
  });
}
