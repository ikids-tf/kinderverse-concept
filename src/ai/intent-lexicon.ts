/* 의도 어휘 사전 — 단일 출처 (docs/INTENT_DIAGNOSIS.md P0-1).
   교사 입력의 표면형(유아교육 현장 어휘)을 의도별로 한 곳에 모은다.
   보드 정규식(prompt.ts), 컴포저(composer.ts), mock 라우터(server/gateway/mock.ts)가
   전부 여기서 import — 층마다 어휘가 어긋나던 문제를 구조적으로 제거한다.
   ※ 어휘 추가는 이 파일만 수정하면 모든 층에 동시 반영된다. */

/* ── 콘텐츠 의도 ──────────────────────────────────────────────────────────── */

export type ContentIntent =
  | 'worksheet' // 활동지 = 인쇄용 A4 한 장(색칠/선잇기/오리기/짝맞추기… 이미지+최소 글자)
  | 'coloring' // 색칠 도안(흑백 라인아트)
  | 'image' // 이미지/그림/사진/일러스트/영상 등 시각물
  | 'plan' // 놀이계획·주안·월안·활동 추천
  | 'letter' // 통신문·알림장·안내문 등 글 문서
  | 'record_story' // 놀이기록(놀이이야기)
  | 'record_observation' // 관찰기록·발달평가
  | 'mindmap'; // 생각그물·주제망

/** 의도별 표면형. 정규식 소스라 '|' 없이 배열로 관리(이스케이프 불필요 단어만). */
const WORDS: Record<ContentIntent, string[]> = {
  worksheet: [
    '활동지', '워크시트', '학습지', '문제지', '놀이지', '학습 ?자료',
    // 활동 유형 자체가 활동지를 의미하는 현장 어휘 —
    // "선 잇기 만들어줘"는 곧 활동지 요청이다.
    '선 ?잇기', '선 ?긋기', '점 ?잇기', '미로 ?찾기', '미로',
    '짝 ?맞추기', '짝짓기', '같은 ?그림 ?찾기', '다른 ?그림 ?찾기', '그림자 ?찾기',
    '오리기', '오려', '가위질', '붙이기 ?놀이', '오리고 ?붙',
    '따라 ?그리기', '따라 ?쓰기', '숫자 ?세기', '수 ?세기', '패턴 ?놀이',
  ],
  coloring: ['도안', '색칠', '컬러링', '색칠공부', '색칠놀이'],
  image: [
    '이미지', '그림', '그려', '그리기', '드로잉', '사진', '일러스트', '삽화',
    '캐릭터', '배경', '포스터', '영상', '동영상', '비디오', '움짤', 'gif',
    // 교실 환경·인쇄 시각물 — 현장에서 매우 흔한 요청
    '환경판', '환경 ?구성', '게시판', '융판', '이름표', '가랜드', '배너', '현수막',
    '메달', '배지', '왕관', '머리띠', '표지', '상장', '초대장', '카드 ?도안',
  ],
  plan: [
    '계획안', '놀이계획', '주간 ?계획', '수업 ?계획', '일일 ?계획', '연간 ?계획',
    '주안', '월안', '교육 ?계획', '활동 ?추천', '활동추천',
    '뭐 ?할만', '뭐 ?하면', '할 ?만한 ?활동', '해볼 ?만한', '아이디어 ?추천',
  ],
  letter: [
    '통신문', '가정 ?통신문', '가정통신문', '알림장', '안내문', '공지', '공지사항',
    '편지', '소식지', '동의서', '신청서', '명렬표', '평가서', '안내장',
    '인사말', '인사글', '식단 ?안내', '주간 ?안내', '월간 ?안내',
    '동시', '동요 ?가사', '손유희', '이야기 ?나누기 ?자료',
  ],
  record_story: ['놀이기록', '놀이 ?이야기', '활동기록', '오늘 ?놀이', '일과 ?기록', '오늘의 ?기록'],
  record_observation: ['관찰기록', '관찰 ?일지', '관찰', '발달 ?평가', '발달 ?기록', '행동 ?관찰'],
  mindmap: [
    '마인드 ?맵', '생각 ?그물', '주제 ?망', '주제망',
    '놀이 ?확장 ?맵', '놀이 ?아이디어 ?맵', '아이디어 ?맵', '관심사 ?확장', '확장 ?맵',
    '브레인 ?스토밍',
  ],
};

function build(words: string[]): RegExp {
  return new RegExp(words.join('|'), 'i');
}

/** 의도별 컴파일된 정규식(기존 *_RE 호환용 export 포함). */
export const INTENT_RE: Record<ContentIntent, RegExp> = {
  worksheet: build(WORDS.worksheet),
  coloring: build(WORDS.coloring),
  image: build(WORDS.image),
  plan: build(WORDS.plan),
  letter: build(WORDS.letter),
  record_story: build(WORDS.record_story),
  record_observation: build(WORDS.record_observation),
  mindmap: build(WORDS.mindmap),
};

// 기존 코드 호환 별칭(prompt.ts / composer.ts의 *_RE 치환용).
export const WORKSHEET_RE = INTENT_RE.worksheet;
export const COLORING_RE = INTENT_RE.coloring;
export const IMAGE_RE = INTENT_RE.image;
export const PLAN_RE = INTENT_RE.plan;
export const LETTER_RE = INTENT_RE.letter;
export const MINDMAP_RE = INTENT_RE.mindmap;

/** 매칭 우선순위 — 더 구체적인 산출물이 먼저 이긴다.
    (활동지·도안은 '그림'을 포함하기 쉬우므로 image보다 앞,
     기록·계획·문서는 시각물 단서가 없을 때만 image로.) */
const PRIORITY: ContentIntent[] = [
  'coloring', 'worksheet', 'mindmap', 'plan',
  'record_observation', 'record_story', 'letter', 'image',
];

/** 키워드 fast-path: 매칭되는 첫 의도, 없으면 null(→ 라우터 모델에 위임). */
export function contentIntentFast(text: string): ContentIntent | null {
  for (const k of PRIORITY) if (INTENT_RE[k].test(text)) return k;
  return null;
}

/* ── 산출물 개수·이미지 주제 파서(스튜디오·mock 공유) ─────────────────────── */

const KO_COUNT: Record<string, number> = {
  한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10,
};

/** 요청에 명시된 산출물 개수("10개/열 장/3가지/각각 5개") — 없으면 null. */
export function requestedCount(text: string): number | null {
  const a = text.match(/(\d+)\s*(?:개|장|가지|컷|마리|종류)/);
  if (a) return Math.max(1, parseInt(a[1], 10));
  const k = text.match(/(한|두|세|네|다섯|여섯|일곱|여덟|아홉|열)\s*(?:개|장|가지|컷|마리|종류)/);
  if (k) return KO_COUNT[k[1]] ?? null;
  return null;
}

/** 명령문에서 '핵심 주제'만 — 첫 명령 어미("…그려줘/바꿔줘/만들어 주세요")부터 문장
    끝까지 잘라내고("그려줘 각각"처럼 뒤에 붙은 꼬리까지), 군더더기·끝 조사를 정리한다.
    수량 표현("5가지")은 정보라서 남긴다. 프레임 제목/헤더·이미지 캡션 등 표시용.
    "바다에 사는 생물 5가지 그려줘 각각" → "바다에 사는 생물 5가지"
    "거북이를 탄 토끼로 바꿔줘 이미지를" → "거북이를 탄 토끼" */
export function coreTopic(text: string): string {
  let t = text
    .replace(/(각각|모두|전부|서로\s*다른)\s*/g, ' ')
    // 첫 명령 동사+어미부터 끝까지 제거 — 어미(줘/주세요…)가 붙은 형태만 자른다
    // ("만들기 활동지"의 '만들기' 같은 주제어는 보존).
    .replace(
      /\s*(?:을|를|좀)?\s*(?:그려|그리|만들어|만들|작성해|써|짜|생성해|생성|추천해|찾아|꾸며|바꿔|바꾸어|수정해|고쳐|넣어|추가해|해)\s*(?:줘|주세요|줄래|주라|달라|다오)[\s\S]*$/u,
      '',
    )
    .replace(/\s{2,}/g, ' ')
    .trim();
  // 끝에 남은 조사("…토끼로") 정리 — 2글자 이하 단어("도로")는 건드리지 않는다.
  if (t.length > 2) t = t.replace(/(?:으로|로|을|를|이|가|은|는|좀)$/u, '').trim();
  return t || text.trim();
}

/** 그리기 요청에서 '주제'만 남긴다 — 수량·"각각"·그려줘류 어미 제거.
    "직업에 따른 자동차를 각각 10개 그려줘" → "직업에 따른 자동차". */
export function imageSubject(text: string): string {
  return (
    text
      .replace(/(각각|모두|전부|서로\s*다른)\s*/g, ' ')
      .replace(/(\d+|한|두|세|네|다섯|여섯|일곱|여덟|아홉|열)\s*(?:개|장|가지|컷|마리|종류)(?:씩)?\s*/g, ' ')
      .replace(/(을|를|좀|한\s*장|하나)?\s*(그려\s*주세요|그려\s*줘|그려|그림\s*그려|그림|그리기|만들어\s*주세요|만들어\s*줘|만들어|생성해?\s*줘?|해\s*줘)[.!~ ]*$/u, '')
      .replace(/\s{2,}/g, ' ')
      .trim() || text
  );
}

/* ── 보드 조작(화면 지시) 의도 ────────────────────────────────────────────── */

export type BoardOpType =
  | 'resize_up' | 'resize_down' | 'match_size'
  | 'move'
  | 'group'
  | 'align' | 'arrange'
  | 'delete' | 'duplicate'
  | 'recolor';

export interface BoardOpMatch {
  op: BoardOpType;
  /** move 방향(왼쪽/오른쪽/위/아래). */
  dir?: 'left' | 'right' | 'up' | 'down';
  /** recolor 대상 시맨틱 색 토큰(COLOR_BG 키와 일치). */
  color?: string;
}

const OP_RE: Array<{ op: BoardOpType; re: RegExp }> = [
  // resize·duplicate보다 먼저 — "사이즈 똑같이 맞춰/크기 통일"이 그쪽에 잡히지 않게.
  { op: 'match_size', re: /(크기|사이즈|싸이즈)\s*(를|도|들|가|좀)?\s*(맞|통일|같게|똑같)|같은\s*(크기|사이즈|싸이즈)/ },
  { op: 'resize_up', re: /크게|키워|확대|늘려/ },
  { op: 'resize_down', re: /작게|줄여|축소/ },
  { op: 'delete', re: /지워|삭제|없애|치워/ },
  { op: 'duplicate', re: /복사|복제|하나 ?더|똑같이 ?만들/ },
  { op: 'group', re: /묶어|그룹|합쳐/ },
  { op: 'align', re: /정렬|나란히|줄 ?맞/ },
  { op: 'arrange', re: /정리해|보기 ?좋게|가지런/ },
  { op: 'move', re: /(왼쪽|오른쪽|위|아래)(으?로)|옮겨|이동/ },
  // '색칠'은 coloring(도안) 의도와 충돌하므로 recolor에 포함하지 않는다.
  { op: 'recolor', re: /색(깔)? ?(을|로|으로)? ?바꿔|(노란|노랑|초록|연두|회색|베이지|갈색|주황|코랄|분홍|흰|하얀)색(으?로)/ },
];

const DIR_RE: Array<{ dir: BoardOpMatch['dir']; re: RegExp }> = [
  { dir: 'left', re: /왼쪽/ },
  { dir: 'right', re: /오른쪽/ },
  { dir: 'up', re: /위(로|쪽)/ },
  { dir: 'down', re: /아래/ },
];

/** 색상어 → 디자인 토큰(COLOR_BG 키). 임의 hex 금지(CLAUDE §2-1). */
const COLOR_TOKEN: Array<{ re: RegExp; token: string }> = [
  { re: /노란|노랑|금색/, token: 'gold' },
  { re: /초록|연두|녹색/, token: 'success-soft' },
  { re: /회색|베이지|갈색/, token: 'surface-3' },
  { re: /흰|하얀|밝은/, token: 'surface-2' },
  { re: /주황|코랄|분홍|살구/, token: 'accent-soft' },
];

/** 화면 조작 지시 매칭("이거 더 크게", "왼쪽으로", "노란색으로 바꿔"…). */
export function boardOp(text: string): BoardOpMatch | null {
  for (const { op, re } of OP_RE) {
    if (!re.test(text)) continue;
    const m: BoardOpMatch = { op };
    if (op === 'move') m.dir = DIR_RE.find((d) => d.re.test(text))?.dir;
    if (op === 'recolor') m.color = COLOR_TOKEN.find((c) => c.re.test(text))?.token ?? 'accent-soft';
    return m;
  }
  // 색상어 + 변경 어미("노란색으로 해줘") — '노란색 카네이션 그려줘' 같은
  // 생성 요청과 혼동하지 않도록 변경 동사/어미를 요구한다.
  const color = COLOR_TOKEN.find((c) => c.re.test(text));
  if (color && /(으?로)\s*(바꿔|해\s*줘|변경|만들어\s*줘)?\s*$/.test(text)) {
    return { op: 'recolor', color: color.token };
  }
  return null;
}

/* ── 프레임 디자인/꾸미기(기존 정규식 이전 — 의미 불변) ─────────────────────── */

/** 프레임 선택 + 레이아웃/디자인 명령 → Design Director 재배치. */
export const DESIGN_CMD_RE =
  /정리|정렬|배치|배열|레이아웃|꾸며|꾸미|예쁘게|이쁘게|스티커|장식|디자인|느낌|분위기|테마|크게|작게|강조|위주|중심|열로|컬럼|나란히/;

/** 문서 선택 + "꾸며/학부모 공유" → 소식지. */
export const DECORATE_RE =
  /꾸며|꾸미|예쁘게|예쁘|이쁘|소식지|부모|학부모|공유|장식|디자인|이미지 ?(넣|추가|삽입)/;

/* ── mock 라우터용 매핑(P0-3) ─────────────────────────────────────────────── */

export const INTENT_TO_ROUTE: Record<ContentIntent, { route: 'plan' | 'record' | 'studio' | 'writing' | 'mindmap'; mode?: 'observation' | 'story' }> = {
  worksheet: { route: 'studio' },
  coloring: { route: 'studio' },
  image: { route: 'studio' },
  plan: { route: 'plan' },
  letter: { route: 'writing' },
  record_story: { route: 'record', mode: 'story' },
  record_observation: { route: 'record', mode: 'observation' },
  mindmap: { route: 'mindmap' },
};
