/**
 * 게임 뷰어 전용 테마 — 아이 대면 파스텔/큐트.
 * ------------------------------------------------------------------
 * 🔴 Milray Park 디자인 시스템은 여기 적용하지 않는다.
 *    - 교사용 보드/툴바/에디터 크롬 = Milray Park (coral #F2733E, Playfair + Pretendard) — 이 파일 밖.
 *    - 아이가 만지는 게임 플레이 화면 = 이 파스텔 토큰.
 *
 * 원칙: 부드럽고 둥글둥글, 채도 낮고 명도 높게. 원색 형광 금지(눈 피로).
 *       귀엽되 정제되게 — 유치하거나 산만하지 않게.
 *
 * 사용:
 *   - 런타임 컴포넌트는 이 토큰을 CSS 변수로 주입(:root 또는 무대 컨테이너)하거나
 *     Tailwind theme.extend로 매핑해서 쓴다.
 *   - mood(calm/lively/punchy)에 따라 모션·보상 강도를 스케일(프리셋/보상에서 참조).
 */

export const palette = {
  // 배경/표면
  bg: "#FFF7F0",       // 따뜻한 밀크
  bgPeach: "#FDE9DD",  // 앰비언트 블롭
  bgMint: "#E2F3EC",
  bgSky: "#E5F0FC",
  card: "#FFFFFF",

  // 글자 (부드러운 갈색 계열 — 새까만 검정 금지)
  ink: "#574B3E",
  inkSoft: "#8C7E6E",

  // 파스텔 액센트 (confetti·강조도 여기서만 색을 뽑는다)
  coral: "#FF9E7D",
  mint: "#8FD9C3",
  sky: "#9BC9F2",
  butter: "#FFD98A",
  lilac: "#CDBBE8",

  // 정답/오답
  okBg: "#CFEFD9", okBd: "#86CFA0", okInk: "#3E7A57",
  noBg: "#FBD9D3", noBd: "#F0A89E", noInk: "#9A4E45",

  // 텃밭 흙 (reveal 효과)
  soil: "#B98A5E", soilDk: "#9C6E45",
} as const;

/** confetti·반짝이 색은 반드시 이 배열에서만 뽑는다(원색 형광 금지). */
export const confettiColors = [
  palette.coral, palette.mint, palette.sky, palette.butter, palette.lilac, palette.noBd,
] as const;

export const radius = {
  lg: 30,
  md: 22,
  sm: 16,
  pill: 999,
} as const;

export const shadow = {
  card: "0 14px 34px rgba(120,92,60,.16)",
  soft: "0 6px 16px rgba(120,92,60,.13)",
  reward: "0 12px 26px rgba(255,158,125,.45)",
} as const;

/**
 * 스프링 느낌의 이징.
 * 🔴 런타임은 실제로 Motion(motion.dev)의 스프링을 쓴다. 아래 spring 객체가 1순위.
 *    cssSpring(cubic-bezier)는 비-Motion 영역(순수 CSS 트랜지션)용 폴백일 뿐.
 */
export const motion = {
  // Motion 스프링 프리셋(컴포넌트에서 transition으로 사용)
  spring: {
    soft:   { type: "spring", stiffness: 260, damping: 22, mass: 0.9 },
    bouncy: { type: "spring", stiffness: 420, damping: 16, mass: 0.8 },
    gentle: { type: "spring", stiffness: 180, damping: 24, mass: 1.0 },
  },
  cssSpring: "cubic-bezier(.34,1.56,.64,1)", // CSS 폴백 전용
  durations: { quick: 0.22, base: 0.42, reveal: 0.76 },
} as const;

/** 분위기 노브 → 모션·보상 강도 스케일. */
export const moodScale = {
  calm:   { motion: 0.7, reward: 0.7 },
  lively: { motion: 1.0, reward: 1.0 },
  punchy: { motion: 1.25, reward: 1.25 },
} as const;

/** 터치 타깃(유아·태블릿) — 최소 크기·간격. */
export const touch = {
  minTarget: 72, // px
  gap: 14,
} as const;

export const fonts = {
  // 아이 대면 = 둥근 한글(Jua). 유틸리티 = Pretendard.
  display: '"Jua", sans-serif',
  body: '"Pretendard", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
} as const;

export const theme = {
  palette,
  confettiColors,
  radius,
  shadow,
  motion,
  moodScale,
  touch,
  fonts,
} as const;

export type Theme = typeof theme;
export type MoodKey = keyof typeof moodScale;

/** :root 또는 무대 컨테이너에 주입할 CSS 변수 맵(런타임에서 style로 적용). */
export function cssVars(): Record<string, string> {
  return {
    "--bg": palette.bg,
    "--bg-peach": palette.bgPeach,
    "--bg-mint": palette.bgMint,
    "--bg-sky": palette.bgSky,
    "--card": palette.card,
    "--ink": palette.ink,
    "--ink-soft": palette.inkSoft,
    "--coral": palette.coral,
    "--mint": palette.mint,
    "--sky": palette.sky,
    "--butter": palette.butter,
    "--lilac": palette.lilac,
    "--ok-bg": palette.okBg, "--ok-bd": palette.okBd, "--ok-ink": palette.okInk,
    "--no-bg": palette.noBg, "--no-bd": palette.noBd, "--no-ink": palette.noInk,
    "--soil": palette.soil, "--soil-dk": palette.soilDk,
    "--r-lg": `${radius.lg}px`, "--r-md": `${radius.md}px`, "--r-sm": `${radius.sm}px`,
    "--spring": motion.cssSpring,
  };
}
