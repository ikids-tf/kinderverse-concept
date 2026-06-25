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

/** 박스 b가 박스 a 안에 '완전히' 들어가 있는가(1px 관용). */
function boxContains(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean {
  return b.x >= a.x - 1 && b.y >= a.y - 1 && b.x + b.w <= a.x + a.w + 1 && b.y + b.h <= a.y + a.h + 1;
}

/** 두 박스가 조금이라도 겹치는가. */
function boxOverlaps(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean {
  return b.x < a.x + a.w && b.x + b.w > a.x && b.y < a.y + a.h && b.y + b.h > a.y;
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

/** The set that moves with the frame. 동반 이동 규칙:
    1) 이 프레임 소속(tagged) 하위 전체 — 중첩 프레임·손주까지 재귀로 항상 따라온다.
    2) 다른 프레임 소속 요소 — 이 프레임이 그 '소유 프레임 안에 완전히 들어가 있는'
       중첩 상황이고, 요소도 이 프레임 안에 완전히 들어와 있을 때만 따라온다.
       소유 프레임과 밖에서 살짝 겹친 프레임은 (요소를 완전히 덮었더라도) 남의
       요소를 뺏어 가지 않는다.
    3) 어느 프레임에도 속하지 않은 보드 단독 요소 — 살짝만 겹쳐도 따라온다.
    4) 프레임은 단독/소속과 무관하게 '완전히' 들어와 있을 때만 따라온다(+그 하위 전체).
       살짝 겹친 프레임은 절대 따라오지 않는다. */
export function frameMoveSet(frameId: string): string[] {
  const b = useBoardStore.getState();
  const f = b.nodes[frameId];
  if (!f || f.type !== 'frame') return [];
  const fb = worldBox(f);
  // 1) 소속 하위는 항상 — 프레임에 '태깅된' 모션 라인(이동 애니메이션)도 포함한다.
  //    모션은 자체 x/y로 경로를 가지므로 프레임과 함께 평행이동하면 그대로 따라온다.
  //    연결 카드가 있어도 드래그 셋에 모션이 포함되면 offFor가 이중 오프셋을 0으로
  //    만들어(MotionPathNode) 끝점이 두 번 끌리지 않는다.
  const ids = new Set<string>(frameSubtree(frameId));
  for (const n of Object.values(b.nodes)) {
    if (n.id === frameId || ids.has(n.id)) continue;
    // 모션 라인: 태깅 안 됐어도, '연결 없는 자유 모션'이 프레임 안에 들어가 있으면
    // 함께 옮긴다(엔드포인트가 따라갈 카드가 없어 안 그러면 제자리에 남는다).
    // 카드에 연결된 모션은 그 카드를 따라 끝점이 움직이므로 여기선 제외(이중 이동 방지).
    if (n.type === 'motion') {
      const free = !n.data?.aStart && !n.data?.aEnd;
      if (free && boxContains(fb, worldBox(n))) ids.add(n.id);
      continue;
    }
    const nb = worldBox(n);
    if (n.type === 'frame') {
      // 4) 프레임 — 완전 포함일 때만. 이 프레임의 조상이면(사이클) 제외.
      if (boxContains(fb, nb) && !frameSubtree(n.id).includes(frameId)) {
        ids.add(n.id);
        frameSubtree(n.id).forEach((d) => ids.add(d));
      }
      continue;
    }
    const ownerId = n.data?.frameId as string | undefined;
    const owner = ownerId && ownerId !== frameId && !ids.has(ownerId) ? b.nodes[ownerId] : undefined;
    if (owner) {
      // 2) 다른 프레임 소속 — 이 프레임이 소유 프레임 '안'(완전 포함)에 있고
      //    요소도 완전 포함일 때만(프레임 안에 만든 새 중첩 프레임의 경우).
      if (boxContains(worldBox(owner), fb) && boxContains(fb, nb)) ids.add(n.id);
    } else if (boxOverlaps(fb, nb)) {
      // 3) 보드 단독 요소 — 살짝 겹쳐도 함께.
      ids.add(n.id);
    }
  }
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
  // Respect a pinned aligned height (set when this frame was aligned beside another)
  // so a content re-fit never shrinks it below its neat side-by-side height.
  const alignedH = typeof f.data?.alignedH === 'number' ? f.data.alignedH : 0;
  const alignedW = typeof f.data?.alignedW === 'number' ? f.data.alignedW : 0;
  let x = minX - FRAME_PAD;
  let y = minY - FRAME_PAD;
  let w = maxX - minX + FRAME_PAD * 2;
  let h = Math.max(maxY - minY + FRAME_PAD * 2, alignedH);
  if (alignedW) {
    // 정렬로 '페이지'가 된 프레임(align.ts) — 내용이 박스 안에 있는 한 위치·크기를
    // 그대로 유지하고(재포장이 페이지를 줄이거나 끌고 다니지 않게), 내용이 밖으로
    // 나가면 그쪽으로만 최소 확장한다.
    x = Math.min(f.x, minX - FRAME_PAD);
    y = Math.min(f.y, minY - FRAME_PAD);
    w = Math.max(alignedW, maxX + FRAME_PAD - x);
    h = Math.max(alignedH, maxY + FRAME_PAD - y);
  }
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
  const idealist = firstRole('idealist'); // 놀이 패키지의 선택형 아이디어 리스트(맨 왼쪽 컬럼)
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

  // Column 0 — 아이디어 리스트(선택형 doc, 놀이 패키지). 맨 왼쪽에 두고 나머지는 오른쪽으로.
  if (idealist) {
    b.updateNodeRaw(idealist.id, { x: colX, y: rowY });
    colX += idealist.w + D_COLGAP;
  }

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
      } else if (typeof n.data?.embed === 'string' || n.type === 'interactive') {
        // 동영상·슬라이드·게임 등 뷰어 — 보드 모습 그대로 보이게 'embed'로 담는다(메모 텍스트로 새지 않게).
        const embed = typeof n.data?.embed === 'string' ? (n.data.embed as string) : 'interactive';
        nodes.push({ ...base, kind: 'embed', embed, src: n.data?.viewerSrc as string | undefined, text: (n.data?.title as string) || n.text || '뷰어' });
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
      // 활동지(WorksheetCard)는 본문이 A4 그림이라 그 이미지를 표지로 함께 담아 보드 모습 그대로 보이게.
      const wsImg = (n.data?.payload as { type?: string; props?: { image_url?: string } } | undefined)?.type === 'WorksheetCard'
        ? (n.data.payload as { props?: { image_url?: string } }).props?.image_url
        : undefined;
      children.push({
        kind: 'file',
        id: savedEntryId(),
        name: `${safeName(n.text ?? '', '문서')}.pdf`,
        type: 'doc',
        content: n.text ?? '',
        cover: (n.data?.coverImage as string | undefined) ?? wsImg,
      });
    } else if (typeof n.data?.embed === 'string') {
      // 동영상·슬라이드 등 뷰어 — note(.txt)가 아니라 'embed' 파일로 저장해 폴더에서 그대로 재생/본다.
      children.push({
        kind: 'file',
        id: savedEntryId(),
        name: safeName((n.data?.title as string) || n.text || '뷰어', '뷰어'),
        type: 'embed',
        content: n.data.embed as string,
        embedSrc: n.data?.viewerSrc as string | undefined,
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

/** 프레임 내용 시그니처 — 저장 시점 대비 변경을 감지해 '재저장 가능' 여부를 판단한다.
    자식 집합(id)·텍스트·이미지 src·뷰어를 얕게 해시한다(중첩 프레임 포함). */
export function frameContentSig(frameId: string): string {
  const b = useBoardStore.getState();
  const parts: string[] = [];
  const walk = (fid: string) => {
    Object.values(b.nodes)
      .filter((n) => n.data?.frameId === fid)
      .sort((a, z) => (a.id < z.id ? -1 : 1))
      .forEach((n) => {
        if (n.type === 'runner' || n.type === 'motion') return;
        if (n.type === 'frame') { parts.push(`F:${n.id}:${(n.data?.title as string) ?? ''}`); walk(n.id); return; }
        const t = n.text ?? '';
        const payT = (n.data?.payload as { type?: string } | undefined)?.type ?? '';
        parts.push(`${n.id}:${n.type}:${t.length}:${t.slice(0, 24)}:${t.slice(-24)}:${(n.src ?? '').slice(-24)}:${payT}:${(n.data?.embed as string) ?? ''}:${(n.data?.viewerSrc as string) ?? ''}`);
      });
  };
  walk(frameId);
  return parts.join('|');
}

/** Save a frame's child cards as one folder bundle; mark the frame saved.
    Returns the new bundle id (or null if the frame is empty/invalid).
    동시에 폴더 페이지용 '계층 폴더 트리'(folderFromFrame)도 함께 저장한다.
    이미 저장된 프레임을 다시 저장하면(내용 변경 후) 기존 폴더를 제자리 교체한다(중복 방지). */
export function saveFrameToFolder(frameId: string): string | null {
  const bundle = bundleFromFrame(frameId);
  if (!bundle) return null;
  const tree = folderFromFrame(frameId);
  if (!tree) return null;
  const b = useBoardStore.getState();
  const frame = b.nodes[frameId];
  const fstore = useFolderStore.getState();
  const prevFolderId = frame?.data?.savedFolderId as string | undefined;
  const prevBundleId = frame?.data?.savedBundleId as string | undefined;
  if (prevFolderId && fstore.saved.some((f) => f.id === prevFolderId)) {
    tree.id = prevFolderId; // 같은 id로 제자리 교체
    fstore.updateSavedFolder(tree);
    if (prevBundleId) fstore.removeBundle(prevBundleId);
    fstore.addBundle(bundle);
  } else {
    fstore.addBundle(bundle);
    fstore.addSavedFolder(tree);
  }
  if (frame) b.updateNodeRaw(frameId, { data: { ...(frame.data ?? {}), savedBundleId: bundle.id, savedFolderId: tree.id, savedSig: frameContentSig(frameId) } });
  return bundle.id;
}

/** 단일 문서 카드(data.doc)를 폴더에 저장 — 제목으로 폴더를 만들고 그 안에 .pdf 한 장.
    저장된 노드에는 savedToFolder 표시를 남긴다(중복 저장 시 토스트로 안내). */
export function saveDocToFolder(nodeId: string): boolean {
  const b = useBoardStore.getState();
  const n = b.nodes[nodeId];
  if (!n || !n.data?.doc) return false;
  const title = (n.text ?? '').match(/^#\s*(.+)$/m)?.[1]?.replace(/[#*]/g, '').trim()
    || (n.text ?? '').split('\n')[0].replace(/[#*]/g, '').trim()
    || '문서';
  const safe = title.replace(/[\\/:*?"<>|]/g, ' ').slice(0, 40).trim() || '문서';
  const folder = {
    kind: 'folder' as const,
    id: savedEntryId(),
    name: safe,
    children: [
      {
        kind: 'file' as const,
        id: savedEntryId(),
        name: `${safe}.pdf`,
        type: 'doc' as const,
        content: n.text ?? '',
        ...(typeof n.data?.coverImage === 'string' ? { cover: n.data.coverImage as string } : {}),
      },
    ],
  };
  useFolderStore.getState().addSavedFolder(folder);
  b.updateNodeRaw(nodeId, { data: { ...(n.data ?? {}), savedToFolder: true } });
  return true;
}
