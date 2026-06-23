/**
 * Resolver — 게임 추천(프롬프트바 '게임' 카테고리용). 입력에 게임 키워드가 있으면 테마(명사)를
 * 뽑아 메커니즘별 '추천 게임' 카드를 만든다. 클릭 시 startInteractiveGame → Resolver 즉시 합성.
 *
 * 보관함 이미지·웹링크 추천처럼 '키워드 매칭'으로 바 위에 뜬다(PromptBar). 결정론(LLM 콜 없음).
 */
export const GAME_KEYWORD_RE = /게임|놀이|인터렉티브|인터랙티브|액티비티|퀴즈/;
export const hasGameKeyword = (text: string): boolean => GAME_KEYWORD_RE.test(text || '');

/** 추천에 노출할 메커니즘(동사 + 이모지). 동사가 Resolver selectRecipe 매핑 키와 일치한다. */
const MECHS: Array<{ emoji: string; verb: string }> = [
  { emoji: '🗑️', verb: '분류하기' },
  { emoji: '🔢', verb: '순서 세기' },
  { emoji: '🧩', verb: '짝 맞추기' },
  { emoji: '🔍', verb: '찾기' },
  { emoji: '🃏', verb: '카드 뒤집기' },
  { emoji: '🛤️', verb: '길 찾기' },
  { emoji: '🎨', verb: '꾸미기' },
  { emoji: '✨', verb: '합치기' },
  { emoji: '🤔', verb: '골라보기' },
  { emoji: '⬜', verb: '빈칸 채우기' },
];

export interface GameSuggestion {
  key: string;
  emoji: string;
  label: string;
  /** 클릭 시 startInteractiveGame 에 넘길 프롬프트(동사 포함 → selectRecipe 가 메커니즘 결정). */
  prompt: string;
}

/** 입력에서 테마(명사)만 추린다 — 게임 키워드·동사·기능어 제거. 없으면 ''. */
function themeOf(query: string): string {
  const s = (query || '')
    .replace(GAME_KEYWORD_RE, ' ')
    .replace(
      /분류|나누기|나눠|모으기|모아|담기|순서대로|순서|세기|세어|차례|짝짓기|짝|맞추기|맞히기|연결|이어|찾기|찾아|고르기|골라|뒤집기|기억|길\s*찾기|경로|데려가|미로|꾸미기|색칠|그리기|합치|합쳐|섞|변신|빈칸|완성|채우기|만들어줘|만들어|만들|구성|생성|새로|해줘|주세요|줘/g,
      ' ',
    )
    .replace(/만?\s*[345]\s*세?/g, ' ')
    .replace(/\d+\s*(개|마리|장|송이|조각|칸|가지)?/g, ' ')
    .replace(/[을를이가은는에으로와과의로]\s/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const first = s.split(' ').filter(Boolean)[0];
  return first && first.length >= 1 ? first : '';
}

/** 게임 추천 카드(메커니즘 × 테마). 테마 있으면 '바다 분류하기'처럼, 없으면 동사만. */
export function gameSuggestions(query: string): GameSuggestion[] {
  const theme = themeOf(query);
  return MECHS.map((m) => {
    const label = theme ? `${theme} ${m.verb}` : m.verb;
    return { key: m.verb, emoji: m.emoji, label, prompt: `${label} 게임` };
  });
}
