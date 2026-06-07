/* Pedagogy Foundation — shared layer inherited by all Tier1 agents
   (SKILL §2, PRD §5.1–5.2). Two surfaces:
   1) PEDAGOGY_FOUNDATION: the L1 prompt layer (developmental appropriateness,
      area linkage, anti-hallucination).
   2) Domain constants (age bands, curriculum areas) reused by agents and UI. */

export type AgeBand = '0-2' | '3-5';
export type Curriculum = 'standard' | 'nuri';

/** 0~2세 = 표준보육과정, 3~5세 = 누리과정. */
export function curriculumForAge(band: AgeBand): Curriculum {
  return band === '0-2' ? 'standard' : 'nuri';
}

/** 누리과정 5개 영역 (3~5세). */
export const NURI_AREAS = [
  '신체운동·건강',
  '의사소통',
  '사회관계',
  '예술경험',
  '자연탐구',
] as const;

/** 표준보육과정 영역 (0~2세) — 기본생활 + 5영역. */
export const STANDARD_AREAS = [
  '기본생활',
  '신체운동',
  '의사소통',
  '사회관계',
  '예술경험',
  '자연탐구',
] as const;

export function areasFor(curriculum: Curriculum): readonly string[] {
  return curriculum === 'nuri' ? NURI_AREAS : STANDARD_AREAS;
}

export const CURRICULUM_LABEL: Record<Curriculum, string> = {
  standard: '표준보육과정',
  nuri: '누리과정',
};

/* The L1 prompt layer. Composed below L0 charter and above the task layer
   (PROMPTS §0). Kept faithful to SKILL §2. */
export const PEDAGOGY_FOUNDATION = `[유아교육 토대 — Pedagogy Foundation]
연령대:
- 0~2세 = 표준보육과정. 일상·기본생활습관·정서적 상호작용 중심. 영역: ${STANDARD_AREAS.join(' / ')}.
- 3~5세 = 누리과정. 놀이중심·자율탐구. 5개 영역: ${NURI_AREAS.join(' / ')}.

원칙:
1. 발달 적합성: 연령대에 맞는 활동·기대·표현만 사용한다.
2. 영역 연계: 모든 관찰/활동 진술은 위 영역 중 연관 영역에 연결해 표시한다.
3. 무근거 생성 금지: 관찰·평가 진술은 grounding(사진/교사메모)에 근거해서만 작성한다. 근거가 없으면 지어내지 말고 보강을 요청한다. 각 진술에 근거 출처를 남긴다.
4. 아동 안전: 아동 식별정보는 마스킹/일반화한다(예: "관찰 대상", 이니셜). 테넌트 경계를 넘지 않는다.`;
