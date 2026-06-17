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
import { recommendFromPromptAI } from "../resolver/resolver";
import { useGame } from "./useGame";
import { useMaterials } from "./materials";

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

/** 프롬프트 → 추천 1순위 자동 채택 → 즉시 플레이(보드 프롬프트바가 입력 자체라 카드 UI 불필요). */
async function generateFromPrompt(prompt: string): Promise<void> {
  const text = (prompt || "").trim();
  if (!text) return;
  try {
    const cards = await recommendFromPromptAI(text);
    const top = cards[0];
    if (!top) return;
    const { input } = top.build();
    useGame.getState().loadDoc(input);
    useGame.getState().start();
  } catch {
    /* 생성 실패는 조용히 무시(기존 게임 유지) */
  }
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
      } else if (d.type === "kv-game-add-image" && typeof d.src === "string") {
        // 보드에서 드롭한 이미지를 게임 위 '자료'로 올린다(교사 즉흥 활동).
        useMaterials.getState().add("image", d.src);
      }
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      delete (window as ChromeWindow).kvSetChrome;
    };
  }, []);
}
