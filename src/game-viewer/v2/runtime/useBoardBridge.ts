/**
 * useBoardBridge.ts — 보드(부모 프레임) → 게임 뷰어 메시지 브리지.
 * ------------------------------------------------------------------
 * 게임 뷰어는 My Board에 iframe 카드로 임베드된다. 보드의 '메인 프롬프트바'가 명령을 보내고
 * (board/prompt.ts → NodeView.tsx 가 iframe.postMessage), 뷰어는 자체 프롬프트 입력창을 숨긴다.
 *  - `kv-game-create` {prompt}      → 프롬프트로 게임 생성(리졸버 → 즉시 플레이).
 *  - `kv-game-add-image` {src,label} → 레인에 자료로 배치(2단계). 1단계는 리스너만(콘솔).
 * 또한 `window.kvSetChrome(show)`를 노출 → 보드가 카드 포커스/호버 상태로 교사 툴바 가시성 제어.
 */
import { useEffect } from "react";
import { create } from "zustand";
import { generateGame } from "../generate/orchestrator";
import { setBackgroundFromPrompt } from "../generate/background";
import { useGen, latestStep } from "./genProgress";
import { applyEditIntent } from "./editIntent";
import { useGame } from "./useGame";

/** iframe(보드 카드) 안에서 실행 중인지 — 단독 탭이면 false. */
export const isEmbedded = typeof window !== "undefined" && window.parent !== window;

/* 교사 크롬(툴바) 가시성 — 보드가 카드 비포커스 시 숨김. 기본 표시(단독 탭은 항상 표시). */
interface ChromeState {
  visible: boolean;
  set: (v: boolean) => void;
}
const useChromeStore = create<ChromeState>((set) => ({
  visible: true,
  set: (v) => set({ visible: v }),
}));
export const useChromeVisible = (): boolean => useChromeStore((s) => s.visible);

/**
 * 보드 프롬프트바 입력 처리(임베드/풀스크린).
 *  - 요소 선택 시: 그 요소 편집 시도(보드와 동일 감각). 성공하면 생성 안 함.
 *  - 아니면 프롬프트 → 게임 생성(orchestrator). 진행은 useGen 채널로 스트리밍.
 */
async function generateFromPrompt(prompt: string): Promise<void> {
  // 0) 배경 선택(편집) → 프롬프트로 배경 이미지 생성
  const g = useGame.getState();
  if (g.bgSelected && g.mode === "edit") { await setBackgroundFromPrompt(prompt); return; }
  if (applyEditIntent(prompt).ok) return;
  await generateGame(prompt, { seedImages: useGen.getState().seeds });
}

type ChromeWindow = Window & { kvSetChrome?: (show: boolean) => void };

/** 임베드 시에만 활성: 보드 메시지 수신 + kvSetChrome 노출. App.tsx에서 1회 마운트. */
export function useBoardBridge(): void {
  useEffect(() => {
    if (!isEmbedded) return;
    (window as ChromeWindow).kvSetChrome = (show) => useChromeStore.getState().set(!!show);

    const onMessage = (e: MessageEvent) => {
      const d = e.data as { type?: string; prompt?: string; src?: string; label?: string } | null;
      if (!d || typeof d !== "object") return;
      if (d.type === "kv-game-create" && typeof d.prompt === "string") {
        void generateFromPrompt(d.prompt);
      }
      // kv-game-add-image(보드 자료 드롭)는 GameStage가 처리한다 — 프레임/보드 판정에
      // 무대·카드 기하가 필요하기 때문(드롭 지점·크기 기반 라우팅).
    };
    window.addEventListener("message", onMessage);

    // 생성 진행을 보드(부모)로 릴레이 → 보드 프롬프트바가 스트리밍 표시.
    const unsubGen = useGen.subscribe((s) => {
      window.parent.postMessage(
        { type: "kv-game-progress", active: s.active, step: latestStep(s.steps) },
        "*",
      );
    });

    return () => {
      window.removeEventListener("message", onMessage);
      unsubGen();
      delete (window as ChromeWindow).kvSetChrome;
    };
  }, []);
}
