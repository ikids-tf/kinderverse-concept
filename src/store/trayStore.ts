import { create } from 'zustand';

/** 갤러리에서 보드로 가져온 '임시 자료' 한 건. 보드에 바로 놓지 않고 트레이에 담아 둔다. */
export interface TrayItem {
  id: string; // 갤러리 자료 id(트레이 내 중복 방지용)
  src: string; // 이미지 URL/데이터URI
  title: string;
  ratio: string; // '3 / 4' 등 — 배치할 노드 높이 계산용
}

interface TrayState {
  items: TrayItem[];
  /** 자료를 트레이에 추가(이미 있는 id는 건너뜀). */
  add: (items: TrayItem[]) => void;
  /** 한 건 제거(보드에 배치되면 호출). */
  remove: (id: string) => void;
  /** 트레이 전체 비우기(X 버튼) — 갤러리 원본은 건드리지 않음. */
  clear: () => void;
}

/** 보드 임시 자료 트레이 — 전역·비영속(클라우드 스냅샷에 저장되지 않는 일시 상태). */
export const useTrayStore = create<TrayState>((set) => ({
  items: [],
  add: (items) =>
    set((s) => {
      const seen = new Set(s.items.map((i) => i.id));
      const fresh = items.filter((i) => i.src && !seen.has(i.id));
      return fresh.length ? { items: [...s.items, ...fresh] } : s;
    }),
  remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
  clear: () => set({ items: [] }),
}));
