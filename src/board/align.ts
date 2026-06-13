import { useBoardStore, type BoardNode } from '@/store/boardStore';
import { worldBox } from './geometry';
import { frameSubtree } from './frames';
import { captureNodes, pushRedesign } from './commands';

/* 프레임 정렬 — 프레임을 '편집 디자인된 한 페이지'로 보고, 교사가 놓아 둔 배치를
   부수지 않는 "제자리 정돈"을 한다.
   - 소속 입양: 화면에서 서브 프레임 '안'에 있는 요소(중심점 기준 — 드래그 멤버십과
     동일)는 태그가 어긋나 있어도 그 프레임 소속으로 바로잡는다. 서브 프레임 안의
     요소는 정렬 후에도 끝까지 그 프레임 안에 남는다.
   - 왼쪽 상단의 제목 텍스트(role 'header' 또는 상단 띠의 최상단 텍스트)는 페이지
     머리글 — 제자리에 두고, 본문은 그 텍스트 줄 아래에서만 논다.
   - 행·열 정돈: 교사가 만든 행 구조(윗변 근접 클러스터)와 행 안의 왼→오 순서는
     유지하되, 행 안은 균일 거터로 좌측 패킹(갭·열 맞춤)·윗변 정렬(행 맞춤)하고,
     겹친 카드는 행에 끼어들고, 넘치면 아랫줄로 빠지고, 직전 행의 남은 여백에
     들어가는 행은 끌어올려 채운다. 카드 크기는 절대 바꾸지 않는다.
   - 콘텐츠 핏: 흐름이 끝나면 프레임 박스를 내용에 딱 맞게 감싼다(서브 프레임
     포함) — 자료 없는 빈 공간을 남기지 않는다. 핏 크기는 alignedW/H로 핀.
   - 서브 프레임은 먼저 제 안을 같은 규칙으로 정돈(재귀), 마인드맵은 방사형 유지. */

const PAD = 28; // 페이지 여백(frames.ts FRAME_PAD와 동일)
const GUT = 28; // 요소 사이 거터

type Box = { x: number; y: number; w: number; h: number };

interface AlignItem {
  node: BoardNode;
  box: Box;
}

/** 박스 b가 박스 a 안에 '완전히' 들어가 있는가(1px 관용). */
function boxContains(a: Box, b: Box): boolean {
  return b.x >= a.x - 1 && b.y >= a.y - 1 && b.x + b.w <= a.x + a.w + 1 && b.y + b.h <= a.y + a.h + 1;
}

function boxOverlaps(a: Box, b: Box): boolean {
  return b.x < a.x + a.w && b.x + b.w > a.x && b.y < a.y + a.h && b.y + b.h > a.y;
}

function centerIn(a: Box, b: Box): boolean {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  return cx >= a.x && cx <= a.x + a.w && cy >= a.y && cy <= a.y + a.h;
}

/** 이 프레임 페이지의 구성원 — 소속(tag) 직속 자식 + 어디에도 소속 아닌 떠돌이.
    떠돌이 판정: 카드는 중심점(드래그 멤버십과 동일), 프레임은 '완전 포함'일 때만
    — 거대한 페이지의 중심점이 우연히 작은 서브 프레임 위에 떨어져 페이지가 서브의
    멤버로 빨려 들어가는 역전을 차단한다(+ 자기 하위로의 사이클 가드).
    다른 프레임 소속 요소는 건드리지 않는다. */
function collectMembers(frame: BoardNode): BoardNode[] {
  const b = useBoardStore.getState();
  const fb = worldBox(frame);
  const out: BoardNode[] = [];
  for (const n of Object.values(b.nodes)) {
    if (n.id === frame.id) continue;
    if (n.data?.frameId === frame.id) {
      out.push(n);
      continue;
    }
    if (n.data?.frameId || n.type === 'runner') continue;
    const nb = worldBox(n);
    const isMember =
      n.type === 'frame'
        ? boxContains(fb, nb) && !frameSubtree(n.id, new Set()).includes(frame.id)
        : centerIn(fb, nb);
    if (isMember) out.push(n);
  }
  return out;
}

/** 정렬이 건드릴 수 있는 모든 노드 id(재귀) — undo 스냅샷 범위. */
export function collectAffectedIds(frameId: string, seen = new Set<string>()): string[] {
  if (seen.has(frameId)) return [];
  seen.add(frameId);
  const b = useBoardStore.getState();
  const f = b.nodes[frameId];
  if (!f || f.type !== 'frame') return [];
  const out = [frameId];
  for (const m of collectMembers(f)) {
    if (m.type === 'frame') out.push(...collectAffectedIds(m.id, seen));
    else out.push(m.id);
  }
  return out;
}

/** 페이지 머리글 감지 — data.role==='header'가 우선. 없으면 프레임 상단 띠(위
    140px·왼쪽 절반)에 있는 '제목 줄' 모양(낮은 높이 ≤120px)의 텍스트 카드 중
    다른 모든 요소보다 위에 있는 것. 뷰어(embed)·문서(doc)처럼 sticky라도 제목
    줄이 아닌 큰 카드는 머리글로 오인하지 않는다. */
function findHeader(frame: BoardNode, items: AlignItem[]): AlignItem | undefined {
  const tagged = items.find((it) => it.node.data?.role === 'header');
  if (tagged) return tagged;
  const cand = items
    .filter(
      (it) =>
        (it.node.type === 'text' || it.node.type === 'sticky') &&
        typeof it.node.data?.embed !== 'string' &&
        !it.node.data?.doc &&
        it.box.h <= 120,
    )
    .filter((it) => it.box.y <= frame.y + 140 && it.box.x <= frame.x + frame.w / 2)
    .sort((a, z) => a.box.y - z.box.y)[0];
  if (!cand) return undefined;
  const othersTop = Math.min(...items.filter((i) => i !== cand).map((i) => i.box.y), Infinity);
  return cand.box.y <= othersTop + 1 ? cand : undefined;
}

/** 프레임 안을 재귀로 정렬. 순서: 소속 입양 → 서브 프레임 정돈(재귀) → 이 레벨
    제자리 정돈 → 콘텐츠 핏. */
export function alignFrameDeep(frameId: string, seen = new Set<string>()): void {
  if (seen.has(frameId)) return; // frameId 사이클 방지
  seen.add(frameId);
  const b = useBoardStore.getState();
  const frame = b.nodes[frameId];
  if (!frame || frame.type !== 'frame') return;
  if (frame.locked) return; // 잠긴 프레임 안은 건드리지 않는다
  if (frame.data?.mindmap) return; // 마인드맵은 방사형 레이아웃 — 격자로 부수지 않는다

  const members = collectMembers(frame);
  if (members.length === 0) return;

  // 1) 소속 입양 — 화면에서 서브 프레임 안에 있으면(요소=중심점, 프레임=완전 포함)
  //    가장 작은 그 프레임 소속으로 태그를 바로잡는다. 아니면 이 페이지 소속으로.
  //    이래야 서브 프레임 안의 요소가 상위 정돈에 끌려 나가는 일이 없다.
  const memberFrames = members.filter((n) => n.type === 'frame');
  for (const n of members) {
    if (n.locked) continue;
    const nb = worldBox(n);
    let best: string | undefined;
    let bestArea = Infinity;
    for (const f of memberFrames) {
      if (f.id === n.id) continue;
      const fbb = worldBox(f);
      const inIt = n.type === 'frame' ? boxContains(fbb, nb) && !frameSubtree(n.id, new Set()).includes(f.id) : centerIn(fbb, nb);
      if (inIt && fbb.w * fbb.h < bestArea) {
        best = f.id;
        bestArea = fbb.w * fbb.h;
      }
    }
    const target = best ?? frameId;
    if (n.data?.frameId !== target) {
      useBoardStore.getState().updateNodeRaw(n.id, { data: { ...(n.data ?? {}), frameId: target } });
    }
  }

  // 2) 서브 프레임 먼저 제 안을 정돈(재귀 — 입양 반영된 소속으로).
  for (const f of memberFrames) alignFrameDeep(f.id, seen);

  // 3) 이 레벨 제자리 정돈 대상: 소속이 이 프레임인 신선한 노드(입양으로 빠진 것
  //    제외). 모션 라인은 연결 카드를 따라가므로, 잠긴 카드는 제자리 장애물로.
  const st = useBoardStore.getState();
  const cur = st.nodes[frameId]!;
  const fresh = Object.values(st.nodes).filter((n) => n.data?.frameId === frameId && n.id !== frameId);
  const items: AlignItem[] = fresh
    .filter((n) => n.type !== 'motion' && n.type !== 'runner' && !n.locked)
    .map((n) => ({ node: n, box: worldBox(n) }));
  if (items.length === 0) return;

  const header = findHeader(cur, items);
  const flow = items.filter((it) => it !== header);
  const contentTop = header
    ? Math.max(cur.y + PAD, header.box.y + header.box.h + GUT)
    : cur.y + PAD;

  // 한 노드는 한 번만 이동(프레임 = 본체 + 소속 하위 전체가 한 몸).
  const moved = new Set<string>();
  if (header) moved.add(header.node.id);
  const moveUnit = (n: BoardNode, dx: number, dy: number) => {
    const ids = (n.type === 'frame' ? [n.id, ...frameSubtree(n.id)] : [n.id]).filter((id) => !moved.has(id));
    ids.forEach((id) => moved.add(id));
    if (ids.length) useBoardStore.getState().moveNodesRaw(ids, dx, dy);
  };

  // 행·열 정돈 — 교사가 만든 행 구조를 읽고(윗변 근접 클러스터), 그 구조와 행
  // 안의 왼→오 순서는 유지한 채 강하게 정돈한다:
  //   · 행 안: 페이지 왼쪽에서 균일 거터(28px)로 좌측 패킹 — 어중간한 가로 여백
  //     제거(갭 맞춤). 카드 폭이 같으면 열도 자동으로 맞는다(열 맞춤). 윗변 정렬.
  //   · 겹쳐 쌓인 카드는 같은 행으로 모여 옆자리에 끼어들고, 행이 페이지 폭을
  //     넘치면 넘친 카드부터 아랫줄로 빠진다.
  //   · 행 전체가 직전 행의 남은 폭에 들어가면(높이도 무난하면) 끌어올려 그
  //     여백을 채운다 — 어중간한 빈 공간에 배치.
  //   · 행 사이 세로 간격도 균일 거터(머리글 줄 아래부터). 잠긴 카드는 피해 간다.
  const left = cur.x + PAD;
  const availW = Math.max(cur.w - PAD * 2, ...flow.map((i) => i.box.w));
  const lockedObs: Box[] = fresh
    .filter((n) => n.locked && n.type !== 'motion' && n.type !== 'runner')
    .map((n) => worldBox(n));

  // 1) 행 클러스터링 — ① 윗변이 가까우면 같은 행(허용치는 카드 높이에 비례).
  //    ② '키 큰 카드'(동영상 뷰어·서브 프레임 등) 옆: 그 카드의 세로 범위 안에
  //    겹치거나 가까이(≤120px) 가져다 둔 작은 카드는 윗변 차이가 커도 그 행에
  //    합류한다 — 뷰어 앞에 둔 이미지가 뷰어 앞(x 순서)으로 정렬되고 제자리로
  //    돌아가지 않는다. 같은 키의 카드 더미는 ①만 적용(세로 스택 보존).
  const tolOf = (it: AlignItem) => Math.max(24, Math.min(80, it.box.h * 0.4));
  const besideTall = (m: Box, b: Box) =>
    m.h >= b.h * 1.4 && // 분명히 키 큰 카드 옆일 때만
    b.y >= m.y - 24 && b.y + b.h <= m.y + m.h + 24 && // 세로로 그 카드 범위 안
    b.x < m.x + m.w + 120 && b.x + b.w > m.x - 120; // 옆에 가까이(겹침 포함)
  const sorted = [...flow].sort((a, z) => a.box.y - z.box.y || a.box.x - z.box.x);
  const groups: AlignItem[][] = [];
  for (const it of sorted) {
    const g = groups.find(
      (r) =>
        Math.abs(r[0].box.y - it.box.y) <= Math.max(tolOf(r[0]), tolOf(it)) ||
        r.some((m) => besideTall(m.box, it.box)),
    );
    if (g) g.push(it);
    else groups.push([it]);
  }
  groups.forEach((g) => g.sort((a, z) => a.box.x - z.box.x || a.box.y - z.box.y));

  // 2) 행 배치 — 위 행부터 좌측 패킹. rowsOut = 확정된 행들의 [다음 빈 x, y, 높이].
  interface Row { x: number; y: number; h: number }
  const rowsOut: Row[] = [];
  const nextRowY = () => (rowsOut.length ? Math.max(...rowsOut.map((r) => r.y + r.h)) + GUT : contentTop);
  const startRow = (y: number): Row => {
    const r = { x: left, y, h: 0 };
    rowsOut.push(r);
    return r;
  };
  for (const g of groups) {
    const totalW = g.reduce((s, i) => s + i.box.w, 0) + GUT * (g.length - 1);
    const maxH = Math.max(...g.map((i) => i.box.h));
    // 직전 행의 남은 폭에 통째로 들어가고 높이도 무난하면 그 여백을 채운다.
    const prev = rowsOut[rowsOut.length - 1];
    let row =
      prev && prev.x > left && prev.x + totalW <= left + availW + 1 && (prev.h === 0 || maxH <= prev.h * 1.5)
        ? prev
        : startRow(nextRowY());
    for (const it of g) {
      if (row.x > left && row.x + it.box.w > left + availW + 1) row = startRow(nextRowY()); // 넘치면 아랫줄로
      // 잠긴 카드와 겹치면 그 아래 새 행으로 피해 간다.
      const lk = lockedObs.find((p) => boxOverlaps(p, { x: row.x, y: row.y, w: it.box.w, h: it.box.h }));
      if (lk) row = startRow(Math.max(nextRowY(), lk.y + lk.h + GUT));
      const dx = Math.round(row.x - it.box.x);
      const dy = Math.round(row.y - it.box.y);
      if (dx || dy) moveUnit(it.node, dx, dy);
      row.x += it.box.w + GUT;
      row.h = Math.max(row.h, it.box.h);
    }
  }

  // 4) 콘텐츠 핏 — 모든 구성원(잠긴 카드·모션 포함)의 실측 박스를 사방 PAD로 딱
  //    감싼다. 빈 공간을 남기지 않는다(네 방향 모두). 핏 크기는 alignedW/H로 핀 —
  //    이후 자동 재포장(fitFrameToChildren)이 페이지를 더 줄이거나 옮기지 못하게.
  const st2 = useBoardStore.getState();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const m of fresh) {
    const n = st2.nodes[m.id];
    if (!n) continue;
    const bx = worldBox(n);
    minX = Math.min(minX, bx.x);
    minY = Math.min(minY, bx.y);
    maxX = Math.max(maxX, bx.x + bx.w);
    maxY = Math.max(maxY, bx.y + bx.h);
  }
  if (!Number.isFinite(minX)) return;
  const w = Math.max(220, Math.round(maxX - minX + PAD * 2));
  const h = Math.max(120, Math.round(maxY - minY + PAD * 2));
  st2.updateNodeRaw(frameId, {
    x: Math.round(minX - PAD),
    y: Math.round(minY - PAD),
    ...(w !== cur.w ? { w } : {}),
    ...(h !== cur.h ? { h } : {}),
    data: { ...(st2.nodes[frameId]?.data ?? {}), alignedW: w, alignedH: h },
  });
}

/** 정렬 버튼 진입점 — 프레임 하위 전체(+페이지 안 떠돌이)를 스냅샷 뜨고 정렬한
    뒤 한 번의 undo로 되돌릴 수 있게 기록(⌘Z, '프레임 정렬'). 소속 입양(태그
    교정)도 같은 스냅샷에 담겨 함께 되돌아간다. */
export function alignFrameCmd(frameId: string): boolean {
  const b = useBoardStore.getState();
  const frame = b.nodes[frameId];
  if (!frame || frame.type !== 'frame') return false;
  const ids = [...new Set([...collectAffectedIds(frameId), ...frameSubtree(frameId)])];
  const before = captureNodes(ids);
  alignFrameDeep(frameId);
  pushRedesign(ids, before, '프레임 정렬');
  return true;
}
