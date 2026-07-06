/**
 * Resolver — 의도 파싱(§5 동사→메커니즘 + 명사/개수/연령 추출). 구조 결정의 '키'는 동사다.
 * 명사=테마, 영역=카테고리. 매칭 실패(롱테일)면 null → 호출부가 composeInteractiveNode 폴백.
 */
import type { MechanismId } from './recipeTypes';

export interface IntentParse {
  mechanism: MechanismId;
  /** 명사(테마/대상) — 테마팩 매칭·라벨 폴백. */
  themeNoun: string;
  /** 항목 수(연령 난이도 반영). */
  count: number;
  /** 만3~5(있으면). */
  age?: 3 | 4 | 5;
}

/** §5 동사 → 메커니즘. 위에서부터 첫 매칭(구체적 동사 먼저). */
const VERB_MAP: Array<{ re: RegExp; mech: MechanismId }> = [
  // 옷입히기(날씨) — 가장 구체적이라 맨 앞. '꾸미기'보다 우선.
  { re: /옷\s*입히|옷\s*입혀|옷\s*입는|옷차림|입을까|챙길까|(뭐|뭘|무엇을)\s*(입|챙)|날씨.*(옷|입|챙)|(눈|비|미세먼지|황사|겨울|추운|더운)\s*날.*(입|챙|옷)/, mech: 'dress-up' },
  // 그림자 찾기 — '선/줄로 연결·이어·잇'을 명시하면 짝 잇기(pair-match), 그 외엔 한 문제씩 푸는 그림자 퀴즈(기본).
  { re: /그림자.*(선|줄)|(선|줄)로?\s*(연결|이어|잇)|그림자.*(연결|이어|잇기)/, mech: 'pair-match' },
  { re: /그림자/, mech: 'shadow-quiz' },
  { re: /분류|나누기|나눠|나누어|모으기|모아|담기|골라\s*담/, mech: 'sort-to-bin' },
  { re: /빈칸|완성|채우기|채워|끼우기|끼워/, mech: 'slot-fill' },
  { re: /순서|차례|순서대로|세기|세어|세는|개수|숫자\s*세/, mech: 'sequence-order' },
  { re: /기억|뒤집기|뒤집어|카드\s*뒤/, mech: 'memory-flip' },
  { re: /꾸미기|꾸며|색칠|그리기|디자인|만들기\s*놀이/, mech: 'free-create' },
  { re: /짝|짝짓기|연결|이어|매칭|어울리는/, mech: 'pair-match' },
  { re: /결합|합치|합쳐|섞|변신|만들어지/, mech: 'combine' },
  { re: /길\s*찾|경로|데려가|데려다|미로|따라가/, mech: 'path-trace' },
  { re: /상황|표현|어떻게\s*할까|골라볼까/, mech: 'branch-choose' },
  { re: /맞히기|맞혀|찾기|찾아|고르기|고르세|골라/, mech: 'tap-select' },
];

/** 개수 추출 — '5개'·'다섯'·아라비아 숫자. 없으면 0. */
function extractCount(prompt: string): number {
  const m = prompt.match(/(\d+)\s*(개|마리|장|송이|조각|칸|번)?/);
  if (m) return parseInt(m[1], 10);
  const KO: Record<string, number> = { 한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10 };
  for (const [k, v] of Object.entries(KO)) if (new RegExp(`${k}\\s*(개|마리|장|송이|조각|칸|가지)`).test(prompt)) return v;
  return 0;
}

/** 연령 추출 — '만3'/'만 5'/'3세'/'5세'만(맨 숫자 '5개'는 연령 아님). */
function extractAge(prompt: string): 3 | 4 | 5 | undefined {
  const m = prompt.match(/만\s*([345])\b/) ?? prompt.match(/([345])\s*세/);
  if (m) return Number(m[1]) as 3 | 4 | 5;
  return undefined;
}

/** 연령 → 기본 난이도(항목 수): 만3 3~4 / 만4 5~8 / 만5 8~12. 개수 지정 시 그 값(범위 클램프). */
function difficulty(age: 3 | 4 | 5 | undefined, requested: number): number {
  const RANGE: Record<3 | 4 | 5, [number, number, number]> = { 3: [3, 4, 4], 4: [5, 8, 6], 5: [8, 12, 9] };
  if (age) {
    const [lo, hi, def] = RANGE[age];
    return requested ? Math.max(lo, Math.min(hi, requested)) : def;
  }
  return requested ? Math.max(2, Math.min(12, requested)) : 5;
}

/** 명사(대상) 추출 — 동사·기능어·수량어를 걷어내고 남는 핵심어. 없으면 '사물'. */
function extractNoun(prompt: string): string {
  const s = prompt
    .replace(/게임|놀이|액티비티|활동|퀴즈|미션|만들어줘|만들어|만들|구성|생성|새로|처음|짜줘|짜|해줘|주세요|줘/g, ' ')
    .replace(/분류|나누기|나눠|모으기|모아|담기|빈칸|완성|채우기|순서대로|순서|차례|세기|세어|숫자|기억|뒤집기|꾸미기|색칠|그리기|짝짓기|짝|연결|이어|매칭|결합|합치|변신|길\s*찾기|경로|데려가|미로|맞히기|찾기|찾아|고르기|골라/g, ' ')
    .replace(/만?\s*[345]\s*세?/g, ' ')
    .replace(/\d+\s*(개|마리|장|송이|조각|칸|번|가지)?/g, ' ')
    .replace(/[을를이가은는에으로와과의로]\s/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const first = s.split(' ').filter(Boolean)[0];
  return first && first.length >= 1 ? first : '사물';
}

/** 프롬프트 → 의도 파싱. 메커니즘 매칭 실패면 null(롱테일 → 폴백). */
export function selectRecipe(prompt: string): IntentParse | null {
  const hit = VERB_MAP.find((v) => v.re.test(prompt));
  if (!hit) return null;
  const age = extractAge(prompt);
  return {
    mechanism: hit.mech,
    themeNoun: extractNoun(prompt),
    count: difficulty(age, extractCount(prompt)),
    age,
  };
}
