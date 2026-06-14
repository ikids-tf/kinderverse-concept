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
import { loadDeck, saveDeck } from './persist';

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
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  moveLeft: 'M19 12H5M11 6l-6 6 6 6',
  moveRight: 'M5 12h14M13 6l6 6-6 6',
  expand: 'M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3M21 16v3a2 2 0 0 1-2 2h-3',
  x: 'M18 6 6 18M6 6l12 12',
  image: 'M3 5h18v14H3zM3 16l4-4 3 3 5-5 6 6M9 10a1 1 0 1 1-2 0 1 1 0 0 1 2 0z',
  download: 'M12 3v12M7 10l5 5 5-5M5 21h14',
};

export function SlidesViewerApp() {
  const id = useMemo(() => readParam('id') || 'default', []);
  const fsMode = useMemo(() => readParam('fs') === '1', []);

  const [deck, setDeck] = useState<DeckSpec>(() => loadDeck(id) ?? defaultDeck());
  const deckRef = useRef(deck);
  deckRef.current = deck;
  const [current, setCurrent] = useState(0);
  const [chrome, setChrome] = useState(false);
  const [present, setPresent] = useState(false);
  const [layMenu, setLayMenu] = useState(false);
  const [themeMenu, setThemeMenu] = useState(false);
  const setTheme = (t: Theme) => {
    setDeck((d) => ({ ...d, theme: t }));
    setThemeMenu(false);
  };
  const [scale, setScale] = useState(1);
  const stageRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  // 썸네일 드래그 재정렬 상태 — { from: 잡은 슬라이드, to: 삽입 슬롯(0..N) }
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const dragRef = useRef<{ i: number; x: number; moved: boolean } | null>(null);
  // 선택 — 다중 블록(Shift 토글) + eyebrow. 슬라이드/편집 상태가 바뀌면 해제.
  const [sel, setSel] = useState<{ blocks: number[]; eyebrow: boolean }>({ blocks: [], eyebrow: false });
  const selRef = useRef(sel);
  selRef.current = sel;
  const selection: Selection = useMemo(() => ({ blocks: new Set(sel.blocks), eyebrow: sel.eyebrow }), [sel]);
  const select = useCallback((target: number | 'eyebrow', additive = false) => {
    if (target === 'eyebrow') return setSel({ blocks: [], eyebrow: true });
    setSel((s) =>
      additive
        ? { blocks: s.blocks.includes(target) ? s.blocks.filter((b) => b !== target) : [...s.blocks, target], eyebrow: false }
        : { blocks: [target], eyebrow: false },
    );
  }, []);
  const clearSel = useCallback(() => setSel({ blocks: [], eyebrow: false }), []);
  // 이미지 피커 대상(블록 이미지 / 배경 / 닫힘).
  const [pickerTarget, setPickerTarget] = useState<{ kind: 'block'; index: number } | { kind: 'bg' } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportMenu, setExportMenu] = useState(false);

  const total = deck.slides.length;
  const idx = Math.min(current, total - 1);
  const idxRef = useRef(idx);
  idxRef.current = idx;
  const slide = deck.slides[idx];
  const editable = chrome && !present && !fsMode;

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
  }, []);
  const redo = useCallback(() => {
    if (histPtr.current >= history.current.length - 1) return;
    histPtr.current += 1;
    traveling.current = true;
    setDeck(history.current[histPtr.current]);
    setSel({ blocks: [], eyebrow: false });
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

  /* ── 키보드 — 발표/풀스크린에서 좌우 이동, Esc로 종료(편집 중엔 무시) ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ae = document.activeElement as HTMLElement | null;
      if (ae && ae.isContentEditable) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); goRel(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); goRel(-1); }
      else if (e.key === 'Escape') {
        if (fsMode) exitFs();
        else if (present) (window as KvWindow).kvSetPresent?.(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [present, fsMode, goRel, exitFs]);

  /* ── 편집 핸들러 — 항상 '최신 상태'에 함수형 적용(편집/구조변경 경쟁 방지) ── */
  const patchSlide = useCallback((slideIdx: number, fn: (s: Slide) => Slide) => {
    setDeck((d) => ({ ...d, slides: d.slides.map((s, i) => (i === slideIdx ? fn(s) : s)) }));
  }, []);
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

  // 블록 자유 배치(드래그/리사이즈/회전) — pos 설정/해제. 모든 블록 타입에 적용.
  const setBlockPos = (bi: number, pos: BlockPos | null) =>
    patchSlide(idx, (s) => ({
      ...s,
      blocks: s.blocks.map((b, i) => (i === bi ? { ...b, pos: pos ?? undefined } : b)),
    }));
  const setEyebrowStyle = (patch: Partial<BlockStyle>) =>
    patchSlide(idx, (s) => ({ ...s, eyebrowStyle: { ...(s.eyebrowStyle ?? {}), ...patch } }));

  // 트랜스폼 시작 시 — 슬라이드의 모든 블록을 '현재 위치 그대로' 절대좌표(pos)로 고정한다.
  // 한 블록만 절대화하면 나머지 흐름 블록이 재정렬(가운데로 모임)되므로, 전부 동시에 고정해 리플로를 없앤다.
  const freezeSlide = () => {
    const cv = document.querySelector<HTMLElement>('.stage .slide-canvas');
    if (!cv) return;
    const cur = deck.slides[idx];
    const need = cur.blocks.some((b, i) => !(b as { pos?: BlockPos }).pos && cv.querySelector(`[data-bi="${i}"]`));
    if (!need) return; // 이미 전부 고정됨
    const c = cv.getBoundingClientRect();
    const measured: Record<number, BlockPos> = {};
    cv.querySelectorAll<HTMLElement>('[data-bi]').forEach((el) => {
      const bi = Number(el.getAttribute('data-bi'));
      if (!Number.isInteger(bi) || measured[bi]) return;
      const r = el.getBoundingClientRect();
      measured[bi] = {
        xPct: ((r.left - c.left) / c.width) * 100,
        yPct: ((r.top - c.top) / c.height) * 100,
        wPct: (r.width / c.width) * 100,
        hPct: (r.height / c.height) * 100,
      };
    });
    patchSlide(idx, (s) => ({
      ...s,
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
    const cv = document.querySelector<HTMLElement>('.stage .slide-canvas');
    if (!cv) return;
    const c = cv.getBoundingClientRect();
    const measured: Record<number, BlockPos> = {};
    cv.querySelectorAll<HTMLElement>('[data-bi]').forEach((el) => {
      const bi = Number(el.getAttribute('data-bi'));
      if (!Number.isInteger(bi) || measured[bi]) return;
      const r = el.getBoundingClientRect();
      measured[bi] = { xPct: ((r.left - c.left) / c.width) * 100, yPct: ((r.top - c.top) / c.height) * 100, wPct: (r.width / c.width) * 100, hPct: (r.height / c.height) * 100 };
    });
    const tset = new Set(targets);
    patchSlide(idxRef.current, (s) => ({
      ...s,
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
      const typing = !!ae && ae.isContentEditable;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); redo(); return; }
      // Esc: 편집 중이면 블러(객체 모드, 선택 유지) → 한 번 더면 선택 해제.
      if (e.key === 'Escape') { if (typing && ae) ae.blur(); else clearSel(); return; }
      if (typing) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected(); return; }
      if (mod && (e.key === 'a' || e.key === 'A')) { e.preventDefault(); selectAll(); return; }
      if (e.key.startsWith('Arrow') && selRef.current.blocks.length) { e.preventDefault(); nudge(e.key, e.shiftKey); return; }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // 액션들은 refs로 최신값을 읽으므로 deps 불필요(undo/redo/clearSel만 안정 참조).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable, undo, redo, clearSel]);

  // PDF/PPTX 내보내기.
  const runExport = async (format: 'pdf' | 'pptx') => {
    setExportMenu(false);
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
  const moveSlide = (dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= total) return;
    setDeck((d) => {
      const slides = [...d.slides];
      [slides[idx], slides[j]] = [slides[j], slides[idx]];
      return { ...d, slides };
    });
    setCurrent(j);
  };

  /* ── 썸네일 드래그 재정렬 ── */
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
  // 포인터 x → 삽입 슬롯 인덱스(각 썸네일 중앙 기준).
  const dropIndexFromX = (clientX: number): number => {
    const thumbs = railRef.current ? Array.from(railRef.current.querySelectorAll('.rail-thumb')) : [];
    for (let i = 0; i < thumbs.length; i++) {
      const r = thumbs[i].getBoundingClientRect();
      if (clientX < r.left + r.width / 2) return i;
    }
    return thumbs.length;
  };
  const onThumbDown = (i: number) => (e: ReactPointerEvent) => {
    dragRef.current = { i, x: e.clientX, moved: false };
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* noop */ }
  };
  const onThumbMove = (e: ReactPointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    if (!d.moved && Math.abs(e.clientX - d.x) < 4) return; // 임계 전 — 클릭으로 본다
    d.moved = true;
    setDrag({ from: d.i, to: dropIndexFromX(e.clientX) });
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
    saveDeck(id, deck); // 풀스크린 iframe이 localStorage에서 읽으므로 먼저 flush
    postParent({ type: 'kv-embed-fullscreen' });
  };

  const curLabel = LAYOUT_META.find((m) => m.id === slide.layout)?.label ?? '레이아웃';
  const singleIdx = sel.blocks.length === 1 ? sel.blocks[0] : null;
  const selBlk = singleIdx !== null ? slide.blocks[singleIdx] ?? null : null;
  const selStyleable = !!selBlk && (isText(selBlk) || isBullets(selBlk));
  const selHasPos = !!selBlk && (isText(selBlk) || isBullets(selBlk)) ? !!selBlk.pos : false;

  return (
    <div className="slides-root" data-theme={deck.theme}>
      {/* 상단 편집 툴바 */}
      <div className="bar">
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

        <div className="bar-group">
          <button type="button" className="ibtn" title="이전 슬라이드" disabled={idx <= 0} onClick={() => goRel(-1)}><Svg d={IC.chevLeft} /></button>
          <span className="bar-count">{idx + 1} / {total}</span>
          <button type="button" className="ibtn" title="다음 슬라이드" disabled={idx >= total - 1} onClick={() => goRel(1)}><Svg d={IC.chevRight} /></button>
        </div>

        <input
          className="bar-title"
          value={deck.title}
          spellCheck={false}
          title="덱 제목"
          onChange={(e) => setDeck((d) => ({ ...d, title: e.target.value }))}
        />

        <div className="bar-group">
          <button type="button" className="ibtn" title="앞으로 이동" disabled={idx <= 0} onClick={() => moveSlide(-1)}><Svg d={IC.moveLeft} /></button>
          <button type="button" className="ibtn" title="뒤로 이동" disabled={idx >= total - 1} onClick={() => moveSlide(1)}><Svg d={IC.moveRight} /></button>
          <button type="button" className="ibtn" title="이 슬라이드 삭제" onClick={deleteSlide}><Svg d={IC.trash} /></button>
        </div>

        <div className="laywrap">
          <button type="button" className="ibtn" style={{ width: 'auto', padding: '0 8px', gap: 6 }} title="테마 — 전체 슬라이드 스타일" onClick={() => setThemeMenu((v) => !v)}>
            <span className="theme-dot" style={{ background: THEME_SWATCH[deck.theme]?.accent }} />
            <span style={{ font: '600 var(--fs-xs) var(--font-sans)' }}>{THEME_LABEL[deck.theme] ?? '테마'}</span>
            <Svg d={IC.chevDown} />
          </button>
          {themeMenu && (
            <div className="theme-menu" onMouseLeave={() => setThemeMenu(false)}>
              {THEMES.map((t) => (
                <button key={t} type="button" className={`theme-item${t === deck.theme ? ' on' : ''}`} onClick={() => setTheme(t)} title={`${THEME_LABEL[t]} 테마로`}>
                  <span className="theme-chip" style={{ background: THEME_SWATCH[t].bg }}>
                    <span className="theme-chip-acc" style={{ background: THEME_SWATCH[t].accent }} />
                  </span>
                  <span>{THEME_LABEL[t]}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="bar-group">
          <button type="button" className="ibtn" title="슬라이드 배경 이미지" onClick={() => setPickerTarget({ kind: 'bg' })}><Svg d={IC.image} /></button>
          {slide.background && <button type="button" className="ibtn" title="배경 제거" onClick={removeBackground}><Svg d={IC.x} /></button>}
        </div>
        <button type="button" className="pbtn" title="현재 레이아웃으로 새 슬라이드 추가" onClick={() => addSlide(slide.layout)}>
          <Svg d={IC.plus} /> 슬라이드
        </button>
        <div className="laywrap">
          <button type="button" className="ibtn" title="PDF·PPTX 내보내기" disabled={exporting} onClick={() => setExportMenu((v) => !v)}>
            {exporting ? <span className="be-spin" aria-label="내보내는 중" /> : <Svg d={IC.download} />}
          </button>
          {exportMenu && (
            <div className="export-menu" onMouseLeave={() => setExportMenu(false)}>
              <button type="button" className="export-item" onClick={() => runExport('pdf')}>PDF로 내보내기</button>
              <button type="button" className="export-item" onClick={() => runExport('pptx')}>PPTX로 내보내기</button>
            </div>
          )}
        </div>
        <button type="button" className="ibtn" title="전체 화면" onClick={openFullscreen}><Svg d={IC.expand} /></button>
      </div>

      {/* 무대 */}
      <div
        className="stage"
        ref={stageRef}
        onMouseDown={(e) => {
          // 빈 캔버스 클릭 → 블록 선택 해제(편집 모드에서만). 오버레이/툴바 클릭은 제외.
          if (editable && !(e.target as HTMLElement).closest('[contenteditable], .be-toolbar, .be-frame, .be-multi')) clearSel();
        }}
      >
        {present || fsMode ? (
          <>
            <button type="button" className="nav-arrow prev" title="이전" onClick={() => goRel(-1)}><Svg d={IC.chevLeft} /></button>
            <button type="button" className="nav-arrow next" title="다음" onClick={() => goRel(1)}><Svg d={IC.chevRight} /></button>
          </>
        ) : null}
        <div className="scaler" style={{ width: SLIDE_W, height: SLIDE_H, transform: `translate(-50%, -50%) scale(${scale})` }}>
          <SlideRenderer key={`${idx}-${slide.layout}-${editable ? 'e' : 'v'}`} slide={slide} theme={deck.theme} editable={editable} h={handlers} pageNumber={idx + 1} selected={selection} />
        </div>
        {editable && sel.eyebrow && (
          <BlockEditorOverlay
            key="eyebrow"
            target="eyebrow"
            block={null}
            style={slide.eyebrowStyle}
            hasPos={false}
            transformable={false}
            onStyle={(patch) => setEyebrowStyle(patch)}
            onPos={() => {}}
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
            transformable={selStyleable}
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
      </div>

      {/* 하단 슬라이드 레일 — 실제 슬라이드 썸네일 + 드래그로 순서 변경 */}
      <div className="rail" ref={railRef}>
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
              <div className="rail-thumb-scale" style={{ width: SLIDE_W, height: SLIDE_H, transform: `scale(${THUMB_W / SLIDE_W})` }}>
                <SlideRenderer slide={s} theme={deck.theme} editable={false} h={NOOP_HANDLERS} pageNumber={i + 1} />
              </div>
              <span className="rail-thumb-num">{i + 1}</span>
            </button>
          </Fragment>
        ))}
        {drag && drag.to === deck.slides.length && <span className="rail-drop" />}
        <button type="button" className="rail-add" title="슬라이드 추가" onClick={() => addSlide(slide.layout)}><Svg d={IC.plus} /></button>
      </div>

      {/* 풀스크린 종료 ✕ */}
      <button type="button" className="fs-exit" title="전체 화면 종료 (Esc)" onClick={exitFs}><Svg d={IC.x} /></button>

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
