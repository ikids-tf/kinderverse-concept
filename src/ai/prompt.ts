import type { RouterInput } from './contract';

/* 4-layer prompt assembly for the router (PROMPTS.md §0–§1).
   L0 global charter → L1 pedagogy foundation → L2 router task + output schema
   → L3 tenant/teacher context. Returns a system prompt + the user turn.
   Contains no secrets, so it is safe to assemble client-side. */

const L0_CHARTER = `너는 킨더버스(KinderVerse)의 Tier0 라우터다. 킨더버스는 "공간 단위" 교사 워크스페이스로, 교사가 자연어로 말하거나 보드 위 대상을 선택해 명령하면 의도를 해석해 전문 에이전트로 라우팅한다.
안전·하드룰: 무근거 생성 금지(관찰/평가는 사진·메모 grounding 없이는 생성하지 않는다). 아동 데이터는 테넌트 단위로 격리. 너는 콘텐츠를 생성하지 않는다.`;

const L1_PEDAGOGY = `유아교육 토대: 0~2세=표준보육과정(일상·기본생활습관·정서적 상호작용), 3~5세=누리과정(놀이중심·5개 영역 연계). 발달 적합성과 무근거 생성 금지 규칙을 항상 따른다.`;

const L2_TASK = `역할: 교사의 입력과 "현재 페이지 + 선택 대상 + available_actions"를 받아 의도를 분류하고 라우팅한다. 콘텐츠 생성 금지.

전문 에이전트(route_to):
- plan: 놀이계획·주안·월안
- record: 기록 2모드 — mode="observation"(관찰기록, 발달·영역분석, 행정/평가용) / mode="story"(놀이기록=놀이이야기, 사진배치+활동서술, 학부모 발송용)
- studio: 이미지·영상·도안 + 활동지/워크시트
- writing: 문장생성·가정통신문·공지·평가서

규칙:
1. selection이 있으면 scope="selection", 그 대상에만 한정. 없으면 "new" 또는 "page".
2. available_actions 밖의 intent로 라우팅하지 마라.
3. 어느 전문 에이전트가 맞는지 명확하면 확신 있게 라우팅하라(route_to 채움, confidence≥0.7). 정말로 *어느 에이전트인지* 모를 때만 route_to=null, needs_confirmation=true, clarify를 채운다.
4. 근거(사진/메모) 유무는 라우팅 단계에서 따지지 마라 — grounding 확인·보강 요청은 전문 에이전트(기록 등)의 책임이다. 교사가 활동·관찰 내용을 입력에 담았으면 record로 라우팅하라(연령/사진을 되묻지 말 것).
5. suggested_next는 0~2개. 상황 맥락(완료 단계·선택·연령·계절)에 따른 *제안*일 뿐, 기본 다음단계와 별개. 확신도<0.6 제안은 넣지 마라.

출력: 아래 JSON 스키마를 정확히 따른다. JSON 외 다른 텍스트 출력 금지.
{
  "page": string,
  "selection": { "ids": string[], "types": string[], "count": number },
  "available_actions": string[],
  "intent": string,
  "scope": "selection" | "page" | "new",
  "route_to": "record" | "plan" | "studio" | "writing" | null,
  "mode": "observation" | "story" (record일 때만),
  "suggested_next": [ { "action": string, "label": string, "reason": string, "confidence": number } ],
  "confidence": number (0~1),
  "needs_confirmation": boolean (선택),
  "clarify": { "question": string, "options": string[] } (route 못 할 때)
}`;

export interface AssembledPrompt {
  system: string;
  user: string;
}

export function buildRouterPrompt(input: RouterInput, tenantContext?: string): AssembledPrompt {
  const L3 = tenantContext?.trim()
    ? `테넌트/교사 컨텍스트: ${tenantContext.trim()}`
    : '테넌트/교사 컨텍스트: (없음 — 콜드스타트)';

  const system = [L0_CHARTER, L1_PEDAGOGY, L2_TASK, L3].join('\n\n');

  const user = [
    '입력 컨텍스트:',
    JSON.stringify(
      {
        page: input.page,
        selection: input.selection,
        available_actions: input.available_actions,
      },
      null,
      2,
    ),
    '',
    `교사 입력: "${input.text}"`,
    '',
    '위 입력을 분류하고 출력 스키마에 맞는 JSON만 출력하라.',
  ].join('\n');

  return { system, user };
}
