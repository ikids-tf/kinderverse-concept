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
  label: string;
  desc: string;
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
): Promise<MindActivity[]> {
  const ground = grounding?.trim()
    ? `\n[참고 문서 — 아래 내용을 적극 반영해 활동을 뽑아라]\n${grounding.trim().slice(0, 1400)}\n`
    : '';
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
이 주제로 유아(만 3~5세)가 교실·바깥에서 바로 할 수 있는 '놀이 중심' 활동 ${count}개를 마인드맵 가지로 제안하라.
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

function system(ctx?: string): string {
  const l0 = '너는 킨더버스 Tier1 계획 에이전트다. 유아 놀이계획을 만든다. 적합성은 공유 Pedagogy Foundation이 보장한다.';
  const l3 = ctx?.trim() ? `[테넌트/교사 컨텍스트 — 우리반]\n${ctx.trim()}\n아동명은 마스킹 상태. 사실을 지어내지 마라.` : '';
  return [l0, PEDAGOGY_FOUNDATION, l3].filter(Boolean).join('\n\n');
}

export async function runPlanIdeas(request: string, ctx?: string, count = 4): Promise<IdeaItem[]> {
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
        content: `요청: "${request}"\n이 주제로 서로 겹치지 않는 유아 놀이 활동 아이디어 ${count}개를 제안하라. label은 활동 이름(10자 내외), desc는 놀이 방법·전개가 드러나는 1~2문장(50~80자)으로 구체적으로 쓰고 끝에 연계 누리 영역을 괄호로 표기. 단순 명사 나열 금지. JSON만:\n{ "items": [ { "label": string, "desc": string } ] }`,
      },
    ],
    meta: { kind: 'idea', title: request, selected: [] },
    maxTokens: 1400,
  });
  if (!res.ok || !res.text) return [];
  try {
    const parsed = extractJson(res.text) as { items?: Array<{ label: string; desc?: string }> };
    return (parsed.items ?? []).map((it) => ({ id: id('idea'), label: it.label, desc: it.desc ?? '' }));
  } catch {
    return [];
  }
}

export interface PlanResult {
  payload: RegistryPayload;
  mocked?: boolean;
  warning?: string;
}

export async function runPlan(request: string, selected: string[], ctx?: string): Promise<PlanResult> {
  const sel = selected.length ? `선택된 활동: ${selected.join(' / ')}` : '';
  const user = `요청: "${request}"\n${sel}\n유아 교사가 실제로 사용하는 수준의 주간 놀이계획을 작성하라.\n- days: 월~금 5일. 누리과정 영역(area)을 요일별로 골고루 배분.\n- activity: 놀이의 전개가 드러나게 구체적으로(1문장, 35~55자). 단순 명사·주제 나열 금지.\n- goal: 발달·학습 목표를 명확한 문장으로(예: "~을 통해 ~을 기른다").\n- materials: 실제 준비물 2~4가지를 구체적으로.\n- notes: 안전·유의점과 개별 배려(알레르기·결석 등 컨텍스트가 있으면 반영)를 1~2문장.\nJSON만 출력:\n{ "type": "WeeklyPlanGrid", "props": { "title": string, "age_band": "0-2"|"3-5", "curriculum": "standard"|"nuri", "days": [ { "day": string, "area": string, "activity": string, "materials": string, "goal": string } ], "notes": string } }`;

  const first = await callGateway({
    task: 'plan',
    tier: 'mid',
    provider: 'auto',
    responseFormat: 'json',
    fallback: ['high'],
    system: system(ctx),
    messages: [{ role: 'user', content: user }],
    meta: { kind: 'plan', title: request, selected },
    maxTokens: 2200,
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
