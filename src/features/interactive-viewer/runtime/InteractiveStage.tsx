/**
 * 인터렉티브 노드 런타임 — 논리 캔버스를 등비로 렌더하고, 편집(선택·다중선택·이동·리사이즈·드롭)과
 * 재생(탭→반응/교체)을 한 컴포넌트가 담당. 보드 카드 미리보기·풀스크린·수업 모드
 * 어댑터가 모두 이 컴포넌트를 공유한다(단일 런타임).
 */
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { AssetRef, Behavior, Condition, Connection, ElementNode, InteractiveNode } from '../schema/interactiveNode';
import { useStageFit } from './useStageFit';
import { cancelAnimations, runAnimate } from './behaviors';
import { speakText, stopSpeaking } from './speak';
import { ElementSelectionBox } from './ElementSelectionBox';
import { clampXY } from './geometry';
import { loadActorSide } from '../store/actorPoses';
import { linkSequence, compareLabels } from '@/board/links';
import { Icon } from '@/lib/icons';
import './inode.css';

/** 레인 한 칸의 논리 폭(px). 노드는 넓은 캔버스의 LANE_W px x-밴드들로 구성된다(모델 2 무한 성장).
    composeNode의 CANVAS.w(1280)와 일치 — 한 레인 = 기존 단일 캔버스 한 장. */
const LANE_W = 1280;

/** goToScene.params.sceneId(문자열 Id)를 목표 레인 인덱스로 해석.
    규약: sceneId는 십진수 레인 번호 문자열('0','1',…). 숫자가 아니면 끝의 숫자, 없으면 0. */
function laneFromSceneId(sceneId: string): number {
  const n = Number(sceneId);
  if (Number.isFinite(n)) return n;
  const m = /(\d+)/.exec(sceneId);
  return m ? Number(m[1]) : 0;
}

const COLOR_TOKENS: Record<string, string> = {
  'pastel.cream': 'var(--ic-cream)',
  'pastel.coral': 'var(--ic-coral)',
  'pastel.mint': 'var(--ic-mint)',
  'pastel.sky': 'var(--ic-sky)',
  'pastel.peach': 'var(--ic-bg-peach)',
};

function isAssetRef(bg: InteractiveNode['canvas']['background']): bg is AssetRef {
  return typeof bg === 'object' && bg !== null && 'src' in bg;
}
/** 실제로 그릴 수 있는 이미지 배경 src만 — 미해결 "gen:" 라벨/비-URL 은 제외(깨진 img 방지). */
function bgImageSrc(bg: InteractiveNode['canvas']['background']): string | null {
  return isAssetRef(bg) && /^(data:|https?:|blob:)/.test(bg.src) ? bg.src : null;
}
function bgColor(c: string): string {
  return COLOR_TOKENS[c] ?? c;
}
/** 완료 축하 색종이 색(파스텔, 아이 친화). */
const CONFETTI_COLORS = ['#F2A65A', '#7FB77E', '#5BA4CF', '#E58B8B', '#F2C94C', '#B98ED6'];

/** 캐릭터 이미지가 향하는 방향(좌/우) 추정 — '머리(상단)' 영역의 가로중심이 몸 전체 중심보다
    왼쪽이면 왼쪽을 향한 것으로 본다(머리가 향하는 쪽을 이끈다). 이동 시 이 방향의 반대로 가면 좌우 반전. */
function detectFacing(img: HTMLImageElement): 'left' | 'right' | 'front' {
  try {
    const W = 72;
    const H = 72;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const x = c.getContext('2d');
    if (!x) return 'front';
    x.drawImage(img, 0, 0, W, H);
    const d = x.getImageData(0, 0, W, H).data;
    let minY = H;
    let maxY = 0;
    let fullSum = 0;
    let fullN = 0;
    for (let yy = 0; yy < H; yy++)
      for (let xx = 0; xx < W; xx++)
        if (d[(yy * W + xx) * 4 + 3] > 40) {
          fullSum += xx;
          fullN++;
          if (yy < minY) minY = yy;
          if (yy > maxY) maxY = yy;
        }
    if (fullN < 20) return 'front';
    const fullCx = fullSum / fullN;
    const headBottom = minY + (maxY - minY) * 0.42; // 상단 42% = 머리 영역
    let headSum = 0;
    let headN = 0;
    for (let yy = minY; yy <= headBottom; yy++)
      for (let xx = 0; xx < W; xx++)
        if (d[(yy * W + xx) * 4 + 3] > 40) {
          headSum += xx;
          headN++;
        }
    if (!headN) return 'front';
    const diff = headSum / headN - fullCx;
    if (Math.abs(diff) < W * 0.08) return 'front'; // 머리가 가운데 ≈ 정면 → 좌우 플립 안 함
    return diff < 0 ? 'left' : 'right';
  } catch {
    return 'front';
  }
}

/** 이동 방향으로 바라보게 — scaleX 부호(1/−1)를 낸다. 캐릭터의 자연 facing을 기준 삼되,
    측면 포즈는 '오른쪽 향함'으로 생성하므로 facing이 'front'이거나 감지 실패여도 base='right'로
    가정해 '항상' 이동 방향으로 플립한다(대칭이면 안 보여 무해, 측면이면 올바른 방향으로 향함).
    세로 이동만(가로 변화 없음)이면 직전 방향을 유지한다. */
function flipFor(
  facing: 'left' | 'right' | 'front' | undefined,
  moveDir: 'left' | 'right' | null,
  prevF: 1 | -1,
): 1 | -1 {
  if (!moveDir) return prevF;
  const base = facing === 'left' ? 'left' : 'right'; // front·undefined·right → 'right' 기준(측면 포즈 생성 방향)
  return moveDir === base ? 1 : -1;
}

type Box = { x: number; y: number; w: number; h: number };

/** 글자 요소 — 바운드박스(w×h)에 맞춰 폰트 크기를 자동으로 키우/줄여 채운다(반응형).
 *  이진 탐색으로 가로·세로 모두 넘치지 않는 최대 폰트를 찾는다. w/h/text 변할 때마다 재계산. */
function FitText({ text, w, h }: { text: string; w: number; h: number }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const spanRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const box = boxRef.current;
    const span = spanRef.current;
    if (!box || !span) return;
    const availW = box.clientWidth;
    const availH = box.clientHeight;
    if (availW <= 0 || availH <= 0) return;
    let lo = 6;
    let hi = Math.max(8, availH);
    let best = lo;
    for (let i = 0; i < 11; i++) {
      const mid = (lo + hi) / 2;
      span.style.fontSize = `${mid}px`;
      const fits = span.scrollWidth <= availW + 0.5 && span.scrollHeight <= availH + 0.5;
      if (fits) {
        best = mid;
        lo = mid;
      } else {
        hi = mid;
      }
    }
    span.style.fontSize = `${best}px`;
  }, [text, w, h]);
  return (
    <div ref={boxRef} className="ic-text">
      <span ref={spanRef} className="ic-text-span">
        {text}
      </span>
    </div>
  );
}

/** 이미지 다운로드(마이보드 downloadImage와 동일) — 파일명 안전화. */
function downloadImageUrl(src: string, name?: string): void {
  const a = document.createElement('a');
  a.href = src;
  a.download = `${(name || 'kinderverse').replace(/[\\/:*?"<>|]/g, '_')}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

interface Props {
  doc: InteractiveNode;
  mode: 'play' | 'edit';
  selectedElIds?: string[];
  /** 선택 변경 — additive(shift)는 호출부가 토글해 넘긴다. */
  onSelectEls?: (ids: string[]) => void;
  /** 여러 요소를 한 번에(dx,dy) 이동(한 undo 단계). */
  onMoveElements?: (ids: string[], dx: number, dy: number) => void;
  onResizeElement?: (elId: string, patch: Box) => void;
  /** 회전 커밋(도, 0~359). */
  onRotateElement?: (elId: string, rotation: number) => void;
  /** 글자 더블클릭 인라인 편집 커밋. */
  onEditText?: (elId: string, text: string) => void;
  /** 이미지 요소 호버 액션 — 마이보드 카드와 동일(편집 모달 / 풀스크린). origin = 화면 사각형. */
  onEditImage?: (elId: string, origin: { x: number; y: number; w: number; h: number }) => void;
  onFullscreenImage?: (elId: string, origin: { x: number; y: number; w: number; h: number }) => void;
  /** 포트 드래그로 두 요소 연결(from→to). */
  onAddConnection?: (from: string, to: string) => void;
  /** 연결선 클릭 해제. */
  onRemoveConnection?: (id: string) => void;
  /** 포트 떼어내기로 연결 끝을 다른 요소로 옮김(한 undo 단계). */
  onRelinkConnection?: (id: string, from: string, to: string) => void;
  onDropFiles?: (files: File[], at: { x: number; y: number }) => void;
  /** 활동 완료(이야기 마지막·순서 게임 완료) — 수업 슬라이드 자동 넘김 등에 사용. */
  onComplete?: () => void;
  /** play 리셋/모드 전환 시 애니메이션·교체 상태 원복. */
  resetNonce?: number;
  /** 미리보기 — 상호작용 차단(보드 카드 썸네일). */
  preview?: boolean;
}

export function InteractiveStage({
  doc,
  mode,
  selectedElIds = [],
  onSelectEls,
  onMoveElements,
  onResizeElement,
  onRotateElement,
  onEditText,
  onEditImage,
  onFullscreenImage,
  onAddConnection,
  onRemoveConnection,
  onRelinkConnection,
  onDropFiles,
  onComplete,
  resetNonce = 0,
  preview = false,
}: Props) {
  const cw = doc.canvas.size.w;
  const ch = doc.canvas.size.h;
  // 레인 = 넓은 캔버스의 LANE_W px x-밴드(모델 2). 화면엔 한 번에 한 레인만 맞춘다.
  const laneCount = Math.max(1, Math.round(cw / LANE_W));
  const laneW = cw / laneCount; // 보통 1280. 비정수 단일 폭 노드는 전체 폭(하위호환).
  // 가로 카메라 — cameraAnim=보간된 표시 레인(부동). cameraLaneRef=확정 목표. 0이면 기존과 동일.
  const [cameraAnim, setCameraAnim] = useState(0);
  const cameraLaneRef = useRef(0);
  const camTokenRef = useRef(0);
  const { ref: stageBoxRef, scale, box } = useStageFit(laneW, ch, preview ? 6 : 24);
  // 한 레인을 무대 안에서 가운데로(레터박스) + 카메라 오프셋(보이는 레인 선택).
  // translate를 직접 계산(거대 박스를 grid가 중앙정렬 못 하는 문제 회피).
  const tx = Math.max(0, (box.w - laneW * scale) / 2) - cameraAnim * laneW * scale;
  const ty = Math.max(0, (box.h - ch * scale) / 2);

  // 카메라 상태 미러(안정 핸들러가 최신값을 ref로 읽음).
  const cameraAnimRef = useRef(0);
  useEffect(() => { cameraAnimRef.current = cameraAnim; }, [cameraAnim]);
  const laneCountRef = useRef(1);
  useEffect(() => { laneCountRef.current = laneCount; }, [laneCount]);

  // 레인 카메라 패닝 — slideFrameToEmpty(workflow.ts)의 rAF+cubic-out 패턴을 로컬 복제.
  // ⚠ MyBoard 전역 viewport는 만지지 않는다(노드 로컬 카메라 전용).
  const panToLane = useCallback((target: number, animated = true) => {
    const max = Math.max(0, laneCountRef.current - 1);
    const to = Math.max(0, Math.min(max, Math.round(target)));
    cameraLaneRef.current = to;
    const from = cameraAnimRef.current;
    const token = ++camTokenRef.current;
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !animated || Math.abs(to - from) < 0.001) {
      cameraAnimRef.current = to;
      setCameraAnim(to);
      return;
    }
    const dur = Math.min(700, Math.max(300, Math.abs(to - from) * 460));
    const t0 = performance.now();
    const ease = (p: number) => 1 - Math.pow(1 - p, 3); // cubic-out
    const tick = (now: number) => {
      if (token !== camTokenRef.current) return; // 새 패닝/리셋이 시작되면 취소
      const p = Math.min(1, (now - t0) / dur);
      const v = from + (to - from) * ease(p);
      cameraAnimRef.current = v;
      setCameraAnim(v);
      if (p < 1) requestAnimationFrame(tick);
      else {
        cameraAnimRef.current = to;
        setCameraAnim(to);
      }
    };
    requestAnimationFrame(tick);
  }, []);

  // 재생 리셋·모드 전환 시 첫 레인으로 즉시 복귀(진행 중 패닝 취소). N=1은 0→0 무변화.
  useEffect(() => {
    camTokenRef.current++;
    cameraLaneRef.current = 0;
    cameraAnimRef.current = 0;
    setCameraAnim(0);
  }, [resetNonce, mode]);

  // 외부(확장 등)에서 특정 레인으로 패닝 요청 — 노드 로컬 카메라만 움직인다(전역 viewport 미사용).
  // 미리보기 썸네일은 무시(보드 카드).
  useEffect(() => {
    if (preview) return;
    const onGoto = (e: Event) => {
      const d = (e as CustomEvent).detail as { docId?: string; lane?: number } | null;
      if (!d || d.docId !== doc.id || typeof d.lane !== 'number') return;
      panToLane(d.lane);
    };
    window.addEventListener('kv:inode-goto-lane', onGoto as EventListener);
    return () => window.removeEventListener('kv:inode-goto-lane', onGoto as EventListener);
  }, [doc.id, preview, panToLane]);

  const canvasRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const innerRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const dragInfo = useRef<{ ids: string[]; origs: Record<string, { x: number; y: number }>; sx: number; sy: number; sc: number; dx: number; dy: number } | null>(null);
  const [drag, setDrag] = useState<{ ids: string[]; origs: Record<string, { x: number; y: number }>; dx: number; dy: number } | null>(null);
  const resizeInfo = useRef<{ id: string; ax: number; ay: number; rect: DOMRect; box: Box; theta: number; cx: number; cy: number } | null>(null);
  const [resize, setResize] = useState<(Box & { id: string }) | null>(null);
  // 회전(라이브 미리보기 + 커밋) — 마이보드 회전 핸들과 동일 수식.
  const rotateInfo = useRef<{ id: string; cx: number; cy: number; rect: DOMRect; startRot: number; startAng: number; deg: number } | null>(null);
  const [rotate, setRotate] = useState<{ id: string; deg: number } | null>(null);
  const [swapped, setSwapped] = useState<Record<string, boolean>>({});
  const [dropping, setDropping] = useState(false);
  // ── 재생 런타임 상태(동작 엔진) — 카운터/플래그/숨김/강조/말풍선 ──
  const [counters, setCounters] = useState<Record<string, number>>({});
  const [, setFlags] = useState<Record<string, boolean>>({});
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [highlighted, setHighlighted] = useState<Record<string, string>>({});
  const [bubbles, setBubbles] = useState<Record<string, string>>({});
  // 숨바꼭질/추측 연출 — peek 플래그가 있으면 대상 아랫부분을 '풀 속에 잠긴 듯' 가리고, 탭하면 전신 공개.
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  // 수집형(줍기/찾기) — 액터가 도착해 '획득'한 아이템 id(획득 순). 제자리에서 사라져 중앙 트레이로 정렬된다.
  const [collected, setCollected] = useState<string[]>([]);
  // 주인공 2포즈 — 시작/끝(집)은 정면(메인 src), 이동 중엔 측면 포즈(있으면). actorAtHome=집에 있나.
  const [actorSidePose, setActorSidePose] = useState<string | null>(null);
  const [actorAtHome, setActorAtHome] = useState(true);
  // 대기 애니메이션(Idle) — 정지 상태(시작·이동후 대기·완료)에 살짝 숨쉬듯. 이동 중엔 끈다.
  const [actorMoving, setActorMoving] = useState(false);
  // 탭/찾기 이펙트 — 작은 파티클 버스트(과하지 않게, 자동 소멸).
  const [bursts, setBursts] = useState<Array<{ id: number; x: number; y: number }>>([]);
  const burstSeq = useRef(0);
  // applyAction(파티클 정의보다 먼저 선언)에서 버스트를 쏘기 위한 최신 핸들러 ref.
  const fireBurstRef = useRef<(x: number, y: number) => void>(() => {});
  // 게임 완료 축하 — 색종이(컨페티) 오버레이를 잠깐 띄운다.
  const [celebrating, setCelebrating] = useState(false);
  // 이야기(story) 재생 — 현재 단계(없으면 null). 나레이션 바 + 다음/이전.
  const [storyIdx, setStoryIdx] = useState<number | null>(null);
  // 조건 평가용 동기 미러(체이닝 중 최신값 읽기) + 리셋 토큰(지연/체인 취소).
  const countersRef = useRef<Record<string, number>>({});
  const flagsRef = useRef<Record<string, boolean>>({});
  const runToken = useRef(0);
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  // moveAlongPath 누적 오프셋(요소별) — '가서 머무름'으로 다음 이동이 현재 위치에서 이어지게.
  const moveOffset = useRef<Record<string, { x: number; y: number }>>({});
  // 캐릭터가 향하는 자연 방향(이미지 분석: 좌/우/정면) + 현재 좌우 반전(1/-1) — 측면 캐릭터만 이동 방향으로 플립.
  const actorFacingRef = useRef<Record<string, 'left' | 'right' | 'front'>>({});
  const flipRef = useRef<Record<string, 1 | -1>>({});
  // 글자 더블클릭 인라인 편집 / 호버 시 연결 포트(hoverElId) / 연결 드래그 중 임시 선(linking).
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [hoverElId, setHoverElId] = useState<string | null>(null);
  const [linking, setLinking] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  // 연결 드래그 상태기계 — 마이보드와 동일: 'new'=빈 포트에서 새 연결, 'detach'=연결된 포트를
  // 떼어내 분리/옮기기. from=고정(반대) 끝, keepFrom=고정 끝이 연결의 from인지.
  const lk = useRef<{ mode: 'new' | 'detach'; from: string; x1: number; y1: number; connId?: string; keepFrom?: boolean } | null>(null);
  const linkRectRef = useRef<DOMRect | null>(null);
  // 재생: pathTraverse(끌어서 잇기) — 요소를 연결된 상대 위로 끌면 발화. 놓으면 제자리로.
  const pathInfo = useRef<{ id: string; behId: string; rect: DOMRect; sx: number; sy: number; orig: { x: number; y: number } } | null>(null);
  const textEditRef = useRef<HTMLTextAreaElement>(null);

  const selSet = useMemo(() => new Set(selectedElIds), [selectedElIds]);
  const sorted = useMemo(() => [...doc.elements].sort((a, b) => a.transform.z - b.transform.z), [doc.elements]);
  // 연결 순번 라벨(1, 1-1, 2 …) — 마이보드와 동일 규칙(@/board/links 재사용).
  const linkLabels = useMemo(() => linkSequence(doc.connections), [doc.connections]);
  // 시작 시 숨김(sceneEnter hide) 대상 = '승리/피드백 오버레이' 후보 — 이 요소가 reveal되면 완료로 본다.
  const hiddenAtStartIds = useMemo(() => {
    const s = new Set<string>();
    for (const b of doc.behaviors) if (b.action === 'hide' && b.trigger === 'sceneEnter') b.params.targets.forEach((t) => s.add(t));
    return s;
  }, [doc.behaviors]);
  // peek(숨바꼭질) 모드 — flags 에 'peek' 가 있으면 켜짐. 탭 대상들을 '풀 속에 숨은' 마스크로 가린다.
  const peekMode = useMemo(() => (doc.flags ?? []).some((f) => f.id === 'peek'), [doc.flags]);
  const peekIds = useMemo(() => {
    const s = new Set<string>();
    if (peekMode) for (const b of doc.behaviors) if (b.trigger === 'tap' || b.trigger === 'sequenceTap') s.add(b.target);
    return s;
  }, [peekMode, doc.behaviors]);

  // 🔴 드래그/리사이즈 핸들러가 매 렌더 새 identity가 되면, 선택 직후 인스펙터 마운트로 인한
  //    리렌더의 cleanup이 방금 붙인 window 리스너를 떼어내 드래그가 즉시 죽는다. 가변값을
  //    ref로 읽어 핸들러를 영구 고정한다(리스너는 pointerup·언마운트에서만 제거).
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const onMoveRef = useRef(onMoveElements);
  onMoveRef.current = onMoveElements;
  const onResizeRef = useRef(onResizeElement);
  onResizeRef.current = onResizeElement;
  const onRotateRef = useRef(onRotateElement);
  onRotateRef.current = onRotateElement;
  const onAddConnRef = useRef(onAddConnection);
  onAddConnRef.current = onAddConnection;
  const onRemoveConnRef = useRef(onRemoveConnection);
  onRemoveConnRef.current = onRemoveConnection;
  const onRelinkRef = useRef(onRelinkConnection);
  onRelinkRef.current = onRelinkConnection;
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  // 완료는 한 번만 — 순서 완주(line) 또는 '승리 요소 reveal'(고르기·분류 등 비순서) 중 먼저 오는 것.
  const completedRef = useRef(false);
  const fireComplete = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    onCompleteRef.current?.();
    // 완료 축하 이펙트 — 색종이가 잠깐 쏟아진다.
    setCelebrating(true);
    window.setTimeout(() => setCelebrating(false), 2600);
  }, []);
  // 연결 hit-test/적중 판정용 최신 요소·연결 목록(고정 핸들러에서 읽음).
  const elsRef = useRef(doc.elements);
  elsRef.current = doc.elements;
  const connsRef = useRef(doc.connections);
  connsRef.current = doc.connections;

  // 재생 리셋/모드 전환 — 애니메이션 취소 + 런타임 상태를 문서 기본값으로 초기화.
  useEffect(() => {
    runToken.current += 1;
    completedRef.current = false;
    if (rootRef.current) cancelAnimations(rootRef.current);
    stopSpeaking();
    const c: Record<string, number> = {};
    (doc.counters ?? []).forEach((x) => (c[x.id] = x.initial ?? 0));
    const f: Record<string, boolean> = {};
    (doc.flags ?? []).forEach((x) => (f[x.id] = x.initial ?? false));
    countersRef.current = c;
    flagsRef.current = f;
    seqIndexRef.current = 0;
    moveOffset.current = {};
    flipRef.current = {};
    // moveAlongPath 의 fill:forwards/커밋된 transform 잔상까지 비워 액터를 '시작 위치'로 확실히 원복
    // (cancelAnimations 만으로 남는 경우가 있어 인라인 transform 도 함께 초기화 — 캐릭터가 마지막 아이템에 붙는 문제).
    rootRef.current?.querySelectorAll<HTMLElement>('.ic-el-inner').forEach((el) => { el.style.transform = ''; });
    setCounters(c);
    setFlags(f);
    setSwapped({});
    setHidden({});
    setHighlighted({});
    setBubbles({});
    setRevealed({});
    setCollected([]);
    setActorAtHome(true); // 리셋 = 집(정면)
    setActorMoving(false); // 정지 = 대기 애니메이션 ON
    setBursts([]);
    setCelebrating(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetNonce, mode]);

  /** 탭으로 발화하는 동작(탭 또는 순서대로 탭) — 재생 클릭/▶/손끝 표시 대상. */
  const tapLike = useCallback(
    (elId: string) => doc.behaviors.find((b) => b.target === elId && (b.trigger === 'tap' || b.trigger === 'sequenceTap')),
    [doc.behaviors],
  );
  /** 순서대로 탭(sequenceTap) 차례 — 연결 순번 라벨 순으로 정렬한 요소 목록. */
  const seqOrder = useMemo(
    () =>
      doc.behaviors
        .filter((b) => b.trigger === 'sequenceTap')
        .map((b) => b.target)
        .sort((a, b) => compareLabels(linkLabels.get(a) ?? '999', linkLabels.get(b) ?? '999')),
    [doc.behaviors, linkLabels],
  );
  const seqIndexRef = useRef(0);

  // 수집형(줍기/찾기) 게임 감지 — 액터(moveAlongPath 대상)가 아이템들(tap/sequenceTap)로 이동해 줍는 구조.
  // (분류 게임은 아이템 자신이 이동하므로 playIds 가 비어 제외된다.)
  const collectInfo = useMemo(() => {
    const moveTargets = new Set(doc.behaviors.filter((b) => b.action === 'moveAlongPath').map((b) => b.target));
    const actorId = [...moveTargets][0] ?? null;
    // 탭하면 '통통 튀기(animate)만' 하는 장식(예: 꿀단지·둥지)은 줍기 대상이 아니다 — 액터가 복귀로
    // 그 위에 도착해도 수거되지 않게 제외한다(복귀처가 사라지던 버그 방지). 줍는 아이템은 count/hide 등 동작을 가진다.
    const isDecorationTap = (id: string) => {
      const bs = doc.behaviors.filter((b) => (b.trigger === 'tap' || b.trigger === 'sequenceTap') && b.target === id);
      return bs.length > 0 && bs.every((b) => b.action === 'animate');
    };
    const playIds = new Set(
      doc.behaviors
        .filter((b) => (b.trigger === 'tap' || b.trigger === 'sequenceTap') && !moveTargets.has(b.target) && !isDecorationTap(b.target))
        .map((b) => b.target),
    );
    const isCollect =
      !!actorId &&
      playIds.size >= 3 &&
      doc.connections.some((c) => moveTargets.has(c.from) || moveTargets.has(c.to));
    // 액터는 '진짜 수집형'에서만 의미. 분류 등 비수집형에선 첫 이동대상이 actorId로 잡혀
    // 무생물 아이템(인형 등)에 액터 로직(플립·정면/측면 스왑·대기·집 상태)이 잘못 적용되던 문제 방지.
    return { isCollect, actorId: isCollect ? actorId : null, playIds };
  }, [doc.behaviors, doc.connections]);

  // 드래그-분류 게임 — 각 아이템이 '자기 자신'을 통/바구니(컨테이너)로 옮기는 moveAlongPath를
  // tap/sequenceTap 트리거로 가진 구조. 이동 대상이 아이템마다 서로 달라(≥2종) 공용 액터 1명이
  // 아이템들로 가는 '수집형'과 구분된다. 이런 아이템은 '탭 자동 이동' 대신 '드래그해서 통에 드롭'으로
  // 동작시킨다(런타임 해석 — 스키마 불변). 드롭 = 그 아이템의 moveAlongPath 발화이고, onPathUp이
  // '연결된 상대(올바른 통)' 위에 놓였을 때만 발화하므로 → 틀린 통/빈 곳은 제자리로(분류 챌린지 성립).
  const dragSortBeh = useMemo(() => {
    const moveBeh = doc.behaviors.filter(
      (b) => b.action === 'moveAlongPath' && (b.trigger === 'tap' || b.trigger === 'sequenceTap'),
    );
    const targets = new Set(moveBeh.map((b) => b.target));
    const byItem: Record<string, string> = {}; // itemId → moveBehaviorId
    if (targets.size >= 2) for (const b of moveBeh) byItem[b.target] = b.id;
    return byItem;
  }, [doc.behaviors]);

  // 액터의 '측면 포즈'를 불러오고(이동 중 사용), 그 이미지로 향하는 방향을 분석한다.
  // 측면 포즈가 없으면(구버전 측면 캐릭터) 메인 src로 분석 — 그땐 정면 스왑 없이 기존처럼 동작.
  useEffect(() => {
    const id = collectInfo.actorId;
    if (!id) {
      setActorSidePose(null);
      return;
    }
    const side = loadActorSide(doc.id, id);
    setActorSidePose(side);
    const el = doc.elements.find((e) => e.id === id);
    const detectSrc = side ?? el?.src?.src;
    if (!detectSrc) return;
    const img = new Image();
    img.onload = () => { actorFacingRef.current[id] = detectFacing(img); };
    img.src = detectSrc;
  }, [collectInfo.actorId, doc.id, doc.elements]);

  // 모두 획득(미션 완료) → 완료 이펙트(액터가 마지막 아이템에 '도착'한 이 시점에 동기) + 캐릭터를 시작 위치로.
  useEffect(() => {
    if (!collectInfo.isCollect || !collectInfo.actorId) return;
    if (collected.length === 0 || collected.length < collectInfo.playIds.size) return;
    fireComplete(); // 도착 시점에 완료(축하 컨페티·완료바) — 탭 시점의 조기 발화 대신
    const actorId = collectInfo.actorId;
    const inner = innerRefs.current[actorId];
    const prev = moveOffset.current[actorId] ?? { x: 0, y: 0 };
    if (!inner || (prev.x === 0 && prev.y === 0)) return;
    // 집으로 가는 방향을 바라보게(0 − prev 방향). 정면/감지실패여도 이동 방향으로 플립.
    let f = flipRef.current[actorId] ?? 1;
    const facing = actorFacingRef.current[actorId];
    const moveDir = prev.x > 6 ? 'left' : prev.x < -6 ? 'right' : null;
    f = flipFor(facing, moveDir, f);
    flipRef.current[actorId] = f;
    const token = runToken.current;
    setActorMoving(true); // 복귀 이동 — 대기 애니메이션 멈춤
    const a = inner.animate(
      [{ transform: `translate(${prev.x}px, ${prev.y}px) scaleX(${f})` }, { transform: `translate(0px, 0px) scaleX(${f})` }],
      { duration: 700, fill: 'forwards', easing: 'cubic-bezier(.4,0,.3,1)' },
    );
    moveOffset.current[actorId] = { x: 0, y: 0 };
    a.finished
      .then(() => {
        if (token !== runToken.current) return;
        a.cancel();
        inner.style.transform = ''; // 집 도착 = 정면(플립 없음)
        flipRef.current[actorId] = 1;
        setActorAtHome(true); // 측면 → 정면 스왑
        setActorMoving(false); // 집 도착해 대기 — 대기 애니메이션 재개
      })
      .catch(() => {});
  }, [collected, collectInfo, fireComplete]);

  // ── 동작 엔진(스키마 전체 실행) — when 조건 평가 + delay + then 체이닝 + 11종 액션 ──
  const evalCond = (cond?: Condition): boolean => {
    if (!cond) return true;
    if (cond.kind === 'counter') {
      const v = countersRef.current[cond.counterId] ?? 0;
      return cond.op === '>=' ? v >= cond.value : cond.op === '==' ? v === cond.value : v < cond.value;
    }
    if (cond.kind === 'flag') return (flagsRef.current[cond.flagId] ?? false) === cond.is;
    if (cond.kind === 'state') return (swapped[cond.target] ? 'swapped' : 'default') === cond.equals;
    return true;
  };

  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  const applyAction = async (beh: Behavior): Promise<void> => {
    switch (beh.action) {
      case 'animate': {
        const inner = innerRefs.current[beh.target];
        const a = inner ? runAnimate(inner, beh.params.preset, beh.params.repeat) : null;
        if (a) await a.finished.catch(() => {});
        return;
      }
      case 'swap':
        setSwapped((s) => ({ ...s, [beh.target]: !s[beh.target] }));
        return;
      case 'reveal':
        setHidden((h) => {
          const n = { ...h };
          beh.params.targets.forEach((t) => (n[t] = false));
          return n;
        });
        // 조건부로 '시작 시 숨겨둔' 요소(=승리 오버레이)를 보이면 = 게임 완료(비순서 게임의 완료 신호).
        if (beh.when && beh.params.targets.some((t) => hiddenAtStartIds.has(t))) {
          const token = runToken.current;
          window.setTimeout(() => { if (token === runToken.current) fireComplete(); }, 700);
        }
        return;
      case 'hide':
        setHidden((h) => {
          const n = { ...h };
          beh.params.targets.forEach((t) => (n[t] = true));
          return n;
        });
        return;
      case 'highlight': {
        const color = beh.params.color || 'var(--ic-coral)';
        setHighlighted((h) => {
          const n = { ...h };
          beh.params.targets.forEach((t) => (n[t] = color));
          return n;
        });
        const token = runToken.current;
        window.setTimeout(() => {
          if (token !== runToken.current) return;
          setHighlighted((h) => {
            const n = { ...h };
            beh.params.targets.forEach((t) => delete n[t]);
            return n;
          });
        }, 1500);
        return;
      }
      case 'count': {
        const id = beh.params.counterId;
        const next = (countersRef.current[id] ?? 0) + (beh.params.by ?? 1);
        countersRef.current = { ...countersRef.current, [id]: next };
        setCounters((c) => ({ ...c, [id]: next }));
        return;
      }
      case 'setFlag':
        flagsRef.current = { ...flagsRef.current, [beh.params.flagId]: beh.params.value };
        setFlags((f) => ({ ...f, [beh.params.flagId]: beh.params.value }));
        return;
      case 'speak': {
        const text = beh.params.text;
        setBubbles((b) => ({ ...b, [beh.target]: text }));
        speakText(text);
        const token = runToken.current;
        await sleep(Math.min(5000, Math.max(1600, text.length * 130)));
        if (token === runToken.current)
          setBubbles((b) => {
            const n = { ...b };
            delete n[beh.target];
            return n;
          });
        return;
      }
      case 'playVideo': {
        const v = videoRefs.current[beh.target];
        if (v) {
          try {
            v.currentTime = 0;
            await v.play();
          } catch {
            /* autoplay 정책 차단 — 무시 */
          }
        }
        return;
      }
      case 'moveAlongPath': {
        // 드래그-분류 아이템은 onPathUp이 '드롭한 자리에서 숨김'으로 통에 넣으므로 시각 이동을 생략한다
        // (outer/inner 좌표계 핸드오프로 위치가 튀던 버그 제거). 이동은 건너뛰되 후속 체인(count/hide/win)은 흐른다.
        if (dragSortBeh[beh.target]) return;
        const conn = doc.connections.find((c) => c.id === beh.params.connectionId);
        const inner = innerRefs.current[beh.target];
        const me = doc.elements.find((e) => e.id === beh.target);
        if (conn && inner && me) {
          // 이동 목적지 = 연결에서 '대상(움직이는 요소)이 아닌 쪽'. 대상이 from이면 to로, to면 from으로.
          // 대상이 양 끝 어느 쪽도 아니면(예: 복귀 연결 flower→honeypot 인데 움직이는 건 bee) 방향성을 따라
          // 도착점(to)으로 간다 — 안 그러면 출발점(flower)으로 가 '제자리 복귀'가 돼 움직이지 않던 버그.
          const otherId = beh.target === conn.from ? conn.to : beh.target === conn.to ? conn.from : conn.to;
          const other = doc.elements.find((e) => e.id === otherId);
          if (other) {
            // 대상(연잎 등) 중심으로 이동 — 좌표는 요소 레이아웃 원점 기준 누적 translate.
            const dx = other.transform.x + other.transform.w / 2 - (me.transform.x + me.transform.w / 2);
            const dy = other.transform.y + other.transform.h / 2 - (me.transform.y + me.transform.h / 2);
            const dur = 750 / (beh.params.speed || 1);
            const prev = moveOffset.current[beh.target] ?? { x: 0, y: 0 };
            // '점프' 이동 — 시작↔끝 사이를 위로 솟구치는 호(중간점)로 콩 뛰어 이동 후 머무름(fill:forwards).
            // 다음 이동은 현재 위치(prev)에서 이어진다.
            const midX = (prev.x + dx) / 2;
            const hop = Math.min(140, 64 + Math.abs(dx - prev.x) * 0.12); // 이동 거리에 따라 점프 높이(상한 140)
            const midY = Math.min(prev.y, dy) - hop;
            // 진행 방향으로 바라보게 — 가로 이동 방향으로 좌우 반전(scaleX 부호 f). 세로 이동만이면 직전 방향 유지.
            let f = flipRef.current[beh.target] ?? 1;
            if (beh.target === collectInfo.actorId) {
              setActorAtHome(false); // 이동 시작 → 측면 포즈로 전환
              setActorMoving(true); // 이동 중 — 대기 애니메이션 멈춤
              const facing = actorFacingRef.current[beh.target];
              const moveDir = dx > prev.x + 6 ? 'right' : dx < prev.x - 6 ? 'left' : null;
              f = flipFor(facing, moveDir, f); // 정면/감지실패여도 이동 방향으로 항상 플립(측면 포즈는 오른쪽 향함 기준)
              flipRef.current[beh.target] = f;
            }
            // '점프 포즈' — 도약(쭉)→공중(살짝 눌림)→착지(쿵) 스쿼시·스트레치 + 진행 방향 플립(f).
            const a = inner.animate(
              [
                { transform: `translate(${prev.x}px, ${prev.y}px) scaleX(${f}) scaleY(1)`, offset: 0, easing: 'cubic-bezier(.3,0,.5,1)' },
                { transform: `translate(${prev.x}px, ${prev.y}px) scaleX(${f * 0.92}) scaleY(1.1)`, offset: 0.12 },
                { transform: `translate(${midX}px, ${midY}px) scaleX(${f * 1.05}) scaleY(0.95)`, offset: 0.5, easing: 'cubic-bezier(.4,0,.7,1)' },
                { transform: `translate(${dx}px, ${dy}px) scaleX(${f * 0.92}) scaleY(1.06)`, offset: 0.9 },
                { transform: `translate(${dx}px, ${dy}px) scaleX(${f}) scaleY(1)`, offset: 1 },
              ],
              { duration: dur, fill: 'forwards' },
            );
            moveOffset.current[beh.target] = { x: dx, y: dy };
            await a.finished.catch(() => {});
            // 이동 위치를 인라인 transform으로 확정 + 애니메이션 제거 — fill:forwards 잔상이 남아
            // '처음으로'(리셋)에서 캐릭터가 시작 위치로 안 돌아가던 버그 수정(같은 값이라 깜빡임 없음).
            a.cancel();
            inner.style.transform = `translate(${dx}px, ${dy}px) scaleX(${f})`;
            if (beh.target === collectInfo.actorId) setActorMoving(false); // 도착해 대기 — 대기 애니메이션 재개
            // 수집형 — 액터가 아이템에 '도착'하면 그 아이템을 줍는다(제자리에서 사라져 중앙 트레이로 모인다).
            if (collectInfo.isCollect && beh.target === collectInfo.actorId && collectInfo.playIds.has(otherId)) {
              setCollected((prev) => (prev.includes(otherId) ? prev : [...prev, otherId]));
              fireBurstRef.current(other.transform.x + other.transform.w / 2, other.transform.y + other.transform.h / 2); // 획득 이펙트
              // '줍기 포즈' — 살짝 숙였다 펴는 모션(플립 유지, fill 없음 → 끝나면 인라인 위치로 복귀).
              inner.animate(
                [
                  { transform: `translate(${dx}px, ${dy}px) scaleX(${f}) scaleY(1)` },
                  { transform: `translate(${dx}px, ${dy + 12}px) scaleX(${f * 1.06}) scaleY(0.9)`, offset: 0.4 },
                  { transform: `translate(${dx}px, ${dy}px) scaleX(${f}) scaleY(1)` },
                ],
                { duration: 380, easing: 'ease-out' },
              );
            }
          }
        }
        return;
      }
      case 'goToScene':
        // 레인 전환 — sceneId(문자열 Id)를 목표 레인 인덱스로 해석해 카메라를 그 레인으로 패닝.
        // 새 트리거·액션·params 스키마 신설 0(기존 goToScene 자리 재사용).
        panToLane(laneFromSceneId(beh.params.sceneId));
        return;
      default:
        return;
    }
  };

  /** 동작 실행(체인 진입점) — when 평가 → delay → 액션 → then[] 순차 실행. 리셋 시 취소. */
  const fireBehavior = useCallback(
    async (behaviorId: string, depth = 0) => {
      if (depth > 24) return;
      const token = runToken.current;
      const beh = doc.behaviors.find((b) => b.id === behaviorId);
      if (!beh || !evalCond(beh.when)) return;
      if (beh.delay && beh.delay > 0) {
        await sleep(beh.delay);
        if (token !== runToken.current) return;
      }
      await applyAction(beh);
      if (token !== runToken.current) return;
      for (const t of beh.then ?? []) {
        if (token !== runToken.current) return;
        await fireBehavior(t, depth + 1);
      }
      // afterComplete 트리거 — 이 동작 완료를 기다리던 동작들 발화.
      for (const ac of doc.behaviors) {
        if (ac.trigger === 'afterComplete' && ac.after === beh.id) {
          if (token !== runToken.current) return;
          await fireBehavior(ac.id, depth + 1);
        }
      }
    },
    // applyAction/evalCond는 최신 doc/state 클로저 — doc.behaviors 바뀔 때만 갱신.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc.behaviors, doc.connections, doc.elements, swapped],
  );

  // sceneEnter 트리거 — 재생 시작 시 자동 실행(인트로 애니메이션·나레이션). 리셋 토큰으로 취소.
  useEffect(() => {
    if (preview || mode !== 'play') return;
    const token = runToken.current;
    const t = window.setTimeout(() => {
      if (token !== runToken.current) return;
      doc.behaviors.filter((b) => b.trigger === 'sceneEnter').forEach((b) => void fireBehavior(b.id));
    }, 80);
    return () => window.clearTimeout(t);
  }, [resetNonce, mode, preview, doc.behaviors, fireBehavior]);

  // ── 이야기(story) 재생 — 단계 이동 + 나레이션(자막+TTS) + (있으면) move 동작 ──
  const storySteps = doc.story?.steps ?? [];
  const gotoStep = useCallback(
    (i: number) => {
      const steps = doc.story?.steps ?? [];
      if (i < 0 || i >= steps.length) return;
      setStoryIdx(i);
      const step = steps[i];
      if (step.move) void fireBehavior(step.move);
      if (step.speak?.text) speakText(step.speak.text);
      // storyAdvance 트리거 — 이야기가 한 단계 넘어갈 때마다 발화(페이지넘김 효과 등).
      doc.behaviors.filter((b) => b.trigger === 'storyAdvance').forEach((b) => void fireBehavior(b.id));
    },
    [doc.story, doc.behaviors, fireBehavior],
  );
  // 다음 단계 — 분기(branches)가 있으면 조건 맞는 곳으로 점프, 없으면 그냥 다음.
  const storyNext = () => {
    if (storyIdx === null) return;
    const branches = doc.story?.branches ?? [];
    const hit = branches.find((b) => evalCond(b.when));
    if (hit) {
      const j = (doc.story?.steps ?? []).findIndex((s) => s.id === hit.toStep);
      if (j >= 0) {
        gotoStep(j);
        return;
      }
    }
    gotoStep(storyIdx + 1);
  };
  // 재생 시작 시 첫 단계부터.
  useEffect(() => {
    if (preview || mode !== 'play' || !(doc.story?.steps?.length)) {
      setStoryIdx(null);
      return;
    }
    setStoryIdx(0);
    const steps = doc.story.steps;
    const token = runToken.current;
    const t = window.setTimeout(() => {
      if (token !== runToken.current) return;
      if (steps[0].speak?.text) speakText(steps[0].speak.text);
      if (steps[0].move) void fireBehavior(steps[0].move);
    }, 120);
    return () => window.clearTimeout(t);
  }, [resetNonce, mode, preview, doc.story, fireBehavior]);

  // ── 편집: (그룹) 드래그 — 스크린 델타 ÷ scale = 논리 델타, 선택된 모든 요소 함께 이동 ──
  const onWinMove = useCallback((e: PointerEvent) => {
    const d = dragInfo.current;
    if (!d) return;
    d.dx = Math.round((e.clientX - d.sx) / d.sc);
    d.dy = Math.round((e.clientY - d.sy) / d.sc);
    setDrag({ ids: d.ids, origs: d.origs, dx: d.dx, dy: d.dy });
  }, []);
  const onWinUp = useCallback(() => {
    window.removeEventListener('pointermove', onWinMove);
    window.removeEventListener('pointerup', onWinUp);
    const d = dragInfo.current;
    dragInfo.current = null;
    setDrag(null);
    // 🔴 side-effect는 setState 업데이터 밖에서(무한 업데이트 루프 방지).
    if (d && (d.dx !== 0 || d.dy !== 0)) onMoveRef.current?.(d.ids, d.dx, d.dy);
  }, [onWinMove]);

  // ── 편집: 모서리 리사이즈 ──
  //  · 회전 0: 반대 모서리 앵커 고정(축 정렬).
  //  · 회전 ≠0: 중심 고정 + 로컬축(회전축) 투영으로 폭/높이 — 회전된 요소도 자연스럽게.
  const onResizeMove = useCallback((e: PointerEvent) => {
    const r = resizeInfo.current;
    if (!r) return;
    const sc = scaleRef.current;
    const px = (e.clientX - r.rect.left) / sc;
    const py = (e.clientY - r.rect.top) / sc;
    if (r.theta) {
      const cos = Math.cos(r.theta);
      const sin = Math.sin(r.theta);
      const dx = px - r.cx;
      const dy = py - r.cy;
      const a = dx * cos + dy * sin; // 로컬 폭축 성분
      const b = -dx * sin + dy * cos; // 로컬 높이축 성분
      const w = Math.max(32, Math.round(Math.abs(a) * 2));
      const h = Math.max(32, Math.round(Math.abs(b) * 2));
      const x = Math.round(r.cx - w / 2);
      const y = Math.round(r.cy - h / 2);
      r.box = { x, y, w, h };
      setResize({ id: r.id, x, y, w, h });
      return;
    }
    const x = Math.round(Math.min(r.ax, px));
    const y = Math.round(Math.min(r.ay, py));
    const w = Math.max(32, Math.round(Math.abs(px - r.ax)));
    const h = Math.max(32, Math.round(Math.abs(py - r.ay)));
    r.box = { x, y, w, h };
    setResize({ id: r.id, x, y, w, h });
  }, []);
  const onResizeUp = useCallback(() => {
    window.removeEventListener('pointermove', onResizeMove);
    window.removeEventListener('pointerup', onResizeUp);
    const r = resizeInfo.current;
    resizeInfo.current = null;
    setResize(null);
    if (r) onResizeRef.current?.(r.id, r.box);
  }, [onResizeMove]);

  // ── 편집: 회전(중심 기준, 마이보드 회전 핸들과 동일 수식. Shift=15° 스냅) ──
  const onRotateMove = useCallback((e: PointerEvent) => {
    const r = rotateInfo.current;
    if (!r) return;
    const sc = scaleRef.current;
    const px = (e.clientX - r.rect.left) / sc;
    const py = (e.clientY - r.rect.top) / sc;
    const ang = Math.atan2(py - r.cy, px - r.cx);
    let deg = r.startRot + ((ang - r.startAng) * 180) / Math.PI;
    if (e.shiftKey) deg = Math.round(deg / 15) * 15;
    deg = (((Math.round(deg) % 360) + 360) % 360);
    r.deg = deg;
    setRotate({ id: r.id, deg });
  }, []);
  const onRotateUp = useCallback(() => {
    window.removeEventListener('pointermove', onRotateMove);
    window.removeEventListener('pointerup', onRotateUp);
    const r = rotateInfo.current;
    rotateInfo.current = null;
    setRotate(null);
    if (r) onRotateRef.current?.(r.id, r.deg);
  }, [onRotateMove]);

  // 커서(논리 좌표) 아래 연결 가능한 최상위 요소(여유 pad 포함). 고정 핸들러에서 호출.
  const hitElementAt = useCallback((x: number, y: number): ElementNode | null => {
    const pad = 16 / scaleRef.current;
    return (
      [...elsRef.current]
        .sort((a, b) => b.transform.z - a.transform.z)
        .find((el) => {
          const t = el.transform;
          return x >= t.x - pad && x <= t.x + t.w + pad && y >= t.y - pad && y <= t.y + t.h + pad;
        }) ?? null
    );
  }, []);

  /** 드롭(끌어 놓기) 대상 — (x,y)에 겹친 요소 중 fromId와 '연결된' 상대(올바른 통/짝)를 z 높은 순으로
      찾는다. 연결을 조건으로 두므로 완료 텍스트 등 무관한 오버레이(z가 높아도)는 건너뛰고, 틀린 통/빈
      곳에 놓으면 못 찾아 null → 제자리로(분류 챌린지 성립). 자기 자신 제외. */
  const hitConnectedAt = useCallback((x: number, y: number, fromId: string): ElementNode | null => {
    const pad = 16 / scaleRef.current;
    return (
      [...elsRef.current]
        .filter((el) => el.id !== fromId)
        .filter((el) => {
          const t = el.transform;
          return x >= t.x - pad && x <= t.x + t.w + pad && y >= t.y - pad && y <= t.y + t.h + pad;
        })
        .sort((a, b) => b.transform.z - a.transform.z)
        .find((el) =>
          connsRef.current.some(
            (c) => (c.from === fromId && c.to === el.id) || (c.from === el.id && c.to === fromId),
          ),
        ) ?? null
    );
  }, []);

  // ── 편집: 연결 드래그(마이보드 onLinkMove/onLinkUp 동일 로직) ──
  const onLinkMove = useCallback((e: PointerEvent) => {
    const st = lk.current;
    const rect = linkRectRef.current;
    if (!st || !rect) return;
    const sc = scaleRef.current;
    const x = (e.clientX - rect.left) / sc;
    const y = (e.clientY - rect.top) / sc;
    setLinking({ x1: st.x1, y1: st.y1, x2: x, y2: y });
    const t = hitElementAt(x, y);
    setHoverElId(t && t.id !== st.from ? t.id : null); // 드롭 대상 하이라이트
  }, [hitElementAt]);
  const onLinkUp = useCallback((e: PointerEvent) => {
    window.removeEventListener('pointermove', onLinkMove);
    window.removeEventListener('pointerup', onLinkUp);
    const st = lk.current;
    lk.current = null;
    setLinking(null);
    const rect = linkRectRef.current;
    if (!st || !rect) {
      setHoverElId(null);
      return;
    }
    const sc = scaleRef.current;
    const x = (e.clientX - rect.left) / sc;
    const y = (e.clientY - rect.top) / sc;
    const target = hitElementAt(x, y);
    if (st.mode === 'new') {
      if (target && target.id !== st.from) onAddConnRef.current?.(st.from, target.id);
    } else if (st.connId) {
      // 떼어내기: 빈 곳=해제, 다른 요소=옮겨 연결, 제자리=유지.
      const conn = connsRef.current.find((c) => c.id === st.connId);
      if (conn) {
        const detached = st.keepFrom ? conn.to : conn.from; // 떼어낸 쪽
        if (!target) onRemoveConnRef.current?.(conn.id);
        else if (target.id !== detached && target.id !== st.from) {
          onRelinkRef.current?.(conn.id, st.keepFrom ? st.from : target.id, st.keepFrom ? target.id : st.from);
        }
      }
    }
    setHoverElId(null);
  }, [onLinkMove, hitElementAt]);

  // ── 재생: pathTraverse 드래그(요소를 연결된 상대 위로 끌기) ──
  const onPathMove = useCallback((e: PointerEvent) => {
    const p = pathInfo.current;
    if (!p) return;
    const sc = scaleRef.current;
    const dx = Math.round((e.clientX - p.sx) / sc);
    const dy = Math.round((e.clientY - p.sy) / sc);
    setDrag({ ids: [p.id], origs: { [p.id]: p.orig }, dx, dy });
  }, []);
  const onPathUp = useCallback((e: PointerEvent) => {
    window.removeEventListener('pointermove', onPathMove);
    window.removeEventListener('pointerup', onPathUp);
    const p = pathInfo.current;
    pathInfo.current = null;
    if (!p) { setDrag(null); return; }
    const sc = scaleRef.current;
    const x = (e.clientX - p.rect.left) / sc;
    const y = (e.clientY - p.rect.top) / sc;
    // 드롭 지점에 겹친 요소 중 'p와 연결된 올바른 상대(통/짝)'를 찾는다(숨김/완료 텍스트에 안 가려지게).
    const target = hitConnectedAt(x, y, p.id);
    if (target) {
      // ✅ 맞는 통 → 드롭한 '바로 그 자리'에서 통에 쏙 들어간다. moveAlongPath의 '시각 이동'은 drag-sort에서
      //    생략하고(아래 case), 여기서 아이템을 그 자리에서 숨겨 통에 들어간 것처럼 보이게 한다.
      //    숨김과 drag 리셋을 같은 틱에 배치 → 원점으로 깜빡이지 않는다(중복 동작·위치 튐 없음).
      fireBurstRef.current(target.transform.x + target.transform.w / 2, target.transform.y + target.transform.h / 2);
      const bi = innerRefs.current[target.id];
      if (bi)
        bi.animate(
          [{ transform: 'scale(1)' }, { transform: 'scale(1.14)', offset: 0.4 }, { transform: 'scale(1)' }],
          { duration: 420, easing: 'cubic-bezier(.3,1.5,.5,1)' },
        );
      setHidden((h) => ({ ...h, [p.id]: true }));
      setDrag(null);
      void fireBehavior(p.behId); // count/hide/win 체인(drag-sort moveAlongPath는 무시각)
    } else {
      // ❌ 틀린 통/빈 곳 → 드롭한 자리에서 '같은 outer 좌표계(drag 상태)'로 부드럽게 제자리 복귀.
      // 드래그와 동일한 setDrag/clampXY 경로라 좌표계 핸드오프가 없어 위치가 튀지 않는다(rAF 보간).
      const fromDx = Math.round((e.clientX - p.sx) / sc);
      const fromDy = Math.round((e.clientY - p.sy) / sc);
      const id = p.id, orig = p.orig, dur = 260, t0 = performance.now();
      const step = (now: number) => {
        if (pathInfo.current) return; // 새 드래그 시작 → 복귀 중단
        const k = Math.min(1, (now - t0) / dur);
        const ease = 1 - Math.pow(1 - k, 3);
        if (k < 1) {
          setDrag({ ids: [id], origs: { [id]: orig }, dx: Math.round(fromDx * (1 - ease)), dy: Math.round(fromDy * (1 - ease)) });
          requestAnimationFrame(step);
        } else {
          setDrag(null);
        }
      };
      requestAnimationFrame(step);
    }
  }, [onPathMove, hitConnectedAt, fireBehavior]);

  // cleanup은 언마운트에서만(deps []). 핸들러가 영구 고정이라 리렌더 중 리스너가
  // 떨어지지 않는다 — 위 ref 주석 참조.
  useEffect(
    () => () => {
      window.removeEventListener('pointermove', onWinMove);
      window.removeEventListener('pointerup', onWinUp);
      window.removeEventListener('pointermove', onResizeMove);
      window.removeEventListener('pointerup', onResizeUp);
      window.removeEventListener('pointermove', onLinkMove);
      window.removeEventListener('pointerup', onLinkUp);
      window.removeEventListener('pointermove', onRotateMove);
      window.removeEventListener('pointerup', onRotateUp);
      window.removeEventListener('pointermove', onPathMove);
      window.removeEventListener('pointerup', onPathUp);
    },
    [onWinMove, onWinUp, onResizeMove, onResizeUp, onLinkMove, onLinkUp, onRotateMove, onRotateUp, onPathMove, onPathUp],
  );

  // 포트 pointerdown — 빈 슬롯이면 새 연결, 연결된 슬롯이면 떼어내기(반대 끝 고정).
  const onPortDown = (
    e: React.PointerEvent,
    elId: string,
    _side: 'l' | 'r',
    slot: { x: number; y: number },
    detachConn?: Connection,
  ) => {
    if (preview || mode !== 'edit') return;
    e.stopPropagation();
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    linkRectRef.current = rect;
    if (detachConn) {
      const otherId = detachConn.from === elId ? detachConn.to : detachConn.from;
      const s = sidesOf(detachConn);
      const otherSide = detachConn.from === otherId ? s.from : s.to;
      const anch = linkAnchor(otherId, otherSide, detachConn.id);
      lk.current = { mode: 'detach', from: otherId, x1: anch.x, y1: anch.y, connId: detachConn.id, keepFrom: detachConn.from === otherId };
      setLinking({ x1: anch.x, y1: anch.y, x2: anch.x, y2: anch.y });
    } else {
      lk.current = { mode: 'new', from: elId, x1: slot.x, y1: slot.y };
      setLinking({ x1: slot.x, y1: slot.y, x2: slot.x, y2: slot.y });
    }
    window.addEventListener('pointermove', onLinkMove);
    window.addEventListener('pointerup', onLinkUp);
  };

  const onElPointerDown = (e: React.PointerEvent, el: ElementNode) => {
    // 재생: pathTraverse(끌어서 잇기) 동작이 걸린 요소, 또는 드래그-분류 아이템이면 드래그 제스처 시작.
    if (!preview && mode === 'play') {
      // pathTraverse 명시 동작 우선, 없으면 드래그-분류 아이템(tap+moveAlongPath)을 드래그로 동작.
      const pb =
        doc.behaviors.find((b) => b.target === el.id && b.trigger === 'pathTraverse') ??
        (dragSortBeh[el.id] ? doc.behaviors.find((b) => b.id === dragSortBeh[el.id]) : undefined);
      const rect = canvasRef.current?.getBoundingClientRect();
      if (pb && rect) {
        e.stopPropagation();
        pathInfo.current = { id: el.id, behId: pb.id, rect, sx: e.clientX, sy: e.clientY, orig: { x: el.transform.x, y: el.transform.y } };
        setDrag({ ids: [el.id], origs: { [el.id]: { x: el.transform.x, y: el.transform.y } }, dx: 0, dy: 0 });
        window.addEventListener('pointermove', onPathMove);
        window.addEventListener('pointerup', onPathUp);
      }
      return;
    }
    if (preview || mode !== 'edit') return;
    if (editingTextId === el.id) return; // 인라인 편집 중인 글자는 드래그 시작 안 함(텍스트 선택 허용)
    e.stopPropagation();
    // Shift = 선택 토글(드래그 안 함)
    if (e.shiftKey) {
      onSelectEls?.(selSet.has(el.id) ? selectedElIds.filter((i) => i !== el.id) : [...selectedElIds, el.id]);
      return;
    }
    // 다중선택에 포함된 요소 잡으면 그룹 이동, 아니면 단일 선택 후 이동
    const inMulti = selectedElIds.length > 1 && selSet.has(el.id);
    const ids = inMulti ? selectedElIds : [el.id];
    if (!inMulti) onSelectEls?.([el.id]);
    const origs: Record<string, { x: number; y: number }> = {};
    ids.forEach((id) => {
      const E = doc.elements.find((x) => x.id === id);
      if (E) origs[id] = { x: E.transform.x, y: E.transform.y };
    });
    dragInfo.current = { ids, origs, sx: e.clientX, sy: e.clientY, sc: scale, dx: 0, dy: 0 };
    setDrag({ ids, origs, dx: 0, dy: 0 });
    window.addEventListener('pointermove', onWinMove);
    window.addEventListener('pointerup', onWinUp);
  };

  const onHandleDown = (e: React.PointerEvent, el: ElementNode, corner: number) => {
    if (preview || mode !== 'edit') return;
    e.stopPropagation();
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const t = el.transform;
    const ax = corner === 0 || corner === 3 ? t.x + t.w : t.x;
    const ay = corner === 0 || corner === 1 ? t.y + t.h : t.y;
    resizeInfo.current = {
      id: el.id,
      ax,
      ay,
      rect,
      box: { x: t.x, y: t.y, w: t.w, h: t.h },
      theta: ((t.rotation ?? 0) * Math.PI) / 180,
      cx: t.x + t.w / 2,
      cy: t.y + t.h / 2,
    };
    setResize({ id: el.id, x: t.x, y: t.y, w: t.w, h: t.h });
    window.addEventListener('pointermove', onResizeMove);
    window.addEventListener('pointerup', onResizeUp);
  };

  const onRotateDown = (e: React.PointerEvent, el: ElementNode) => {
    if (preview || mode !== 'edit') return;
    e.stopPropagation();
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const b = boxOf(el);
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const px = (e.clientX - rect.left) / scale;
    const py = (e.clientY - rect.top) / scale;
    const startRot = el.transform.rotation ?? 0;
    rotateInfo.current = { id: el.id, cx, cy, rect, startRot, startAng: Math.atan2(py - cy, px - cx), deg: startRot };
    setRotate({ id: el.id, deg: startRot });
    window.addEventListener('pointermove', onRotateMove);
    window.addEventListener('pointerup', onRotateUp);
  };

  /** 동작 실행 — 편집 미리보기(▶) 공유. 요소의 탭/순서 동작을 엔진으로 실행(체인/조건 포함). */
  const runBehavior = (el: ElementNode) => {
    const beh = tapLike(el.id);
    if (beh) void fireBehavior(beh.id);
  };

  // 작은 파티클 버스트를 (cx,cy)에 띄운다(자동 소멸). prefers-reduced-motion이면 생략.
  const fireBurst = (cx: number, cy: number) => {
    if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = (burstSeq.current += 1);
    setBursts((b) => [...b, { id, x: cx, y: cy }]);
    window.setTimeout(() => setBursts((b) => b.filter((p) => p.id !== id)), 700);
  };
  fireBurstRef.current = fireBurst; // applyAction(수집 등)에서 최신 핸들러로 호출

  const onElClick = (e: React.MouseEvent, el: ElementNode) => {
    if (preview || mode !== 'play') return;
    if (dragSortBeh[el.id]) return; // 드래그-분류 아이템 = 드래그로만(탭 자동 이동 비활성 — 통에 끌어다 놓아야 들어감)
    const beh = tapLike(el.id);
    if (!beh) return;
    e.stopPropagation();
    if (beh.trigger === 'sequenceTap') {
      // 순서대로 탭 — 지금 차례의 요소만 발화하고 다음 차례로. 틀리면 흔들흔들 피드백.
      if (seqOrder[seqIndexRef.current] === el.id) {
        seqIndexRef.current += 1;
        void fireBehavior(beh.id);
        if (peekMode && peekIds.has(el.id)) setRevealed((r) => ({ ...r, [el.id]: true })); // 탭 → 전신 공개
        { const c = boxOf(el); fireBurst(c.x + c.w / 2, c.y + c.h / 2); } // 찾기 이펙트
        // 순서 게임 완료 — 단, 수집형(액터가 이동해 줍는)은 '탭'이 아니라 액터가 마지막 아이템에 '도착'할 때
        // 완료한다(아래 수집 완료 useEffect). 여기서 조기 완료하면 토끼 도착 전에 이펙트가 터져 싱크가 어긋난다.
        if (!collectInfo.isCollect && seqIndexRef.current >= seqOrder.length && seqOrder.length > 0) fireComplete();
      } else {
        const inner = innerRefs.current[el.id];
        if (inner) runAnimate(inner, 'shake');
      }
      return;
    }
    void fireBehavior(beh.id);
    if (peekMode && peekIds.has(el.id)) setRevealed((r) => ({ ...r, [el.id]: true })); // 탭 → 전신 공개
    if (!(beh.action === 'animate' && beh.params.preset === 'shake')) {
      const c = boxOf(el);
      fireBurst(c.x + c.w / 2, c.y + c.h / 2); // 클릭 이펙트(오답 흔들기엔 생략)
    }
  };

  // ── 편집: 글자 더블클릭 → 인라인 편집 ──
  const onElDoubleClick = (e: React.MouseEvent, el: ElementNode) => {
    if (preview || mode !== 'edit' || el.kind !== 'text') return;
    e.stopPropagation();
    onSelectEls?.([el.id]);
    setEditingTextId(el.id);
  };
  const commitTextEdit = () => {
    const id = editingTextId;
    setEditingTextId(null);
    if (id) onEditText?.(id, textEditRef.current?.value ?? '');
  };

  const onCanvasPointerDown = () => {
    if (!preview && mode === 'edit') onSelectEls?.([]);
  };

  // ── 외부 파일 드롭 ──
  const onDragOver = (e: React.DragEvent) => {
    if (preview || mode !== 'edit' || !onDropFiles) return;
    if (Array.from(e.dataTransfer?.types ?? []).includes('Files')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setDropping(true);
    }
  };
  const onDrop = (e: React.DragEvent) => {
    setDropping(false);
    if (preview || mode !== 'edit' || !onDropFiles) return;
    const files = Array.from(e.dataTransfer?.files ?? []).filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    const at = rect
      ? { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale }
      : { x: cw / 2, y: ch / 2 };
    onDropFiles(files, at);
  };

  const displaySrc = (el: ElementNode): string | undefined => {
    if (swapped[el.id]) {
      const beh = doc.behaviors.find((b) => b.target === el.id && b.action === 'swap');
      if (beh && beh.action === 'swap') return beh.params.to.src;
    }
    // 주인공(액터) — 시작/끝(집)은 정면(메인 src), 이동 중엔 측면 포즈(있을 때만).
    if (mode === 'play' && !preview && el.id === collectInfo.actorId && !actorAtHome && actorSidePose) {
      return actorSidePose;
    }
    return el.src?.src;
  };

  const renderContent = (el: ElementNode) => {
    if (el.kind === 'text') {
      if (editingTextId === el.id) {
        // 편집 textarea도 박스에 맞춰 — 대략적 폰트(자동맞춤은 커밋 후 FitText가 처리).
        const fontPx = Math.max(14, Math.min(el.transform.h * 0.5, (el.transform.w * 0.9) / Math.max(1, (el.text ?? '').length) * 1.6));
        return (
          <textarea
            ref={textEditRef}
            className="ic-text-edit"
            defaultValue={el.text}
            style={{ fontSize: fontPx }}
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            onPointerDown={(e) => e.stopPropagation()}
            onBlur={commitTextEdit}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                commitTextEdit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setEditingTextId(null);
              }
            }}
          />
        );
      }
      return <FitText text={el.text ?? ''} w={boxOf(el).w} h={boxOf(el).h} />;
    }
    if (el.kind === 'shape') return <div className="ic-shape" />;
    const src = displaySrc(el);
    if (!src) return null;
    const swapBeh = doc.behaviors.find((b) => b.target === el.id && b.action === 'swap');
    const asVideo = el.kind === 'video' || (!!swapped[el.id] && swapBeh?.action === 'swap' && swapBeh.params.mode === 'video');
    if (asVideo) {
      // 🔴 자동재생 금지 — playVideo 동작/컨트롤로만 재생(아이 대면 화면이 멋대로 시작되지 않게).
      return (
        <video
          ref={(n) => {
            videoRefs.current[el.id] = n;
          }}
          src={src}
          playsInline
          controls={mode === 'play' && !preview}
          muted
          loop={false}
        />
      );
    }
    // sprite는 별도 렌더가 없으므로 이미지로 표시(빈 화면 방지).
    // 대기 애니메이션(살짝 숨쉬듯) — '살아있는' 캐릭터(수집형 주인공·숨바꼭질 대상)가 정지 상태일 때만.
    // 분류 게임의 아이템(인형·블록·쓰레기 등 무생물)은 collectInfo.actorId로 잡혀도 대기 모션 금지 —
    // isCollect(진짜 수집형: 움직이는 주인공이 있는 게임)일 때만 적용. 주인공은 이동 중엔 끈다.
    // '살아있는' 캐릭터(곤충·동물 — 수집형 주인공·숨바꼭질 대상)는 정지 시 항상 살짝 숨쉬듯 대기한다.
    // preview(보드 카드 썸네일)에서도 켠다 — 카드에서 벌·동물이 죽은 듯 멈춰 있지 않게(교사 요청).
    // 편집(mode!=='play')에선 정밀 배치를 위해 끈다.
    const idle =
      mode === 'play' &&
      ((collectInfo.isCollect && el.id === collectInfo.actorId && !actorMoving) ||
        (peekMode && peekIds.has(el.id)));
    // 전체 화면 크기 이미지(배경 — dress-up 실외 등)는 cover 로 꽉 채운다(토큰은 기본 contain 유지).
    //   생성 이미지가 정사각이라 16:10 캔버스에서 좌우로 레터박스되던 문제 해결.
    const isFullBg = el.transform.w >= cw * 0.98 && el.transform.h >= ch * 0.98;
    return (
      <img
        src={src}
        alt={el.text ?? ''}
        draggable={false}
        className={idle ? 'ic-idle' : undefined}
        style={isFullBg ? { objectFit: 'cover' } : undefined}
      />
    );
  };

  /** 요소의 현재 박스(드래그/리사이즈 라이브 우선). */
  const boxOf = (el: ElementNode): Box => {
    if (resize && resize.id === el.id) return { x: resize.x, y: resize.y, w: resize.w, h: resize.h };
    if (drag && drag.origs[el.id]) {
      const o = drag.origs[el.id];
      const p = clampXY(o.x + drag.dx, o.y + drag.dy, el.transform.w, el.transform.h, cw, ch);
      return { x: p.x, y: p.y, w: el.transform.w, h: el.transform.h };
    }
    return { x: el.transform.x, y: el.transform.y, w: el.transform.w, h: el.transform.h };
  };

  /** 요소의 현재 회전(라이브 우선) — 드래그 회전 중이면 미리보기 값. */
  const rotDeg = (el: ElementNode): number => (rotate && rotate.id === el.id ? rotate.deg : el.transform.rotation ?? 0);

  // ── 연결 기하(마이보드 sideMap/portSlots/linkAnchor 동일 규칙) ──
  /** 연결의 두 끝이 각각 어느 면(l/r)에 붙는지 — 왼쪽 요소의 오른면 ↔ 오른쪽 요소의 왼면. */
  const sidesOf = (c: Connection): { from: 'l' | 'r'; to: 'l' | 'r' } => {
    const a = doc.elements.find((e) => e.id === c.from);
    const z = doc.elements.find((e) => e.id === c.to);
    const ax = a ? a.transform.x + a.transform.w / 2 : 0;
    const zx = z ? z.transform.x + z.transform.w / 2 : 0;
    const l2r = ax <= zx;
    return { from: l2r ? 'r' : 'l', to: l2r ? 'l' : 'r' };
  };
  /** 요소·면별 붙은 연결 목록(생성 순) — 선과 포트가 같은 슬롯을 공유. */
  const sideMap = useMemo(() => {
    const m = new Map<string, { l: string[]; r: string[] }>();
    const put = (id: string, side: 'l' | 'r', cid: string) => {
      if (!m.has(id)) m.set(id, { l: [], r: [] });
      m.get(id)![side].push(cid);
    };
    for (const c of doc.connections) {
      const s = sidesOf(c);
      put(c.from, s.from, c.id);
      put(c.to, s.to, c.id);
    }
    return m;
    // sidesOf는 doc.elements에 의존 → 두 배열을 deps로.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.connections, doc.elements]);
  /** 한 면의 포트 슬롯 — 붙은 연결들(순서대로) + 마지막 '새 연결' 빈 슬롯. */
  const portSlots = (elId: string, side: 'l' | 'r'): Array<{ x: number; y: number; connId?: string }> => {
    const el = doc.elements.find((e) => e.id === elId);
    if (!el) return [];
    const b = boxOf(el);
    const list = sideMap.get(elId)?.[side] ?? [];
    const total = list.length + 1; // +1 = 다중 연결용 새 포트
    const gap = 22 / scale;
    const x = side === 'l' ? b.x : b.x + b.w;
    const cy = b.y + b.h / 2;
    return Array.from({ length: total }, (_, i) => ({ x, y: cy + (i - (total - 1) / 2) * gap, connId: list[i] }));
  };
  /** 연결의 한쪽 끝 좌표 = 그 연결이 차지한 포트 슬롯 위치. */
  const linkAnchor = (elId: string, side: 'l' | 'r', connId: string): { x: number; y: number } => {
    const slots = portSlots(elId, side);
    const slot = slots.find((s) => s.connId === connId) ?? slots[0];
    return { x: slot.x, y: slot.y };
  };
  /** 두 점 사이 부드러운 곡선 path(마이보드 연결선과 동일한 모양). */
  const curve = (x1: number, y1: number, x2: number, y2: number): string => {
    const k = (x1 <= x2 ? 1 : -1) * Math.max(28, Math.min(120, Math.abs(x2 - x1) / 2));
    return `M ${x1} ${y1} C ${x1 + k} ${y1}, ${x2 - k} ${y2}, ${x2} ${y2}`;
  };

  const showLinkUi = mode === 'edit' && !preview;

  // 캔버스 호버 → 포트 표시 요소 추적(요소/리사이즈/연결 드래그 중엔 끔).
  const onCanvasHover = (e: React.PointerEvent) => {
    if (!showLinkUi || lk.current || drag || resize) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;
    const hit = hitElementAt(x, y);
    const next = hit ? hit.id : null;
    if (next !== hoverElId) setHoverElId(next);
  };

  // 핸들 박스는 단일 선택일 때만(다중 선택은 외곽선 표시).
  const singleSel = !preview && mode === 'edit' && selectedElIds.length === 1 ? doc.elements.find((e) => e.id === selectedElIds[0]) : undefined;

  return (
    <div
      ref={rootRef}
      className={`kv-inode${dropping ? ' is-dropping' : ''}`}
      data-mode={mode}
      onDragOver={onDragOver}
      onDragLeave={() => setDropping(false)}
      onDrop={onDrop}
    >
      <div ref={stageBoxRef} className="ic-stage">
        <div
          ref={canvasRef}
          className="ic-canvas"
          onPointerDown={onCanvasPointerDown}
          onPointerMove={onCanvasHover}
          onPointerLeave={() => {
            if (!lk.current) setHoverElId(null);
          }}
          style={{
            width: cw,
            height: ch,
            transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
            transformOrigin: 'top left',
            // 실제 이미지 배경이면 그 위 <img>가 덮으므로 색 없음. 아니면 토큰/헥스 색(깨진 객체는 크림 폴백).
            background: bgImageSrc(doc.canvas.background)
              ? undefined
              : bgColor(typeof doc.canvas.background === 'string' ? doc.canvas.background : 'pastel.cream'),
          }}
        >
          {(() => {
            const s = bgImageSrc(doc.canvas.background);
            return s ? <img className="ic-canvas-bg" src={s} alt="" /> : null;
          })()}
          {sorted.length === 0 && mode === 'edit' && !preview && (
            <div className="ic-empty">자료를 끌어다 놓거나 왼쪽 도구로 추가하세요</div>
          )}

          {/* 수집 트레이 — 획득한 아이템을 화면 상단 중앙에 '찾은 순서대로' 정렬해 보여준다(줍기/찾기 게임). */}
          {collectInfo.isCollect && mode === 'play' && !preview && collected.length > 0 && (
            <div
              className="ic-collect-tray"
              style={{ position: 'absolute', left: '50%', top: 116, transform: 'translateX(-50%)', display: 'flex', gap: 14, alignItems: 'center', zIndex: 30, pointerEvents: 'none' }}
            >
              {collected.map((id) => {
                const el = doc.elements.find((e) => e.id === id);
                const src = el?.src?.src;
                return src ? (
                  <img key={id} src={src} alt="" className="ic-collect-item" style={{ width: 74, height: 74, objectFit: 'contain' }} />
                ) : null;
              })}
            </div>
          )}

          {/* 완료 축하 — 색종이(컨페티)가 잠깐 쏟아진다(게임 종료 이펙트). */}
          {celebrating && mode === 'play' && !preview && (
            <div className="ic-confetti" aria-hidden>
              {Array.from({ length: 30 }).map((_, i) => (
                <span
                  key={i}
                  style={{
                    left: `${(i * 17 + 4) % 100}%`,
                    background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                    animationDelay: `${(i % 9) * 110}ms`,
                    animationDuration: `${1500 + (i % 5) * 230}ms`,
                  }}
                />
              ))}
            </div>
          )}

          {/* 요소 연결선 — 포트↔포트 곡선(클릭하면 해제) + 연결 드래그 중 임시 선.
              편집에서만 보인다(연결=순서/경로의 저작 구조). 재생/미리보기 화면(아이 대면)엔 숨김. */}
          {showLinkUi && (doc.connections.length > 0 || linking) && (
            <svg className="ic-links" width={cw} height={ch} viewBox={`0 0 ${cw} ${ch}`} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}>
              {doc.connections.map((c) => {
                if (!doc.elements.some((e) => e.id === c.from) || !doc.elements.some((e) => e.id === c.to)) return null;
                const s = sidesOf(c);
                const p1 = linkAnchor(c.from, s.from, c.id);
                const p2 = linkAnchor(c.to, s.to, c.id);
                const d = curve(p1.x, p1.y, p2.x, p2.y);
                return (
                  <g key={c.id}>
                    <path d={d} fill="none" stroke="var(--ic-coral)" strokeWidth={3 / scale} strokeLinecap="round" opacity={0.7} />
                    <circle cx={p2.x} cy={p2.y} r={5 / scale} fill="var(--ic-coral)" opacity={0.85} />
                    {showLinkUi && (
                      <path
                        d={d}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={16 / scale}
                        style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                        onClick={() => onRemoveConnection?.(c.id)}
                      >
                        <title>클릭하면 연결 해제</title>
                      </path>
                    )}
                  </g>
                );
              })}
              {linking && (
                <path
                  d={curve(linking.x1, linking.y1, linking.x2, linking.y2)}
                  fill="none"
                  stroke="var(--ic-coral)"
                  strokeWidth={3 / scale}
                  strokeDasharray={`${8 / scale} ${6 / scale}`}
                  strokeLinecap="round"
                  opacity={0.85}
                />
              )}
            </svg>
          )}
          {sorted.map((el) => {
            const b = boxOf(el);
            const playable =
              mode === 'play' && !preview && (!!tapLike(el.id) || doc.behaviors.some((b) => b.target === el.id && b.trigger === 'pathTraverse'));
            // 숨김(hide/reveal)은 재생에서만 반영 — 편집에선 항상 보여 교사가 다룰 수 있게.
            // 수집형에서 '획득'한 아이템도 제자리에서 사라진다(중앙 트레이로 모인다).
            const collectedAway = collectInfo.isCollect && mode === 'play' && !preview && collected.includes(el.id);
            const isHidden = (mode === 'play' && !preview && !!hidden[el.id]) || collectedAway;
            const hl = highlighted[el.id];
            // 숨바꼭질 — 재생 중 아직 안 누른 peek 대상은 아랫부분을 그라데이션으로 가린다(풀 속에 숨은 듯).
            const peekMaskCss =
              peekMode && mode === 'play' && !preview && peekIds.has(el.id) && !revealed[el.id]
                ? 'linear-gradient(to top, transparent 3%, rgba(0,0,0,0.12) 38%, #000 70%)'
                : undefined;
            const cls = ['ic-el'];
            // 다중 선택일 때만 외곽선(단일은 SelectionBox가 그린다).
            if (!preview && mode === 'edit' && selectedElIds.length > 1 && selSet.has(el.id)) cls.push('is-selected');
            if (playable) cls.push('is-playable');
            if (mode === 'play' && !preview && dragSortBeh[el.id]) cls.push('is-draggable'); // 드래그-분류 = 잡기 커서
            return (
              <div
                key={el.id}
                className={cls.join(' ')}
                style={{
                  left: b.x,
                  top: b.y,
                  width: b.w,
                  height: b.h,
                  transform: rotDeg(el) ? `rotate(${rotDeg(el)}deg)` : undefined,
                  transformOrigin: 'center center',
                  zIndex: el.transform.z,
                  visibility: isHidden ? 'hidden' : undefined,
                }}
                onPointerDown={(e) => onElPointerDown(e, el)}
                onClick={(e) => onElClick(e, el)}
                onDoubleClick={(e) => onElDoubleClick(e, el)}
              >
                <div
                  className="ic-el-inner"
                  ref={(n) => {
                    innerRefs.current[el.id] = n;
                  }}
                  style={{
                    width: '100%',
                    height: '100%',
                    outline: hl ? `${4 / scale}px solid ${hl}` : undefined,
                    outlineOffset: hl ? `${2 / scale}px` : undefined,
                    borderRadius: hl ? 12 : undefined,
                    WebkitMaskImage: peekMaskCss,
                    maskImage: peekMaskCss,
                  }}
                >
                  {renderContent(el)}
                </div>
                {/* 말풍선(speak) — 재생 중 요소 위에 표시. 액터가 moveAlongPath로 이동했으면 그
                    오프셋만큼 따라가 '이동한 머리 위'에 뜬다(이동 전 원래 자리에 고정되던 문제 수정). */}
                {bubbles[el.id] && (
                  <div
                    className="ic-bubble"
                    style={{
                      transform: `${((m) => (m ? `translate(${m.x}px, ${m.y}px) ` : ''))(moveOffset.current[el.id])}translate(-50%, -100%) scale(${1 / scale})`,
                    }}
                  >
                    {bubbles[el.id]}
                  </div>
                )}
                {/* 연결 순번 라벨(연결된 요소만) — 마이보드 규칙. */}
                {showLinkUi && linkLabels.has(el.id) && (
                  <span className="ic-seq" style={{ transform: `translate(-50%, -50%) scale(${1 / scale})` }}>
                    {linkLabels.get(el.id)}
                  </span>
                )}
                {/* 편집 모드 — 동작 있는 요소는 호버 시 가운데 ▶로 동작을 미리보기(확인용). */}
                {mode === 'edit' && !preview && tapLike(el.id) && (
                  <button
                    className="ic-preview-play"
                    title="동작 미리보기"
                    style={{ transform: `translate(-50%, -50%) scale(${1 / scale})` }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      runBehavior(el);
                    }}
                    aria-label="동작 미리보기"
                  >
                    <Icon name="play" size={18} fill="currentColor" stroke={0} />
                  </button>
                )}
                {/* 이미지 요소 호버 액션 — 마이보드 카드와 동일(편집·다운로드·풀스크린). */}
                {mode === 'edit' && !preview && el.kind === 'image' && el.src?.src && (
                  <div
                    className="ic-img-actions"
                    style={{ position: 'absolute', top: 0, right: 0, transform: `scale(${1 / scale})`, transformOrigin: 'top right' }}
                  >
                    <button
                      type="button"
                      aria-label="이미지 편집"
                      title="이미지 편집 (배경 제거·요소 지우기)"
                      className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface/95 text-fg-2 shadow-sm transition-colors duration-150 ease-soft hover:border-accent hover:bg-accent hover:text-on-accent"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        const r = (e.currentTarget.closest('.ic-el') as HTMLElement | null)?.getBoundingClientRect();
                        onEditImage?.(el.id, r ? { x: r.left, y: r.top, w: r.width, h: r.height } : { x: 0, y: 0, w: 0, h: 0 });
                      }}
                    >
                      <Icon name="edit" size={15} />
                    </button>
                    <button
                      type="button"
                      aria-label="다운로드"
                      title="다운로드"
                      className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface/95 text-fg-2 shadow-sm transition-colors duration-150 ease-soft hover:border-accent hover:text-accent"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (el.src?.src) downloadImageUrl(el.src.src, el.text);
                      }}
                    >
                      <Icon name="download" size={14} />
                    </button>
                    <button
                      type="button"
                      aria-label="크게 보기"
                      title="크게 보기 (풀스크린)"
                      className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface/95 text-fg-2 shadow-sm transition-colors duration-150 ease-soft hover:border-accent hover:text-accent"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        const r = (e.currentTarget.closest('.ic-el') as HTMLElement | null)?.getBoundingClientRect();
                        onFullscreenImage?.(el.id, r ? { x: r.left, y: r.top, w: r.width, h: r.height } : { x: 0, y: 0, w: 0, h: 0 });
                      }}
                    >
                      <Icon name="present" size={14} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {/* 카운터 표시(count 동작) — display 좌표(없으면 좌상단 세로 스택). 재생/미리보기에서. */}
          {!preview &&
            (doc.counters ?? []).map((cn, i) => {
              const val = counters[cn.id] ?? cn.initial ?? 0;
              const dx = cn.display?.x ?? 24;
              const dy = cn.display?.y ?? 24 + i * 64;
              return (
                <div
                  key={cn.id}
                  className="ic-counter"
                  style={{ left: dx, top: dy, transform: `scale(${1 / scale})`, transformOrigin: 'left top' }}
                >
                  {cn.label ? <span className="ic-counter-label">{cn.label}</span> : null}
                  <span className="ic-counter-val">{val}</span>
                </div>
              );
            })}

          {bursts.map((bt) => (
            <div key={bt.id} className="ic-burst" style={{ left: bt.x, top: bt.y }}>
              {Array.from({ length: 10 }).map((_, i) => {
                const ang = (i / 10) * Math.PI * 2;
                const dist = 34 + (i % 3) * 14;
                return (
                  <span
                    key={i}
                    className="ic-spark"
                    style={{ ['--dx']: `${Math.round(Math.cos(ang) * dist)}px`, ['--dy']: `${Math.round(Math.sin(ang) * dist)}px`, background: i % 2 ? 'var(--ic-coral)' : '#fff' } as React.CSSProperties}
                  />
                );
              })}
            </div>
          ))}

          {singleSel && (
            <ElementSelectionBox
              box={boxOf(singleSel)}
              scale={scale}
              radius={singleSel.kind === 'shape' ? 18 : 8}
              rotation={rotDeg(singleSel)}
              onHandleDown={(e, corner) => onHandleDown(e, singleSel, corner)}
              onRotateDown={(e) => onRotateDown(e, singleSel)}
            />
          )}

          {/* 연결 포트 레이어 — 호버(또는 연결 드롭 대상) 요소의 좌·우 슬롯.
              빈 슬롯=새 연결, 채워진 슬롯=떼어내기. 마이보드 포트 렌더와 동일.
              요소·리사이즈 드래그 중엔 숨김(좌표가 흔들리므로). */}
          {showLinkUi && hoverElId && editingTextId !== hoverElId && !drag && !resize &&
            doc.elements.some((e) => e.id === hoverElId) &&
            (() => {
              const sz = 16 / scale;
              const bw = Math.max(1, 2 / scale);
              const ring = !!lk.current && lk.current.from !== hoverElId; // 드롭 대상 강조
              const dot = (key: string, slot: { x: number; y: number; connId?: string }, side: 'l' | 'r') => {
                const detach = slot.connId ? doc.connections.find((c) => c.id === slot.connId) : undefined;
                const filled = !!detach || ring;
                return (
                  <button
                    key={key}
                    title={detach ? '드래그해서 떼어내기 — 빈 곳에 놓으면 연결 해제' : '드래그해서 다른 요소와 연결'}
                    onPointerDown={(e) => onPortDown(e, hoverElId, side, slot, detach)}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      position: 'absolute',
                      left: slot.x,
                      top: slot.y,
                      width: sz,
                      height: sz,
                      transform: 'translate(-50%, -50%)',
                      borderRadius: 999,
                      border: `${bw}px solid var(--ic-coral)`,
                      background: filled ? 'var(--ic-coral)' : '#fff',
                      boxShadow: '0 2px 6px rgba(87, 75, 62, 0.25)',
                      cursor: detach ? 'grab' : 'crosshair',
                      zIndex: 7,
                      pointerEvents: 'auto',
                    }}
                  />
                );
              };
              return (
                <>
                  {(['l', 'r'] as const).map((side) => (
                    <Fragment key={side}>
                      {portSlots(hoverElId, side).map((slot, i) => dot(`${side}-${i}`, slot, side))}
                    </Fragment>
                  ))}
                </>
              );
            })()}
        </div>
      </div>

      {/* 이야기 나레이션 바 — 재생 중 하단 자막 + 이전/다음. 아이 대면(파스텔). */}
      {!preview && mode === 'play' && storyIdx !== null && storySteps[storyIdx] && (
        <div className="ic-narration">
          <button
            type="button"
            className="ic-narration-nav"
            onClick={() => gotoStep(storyIdx - 1)}
            disabled={storyIdx === 0}
            aria-label="이전"
          >
            <Icon name="chevronLeft" size={18} />
          </button>
          <div className="ic-narration-text">{storySteps[storyIdx].speak?.text ?? ''}</div>
          {storyIdx < storySteps.length - 1 ? (
            <button type="button" className="ic-narration-nav ic-narration-next inline-flex items-center gap-1" onClick={storyNext}>
              다음 <Icon name="chevronRight" size={16} />
            </button>
          ) : onComplete ? (
            <button type="button" className="ic-narration-nav ic-narration-next inline-flex items-center gap-1" onClick={() => onComplete()}>
              완료 <Icon name="check" size={16} />
            </button>
          ) : (
            <button type="button" className="ic-narration-nav ic-narration-next inline-flex items-center gap-1" onClick={() => gotoStep(0)}>
              <Icon name="reset" size={15} /> 다시
            </button>
          )}
        </div>
      )}
    </div>
  );
}
