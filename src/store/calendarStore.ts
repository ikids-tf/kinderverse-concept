import { create } from 'zustand';

/* 캘린더 (PRD §4.6, §11). 일정 → 생성 트리거. M5 uses seeded local state. */

export type EventType = '행사' | '생일' | '안전교육' | '현장학습' | '기타';

export interface CalEvent {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  type: EventType;
  linkedArtifact?: string;
}

interface CalendarState {
  events: CalEvent[];
  addEvent: (e: Omit<CalEvent, 'id'>) => void;
  removeEvent: (id: string) => void;
  eventsOn: (date: string) => CalEvent[];
}

let seq = 0;
const id = () => `evt_${++seq}`;

const SEED: CalEvent[] = [
  { id: id(), date: '2026-06-07', title: '5월 가정의 달 마무리 활동', type: '행사' },
  { id: id(), date: '2026-06-12', title: '딸기 농장 현장학습', type: '현장학습' },
  { id: id(), date: '2026-06-18', title: '교통안전 교육', type: '안전교육' },
  { id: id(), date: '2026-06-25', title: '지호 생일', type: '생일' },
];

export const useCalendarStore = create<CalendarState>((set, get) => ({
  events: SEED,
  addEvent: (e) => set((s) => ({ events: [...s.events, { ...e, id: id() }] })),
  removeEvent: (eid) => set((s) => ({ events: s.events.filter((x) => x.id !== eid) })),
  eventsOn: (date) => get().events.filter((e) => e.date === date),
}));

export const EVENT_COLOR: Record<EventType, string> = {
  행사: 'bg-accent',
  생일: 'bg-gold',
  안전교육: 'bg-success',
  현장학습: 'bg-accent-hover',
  기타: 'bg-surface-3',
};
