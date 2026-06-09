/* ───────────────────────────────────────────────────────────────────────────
   DEV-ONLY 성능 측정 도구 (My Board 성능 개선 작업 Phase 1)

   ⚠️ 이 파일은 개발 빌드에서만 로드된다. main.tsx에서
      `if (import.meta.env.DEV) import('./dev/perfTools')`
   로 동적 import 되며, 프로덕션 빌드에서는 Vite가 통째로 트리셰이킹한다.
   프로덕션 컴포넌트 트리/렌더 경로는 전혀 건드리지 않는다(전부 부가 기능).

   ── 사용법 (개발 모드, 브라우저 콘솔) ──────────────────────────────────────
   1) 시드: 더미 보드(500개) 생성 후 자동 전환
        __kvSeedPerf()        // 기본 500개 (이미지 250 + 스티키/텍스트/도형 250)
        __kvSeedPerf(1000)    // 개수 지정
      → 4000×3000 좌표 범위에 분산. 기존 보드와 분리된 새 테스트 보드에 들어감.
        보드 전환기(BoardSwitcher)에서 "⚡ Perf …" 보드로 표시된다.

   2) FPS 오버레이: 우상단에 실시간 FPS 표시 (requestAnimationFrame 기반)
        __kvFps(true)         // 켜기
        __kvFps(false)        // 끄기
        __kvFps()             // 토글
      또는 URL 쿼리로 자동 시작:  http://localhost:5173/board?fps=1

   3) 베이스라인 측정 절차는 docs/perf-baseline.md 참조.
   ─────────────────────────────────────────────────────────────────────────── */

import { useBoardStore, newId, type BoardNode, type BoardSnapshot } from '@/store/boardStore';
import { useBoardsStore } from '@/store/boardsStore';

/* ── 더미 이미지 data URI 생성 ──────────────────────────────────────────────
   실제 이미지 카드는 base64 data URI(node.src)를 쓰므로, 측정이 현실적이려면
   더미도 같은 형태여야 한다(디코드·메모리 비용 재현). 400×300 JPEG로 생성. */
function makeImageDataUri(i: number): string {
  const cv = document.createElement('canvas');
  cv.width = 400;
  cv.height = 300;
  const ctx = cv.getContext('2d');
  if (!ctx) return '';
  const hue = (i * 47) % 360;
  ctx.fillStyle = `hsl(${hue} 60% 70%)`;
  ctx.fillRect(0, 0, 400, 300);
  ctx.fillStyle = `hsl(${(hue + 180) % 360} 70% 35%)`;
  ctx.font = 'bold 96px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(i), 200, 150);
  // JPEG 0.72 → 카드당 ~10–20KB 수준의 현실적인 페이로드
  return cv.toDataURL('image/jpeg', 0.72);
}

const STICKY_COLORS = ['accent-soft', 'surface-3', 'gold', 'success-soft'];

/* 4000×3000 범위에 결정론적으로 분산(시드값 기반 → 재현 가능). */
function scatter(i: number, n: number): { x: number; y: number } {
  // 격자 + 지터로 고르게 흩뿌린다.
  const cols = Math.ceil(Math.sqrt(n));
  const gx = i % cols;
  const gy = Math.floor(i / cols);
  const cellW = 4000 / cols;
  const cellH = 3000 / Math.ceil(n / cols);
  const jitter = (seed: number) => ((Math.sin(seed * 12.9898) * 43758.5453) % 1) * 0.6;
  return {
    x: Math.round(gx * cellW + jitter(i + 1) * cellW),
    y: Math.round(gy * cellH + jitter(i + 7) * cellH),
  };
}

function buildPerfSnapshot(count: number): BoardSnapshot {
  const imageCount = Math.floor(count / 2);
  const nodes: Record<string, BoardNode> = {};
  const order: string[] = [];

  // 이미지 카드 (count/2개)
  for (let i = 0; i < imageCount; i++) {
    const { x, y } = scatter(i, count);
    const id = newId('image');
    nodes[id] = { id, type: 'image', x, y, w: 220, h: 160, src: makeImageDataUri(i), text: `img ${i}` };
    order.push(id);
  }

  // 스티키 / 텍스트 / 도형 (나머지)
  for (let i = imageCount; i < count; i++) {
    const { x, y } = scatter(i, count);
    const id = newId('perf');
    const mod = i % 3;
    if (mod === 0) {
      nodes[id] = { id, type: 'sticky', x, y, w: 200, h: 150, text: `sticky ${i}`, color: STICKY_COLORS[i % STICKY_COLORS.length] };
    } else if (mod === 1) {
      nodes[id] = { id, type: 'text', x, y, w: 240, h: 60, text: `텍스트 노드 ${i}` };
    } else {
      nodes[id] = { id, type: 'shape', x, y, w: 160, h: 120, color: STICKY_COLORS[i % STICKY_COLORS.length] };
    }
    order.push(id);
  }

  return { nodes, order, lanes: {}, laneOrder: [], viewport: { zoom: 1, panX: 0, panY: 0 } };
}

/* 더미 보드를 만들고 활성화한다. 공개 store API만 사용(스키마 변경 없음). */
function seedPerf(count = 500): string {
  const t0 = performance.now();
  const snap = buildPerfSnapshot(count);
  const id = useBoardsStore.getState().createBoard('general', `⚡ Perf ${count}`);
  useBoardStore.getState().loadSnapshot(snap);
  useBoardsStore.getState().saveActiveLive(); // 라이브 → 스냅샷으로 영속(보드 전환해도 유지)
  // 전체가 한눈에 보이도록 맞춤
  useBoardStore.getState().fit();
  // eslint-disable-next-line no-console
  console.info(`[perf] seeded ${count} nodes in ${Math.round(performance.now() - t0)}ms → board ${id}`);
  return id;
}

/* ── FPS 오버레이 (vanilla DOM, 프로덕션 컴포넌트 트리에 손대지 않음) ──────── */
let fpsRafId: number | null = null;
let fpsEl: HTMLDivElement | null = null;

function fpsOn(): void {
  if (fpsRafId !== null) return;
  if (!fpsEl) {
    fpsEl = document.createElement('div');
    fpsEl.id = '__kv_fps';
    Object.assign(fpsEl.style, {
      position: 'fixed',
      top: '8px',
      right: '8px',
      zIndex: '99999',
      padding: '4px 8px',
      font: '600 12px/1.2 ui-monospace, monospace',
      color: '#fff',
      background: 'rgba(0,0,0,0.7)',
      borderRadius: '6px',
      pointerEvents: 'none',
      whiteSpace: 'pre',
    } as CSSStyleDeclaration);
    document.body.appendChild(fpsEl);
  }
  fpsEl.style.display = 'block';

  let frames = 0;
  let last = performance.now();
  let min = Infinity;
  let worst = Infinity; // 최근 1초 창의 최저
  const loop = () => {
    frames++;
    const now = performance.now();
    if (now - last >= 500) {
      const fps = Math.round((frames * 1000) / (now - last));
      min = Math.min(min, fps);
      worst = fps < worst ? fps : worst;
      if (fpsEl) fpsEl.textContent = `FPS ${fps}\nmin ${min === Infinity ? '-' : min}`;
      frames = 0;
      last = now;
      worst = Infinity;
    }
    fpsRafId = requestAnimationFrame(loop);
  };
  fpsRafId = requestAnimationFrame(loop);
  // eslint-disable-next-line no-console
  console.info('[perf] FPS overlay ON');
}

function fpsOff(): void {
  if (fpsRafId !== null) {
    cancelAnimationFrame(fpsRafId);
    fpsRafId = null;
  }
  if (fpsEl) fpsEl.style.display = 'none';
  // eslint-disable-next-line no-console
  console.info('[perf] FPS overlay OFF');
}

function fpsToggle(on?: boolean): void {
  const next = on ?? fpsRafId === null;
  if (next) fpsOn();
  else fpsOff();
}

/* ── 등록 ──────────────────────────────────────────────────────────────────── */
declare global {
  interface Window {
    __kvSeedPerf?: (count?: number) => string;
    __kvFps?: (on?: boolean) => void;
  }
}

window.__kvSeedPerf = seedPerf;
window.__kvFps = fpsToggle;

// ?fps=1 쿼리로 자동 시작
if (new URLSearchParams(window.location.search).has('fps')) {
  fpsOn();
}

// eslint-disable-next-line no-console
console.info('[perf] dev tools ready — __kvSeedPerf(500), __kvFps(true)');

export {};
