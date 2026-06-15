/**
 * 게임 뷰어 전용 테마 — 아이 대면 파스텔/큐트.
 * ------------------------------------------------------------------
 * 🔴 Milray Park 디자인 시스템은 여기 적용하지 않는다.
 *    - 교사용 보드/툴바/프롬프트 입력 = Milray Park (이 파일 밖).
 *    - 아이가 만지는 게임 플레이 화면 = 이 파스텔 토큰.
 *
 * 원칙: 부드럽고 둥글둥글, 채도 낮고 명도 높게. 원색 형광 금지(눈 피로).
 *       귀엽되 정제되게 — 유치하거나 산만하지 않게.
 */

export const palette = {
  /** 라운드 배경 (라운드마다 살짝 바꿔 단조로움 방지 가능) */
  bgCream: "#FFF9F2",
  bgSky: "#EAF4FB",
  bgMintTint: "#EAF7F0",
  bgLavenderTint: "#F0F1FB",

  /** 메인 파스텔 5색 — 보기 버튼/아이템 카드 색상 로테이션에 사용 */
  coral: "#FFB5A7",
  mint: "#B5EAD7",
  yellow: "#FFE9A8",
  lavender: "#C7CEEA",
  peach: "#FFD6BA",

  /** 정답/성공 강조 */
  success: "#95E1A3",
  /** 오답은 색으로 벌하지 않음 — 살짝 흔들고 부드럽게 dim. 별도 '틀림 색' 두지 않음 */

  /** 텍스트 — 순수 검정 금지 */
  textSoft: "#5A5A66",
  textOnPastel: "#4A4A55",

  /** 외곽선/그림자 */
  outline: "#FFFFFF",
  shadow: "rgba(120, 110, 130, 0.18)",
} as const;

/** 보기/아이템 색 로테이션 — index % length로 돌려 쓴다 */
export const pastelRotation = [
  palette.coral,
  palette.mint,
  palette.yellow,
  palette.lavender,
  palette.peach,
] as const;

export const radius = {
  card: 28,
  button: 24,
  pill: 999,
} as const;

export const shadow = {
  soft: `0 8px 20px ${palette.shadow}`,
  lifted: `0 14px 30px ${palette.shadow}`,
} as const;

/** 말랑·통통 스프링 (Motion transition으로 사용) */
export const spring = {
  bouncy: { type: "spring", stiffness: 420, damping: 14, mass: 0.8 },
  soft: { type: "spring", stiffness: 260, damping: 22 },
} as const;

/** 터치 타깃 최소 크기 (작은 손가락 기준) */
export const touch = {
  minTarget: 72,
  gap: 20,
} as const;

/**
 * 폰트: 둥글고 친근한 한글 서체 권장.
 * 후보: Gmarket Sans / 나눔스퀘어라운드 / Pretendard(둥근 사용) 등.
 * 화면 텍스트는 보조이고 음성이 주이지만, 보이는 글자는 큼직·둥글게.
 * 실제 @font-face/import는 앱 셋업에서 연결.
 */
export const font = {
  family: `"Gmarket Sans", "NanumSquareRound", "Pretendard", system-ui, sans-serif`,
  // 유아 화면은 크게. 라운드 타이틀/보기 라벨 기준.
  titleSize: 34,
  optionSize: 28,
} as const;

export const gameTheme = {
  palette,
  pastelRotation,
  radius,
  shadow,
  spring,
  touch,
  font,
} as const;

export type GameTheme = typeof gameTheme;
