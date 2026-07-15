import { callGateway } from '../client';
import { extractJson } from '../json';
import { PEDAGOGY_FOUNDATION } from '../pedagogy';
import { validateRegistryPayload, type RegistryPayload } from '@/ui-registry/contracts';

/* Tier1 계획 에이전트 (agent.plan). 놀이계획·주안. Inherits Pedagogy Foundation +
   tenant context. Outputs an idea list (lane step 1) or a WeeklyPlanGrid payload. */

let seq = 0;
const id = (p: string) => `${p}_${++seq}_${Date.now().toString(36)}`;

export interface IdeaItem {
  id: string;
  label: string; // 놀이명 (짧고 구체적)
  desc: string; // 놀이 소개(요약) — 경량 seed 호환용. 리치 카드에선 intro 와 동일.
  // ── 놀이아이디어(PlayIdeaList) 리치 필드 — runPlayIdeaList 가 채운다. 경량
  //    runPlanIdeas seed 는 아래를 비워두므로 모두 optional(하위 호환).
  area?: string; // 배움영역 (누리/표준 영역 1개)
  intro?: string; // 놀이 소개 (경험 중심 1~2문장)
  steps?: string[]; // 놀이 방법 2~4단계
  tips?: string[]; // 놀이팁 (발문·환경구성·관찰포인트·안전 중)
}

/** One mind-map activity branch — concrete enough for a teacher to run as-is. */
export interface MindActivity {
  id: string;
  label: string; // 활동 이름
  method: string; // 놀이 전개 (어떻게 노는지)
  materials: string; // 준비물
  area: string; // 연계 누리과정 영역
}

/** Generate rich, field-usable play activities for a mind map. Each is a concrete
    놀이 a teacher can run immediately (전개 + 준비물 + 연계 영역), grounded by an
    optional reference document so the map reflects a chat plan/문서. */
export async function runMindMapActivities(
  topic: string,
  ctx?: string,
  count = 7,
  grounding?: string,
  ageBand?: string,
): Promise<MindActivity[]> {
  const ground = grounding?.trim()
    ? `\n[참고 문서 — 아래 내용을 적극 반영해 활동을 뽑아라]\n${grounding.trim().slice(0, 1400)}\n`
    : '';
  const ageRule = buildAgeCurriculumRule(resolveAge(ageBand));
  const res = await callGateway({
    task: 'plan',
    tier: 'mid',
    provider: 'auto',
    responseFormat: 'json',
    fallback: ['high'],
    system: system(ctx),
    messages: [
      {
        role: 'user',
        content: `주제: "${topic}"${ground}
${ageRule}
이 주제로 영아(0-1세) 또는 유아(만 3~5세)가 교실·바깥에서 바로 할 수 있는 '놀이 중심' 활동 ${count}개를 마인드맵 가지로 제안하라.
서로 겹치지 않게 놀이 유형(탐색·조작·신체·역할·표현·관찰 등)과 누리 영역을 골고루 다양하게.
교사가 이 카드 하나만 보고 바로 수업할 수 있을 만큼 구체적으로 쓴다. 단순 명사·영역명 나열 절대 금지.
- label: 활동 이름 (8~16자, 놀이임이 드러나게. 예: "씨앗 심기 놀이", "텃밭 채소 가게 놀이")
- method: 놀이 전개 2문장 (아이들이 무엇을 어떻게 하는지 + 교사의 발문/확장 1가지, 50~90자)
- materials: 실제 준비물 2~4가지 (쉼표로 구분)
- area: 연계 누리과정 영역 1개 (신체운동·건강 / 의사소통 / 사회관계 / 예술경험 / 자연탐구 중 하나)
JSON만 출력:
{ "items": [ { "label": string, "method": string, "materials": string, "area": string } ] }`,
      },
    ],
    meta: { kind: 'idea', title: topic, selected: [] },
    maxTokens: 2600,
  });
  if (!res.ok || !res.text) return [];
  try {
    const parsed = extractJson(res.text) as {
      items?: Array<{ label?: string; method?: string; materials?: string; area?: string }>;
    };
    return (parsed.items ?? [])
      .filter((it) => it.label)
      .map((it) => ({
        id: id('act'),
        label: String(it.label).trim(),
        method: (it.method ?? '').trim(),
        materials: (it.materials ?? '').trim(),
        area: (it.area ?? '').trim(),
      }));
  } catch {
    return [];
  }
}

/* ── 공통 프롬프트 빌더 (계획 유형 공용) ─────────────────────────────────
   시스템 헌장(system) + 연령·교육과정 규칙 + 안전교육 규칙 + 출력 규칙을 한 곳에서 만든다.
   유형별(놀이아이디어/마인드맵/일·주·월·프로젝트) 프롬프트가 이 빌더를 조합해 쓴다. */

/** 느슨한 연령 입력(예: "만 4세", "0~2세", "혼합반")을 교육과정 밴드로 해석. */
export type AgeCurriculumBand = '0-2' | '3-5' | 'mixed';
export interface ResolvedAge {
  band: AgeCurriculumBand;
  label: string; // 표시용 라벨(원문 우선)
  years?: string; // 원문 연령 문자열(있으면)
}

export function resolveAge(ageBand?: string): ResolvedAge {
  const raw = (ageBand ?? '').trim();
  const b = raw.replace(/\s/g, '');
  if (/혼합|통합|영유아/.test(b)) return { band: 'mixed', label: raw || '혼합(영유아)반', years: raw || undefined };
  if (/0-2|0~2|0–2|영아|만0|만1|만2|(^|[^0-9])[012]세/.test(b))
    return { band: '0-2', label: raw || '0~2세', years: raw || undefined };
  if (/(만)?[345]세|3-5|3~5|유아/.test(b)) return { band: '3-5', label: raw || '3~5세', years: raw || undefined };
  return { band: '3-5', label: raw || '3~5세', years: raw || undefined }; // 연령 미상 → 누리과정(앱 기본 3-5) 기준
}

function system(ctx?: string): string {
  const l0 = [
    '너는 킨더버스 Tier1 계획 에이전트다.',
    '유치원과 어린이집 교사가 실제 현장에서 사용할 수 있는 놀이 중심 교육계획을 생성한다.',
    '',
    '지원 기능: 놀이 아이디어 · 마인드맵 활동 · 일일 놀이계획 · 주간 놀이계획 · 월간 놀이계획 · 프로젝트 놀이계획',
    '',
    '[공통 생성 원칙]',
    '1. 실제 유치원·어린이집에서 바로 사용할 수 있는 수준으로 작성한다.',
    '2. 영유아가 놀이의 주체가 되도록 작성한다.',
    '3. 교사는 지식 전달자가 아니라 관찰·발문·환경·자료·상호작용을 지원하는 역할이다.',
    '4. 놀이의 결과보다 과정과 다양한 참여 방식을 중요하게 반영한다.',
    '5. 입력된 연령·주제·기간·반 정보·상위 계획과 교사 컨텍스트를 우선 사용한다.',
    '6. 입력에 없는 아동 행동·발화·알레르기·장애·행사·반 이름·날짜를 지어내지 않는다.',
    '7. 실제 기관에서 운영 가능한 재료와 환경만 제안한다.',
    '8. 위험하거나 연령에 적합하지 않은 활동은 제외한다.',
    '9. 요청한 JSON 스키마만 반환한다.',
    '10. 설명문·마크다운·코드블록·주석을 출력하지 않는다.',
  ].join('\n');
  const l3 = ctx?.trim() ? `[테넌트/교사 컨텍스트 — 우리반]\n${ctx.trim()}\n아동명은 마스킹 상태. 사실을 지어내지 마라.` : '';
  return [l0, PEDAGOGY_FOUNDATION, l3].filter(Boolean).join('\n\n');
}

/** 연령·교육과정 규칙 — 유형별 프롬프트에 삽입해 연령 적합성을 강제한다. */
export function buildAgeCurriculumRule(resolvedAge: ResolvedAge): string {
  const infant = [
    '- 2024 개정 표준보육과정을 기준으로 한다.',
    '- 감각 탐색, 반복 행동, 일상 경험, 애착, 자발적 신체 움직임 중심으로 구성한다.',
    '- 정해진 결과물이나 모든 영아에게 동일한 수행을 요구하지 않는다.',
    '- 교사는 영아의 몸짓·표정·소리·행동을 관찰하고 기다리며 지원한다.',
    '- 수면·식사·건강 상태와 개인차를 반영한다.',
  ].join('\n');
  const young = [
    '- 2019 개정 누리과정을 기준으로 한다. 유아·놀이 중심.',
    '- 흥미, 질문, 상상, 탐구, 표현, 협력, 문제 해결 중심으로 구성한다.',
    '- 교사의 정답 제시와 일방적 설명을 최소화한다.',
    '- 관찰, 개방형 질문, 재료·공간·또래 상호작용으로 놀이를 지원한다.',
  ].join('\n');
  if (resolvedAge.band === '0-2') return `[연령·교육과정 — 0~2세]\n${infant}`;
  if (resolvedAge.band === '3-5') return `[연령·교육과정 — 3~5세]\n${young}`;
  return [
    '[연령·교육과정 — 혼합(영유아)반]',
    '- 공통 주제는 유지하되, 연령에 따라 참여 방식·재료·기대 경험·교사 지원을 차등한다.',
    '- 0~2세(2024 개정 표준보육과정)와 3~5세(2019 개정 누리과정)의 연계를 구분해 제시한다.',
    '',
    '〈0~2세〉',
    infant,
    '',
    '〈3~5세〉',
    young,
  ].join('\n');
}

/** 안전교육 규칙 — 놀이 안전을 연령별로 반영한다. (내용 1차안 — 유형별 스펙 확정 시 조정) */
export function buildSafetyEducationRule(resolvedAge: ResolvedAge): string {
  const common = '- 놀이 안전, 도구·재료 사용 안전, 생활 안전을 주제·활동과 연결해 구체적으로 제시한다.';
  if (resolvedAge.band === '0-2')
    return [
      '[안전교육 — 0~2세]',
      common,
      '- 삼킴·낙상·모서리·위생 위험을 우선 점검하고, 교사의 밀착 관찰과 안전한 환경 구성을 전제한다.',
      '- 안전 수칙은 영아에게 규칙 학습이 아니라 교사의 환경·지원으로 반영한다.',
    ].join('\n');
  if (resolvedAge.band === '3-5')
    return [
      '[안전교육 — 3~5세]',
      common,
      '- 유아와 함께 놀이 약속을 정하고, 도구 바른 사용과 공간·순서 지키기를 놀이 속에서 익히도록 한다.',
    ].join('\n');
  return [
    '[안전교육 — 혼합(영유아)반]',
    common,
    '- 0~2세는 교사 밀착 관찰·환경 안전, 3~5세는 유아와의 안전 약속으로 연령별로 차등 적용한다.',
  ].join('\n');
}

/** 출력 규칙 — 모든 유형 공용. */
export function buildOutputRule(): string {
  return [
    '[출력 규칙]',
    '- 요청한 JSON 스키마만 반환한다. 설명문·마크다운·코드블록·주석을 출력하지 않는다.',
    '- 입력에 없는 문자열 필드는 ""(빈 문자열), 배열 필드는 [](빈 배열)로 둔다.',
    '- 상위 계획과 충돌하는 주제·소주제를 생성하지 않는다.',
    '- 스키마의 필드를 삭제하거나 필드명을 바꾸지 않는다.',
    '- 유효한 JSON만 반환한다.',
  ].join('\n');
}

export async function runPlanIdeas(request: string, ctx?: string, count = 4, ageBand?: string): Promise<IdeaItem[]> {
  const ageRule = buildAgeCurriculumRule(resolveAge(ageBand));
  const res = await callGateway({
    task: 'plan',
    tier: 'mid',
    provider: 'auto',
    responseFormat: 'json',
    fallback: ['high'],
    system: system(ctx),
    messages: [
      {
        role: 'user',
        content: `요청: "${request}"\n${ageRule}\n이 주제로 서로 겹치지 않는 유아 놀이 활동 아이디어 ${count}개를 제안하라. label은 활동 이름(10자 내외), desc는 놀이 방법·전개가 드러나는 1~2문장(50~80자)으로 구체적으로 쓰고 끝에 연계 누리 영역을 괄호로 표기. 단순 명사 나열 금지. JSON만:\n{ "items": [ { "label": string, "desc": string } ] }`,
      },
    ],
    meta: { kind: 'idea', title: request, selected: [] },
    // count 에 비례해 토큰 확보 — 아이디어 15개(아이디어 리스트)는 1400으론 JSON이 잘려 파싱 실패한다.
    maxTokens: Math.min(4000, Math.max(1400, 240 + count * 130)),
  });
  if (!res.ok || !res.text) return [];
  try {
    const parsed = extractJson(res.text) as { items?: Array<{ label: string; desc?: string }> };
    return (parsed.items ?? []).map((it) => ({ id: id('idea'), label: it.label, desc: it.desc ?? '' }));
  } catch {
    return [];
  }
}

/** 놀이아이디어(PlayIdeaList) — 교사가 바로 운영할 수 있는 '리치' 놀이 아이디어를 생성한다.
    각 아이디어 = 놀이명·배움영역·놀이 소개·놀이 방법(2~4단계)·놀이팁. 놀이 유형을 겹치지 않게
    다양하게, 연령별 교육과정에 맞춰 만든다(feature: play_idea). 결과는 idealist 카드/마크다운으로 렌더되고,
    label(놀이명)·desc(소개)는 하위(계획·마인드맵) seed 로도 그대로 쓰인다. */
export async function runPlayIdeaList(
  request: string,
  ctx?: string,
  count = 6,
  ageBand?: string,
): Promise<IdeaItem[]> {
  const ageRule = buildAgeCurriculumRule(resolveAge(ageBand));
  const res = await callGateway({
    task: 'plan',
    tier: 'mid',
    provider: 'auto',
    responseFormat: 'json',
    fallback: ['high'],
    system: system(ctx),
    messages: [
      {
        role: 'user',
        content: `주제: "${request}"
이 주제로 유아가 교실·바깥에서 바로 할 수 있는 '놀이 중심' 놀이 아이디어 ${count}개를 제안하라.
${ageRule}

[놀이 중심 원칙]
- 결과물보다 과정, 교사 주도보다 유아 주도, 정답 찾기보다 탐색 중심으로 쓴다.
- 놀이 유형을 겹치지 않게 다양하게: 신체놀이·감각탐색·역할놀이·언어놀이·미술표현·음악/동작·쌓기/구성·과학탐구·자연탐색·게임·협동놀이 등에서 골고루. 같은 유형 반복 금지.
- 연령에 부적합한 지식 전달·설명 중심 활동, 안전 위험이 큰 놀이는 만들지 않는다.

[각 아이디어 작성 규칙]
- title: 놀이명 — 짧고 구체적으로(예: "얼음 보석 꺼내기", "겨울옷 가게 놀이").
- area: 배움영역 1개 — 신체운동·건강 / 의사소통 / 사회관계 / 예술경험 / 자연탐구 중 하나.
- intro: 놀이 소개 1~2문장. 주어("유아는/유아가") 없이 놀이·경험 자체를 서술.
- steps: 놀이 방법 2~4단계. 각 원소가 한 단계 — 주어("유아는/유아가") 없이 놀이 행동만. "놀이 방법" 같은 제목·번호는 넣지 말고 내용만.
- tips: 놀이팁 1~3개 — 교사 발문(질문)·환경구성·관찰 포인트·안전사항 중에서.
- ★ 어미 통일(필수): intro·steps·tips 의 모든 문장을 친근한 존댓말 "~해요 / ~해 봐요 / ~해 봅니다" 로 끝맺는다. "~한다 / ~본다 / ~하기" 같은 평서·명사형 어미 금지.
- 중복 놀이 금지.

[예시 — 아래 톤·형식·어미를 그대로 따를 것]
{ "title": "얼음 보석 꺼내기", "area": "자연탐구", "intro": "얼음 속에 얼려 둔 보석을 녹여 꺼내며 물이 변하는 모습을 온몸으로 느껴 봐요.", "steps": ["보석을 넣어 얼린 얼음을 이리저리 살펴봐요.", "따뜻한 물과 소금을 부어 천천히 녹여 봐요.", "꺼낸 보석을 색깔별로 모아 봐요."], "tips": ["'얼음이 어떻게 변하고 있어요?' 하고 물어봐요."] }

JSON만 출력(위 예시와 같은 어미로):
{ "items": [ { "title": string, "area": string, "intro": string, "steps": [string], "tips": [string] } ] }`,
      },
    ],
    meta: { kind: 'idea', title: request, selected: [] },
    // 아이디어당 방법·팁까지 담아 길다 — count 에 비례해 넉넉히(잘리면 JSON 파싱 실패).
    maxTokens: Math.min(4000, Math.max(1800, 320 + count * 260)),
  });
  if (!res.ok || !res.text) return [];
  try {
    const parsed = extractJson(res.text) as {
      items?: Array<{ title?: string; label?: string; area?: string; intro?: string; desc?: string; steps?: unknown; tips?: unknown }>;
    };
    const arr = (s: unknown): string[] =>
      Array.isArray(s) ? s.map((x) => String(x).trim()).filter(Boolean) : [];
    return (parsed.items ?? [])
      .filter((it) => it.title || it.label)
      .map((it) => {
        const title = String(it.title ?? it.label ?? '').trim();
        const intro = (it.intro ?? it.desc ?? '').trim();
        return {
          id: id('idea'),
          label: title,
          desc: intro,
          area: (it.area ?? '').trim(),
          intro,
          steps: arr(it.steps),
          tips: arr(it.tips),
        };
      });
  } catch {
    return [];
  }
}

export interface PlanResult {
  payload: RegistryPayload;
  mocked?: boolean;
  warning?: string;
}

/** 놀이중심 주제망(topic_web) — 대주제→소주제(탐색영역)→놀이아이디어(놀이명) 2단계 +
    환경구성 + 유아 예상질문. TopicWeb 페이로드로 반환해 보드 카드/마크다운으로 렌더하고,
    하위(놀이아이디어·월/주/일안)·verse topic_web 의 seed 로 쓰인다(feature: topic_web). */
export async function runTopicWeb(
  request: string,
  ctx?: string,
  opts?: { ageBand?: string; subtopicCount?: number; ideaCountPerSubtopic?: number; projectMode?: boolean },
): Promise<PlanResult> {
  const ageRule = buildAgeCurriculumRule(resolveAge(opts?.ageBand));
  const subN = opts?.subtopicCount ?? 5;
  const ideaN = opts?.ideaCountPerSubtopic ?? 4;
  const proj = opts?.projectMode ? '\n- 프로젝트 모드: 소주제·놀이가 하나의 탐구 프로젝트로 이어지도록 구성한다.' : '';
  const user = `주제: "${request}"
이 주제로 유아의 흥미와 놀이 흐름이 드러나는 '놀이중심 주제망(topic_web)'을 작성하라. 단순 개념 나열이 아니라, 이후 놀이아이디어·월/주/일안·프로젝트로 확장 가능한 기반 데이터가 되게 한다.
${ageRule}

[구성 규칙]
- main_topic: 대주제(입력 주제).
- subtopics: 소주제 ${subN}개. '활동명'이 아니라 유아의 경험과 연결된 '탐색·관심 영역'으로 짧고 명확하게(예: 겨울놀이 → "겨울 날씨", "눈과 얼음", "겨울 옷차림"). 주차/활동 번호 금지, 중복 금지.
- 각 subtopic.play_ideas: 놀이아이디어 ${ideaN}개. 실제 교실에서 실행 가능한 '짧은 놀이명'만(설명 없이). 놀이 유형(신체·감각탐색·역할·언어·미술·음악동작·쌓기구성·과학탐구·자연탐색·협동)이 겹치지 않게. 흐름은 관심→탐색→표현→확장→공유를 반영. 교사 주도보다 유아 주도가 드러나게.
- environment_setup: 교실 환경 구성 4~6개. 탐색 자료·역할놀이 소품·그림책/언어 자료·게시판·유아 작품 전시·관찰/기록 공간·안전 자료를 고려해 교사가 실제 적용할 수 있게 한 문장씩.
- children_expected_questions: 유아의 예상 질문 4~6개. 왜/어떻게/무엇일까/무엇이 다를까 유형으로, 유아의 말투에 가깝게 자연스럽게.${proj}

${buildOutputRule()}

JSON만 출력:
{ "type": "TopicWeb", "props": { "main_topic": string, "age_band": "0-2"|"3-5", "theme": string, "season": string, "project_mode": boolean, "subtopics": [ { "subtopic": string, "play_ideas": [string] } ], "environment_setup": [string], "children_expected_questions": [string] } }`;

  const res = await callGateway({
    task: 'plan',
    tier: 'mid',
    provider: 'auto',
    responseFormat: 'json',
    fallback: ['high'],
    system: system(ctx),
    messages: [{ role: 'user', content: user }],
    meta: { kind: 'plan', title: request, selected: [] },
    maxTokens: Math.min(4000, Math.max(2200, 700 + subN * ideaN * 55)),
  });
  if (!res.ok || !res.text) {
    return { payload: clarify('주제망 생성에 실패했어요.'), warning: res.error, mocked: res.mocked };
  }
  let result;
  try {
    result = validateRegistryPayload(extractJson(res.text));
  } catch {
    result = { ok: false as const, errors: ['unparseable'] };
  }
  if (!result.ok || !result.value) {
    return { payload: clarify('주제망을 만들 정보가 부족해요. 주제·연령을 알려주세요.'), mocked: res.mocked };
  }
  if (result.value.type === 'TopicWeb') {
    const pr = result.value.props;
    if (!pr.id) pr.id = id('topicweb');
    if (!pr.theme) pr.theme = request;
    if (opts?.projectMode && pr.project_mode === undefined) pr.project_mode = true;
  }
  return { payload: result.value, mocked: res.mocked };
}

/** 월간 놀이계획(월안) — 실제 현장 월안 서식(기본정보·놀이선정근거·주차별 예상놀이흐름·바깥놀이·
    안전/인성교육·행사·가정연계). MonthlyPlan 페이로드로 반환. 주안·일안의 상위 컨텍스트가 된다
    (feature: monthly_plan). */
export async function runMonthlyPlan(
  request: string,
  ctx?: string,
  opts?: { ageBand?: string; className?: string; period?: string; weekCount?: number; seed?: string[]; events?: string[] },
): Promise<PlanResult> {
  const resolved = resolveAge(opts?.ageBand);
  const weekN = opts?.weekCount ?? 5;
  const seedLine = opts?.seed?.length ? `\n참고(상위 놀이·주제): ${opts.seed.join(' / ')}` : '';
  const givenClass = opts?.className?.trim() ? `\n반이름(주어진 값): "${opts.className.trim()}"` : '';
  const givenPeriod = opts?.period?.trim() ? `\n놀이기간(주어진 값): "${opts.period.trim()}"` : '';
  const givenEvents = opts?.events?.length ? `\n이 달 행사(주어진 값): ${opts.events.join(', ')}` : '';
  const user = `놀이주제: "${request}"${seedLine}${givenClass}${givenPeriod}${givenEvents}
실제 유치원·어린이집에서 쓰는 수준의 '월간 놀이계획(월안)'을 작성하라. 한 주제를 한 달간 주차별로 점점 확장하며 논다.
${buildAgeCurriculumRule(resolved)}

[기본정보(basic_info)]
- class_name: 반이름(주어진 값이 있으면 그대로, 없으면 ""). 지어내지 말 것.
- theme: 놀이주제(입력 주제).
- period: 놀이기간(주어진 값이 있으면 그대로, 없으면 ""). 예: "2026년 6월".

[놀이선정근거(rationale)]
- reason(놀이선정이유): 유아 흥미·발달 특성·계절/환경·놀이 가치·교육과정 연계를 반영해 2~3문장. 단순 주제 설명 금지.
- teacher_expectations(교사의 기대): 2~5개. 활동 설명이 아니라 유아의 배움·성장 관점으로(탐구·의사소통·사회성·표현·신체 중). 예: "주변의 다양한 색을 탐색하며 사물의 특성을 비교하고 탐구하는 태도를 기른다".
- curriculum_links(교육과정연계): 반드시 5영역(신체운동·건강 / 의사소통 / 사회관계 / 예술경험 / 자연탐구)을 모두 포함, 각 { area, category(범주), content(내용) }. 실제 교육과정에 존재하는 범주·내용만(임의 생성 금지). 생성한 놀이·교사기대를 분석해 작성.

[예상놀이흐름(weekly_flow)] — ${weekN}주(4~5주)
- 각 주: { week: "N주차", sub_theme: 소주제, play_ideas: [놀이명 4~6개] }.
- 소주제: 주차별 중복 금지, 놀이주제와 연결, 유아 흥미가 확장되게.
- play_ideas: 실제 교실에서 쓰는 구체적 '놀이명'만(설명·영역 표기·번호·추상명("활동1","놀이A") 금지).

[바깥놀이및신체활동(outdoor_play)] — 주차별 1개 이상, { week, activity }. 바깥놀이·신체놀이·대근육활동 중심, 실내 놀이와 중복 최소화.
[안전교육(safety_education)] — 놀이 안전·도구 사용 안전·생활 안전을 주제와 연결해 한 단락.
[인성교육(character_education)] — 배려·존중·협력·책임 중 하나 이상을 놀이와 연결해 한 단락.
[행사(events)] — 있으면 [{ name(행사명), connection(연계내용) }], 없으면 [].
[가정연계활동(home_connection)] — 가정 놀이 제안·부모 대화 주제·그림책 연계를 담아 한 단락.

${buildSafetyEducationRule(resolved)}

${buildOutputRule()}

JSON만 출력:
{ "type": "MonthlyPlan", "props": { "age_band": "0-2"|"3-5", "curriculum": "standard"|"nuri", "basic_info": { "class_name": string, "theme": string, "period": string }, "rationale": { "reason": string, "teacher_expectations": [string], "curriculum_links": [ { "area": string, "category": string, "content": string } ] }, "weekly_flow": [ { "week": string, "sub_theme": string, "play_ideas": [string] } ], "outdoor_play": [ { "week": string, "activity": string } ], "safety_education": string, "character_education": string, "events": [ { "name": string, "connection": string } ], "home_connection": string } }`;

  const res = await callGateway({
    task: 'plan',
    tier: 'mid',
    provider: 'auto',
    responseFormat: 'json',
    fallback: ['high'],
    system: system(ctx),
    messages: [{ role: 'user', content: user }],
    meta: { kind: 'plan', title: request, selected: opts?.seed ?? [] },
    maxTokens: 3800,
  });
  if (!res.ok || !res.text) {
    return { payload: clarify('월간계획 생성에 실패했어요.'), warning: res.error, mocked: res.mocked };
  }
  let result;
  try {
    result = validateRegistryPayload(extractJson(res.text));
  } catch {
    result = { ok: false as const, errors: ['unparseable'] };
  }
  if (!result.ok || !result.value) {
    return { payload: clarify('월간계획을 만들 정보가 부족해요. 주제·연령을 알려주세요.'), mocked: res.mocked };
  }
  if (result.value.type === 'MonthlyPlan') {
    const pr = result.value.props;
    if (!pr.id) pr.id = id('monthly');
    if (!pr.basic_info.theme.trim()) pr.basic_info.theme = request;
    if (opts?.className && !pr.basic_info.class_name.trim()) pr.basic_info.class_name = opts.className.trim();
    if (opts?.period && !pr.basic_info.period.trim()) pr.basic_info.period = opts.period.trim();
  }
  return { payload: result.value, mocked: res.mocked };
}

/** 주간 놀이계획(주안) — 월~금 운영 흐름. 요일별 flow_stage(관심·탐색→탐구→표현→협력→공유) +
    놀이아이디어(경험·영역) + 바깥놀이 + 안전/인성교육 + 행사 + 가정연계. WeeklyPlan 페이로드로
    반환. 기본 계획 생성 경로 전용(프로젝트·패키지·레인은 계속 runPlan/WeeklyPlanGrid). */
export async function runWeeklyPlan(
  request: string,
  ctx?: string,
  opts?: { ageBand?: string; subTheme?: string; weekNumber?: number; period?: string; seed?: string[]; monthlyContext?: string },
): Promise<PlanResult> {
  const resolved = resolveAge(opts?.ageBand);
  const seedLine = opts?.seed?.length ? `\n참고(상위 놀이·주제): ${opts.seed.join(' / ')}` : '';
  const monthLine = opts?.monthlyContext?.trim()
    ? `\n[상위 월안 맥락 — 이 주의 소주제·놀이 흐름을 상속]\n${opts.monthlyContext.trim().slice(0, 1200)}`
    : '';
  const subLine = opts?.subTheme?.trim() ? `\n소주제(주어진 값): "${opts.subTheme.trim()}"` : '';
  const periodLine = opts?.period?.trim() ? `\n놀이기간(주어진 값): "${opts.period.trim()}"` : '';
  const weekLine = opts?.weekNumber ? `\n몇째 주: ${opts.weekNumber}주차` : '';
  const user = `놀이주제: "${request}"${subLine}${weekLine}${periodLine}${seedLine}${monthLine}
실제 유치원·어린이집에서 쓰는 수준의 '주간 놀이계획(주안)'을 월~금 운영 흐름으로 작성하라.
${buildAgeCurriculumRule(resolved)}

[요일 흐름] daily_flow 는 월·화·수·목·금 5일. flow_stage 를 순서대로 — 월: "관심 및 탐색", 화: "탐구 및 경험", 수: "표현", 목: "협력", 금: "공유 및 확장".
- 각 요일 play_ideas 1~3개. 각 { title(놀이명), core_experience(핵심 경험 1문장, 유아가 주어), learning_area([영역 1~2개]) }. 유아·놀이 중심(교사 주도 서술 금지).
[놀이선정근거(rationale)] { summary(한 주 요약), meaning_of_this_week(이 주의 의미), connection_from_previous_play(지난 놀이와 연결), expansion_to_next_play(다음 놀이로 확장) } 각 1문장.
[교사의 기대(teacher_expectations)] 2~4개, 각 { goal(유아 배움·성장 관점 1문장), focus(탐색|표현|협력|문제해결|의사소통 중 하나) }.
[교육과정연계(curriculum_links)] 관련 영역들, 각 { area(신체운동·건강/의사소통/사회관계/예술경험/자연탐구), content(교육과정 내용), expected_experience(기대 경험) }. 임의 생성 금지.
[바깥놀이및신체활동(outdoor_and_physical_play)] 요일별 1개 이상, 각 { day, activity_name, method, safety_point }.
[안전교육(safety_education)] { weekly_safety_focus(이 주 안전 초점), teacher_guidance(교사 지원) }.
[인성교육(character_education)] { core_value(배려/존중/협력/책임 중 하나), practice_context(놀이 속 실천 맥락) }.
[행사(events)] 있으면 [{ name, date, connection }], 없으면 [].
[가정연계활동(home_connection)] { home_play(가정 놀이), conversation_topic(대화 주제), observation_point(관찰 포인트) }.

${buildSafetyEducationRule(resolved)}

${buildOutputRule()}

JSON만 출력:
{ "type": "WeeklyPlan", "props": { "age_band": "0-2"|"3-5", "curriculum": "standard"|"nuri", "basic_info": { "theme": string, "sub_theme": string, "week_number": number, "period": string }, "rationale": { "summary": string, "meaning_of_this_week": string, "connection_from_previous_play": string, "expansion_to_next_play": string }, "teacher_expectations": [ { "goal": string, "focus": string } ], "curriculum_links": [ { "area": string, "content": string, "expected_experience": string } ], "daily_flow": [ { "day": string, "date": string, "flow_stage": string, "play_ideas": [ { "title": string, "core_experience": string, "learning_area": [string] } ] } ], "outdoor_and_physical_play": [ { "day": string, "activity_name": string, "method": string, "safety_point": string } ], "safety_education": { "weekly_safety_focus": string, "teacher_guidance": string }, "character_education": { "core_value": string, "practice_context": string }, "events": [ { "name": string, "date": string, "connection": string } ], "home_connection": { "home_play": string, "conversation_topic": string, "observation_point": string } } }`;

  const res = await callGateway({
    task: 'plan',
    tier: 'mid',
    provider: 'auto',
    responseFormat: 'json',
    fallback: ['high'],
    system: system(ctx),
    messages: [{ role: 'user', content: user }],
    meta: { kind: 'plan', title: request, selected: opts?.seed ?? [] },
    maxTokens: 4000,
  });
  if (!res.ok || !res.text) {
    return { payload: clarify('주간계획 생성에 실패했어요.'), warning: res.error, mocked: res.mocked };
  }
  let result;
  try {
    result = validateRegistryPayload(extractJson(res.text));
  } catch {
    result = { ok: false as const, errors: ['unparseable'] };
  }
  if (!result.ok || !result.value) {
    return { payload: clarify('주간계획을 만들 정보가 부족해요. 주제·연령을 알려주세요.'), mocked: res.mocked };
  }
  if (result.value.type === 'WeeklyPlan') {
    const pr = result.value.props;
    if (!pr.id) pr.id = id('plan');
    if (!pr.basic_info.theme.trim()) pr.basic_info.theme = request;
    if (opts?.subTheme && !pr.basic_info.sub_theme.trim()) pr.basic_info.sub_theme = opts.subTheme.trim();
    if (opts?.period && !pr.basic_info.period.trim()) pr.basic_info.period = opts.period.trim();
  }
  return { payload: result.value, mocked: res.mocked };
}

/** 일일 놀이계획(일안) — 교사가 바로 운영하는 실행 단위 계획. 도입→전개(활동 2~4개)→마무리→
    평가→확장 + 준비물·환경·우천대체·안전·가정연계. DailyPlan 페이로드로 반환. 주안의 특정 요일을
    상세화한다(feature: daily_plan). */
export async function runDailyPlan(
  request: string,
  ctx?: string,
  opts?: { ageBand?: string; subTheme?: string; date?: string; day?: string; seed?: string[]; weeklyContext?: string },
): Promise<PlanResult> {
  const resolved = resolveAge(opts?.ageBand);
  const seedLine = opts?.seed?.length ? `\n오늘 다룰 놀이(상위 주안에서 선택): ${opts.seed.join(' / ')}` : '';
  const weekLine = opts?.weeklyContext?.trim()
    ? `\n[상위 주안 맥락 — 이 요일 놀이·흐름을 상속]\n${opts.weeklyContext.trim().slice(0, 1200)}`
    : '';
  const subLine = opts?.subTheme?.trim() ? `\n소주제(주어진 값): "${opts.subTheme.trim()}"` : '';
  const dateLine = opts?.date?.trim() ? `\n날짜(주어진 값): "${opts.date.trim()}"` : '';
  const dayLine = opts?.day?.trim() ? `\n요일(주어진 값): "${opts.day.trim()}"` : '';
  const user = `놀이주제: "${request}"${subLine}${dateLine}${dayLine}${seedLine}${weekLine}
교사가 오늘 교실에서 바로 운영할 수 있는 수준의 '일일 놀이계획(일안)'을 상세히 작성하라.
${buildAgeCurriculumRule(resolved)}

[구성 — 반드시 도입 → 전개 → 마무리 흐름]
- teacher_expectations: 2~3개, 각 { goal(유아 배움 관점 1문장), focus(탐색|표현|협력|문제해결|의사소통 중) }.
- curriculum_links: 관련 영역, 각 { area, content(교육과정 내용), expected_experience }. 임의 생성 금지.
- materials: { teacher_materials[], children_materials[] } 로 구분.
- environment_setup: { indoor_environment: { space_setup, material_arrangement }, outdoor_environment: { play_environment } }.
- introduction(도입): { interest_trigger(흥미 유발), conversation: { teacher_questions[](개방형 발문 2~3), expected_child_responses[] } }.
- development_activities(전개): 2~4개. 각 { activity_name(놀이명), activity_goal, activity_method[](2~4단계, 유아 주어), teacher_questions[], expected_child_responses[], support_strategy: { language_support, play_expansion, individual_support } }.
- closing(마무리): { experience_sharing(경험 나누기), reflection_questions[], connection_to_next_play(다음 놀이로 연결) }.
- outdoor_and_physical_play: { activity_name, method, safety_guidance }.
- rainy_day_alternative(우천 대체): { indoor_alternative_play, materials[], operation_method }.
- safety_notes: { play_safety, environment_safety, health_safety }.
- assessment(평가): { observation_points[](관찰 포인트 2~3), teacher_check_questions[] }.
- extension_activities(확장): { classroom_extension, project_extension, art_extension, role_play_extension }.
- home_connection(가정연계): { try_at_home, parent_question, recommended_picture_book, follow_up_play }.

${buildSafetyEducationRule(resolved)}

${buildOutputRule()}

JSON만 출력:
{ "type": "DailyPlan", "props": { "age_band": "0-2"|"3-5", "curriculum": "standard"|"nuri", "basic_info": { "theme": string, "sub_theme": string, "date": string, "day": string }, "teacher_expectations": [ { "goal": string, "focus": string } ], "curriculum_links": [ { "area": string, "content": string, "expected_experience": string } ], "materials": { "teacher_materials": [string], "children_materials": [string] }, "environment_setup": { "indoor_environment": { "space_setup": string, "material_arrangement": string }, "outdoor_environment": { "play_environment": string } }, "introduction": { "interest_trigger": string, "conversation": { "teacher_questions": [string], "expected_child_responses": [string] } }, "development_activities": [ { "activity_name": string, "activity_goal": string, "activity_method": [string], "teacher_questions": [string], "expected_child_responses": [string], "support_strategy": { "language_support": string, "play_expansion": string, "individual_support": string } } ], "closing": { "experience_sharing": string, "reflection_questions": [string], "connection_to_next_play": string }, "outdoor_and_physical_play": { "activity_name": string, "method": string, "safety_guidance": string }, "rainy_day_alternative": { "indoor_alternative_play": string, "materials": [string], "operation_method": string }, "safety_notes": { "play_safety": string, "environment_safety": string, "health_safety": string }, "assessment": { "observation_points": [string], "teacher_check_questions": [string] }, "extension_activities": { "classroom_extension": string, "project_extension": string, "art_extension": string, "role_play_extension": string }, "home_connection": { "try_at_home": string, "parent_question": string, "recommended_picture_book": string, "follow_up_play": string } } }`;

  const res = await callGateway({
    task: 'plan',
    tier: 'mid',
    provider: 'auto',
    responseFormat: 'json',
    fallback: ['high'],
    system: system(ctx),
    messages: [{ role: 'user', content: user }],
    meta: { kind: 'plan', title: request, selected: opts?.seed ?? [] },
    maxTokens: 4000,
  });
  if (!res.ok || !res.text) {
    return { payload: clarify('일일계획 생성에 실패했어요.'), warning: res.error, mocked: res.mocked };
  }
  let result;
  try {
    result = validateRegistryPayload(extractJson(res.text));
  } catch {
    result = { ok: false as const, errors: ['unparseable'] };
  }
  if (!result.ok || !result.value) {
    return { payload: clarify('일일계획을 만들 정보가 부족해요. 주제·연령을 알려주세요.'), mocked: res.mocked };
  }
  if (result.value.type === 'DailyPlan') {
    const pr = result.value.props;
    if (!pr.id) pr.id = id('daily');
    if (!pr.basic_info.theme.trim()) pr.basic_info.theme = request;
    if (opts?.subTheme && !pr.basic_info.sub_theme.trim()) pr.basic_info.sub_theme = opts.subTheme.trim();
    if (opts?.date && !pr.basic_info.date.trim()) pr.basic_info.date = opts.date.trim();
    if (opts?.day && !pr.basic_info.day.trim()) pr.basic_info.day = opts.day.trim();
  }
  return { payload: result.value, mocked: res.mocked };
}

export async function runPlan(
  request: string,
  selected: string[],
  ctx?: string,
  opts?: { project?: boolean; monthly?: boolean },
): Promise<PlanResult> {
  const sel = selected.length ? `선택된 활동: ${selected.join(' / ')}` : '';
  // ── 월간(월안) ── 요일이 아니라 '주차(1주~5주)'로 한 달의 놀이 흐름을 구성한다.
  //   days를 주차로 채워 WeeklyPlanGrid 로 반환(월안 편집 캔버스가 주차 흐름으로 매핑).
  const monthlyUser = `요청: "${request}"\n${sel}
실제 유치원·어린이집에서 쓰는 수준의 '월간(한 달) 놀이계획(월안)'을 작성하라. 요일별이 아니라 한 주제를 한 달간 '주차별로 점점 확장'하며 논다.
[기본 원칙]
- 놀이 중심 교육과정 기반. 교사가 바로 사용할 수 있는 수준으로, 연령에 적합하게.
- 한 달 놀이 흐름이 1→5주로 자연스럽게 이어지며 유아 흥미가 확장되게. 특정 영역·놀이 유형에 편중 금지.
- 연령 기준: 만 0~2세 → 2024 개정 표준보육과정(curriculum:"standard", age_band:"0-2"), 만 3~5세 → 2019 개정 누리과정(curriculum:"nuri", age_band:"3-5"). 요청/컨텍스트의 연령으로 판단.
[작성 규칙]
- days = '주차' 4~5개. 각 day는 "N주차" 형식(예: "1주차" … "5주차").
- area = 그 주차 소주제(놀이 흐름 제목, 8~16자). 주차별 중복 금지, 놀이주제와 연결, 흥미가 점점 확장되게(예: "바다 생명과 함께해요" → "바다를 지키는 우리").
- activity = 그 주차 '놀이아이디어' 4~6개를 쉼표로 이어 쓴다. 교실에서 실제 쓰는 '구체적 놀이명'으로, 유아가 주어(놀이 중심). 예: "상어 탈출 달리기, 물총 생물 보호, 잠수함 생물 꾸미기". "활동1·놀이A·창의 놀이"처럼 추상·번호 명칭 금지, 놀이명에 영역 표기 금지.
- goal = 그 주차 '교사의 기대'를 유아의 배움·성장 관점으로 1문장(활동 설명 아님). 탐구·의사소통·사회성·표현·신체 중 관련된 결을 담아 "~하며 ~을 경험한다/태도를 기른다" 형태. (금지: "색을 탐색한다" / 허용: "주변의 다양한 색을 탐색하며 사물의 특성을 비교하고 탐구하는 태도를 기른다")
- materials = 그 주차 주요 준비물 2~4가지.
- title = 이 달의 놀이 제목(예: "여름 바다로 풍덩!"). notes = ① 유아 흥미·놀이 흐름에 따라 융통성 있게 운영 ② 안전 유의점 1가지 ③ 가정연계 1가지.
JSON만 출력:
{ "type": "WeeklyPlanGrid", "props": { "title": string, "age_band": "0-2"|"3-5", "curriculum": "standard"|"nuri", "days": [ { "day": string, "area": string, "activity": string, "materials": string, "goal": string } ], "notes": string } }`;
  // ── 프로젝트 수업 ── 일반 주간계획과 달리 하나의 주제를 1주~한 달 '단계별'로 깊이 탐구한다
  //   (프로젝트 접근법: 준비→도입→전개→마무리). days를 요일이 아니라 '단계'로 채운다.
  const projectUser = `요청: "${request}"\n${sel}
5세의 경우, 유아 '프로젝트 접근법(Project Approach)'에 따른 프로젝트 수업 계획을 작성하라. 일반 월간 놀이계획과 다르다 — 요일별이 아니라 하나의 주제를 1주~한 달간 '단계별로 점점 깊이' 탐구한다.
[프로젝트 단계 — 반드시 이 흐름으로 days를 구성]
- 준비·도입: 주제 선정 배경, 유아의 사전 경험·흥미 표현, 교사–유아 공동 '주제망' 구성, '궁금한 것(질문거리)' 찾기.
- 전개: 질문을 탐구로 — 현장학습(견학)·산책 관찰, 전문가/부모·지역인사 면담, 자료 조사, 관찰·실험, 표상활동(그림·만들기·글·구성물로 표현), 결과 공유. (전개는 보통 2~3단계로 점점 깊어진다)
- 마무리: 작품·결과물 전시와 발표, 유아와 함께 과정 회상·평가.
[작성 규칙]
- days = '단계' 5~6개. 각 week는 "주차 · 단계명" 형식(예: "1주차 · 도입", "2주차 · 전개(현장학습)", "3주차 · 전개(표상활동)", "4주차 · 마무리(전시·평가)").
- area = 그 단계의 성격·누리과정 연계(예: "주제망·질문", "탐구·관찰", "표상·예술", "전시·평가").
- activity = 유아가 주어인 구체적 탐구·표상 활동 1~2문장(교사 주도 금지). 단계가 진행될수록 깊어지게.
- materials = 그 단계에 필요한 자원(현장·전문가·관찰도구·표상재료 등).
- goal = 기대하는 경험.
- title = "(주제) 프로젝트". notes = ① 기간은 유아 흥미·탐구 깊이에 따라 1주~한 달로 유연 ② 안전 유의점 ③ 가정·지역사회 연계.
JSON만 출력:
{ "type": "WeeklyPlanGrid", "props": { "title": string, "age_band": "0-2"|"3-5", "curriculum": "standard"|"nuri", "days": [ { "day": string, "area": string, "activity": string, "materials": string, "goal": string } ], "notes": string } }`;
  const playUser = `요청: "${request}"\n${sel}
유아 교사가 실제로 사용하는 수준의 놀이계획을 작성하라.
[2019 개정 누리과정 결 — 반드시 지킬 것]
- 유아·놀이 중심: activity는 "유아가 무엇을 하며 노는지"가 주어가 되게 쓴다(예: "비닐봉지 연을 만들어 바람 따라 달리며 날려 본다"). "교사가 ~을 가르친다/시킨다" 같은 교사 주도 서술 금지.
- goal은 도달 목표가 아니라 '기대하는 경험'으로: "~하며 ~을 경험한다 / ~에 관심을 가진다" 형태.
- days: 월~금 5일. 누리과정 영역(area)을 골고루 — 단 놀이 하나가 여러 영역을 통합적으로 경험시킴을 전제로 대표 영역 1개만 표기.
- activity: 놀이 전개가 드러나게 1문장(35~55자). 단순 명사·주제 나열 금지.
- materials: 교실에서 실제 구할 수 있는 준비물 2~4가지.
- notes: ① "유아의 흥미와 놀이 흐름에 따라 계획은 융통성 있게 변경·확장합니다" 취지의 문장 ② 이 주제 놀이의 안전 유의점 1가지 ③ (컨텍스트에 있으면) 알레르기·개별 배려.
JSON만 출력:
{ "type": "WeeklyPlanGrid", "props": { "title": string, "age_band": "0-2"|"3-5", "curriculum": "standard"|"nuri", "days": [ { "day": string, "area": string, "activity": string, "materials": string, "goal": string } ], "notes": string } }`;
  const user = opts?.project ? projectUser : opts?.monthly ? monthlyUser : playUser;

  const first = await callGateway({
    task: 'plan',
    tier: 'mid',
    provider: 'auto',
    responseFormat: 'json',
    fallback: ['high'],
    system: system(ctx),
    messages: [{ role: 'user', content: user }],
    meta: { kind: 'plan', title: request, selected },
    // 프로젝트 계획은 단계가 많고 활동 서술이 길어 토큰이 더 든다 — 잘려서 JSON 파싱이 깨지면
    // "정보부족" 폴백으로 빠지므로 넉넉히 준다.
    maxTokens: opts?.project ? 3600 : 2200,
  });

  if (!first.ok || !first.text) {
    return { payload: clarify('계획 생성에 실패했어요.'), warning: first.error, mocked: first.mocked };
  }

  let result;
  try {
    result = validateRegistryPayload(extractJson(first.text));
  } catch {
    result = { ok: false as const, errors: ['unparseable'] };
  }

  if (!result.ok || !result.value) {
    return { payload: clarify('계획안을 만들 정보가 부족해요. 주제·연령을 알려주세요.'), mocked: first.mocked };
  }

  // Stamp a plan id so a worksheet can link back (link.plan_id, SKILL §4.1).
  if (result.value.type === 'WeeklyPlanGrid' && !result.value.props.id) {
    result.value.props.id = id('plan');
  }
  return { payload: result.value, mocked: first.mocked };
}

function clarify(question: string): RegistryPayload {
  return { type: 'ClarifyPrompt', props: { question } };
}
