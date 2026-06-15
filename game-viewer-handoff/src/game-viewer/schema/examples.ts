/**
 * 참조용 예시 GameSpec 인스턴스.
 * - M1 렌더러 개발/테스트의 픽스처로 사용.
 * - AI 생성 에이전트의 few-shot 타깃으로도 사용.
 */
import type { CountingGame, SilhouetteGame } from "./gameSpec";

export const EXAMPLE_COUNTING: CountingGame = {
  schemaVersion: 1,
  id: "demo-counting-zoo",
  templateId: "counting",
  title: "동물원 친구들 세기",
  instruction: { text: "사자가 몇 마리 있을까요?", ttsUrl: undefined },
  ageRange: "3-5",
  theme: "zoo",
  ttsLocale: "ko-KR",
  assets: [
    { id: "lion", source: "openmoji", ref: "1F981", label: "사자", alt: "사자" },
    { id: "elephant", source: "openmoji", ref: "1F418", label: "코끼리", alt: "코끼리" },
  ],
  rounds: [
    { itemAssetId: "lion", count: 3, options: [2, 3, 4], scatter: "random" },
    { itemAssetId: "elephant", count: 5, options: [4, 5, 6], scatter: "random" },
  ],
  rewards: { effects: ["confetti", "stars"], voicePraise: "정말 잘했어요!" },
};

export const EXAMPLE_SILHOUETTE: SilhouetteGame = {
  schemaVersion: 1,
  id: "demo-silhouette-vehicles",
  templateId: "silhouette",
  title: "그림자를 보고 탈것을 맞춰요",
  instruction: { text: "이 그림자는 무엇일까요?" },
  ageRange: "5-7",
  theme: "vehicles",
  ttsLocale: "ko-KR",
  assets: [
    { id: "car", source: "openmoji", ref: "1F697", label: "자동차", alt: "자동차" },
    { id: "airplane", source: "openmoji", ref: "2708", label: "비행기", alt: "비행기" },
    { id: "ship", source: "openmoji", ref: "1F6A2", label: "배", alt: "배" },
  ],
  rounds: [
    { answerAssetId: "airplane", optionAssetIds: ["car", "airplane", "ship"] },
  ],
  rewards: { effects: ["confetti"], voicePraise: "딩동댕! 맞았어요!" },
};
