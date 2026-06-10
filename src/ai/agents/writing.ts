import { callGateway } from '../client';
import { extractJson } from '../json';
import { PEDAGOGY_FOUNDATION } from '../pedagogy';
import { validateRegistryPayload, type RegistryPayload } from '@/ui-registry/contracts';

/* Tier1 문장 에이전트 (agent.writing). 문장생성·가정통신문·공지·발달평가서.
   고위험(평가서)은 생성 후 자동 적합성 검증 패스(체크리스트) 1회를 거친다(PROMPTS §5).
   자율성: 생성=L1 / 발송=L2(통신문·공지) / 외부·평가서 발송=L3 (UI 컴포넌트에서 게이트). */

export type WritingMode = 'letter' | 'notice' | 'text' | 'assessment';

export interface WritingResult {
  payload: RegistryPayload;
  mocked?: boolean;
  warning?: string;
}

function inferMode(text: string): WritingMode {
  if (/평가서|발달\s*평가|발달평가/.test(text)) return 'assessment';
  if (/통신문|가정통신/.test(text)) return 'letter';
  if (/공지|안내문|안내/.test(text)) return 'notice';
  return /통신|편지|letter/.test(text) ? 'letter' : 'text';
}

function system(ctx?: string): string {
  const l0 = '너는 킨더버스 Tier1 문장 에이전트다. 통신문·공지·문장·발달평가서를 원 톤에 맞춰 쓴다. 적합성은 Pedagogy Foundation이 보장한다.';
  const l3 = ctx?.trim() ? `[테넌트/교사 컨텍스트 — 우리반]\n${ctx.trim()}\n아동명 마스킹. 사실을 지어내지 마라.` : '';
  return [l0, PEDAGOGY_FOUNDATION, l3].filter(Boolean).join('\n\n');
}

function clarify(question: string): RegistryPayload {
  return { type: 'ClarifyPrompt', props: { question } };
}

function userPrompt(mode: WritingMode, text: string): string {
  if (mode === 'assessment') {
    return `요청: "${text}"\n발달평가서를 작성하라. 근거에 기반해 객관적·비낙인적으로, 영역별 관찰과 종합의견을 쓴다. JSON만:\n{ "type": "AssessmentReport", "props": { "child_label": string, "age_band": "0-2"|"3-5", "curriculum": "standard"|"nuri", "domains": [ { "area": string, "observation": string, "level"?: string } ], "summary": string } }`;
  }
  const kind = mode === 'notice' ? 'notice' : mode === 'text' ? 'text' : 'letter';
  if (mode === 'text') {
    return `요청: "${text}"\n요청한 글(문장/메모/인사말 등)을 작성하라. 따뜻하고 정중한 톤, 군더더기 없이. JSON만:\n{ "type": "LetterPreview", "props": { "kind": "text", "title": string, "body": string, "tone": "warm"|"formal"|"concise", "audience"?: string } }`;
  }
  const what = mode === 'notice' ? '안내문/공지' : '가정통신문';
  return `요청: "${text}"
실제 유치원에서 발송하는 수준의 ${what}을(를) 작성하라.

[현장 통신문 형식 — body 구성을 반드시 따른다]
1) 계절·시기 인사말 2~3문장 — 지금 시기의 구체적 계절감을 담아 따뜻하게(상투적 과장 금지).
2) 본문 — 목적과 내용을 명확히. 일시·장소·대상·준비물·신청 방법·회신 기한 같은 항목 정보는 줄을 바꿔 "· " 목록으로 정리한다.
3) 가정의 협조 요청 1~2문장.
4) 맺음 감사 인사 1문장.
5) 마지막 줄: 날짜와 발신처 — "20__년 __월 __일" / "○○유치원장" (placeholder 그대로 둘 것).

[어조·사실 규칙]
- "~해 주시기 바랍니다", "~하오니" 등 정중한 통신문체. 느낌표·이모지 남용 금지(0~1개).
- 원 이름·교사명·아동명은 ○○ placeholder. 알 수 없는 날짜·시간·장소는 임의로 정하지 말고 "__월 __일(_)요일" 식 빈칸으로 둔다.
- 길이 280~550자. 제목(title)은 "OO 안내" 형식으로 간결하게.

JSON만:
{ "type": "LetterPreview", "props": { "kind": "${kind}", "title": string, "body": string, "tone": "warm"|"formal"|"concise", "audience"?: string } }`;
}

/* 고위험 산출물 적합성 검증 패스 (체크리스트 1회). */
async function suitabilityCheck(content: string, ctx?: string): Promise<{ pass: boolean; flags: string[] }> {
  const res = await callGateway({
    task: 'suitability',
    tier: 'low',
    provider: 'auto',
    responseFormat: 'json',
    system: system(ctx),
    messages: [
      {
        role: 'user',
        content: `다음 발달평가서를 유아교육 적합성 체크리스트로 검토하라.\n체크: [발달 적합성, 무근거 진술 없음, 영역 연계, 낙인적/단정적 표현 없음, 객관적 서술].\n평가서:\n${content}\n\nJSON만: { "pass": boolean, "flags": string[] }`,
      },
    ],
    meta: { kind: 'suitability' },
    maxTokens: 500,
  });
  if (!res.ok || !res.text) return { pass: false, flags: ['적합성 검증을 완료하지 못했습니다.'] };
  try {
    const j = extractJson(res.text) as { pass?: boolean; flags?: string[] };
    return { pass: !!j.pass, flags: Array.isArray(j.flags) ? j.flags : [] };
  } catch {
    return { pass: false, flags: ['검증 응답 파싱 실패'] };
  }
}

export async function runWriting(text: string, ctx?: string): Promise<WritingResult> {
  const mode = inferMode(text);

  const first = await callGateway({
    task: 'writing',
    tier: 'mid',
    provider: 'auto',
    responseFormat: 'json',
    fallback: ['high'],
    system: system(ctx),
    messages: [{ role: 'user', content: userPrompt(mode, text) }],
    meta: { kind: mode, title: text, selected: [] },
    maxTokens: 1800,
  });

  if (!first.ok || !first.text) {
    return { payload: clarify('문서 생성에 실패했어요.'), warning: first.error, mocked: first.mocked };
  }

  let result;
  try {
    result = validateRegistryPayload(extractJson(first.text));
  } catch {
    result = { ok: false as const, errors: ['unparseable'] };
  }
  if (!result.ok || !result.value) {
    return { payload: clarify('문서를 만들 정보가 부족해요. 무엇을, 누구에게 보낼지 알려주세요.'), mocked: first.mocked };
  }

  // 고위험: 발달평가서 → 자동 적합성 검증 패스 1회.
  if (result.value.type === 'AssessmentReport') {
    const summaryText = [
      result.value.props.summary,
      ...result.value.props.domains.map((d) => `${d.area}: ${d.observation}`),
    ].join('\n');
    const check = await suitabilityCheck(summaryText, ctx);
    result.value.props.suitability = { checked: true, pass: check.pass, flags: check.flags };
  }

  return { payload: result.value, mocked: first.mocked };
}
