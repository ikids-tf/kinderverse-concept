import { useBoardStore, newId, type BoardNode, type NodeType } from '@/store/boardStore';
import { useHistoryStore } from '@/store/historyStore';
import { worldBox } from './geometry';

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

/** Add a styled preset node centered on (cx,cy) — toolbar flyout presets (메모
    용도·텍스트 위계·이미지 비율·도형 종류·프레임 제목). Tool defaults merge with
    the preset patch (data deep-merged); one undoable add, selects the new node. */
export function addPresetNodeCmd(type: NodeType, cx: number, cy: number, patch: Partial<BoardNode>, label = '요소 추가'): string {
  const id = newId(type);
  const base: Partial<BoardNode> =
    type === 'frame' ? { w: 520, h: 400, data: { title: '프레임' } } : (DEFAULTS[type as PrimitiveType] ?? {});
  const data =
    base.data || patch.data ? { ...(base.data ?? {}), ...(patch.data ?? {}) } : undefined;
  const node: BoardNode = { id, type, x: 0, y: 0, w: 180, h: 140, ...base, ...patch, ...(data ? { data } : {}) } as BoardNode;
  node.x = Math.round(cx - node.w / 2);
  node.y = Math.round(cy - node.h / 2);
  history().execute({
    id: newId('cmd'),
    label,
    do: () => {
      board().addNodeRaw(node);
      board().setSelection([id]);
    },
    undo: () => board().removeNodeRaw(id),
  });
  return id;
}

/** Toolbar-addable primitive types incl. frame (for bare "N개 추가" prompts). */
export type AddableType = PrimitiveType | 'frame';

const ADD_LABEL: Record<AddableType, string> = {
  image: '이미지', text: '텍스트', sticky: '메모', shape: '도형', frame: '프레임',
};

/** Add N empty primitives in a horizontal row, centered on (cx,cy). Used by the
    prompt bar's bare "이미지 카드 3개 추가" (no topic) path — same blank cards the
    toolbar adds, just placed left→right. One undoable step; selects the new row. */
export function addPrimitivesRowCmd(type: AddableType, count: number, cx: number, cy: number): string[] {
  const n = Math.max(1, Math.min(count, 12));
  const dim = type === 'frame'
    ? { w: 360, h: 280 }
    : { w: DEFAULTS[type].w ?? 180, h: DEFAULTS[type].h ?? 140 };
  const gap = 40;
  const totalW = n * dim.w + (n - 1) * gap;
  let x = cx - totalW / 2;
  const y = cy - dim.h / 2;
  const created: BoardNode[] = [];
  for (let i = 0; i < n; i++) {
    const id = newId(type);
    const node: BoardNode =
      type === 'frame'
        ? { id, type: 'frame', x: Math.round(x), y: Math.round(y), w: dim.w, h: dim.h, data: { title: '새 프레임' } }
        : ({ id, type, x: Math.round(x), y: Math.round(y), w: 180, h: 140, ...DEFAULTS[type] } as BoardNode);
    created.push(node);
    x += dim.w + gap;
  }
  const ids = created.map((c) => c.id);
  history().execute({
    id: newId('cmd'),
    label: `${ADD_LABEL[type]} ${n}개 추가`,
    do: () => {
      created.forEach((c) => board().addNodeRaw(c));
      board().setSelection(ids);
    },
    undo: () => ids.forEach((id) => board().removeNodeRaw(id)),
  });
  return ids;
}

/** Wrap the selected nodes in a new frame that encloses them (toolbar 프레임 on a
    selection). Tags each as a child (data.frameId) so they move together, and sends
    the frame to the back so it sits behind its contents (incl. nested frames). */
const WRAP_PAD = 36;
export function wrapSelectionInFrameCmd(ids: string[], title = '새 프레임'): string | undefined {
  const b = board();
  const nodes = ids.map((id) => b.nodes[id]).filter(Boolean) as BoardNode[];
  if (nodes.length === 0) return undefined;
  // 스케일/회전·실제 렌더 높이를 반영한 월드 박스로 경계를 잡는다 — 확대된 카드
  // (예: 스케일 핸들로 키운 유튜브 뷰어)가 프레임 밖으로 삐져나오지 않게.
  const boxes = nodes.map(worldBox);
  const minX = Math.min(...boxes.map((bx) => bx.x));
  const minY = Math.min(...boxes.map((bx) => bx.y));
  const maxX = Math.max(...boxes.map((bx) => bx.x + bx.w));
  const maxY = Math.max(...boxes.map((bx) => bx.y + bx.h));
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

/* ---- 요소 연결선 (포트 드래그) ---- */

/** 두 요소를 연결(중복·자기 자신 제외). 성공 시 link id. */
export function addLinkCmd(from: string, to: string): string | undefined {
  if (from === to) return undefined;
  const b = board();
  if (!b.nodes[from] || !b.nodes[to]) return undefined;
  const dup = b.links.some((l) => (l.from === from && l.to === to) || (l.from === to && l.to === from));
  if (dup) return undefined;
  const link = { id: newId('link'), from, to };
  history().execute({
    id: newId('cmd'),
    label: '연결',
    do: () => board().addLinkRaw(link),
    undo: () => board().removeLinkRaw(link.id),
  });
  return link.id;
}

/** 연결된 포트를 드래그해 떼어내기 — 빈 곳에 놓으면 해제(next=null), 다른 요소에
    놓으면 그 요소로 옮겨 연결. 둘 다 한 번의 undo로 되돌아간다. */
export function relinkCmd(linkId: string, next: { from: string; to: string } | null) {
  const b = board();
  const old = b.links.find((l) => l.id === linkId);
  if (!old) return;
  const valid =
    next &&
    next.from !== next.to &&
    b.nodes[next.from] &&
    b.nodes[next.to] &&
    !b.links.some(
      (l) => l.id !== linkId && ((l.from === next.from && l.to === next.to) || (l.from === next.to && l.to === next.from)),
    );
  const created = valid ? { id: newId('link'), from: next!.from, to: next!.to } : null;
  history().execute({
    id: newId('cmd'),
    label: created ? '연결 옮기기' : '연결 해제',
    do: () => {
      board().removeLinkRaw(old.id);
      if (created) board().addLinkRaw(created);
    },
    undo: () => {
      if (created) board().removeLinkRaw(created.id);
      board().addLinkRaw(old);
    },
  });
}

/** 연결 해제(연결선 클릭). */
export function removeLinkCmd(id: string) {
  const link = board().links.find((l) => l.id === id);
  if (!link) return;
  history().execute({
    id: newId('cmd'),
    label: '연결 해제',
    do: () => board().removeLinkRaw(link.id),
    undo: () => board().addLinkRaw(link),
  });
}

/* ---- 클립보드 — 선택 가능한 모든 요소의 복사/잘라내기/붙여넣기 (⌘/Ctrl+C·X·V) ----
   내부 클립보드(딥카피 스냅샷) 방식: 새로고침 전까지 유지되고, 붙여넣을 때마다
   새 id로 복제된다. 프레임을 복사하면 자식 카드까지 통째로 들어온다. */

let clipboard: BoardNode[] = [];
let pasteSeq = 0; // 같은 클립보드 연속 붙여넣기 — 계단식 오프셋

/** 프레임이 포함되면 그 자식 카드(data.frameId)까지 함께. */
function expandWithFrameChildren(ids: string[]): string[] {
  const b = board();
  const set = new Set(ids);
  for (const id of ids) {
    if (b.nodes[id]?.type === 'frame') {
      Object.values(b.nodes).forEach((n) => {
        if (n.data?.frameId === id) set.add(n.id);
      });
    }
  }
  return [...set];
}

/** 선택 복사 → 내부 클립보드. 복사한 개수를 돌려준다. */
export function copyNodesCmd(ids: string[]): number {
  const b = board();
  const nodes = expandWithFrameChildren(ids).map((id) => b.nodes[id]).filter(Boolean) as BoardNode[];
  if (nodes.length === 0) return 0;
  clipboard = nodes.map((n) => JSON.parse(JSON.stringify(n)) as BoardNode);
  pasteSeq = 0;
  return nodes.length;
}

/** 잘라내기 = 복사 + 삭제(삭제는 한 번의 ⌘Z로 복원). */
export function cutNodesCmd(ids: string[]): number {
  const count = copyNodesCmd(ids);
  if (count) deleteNodesCmd(expandWithFrameChildren(ids));
  return count;
}

export function hasClipboard(): boolean {
  return clipboard.length > 0;
}

/** 붙여넣기. 원본 영역이 화면에 보이면 계단식(+24×n) 오프셋으로 옆에, 화면 밖에
    있으면 현재 뷰 중앙에 놓는다. 프레임 소속(frameId)·그룹·data 속 노드 참조는
    함께 복사된 대상에 한해 새 id로 재매핑된다. */
export function pasteNodesCmd(): string[] {
  if (clipboard.length === 0) return [];
  const minX = Math.min(...clipboard.map((n) => n.x));
  const minY = Math.min(...clipboard.map((n) => n.y));
  const maxX = Math.max(...clipboard.map((n) => n.x + n.w));
  const maxY = Math.max(...clipboard.map((n) => n.y + n.h));

  // 원본 영역이 현재 화면에 보이는가 — 보이면 옆에(계단식), 아니면 뷰 중앙에.
  const { zoom, panX, panY } = board().viewport;
  const railW = 64; // left icon rail (viewportCenterBoardPoint와 동일 가정)
  const cw = Math.max(320, (typeof window !== 'undefined' ? window.innerWidth : 1200) - railW);
  const ch = Math.max(320, typeof window !== 'undefined' ? window.innerHeight : 800);
  const view = { x: -panX / zoom, y: -panY / zoom, w: cw / zoom, h: ch / zoom };
  const visible = minX < view.x + view.w && maxX > view.x && minY < view.y + view.h && maxY > view.y;
  pasteSeq++;
  const dx = visible ? 24 * pasteSeq : Math.round(view.x + view.w / 2 - (minX + maxX) / 2);
  const dy = visible ? 24 * pasteSeq : Math.round(view.y + view.h / 2 - (minY + maxY) / 2);

  const idMap = new Map<string, string>();
  clipboard.forEach((n) => idMap.set(n.id, newId(n.type)));
  const groupMap = new Map<string, string>();
  // data 가방 속 노드 참조(frameId·ytTarget·runnerId 등) 재매핑 — 함께 복사된
  // 대상만. 클립보드 밖을 가리키면(예: 원본 프레임 소속) 그대로 둔다.
  const remap = (v: unknown): unknown => {
    if (typeof v === 'string') return idMap.get(v) ?? v;
    if (Array.isArray(v)) return v.map(remap);
    if (v && typeof v === 'object') {
      const o: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) o[k] = remap(val);
      return o;
    }
    return v;
  };
  const clones = clipboard.map((n) => {
    const c = JSON.parse(JSON.stringify(n)) as BoardNode;
    c.id = idMap.get(n.id)!;
    c.x = Math.round(n.x + dx);
    c.y = Math.round(n.y + dy);
    c.locked = false; // 사본은 바로 편집할 수 있게
    if (c.group) {
      if (!groupMap.has(c.group)) groupMap.set(c.group, newId('grp'));
      c.group = groupMap.get(c.group);
    }
    if (c.data) c.data = remap(c.data) as BoardNode['data'];
    return c;
  });
  history().execute({
    id: newId('cmd'),
    label: '붙여넣기',
    do: () => {
      clones.forEach((c) => board().addNodeRaw(c));
      clones.filter((c) => c.type === 'frame').forEach((c) => board().moveToBackRaw(c.id)); // 프레임은 내용 뒤로
      board().setSelection(clones.map((c) => c.id));
    },
    undo: () => clones.forEach((c) => board().removeNodeRaw(c.id)),
  });
  return clones.map((c) => c.id);
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
  scale?: number;
  rot?: number;
  data?: Record<string, unknown>;
}

function snapNodes(ids: string[]): NodeSnap[] {
  const b = board();
  const out: NodeSnap[] = [];
  for (const id of ids) {
    const n = b.nodes[id];
    if (n)
      out.push({
        id, x: n.x, y: n.y, w: n.w, h: n.h, color: n.color,
        scale: n.scale, rot: n.rot, data: n.data ? { ...n.data } : undefined,
      });
  }
  return out;
}

function restoreNodes(snaps: NodeSnap[]) {
  snaps.forEach((s) =>
    board().updateNodeRaw(s.id, { x: s.x, y: s.y, w: s.w, h: s.h, color: s.color, scale: s.scale, rot: s.rot, data: s.data }),
  );
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
