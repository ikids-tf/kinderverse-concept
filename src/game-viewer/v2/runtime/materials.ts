/**
 * materials.ts — 교사가 게임 위에 즉흥으로 올리는 '자료(요소)' + 게임 전용 편집 요소 스토어.
 * ------------------------------------------------------------------
 * 서비스 핵심 = 확장성: 게임 중/후에 교사가 글자·그림·버튼·프레임을 자유롭게 추가/이동/삭제/스타일링하며
 * 아이들과 즉흥 활동을 한다. 게임 인터랙션 노드와 별개의 자유 레이어(좌표 정규화 0..1, 무대 기준).
 * 보드에서 드롭한 이미지(kv-game-add-image)도 여기로 들어온다.
 *
 * 좌측 편집 LNB(텍스트/버튼/프레임/액션)가 이 스토어를 통해 동작한다:
 *  - 버튼: 답 선택/작동용. 글자·라운드코너·컬러 조정 + correct(정답) 토글.
 *  - 프레임: 이미지·동영상을 담는 컨테이너.
 *  - 액션: 선택 요소에 움직임(anim) 적용 + 선 잇기(connections).
 */
import { create } from "zustand";
import { temporal } from "zundo";

/** 빠른 연속 변경(드래그·미세이동)을 한 단계로 묶기 위한 디바운스. */
function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number) {
  let t: number | undefined;
  return (...a: A) => {
    if (t) window.clearTimeout(t);
    t = window.setTimeout(() => fn(...a), ms);
  };
}

export type MaterialKind = "emoji" | "text" | "image" | "button" | "frame";
export type AnimKind = "none" | "shake" | "bounce" | "spin" | "float";

export interface MaterialStyle {
  radius?: number; // 0..1 (짧은 변 대비 모서리 둥글기 비율; 1=완전 알약)
  bg?: string; // 배경색(버튼/프레임)
  fg?: string; // 글자색
}

export interface Material {
  id: string;
  kind: MaterialKind;
  value: string; // emoji 문자 · 글자 · data/URL(이미지·프레임 미디어) · 버튼 라벨
  x: number;
  y: number; // 중심(정규화 0..1)
  w: number;
  h: number; // 크기(정규화)
  style?: MaterialStyle;
  correct?: boolean; // 버튼: 정답으로 표시(플레이 시 정답/오답 피드백)
  anim?: AnimKind; // 액션: 움직임
  mediaKind?: "image" | "video"; // 프레임: 담긴 미디어 종류
  rot?: number; // 회전(도) — My Board와 동일한 바운드박스 회전 핸들
}

export interface Connection {
  id: string;
  from: string; // material id
  to: string; // material id
}

let seq = 0;
const SIZE: Record<MaterialKind, { w: number; h: number }> = {
  emoji: { w: 0.13, h: 0.13 },
  text: { w: 0.26, h: 0.12 },
  image: { w: 0.24, h: 0.24 },
  button: { w: 0.2, h: 0.11 },
  frame: { w: 0.32, h: 0.28 },
};

/** kind별 기본 스타일/속성. */
function defaults(kind: MaterialKind): Partial<Material> {
  if (kind === "button") return { style: { radius: 1, bg: "var(--coral)", fg: "#ffffff" }, correct: false };
  if (kind === "frame") return { style: { radius: 0.12, bg: "rgba(255,255,255,.5)" }, mediaKind: "image" };
  return {};
}

type MaterialPatch = Partial<Omit<Material, "id" | "kind">>;

interface MaterialsState {
  items: Material[];
  selectedId: string | null; // 단일/주(主) 선택 — 인스펙터·프롬프트 단일 타깃
  selectedIds: string[]; // 복수선택 전체
  editId: string | null; // 인스펙터(편집툴)가 열린 요소 — 호버 편집버튼 클릭 시
  clipboard: Material[]; // 복사/붙여넣기
  viewX: number; // 현재 보이는 캔버스 가로 중심(0..1) — 새 요소를 보이는 곳에 추가
  setViewX: (x: number) => void;
  connections: Connection[];
  connectMode: boolean; // 선 잇기 모드(레일 '액션 > 선 잇기')
  connectFrom: string | null; // 선 잇기 첫 요소
  add: (kind: MaterialKind, value: string, extra?: Partial<Material>) => string;
  update: (id: string, patch: MaterialPatch) => void;
  setStyle: (id: string, patch: MaterialStyle) => void;
  remove: (id: string) => void;
  select: (id: string | null, additive?: boolean) => void;
  setSelection: (ids: string[]) => void;
  setPositions: (map: Record<string, { x: number; y: number }>) => void;
  selectAll: () => void;
  setEditId: (id: string | null) => void;
  // 단축키 그룹 조작
  removeSelected: () => void;
  duplicateSelected: () => void;
  nudgeSelected: (dx: number, dy: number) => void;
  copySelected: () => void;
  paste: () => void;
  clear: () => void;
  // 선 잇기
  setConnectMode: (on: boolean) => void;
  pickConnect: (id: string) => void;
  removeConnection: (id: string) => void;
}

export const useMaterials = create<MaterialsState>()(temporal((set, get) => ({
  items: [],
  selectedId: null,
  selectedIds: [],
  editId: null,
  clipboard: [],
  viewX: 0.25,
  setViewX: (x) => set({ viewX: x }),
  connections: [],
  connectMode: false,
  connectFrom: null,
  add: (kind, value, extra) => {
    const n = get().items.length;
    const { w, h } = SIZE[kind];
    // 보이는 화면 중앙(viewX)에 추가. 첫 요소는 정중앙, 이후 0 기준 좌우 교차로 작게 어긋낸다
    // (x는 캔버스 정규화 = 3화면이라 작은 값으로). 겹침만 피하고 중앙 느낌 유지.
    const vx = get().viewX;
    const STAGGER = [0, 0.016, -0.016, 0.032, -0.032];
    const x = Math.max(0.04, Math.min(0.96, vx + STAGGER[n % 5]));
    const y = Math.max(0.16, Math.min(0.84, 0.48 + (Math.floor(n / 5) % 3) * 0.1));
    const id = `mat_${++seq}`;
    const item: Material = { id, kind, value, x, y, w, h, ...defaults(kind), ...extra };
    set((s) => ({ items: [...s.items, item], selectedId: id, selectedIds: [id] }));
    return id;
  },
  update: (id, patch) =>
    set((s) => ({ items: s.items.map((m) => (m.id === id ? { ...m, ...patch } : m)) })),
  setStyle: (id, patch) =>
    set((s) => ({
      items: s.items.map((m) => (m.id === id ? { ...m, style: { ...m.style, ...patch } } : m)),
    })),
  remove: (id) =>
    set((s) => ({
      items: s.items.filter((m) => m.id !== id),
      connections: s.connections.filter((c) => c.from !== id && c.to !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
      selectedIds: s.selectedIds.filter((x) => x !== id),
      editId: s.editId === id ? null : s.editId,
      connectFrom: s.connectFrom === id ? null : s.connectFrom,
    })),
  select: (id, additive = false) => {
    if (id == null) { set({ selectedId: null, selectedIds: [] }); return; }
    if (additive) {
      set((s) => {
        const has = s.selectedIds.includes(id);
        const ids = has ? s.selectedIds.filter((x) => x !== id) : [...s.selectedIds, id];
        return { selectedIds: ids, selectedId: has ? (ids[ids.length - 1] ?? null) : id };
      });
    } else {
      set({ selectedId: id, selectedIds: [id] });
    }
  },
  setSelection: (ids) => set({ selectedIds: ids, selectedId: ids[ids.length - 1] ?? null }),
  setPositions: (map) => set((s) => ({ items: s.items.map((m) => (map[m.id] ? { ...m, x: map[m.id].x, y: map[m.id].y } : m)) })),
  selectAll: () => set((s) => ({ selectedIds: s.items.map((m) => m.id), selectedId: s.items[s.items.length - 1]?.id ?? null })),
  setEditId: (id) => set({ editId: id, selectedId: id ?? get().selectedId, selectedIds: id ? [id] : get().selectedIds }),
  removeSelected: () => {
    const sel = new Set(get().selectedIds);
    if (sel.size === 0) return;
    set((s) => ({
      items: s.items.filter((m) => !sel.has(m.id)),
      connections: s.connections.filter((c) => !sel.has(c.from) && !sel.has(c.to)),
      selectedId: null, selectedIds: [], editId: null, connectFrom: null,
    }));
  },
  duplicateSelected: () => {
    const sel = new Set(get().selectedIds);
    if (sel.size === 0) return;
    const dups: Material[] = get().items
      .filter((m) => sel.has(m.id))
      .map((m) => ({ ...m, id: `mat_${++seq}`, x: Math.min(0.94, m.x + 0.05), y: Math.min(0.94, m.y + 0.05) }));
    set((s) => ({ items: [...s.items, ...dups], selectedIds: dups.map((d) => d.id), selectedId: dups[dups.length - 1]?.id ?? null, editId: null }));
  },
  nudgeSelected: (dx, dy) => {
    const sel = new Set(get().selectedIds);
    if (sel.size === 0) return;
    const c01 = (v: number) => Math.max(0, Math.min(1, v));
    set((s) => ({ items: s.items.map((m) => (sel.has(m.id) ? { ...m, x: c01(m.x + dx), y: c01(m.y + dy) } : m)) }));
  },
  copySelected: () => {
    const sel = new Set(get().selectedIds);
    set({ clipboard: get().items.filter((m) => sel.has(m.id)) });
  },
  paste: () => {
    const clip = get().clipboard;
    if (clip.length === 0) return;
    const pasted: Material[] = clip.map((m) => ({ ...m, id: `mat_${++seq}`, x: Math.min(0.94, m.x + 0.05), y: Math.min(0.94, m.y + 0.05) }));
    set((s) => ({ items: [...s.items, ...pasted], selectedIds: pasted.map((d) => d.id), selectedId: pasted[pasted.length - 1]?.id ?? null }));
  },
  clear: () => set({ items: [], selectedId: null, selectedIds: [], editId: null, connections: [], connectFrom: null, connectMode: false }),
  setConnectMode: (on) => set({ connectMode: on, connectFrom: null }),
  pickConnect: (id) => {
    const { connectFrom, connections } = get();
    if (!connectFrom) {
      set({ connectFrom: id });
      return;
    }
    if (connectFrom === id) {
      set({ connectFrom: null });
      return;
    }
    // 중복 연결 방지
    const dup = connections.some(
      (c) => (c.from === connectFrom && c.to === id) || (c.from === id && c.to === connectFrom),
    );
    set({
      connections: dup ? connections : [...connections, { id: `con_${++seq}`, from: connectFrom, to: id }],
      connectFrom: null,
    });
  },
  removeConnection: (id) => set((s) => ({ connections: s.connections.filter((c) => c.id !== id) })),
}), {
  // 실행취소/다시실행 — 자료·연결만 추적(선택/뷰/연결모드 등 일시상태는 제외).
  // 드래그·미세이동의 연속 변경은 디바운스로 한 단계로 묶는다(1드래그=1기록).
  partialize: (s) => ({ items: s.items, connections: s.connections }),
  equality: (a, b) => a.items === b.items && a.connections === b.connections,
  limit: 80,
  handleSet: (handleSet) => debounce((state) => handleSet(state), 180),
}));
