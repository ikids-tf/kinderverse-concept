/**
 * GameSpec — 킨더버스 게임 뷰어의 단일 계약(Single Contract)
 * ------------------------------------------------------------------
 * 이 파일은 게임 뷰어 전체의 "허브"다.
 *   - AI(생성 에이전트)는 이 JSON을 산출한다.
 *   - 모든 템플릿 렌더러는 이 JSON을 소비한다.
 *   - 교사 이미지 교체는 GameAsset.source 추상화로 흡수된다.
 *
 * 규칙:
 *   1. 템플릿은 asset의 source(openmoji/teacher/generated)를 몰라도 렌더링된다.
 *   2. 새 게임 = 새 templateId + rounds 타입 추가. union에 끼우기만 하면 된다.
 *   3. schemaVersion을 반드시 증가시켜 마이그레이션을 추적한다.
 */

export const GAME_SPEC_VERSION = 1 as const;

/* ───────────────────────── Asset (에셋 추상화) ───────────────────────── */

export type AssetSource = "openmoji" | "teacher" | "generated";

interface BaseAsset {
  /** rounds에서 참조하는 안정적 ID (예: "lion", "our_rabbit_01") */
  id: string;
  source: AssetSource;
  /** 한국어 라벨 (예: "사자"). 다국어 확장 시 i18n key로 승격 가능 */
  label: string;
  /** 라벨 TTS 오디오 URL (캐시됨). 유아는 글을 못 읽으므로 음성이 1급 */
  labelTtsUrl?: string;
  /** 접근성 alt 텍스트 */
  alt: string;
}

/** 큐레이션된 OpenMoji 에셋 — 기본/권장 경로. 생성 0, 안전성 보장 */
export interface OpenmojiAsset extends BaseAsset {
  source: "openmoji";
  /** OpenMoji hexcode (예: "1F981" = 사자) */
  ref: string;
}

/** 교사가 올린 이미지 — 처리 파이프라인을 거친 산출물 */
export interface TeacherAsset extends BaseAsset {
  source: "teacher";
  uploadId: string;
  /** 배경제거 + 정규화 완료 이미지 URL (status === "ready"일 때 존재) */
  processedUrl?: string;
  /** 실루엣 변환 URL (silhouette 템플릿용, 알파→단색) */
  silhouetteUrl?: string;
  /** 안전 검증 + 처리 상태. "rejected"면 게임에 들어갈 수 없음 */
  status: "pending" | "processing" | "ready" | "rejected";
}

/** 이미지 생성 폴백 — OpenMoji에 없는 희귀 소재만. 스타일 락 + 안전 분류기 필수 */
export interface GeneratedAsset extends BaseAsset {
  source: "generated";
  prompt: string;
  url: string;
}

export type GameAsset = OpenmojiAsset | TeacherAsset | GeneratedAsset;

/* ───────────────────────── 공통 필드 ───────────────────────── */

export interface Instruction {
  /** 화면 표시용 (교사/큰 아이용). 유아는 음성에 의존 */
  text: string;
  /** 지시문 TTS 오디오 URL. 게임 시작 시 자동 재생 */
  ttsUrl?: string;
}

export type AgeRange = "3-5" | "5-7";
export type TtsLocale = "ko-KR" | "ja-JP" | "en-US";

/** 정답 보상 연출 — "화려하지만 정제된" 피드백 */
export interface Rewards {
  /** 동시 적용 가능. canvas-confetti / Lottie 별 / 캐릭터 환호 */
  effects: Array<"confetti" | "stars" | "lottie" | "character-cheer">;
  /** 칭찬 음성 텍스트 (예: "잘했어요!") */
  voicePraise: string;
  voicePraiseTtsUrl?: string;
}

/* ───────────────────────── 템플릿별 Round 구조 ───────────────────────── */

/** counting — 아이템을 흩뿌리고 개수를 맞춘다 */
export interface CountingRound {
  /** 셀 아이템 (assets[].id 참조) */
  itemAssetId: string;
  /** 실제 개수 (정답) */
  count: number;
  /** 숫자 보기 (정답 포함, 셔플 전 상태) */
  options: number[];
  /** 흩뿌림 방식 */
  scatter?: "random" | "grid";
}

/** silhouette — 실루엣을 보고 정답을 고른다 */
export interface SilhouetteRound {
  /** 정답 에셋 (실루엣으로 표시됨) */
  answerAssetId: string;
  /** 보기 에셋들 (정답 포함, 컬러로 표시) */
  optionAssetIds: string[];
}

export type Emotion = "happy" | "sad" | "angry" | "scared" | "surprised";

/** emotion — 표정을 보고 감정을 맞추고, 공감 반응까지 (쇼케이스 템플릿) */
export interface EmotionRound {
  /** Rive 상태머신 식별자 (감정 연기하는 캐릭터) */
  riveStateMachine: string;
  /** 정답 감정 */
  emotion: Emotion;
  /** 감정 보기 (정답 포함) */
  optionEmotions: Emotion[];
  /** 공감 반응 단계 (선택) — 감정 식별 후 위로/축하 인터랙션 */
  empathyAction?: {
    /** 예: "친구가 슬퍼해요. 안아줄까요?" */
    promptText: string;
    promptTtsUrl?: string;
    /** 액션 버튼 라벨 (예: "안아주기") */
    actionLabel: string;
    /** 액션 후 캐릭터가 전이할 Rive 상태 (예: "comforted") */
    responseState: string;
  };
}

/** matching — 개념적으로 연관된 좌/우를 선으로 잇는다 */
export interface MatchingPair {
  leftAssetId: string;
  rightAssetId: string;
}
export interface MatchingRound {
  /** 정답 쌍 목록 */
  pairs: MatchingPair[];
  /** 관계 라벨 (예: "동물-먹이", "직업-도구") — 교사 안내/난이도 보정용 */
  relation: string;
}

/* ───────────────────────── GameSpec 판별 유니온 ───────────────────────── */

interface BaseGameSpec {
  schemaVersion: typeof GAME_SPEC_VERSION;
  /** 게임 인스턴스 ID */
  id: string;
  title: string;
  instruction: Instruction;
  ageRange: AgeRange;
  /** 테마 (예: "zoo", "garden", "ourClass") — 에셋 톤/배경에 사용 */
  theme: string;
  assets: GameAsset[];
  rewards: Rewards;
  ttsLocale: TtsLocale;
}

export interface CountingGame extends BaseGameSpec {
  templateId: "counting";
  rounds: CountingRound[];
}
export interface SilhouetteGame extends BaseGameSpec {
  templateId: "silhouette";
  rounds: SilhouetteRound[];
}
export interface EmotionGame extends BaseGameSpec {
  templateId: "emotion";
  rounds: EmotionRound[];
}
export interface MatchingGame extends BaseGameSpec {
  templateId: "matching";
  rounds: MatchingRound[];
}

/** 새 템플릿은 여기에 추가 (예: memory, sorting, sequencing) */
export type GameSpec =
  | CountingGame
  | SilhouetteGame
  | EmotionGame
  | MatchingGame;

export type TemplateId = GameSpec["templateId"];

/* ───────────────────────── 런타임 가드 (얇게) ───────────────────────── */

export function isTemplate<T extends TemplateId>(
  spec: GameSpec,
  templateId: T
): spec is Extract<GameSpec, { templateId: T }> {
  return spec.templateId === templateId;
}

/**
 * 최소 무결성 검증. 실제 검증은 zod 스키마로 대체 권장(PROMPTS.md M1 참조).
 * - 모든 round의 assetId가 assets에 존재하는지
 * - teacher 에셋이 ready 상태인지
 */
export function assertSpecIntegrity(spec: GameSpec): void {
  const ids = new Set(spec.assets.map((a) => a.id));
  const ref = (id: string) => {
    if (!ids.has(id)) throw new Error(`[GameSpec] unknown assetId: ${id}`);
  };
  for (const a of spec.assets) {
    if (a.source === "teacher" && a.status !== "ready") {
      throw new Error(`[GameSpec] teacher asset not ready: ${a.id} (${a.status})`);
    }
  }
  if (isTemplate(spec, "counting")) spec.rounds.forEach((r) => ref(r.itemAssetId));
  if (isTemplate(spec, "silhouette"))
    spec.rounds.forEach((r) => [r.answerAssetId, ...r.optionAssetIds].forEach(ref));
  if (isTemplate(spec, "matching"))
    spec.rounds.forEach((r) =>
      r.pairs.forEach((p) => [p.leftAssetId, p.rightAssetId].forEach(ref))
    );
}
