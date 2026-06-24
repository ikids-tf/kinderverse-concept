/**
 * 게임 디자인 에이전트 (Tier1 — agent.studio 계열의 '게임' 특화 두뇌).
 *
 * 역할 경계(하드 룰): 에이전트는 '내용·교육 설계'만 한다 —
 *   ① 주제에 맞는 메커니즘 선택(10종 중)  ② 풍부한 내용(라벨·정답·짝·통…)
 *   ③ 학습 목표 + 누리과정 영역           ④ 교사 활동 카드(도입 발문·진행·확장·평가)
 * 구조(behavior 배선·좌표·연결)는 절대 만들지 않는다 — 그건 결정론 Resolver(레시피)가 조립한다.
 * 이 경계가 안정성의 핵심이다(예전 LLM 구조 생성 → "완료 불능" 버그 차단).
 *
 * 호출부(createInteractiveGame): designGame() 우선 → 실패/한도면 resolveIntent(규칙) → compose 폴백.
 * 즉 에이전트는 사슬의 '맨 위 지능층'이고, 그 아래 결정론 경로가 항상 바닥을 받친다.
 *
 * 프로바이더: callGateway(auto → gemini 폴백) — fillSlots 와 동일(Anthropic 한도 대응).
 * 적합성: PEDAGOGY_FOUNDATION 상속(다른 Tier1 에이전트와 동일 레이어).
 */
import { callGateway } from '@/ai/client';
import { extractJson } from '@/ai/json';
import { PEDAGOGY_FOUNDATION } from '@/ai/pedagogy';
import { implementedMechanisms } from './index';
import type { MechanismId, RecipeInput } from './recipeTypes';

type Content = Omit<RecipeInput, 'docId'>;

/** 교사 대면 활동 카드 — 게임(아이 대면)과 별개. 동반 저장소(gameCards)에 docId로 보관. */
export interface TeacherCard {
  title: string;
  /** 만 연령(3~5). 모르면 4(중간). */
  age: 3 | 4 | 5;
  mechanism: MechanismId;
  /** 기대 경험 1문장("~하며 ~을 경험한다"). */
  objective: string;
  /** 누리과정 5영역 중. */
  domains: string[];
  /** 도입 발문/안내(교사가 여는 말). */
  intro: string;
  /** 진행 — 교사가 '하는 말·행동' 기준 3~4단계. */
  steps: string[];
  /** 확장 활동(심화·연계). */
  extensions: string[];
  /** 관찰·평가 포인트. */
  assessment: string;
}

export interface DesignedGame {
  mechanism: MechanismId;
  /** 레시피 입력 '내용'(docId 제외) — assembleAndPlace 로 결정론 조립. */
  input: Content;
  card: TeacherCard;
}

/* ──────────────── 캐시(프롬프트 단위 — 한도·비용 절약) ──────────────── */
const CACHE_KEY = 'kv:resolver:design:v1';
function cacheGet(k: string): DesignedGame | null {
  try {
    return (JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') as Record<string, DesignedGame>)[k] ?? null;
  } catch {
    return null;
  }
}
function cacheSet(k: string, v: DesignedGame): void {
  try {
    const all = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') as Record<string, DesignedGame>;
    all[k] = v;
    localStorage.setItem(CACHE_KEY, JSON.stringify(all));
  } catch {
    /* quota — 캐시 생략 */
  }
}

/* ──────────────── 시스템 프롬프트(내용·교육 설계만, 구조 금지) ──────────────── */
const MECH_SPEC = `[고를 수 있는 놀이 방식 — 정확히 하나만 mechanism 으로 선택]
- sequence-order : 정해진 순서대로 탭하며 세기(1,2,3…). content.items=순서대로 셀 대상들, content.actorLabel=세어 주는 캐릭터.
- path-trace     : 캐릭터를 길 따라 목표까지 데려가기. content.actorLabel=움직일 캐릭터, content.goalLabel=목표 지점, content.items=길 위 디딤돌(선택).
- pair-match     : 어울리는 둘을 연결. content.pairs=[{left,right}] (예: 동물-새끼, 사물-그림자).
- tap-select     : 여럿 중 정답만 골라 탭(찾기·고르기). content.items=[{label,correct}] — 정답은 correct:true, 헷갈리는 오답은 correct 생략.
- branch-choose  : 상황에서 옳은 선택 고르기(안전·생활습관). content.items=[{label,correct,speak}](정답 1개만 correct:true, 오답은 speak로 반응), content.goalLabel=정답일 때 보여줄 결과.
- combine        : A+B를 합쳐 C 만들기(색 섞기·자연 변화·요리). content.items=[{label:A},{label:B}], content.goalLabel=결과 C.
- sort-to-bin    : 끌어서 정답 통에 분류. content.bins=[{key,label}](2~3통), content.items=[{label,binKey}](각 통에 고르게).
- slot-fill      : 끌어서 빈칸 채우기(분류와 같은 형식). content.bins, content.items[binKey].
- free-create    : 캐릭터 꾸미기(승패 없는 열린 놀이). content.actorLabel=꾸밀 주인공(예: 토끼), content.bins=[{key,label}] 꾸밀 부위 카테고리(머리 위→아래 순, 예: 모자·목도리·신발, 2~3개), content.items=[{label,binKey}] 각 부위의 선택지(예: 빨간 모자·파란 모자, binKey=부위). 아이가 팔레트에서 골라 캐릭터에 입힌다.
- memory-flip    : 카드를 뒤집어 그림 공개·세기. content.items=[{label}] — 카드에 그릴 그림들.`;

function system(): string {
  const role = `너는 킨더버스 Tier1 '게임 디자인' 에이전트다. 교사의 한국어 요청을 받아 유아 인터랙티브 놀이를 '설계'한다.

${MECH_SPEC}

[하드 룰]
- 너는 '내용·교육 설계'만 한다. 좌표·behavior·동작·구조·완료조건은 절대 만들지 마라(다른 시스템이 결정론으로 조립한다).
- 주제에 가장 알맞고 유아가 '실제로 해 볼 수 있는' 놀이 방식 하나를 mechanism으로 고른다(요청에 '꾸미기'면 free-create, '분류'면 sort-to-bin 등 동사 우선).
- 라벨은 한국어, 유아에게 친숙하고 그림 하나로 그리기 쉬운 단일 사물. 추상어·문장 금지.
- 연령(age 3~5)에 맞춰 항목 수·난이도를 정한다: 만3=항목 적고 단순(3~4), 만4=보통(5~7), 만5=많고 심화(7~10). 무근거 난이도 상향 금지.
- domains 는 누리과정 5영역에서만: 신체운동·건강 / 의사소통 / 사회관계 / 예술경험 / 자연탐구.
- teacherCard.steps 는 교사가 진행하며 '하는 말·행동' 기준 3~4단계(유아는 글을 못 읽으므로). 예: "그림을 함께 보며 '어떤 친구가 숨었을까?' 묻는다".
- objective 는 기대 경험 1문장: "~하며 ~을 경험한다 / ~에 관심을 가진다".
- sceneDesc 는 놀이가 펼쳐질 '한 장면' 배경 묘사(글자 없는 그림). 주제 분위기를 담되 단순하게.
- 설명·인사·마크다운 금지. 아래 형식의 JSON 하나만 출력.

[출력 JSON 형식]
{
  "mechanism": "<위 10종 중 하나>",
  "title": "<짧은 놀이 제목>",
  "theme": "<핵심 주제 명사>",
  "age": 3,
  "objective": "<기대 경험 1문장>",
  "domains": ["<누리 영역>", "..."],
  "content": {
    "items": [{ "label": "사과", "correct": true, "binKey": "b1", "speak": "" }],
    "bins": [{ "key": "b1", "label": "과일" }],
    "pairs": [{ "left": "엄마 곰", "right": "아기 곰" }],
    "actorLabel": "", "goalLabel": "", "sceneDesc": ""
  },
  "teacherCard": {
    "intro": "<도입 발문>",
    "steps": ["<진행 단계>", "..."],
    "extensions": ["<확장 활동>", "..."],
    "assessment": "<관찰·평가 포인트>"
  }
}
선택한 mechanism 이 쓰는 content 필드만 채우면 된다(나머지는 생략 가능).`;
  return [role, PEDAGOGY_FOUNDATION].filter(Boolean).join('\n\n');
}

/* ──────────────── 정규화(LLM 원본 → 안전한 {mechanism, input, card}) ──────────────── */
const NURI = ['신체운동·건강', '의사소통', '사회관계', '예술경험', '자연탐구'];
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const strList = (v: unknown, cap: number): string[] =>
  arr(v).map((x) => str(x)).filter((x): x is string => !!x).slice(0, cap);

/** content 의 items → RecipeItem[](라벨 필수, 나머지 선택). */
function items(v: unknown): { label: string; correct?: boolean; binKey?: string; speak?: string }[] {
  return arr(v)
    .map((it) => {
      const o = it as Record<string, unknown>;
      const label = str(o.label);
      if (!label) return null;
      const r: { label: string; correct?: boolean; binKey?: string; speak?: string } = { label };
      if (o.correct === true) r.correct = true;
      const bk = str(o.binKey);
      if (bk) r.binKey = bk;
      const sp = str(o.speak);
      if (sp) r.speak = sp;
      return r;
    })
    .filter(Boolean) as { label: string; correct?: boolean; binKey?: string; speak?: string }[];
}
function pairs(v: unknown): { left: string; right: string }[] {
  return arr(v)
    .map((p) => {
      const o = p as Record<string, unknown>;
      const l = str(o.left);
      const r = str(o.right);
      return l && r ? { left: l, right: r } : null;
    })
    .filter(Boolean) as { left: string; right: string }[];
}

/**
 * 메커니즘별로 필요한 content 만 추려 안전한 Content 를 만든다. 최소 불변 미달이면 null
 * (→ 호출부가 결정론 폴백). 레시피의 최종 buildRecipe+safeParse 가 한 번 더 막는다(이중 바닥).
 */
function toContent(mech: MechanismId, title: string, sceneDesc: string | null, c: Record<string, unknown>): Content | null {
  const its = items(c.items);
  const prs = pairs(c.pairs);
  const scene = sceneDesc ?? undefined;
  const base = { title, sceneDesc: scene };

  switch (mech) {
    case 'sequence-order': {
      const list = its.slice(0, 12);
      if (list.length < 2) return null;
      return { ...base, actorLabel: str(c.actorLabel) ?? '다람쥐', items: list };
    }
    case 'tap-select': {
      const list = its.slice(0, 12);
      if (list.length < 2) return null;
      if (!list.some((i) => i.correct)) list.forEach((i) => (i.correct = true)); // 정답 표시 없으면 '모두 찾기'
      return { ...base, items: list };
    }
    case 'memory-flip': {
      const list = its.slice(0, 10);
      return list.length >= 2 ? { ...base, items: list } : null;
    }
    case 'path-trace':
      return {
        ...base,
        actorLabel: str(c.actorLabel) ?? '토끼',
        goalLabel: str(c.goalLabel) ?? '집',
        items: its.length ? its.slice(0, 5) : Array.from({ length: 3 }, () => ({ label: '징검돌' })),
      };
    case 'pair-match': {
      const list = prs.slice(0, 5);
      return list.length >= 1 ? { ...base, pairs: list } : null;
    }
    case 'free-create': {
      // 레이어드 꾸미기 — actorLabel + bins(부위) + items(선택지). bins 없으면 pairs 토글 폴백.
      const bins = arr(c.bins)
        .map((b, i) => {
          const o = b as Record<string, unknown>;
          const label = str(o.label);
          return label ? { key: str(o.key) ?? `c${i + 1}`, label } : null;
        })
        .filter(Boolean)
        .slice(0, 3) as { key: string; label: string }[];
      if (bins.length >= 1 && its.length >= 1) {
        const keys = new Set(bins.map((b) => b.key));
        const list = its.slice(0, 12).map((it, i) => ({
          label: it.label,
          binKey: it.binKey && keys.has(it.binKey) ? it.binKey : bins[i % bins.length].key,
        }));
        return { ...base, actorLabel: str(c.actorLabel) ?? '친구', bins, items: list };
      }
      const prs2 = prs.slice(0, 4);
      return prs2.length >= 1 ? { ...base, pairs: prs2 } : null;
    }
    case 'branch-choose': {
      const list = its.slice(0, 4);
      if (list.length < 2) return null;
      if (!list.some((i) => i.correct)) list[0].correct = true;
      return { ...base, items: list, goalLabel: str(c.goalLabel) ?? undefined };
    }
    case 'combine': {
      const list = its.slice(0, 2);
      const goal = str(c.goalLabel);
      return list.length >= 2 && goal ? { ...base, items: list, goalLabel: goal } : null;
    }
    case 'sort-to-bin':
    case 'slot-fill': {
      const bins = arr(c.bins)
        .map((b, i) => {
          const o = b as Record<string, unknown>;
          const label = str(o.label);
          return label ? { key: str(o.key) ?? `b${i + 1}`, label } : null;
        })
        .filter(Boolean)
        .slice(0, 3) as { key: string; label: string }[];
      if (bins.length < 1) return null;
      const keys = new Set(bins.map((b) => b.key));
      const list = its.slice(0, 12).map((it, i) => ({
        label: it.label,
        binKey: it.binKey && keys.has(it.binKey) ? it.binKey : bins[i % bins.length].key, // 미지정/오류 → 순환
      }));
      if (list.length < 2) return null;
      return { ...base, bins, items: list };
    }
    default:
      return null;
  }
}

function clampAge(v: unknown): 3 | 4 | 5 {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
  return n === 3 || n === 5 ? n : 4;
}

/**
 * 교사 프롬프트 → 설계된 게임(메커니즘 + 내용 + 교사 카드). 실패/한도/형식미달이면 null.
 * onBusy 로 진행 메시지(프롬프트바 스트리밍)를 흘린다.
 */
export async function designGame(prompt: string, onBusy?: (m: string | null) => void): Promise<DesignedGame | null> {
  const key = prompt.trim();
  const cached = cacheGet(key);
  if (cached) return cached;

  onBusy?.('🧠 놀이를 교육적으로 설계하는 중…');
  const ask = (provider: 'auto' | 'gemini') =>
    callGateway({
      task: 'interactive-compose',
      tier: 'high',
      provider,
      responseFormat: 'json',
      fallback: ['mid'],
      system: system(),
      messages: [{ role: 'user', content: `교사 요청: "${prompt}". 위 형식의 설계 JSON 하나만 출력.` }],
      meta: { kind: 'game_design' },
      maxTokens: 1600,
    });
  // 한 프로바이더가 막혀도(예: Anthropic 한도) 다른 쪽으로.
  let res = await ask('auto');
  if (!res.ok || res.mocked || !res.text) res = await ask('gemini');
  if (!res.ok || res.mocked || !res.text) return null;

  let raw: Record<string, unknown>;
  try {
    raw = (extractJson(res.text) ?? {}) as Record<string, unknown>;
  } catch {
    return null;
  }

  const mech = str(raw.mechanism) as MechanismId | null;
  if (!mech || !implementedMechanisms().includes(mech)) return null;

  const title = (str(raw.title) ?? prompt.trim().slice(0, 30)) || '인터랙티브';
  const sceneDesc = str((raw.content as Record<string, unknown>)?.sceneDesc) ?? str(raw.theme);
  const content = toContent(mech, title, sceneDesc, (raw.content as Record<string, unknown>) ?? {});
  if (!content) return null;

  const age = clampAge(raw.age);
  const tc = (raw.teacherCard ?? {}) as Record<string, unknown>;
  const domains = strList(raw.domains, 3).filter((d) => NURI.includes(d));
  const card: TeacherCard = {
    title,
    age,
    mechanism: mech,
    objective: str(raw.objective) ?? '놀이에 즐겁게 참여하며 주제에 관심을 가진다.',
    domains: domains.length ? domains : ['자연탐구'],
    intro: str(tc.intro) ?? '오늘은 어떤 놀이를 해 볼까요? 그림을 함께 살펴봅니다.',
    steps: strList(tc.steps, 6).length ? strList(tc.steps, 6) : ['그림을 함께 보며 무엇이 있는지 이야기 나눈다.', '교사가 먼저 한 번 보여 준 뒤 유아가 직접 해 보게 한다.'],
    extensions: strList(tc.extensions, 4),
    assessment: str(tc.assessment) ?? '놀이에 관심을 보이며 끝까지 참여하는지 관찰한다.',
  };

  const designed: DesignedGame = { mechanism: mech, input: content, card };
  cacheSet(key, designed);
  return designed;
}
