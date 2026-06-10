import type { AddableType } from './commands';

/* 빈 요소 추가 파서 — "이미지 카드 3개 추가해줘"처럼 주제·맥락 없이 툴바 요소(이미지/
   텍스트/메모/도형/프레임)를 N개 놓아달라는 요청을 감지한다. 주제가 섞이면(예: "겨울
   동물 이미지 3개 그려줘") null을 돌려 기존 AI 생성 경로로 넘긴다.
   판정법: 인식 토큰(요소어·개수·"카드"·추가동사·조사/군더더기)을 모두 지운 뒤 남는
   말이 없으면 = 주제 없음 → 빈 요소 배치. 남으면 = 주제 있음 → AI 생성. */

/** 요소어 → 타입. '그림'은 단독이면 AI 그리기와 헷갈리므로 '그림 카드'만 인정. */
const TYPE_WORDS: Array<{ type: AddableType; re: RegExp }> = [
  { type: 'image', re: /이미지|그림\s*카드|사진\s*카드|포토\s*카드/ },
  { type: 'text', re: /텍스트|글\s*상자|글자\s*카드/ },
  { type: 'sticky', re: /메모|스티키|포스트\s*잇|쪽지/ },
  { type: 'shape', re: /도형|네모(?!칸)|사각형|동그라미\s*도형/ },
  { type: 'frame', re: /프레임|구역\s*틀|섹션\s*틀/ },
];

/** 추가 의도 동사(생성 동사 '그려/작성/써' 등 콘텐츠 동사는 제외 — 그건 AI 경로). */
const ADD_VERB_RE = /추가|넣어?|놓아?|올려|배치|만들어?\s*줘?|생성|생기게|줘|주세요|줄래/;

const KO_NUM: Record<string, number> = {
  한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10,
};

function parseCount(text: string): number {
  const a = text.match(/(\d+)\s*(?:개|장|컷)/);
  if (a) return parseInt(a[1], 10);
  const k = text.match(/(한|두|세|네|다섯|여섯|일곱|여덟|아홉|열)\s*(?:개|장)/);
  if (k) return KO_NUM[k[1]] ?? 1;
  const bare = text.match(/(?:^|\s)(\d+)(?:\s|$)/);
  if (bare) return parseInt(bare[1], 10);
  return 1;
}

/** 인식 가능한 토큰을 모두 제거 — 남는 게 없으면 "주제 없는 순수 추가" 요청. */
function stripRecognized(text: string, typeRe: RegExp): string {
  return text
    .replace(typeRe, ' ')
    .replace(/카드|박스/g, ' ')
    .replace(/(\d+)\s*(?:개|장|컷)/g, ' ')
    .replace(/(한|두|세|네|다섯|여섯|일곱|여덟|아홉|열)\s*(?:개|장)/g, ' ')
    .replace(ADD_VERB_RE, ' ')
    .replace(/해\s*주세요|해\s*줘|해줄래|부탁(해|해요|드려요)?/g, ' ')
    // 군더더기·조사: 빈/그냥/새/새로/좀/여기/거기/위에/보드(에)/화면(에) + 흔한 조사
    .replace(/빈|그냥|새로|새|좀|여기에?|거기에?|위에|보드에?|화면에?|를|을|이|가|로|으로|에|의|와|과|랑|이랑|들|개의/g, ' ')
    .replace(/[.,!?~\-·、，。\s]/g, '')
    .trim();
}

/** 주제 없는 "요소 N개 추가" 요청이면 {type,count}, 아니면 null. */
export function parseEmptyPrimitiveRequest(text: string): { type: AddableType; count: number } | null {
  const hit = TYPE_WORDS.find((t) => t.re.test(text));
  if (!hit) return null;
  if (!ADD_VERB_RE.test(text)) return null; // 추가 의도가 명시되어야 함
  // 콘텐츠 생성 동사가 있으면(그려/작성/써) 주제 기반 생성으로 본다.
  if (/그려|그리기|작성|써\s*줘|적어/.test(text)) return null;
  const rest = stripRecognized(text, hit.re);
  if (rest.length > 0) return null; // 남은 말 = 주제 → AI 생성 경로
  return { type: hit.type, count: parseCount(text) };
}
