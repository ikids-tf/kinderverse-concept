/**
 * materials.ts — 교사가 게임 위에 즉흥으로 올리는 '자료(요소)' 스토어.
 * ------------------------------------------------------------------
 * 서비스 핵심 = 확장성: 게임 중/후에 교사가 스티커·글자·그림을 자유롭게 추가/이동/삭제하며
 * 아이들과 즉흥 활동을 한다. 게임 인터랙션 노드와 별개의 자유 레이어(좌표 정규화 0..1, 무대 기준).
 * 보드에서 드롭한 이미지(kv-game-add-image)도 여기로 들어온다.
 */
import { create } from "zustand";

export type MaterialKind = "emoji" | "text" | "image";

export interface Material {
  id: string;
  kind: MaterialKind;
  value: string; // emoji 문자 · 글자 · data/URL
  x: number;
  y: number; // 중심(정규화 0..1)
  w: number;
  h: number; // 크기(정규화)
}

let seq = 0;
const SIZE: Record<MaterialKind, { w: number; h: number }> = {
  emoji: { w: 0.13, h: 0.13 },
  text: { w: 0.26, h: 0.12 },
  image: { w: 0.24, h: 0.24 },
};

interface MaterialsState {
  items: Material[];
  selectedId: string | null;
  add: (kind: MaterialKind, value: string) => void;
  update: (id: string, patch: Partial<Pick<Material, "x" | "y" | "w" | "h" | "value">>) => void;
  remove: (id: string) => void;
  select: (id: string | null) => void;
  clear: () => void;
}

export const useMaterials = create<MaterialsState>((set, get) => ({
  items: [],
  selectedId: null,
  add: (kind, value) => {
    const n = get().items.length;
    const { w, h } = SIZE[kind];
    // 중앙 근처에 약간씩 어긋나게 흩뿌려 겹침을 줄인다.
    const x = Math.max(0.12, Math.min(0.88, 0.5 + ((n % 5) - 2) * 0.09));
    const y = Math.max(0.16, Math.min(0.84, 0.38 + (Math.floor(n / 5) % 4) * 0.13));
    const id = `mat_${++seq}`;
    set((s) => ({ items: [...s.items, { id, kind, value, x, y, w, h }], selectedId: id }));
  },
  update: (id, patch) =>
    set((s) => ({ items: s.items.map((m) => (m.id === id ? { ...m, ...patch } : m)) })),
  remove: (id) =>
    set((s) => ({
      items: s.items.filter((m) => m.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    })),
  select: (id) => set({ selectedId: id }),
  clear: () => set({ items: [], selectedId: null }),
}));
