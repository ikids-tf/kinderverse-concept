/**
 * Resolver — 테마팩(§6). 테마 = 에셋 어휘 풀 + 식별 이름. 합성기는 레시피 슬롯을
 * (교육 내용 × 테마 vocab)으로 채운다. 실제 그림은 B 기존 `gen:` 파이프라인이 만든다(신규 0).
 *
 * 초기 4팩(인프라 스펙 동일): 크리스마스 / 할로윈 / 바다 / 여름·물놀이.
 * vocabulary = 그 테마에서 흔한 '단일 사물' 라벨 풀(번호·분류 없는 중립 명사). selectRecipe 가
 * 명사로 팩을 고르고, fillSlots 가 부족분을 이 풀에서 결정론으로 채운다(없으면 narrow LLM).
 */
export interface ThemePack {
  id: string;
  /** 프롬프트에서 이 팩을 식별하는 이름·동의어. */
  names: string[];
  /** 단일 사물 라벨 풀(gen: 라벨이 된다). */
  vocabulary: string[];
  /** 장면 배경 설명(generateSceneBackground 프롬프트) — 인물·글자 없이 가운데 비운 풀블리드 풍경. */
  scene: string;
  /** 계절 폴백 매칭용(명사 미지정 시 현재 계절 팩). */
  season?: 'spring' | 'summer' | 'autumn' | 'winter';
}

export const THEME_PACKS: ThemePack[] = [
  {
    id: 'christmas',
    names: ['크리스마스', '성탄', '산타', '겨울 파티'],
    vocabulary: ['선물 상자', '산타', '루돌프', '크리스마스 트리', '눈사람', '종', '양말', '별', '지팡이 사탕', '눈송이', '진저브레드', '촛불'],
    scene: '눈 내리는 포근한 크리스마스 마을, 반짝이는 전구와 장식, 부드러운 밤하늘',
    season: 'winter',
  },
  {
    id: 'halloween',
    names: ['할로윈', '핼러윈', '호박 파티'],
    vocabulary: ['호박', '유령', '박쥐', '거미', '사탕', '마녀 모자', '해골', '거미줄', '검은 고양이', '보름달', '빗자루', '사탕 바구니'],
    scene: '귀엽고 아기자기한 가을밤 호박밭 마을, 보름달과 노란 가로등(무섭지 않고 밝게)',
    season: 'autumn',
  },
  {
    id: 'ocean',
    names: ['바다', '해양', '바닷속', '심해', '어항'],
    vocabulary: ['물고기', '문어', '불가사리', '조개', '고래', '거북이', '해마', '게', '산호', '해파리', '소라', '돌고래'],
    scene: '햇살이 비치는 맑고 푸른 바닷속, 산호와 해초가 부드럽게 흔들리는 풍경',
    season: 'summer',
  },
  {
    id: 'summer',
    names: ['여름', '물놀이', '수영', '바캉스', '해변'],
    vocabulary: ['수박', '튜브', '파라솔', '아이스크림', '선글라스', '물안경', '비치볼', '조개', '모래성', '수영복', '음료수', '돗자리'],
    scene: '맑고 화창한 여름 해변, 파란 하늘과 잔잔한 파도, 모래사장',
    season: 'summer',
  },
];

/** 프롬프트 명사로 테마팩 매칭(이름 부분일치). 없으면 null. */
export function resolveTheme(prompt: string): ThemePack | null {
  for (const p of THEME_PACKS) {
    if (p.names.some((n) => prompt.includes(n))) return p;
  }
  return null;
}

/** 테마팩 vocab에서 n개 라벨을 결정론으로 고른다(순서대로, 모자라면 순환). */
export function pickVocab(pack: ThemePack, n: number): string[] {
  const v = pack.vocabulary;
  if (!v.length) return [];
  return Array.from({ length: n }, (_, i) => v[i % v.length]);
}
