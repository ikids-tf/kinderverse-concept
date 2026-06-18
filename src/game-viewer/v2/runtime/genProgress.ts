/**
 * genProgress.ts — 게임 생성 진행 채널 + 드래그 시드 + 그림 출처 정책 (Zustand).
 * ------------------------------------------------------------------
 * 생성 과정을 단계 메시지로 스트리밍하고(프롬프트바·환영화면이 구독), 뷰어에 끌어다 놓은
 * 시드 이미지와 '그림 출처' 정책(보관함 우선/모두 보관함/모두 생성)을 보관한다.
 */
import { create } from "zustand";
import { DEFAULT_KNOBS, type Knobs } from "../resolver/resolver";

/** 요소 그림 출처 — 보관함(갤러리) 우선/전용/생성전용. */
export type SourceMode = "auto" | "gallery" | "generate";

export const SOURCE_LABEL: Record<SourceMode, string> = {
  auto: "보관함 우선",
  gallery: "모두 보관함",
  generate: "모두 생성",
};

export interface GenState {
  active: boolean;
  steps: string[];
  seeds: string[]; // 드래그로 올린 시드 이미지(dataURL/URL)
  sourceMode: SourceMode;
  knobs: Knobs; // 난이도·분량·분위기 (설정 메뉴에서 조절 → 생성에 반영)
  begin: () => void;
  pushStep: (msg: string) => void;
  end: () => void;
  addSeed: (url: string) => void;
  removeSeed: (url: string) => void;
  clearSeeds: () => void;
  setSourceMode: (m: SourceMode) => void;
  setKnobs: (patch: Partial<Knobs>) => void;
}

export const useGen = create<GenState>((set) => ({
  active: false,
  steps: [],
  seeds: [],
  sourceMode: "auto",
  knobs: DEFAULT_KNOBS,
  begin: () => set({ active: true, steps: [] }),
  pushStep: (msg) => set((s) => ({ steps: [...s.steps, msg] })),
  end: () => set({ active: false }),
  addSeed: (url) => set((s) => (s.seeds.includes(url) ? s : { seeds: [...s.seeds, url] })),
  removeSeed: (url) => set((s) => ({ seeds: s.seeds.filter((u) => u !== url) })),
  clearSeeds: () => set({ seeds: [] }),
  setSourceMode: (m) => set({ sourceMode: m }),
  setKnobs: (patch) => set((s) => ({ knobs: { ...s.knobs, ...patch } })),
}));

/** 최근 단계 메시지(없으면 빈 문자열) — 한 줄 표시용. */
export function latestStep(steps: string[]): string {
  return steps.length ? steps[steps.length - 1] : "";
}
