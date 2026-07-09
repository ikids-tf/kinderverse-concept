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
    // count 에 비례해 토큰 확보 — 아이디어 20개(아이디어 리스트)는 1400으론 JSON이 잘려 파싱 실패한다.
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

export interface PlanResult {
  payload: RegistryPayload;
  mocked?: boolean;
  warning?: string;
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
유아 '프로젝트 접근법(Project Approach)'에 따른 프로젝트 수업 계획을 작성하라. 일반 주간 놀이계획과 다르다 — 요일별이 아니라 하나의 주제를 1주~한 달간 '단계별로 점점 깊이' 탐구한다.
[프로젝트 단계 — 반드시 이 흐름으로 days를 구성]
- 준비·도입: 주제 선정 배경, 유아의 사전 경험·흥미 표현, 교사–유아 공동 '주제망' 구성, '궁금한 것(질문거리)' 찾기.
- 전개: 질문을 탐구로 — 현장학습(견학)·산책 관찰, 전문가/부모·지역인사 면담, 자료 조사, 관찰·실험, 표상활동(그림·만들기·글·구성물로 표현), 결과 공유. (전개는 보통 2~3단계로 점점 깊어진다)
- 마무리: 작품·결과물 전시와 발표, 유아와 함께 과정 회상·평가.
[작성 규칙]
- days = '단계' 5~6개. 각 day는 "주차 · 단계명" 형식(예: "1주차 · 도입", "2주차 · 전개(현장학습)", "3주차 · 전개(표상활동)", "4주차 · 마무리(전시·평가)").
- area = 그 단계의 성격·누리과정 연계(예: "주제망·질문", "탐구·관찰", "표상·예술", "전시·평가").
- activity = 유아가 주어인 구체적 탐구·표상 활동 1~2문장(교사 주도 금지). 단계가 진행될수록 깊어지게.
- materials = 그 단계에 필요한 자원(현장·전문가·관찰도구·표상재료 등).
- goal = 기대하는 경험.
- title = "(주제) 프로젝트". notes = ① 기간은 유아 흥미·탐구 깊이에 따라 1주~한 달로 유연 ② 안전 유의점 ③ 가정·지역사회 연계.
JSON만 출력:
{ "type": "WeeklyPlanGrid", "props": { "title": string, "age_band": "0-2"|"3-5", "curriculum": "standard"|"nuri", "days": [ { "day": string, "area": string, "activity": string, "materials": string, "goal": string } ], "notes": string } }`;
  const playUser = `요청: "${request}"\n${sel}
유아 교사가 실제로 사용하는 수준의 주간 놀이계획을 작성하라.
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
