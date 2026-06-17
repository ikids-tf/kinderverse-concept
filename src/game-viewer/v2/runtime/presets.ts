/**
 * presets.ts — 모션 프리셋 라이브러리 (Motion 스프링).
 * ------------------------------------------------------------------
 * 🔴 WAAPI 금지. 레퍼런스 프로토의 cubic-bezier 흉내를 진짜 Motion 스프링/키프레임으로 옮긴다.
 * 프리셋 '이름'은 스키마 PresetName에 정의돼 있고, '값'(튜닝)은 여기 + theme.ts(motion.spring).
 *
 *  - entrance(name): 등장 — { initial, animate, transition }  (motion.div props)
 *  - idle(name):     상시 — { animate, transition(repeat:Infinity) }
 *  - reaction(name): 반응 — controls.start()에 먹일 키프레임 TargetAndTransition
 * mood(calm/lively/punchy)로 강도를 스케일(theme.moodScale).
 */
import type { TargetAndTransition, Transition } from "motion/react";
import { theme, type MoodKey } from "../theme";

const S = theme.motion.spring;

export interface EntrancePreset {
  initial: TargetAndTransition;
  animate: TargetAndTransition;
  transition: Transition;
}
export interface IdlePreset {
  animate: TargetAndTransition;
  transition: Transition;
}

/** 등장 프리셋 — reduced motion이면 즉시 보이게(애니 없음). */
export function entrance(name: string | undefined, reduced: boolean): EntrancePreset | null {
  if (!name || reduced) return null;
  switch (name) {
    case "pop":
      return { initial: { scale: 0.6, opacity: 0 }, animate: { scale: 1, opacity: 1 }, transition: S.bouncy };
    case "drop":
      return { initial: { y: -34, opacity: 0 }, animate: { y: 0, opacity: 1 }, transition: S.soft };
    case "float-in":
      return { initial: { y: 18, opacity: 0 }, animate: { y: 0, opacity: 1 }, transition: S.gentle };
    case "zoom-out":
      return { initial: { scale: 1.3, opacity: 0 }, animate: { scale: 1, opacity: 1 }, transition: S.soft };
    default:
      return { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: S.gentle };
  }
}

/** 상시(idle) 프리셋 — 잔잔한 반복. reduced면 없음. */
export function idle(name: string | undefined, reduced: boolean): IdlePreset | null {
  if (!name || reduced) return null;
  const loop: Transition = { duration: 2.6, repeat: Infinity, ease: "easeInOut" };
  switch (name) {
    case "breathe":
      return { animate: { scale: [1, 1.035, 1] }, transition: loop };
    case "wiggle":
      return { animate: { rotate: [-3, 3, -3] }, transition: loop };
    case "bob":
      return { animate: { y: [0, -6, 0] }, transition: loop };
    case "pulse":
      return { animate: { opacity: [1, 0.78, 1] }, transition: loop };
    default:
      return null;
  }
}

/** 반응(reaction) 프리셋 — controls.start()로 1회 재생할 키프레임. mood로 진폭 스케일. */
export function reaction(name: string, mood: MoodKey, reduced: boolean): TargetAndTransition | null {
  if (reduced) return null;
  const k = theme.moodScale[mood].motion; // 0.7 / 1.0 / 1.25
  // 오버슈트 있는 named easing(backOut)으로 스프링 느낌 — Motion ease는 cubic-bezier '문자열'을 받지 않는다.
  const T = (duration: number): Transition => ({ duration, ease: "backOut" });
  switch (name) {
    case "cheer":
      return {
        scale: [1, 1 + 0.16 * k, 1 + 0.1 * k, 1],
        rotate: [0, -7 * k, 6 * k, 0],
        transition: T(0.68),
      };
    case "bounce":
      return { scale: [1, 1.14 + 0.06 * k, 1], transition: T(0.48) };
    case "shake":
      return { x: [0, -8 * k, 7 * k, -5 * k, 0], transition: T(0.42) };
    case "pop":
      return { scale: [0.85, 1.08, 1], transition: T(0.4) };
    case "spin":
      return { rotate: [0, 360], transition: T(0.6) };
    case "glow":
      return { scale: [1, 1.06, 1], transition: T(0.5) };
    default:
      return { scale: [1, 1.08, 1], transition: T(0.4) };
  }
}
