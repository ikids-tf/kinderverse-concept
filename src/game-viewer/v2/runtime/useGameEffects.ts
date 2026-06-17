/**
 * useGameEffects.ts — sfx 이벤트 버스 소비기(부수효과 격리).
 * 스토어가 흘려보낸 say/confetti/dust 를 받아 TtsProvider·canvas-confetti 로 실행한다.
 * 시각 반응(cheer/shake/bounce)은 컴포넌트가 직접 처리하므로 여기선 비-시각만.
 */
import { useEffect, useRef } from "react";
import { useGame } from "./useGame";
import { say } from "./tts";
import { celebrate, dustBurst } from "./rewards";
import { nodeRect } from "./nodeRegistry";
import type { MoodKey } from "../theme";

function originOf(id: string | undefined, top: boolean): { x: number; y: number } {
  if (id) {
    const r = nodeRect(id);
    if (r) {
      return {
        x: (r.left + r.width / 2) / window.innerWidth,
        y: (top ? r.top : r.top + r.height / 2) / window.innerHeight,
      };
    }
  }
  return { x: 0.5, y: 0.5 };
}

export function useGameEffects(): void {
  const sfx = useGame((s) => s.sfx);
  const last = useRef(0);

  useEffect(() => {
    if (!sfx || sfx.seq === last.current) return;
    last.current = sfx.seq;
    const st = useGame.getState();

    if (sfx.kind === "say") {
      if (st.ttsEnabled && sfx.text) say(sfx.text);
      return;
    }
    if (sfx.kind === "confetti") {
      const mood = (st.doc?.settings.mood ?? "lively") as MoodKey;
      celebrate(originOf(sfx.originId, false), mood, st.doc?.rewards.confetti ?? "light");
      return;
    }
    if (sfx.kind === "dust") {
      dustBurst(originOf(sfx.originId, true));
    }
  }, [sfx]);
}
