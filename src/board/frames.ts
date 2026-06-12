import { useBoardStore, newId, type BoardNode } from '@/store/boardStore';
import {
  useFolderStore,
  bundleFromFrame,
  savedEntryId,
  type SavedFolder,
  type SavedEntry,
  type BoardSnap,
  type BoardSnapNode,
} from '@/store/folderStore';
import { worldBox } from './geometry';
import type { LayoutVariant } from './design-spec';

/* Frame ↔ child association for My Board. `data.frameId` is authoritative
   (set by the composer/workflow when spawning into a frame, and re-derived from
   geometry on drag-end via rebindFrameMembership). Geometry is the fallback used
   for move-together and drop re-parenting. */

/** Cards explicitly tagged to this frame (authoritative membership). */
export function childrenOf(frameId: string): BoardNode[] {
  const b = useBoardStore.getState();
  return Object.values(b.nodes).filter((n) => n.data?.frameId === frameId);
}

/** Cards geometrically inside the frame box (fallback / rebinder). */
export function geometryChildrenOf(frameId: string): string[] {
  const b = useBoardStore.getState();
  const f = b.nodes[frameId];
  if (!f || f.type !== 'frame') return [];
  const fb = worldBox(f);
  return Object.values(b.nodes)
    .filter((n) => {
      if (n.id === frameId || n.type === 'frame') return false;
      const nb = worldBox(n);
      return nb.x < fb.x + fb.w && nb.x + nb.w > fb.x && nb.y < fb.y + fb.h && nb.y + Math.max(nb.h, 60) > fb.y;
    })
    .map((n) => n.id);
}

/** 프레임의 모든 하위 노드 id — 중첩 프레임과 그 안의 카드까지 재귀(tagged 기준).
    상위 프레임을 움직이거나 수업/프롬프트에 적용할 때 한 묶음으로 다루는 단위. */
export function frameSubtree(frameId: string, seen = new Set<string>()): string[] {
  if (seen.has(frameId)) return []; // frameId 사이클 방지
  seen.add(frameId);
  const b = useBoardStore.getState();
  const out: string[] = [];
  for (const n of Object.values(b.nodes)) {
    if (n.data?.frameId !== frameId) continue;
    out.push(n.id);
    if (n.type === 'frame') out.push(...frameSubtree(n.id, seen));
  }
  return out;
}

/** 이 프레임을 '완전히 감싸는' 가장 작은 다른 프레임(중첩 부모 후보) — 자기 후손은 제외.
    수동으로 프레임을 다른 프레임 안에 끌어다 놓았을 때 부모를 판정한다. */
function enclosingFrame(frameId: string): string | undefined {
  const b = useBoardStore.getState();
  const f = b.nodes[frameId];
  if (!f || f.type !== 'frame') return undefined;
  const fb = worldBox(f);
  const descendants = new Set(frameSubtree(frameId));
  let best: string | undefined;
  let bestArea = Infinity;
  for (const n of Object.values(b.nodes)) {
    if (n.id === frameId || n.type !== 'frame' || descendants.has(n.id)) continue;
    const nb = worldBox(n);
    const contains = fb.x >= nb.x - 1 && fb.y >= nb.y - 1 && fb.x + fb.w <= nb.x + nb.w + 1 && fb.y + fb.h <= nb.y + nb.h + 1;
    if (contains) {
      const area = nb.w * nb.h;
      if (area < bestArea) {
        bestArea = area;
        best = n.id;
      }
    }
  }
  return best;
}

/** Union of tagged subtree + geometric children — the set that moves with the frame.
    중첩 프레임과 그 자식(손주)까지 재귀로 포함해 함께 끌려온다. */
export function frameMoveSet(frameId: string): string[] {
  const ids = new Set<string>(geometryChildrenOf(frameId));
  for (const id of frameSubtree(frameId)) ids.add(id);
  return [...ids];
}

/** Topmost frame whose box contains the point (for drop re-parenting). */
export function frameOfPoint(x: number, y: number): string | undefined {
  const b = useBoardStore.getState();
  for (let i = b.order.length - 1; i >= 0; i--) {
    const n = b.nodes[b.order[i]];
    if (n?.type !== 'frame') continue;
    const fb = worldBox(n);
    if (x >= fb.x && x <= fb.x + fb.w && y >= fb.y && y <= fb.y + fb.h) return n.id;
  }
  return undefined;
}

/** After a drag, (re)assign each moved non-frame node's data.frameId by where it
    now sits — so dragging a card onto/off a frame updates membership. */
export function rebindFrameMembership(movedIds: string[]): void {
  const b = useBoardStore.getState();
  for (const id of movedIds) {
    const n = b.nodes[id];
    if (!n) continue;
    // 프레임은 '완전히 감싸는' 부모 프레임에 소속(중첩) — 자기 후손은 부모가 될 수 없다.
    // 일반 카드는 종전대로 중심점이 들어간 최상위 프레임에 소속.
    const target = n.type === 'frame' ? enclosingFrame(id) : frameOfPoint(n.x + n.w / 2, n.y + n.h / 2);
    const cur = n.data?.frameId as string | undefined;
    if (target === cur) continue;
    const data = { ...(n.data ?? {}) };
    if (target) data.frameId = target;
    else delete data.frameId;
    b.updateNodeRaw(id, { data });
  }
}

const FRAME_PAD = 28; // breathing room between the frame border and its content

/** A card's REAL rendered height for layout. `node.h` can understate the true
    footprint (e.g. an image card's h is only the image area — the caption adds
    height below). NodeView's size observer stores the measured outer height in
    `data.renderH`; fall back to node.h before it's measured. */
function layoutH(n: BoardNode): number {
  const r = n.data?.renderH;
  return typeof r === 'number' && r > 0 ? r : n.h;
}

/** Grow/shrink the frame so it wraps ALL its child cards with even padding.
    Uses the children's REAL heights (kept current by NodeView's size observer),
    so tall auto-height documents are fully enclosed. */
export function fitFrameToChildren(frameId: string, seen?: Set<string>): void {
  const visited = seen ?? new Set<string>();
  if (visited.has(frameId)) return; // guard against any frameId cycle in the bubble-up
  visited.add(frameId);
  const b = useBoardStore.getState();
  const f = b.nodes[frameId];
  if (!f || f.type !== 'frame') return;
  const kids = Object.values(b.nodes).filter((n) => n.data?.frameId === frameId);
  if (kids.length === 0) return;
  const boxes = kids.map(worldBox);
  const minX = Math.min(...boxes.map((bx) => bx.x));
  const minY = Math.min(...boxes.map((bx) => bx.y));
  const maxX = Math.max(...boxes.map((bx) => bx.x + bx.w));
  const maxY = Math.max(...boxes.map((bx) => bx.y + bx.h));
  const x = minX - FRAME_PAD;
  const y = minY - FRAME_PAD;
  const w = maxX - minX + FRAME_PAD * 2;
  // Respect a pinned aligned height (set when this frame was aligned beside another)
  // so a content re-fit never shrinks it below its neat side-by-side height.
  const alignedH = typeof f.data?.alignedH === 'number' ? f.data.alignedH : 0;
  const h = Math.max(maxY - minY + FRAME_PAD * 2, alignedH);
  if (f.x !== x || f.y !== y || f.w !== w || f.h !== h) {
    b.updateNodeRaw(frameId, { x, y, w, h });
  }
  // A nested frame's new bounds change its parent's footprint — bubble the fit up.
  const parentId = f.data?.frameId as string | undefined;
  if (parentId && parentId !== frameId) fitFrameToChildren(parentId, visited);
}

/* ---------------- designed composition layout ---------------- */

const D_COLGAP = 26; // gap between columns of the designed layout
const D_VGAP = 14; // vertical gap between stacked cards (ideas / images / materials)
const SUB_TAB_CLEAR = 30; // headroom above the 아이디어 sub-frame for its title tab
const IDEA_W = 240; // idea card width inside the sub-frame (matches spawn width)

/** Compose a frame as a designed, professional sheet rather than a raw wrap:
 *   ┌ HEADER (top-left) ──────────────────────────────────────────────────┐
 *   │  [아이디어]   [ 계획안 (full doc) ]   [컨셉이미지]   [활동지/웹 자료]   │
 *   │   idea ▸      detailed weekly plan    stacked img     활동지 A4        │
 *   │   idea ▸      (landscape A4 grid)     stacked img     🔎 웹 자료 카드   │
 *   └─────────────────────────────────────────────────────────────────────┘
 * Ideas are nested in a real child frame (selectable, vertical). The main
 * document is the centerpiece; concept images and companion materials (활동지,
 * clickable 웹 자료) sit in columns to its right. Reuses each card's REAL
 * measured height for tight spacing. */
export function designComposedFrame(frameId: string, variant: LayoutVariant = 'default'): void {
  const b = useBoardStore.getState();
  const frame = b.nodes[frameId];
  if (!frame || frame.type !== 'frame') return;
  if (frame.data?.mindmap) return; // mind maps use a radial layout, not the column grid

  const members = Object.values(b.nodes).filter((n) => n.data?.frameId === frameId && n.id !== frameId);
  const byRole = (r: string) => members.filter((n) => n.data?.role === r);
  const firstRole = (r: string) => members.find((n) => n.data?.role === r);

  const header = firstRole('header');
  // The 아이디어 sub-frame may already exist (re-layout via a chip). Its idea cards
  // are grandchildren (frameId === sub-frame), invisible to the parent's direct
  // members — so gather ideas from BOTH sources, else a re-run sees "no ideas" and
  // would wrongly delete the sub-frame. Track the sub-frame by ID only (never
  // re-read b.nodes[id] after addNodeRaw — the captured `b` snapshot is stale).
  let ideaFrameId = members.find((n) => n.type === 'frame' && n.data?.sub)?.id;
  const nestedIdeas = ideaFrameId
    ? Object.values(b.nodes).filter((n) => n.data?.frameId === ideaFrameId && n.data?.role === 'idea')
    : [];
  const ideas = [...byRole('idea'), ...nestedIdeas];
  const mainDoc = firstRole('plan') || firstRole('letter') || firstRole('record') || firstRole('worksheet');
  const worksheet = firstRole('worksheet');
  const extraDoc = worksheet && worksheet !== mainDoc ? worksheet : undefined;
  const images = byRole('image');
  const source = firstRole('source');
  const clarify = firstRole('clarify');
  const newsletter = firstRole('newsletter'); // decorated parent newsletter
  const memos = members.filter((n) => !n.data?.role && (n.type === 'sticky' || n.type === 'text'));

  const ox = frame.x + FRAME_PAD;
  const oy = frame.y + FRAME_PAD;
  let y = oy;

  // 1) Header band (top-left). 폭은 건드리지 않는다 — 텍스트 카드는 내용에 핏(autoW)
  // 이라 store w에 큰 값을 쓰면 화면(max-content)과 어긋나 선택 핸들이 멀리 떠 버린다.
  if (header) {
    b.updateNodeRaw(header.id, { x: ox, y });
    y += layoutH(header) + 20;
  }

  // (variant: gallery-first) image-led layouts (studio 활동지·도안) get a prominent
  // horizontal image band right under the header; the doc/materials sit below it.
  let imagesPlaced = false;
  if (variant === 'gallery-first' && images.length) {
    let gx = ox;
    let gBottom = y;
    for (const img of images) {
      b.updateNodeRaw(img.id, { x: gx, y });
      gx += img.w + D_COLGAP;
      gBottom = Math.max(gBottom, y + layoutH(img));
    }
    y = gBottom + D_VGAP + 6;
    imagesPlaced = true;
  }

  // Everything below the header is one row of side-by-side columns, left→right:
  //   [아이디어 sub-frame] [계획안 (full doc)] [컨셉 이미지] [활동지 · 웹 자료]
  const rowY = y + (ideas.length ? SUB_TAB_CLEAR : 0);
  let colX = ox;

  // (variant: hero-doc) the main document LEADS — placed first/left so it reads as
  // the hero; ideas, images and materials follow to its right.
  let mainDocPlaced = false;
  if (variant === 'hero-doc' && mainDoc) {
    b.updateNodeRaw(mainDoc.id, { x: colX, y: rowY });
    colX += mainDoc.w + D_COLGAP;
    mainDocPlaced = true;
  }

  // Column 1 — 아이디어 sub-frame (nested, vertical, selectable).
  if (ideas.length) {
    if (!ideaFrameId) {
      ideaFrameId = newId('frame');
      b.addNodeRaw({
        id: ideaFrameId, type: 'frame', x: colX, y: rowY, w: IDEA_W + FRAME_PAD * 2, h: 160,
        data: { title: '아이디어', frameId, sub: true },
      });
    }
    let iy = rowY + FRAME_PAD;
    const ix = colX + FRAME_PAD;
    for (const idea of ideas) {
      b.updateNodeRaw(idea.id, { x: ix, y: iy, w: IDEA_W, data: { ...(idea.data ?? {}), role: 'idea', frameId: ideaFrameId } });
      iy += layoutH(idea) + D_VGAP;
    }
    const subW = IDEA_W + FRAME_PAD * 2;
    const subH = iy - D_VGAP + FRAME_PAD - rowY;
    b.updateNodeRaw(ideaFrameId, { x: colX, y: rowY, w: subW, h: subH });
    colX += subW + D_COLGAP;
  } else if (ideaFrameId) {
    b.removeNodeRaw(ideaFrameId); // ideas all gone → drop the empty sub-frame
    ideaFrameId = undefined;
  }

  // Column 2 — the main document (계획안/통신문/관찰기록); skipped if hero-doc
  // already placed it first.
  if (mainDoc && !mainDocPlaced) {
    b.updateNodeRaw(mainDoc.id, { x: colX, y: rowY });
    colX += mainDoc.w + D_COLGAP;
  }

  // Column 3 — concept images / 도안, stacked vertically beside the plan
  // (skipped when already laid out as a gallery-first band above).
  if (images.length && !imagesPlaced) {
    let iy = rowY;
    let imgW = 0;
    for (const img of images) {
      b.updateNodeRaw(img.id, { x: colX, y: iy });
      iy += layoutH(img) + D_VGAP;
      imgW = Math.max(imgW, img.w);
    }
    colX += imgW + D_COLGAP;
  }

  // Column 4 — companion materials beside the plan (per the teacher's request):
  // 활동지 · 웹 자료 카드 · 안내 메모, stacked top-down (NOT a row below the plan).
  const rightStack = [extraDoc, newsletter, source, clarify, ...memos].filter(Boolean) as BoardNode[];
  if (rightStack.length) {
    let sy = rowY;
    for (const it of rightStack) {
      b.updateNodeRaw(it.id, { x: colX, y: sy });
      sy += layoutH(it) + D_VGAP;
    }
  }

  // Fit the inner sub-frame first, then the parent (fitFrameToChildren bubbles up).
  if (ideaFrameId) fitFrameToChildren(ideaFrameId);
  fitFrameToChildren(frameId);
}

/** 저장 당시 프레임의 '보드 모습' 스냅샷 — 모든 하위 노드(중첩 프레임 포함)를
    프레임 원점 기준 보드 px로 평탄화해 담는다. 폴더 페이지의 board.board 항목이
    이 스냅샷을 CSS scale로 그대로 축소 렌더한다(썸네일·풀스크린 공용). */
export function frameBoardSnap(frameId: string): BoardSnap | null {
  const b = useBoardStore.getState();
  const root = b.nodes[frameId];
  if (!root || root.type !== 'frame') return null;
  const nodes: BoardSnapNode[] = [];
  const rh = (n: BoardNode) =>
    Math.max(typeof n.data?.renderH === 'number' ? (n.data.renderH as number) : 0, n.h);
  const walk = (fid: string) => {
    const kids = Object.values(b.nodes)
      .filter((n) => n.data?.frameId === fid)
      .sort((a, z) => a.y - z.y || a.x - z.x);
    for (const n of kids) {
      if (n.type === 'runner' || n.type === 'motion') continue;
      const base = { x: Math.round(n.x - root.x), y: Math.round(n.y - root.y), w: n.w, h: Math.round(rh(n)) };
      if (n.type === 'frame') {
        nodes.push({ ...base, h: n.h, kind: 'frame', text: (n.data?.title as string) ?? '' });
        walk(n.id);
      } else if (n.type === 'image' && n.src) {
        nodes.push({ ...base, kind: 'image', src: n.src, text: n.text ?? '' });
      } else if (n.data?.doc) {
        nodes.push({ ...base, kind: 'doc', text: n.text ?? '', cover: n.data?.coverImage as string | undefined });
      } else if (n.type === 'sticky' || n.type === 'text') {
        nodes.push({ ...base, kind: 'memo', text: n.text ?? '', color: n.color });
      }
    }
  };
  walk(frameId);
  return { w: root.w, h: root.h, nodes };
}

/** 프레임 → 폴더 트리(재귀). 프레임 = 폴더, 중첩 프레임 = 중첩 폴더,
    이미지 = .jpg, 문서(data.doc) = .pdf, 메모/텍스트 = .txt.
    각 폴더의 맨 앞에는 저장 당시 보드 모습 스냅샷(board.board)이 들어간다.
    러너(컨트롤)·헤더(폴더명과 중복)·모션 라인은 파일이 아니므로 제외. */
export function folderFromFrame(frameId: string): SavedFolder | null {
  const b = useBoardStore.getState();
  const frame = b.nodes[frameId];
  if (!frame || frame.type !== 'frame') return null;
  const safeName = (s: string, fallback: string) =>
    (
      s
        .split('\n')[0]
        .replace(/^#+\s*/, '') // 문서 첫 줄의 마크다운 헤딩 마커 제거
        .replace(/\*\*/g, '')
        .replace(/[\\/:*?"<>|]/g, ' ')
        .trim() || fallback
    ).slice(0, 40);
  const children: SavedEntry[] = [];
  const kids = Object.values(b.nodes)
    .filter((n) => n.data?.frameId === frameId)
    .sort((a, z) => a.y - z.y || a.x - z.x); // 보드의 시각적 순서(위→아래, 왼→오)
  for (const n of kids) {
    if (n.type === 'runner' || n.type === 'motion') continue;
    if (n.data?.role === 'header') continue;
    if (n.type === 'frame') {
      const sub = folderFromFrame(n.id);
      if (sub) children.push(sub);
      continue;
    }
    if (n.type === 'image' && n.src) {
      children.push({ kind: 'file', id: savedEntryId(), name: `${safeName(n.text ?? '', '이미지')}.jpg`, type: 'image', content: n.src });
    } else if (n.data?.doc) {
      children.push({
        kind: 'file',
        id: savedEntryId(),
        name: `${safeName(n.text ?? '', '문서')}.pdf`,
        type: 'doc',
        content: n.text ?? '',
        cover: n.data?.coverImage as string | undefined,
      });
    } else if (n.data?.role === 'source' && Array.isArray(n.data?.links)) {
      const links = n.data.links as Array<{ title: string; url: string }>;
      const text = [n.data?.summary as string | undefined, ...links.map((l) => `· ${l.title} — ${l.url}`)]
        .filter(Boolean)
        .join('\n');
      children.push({ kind: 'file', id: savedEntryId(), name: '웹 자료.txt', type: 'note', content: text });
    } else if ((n.type === 'sticky' || n.type === 'text') && (n.text ?? '').trim()) {
      children.push({ kind: 'file', id: savedEntryId(), name: `${safeName(n.text ?? '', '메모')}.txt`, type: 'note', content: n.text ?? '' });
    }
  }
  // 맨 앞: 저장 당시 보드 모습 그대로 보는 board.board 스냅샷.
  // frameId를 함께 기억해 뷰어에서 '마이보드에서 보기'로 원본 프레임에 점프한다.
  const snap = frameBoardSnap(frameId);
  if (snap && snap.nodes.length) {
    children.unshift({ kind: 'file', id: savedEntryId(), name: 'board.board', type: 'board', content: JSON.stringify(snap), frameId });
  }
  return {
    kind: 'folder',
    id: savedEntryId(),
    name: safeName((frame.data?.title as string) ?? '', '보드 묶음'),
    children,
  };
}

/** Save a frame's child cards as one folder bundle; mark the frame saved.
    Returns the new bundle id (or null if the frame is empty/invalid).
    동시에 폴더 페이지용 '계층 폴더 트리'(folderFromFrame)도 함께 저장한다. */
export function saveFrameToFolder(frameId: string): string | null {
  const bundle = bundleFromFrame(frameId);
  if (!bundle) return null;
  useFolderStore.getState().addBundle(bundle);
  const tree = folderFromFrame(frameId);
  if (tree) useFolderStore.getState().addSavedFolder(tree);
  const b = useBoardStore.getState();
  const frame = b.nodes[frameId];
  if (frame) b.updateNodeRaw(frameId, { data: { ...(frame.data ?? {}), savedBundleId: bundle.id } });
  return bundle.id;
}
