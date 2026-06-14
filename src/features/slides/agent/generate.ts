/* 장표(슬라이드) 에이전트 — 교사의 한 줄 요청 → DeckSpec 자동 생성.
   2단계: ① Router(저티어/Haiku)로 {category, ageBand, lengthHint} 분류
          ② 장표 에이전트(lesson/parent=Sonnet, admin=Haiku)로 DeckSpec JSON 생성.
   출력은 펜스 제거 → 스키마 검증 → 실패 시 1회 재요청(slides-feature/SKILL §7·9).
   프롬프트 원문 단일 출처: slides-feature/PROMPTS.md (아래 인라인은 그 사본).
   ※ 차트는 SlideChart(recharts)로 실제 렌더, 이미지는 IDB asset 연결(자리표시는 미설정 시에만). */

import { callGateway } from '@/ai/client';
import { extractJson } from '@/ai/json';
import {
  validateDeck,
  THEMES,
  type DeckSpec,
  type Category,
  type AgeBand,
  type Theme,
} from '../schema/deckspec';

/** 카테고리별 기본 테마(에이전트가 안 고르거나 무효일 때 폴백). */
const DEFAULT_THEME: Record<Category, Theme> = { lesson: 'bloom', parent: 'warm', admin: 'slate' };

export interface SlideChips {
  category?: Category;
  ageBand?: AgeBand;
}

interface RouterOut {
  category: Category;
  ageBand: AgeBand;
  lengthHint: number;
}

const LEN_DEFAULT: Record<Category, number> = { lesson: 8, parent: 10, admin: 6 };
const AGE_BANDS: AgeBand[] = ['3세', '4세', '5세', '혼합'];

/** Router — 한 줄 요청을 {category, ageBand, lengthHint}로 분류. 실패하면 휴리스틱 기본값. */
async function classify(request: string, chip?: SlideChips): Promise<RouterOut> {
  const system = '너는 킨더버스의 요청 라우터다. 교사의 슬라이드 요청을 분석해 JSON만 출력한다. 설명·마크다운 금지.';
  const user = `분류 기준:
- category: "lesson"(아이들에게 보여주는 수업/놀이 활동), "parent"(학부모 설명회), "admin"(내부 보고·행정 문서)
- ageBand: "3세" | "4세" | "5세" | "혼합" (불명확하면 "혼합")
- lengthHint: 예상 슬라이드 수 정수 (불명확하면 category 기본: lesson 8, parent 10, admin 6)

요청: "${request}"
사용자가 고른 칩(있으면 우선): category=${chip?.category ?? '없음'}, ageBand=${chip?.ageBand ?? '없음'}

출력: {"category":"...","ageBand":"...","lengthHint":0}`;

  let category: Category = chip?.category ?? 'lesson';
  let ageBand: AgeBand = chip?.ageBand ?? '혼합';
  let lengthHint = 0;

  const res = await callGateway({
    task: 'router',
    tier: 'low',
    provider: 'auto',
    responseFormat: 'json',
    system,
    messages: [{ role: 'user', content: user }],
    meta: { kind: 'slides_router', title: request },
    maxTokens: 120,
  });
  if (res.ok && res.text) {
    try {
      const o = extractJson(res.text) as Partial<RouterOut>;
      if (o.category === 'lesson' || o.category === 'parent' || o.category === 'admin') category = o.category;
      if (typeof o.ageBand === 'string' && AGE_BANDS.includes(o.ageBand as AgeBand)) ageBand = o.ageBand as AgeBand;
      if (typeof o.lengthHint === 'number' && o.lengthHint >= 1) lengthHint = Math.round(o.lengthHint);
    } catch {
      /* 휴리스틱 기본값 유지 */
    }
  }
  // 칩이 있으면 최종적으로 칩 우선.
  if (chip?.category) category = chip.category;
  if (chip?.ageBand) ageBand = chip.ageBand;
  if (lengthHint < 1) lengthHint = LEN_DEFAULT[category];
  lengthHint = Math.min(Math.max(lengthHint, 3), 20);
  return { category, ageBand, lengthHint };
}

/* 카테고리별 콘텐츠 가이드(PROMPTS §3) — 장표 시스템 프롬프트에 합성. */
const CATEGORY_GUIDE: Record<Category, string> = {
  lesson: `대상: {{age}} 아동(교사가 화면을 띄워 함께 봄).
- 화면 글자는 최소·큰 글씨, 슬라이드당 메시지 1개. 어휘는 쉽고 다정하게.
- 흐름: 도입(궁금증) → 탐색(관찰·놀이) → 마무리(나눔). 단계 전환은 section-divider.
- 레이아웃: big-text·hero-image·image-feature 위주, 질문은 quote, 수(개수)는 big-stat(예: "3가지").
- speakerNote에 교사가 던질 질문/멘트 한 줄. 이미지 prompt는 따뜻한 삽화 '내용만'(글자 금지).`,
  parent: `대상: 학부모(설명회). 따뜻하지만 신뢰감 있는 어조, 근거 중심.
- 흐름: 인사·올해 방향 → 발달/생활 영역 → 데이터·사례 → 가정 연계·당부.
- 레이아웃: two-column(설명+근거), big-stat(출석률·참여율 등 수치 1개를 크게), chart(추이/비율), quote(교육 철학), 파트 구분은 section-divider.
- 한 슬라이드 한 메시지, 문장은 간결하게.`,
  admin: `대상: 내부/기관(보고). 간결·구조적·기능적. 삽화 없음(아이콘 role만).
- 흐름: 표지 → 한눈 요약 → 항목별 → 지표 → 다음 달 계획.
- 레이아웃: bullets·two-column·big-stat·chart·section-divider 위주. 수치는 반드시 big-stat 또는 chart로 강조.
- 군더더기 없이 핵심만, 불릿은 명사형 짧게.`,
};

/** 장표 에이전트 — DeckSpec JSON 생성 + 스키마 검증(실패 시 1회 강화 재요청). */
async function buildDeck(request: string, r: RouterOut): Promise<DeckSpec | null> {
  const tier = r.category === 'admin' ? 'low' : 'mid'; // admin=Haiku, lesson/parent=Sonnet
  const fallbackTheme = DEFAULT_THEME[r.category];
  const system = `너는 킨더버스의 "장표" 에이전트다. 유치원 교사를 위한 '전문가 수준' 슬라이드 덱을 설계한다.
출력은 DeckSpec JSON 하나뿐 — JSON 외 텍스트·마크다운 펜스 금지.

[디자인 원칙 — 아마추어처럼 보이지 않게]
- 한 슬라이드 한 메시지. 헤드라인은 8단어 이내로 단정하게(문장 나열 금지).
- 위계: 가장 중요한 것이 가장 크게. 본문은 짧게, 불릿은 3~5개·명사형.
- 단조로움 금지: 같은 레이아웃을 연달아 쓰지 마라. 밀도를 의도적으로 바꿔라(여유로운 표지/섹션 ↔ 촘촘한 내용).
- 내러티브 아크로 엮어라(도입 훅 → 전개 → 마무리). 막과 막 사이엔 section-divider 한 장.
- 수치(퍼센트·개수·금액)는 문장에 묻지 말고 big-stat 또는 chart로 '크게' 보여라.

[레이아웃 카탈로그 — 콘텐츠 목적에 맞게]
- title: 표지(덱 시작 1장).  · section-divider: 파트/단계 전환(eyebrow + 짧은 섹션 제목).
- big-text: 한 문장 강조(선언·질문).  · big-stat: 핵심 수치 1개(caption=라벨, title=수치 "96%", subtitle=맥락).
- two-column: 설명+근거 또는 두 갈래(body 2개).  · image-feature: 핵심 포인트 + 삽화(title+body+image).
- bullets: 요점 3~5개.  · hero-image / photo-grid: 큰 삽화 / 사진 모음.
- quote: 철학·메시지·인용(body + caption=출처).  · chart: 추이/비율(chartType + data).

[전문 디테일]
- 표지(title)·section-divider에는 eyebrow를 넣지 말고, '내용' 슬라이드에는 짧은 eyebrow(2~4단어 라벨, 예: "올해의 방향", "발달 영역")를 넣어라.
- 내용 슬라이드는 "number": true(쪽번호). 표지/섹션 구분은 number 생략/false.
- accentRole은 보통 생략(테마 1차 악센트). 정말 강조할 한 장에만 "gold"(테마 2차 악센트).
- 모든 슬라이드에 speakerNote(발표 멘트) 1줄.

[테마 — 슬라이드 전체 스타일 1개를 주제·분위기에 맞게 골라 "theme"에 넣어라]
warm(따뜻한 크림·코랄) · ivory(깨끗한 화이트·테라코타) · midnight(다크·앰버) · slate(코퍼레이트 블루) · sage(차분한 자연 그린) · bloom(밝고 다정—유아수업) · mono(볼드 흑백·레드)
- 참고 매칭: lesson→bloom/warm, parent→warm/ivory/sage, admin→slate/ivory/mono (주제 분위기를 우선).

[절대 규칙]
1. 이미지에 들어갈 글자를 prompt에 쓰지 마라(모든 글자는 text/bullets 블록).
2. layout은 카탈로그 enum에서만.  3. DeckSpec 스키마를 정확히.  4. category 톤·레이아웃 비중을 따른다.

[카테고리: ${r.category}]
${CATEGORY_GUIDE[r.category].replace('{{age}}', r.ageBand)}`;

  const base = `카테고리: ${r.category} / 연령: ${r.ageBand} / 목표 슬라이드 수: 약 ${r.lengthHint}장
주제/요청: "${request}"

DeckSpec 형태:
{ "category":"${r.category}", "theme":"<warm|ivory|midnight|slate|sage|bloom|mono 중 1개>", "ratio":"16:9", "ageBand":"${r.ageBand}", "title":"<덱 제목>",
  "slides":[
    { "layout":"<enum>", "eyebrow":"<내용 슬라이드만, 짧은 라벨>", "number":true,
      "blocks":[ ... ], "speakerNote":"<발표 멘트 1줄>" }
  ] }

layout enum: title, section-divider, big-text, big-stat, two-column, image-feature, bullets, hero-image, photo-grid, quote, chart

블록 종류:
- {"type":"title|subtitle|body|caption","text":"..."}
- {"type":"bullets","items":["...","..."]}   // 3~5개 권장, 최대 7
- {"type":"image","role":"hero|inline|background|icon","prompt":"<삽화 내용만>","assetId":null}
- {"type":"chart","chartType":"bar|line|pie|radar","data":[...]}
  · data 형식(반드시 지킴): 각 항목 = 라벨 1개 + 숫자값. 항목 4~6개.
    bar/line:  [{"label":"3월","value":18},{"label":"4월","value":21}, ...]
    두 계열 비교: [{"label":"3월","우리반":18,"전체평균":15}, ...]   // 숫자 키 2개(키 이름이 범례가 됨)
    pie:  [{"label":"블록놀이","value":35},{"label":"역할놀이","value":25}, ...]   // 3~5개, 합 100 권장
    radar:[{"label":"언어","value":80},{"label":"신체","value":70}, ...]   // 4~6축, 0~100
  · chart 슬라이드는 title(제목)+chart+caption(결론 한 줄)을 함께 둔다. 숫자는 실제 의미 있는 값으로.

big-stat의 blocks는 caption(라벨)+title(수치)+subtitle(맥락) 순서.
첫 장은 title(표지, eyebrow 없이). 다양한 레이아웃을 섞어라. JSON DeckSpec만 출력.`;

  // 풍성한 덱(eyebrow·speakerNote·다양한 블록)은 JSON이 길다 — 잘림 방지로 넉넉히.
  const maxTokens = Math.min(8000, 1600 + r.lengthHint * 380);

  for (let attempt = 1; attempt <= 2; attempt++) {
    const content =
      attempt === 1
        ? base
        : `${base}\n\n(앞선 출력이 스키마에 맞지 않았다. layout은 허용된 enum만, 블록 형태를 정확히 지켜 DeckSpec JSON만 다시 출력하라.)`;
    const res = await callGateway({
      task: 'slides',
      tier,
      provider: 'auto',
      responseFormat: 'json',
      fallback: tier === 'low' ? ['mid'] : ['high'],
      system,
      messages: [{ role: 'user', content }],
      meta: { kind: 'slides_deck', title: request },
      maxTokens,
    });
    if (!res.ok || !res.text) continue;
    try {
      const obj = extractJson(res.text) as DeckSpec;
      // 라우터가 정한 메타로 정규화(모델이 흘릴 수 있는 필드 보정). 테마는 에이전트 선택을
      // 존중하되 무효면 카테고리 기본으로.
      if (!(THEMES as readonly string[]).includes(String(obj.theme))) obj.theme = fallbackTheme;
      obj.ratio = '16:9';
      if (obj.category !== 'lesson' && obj.category !== 'parent' && obj.category !== 'admin') obj.category = r.category;
      if (!AGE_BANDS.includes(obj.ageBand)) obj.ageBand = r.ageBand;
      if (typeof obj.title !== 'string' || !obj.title.trim()) obj.title = request.slice(0, 40);
      const v = validateDeck(obj);
      if (v.ok) return obj;
    } catch {
      /* 다음 시도 */
    }
  }
  return null;
}

/** 한 줄 요청 → DeckSpec(테마는 에이전트가 주제에 맞게 선택). 실패 시 '제목만 채운' 최소 덱. */
export async function generateDeck(request: string, chip?: SlideChips): Promise<DeckSpec> {
  const r = await classify(request, chip);
  const deck = await buildDeck(request, r);
  if (deck) return deck;
  const title = request.trim().slice(0, 40) || '새 슬라이드';
  return {
    category: r.category,
    theme: DEFAULT_THEME[r.category],
    ratio: '16:9',
    ageBand: r.ageBand,
    title,
    slides: [
      { layout: 'title', blocks: [{ type: 'title', text: title }, { type: 'subtitle', text: '내용을 입력하거나 다시 생성해 보세요' }] },
    ],
  };
}
