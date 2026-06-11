/* Offline mock router (no API key configured).
   Produces a schema-valid RouterOutput JSON string from the RouterInput using a
   keyword heuristic, so the whole M2 loop is demoable without credentials. The
   real router replaces this the moment ANTHROPIC_API_KEY / GEMINI_API_KEY is set. */

import type {
  RouterInput,
  RouterOutput,
  RouteTarget,
  SuggestedNext,
} from '../../src/ai/contract';
import type { RecordInput } from '../../src/ai/prompt-record';
import type { RegistryPayload } from '../../src/ui-registry/contracts';
// 의도 어휘는 단일 출처(intent-lexicon)를 공유 — 실라우터/보드 정규식과 동일 사전(P0-3).
import { contentIntentFast, boardOp, INTENT_TO_ROUTE, requestedCount, imageSubject } from '../../src/ai/intent-lexicon';

function suggestionsFor(route: RouteTarget): SuggestedNext[] {
  switch (route) {
    case 'plan':
      return [{ action: 'make_worksheet', label: '활동지 만들기', reason: '계획안 작성 후 자연스러운 다음 단계', confidence: 0.82 }];
    case 'record':
      return [{ action: 'family_letter', label: '가정연계 통신문', reason: '학부모 공유 맥락', confidence: 0.64 }];
    case 'studio':
      return [{ action: 'link_plan', label: '놀이계획에 연결', reason: '활동지는 계획과 묶어두면 폴더에서 함께 보임', confidence: 0.66 }];
    default:
      return [];
  }
}

export function mockRouterOutput(input: RouterInput): RouterOutput {
  const text = input.text ?? '';
  const hasSelection = input.selection.count > 0;

  // 화면 조작 지시(크게/옮겨/정렬/지워…) — 선택이 있을 때 board.* 인텐트로.
  // (이전: merge/relayout이 record로 오라우팅되던 버그 → route_to 없이 인텐트만 전달)
  if (hasSelection) {
    const op = boardOp(text);
    if (op) {
      return {
        page: input.page,
        selection: input.selection,
        available_actions: input.available_actions,
        intent: `board.${op.op}`,
        scope: 'selection',
        route_to: null,
        suggested_next: [],
        confidence: 0.86,
      };
    }
  }

  const ci = contentIntentFast(text);
  if (ci) {
    const m = INTENT_TO_ROUTE[ci];
    const out: RouterOutput = {
      page: input.page,
      selection: input.selection,
      available_actions: input.available_actions,
      intent: ci,
      scope: hasSelection ? 'selection' : 'new',
      route_to: m.route as RouteTarget,
      suggested_next: suggestionsFor(m.route as RouteTarget),
      confidence: 0.88,
    };
    if (m.mode) out.mode = m.mode;
    // Anti-hallucination: observation/eval needs grounding (SKILL §3 rule 5).
    if (m.route === 'record' && m.mode === 'observation' && !hasSelection) {
      out.confidence = 0.55;
      out.route_to = null;
      out.needs_confirmation = true;
      out.clarify = {
        question: '관찰기록은 근거가 필요해요. 어떤 사진이나 메모를 바탕으로 작성할까요?',
        options: ['사진 선택', '교사 메모 입력'],
      };
    }
    return out;
  }

  // No confident match → clarify.
  return {
    page: input.page,
    selection: input.selection,
    available_actions: input.available_actions,
    intent: 'unknown',
    scope: hasSelection ? 'selection' : 'new',
    route_to: null,
    suggested_next: [],
    confidence: 0.4,
    needs_confirmation: true,
    clarify: {
      question: '무엇을 만들어 드릴까요?',
      options: ['놀이계획', '놀이기록', '관찰기록', '문장생성', '스튜디오'],
    },
  };
}

/* ---- Record agent mock (offline) ---- */

// Heuristic: does the note carry observed content (vs. a bare request)?
function looksGrounded(notes: string[]): boolean {
  const joined = notes.join(' ').trim();
  if (joined.length < 12) return false;
  const bareRequest = /(써|만들|작성|해줘|해 줘|부탁)/.test(joined) && joined.length < 24;
  return !bareRequest;
}

export function mockRecordOutput(input: RecordInput): RegistryPayload {
  const notes = input.grounding.teacher_notes ?? [];
  const note = notes.join(' / ').trim();
  const age_band = input.age_band ?? '3-5';
  const curriculum = age_band === '0-2' ? 'standard' : 'nuri';

  if (!looksGrounded(notes)) {
    return {
      type: 'ClarifyPrompt',
      props: {
        question:
          input.mode === 'observation'
            ? '관찰기록은 근거가 필요해요. 무엇을 관찰했는지(사진/메모) 알려주세요.'
            : '놀이이야기를 쓰려면 그날 활동 내용이 필요해요. 어떤 놀이를 했는지 알려주세요.',
        options: ['관찰 메모 입력', '활동 내용 입력'],
      },
    };
  }

  if (input.mode === 'observation') {
    return {
      type: 'RecordDraftCard',
      props: {
        child_label: '관찰 대상',
        age_band,
        curriculum,
        observations: [
          { text: note, source: '교사 메모', domains: ['신체운동·건강', '자연탐구'] },
        ],
        summary: '교사 메모에 근거한 관찰 초안입니다. 발달 영역 연계를 확인하세요.',
      },
    };
  }

  return {
    type: 'PlayStoryCard',
    props: {
      title: '오늘의 놀이이야기',
      age_band,
      curriculum,
      photo_slots: [
        { caption: '활동 장면 1', placeholder: true },
        { caption: '활동 장면 2', placeholder: true },
      ],
      narrative: `오늘 아이들은 ${note} 활동에 푹 빠져 즐거운 시간을 보냈어요. 친구들과 함께 탐색하고 이야기 나누며 한 뼘 더 자랐답니다.`,
      domains: ['의사소통', '사회관계'],
      family_note: '가정에서도 오늘의 놀이를 함께 이야기 나눠보세요!',
    },
  };
}

/* ---- Workflow lane step mock (offline) ---- */

export interface LaneStepMeta {
  kind: string;
  title: string;
  selected: string[];
  /** 명시된 산출물 개수(image_captions 등) — 없으면 title에서 파싱. */
  count?: number;
}

/* 오프라인 데모용 테마별 대상 사전 — "직업 자동차 10개" 같은 다개수 요청도
   API 키 없이 그럴듯한 짧은 이름 캡션(소방차/경찰차…)으로 채운다. */
const MOCK_SUBJECTS: Array<{ re: RegExp; items: string[] }> = [
  { re: /(직업|일하는|도와주는).*(자동차|차|탈것)|(자동차|탈것).*(직업|일하)/, items: ['소방차', '경찰차', '구급차', '우편차', '청소차', '버스', '택시', '견인차', '굴착기', '트랙터', '레미콘', '사다리차'] },
  { re: /동물/, items: ['강아지', '고양이', '토끼', '코끼리', '사자', '기린', '펭귄', '곰', '다람쥐', '돌고래', '판다', '여우'] },
  { re: /과일/, items: ['사과', '바나나', '딸기', '포도', '수박', '오렌지', '복숭아', '키위', '배', '체리', '레몬', '감'] },
  { re: /꽃/, items: ['해바라기', '튤립', '장미', '민들레', '코스모스', '카네이션', '벚꽃', '나팔꽃', '수선화', '국화', '무궁화', '제비꽃'] },
];

export function mockLaneStep(meta: LaneStepMeta): string {
  const { kind, title, selected } = meta;
  const ctx = selected.length ? selected.join(', ') : title;
  switch (kind) {
    case 'idea':
      return JSON.stringify({
        items: [
          { label: '카네이션 꾸미기', desc: '색종이와 빨대로 카네이션을 만들어요.' },
          { label: '가족 사진 액자', desc: '재활용 상자로 액자를 꾸며요.' },
          { label: '고마워요 카드', desc: '가족에게 마음을 담은 카드를 써요.' },
          { label: '가족 역할 놀이', desc: '가족 구성원이 되어 역할 놀이를 해요.' },
        ],
      });
    case 'image':
      return JSON.stringify({
        slots: [
          { caption: `${ctx} — 개념 일러스트 1 (AI 생성)` },
          { caption: `${ctx} — 개념 일러스트 2 (AI 생성)` },
          { caption: `${ctx} — 개념 일러스트 3 (AI 생성)` },
        ],
      });
    case 'plan':
      return `## ${title} 주간 놀이계획\n\n- **월** · 예술경험 — ${ctx} / 준비물: 색종이, 빨대 / 목표: 소근육 발달\n- **화** · 사회관계 — 가족 역할 놀이 / 목표: 협력과 배려\n- **수** · 의사소통 — 고마워요 카드 / 목표: 마음 표현\n- **목** · 자연탐구 — 재활용 액자 / 목표: 탐색과 표현\n- **금** · 신체운동·건강 — 가족 한마당 놀이`;
    case 'worksheet':
      return `## 활동지 — ${ctx}\n\n**목표** 가족에 대한 사랑을 표현한다.\n**준비물** 색종이, 가위, 풀, 빨대\n**진행**\n1. 카네이션 모양을 따라 오린다.\n2. 빨대에 붙여 꽃을 완성한다.\n3. 가족에게 전할 한마디를 적는다.`;
    default:
      return `(${kind}) ${title}`;
  }
}

/* ---- plan/studio agent task mock (offline) — returns AUI payload JSON ---- */
export function mockAgentStep(meta: LaneStepMeta): string {
  const { kind, title, selected } = meta;
  const ctx = selected.length ? selected.join(', ') : title;
  switch (kind) {
    case 'idea':
      return JSON.stringify({
        items: [
          { label: '카네이션 꾸미기', desc: '예술경험 — 색종이·빨대로 꽃 만들기' },
          { label: '고마워요 카드', desc: '의사소통 — 마음을 담은 카드 쓰기' },
          { label: '가족 역할 놀이', desc: '사회관계 — 가족이 되어 역할 놀이' },
          { label: '재활용 액자', desc: '자연탐구 — 상자로 액자 꾸미기' },
        ],
      });
    case 'plan':
      return JSON.stringify({
        type: 'WeeklyPlanGrid',
        props: {
          title: `${title} 주간 놀이계획`,
          age_band: '3-5',
          curriculum: 'nuri',
          days: [
            { day: '월', area: '예술경험', activity: `${ctx} 꾸미기`, materials: '색종이, 빨대', goal: '소근육 발달' },
            { day: '화', area: '사회관계', activity: '가족 역할 놀이', materials: '역할 소품', goal: '협력과 배려' },
            { day: '수', area: '의사소통', activity: '고마워요 카드', materials: '카드, 색연필', goal: '마음 표현' },
            { day: '목', area: '자연탐구', activity: '재활용 액자', materials: '상자, 풀', goal: '탐색과 표현' },
            { day: '금', area: '신체운동·건강', activity: '가족 한마당', materials: '놀이 도구', goal: '신체 협응' },
          ],
          notes: '가정의 달 주제로 가족 사랑을 표현하는 한 주.',
        },
      });
    case 'worksheet':
      // 교육 내용만 생성(유형·스타일·image_prompt·cut_layout은 worksheet-reference가 채움).
      return JSON.stringify({
        type: 'WorksheetCard',
        props: {
          title: `${ctx} 활동지`,
          age_band: '3-5',
          curriculum: 'nuri',
          objective: `${ctx}을(를) 탐색하며 관찰하고 표현한다.`,
          materials: ['활동지', '색연필', '가위', '풀'],
          steps: [
            `${ctx}을(를) 자세히 살펴본다.`,
            '활동지의 안내에 따라 활동을 해 본다.',
            '완성한 결과를 친구들과 이야기 나눈다.',
          ],
          domains: ['자연탐구', '예술경험'],
        },
      });
    case 'image_captions': {
      // 개수 존중 + 캡션은 대상의 짧은 이름(요청 문장을 캡션에 쓰지 않는다).
      const n = Math.min(Math.max(meta.count ?? requestedCount(title) ?? 3, 1), 12);
      const subj = imageSubject(title);
      const themed = MOCK_SUBJECTS.find((t) => t.re.test(title))?.items;
      return JSON.stringify({
        items: Array.from({ length: n }, (_, i) => {
          const caption = themed?.[i] ?? (n > 1 ? `${subj} ${i + 1}` : subj);
          return { caption, prompt: `${caption} — 유아 그림책 개념 일러스트` };
        }),
      });
    }
    case 'letter':
    case 'notice':
    case 'text':
      return JSON.stringify({
        type: 'LetterPreview',
        props: {
          kind,
          title: `${title}`,
          body: `안녕하세요, 학부모님.\n\n${title} 관련하여 안내드립니다. 아이들이 즐겁고 안전하게 활동에 참여할 수 있도록 가정의 협조를 부탁드립니다.\n\n감사합니다.`,
          tone: 'warm',
          audience: '학부모',
        },
      });
    case 'assessment':
      return JSON.stringify({
        type: 'AssessmentReport',
        props: {
          child_label: '대상 아동',
          age_band: '3-5',
          curriculum: 'nuri',
          domains: [
            { area: '신체운동·건강', observation: '대근육 활동에 적극 참여하며 균형 감각이 발달하고 있다.', level: '발달 중' },
            { area: '의사소통', observation: '친구와 자신의 생각을 문장으로 표현한다.', level: '안정' },
          ],
          summary: '전반적으로 연령에 적합한 발달을 보이며, 또래 상호작용이 활발하다.',
        },
      });
    case 'suitability':
      return JSON.stringify({ pass: true, flags: [] });
    default:
      return JSON.stringify({ type: 'ClarifyPrompt', props: { question: '무엇을 만들까요?' } });
  }
}
