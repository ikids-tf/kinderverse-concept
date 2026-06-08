import { useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, X, Trash2 } from 'lucide-react';
import { PageHero } from '@/components/PageHero';

/* ---------------- Calendar (캘린더) ----------------
   Teacher schedule at a glance with 일 / 주 / 월 views, plus register & edit of
   events via a modal. Inspired by the reference dashboard (big date numbers +
   time-blocked event cards), adapted to the Milray Park system.
   Ported 1:1 from the kinderVerse-2027 reference (inline-style + lucide). */

/* Milray Park light palette — hex values mirror src/styles/tokens.css 1:1. */
const C = {
  ink: '#141311',
  muted: '#8C887F',
  line: '#E7E0D4',
  coral: '#F2733E',
  fill: 'rgba(40,33,24,.035)',
  fill2: 'rgba(40,33,24,.06)',
  shadow1: '0 8px 24px rgba(40,33,24,.06)',
  shadow2: '0 18px 48px rgba(40,33,24,.08)',
};

const pageBody: React.CSSProperties = { padding: '0 28px 130px' };

type CatKey = '수업' | '회의' | '행사' | '상담';
type CalEvent = { id: number; date: string; start: string; end: string; title: string; cat: CatKey };
type Editing = { id: number | null; date: string; start: string; end: string; title: string; cat: CatKey };
type ViewMode = '일' | '주' | '월';

export function CalendarPage() {
  const a = C.coral;
  const CATS: Record<CatKey, string> = { 수업: '#F2733E', 회의: '#56524B', 행사: '#E0A62C', 상담: '#2E7D5B' };
  const TODAY = '2026-06-04';
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (dt: Date) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  const addDays = (dt: Date, n: number) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + n);
  const addMonths = (dt: Date, n: number) => new Date(dt.getFullYear(), dt.getMonth() + n, 1);

  const [view, setView] = useState<ViewMode>('월');
  const [cur, setCur] = useState(new Date(2026, 5, 4));
  const seq = useRef(100);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [events, setEvents] = useState<CalEvent[]>([
    { id: 1, date: '2026-06-03', start: '10:00', end: '11:30', title: '월간 교사 회의', cat: '회의' },
    { id: 2, date: '2026-06-03', start: '14:00', end: '15:00', title: '미술 활동 — 가을 나뭇잎', cat: '수업' },
    { id: 3, date: '2026-06-04', start: '09:30', end: '10:30', title: '자유놀이 관찰', cat: '수업' },
    { id: 4, date: '2026-06-04', start: '11:00', end: '12:00', title: '바깥놀이', cat: '수업' },
    { id: 5, date: '2026-06-04', start: '15:00', end: '16:00', title: '학부모 상담 — 김하준', cat: '상담' },
    { id: 6, date: '2026-06-05', start: '10:00', end: '12:00', title: '가을 현장학습', cat: '행사' },
    { id: 7, date: '2026-06-09', start: '13:00', end: '14:00', title: '발달 평가 회의', cat: '회의' },
    { id: 8, date: '2026-06-12', start: '15:00', end: '16:00', title: '생일 파티 — 이서연', cat: '행사' },
    { id: 9, date: '2026-06-16', start: '10:00', end: '11:00', title: '안전 교육', cat: '수업' },
    { id: 10, date: '2026-06-20', start: '14:00', end: '15:30', title: '학부모 공개수업', cat: '행사' },
  ]);

  const byDate = (ds: string) => events.filter((e) => e.date === ds).sort((x, y) => x.start.localeCompare(y.start));
  const newEvent = (ds?: string) => setEditing({ id: null, date: ds || fmt(cur), start: '09:00', end: '10:00', title: '', cat: '수업' });
  const save = () => {
    if (!editing || !editing.title.trim()) return;
    setEvents((es) =>
      editing.id
        ? es.map((e) => (e.id === editing.id ? (editing as CalEvent) : e))
        : [...es, { ...editing, id: ++seq.current }],
    );
    setEditing(null);
  };
  const del = () => { setEvents((es) => es.filter((e) => e.id !== editing?.id)); setEditing(null); };
  const shift = (d: number) => setCur((c) => (view === '월' ? addMonths(c, d) : view === '주' ? addDays(c, d * 7) : addDays(c, d)));

  const title =
    view === '월'
      ? `${cur.getFullYear()}년 ${cur.getMonth() + 1}월`
      : view === '주'
        ? (() => { const s = addDays(cur, -cur.getDay()); const e = addDays(s, 6); return `${s.getMonth() + 1}.${s.getDate()} – ${e.getMonth() + 1}.${e.getDate()}`; })()
        : `${cur.getMonth() + 1}월 ${cur.getDate()}일 (${WD[cur.getDay()]})`;

  const navBtn: React.CSSProperties = { width: 34, height: 34, borderRadius: 999, border: `1px solid ${C.line}`, background: '#fff', cursor: 'pointer', display: 'grid', placeItems: 'center' };
  const pillTan: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 999, border: `1px solid ${C.line}`, background: '#F4EDE3', color: C.ink, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 };
  const pillCoral: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 999, border: 'none', background: a, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 };
  const inputStyle: React.CSSProperties = { width: '100%', padding: '11px 14px', borderRadius: 12, border: `1.5px solid ${C.line}`, background: '#fff', fontFamily: 'inherit', fontSize: 14, color: C.ink, outline: 'none', boxSizing: 'border-box' };

  const compactCard = (ev: CalEvent) => (
    <button key={ev.id} onClick={() => setEditing({ ...ev })} style={{ textAlign: 'left', width: '100%', background: '#fff', border: `1px solid ${C.line}`, borderLeft: `3px solid ${CATS[ev.cat]}`, borderRadius: 9, padding: '7px 9px', cursor: 'pointer', fontFamily: 'inherit', marginBottom: 6 }}>
      <div style={{ fontSize: 10.5, color: C.muted, fontWeight: 600 }}>{ev.start}</div>
      <div style={{ fontWeight: 600, fontSize: 12, lineHeight: 1.3, marginTop: 1 }}>{ev.title}</div>
    </button>
  );

  return (
    <div style={{ paddingBottom: 4 }}>
      <PageHero
        eyebrow="일정 관리"
        title="캘린더"
        description="수업·회의·행사·상담 일정을 일·주·월로 관리하세요."
      />
      <div style={pageBody}>
      {/* toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 0', flexWrap: 'wrap' }}>
        <CalendarDays size={22} color={a} />
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600, minWidth: 130 }}>{title}</div>
        <button onClick={() => shift(-1)} style={navBtn}><ChevronLeft size={18} color={C.ink} /></button>
        <button onClick={() => shift(1)} style={navBtn}><ChevronRight size={18} color={C.ink} /></button>
        <button onClick={() => setCur(new Date(2026, 5, 4))} style={{ ...pillTan, padding: '8px 14px' }}>오늘</button>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'inline-flex', background: C.fill2, borderRadius: 999, padding: 3 }}>
          {(['일', '주', '월'] as ViewMode[]).map((v) => (
            <button key={v} onClick={() => setView(v)} style={{ padding: '7px 18px', borderRadius: 999, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, background: view === v ? '#fff' : 'transparent', color: view === v ? C.ink : C.muted, boxShadow: view === v ? C.shadow1 : 'none', transition: 'all .15s' }}>{v}</button>
          ))}
        </div>
        <button onClick={() => newEvent()} style={pillCoral}><Plus size={15} color="#fff" /> 일정 등록</button>
      </div>

      {/* ---- MONTH ---- */}
      {view === '월' && (() => {
        const lead = new Date(cur.getFullYear(), cur.getMonth(), 1).getDay();
        const dim = new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate();
        const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: dim }, (_, i) => i + 1)];
        while (cells.length % 7) cells.push(null);
        const wdColor = (i: number) => (i === 0 ? '#C8472E' : i === 6 ? a : C.muted);
        return (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 10, marginBottom: 10 }}>
              {WD.map((w, i) => <div key={w} style={{ fontSize: 15, fontWeight: 700, letterSpacing: '.08em', color: wdColor(i), padding: '0 0 0 5px' }}>{w}</div>)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 10 }}>
              {cells.map((d, i) => {
                if (!d) return <div key={i} style={{ minHeight: 122, borderRadius: 14, background: 'rgba(40,33,24,.018)' }} />;
                const col = i % 7;
                const ds = `${cur.getFullYear()}-${pad(cur.getMonth() + 1)}-${pad(d)}`;
                const evs = byDate(ds); const isToday = ds === TODAY;
                return (
                  <div key={i} className="kv-cell" onClick={() => newEvent(ds)} style={{ minHeight: 122, background: '#fff', border: `1px solid ${isToday ? a : C.line}`, borderRadius: 14, padding: '9px 9px 7px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <span style={{ alignSelf: 'flex-start', minWidth: 32, height: 32, padding: '0 9px', borderRadius: 999, display: 'grid', placeItems: 'center', fontSize: 19, fontWeight: 700, background: isToday ? a : 'transparent', color: isToday ? '#fff' : (col === 0 ? '#C8472E' : col === 6 ? a : C.ink) }}>{d}</span>
                    {evs.slice(0, 3).map((ev) => (
                      <button key={ev.id} onClick={(e) => { e.stopPropagation(); setEditing({ ...ev }); }} style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', border: 'none', background: 'transparent', borderRadius: 6, padding: '2px 4px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: CATS[ev.cat], flexShrink: 0 }} />
                        <span style={{ fontSize: 11, color: C.muted, fontWeight: 600, flexShrink: 0 }}>{ev.start}</span>
                        <span style={{ fontSize: 11.5, color: C.ink, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.title}</span>
                      </button>
                    ))}
                    {evs.length > 3 && <span style={{ fontSize: 10.5, color: C.muted, paddingLeft: 6 }}>+{evs.length - 3} 더보기</span>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ---- WEEK ---- */}
      {view === '주' && (() => {
        const start = addDays(cur, -cur.getDay());
        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 10 }}>
            {Array.from({ length: 7 }, (_, i) => addDays(start, i)).map((dt, i) => {
              const ds = fmt(dt); const evs = byDate(ds); const isToday = ds === TODAY;
              return (
                <div key={i} style={{ background: C.fill, border: `1px solid ${isToday ? a : C.line}`, borderRadius: 14, padding: 10, minHeight: 260 }}>
                  <div style={{ textAlign: 'center', marginBottom: 10 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: i === 0 ? '#C8472E' : i === 6 ? a : C.muted }}>{WD[i]}</div>
                    <div style={{ width: 42, height: 42, margin: '6px auto 0', borderRadius: '50%', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 22, background: isToday ? a : 'transparent', color: isToday ? '#fff' : C.ink }}>{dt.getDate()}</div>
                  </div>
                  {evs.map(compactCard)}
                  <button onClick={() => newEvent(ds)} style={{ width: '100%', marginTop: 2, border: `1px dashed ${C.line}`, background: 'transparent', borderRadius: 8, padding: '5px', cursor: 'pointer', color: C.muted, fontSize: 11, fontFamily: 'inherit' }}>+ 추가</button>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* ---- DAY (multi-day vertical agenda, reference style) ---- */}
      {view === '일' && (() => {
        const EN = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
        const days = Array.from({ length: 5 }, (_, i) => addDays(cur, i));
        return (
          <div>
            {days.map((dt, idx) => {
              const ds = fmt(dt); const evs = byDate(ds); const isToday = ds === TODAY; const dow = dt.getDay();
              return (
                <div key={ds} style={{ display: 'flex', gap: 32, alignItems: 'flex-start', padding: '24px 0', borderTop: idx ? `1px solid ${C.line}` : 'none' }}>
                  {/* big date */}
                  <div style={{ width: 168, flexShrink: 0, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 88, lineHeight: 0.82, letterSpacing: '-0.045em', color: isToday ? a : C.ink }}>{pad(dt.getDate())}</span>
                    <span style={{ fontSize: 15, fontWeight: 700, marginTop: 6, color: isToday ? a : (dow === 0 ? '#C8472E' : dow === 6 ? a : C.muted) }}>{EN[dow]}</span>
                  </div>
                  {/* events */}
                  <div style={{ flex: 1, minWidth: 0, maxWidth: 700, display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 6 }}>
                    {isToday && <div style={{ height: 2, background: a, borderRadius: 2, position: 'relative', marginBottom: 2 }}><span style={{ position: 'absolute', left: 0, top: -3, width: 8, height: 8, borderRadius: '50%', background: a }} /></div>}
                    {evs.length ? evs.map((ev) => (
                      <button key={ev.id} onClick={() => setEditing({ ...ev })} style={{ display: 'flex', gap: 16, width: '100%', textAlign: 'left', background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: '15px 18px', cursor: 'pointer', fontFamily: 'inherit', boxShadow: C.shadow1 }}>
                        <div style={{ minWidth: 58 }}>
                          <div style={{ fontWeight: 700, fontSize: 15 }}>{ev.start}</div>
                          <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{ev.end}</div>
                        </div>
                        <div style={{ width: 3, borderRadius: 3, background: CATS[ev.cat], alignSelf: 'stretch' }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 15 }}>{ev.title}</div>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6, fontSize: 11.5, fontWeight: 600, color: CATS[ev.cat] }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: CATS[ev.cat] }} />{ev.cat}</span>
                        </div>
                      </button>
                    )) : (
                      <button onClick={() => newEvent(ds)} style={{ width: '100%', textAlign: 'left', border: `1px dashed ${C.line}`, borderRadius: 14, padding: '15px 18px', background: 'transparent', cursor: 'pointer', color: C.muted, fontSize: 13, fontFamily: 'inherit' }}>아직 일정이 없어요 — 클릭해 추가</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* ---- editor modal ---- */}
      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(20,19,17,.34)', backdropFilter: 'blur(2px)', display: 'grid', placeItems: 'center', padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(440px,100%)', background: '#fff', borderRadius: 20, boxShadow: C.shadow2, padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600 }}>{editing.id ? '일정 편집' : '일정 등록'}</div>
              <button onClick={() => setEditing(null)} style={{ width: 34, height: 34, borderRadius: 999, border: 'none', background: '#F4EDE3', cursor: 'pointer', display: 'grid', placeItems: 'center' }}><X size={16} color={C.ink} /></button>
            </div>
            <input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="일정 제목" style={inputStyle} autoFocus />
            <input type="date" value={editing.date} onChange={(e) => setEditing({ ...editing, date: e.target.value })} style={inputStyle} />
            <div style={{ display: 'flex', gap: 10 }}>
              <input type="time" value={editing.start} onChange={(e) => setEditing({ ...editing, start: e.target.value })} style={{ ...inputStyle, flex: 1 }} />
              <input type="time" value={editing.end} onChange={(e) => setEditing({ ...editing, end: e.target.value })} style={{ ...inputStyle, flex: 1 }} />
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(Object.keys(CATS) as CatKey[]).map((k) => { const on = editing.cat === k; return (
                <button key={k} onClick={() => setEditing({ ...editing, cat: k })} style={{ padding: '7px 14px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, border: `1px solid ${on ? CATS[k] : C.line}`, background: on ? CATS[k] : '#fff', color: on ? '#fff' : C.ink }}>{k}</button>
              ); })}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 4, alignItems: 'center' }}>
              {editing.id && <button onClick={del} style={{ ...pillTan, border: 'none', background: 'rgba(200,71,46,.1)', color: '#C8472E' }}><Trash2 size={14} color="#C8472E" /> 삭제</button>}
              <div style={{ flex: 1 }} />
              <button onClick={() => setEditing(null)} style={pillTan}>취소</button>
              <button onClick={save} style={pillCoral}>저장</button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
