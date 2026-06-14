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
  THEMES,
  THEME_LABEL,
  defaultDeck,
  defaultBlocks,
  relayout,
  isBullets,
} from '../schema/deckspec';
import { SlideRenderer } from '../engine/SlideRenderer';
import { LAYOUT_META, type EditHandlers } from '../engine/layouts';
import { loadDeck, saveDeck } from './persist';

const SLIDE_W = 1280;
const SLIDE_H = 720;
const THUMB_W = 92; // 하단 레일 썸네일 폭(16:9 → 높이 ~52)

/** 썸네일은 읽기 전용 — 편집 핸들러는 빈 동작. */
const NOOP_HANDLERS: EditHandlers = { onText: () => {}, setBulletItem: () => {}, mutateBullets: () => {} };

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
};

export function SlidesViewerApp() {
  const id = useMemo(() => readParam('id') || 'default', []);
  const fsMode = useMemo(() => readParam('fs') === '1', []);

  const [deck, setDeck] = useState<DeckSpec>(() => loadDeck(id) ?? defaultDeck());
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

  const total = deck.slides.length;
  const idx = Math.min(current, total - 1);
  const slide = deck.slides[idx];
  const editable = chrome && !present && !fsMode;

  const totalRef = useRef(total);
  totalRef.current = total;
  const goTo = useCallback((n: number) => setCurrent(() => Math.max(0, Math.min(n, totalRef.current - 1))), []);
  const goRel = useCallback((d: number) => setCurrent((c) => Math.max(0, Math.min(c + d, totalRef.current - 1))), []);

  /* ── 영속화(디바운스) ── */
  useEffect(() => {
    const t = window.setTimeout(() => saveDeck(id, deck), 300);
    return () => window.clearTimeout(t);
  }, [deck, id]);

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
    }),
    [idx, patchSlide],
  );

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
        <button type="button" className="pbtn" title="현재 레이아웃으로 새 슬라이드 추가" onClick={() => addSlide(slide.layout)}>
          <Svg d={IC.plus} /> 슬라이드
        </button>
        <button type="button" className="ibtn" title="전체 화면" onClick={openFullscreen}><Svg d={IC.expand} /></button>
      </div>

      {/* 무대 */}
      <div className="stage" ref={stageRef}>
        {present || fsMode ? (
          <>
            <button type="button" className="nav-arrow prev" title="이전" onClick={() => goRel(-1)}><Svg d={IC.chevLeft} /></button>
            <button type="button" className="nav-arrow next" title="다음" onClick={() => goRel(1)}><Svg d={IC.chevRight} /></button>
          </>
        ) : null}
        <div className="scaler" style={{ width: SLIDE_W, height: SLIDE_H, transform: `translate(-50%, -50%) scale(${scale})` }}>
          <SlideRenderer key={`${idx}-${slide.layout}-${editable ? 'e' : 'v'}`} slide={slide} theme={deck.theme} editable={editable} h={handlers} pageNumber={idx + 1} />
        </div>
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
    </div>
  );
}
