/* DEV 전용 — 의도 인식 골든셋 + 평가 도구 (INTENT_DIAGNOSIS P3-9).
   main.tsx가 DEV에서만 동적 import. 콘솔에서:
     __kvIntentEval()        // 사전(fast-path) + 보드op 채점 — 모델 호출 없음, 무료
     __kvIntentEval(true)    // 라우터(실모델)도 채점 — API 비용 발생 주의
   사전/프롬프트를 수정하면 이 평가로 회귀를 즉시 확인한다.
   케이스 추가: 실패 사례를 GOLDEN에 그대로 추가(현장 어휘 변형 환영). */

import { contentIntentFast, boardOp, type ContentIntent } from '@/ai/intent-lexicon';
import { runRouter } from '@/ai/agents/router';

type Expect = ContentIntent | `board.${string}` | null; // null = 사전 미스가 정답(라우터 몫)

interface GoldenCase {
  text: string;
  expect: Expect;
  /** 선택이 있다고 가정하는 케이스(보드 조작 등). */
  sel?: boolean;
  note?: string;
}

export const GOLDEN: GoldenCase[] = [
  // ── 활동지 (사용자 보고 실패 사례 + 변형) ──────────────────────────────
  { text: '활동지 만들어줘', expect: 'worksheet' },
  { text: '가을 나뭇잎 활동지', expect: 'worksheet' },
  { text: '공룡 선잇기 만들어줘', expect: 'worksheet' },
  { text: '점잇기 한 장 뽑아줘', expect: 'worksheet' },
  { text: '미로찾기 종이 만들어줘', expect: 'worksheet' },
  { text: '같은 그림 찾기 자료', expect: 'worksheet' },
  { text: '짝맞추기 놀이지', expect: 'worksheet' },
  { text: '오리고 붙이는 활동 자료 만들어줘', expect: 'worksheet' },
  { text: '따라 쓰기 학습지', expect: 'worksheet' },
  { text: '숫자 세기 워크시트', expect: 'worksheet' },
  // ── 도안/색칠 ───────────────────────────────────────────────────────────
  { text: '공룡 색칠 도안 뽑아줘', expect: 'coloring' },
  { text: '카네이션 색칠공부', expect: 'coloring' },
  // ── 이미지/교실 시각물 ──────────────────────────────────────────────────
  { text: '교실 환경판에 붙일 가을 나무 그림', expect: 'image' },
  { text: '융판 동화 자료 그림', expect: 'image' },
  { text: '아이들 이름표 만들어줘', expect: 'image' },
  { text: '생일 왕관 도안... 아니 왕관 그림', expect: 'coloring', note: '도안 단어 포함 — coloring 우선 허용' },
  { text: '운동회 메달 만들어줘', expect: 'image' },
  { text: '졸업식 상장 디자인', expect: 'image' },
  { text: '겨울 배경 일러스트', expect: 'image' },
  { text: '토끼 캐릭터 그려줘', expect: 'image' },
  // ── 계획 ────────────────────────────────────────────────────────────────
  { text: '다음 주 놀이계획 짜줘', expect: 'plan' },
  { text: '주안 작성해줘', expect: 'plan' },
  { text: '비 오는 날 실내에서 뭐 할만한 거 있어?', expect: 'plan' },
  { text: '가을 주제 활동 추천해줘', expect: 'plan' },
  // ── 글 문서(writing) ───────────────────────────────────────────────────
  { text: '현장학습 동의서 써줘', expect: 'letter' },
  { text: '내일 알림장 내용 써줘', expect: 'letter' },
  { text: '가정통신문 만들어줘', expect: 'letter' },
  { text: '학부모 주간안내 작성', expect: 'letter' },
  { text: '우리반 명렬표 만들어줘', expect: 'letter' },
  { text: '가을 동시 지어줘', expect: 'letter' },
  { text: '손유희 가사 추천해줘', expect: 'letter' },
  // ── 기록 ────────────────────────────────────────────────────────────────
  { text: '오늘 놀이기록 정리해줘', expect: 'record_story' },
  { text: '블록놀이 관찰기록 써줘', expect: 'record_observation' },
  { text: '민준이 발달 평가 정리', expect: 'record_observation' },
  // ── 마인드맵 ────────────────────────────────────────────────────────────
  { text: '가을 주제망 그려줘', expect: 'mindmap' },
  { text: '공룡 생각그물 만들어줘', expect: 'mindmap' },
  { text: '놀이 확장맵 펼쳐줘', expect: 'mindmap' },
  // ── 화면 조작(선택 가정) ────────────────────────────────────────────────
  { text: '이거 더 크게 해줘', expect: 'board.resize_up', sel: true },
  { text: '좀 작게 줄여줘', expect: 'board.resize_down', sel: true },
  { text: '왼쪽으로 옮겨줘', expect: 'board.move', sel: true },
  { text: '나란히 정렬해줘', expect: 'board.align', sel: true },
  { text: '보기 좋게 정리해줘', expect: 'board.arrange', sel: true },
  { text: '이거 지워줘', expect: 'board.delete', sel: true },
  { text: '하나 더 복사해줘', expect: 'board.duplicate', sel: true },
  { text: '노란색으로 바꿔줘', expect: 'board.recolor', sel: true },
  { text: '이 카드들 묶어줘', expect: 'board.group', sel: true },
  // ── 사전 미스가 정답(모델 몫) — 스타일/모호 지시 ──────────────────────
  { text: '겨울 느낌으로 해줘', expect: null, note: '스타일 수정 — 제자리 적용' },
  { text: '더 따뜻한 톤으로', expect: null },
  { text: '내용을 더 짧게', expect: null },
];

interface EvalRow {
  text: string;
  expect: string;
  got: string;
  pass: boolean;
}

function evalFast(): { rows: EvalRow[]; acc: number } {
  const rows: EvalRow[] = GOLDEN.map((c) => {
    const op = c.sel ? boardOp(c.text) : null;
    const ci = contentIntentFast(c.text);
    const got = op ? `board.${op.op}` : (ci ?? 'null');
    // 생성 동사 가드(prompt.ts와 동일)를 반영: 조작 기대 케이스만 op 우선.
    const effective = c.expect?.startsWith('board.') ? got : (ci ?? (op ? `board.${op.op}` : 'null'));
    const pass = effective === (c.expect ?? 'null');
    return { text: c.text, expect: String(c.expect), got: effective, pass };
  });
  const acc = rows.filter((r) => r.pass).length / rows.length;
  return { rows, acc };
}

async function evalRouter(): Promise<{ rows: EvalRow[]; acc: number }> {
  const rows: EvalRow[] = [];
  for (const c of GOLDEN) {
    const res = await runRouter({
      text: c.text,
      page: '/board',
      selection: c.sel
        ? { ids: ['x'], types: ['image'], count: 1 }
        : { ids: [], types: [], count: 0 },
      available_actions: [],
    });
    const got = res.output.intent || String(res.output.route_to);
    // 라우터는 intent 어휘 또는 route_to로 채점(둘 중 하나가 기대와 호환이면 통과).
    const exp = c.expect ?? 'null';
    const routeOk =
      (exp === 'worksheet' || exp === 'coloring' || exp === 'image') ? res.output.route_to === 'studio'
      : exp === 'plan' ? res.output.route_to === 'plan'
      : exp === 'letter' ? res.output.route_to === 'writing'
      : exp.startsWith('record') ? res.output.route_to === 'record'
      : exp === 'mindmap' ? res.output.route_to === 'mindmap'
      : true;
    const pass = got === exp || routeOk;
    rows.push({ text: c.text, expect: exp, got: `${got} (${res.output.route_to})`, pass });
  }
  const acc = rows.filter((r) => r.pass).length / rows.length;
  return { rows, acc };
}

async function intentEval(withRouter = false): Promise<void> {
  const fast = evalFast();
  // eslint-disable-next-line no-console
  console.info(`[intent] 사전(fast-path) 정확도: ${(fast.acc * 100).toFixed(0)}% (${GOLDEN.length}건)`);
  // eslint-disable-next-line no-console
  console.table(fast.rows.filter((r) => !r.pass));
  if (withRouter) {
    // eslint-disable-next-line no-console
    console.info('[intent] 라우터(실모델) 평가 중 — API 비용 발생…');
    const r = await evalRouter();
    // eslint-disable-next-line no-console
    console.info(`[intent] 라우터 정확도: ${(r.acc * 100).toFixed(0)}%`);
    // eslint-disable-next-line no-console
    console.table(r.rows.filter((x) => !x.pass));
  }
}

declare global {
  interface Window {
    __kvIntentEval?: (withRouter?: boolean) => Promise<void>;
  }
}
window.__kvIntentEval = intentEval;
// eslint-disable-next-line no-console
console.info('[intent] golden set ready — __kvIntentEval() / __kvIntentEval(true)');

export {};
