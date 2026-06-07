import type { RouteTarget } from '@/ai/contract';

/* Eval golden sets (PRD §9, KPI §14). Used by the eval harness to measure
   routing accuracy (≥90% target) and to regression-test output contracts. */

export interface RoutingCase {
  text: string;
  expect: RouteTarget;
  note?: string;
}

/* 라우팅 골든셋 — 교사 입력 → 기대 전문 에이전트. 충분히 구체적이라 확신 라우팅. */
export const ROUTING_GOLDEN: RoutingCase[] = [
  { text: '이번 주 만 4세 봄 주제 주간 놀이계획 짜줘', expect: 'plan' },
  { text: '5월 가정의 달 놀이 활동 계획안 만들어줘', expect: 'plan' },
  { text: '오늘 블록놀이 사진으로 놀이이야기 써줘. 친구와 협력했어요', expect: 'record', note: 'story' },
  { text: '지호 블록놀이 관찰기록 작성해줘. 탑을 쌓고 다시 시도했어요', expect: 'record', note: 'observation' },
  { text: '봄 소풍 가정통신문 초안 써줘', expect: 'writing' },
  { text: '여름 물놀이 안전 공지문 작성해줘', expect: 'writing' },
  { text: '만 4세 지호 발달평가서 초안 써줘', expect: 'writing' },
  { text: '봄꽃 색칠 도안 A4로 만들어줘', expect: 'studio' },
  { text: '카네이션 만들기 활동지 만들어줘', expect: 'studio' },
  { text: '가을 나뭇잎 콜라주 활동 이미지 생성해줘', expect: 'studio' },
];

/* 출력 계약 회귀 픽스처 — validateRegistryPayload가 좋은 payload는 통과,
   나쁜 payload(특히 무근거 관찰)는 거부해야 함(안티-환각 회귀). */
export interface ContractCase {
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any;
  expectValid: boolean;
}

export const CONTRACT_GOLDEN: ContractCase[] = [
  {
    name: 'RecordDraftCard — 근거 있는 관찰(통과)',
    expectValid: true,
    payload: {
      type: 'RecordDraftCard',
      props: {
        child_label: '관찰 대상',
        age_band: '3-5',
        observations: [{ text: '블록으로 탑을 쌓았다.', source: '교사 메모', domains: ['자연탐구'] }],
      },
    },
  },
  {
    name: 'RecordDraftCard — 무근거 관찰(거부: 안티-환각)',
    expectValid: false,
    payload: {
      type: 'RecordDraftCard',
      props: {
        child_label: '관찰 대상',
        age_band: '3-5',
        observations: [{ text: '창의적이다.', source: '', domains: [] }],
      },
    },
  },
  {
    name: 'WeeklyPlanGrid — 정상(통과)',
    expectValid: true,
    payload: {
      type: 'WeeklyPlanGrid',
      props: {
        title: '주간 계획',
        age_band: '3-5',
        days: [{ day: '월', area: '예술경험', activity: '카네이션 꾸미기' }],
      },
    },
  },
  {
    name: 'WeeklyPlanGrid — 빈 days(거부)',
    expectValid: false,
    payload: { type: 'WeeklyPlanGrid', props: { title: 'x', age_band: '3-5', days: [] } },
  },
  {
    name: 'WorksheetCard — 정상(통과)',
    expectValid: true,
    payload: {
      type: 'WorksheetCard',
      props: { title: '활동지', age_band: '3-5', objective: '표현한다', materials: ['색종이'], steps: ['오린다'] },
    },
  },
  {
    name: 'WorksheetCard — steps 없음(거부)',
    expectValid: false,
    payload: { type: 'WorksheetCard', props: { title: 'x', age_band: '3-5', objective: 'y', materials: [], steps: [] } },
  },
  {
    name: 'LetterPreview — 정상(통과)',
    expectValid: true,
    payload: { type: 'LetterPreview', props: { kind: 'letter', title: '통신문', body: '안녕하세요.', tone: 'warm' } },
  },
  {
    name: 'LetterPreview — body 없음(거부)',
    expectValid: false,
    payload: { type: 'LetterPreview', props: { kind: 'letter', title: 'x', body: '', tone: 'warm' } },
  },
  {
    name: 'AssessmentReport — 정상(통과)',
    expectValid: true,
    payload: {
      type: 'AssessmentReport',
      props: {
        child_label: '대상 아동',
        age_band: '3-5',
        domains: [{ area: '의사소통', observation: '문장으로 표현한다.' }],
        summary: '연령에 적합한 발달.',
        suitability: { checked: true, pass: true, flags: [] },
      },
    },
  },
  {
    name: '알 수 없는 type(거부)',
    expectValid: false,
    payload: { type: 'FooCard', props: {} },
  },
];
