/**
 * Resolver — 슬롯 충전(§7 내용/구조 경계). 구조는 레시피가 결정론으로 만들고, 여기선 '내용'만:
 *  - 결정론: 테마팩 vocab(또는 명사)로 채울 수 있는 단순 메커니즘(순서·고르기·뒤집기·경로).
 *  - narrow LLM: 의미가 필요한 메커니즘(분류 카테고리·짝·정답·A+B→C·꾸미기 옵션)만 좁은 콜 1회로
 *    '내용 JSON'을 받는다. 구조(behaviors)는 절대 LLM에 안 보낸다. 결과는 캐시(키=메커니즘+프롬프트+개수).
 *  - 실패(키 없음/파싱 실패) → null → 호출부가 composeInteractiveNode 폴백.
 */
import { callGateway } from '@/ai/client';
import { extractJson } from '@/ai/json';
import { pickVocab, resolveTheme, type ThemePack } from './themePacks';
import type { IntentParse } from './selectRecipe';
import type { MechanismId, RecipeInput } from './recipeTypes';
import type { TeacherCard } from './designAgent';

type Content = Omit<RecipeInput, 'docId'>;

const SEMANTIC = new Set<MechanismId>(['sort-to-bin', 'slot-fill', 'pair-match', 'branch-choose', 'combine']);

/** 날씨별 옷입히기 데이터(dress-up) — 라운드당 정답 1 + 오답 2. 결정론(LLM 불필요).
    indoor=실내(창밖에 그 날씨) 캔버스 배경, outdoor='밖에 나가기' 실외 배경. */
const WEATHER: Record<'눈' | '비' | '미세먼지', { title: string; indoor: string; outdoor: string; actor: string; items: Array<{ label: string; correct?: boolean }> }> = {
  눈: {
    title: '눈 오는 날, 뭘 입을까?',
    indoor: '창밖에 함박눈이 내리는 겨울, 아늑하고 따뜻한 실내 거실',
    outdoor: '함박눈이 소복이 내리는 겨울 바깥, 눈사람과 눈 쌓인 나무',
    actor: '어린이',
    items: [{ label: '두꺼운 패딩 점퍼', correct: true }, { label: '반팔 티셔츠' }, { label: '수영복' }],
  },
  비: {
    title: '비 오는 날, 뭘 입을까?',
    indoor: '창밖에 비가 내리고 창문에 빗방울이 맺힌 아늑한 실내',
    outdoor: '비가 내리는 바깥 거리, 물웅덩이와 촉촉한 나뭇잎',
    actor: '어린이',
    items: [{ label: '노란 우비', correct: true }, { label: '반팔 티셔츠' }, { label: '두꺼운 패딩' }],
  },
  미세먼지: {
    title: '미세먼지가 가득한 날, 뭘 챙길까?',
    indoor: '창밖이 뿌옇게 흐린 미세먼지 많은 날의 실내',
    outdoor: '뿌연 미세먼지로 흐릿한 바깥 거리',
    actor: '어린이',
    items: [{ label: '하얀 마스크', correct: true }, { label: '선글라스' }, { label: '수영복' }],
  },
};
/** 프롬프트에서 날씨 추출(미세먼지→비→눈 순, 기본 눈). */
function detectWeather(p: string): '눈' | '비' | '미세먼지' {
  if (/미세\s*먼지|먼지|황사/.test(p)) return '미세먼지';
  if (/비\s*오|비가|장마|우산|빗물|비\s*내리|소나기/.test(p)) return '비';
  return '눈';
}
/** 성별 추출 — 캐릭터(맨몸·착장)를 일관되게 그리려고 라벨에 박는다(따로 생성 시 성별이 달라지는 문제 방지).
    미지정이면 '남자'(기본). 여자아이는 "여자아이 …"로 요청. */
function detectGender(p: string): '남자아이' | '여자아이' {
  if (/여자|여아|소녀|딸|공주|걸\b/.test(p)) return '여자아이';
  return '남자아이';
}

/** dress-up 교사 활동 카드(결정론 — 날씨별). 에이전트를 건너뛰는 dress-up 경로에서 saveGameCard 로 동반 저장. */
export function dressUpTeacherCard(prompt: string): TeacherCard {
  const w = detectWeather(prompt);
  const d = WEATHER[w];
  const correct = d.items.find((i) => i.correct)?.label ?? '알맞은 옷';
  return {
    title: d.title,
    age: 4,
    mechanism: 'dress-up',
    objective: `${w} 날씨를 살펴보고 그에 어울리는 옷차림을 골라 보며, 날씨와 옷의 관계에 관심을 가진다.`,
    domains: ['자연탐구', '신체운동·건강'],
    intro: '창밖을 함께 보며 "오늘 날씨는 어떤가요? 이런 날엔 무엇을 입어야 할까요?" 하고 묻는다.',
    steps: [
      '창밖 날씨를 함께 살펴보며 어떤 날씨인지 이야기 나눈다.',
      `옷 세 가지를 보며 "어떤 옷이 ${w} 오는 날에 맞을까?" 묻고 유아가 골라 입혀 보게 한다.`,
      '알맞은 옷을 입으면 "밖에 나가기"를 눌러 밖에 나간 모습을 함께 본다.',
      '밖에 나간 장면을 보며 "기분이 어때요? 왜 이 옷이 좋을까요?" 이야기 나눈다.',
    ],
    extensions: ['다른 날씨(비·눈·미세먼지)도 만들어 옷차림을 비교해 본다.', '오늘 실제 날씨를 확인하고 등·하원 옷차림을 이야기해 본다.'],
    assessment: `날씨와 옷차림의 관계를 이해하고 '${correct}'처럼 알맞은 옷을 고르는지, 그 이유를 말하는지 관찰한다.`,
  };
}

/** vocab에서 중복 없이 n개(모자라면 순환). */
function pickDistinct(pack: ThemePack, n: number): string[] {
  return pack.vocabulary.length >= n ? pack.vocabulary.slice(0, n) : pickVocab(pack, n);
}

export async function fillSlots(
  prompt: string,
  parse: IntentParse,
  onBusy?: (m: string | null) => void,
): Promise<Content | null> {
  const pack = resolveTheme(prompt);
  const title = prompt.trim().slice(0, 30) || '인터랙티브';
  const noun = parse.themeNoun;
  const count = parse.count;
  const pool = (n: number): string[] => (pack ? pickDistinct(pack, n) : Array.from({ length: n }, () => noun));
  // 테마 장면을 배경 설명으로 실어 보낸다(꼬리에서 generateSceneBackground 로 깐다).
  const withScene = (c: Content | null): Content | null => (c && pack ? { ...c, sceneDesc: pack.scene } : c);

  switch (parse.mechanism) {
    // ── 결정론(vocab/명사 — LLM 콜 없음) ──
    case 'sequence-order':
      return withScene({ title, actorLabel: '다람쥐', items: pool(count).map((l, i) => ({ label: `${i + 1} 적힌 ${l}` })) });
    case 'tap-select':
      return withScene({ title, items: pool(count).map((l) => ({ label: l, correct: true })) });
    case 'memory-flip':
      return withScene({ title, items: pool(count).map((l) => ({ label: l })) });
    case 'path-trace':
      return withScene({ title, actorLabel: noun !== '사물' ? noun : '토끼', goalLabel: '집', items: Array.from({ length: 3 }, () => ({ label: '징검돌' })) });
    case 'free-create': {
      // 레이어드 꾸미기 — 주인공(noun)을 고정하고 범용 부위(모자·목도리)에서 골라 입힌다.
      const subject = noun !== '사물' ? noun : '친구';
      return withScene({
        title,
        actorLabel: subject,
        bins: [
          { key: 'hat', label: '모자' },
          { key: 'scarf', label: '목도리' },
        ],
        items: [
          { label: '빨간 모자', binKey: 'hat' },
          { label: '파란 모자', binKey: 'hat' },
          { label: '노란 모자', binKey: 'hat' },
          { label: '분홍 목도리', binKey: 'scarf' },
          { label: '초록 목도리', binKey: 'scarf' },
        ],
      });
    }
    // ── 날씨 옷입히기(결정론 — 날씨 테이블) ──
    case 'dress-up': {
      const d = WEATHER[detectWeather(prompt)];
      const gender = detectGender(prompt); // '남자아이' | '여자아이'
      // 옷 라벨은 '옷 이름'만(사람·성별어를 안 박는다 — '남아 수영복'이면 AI가 아이를 그려 버림).
      // 성별은 캐릭터(actorLabel)가 가지고, 수영복만 성별이 드러나는 '옷 종류'로 구분.
      const swim = gender === '여자아이' ? '원피스 수영복' : '수영 반바지';
      const items = d.items.map((x) => ({ ...x, label: x.label === '수영복' ? swim : x.label }));
      return { title: d.title, actorLabel: gender, items, sceneDesc: d.indoor, sceneOutDesc: d.outdoor };
    }
    // ── 의미 필요 → narrow LLM(캐시) ──
    default:
      return SEMANTIC.has(parse.mechanism) ? withScene(await fillSemantic(parse.mechanism, prompt, count, title, onBusy)) : null;
  }
}

/* ──────────────── narrow LLM 내용 충전(의미 메커니즘) ──────────────── */

const CACHE_KEY = 'kv:resolver:slots:v1';
function cacheGet(k: string): Content | null {
  try {
    return (JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') as Record<string, Content>)[k] ?? null;
  } catch {
    return null;
  }
}
function cacheSet(k: string, v: Content): void {
  try {
    const all = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') as Record<string, Content>;
    all[k] = v;
    localStorage.setItem(CACHE_KEY, JSON.stringify(all));
  } catch {
    /* quota — 캐시 생략 */
  }
}

/** 메커니즘별 '내용 JSON' 형식 지시(구조·동작은 절대 언급하지 않는다 — 내용만). */
function semanticSystem(mech: MechanismId, count: number): string {
  const base =
    '너는 유아 게임의 "내용"만 고르는 도우미다. 동작·구조·좌표·behavior 는 절대 만들지 마라(다른 시스템이 한다). ' +
    '한국어 라벨로, 유아에게 친숙하고 그림으로 그리기 쉬운 단일 사물만. 설명·마크다운 금지, JSON 하나만 출력.\n';
  switch (mech) {
    case 'sort-to-bin':
    case 'slot-fill':
      return base +
        `형식: {"bins":[{"key":"b1","label":"분류이름"}... 2~3개],"items":[{"label":"사물","binKey":"b1"}... ${count}개]}. ` +
        'items 의 binKey 는 반드시 bins 의 key 중 하나. 각 통에 고르게 분배. 분류 기준은 요청 주제에 맞게(예: 동물/탈것, 과일/채소).';
    case 'pair-match':
      return base + `형식: {"pairs":[{"left":"A","right":"A의 짝"}... ${Math.min(count, 5)}개]}. 의미가 분명히 어울리는 짝(예: 동물-새끼, 사물-그림자, 엄마-아기).`;
    case 'branch-choose':
      return base + '형식: {"items":[{"label":"선택지","correct":true|생략}...2~3개],"goalLabel":"정답일 때 보여줄 결과 사물"}. 정답은 하나만 correct:true. 안전·생활습관 주제 적합.';
    case 'combine':
      return base + '형식: {"items":[{"label":"A"},{"label":"B"}],"goalLabel":"A+B로 만들어지는 결과 C"}. 색 섞기·요리·자연 변화 등 합쳐지는 관계.';
    case 'free-create':
      return base + `형식: {"pairs":[{"left":"옵션A","right":"옵션B"}... ${Math.min(count, 4)}개]}. 각 쌍은 한 슬롯에서 번갈아 보일 두 가지(예: 빨간모자/파란모자, 웃는얼굴/놀란얼굴). 꾸미기용.`;
    default:
      return base;
  }
}

async function fillSemantic(
  mech: MechanismId,
  prompt: string,
  count: number,
  title: string,
  onBusy?: (m: string | null) => void,
): Promise<Content | null> {
  const key = `${mech}|${prompt}|${count}`;
  const cached = cacheGet(key);
  if (cached) return { ...cached, title };

  onBusy?.('🧩 놀이에 넣을 내용을 고르는 중…');
  const ask = (provider: 'auto' | 'gemini') =>
    callGateway({
      task: 'interactive-compose',
      tier: 'mid',
      provider,
      responseFormat: 'json',
      fallback: ['high'],
      system: semanticSystem(mech, count),
      messages: [{ role: 'user', content: `교사 요청: "${prompt}". 위 형식의 내용 JSON 하나만 출력.` }],
      meta: { kind: 'resolver_slots' },
      maxTokens: 800,
    });
  // 한 프로바이더가 막혀도(예: Anthropic 사용량 한도) 다른 쪽으로 — 내용 충전은 단순 JSON이라 둘 다 가능.
  let res = await ask('auto');
  if (!res.ok || res.mocked || !res.text) res = await ask('gemini');
  if (!res.ok || res.mocked || !res.text) return null;
  let raw: unknown;
  try {
    raw = extractJson(res.text);
  } catch {
    return null;
  }
  const content = normalize(mech, raw, title);
  if (content) cacheSet(key, { ...content, title: '' }); // 캐시엔 title 제외(프롬프트마다 다름)
  return content;
}

/** LLM 원본 → 안전한 Content(메커니즘 형식 보증). 형식 미달이면 null. */
function normalize(mech: MechanismId, raw: unknown, title: string): Content | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

  if (mech === 'sort-to-bin' || mech === 'slot-fill') {
    const bins = arr(o.bins)
      .map((b, i) => {
        const ob = b as Record<string, unknown>;
        const label = str(ob.label);
        return label ? { key: str(ob.key) ?? `b${i + 1}`, label } : null;
      })
      .filter(Boolean) as { key: string; label: string }[];
    if (bins.length < 1) return null;
    const keys = new Set(bins.map((b) => b.key));
    const items = arr(o.items)
      .map((it, i) => {
        const oi = it as Record<string, unknown>;
        const label = str(oi.label);
        if (!label) return null;
        let bk = str(oi.binKey);
        if (!bk || !keys.has(bk)) bk = bins[i % bins.length].key; // 미지정/오류 → 순환 분배
        return { label, binKey: bk };
      })
      .filter(Boolean) as { label: string; binKey: string }[];
    if (items.length < 2) return null;
    return { title, bins, items };
  }

  if (mech === 'pair-match') {
    const pairs = arr(o.pairs)
      .map((p) => {
        const op = p as Record<string, unknown>;
        const l = str(op.left);
        const r = str(op.right);
        return l && r ? { left: l, right: r } : null;
      })
      .filter(Boolean) as { left: string; right: string }[];
    return pairs.length >= 1 ? { title, pairs } : null;
  }

  if (mech === 'free-create') {
    const pairs = arr(o.pairs)
      .map((p) => {
        const op = p as Record<string, unknown>;
        const l = str(op.left);
        const r = str(op.right);
        return l && r ? { left: l, right: r } : null;
      })
      .filter(Boolean) as { left: string; right: string }[];
    return pairs.length >= 1 ? { title, pairs } : null;
  }

  if (mech === 'branch-choose') {
    const items = arr(o.items)
      .map((it) => {
        const oi = it as Record<string, unknown>;
        const label = str(oi.label);
        return label ? { label, correct: oi.correct === true } : null;
      })
      .filter(Boolean) as { label: string; correct: boolean }[];
    if (items.length < 2) return null;
    if (!items.some((i) => i.correct)) items[0].correct = true; // 정답 보장
    return { title, items, goalLabel: str(o.goalLabel) ?? undefined };
  }

  if (mech === 'combine') {
    const items = arr(o.items)
      .map((it) => {
        const label = str((it as Record<string, unknown>).label);
        return label ? { label } : null;
      })
      .filter(Boolean) as { label: string }[];
    const goal = str(o.goalLabel);
    return items.length >= 2 && goal ? { title, items: items.slice(0, 2), goalLabel: goal } : null;
  }

  return null;
}
