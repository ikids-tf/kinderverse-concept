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

type Content = Omit<RecipeInput, 'docId'>;

const SEMANTIC = new Set<MechanismId>(['sort-to-bin', 'slot-fill', 'pair-match', 'branch-choose', 'combine', 'free-create']);

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
