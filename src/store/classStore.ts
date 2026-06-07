import { create } from 'zustand';
import { curriculumForAge, CURRICULUM_LABEL, type AgeBand } from '@/ai/pedagogy';

/* 우리반 — 아동 등록·관리 (PRD §4.4, §11). The primary context source for
   memory/slots (§8.1). Tenant-isolated; child PII is masked when it leaves the
   module (agent context, external). consent_flag gates pipeline inclusion (§12).

   M5 uses seeded local state (Supabase wiring is later). */

export type Attendance = 'present' | 'absent' | 'pending';

export interface Medication {
  id: string;
  name: string;
  dose: string;
  time: string;
  note?: string;
}

export interface Child {
  id: string;
  classId: string;
  name: string;
  birthYear?: number;
  consent: boolean; // consent_flag — non-consented photos excluded from pipeline
  notes: string; // 특이사항 (알레르기 등)
  medications: Medication[];
  attendance: Attendance;
  pickupTime?: string; // 하원시간
}

export interface ClassRoom {
  id: string;
  name: string;
  ageBand: AgeBand;
  teacher: string;
}

interface ClassState {
  classes: ClassRoom[];
  children: Record<string, Child>;
  selectedClassId: string;
  selectedChildId: string | null;

  selectClass: (id: string) => void;
  selectChild: (id: string | null) => void;
  addChild: (classId: string, name: string) => void;
  updateChild: (id: string, patch: Partial<Child>) => void;
  removeChild: (id: string) => void;
  setAttendance: (id: string, a: Attendance) => void;
  setPickup: (id: string, time: string) => void;
  addMedication: (id: string, med: Omit<Medication, 'id'>) => void;
  removeMedication: (childId: string, medId: string) => void;

  childrenOf: (classId: string) => Child[];
}

let seq = 0;
const id = (p: string) => `${p}_${++seq}`;

const C1 = 'cls_sunshine';
const C2 = 'cls_star';

const SEED_CLASSES: ClassRoom[] = [
  { id: C1, name: '햇살반', ageBand: '3-5', teacher: '김교사' },
  { id: C2, name: '별님반', ageBand: '0-2', teacher: '이교사' },
];

function seedChild(classId: string, name: string, extra: Partial<Child> = {}): Child {
  return {
    id: id('child'),
    classId,
    name,
    consent: true,
    notes: '',
    medications: [],
    attendance: 'present',
    ...extra,
  };
}

const SEED_CHILDREN: Child[] = [
  seedChild(C1, '김지호', { notes: '견과류 알레르기', pickupTime: '16:30' }),
  seedChild(C1, '박서연', { pickupTime: '17:00' }),
  seedChild(C1, '이준우', { attendance: 'absent', notes: '감기로 결석' }),
  seedChild(C1, '최하윤', { consent: false, pickupTime: '16:00' }),
  seedChild(C2, '정도윤', {
    notes: '낮잠 2회',
    medications: [{ id: id('med'), name: '해열제', dose: '5ml', time: '13:00', note: '식후' }],
    pickupTime: '16:00',
  }),
  seedChild(C2, '한소율', { pickupTime: '15:30' }),
];

export const useClassStore = create<ClassState>((set, get) => ({
  classes: SEED_CLASSES,
  children: Object.fromEntries(SEED_CHILDREN.map((c) => [c.id, c])),
  selectedClassId: C1,
  selectedChildId: SEED_CHILDREN[0].id,

  selectClass: (cid) =>
    set(() => {
      const first = get().childrenOf(cid)[0];
      return { selectedClassId: cid, selectedChildId: first ? first.id : null };
    }),
  selectChild: (cid) => set({ selectedChildId: cid }),

  addChild: (classId, name) =>
    set((s) => {
      const child = seedChild(classId, name.trim() || '새 원아', { attendance: 'pending' });
      return { children: { ...s.children, [child.id]: child }, selectedChildId: child.id };
    }),
  updateChild: (cid, patch) =>
    set((s) => (s.children[cid] ? { children: { ...s.children, [cid]: { ...s.children[cid], ...patch } } } : {})),
  removeChild: (cid) =>
    set((s) => {
      const children = { ...s.children };
      delete children[cid];
      return {
        children,
        selectedChildId: s.selectedChildId === cid ? null : s.selectedChildId,
      };
    }),
  setAttendance: (cid, a) => get().updateChild(cid, { attendance: a }),
  setPickup: (cid, time) => get().updateChild(cid, { pickupTime: time }),
  addMedication: (cid, med) =>
    set((s) => {
      const c = s.children[cid];
      if (!c) return {};
      return {
        children: {
          ...s.children,
          [cid]: { ...c, medications: [...c.medications, { ...med, id: id('med') }] },
        },
      };
    }),
  removeMedication: (cid, medId) =>
    set((s) => {
      const c = s.children[cid];
      if (!c) return {};
      return {
        children: {
          ...s.children,
          [cid]: { ...c, medications: c.medications.filter((m) => m.id !== medId) },
        },
      };
    }),

  childrenOf: (classId) => Object.values(get().children).filter((c) => c.classId === classId),
}));

/* ---- Governance helpers ---- */

/** Mask a child name for any context leaving the module (성 + 'O' (PRD §12). */
export function maskName(name: string): string {
  if (name.length <= 1) return name;
  return name[0] + 'O'.repeat(name.length - 1);
}

/** Build the L3 tenant/teacher context string for agents (names masked).
   Realizes "우리반 = 메모리/슬롯의 1차 컨텍스트" (§4.4, §8.1). */
export function buildTenantContext(): string {
  const s = useClassStore.getState();
  const cls = s.classes.find((c) => c.id === s.selectedClassId);
  if (!cls) return '';
  const roster = s.childrenOf(cls.id);
  const curriculum = CURRICULUM_LABEL[curriculumForAge(cls.ageBand)];
  const present = roster.filter((c) => c.attendance === 'present').length;

  const lines = [
    `반: ${cls.name} (만 ${cls.ageBand === '0-2' ? '0~2세' : '3~5세'}, ${curriculum})`,
    `원아 ${roster.length}명 (출석 ${present}명)`,
  ];

  const child = s.selectedChildId ? s.children[s.selectedChildId] : null;
  if (child) {
    const bits = [`선택 아동: ${maskName(child.name)}`];
    if (child.notes) bits.push(`특이사항: ${child.notes}`);
    if (child.medications.length) bits.push(`투약 ${child.medications.length}건`);
    lines.push(bits.join(' / '));
  }

  // Notable allergies/notes across roster (masked) — useful slot context.
  const notable = roster.filter((c) => c.notes).map((c) => `${maskName(c.name)}(${c.notes})`);
  if (notable.length) lines.push(`참고: ${notable.join(', ')}`);

  return lines.join('\n');
}
