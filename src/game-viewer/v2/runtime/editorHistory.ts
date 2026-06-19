/**
 * editorHistory.ts — 게임 편집 통합 실행취소/다시실행(키보드 + 툴바 공용).
 * ------------------------------------------------------------------
 * 편집은 두 스토어에 기록된다: useGame(문제·답·레이아웃 doc)·useMaterials(스티커 자료).
 * 단축키(⌘/Ctrl+Z·Shift+Z·Ctrl+Y)와 툴바 ↶↷ 가 '가장 최근에 바뀐 스토어'를 되돌리도록
 * recency를 추적한다(둘 다 히스토리가 있으면 최근 것부터, 한쪽만 있으면 그쪽).
 */
import { useGame } from "./useGame";
import { useMaterials } from "./materials";

let recent: "game" | "mat" = "game";
let gPast = useGame.temporal.getState().pastStates.length;
let mPast = useMaterials.temporal.getState().pastStates.length;

// 히스토리가 '늘어난' 스토어를 최근으로 기록(undo로 줄어들 땐 갱신 안 함).
useGame.temporal.subscribe((s) => {
  if (s.pastStates.length > gPast) recent = "game";
  gPast = s.pastStates.length;
});
useMaterials.temporal.subscribe((s) => {
  if (s.pastStates.length > mPast) recent = "mat";
  mPast = s.pastStates.length;
});

/** 어느 스토어를 되돌릴/다시실행할지 — 둘 다 가능하면 최근 것, 아니면 가능한 쪽. */
function pick(dir: "undo" | "redo"): "game" | "mat" | null {
  const g = useGame.temporal.getState();
  const m = useMaterials.temporal.getState();
  const gHas = (dir === "undo" ? g.pastStates.length : g.futureStates.length) > 0;
  const mHas = (dir === "undo" ? m.pastStates.length : m.futureStates.length) > 0;
  if (gHas && mHas) return recent;
  if (gHas) return "game";
  if (mHas) return "mat";
  return null;
}

export function editorUndo(): void {
  const which = pick("undo");
  if (which === "game") useGame.temporal.getState().undo();
  else if (which === "mat") useMaterials.temporal.getState().undo();
}

export function editorRedo(): void {
  const which = pick("redo");
  if (which === "game") useGame.temporal.getState().redo();
  else if (which === "mat") useMaterials.temporal.getState().redo();
}
