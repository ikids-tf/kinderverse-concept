/**
 * rewards.ts — 보상 오케스트레이터 ("정돈된 한 방").
 * ------------------------------------------------------------------
 * 흩뿌리지 말고 정답 시 한 번에 합주: 파스텔 confetti + 별 팝. 색은 theme.confettiColors
 * 에서만 뽑는다(원색 형광 금지). reveal의 dust는 흙 갈색 소량.
 * confetti는 disableForReducedMotion:true 로 reduced-motion에서 자동 비활성.
 */
import confetti from "canvas-confetti";
import { theme } from "../theme";
import type { MoodKey } from "../theme";

const PASTEL = [...theme.confettiColors];
const SOIL = ["#B98A5E", "#9C6E45", "#D8B48A"];

/** 정답/클리어 — 파스텔 합주 한 방. origin은 뷰포트 정규화 좌표(0..1). */
export function celebrate(origin: { x: number; y: number }, mood: MoodKey, level: "off" | "light" | "full"): void {
  if (level === "off") return;
  const base = level === "full" ? 150 : 80;
  const count = Math.round(base * theme.moodScale[mood].reward);
  confetti({
    particleCount: count, spread: 70, startVelocity: 42, origin,
    colors: PASTEL, scalar: 1.05, ticks: 160, disableForReducedMotion: true,
  });
  confetti({
    particleCount: Math.round(count * 0.4), spread: 120, startVelocity: 30, origin,
    colors: PASTEL, shapes: ["star"], scalar: 1.2, ticks: 160, disableForReducedMotion: true,
  });
}

/** reveal — 흙에서 뽑힐 때 갈색 흙먼지 소량. origin은 흙 윗변 중앙(정규화). */
export function dustBurst(origin: { x: number; y: number }): void {
  confetti({
    particleCount: 26, spread: 55, startVelocity: 22, gravity: 1.1, ticks: 90,
    origin, colors: SOIL, scalar: 0.8, disableForReducedMotion: true,
  });
}
