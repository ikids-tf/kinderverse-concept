import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon, type IconName } from '@/lib/icons';
import { useUIStore } from '@/store/uiStore';
import { PromptBar } from '@/components/PromptBar';

/* Home / landing (reference KinderVerse parity): centered greeting + a
   horizontally-scrollable gallery of recommended resources (drag / wheel / page
   dots) + a quick-action pill row. Clicking a resource fills the prompt bar with
   its prompt (start right away); quick actions navigate. All styling uses Milray
   Park semantic tokens (CLAUDE §2.1) — coral accent, serif greeting, no
   hardcoded colors (the only literal is the mask alpha, which is not a color). */

interface Resource {
  title: string;
  sub: string;
  icon: IconName;
  prompt: string;
  thumb: string; // temporary placeholder thumbnail (SVG in /public/thumbnails)
}

const RESOURCES: Resource[] = [
  { title: '가정통신문 양식', sub: '10월 · 가을 운동회', icon: 'writing', prompt: '10월 가정통신문 초안을 만들어줘', thumb: '/thumbnails/newsletter.svg' },
  { title: '놀이 활동 카드', sub: '신체 · 표현 · 탐구', icon: 'board', prompt: '이번 주 실내 놀이 활동 3가지를 추천해줘', thumb: '/thumbnails/activity-cards.svg' },
  { title: '색칠 도안', sub: '가을 · 동물 · 과일', icon: 'studio', prompt: '가을 단풍 색칠 도안을 만들어줘', thumb: '/thumbnails/coloring.svg' },
  { title: '관찰 기록 양식', sub: '누리과정 5영역', icon: 'observation', prompt: '자유놀이 관찰 기록을 누리과정으로 분류해줘', thumb: '/thumbnails/observation.svg' },
  { title: '주간 식단표', sub: '알레르기 표시 포함', icon: 'plan', prompt: '알레르기 표시가 포함된 주간 식단표를 만들어줘', thumb: '/thumbnails/menu.svg' },
  { title: '안전 교육 자료', sub: '교통 · 화재 · 생활', icon: 'present', prompt: '유아 교통안전 교육 자료를 만들어줘', thumb: '/thumbnails/safety.svg' },
  { title: '동화 삽화', sub: 'AI 생성 일러스트', icon: 'gallery', prompt: '가을 숲에서 노는 아이들 동화풍 삽화를 그려줘', thumb: '/thumbnails/storybook.svg' },
  { title: '생일 축하 카드', sub: '이름 넣기 템플릿', icon: 'star', prompt: '우리반 친구 생일 축하 카드를 만들어줘', thumb: '/thumbnails/birthday.svg' },
  { title: '월간 학습 계획', sub: '주제별 활동 구성', icon: 'calendar', prompt: '이번 달 주제별 월간 학습 계획안을 만들어줘', thumb: '/thumbnails/monthly-plan.svg' },
  { title: '발달 평가 문구', sub: '영역별 제언 문장', icon: 'record', prompt: '유아 발달 평가 제언 문구를 영역별로 만들어줘', thumb: '/thumbnails/assessment.svg' },
];

const QUICK: Array<{ label: string; icon: IconName; to: string }> = [
  { label: '자료 갤러리', icon: 'gallery', to: '/gallery' },
  { label: '우리반', icon: 'class', to: '/class' },
  { label: '캘린더', icon: 'calendar', to: '/calendar' },
  { label: '자료 보관함', icon: 'folder', to: '/folder' },
  { label: '내 캔버스', icon: 'board', to: '/board' },
];

export function HomePage() {
  const navigate = useNavigate();
  const setDraft = useUIStore((s) => s.setPromptDraft);
  const setCollapsed = useUIStore((s) => s.setPromptBarCollapsed);

  const galleryRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; sl: number; lastX: number; vel: number } | null>(null);
  const movedRef = useRef(false);
  const momRef = useRef<number | null>(null);
  const [dots, setDots] = useState({ pages: 1, active: 0, start: true, end: false });

  function updateInd() {
    const el = galleryRef.current;
    if (!el) return;
    const pages = Math.max(1, Math.ceil(el.scrollWidth / el.clientWidth));
    const max = el.scrollWidth - el.clientWidth;
    setDots({
      pages,
      active: Math.min(pages - 1, Math.round(el.scrollLeft / el.clientWidth)),
      start: el.scrollLeft <= 1,
      end: el.scrollLeft >= max - 1,
    });
  }

  const goPage = (i: number) =>
    galleryRef.current?.scrollTo({ left: i * galleryRef.current.clientWidth, behavior: 'smooth' });

  function cancelMomentum() {
    if (momRef.current) cancelAnimationFrame(momRef.current);
    momRef.current = null;
  }

  function startMomentum(v0: number) {
    const el = galleryRef.current;
    if (!el) return;
    let v = Math.max(-30, Math.min(30, v0 * 1.15));
    const step = () => {
      const max = el.scrollWidth - el.clientWidth;
      if (Math.abs(v) < 0.5 || el.scrollLeft <= 0 || el.scrollLeft >= max) {
        momRef.current = null;
        updateInd();
        return;
      }
      el.scrollLeft += v;
      v *= 0.9;
      momRef.current = requestAnimationFrame(step);
    };
    momRef.current = requestAnimationFrame(step);
  }

  useEffect(() => {
    updateInd();
    const el = galleryRef.current;
    if (!el) return;
    // vertical wheel → horizontal scroll over the gallery
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        el.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('resize', updateInd);
    return () => {
      el.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', updateInd);
      cancelMomentum();
    };
  }, []);

  function onDragDown(e: React.MouseEvent<HTMLDivElement>) {
    cancelMomentum();
    const el = galleryRef.current;
    if (!el) return;
    dragRef.current = { x: e.clientX, sl: el.scrollLeft, lastX: e.clientX, vel: 0 };
    movedRef.current = false;
  }
  function onDragMove(e: React.MouseEvent<HTMLDivElement>) {
    const d = dragRef.current;
    const el = galleryRef.current;
    if (!d || !el) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 4) movedRef.current = true;
    el.scrollLeft = d.sl - dx;
    d.vel = -(e.clientX - d.lastX);
    d.lastX = e.clientX;
  }
  function onDragEnd() {
    const d = dragRef.current;
    dragRef.current = null;
    if (d && Math.abs(d.vel) > 1.5) startMomentum(d.vel);
  }

  // Fill the prompt bar with the resource prompt (start right away).
  function onPick(prompt: string) {
    if (movedRef.current) return; // ignore click that was actually a drag
    setCollapsed(false);
    setDraft(prompt);
  }

  // Edge fade only where there is still content to scroll.
  const galMask = `linear-gradient(to right, transparent 0, #000 ${dots.start ? '0px' : '48px'}, #000 ${
    dots.end ? '100%' : 'calc(100% - 48px)'
  }, transparent 100%)`;

  return (
    <div className="kv-home-in mx-auto flex min-h-full w-full max-w-6xl flex-col items-center justify-center px-t6 pb-40 pt-t8">
      {/* Greeting */}
      <div className="text-center">
        <div className="mb-t2 font-sans text-xs font-bold tracking-[0.16em] text-accent">KINDERVERSE</div>
        <h1 className="font-display text-h1 font-semibold leading-[1.15] tracking-[-0.01em] text-fg sm:text-display">
          선생님, 오늘은
          <br />
          무엇을 만들어 볼까요?
        </h1>
        <p className="mt-t3 text-body-lg text-fg-2">아래에 입력하거나, 추천 자료에서 바로 시작하세요.</p>
      </div>

      {/* Recommended resource gallery */}
      <div className="mt-t8 flex w-full flex-col items-center gap-t4">
        <div
          ref={galleryRef}
          onScroll={updateInd}
          onMouseDown={onDragDown}
          onMouseMove={onDragMove}
          onMouseUp={onDragEnd}
          onMouseLeave={onDragEnd}
          className="kv-gallery flex w-full cursor-grab select-none gap-t3 overflow-x-auto px-t6 py-t1 active:cursor-grabbing"
          style={{ WebkitMaskImage: galMask, maskImage: galMask }}
        >
          {RESOURCES.map((r) => (
            <button
              key={r.title}
              draggable={false}
              onClick={() => onPick(r.prompt)}
              className="flex w-56 flex-none flex-col rounded-2xl border border-border bg-surface p-t4 text-left shadow-sm transition-[transform,box-shadow,border-color] duration-150 ease-soft hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md"
            >
              <div className="mb-t3 h-32 overflow-hidden rounded-xl border border-border/60 bg-accent-soft">
                <img
                  src={r.thumb}
                  alt=""
                  draggable={false}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="truncate font-sans text-body font-semibold text-fg">{r.title}</div>
              <div className="mt-0.5 truncate text-sm text-fg-muted">{r.sub}</div>
            </button>
          ))}
        </div>

        {/* page dots — active one is a coral pill */}
        {dots.pages > 1 && (
          <div className="flex items-center justify-center gap-1.5">
            {Array.from({ length: dots.pages }).map((_, i) => (
              <button
                key={i}
                onClick={() => goPage(i)}
                aria-label={`${i + 1}페이지`}
                className={`h-2 rounded-pill transition-all duration-200 ease-soft ${
                  i === dots.active ? 'w-6 bg-accent' : 'w-2 bg-surface-3 hover:bg-border-strong'
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Prompt bar — inline on Home, between the resource thumbnails above and
          the quick-action pills below (the docked bottom bar is suppressed on
          this route in AppShell). */}
      <div className="mt-t8 w-full">
        <PromptBar variant="inline" />
      </div>

      {/* Quick actions */}
      <div className="mt-t8 flex flex-wrap items-center justify-center gap-t2">
        {QUICK.map((q, i) => (
          <button
            key={q.to}
            onClick={() => navigate(q.to)}
            style={{ animationDelay: `${300 + i * 85}ms` }}
            className="kv-quick-in inline-flex items-center gap-t2 rounded-pill border border-border bg-surface py-t2 pl-t2 pr-t4 text-sm font-semibold text-fg shadow-sm transition-[transform,box-shadow,border-color] duration-150 ease-soft hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-soft text-accent">
              <Icon name={q.icon} size={14} />
            </span>
            {q.label}
          </button>
        ))}
      </div>
    </div>
  );
}
