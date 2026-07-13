/* worksheet-reference.ts — 활동지 추천 레퍼런스 (단일 출처)
   docs/worksheet_match_reference.md(v1.2)의 머신 리더블 미러.
   agent.worksheet(studio)의 추천 로직(주제→유형→스타일)·프롬프트 조립이 참조한다.
   ※ 데이터는 여기 한 곳에만. 프롬프트 본문/에이전트에 하드코딩 금지(CLAUDE §2, PROMPTS §4).

   ★ 활동지 = 교사가 인쇄해 아이들과 오리거나 그려서 활동하는 "한 장의 종이" 그 자체.
     따라서 image_prompt는 삽화 한 컷이 아니라 "완성된 인쇄용 A4 활동지 한 장"
     (제목 + 안내문 + 활동 영역 + 오리기 칸/절취선 + 캐릭터)을 통째로 묘사한다. */

export type AgeBand = '0-2' | '3-5';
/** 세분 연령(만 나이) — 난이도(3/4/5세) 조절·헤더 표시용. contracts.AgeYears 와 값 일치. */
export type AgeYears = '0-1' | '2' | '3' | '4' | '5';
export type StyleCode = 'watercolor' | 'round_character' | 'pastel' | 'black_and_white';
export type SelectedBy = 'user' | 'recommended';
export type WorksheetMode = 'instant' | 'guided';
export type Difficulty = 'basic' | 'standard' | 'extended';

export interface StyleDef {
  code: StyleCode;
  label: string;
  /** image_prompt 말미에 덧붙는 화풍 접미사(전체 시트에 적용). */
  suffix: string;
}

export interface TypeDef {
  label: string;
  recommended_style: StyleCode;
  recommended_age_band: AgeBand;
  /** 절취/카드 도안 여부(막대인형·작은 책·색칠 겸용 등). */
  needs_cut_layout: boolean;
  /** 활동지 큰 제목 템플릿({주제} 치환). */
  title_template: string;
  /** 제목 아래 한 줄 활동 안내문({주제} 치환). */
  instruction: string;
  /** 활동 영역(본문) 레이아웃 묘사 — {주제} 치환. 전체 시트 앵커와 결합된다. */
  master_prompt: string;
  /** 주제 매칭용 키워드(유형 추천 시 가산점). */
  keywords?: string[];
  /** 편집 디자인 템플릿 variant id (놀이기록 DesignFrame 편집기로 열리는 유형). 있으면 이 유형은
   *  ① 카드에 '편집디자인 만들기'가 뜨고 ② 유형 자동 추천 시 우선된다. 없으면 단일 AI 시트만.
   *  ※ 새 유형 템플릿 추가 3단계: (1) 여기 template:'<variantId>' (2) layouts.js 빌더+등록
   *     (3) playrecord-integration/fromWorksheet.ts 의 payload 빌더 레지스트리에 '<variantId>' 추가. */
  template?: string;
}

/* ── 전체 시트 앵커: 활동지 "그림(활동) 영역" — 제목·안내는 앱이 텍스트 레이어로 덧입힌다 ── */
const WORKSHEET_PAGE_ANCHOR =
  '한국 유아 교육용 인쇄 활동지 한 장, A4 세로(portrait), 깨끗한 흰 배경. ' +
  '요소(바구니·카드·그림)를 큼직하게, 지면을 가득 채우도록 배치해 빈 여백을 최소화한다. ' +
  '맨 위 약 20%(상단 띠)는 별도의 인쇄 서식 헤더가 덮을 자리이므로 반드시 깨끗이 비워 둔다 — 그 영역에 그림·캐릭터·중요한 요소를 넣지 말 것. 활동 요소는 상단 20% 아래에 배치한다. ' +
  '{주제}와 어울리는 귀엽고 통통한 캐릭터를 하나씩(예: 다람쥐·곰) 아래쪽 좌우 모서리에 장식으로 배치해 활동지를 꾸민다. ' +
  '★반드시 지킬 것: (1) 활동지 어디에도 한글·영문 글자, 단어, 라벨, 설명 문구를 절대 렌더하지 말 것(빈 라벨 모양만 허용, 안은 비움). 점 잇기·숫자 따라쓰기의 숫자만 예외. ' +
  '(2) 오려 쓰는 카드 칸 안과 바구니 안에는 캐릭터·스티커·글자를 절대 넣지 말 것(오릴 그림 하나씩만 또렷하게). ';

/* ── 오리기/절취 영역 앵커 (needs_cut_layout 유형) ── */
const CUT_AREA_ANCHOR =
  '시트 하단(또는 별도 영역)은 가위로 오려서 쓰는 카드 영역이다: 영역 시작에 가위 ✂️ 아이콘과 점선(dashed) 가이드, ' +
  '각 그림은 점선 절취선 테두리의 네모 칸 안에 들어 있고 인접 칸은 절취선을 공유한다. ';

/* ── 인쇄 적합성 공통 접미사 ── */
const PRINT_SUFFIX =
  ' 인쇄용 활동지 디자인, 유아가 쓰기 쉬운 크고 단순한 요소, 깨끗하고 정돈된 레이아웃, 고품질.';

/* ── 스타일 4종 (md §2) — 전체 시트에 적용되는 질감 ─────────────── */
export const STYLES: Record<StyleCode, StyleDef> = {
  watercolor: {
    code: 'watercolor',
    label: '수채화',
    suffix:
      '활동지 전체를 부드러운 수채화 질감으로, 따뜻하고 서정적인 색감, 번지는 손그림 느낌.',
  },
  round_character: {
    code: 'round_character',
    label: '캐릭터 친구들',
    suffix:
      '점토(클레이)로 빚은 듯한 입체적이고 귀여운 3D 렌더 스타일. 매끈하고 부드러운 점토 질감, 둥근 형태, 또렷하고 굵은 외곽선, 따뜻하고 명랑한 가을 색감, 은은한 그림자로 입체감, 고품질·고해상도 디테일, 정돈된 구성.',
  },
  pastel: {
    code: 'pastel',
    label: '파스텔',
    suffix:
      '활동지 전체를 부드러운 파스텔 색조로, 은은한 그라데이션, 밝고 사랑스러운 분위기.',
  },
  black_and_white: {
    code: 'black_and_white',
    label: '흑백',
    suffix:
      '활동지 전체를 굵고 선명한 흑백 선화로, 색과 음영 없음, 색칠·탐색 활동에 최적화된 깔끔한 라인아트.',
  },
};

export const STYLE_FALLBACK: StyleCode = 'black_and_white';

/* ── 유형 ↔ 권장 스타일/연령/절취 + 활동 영역 레이아웃 (md §3) ──── */
export const TYPES: Record<string, TypeDef> = {
  분류하기: {
    label: '분류하기',
    recommended_style: 'round_character',
    recommended_age_band: '3-5',
    needs_cut_layout: false,
    title_template: '{주제}{을를} 분류해요!',
    instruction: '아래 그림을 오려서 알맞은 바구니에 붙여 보세요.',
    master_prompt:
      '위쪽 절반에는 폭이 넓고 키가 큰 빈 바구니 3개를 지면 가로폭을 가득 채우도록 나란히 둔다. ' +
      '바구니 안쪽은 크고 텅 빈 크림색으로 반드시 비워 둔다(오린 그림을 붙일 자리, 안에 아무 그림도 넣지 말 것). 바구니 위에는 서로 색이 다른 빈 라벨 모양만(글자 없이 색으로만 구분). ' +
      '아래쪽 절반에는 맨 위에 큼직한 가위 아이콘과 가로 점선만 두고, 그 아래 {주제} 그림 카드를 점선 네모 칸 격자(4열·3~4줄)로 큼직하게 배치한다(카드와 그림을 크게, 작게 흩뿌리지 말 것). ' +
      '카드마다 그림 하나씩 또렷하게. 위·아래 영역이 분명히 구분되도록.',
    keywords: ['분류', '나누', '모으', '종류', '같은', '다른'],
  },
  '미로 찾기': {
    label: '미로 찾기',
    recommended_style: 'black_and_white',
    recommended_age_band: '3-5',
    needs_cut_layout: false,
    title_template: '{주제} 미로',
    instruction: '길을 따라가 도착점까지 가 보세요.',
    master_prompt:
      '활동 영역 중앙에 큰 미로 하나. 왼쪽 위 출발점에 {주제} 캐릭터, 오른쪽 아래 도착점에 목표 그림. 길은 넓고 또렷하게, 막다른 길 몇 개 포함.',
    keywords: ['미로', '길찾기', '길 찾', '탈출'],
  },
  '반쪽 완성하기': {
    label: '반쪽 완성하기',
    recommended_style: 'pastel',
    recommended_age_band: '0-2',
    needs_cut_layout: false,
    title_template: '반쪽을 완성해요',
    instruction: '왼쪽 그림을 보고 오른쪽을 똑같이 그려 완성해 보세요.',
    master_prompt:
      '활동 영역 중앙에 세로 점선. 왼쪽 절반에 {주제} 그림이 그려져 있고(연한 격자 보조선 포함), 오른쪽 절반은 같은 격자만 있는 빈 칸이라 아이가 대칭으로 따라 그린다.',
    keywords: ['반쪽', '대칭', '완성', '따라 그리'],
    template: 'half-drawing',
  },
  '점 잇기': {
    label: '점 잇기',
    recommended_style: 'pastel',
    recommended_age_band: '0-2',
    needs_cut_layout: false,
    title_template: '점을 이어 봐요',
    instruction: '1부터 순서대로 점을 이어 보세요.',
    master_prompt:
      '활동 영역 중앙에 {주제} 윤곽을 따라 번호가 매겨진 점들을 배치(순서대로 이으면 {주제} 그림 완성). 점과 번호는 크고 또렷하게.',
    keywords: ['점잇기', '점 잇', '숫자 따라', '연결'],
  },
  '막대인형 만들기': {
    label: '막대인형 만들기',
    recommended_style: 'round_character',
    recommended_age_band: '0-2',
    needs_cut_layout: true,
    title_template: '{주제} 막대인형',
    instruction: '오려서 막대에 붙여 인형을 만들어요.',
    master_prompt:
      '오리기 영역에 {주제} 캐릭터 본체(크게)와 막대 손잡이 조각을 점선 절취선 네모 안에 배치해 오려 붙여 막대인형을 완성한다. 조각은 크고 윤곽선은 굵게.',
    keywords: ['인형', '막대', '역할', '손인형'],
  },
  '그림 찾기': {
    label: '그림 찾기',
    recommended_style: 'black_and_white',
    recommended_age_band: '3-5',
    needs_cut_layout: false,
    title_template: '숨은 그림을 찾아요',
    instruction: '그림 속에 숨은 물건을 모두 찾아보세요.',
    master_prompt:
      '활동 영역에 {주제} 풍경 큰 그림 하나, 그 안에 찾아야 할 사물 6개를 자연스럽게 숨긴다. 하단에 "찾을 그림" 작은 목록 칸(체크용)을 둔다.',
    keywords: ['찾기', '숨은', '관찰', '같은 그림'],
  },
  '빙고·탐색': {
    label: '빙고·탐색',
    recommended_style: 'pastel',
    recommended_age_band: '3-5',
    needs_cut_layout: false,
    title_template: '{주제} 빙고',
    instruction: '찾은 것을 하나씩 표시해 보세요.',
    master_prompt:
      '활동 영역 중앙에 3x3 격자 빙고판. 각 칸에 {주제} 관련 사물 그림과 발견 시 표시할 동그라미 표가 있다.',
    keywords: ['빙고', '탐색', '찾아보', '관찰'],
  },
  '필요한 물건 고르기': {
    label: '필요한 물건 고르기',
    recommended_style: 'round_character',
    recommended_age_band: '3-5',
    needs_cut_layout: false,
    title_template: '무엇이 필요할까요?',
    instruction: '{주제}에 필요한 것을 골라 동그라미 해 보세요.',
    master_prompt:
      '활동 영역 위에 {주제} 상황 그림 하나, 아래에 여러 사물 그림 8개를 늘어놓아(필요한 것/아닌 것 섞음) 아이가 필요한 것에 동그라미를 치도록 한다.',
    keywords: ['고르', '필요', '준비물', '선택'],
  },
  '그림자 짝짓기': {
    label: '그림자 짝짓기',
    recommended_style: 'black_and_white',
    recommended_age_band: '0-2',
    needs_cut_layout: false,
    title_template: '그림자를 찾아요',
    instruction: '같은 모양의 그림자를 찾아 선으로 이어 보아요.',
    master_prompt:
      '활동 영역 왼쪽 열에 {주제} 컬러 그림 5개, 오른쪽 열에 순서를 섞은 검은 실루엣(그림자) 5개를 두고, 사이를 선으로 잇도록 점을 배치. 형태 대비를 또렷하게.',
    keywords: ['그림자', '짝', '실루엣', '연결'],
    template: 'shadow-match',
  },
  색칠하기: {
    label: '색칠하기',
    recommended_style: 'black_and_white',
    recommended_age_band: '0-2',
    needs_cut_layout: true,
    title_template: '{주제} 색칠하기',
    instruction: '예쁘게 색칠해 보세요.',
    master_prompt:
      '활동 영역에 {주제} 큰 선화 그림 한두 개를 색칠할 수 있게 굵은 윤곽선·빈 내부로 배치. 가장자리에 오려서 액자처럼 쓰는 점선 테두리.',
    keywords: ['색칠', '컬러링', '칠하'],
  },
  '숫자 따라쓰기': {
    label: '숫자 따라쓰기',
    recommended_style: 'pastel',
    recommended_age_band: '0-2',
    needs_cut_layout: false,
    title_template: '숫자를 따라 써요',
    instruction: '점선 숫자를 따라 쓰고 개수만큼 세어 보세요.',
    master_prompt:
      '활동 영역에 1~5 점선 숫자 따라쓰기 줄을 세로로 배치, 각 숫자 옆에 그 개수만큼 {주제} 그림을 둔다. 점선 숫자는 크게.',
    keywords: ['숫자', '따라쓰기', '쓰기', '수세기'],
  },
  '수 세기': {
    label: '수 세기',
    recommended_style: 'round_character',
    recommended_age_band: '3-5',
    needs_cut_layout: false,
    title_template: '{주제}{이가} 몇 개일까요?',
    instruction: '그림을 세어 빈 칸에 수를 써 보세요.',
    master_prompt:
      '활동 영역을 굵은 선의 3열×3줄(또는 2열×3줄) 네모 칸 격자로 나눈다. 각 칸 위쪽에 똑같은 {주제} 그림만 1~6개씩 칸마다 서로 다른 개수로 또렷하게(겹치지 않게) 배치하고, 칸 아래쪽 가운데에 수를 적을 작고 굵은 빈 네모를 하나 둔다. ' +
      '★엄수: (1) 빈 답 네모 안에 숫자를 미리 써 넣지 말 것(완전히 비움). (2) 모든 칸에는 오직 {주제} 그림만 — 숫자·글자·잎·바구니·버섯 등 다른 사물을 절대 섞지 말 것. 칸마다 개수만 다르게.',
    keywords: ['세기', '수세기', '몇', '개수', '셈', '수 세'],
    template: 'counting',
  },
  '짝 맞추기': {
    label: '짝 맞추기',
    recommended_style: 'round_character',
    recommended_age_band: '3-5',
    needs_cut_layout: false,
    title_template: '{주제} 짝을 찾아요',
    instruction: '어울리는 것끼리 선으로 이어 보세요.',
    master_prompt:
      '활동 영역을 좌우 두 열로 나눈다. 왼쪽 열에 {주제} 그림 4~5개를 세로로 고르게, 오른쪽 열에 그와 짝이 되는 그림(짝꿍·색·새끼·쓰임새 등) 4~5개를 순서를 섞어 세로로 배치한다. 각 그림의 안쪽 끝에 선을 이을 작은 동그란 점을 하나씩 둔다. 좌우 사이 가운데는 선을 그을 수 있게 넉넉히 비운다.',
    keywords: ['짝', '짝짓기', '짝 맞추', '어울리', '연결', '선 잇', '선잇', '같은 색'],
  },
  '낱말 카드': {
    label: '낱말 카드',
    recommended_style: 'round_character',
    recommended_age_band: '0-2',
    needs_cut_layout: true,
    title_template: '{주제} 낱말 카드',
    instruction: '오려서 그림을 보고 이름을 익히고, 빈 이름표에 이름을 써 보세요.',
    master_prompt:
      '활동 영역을 2열×2줄(또는 2열×3줄)의 큰 카드 격자로 나누고 카드 사이를 점선 절취선으로 구분한다. ' +
      '각 카드 안에 {주제}의 서로 다른 한 가지를 큼직하고 또렷하게 그리고, 카드 아래쪽에 이름을 적을 가로로 긴 빈 띠(이름표 자리, 글자는 비움)를 둔다. 카드마다 다른 대상으로.',
    keywords: ['낱말', '카드', '플래시', '단어', '이름', '어휘', '플래시카드'],
  },
  '한글 쓰기': {
    label: '한글 쓰기',
    recommended_style: 'pastel',
    recommended_age_band: '3-5',
    needs_cut_layout: false,
    title_template: '{주제} 낱말을 알아요',
    instruction: '그림을 보고 낱말을 따라 써 보아요.',
    master_prompt:
      '활동 영역에 {주제} 그림 4개를 세로로 배치하고, 각 그림 옆에 그 낱말을 원고지(네모 칸)에 음절별로 연한 회색 안내글자로 두어 아이가 따라 쓰게 한다. 칸은 크고 또렷하게.',
    keywords: ['한글', '글자', '낱말 쓰기', '따라 쓰기', '쓰기 연습', '글씨'],
    template: 'hangul-writing',
  },
  '머리띠 만들기': {
    label: '머리띠 만들기',
    recommended_style: 'round_character',
    recommended_age_band: '3-5',
    needs_cut_layout: true,
    title_template: '{주제} 머리띠',
    instruction: '오려서 머리띠를 만들어 역할놀이를 해요.',
    master_prompt:
      '오리기 영역에 {주제} 캐릭터 머리띠를 3개 배치한다. 각 머리띠는 캐릭터 얼굴이 달린 넓은 앞띠와 양옆으로 이어 붙이는 긴 띠 조각으로 이뤄지고, 모두 점선 절취선 안에 둔다. 오려 머리에 두르면 역할놀이 머리띠가 된다.',
    keywords: ['머리띠', '역할놀이', '역할', '가면', '신체', '몸으로'],
    template: 'headband',
  },
};

/* ── 유형 카테고리(영역) — 추천 UI 그룹·일관 적용용. 유형은 한 카테고리에 속한다(주 영역 기준). ── */
export const CATEGORIES: Record<string, string[]> = {
  '수·셈': ['수 세기', '숫자 따라쓰기', '빙고·탐색'],
  '짝짓기·분류': ['분류하기', '짝 맞추기', '그림자 짝짓기'],
  '변별·관찰': ['그림 찾기', '필요한 물건 고르기'],
  '소근육·오리기': ['점 잇기', '미로 찾기', '오려 붙여 완성하기', '막대인형 만들기'],
  '미술·표현': ['색칠하기','반쪽 완성하기'],
  '언어·낱말': ['낱말 카드', '한글 쓰기'],
  '신체·역할': ['머리띠 만들기'],
};

/* ── 연령대별 후보 유형 (md §1) ──────────────────────────────── */
export const AGE_BAND_RULES: Record<AgeBand, string[]> = {
  '0-2': ['색칠하기', '반쪽 완성하기', '점 잇기', '그림자 짝짓기', '숫자 따라쓰기', '막대인형 만들기', '낱말 카드'],
  '3-5': [
    '분류하기',
    '수 세기',
    '짝 맞추기',
    '미로 찾기',
    '그림 찾기',
    '빙고·탐색',
    '필요한 물건 고르기',
    '낱말 카드',
    '한글 쓰기',
    '머리띠 만들기',
    // 0-2 단순형도 3-5에서 사용 가능 (md §1)
    '색칠하기',
    '반쪽 완성하기',
    '점 잇기',
    '그림자 짝짓기',
    '숫자 따라쓰기',
    '막대인형 만들기',
  ],
};

/* ── 유형/스타일 별칭(자연어 파싱용) ─────────────────────────── */
const TYPE_ALIASES: Record<string, string> = {
  색칠: '색칠하기',
  컬러링: '색칠하기',
  미로: '미로 찾기',
  빙고: '빙고·탐색',
  분류: '분류하기',
  점잇기: '점 잇기',
  인형: '막대인형 만들기',
  그림자: '그림자 짝짓기',
  숨은그림: '그림 찾기',
  // 교사 현장 표면형 보강(intent-lexicon과 동일 어휘) — "공룡 선잇기"처럼
  // 활동 유형 단어만으로도 올바른 유형이 추천되게 한다.
  // 일반 '짝 맞추기'(색↔과일·동물↔새끼 등 선 잇기)와 '그림자 짝짓기'(실루엣 전용)를 구분.
  선잇기: '짝 맞추기',
  '선 잇기': '짝 맞추기',
  선긋기: '짝 맞추기',
  짝짓기: '짝 맞추기',
  짝맞추기: '짝 맞추기',
  연결하기: '짝 맞추기',
  잇기: '짝 맞추기',
  세기: '수 세기',
  수세기: '수 세기',
  개수: '수 세기',
  오려붙이기: '오려 붙여 완성하기',
  '오려 붙이기': '오려 붙여 완성하기',
  완성하기: '오려 붙여 완성하기',
  조립: '오려 붙여 완성하기',
  낱말카드: '낱말 카드',
  '낱말 카드': '낱말 카드',
  플래시카드: '낱말 카드',
  단어카드: '낱말 카드',
  따라쓰기: '숫자 따라쓰기',
  '따라 쓰기': '숫자 따라쓰기',
  한글쓰기: '한글 쓰기',
  '한글 쓰기': '한글 쓰기',
  글자쓰기: '한글 쓰기',
  낱말쓰기: '한글 쓰기',
  글씨쓰기: '한글 쓰기',
  머리띠: '머리띠 만들기',
  역할놀이: '머리띠 만들기',
  역할극: '머리띠 만들기',
  '같은 그림': '그림 찾기',
  길찾기: '미로 찾기',
};
const STYLE_ALIASES: Record<string, StyleCode> = {
  수채화: 'watercolor',
  캐릭터: 'round_character',
  '캐릭터 친구들': 'round_character',
  클레이: 'round_character',
  점토: 'round_character',
  파스텔: 'pastel',
  흑백: 'black_and_white',
  선화: 'black_and_white',
};

export interface WorksheetReco {
  age_band: AgeBand;
  age_years?: AgeYears;
  topic: string;
  /** 활동 카테고리(영역) — 헤더 '영역' 칸. */
  area: string;
  type: string;
  title: string;
  instruction: string;
  style: StyleCode;
  style_label: string;
  selection: { type_by: SelectedBy; style_by: SelectedBy; mode: WorksheetMode };
  difficulty: Difficulty;
  needs_cut_layout: boolean;
  image_prompt: string;
  cut_layout: CutLayout | null;
}

/** 활동 유형 → 카테고리(영역). CATEGORIES 역참조, 미분류는 '통합'. */
export function categoryOf(type: string): string {
  for (const [cat, list] of Object.entries(CATEGORIES)) {
    if (list.includes(type)) return cat;
  }
  return '통합';
}

/** 연령별 난이도 — 세분 연령(3/4/5세)이 있으면 그에 맞춰, 없으면 밴드로.
    3세=basic(단순·큰 요소), 4세=standard(비교·분류), 5세=extended(추론·심화). */
export function difficultyFor(age_band: AgeBand, age_years?: AgeYears): Difficulty {
  if (age_years === '5') return 'extended';
  if (age_years === '4') return 'standard';
  if (age_years === '3') return 'basic';
  return age_band === '0-2' ? 'basic' : 'standard';
}

export interface CutLayout {
  pieces: string[];
  shared_edges: string[][];
  cut_line_style: 'solid' | 'dashed';
}

/** 자연어 요청에서 슬롯(연령·유형·스타일·주제) 추출. */
export function parseWorksheetRequest(
  request: string,
  ctx?: string,
): { age_band: AgeBand; age_years?: AgeYears; type?: string; style?: StyleCode; topic: string } {
  const text = `${request} ${ctx ?? ''}`;

  // 연령대 + 세분 연령(만 N세)
  let age_band: AgeBand = '3-5';
  let age_years: AgeYears | undefined;
  const ym = text.match(/만\s*([0-5])\s*세|(?<![0-9])([0-5])\s*세/);
  const yr = ym ? (ym[1] ?? ym[2]) : undefined;
  if (yr === '0' || yr === '1') age_years = '0-1';
  else if (yr === '2') age_years = '2';
  else if (yr === '3') age_years = '3';
  else if (yr === '4') age_years = '4';
  else if (yr === '5') age_years = '5';
  if (age_years) age_band = age_years === '3' || age_years === '4' || age_years === '5' ? '3-5' : '0-2';
  else if (/0\s*[-~]\s*2|영아|돌\b/.test(text)) age_band = '0-2';
  else if (/3\s*[-~]\s*5|유아/.test(text)) age_band = '3-5';

  // 유형
  let type: string | undefined;
  for (const label of Object.keys(TYPES)) {
    if (request.includes(label)) { type = label; break; }
  }
  if (!type) {
    for (const [alias, label] of Object.entries(TYPE_ALIASES)) {
      if (request.includes(alias)) { type = label; break; }
    }
  }

  // 스타일
  let style: StyleCode | undefined;
  for (const [alias, code] of Object.entries(STYLE_ALIASES)) {
    if (request.includes(alias)) { style = code; break; }
  }

  // 주제: 유형/스타일/연령/지시어 토큰 제거 후 남는 핵심
  let topic = request;
  if (type) topic = topic.replace(type, ' ');
  for (const alias of Object.keys(TYPE_ALIASES)) topic = topic.replace(alias, ' ');
  for (const alias of Object.keys(STYLE_ALIASES)) topic = topic.replace(alias, ' ');
  topic = topic
    .replace(/0\s*[-~]\s*2세?|3\s*[-~]\s*5세?|만?\s*[0-5]\s*세|영아|유아/g, ' ')
    .replace(/주제로|주제|활동지|워크시트|학습지|문제지|놀이지|도안|만들어\s*줘|만들어|그려\s*줘|그려|해\s*줘|주세요|같은|용\b|의\b|스타일|로\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!topic) topic = request.trim();
  // 서술 문장이 통째로 넘어온 경우(계획 활동 등) — 제목/헤더가 깨지지 않게 첫 절의 핵심만 남긴다.
  if (topic.length > 16) {
    const head = topic
      .split(/[.!?。·…]/)[0]
      .replace(/\s*(?:하며|하면서|하고\s*나서|해\s*보며|해보며|하여|해서)\b[\s\S]*$/u, '')
      .replace(/(?:을|를|이|가|은|는|에|으로|로|와|과)\s+[가-힣]+(?:한다|그린다|만든다|본다|나눈다|정한다|결정한다|탐색한다|표현한다|익힌다|알아본다|살펴본다)\.?$/u, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (head && head.length >= 2) topic = head.length > 22 ? head.slice(0, 22).trim() : head;
  }

  return { age_band, age_years, type, style, topic };
}

/** 유형 추천: 연령 후보군 + 주제 키워드 가산. */
/** 이 유형이 편집 디자인 템플릿(DesignFrame)을 가지는가. */
export function hasWorksheetTemplate(type: string): boolean {
  return !!TYPES[type]?.template;
}
/** 유형 → 편집 디자인 템플릿 variant id (없으면 undefined). */
export function worksheetTemplateId(type: string): string | undefined {
  return TYPES[type]?.template;
}
/** 템플릿을 가진 유형 목록. */
export function typesWithTemplate(): string[] {
  return Object.keys(TYPES).filter((t) => TYPES[t].template);
}

// 유형 자동 추천 — 키워드 가산 + '편집 디자인 템플릿 보유' 유형에 큰 가산점(위주로 생성).
// 템플릿이 늘면 이 가산으로 자연히 후보가 넓어진다(사용자 요청: 나중에 생성 규칙 재정비).
const TEMPLATE_BONUS = 100;
function recommendType(age_band: AgeBand, topic: string): string {
  const candidates = AGE_BAND_RULES[age_band];
  let best = candidates[0];
  let bestScore = -Infinity;
  for (const label of candidates) {
    const kws = TYPES[label]?.keywords ?? [];
    let score = kws.reduce((acc, kw) => (topic.includes(kw) ? acc + 1 : acc), 0);
    if (TYPES[label]?.template) score += TEMPLATE_BONUS; // 템플릿 있는 유형 우선
    if (score > bestScore) { bestScore = score; best = label; }
  }
  return best;
}

/* 한글 조사 자동 선택 — 앞 글자의 받침 유무로 을/를·이/가·은/는·과/와 결정.
   템플릿에 {을를} 등 토큰을 두면 {주제} 치환 후 자연스러운 조사로 바뀐다. */
function hasJongseong(ch: string): boolean {
  const c = ch.charCodeAt(0);
  if (c < 0xac00 || c > 0xd7a3) return true; // 한글 외(영문·숫자)는 받침 있는 것으로 간주
  return (c - 0xac00) % 28 !== 0;
}
const JOSA: Record<string, [string, string]> = {
  '{을를}': ['를', '을'],
  '{이가}': ['가', '이'],
  '{은는}': ['는', '은'],
  '{과와}': ['와', '과'],
};
export function applyJosa(s: string): string {
  return s.replace(/(.)(\{을를\}|\{이가\}|\{은는\}|\{과와\})/g, (_, ch: string, tok: string) => {
    const [no, yes] = JOSA[tok];
    return ch + (hasJongseong(ch) ? yes : no);
  });
}

/** 활동지 큰 제목 생성. */
export function buildTitle(type: string, topic: string): string {
  const tpl = TYPES[type]?.title_template ?? '{주제} 활동지';
  return applyJosa(tpl.replace(/\{주제\}/g, topic));
}

/** 활동지 그림 영역 image_prompt 조립 — 화풍을 앞세워 품질 신호를 강하게.
   [스타일] → [시트 포맷·규칙] → [활동 레이아웃] → (오리기) → [인쇄 마감]. */
export function assembleImagePrompt(type: string, topic: string, style: StyleCode): string {
  const def = TYPES[type];
  const styleDef = STYLES[style];
  const body = (def?.master_prompt ?? '활동 영역에 {주제} 관련 활동을 배치한다.').replace(/\{주제\}/g, topic);
  const anchor = WORKSHEET_PAGE_ANCHOR.replace(/\{주제\}/g, topic);
  const cut = def?.needs_cut_layout ? CUT_AREA_ANCHOR : '';
  return applyJosa(
    `${styleDef.suffix} ${anchor}구성: ${body} ${cut}${PRINT_SUFFIX}`,
  )
    .replace(/\s+/g, ' ')
    .trim();
}

/** 활동지 안내문(텍스트 레이어용) — {주제} 치환 + 조사 정리. */
export function buildInstruction(type: string, topic: string): string {
  const ins = (TYPES[type]?.instruction ?? '').replace(/\{주제\}/g, topic);
  return applyJosa(ins);
}

/** 절취 도안의 cut_layout 합성 — 인접 조각이 절취선 공유(shared edge). */
function buildCutLayout(type: string, age_band: AgeBand): CutLayout {
  // 0-2: 큰 조각·직선 위주(가위질 난이도 하향) → solid. 3-5: 곡선 허용 → dashed 가이드.
  const cut_line_style: CutLayout['cut_line_style'] = age_band === '0-2' ? 'solid' : 'dashed';
  let pieces: string[];
  switch (type) {
    case '막대인형 만들기':
      pieces = ['인형 본체', '막대 손잡이'];
      break;
    case '색칠하기':
      pieces = ['색칠 그림', '액자 테두리'];
      break;
    case '오려 붙여 완성하기':
      pieces = ['부위 1', '부위 2', '부위 3', '부위 4'];
      break;
    case '낱말 카드':
      pieces = ['카드 1', '카드 2', '카드 3', '카드 4'];
      break;
    default:
      pieces = ['조각 1', '조각 2'];
  }
  // 인접 조각끼리 변 공유(한 번 자르면 두 조각 동시 분리).
  const shared_edges: string[][] = [];
  for (let i = 0; i < pieces.length - 1; i++) shared_edges.push([pieces[i], pieces[i + 1]]);
  return { pieces, shared_edges, cut_line_style };
}

/** 핵심: 슬롯 → 추천 조합(유형·스타일·난이도·image_prompt·cut_layout). */
export function recommendWorksheet(input: {
  age_band: AgeBand;
  age_years?: AgeYears;
  topic: string;
  type?: string;
  style?: StyleCode;
  mode?: WorksheetMode;
}): WorksheetReco {
  const { age_band, age_years, topic } = input;

  // 유형
  const hasUserType = !!input.type && !!TYPES[input.type];
  const type = hasUserType ? input.type! : recommendType(age_band, topic);
  const type_by: SelectedBy = hasUserType ? 'user' : 'recommended';

  // 스타일
  const hasUserStyle = !!input.style && !!STYLES[input.style];
  const style: StyleCode = hasUserStyle
    ? input.style!
    : TYPES[type]?.recommended_style ?? STYLE_FALLBACK;
  const style_by: SelectedBy = hasUserStyle ? 'user' : 'recommended';

  // 모드: 명시 없으면 사용자가 유형/스타일을 줬는지로 추론
  const mode: WorksheetMode = input.mode ?? (hasUserType || hasUserStyle ? 'guided' : 'instant');

  const needs_cut_layout = TYPES[type]?.needs_cut_layout ?? false;
  const image_prompt = assembleImagePrompt(type, topic, style);
  const difficulty: Difficulty = difficultyFor(age_band, age_years);
  const cut_layout = needs_cut_layout ? buildCutLayout(type, age_band) : null;

  return {
    age_band,
    age_years,
    area: categoryOf(type),
    topic,
    type,
    title: buildTitle(type, topic),
    instruction: buildInstruction(type, topic),
    style,
    style_label: STYLES[style].label,
    selection: { type_by, style_by, mode },
    difficulty,
    needs_cut_layout,
    image_prompt,
    cut_layout,
  };
}
