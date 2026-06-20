/**
 * GameStage.tsx — 교사 크롬 + 상태줄 + 무대 + 오버레이를 조립.
 * ------------------------------------------------------------------
 * 무대는 stage.nodes 를 정규화 좌표로 배치한다. 인터랙션이 '점유'한 슬롯(option/pair/cover/hidden)은
 * 해당 부품(TapTheRightOne/MatchPair/RevealEffect)이 그리고, 나머지(cue·장식)는 NodeRenderer가 그린다.
 * 무대 픽셀 크기는 ResizeObserver로 재서 StageSizeContext로 내려준다(이모지/뽑힘거리 환산).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { NodeRenderer } from "./NodeRenderer";
import { TapTheRightOne } from "./interactions/TapTheRightOne";
import { MatchPair } from "./interactions/MatchPair";
import { BinaryChoice } from "./interactions/BinaryChoice";
import { FlipMemory } from "./interactions/FlipMemory";
import { OrderSequence } from "./interactions/OrderSequence";
import { PatternNext } from "./interactions/PatternNext";
import { Categorize } from "./interactions/Categorize";
import { FindIt } from "./interactions/FindIt";
import { SequenceTap } from "./interactions/SequenceTap";
import { CombineGame } from "./interactions/CombineGame";
import { StageBackground } from "./StageBackground";
import { RevealEffect } from "./effects/RevealEffect";
import { EditLayer } from "./editor/EditLayer";
import { PageNav } from "./editor/PageNav";
import { InlineEditContext } from "./editContext";
import { GameEditRail } from "./editor/GameEditRail";
import { GamePromptBar } from "./GamePromptBar";
import { MaterialsLayer } from "./MaterialsLayer";
import { VideoExtendCard } from "./VideoExtendCard";
import { useMaterials } from "./materials";
import { WelcomeScreen } from "./WelcomeScreen";
import { GamePicker } from "./GamePicker";
import { useSavedGames, saveWorkingGame, getWorkingGame, primeAssets, useBaseOverrides, updateSavedGame } from "./savedGames";
import { useAssetStore } from "./assetStore";
import { useGen } from "./genProgress";
import { StageSizeContext, type StageSize } from "./stageSize";
import { FIXTURES, FIXTURE_KEYS } from "./fixtures";
import { useGame } from "./useGame";
import { say, stopSay } from "./tts";
import { useFullscreen } from "./useFullscreen";
import { isEmbedded, useChromeVisible } from "./useBoardBridge";
import { Icon } from "@/lib/icons";

/** 보드가 카드를 풀스크린으로 띄울 때 iframe을 ?fs=1로 로드한다. 이 땐 X(닫기) 토글 + 하단
    보드 프롬프트바 공간 확보를 한다. */
const isBoardFs = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("fs");

/** 설정 메뉴용 세로 노브(라벨 위, 옵션 아래) — 그림 출처·난이도·분량·분위기 공용. */
function KnobRow<T extends string>(props: {
  label: string;
  value: T;
  options: Array<[T, string]>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="kv-set-knob">
      <span className="knob-label">{props.label}</span>
      <div className="knob-opts">
        {props.options.map(([v, t]) => (
          <button
            key={v}
            type="button"
            className={`knob-opt${v === props.value ? " on" : ""}`}
            aria-pressed={v === props.value}
            onClick={() => props.onChange(v)}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

const START_DESC: Record<string, string> = {
  "tap-the-right-one": "잘 보고 누구인지 맞혀봐요!",
  "match-pair": "관련 있는 친구끼리 짝지어요!",
  "reveal-and-collect": "흙에 뭐가 심겼을까요? 맞히면 쑥 뽑혀요!",
};

/* 확장활동 유형 → 아이콘·라벨 (게임=도입, 확장=본체). */
const EXTEND_META: Record<string, { emoji: string; label: string }> = {
  discuss: { emoji: "💬", label: "이야기 나누기" },
  story: { emoji: "📖", label: "이야기 만들기" },
  "name-create": { emoji: "✏️", label: "이름 짓고 만들기" },
  "connect-apply": { emoji: "🔗", label: "생활에 연결하기" },
  "move-express": { emoji: "🤸", label: "몸으로 표현하기" },
  "watch-video": { emoji: "🎬", label: "동물 영상" },
};
/* 누리과정 영역 → 한글 라벨 (카피 불가능한 교육 메타데이터). */
const NURI_LABEL: Record<string, string> = {
  communication: "의사소통",
  "nature-inquiry": "자연탐구",
  social: "사회관계",
  art: "예술경험",
  physical: "신체운동",
};

export function GameStage() {
  const doc = useGame((s) => s.doc);
  const exampleKey = useGame((s) => s.exampleKey);
  const savedGameId = useGame((s) => s.savedGameId);
  const loadSeq = useGame((s) => s.loadSeq);
  const phase = useGame((s) => s.phase);
  const roundIdx = useGame((s) => s.roundIdx);
  const totalRounds = useGame((s) => s.totalRounds);
  const score = useGame((s) => s.score);
  const maxScore = useGame((s) => s.maxScore);
  const banner = useGame((s) => s.banner);
  const showNext = useGame((s) => s.showNext);
  const ttsEnabled = useGame((s) => s.ttsEnabled);
  const cueSlotId = useGame((s) => s.cueSlotId);
  const cueContent = useGame((s) => s.cueContent);
  const cueReactSeq = useGame((s) => s.cueReactSeq);

  const start = useGame((s) => s.start);
  const next = useGame((s) => s.next);
  const restart = useGame((s) => s.restart);
  const stop = useGame((s) => s.stop);
  const enterExtend = useGame((s) => s.enterExtend);
  const toggleTts = useGame((s) => s.toggleTts);
  const mode = useGame((s) => s.mode);
  const setMode = useGame((s) => s.setMode);

  // 풀스크린(게임만) + 교사 크롬 가시성(보드가 카드 비포커스 시 숨김) + 카테고리 메뉴 펼침.
  const { isFs, toggle: toggleFs } = useFullscreen();
  const chromeVisible = useChromeVisible();
  const [openMenu, setOpenMenu] = useState<"play" | "set" | "mat" | null>(null);
  // '놀이' 탭에서 고른 카테고리 — 설정 시 첫 화면(GamePicker: 기본 게임 + 만든 게임)이 뜬다.
  const [pickCategory, setPickCategory] = useState<string | null>(null);
  const savedGames = useSavedGames((s) => s.games); // 카테고리별 만든 게임 수(메뉴 배지)
  // 집중(플레이) 모드 — 교사 UI를 모두 숨기고 게임 프레임만 보여 아이가 게임에만 집중.
  const [focus, setFocus] = useState(false);
  const showToolbar = !isFs && !focus && chromeVisible;

  // 자료(요소) — 게임 위에 즉흥으로 올리는 스티커·글자·그림.
  const addMaterial = useMaterials((s) => s.add);
  const matCount = useMaterials((s) => s.items.length);
  const matItems = useMaterials((s) => s.items); // 확장 공간 점유 판정용(위치 필요)
  const addSeed = useGen((s) => s.addSeed);
  const sourceMode = useGen((s) => s.sourceMode);
  const setSourceMode = useGen((s) => s.setSourceMode);
  const knobs = useGen((s) => s.knobs);
  const setKnobs = useGen((s) => s.setKnobs);

  // 보드에서 끌어온 자료를 '게임 프레임'에 떨궜을 때 — 확인 후 편집 합류(파괴 아님).
  const [pendingDrop, setPendingDrop] = useState<{ src: string; label: string } | null>(null);

  // 확장활동 카드 자유 이동 — 카드별 드래그 오프셋(px). 게임이 바뀌면 초기화(세션 단위).
  const [extPos, setExtPos] = useState<Record<number, { dx: number; dy: number }>>({});
  const [extDragI, setExtDragI] = useState<number | null>(null); // 드래그 중인 카드(앞으로 띄움)
  const extDragRef = useRef<{ i: number; sx: number; sy: number; bx: number; by: number } | null>(null);
  const onExtDown = (i: number) => (e: React.PointerEvent) => {
    // 카드 안 버튼/링크(영상 만들기·다시 듣기 등)는 드래그가 아니라 그 동작.
    if ((e.target as Element).closest("button, a, input, textarea")) return;
    e.stopPropagation();
    const base = extPos[i] ?? { dx: 0, dy: 0 };
    extDragRef.current = { i, sx: e.clientX, sy: e.clientY, bx: base.dx, by: base.dy };
    setExtDragI(i);
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* noop */ }
  };
  const onExtMove = (e: React.PointerEvent) => {
    const d = extDragRef.current;
    if (!d) return;
    setExtPos((p) => ({ ...p, [d.i]: { dx: d.bx + (e.clientX - d.sx), dy: d.by + (e.clientY - d.sy) } }));
  };
  const onExtUp = (e: React.PointerEvent) => {
    if (!extDragRef.current) return;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
    extDragRef.current = null;
    setExtDragI(null);
  };

  // 게임 카드(프레임)에 파일을 떨구면: 게임 있으면 확인 후 편집 합류, 없으면 '시드'.
  const onSeedDrop = (e: React.DragEvent) => {
    const files = Array.from(e.dataTransfer?.files ?? []).filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    e.preventDefault();
    e.stopPropagation(); // 보드 캔버스 onDrop으로 버블 막기(카드/보드 이중 처리 방지)
    const f = files[0];
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      if (useGame.getState().doc) setPendingDrop({ src: reader.result, label: "내 그림" });
      else addSeed(reader.result);
    };
    reader.readAsDataURL(f);
  };
  // 보드(프레임 밖)에 파일을 떨구면: 실제(원본) 크기로 그대로 배치.
  const onBoardDrop = (e: React.DragEvent) => {
    const files = Array.from(e.dataTransfer?.files ?? []).filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    e.preventDefault();
    const rect = viewportRef.current?.getBoundingClientRect();
    const px = rect ? e.clientX - rect.left : 0;
    const py = rect ? e.clientY - rect.top : 0;
    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result;
      if (typeof src !== "string") return;
      const im = new Image();
      im.onload = () => placeBoardMaterial(src, px, py, im.naturalWidth, im.naturalHeight);
      im.onerror = () => placeBoardMaterial(src, px, py);
      im.src = src;
    };
    reader.readAsDataURL(files[0]);
  };
  const onUploadImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      // 보드처럼 '이미지 카드'(frame)로 생성 — 흰 카드+캡션 UX 통일.
      if (typeof reader.result === "string") addMaterial("frame", reader.result, { mediaKind: "image" });
      setOpenMenu(null);
    };
    reader.readAsDataURL(file);
  };

  // 에디터 undo/redo 히스토리(zundo temporal) — 키보드 단축키(MaterialsLayer)가 쓴다. 게임/모드
  // 전환 시 초기화(세션 단위). 상단 버튼은 제거됨(중복 정리) — 단축키 ⌘/Ctrl+Z·Shift+Z·Ctrl+Y 유지.
  useEffect(() => {
    useGame.temporal.getState().clear();
    useMaterials.temporal.getState().clear();
  }, [loadSeq, mode]);

  // 저장 — 현재 게임(편집 포함)을 로컬에 저장(새로고침해도 남음). 단독 탭 로드 시 자동 복원.
  // 기본 게임을 편집한 경우(exampleKey 있음)엔 그 '기본 게임 자체'도 갱신 → 다시 열면 이 편집본이 뜬다
  // (새 '내 놀이'를 만들지 않고 기본이 바뀐다).
  const [justSaved, setJustSaved] = useState(false);
  const onSaveGame = () => {
    const st = useGame.getState();
    const d = st.doc;
    if (!d) return;
    // 내 놀이를 편집 중이면 그 항목 갱신(새로 안 만듦) · 기본 게임이면 그 기본을 갱신 · 그 외엔 작업 슬롯만.
    if (st.savedGameId) updateSavedGame(st.savedGameId, d as never);
    else if (st.exampleKey) useBaseOverrides.getState().saveOverride(st.exampleKey, d as never);
    const ok = saveWorkingGame(d as never);
    if (ok || st.savedGameId || st.exampleKey) {
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 1400);
    }
  };
  // 저장해 둔 게임을 자동 복원 — 단독 탭 + 보드 풀스크린 포털(교사 작업 화면). 1회만.
  // 작은 임베드 카드는 환영 화면·드래그 시딩 흐름을 유지하려 복원하지 않는다.
  const canPersist = !isEmbedded || isBoardFs;
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    if (!canPersist) return;
    if (useGame.getState().doc) return; // 이미 게임이 있으면 건드리지 않음
    const w = getWorkingGame();
    if (w) {
      primeAssets(w.assets);
      useGame.getState().loadDoc(w.doc as never);
    }
  }, [canPersist]);

  // 자동 저장 — '한 번 뜬 이미지'를 고정한다. doc이 바뀔 때 + 자산(보관함/생성)이 늦게 해석돼
  // 들어올 때(비동기 스왑)도 작업 슬롯에 스냅샷한다 → 새로고침/재진입 시 같은 그림이 그대로 복원.
  // (연속 변경은 디바운스로 마지막 한 번만. 작은 임베드 카드는 보드가 영속을 관리하므로 제외.)
  useEffect(() => {
    if (!canPersist || !restoredRef.current) return;
    const save = () => { const d = useGame.getState().doc; if (d) saveWorkingGame(d as never); };
    let t = doc ? window.setTimeout(save, 600) : undefined;
    const unsub = useAssetStore.subscribe(() => {
      if (t) window.clearTimeout(t);
      t = window.setTimeout(save, 600);
    });
    return () => { if (t) window.clearTimeout(t); unsub(); };
  }, [doc, canPersist]);

  const stageRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<StageSize>({ w: 0, h: 0 });
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const claimed = useMemo(() => {
    const s = new Set<string>();
    if (!doc) return s;
    const it = doc.interaction;
    if (it.kind === "tap-the-right-one") it.optionSlotIds.forEach((id) => s.add(id));
    if (it.kind === "match-pair" || it.kind === "connect") {
      it.leftSlotIds.forEach((id) => s.add(id));
      it.rightSlotIds.forEach((id) => s.add(id));
    }
    if (it.kind === "flip-memory") it.cardSlotIds.forEach((id) => s.add(id));
    if (it.kind === "order-sequence") it.slotIds.forEach((id) => s.add(id));
    if (it.kind === "pattern-next") {
      it.sequenceSlotIds.forEach((id) => s.add(id));
      it.optionSlotIds.forEach((id) => s.add(id));
    }
    if (it.kind === "categorize") {
      it.itemSlotIds.forEach((id) => s.add(id));
      it.bucketSlotIds.forEach((id) => s.add(id));
    }
    if (it.kind === "find-it") {
      // zone 노드는 FindIt가 탭 타깃으로 그린다(NodeRenderer 플레이스홀더 중복 방지). scene은 비점유.
      doc.stage.nodes.forEach((n) => { if (n.type === "zone") s.add(n.id); });
    }
    if (it.kind === "sequence-tap") (it.stepSlotIds ?? []).forEach((id) => s.add(id));
    if (it.kind === "combine") {
      it.ingredientSlotIds.forEach((id) => s.add(id));
      s.add(it.resultSlotId);
    }
    doc.effects.forEach((e) => {
      if (e.kind === "reveal") {
        s.add(e.coverNodeId);
        s.add(e.hiddenNodeId);
      }
    });
    return s;
  }, [doc]);

  const unclaimed = useMemo(
    () =>
      doc
        ? [...doc.stage.nodes].filter((n) => !claimed.has(n.id)).sort((a, b) => a.transform.z - b.transform.z)
        : [],
    [doc, claimed],
  );

  const hasReveal = !!doc?.effects.some((e) => e.kind === "reveal");
  const kind = doc?.interaction.kind;

  // ── 무한(가로) 보드 — My Board처럼 ───────────────────────────────────
  // 화면 전체가 하나의 연속된 보드. 게임은 그 위에 떠 있는 '카드'. 보드 전체를
  // 휠버튼(가운데 버튼) 드래그 · 투핑거(휠) · Space+드래그로 좌우 자유 팬(가로 전용).
  // 카드 좌·우는 빈 보드 — 교사가 자유롭게 확장활동 자료를 놓는다.
  const viewportRef = useRef<HTMLDivElement>(null);
  const [vp, setVp] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => setVp({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // panX = 홈(게임 중앙)에서의 오프셋. 0 = 게임 화면. 음수 = 오른쪽 보드, 양수 = 왼쪽 보드.
  const SIDE = vp.w; // 카드 양옆 빈 보드 폭(각 한 화면)
  // 집중 모드선 상/하단 크롬이 없으니 예약을 줄여 카드가 더 꽉 차게(가운데).
  const TOP_RESERVE = focus ? 20 : 58; // 떠 있는 상단 크롬 자리
  const BOTTOM_RESERVE = focus ? 20 : (isBoardFs || !isEmbedded ? 96 : 18); // 하단 프롬프트바 자리
  const cardW = vp.w ? Math.min(vp.w * (focus ? 0.94 : 0.86), focus ? 1200 : 980) : 0;
  const cardH = vp.h ? Math.max(220, vp.h - TOP_RESERVE - BOTTOM_RESERVE) : 0;
  const cardX = SIDE + (vp.w - cardW) / 2; // 캔버스 내 게임 카드 위치(가운데 화면)
  const canvasW = SIDE * 2 + vp.w; // 좌 빈보드 + 화면 + 우 빈보드 = 3화면
  const canvasSize = useMemo<StageSize>(() => ({ w: canvasW, h: vp.h }), [canvasW, vp.h]);
  // 확장 공간(게임 카드 오른쪽)에 자료(이미지·요소)가 하나라도 놓이면 placeholder 안내를 숨긴다.
  // 자료 x는 캔버스(3화면) 정규화 → px로 환산해 카드 오른쪽 끝보다 오른쪽이면 확장 공간 점유.
  const extensionOccupied = canvasW > 0 && matItems.some((m) => m.x * canvasW > cardX + cardW);
  const clampPan = (v: number) => Math.max(-SIDE, Math.min(SIDE, v));

  const [panX, setPanX] = useState(0);
  const [panning, setPanning] = useState(false);
  const [spaceDown, setSpaceDown] = useState(false);
  const panRef = useRef<{ startX: number; base: number; active: boolean } | null>(null);
  const geomRef = useRef({ side: 0, vw: 0 });
  geomRef.current = { side: SIDE, vw: vp.w };
  // 드롭 라우팅용 최신 기하(게임 카드 화면 위치·캔버스 크기). 리스너 클로저에서 ref로 읽는다.
  const dropGeomRef = useRef({ cardX: 0, cardW: 0, cardH: 0, top: 0, panX: 0, side: 0, vpH: 0, canvasW: 0 });
  dropGeomRef.current = { cardX, cardW, cardH, top: TOP_RESERVE, panX, side: SIDE, vpH: vp.h, canvasW };

  // 드롭 지점(뷰포트 로컬 px)이 떠 있는 게임 카드 위인지.
  const isInCard = (px: number, py: number) => {
    const g = dropGeomRef.current;
    const left = g.cardX + (g.panX - g.side);
    return px >= left && px <= left + g.cardW && py >= g.top && py <= g.top + g.cardH;
  };
  // 보드(프레임 밖)에 자료를 '실제 크기 그대로' 배치 — 드롭 지점 중심, 화면 px → 정규화.
  const placeBoardMaterial = (src: string, px: number, py: number, screenW?: number, screenH?: number) => {
    const g = dropGeomRef.current;
    const cw = g.canvasW || 1;
    const ch = g.vpH || 1;
    const cx = Math.max(0.03, Math.min(0.97, (px - (g.panX - g.side)) / cw));
    const cy = Math.max(0.05, Math.min(0.95, py / ch));
    // 크기(w,h)는 화면 기준 정규화 — 폭은 한 화면 폭(g.side=vp.w)으로 나눈다(캔버스 cw 아님).
    const w = screenW ? Math.max(0.05, Math.min(0.9, screenW / (g.side || 1))) : 0.18;
    const h = screenH ? Math.max(0.05, Math.min(0.85, screenH / ch)) : 0.18;
    useMaterials.getState().add("image", src, { x: cx, y: cy, w, h });
  };
  // 게임 프레임 드롭 확인 → 편집 모드로 들어가 자료를 카드 중앙에 합류.
  const confirmDrop = () => {
    if (!pendingDrop) return;
    setMode("edit");
    const g = dropGeomRef.current;
    const cw = g.canvasW || 1;
    const ch = g.vpH || 1;
    useMaterials.getState().add("image", pendingDrop.src, {
      x: (g.cardX + g.cardW / 2) / cw,
      y: (g.top + g.cardH / 2) / ch,
      w: 0.3,
      h: 0.3,
    });
    setPendingDrop(null);
  };

  // 보드(부모)에서 드롭한 자료 수신 — 프레임 위면 확인 후 편집 합류, 보드 위면 실제 크기 배치.
  useEffect(() => {
    if (!isEmbedded) return;
    const onMsg = (e: MessageEvent) => {
      const d = e.data as
        | { type?: string; src?: string; label?: string; x?: number; y?: number; screenW?: number; screenH?: number }
        | null;
      if (!d || d.type !== "kv-game-add-image" || typeof d.src !== "string") return;
      const label = d.label || "내 그림";
      const hasPt = typeof d.x === "number" && typeof d.y === "number";
      // 좌표가 없으면(구버전 폴백) 게임 있으면 확인, 없으면 시드.
      if (!hasPt || isInCard(d.x as number, d.y as number)) {
        if (useGame.getState().doc) setPendingDrop({ src: d.src, label });
        else useGen.getState().addSeed(d.src);
      } else {
        placeBoardMaterial(d.src, d.x as number, d.y as number, d.screenW, d.screenH);
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);
  const [cardSel, setCardSel] = useState(false); // 게임 프레임 선택 상태
  useEffect(() => { setPanX(0); setExtPos({}); }, [doc?.meta.id]);
  // 캔버스 x(px)를 화면 가로 중앙으로 — 더블클릭 포커스(요소 가운데 정렬)
  const centerCanvasX = (cx: number) => { if (vp.w) setPanX(clampPan(vp.w / 2 - cx + SIDE)); };
  useEffect(() => {
    const onCenter = (e: Event) => {
      const { side, vw } = geomRef.current;
      const cx = (e as CustomEvent<{ cx: number }>).detail?.cx;
      if (typeof cx === "number" && vw) setPanX(Math.max(-side, Math.min(side, vw / 2 - cx + side)));
    };
    window.addEventListener("kv:center", onCenter as EventListener);
    return () => window.removeEventListener("kv:center", onCenter as EventListener);
  }, []);
  // 보이는 캔버스 중심을 자료 스토어에 알림(새 요소가 보이는 곳에 추가되게)
  const setViewX = useMaterials((s) => s.setViewX);
  useEffect(() => {
    if (canvasW > 0) setViewX((SIDE - panX + vp.w / 2) / canvasW);
  }, [panX, vp.w, SIDE, canvasW, setViewX]);
  // 투핑거(휠) 팬 — non-passive 리스너로 기본 스크롤 막고 가로 이동
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const { side } = geomRef.current;
      if (!side) return;
      e.preventDefault();
      const d = Math.abs(e.deltaX) >= Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      setPanX((p) => Math.max(-side, Math.min(side, p - d)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
  // Space 팬 모드
  useEffect(() => {
    const isTyping = () => {
      const a = document.activeElement as HTMLElement | null;
      return !!a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable);
    };
    const dn = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isTyping()) { e.preventDefault(); setSpaceDown(true); (window as Window & { __kvSpace?: boolean }).__kvSpace = true; }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") { setSpaceDown(false); (window as Window & { __kvSpace?: boolean }).__kvSpace = false; }
    };
    window.addEventListener("keydown", dn);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", dn); window.removeEventListener("keyup", up); };
  }, []);
  // 팬 = 가운데(휠) 버튼 드래그 또는 Space+드래그. (좌클릭 드래그는 박스선택/해제)
  const onCanvasDown = (e: React.PointerEvent) => {
    if (e.button !== 1 && !spaceDown) return;
    e.preventDefault();
    panRef.current = { startX: e.clientX, base: panX, active: false };
    setPanning(true);
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* noop */ }
  };
  const onCanvasMove = (e: React.PointerEvent) => {
    const p = panRef.current;
    if (!p) return;
    const dx = e.clientX - p.startX;
    if (!p.active && Math.abs(dx) > 3) p.active = true;
    if (p.active) setPanX(clampPan(p.base + dx));
  };
  const onCanvasUp = (e: React.PointerEvent) => {
    panRef.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
    setPanning(false);
  };
  const panRight = () => setPanX((p) => clampPan(p - vp.w * 0.85));

  const onMute = () => {
    const was = ttsEnabled;
    toggleTts();
    if (was) stopSay();
  };

  return (
    <StageSizeContext.Provider value={size}>
      <div className={`wrap${showToolbar ? " kv-has-rail" : ""}${spaceDown ? " kv-space" : ""}${focus ? " kv-focus" : ""}`}>
        {/* 게임 전용 편집 LNB — 화면 가장 왼쪽(부모) 고정 컬럼. 보드 영역은 그 오른쪽. */}
        {showToolbar && <GameEditRail />}
        {/* 교사 크롬 — 카테고리 접이식 툴바. 자리는 항상 예약(무대 안 밀림), 호버 시 버튼만 페이드인. */}
        {!isFs && !focus && (
          <div className={`chrome${showToolbar ? " is-on" : ""}`}>
            <div className="kv-toolbar">
              {/* 제목 — 상단 가장 왼쪽 */}
              <span className="kv-title">게임뷰어</span>
              {/* 놀이 고르기 (예제 8종을 한 메뉴로 접음) */}
              <div className="kv-menu-wrap">
                <button
                  type="button"
                  className={`kv-menu-btn${openMenu === "play" ? " on" : ""}`}
                  aria-haspopup="menu"
                  aria-expanded={openMenu === "play"}
                  onClick={() => setOpenMenu(openMenu === "play" ? null : "play")}
                >
                  <span className="kv-btn-ic"><Icon name="gamepad" size={17} /> 놀이</span>
                </button>
                {openMenu === "play" && (
                  <div className="kv-menu" role="menu">
                    {FIXTURE_KEYS.map((k) => {
                      const mineCount = savedGames.filter((g) => g.category === k).length;
                      return (
                        <button
                          key={k}
                          type="button"
                          role="menuitem"
                          aria-checked={k === exampleKey}
                          className={`kv-menu-item${k === exampleKey ? " on" : ""}`}
                          onClick={() => {
                            // 바로 로드하지 않고 첫 화면(기본 게임 + 만든 게임)을 띄워 고르게 한다.
                            setPickCategory(k);
                            setOpenMenu(null);
                          }}
                        >
                          {FIXTURES[k].label}
                          {mineCount > 0 && <span className="kv-menu-count">{mineCount}</span>}
                        </button>
                      );
                    })}
                    {isEmbedded && <div className="kv-menu-note">또는 보드 프롬프트바에 입력해 만들어요</div>}
                  </div>
                )}
              </div>

              {/* 설정 (난이도·분위기 — 읽기전용) */}
              <div className="kv-menu-wrap">
                <button
                  type="button"
                  className={`kv-menu-btn${openMenu === "set" ? " on" : ""}`}
                  aria-haspopup="menu"
                  aria-expanded={openMenu === "set"}
                  onClick={() => setOpenMenu(openMenu === "set" ? null : "set")}
                >
                  <span className="kv-btn-ic"><Icon name="settings" size={17} /> 설정</span>
                </button>
                {openMenu === "set" && (
                  <div className="kv-menu kv-menu-set" role="menu">
                    <KnobRow label="그림 출처" value={sourceMode} onChange={setSourceMode}
                      options={[["auto", "보관함 우선"], ["gallery", "모두 보관함"], ["generate", "모두 생성"]]} />
                    <KnobRow label="난이도" value={knobs.difficulty} onChange={(v) => setKnobs({ difficulty: v })}
                      options={[["baby", "아기"], ["toddler", "유아"], ["senior", "형님"]]} />
                    <KnobRow label="분량" value={knobs.length} onChange={(v) => setKnobs({ length: v })}
                      options={[["short", "짧게"], ["normal", "보통"], ["long", "길게"]]} />
                    <KnobRow label="분위기" value={knobs.mood} onChange={(v) => setKnobs({ mood: v })}
                      options={[["calm", "차분"], ["lively", "신나게"], ["punchy", "깜짝"]]} />
                  </div>
                )}
              </div>

              {/* 업로드 — 이미지를 무대에 바로 올린다(텍스트·버튼·프레임은 좌측 편집 레일에서). */}
              <label className="kv-menu-btn kv-upload-btn" title="이미지 업로드">
                <span className="kv-btn-ic"><Icon name="upload" size={17} /> 업로드</span>
                <input type="file" accept="image/*" onChange={onUploadImage} hidden />
              </label>

              <div className="kv-toolbar-spacer" />

              {/* 아이콘 클러스터 — 집중(플레이, 편집 중엔 숨김: 편집 토글이 플레이로 겸함) / 소리 / 편집 / 풀스크린 */}
              {mode !== "edit" && (
                <button
                  type="button"
                  className="icon-btn kv-play-btn"
                  title="게임에 집중 (다른 건 숨기고 게임만 보기)"
                  aria-label="게임에 집중하기"
                  onClick={() => { setPanX(0); setOpenMenu(null); setFocus(true); }}
                >
                  <Icon name="play" size={18} />
                </button>
              )}
              <button
                type="button"
                className="icon-btn"
                title="읽어주기 켜기/끄기"
                aria-label="읽어주기 켜기/끄기"
                onClick={onMute}
              >
                <Icon name={ttsEnabled ? "sound" : "mute"} size={18} />
              </button>
              <button
                type="button"
                className={`icon-btn${mode === "edit" ? " on" : ""}`}
                title="고급 편집 / 플레이"
                aria-label="고급 편집 / 플레이"
                aria-pressed={mode === "edit"}
                onClick={() => setMode(mode === "edit" ? "play" : "edit")}
              >
                <Icon name={mode === "edit" ? "play" : "edit"} size={18} />
              </button>
              {/* 저장 — 현재 게임(편집 포함)을 로컬에 저장. 새로고침해도 남아 계속 테스트 가능. */}
              {mode === "edit" && (
                <button
                  type="button"
                  className={`icon-btn kv-save-btn${justSaved ? " saved" : ""}`}
                  title={justSaved ? "저장됐어요" : savedGameId ? "저장 — 이 '내 놀이'가 갱신됩니다" : exampleKey ? "저장 — 이 기본 게임이 이 편집본으로 바뀝니다" : "저장 (새로고침해도 남아요)"}
                  aria-label="저장"
                  disabled={!doc}
                  onClick={onSaveGame}
                >
                  <Icon name={justSaved ? "check" : "download"} size={18} />
                </button>
              )}
              <button
                type="button"
                className="icon-btn"
                title={isFs || isBoardFs ? "전체 화면 닫기" : "전체 화면"}
                aria-label={isFs || isBoardFs ? "전체 화면 닫기" : "전체 화면"}
                onClick={() => {
                  // 보드 풀스크린(포털)이면 부모에 닫기 알림(kv-fs-exit) → 보드가 포털을 닫는다.
                  if (isBoardFs) window.parent.postMessage({ type: "kv-fs-exit" }, "*");
                  else toggleFs(); // 단독 탭: 네이티브 풀스크린 토글
                }}
              >
                <Icon name={isFs || isBoardFs ? "x" : "maximize"} size={18} />
              </button>
            </div>
          </div>
        )}
        {openMenu && !isFs && !focus && <div className="kv-menu-backdrop" onClick={() => setOpenMenu(null)} aria-hidden />}

        {/* 풀스크린 시 최소 플로팅 컨트롤(게임만 보이게 — 코너에 소리/나가기) */}
        {isFs && (
          <div className="kv-fs-bar">
            <button type="button" className="icon-btn" title="읽어주기 켜기/끄기" aria-label="읽어주기 켜기/끄기" onClick={onMute}>
              {ttsEnabled ? "🔊" : "🔇"}
            </button>
            <button type="button" className="icon-btn" title="전체 화면 끄기" aria-label="전체 화면 끄기" onClick={toggleFs}><Icon name="minimize" size={18} /></button>
          </div>
        )}

        {/* 집중(플레이) 모드 시 최소 컨트롤 — 게임만 보이고 코너에 소리/나가기 */}
        {focus && !isFs && (
          <div className="kv-fs-bar">
            <button type="button" className="icon-btn" title="읽어주기 켜기/끄기" aria-label="읽어주기 켜기/끄기" onClick={onMute}>
              <Icon name={ttsEnabled ? "sound" : "mute"} size={18} />
            </button>
            <button type="button" className="icon-btn" title="집중 모드 끄기" aria-label="집중 모드 끄기" onClick={() => setFocus(false)}>
              <Icon name="x" size={18} />
            </button>
          </div>
        )}

        {/* 상태 줄 — 게임이 있을 때만(환영 화면·집중 모드에선 숨김) */}
        {doc && !focus && (
          <div className="statusbar">
            <span className="round-txt">
              문제 <b>{roundIdx + 1}</b> / {totalRounds || 1}
            </span>
            <div className="stars" aria-label={`점수 ${score} / ${maxScore}`}>
              {Array.from({ length: maxScore }).map((_, i) => (
                <span key={i} className={`star${i < score ? " on" : ""}`}>⭐</span>
              ))}
            </div>
          </div>
        )}

        {/* 무한 가로 보드 — 화면 전체가 보드. 게임은 그 위에 떠 있는 카드. 휠버튼/투핑거/Space로
            보드 전체를 좌우로 팬한다. 카드 좌·우는 빈 보드(자유 확장활동). 자료는 캔버스 전체에. */}
        <div className="kv-board-viewport" ref={viewportRef}>
          <div
            className={`kv-board-canvas${panning ? " kv-panning" : ""}${spaceDown ? " kv-grab" : ""}`}
            style={{ width: vp.w ? `${canvasW}px` : "300%", height: "100%", transform: `translateX(${vp.w ? panX - SIDE : 0}px)` }}
            onPointerDown={onCanvasDown}
            onPointerMove={onCanvasMove}
            onPointerUp={onCanvasUp}
            onClick={() => setCardSel(false)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onBoardDrop}
          >
            {/* 게임 카드 — 보드 위에 떠 있는 프레임(선택 + 더블클릭 가운데정렬) */}
            <div
              className={`stage-frame kv-game-card${cardSel ? " selected" : ""}`}
              style={{ position: "absolute", left: cardX, top: TOP_RESERVE, width: cardW || undefined, height: cardH || undefined }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={onSeedDrop}
              onClick={(e) => { if (!focus && !(e.target as Element).closest("button, input")) { e.stopPropagation(); setCardSel(true); } }}
              onDoubleClick={() => centerCanvasX(cardX + cardW / 2)}
            >
                <div className="stage" ref={stageRef}>
                  <div className="kv-section">
                    {/* 장식 블롭 — 빈 캔버스에서 편집을 시작하면(자료 추가) 깔끔하게 제거 */}
                    {(doc || matCount === 0) && (
                      <>
                        <div className="blob a" />
                        <div className="blob b" />
                      </>
                    )}
                    {/* 생성한 배경 이미지(있으면) — 노드 뒤 풀블리드 */}
                    {doc && <StageBackground />}

                    {doc && mode === "edit" && <EditLayer />}
                    {doc && mode === "edit" && <PageNav />}

                    {doc && mode === "play" && (
                      <InlineEditContext.Provider value={showToolbar}>
                        {unclaimed.map((node) => (
                          <NodeRenderer
                            key={node.id}
                            node={node}
                            binding={node.id === cueSlotId ? cueContent : undefined}
                            reactSeq={node.id === cueSlotId ? cueReactSeq : undefined}
                          />
                        ))}
                        {hasReveal && <RevealEffect />}
                        {kind === "match-pair" || kind === "connect" ? (
                          <MatchPair />
                        ) : kind === "binary-choice" ? (
                          <BinaryChoice />
                        ) : kind === "flip-memory" ? (
                          <FlipMemory />
                        ) : kind === "order-sequence" ? (
                          <OrderSequence />
                        ) : kind === "pattern-next" ? (
                          <PatternNext />
                        ) : kind === "categorize" ? (
                          <Categorize />
                        ) : kind === "find-it" ? (
                          <FindIt />
                        ) : kind === "sequence-tap" ? (
                          <SequenceTap />
                        ) : kind === "combine" ? (
                          <CombineGame />
                        ) : (
                          <TapTheRightOne />
                        )}
                      </InlineEditContext.Provider>
                    )}

                    <div className={`banner${banner ? " show " + (banner.ok ? "ok" : "no") : ""}`}>
                      <span aria-hidden>{banner?.ok ? "🎉" : "💪"}</span>
                      <span>{banner?.text}</span>
                    </div>

                    <button type="button" className={`next${showNext ? " show" : ""}`} onClick={next}>
                      다음 <span aria-hidden>→</span>
                    </button>

                    {/* 환영 화면 — 게임이 없을 때(데모 대신). 프롬프트/이미지 드래그로 만들기 시작 */}
                    {!doc && matCount === 0 && !pickCategory && <WelcomeScreen />}

                    {/* 놀이 고르기 첫 화면 — '놀이' 탭에서 카테고리를 고르면 기본+만든 게임을 카드로 */}
                    {pickCategory && <GamePicker category={pickCategory} onClose={() => setPickCategory(null)} />}

                    {/* 시작 오버레이 (게임 있고 start 단계일 때만; 편집 모드 숨김) */}
                    <div className={`overlay${phase !== "start" || mode === "edit" || !doc ? " hide" : ""}`}>
                      <div className="finish-emoji" aria-hidden>🐾</div>
                      <h2 className="jua">{doc?.meta.title ?? "게임을 시작해요"}</h2>
                      <p>{doc ? START_DESC[doc.meta.archetype] ?? "시작해볼까요?" : ""}</p>
                      <button type="button" className="big-btn" onClick={start}>▶ 시작</button>
                    </div>

                    {/* 완료 오버레이 — 끝나면 오른쪽 확장 보드로 안내 */}
                    <div className={`overlay${phase !== "finished" ? " hide" : ""}`}>
                      <div className="finish-emoji" aria-hidden>🎉</div>
                      <h2 className="jua">참 잘했어요!</h2>
                      <div className="finish-stars">
                        {Array.from({ length: maxScore }).map((_, i) => (
                          <span key={i} className={`star${i < score ? " on" : ""}`}>⭐</span>
                        ))}
                      </div>
                      <p>{maxScore}개 중 {score}개 맞혔어요!</p>
                      <div className="finish-actions">
                        <button type="button" className="big-btn" onClick={restart}>↺ 다시 하기</button>
                        <button type="button" className="finish-quit" onClick={() => { stop(); setFocus(false); }}>
                          ✕ 그만하기
                        </button>
                        <button
                          type="button"
                          className="extend-listen"
                          onClick={() => { if (doc && doc.extend.length > 0) enterExtend(0); panRight(); }}
                        >
                          확장 활동 <span aria-hidden>→</span>
                        </button>
                      </div>
                    </div>

                    {mode === "edit" && (
                      <div className="edit-hint" aria-hidden>
                        ✏️ 끌어서 이동 · 모서리로 크기 · 더블클릭 글자수정 · 프롬프트로 그림교체
                      </div>
                    )}

                    {/* 자료를 게임 프레임에 떨굼 → 화면을 가리고 확인. '넣기'면 편집 모드 합류. */}
                    {pendingDrop && (
                      <div className="kv-drop-confirm" role="dialog" aria-label="자료를 게임에 넣기">
                        <img className="kv-drop-thumb" src={pendingDrop.src} alt="" />
                        <h2 className="jua">이 자료를 게임 화면에 넣을까요?</h2>
                        <p>넣으면 편집 모드로 들어가 자료를 자유롭게 옮길 수 있어요.</p>
                        <div className="kv-drop-actions">
                          <button type="button" className="big-btn" onClick={confirmDrop}>네, 넣기</button>
                          <button type="button" className="kv-drop-cancel" onClick={() => setPendingDrop(null)}>취소</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
            </div>

            {/* 오른쪽 빈 보드 — 자유 확장활동 공간(그냥 배경 + 옅은 안내). 게임 확장활동이 있으면 카드로 띄움 */}
            {vp.w > 0 && !focus && (
              doc && doc.extend.length > 0 ? (
                <div className="kv-ext-float" style={{ position: "absolute", left: cardX + cardW + 56, top: 72 }}>
                  {doc.extend.map((act, i) => {
                    const m = EXTEND_META[act.type] ?? { emoji: "🌟", label: "확장활동" };
                    const off = extPos[i] ?? { dx: 0, dy: 0 };
                    // 카드별 자유 드래그 래퍼 — 보드 위에서 끌어 옮긴다(transform 오프셋, 레이아웃 미영향).
                    const dragProps = {
                      className: `kv-ext-drag${extDragI === i ? " dragging" : ""}`,
                      style: {
                        transform: off.dx || off.dy ? `translate(${off.dx}px, ${off.dy}px)` : undefined,
                        touchAction: "none" as const,
                      },
                      onPointerDown: onExtDown(i),
                      onPointerMove: onExtMove,
                      onPointerUp: onExtUp,
                      title: "끌어서 옮겨요",
                    };
                    // 동물 영상 카드 — 게임 동물을 각각 Veo 이미지→영상으로(교사 클릭 온디맨드).
                    if (act.type === "watch-video") {
                      return (
                        <div key={i} {...dragProps}>
                          <VideoExtendCard
                            act={act}
                            index={i}
                            total={doc.extend.length}
                            ttsEnabled={ttsEnabled}
                            say={say}
                            meta={m}
                            nuriLabel={NURI_LABEL}
                          />
                        </div>
                      );
                    }
                    return (
                      <div key={i} {...dragProps}>
                        <div className="extend-card" role="group" aria-label="확장활동">
                          <div className="extend-top">
                            <span className="extend-kind">{m.emoji} {m.label}</span>
                            <span className="extend-step">{i + 1} / {doc.extend.length}</span>
                          </div>
                          <ul className="extend-prompts">
                            {act.prompts.map((p, j) => (<li key={j}>{p}</li>))}
                          </ul>
                          {act.nuri && act.nuri.length > 0 && (
                            <div className="extend-nuri" aria-label="누리과정 영역">
                              {act.nuri.map((n) => (<span key={n} className="nuri-chip">🌱 {NURI_LABEL[n] ?? n}</span>))}
                            </div>
                          )}
                          <button type="button" className="extend-listen" onClick={() => { if (ttsEnabled) say(act.prompts.join("  ")); }}>
                            <span className="kv-btn-ic"><Icon name="sound" size={15} /> 다시 듣기</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : extensionOccupied ? null : (
                <div className="kv-board-hint" style={{ position: "absolute", left: cardX + cardW + vp.w * 0.2, top: "50%", transform: "translateY(-50%)" }}>
                  <div className="kv-board-hint-emoji" aria-hidden>🧩</div>
                  <b>놀이 확장</b>
                  <span>이미지·스티커를 올려 아이들과 놀이를 이어가요</span>
                </div>
              )
            )}

            {/* 자료/편집 레이어 — 캔버스 전체(게임+확장에 인터랙티브). 팬과 함께 이동. 집중 모드선 숨김. */}
            {!isFs && !focus && (
              <StageSizeContext.Provider value={canvasSize}>
                <MaterialsLayer screenW={vp.w} />
              </StageSizeContext.Provider>
            )}
          </div>
        </div>

        {/* 하단 프롬프트바 — 단독 탭은 자체 바, 임베드/풀스크린은 보드 공통 바가 같은 동작을 한다.
            요소 선택 후 입력 = 그 요소 편집(보드와 동일), 선택 없으면 게임 생성.
            게임 플레이 중(게임 로드 + play 모드)엔 숨긴다 — 편집 모드/만들기(빈 화면)에서만 노출. */}
        {!isEmbedded && !isFs && !focus && !(mode === "play" && !!doc) && <GamePromptBar />}
      </div>
    </StageSizeContext.Provider>
  );
}
