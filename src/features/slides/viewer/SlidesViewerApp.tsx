/* 슬라이드 뷰어 앱 — 보드 카드(iframe)에 임베드되는 자체 슬라이드 엔진의 셸.
   교사가 '직접' 슬라이드를 만든다: 레이아웃 선택 + 텍스트/불릿 인라인 편집 + 장 추가/이동/삭제.
   보드 계약은 기존 뷰어(magic/glb/video)와 동일 — kvSetChrome(호버·선택 시 편집 UI 표시),
   kv-embed-drag(상단 빈 곳 드래그=카드 이동), kv-embed-fullscreen / ?fs(보드 풀스크린 오버레이),
   kv-video-title(카드 헤더에 덱 제목). AI 한 줄 생성·PDF export는 다음 단계. */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  type DeckSpec,
  type Slide,
  type Layout,
  type Theme,
  type BlockPos,
  type BlockStyle,
  THEMES,
  THEME_LABEL,
  defaultDeck,
  defaultBlocks,
  relayout,
  isBullets,
  isText,
  isImage,
  isChart,
} from '../schema/deckspec';
import { SlideRenderer } from '../engine/SlideRenderer';
import { BlockEditorOverlay } from '../engine/BlockEditorOverlay';
import { MultiSelectOverlay } from '../engine/MultiSelectOverlay';
import { LAYOUT_META, type EditHandlers, type Selection } from '../engine/layouts';
import { ImagePicker } from './ImagePicker';
import { exportDeck } from './exportDeck';
import { loadDeck, saveDeck, deckKey } from './persist';

const SLIDE_W = 1280;
const SLIDE_H = 720;
const THUMB_W = 92; // 하단 레일 썸네일 폭(16:9 → 높이 ~52)

/** 썸네일은 읽기 전용 — 편집 핸들러는 빈 동작. */
const NOOP_HANDLERS: EditHandlers = {
  onText: () => {},
  setBulletItem: () => {},
  mutateBullets: () => {},
  select: () => {},
  setBlockStyle: () => {},
  pickImage: () => {},
  onEyebrow: () => {},
};

/** 테마 피커 스와치 — themes.css 대표 색(배경+악센트). 피커 미리보기 전용(엔진은 CSS가 결정). */
const THEME_SWATCH: Record<Theme, { bg: string; accent: string }> = {
  warm: { bg: '#f8f7f2', accent: '#f2733e' },
  ivory: { bg: '#ffffff', accent: '#c8472e' },
  midnight: { bg: '#1a1d24', accent: '#ffb454' },
  slate: { bg: '#ffffff', accent: '#2563eb' },
  sage: { bg: '#f7f8f3', accent: '#c1683c' },
  bloom: { bg: '#ffffff', accent: '#ff6f61' },
  mono: { bg: '#ffffff', accent: '#e5341c' },
};

/** 테마 미리보기 — 드롭다운에서 각 스타일을 '보고' 고르게: 면 색 + 잉크(글자) + 악센트 + 세리프 여부
    + 한 줄 분위기 설명. themes.css의 --s-canvas/--s-fg/--s-accent/--s-display 와 1:1(표시 전용). */
const THEME_PREVIEW: Record<Theme, { canvas: string; ink: string; accent: string; serif: boolean; desc: string }> = {
  warm: { canvas: '#f8f7f2', ink: '#141311', accent: '#f2733e', serif: true, desc: '따뜻한 크림' },
  ivory: { canvas: '#ffffff', ink: '#1a1a18', accent: '#c8472e', serif: true, desc: '깨끗한 화이트' },
  midnight: { canvas: '#1a1d24', ink: '#f5f3ec', accent: '#ffb454', serif: true, desc: '어두운 밤' },
  slate: { canvas: '#ffffff', ink: '#18283a', accent: '#2563eb', serif: false, desc: '차분한 블루' },
  sage: { canvas: '#f7f8f3', ink: '#232f23', accent: '#c1683c', serif: true, desc: '자연 그린' },
  bloom: { canvas: '#ffffff', ink: '#3a2b2b', accent: '#ff6f61', serif: true, desc: '밝고 다정' },
  mono: { canvas: '#ffffff', ink: '#0a0a0a', accent: '#e5341c', serif: false, desc: '강렬한 흑백' },
};
const PREV_SERIF = "'Playfair Display','Noto Serif KR',Georgia,serif";
const PREV_SANS = "'Hanken Grotesk','Pretendard',sans-serif";

/** 배경 단색 팔레트 — 부드러운 밝은 톤만(기본 어두운 글자 가독 유지). 슬라이드 콘텐츠는 Milray 면제. */
const BG_COLORS = ['#f6efe6', '#fdeadd', '#fbe0e0', '#fcf3d6', '#e6f1e4', '#e7efe1', '#e3edf3', '#ebe8e3', '#ffffff'];

/** 구조화 레이아웃 — 텍스트가 '카드/셀'로 파생 렌더되는 쌍/그리드 레이아웃. 여기선 블록을 자유
    이동·리사이즈(freeze)하지 않는다: 카드 안 텍스트를 절대좌표로 빼내면 카드 구조가 무너지기 때문.
    (크기 조정은 스타일 툴바의 글자 크기 버튼으로, 카드 선택은 카드 영역 클릭으로 지원.) */
const STRUCTURED_LAYOUTS = new Set<Layout>(['cards', 'steps', 'compare', 'stat-row', 'two-column', 'checklist', 'agenda']);
/** 클릭한 요소가 속한 카드/셀 컨테이너(구조화 레이아웃) 셀렉터. */
const CARD_SEL = '.sl-card, .sl-step, .sl-comp-col, .sl-stat-cell';

interface KvWindow extends Window {
  kvSetChrome?: (on: boolean) => void;
  kvSetPresent?: (on: boolean) => void;
  loadDeck?: (d: DeckSpec) => void;
}

function readParam(name: string): string | null {
  try {
    return new URLSearchParams(window.location.search).get(name);
  } catch {
    return null;
  }
}
function postParent(msg: Record<string, unknown>) {
  try {
    if (window.parent && window.parent !== window) window.parent.postMessage(msg, '*');
  } catch {
    /* standalone */
  }
}

/* ── 작은 인라인 아이콘(stroke=currentColor) ── */
const Svg = ({ d, fill }: { d: string; fill?: boolean }) => (
  <svg viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke={fill ? 'none' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);
const IC = {
  chevDown: 'm6 9 6 6 6-6',
  chevLeft: 'm15 18-6-6 6-6',
  chevRight: 'm9 18 6-6-6-6',
  plus: 'M12 5v14M5 12h14',
  expand: 'M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3M21 16v3a2 2 0 0 1-2 2h-3',
  x: 'M18 6 6 18M6 6l12 12',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  edit: 'M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z',
  check: 'M20 6 9 17l-5-5',
  undo: 'M3 7v6h6M21 17a9 9 0 0 0-15-6.7L3 13',
  redo: 'M21 7v6h-6M3 17a9 9 0 0 1 15-6.7L21 13',
  image: 'M3 5h18v14H3zM3 16l4-4 3 3 5-5 6 6M9 10a1 1 0 1 1-2 0 1 1 0 0 1 2 0z',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  download: 'M12 3v12M7 10l5 5 5-5M5 21h14',
};

/** 네이티브 폼 필드(제목 input·노트 textarea 등)에 타이핑 중인가 — contentEditable과 함께
    '타이핑' 판정에 쓴다. 빠뜨리면 문서 레벨 단축키(Backspace·화살표·Ctrl+Z)가 입력을 하이재킹한다. */
const isFormField = (el: Element | null): boolean => {
  const t = (el as HTMLElement | null)?.tagName;
  return t === 'TEXTAREA' || t === 'INPUT' || t === 'SELECT';
};

/** 발표자 노트 입력 — 로컬 draft + blur 커밋(타이핑마다 덱 전체 리렌더 방지). key={슬라이드 idx}로 리셋. */
const NotesBar = ({ value, onCommit }: { value: string; onCommit: (t: string) => void }) => {
  const [draft, setDraft] = useState(value);
  return (
    <div className="notes-bar">
      <span className="notes-label">발표자 노트</span>
      <textarea
        className="notes-input"
        placeholder="이 슬라이드에서 할 말·아이에게 던질 발문을 적어 두세요 — 화면에는 보이지 않아요"
        value={draft}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft.trim() !== value.trim()) onCommit(draft.trim());
        }}
      />
    </div>
  );
};

export function SlidesViewerApp() {
  const id = useMemo(() => readParam('id') || 'default', []);
  const fsMode = useMemo(() => readParam('fs') === '1', []);
  // 편집 페이지(?edit=1) — 보드 오버레이가 이 파라미터로 연다. 단독 페이지에선 로컬 토글.
  const editParam = useMemo(() => readParam('edit') === '1', []);
  const [editLocal, setEditLocal] = useState(false);
  const editMode = editParam || editLocal;
  // 보드 카드(iframe)로 임베드됐는가. 단독 페이지면 풀스크린을 네이티브 API로 처리한다.
  const embedded = useMemo(() => {
    try {
      return window.parent !== window;
    } catch {
      return true;
    }
  }, []);

  const [deck, setDeck] = useState<DeckSpec>(() => loadDeck(id) ?? defaultDeck());
  const deckRef = useRef(deck);
  deckRef.current = deck;
  const [current, setCurrent] = useState(0);
  const [chrome, setChrome] = useState(false);
  const [present, setPresent] = useState(false);
  const [layMenu, setLayMenu] = useState(false);
  // 편집 페이지 테마 드롭다운 — 눌러도 안 닫혀서(setTheme만) 여러 테마를 눌러 캔버스로 비교할 수 있다.
  const [themeMenu, setThemeMenu] = useState(false);
  const setTheme = (t: Theme) => setDeck((d) => ({ ...d, theme: t }));
  const [scale, setScale] = useState(1);
  const stageRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  // 썸네일 드래그 재정렬 상태 — { from: 잡은 슬라이드, to: 삽입 슬롯(0..N) }
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const dragRef = useRef<{ i: number; x: number; y: number; moved: boolean } | null>(null);
  // 선택 — 다중 블록(Shift 토글) + eyebrow. 슬라이드/편집 상태가 바뀌면 해제.
  const [sel, setSel] = useState<{ blocks: number[]; eyebrow: boolean }>({ blocks: [], eyebrow: false });
  const selRef = useRef(sel);
  selRef.current = sel;
  // 배경 선택 — 빈 캔버스를 클릭하면 배경(면)이 선택되어 이미지/색을 편집한다(블록·eyebrow와 배타).
  const [bgSel, setBgSel] = useState(false);
  const bgSelRef = useRef(bgSel);
  bgSelRef.current = bgSel;
  const [bgColorPop, setBgColorPop] = useState(false);
  const selection: Selection = useMemo(() => ({ blocks: new Set(sel.blocks), eyebrow: sel.eyebrow }), [sel]);
  const select = useCallback((target: number | 'eyebrow', additive = false) => {
    setBgSel(false);
    if (target === 'eyebrow') return setSel({ blocks: [], eyebrow: true });
    setSel((s) =>
      additive
        ? { blocks: s.blocks.includes(target) ? s.blocks.filter((b) => b !== target) : [...s.blocks, target], eyebrow: false }
        : { blocks: [target], eyebrow: false },
    );
  }, []);
  const clearSel = useCallback(() => { setSel({ blocks: [], eyebrow: false }); setBgSel(false); setBgColorPop(false); }, []);
  const selectBg = useCallback(() => { setSel({ blocks: [], eyebrow: false }); setBgSel(true); }, []);
  // 이미지 피커 대상(블록 이미지 / 배경 / 닫힘).
  const [pickerTarget, setPickerTarget] = useState<{ kind: 'block'; index: number } | { kind: 'bg' } | null>(null);
  const [exporting, setExporting] = useState(false);
  // 더보기(⋯) 메뉴 — 자주 안 쓰는 기능(테마·배경·내보내기·삭제)을 접어 둔다(툴바 과밀 방지).
  const [moreMenu, setMoreMenu] = useState(false);
  // 편집 페이지 툴바의 내보내기(PDF/PPTX) 드롭다운.
  const [dlMenu, setDlMenu] = useState(false);
  // Esc가 편집 페이지를 닫기 '전에' 먼저 닫아야 할 열린 UI(피커·메뉴) — 핸들러가 ref로 최신값을 읽는다.
  const openUiRef = useRef(false);
  openUiRef.current = !!pickerTarget || layMenu || moreMenu || dlMenu || themeMenu || bgColorPop;
  const closeOpenUi = useCallback(() => {
    setPickerTarget(null);
    setLayMenu(false);
    setMoreMenu(false);
    setDlMenu(false);
    setThemeMenu(false);
    setBgColorPop(false);
  }, []);

  const total = deck.slides.length;
  const idx = Math.min(current, total - 1);
  const idxRef = useRef(idx);
  idxRef.current = idx;
  const slide = deck.slides[idx];
  // 편집 페이지에선 항상 편집 가능(보드 호버 chrome과 무관). 카드에선 chrome이 결정.
  const editable = editMode || (chrome && !present && !fsMode);
  const editableRef = useRef(editable);
  editableRef.current = editable;
  const editModeRef = useRef(editMode);
  editModeRef.current = editMode;

  // 슬라이드 이동/편집 종료 시 선택 해제.
  useEffect(() => { clearSel(); }, [idx, editable, clearSel]);

  const totalRef = useRef(total);
  totalRef.current = total;
  const goTo = useCallback((n: number) => setCurrent(() => Math.max(0, Math.min(n, totalRef.current - 1))), []);
  const goRel = useCallback((d: number) => setCurrent((c) => Math.max(0, Math.min(c + d, totalRef.current - 1))), []);

  /* ── 영속화(디바운스) ── */
  useEffect(() => {
    const t = window.setTimeout(() => saveDeck(id, deck), 300);
    return () => window.clearTimeout(t);
  }, [deck, id]);

  /* ── 다른 인스턴스와 동기화 — 편집 오버레이(별도 iframe)가 같은 키에 저장하면 storage
     이벤트가 온다(자기 문서의 쓰기엔 안 옴). 편집 페이지에서 고친 내용이 카드에 실시간 반영. ── */
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== deckKey(id) || !e.newValue) return;
      try {
        if (e.newValue === JSON.stringify(deckRef.current)) return;
        setDeck(JSON.parse(e.newValue) as DeckSpec);
        setSel({ blocks: [], eyebrow: false });
        setBgSel(false);
      } catch {
        /* 손상된 값 — 무시 */
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [id]);

  /* ── 편집 페이지 열기/닫기 — 보드 카드에선 오버레이(?edit=1)로 확장, 단독 페이지에선 그 자리 전환. ── */
  const openEdit = useCallback(() => {
    if (embedded && !editParam) {
      saveDeck(id, deckRef.current); // 오버레이가 localStorage에서 읽으므로 먼저 flush
      postParent({ type: 'kv-embed-fullscreen', edit: true });
      return;
    }
    setEditLocal(true);
  }, [embedded, editParam, id]);
  const exitEdit = useCallback(() => {
    saveDeck(id, deckRef.current); // 카드 storage 동기화가 마지막 편집까지 받도록 flush
    if (editParam) {
      if (embedded) postParent({ type: 'kv-fs-exit' }); // 오버레이 모드 — 보드가 닫는다
      else {
        // 단독 페이지를 ?edit=1로 직접 연 경우 — 파라미터만 벗겨 일반 뷰어로.
        const u = new URL(window.location.href);
        u.searchParams.delete('edit');
        window.location.href = u.toString();
      }
      return;
    }
    setEditLocal(false);
  }, [editParam, embedded, id]);

  /* ── Undo/Redo 히스토리 — 변경을 디바운스(350ms)로 묶어 스냅샷(드래그/타이핑 한 단계). ── */
  const history = useRef<DeckSpec[]>([deck]);
  const histPtr = useRef(0);
  const traveling = useRef(false);
  const histTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (traveling.current) { traveling.current = false; return; }
    if (deck === history.current[histPtr.current]) return;
    window.clearTimeout(histTimer.current);
    histTimer.current = window.setTimeout(() => {
      const h = history.current.slice(0, histPtr.current + 1);
      h.push(deck);
      if (h.length > 60) h.shift();
      history.current = h;
      histPtr.current = h.length - 1;
    }, 350);
  }, [deck]);
  const undo = useCallback(() => {
    window.clearTimeout(histTimer.current);
    if (deckRef.current !== history.current[histPtr.current]) {
      const h = history.current.slice(0, histPtr.current + 1);
      h.push(deckRef.current);
      history.current = h;
      histPtr.current = h.length - 1;
    }
    if (histPtr.current <= 0) return;
    histPtr.current -= 1;
    traveling.current = true;
    setDeck(history.current[histPtr.current]);
    setSel({ blocks: [], eyebrow: false });
    setBgSel(false);
  }, []);
  const redo = useCallback(() => {
    if (histPtr.current >= history.current.length - 1) return;
    histPtr.current += 1;
    traveling.current = true;
    setDeck(history.current[histPtr.current]);
    setSel({ blocks: [], eyebrow: false });
    setBgSel(false);
  }, []);

  /* ── 무대 크기에 맞춰 슬라이드 캔버스 스케일(16:9 유지) ── */
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const fit = () => {
      const cs = getComputedStyle(el);
      const w = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const h = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      const s = Math.min(w / SLIDE_W, h / SLIDE_H);
      setScale(s > 0 && isFinite(s) ? s : 1);
    };
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    fit();
    return () => ro.disconnect();
  }, [present, fsMode]);

  /* ── body 클래스 동기화 ── */
  useEffect(() => { document.body.classList.toggle('chrome', chrome); }, [chrome]);
  useEffect(() => { document.body.classList.toggle('present', present); }, [present]);
  useEffect(() => { document.body.classList.toggle('standalone', !embedded); }, [embedded]);
  useEffect(() => { document.body.classList.toggle('editfs', editMode); }, [editMode]);

  /* ── 단독 페이지 — 네이티브 풀스크린과 present(발표 모드) 동기화. ── */
  useEffect(() => {
    if (embedded) return;
    const onFs = () => setPresent(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, [embedded]);

  /* ── 덱 제목 → 카드 헤더(kv-video-title 핸들러가 node.data.title에 영속) ── */
  useEffect(() => { postParent({ type: 'kv-video-title', title: deck.title }); }, [deck.title]);

  /* ── 보드 계약(window 함수) ── */
  useEffect(() => {
    const w = window as KvWindow;
    w.kvSetChrome = (on: boolean) => setChrome(!!on);
    w.kvSetPresent = (on: boolean) => {
      setPresent(!!on);
      postParent({ type: 'kv-embed-present', on: !!on });
    };
    w.loadDeck = (d: DeckSpec) => {
      setDeck(d);
      setCurrent(0);
      setSel({ blocks: [], eyebrow: false });
      setBgSel(false);
      history.current = [d];
      histPtr.current = 0;
      traveling.current = true;
    };
    return () => {
      delete w.kvSetChrome;
      delete w.kvSetPresent;
      delete w.loadDeck;
    };
  }, []);

  /* ── 상단/하단 빈 곳 드래그 → 카드 이동(kv-embed-drag) ── */
  useEffect(() => {
    let dragging = false;
    const isHandle = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      if (!el || !el.closest('.bar, .rail')) return false;
      return !el.closest('button') && !el.closest('input') && !el.closest('[contenteditable="true"]') && !el.closest('.laywrap');
    };
    const down = (e: PointerEvent) => {
      if (!isHandle(e.target)) return;
      dragging = true;
      postParent({ type: 'kv-embed-drag', phase: 'start', sx: e.screenX, sy: e.screenY });
      e.preventDefault();
    };
    const move = (e: PointerEvent) => {
      if (dragging) postParent({ type: 'kv-embed-drag', phase: 'move', sx: e.screenX, sy: e.screenY });
    };
    const end = () => {
      if (dragging) {
        dragging = false;
        postParent({ type: 'kv-embed-drag', phase: 'end' });
      }
    };
    document.addEventListener('pointerdown', down);
    document.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('pointerup', end);
    document.addEventListener('pointercancel', end);
    return () => {
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', end);
      document.removeEventListener('pointercancel', end);
    };
  }, []);

  /* ── 풀스크린(?fs) — 클래스·아이들 페이드·종료 ── */
  const exitFs = useCallback(() => postParent({ type: 'kv-fs-exit' }), []);
  useEffect(() => {
    document.body.classList.toggle('fs', fsMode);
    if (!fsMode) return;
    let idleT: number | null = null;
    const bump = () => {
      document.body.classList.remove('idle');
      if (idleT) window.clearTimeout(idleT);
      idleT = window.setTimeout(() => document.body.classList.add('idle'), 1600);
    };
    document.addEventListener('pointermove', bump, { passive: true });
    bump();
    return () => {
      document.removeEventListener('pointermove', bump);
      if (idleT) window.clearTimeout(idleT);
    };
  }, [fsMode]);

  /* ── 키보드 — 좌우로 장 이동, Esc로 발표/풀스크린 종료(편집 중엔 무시) ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ae = document.activeElement as HTMLElement | null;
      // 텍스트 입력 중(블록 contentEditable + 제목 input·노트 textarea)엔 캐럿 이동을 방해하지 않는다.
      if (ae && (ae.isContentEditable || isFormField(ae))) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        // 편집 중 '블록'이 선택돼 있으면 화살표는 블록 이동(nudge) 전용 — 장 넘김과 충돌 방지.
        // (eyebrow 선택은 nudge 대상이 아니므로 장 넘김 유지.)
        if (editableRef.current && selRef.current.blocks.length) return;
        e.preventDefault();
        goRel(e.key === 'ArrowRight' ? 1 : -1);
      } else if (e.key === 'Escape') {
        if (fsMode) exitFs();
        else if (present) {
          if (!embedded && document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
          else (window as KvWindow).kvSetPresent?.(false);
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [present, fsMode, goRel, exitFs, embedded]);

  /* ── 편집 핸들러 — 항상 '최신 상태'에 함수형 적용(편집/구조변경 경쟁 방지) ── */
  const patchSlide = useCallback((slideIdx: number, fn: (s: Slide) => Slide) => {
    setDeck((d) => ({ ...d, slides: d.slides.map((s, i) => (i === slideIdx ? fn(s) : s)) }));
  }, []);

  // 인터렉티브 슬라이드 — picker가 고른 노드 / 진행 정책 / 완료 자동 넘김을 현재 슬라이드에 반영.
  useEffect(() => {
    const onPick = (e: Event) => {
      const id = (e as CustomEvent).detail?.nodeId as string | undefined;
      patchSlide(idx, (s) => ({ ...s, nodeId: id || undefined }));
    };
    const onAdvancePolicy = (e: Event) => {
      const mode = (e as CustomEvent).detail?.mode as 'teacher' | 'onComplete' | undefined;
      patchSlide(idx, (s) => ({ ...s, advance: mode }));
    };
    const onComplete = () => goRel(1); // 활동 완료 → 다음 장(정책은 레이아웃이 판단해 발신)
    window.addEventListener('kv:inode-slide-pick', onPick as EventListener);
    window.addEventListener('kv:inode-slide-advance', onAdvancePolicy as EventListener);
    window.addEventListener('kv:inode-slide-complete', onComplete);
    return () => {
      window.removeEventListener('kv:inode-slide-pick', onPick as EventListener);
      window.removeEventListener('kv:inode-slide-advance', onAdvancePolicy as EventListener);
      window.removeEventListener('kv:inode-slide-complete', onComplete);
    };
  }, [idx, patchSlide, goRel]);
  const handlers: EditHandlers = useMemo(
    () => ({
      onText: (bi, text) =>
        patchSlide(idx, (s) => ({
          ...s,
          blocks: s.blocks.map((b, i) => (i === bi && 'text' in b ? { ...b, text } : b)),
        })),
      setBulletItem: (bi, ii, text) =>
        patchSlide(idx, (s) => ({
          ...s,
          blocks: s.blocks.map((b, i) => (i === bi && isBullets(b) ? { ...b, items: b.items.map((it, j) => (j === ii ? text : it)) } : b)),
        })),
      mutateBullets: (bi, fn) =>
        patchSlide(idx, (s) => ({
          ...s,
          blocks: s.blocks.map((b, i) => (i === bi && isBullets(b) ? { ...b, items: fn(b.items) } : b)),
        })),
      select,
      setBlockStyle: (bi, patch) =>
        patchSlide(idx, (s) => ({
          ...s,
          blocks: s.blocks.map((b, i) =>
            i === bi && (isText(b) || isBullets(b)) ? { ...b, style: { ...(b.style ?? {}), ...patch } } : b,
          ),
        })),
      pickImage: (bi) => setPickerTarget({ kind: 'block', index: bi }),
      onEyebrow: (text) => patchSlide(idx, (s) => ({ ...s, eyebrow: text.trim() || undefined })),
    }),
    [idx, patchSlide, select],
  );

  // 피커에서 고른 이미지(assetId)를 대상(블록/배경)에 적용.
  const applyPickedImage = (assetId: string) => {
    if (!pickerTarget) return;
    if (pickerTarget.kind === 'bg') {
      patchSlide(idx, (s) => ({ ...s, background: { assetId, dim: 0.35 } }));
    } else {
      const bi = pickerTarget.index;
      patchSlide(idx, (s) => ({ ...s, blocks: s.blocks.map((b, i) => (i === bi && isImage(b) ? { ...b, assetId } : b)) }));
    }
    setPickerTarget(null);
  };
  const removeBackground = () => patchSlide(idx, (s) => ({ ...s, background: undefined }));
  // 배경 편집 — 단색 지정/해제, 전체 제거(이미지+색).
  const setBgColor = (c?: string) => patchSlide(idx, (s) => ({ ...s, bgColor: c }));
  const clearBg = () => patchSlide(idx, (s) => ({ ...s, background: undefined, bgColor: undefined }));

  // 블록 자유 배치(드래그/리사이즈/회전) — pos 설정/해제. 모든 블록 타입에 적용.
  const setBlockPos = (bi: number, pos: BlockPos | null) =>
    patchSlide(idx, (s) => ({
      ...s,
      blocks: s.blocks.map((b, i) => (i === bi ? { ...b, pos: pos ?? undefined } : b)),
    }));
  const setEyebrowStyle = (patch: Partial<BlockStyle>) =>
    patchSlide(idx, (s) => ({ ...s, eyebrowStyle: { ...(s.eyebrowStyle ?? {}), ...patch } }));
  const setEyebrowPos = (pos: BlockPos | null) =>
    patchSlide(idx, (s) => ({ ...s, eyebrowPos: pos ?? undefined }));

  // 트랜스폼 시작 시 — 슬라이드의 모든 블록을 '현재 위치 그대로' 절대좌표(pos)로 고정한다.
  // 한 블록만 절대화하면 나머지 흐름 블록이 재정렬(가운데로 모임)되므로, 전부 동시에 고정해 리플로를 없앤다.
  // 캔버스 화면 rect 기준 %. (이미지/차트는 hPct까지, 텍스트/eyebrow는 호출측에서 hPct 제거)
  const measurePos = (el: HTMLElement, c: DOMRect): BlockPos => {
    const r = el.getBoundingClientRect();
    return {
      xPct: ((r.left - c.left) / c.width) * 100,
      yPct: ((r.top - c.top) / c.height) * 100,
      wPct: (r.width / c.width) * 100,
      hPct: (r.height / c.height) * 100,
    };
  };
  const freezeSlide = () => {
    if (STRUCTURED_LAYOUTS.has(deck.slides[idx].layout)) return; // 카드/셀 구조 보존(자유 배치 금지)
    const cv = document.querySelector<HTMLElement>('.stage .slide-canvas');
    if (!cv) return;
    const cur = deck.slides[idx];
    const needBlocks = cur.blocks.some((b, i) => !(b as { pos?: BlockPos }).pos && cv.querySelector(`[data-bi="${i}"]`));
    const needEyebrow = !cur.eyebrowPos && !!cv.querySelector('[data-bi="eyebrow"]');
    if (!needBlocks && !needEyebrow) return; // 이미 전부 고정됨
    const c = cv.getBoundingClientRect();
    const measured: Record<number, BlockPos> = {};
    let measuredEye: BlockPos | null = null;
    cv.querySelectorAll<HTMLElement>('[data-bi]').forEach((el) => {
      const raw = el.getAttribute('data-bi');
      if (raw === 'eyebrow') { if (!measuredEye) measuredEye = measurePos(el, c); return; }
      const bi = Number(raw);
      if (!Number.isInteger(bi) || measured[bi]) return;
      measured[bi] = measurePos(el, c);
    });
    patchSlide(idx, (s) => ({
      ...s,
      // eyebrow는 블록이 아니라 슬라이드 필드 — 함께 고정해야 블록 이동 시 안 밀린다(높이 자동 → hPct 생략).
      eyebrowPos: s.eyebrowPos ?? (measuredEye ? { xPct: measuredEye.xPct, yPct: measuredEye.yPct, wPct: measuredEye.wPct } : undefined),
      blocks: s.blocks.map((b, i) => {
        if ((b as { pos?: BlockPos }).pos || !measured[i]) return b;
        const m = measured[i];
        // 텍스트/불릿은 높이 자동 → hPct 생략. 이미지/차트는 높이 고정 필요 → hPct 유지.
        const needsH = isImage(b) || isChart(b);
        return { ...b, pos: needsH ? m : { xPct: m.xPct, yPct: m.yPct, wPct: m.wPct } };
      }),
    }));
  };

  /* ── 단축키 액션 — 현재 선택/슬라이드에 작용(refs로 최신값 읽음). ── */
  const deleteSelected = () => {
    const s = selRef.current;
    if (s.eyebrow) { patchSlide(idxRef.current, (sl) => ({ ...sl, eyebrow: undefined, eyebrowStyle: undefined })); clearSel(); return; }
    if (!s.blocks.length) return;
    const set = new Set(s.blocks);
    patchSlide(idxRef.current, (sl) => ({ ...sl, blocks: sl.blocks.filter((_, i) => !set.has(i)) }));
    clearSel();
  };
  const selectAll = () => {
    const cur = deckRef.current.slides[idxRef.current];
    const all = cur.blocks.map((_, i) => i).filter((i) => isText(cur.blocks[i]) || isBullets(cur.blocks[i]));
    setSel({ blocks: all, eyebrow: false });
  };
  // 선택 블록을 dxPct/dyPct만큼 이동 — 전체를 freeze(좌표 부여)한 뒤 대상만 이동(리플로 없음).
  const freezeAndMove = (targets: number[], dxPct: number, dyPct: number) => {
    if (STRUCTURED_LAYOUTS.has(deck.slides[idx].layout)) return; // 카드/셀 구조 보존(자유 이동 금지)
    const cv = document.querySelector<HTMLElement>('.stage .slide-canvas');
    if (!cv) return;
    const c = cv.getBoundingClientRect();
    const measured: Record<number, BlockPos> = {};
    let measuredEye: BlockPos | null = null;
    cv.querySelectorAll<HTMLElement>('[data-bi]').forEach((el) => {
      const raw = el.getAttribute('data-bi');
      if (raw === 'eyebrow') { if (!measuredEye) measuredEye = measurePos(el, c); return; }
      const bi = Number(raw);
      if (!Number.isInteger(bi) || measured[bi]) return;
      measured[bi] = measurePos(el, c);
    });
    const tset = new Set(targets);
    patchSlide(idxRef.current, (s) => ({
      ...s,
      // 블록 이동 시 eyebrow도 함께 고정(이동 대상 아님 — 제자리 유지).
      eyebrowPos: s.eyebrowPos ?? (measuredEye ? { xPct: measuredEye.xPct, yPct: measuredEye.yPct, wPct: measuredEye.wPct } : undefined),
      blocks: s.blocks.map((b, i) => {
        let base = (b as { pos?: BlockPos }).pos;
        if (!base && measured[i]) {
          const m = measured[i];
          base = isImage(b) || isChart(b) ? m : { xPct: m.xPct, yPct: m.yPct, wPct: m.wPct };
        }
        if (!base) return b;
        if (tset.has(i)) base = { ...base, xPct: base.xPct + dxPct, yPct: base.yPct + dyPct };
        return { ...b, pos: base };
      }),
    }));
  };
  const nudge = (key: string, big: boolean) => {
    const s = selRef.current;
    if (!s.blocks.length) return;
    const step = big ? 5 : 1;
    const dx = key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0;
    const dy = key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0;
    if (dx || dy) freezeAndMove(s.blocks, dx, dy);
  };

  /* ── 편집 단축키 — undo/redo·삭제·복제·복사/붙여넣기·전체선택·이동·Esc(텍스트 입력 중엔 일부 비활성) ── */
  useEffect(() => {
    if (!editable) return;
    const onKey = (e: KeyboardEvent) => {
      const ae = document.activeElement as HTMLElement | null;
      const formTyping = isFormField(ae); // 제목 input·노트 textarea — 네이티브 편집을 존중
      const typing = formTyping || (!!ae && ae.isContentEditable);
      const mod = e.ctrlKey || e.metaKey;
      // 폼 필드에선 Ctrl+Z/Y를 가로채지 않는다(네이티브 텍스트 undo). 캔버스 블록 편집 중엔 덱 undo 유지.
      if (mod && (e.key === 'z' || e.key === 'Z')) { if (formTyping) return; e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && (e.key === 'y' || e.key === 'Y')) { if (formTyping) return; e.preventDefault(); redo(); return; }
      // Esc 단계: 타이핑 블러(노트는 blur가 곧 커밋) → 열린 피커/메뉴 닫기 → 선택 해제 → 편집 페이지 닫기.
      if (e.key === 'Escape') {
        if (typing && ae) ae.blur();
        else if (openUiRef.current) closeOpenUi();
        else if (selRef.current.blocks.length || selRef.current.eyebrow || bgSelRef.current) clearSel();
        else if (editModeRef.current) exitEdit();
        return;
      }
      if (typing) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected(); return; }
      if (mod && (e.key === 'a' || e.key === 'A')) { e.preventDefault(); selectAll(); return; }
      if (e.key.startsWith('Arrow') && selRef.current.blocks.length) { e.preventDefault(); nudge(e.key, e.shiftKey); return; }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // 액션들은 refs로 최신값을 읽으므로 deps 불필요(undo/redo/clearSel/exitEdit/closeOpenUi만 안정 참조).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable, undo, redo, clearSel, exitEdit, closeOpenUi]);

  // PDF/PPTX 내보내기.
  const runExport = async (format: 'pdf' | 'pptx') => {
    setMoreMenu(false);
    setExporting(true);
    try {
      await exportDeck(deckRef.current, format);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('슬라이드 내보내기 실패', err);
    } finally {
      setExporting(false);
    }
  };

  /* ── 구조 편집 ── */
  const addSlide = (layout: Layout) => {
    setDeck((d) => {
      const slides = [...d.slides];
      slides.splice(idx + 1, 0, { layout, blocks: defaultBlocks(layout) });
      return { ...d, slides };
    });
    setCurrent(idx + 1);
    setLayMenu(false);
  };
  const changeLayout = (layout: Layout) => {
    patchSlide(idx, (s) => relayout(s, layout));
    setLayMenu(false);
  };
  const deleteSlide = () => {
    setDeck((d) => {
      if (d.slides.length <= 1) return { ...d, slides: [{ layout: 'title', blocks: defaultBlocks('title') }] };
      return { ...d, slides: d.slides.filter((_, i) => i !== idx) };
    });
    setCurrent((c) => Math.max(0, Math.min(c, total - 2)));
  };
  /* ── 썸네일 드래그 재정렬 — 슬라이드 순서 변경은 하단 레일 드래그가 전담(툴바 버튼 없음) ── */
  // from 슬라이드를 insertAt(0..N) 슬롯으로 옮긴다(이동한 슬라이드를 선택 상태로 유지).
  const moveSlideTo = (from: number, insertAt: number) => {
    const target = insertAt > from ? insertAt - 1 : insertAt;
    const newIndex = Math.max(0, Math.min(target, deck.slides.length - 1));
    setDeck((d) => {
      const slides = [...d.slides];
      const [s] = slides.splice(from, 1);
      slides.splice(Math.max(0, Math.min(target, slides.length)), 0, s);
      return { ...d, slides };
    });
    setCurrent(newIndex);
  };
  // 포인터 → 삽입 슬롯 인덱스(각 썸네일 중앙 기준). 편집 페이지 필름스트립은 세로(Y), 레일은 가로(X).
  const dropIndexFromPoint = (clientX: number, clientY: number): number => {
    const thumbs = railRef.current ? Array.from(railRef.current.querySelectorAll('.rail-thumb')) : [];
    const vertical = editModeRef.current;
    for (let i = 0; i < thumbs.length; i++) {
      const r = thumbs[i].getBoundingClientRect();
      if (vertical ? clientY < r.top + r.height / 2 : clientX < r.left + r.width / 2) return i;
    }
    return thumbs.length;
  };
  const onThumbDown = (i: number) => (e: ReactPointerEvent) => {
    dragRef.current = { i, x: e.clientX, y: e.clientY, moved: false };
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* noop */ }
  };
  const onThumbMove = (e: ReactPointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    // 이동 판정은 '배열 방향축' 기준(필름스트립=Y, 레일=X) — 수직으로만 흔들린 탭이
    // 드래그로 오판돼 클릭(goTo)조차 안 되는 죽은 탭이 되지 않게.
    const delta = editModeRef.current ? Math.abs(e.clientY - d.y) : Math.abs(e.clientX - d.x);
    if (!d.moved && delta < 4) return; // 임계 전 — 클릭으로 본다
    d.moved = true;
    setDrag({ from: d.i, to: dropIndexFromPoint(e.clientX, e.clientY) });
  };
  const onThumbUp = (i: number) => () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (d && d.moved && drag) {
      if (drag.to !== d.i && drag.to !== d.i + 1) moveSlideTo(d.i, drag.to); // 제자리면 무시
    } else {
      goTo(i); // 이동 없음 = 클릭 → 해당 슬라이드로
    }
    setDrag(null);
  };
  const openFullscreen = () => {
    if (embedded) {
      saveDeck(id, deck); // 보드 풀스크린 오버레이(iframe)가 localStorage에서 읽으므로 먼저 flush
      postParent({ type: 'kv-embed-fullscreen' });
      return;
    }
    // 단독 페이지 — 부모 보드가 없으니 네이티브 풀스크린으로 토글(fullscreenchange가 present 동기화).
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    else document.documentElement.requestFullscreen?.().catch(() => {});
  };
  // 종료 ✕ — 보드 오버레이(fsMode) / 단독 네이티브 풀스크린 / 발표(present) 모두 처리.
  const exitPresentation = () => {
    if (fsMode) { exitFs(); return; }
    if (!embedded && document.fullscreenElement) { document.exitFullscreen?.().catch(() => {}); return; }
    if (present) setPresent(false);
  };

  const curLabel = LAYOUT_META.find((m) => m.id === slide.layout)?.label ?? '레이아웃';
  const structured = STRUCTURED_LAYOUTS.has(slide.layout); // 카드/셀 레이아웃 — 자유 이동·리사이즈 비활성
  const singleIdx = sel.blocks.length === 1 ? sel.blocks[0] : null;
  const selBlk = singleIdx !== null ? slide.blocks[singleIdx] ?? null : null;
  const selStyleable = !!selBlk && (isText(selBlk) || isBullets(selBlk));
  const selHasPos = !!selBlk && (isText(selBlk) || isBullets(selBlk)) ? !!selBlk.pos : false;

  // 썸네일 타일 — 카드 하단 레일(가로)과 편집 페이지 필름스트립(세로)이 공유. 크기만 다르다.
  const thumbW = editMode ? 208 : THUMB_W;
  const thumbTiles = (
    <>
      {deck.slides.map((s, i) => (
        <Fragment key={i}>
          {drag && drag.to === i && <span className="rail-drop" />}
          <button
            type="button"
            className={`rail-thumb${i === idx ? ' on' : ''}${drag && drag.from === i ? ' dragging' : ''}`}
            title={`${i + 1}번 슬라이드 — 클릭 이동 · 드래그로 순서 변경`}
            onPointerDown={onThumbDown(i)}
            onPointerMove={onThumbMove}
            onPointerUp={onThumbUp(i)}
          >
            <div className="rail-thumb-scale" style={{ width: SLIDE_W, height: SLIDE_H, transform: `scale(${thumbW / SLIDE_W})` }}>
              <SlideRenderer slide={s} theme={deck.theme} editable={false} h={NOOP_HANDLERS} pageNumber={i + 1} thumbnail />
            </div>
            <span className="rail-thumb-num">{i + 1}</span>
          </button>
        </Fragment>
      ))}
      {drag && drag.to === deck.slides.length && <span className="rail-drop" />}
      <button type="button" className="rail-add" title="슬라이드 추가" onClick={() => addSlide(slide.layout)}><Svg d={IC.plus} /></button>
    </>
  );

  return (
    <div className="slides-root" data-theme={deck.theme}>
      {editMode ? (
        /* ── 편집 페이지 크롬(Google Slides 구조·Milray 톤) — 헤더(제목+완료) + 기능 그룹 툴바 행 ── */
        <>
          <div className="edit-head">
            <div className="edit-head-title">
              <span className="edit-overline">슬라이드 편집</span>
              <input
                className="bar-title edit-title"
                value={deck.title}
                spellCheck={false}
                title="덱 제목"
                onChange={(e) => setDeck((d) => ({ ...d, title: e.target.value }))}
              />
            </div>
            <button type="button" className="pbtn" title="편집 완료 (Esc)" onClick={exitEdit}>
              <Svg d={IC.check} /> 완료
            </button>
          </div>
          <div className="edit-tools">
            {/* 되돌리기 그룹 */}
            <div className="et-grp">
              <button type="button" className="et-icon" title="실행 취소 (Ctrl+Z)" onClick={undo}><Svg d={IC.undo} /></button>
              <button type="button" className="et-icon" title="다시 실행 (Ctrl+Shift+Z)" onClick={redo}><Svg d={IC.redo} /></button>
            </div>
            <span className="et-sep" />
            {/* 레이아웃 그룹 */}
            <div className="et-grp">
              <span className="et-label">레이아웃</span>
              <div className="laywrap">
                <button type="button" className="et-tbtn" title="이 슬라이드의 레이아웃 바꾸기" onClick={() => setLayMenu((v) => !v)}>
                  <span className="et-tbtn-cur">{curLabel}</span>
                  <Svg d={IC.chevDown} />
                </button>
                {layMenu && (
                  <div className="lay-menu" onMouseLeave={() => setLayMenu(false)}>
                    <div className="lay-menu-grid">
                      {LAYOUT_META.map((m) => (
                        <button key={m.id} type="button" className={`lay-item${m.id === slide.layout ? ' on' : ''}`} onClick={() => changeLayout(m.id)} title={`${m.label} 레이아웃으로`}>
                          <span className="mini">{m.icon}</span>
                          <span>{m.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <span className="et-sep" />
            {/* 테마 그룹 — 이름+미리보기 카드 드롭다운(각 스타일을 '보고' 고른다) */}
            <div className="et-grp">
              <span className="et-label">테마</span>
              <div className="laywrap">
                <button type="button" className="et-tbtn" title="전체 슬라이드 테마 바꾸기" onClick={() => setThemeMenu((v) => !v)}>
                  <span className="et-theme-dot" style={{ background: THEME_SWATCH[deck.theme].bg }}>
                    <span style={{ background: THEME_SWATCH[deck.theme].accent }} />
                  </span>
                  <span className="et-tbtn-cur">{THEME_LABEL[deck.theme]}</span>
                  <Svg d={IC.chevDown} />
                </button>
                {themeMenu && (
                  <div className="et-theme-menu" onMouseLeave={() => setThemeMenu(false)}>
                    {THEMES.map((t) => {
                      const p = THEME_PREVIEW[t];
                      return (
                        <button
                          key={t}
                          type="button"
                          className={`theme-card${t === deck.theme ? ' on' : ''}`}
                          onClick={() => setTheme(t)}
                          title={`${THEME_LABEL[t]} — ${p.desc}`}
                        >
                          <span className="tc-prev" style={{ background: p.canvas }}>
                            <span className="tc-aa" style={{ color: p.ink, fontFamily: p.serif ? PREV_SERIF : PREV_SANS }}>Aa</span>
                            <span className="tc-bar" style={{ background: p.accent }} />
                          </span>
                          <span className="tc-text">
                            <span className="tc-name">{THEME_LABEL[t]}</span>
                            <span className="tc-desc">{p.desc}</span>
                          </span>
                          {t === deck.theme && <span className="tc-check"><Svg d={IC.check} /></span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            <span className="et-sep" />
            {/* 슬라이드 그룹 — 배경·삭제(이 슬라이드) */}
            <div className="et-grp">
              <button type="button" className="et-tbtn" title="이 슬라이드에 배경 이미지 넣기" onClick={() => setPickerTarget({ kind: 'bg' })}>
                <Svg d={IC.image} /> 배경
              </button>
              {slide.background && (
                <button type="button" className="et-tbtn" title="배경 이미지 제거" onClick={removeBackground}>
                  <Svg d={IC.x} /> 배경 지우기
                </button>
              )}
              <button type="button" className="et-tbtn danger" title="이 슬라이드 삭제" onClick={deleteSlide}>
                <Svg d={IC.trash} /> 삭제
              </button>
            </div>
            <span className="et-spacer" />
            {/* 내보내기(새 슬라이드는 좌측 필름스트립 하단 버튼이 담당 — 중복 제거) */}
            <div className="laywrap">
              <button type="button" className="et-tbtn" title="PDF·PPTX로 내보내기" disabled={exporting} onClick={() => setDlMenu((v) => !v)}>
                {exporting ? <span className="be-spin" aria-label="내보내는 중" /> : <Svg d={IC.download} />} 내보내기
              </button>
              {dlMenu && (
                <div className="more-menu" style={{ width: 172 }} onMouseLeave={() => setDlMenu(false)}>
                  <button type="button" className="more-item" disabled={exporting} onClick={() => { setDlMenu(false); runExport('pdf'); }}>PDF로 내보내기</button>
                  <button type="button" className="more-item" disabled={exporting} onClick={() => { setDlMenu(false); runExport('pptx'); }}>PPTX로 내보내기</button>
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
      <div className="bar">
        {!embedded && (
          <button
            type="button"
            className="ibtn"
            style={{ width: 'auto', padding: '0 10px', gap: 4 }}
            title="보드로 돌아가기"
            onClick={() => { window.location.href = '/'; }}
          >
            <Svg d={IC.chevLeft} />
            <span style={{ font: '600 var(--fs-xs) var(--font-sans)' }}>보드</span>
          </button>
        )}
        <div className="laywrap">
          <button type="button" className="ibtn" style={{ width: 'auto', padding: '0 10px', gap: 4 }} title="이 슬라이드의 레이아웃" onClick={() => setLayMenu((v) => !v)}>
            <span style={{ font: '600 var(--fs-xs) var(--font-sans)' }}>{curLabel}</span>
            <Svg d={IC.chevDown} />
          </button>
          {layMenu && (
            <div className="lay-menu" onMouseLeave={() => setLayMenu(false)}>
              <div className="lay-menu-grid">
                {LAYOUT_META.map((m) => (
                  <button key={m.id} type="button" className={`lay-item${m.id === slide.layout ? ' on' : ''}`} onClick={() => changeLayout(m.id)} title={`${m.label} 레이아웃으로`}>
                    <span className="mini">{m.icon}</span>
                    <span>{m.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <input
          className="bar-title"
          value={deck.title}
          spellCheck={false}
          title="덱 제목"
          onChange={(e) => setDeck((d) => ({ ...d, title: e.target.value }))}
        />

        <button type="button" className="pbtn" title="편집 페이지로 확장 — 집중해서 슬라이드 편집" onClick={openEdit}>
          <Svg d={IC.edit} /> 편집
        </button>
        <div className="laywrap">
          <button type="button" className="ibtn" title="더보기 — 테마·배경·내보내기·삭제" onClick={() => setMoreMenu((v) => !v)}>
            {exporting ? <span className="be-spin" aria-label="내보내는 중" /> : <Svg d={IC.more} />}
          </button>
          {moreMenu && (
            <div className="more-menu" onMouseLeave={() => setMoreMenu(false)}>
              <div className="more-label">테마</div>
              <div className="more-swatches">
                {THEMES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`more-swatch${t === deck.theme ? ' on' : ''}`}
                    title={THEME_LABEL[t]}
                    style={{ background: THEME_SWATCH[t].bg }}
                    onClick={() => setTheme(t)}
                  >
                    <span style={{ background: THEME_SWATCH[t].accent }} />
                  </button>
                ))}
              </div>
              <div className="more-sep" />
              <button type="button" className="more-item" onClick={() => { setMoreMenu(false); setPickerTarget({ kind: 'bg' }); }}>배경 이미지…</button>
              {slide.background && (
                <button type="button" className="more-item" onClick={() => { setMoreMenu(false); removeBackground(); }}>배경 제거</button>
              )}
              <div className="more-sep" />
              <button type="button" className="more-item" disabled={exporting} onClick={() => runExport('pdf')}>PDF로 내보내기</button>
              <button type="button" className="more-item" disabled={exporting} onClick={() => runExport('pptx')}>PPTX로 내보내기</button>
              <div className="more-sep" />
              <button type="button" className="more-item danger" onClick={() => { setMoreMenu(false); deleteSlide(); }}>이 슬라이드 삭제</button>
            </div>
          )}
        </div>
        <button type="button" className="ibtn" title="전체 화면" onClick={openFullscreen}><Svg d={IC.expand} /></button>
      </div>
      )}

      {/* 작업 공간 — 편집 페이지에선 좌 필름스트립(세로 썸네일) + 중앙 무대(집중 편집) */}
      <div className="workspace">
        {editMode && (
          <div className="filmstrip" ref={railRef}>
            {thumbTiles}
          </div>
        )}
        <div className="stage-col">

      {/* 무대 */}
      <div
        className="stage"
        ref={stageRef}
        onMouseDown={(e) => {
          if (!editable) return;
          const t = e.target as HTMLElement;
          // 오버레이·툴바·배경 편집 UI 클릭 → 각자 처리(통과).
          if (t.closest('.be-toolbar, .be-frame, .be-multi, .bg-toolbar')) return;
          // 텍스트(글자) 클릭 → 그 블록이 선택됨(onFocus). 배경 선택만 해제.
          if (t.closest('[contenteditable="true"]')) { setBgSel(false); setBgColorPop(false); return; }
          // 카드/셀(구조화 레이아웃) 빈 여백 클릭 → 그 카드의 텍스트를 선택(카드 전체가 편집 대상).
          const cardEl = t.closest(CARD_SEL);
          if (cardEl) {
            const raw = cardEl.querySelector('[data-bi]')?.getAttribute('data-bi');
            const n = raw != null ? Number(raw) : NaN;
            if (Number.isInteger(n)) { select(n); return; }
          }
          // 이미지/차트(측정박스) 클릭 → 각자 처리(픽커·선택).
          if (t.closest('.sl-img, .sl-free-media, [data-bi]')) return;
          // 그 밖의 빈 캔버스 영역 클릭 → 배경(면) 선택. 캔버스 밖(무대 여백) 클릭 → 선택 해제.
          if (t.closest('.slide-canvas')) selectBg();
          else clearSel();
        }}
      >
        {present || fsMode ? (
          <>
            <button type="button" className="nav-arrow prev" title="이전" onClick={() => goRel(-1)}><Svg d={IC.chevLeft} /></button>
            <button type="button" className="nav-arrow next" title="다음" onClick={() => goRel(1)}><Svg d={IC.chevRight} /></button>
          </>
        ) : null}
        <div className={`scaler${bgSel ? ' bg-selected' : ''}`} style={{ width: SLIDE_W, height: SLIDE_H, transform: `translate(-50%, -50%) scale(${scale})` }}>
          <SlideRenderer key={`${idx}-${slide.layout}-${editable ? 'e' : 'v'}`} slide={slide} theme={deck.theme} editable={editable} h={handlers} pageNumber={idx + 1} selected={selection} />
        </div>
        {editable && sel.eyebrow && (
          <BlockEditorOverlay
            key="eyebrow"
            target="eyebrow"
            block={{ type: 'caption' as const, text: slide.eyebrow ?? '', pos: slide.eyebrowPos, style: slide.eyebrowStyle }}
            style={slide.eyebrowStyle}
            hasPos={!!slide.eyebrowPos}
            transformable={!structured}
            onStyle={(patch) => setEyebrowStyle(patch)}
            onPos={(p) => setEyebrowPos(p)}
            onFreezeStart={freezeSlide}
          />
        )}
        {editable && singleIdx !== null && slide.blocks[singleIdx] && (
          <BlockEditorOverlay
            key={`b${singleIdx}`}
            target={singleIdx}
            block={selBlk}
            style={selBlk && (isText(selBlk) || isBullets(selBlk)) ? selBlk.style : undefined}
            hasPos={selHasPos}
            transformable={!structured && selStyleable}
            onStyle={(patch) => handlers.setBlockStyle(singleIdx, patch)}
            onPos={(p) => setBlockPos(singleIdx, p)}
            onFreezeStart={freezeSlide}
          />
        )}
        {editable && sel.blocks.length > 1 && (
          <MultiSelectOverlay
            key={`m${sel.blocks.join('-')}`}
            indices={sel.blocks}
            onFreezeMove={(dx, dy) => freezeAndMove(sel.blocks, dx, dy)}
          />
        )}
        {/* 배경 편집 툴바 — 빈 캔버스를 클릭해 배경(면)을 선택하면 뜬다: 이미지 · 색 · 제거 */}
        {editable && bgSel && (
          <div className="bg-toolbar">
            <span className="bg-tt">배경</span>
            <button type="button" className="bg-btn" title="배경 이미지 넣기(생성·업로드·보관함)" onClick={() => setPickerTarget({ kind: 'bg' })}>
              <Svg d={IC.image} /> 이미지
            </button>
            <div className="laywrap">
              <button type="button" className="bg-btn" title="배경 색 바꾸기" onClick={() => setBgColorPop((v) => !v)}>
                <span className="bg-cchip" style={{ background: slide.bgColor || THEME_SWATCH[deck.theme].bg }} /> 색
                <Svg d={IC.chevDown} />
              </button>
              {bgColorPop && (
                <div className="bg-colorpop" onMouseLeave={() => setBgColorPop(false)}>
                  <button type="button" className={`bg-swatch bg-default${!slide.bgColor ? ' on' : ''}`} title="테마 기본 색" onClick={() => { setBgColor(undefined); }}>
                    <span>기본</span>
                  </button>
                  {BG_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`bg-swatch${slide.bgColor === c ? ' on' : ''}`}
                      title={c}
                      style={{ background: c }}
                      onClick={() => setBgColor(c)}
                    />
                  ))}
                </div>
              )}
            </div>
            {(slide.background || slide.bgColor) && (
              <button type="button" className="bg-btn danger" title="배경 이미지·색 제거(테마 기본으로)" onClick={clearBg}>
                <Svg d={IC.x} /> 제거
              </button>
            )}
          </div>
        )}
      </div>

      {/* 페이지 내비 — 장표 아래·썸네일 위(발표/풀스크린에선 좌우 화살표가 대신) */}
      <div className="stage-nav">
        <button type="button" className="ibtn" title="이전 슬라이드" disabled={idx <= 0} onClick={() => goRel(-1)}><Svg d={IC.chevLeft} /></button>
        <span className="bar-count">{idx + 1} / {total}</span>
        <button type="button" className="ibtn" title="다음 슬라이드" disabled={idx >= total - 1} onClick={() => goRel(1)}><Svg d={IC.chevRight} /></button>
      </div>

      {/* 편집 페이지 — 캔버스 아래 발표자 노트(speakerNote, 화면엔 렌더 안 됨).
          key에 커밋값 포함 — undo/외부 변경 시 draft가 따라오게(타이핑 중엔 value 불변 → 리마운트 없음). */}
      {editMode && (
        <NotesBar
          key={`${idx}-${slide.speakerNote ?? ''}`}
          value={slide.speakerNote ?? ''}
          onCommit={(t) => patchSlide(idx, (s) => ({ ...s, speakerNote: t || undefined }))}
        />
      )}

      {/* 하단 슬라이드 레일(카드 모드) — 편집 페이지에선 좌측 필름스트립이 대신한다 */}
      {!editMode && (
        <div className="rail" ref={railRef}>
          {thumbTiles}
        </div>
      )}
        </div>
      </div>

      {/* 풀스크린/발표 종료 ✕ (보드 오버레이 + 단독 네이티브 풀스크린) */}
      <button type="button" className="fs-exit" title="전체 화면 종료 (Esc)" onClick={exitPresentation}><Svg d={IC.x} /></button>

      {editable && pickerTarget && (
        <ImagePicker
          title={pickerTarget.kind === 'bg' ? '배경 이미지' : '블록 이미지'}
          onPick={applyPickedImage}
          onClose={() => setPickerTarget(null)}
        />
      )}
    </div>
  );
}
