/**
 * 문서 편집 — 추천 키워드(순수 함수, AI 호출 없음 — 즉시 렌더).
 *
 * 좌패널 '기본 정보'의 키워드 입력창 아래 추천 칩을 만든다. 3개 소스 우선순위 합성:
 *  1) 문서 유래 — payload.title·days[].area·activity 에서 핵심 단어(교사가 이미 쓰는 말).
 *  2) 계절·시기 — 현재 월 → 유아교육 월별 주제(정적 맵).
 *  3) 교육과정 영역 갭 — 선택된 교육과정의 영역 중 문서에 아직 없는 영역(보강 유도).
 * 선택된 키워드는 node.data.docKeywords(string[])에 저장 — payload 계약(contracts.ts)은
 * 화이트리스트 검증이라 건드리지 않는다(AI 수정 맥락 전용 값, 문서 인쇄물에는 미출력).
 */
import type { WeeklyPlanGridProps } from '@/ui-registry/contracts';

/** 누리과정(3–5세) 5개 영역. */
const NURI_AREAS = ['신체운동·건강', '의사소통', '사회관계', '예술경험', '자연탐구'];
/** 표준보육과정(0–2세) 6개 영역. */
const STANDARD_AREAS = ['기본생활', '신체운동', '의사소통', '사회관계', '예술경험', '자연탐구'];

/** 월별 유아교육 생활주제(누리·표준 현장에서 그 달에 실제로 다루는 주제·행사·계절).
    앞쪽일수록 그 달 대표 주제 — 추천은 앞에서부터 채운다. */
const MONTH_TOPICS: Record<number, string[]> = {
  1: ['겨울', '눈', '얼음', '새해', '동물의 겨울나기', '건강', '따뜻한 옷', '눈사람', '썰매'],
  2: ['겨울', '졸업', '형님 반', '한 해 돌아보기', '봄 맞이', '친구', '고마움', '새 학년 준비'],
  3: ['새 학기', '유치원', '우리 반', '친구', '봄', '나', '규칙', '적응', '자기 소개'],
  4: ['봄', '꽃', '씨앗', '식물', '나들이', '나무', '자연', '봄비', '새싹', '나비'],
  5: ['가족', '어버이날', '어린이날', '이웃', '우리 동네', '직업', '감사', '고마움', '동물'],
  6: ['여름', '건강', '곤충', '개구리', '비', '날씨', '치아', '식물 기르기', '개미'],
  7: ['여름', '물놀이', '물', '바다', '안전', '그림자', '얼음', '수박', '모래놀이', '햇빛'],
  8: ['여름방학', '바다', '휴가', '곤충', '별', '물', '더위', '캠핑', '여행'],
  9: ['가을', '추석', '우리나라', '전통', '곡식', '열매', '명절', '한복', '송편', '보름달'],
  10: ['가을', '낙엽', '단풍', '열매', '운동회', '동물', '세계 여러 나라', '허수아비', '고구마'],
  11: ['가을', '겨울', '김장', '나무', '우리 몸', '감각', '이웃', '낙엽', '따뜻함', '건강'],
  12: ['겨울', '눈', '크리스마스', '나눔', '성탄', '한 해 마무리', '산타', '선물', '눈사람'],
};

/** 추천에서 뺄 범용어 — 유아교육 문서에 항상 나오는 말(주제성이 없다). */
const STOP_WORDS = new Set([
  '유아', '아이', '아이들', '유아들', '교사', '함께', '활동', '놀이', '경험', '탐구',
  '통해', '대한', '위한', '다양한', '스스로', '서로', '자신', '과정', '내용', '시간',
]);

/** 단어 후보 정제 — 2자 이상, 조사/서술어투 꼬리 제거 + 범용어 배제(간단 휴리스틱). */
function cleanWord(w: string): string | null {
  let t = w.replace(/[^가-힣a-zA-Z0-9]/g, '');
  // 조사 꼬리 제거(들이/들/이/가/을/를/은/는/에/의/와/과/로) — 3자 이상일 때만(원형 보존).
  if (t.length >= 3) t = t.replace(/(들이|들을|들은|들의|들|이|가|을|를|은|는|에|의|와|과|로)$/, '');
  if (t.length < 2 || t.length > 8) return null;
  if (/(하기|해요|합니다|있는|없는|것을|으로|에서|까지|부터)$/.test(t)) return null;
  if (STOP_WORDS.has(t)) return null;
  return t;
}

/**
 * 추천 키워드 상위 max개. selected(이미 추가된 것)는 제외.
 * month 는 테스트 주입용(기본 = 현재 월).
 */
export function suggestPlanKeywords(
  payload: WeeklyPlanGridProps | undefined,
  selected: string[],
  max = 10,
  month = new Date().getMonth() + 1,
): string[] {
  const seen = new Set(selected.map((s) => s.trim()));
  const out: string[] = [];
  const push = (w: string | null) => {
    if (!w || seen.has(w) || out.includes(w)) return;
    out.push(w);
  };

  // 1) 문서 주제(제목) — 이 계획의 핵심어 1~2개(가장 이 문서다운 말).
  if (payload) {
    payload.title.split(/[\s·,]+/).forEach((w) => push(cleanWord(w.replace(/프로젝트|놀이계획|계획/g, ''))));
  }

  // 2) 해당 월 유아교육 도메인 주제 — 추천의 중심(사용자 요청: 그 달에 할 만한 키워드).
  (MONTH_TOPICS[month] ?? []).forEach((w) => push(w));

  // 3) 문서 활동 빈출 단어(2회 이상) — 남는 자리를 문서 맥락으로 보충.
  if (payload) {
    const freq = new Map<string, number>();
    for (const d of payload.days) {
      for (const w of (d.activity ?? '').split(/[\s·,]+/)) {
        const c = cleanWord(w);
        if (c) freq.set(c, (freq.get(c) ?? 0) + 1);
      }
    }
    [...freq.entries()]
      .filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .forEach(([w]) => push(w));

    // 4) 교육과정 영역 갭 — 문서 영역에 아직 없는 영역(문자열 포함 매칭).
    const areas = payload.curriculum === 'standard' ? STANDARD_AREAS : NURI_AREAS;
    const used = payload.days.map((d) => d.area ?? '').join(' ');
    areas.filter((a) => !used.includes(a.replace('·', '')) && !used.includes(a)).slice(0, 2).forEach((a) => push(a));
  }

  return out.slice(0, max);
}
