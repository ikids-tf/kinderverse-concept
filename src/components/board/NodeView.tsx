import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Icon } from '@/lib/icons';
import { useBoardStore, type BoardNode } from '@/store/boardStore';
import { editTextCmd, captureNodes, pushRedesign } from '@/board/commands';
import { runWorkflowStep, type RunnerData, type StepKind } from '@/board/workflow';
import { saveFrameToFolder, fitFrameToChildren } from '@/board/frames';
import { runComposerChip, expandMindMapBranch, planFromNode, worksheetFromNode, composeFromPrompt, regenerateLibraryCards, type ComposerChip } from '@/board/composer';
import type { RouteTarget } from '@/ai/contract';
import type { RegistryPayload, WorksheetCardProps, WorksheetLayer } from '@/ui-registry/contracts';
import { WorksheetSheet, downloadWorksheetA4, printWorksheetA4 } from '@/ui-registry/worksheet-sheet';
import { separateImageLayers } from '@/ai/layers';
import { ensureThumb } from '@/board/imageLod';
import { MotionPathNode } from './MotionPathNode';

/* Renders one board node (reference board model): frame container, runner control,
   image card (real src), and content-sized sticky/text memos. Selection ring +
   drag handled by the parent canvas via onPointerDown. */

/** 텍스트 스타일 바가 열려 있는 동안 '바닥 고정'으로 동작할 노드 id들(트랜지언트 —
    스토어/undo/영속화에 포함되지 않는다). 사이즈 옵저버가 높이 변화 시 y를 보정한다. */
const BOTTOM_ANCHORED = new Set<string>();

/** 균일 스케일·회전을 노드 루트에 적용(중심 기준). 핸들(BoardCanvas)이 node.scale/
    node.rot을 바꾸면 카드 전체가 비율 그대로 커지고 회전한다. 선택 링도 함께 돈다. */
function rootTransform(n: BoardNode): React.CSSProperties {
  const s = n.scale ?? 1;
  const r = n.rot ?? 0;
  if (s === 1 && !r) return {};
  return { transform: `rotate(${r}deg) scale(${s})`, transformOrigin: 'center center' };
}

const COLOR_BG: Record<string, string> = {
  'accent-soft': 'bg-accent-soft',
  'surface-3': 'bg-surface-3',
  'surface-2': 'bg-surface-2',
  gold: 'bg-gold',
  'success-soft': 'bg-success-soft',
};

/* 정정 칩(P3-10): 라우팅이 틀렸을 때 한 번의 클릭으로 같은 프롬프트를 다른
   유형으로 다시 생성한다(원본 프레임은 유지 — 새 프레임이 옆에 생김). */
const REROUTES: Array<{ route: RouteTarget; tid: string; label: string }> = [
  { route: 'studio', tid: 'studio', label: '활동지·이미지로' },
  { route: 'plan', tid: 'play_plan', label: '놀이계획으로' },
  { route: 'writing', tid: 'writing', label: '통신문으로' },
  { route: 'mindmap', tid: 'mindmap', label: '생각그물로' },
];

/* 이동 애니메이션의 '기다리는 동작'(data.idle) — 모션 패스에 연결된 카드를 호버하면
   아래 선택 버튼이 나타난다. 동작 자체는 index.css의 kv-idle-* 키프레임. */
const IDLE_OPTIONS: Array<{ id: string; label: string; title: string }> = [
  { id: 'none', label: '없음', title: '기다림 동작 없음' },
  { id: 'bob', label: '둥실', title: '위아래로 둥실둥실 반복' },
  { id: 'fidget', label: '두리번', title: '랜덤하게 꼼지락거리며 기다리기' },
  { id: 'bounce', label: '콩콩', title: '가끔 콩콩 뛰기' },
];

/** 카드 '위' 화면 좌표에 고정 크기로 렌더(보드 줌/카드 크기와 무관) — 클릭(선택) 시
    표시. 보드 컨트롤과 같은 한 줄 알약(surface/95 + blur) 미니멀 스타일: 동작 세그먼트
    + 구분선 + 반경·속도 슬라이더. 값은 카드의 --idle-amp/--idle-speed 변수로 반영. */
function IdlePicker({ node }: { node: BoardNode }) {
  const vp = useBoardStore((s) => s.viewport);
  const cur = (node.data?.idle as string) ?? 'none';
  const cv = typeof document !== 'undefined' ? document.querySelector('[data-kv-canvas]') : null;
  if (!cv) return null;
  // 카드 기능은 카드 위, 라인 기능(▶ 등)은 경로 아래 — 영역을 분리해 겹치지 않는다.
  // 카드가 화면 위쪽이라 위 공간이 없으면 카드 아래로 자동 플립(뷰포트 밖 방지).
  const rect = cv.getBoundingClientRect();
  const sx = rect.left + vp.panX + (node.x + node.w / 2) * vp.zoom;
  const aboveY = rect.top + vp.panY + node.y * vp.zoom - 12;
  const flipBelow = aboveY < 84; // 툴바 높이 + 여유가 안 나오는 경우
  const visualH = typeof node.data?.renderH === 'number' ? (node.data.renderH as number) : node.h;
  const sy = flipBelow ? rect.top + vp.panY + (node.y + visualH) * vp.zoom + 12 : aboveY;
  const setData = (patch: Record<string, unknown>) => {
    const st = useBoardStore.getState();
    const n = st.nodes[node.id];
    if (!n) return;
    const data = { ...(n.data ?? {}), ...patch };
    for (const k of Object.keys(patch)) if (patch[k] === undefined) delete data[k];
    st.updateNodeRaw(node.id, { data });
  };
  const amp = Number(node.data?.idleAmp ?? 1);
  const speed = Number(node.data?.idleSpeed ?? 1);
  return createPortal(
    <div
      className="fixed z-50 flex items-center gap-t1 whitespace-nowrap rounded-pill border border-border bg-surface/95 px-t2 py-t1 shadow-md backdrop-blur"
      // width: max-content — fixed 요소는 화면 오른쪽까지 남은 공간으로 줄어들어
      // (shrink-to-fit) 카드가 우측에 있으면 글자가 세로로 꺾인다. 콘텐츠 폭으로 고정.
      style={{ left: sx, top: sy, width: 'max-content', transform: `translate(-50%, ${flipBelow ? '0' : '-100%'})` }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <span className="px-t1 text-overline text-fg-muted">동작</span>
      {IDLE_OPTIONS.map((o) => (
        <button
          key={o.id}
          title={o.title}
          onClick={(e) => {
            e.stopPropagation();
            setData({ idle: o.id === 'none' ? undefined : o.id });
          }}
          className={`rounded-pill px-t3 py-t1 text-sm font-medium transition-colors duration-150 ease-soft ${
            cur === o.id ? 'bg-accent text-on-accent' : 'text-fg-2 hover:bg-surface-2 hover:text-fg'
          }`}
        >
          {o.label}
        </button>
      ))}
      {cur !== 'none' && (
        <>
          <div className="mx-t1 h-5 w-px bg-border" />
          <label title="움직임 크기" className="flex items-center gap-t1 px-t1 text-overline text-fg-muted">
            반경
            <input
              type="range"
              min={0.3}
              max={8}
              step={0.1}
              value={amp}
              onChange={(e) => setData({ idleAmp: Number(e.target.value) })}
              className="w-24"
              style={{ accentColor: 'var(--accent)' }}
            />
          </label>
          <label title="움직임 속도" className="flex items-center gap-t1 px-t1 text-overline text-fg-muted">
            속도
            <input
              type="range"
              min={0.3}
              max={4}
              step={0.1}
              value={speed}
              onChange={(e) => setData({ idleSpeed: Number(e.target.value) })}
              className="w-24"
              style={{ accentColor: 'var(--accent)' }}
            />
          </label>
        </>
      )}
    </div>,
    document.body,
  );
}

/** Static drag-strips along a frame's 4 edges (hoisted — never changes). */
const FRAME_EDGE_STRIPS = [
  { left: 0, right: 0, top: 0, height: 16 },
  { left: 0, right: 0, bottom: 0, height: 16 },
  { top: 0, bottom: 0, left: 0, width: 16 },
  { top: 0, bottom: 0, right: 0, width: 16 },
] as const;

interface Props {
  node: BoardNode;
  selected: boolean;
  onPointerDown: (e: React.PointerEvent, id: string) => void;
  dx?: number;
  dy?: number;
  /** 저줌 LOD — true면 이미지 카드를 플레이스홀더+제목으로 강등(이미지 디코드 0). */
  lod?: boolean;
}

export function NodeView({ node, selected, onPointerDown, dx = 0, dy = 0, lod = false }: Props) {
  // 슬라이드 쇼(풀스크린) 진행 중 — 콘텐츠만 남기고 모든 보드 크롬(제목 탭·저장
  // 버튼·추천/정정 행·생성 배지)을 숨긴다. 일반 수업 모드에서는 숨기지 않는다.
  const presenting = useBoardStore((s) => s.show !== null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(node.text ?? '');
  const [layerBusy, setLayerBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  // 임베드 카드(GLB 뷰어) 프레젠테이션 모드 — iframe이 postMessage로 켜고 끈다.
  const [embedPresent, setEmbedPresent] = useState(false);
  const embedFrameRef = useRef<HTMLIFrameElement>(null);
  /** 모션 라인 연결 여부 미러 — 아래 message 리스너가 최신값을 읽는다(아래에서 계산). */
  const motionLinkedRef = useRef(false);
  useEffect(() => {
    if (typeof node.data?.embed !== 'string') return;
    const onMsg = (e: MessageEvent) => {
      if (e.source !== embedFrameRef.current?.contentWindow) return;
      const d = e.data as { type?: string; on?: boolean } | null;
      if (d?.type === 'kv-embed-present') {
        setEmbedPresent(!!d.on);
        // 프레젠테이션 진입 → 카드를 화면 중앙에 풀로(센터+줌) + 선택해서 모서리
        // 스케일 핸들로 크기를 더 키울 수 있게 한다.
        // 단, 모션 라인에 연결된 뷰어는 화면이 커지면 안 되므로 줌/선택을 생략한다.
        if (d.on && !motionLinkedRef.current) {
          const b = useBoardStore.getState();
          b.setSelection([node.id]);
          b.focusNode(node.id);
        }
      }
      // 뷰어 안 모델 클릭 → 이 카드를 선택(요소 클릭 = 동작 툴바·컨트롤 표시).
      if (d?.type === 'kv-embed-click') {
        useBoardStore.getState().setSelection([node.id]);
      }
    };
    // kv:embed-mode — 모션 라인 연결/해제가 뷰어의 프레젠테이션을 켜고 끈다.
    const onMode = (e: Event) => {
      const d = (e as CustomEvent).detail as { target?: string; present?: boolean } | null;
      if (!d || d.target !== node.id) return;
      const w = embedFrameRef.current?.contentWindow as
        | (Window & { kvSetPresent?: (on: boolean) => void })
        | null;
      w?.kvSetPresent?.(!!d.present);
    };
    window.addEventListener('message', onMsg);
    window.addEventListener('kv:embed-mode', onMode);
    return () => {
      window.removeEventListener('message', onMsg);
      window.removeEventListener('kv:embed-mode', onMode);
    };
  }, [node.id, node.data?.embed]);

  // 카드 선택 ↔ 뷰어 컨트롤(✕·동작보기·애니 바) 동기화 — 호버가 아니라 클릭(선택)
  // 했을 때만 컨트롤이 보인다. (뷰어 안에서 모델을 직접 클릭해도 토글된다.)
  useEffect(() => {
    if (typeof node.data?.embed !== 'string') return;
    const w = embedFrameRef.current?.contentWindow as
      | (Window & { kvSetChrome?: (on: boolean) => void })
      | null;
    w?.kvSetChrome?.(selected);
  }, [selected, node.data?.embed]);
  // 유튜브 검색 결과 카드의 ▶ → 이 뷰어(iframe)의 loadSrc로 바로 재생.
  // kv:yt-propose — 다른 요소와 선이 연결되면 뷰어 안에 "영상을 찾아 연결할까요?"
  // 확인 카드를 띄운다(확인 → 뷰어가 직접 검색해 재생).
  useEffect(() => {
    if (typeof node.data?.embed !== 'string') return;
    const onPlay = (e: Event) => {
      const d = (e as CustomEvent).detail as { videoId?: string; target?: string } | null;
      if (!d?.videoId || d.target !== node.id) return;
      const w = embedFrameRef.current?.contentWindow as (Window & { loadSrc?: (u: string) => void }) | null;
      w?.loadSrc?.(d.videoId);
    };
    const onPropose = (e: Event) => {
      const d = (e as CustomEvent).detail as { topic?: string; target?: string } | null;
      if (!d?.topic || d.target !== node.id) return;
      const w = embedFrameRef.current?.contentWindow as (Window & { proposeSearch?: (t: string) => void }) | null;
      w?.proposeSearch?.(d.topic);
    };
    // kv:motion-orient — 이동 애니메이션이 보내는 진행 방향(도). 3D 뷰어가
    // setHeading으로 카메라를 돌려 모델이 가는 쪽을 보게 한다(deg=null → 원복).
    const onOrient = (e: Event) => {
      const d = (e as CustomEvent).detail as { target?: string; deg?: number | null } | null;
      if (!d || d.target !== node.id) return;
      const w = embedFrameRef.current?.contentWindow as
        | (Window & { setHeading?: (deg: number) => void; clearHeading?: () => void })
        | null;
      if (typeof d.deg === 'number') w?.setHeading?.(d.deg);
      else w?.clearHeading?.();
    };
    window.addEventListener('kv:yt-play', onPlay);
    window.addEventListener('kv:yt-propose', onPropose);
    window.addEventListener('kv:motion-orient', onOrient);
    return () => {
      window.removeEventListener('kv:yt-play', onPlay);
      window.removeEventListener('kv:yt-propose', onPropose);
      window.removeEventListener('kv:motion-orient', onOrient);
    };
  }, [node.id, node.data?.embed]);
  const editable = node.type === 'sticky' || node.type === 'text' || node.type === 'image';

  // 이동 애니메이션에 연결된 카드인가(출발/도착) — 호버 시 '기다리는 동작' 선택 표시.
  const motionLinked = useBoardStore((s) =>
    Object.values(s.nodes).some(
      (n) => n.type === 'motion' && (n.data?.aStart === node.id || n.data?.aEnd === node.id),
    ),
  );
  motionLinkedRef.current = motionLinked; // 위 message 리스너용 미러
  // 대기 동작 클래스 — 독립 translate 속성 애니메이션이라 rotate/scale과 안 부딪힌다.
  // 모션 패스에 연결돼 있는 동안만 동작(라인이 분리되면 즉시 멈춘다).
  const idleCls = motionLinked && node.data?.idle ? ` kv-idle-${node.data.idle}` : '';
  // 반경·속도 — 피커 슬라이더 값이 카드 인라인 CSS 변수로 들어가 키프레임에 반영된다.
  const idleVars = (motionLinked && node.data?.idle
    ? { '--idle-amp': String(node.data.idleAmp ?? 1), '--idle-speed': String(node.data.idleSpeed ?? 1) }
    : {}) as React.CSSProperties;

  // 대기 동작 피커 — 카드를 '클릭(선택)'하면 카드 위에 나타나고, 선택을 풀면 닫힌다.
  const idlePickerVisible = motionLinked && !presenting && selected;

  // 만남 반응 — 이동 요소가 도착 요소에 닿으면 모션 노드가 kv:motion-meet을 쏜다.
  // 해당 카드는 한 번 통통 튀는 반응(WAAPI scale — transform과 합성, 리마운트 없음).
  useEffect(() => {
    const onMeet = (e: Event) => {
      const d = (e as CustomEvent).detail as { ids?: string[] } | null;
      if (!d?.ids?.includes(node.id)) return;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      cardRef.current?.animate(
        [{ scale: '1' }, { scale: '1.16' }, { scale: '0.94' }, { scale: '1' }],
        { duration: 520, easing: 'ease-out' },
      );
    };
    window.addEventListener('kv:motion-meet', onMeet);
    return () => window.removeEventListener('kv:motion-meet', onMeet);
  }, [node.id]);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  // 이미지 LOD(2-2): 보드 표시용 ~400px 썸네일을 백그라운드 생성(원본 node.src 보존).
  // 컬링 덕에 화면에 보인 카드만 이 이펙트를 타므로 자연히 lazy하게 처리된다.
  useEffect(() => {
    if (node.type === 'image' && node.src && !node.loading) ensureThumb(node.id);
  }, [node.id, node.type, node.src, node.loading]);

  // Content cards report their REAL rendered (outer) height into data.renderH so
  // the containing frame can grow to wrap them exactly. node.h alone understates
  // image cards (its h is only the image area; the caption adds height below).
  const measured = node.type === 'sticky' || node.type === 'text' || node.type === 'image';
  useEffect(() => {
    if (!measured) return;
    const el = cardRef.current;
    if (!el) return;
    const sync = () => {
      const h = Math.round(el.offsetHeight);
      const w = Math.round(el.offsetWidth);
      const cur = useBoardStore.getState().nodes[node.id];
      if (!cur) return;
      const prev = typeof cur.data?.renderH === 'number' ? cur.data.renderH : 0;
      // 텍스트 카드는 폭이 내용에 핏(fit-content)이므로 실측 폭을 node.w로 동기화 —
      // 선택 링·스케일 핸들·프레임 감싸기가 보이는 그대로의 박스를 쓰게 한다.
      const wDrift = cur.type === 'text' && w > 0 && Math.abs(cur.w - w) > 1;
      const hDrift = Math.abs(prev - h) > 1;
      if (!hDrift && !wDrift) return;
      // 바닥 고정(텍스트 스타일 바가 열려 있는 동안): 높이가 변해도 아래 모서리가
      // 제자리이도록 y를 보정 → 박스가 '위로' 자라고, 박스 하단에 붙은 스타일 바가
      // 사이즈 호버/변경에도 움직이지 않는다.
      const anchor = cur.type === 'text' && BOTTOM_ANCHORED.has(node.id) && prev > 0 && hDrift;
      useBoardStore.getState().updateNodeRaw(node.id, {
        ...(wDrift ? { w } : {}),
        ...(anchor ? { y: cur.y + (prev - h) } : {}),
        data: { ...(cur.data ?? {}), renderH: h },
      });
      const fid = cur.data?.frameId as string | undefined;
      if (fid) fitFrameToChildren(fid);
    };
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    // 외부 코드(레이아웃 등)가 store의 w를 덮어써도 화면 크기는 그대로라 RO가 발화하지
    // 않는다 — node.w가 바뀔 때 effect를 다시 돌려 실측값으로 즉시 교정한다(텍스트 핏).
    sync();
    return () => ro.disconnect();
  }, [node.id, measured, node.w]);

  function commit() {
    setEditing(false);
    editTextCmd(node.id, node.text ?? '', draft);
  }

  const left = node.x + dx;
  const top = node.y + dy;
  const ring = selected ? 'ring-2 ring-accent' : 'ring-1 ring-transparent';

  const down = (e: React.PointerEvent) => {
    // A pointer-down inside an editing field (textarea/input) must NOT start a card
    // drag — let the field handle drag-to-select text instead.
    if ((e.target as HTMLElement)?.closest?.('[data-kv-editable]')) return;
    onPointerDown(e, node.id);
  };
  const dbl = (e: React.MouseEvent) => {
    // 인라인 편집 필드(활동지 제목·안내 등) 안의 더블클릭은 그 필드가 처리하게 둔다.
    const t = e.target as HTMLElement | null;
    if (t?.closest?.('[data-kv-editable], [contenteditable="true"], input, textarea')) return;
    e.stopPropagation(); // 배경의 "전체 맞춤" 더블클릭이 같이 발동하지 않게
    // 더블클릭 → 이 카드를 화면 중앙에 풀로(센터 + 줌).
    useBoardStore.getState().focusNode(node.id);
    // 인라인 편집은 평문 카드(메모/텍스트/이미지 캡션)에서만. 문서 카드(계획안·통신문·
    // 관찰기록·활동지 등 data.doc)는 렌더된 형태를 유지하고 raw 마크다운 textarea를
    // 띄우지 않는다(활동지는 시트 내부의 제목·안내가 인라인 편집됨).
    const isDocCard = !!node.data?.doc;
    if (editable && !node.locked && !isDocCard) {
      setDraft(node.text ?? '');
      setEditing(true);
    }
  };

  /* ---------- motion: 이동 애니메이션 경로 (출발→도착 곡선 + 재생) ---------- */
  if (node.type === 'motion') {
    return (
      <MotionPathNode
        node={node}
        selected={selected}
        left={left}
        top={top}
        presenting={presenting}
        onPointerDown={onPointerDown}
      />
    );
  }

  /* ---------- frame: back container (interior click-through) ---------- */
  if (node.type === 'frame') {
    const title = (node.data?.title as string) ?? '프레임';
    const savedBundleId = node.data?.savedBundleId as string | undefined;
    const chips = (node.data?.nextSteps as ComposerChip[] | undefined) ?? [];
    const isSub = !!node.data?.sub; // nested section frame (e.g. 아이디어) — no save/chips chrome
    const renameTitle = (v: string) =>
      useBoardStore.getState().updateNodeRaw(node.id, { data: { ...node.data, title: v.trim() || '프레임' } });
    const frameBg = `border-2 ${selected ? 'border-accent' : isSub ? 'border-border/70' : 'border-border'} ${isSub ? 'bg-surface-2/50' : 'bg-surface/40'} shadow-md`;
    const loading = !!node.data?.loading;
    return (
      <div
        className="absolute"
        // While loading, lift the whole frame above the content cards (which render
        // later in the canvas) so the spinner overlay sits on top — not behind text.
        style={{ left, top, width: node.w, height: node.h, pointerEvents: 'none', zIndex: loading ? 50 : undefined, ...rootTransform(node) }}
      >
        <div className={`absolute inset-0 rounded-lg ${frameBg}`} />
        {/* edge grab strips — drag to move the frame */}
        {FRAME_EDGE_STRIPS.map((pos, i) => (
          <div
            key={i}
            onPointerDown={down}
            onDoubleClick={(e) => { e.stopPropagation(); useBoardStore.getState().focusNode(node.id); }}
            style={{ position: 'absolute', ...pos, pointerEvents: 'auto', cursor: 'grab' }}
          />
        ))}
        {/* title tab — drag to move, double-click to rename (숨김: 슬라이드 쇼) */}
        {!presenting && (
        <div
          onPointerDown={down}
          onDoubleClick={(e) => {
            e.stopPropagation();
            setDraft(title);
            setEditing(true);
          }}
          className={`absolute -top-7 left-0 inline-flex items-center gap-t1 rounded-md border px-t3 py-t1 text-overline shadow-sm ${
            selected ? 'border-accent bg-accent text-on-accent' : 'border-border bg-surface text-fg-2'
          }`}
          style={{ pointerEvents: 'auto', cursor: 'grab' }}
        >
          <Icon name="frame" size={12} />
          {editing ? (
            <input
              autoFocus
              data-kv-editable="true"
              value={draft}
              onPointerDown={(e) => e.stopPropagation()}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => { renameTitle(draft); setEditing(false); }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              className="w-28 bg-transparent text-overline focus:outline-none"
            />
          ) : (
            title
          )}
          {/* 생성 작업이 진행 중인 프레임 — 제목 탭에 미니 스피너 */}
          {!!node.data?.working && !editing && (
            <span className="ml-t1 inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent opacity-80" />
          )}
        </div>
        )}

        {/* save the whole frame to one folder (top composer frame only) */}
        {!isSub && !presenting && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); if (!savedBundleId) saveFrameToFolder(node.id); }}
          title="이 프레임을 폴더에 저장"
          className={`absolute -top-7 right-0 inline-flex items-center gap-t1 rounded-md border px-t2 py-t1 text-overline shadow-sm ${
            savedBundleId
              ? 'border-success/40 bg-success-soft text-success'
              : 'border-border bg-surface text-fg-2 hover:border-accent hover:text-accent'
          }`}
          style={{ pointerEvents: 'auto', cursor: 'pointer' }}
        >
          <Icon name={savedBundleId ? 'check' : 'folder'} size={12} /> {savedBundleId ? '저장됨' : '폴더에 저장'}
        </button>
        )}

        {/* 프레임 하단 안내 행들(추천 칩 · 정정 칩 · 보관함 안내) — 하나의 세로 flex
            컨테이너로 자연 스택. 칩이 줄바꿈돼도 다음 행이 절대 겹치지 않는다(이전:
            고정 오프셋 가정이라 칩 두 줄이면 행끼리 겹쳤다). 좁은 프레임에서도 한
            줄에 담기도록 최소 폭을 보장한다. */}
        {!isSub &&
          !presenting &&
          (chips.length > 0 ||
            typeof node.data?.sourcePrompt === 'string' ||
            !!(node.data?.libNotice as { items?: unknown[] } | undefined)?.items?.length) && (
          <div
            className="absolute left-0 flex flex-col items-start gap-t2"
            style={{ top: node.h + 8, width: Math.max(node.w, 480), pointerEvents: 'auto' }}
          >
            {/* next-step recommendation chips (subtle, never auto-run) */}
            {chips.length > 0 && (
              <div className="flex flex-wrap items-center gap-t1">
                <span className="text-overline text-fg-muted">추천</span>
                {chips.map((chip) => (
                  <button
                    key={chip.id}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); if (chip.status !== 'running') void runComposerChip(node.id, chip.id); }}
                    disabled={chip.status === 'running'}
                    className={`inline-flex items-center gap-t1 rounded-pill border px-t3 py-t1 text-sm shadow-sm backdrop-blur transition-colors duration-150 ease-soft ${
                      chip.status === 'done'
                        ? 'border-border bg-surface/70 text-fg-muted'
                        : 'border-border bg-surface/95 text-fg-2 hover:border-accent hover:text-accent'
                    }`}
                  >
                    {chip.status === 'running' ? (
                      <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-surface-3 border-t-accent" />
                    ) : (
                      <Icon name="sparkle" size={12} className="text-accent" />
                    )}
                    {chip.label}
                  </button>
                ))}
              </div>
            )}

            {/* 정정 칩(P3-10) — 라우팅이 틀렸을 때 같은 프롬프트를 다른 유형으로 */}
            {typeof node.data?.sourcePrompt === 'string' && (
              <div className="flex flex-wrap items-center gap-t1">
                <span className="text-overline text-fg-muted">다른 결과를 원하셨나요?</span>
                {REROUTES.filter(
                  (r) => r.tid !== (node.data?.mindmap ? 'mindmap' : (node.data?.templateId as string)),
                ).map((r) => (
                  <button
                    key={r.route}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      void composeFromPrompt(node.data?.sourcePrompt as string, r.route);
                    }}
                    className="inline-flex items-center gap-t1 rounded-pill border border-border bg-surface/80 px-t2 py-0.5 text-overline text-fg-muted hover:border-accent hover:text-accent"
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            )}

            {/* 보관함 재사용 안내 — 같은 이름의 그림을 생성 없이 가져다 썼을 때.
                [새로 생성]을 누르면 해당 카드들만 새 이미지로 다시 만든다. */}
            {!!(node.data?.libNotice as { items?: unknown[] } | undefined)?.items?.length && (
              <div className="flex flex-wrap items-center gap-t1">
                <span className="inline-flex items-center gap-t1 text-overline text-fg-muted">
                  <Icon name="folder" size={11} /> 보관함의 그림{' '}
                  {(node.data!.libNotice as { items: unknown[] }).items.length}장을 재사용했어요
                </span>
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); void regenerateLibraryCards(node.id); }}
                  className="inline-flex items-center gap-t1 rounded-pill border border-border bg-surface/90 px-t2 py-0.5 text-overline text-fg-2 hover:border-accent hover:text-accent"
                >
                  새로 생성
                </button>
              </div>
            )}
          </div>
        )}

        {/* in-frame loading — an opaque spinner-only overlay on TOP of everything in
            the frame (frame is z-lifted above the content cards while loading). */}
        {loading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center rounded-lg bg-surface" style={{ pointerEvents: 'none' }}>
            <span className="h-9 w-9 animate-spin rounded-full border-[3px] border-accent-soft border-t-accent" />
          </div>
        )}
      </div>
    );
  }

  /* ---------- runner: workflow control card ---------- */
  if (node.type === 'runner') {
    return <RunnerCard node={node} selected={selected} onPointerDown={onPointerDown} left={left} top={top} />;
  }

  /* ---------- image card (real src / loading / placeholder) ---------- */
  if (node.type === 'image') {
    return (
      <div
        ref={cardRef}
        onPointerDown={down}
        onDoubleClick={dbl}
        className={`group/card absolute select-none overflow-hidden rounded-md border border-border bg-surface shadow-sm ${ring}${idleCls}`}
        style={{ left, top, width: node.w, ...radiusStyle(node), ...rootTransform(node), ...idleVars }}
      >
        <div className="relative" style={{ width: '100%', height: node.h }}>
          {node.loading ? (
            <div className="flex h-full w-full items-center justify-center bg-surface-2 text-fg-muted">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-surface-3 border-t-accent" />
            </div>
          ) : node.src ? (
            lod ? (
              // 저줌 강등 — 디코드 비용 0의 플레이스홀더 + 제목(2-2)
              <div className="flex h-full w-full items-center justify-center bg-surface-3 px-t2 text-center">
                <span className="truncate text-overline text-fg-muted">{node.text || '이미지'}</span>
              </div>
            ) : (
              // 보드 표시는 썸네일(data.thumb), 원본(node.src)은 확대/편집/내보내기용.
              // flipX(이동 애니메이션 방향)는 그림에만 — 캡션 글자가 거울로 뒤집히지 않게.
              <img
                src={(node.data?.thumb as string | undefined) || node.src}
                alt={node.text ?? ''}
                draggable={false}
                className="h-full w-full object-cover"
                style={node.data?.flipX ? { transform: 'scaleX(-1)' } : undefined}
              />
            )
          ) : (
            <div className="flex h-full w-full items-center justify-center text-fg-muted">
              <Icon name="studio" size={24} />
            </div>
          )}
          {node.src && !lod && !presenting && (
            <span className="absolute left-1 top-1 rounded-pill bg-fg/75 px-t2 py-0.5 text-[10px] text-on-dark">
              {typeof node.data?.ytId === 'string' ? '유튜브' : node.data?.fromLibrary ? '보관함' : 'AI 생성'}
            </span>
          )}
          {/* 유튜브 검색 결과 — ▶를 누르면 연결된 뷰어 카드에서 바로 재생 */}
          {!node.loading && !lod && typeof node.data?.ytId === 'string' && (
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                window.dispatchEvent(new CustomEvent('kv:yt-play', {
                  detail: { videoId: node.data?.ytId, target: node.data?.ytTarget },
                }));
              }}
              title="뷰어에서 재생"
              className="absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-fg/60 text-on-dark shadow-md transition-colors duration-150 ease-soft hover:bg-accent"
            >
              <svg viewBox="0 0 24 24" width={16} height={16} fill="currentColor" aria-hidden>
                <path d="M8.5 6.2v11.6L18 12z" />
              </svg>
            </button>
          )}
          {selected && !node.locked && <RadiusHandle node={node} />}
        </div>
        {(node.text || editing) && (
          <div className="group/cap relative px-t2 py-t1">
            {editing ? (
              <textarea
                ref={ref}
                data-kv-editable="true"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                className="w-full resize-none bg-transparent text-center text-overline text-fg focus:outline-none"
              />
            ) : (
              <>
                <span className="block truncate px-5 text-center text-xs font-semibold text-fg" title={imgTitle(node.text)}>{imgTitle(node.text)}</span>
                {/* hover the caption → X to delete the text (undoable) */}
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); editTextCmd(node.id, node.text ?? '', ''); }}
                  title="텍스트 삭제"
                  className="absolute right-1 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-surface text-fg-2 opacity-0 shadow-sm transition-opacity duration-150 ease-soft hover:border-danger hover:bg-danger-soft hover:text-danger group-hover/cap:opacity-100"
                >
                  <Icon name="x" size={11} />
                </button>
              </>
            )}
          </div>
        )}
        {node.locked && <LockBadge />}
        {/* 모션 연결 카드 — 클릭(선택)하면 카드 위 고정 크기 툴바(동작 + 반경·속도) */}
        {idlePickerVisible && <IdlePicker node={node} />}
      </div>
    );
  }

  /* ---------- sticky / memo · A4 document (data.doc) ---------- */
  if (node.type === 'sticky') {
    // 임베드 카드(GLB 뷰어 등) — 상단 헤더로만 드래그, 본문은 iframe이 입력을 받는다.
    // 프레젠테이션 모드(뷰어의 전체 화면 버튼): 카드 테두리·헤더·배경을 모두 숨겨
    // 3D 모델이 보드 위에 바로 떠 있는 것처럼 보인다.
    if (typeof node.data?.embed === 'string') {
      const embedTitle = (node.data?.title as string) ?? '뷰어';
      return (
        <div
          ref={cardRef}
          className={`group/card absolute select-none overflow-hidden rounded-xl ${
            embedPresent
              ? 'border border-transparent bg-transparent shadow-none'
              : `border border-border bg-surface shadow-lg ${ring}`
          }${idleCls}`}
          style={{ left, top, width: node.w, height: node.h, ...rootTransform(node), ...idleVars }}
        >
          {!embedPresent && (
            <div
              onPointerDown={down}
              className="flex items-center gap-t2 border-b border-border bg-bg-deep/60 px-t3 py-t2"
              style={{ cursor: 'grab' }}
            >
              <Icon name="frame" size={14} className="text-accent" />
              <span className="text-overline text-fg-2">{embedTitle}</span>
            </div>
          )}
          <iframe
            ref={embedFrameRef}
            src={node.data.embed as string}
            title={embedTitle}
            className="block w-full"
            style={{ border: 0, height: embedPresent ? '100%' : 'calc(100% - 33px)', background: 'transparent' }}
          />
          {node.locked && <LockBadge />}
          {/* 모션 연결 카드 — 모델(iframe)을 클릭하면 kv-embed-click으로 카드가
              선택되고, 선택되면 카드 위 고정 크기 툴바(동작 + 반경·속도)가 열린다. */}
          {idlePickerVisible && <IdlePicker node={node} />}
        </div>
      );
    }
    // Mind-map center — the topic, a prominent coral node.
    if (node.data?.role === 'mm-center') {
      return (
        <div
          ref={cardRef}
          onPointerDown={down}
          onDoubleClick={dbl}
          className={`absolute z-10 flex select-none items-center justify-center rounded-2xl border-2 border-accent bg-accent px-t4 py-t3 text-center shadow-lg ${ring}`}
          style={{ left, top, width: node.w, ...(node.autoH ? { minHeight: node.h } : { height: node.h }), ...rootTransform(node) }}
        >
          {editing ? (
            <textarea
              ref={ref}
              data-kv-editable="true"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              className="w-full resize-none bg-transparent text-center font-display text-h4 font-semibold text-on-accent focus:outline-none"
            />
          ) : (
            <p className="font-display text-h4 font-semibold leading-tight text-on-accent">{node.text || '주제'}</p>
          )}
          {Array.isArray(node.data?.decorations) && <StickerDecos items={node.data.decorations as StickerDecoData[]} />}
          {node.locked && <LockBadge />}
        </div>
      );
    }
    const isDoc = !!node.data?.doc;
    const isIdea = node.data?.role === 'idea'; // selectable idea pick (in the 아이디어 sub-frame)
    const coverImage = node.data?.coverImage as string | undefined; // newsletter cover
    // 활동지 = 인쇄용 A4 한 장. 제목·안내는 텍스트 레이어, 그림은 생성 이미지.
    const wsPayload = node.data?.payload as RegistryPayload | undefined;
    const worksheetProps: WorksheetCardProps | undefined =
      wsPayload?.type === 'WorksheetCard' ? wsPayload.props : undefined;
    const worksheetImg = worksheetProps?.image_url;
    const heroImage = coverImage;
    const heroContain = false;
    const docImages = Array.isArray(node.data?.docImages) ? (node.data.docImages as string[]) : [];
    const loadingDoc = !!node.data?.loadingDoc;
    // 활동지엔 장식 스티커를 붙이지 않는다(인쇄·오리기에 방해).
    const decorations = worksheetProps
      ? []
      : Array.isArray(node.data?.decorations)
        ? (node.data.decorations as StickerDecoData[])
        : [];
    // 활동지 제목·안내 인라인 수정 → 노드 payload 갱신.
    const editWorksheet = (patch: Partial<WorksheetCardProps>) => {
      const cur = useBoardStore.getState().nodes[node.id];
      const p = cur?.data?.payload as RegistryPayload | undefined;
      if (p?.type !== 'WorksheetCard') return;
      useBoardStore.getState().updateNodeRaw(node.id, {
        data: { ...cur.data, payload: { ...p, props: { ...p.props, ...patch } } },
      });
    };
    // 레이어 분리 — 그림을 요소별로 나눠 이동·스케일. node.data에 편집 상태 보관.
    const wsLayers = Array.isArray(node.data?.layers) ? (node.data.layers as WorksheetLayer[]) : undefined;
    const layersOn = !!node.data?.layersOn;
    const setLayers = (next: WorksheetLayer[]) => {
      const cur = useBoardStore.getState().nodes[node.id];
      useBoardStore.getState().updateNodeRaw(node.id, { data: { ...cur?.data, layers: next } });
    };
    const toggleLayers = async () => {
      const cur = useBoardStore.getState().nodes[node.id];
      if (layersOn) {
        useBoardStore.getState().updateNodeRaw(node.id, { data: { ...cur?.data, layersOn: false } });
        return;
      }
      const cached = cur?.data?.layers as WorksheetLayer[] | undefined;
      if (cached?.length) {
        useBoardStore.getState().updateNodeRaw(node.id, { data: { ...cur?.data, layersOn: true } });
        return;
      }
      if (!worksheetImg) return;
      setLayerBusy(true);
      const { layers } = await separateImageLayers(worksheetImg);
      setLayerBusy(false);
      if (!layers.length) return;
      const c2 = useBoardStore.getState().nodes[node.id];
      useBoardStore.getState().updateNodeRaw(node.id, { data: { ...c2?.data, layers, layersOn: true } });
    };
    const srcLinks = node.data?.role === 'source' && Array.isArray(node.data?.links)
      ? (node.data.links as SourceLinkData[])
      : null;
    // 노트 메모(괘선) — 텍스트가 줄 위에 정확히 얹히도록 26px 줄 높이로 통일 렌더.
    const isNote = !isDoc && !srcLinks && node.data?.deco === 'note';
    return (
      <div
        ref={cardRef}
        onPointerDown={down}
        onDoubleClick={srcLinks ? undefined : dbl}
        className={`group absolute select-none shadow-md ${ring} ${isIdea ? 'cursor-pointer' : ''} ${
          isDoc
            ? `rounded-lg border border-border bg-surface ${worksheetProps ? 'overflow-hidden p-0' : 'p-t6'}`
            : srcLinks
              ? 'rounded-lg border border-border bg-surface-2 p-t4'
              : `rounded-md ${COLOR_BG[node.color ?? 'accent-soft'] ?? 'bg-accent-soft'} p-t3`
        }`}
        style={{
          left,
          top,
          width: node.w,
          ...(node.autoH ? { minHeight: node.h } : { height: node.h }),
          // 노트 메모(data.deco='note') — 가로 괘선 노트 배경. 패턴을 패딩(12px)+1px
          // 내려 그려서 26px 줄 높이의 각 텍스트 줄 '바로 아래'에 괘선이 깔린다.
          ...(isNote
            ? {
                backgroundImage:
                  'repeating-linear-gradient(transparent, transparent 25px, var(--sand-line) 25px, var(--sand-line) 26px)',
                backgroundPosition: '0 13px',
              }
            : {}),
          ...(!isDoc && !srcLinks ? radiusStyle(node) : {}),
          ...rootTransform(node),
        }}
      >
        {srcLinks ? (
          <SourceLinks
            links={srcLinks}
            thumbs={Array.isArray(node.data?.thumbs) ? (node.data.thumbs as SourceThumbData[]) : undefined}
            summary={node.data?.summary as string | undefined}
          />
        ) : editing ? (
          <textarea
            ref={ref}
            data-kv-editable="true"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            rows={Math.max(3, draft.split('\n').length)}
            // 노트는 편집 중에도 괘선과 같은 26px 줄 높이를 유지(타이핑해도 줄 위에 얹힘).
            style={isNote ? { lineHeight: '26px' } : undefined}
            className={`w-full resize-none bg-transparent text-sm ${isNote ? '' : 'leading-relaxed'} text-fg focus:outline-none`}
          />
        ) : isDoc && worksheetProps ? (
          // 활동지 = 인쇄용 A4 한 장(제목·안내=텍스트 레이어, 그림=생성 이미지).
          // 호버 시 A4 PNG 다운로드/인쇄 버튼.
          <div className="group/ws relative">
            <WorksheetSheet
              props={worksheetProps}
              editable={!node.locked && !layersOn}
              onEdit={editWorksheet}
              layers={layersOn ? (wsLayers ?? []) : undefined}
              onLayersChange={setLayers}
            />
            {worksheetImg && (
              <div className="absolute right-2 top-2 z-20 flex gap-1 opacity-0 transition-opacity duration-150 group-hover/ws:opacity-100">
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); void toggleLayers(); }}
                  disabled={layerBusy}
                  className={`inline-flex items-center gap-t1 rounded-pill px-t3 py-1 text-xs font-semibold shadow-md disabled:opacity-70 ${
                    layersOn
                      ? 'bg-surface text-fg ring-1 ring-border hover:bg-surface-2'
                      : 'bg-fg text-on-dark hover:opacity-90'
                  }`}
                  title={layersOn ? '원본 그림으로 되돌리기' : '그림을 요소별 레이어로 분리(이동·크기 조절)'}
                >
                  {layerBusy ? (
                    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-on-dark/40 border-t-on-dark" />
                  ) : (
                    <Icon name="layers" size={14} />
                  )}
                  {layersOn ? '원본' : layerBusy ? '분석 중' : '레이어 분리'}
                </button>
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); void downloadWorksheetA4(worksheetProps, layersOn ? wsLayers : undefined); }}
                  className="inline-flex items-center gap-t1 rounded-pill bg-accent px-t3 py-1 text-xs font-semibold text-on-accent shadow-md hover:bg-accent-hover"
                >
                  <Icon name="download" size={14} /> 다운로드
                </button>
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); void printWorksheetA4(worksheetProps, layersOn ? wsLayers : undefined); }}
                  className="inline-flex items-center gap-t1 rounded-pill bg-fg px-t3 py-1 text-xs font-semibold text-on-dark shadow-md hover:opacity-90"
                >
                  <Icon name="print" size={14} /> 인쇄
                </button>
              </div>
            )}
          </div>
        ) : isDoc ? (
          <div className="kv-doc-md text-sm leading-relaxed text-fg">
            {heroImage && (
              <img
                src={heroImage}
                alt=""
                draggable={false}
                className={`mb-t4 block w-full rounded-md border border-border ${heroContain ? 'bg-white object-contain' : 'object-cover'}`}
                style={heroContain ? { maxHeight: 640 } : { maxHeight: 220 }}
              />
            )}
            <Markdown remarkPlugins={[remarkGfm]}>{node.text || ''}</Markdown>
            {docImages.length > 0 && (
              <div className="mt-t4 grid grid-cols-2 gap-t2">
                {docImages.map((src, i) => (
                  <img
                    key={i}
                    src={src}
                    alt=""
                    draggable={false}
                    className="block w-full rounded-md border border-border object-cover"
                    style={{ maxHeight: 150 }}
                  />
                ))}
              </div>
            )}
            {loadingDoc && (
              <span className="mt-t2 inline-flex items-center gap-t2 text-overline text-fg-muted">
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-surface-3 border-t-accent" />
                생성 중…
              </span>
            )}
          </div>
        ) : isNote ? (
          // 노트: 제목/본문 구분 없이 모든 줄을 괘선 주기(26px)에 맞춰 정렬.
          <p
            className={`whitespace-pre-wrap text-sm ${node.text ? 'text-fg' : 'text-fg-muted'}`}
            style={{ lineHeight: '26px' }}
          >
            {node.text || '노트…'}
          </p>
        ) : (
          <MemoText text={node.text} />
        )}
        {/* idea pick affordance — empty ring = selectable, coral check = selected */}
        {isIdea && (
          <span
            className={`absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border shadow-sm ${
              selected ? 'border-accent bg-accent text-on-accent' : 'border-border bg-surface'
            }`}
          >
            {selected && <Icon name="check" size={12} />}
          </span>
        )}
        {/* mind-map branch → hover toolbar: 확장(하위활동) · 계획안 · 활동지.
            One idea → expand the map, or generate a connected plan/worksheet. */}
        {node.data?.role === 'mm-branch' && (
          <div
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute -bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-pill border border-border bg-surface px-1 py-1 opacity-0 shadow-lg transition-opacity duration-150 ease-soft group-hover:opacity-100"
          >
            <button
              onClick={(e) => { e.stopPropagation(); void expandMindMapBranch(node.id); }}
              title="하위 활동으로 확장"
              className="flex h-7 w-7 items-center justify-center rounded-full text-fg-2 transition-colors duration-150 ease-soft hover:bg-accent hover:text-on-accent"
            >
              <Icon name="plus" size={16} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); void planFromNode(node.id); }}
              title="이 활동으로 계획안 만들기"
              className="flex h-7 w-7 items-center justify-center rounded-full text-fg-2 transition-colors duration-150 ease-soft hover:bg-accent hover:text-on-accent"
            >
              <Icon name="calendar" size={15} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); void worksheetFromNode(node.id); }}
              title="이 활동으로 활동지 만들기"
              className="flex h-7 w-7 items-center justify-center rounded-full text-fg-2 transition-colors duration-150 ease-soft hover:bg-accent hover:text-on-accent"
            >
              <Icon name="writing" size={15} />
            </button>
          </div>
        )}
        {/* Design Director — decorate: theme stickers "stuck" on the corners. */}
        <StickerDecos items={decorations} />
        {/* 우상단 라운드 코너 드래그 핸들 — 일반 메모(포스트잇·노트)만 */}
        {selected && !editing && !isDoc && !srcLinks && !isIdea && !node.locked && <RadiusHandle node={node} />}
        {node.locked && <LockBadge />}
      </div>
    );
  }

  /* ---------- text · frame header (role:header) ---------- */
  if (node.type === 'text') {
    const isHeader = node.data?.role === 'header';
    const sizeKey = (node.data?.fontSize as TextSizeKey) ?? (isHeader ? 'h2' : 'h4');
    // px 크기(data.fontPx, T 메뉴 드롭다운)가 있으면 토큰 크기 클래스 대신 적용.
    const fontPx = typeof node.data?.fontPx === 'number' ? (node.data.fontPx as number) : undefined;
    // 글씨체(data.fontFam): 세리프(font-display) / 고딕(font-sans) — 디자인 토큰 2종만.
    const famKey = node.data?.fontFam as 'serif' | 'sans' | undefined;
    const famCls = famKey
      ? famKey === 'sans'
        ? 'font-sans'
        : 'font-display'
      : sizeKey === 'base' || sizeKey === 'sm'
        ? 'font-sans'
        : 'font-display';
    const sizeCls = fontPx ? '' : (TEXT_SIZE_ONLY[sizeKey] ?? TEXT_SIZE_ONLY.h4);
    const font = `${famCls} ${sizeCls}${node.data?.bold ? ' font-bold' : ''}`;
    const pxStyle: React.CSSProperties = fontPx ? { fontSize: fontPx, lineHeight: 1.35 } : {};
    // 배경 스타일(data.box): 버튼(코랄 필) · 사각 박스 · 원형(필) 박스 — 환경판 라벨용.
    const boxKind = node.data?.box as string | undefined;
    const boxCls =
      boxKind === 'button'
        ? 'rounded-pill bg-accent px-t4 py-t2 shadow-sm'
        : boxKind === 'rect'
          ? 'rounded-md border border-border bg-surface px-t3 py-t2 shadow-sm'
          : boxKind === 'round'
            ? 'rounded-pill border border-border bg-surface px-t4 py-t2 shadow-sm'
            : 'rounded-sm px-t2';
    const colorCls =
      boxKind === 'button'
        ? 'text-on-accent'
        : node.data?.accent
          ? 'text-accent'
          : sizeKey === 'sm'
            ? 'text-fg-2'
            : 'text-fg';
    // 텍스트 박스는 항상 내용에 핏 — 짧으면 좁게, 길면 줄바꿈 한도(max)까지 늘어난다.
    // 실측 폭은 사이즈 옵저버가 node.w로 동기화. 편집 중엔 textarea가 기준 폭을
    // 가져야 하므로 현재 측정 폭(node.w)으로 고정해 점프를 막는다.
    const fitW: React.CSSProperties = editing
      ? { width: node.w }
      : { width: 'max-content', minWidth: 40, maxWidth: 520 };
    return (
      <div
        ref={cardRef}
        onPointerDown={down}
        onDoubleClick={dbl}
        className={`absolute select-none ${boxCls} ${ring}`}
        style={{
          left,
          top,
          ...fitW,
          ...(node.autoH ? { minHeight: node.h } : { height: node.h }),
          ...(boxKind ? radiusStyle(node) : {}),
          ...rootTransform(node),
        }}
      >
        {editing ? (
          <textarea
            ref={ref}
            data-kv-editable="true"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            style={pxStyle}
            className={`w-full resize-none bg-transparent ${font} ${colorCls} focus:outline-none`}
          />
        ) : (
          <p style={pxStyle} className={`whitespace-pre-wrap ${font} ${colorCls}`}>{node.text || '텍스트'}</p>
        )}
        {/* designed header rule — a short coral underline */}
        {isHeader && !editing && <span className="mt-t1 block h-[3px] w-14 rounded-pill bg-accent" />}
        {/* 선택 시 하단 중앙 T 버튼 → 심플한 텍스트 스타일 바 */}
        {selected && !editing && !node.locked && <TextStyleMenu node={node} sizeKey={sizeKey} />}
        {/* 배경 박스가 있는 텍스트만 — 우상단 라운드 코너 드래그 핸들 */}
        {selected && !editing && !node.locked && !!boxKind && (
          <RadiusHandle node={node} defaultRadius={boxKind === 'rect' ? 10 : 999} />
        )}
        {node.locked && <LockBadge />}
      </div>
    );
  }

  /* ---------- shape (사각형 · 원 · 별 · 하트 · 띠 라벨) ---------- */
  const shapeKind = (node.data?.shape as string) ?? 'rect';
  // 별·하트는 SVG 패스(fill=색 토큰) — 박스가 아닌 실제 모양으로 그린다.
  if (shapeKind === 'star' || shapeKind === 'heart') {
    return (
      <div
        onPointerDown={down}
        className={`absolute ${COLOR_TEXT[node.color ?? (shapeKind === 'heart' ? 'accent-soft' : 'gold')] ?? 'text-surface-3'} ${ring} rounded-md`}
        style={{ left, top, width: node.w, height: node.h, ...rootTransform(node) }}
      >
        <svg viewBox="0 0 24 24" width="100%" height="100%" preserveAspectRatio="none" aria-hidden>
          <path d={SHAPE_PATHS[shapeKind]} fill="currentColor" stroke="var(--sand-line)" strokeWidth={0.5} />
        </svg>
        {node.locked && <LockBadge />}
      </div>
    );
  }
  const shapeRadius = shapeKind === 'circle' ? 'rounded-full' : shapeKind === 'pill' ? 'rounded-pill' : 'rounded-lg';
  return (
    <div
      onPointerDown={down}
      className={`absolute border border-border ${shapeRadius} ${COLOR_BG[node.color ?? 'surface-3'] ?? 'bg-surface-3'} ${ring}`}
      style={{ left, top, width: node.w, height: node.h, ...rootTransform(node) }}
    >
      {node.locked && <LockBadge />}
    </div>
  );
}

/* 도형 색 토큰 → 텍스트 색 클래스(SVG fill=currentColor용). 임의 hex 금지(CLAUDE §2-1). */
const COLOR_TEXT: Record<string, string> = {
  'accent-soft': 'text-accent-soft',
  'surface-3': 'text-surface-3',
  'surface-2': 'text-surface-2',
  gold: 'text-gold',
  'success-soft': 'text-success-soft',
};

/** 별·하트 SVG 패스(24×24 viewBox, preserveAspectRatio=none으로 노드 박스에 맞춤). */
export const SHAPE_PATHS: Record<string, string> = {
  star: 'M12 1.8l3.1 6.3 6.9 1-5 4.9 1.2 6.9L12 17.6l-6.2 3.3L7 14 2 9.1l6.9-1z',
  heart:
    'M12 21.4l-1.5-1.3C5.4 15.4 2 12.3 2 8.5 2 5.4 4.4 3 7.5 3c1.7 0 3.4.8 4.5 2.1C13.1 3.8 14.8 3 16.5 3 19.6 3 22 5.4 22 8.5c0 3.8-3.4 6.9-8.5 11.6z',
};

/* ---- text style system (toolbar presets + T menu share data.fontSize/fontPx/fontFam/bold/accent) ---- */
type TextSizeKey = 'h2' | 'h4' | 'base' | 'sm';
/** 크기 토큰 클래스(글씨체와 분리 — data.fontFam이 family를 따로 정한다). */
const TEXT_SIZE_ONLY: Record<TextSizeKey, string> = {
  h2: 'text-h2 font-semibold',
  h4: 'text-h4',
  base: 'text-body',
  sm: 'text-sm',
};
/** 레거시 크기 키 → 드롭다운 표시용 근사 px. */
const LEGACY_PX: Record<TextSizeKey, number> = { h2: 28, h4: 20, base: 16, sm: 14 };
/** 자주 쓰는 텍스트 크기 10단계(px) — 라벨(12)부터 환경판 큰 제목(48)까지. */
const FONT_PX_OPTIONS = [12, 14, 16, 18, 20, 24, 28, 32, 40, 48];
const FONT_FAMS: Array<{ k: 'serif' | 'sans'; label: string; cls: string }> = [
  { k: 'serif', label: '세리프', cls: 'font-display' },
  { k: 'sans', label: '고딕', cls: 'font-sans' },
];

/** 텍스트 데이터 스타일 변경 — 한 클릭 = 한 번의 ⌘Z. */
function setTextStyle(id: string, patch: Record<string, unknown>) {
  const before = captureNodes([id]);
  const cur = useBoardStore.getState().nodes[id];
  if (!cur) return;
  useBoardStore.getState().updateNodeRaw(id, { data: { ...(cur.data ?? {}), ...patch } });
  pushRedesign([id], before, '텍스트 스타일');
}

/** 선택된 텍스트 박스 하단 중앙의 T 버튼 + 심플 스타일 바
    (글씨체 드롭다운 · 크기 드롭다운(10단계) · 굵게 · 색 2종). */
function TextStyleMenu({ node, sizeKey }: { node: BoardNode; sizeKey: TextSizeKey }) {
  const [open, setOpen] = useState(false);
  const [dd, setDd] = useState<'font' | 'size' | null>(null);
  // 바는 '여는 순간'의 화면 좌표에 portal+fixed로 고정 — 텍스트 박스가 어떻게
  // 자라거나 움직여도(크기 호버 미리보기 포함) 바는 픽셀 하나 움직이지 않는다.
  const anchorRef = useRef<HTMLDivElement>(null);
  const [barPos, setBarPos] = useState<{ x: number; y: number } | null>(null);
  const openBar = () => {
    const r = anchorRef.current?.getBoundingClientRect();
    setBarPos(
      r
        ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top) }
        : { x: Math.round(window.innerWidth / 2), y: Math.round(window.innerHeight / 2) },
    );
    setOpen(true);
  };
  const closeBar = () => {
    setOpen(false);
    setDd(null);
    setBarPos(null);
  };
  // 바가 열려 있는 동안 박스를 '바닥 고정' — 크기 호버/변경 시 박스가 위로 자라서,
  // 박스 하단에 붙은 이 스타일 바가 움직이지 않는다(NodeView 옵저버가 y 보정).
  // 스토어/undo/영속화에 섞이지 않게 트랜지언트 Set으로만 표시한다.
  useEffect(() => {
    if (open) BOTTOM_ANCHORED.add(node.id);
    else BOTTOM_ANCHORED.delete(node.id);
    return () => { BOTTOM_ANCHORED.delete(node.id); };
  }, [open, node.id]);
  // 사이즈 호버 미리보기 — 올리면 그 크기로 즉시 보이고, 클릭 없이 떠나면 원복.
  // 커밋(클릭) 전에 원래 값으로 되돌린 뒤 setTextStyle을 타야 ⌘Z가 진짜 이전값을 복원한다.
  const previewRef = useRef<{ orig: number | undefined } | null>(null);
  const previewSize = (n: number) => {
    const cur = useBoardStore.getState().nodes[node.id];
    if (!cur) return;
    if (!previewRef.current) previewRef.current = { orig: cur.data?.fontPx as number | undefined };
    useBoardStore.getState().updateNodeRaw(node.id, { data: { ...(cur.data ?? {}), fontPx: n } });
  };
  const revertPreview = () => {
    const p = previewRef.current;
    if (!p) return;
    previewRef.current = null;
    const cur = useBoardStore.getState().nodes[node.id];
    if (!cur) return;
    const data = { ...(cur.data ?? {}) };
    if (p.orig === undefined) delete data.fontPx;
    else data.fontPx = p.orig;
    useBoardStore.getState().updateNodeRaw(node.id, { data });
  };
  const commitSize = (n: number) => {
    revertPreview();
    setTextStyle(node.id, { fontPx: n });
    setDd(null);
  };
  const bold = !!node.data?.bold;
  const accent = !!node.data?.accent;
  const fontPx = typeof node.data?.fontPx === 'number' ? (node.data.fontPx as number) : LEGACY_PX[sizeKey];
  const famKey =
    (node.data?.fontFam as 'serif' | 'sans' | undefined) ??
    (sizeKey === 'base' || sizeKey === 'sm' ? 'sans' : 'serif');
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <div
      ref={anchorRef}
      onPointerDown={stop}
      onDoubleClick={stop}
      className="absolute -bottom-10 left-1/2 z-20 -translate-x-1/2"
    >
      {!open && (
        <button
          title="텍스트 스타일"
          onClick={openBar}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-surface font-display text-sm font-semibold text-fg-2 shadow-md transition-colors duration-150 ease-soft hover:border-accent hover:text-accent"
        >
          T
        </button>
      )}
      {open && barPos && createPortal(
        <div
          onPointerDown={stop}
          onDoubleClick={stop}
          style={{ position: 'fixed', left: barPos.x, top: barPos.y, transform: 'translateX(-50%)', zIndex: 60 }}
        >
        <div className="flex items-center gap-t1 whitespace-nowrap rounded-pill border border-border bg-surface px-t2 py-t1 shadow-lg">
          {/* 글씨체 드롭다운 */}
          <span className="relative">
            <button
              title="글씨체"
              onClick={() => setDd(dd === 'font' ? null : 'font')}
              className={`flex h-7 items-center gap-t1 rounded-pill px-t2 text-sm transition-colors duration-150 ease-soft ${
                dd === 'font' ? 'bg-surface-2 text-fg' : 'text-fg-2 hover:bg-surface-2 hover:text-fg'
              } ${famKey === 'sans' ? 'font-sans' : 'font-display'}`}
            >
              {famKey === 'sans' ? '고딕' : '세리프'}
              <span className="text-[9px] leading-none text-fg-muted">▾</span>
            </button>
            {dd === 'font' && (
              <div className="absolute left-0 top-full z-30 mt-t1 w-24 rounded-md border border-border bg-surface py-t1 shadow-lg">
                {FONT_FAMS.map((f) => (
                  <button
                    key={f.k}
                    onClick={() => { setTextStyle(node.id, { fontFam: f.k }); setDd(null); }}
                    className={`flex w-full items-center px-t3 py-t1 text-sm transition-colors duration-150 ease-soft ${f.cls} ${
                      famKey === f.k ? 'text-accent' : 'text-fg-2 hover:bg-surface-2 hover:text-fg'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}
          </span>
          {/* 크기 드롭다운 — 자주 쓰는 10단계 */}
          <span className="relative">
            <button
              title="크기"
              onClick={() => setDd(dd === 'size' ? null : 'size')}
              className={`flex h-7 items-center gap-t1 rounded-pill px-t2 font-sans text-sm tabular-nums transition-colors duration-150 ease-soft ${
                dd === 'size' ? 'bg-surface-2 text-fg' : 'text-fg-2 hover:bg-surface-2 hover:text-fg'
              }`}
            >
              {fontPx}
              <span className="text-[9px] leading-none text-fg-muted">▾</span>
            </button>
            {dd === 'size' && (
              // 10단계를 스크롤 없이 '가로 한 줄'로 — 버튼 아래 중앙 정렬 필 바.
              // 호버 = 그 크기로 라이브 미리보기, 클릭 = 확정, 떠나면 원복.
              <div
                onMouseLeave={revertPreview}
                className="absolute left-1/2 top-full z-30 mt-t1 flex -translate-x-1/2 items-center gap-t1 whitespace-nowrap rounded-pill border border-border bg-surface px-t2 py-t1 shadow-lg"
              >
                {FONT_PX_OPTIONS.map((n) => (
                  <button
                    key={n}
                    onMouseEnter={() => previewSize(n)}
                    onClick={() => commitSize(n)}
                    className={`flex h-6 min-w-6 items-center justify-center rounded-full px-t1 font-sans text-sm tabular-nums transition-colors duration-150 ease-soft ${
                      fontPx === n ? 'bg-accent text-on-accent' : 'text-fg-2 hover:bg-surface-2 hover:text-fg'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}
          </span>
          <span className="mx-t1 h-4 w-px bg-border" />
          <button
            title="굵게"
            onClick={() => setTextStyle(node.id, { bold: !bold })}
            className={`flex h-7 w-7 items-center justify-center rounded-full font-sans text-sm font-bold transition-colors duration-150 ease-soft ${
              bold ? 'bg-accent text-on-accent' : 'text-fg-2 hover:bg-surface-2 hover:text-fg'
            }`}
          >
            B
          </button>
          <span className="mx-t1 h-4 w-px bg-border" />
          <button
            title="기본색"
            onClick={() => setTextStyle(node.id, { accent: false })}
            className={`flex h-7 w-7 items-center justify-center rounded-full ${!accent ? 'ring-2 ring-accent' : 'hover:bg-surface-2'}`}
          >
            <span className="block h-3.5 w-3.5 rounded-full bg-fg" />
          </button>
          <button
            title="코랄색"
            onClick={() => setTextStyle(node.id, { accent: true })}
            className={`flex h-7 w-7 items-center justify-center rounded-full ${accent ? 'ring-2 ring-accent' : 'hover:bg-surface-2'}`}
          >
            <span className="block h-3.5 w-3.5 rounded-full bg-accent" />
          </button>
          <span className="mx-t1 h-4 w-px bg-border" />
          <button
            title="닫기"
            onClick={closeBar}
            className="flex h-7 w-7 items-center justify-center rounded-full text-fg-2 hover:bg-surface-2 hover:text-fg"
          >
            <Icon name="x" size={13} />
          </button>
        </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

/* ---- corner-radius drag handle (Figma식) ----
   선택된 메모·이미지·배경 텍스트 박스의 우상단 안쪽에 작은 핸들을 띄우고,
   드래그(↙ = 둥글게, ↗ = 각지게)로 data.radius를 보드 위에서 바로 조절한다.
   한 번의 드래그 = 한 번의 ⌘Z(captureNodes→pushRedesign). */
function RadiusHandle({ node, defaultRadius = 10 }: { node: BoardNode; defaultRadius?: number }) {
  const [liveR, setLiveR] = useState<number | null>(null);
  const realH = typeof node.data?.renderH === 'number' ? (node.data.renderH as number) : node.h;
  const maxR = Math.max(0, Math.min(node.w, realH) / 2);
  const cur = typeof node.data?.radius === 'number' ? (node.data.radius as number) : defaultRadius;
  const shown = Math.min(cur, maxR);
  const offset = 8 + shown * 0.3; // 라운드가 클수록 핸들이 안쪽으로 따라 들어간다

  const onDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const sx = e.clientX;
    const sy = e.clientY;
    const r0 = shown;
    const before = captureNodes([node.id]);
    const move = (ev: PointerEvent) => {
      const { zoom } = useBoardStore.getState().viewport;
      const s = node.scale ?? 1;
      // ↙(왼쪽-아래) 드래그 = 증가, ↗ = 감소 — 화면px → 노드 로컬px 변환.
      const d = ((sx - ev.clientX) + (ev.clientY - sy)) / 2 / (zoom * s);
      const r = Math.round(Math.max(0, Math.min(maxR, r0 + d)));
      setLiveR(r);
      const c = useBoardStore.getState().nodes[node.id];
      if (c) useBoardStore.getState().updateNodeRaw(node.id, { data: { ...(c.data ?? {}), radius: r } });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.classList.remove('kv-iframe-shield');
      pushRedesign([node.id], before, '라운드 조절');
      setLiveR(null);
    };
    document.body.classList.add('kv-iframe-shield'); // 드래그 중 iframe pointerup 유실 방지
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div
      onPointerDown={onDown}
      onDoubleClick={(e) => e.stopPropagation()}
      title="모서리 라운드 (드래그: ↙ 둥글게 · ↗ 각지게)"
      className="absolute z-20 h-3 w-3 cursor-nwse-resize rounded-full border-2 border-accent bg-surface shadow-sm"
      style={{ right: offset, top: offset }}
    >
      {liveR !== null && (
        <span className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-pill bg-fg px-t2 py-0.5 text-[10px] text-on-dark">
          {liveR}px
        </span>
      )}
    </div>
  );
}

/** data.radius가 있으면 inline border-radius로 클래스 라운드를 덮어쓴다. */
function radiusStyle(n: BoardNode): React.CSSProperties {
  return typeof n.data?.radius === 'number' ? { borderRadius: n.data.radius as number } : {};
}

function LockBadge() {
  return (
    <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-fg text-on-dark">
      <Icon name="lock" size={11} />
    </span>
  );
}

/* Memo editorial design — first line is a bold title, the rest is body text. */
function MemoText({ text }: { text?: string }) {
  const t = text ?? '';
  const nl = t.indexOf('\n');
  const title = (nl >= 0 ? t.slice(0, nl) : t).trim() || '메모…';
  const body = nl >= 0 ? t.slice(nl + 1).trim() : '';
  return (
    <>
      <p className="font-semibold leading-snug text-fg" style={{ fontSize: '0.95rem' }}>{title}</p>
      {body && <p className="mt-t1 whitespace-pre-wrap text-sm leading-relaxed text-fg-2">{body}</p>}
    </>
  );
}

/** A clean, short title from an image caption (before "—" / "(" separators). */
function imgTitle(text?: string): string {
  const first = (text ?? '').split('\n')[0];
  // Keep only the title — drop any trailing annotation: a 누리과정 영역 tag in
  // brackets ([...]/【...】), an em-dash note, or a parenthetical.
  const cut = first.split(/\s*[—–([【]/)[0].trim();
  return (cut || first).slice(0, 30);
}

/* ---- corner sticker decoration (Design Director — decorate pillar) ---- */
interface StickerDecoData {
  emoji: string;
  anchor: 'tl' | 'tr' | 'bl' | 'br';
  rot: number;
  size: number;
}
function StickerDecos({ items }: { items: StickerDecoData[] }) {
  return (
    <>
      {items.map((d, i) => (
        <span
          key={i}
          aria-hidden
          className="pointer-events-none absolute z-10 flex items-center justify-center rounded-full border border-border bg-surface shadow-md"
          style={{
            ...(d.anchor === 'tl'
              ? { left: -14, top: -14 }
              : d.anchor === 'tr'
                ? { right: -14, top: -14 }
                : d.anchor === 'bl'
                  ? { left: -14, bottom: -14 }
                  : { right: -14, bottom: -14 }),
            width: d.size,
            height: d.size,
            transform: `rotate(${d.rot}deg)`,
            fontSize: Math.round(d.size * 0.56),
            lineHeight: 1,
          }}
        >
          {d.emoji}
        </span>
      ))}
    </>
  );
}

/* ---- web-source card: topic thumbnails (free image sites) + search link rows ---- */
interface SourceLinkData {
  title: string;
  url: string;
  domain: string;
}
interface SourceThumbData {
  thumb: string;
  url: string;
  title: string;
  source: string;
}
function SourceLinks({ links, thumbs, summary }: { links: SourceLinkData[]; thumbs?: SourceThumbData[]; summary?: string }) {
  return (
    <div className="flex flex-col gap-t2">
      <span className="inline-flex items-center gap-t1 text-overline text-fg-2">
        <Icon name="search" size={13} className="text-accent" /> 웹 자료
      </span>
      {summary && <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg-2">{summary}</p>}
      {thumbs && thumbs.length > 0 && (
        <div className="grid grid-cols-2 gap-t1">
          {thumbs.map((t, i) => (
            <a
              key={i}
              href={t.url}
              target="_blank"
              rel="noreferrer noopener"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              title={t.title}
              className="group relative block overflow-hidden rounded-md border border-border bg-surface"
            >
              <img
                src={t.thumb}
                alt={t.title}
                draggable={false}
                loading="lazy"
                onError={(e) => { (e.currentTarget.closest('a') as HTMLElement | null)?.style.setProperty('display', 'none'); }}
                className="h-20 w-full object-cover transition-transform duration-200 ease-soft group-hover:scale-105"
              />
              {t.source && (
                <span className="absolute inset-x-0 bottom-0 truncate bg-fg/65 px-t1 py-0.5 text-[10px] text-on-dark">{t.source}</span>
              )}
            </a>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-t1">
        {links.map((l, i) => (
          <a
            key={i}
            href={l.url}
            target="_blank"
            rel="noreferrer noopener"
            // stop the board from starting a drag/selection so the click navigates
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            title={l.url}
            className="group flex items-center gap-t2 rounded-md border border-border bg-surface px-t2 py-t1 no-underline transition-colors duration-150 ease-soft hover:border-accent"
          >
            <img
              src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(l.domain || l.title)}&sz=64`}
              alt=""
              width={18}
              height={18}
              draggable={false}
              className="shrink-0 rounded-sm"
            />
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm text-fg">{l.title}</span>
              {l.domain && l.domain !== l.title && (
                <span className="block truncate text-overline text-fg-muted">{l.domain}</span>
              )}
            </span>
            <Icon name="external" size={13} className="shrink-0 text-fg-muted transition-colors group-hover:text-accent" />
          </a>
        ))}
      </div>
    </div>
  );
}

/* ---- runner control card ---- */
const STEP_ICON: Record<StepKind, Parameters<typeof Icon>[0]['name']> = {
  idea: 'plan',
  image: 'studio',
  plan: 'plan',
  worksheet: 'writing',
};

function RunnerCard({
  node,
  selected,
  onPointerDown,
  left,
  top,
}: {
  node: BoardNode;
  selected: boolean;
  onPointerDown: (e: React.PointerEvent, id: string) => void;
  left: number;
  top: number;
}) {
  const data = node.data as unknown as RunnerData;
  const steps = data?.steps ?? [];
  const ideaDone = steps.find((s) => s.kind === 'idea')?.status === 'done';
  const stop = (e: React.PointerEvent | React.MouseEvent) => e.stopPropagation();

  return (
    <div
      className={`absolute select-none rounded-xl border bg-surface shadow-lg ${selected ? 'border-accent' : 'border-border'}`}
      style={{ left, top, width: node.w, ...rootTransform(node) }}
    >
      {/* drag handle / header */}
      <div
        onPointerDown={(e) => onPointerDown(e, node.id)}
        className="flex items-center gap-t2 rounded-t-xl border-b border-border bg-bg-deep/60 px-t3 py-t2"
        style={{ cursor: 'grab' }}
      >
        <Icon name="sparkle" size={14} fill="currentColor" className="text-accent" />
        <span className="text-overline text-fg-2">워크플로 러너</span>
      </div>
      <div className="flex flex-col gap-t1 p-t2">
        {steps.map((s, i) => {
          const enabled = s.kind === 'idea' || ideaDone;
          const running = s.status === 'running';
          return (
            <button
              key={s.kind}
              onPointerDown={stop}
              onClick={(e) => {
                stop(e);
                if (enabled && !running) void runWorkflowStep(node.id, s.kind);
              }}
              disabled={!enabled || running}
              className={`flex items-center gap-t2 rounded-md px-t3 py-t2 text-left text-sm transition-colors duration-150 ease-soft ${
                s.status === 'done'
                  ? 'bg-success-soft text-success'
                  : enabled
                    ? 'bg-bg/60 text-fg hover:bg-surface-2'
                    : 'text-fg-disabled'
              }`}
            >
              <span className="text-overline text-fg-muted">{i + 1}</span>
              <Icon name={STEP_ICON[s.kind]} size={14} />
              <span className="font-medium">{s.label}</span>
              <span className="ml-auto text-overline">
                {running ? (
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-surface-3 border-t-accent" />
                ) : s.status === 'done' ? (
                  <Icon name="check" size={13} />
                ) : s.status === 'error' ? (
                  '재시도'
                ) : (
                  '실행'
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
