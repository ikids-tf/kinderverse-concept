import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '@/lib/icons';
import { useCalendarStore, EVENT_COLOR, type EventType } from '@/store/calendarStore';
import { useRouterStore } from '@/store/routerStore';
import { useUIStore } from '@/store/uiStore';
import { actionsForPath } from '@/ai/actions';

/* 캘린더 (PRD §4.6). 월 뷰 + 일정 + "이 일정으로 만들기" 생성 트리거.
   M5는 2026년 6월에 고정(시드 기준), 이전/다음 달 이동 가능. */

const TODAY = '2026-06-07';
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const EVENT_TYPES: EventType[] = ['행사', '생일', '안전교육', '현장학습', '기타'];

function ymd(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function CalendarPage() {
  const navigate = useNavigate();
  const events = useCalendarStore((s) => s.events);
  const addEvent = useCalendarStore((s) => s.addEvent);
  const removeEvent = useCalendarStore((s) => s.removeEvent);
  const send = useRouterStore((s) => s.send);

  const [view, setView] = useState({ y: 2026, m: 5 }); // June 2026 (0-based)
  const [selected, setSelected] = useState(TODAY);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<EventType>('행사');

  const firstDow = new Date(view.y, view.m, 1).getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const dayEvents = events.filter((e) => e.date === selected);

  function move(delta: number) {
    setView((v) => {
      const m = v.m + delta;
      if (m < 0) return { y: v.y - 1, m: 11 };
      if (m > 11) return { y: v.y + 1, m: 0 };
      return { y: v.y, m };
    });
  }

  // 일정 → 생성 트리거: 라우터로 보내고 채팅으로 이동 (우리반 컨텍스트 자동 동봉)
  function generateFrom(title: string) {
    void send({
      text: `${title} 가정통신문 초안 써줘`,
      page: '/calendar',
      selection: { ids: [], types: [], count: 0 },
      available_actions: actionsForPath('/calendar'),
    });
    useUIStore.getState().setPromptDraft('');
    navigate('/chat');
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-t6 pt-t7 pb-40">
      <header className="mb-t6">
        <div className="text-overline mb-t2 text-fg-muted">일정 → 생성 트리거</div>
        <h1 className="font-display text-display font-semibold tracking-[-0.01em] text-fg">캘린더</h1>
      </header>

      <div className="mb-t4 flex items-center gap-t3">
        <button onClick={() => move(-1)} className="flex h-9 w-9 items-center justify-center rounded-pill border border-border hover:bg-surface-2">
          <Icon name="chevronLeft" size={16} />
        </button>
        <span className="font-display text-h3 font-semibold text-fg">
          {view.y}년 {view.m + 1}월
        </span>
        <button onClick={() => move(1)} className="flex h-9 w-9 items-center justify-center rounded-pill border border-border hover:bg-surface-2">
          <Icon name="chevronRight" size={16} />
        </button>
        <button
          onClick={() => { setView({ y: 2026, m: 5 }); setSelected(TODAY); }}
          className="ml-auto rounded-pill border border-border px-t3 py-1 text-sm text-fg-2 hover:bg-surface-2"
        >
          오늘
        </button>
      </div>

      <div className="grid gap-t6 md:grid-cols-[1fr_300px]">
        {/* month grid */}
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          <div className="grid grid-cols-7 border-b border-border">
            {WEEKDAYS.map((w, i) => (
              <div
                key={w}
                className={`py-t2 text-center text-overline ${i === 0 ? 'text-accent' : 'text-fg-muted'}`}
              >
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((d, i) => {
              if (d === null) return <div key={`e${i}`} className="min-h-[84px] border-b border-r border-border/60" />;
              const date = ymd(view.y, view.m, d);
              const evs = events.filter((e) => e.date === date);
              const isToday = date === TODAY;
              const isSel = date === selected;
              return (
                <button
                  key={date}
                  onClick={() => setSelected(date)}
                  className={`min-h-[84px] border-b border-r border-border/60 p-t2 text-left align-top transition-colors duration-150 ease-soft hover:bg-surface-2 ${
                    isSel ? 'bg-accent-soft' : ''
                  }`}
                >
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-sm ${
                      isToday ? 'bg-accent text-on-accent font-semibold' : 'text-fg'
                    }`}
                  >
                    {d}
                  </span>
                  <div className="mt-t1 flex flex-col gap-0.5">
                    {evs.slice(0, 2).map((e) => (
                      <span key={e.id} className="flex items-center gap-t1 truncate text-overline text-fg-2">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${EVENT_COLOR[e.type]}`} />
                        <span className="truncate">{e.title}</span>
                      </span>
                    ))}
                    {evs.length > 2 && <span className="text-overline text-fg-muted">+{evs.length - 2}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* day detail */}
        <div className="rounded-2xl border border-border bg-bg-deep/40 p-t5">
          <div className="text-overline mb-t3 text-fg-muted">{selected}</div>

          <div className="flex flex-col gap-t2">
            {dayEvents.map((e) => (
              <div key={e.id} className="rounded-md border border-border bg-surface p-t3">
                <div className="flex items-center gap-t2">
                  <span className={`h-2 w-2 rounded-full ${EVENT_COLOR[e.type]}`} />
                  <span className="text-sm font-semibold text-fg">{e.title}</span>
                  <span className="text-overline text-fg-muted">{e.type}</span>
                  <button onClick={() => removeEvent(e.id)} className="ml-auto text-fg-muted hover:text-danger" aria-label="삭제">
                    <Icon name="x" size={13} />
                  </button>
                </div>
                <button
                  onClick={() => generateFrom(e.title)}
                  className="mt-t2 inline-flex items-center gap-t1 rounded-pill bg-fg px-t3 py-1 text-overline text-on-dark hover:bg-fg-1"
                >
                  <Icon name="sparkle" size={12} fill="currentColor" /> 이 일정으로 만들기
                </button>
              </div>
            ))}
            {dayEvents.length === 0 && <p className="text-sm text-fg-muted">일정이 없어요.</p>}
          </div>

          {/* add event */}
          <div className="mt-t4 border-t border-border pt-t3">
            <div className="text-overline mb-t2 text-fg-muted">일정 추가</div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="일정 제목"
              className="mb-t2 w-full rounded-md border border-field-border bg-surface px-t3 py-t2 text-sm focus:outline-none focus:ring-2 focus:ring-focus"
            />
            <div className="mb-t2 flex flex-wrap gap-t1">
              {EVENT_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`rounded-pill px-t2 py-0.5 text-overline ${
                    type === t ? 'bg-fg text-on-dark' : 'border border-border text-fg-2'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <button
              onClick={() => {
                if (!title.trim()) return;
                addEvent({ date: selected, title: title.trim(), type });
                setTitle('');
              }}
              className="w-full rounded-pill bg-accent px-t4 py-t2 text-sm font-semibold text-on-accent hover:bg-accent-hover"
            >
              추가
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
