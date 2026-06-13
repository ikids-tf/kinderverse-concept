import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/lib/icons';
import { useBoardStore, type BoardNode } from '@/store/boardStore';
import { renderHeight, worldBox } from '@/board/geometry';
import { getP, bz, centerOf, normalizeMotionNode, type P } from '@/board/motionGeometry';
import { analyzeImageFacing, type Facing } from '@/ai/facing';

/* 이동 애니메이션 노드 (type: 'motion') — 출발·도착 원을 잇는 곡선(3차 베지어)을
   따라 연결한 카드가 움직인다. 교사가 수업 자료를 "조작되는 콘텐츠"로 만드는 도구.
   - 원(출발/도착) 드래그로 위치, 선 위의 두 점(⅓·⅔ 지점)을 각각 드래그해
     S자·파도 등 다채로운 곡선을 만든다.
   - ⊕로 선택한 카드를 연결: 출발 = 움직일 카드(스냅), 도착 = 목표 카드(선이 따라감).
   - ▶ 재생(한 번/왕복), ↺ 처음으로, 속도 3단. 수업/슬라이드 쇼 중엔 컨트롤을 숨기고
     ▶·↺만 남겨 화면을 깨끗하게(선은 옅은 안내선). */

/** 재생 시간 = BASE_DUR ÷ 배속(data.speedX, 슬라이더 0.3~4×).
    구버전 3단(data.speed: slow/normal/fast)은 같은 체감의 배속으로 승격. */
const BASE_DUR = 3;
const SPEED_MIN = 0.05; // 달팽이 — 한 번 이동에 60초
const SPEED_MAX = 4;
const LEGACY_SPEED: Record<string, number> = { slow: 0.6, normal: 1, fast: 2.2 };
function speedOf(n: BoardNode): number {
  const v = n.data?.speedX;
  if (typeof v === 'number' && v > 0) return v;
  return LEGACY_SPEED[String(n.data?.speed ?? 'normal')] ?? 1;
}
/** 3D 뷰어 카메라의 최대 회전 속도(도/초) — 왕복 반전 시 180° 유턴에 약 1.1초.
    목표 각도를 점프시키지 않고 이 속도로 따라가 끝에서의 급회전을 없앤다. */
const TURN_RATE = 160;

/* 구간 효과(웨이포인트) — 곡선 조절점·출발/도착 원을 '클릭'하면 그 지점의 효과
   패널이 열린다. data.wpStart/wp1/wp2/wpEnd = { speed?: 배속(0.2~2, 근처에서 점차
   적용 후 회복) · jump?: 점프 · msg?: 지나는 동안 요소 위 말풍선 }.
   위치 기준은 곡선 위 t=0(출발)·⅓(m1)·⅔(m2)·1(도착). */
type Waypoint = { speed?: number; jump?: boolean; msg?: string };
type WpKey = 'p1' | 'm1' | 'm2' | 'p2';
const WP_KEYS: WpKey[] = ['p1', 'm1', 'm2', 'p2'];
const WP_T: Record<WpKey, number> = { p1: 0, m1: 1 / 3, m2: 2 / 3, p2: 1 };
const WP_KEY: Record<WpKey, 'wpStart' | 'wp1' | 'wp2' | 'wpEnd'> = {
  p1: 'wpStart',
  m1: 'wp1',
  m2: 'wp2',
  p2: 'wpEnd',
};
const WP_SPEED_RADIUS = 0.18; // 속도 램프가 걸리는 반경(곡선 진행도 기준)
const WP_JUMP_RADIUS = 0.12;
const WP_MSG_RADIUS = 0.15;
const WP_JUMP_HEIGHT = 240; // 점프 높이(px) — 멀리서도 확실히 보이게 크게
/** 0→1 스무스스텝 — 구간 효과가 앞뒤에서 부드럽게 들어왔다 빠진다. */
const smooth01 = (x: number) => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};

/** 이동 방향 표현 — 플립: 왼쪽으로 갈 때 좌우 반전(물고기가 가는 쪽을 봄) ·
    회전: 선의 기울기를 따라 기울임(+필요시 반전) · 고정: 그대로. */
type FlipMode = 'flip' | 'rotate' | 'none';
const FLIP_LABEL: Record<FlipMode, string> = { flip: '플립', rotate: '회전', none: '고정' };
const NEXT_FLIP: Record<FlipMode, FlipMode> = { flip: 'rotate', rotate: 'none', none: 'flip' };
const FLIP_TITLE: Record<FlipMode, string> = {
  flip: '방향: 플립 — 왼쪽으로 이동할 때 카드가 좌우로 뒤집혀요 (클릭: 회전으로)',
  rotate: '방향: 회전 — 선의 기울기를 따라 카드가 기울어요 (클릭: 고정으로)',
  none: '방향: 고정 — 카드 방향을 바꾸지 않아요 (클릭: 플립으로)',
};
/** 선택 시 점선 테두리의 잡기 스트립(상·하·좌·우) — 잡고 끌면 라인째 이동. */
const EDGE_STRIPS: Array<React.CSSProperties> = [
  { left: -6, right: -6, top: -6, height: 14 },
  { left: -6, right: -6, bottom: -6, height: 14 },
  { left: -6, top: -6, bottom: -6, width: 14 },
  { right: -6, top: -6, bottom: -6, width: 14 },
];

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const ease = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2; // easeInOutSine

/** 짧은 힌트 — 보드 상태 필을 잠깐 빌려 쓴다. */
function hint(msg: string): void {
  const st = useBoardStore.getState();
  st.setGenerating(msg);
  window.setTimeout(() => {
    const cur = useBoardStore.getState();
    if (cur.generating === msg) cur.setGenerating(null);
  }, 2600);
}

/* 그림의 '앞 방향' 분석 — 이미지 카드가 출발점에 연결되면 비전 모델에게 한 번 묻고
   카드(data.facing: 'left'|'right'|'none')에 캐시한다. 분석 전/실패 시엔 기본값
   (오른쪽을 본다)으로 동작하고, 컨트롤의 [앞→/앞←] 칩으로 직접 고칠 수 있다. */
const facingInflight = new Set<string>();

/** 연결 해제된 카드의 대기 동작(data.idle) 정리 — 분리되면 동작도 함께 사라진다. */
function clearIdle(cardId?: string): void {
  if (!cardId) return;
  const st = useBoardStore.getState();
  const c = st.nodes[cardId];
  if (c?.data?.idle) {
    const data = { ...c.data };
    delete data.idle;
    st.updateNodeRaw(cardId, { data });
  }
}

function ensureFacing(moverId: string): void {
  const st = useBoardStore.getState();
  const m = st.nodes[moverId];
  if (!m || m.type !== 'image' || !m.src || m.data?.facing || facingInflight.has(moverId)) return;
  facingInflight.add(moverId);
  const image = (typeof m.data?.thumb === 'string' && m.data.thumb) || m.src; // 썸네일이 작아 빠르다
  void analyzeImageFacing(image)
    .then(({ facing, mocked }) => {
      const cur = useBoardStore.getState().nodes[moverId];
      if (!cur) return;
      useBoardStore.getState().updateNodeRaw(moverId, { data: { ...(cur.data ?? {}), facing } });
      if (!mocked && facing !== 'none') {
        hint(`🧭 그림 분석 — 앞이 ${facing === 'left' ? '왼쪽' : '오른쪽'}이에요. 이동 방향에 맞춰 뒤집을게요`);
      }
    })
    .finally(() => facingInflight.delete(moverId));
}

interface Props {
  node: BoardNode;
  selected: boolean;
  left: number;
  top: number;
  presenting: boolean;
  onPointerDown: (e: React.PointerEvent, id: string) => void;
}

export function MotionPathNode({ node, selected, left, top, presenting, onPointerDown }: Props) {
  const aStart = node.data?.aStart as string | undefined;
  const aEnd = node.data?.aEnd as string | undefined;
  // 연결된 카드 구독 — 도착 카드가 움직이면 선이 따라가고, 삭제되면 자유점으로 복귀.
  const startNode = useBoardStore((s) => (aStart ? s.nodes[aStart] : undefined));
  const endNode = useBoardStore((s) => (aEnd ? s.nodes[aEnd] : undefined));
  // 수업 재생 화면 — 보이는 모션 라인 중 몇 번째인지(여러 개면 하단 바를 위로 쌓는다).
  const presIdx = useBoardStore((s) => {
    if (!s.show) return 0;
    const ids = s.show.ids.filter((id) => s.nodes[id]?.type === 'motion');
    return Math.max(0, ids.indexOf(node.id));
  });

  const [playing, setPlaying] = useState(false);
  const [done, setDone] = useState(false);
  // 구간 효과 — 열린 패널(조절점·출발/도착 원 클릭 토글)과 재생 중 말풍선(화면 좌표).
  const [wpOpen, setWpOpen] = useState<null | WpKey>(null);
  // 구간 효과 패널 — 이 모션 노드 바깥(배경·다른 카드)을 클릭하면 닫는다.
  // 같은 라인의 조절점 클릭 토글(열기/닫기)과 겹치지 않게 노드 루트 기준으로 판정.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!wpOpen) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && e.target instanceof Node && rootRef.current.contains(e.target)) return;
      setWpOpen(null);
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, [wpOpen]);
  const [bubble, setBubble] = useState<{ text: string; x: number; y: number } | null>(null);
  const bubbleOn = useRef(false);
  const wpOf = (k: WpKey): Waypoint => (node.data?.[WP_KEY[k]] ?? {}) as Waypoint;
  const hasWp = (k: WpKey): boolean => {
    const w = wpOf(k);
    return (typeof w.speed === 'number' && w.speed !== 1) || !!w.jump || !!(w.msg && w.msg.trim());
  };

  // ── 바운딩 박스 핸들(스케일/회전) → 경로에 굽기 ──
  // 드래그 중에는 루트 transform으로 즉시 보이고, 손을 떼면(변경이 160ms 멈추면)
  // scale/rot 값을 점 좌표(p1·p2·c)에 구워 넣고 1/0으로 리셋한다 — 선이 실제로
  // 커지고(작아지고) 회전하며, 히트 영역·재생 경로도 정확히 따라온다.
  useEffect(() => {
    const s = node.scale ?? 1;
    const r = node.rot ?? 0;
    if (s === 1 && !r) return;
    const t = window.setTimeout(() => {
      const st = useBoardStore.getState();
      const cur = st.nodes[node.id];
      if (!cur) return;
      const s2 = cur.scale ?? 1;
      const r2 = cur.rot ?? 0;
      if (s2 === 1 && !r2) return;
      const cx = cur.w / 2;
      const cy = cur.h / 2;
      const rad = (r2 * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const bake = (p: P): P => {
        const dx = (p.x - cx) * s2;
        const dy = (p.y - cy) * s2;
        return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
      };
      // 도착이 카드에 연결돼 있으면 실제 끝점은 카드 중심(데이터 p2는 자유점일 때 값).
      const aStartId = cur.data?.aStart as string | undefined;
      const aEndId = cur.data?.aEnd as string | undefined;
      const endCard = aEndId ? st.nodes[aEndId] : undefined;
      const endRel = endCard
        ? { x: centerOf(endCard).x - cur.x, y: centerOf(endCard).y - cur.y }
        : getP(cur, 'p2');
      const p1b = bake(getP(cur, 'p1'));
      const p2b = bake(endRel);
      const baked: Record<string, unknown> = {
        ...cur.data,
        p1: p1b,
        p2: p2b,
        c1: bake(getP(cur, 'c1')),
        c2: bake(getP(cur, 'c2')),
      };
      delete baked.c; // 구버전 단일 제어점 정리
      st.updateNodeRaw(node.id, { scale: 1, rot: 0, data: baked });
      // 연결된 출발/도착 카드도 함께 변환 — 중심은 변환된 끝점으로 이동하고,
      // 스케일·회전도 카드에 누적 반영된다(라인과 카드가 한 묶음처럼).
      const applyToCard = (cardId: string | undefined, relPt: P) => {
        if (!cardId) return;
        const card = useBoardStore.getState().nodes[cardId];
        if (!card) return;
        // 임베드 뷰어(3D·동영상·유튜브)는 '고정 UI'라 경로 스케일/회전을 누적하지 않는다 —
        // 패스를 반복해서 키우면 뷰어 scale이 곱셈으로 불어나 거대해지고(예: 9.45×) 자체
        // 리사이즈(w/h)로는 줄지 않던 문제를 막는다. 위치(끝점)만 따라가게 한다.
        const isEmbed = typeof card.data?.embed === 'string';
        const nrot = isEmbed ? (card.rot ?? 0) : (((card.rot ?? 0) + r2 + 540) % 360) - 180;
        const nscale = isEmbed ? (card.scale ?? 1) : Math.max(0.2, Math.round((card.scale ?? 1) * s2 * 100) / 100);
        useBoardStore.getState().updateNodeRaw(cardId, {
          x: Math.round(cur.x + relPt.x - card.w / 2),
          y: Math.round(cur.y + relPt.y - renderHeight(card) / 2),
          scale: nscale,
          rot: Math.round(nrot),
        });
      };
      applyToCard(aStartId, p1b);
      applyToCard(aEndId, p2b);
      normalize(); // 구운 점들로 박스 재계산
    }, 160);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.scale, node.rot]);

  // ── 도착 하트 이펙트 — 만남 지점(도착점)에서 큰 하트 파티클이 팡 터진다 ──
  const [bursts, setBursts] = useState<
    Array<{ id: number; x: number; y: number; parts: Array<{ hx: number; hy: number; hs: number; delay: number; size: number }> }>
  >([]);
  const burstSeq = useRef(0);
  const spawnHearts = (wx: number, wy: number) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cv = document.querySelector('[data-kv-canvas]');
    if (!cv) return;
    const rect = cv.getBoundingClientRect();
    const { zoom, panX, panY } = useBoardStore.getState().viewport;
    const parts = Array.from({ length: 10 }, () => ({
      hx: Math.round((Math.random() - 0.5) * 170),
      hy: -60 - Math.round(Math.random() * 120),
      hs: 1 + Math.random() * 1.2,
      delay: Math.round(Math.random() * 240),
      size: 26 + Math.round(Math.random() * 26), // 큼직한 하트(26~52px)
    }));
    const id = ++burstSeq.current;
    setBursts((b) => [...b, { id, x: rect.left + panX + wx * zoom, y: rect.top + panY + wy * zoom, parts }]);
    window.setTimeout(() => setBursts((b) => b.filter((x) => x.id !== id)), 1800);
  };

  // ── 유휴 자동 숨김 — 마우스가 움직이면 나타나고, 2초 동안 멈추면 선·원·컨트롤이
  //    함께 사라진다(재생 화면이 깨끗해짐). 컨트롤 위에 커서가 머무는 동안은 유지.
  //    숨김 상태에선 살짝 스치는 정도(미세 떨림)로는 안 깨어나고, 누적 이동 거리가
  //    SHOW_DIST(px)를 넘는 '의도적인 움직임'일 때만 다시 나타난다.
  const SHOW_DIST = 100;
  const [chromeVisible, setChromeVisible] = useState(true);
  const visRef = useRef(true);
  const holdRef = useRef(false); // 컨트롤/경로 위 호버 중 — 숨기지 않는다
  const idleTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    let lastX: number | null = null;
    let lastY = 0;
    let acc = 0; // 숨김 이후 누적 이동 거리
    const arm = () => {
      window.clearTimeout(idleTimer.current);
      idleTimer.current = window.setTimeout(() => {
        if (holdRef.current) return;
        visRef.current = false;
        setChromeVisible(false);
      }, 2000);
    };
    const onMove = (e: PointerEvent) => {
      if (lastX !== null) acc += Math.hypot(e.clientX - lastX, e.clientY - lastY);
      lastX = e.clientX;
      lastY = e.clientY;
      if (!visRef.current) {
        if (acc < SHOW_DIST) return; // 미세 움직임 — 아직 숨김 유지
        visRef.current = true;
        setChromeVisible(true);
      }
      acc = 0; // 보이는 동안은 누적 리셋(숨겨진 순간부터 다시 센다)
      arm();
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    arm();
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.clearTimeout(idleTimer.current);
    };
  }, []);
  const holdBind = {
    onPointerEnter: () => {
      holdRef.current = true;
    },
    onPointerLeave: () => {
      holdRef.current = false;
    },
  };
  /** 크롬(선·원·컨트롤) 공통 페이드 스타일. */
  const fade: React.CSSProperties = {
    opacity: chromeVisible ? 1 : 0,
    transition: 'opacity 300ms ease',
    pointerEvents: chromeVisible ? undefined : 'none',
  };
  const playRef = useRef<{
    raf: number;
    t: number;
    dir: 1 | -1;
    last: number;
    lastDeg?: number;
    /** 3D 뷰어용 부드러운 헤딩 — 목표 각도를 점프 대신 초당 일정 속도로 따라간다. */
    headingDeg?: number;
  } | null>(null);
  /** 첫 재생 직전 무버의 회전값 — ↺(처음으로)에서 방향까지 원복하기 위함. */
  const origRotRef = useRef<number | null>(null);
  useEffect(() => () => { if (playRef.current) cancelAnimationFrame(playRef.current.raf); }, []);

  // 드래그 중 연결 카드의 실시간 오프셋 — 카드를 끌면 출발/도착 점이 동시에
  // 따라온다. (라인 자신도 함께 끌리는 중이면 루트가 같이 움직이므로 0.)
  const dragOff = useBoardStore((s) => s.dragging);
  const offFor = (id?: string): P => {
    if (!id || !dragOff || dragOff.ids.includes(node.id) || !dragOff.ids.includes(id))
      return { x: 0, y: 0 };
    return { x: dragOff.dx, y: dragOff.dy };
  };
  const so = offFor(aStart);
  const eo = offFor(aEnd);
  // 상대 좌표(렌더용) — 도착이 카드에 연결돼 있으면 그 카드 중심을 따른다.
  const p1r = getP(node, 'p1');
  const p1 = { x: p1r.x + so.x, y: p1r.y + so.y };
  const c1 = getP(node, 'c1');
  const c2 = getP(node, 'c2');
  const p2r = endNode
    ? { x: centerOf(endNode).x - node.x, y: centerOf(endNode).y - node.y }
    : getP(node, 'p2');
  const p2 = { x: p2r.x + eo.x, y: p2r.y + eo.y };
  // 선 위의 곡선 조절점 둘(t=⅓·⅔) + 컨트롤 위치 기준점(t=½)
  const m1: P = { x: bz(1 / 3, p1.x, c1.x, c2.x, p2.x), y: bz(1 / 3, p1.y, c1.y, c2.y, p2.y) };
  const m2: P = { x: bz(2 / 3, p1.x, c1.x, c2.x, p2.x), y: bz(2 / 3, p1.y, c1.y, c2.y, p2.y) };
  const mid: P = { x: bz(0.5, p1.x, c1.x, c2.x, p2.x), y: bz(0.5, p1.y, c1.y, c2.y, p2.y) };
  const d = `M ${p1.x} ${p1.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${p2.x} ${p2.y}`;

  /** 월드 좌표의 경로 4점 — 재생/스냅용(매 프레임 fresh 상태에서 계산). */
  const worldPoints = () => {
    const st = useBoardStore.getState();
    const cur = st.nodes[node.id];
    if (!cur) return null;
    const e = cur.data?.aEnd ? st.nodes[cur.data.aEnd as string] : undefined;
    const P1 = { x: cur.x + getP(cur, 'p1').x, y: cur.y + getP(cur, 'p1').y };
    const C1 = { x: cur.x + getP(cur, 'c1').x, y: cur.y + getP(cur, 'c1').y };
    const C2 = { x: cur.x + getP(cur, 'c2').x, y: cur.y + getP(cur, 'c2').y };
    const P2 = e ? centerOf(e) : { x: cur.x + getP(cur, 'p2').x, y: cur.y + getP(cur, 'p2').y };
    return { P1, C1, C2, P2 };
  };

  /** 무버 카드 중심을 (px,py)로. */
  const placeMover = (id: string, px: number, py: number) => {
    const st = useBoardStore.getState();
    const m = st.nodes[id];
    if (!m) return;
    st.updateNodeRaw(id, { x: Math.round(px - m.w / 2), y: Math.round(py - renderHeight(m) / 2) });
  };

  /* ---------- 곡선 조절점 드래그 (선 위 ⅓·⅔ 지점 — 각각 독립으로 휜다) ---------- */
  const dragPoint = (key: 'm1' | 'm2') => (e: React.PointerEvent) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    const st0 = useBoardStore.getState();
    const zoom = st0.viewport.zoom;
    if (!st0.nodes[node.id]) return;
    const start = { x: e.clientX, y: e.clientY };
    const init: P = key === 'm1' ? { ...m1 } : { ...m2 };
    // 포인터 캡처 — iframe(3D 뷰어) 위를 지나도 드래그가 끊기지 않는다.
    const capEl = e.currentTarget as Element;
    try {
      capEl.setPointerCapture(e.pointerId);
    } catch {
      /* 합성 이벤트 — 무시 */
    }
    let moved = false; // 5px 데드존 — 살짝 누르면 '클릭'(효과 패널 토글)으로 처리
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 5) return;
      moved = true;
      const nx = init.x + (ev.clientX - start.x) / zoom;
      const ny = init.y + (ev.clientY - start.y) / zoom;
      const st = useBoardStore.getState();
      const cur = st.nodes[node.id];
      if (!cur) return;
      const P1 = getP(cur, 'p1');
      const e2 = cur.data?.aEnd ? st.nodes[cur.data.aEnd as string] : undefined;
      const P2 = e2 ? { x: centerOf(e2).x - cur.x, y: centerOf(e2).y - cur.y } : getP(cur, 'p2');
      // 곡선이 이 점을 지나도록 해당 제어점만 역산(다른 쪽은 고정):
      // 27·B(⅓) = 8P1 + 12C1 + 6C2 + P2 · 27·B(⅔) = P1 + 6C1 + 12C2 + 8P2
      if (key === 'm1') {
        const C2v = getP(cur, 'c2');
        const c1n = {
          x: (27 * nx - 8 * P1.x - 6 * C2v.x - P2.x) / 12,
          y: (27 * ny - 8 * P1.y - 6 * C2v.y - P2.y) / 12,
        };
        st.updateNodeRaw(node.id, { data: { ...cur.data, c1: c1n } });
      } else {
        const C1v = getP(cur, 'c1');
        const c2n = {
          x: (27 * nx - P1.x - 6 * C1v.x - 8 * P2.x) / 12,
          y: (27 * ny - P1.y - 6 * C1v.y - 8 * P2.y) / 12,
        };
        st.updateNodeRaw(node.id, { data: { ...cur.data, c2: c2n } });
      }
    };
    const up = () => {
      try {
        capEl.releasePointerCapture(e.pointerId);
      } catch {
        /* 무시 */
      }
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (!moved) {
        // 클릭 — 이 지점의 효과 패널(구간 속도·점프·말풍선) 토글
        setWpOpen((prev) => (prev === key ? null : key));
        return;
      }
      normalize();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  /** 드래그 후 — 점들의 헐(bbox)로 노드 박스를 다시 감싼다(선택 링·수업 모드 계산용). */
  const normalize = () => normalizeMotionNode(node.id);

  /* ---------- 카드 연결 — 원형 버튼을 카드에 드래그&드롭(분리는 멀리 드래그) ---------- */
  const linkable = (n: BoardNode) =>
    n.id !== node.id && n.type !== 'motion' && n.type !== 'frame' && n.type !== 'runner';
  const isGlb = (n?: BoardNode) =>
    !!n && n.type === 'sticky' && String(n.data?.embed ?? '').includes('glb-viewer');
  const cardLabel = (n: BoardNode) =>
    (((n.data?.title as string) || n.text || '카드').split('\n')[0] || '카드').slice(0, 12);

  /** 연결 해제 — 대기 동작 정리 + 3D 뷰어면 프레젠테이션 모드도 해제. */
  const detachLink = (linkKey: 'aStart' | 'aEnd') => {
    const st = useBoardStore.getState();
    const cur = st.nodes[node.id];
    const prev = cur?.data?.[linkKey] as string | undefined;
    if (!cur || !prev) return;
    const data = { ...cur.data };
    delete data[linkKey];
    st.updateNodeRaw(node.id, { data });
    clearIdle(prev);
    // 3D 뷰어는 출발/도착 어느 쪽이든 분리되면 프레젠테이션 해제
    if (isGlb(st.nodes[prev])) {
      window.dispatchEvent(new CustomEvent('kv:embed-mode', { detail: { target: prev, present: false } }));
    }
  };

  /** 연결 — 출발은 점을 카드 중심에 맞춰(점프 없음) + 방향 분석 + 뷰어 프레젠테이션 ON. */
  const attachLink = (linkKey: 'aStart' | 'aEnd', cardId: string) => {
    const st = useBoardStore.getState();
    const cur = st.nodes[node.id];
    const card = st.nodes[cardId];
    if (!cur || !card) return;
    const otherKey = linkKey === 'aStart' ? 'aEnd' : 'aStart';
    if (cur.data?.[otherKey] === cardId) {
      hint('같은 카드를 출발과 도착에 함께 연결할 수 없어요');
      return;
    }
    if (linkKey === 'aStart') {
      const c = centerOf(card);
      st.updateNodeRaw(node.id, {
        data: { ...cur.data, aStart: cardId, p1: { x: c.x - cur.x, y: c.y - cur.y } },
      });
      ensureFacing(cardId); // 그림의 앞 방향 분석(비동기, 카드에 캐시)
      hint(`'${cardLabel(card)}'를 출발점에 연결했어요`);
    } else {
      st.updateNodeRaw(node.id, { data: { ...cur.data, aEnd: cardId } });
      hint(`'${cardLabel(card)}'를 도착점에 연결했어요 — 선이 카드를 따라다녀요`);
    }
    // 3D 뷰어는 출발/도착 어느 쪽에 연결돼도 자동 프레젠테이션(보드 줌 없음 —
    // NodeView가 모션 연결 카드의 포커스/줌을 생략한다).
    if (isGlb(card)) {
      window.dispatchEvent(new CustomEvent('kv:embed-mode', { detail: { target: cardId, present: true } }));
    }
  };

  /** 출발/도착 원 드래그 — 연결 상태에서 28px 넘게 끌면 분리, 카드 위에 놓으면 연결. */
  const dragEndpoint = (key: 'p1' | 'p2') => (e: React.PointerEvent) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    const linkKey: 'aStart' | 'aEnd' = key === 'p1' ? 'aStart' : 'aEnd';
    const st0 = useBoardStore.getState();
    const zoom = st0.viewport.zoom;
    const cur0 = st0.nodes[node.id];
    if (!cur0) return;
    const linked0 = cur0.data?.[linkKey] ? st0.nodes[cur0.data[linkKey] as string] : undefined;
    const start = { x: e.clientX, y: e.clientY };
    const init: P =
      linked0 && key === 'p2'
        ? { x: centerOf(linked0).x - cur0.x, y: centerOf(linked0).y - cur0.y }
        : getP(cur0, key);
    // 포인터 캡처 — 커서가 iframe(3D 뷰어 등) 위를 지나도 move/up이 계속 들어온다.
    const capEl = e.currentTarget as Element;
    try {
      capEl.setPointerCapture(e.pointerId);
    } catch {
      /* 합성 이벤트 등 — 캡처 불가해도 일반 드래그는 동작 */
    }
    let active = !linked0; // 연결 상태면 분리 임계를 넘긴 뒤부터 점이 따라온다
    let moved = false; // 5px 데드존 — 움직임 없이 떼면 '클릭'(지점 효과 패널 토글)
    const move = (ev: PointerEvent) => {
      const dist = Math.hypot(ev.clientX - start.x, ev.clientY - start.y);
      if (!moved && dist < 5) return;
      moved = true;
      if (!active) {
        if (dist < 28) return;
        active = true;
        detachLink(linkKey);
        hint(
          key === 'p1'
            ? '출발 연결을 해제했어요 — 다른 카드 위에 놓으면 다시 연결돼요'
            : '도착 연결을 해제했어요 — 다른 카드 위에 놓으면 다시 연결돼요',
        );
      }
      const st = useBoardStore.getState();
      const cur = st.nodes[node.id];
      if (!cur) return;
      st.updateNodeRaw(node.id, {
        data: {
          ...cur.data,
          [key]: { x: init.x + (ev.clientX - start.x) / zoom, y: init.y + (ev.clientY - start.y) / zoom },
        },
      });
    };
    const up = () => {
      try {
        capEl.releasePointerCapture(e.pointerId);
      } catch {
        /* 무시 */
      }
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (!moved) {
        // 클릭 — 이 지점(출발/도착)의 효과 패널(구간 속도·점프·말풍선) 토글
        setWpOpen((prev) => (prev === key ? null : key));
        return;
      }
      if (!active) return; // 연결 유지(살짝 움직임)
      // 드롭 지점의 카드에 연결 — 맨 위(z-order) 카드 우선, 어떤 카드든 가능.
      const st = useBoardStore.getState();
      const cur = st.nodes[node.id];
      if (!cur) return;
      const wp = { x: cur.x + getP(cur, key).x, y: cur.y + getP(cur, key).y };
      const target = [...st.order]
        .reverse()
        .map((id) => st.nodes[id])
        .find((n) => {
          if (!n || !linkable(n)) return false;
          const b2 = worldBox(n);
          return wp.x >= b2.x && wp.x <= b2.x + b2.w && wp.y >= b2.y && wp.y <= b2.y + b2.h;
        });
      if (target) attachLink(linkKey, target.id);
      normalize();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  /* ---------- 재생 ---------- */
  const stopPlay = () => {
    if (playRef.current) cancelAnimationFrame(playRef.current.raf);
    playRef.current = null;
    setPlaying(false);
    bubbleOn.current = false;
    setBubble(null);
  };

  const tick = (now: number) => {
    const pr = playRef.current;
    if (!pr) return;
    const st = useBoardStore.getState();
    const cur = st.nodes[node.id];
    const moverId = cur?.data?.aStart as string | undefined;
    if (!cur || !moverId || !st.nodes[moverId]) {
      stopPlay();
      return;
    }
    const dur = BASE_DUR / speedOf(cur); // 슬라이더 배속 — 재생 중에도 즉시 반영
    const dt = (now - pr.last) / 1000; // 이번 프레임 경과(초) — 헤딩 회전 속도 제한에도 사용
    // 구간 속도(웨이포인트) — 지점(출발·조절점·도착) 근처에 들어서면 점차 그 배속으로, 지나면 회복.
    const teNow = ease(clamp01(pr.t));
    let wpFactor = 1;
    for (const k of WP_KEYS) {
      const sp = (cur.data?.[WP_KEY[k]] as Waypoint | undefined)?.speed;
      if (typeof sp === 'number' && sp !== 1) {
        wpFactor *= 1 + (sp - 1) * smooth01(1 - Math.abs(teNow - WP_T[k]) / WP_SPEED_RADIUS);
      }
    }
    pr.t += (dt / dur) * pr.dir * wpFactor;
    pr.last = now;
    const loop = !!cur.data?.loop;
    // 도착 반응 — 이동 요소가 도착 카드에 닿는 순간 둘 다 한 번 통통(NodeView가 수신)
    // + 충돌 지점에서 하트 파티클이 팡.
    const meet = () => {
      const endId = cur.data?.aEnd as string | undefined;
      if (endId && st.nodes[endId]) {
        window.dispatchEvent(new CustomEvent('kv:motion-meet', { detail: { ids: [moverId, endId] } }));
        const wpts = worldPoints();
        if (wpts) spawnHearts(wpts.P2.x, wpts.P2.y);
      }
    };
    if (pr.t >= 1) {
      if (loop) {
        if (pr.dir === 1) meet(); // 왕복 — 도착 시점마다 한 번
        pr.t = 1;
        pr.dir = -1;
      } else {
        pr.t = 1;
      }
    } else if (pr.t <= 0 && pr.dir === -1) {
      pr.t = 0;
      pr.dir = 1;
    }
    const w = worldPoints();
    if (!w) {
      stopPlay();
      return;
    }
    const t = ease(clamp01(pr.t));
    const px = bz(t, w.P1.x, w.C1.x, w.C2.x, w.P2.x);
    const py = bz(t, w.P1.y, w.C1.y, w.C2.y, w.P2.y);
    // 구간 점프 — 지점(출발·조절점·도착) 위를 지날 때 포물선 모양으로 폴짝.
    let jumpOff = 0;
    for (const k of WP_KEYS) {
      const wj = cur.data?.[WP_KEY[k]] as Waypoint | undefined;
      if (wj?.jump) {
        jumpOff = Math.max(jumpOff, WP_JUMP_HEIGHT * smooth01(1 - Math.abs(t - WP_T[k]) / WP_JUMP_RADIUS));
      }
    }
    // 이동 방향(베지어 접선 × 재생 방향) → 플립/회전. 위치와 한 번에 반영.
    const m = st.nodes[moverId];
    const patch: Partial<BoardNode> = {
      x: Math.round(px - m.w / 2),
      y: Math.round(py - jumpOff - renderHeight(m) / 2),
    };
    // 구간 말풍선 — 지점 근처를 지나는 동안 요소 바로 위에 입력한 메시지 표시.
    const msgWp = WP_KEYS
      .map((k) => ({ t0: WP_T[k], w: cur.data?.[WP_KEY[k]] as Waypoint | undefined }))
      .find(({ t0, w: ww }) => typeof ww?.msg === 'string' && ww.msg.trim() && Math.abs(t - t0) < WP_MSG_RADIUS);
    if (msgWp) {
      const cv = document.querySelector('[data-kv-canvas]');
      if (cv) {
        const rect = cv.getBoundingClientRect();
        const { zoom, panX, panY } = st.viewport;
        const topW = py - jumpOff - (renderHeight(m) * (m.scale ?? 1)) / 2 - 28; // 말꼬리 여유
        bubbleOn.current = true;
        setBubble({
          text: msgWp.w!.msg!.trim(),
          x: rect.left + panX + px * zoom,
          y: rect.top + panY + topW * zoom,
        });
      }
    } else if (bubbleOn.current) {
      bubbleOn.current = false;
      setBubble(null);
    }
    const mode = ((cur.data?.flip as FlipMode) ?? 'flip') as FlipMode;
    if (mode !== 'none') {
      // 이동 방향(베지어 접선 × 재생 방향) — 화면 기준 각도용 원시 벡터.
      const u = 1 - t;
      const rvx =
        (3 * u * u * (w.C1.x - w.P1.x) + 6 * u * t * (w.C2.x - w.C1.x) + 3 * t * t * (w.P2.x - w.C2.x)) * pr.dir;
      const rvy =
        (3 * u * u * (w.C1.y - w.P1.y) + 6 * u * t * (w.C2.y - w.C1.y) + 3 * t * t * (w.P2.y - w.C2.y)) * pr.dir;
      const isGlbViewer = m.type === 'sticky' && String(m.data?.embed ?? '').includes('glb-viewer');
      if (isGlbViewer) {
        // 3D 뷰어 카드 — 평면 플립 대신 뷰어 카메라를 이동 방향으로 돌린다
        // (왕복 시 모델이 실제로 돌아서 가는 것처럼 보임). 2° 이상 변할 때만 전송.
        // 모델이 뒷걸음질하면(기본 방향이 반대) [앞 반전] 칩이 180°를 더한다.
        const off = m.data?.headingFlip ? 180 : 0;
        const targetDeg = (Math.atan2(rvy, rvx) * 180) / Math.PI + off;
        // 급회전 방지 — 목표 각도를 점프시키지 않고 TURN_RATE(도/초)로 따라간다
        // (왕복 반전 시 모델이 천천히 자연스럽게 돌아선다).
        if (pr.headingDeg === undefined) {
          pr.headingDeg = targetDeg;
        } else {
          const diff = ((targetDeg - pr.headingDeg + 540) % 360) - 180; // 최단 경로
          const maxStep = TURN_RATE * dt;
          pr.headingDeg += Math.abs(diff) <= maxStep ? diff : Math.sign(diff) * maxStep;
        }
        const deg = pr.headingDeg;
        if (pr.lastDeg === undefined || Math.abs(deg - pr.lastDeg) > 2) {
          pr.lastDeg = deg;
          window.dispatchEvent(new CustomEvent('kv:motion-orient', { detail: { target: moverId, deg } }));
        }
      } else {
        // 그림의 '앞'이 왼쪽인 카드는 기준을 뒤집는다(분석값 data.facing — 기본: 오른쪽).
        const facingSign = m.data?.facing === 'left' ? -1 : 1;
        const vx = rvx * facingSign;
        const vy = rvy * facingSign;
        if (mode === 'flip') {
          // 수직에 가까운 순간의 떨림 방지 — 가로 성분이 충분할 때만 갱신
          if (Math.abs(vx) > 0.01) {
            const flipX = vx < 0;
            if (!!m.data?.flipX !== flipX) patch.data = { ...(m.data ?? {}), flipX };
          }
        } else {
          let deg = (Math.atan2(vy, vx) * 180) / Math.PI;
          let flipX = false;
          if (Math.abs(deg) > 90) {
            // 왼쪽 방향 — 거꾸로 뒤집히지 않게 좌우 반전 + 각도 보정
            flipX = true;
            deg = deg > 0 ? deg - 180 : deg + 180;
          }
          patch.rot = Math.round(deg);
          if (!!m.data?.flipX !== flipX) patch.data = { ...(m.data ?? {}), flipX };
        }
      }
    }
    st.updateNodeRaw(moverId, patch);
    if (!loop && pr.t >= 1) {
      meet(); // 한 번 이동 — 도착 반응
      stopPlay();
      setDone(true);
      return;
    }
    pr.raf = requestAnimationFrame(tick);
  };

  const play = () => {
    if (playing) {
      stopPlay();
      return;
    }
    const st = useBoardStore.getState();
    const cur = st.nodes[node.id];
    const moverId = cur?.data?.aStart as string | undefined;
    if (!moverId || !st.nodes[moverId]) {
      hint('출발 원을 움직일 카드 위에 끌어다 놓으면 연결돼요');
      return;
    }
    setDone(false);
    setPlaying(true);
    ensureFacing(moverId); // 이 기능 이전에 연결된 카드도 첫 재생 때 분석
    if (origRotRef.current === null) origRotRef.current = st.nodes[moverId]?.rot ?? 0;
    playRef.current = { raf: 0, t: 0, dir: 1, last: performance.now() };
    playRef.current.raf = requestAnimationFrame(tick);
  };

  const reset = () => {
    stopPlay();
    setDone(false);
    const st = useBoardStore.getState();
    const cur = st.nodes[node.id];
    const moverId = cur?.data?.aStart as string | undefined;
    const w = worldPoints();
    if (cur && moverId && st.nodes[moverId] && w) {
      placeMover(moverId, w.P1.x, w.P1.y);
      // 방향 원복 — 플립 해제 + 재생 전 회전값으로, 3D 뷰어는 카메라 궤도 원복
      const m = useBoardStore.getState().nodes[moverId];
      if (m) {
        const data = { ...(m.data ?? {}) };
        delete data.flipX;
        st.updateNodeRaw(moverId, { rot: origRotRef.current ?? 0, data });
        window.dispatchEvent(new CustomEvent('kv:motion-orient', { detail: { target: moverId, deg: null } }));
      }
      origRotRef.current = null;
    }
  };

  const setData = (patch: Record<string, unknown>) => {
    const st = useBoardStore.getState();
    const cur = st.nodes[node.id];
    if (cur) st.updateNodeRaw(node.id, { data: { ...cur.data, ...patch } });
  };

  const speedX = speedOf(node);
  const loop = !!node.data?.loop;
  const flipMode = ((node.data?.flip as FlipMode) ?? 'flip') as FlipMode;
  const chip =
    'pointer-events-auto inline-flex items-center gap-t3 rounded-pill border border-border bg-surface/95 px-t7 py-t5 text-4xl font-medium text-fg-2 shadow-sm hover:border-accent hover:text-accent';

  // 핸들 드래그 중 임시 시각 변형(끝나면 위 효과가 점 좌표에 굽고 리셋한다)
  const liveScale = node.scale ?? 1;
  const liveRot = node.rot ?? 0;
  const liveTransform =
    liveScale !== 1 || liveRot
      ? { transform: `rotate(${liveRot}deg) scale(${liveScale})`, transformOrigin: 'center center' }
      : {};

  return (
    <div
      ref={rootRef}
      className="absolute select-none"
      // zIndex — 원형 버튼·컨트롤이 항상 카드/프레임 위에 있어 언제든 연결·분리 가능.
      style={{ left, top, width: node.w, height: node.h, pointerEvents: 'none', zIndex: 25, ...liveTransform }}
    >
      {selected && !presenting && (
        <>
          {/* 점선 테두리는 '보기'만 — 내부 면은 클릭이 통과해 뒤 요소를 선택할 수 있게
              pointer-events:none. 선택·이동은 외곽 EDGE_STRIPS(테두리)와 곡선(모션패스)만 담당. */}
          <div className="absolute -inset-1 rounded-lg border border-dashed border-accent/50" style={{ pointerEvents: 'none' }} />
          {/* 점선 테두리(외곽) 잡고 끌면 라인+연결 카드가 함께 이동(내부는 클릭 통과) */}
          {EDGE_STRIPS.map((pos, i) => (
            <div
              key={i}
              onPointerDown={(e) => onPointerDown(e, node.id)}
              style={{ position: 'absolute', ...pos, pointerEvents: 'auto', cursor: 'grab' }}
              title="드래그해서 이동 — 연결된 카드도 함께 움직여요"
            />
          ))}
        </>
      )}

      <svg
        className="absolute left-0 top-0 overflow-visible"
        width={Math.max(1, node.w)}
        height={Math.max(1, node.h)}
        style={fade}
        {...holdBind}
        aria-hidden
      >
        {/* 안내선(경로) — 수업 발표 중엔 옅게 */}
        <path d={d} fill="none" stroke="var(--accent)" strokeWidth={2} strokeDasharray="7 6" strokeLinecap="round" opacity={presenting ? 0.22 : 0.75} />
        {/* 넓은 히트 영역 — 선을 잡고 노드 전체 이동/선택 */}
        {!presenting && (
          <path
            d={d}
            fill="none"
            stroke="transparent"
            strokeWidth={18}
            style={{ pointerEvents: 'stroke', cursor: 'grab' }}
            onPointerDown={(e) => onPointerDown(e, node.id)}
          />
        )}
        {!presenting && (
          <>
            {/* 출발 원 — 카드 위에 드래그&드롭으로 연결, 연결 상태에서 멀리 끌면 해제.
                클릭(이동 없음) = 이 지점 효과 패널 */}
            {hasWp('p1') && (
              <circle
                cx={p1.x}
                cy={p1.y}
                r={31}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={2.5}
                strokeDasharray="5 5"
                style={{ pointerEvents: 'none' }}
              />
            )}
            <circle
              cx={p1.x}
              cy={p1.y}
              r={22}
              fill={startNode ? 'var(--accent)' : 'var(--surface)'}
              stroke="var(--accent)"
              strokeWidth={2.5}
              style={{ pointerEvents: 'auto', cursor: 'move' }}
              onPointerDown={dragEndpoint('p1')}
            >
              <title>
                {(startNode
                  ? `출발 — '${(startNode.text ?? '카드').split('\n')[0].slice(0, 12)}' 연결됨 (멀리 끌면 해제)`
                  : '출발 — 카드 위에 놓으면 연결돼요') + ' · 클릭 = 지점 효과'}
              </title>
            </circle>
            {/* 시작점 라벨 — '출발' (가독성 위해 흰 후광) */}
            <text
              x={p1.x}
              y={p1.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={16}
              fontWeight={800}
              fill={startNode ? '#fff' : 'var(--accent)'}
              style={{
                pointerEvents: 'none',
                userSelect: 'none',
                paintOrder: 'stroke',
                stroke: startNode ? 'var(--accent)' : 'var(--surface)',
                strokeWidth: 3,
              }}
            >
              출발
            </text>
            {/* 도착 원 — 동일: 드롭=연결 · 멀리 끌면 해제. 연결되면 카드를 따라간다.
                클릭(이동 없음) = 이 지점 효과 패널 */}
            {hasWp('p2') && (
              <circle
                cx={p2.x}
                cy={p2.y}
                r={31}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={2.5}
                strokeDasharray="5 5"
                style={{ pointerEvents: 'none' }}
              />
            )}
            <circle
              cx={p2.x}
              cy={p2.y}
              r={22}
              fill={endNode ? 'var(--accent)' : 'var(--surface)'}
              stroke="var(--accent)"
              strokeWidth={2.5}
              style={{ pointerEvents: 'auto', cursor: 'move' }}
              onPointerDown={dragEndpoint('p2')}
            >
              <title>
                {(endNode
                  ? `도착 — '${(endNode.text ?? '카드').split('\n')[0].slice(0, 12)}' 연결됨 (멀리 끌면 해제)`
                  : '도착 — 카드 위에 놓으면 연결돼요') + ' · 클릭 = 지점 효과'}
              </title>
            </circle>
            {/* 끝점 라벨 — '도착' (가독성 위해 흰 후광) */}
            <text
              x={p2.x}
              y={p2.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={16}
              fontWeight={800}
              fill={endNode ? '#fff' : 'var(--accent)'}
              style={{
                pointerEvents: 'none',
                userSelect: 'none',
                paintOrder: 'stroke',
                stroke: endNode ? 'var(--accent)' : 'var(--surface)',
                strokeWidth: 3,
              }}
            >
              도착
            </text>
            {/* 곡선 조절 점 둘(선 위 ⅓·⅔ 지점) — 각각 드래그해 S자·파도 등 다채로운
                곡선을. 크게 + 근처만 가도 잡히는 넓은 히트 영역 */}
            {([
              { key: 'm1' as const, pt: m1 },
              { key: 'm2' as const, pt: m2 },
            ]).map(({ key, pt }) => (
              <g key={key}>
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={16}
                  fill="var(--accent)"
                  stroke="var(--surface)"
                  strokeWidth={3.5}
                  style={{ pointerEvents: 'none' }}
                />
                {/* 효과가 걸린 지점 표시 — 점선 링 */}
                {hasWp(key) && (
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={25}
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth={2.5}
                    strokeDasharray="5 5"
                    style={{ pointerEvents: 'none' }}
                  />
                )}
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={30}
                  fill="transparent"
                  style={{ pointerEvents: 'auto', cursor: 'grab' }}
                  onPointerDown={dragPoint(key)}
                >
                  <title>드래그 = 곡선 휘기 · 클릭 = 이 지점 효과(구간 속도·점프·말풍선)</title>
                </circle>
              </g>
            ))}
          </>
        )}
      </svg>

      {/* 연결/해제는 원형 버튼 드래그&드롭으로 — 별도 칩 없이 깔끔하게.
          컨트롤 — 가운데 점 아래(라인 기능은 아래, 카드 기능 피커는 카드 위 — 역할 분리).
          출발 카드가 연결되기 전엔 재생할 대상이 없으므로 컨트롤 자체를 숨긴다.
          구간 효과 패널이 열려 있는 동안은 숨겨 화면을 패널에 집중시킨다.
          수업 재생 화면(presenting)에서는 아래 하단 중앙 고정 바가 대신한다. */}
      {!wpOpen && !presenting && !!startNode && (
      <div
        className="pointer-events-auto absolute flex items-center gap-t3 whitespace-nowrap"
        // width: max-content — absolute 요소도 컨테이너 오른쪽까지 남은 공간으로
        // 줄어들어 컨트롤이 세로로 꺾일 수 있다. 항상 콘텐츠 폭(한 줄) 유지.
        style={{ ...fade, left: mid.x, top: mid.y + 38, width: 'max-content', transform: 'translateX(-50%)' }}
        onPointerDown={(e) => e.stopPropagation()}
        {...holdBind}
      >
        <button
          title={playing ? '일시정지' : loop ? '재생 (왕복 반복)' : '재생 — 선을 따라 이동'}
          onClick={(e) => {
            e.stopPropagation();
            play();
          }}
          className="flex h-28 w-28 items-center justify-center rounded-full border border-accent bg-accent text-on-accent shadow-md transition-transform duration-150 ease-soft hover:scale-105"
        >
          {playing ? (
            <svg viewBox="0 0 24 24" width={48} height={48} fill="currentColor" aria-hidden>
              <path d="M7 5h3.4v14H7zM13.6 5H17v14h-3.4z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width={48} height={48} fill="currentColor" aria-hidden>
              <path d="M8.5 5.8v12.4L18.5 12z" />
            </svg>
          )}
        </button>
        {(done || playing || presenting || !!startNode) && (
          <button
            title="처음 위치로"
            onClick={(e) => {
              e.stopPropagation();
              reset();
            }}
            className="flex h-28 w-28 items-center justify-center rounded-full border border-border bg-surface/95 text-fg-2 shadow-md hover:border-accent hover:text-accent"
          >
            <Icon name="history" size={44} />
          </button>
        )}
        {!presenting && (
          <>
            {/* 속도 칩 — 평소엔 "속도 0.70×"로 접혀 있고, 호버하면 슬라이더가 펼쳐진다. */}
            <label
              title="속도 — 마우스를 올리면 슬라이더가 펼쳐져요 (오른쪽일수록 빨라요, 재생 중에도 바로 적용)"
              className={`${chip} group cursor-default`}
              onPointerDown={(e) => e.stopPropagation()}
            >
              속도
              <input
                type="range"
                min={SPEED_MIN}
                max={SPEED_MAX}
                step={0.05}
                value={speedX}
                onChange={(e) => setData({ speedX: Number(e.target.value) })}
                // 접힌 상태에선 -ml-t3가 flex gap 하나를 상쇄해 "속도 0.70×"가 자연스럽게 붙는다.
                className="kv-range-lg w-0 -ml-t3 opacity-0 transition-all duration-200 ease-soft group-hover:w-80 group-hover:ml-0 group-hover:opacity-100"
              />
              <span className="tabular-nums">{speedX < 1 ? speedX.toFixed(2) : speedX.toFixed(1)}×</span>
            </label>
            <button
              title="왕복 반복 켜기/끄기"
              onClick={(e) => {
                e.stopPropagation();
                setData({ loop: !loop });
              }}
              className={`${chip} ${loop ? 'border-accent text-accent' : ''}`}
            >
              왕복
            </button>
            <button
              title={FLIP_TITLE[flipMode]}
              onClick={(e) => {
                e.stopPropagation();
                setData({ flip: NEXT_FLIP[flipMode] });
              }}
              className={`${chip} ${flipMode !== 'none' ? 'border-accent text-accent' : ''}`}
            >
              {FLIP_LABEL[flipMode]}
            </button>
            {/* 3D 뷰어의 '앞' 기준 — 모델이 뒷걸음질하면 클릭 한 번으로 앞뒤 반전 */}
            {startNode && String(startNode.data?.embed ?? '').includes('glb-viewer') && flipMode !== 'none' && (
              <button
                title="모델이 뒷걸음질하면 클릭 — 앞뒤를 뒤집어요 (재생 중에도 바로 적용)"
                onClick={(e) => {
                  e.stopPropagation();
                  const st = useBoardStore.getState();
                  const mv = aStart ? st.nodes[aStart] : undefined;
                  if (!mv) return;
                  st.updateNodeRaw(mv.id, { data: { ...(mv.data ?? {}), headingFlip: !mv.data?.headingFlip } });
                }}
                className={`${chip} ${startNode.data?.headingFlip ? 'border-accent text-accent' : ''}`}
              >
                앞 반전
              </button>
            )}
            {/* 그림의 '앞' 기준 — 자동 분석값 표시 + 클릭으로 직접 보정 */}
            {startNode?.type === 'image' && flipMode !== 'none' && (
              <button
                title="그림의 앞 방향 기준 — 연결할 때 자동 분석돼요. 뒤집힘이 반대면 클릭해서 바꾸세요"
                onClick={(e) => {
                  e.stopPropagation();
                  const st = useBoardStore.getState();
                  const mv = aStart ? st.nodes[aStart] : undefined;
                  if (!mv) return;
                  const next: Facing = (mv.data?.facing as Facing) === 'left' ? 'right' : 'left';
                  st.updateNodeRaw(mv.id, { data: { ...(mv.data ?? {}), facing: next } });
                }}
                className={chip}
              >
                앞{(startNode.data?.facing as Facing) === 'left' ? '←' : '→'}
              </button>
            )}
          </>
        )}
      </div>
      )}

      {/* 수업 재생 화면 — 페이지 내비 자리(하단 중앙)에 고정된 애니메이션 컨트롤 바.
          프롬프트 바(아이콘)의 가로 중심에 정렬. ▶/⏸·처음으로에 더해 속도 슬라이더와
          왕복·플립 등도 여기서 바로 조절한다(내비는 BoardControls가 숨김). */}
      {presenting && (() => {
        const pb = typeof document !== 'undefined' ? document.querySelector('.kv-pbar-vt') : null;
        const pbr = pb ? pb.getBoundingClientRect() : null;
        const lx = pbr ? pbr.left + pbr.width / 2 : window.innerWidth / 2;
        const chipSm =
          'inline-flex items-center gap-t2 rounded-pill border px-t4 py-t2 text-lg font-medium shadow-sm';
        return createPortal(
          <div
            className="pointer-events-auto fixed z-40 -translate-x-1/2"
            style={{ left: lx, bottom: 96 + presIdx * 84 }}
          >
            <div
              className="flex items-center gap-t3 whitespace-nowrap rounded-pill border border-border bg-surface/95 px-t3 py-t2 shadow-lg backdrop-blur"
              style={{ width: 'max-content' }}
            >
              <button
                title={playing ? '일시정지' : loop ? '재생 (왕복 반복)' : '재생 — 선을 따라 이동'}
                onClick={(e) => {
                  e.stopPropagation();
                  play();
                }}
                className="flex h-14 w-14 items-center justify-center rounded-full border border-accent bg-accent text-on-accent shadow-md transition-transform duration-150 ease-soft hover:scale-105"
              >
                {playing ? (
                  <svg viewBox="0 0 24 24" width={26} height={26} fill="currentColor" aria-hidden>
                    <path d="M7 5h3.4v14H7zM13.6 5H17v14h-3.4z" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" width={26} height={26} fill="currentColor" aria-hidden>
                    <path d="M8.5 5.8v12.4L18.5 12z" />
                  </svg>
                )}
              </button>
              <button
                title="처음 위치로"
                onClick={(e) => {
                  e.stopPropagation();
                  reset();
                }}
                className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-surface text-fg-2 shadow-sm hover:border-accent hover:text-accent"
              >
                <Icon name="history" size={24} />
              </button>
              <div className="mx-t1 h-8 w-px bg-border" />
              <label
                title="속도 — 슬라이더로 조절 (재생 중에도 바로 적용)"
                className="flex items-center gap-t2 text-lg font-medium text-fg-2"
              >
                속도
                <input
                  type="range"
                  min={SPEED_MIN}
                  max={SPEED_MAX}
                  step={0.05}
                  value={speedX}
                  onChange={(e) => setData({ speedX: Number(e.target.value) })}
                  className="kv-range-lg w-56"
                />
                <span className="tabular-nums">{speedX < 1 ? speedX.toFixed(2) : speedX.toFixed(1)}×</span>
              </label>
              <button
                title="왕복 반복 켜기/끄기"
                onClick={(e) => {
                  e.stopPropagation();
                  setData({ loop: !loop });
                }}
                className={`${chipSm} ${loop ? 'border-accent text-accent' : 'border-border text-fg-2 hover:border-accent hover:text-accent'} bg-surface`}
              >
                왕복
              </button>
              <button
                title={FLIP_TITLE[flipMode]}
                onClick={(e) => {
                  e.stopPropagation();
                  setData({ flip: NEXT_FLIP[flipMode] });
                }}
                className={`${chipSm} ${flipMode !== 'none' ? 'border-accent text-accent' : 'border-border text-fg-2 hover:border-accent hover:text-accent'} bg-surface`}
              >
                {FLIP_LABEL[flipMode]}
              </button>
              {startNode && String(startNode.data?.embed ?? '').includes('glb-viewer') && flipMode !== 'none' && (
                <button
                  title="모델이 뒷걸음질하면 클릭 — 앞뒤를 뒤집어요"
                  onClick={(e) => {
                    e.stopPropagation();
                    const st = useBoardStore.getState();
                    const mv = aStart ? st.nodes[aStart] : undefined;
                    if (!mv) return;
                    st.updateNodeRaw(mv.id, { data: { ...(mv.data ?? {}), headingFlip: !mv.data?.headingFlip } });
                  }}
                  className={`${chipSm} ${startNode.data?.headingFlip ? 'border-accent text-accent' : 'border-border text-fg-2 hover:border-accent hover:text-accent'} bg-surface`}
                >
                  앞 반전
                </button>
              )}
              {startNode?.type === 'image' && flipMode !== 'none' && (
                <button
                  title="그림의 앞 방향 기준 — 뒤집힘이 반대면 클릭해서 바꾸세요"
                  onClick={(e) => {
                    e.stopPropagation();
                    const st = useBoardStore.getState();
                    const mv = aStart ? st.nodes[aStart] : undefined;
                    if (!mv) return;
                    const next: Facing = (mv.data?.facing as Facing) === 'left' ? 'right' : 'left';
                    st.updateNodeRaw(mv.id, { data: { ...(mv.data ?? {}), facing: next } });
                  }}
                  className={`${chipSm} border-border bg-surface text-fg-2 hover:border-accent hover:text-accent`}
                >
                  앞{(startNode.data?.facing as Facing) === 'left' ? '←' : '→'}
                </button>
              )}
            </div>
          </div>,
          document.body,
        );
      })()}

      {/* 구간 효과 패널 — 조절점 클릭으로 토글. 그 지점의 속도·점프·말풍선 편집 */}
      {wpOpen && !presenting && (() => {
        const key = wpOpen;
        const pt = ({ p1, m1, m2, p2 } as Record<WpKey, P>)[key];
        const wp = wpOf(key);
        const setWp = (patch: Partial<Waypoint>) => setData({ [WP_KEY[key]]: { ...wp, ...patch } });
        const spv = typeof wp.speed === 'number' ? wp.speed : 1;
        return (
          <div
            className="pointer-events-auto absolute z-30 flex flex-col gap-t4 rounded-lg border border-border bg-surface/95 p-t6 shadow-lg backdrop-blur"
            style={{ left: pt.x, top: pt.y - 40, width: 'max-content', transform: 'translate(-50%, -100%)' }}
            onPointerDown={(e) => e.stopPropagation()}
            {...holdBind}
          >
            <div className="flex items-center justify-between gap-t6">
              <span className="text-3xl font-semibold text-fg">이 지점 효과</span>
              <button
                title="닫기"
                onClick={(e) => {
                  e.stopPropagation();
                  setWpOpen(null);
                }}
                className="flex h-14 w-14 items-center justify-center rounded-full text-fg-2 hover:bg-surface-2 hover:text-fg"
              >
                <Icon name="x" size={30} />
              </button>
            </div>
            <label
              className="flex items-center gap-t4 text-3xl font-medium text-fg-2"
              title="이 지점을 지날 때의 속도 — 가까워지면 점차 이 속도가 되고, 지나면 원래 속도로 돌아와요"
            >
              구간 속도
              <input
                type="range"
                min={0.2}
                max={2}
                step={0.1}
                value={spv}
                onChange={(e) => setWp({ speed: Number(e.target.value) })}
                className="kv-range-lg w-96"
              />
              <span className="tabular-nums">{spv.toFixed(1)}×</span>
            </label>
            <div className="flex items-center gap-t4">
              <button
                title="이 지점을 지날 때 요소가 폴짝 점프해요"
                onClick={(e) => {
                  e.stopPropagation();
                  setWp({ jump: !wp.jump });
                }}
                className={`rounded-pill border px-t6 py-t4 text-3xl font-medium shadow-sm ${
                  wp.jump
                    ? 'border-accent bg-accent text-on-accent'
                    : 'border-border bg-surface text-fg-2 hover:border-accent hover:text-accent'
                }`}
              >
                점프
              </button>
              {hasWp(key) && (
                <button
                  title="이 지점의 효과를 모두 지워요"
                  onClick={(e) => {
                    e.stopPropagation();
                    setData({ [WP_KEY[key]]: {} });
                  }}
                  className="rounded-pill border border-border bg-surface px-t6 py-t4 text-3xl font-medium text-fg-2 shadow-sm hover:border-accent hover:text-accent"
                >
                  효과 지우기
                </button>
              )}
            </div>
            <input
              type="text"
              value={wp.msg ?? ''}
              placeholder="이 지점에서 보여줄 말풍선 메시지"
              onChange={(e) => setWp({ msg: e.target.value })}
              onKeyDown={(e) => e.stopPropagation()}
              className="w-full rounded-pill border border-border bg-surface px-t6 py-t4 text-3xl text-fg outline-none placeholder:text-fg-muted focus:border-accent"
            />
          </div>
        );
      })()}

      {/* 구간 말풍선 — 재생 중 해당 지점을 지나는 동안 요소 위에(화면 좌표 포털) */}
      {bubble &&
        createPortal(
          <div
            className="pointer-events-none fixed z-50"
            style={{ left: bubble.x, top: bubble.y, transform: 'translate(-50%, -100%)' }}
          >
            {/* 말풍선 본체 — 둥근 풍선(필) + 코랄 테두리 + 아래 가운데 말꼬리 */}
            <div
              className="relative rounded-pill bg-surface px-t7 py-t5 text-4xl font-semibold text-fg shadow-lg"
              style={{ width: 'max-content', maxWidth: 560, border: '3px solid var(--accent)' }}
            >
              {bubble.text}
              {/* 말꼬리 — 테두리색 삼각형 위에 표면색 삼각형을 겹쳐 외곽선까지 표현 */}
              <div
                className="absolute left-1/2 -translate-x-1/2"
                style={{
                  bottom: -21,
                  width: 0,
                  height: 0,
                  borderLeft: '17px solid transparent',
                  borderRight: '17px solid transparent',
                  borderTop: '21px solid var(--accent)',
                }}
              />
              <div
                className="absolute left-1/2 -translate-x-1/2"
                style={{
                  bottom: -15,
                  width: 0,
                  height: 0,
                  borderLeft: '13px solid transparent',
                  borderRight: '13px solid transparent',
                  borderTop: '16px solid var(--surface)',
                }}
              />
            </div>
          </div>,
          document.body,
        )}

      {/* 도착 하트 이펙트 — 만남 지점 화면 좌표에 포털로(파티클은 CSS 키프레임) */}
      {bursts.map((bu) =>
        createPortal(
          <div key={bu.id} className="pointer-events-none fixed z-50" style={{ left: bu.x, top: bu.y }}>
            {bu.parts.map((p, i) => (
              <svg
                key={i}
                viewBox="0 0 24 24"
                width={p.size}
                height={p.size}
                fill="currentColor"
                aria-hidden
                className="kv-heart absolute"
                style={
                  {
                    left: -p.size / 2,
                    top: -p.size / 2,
                    color: 'var(--accent)',
                    animationDelay: `${p.delay}ms`,
                    '--hx': `${p.hx}px`,
                    '--hy': `${p.hy}px`,
                    '--hs': String(p.hs),
                  } as React.CSSProperties
                }
              >
                <path d="M12 21s-6.7-4.3-9.3-8C.8 10.2 2 6.3 5.4 5.3c2-.6 4.1.2 5.3 1.9.5.7.8 1.3 1.3 1.3s.8-.6 1.3-1.3c1.2-1.7 3.3-2.5 5.3-1.9 3.4 1 4.6 4.9 2.7 7.7C18.7 16.7 12 21 12 21z" />
              </svg>
            ))}
          </div>,
          document.body,
        ),
      )}
    </div>
  );
}
