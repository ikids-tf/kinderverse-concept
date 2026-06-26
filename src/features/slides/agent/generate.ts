/* 장표(슬라이드) 에이전트 — 교사의 한 줄 요청 → DeckSpec 자동 생성.
   2단계: ① Router(저티어/Haiku)로 {category, ageBand, lengthHint} 분류
          ② 장표 에이전트(lesson/parent=Sonnet, admin=Haiku)로 DeckSpec JSON 생성.
   출력은 펜스 제거 → 스키마 검증 → 실패 시 1회 재요청(slides-feature/SKILL §7·9).
   프롬프트 원문 단일 출처: slides-feature/PROMPTS.md (아래 인라인은 그 사본).
   ※ 차트는 SlideChart(recharts)로 실제 렌더, 이미지는 IDB asset 연결(자리표시는 미설정 시에만). */

import { callGateway } from '@/ai/client';
import { extractJson } from '@/ai/json';
import { KV_ART_STYLE } from '@/ai/agents/studio';
import { storeSlideImage } from '../assets/slideAssets';
import {
  validateDeck,
  isImage,
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

export interface Research {
  text: string;
  sources: { title?: string; url: string }[];
}

/** 웹 리서치(Gemini Google Search 그라운딩) — 슬라이드 생성 '전에' 주제를 현장 수준으로 조사한다.
    카테고리에 맞춘 질의로 누리과정 연계·구체 활동/발문·발달 근거·가정 연계·수치/사례를 모아 와
    buildDeck 프롬프트에 '근거 자료'로 주입한다(일반론·기초적 결과 방지). Gemini 키가 없으면(mocked)
    null 을 돌려주고 비그라운딩 생성으로 진행(기능 저하 없이). */
async function researchTopic(request: string, r: RouterOut): Promise<Research | null> {
  const focus: Record<Category, string> = {
    lesson: `유아(${r.ageBand}) 대상 "${request}" 수업·놀이 활동을 설계하는 데 필요한 현장 핵심 정보를 찾아라: 2019 개정 누리과정 연계 영역·경험, 도입–전개–마무리 구체적 활동 전개와 교사 발문 예시, 준비물, 안전·유의점, 발달적 의의. 구체적 활동명·발문까지.`,
    parent: `유치원 학부모 설명회/부모참여수업 "${request}" 자료에 필요한 현장 핵심을 찾아라: 교육적 의의와 발달 근거, 학부모에게 전할 핵심 메시지, 가정에서 이어 할 수 있는 연계 활동, 학부모가 자주 묻는 점, 최신 권장 사항·동향. 가능하면 수치·사례.`,
    admin: `유치원 "${request}" 운영·보고 문서에 필요한 핵심을 찾아라: 주요 항목·절차, 점검 지표, 일정, 행정·안전 유의사항, 모범 사례. 가능하면 수치·기준.`,
  };
  const system =
    '너는 유아교육 현장 전문가다. 요청 주제로 유치원에서 바로 쓸 자료를 만들기 위해 웹에서 최신·정확·실무적 정보를 찾아 한국어 불릿으로 핵심만 정리한다. 추측 금지, 근거 있는 내용 중심. 수치·구체 사례·활동명이 있으면 포함한다.';
  try {
    const res = await callGateway({
      task: 'search',
      tier: 'low',
      provider: 'gemini',
      system,
      messages: [{ role: 'user', content: focus[r.category] }],
      meta: { kind: 'slides_research', title: request },
      maxTokens: 900,
    });
    if (!res.ok || !res.text || res.mocked) return null; // 키 없음/실패 → 비그라운딩 생성
    const text = res.text.trim();
    if (text.length < 40) return null; // 너무 빈약하면 무시
    return { text, sources: res.sources ?? [] };
  } catch {
    return null;
  }
}

/** 장표 에이전트 — DeckSpec JSON 생성 + 스키마 검증(실패 시 1회 강화 재요청). */
async function buildDeck(request: string, r: RouterOut, research?: Research | null, source?: string | null): Promise<DeckSpec | null> {
  // 수업·학부모 덱은 '전문가 수준' 지시 준수·콘텐츠 깊이가 중요 → 최상위 모델(Opus). admin(보고)은 mid로 충분.
  const tier = r.category === 'admin' ? 'mid' : 'high';
  const fallbackTheme = DEFAULT_THEME[r.category];
  const system = `너는 킨더버스의 "장표" 에이전트다. 유치원 교사를 위한 '전문가 수준' 슬라이드 덱을 설계한다.
출력은 DeckSpec JSON 하나뿐 — JSON 외 텍스트·마크다운 펜스 금지.

[디자인 원칙 — 아마추어처럼 보이지 않게]
- 한 슬라이드 한 메시지. 헤드라인은 8단어 이내로 단정하게(문장 나열 금지).
- 위계: 가장 중요한 것이 가장 크게. 본문은 짧게, 불릿은 3~5개·명사형.
- 단조로움 금지: 같은 레이아웃을 연달아 쓰지 마라. 밀도를 의도적으로 바꿔라(여유로운 표지/섹션 ↔ 촘촘한 내용).
- 내러티브 아크로 엮어라(도입 훅 → 전개 → 마무리). 막과 막 사이엔 section-divider 한 장.
- 수치(퍼센트·개수·금액)는 문장에 묻지 말고 big-stat 또는 chart로 '크게' 보여라.

[내용 깊이 — 현장에서 바로 쓰는 수준(절대 기초·뻔하게 쓰지 마라)]
- 일반론·교과서적 상투어 금지. 구체적 활동명·교사 발문·단계·준비물·수치·사례로 채운다.
- 학부모 설명회/부모참여수업·보고용은 발달 근거·데이터(참여율·발달 영역 추이 등)를 곁들여 신뢰감 있게.
- 아래 사용자 메시지에 '웹 리서치' 자료가 주어지면 반드시 그것을 근거로 구체적으로 작성한다(추측·일반론으로 메우지 마라).

[활동 슬라이드 — 필수 규칙(아래는 '레이아웃 다양화'보다 우선한다). 글로만 때우지 마라]
- 탐색·관찰·오감 활동: 반드시 layout="photo-grid" + image 블록 정확히 4개(2×2) + caption 1줄. hero-image나 image-feature(이미지 1장)로 만들지 마라. 각 image.prompt = 서로 다른 구체적 대상(예: 호박 / 박쥐 / 거미 / 사탕).
- 신체·표현·동작 활동: 반드시 layout="photo-grid" + image 블록 4개. 각 prompt = "○○ 동작을 하는 유아 한 명의 전신 모습, 따라 하기 쉬운 또렷한 포즈"(예: 박쥐처럼 두 팔 펼친 유아 / 유령처럼 사뿐 걷는 유아 …). 한 장에 여러 포즈를 몰아넣지 말고 '포즈마다 1장'.
- 만들기·미술 활동: 만드는 활동마다 '별도의 image-feature 슬라이드'로 나눠라(2가지면 슬라이드 2장). 각 슬라이드 = 제목 + 만드는 순서(body 또는 bullets) + image 1개(그 작품을 만들고 있는 유아의 모습). 글만 있는 two-column 만들기 슬라이드 금지.
- 마무리 / 오늘의 배움: layout="bullets". 추상적 질문·한 줄 금지. 오늘 한 '구체적 활동'마다 그 활동으로 아이가 무엇을 경험·배웠는지 누리과정 영역과 묶어 3~5개 불릿으로(예: "호박 가면 만들기 — 가위질로 소근육을, 표정을 고르며 감정 표현을 경험했어요(예술경험·신체운동)").
- 모든 image.prompt는 자기완결적(그 자체로 무엇을 그릴지 명확)·글자 금지.

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

  const sourceBlock = source && source.trim()
    ? `
[원본 자료 — 교사가 이 문서/자료를 슬라이드 뷰어에 연결해 "이걸로 만들어 달라"고 했다. 아래 내용을 '슬라이드로 기획·재구성'하라: 핵심 흐름·요점을 슬라이드 순서로 옮기되, 한 슬라이드 한 메시지로 다듬고 전문적으로 시각화하라(표/문단을 그대로 베끼지 말 것). 이 자료가 슬라이드 내용의 1차 출처다]
${source.trim().slice(0, 3000)}
`
    : '';
  const researchBlock = research
    ? `
[웹 리서치 — 이 주제로 실제 검색한 현장 자료다. 위 원본 자료를 보강하는 '근거'로 써라(수치·사례·최신 동향). 그대로 베끼지 말고 핵심을 슬라이드 구조로 재구성]
${research.text}
`
    : '';
  const base = `카테고리: ${r.category} / 연령: ${r.ageBand} / 목표 슬라이드 수: 약 ${r.lengthHint}장
주제/요청: "${request}"
${sourceBlock}${researchBlock}
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
      fallback: tier === 'high' ? ['mid'] : ['high'],
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

/** 덱의 이미지 블록(prompt 있고 assetId 없음)을 실제 이미지로 채운다 — 슬라이드
    '해당 페이지 내용'에 맞는 삽화를 생성해 IDB(slideAssets)에 저장하고 assetId를 연결한다.
    슬라이드 제목·본문 맥락을 prompt에 더해 그 페이지에 어울리는 그림이 나오게 한다.
    deck을 제자리(in place)에서 수정하므로, 호출 후 같은 deck을 다시 로드하면 그림이 보인다. */
export async function fillDeckImages(
  deck: DeckSpec,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  type Target = { prompt: string; set: (id: string) => void };
  const targets: Target[] = [];
  for (const slide of deck.slides) {
    // 같은 슬라이드의 텍스트(제목·본문)를 맥락으로 묶어 '그 페이지에 맞는' 그림을 유도.
    const ctxText = slide.blocks
      .map((b) => (b.type === 'title' || b.type === 'subtitle' || b.type === 'body' || b.type === 'caption' ? b.text : ''))
      .filter(Boolean)
      .join(' / ')
      .slice(0, 80);
    for (const blk of slide.blocks) {
      if (isImage(blk) && blk.prompt && blk.prompt.trim() && !blk.assetId) {
        const scene = ctxText ? `${blk.prompt} (슬라이드 주제: ${ctxText})` : blk.prompt;
        targets.push({ prompt: scene, set: (id) => { blk.assetId = id; } });
      }
    }
  }
  if (targets.length === 0) return;

  let done = 0;
  let idx = 0;
  const CONCURRENCY = 3; // 게이트웨이 과부하 방지 + 체감 속도 균형
  const worker = async () => {
    while (idx < targets.length) {
      const t = targets[idx++];
      // 실패(예외·빈 응답·폴백 SVG)면 한 번 더 시도 — '생성 안 된 페이지'(AI 생성 자리표시)로 남지 않게.
      // 진짜 이미지(mocked 아님)만 채택하고, 폴백(mocked)이면 다시 시도한다. 2회째도 폴백이면 그거라도 채운다.
      for (let attempt = 1; attempt <= 2; attempt++) {
        let res;
        try {
          res = await callGateway({
            task: 'image',
            provider: 'auto',
            messages: [],
            meta: { prompt: `${t.prompt} — ${KV_ART_STYLE}`, caption: t.prompt.slice(0, 40) },
          });
        } catch {
          continue; // 예외 → 다음 시도
        }
        if (!res.image) continue;
        const real = !res.mocked;
        if (real || attempt === 2) {
          const id = await storeSlideImage(res.image);
          if (id) t.set(id);
        }
        if (real) break; // 진짜 이미지면 완료(폴백이면 한 번 더 시도)
      }
      done += 1;
      onProgress?.(done, targets.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker));
}

/** 활동 슬라이드 이미지 보강(결정론) — LLM(Opus여도)이 활동 슬라이드를 글 위주/이미지 1장으로
    만들어 버리는 걸 강제로 바로잡는다: 탐색·관찰 → photo-grid 이미지 4장 / 신체 → photo-grid 포즈
    4장 / 만들기 → image-feature(이미지 1장). eyebrow(활동 라벨)로만 게이트 → 표지·섹션·도입·마무리는
    건드리지 않는다(오변환 방지). 생성한 image 블록은 fillDeckImages가 실제 그림으로 채운다. */
function enforceActivitySlides(deck: DeckSpec, request: string): void {
  type S = DeckSpec['slides'][number];
  const topic = ((deck.title || request).replace(/슬라이드|만들어\s*줘?|수업\s*자료|자료|수업|활동/g, '').trim()) || deck.title;
  const stripEmoji = (x: string) => x.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '').replace(/^[\s\-—•·]+/, '').trim();
  const textOf = (s: S, t: string) => {
    const b = s.blocks.find((x) => x.type === t) as { text?: string } | undefined;
    return b?.text ?? '';
  };
  const itemsOf = (s: S): string[] => {
    const bl = s.blocks.find((b) => b.type === 'bullets') as { items?: string[] } | undefined;
    if (bl?.items?.length) return bl.items.map(stripEmoji).filter(Boolean);
    const body = textOf(s, 'body');
    return body ? body.split(/[\n·/,]/).map(stripEmoji).filter((x) => x.length >= 2) : [];
  };
  const imgCount = (s: S) => s.blocks.filter((b) => b.type === 'image').length;

  for (const s of deck.slides) {
    const eb = (s.eyebrow ?? '').trim();
    if (!eb) continue; // 표지/섹션/도입엔 eyebrow 없음 → 건드리지 않음
    const explore = /탐색|관찰|오감|감각|살펴|느껴/.test(eb);
    const physical = !explore && /신체|몸|동작|포즈|움직/.test(eb);
    const make = /만들|꾸미|미술|작품/.test(eb);

    if ((explore || physical) && imgCount(s) < 4) {
      const its = itemsOf(s);
      const base = its.length >= 2 ? its : [topic];
      const four = [0, 1, 2, 3].map((i) => base[i] || base[i % base.length] || topic);
      const cap = textOf(s, 'title') || (physical ? '몸으로 표현해요' : `${topic} 살펴보기`);
      s.layout = 'photo-grid';
      s.blocks = [
        ...four.map((it) => ({
          type: 'image' as const,
          role: 'inline' as const,
          assetId: null,
          prompt: physical
            ? `${it}처럼 움직이는 유아 한 명의 전신 모습 — 따라 하기 쉬운 또렷한 포즈, 밝은 동화풍 삽화, 단일 인물`
            : `${it} — ${topic} 주제의 밝은 동화풍 삽화, 단일 사물`,
        })),
        { type: 'caption' as const, text: cap },
      ] as S['blocks'];
    } else if (make && s.layout !== 'image-feature' && s.layout !== 'hero-image' && s.layout !== 'photo-grid') {
      const title = textOf(s, 'title') || `${topic} 만들기`;
      const body = itemsOf(s).slice(0, 5);
      s.layout = 'image-feature';
      s.blocks = [
        { type: 'title' as const, text: title },
        body.length ? { type: 'bullets' as const, items: body } : { type: 'body' as const, text: textOf(s, 'body') || '만드는 순서를 따라가요.' },
        { type: 'image' as const, role: 'inline' as const, assetId: null, prompt: `${title}을(를) 만들고 있는 유아의 모습 — 밝은 동화풍 삽화` },
      ] as S['blocks'];
    }
  }
}

/** 한 줄 요청 → DeckSpec(테마는 에이전트가 주제에 맞게 선택). 실패 시 '제목만 채운' 최소 덱. */
export async function generateDeck(
  request: string,
  chip?: SlideChips,
  onStage?: (s: 'research' | 'build') => void,
  source?: string | null, // 연결한 문서/자료 원문 — 있으면 이 내용을 1차 출처로 슬라이드를 기획한다
): Promise<DeckSpec> {
  const r = await classify(request, chip);
  onStage?.('research');
  const research = await researchTopic(request, r); // 웹 리서치(Gemini 키 없으면 null → 비그라운딩 생성)
  onStage?.('build');
  const deck = await buildDeck(request, r, research, source);
  if (deck) {
    enforceActivitySlides(deck, request); // 활동 슬라이드 이미지 구조 강제(탐색/신체 4그리드·만들기 이미지)
    return deck;
  }
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
