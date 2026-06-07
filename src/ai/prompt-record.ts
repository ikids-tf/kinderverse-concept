import { PEDAGOGY_FOUNDATION, type AgeBand } from './pedagogy';
import type { AssembledPrompt } from './prompt';

/* Record agent prompt (agent.record). 4-layer assembly:
   L0 charter → L1 Pedagogy Foundation → L2 record task + AUI payload schema → L3.
   Output is an AUI registry payload (RecordDraftCard / PlayStoryCard / ClarifyPrompt). */

export interface RecordInput {
  text: string;
  mode: 'observation' | 'story';
  age_band?: AgeBand;
  grounding: { photos: string[]; teacher_notes: string[] };
}

const L0_CHARTER = `너는 킨더버스의 Tier1 기록(record) 에이전트다. 교사의 입력과 근거(grounding: 사진/교사메모)를 바탕으로 기록을 작성한다. 적합성은 공유 Pedagogy Foundation이 보장한다.`;

function l2(mode: 'observation' | 'story'): string {
  if (mode === 'observation') {
    return `[태스크] 관찰기록(observation) — 발달·영역 분석, 행정/평가용.
규칙:
- grounding(사진/교사메모)에 근거해서만 진술한다. 근거가 없거나 빈약하면 만들어내지 말고 ClarifyPrompt로 보강을 요청하라.
- 각 관찰 진술마다 source(근거: 메모 내용 요약 또는 photo id)와 연계 영역(domains)을 반드시 채운다.
- 아동 식별정보는 일반화/마스킹한다(child_label 예: "관찰 대상", 이니셜).

출력(JSON, 다른 텍스트 금지) — 충분한 근거가 있을 때:
{ "type": "RecordDraftCard", "props": {
  "child_label": string, "age_band": "0-2"|"3-5", "curriculum": "standard"|"nuri",
  "date"?: string,
  "observations": [ { "text": string, "source": string, "domains": string[] } ],
  "summary"?: string
} }
근거가 부족하면:
{ "type": "ClarifyPrompt", "props": { "question": string, "options"?: string[] } }`;
  }
  return `[태스크] 놀이기록=놀이이야기(story) — 사진 배치 + 활동 서술, 학부모 발송용.
규칙:
- grounding(그날 활동 사진/교사메모)에 근거해 "무슨 활동을 했는지"를 따뜻한 학부모 대상 톤으로 서술한다.
- photo_slots는 사진 자리(캡션 포함). 실제 아동 사진은 시스템이 나중에 채운다 — 너는 캡션만 제안.
- 연계 영역(domains)을 표시한다. 근거가 전혀 없으면 ClarifyPrompt로 보강을 요청하라.

출력(JSON, 다른 텍스트 금지):
{ "type": "PlayStoryCard", "props": {
  "title": string, "age_band": "0-2"|"3-5", "curriculum": "standard"|"nuri",
  "photo_slots": [ { "caption": string, "placeholder": true } ],
  "narrative": string, "domains": string[], "family_note"?: string
} }
근거 부족 시: { "type": "ClarifyPrompt", "props": { "question": string, "options"?: string[] } }`;
}

export function buildRecordPrompt(input: RecordInput, tenantContext?: string): AssembledPrompt {
  const l3 = tenantContext?.trim()
    ? `[테넌트/교사 컨텍스트 — 우리반]\n${tenantContext.trim()}\n아동 식별정보는 마스킹된 상태다. 이 컨텍스트를 적합성·연령 판단에 활용하되 새로운 사실을 지어내지 마라.`
    : '';
  const system = [L0_CHARTER, PEDAGOGY_FOUNDATION, l2(input.mode), l3].filter(Boolean).join('\n\n');

  const grounding = {
    photos: input.grounding.photos,
    teacher_notes: input.grounding.teacher_notes,
  };

  const user = [
    `모드: ${input.mode}`,
    input.age_band ? `연령대: ${input.age_band}` : '연령대: (미지정 — 입력에서 추론하고 기본 3-5)',
    '',
    '근거(grounding):',
    JSON.stringify(grounding, null, 2),
    '',
    `교사 입력: "${input.text}"`,
    '',
    '위 근거에 기반해 출력 스키마에 맞는 JSON만 출력하라. 근거가 부족하면 ClarifyPrompt로 응답하라.',
  ].join('\n');

  return { system, user };
}
