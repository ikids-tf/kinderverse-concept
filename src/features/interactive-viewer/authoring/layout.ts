/**
 * 레이아웃 후처리 엔진 — LLM이 찍은 좌표를 신뢰하지 않고, 요소의 '역할'을 구조
 * (behaviors/connections)에서 추론해 전문적인 무대 배치로 재배열한다.
 *
 * 존: HUD(상단 제목·카운터) · 플레이필드(액터 + 상호작용 세트) · 오버레이(승리/피드백, 중앙).
 * 같은 역할의 세트(연잎 등)는 균일 크기 + 균등 간격 + 중앙 정렬(한 줄/격자) → 겹침 0, 들쭉날쭉 0.
 *
 * ⚠ 스키마는 동결 — transform/카운터 display 값만 바꾸고, 전체 덮는 무의미한 배경 도형만 제거한다.
 * compose(신규 생성)에서만 호출. edit(증분 수정)은 교사 수동 배치 보존을 위해 호출하지 않는다.
 */
import type { InteractiveNode, ElementNode, Transform } from '../schema/interactiveNode';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
/** 이미지(누끼·크롭 후) 가로/세로 비율 — 박스를 대상 모양에 맞춰(레터박스 최소). 없으면 1. */
const aspectOf = (e: ElementNode): number => {
  const s = e.src;
  return s && s.width && s.height && s.height > 0 ? s.width / s.height : 1;
};

/** 성공/축하 문구 — 숨김 동작이 없어도 오버레이로 분류한다. */
const CELEBRATE_RE = /와[!~.]|잘[ ]?했|최고|참[ ]?잘|성공|완성|축하|클리어|🎉|👏|⭐|done|great|win/i;

interface Roles {
  title: string | null;
  actors: string[]; // moveAlongPath 대상(캐릭터)
  play: string[]; // tap/sequenceTap 대상(상호작용 세트)
  overlay: string[]; // 시작 시 숨김 + 승리/축하
  labels: string[]; // 짧은 텍스트(숫자 라벨 등)
  dropShapes: string[]; // 전체 덮는 무참조 배경 도형(삭제)
}

function classify(node: InteractiveNode): Roles {
  const { w: cw, h: ch } = node.canvas.size;
  const area = cw * ch;
  const behs = node.behaviors;
  const moveTargets = new Set(behs.filter((b) => b.action === 'moveAlongPath').map((b) => b.target));
  const tapTargets = new Set(
    behs.filter((b) => b.trigger === 'tap' || b.trigger === 'sequenceTap').map((b) => b.target),
  );
  const hidden = new Set<string>();
  for (const b of behs) {
    if (b.action === 'hide' && b.trigger === 'sceneEnter') b.params.targets.forEach((t) => hidden.add(t));
    if (b.action === 'reveal' && b.when) b.params.targets.forEach((t) => hidden.add(t));
  }

  const roles: Roles = { title: null, actors: [], play: [], overlay: [], labels: [], dropShapes: [] };
  const textCandidates: ElementNode[] = [];

  for (const e of node.elements) {
    if (moveTargets.has(e.id)) { roles.actors.push(e.id); continue; }
    if (tapTargets.has(e.id)) { roles.play.push(e.id); continue; }
    if (hidden.has(e.id)) { roles.overlay.push(e.id); continue; }
    if (e.kind === 'text') {
      const t = (e.text ?? '').trim();
      if (CELEBRATE_RE.test(t)) { roles.overlay.push(e.id); continue; }
      if (t.length <= 4) { roles.labels.push(e.id); continue; }
      textCandidates.push(e);
      continue;
    }
    if (e.kind === 'shape' && e.transform.w * e.transform.h >= 0.6 * area) {
      const referenced =
        behs.some((b) => b.target === e.id) || node.connections.some((c) => c.from === e.id || c.to === e.id);
      if (!referenced) { roles.dropShapes.push(e.id); continue; }
    }
    // 그 외(장식 등)는 좌표 유지
  }
  // 제목 = 남은 텍스트 중 가장 위(동률이면 가장 넓은 것)
  if (textCandidates.length) {
    textCandidates.sort((a, b) => a.transform.y - b.transform.y || b.transform.w - a.transform.w);
    roles.title = textCandidates[0].id;
  }
  return roles;
}

/** 요소 좌표·카운터 표시를 전문 배치로 재배열한 새 노드를 반환(원본 불변). */
export function autoLayout(node: InteractiveNode): InteractiveNode {
  const { w: cw, h: ch } = node.canvas.size;
  const M = 48; // 안전 여백
  const roles = classify(node);
  const peek = (node.flags ?? []).some((f) => f.id === 'peek'); // 숨바꼭질/추측 — 흩어 배치 + 런타임 마스크
  const byId = new Map(node.elements.map((e) => [e.id, e] as const));
  const tf = new Map<string, Transform>(); // id → 새 transform

  // 1) 제목 — 상단 중앙
  if (roles.title) {
    const e = byId.get(roles.title)!;
    const w = clamp(e.transform.w, 480, cw - 2 * M);
    const h = clamp(e.transform.h, 64, 130);
    tf.set(roles.title, { x: Math.round((cw - w) / 2), y: 40, w, h, rotation: 0, z: 20 });
  }

  const play = roles.play.map((id) => byId.get(id)!).filter(Boolean).sort((a, b) => a.transform.x - b.transform.x);
  const labels = roles.labels.map((id) => byId.get(id)!).filter(Boolean).sort((a, b) => a.transform.x - b.transform.x);
  const hasActor = roles.actors.length > 0;
  // 액터가 아이템들로 콩콩 이동하며 줍는 '수집형'(예: 도토리 순서대로 줍기) — 한 줄(grid) 대신
  // 깊이 있게 흩어 배치(원근 크기 차등). peek(숨바꼭질)와 함께 'scatter'로 처리한다.
  const actorCollect =
    hasActor &&
    play.length >= 3 &&
    play.filter((e) =>
      node.connections.some(
        (c) => (roles.actors.includes(c.from) && c.to === e.id) || (roles.actors.includes(c.to) && c.from === e.id),
      ),
    ).length >= Math.min(play.length, 3);
  const scatter = peek || actorCollect;

  // 2) 플레이 세트 — grid(균일·한 줄/격자) 또는 scatter(흩어 + 원근 깊이). 하단 정렬.
  let setTop = ch * 0.55; // 액터 배치 기준(세트 윗변)
  if (play.length && scatter) {
    // 흩어 배치(한 줄 X) + 원근 깊이: 위=작게(원경)·아래=크게(근경). peek면 런타임 마스크가 아랫부분을 가린다.
    // actorCollect 는 하단 중앙을 액터 '집'으로 비우려 밴드를 위쪽에 둔다.
    const n = play.length;
    const cols = n <= 4 ? n : Math.ceil(Math.sqrt(n * 1.4));
    const rows = Math.ceil(n / cols);
    const colW = (cw - 2 * M) / cols;
    const baseSize = clamp(Math.min(colW * 0.62, 196), 116, 196);
    const bandTop = peek ? ch * 0.4 : ch * 0.22;
    const bandBottom = peek ? ch * 0.82 : ch * 0.56;
    const bandH = bandBottom - bandTop;
    const rowH = bandH / rows;
    const pairLabels = labels.length === n; // 숫자 라벨이 있으면 각 아이템 아래에 따라붙인다
    play.forEach((e, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const jx = (((i * 37) % 100) / 100 - 0.5) * colW * 0.34; // 결정론적 지터(흩어진 느낌)
      const jy = (((i * 53) % 100) / 100 - 0.5) * rowH * 0.4;
      const cx = M + colW * (col + 0.5) + jx;
      const cy = bandTop + rowH * (row + 0.5) + jy;
      const depth = clamp((cy - bandTop) / Math.max(1, bandH), 0, 1); // 0=위(원경) → 1=아래(근경)
      const size = Math.round(clamp(baseSize * (0.74 + 0.5 * depth), 92, 232)); // 원근 크기 차등
      const x = Math.round(clamp(cx - size / 2, M, cw - M - size));
      const y = Math.round(clamp(cy - size / 2, bandTop - 20, ch - M - size));
      const z = 2 + Math.round(depth * 12); // 가까울수록(아래) 앞으로
      tf.set(e.id, { x, y, w: size, h: size, rotation: 0, z });
      if (pairLabels) {
        const lab = labels[i];
        const lw = clamp(lab.transform.w, 40, size);
        tf.set(lab.id, { x: Math.round(x + (size - lw) / 2), y: y + size + 4, w: lw, h: 40, rotation: 0, z: z + 1 });
      }
    });
    setTop = bandTop;
  } else if (play.length) {
    const n = play.length;
    const perRow = n <= 6 ? n : Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / perRow);
    const pairLabels = labels.length === n && rows === 1; // 한 줄일 때만 각 항목 아래 1:1
    const labelH = pairLabels ? 52 : 0;
    const rowGap = 32;

    const availW = cw - 2 * M;
    const fieldTop = 196 + (hasActor ? 220 : 0);
    const fieldBottom = ch - M - (labels.length && !pairLabels ? 60 : 0);
    const availH = Math.max(160, fieldBottom - fieldTop);

    const maxCellW = (availW - (perRow - 1) * 24) / perRow;
    const maxCellH = (availH - (rows - 1) * rowGap) / rows - labelH;
    // 주인공(상호작용 요소)을 충분히 크게 — 상한 상향.
    const cellW = clamp(Math.min(median(play.map((e) => e.transform.w)) || 190, maxCellW), 130, 240);
    const cellH = clamp(Math.min(median(play.map((e) => e.transform.h)) || 190, maxCellH), 130, 240);

    const blockH = cellH + labelH;
    const gridH = rows * blockH + (rows - 1) * rowGap;
    const startY = Math.round(Math.max(fieldTop, fieldBottom - gridH));
    setTop = startY;

    let idx = 0;
    for (let r = 0; r < rows; r++) {
      const inRow = Math.min(perRow, n - r * perRow);
      const gap = inRow > 1 ? clamp((availW - inRow * cellW) / (inRow - 1), 24, 160) : 0;
      const rowW = inRow * cellW + (inRow - 1) * gap;
      const startX = Math.round((cw - rowW) / 2);
      const y = Math.round(startY + r * (blockH + rowGap));
      for (let c = 0; c < inRow; c++, idx++) {
        const e = play[idx];
        const x = Math.round(startX + c * (cellW + gap));
        tf.set(e.id, { x, y, w: cellW, h: cellH, rotation: 0, z: 2 });
        if (pairLabels) {
          const lab = labels[idx];
          const lw = clamp(lab.transform.w, 48, cellW);
          tf.set(lab.id, { x: Math.round(x + (cellW - lw) / 2), y: y + cellH + 6, w: lw, h: 44, rotation: 0, z: 3 });
        }
      }
    }
    // 짝이 안 맞는 라벨 → 격자 아래 한 줄(숫자선)
    if (labels.length && !pairLabels) {
      const m = labels.length;
      const lw = clamp(median(labels.map((e) => e.transform.w)) || 80, 48, 160);
      const gap = m > 1 ? clamp((availW - m * lw) / (m - 1), 16, 160) : 0;
      const rowW = m * lw + (m - 1) * gap;
      const sx = Math.round((cw - rowW) / 2);
      const ly = Math.round(startY + gridH + 8);
      labels.forEach((lab, i) => tf.set(lab.id, { x: sx + Math.round(i * (lw + gap)), y: ly, w: lw, h: 44, rotation: 0, z: 3 }));
    }
  }

  // 3) 액터 — scatter(수집/숨바꼭질)면 하단 중앙 '집'에서 출발(아이템 위로 콩콩, 근경이라 가장 크고 앞).
  //    그 외는 플레이 세트 위 중앙(이동 여유). 여러 개면 가로로 분산.
  if (hasActor) {
    const slots = roles.actors.length;
    roles.actors.forEach((id, i) => {
      const e = byId.get(id)!;
      // 주인공은 크게 + 박스를 이미지 비율에 맞춤(큰 변 ~250, 레터박스 최소).
      const aspect = aspectOf(e);
      const target = 250;
      let w = target;
      let h = target;
      if (aspect >= 1) h = Math.round(target / aspect);
      else w = Math.round(target * aspect);
      w = clamp(w, 150, 300);
      h = clamp(h, 150, 300);
      const x = Math.round((cw * (i + 1)) / (slots + 1) - w / 2);
      const y = scatter
        ? Math.round(ch - h - M + 10) // 하단 '집'에서 출발
        : Math.round(clamp(setTop - h - 28, 184, ch - h - M));
      tf.set(id, { x, y, w, h, rotation: 0, z: scatter ? 40 : 5 });
    });
  }

  // 4) 오버레이(승리/피드백) — 중앙 살짝 위(시작 시 숨김이라 겹침 무관)
  roles.overlay.forEach((id) => {
    const e = byId.get(id)!;
    const w = clamp(e.transform.w, 360, 760);
    const h = clamp(e.transform.h, 90, 240);
    tf.set(id, { x: Math.round((cw - w) / 2), y: Math.round((ch - h) / 2 - 40), w, h, rotation: 0, z: 50 });
  });

  // 5) 적용 + 전체 덮는 무참조 배경 도형 제거
  const drop = new Set(roles.dropShapes);
  const elements = node.elements
    .filter((e) => !drop.has(e.id))
    .map((e) => {
      const t = tf.get(e.id);
      return t ? { ...e, transform: t } : e;
    });

  // 카운터 표시 — 상단 중앙(제목 아래, 세로 스택)
  const counters = node.counters?.map((cn, i) => ({ ...cn, display: { x: Math.round(cw / 2 - 60), y: 180 + i * 60 } }));

  let out: InteractiveNode = { ...node, elements };
  if (counters) out = { ...out, counters };
  return out;
}
