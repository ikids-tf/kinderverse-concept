/**
 * Resolver — 게임 추천(프롬프트바 '게임' 카테고리용). 입력에 게임 키워드가 있으면 테마(명사)를
 * 뽑아 메커니즘별 '추천 게임' 카드를 만든다. 클릭 시 startInteractiveGame → Resolver 즉시 합성.
 *
 * 카드 썸네일 = '같은 메커니즘의 저장된 게임' 장면 배경(실제 게임화면). 없으면 이모지 폴백.
 * 라이브러리가 늘수록(자동 저장) 실물 썸네일 커버리지가 올라간다. 보관함 이미지·웹링크 추천처럼
 * 키워드 매칭으로 바 위에 뜬다(PromptBar). 결정론(LLM 콜 없음).
 */
import { listLibrary, recommendFromLibrary } from '../store/library';
import { loadInteractiveNode } from '../store/interactiveStore';
import type { InteractiveNode } from '../schema/interactiveNode';
import type { MechanismId } from './recipeTypes';

// '놀이'는 단어 경계로만(물놀이·역할놀이·바깥놀이 같은 합성 토픽어는 게임 의도가 아님 → 제외).
export const GAME_KEYWORD_RE = /게임|퀴즈|인터렉티브|인터랙티브|액티비티|(?:^|[^가-힣])놀이/;
export const hasGameKeyword = (text: string): boolean => GAME_KEYWORD_RE.test(text || '');
/** '자료(아이템·배경)를 숨기고 게임만' 보여 줄 강한 게임어 — '놀이'(광의: 게임+놀이이미지+놀이동영상…)는
    제외해, '놀이'를 입력하면 게임과 자료가 함께 추천되게 한다. */
export const GAME_STRONG_RE = /게임|퀴즈|인터렉티브|인터랙티브|액티비티/;
export const isStrongGameKeyword = (text: string): boolean => GAME_STRONG_RE.test(text || '');

/** 추천에 노출할 메커니즘(동사 + 이모지 폴백). 동사가 Resolver selectRecipe 매핑 키와 일치한다. */
const MECHS: Array<{ emoji: string; verb: string; mech: MechanismId }> = [
  { emoji: '🗑️', verb: '분류하기', mech: 'sort-to-bin' },
  { emoji: '🔢', verb: '순서 세기', mech: 'sequence-order' },
  { emoji: '🧩', verb: '짝 맞추기', mech: 'pair-match' },
  { emoji: '🔍', verb: '찾기', mech: 'tap-select' },
  { emoji: '🃏', verb: '카드 뒤집기', mech: 'memory-flip' },
  { emoji: '🛤️', verb: '길 찾기', mech: 'path-trace' },
  { emoji: '🎨', verb: '꾸미기', mech: 'free-create' },
  { emoji: '✨', verb: '합치기', mech: 'combine' },
  { emoji: '🤔', verb: '골라보기', mech: 'branch-choose' },
  { emoji: '⬜', verb: '빈칸 채우기', mech: 'slot-fill' },
];

export interface GameSuggestion {
  key: string;
  /** 'create' = 레시피로 새로 합성 · 'reuse' = 저장된 게임을 보드에 올려 바로 사용. */
  kind: 'create' | 'reuse';
  emoji: string;
  mechanism?: MechanismId;
  /** 실제 게임화면 썸네일(저장 게임 장면 배경). 없으면 undefined → 이모지 폴백. */
  thumb?: string;
  label: string;
  /** create — startInteractiveGame 에 넘길 프롬프트(동사 포함 → selectRecipe). */
  prompt?: string;
  /** reuse — 보드에 올릴 저장 게임 docId. */
  docId?: string;
}

/* ── 메커니즘별 실제 썸네일(저장 게임 장면 배경) — 라이브러리에서 1회 스캔·캐시 ── */

/** 경량 메커니즘 감지(extend.ts 와 동일 로직 — 무거운 import 체인 회피용 복제). */
function detectMechanism(node: InteractiveNode): MechanismId | null {
  const behs = node.behaviors;
  const has = (fn: (b: InteractiveNode['behaviors'][number]) => boolean) => behs.some(fn);
  const dragTargets = new Set(
    behs.filter((b) => b.action === 'moveAlongPath' && (b.trigger === 'tap' || b.trigger === 'sequenceTap')).map((b) => b.target),
  );
  if (dragTargets.size >= 2) return 'sort-to-bin';
  if (has((b) => b.trigger === 'sequenceTap')) return 'sequence-order';
  if (has((b) => b.action === 'swap' && b.when?.kind === 'flag')) return 'memory-flip';
  if (has((b) => b.action === 'swap')) return 'free-create';
  if (has((b) => b.action === 'setFlag') && has((b) => b.action === 'reveal' && b.when?.kind === 'flag')) return 'branch-choose';
  if (has((b) => b.trigger === 'pathTraverse')) return node.connections.some((c) => c.kind === 'link') ? 'pair-match' : 'path-trace';
  // 완화 — 옛 LLM 게임은 tap→(then)count 처럼 배선이 달라도 '탭+세기'면 고르기로 본다.
  if (has((b) => b.trigger === 'tap') && has((b) => b.action === 'count')) return 'tap-select';
  return null;
}

let thumbCache: { map: Partial<Record<MechanismId, string>>; pool: string[] } | null = null;
/** 저장 게임을 훑어 (메커니즘별 장면 배경) + (모든 장면 배경 풀)을 모은다. 캐시(게임 저장 시 무효화).
    풀은 메커니즘 매칭이 없는 카드도 '실제 게임화면'을 갖도록 돌려 쓰는 폴백. */
function mechanismThumbs(): { map: Partial<Record<MechanismId, string>>; pool: string[] } {
  if (thumbCache) return thumbCache;
  const map: Partial<Record<MechanismId, string>> = {};
  const pool: string[] = [];
  try {
    for (const g of listLibrary()) {
      // listLibrary 는 최신순 → 각 메커니즘 첫 매칭이 최신.
      const doc = loadInteractiveNode(g.docId);
      const bg = doc?.canvas.background;
      if (!doc || !bg || typeof bg !== 'object' || !bg.src) continue;
      pool.push(bg.src);
      const m = detectMechanism(doc);
      if (m && !map[m]) map[m] = bg.src;
    }
  } catch {
    /* 라이브러리 읽기 실패 — 이모지 폴백 */
  }
  thumbCache = { map, pool };
  return thumbCache;
}
// 게임이 새로 저장되면(자동 저장 포함) 썸네일 캐시를 비워 다음 추천에 반영한다.
if (typeof window !== 'undefined') window.addEventListener('kv:game-saved', () => { thumbCache = null; });

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

/** 게임 추천 — (1) 키워드와 맞는 저장 게임(재사용, 실물 썸네일) + (2) 메커니즘 추천(새로 만들기).
    보관함 이미지·웹링크 추천처럼 매칭 수만큼 가변(10개 고정 아님). 모두 썸네일+이름 카드. */
export function gameSuggestions(query: string): GameSuggestion[] {
  const theme = themeOf(query);
  const { map, pool } = mechanismThumbs();

  // 1) 저장 게임 매칭 — 제목이 겹치는 게임을 재사용 카드로(실제 게임화면 썸네일).
  const reuse: GameSuggestion[] = recommendFromLibrary(query, 12).map((g) => {
    const bg = loadInteractiveNode(g.docId)?.canvas.background;
    return {
      key: `reuse-${g.docId}`,
      kind: 'reuse' as const,
      emoji: '🎮',
      thumb: bg && typeof bg === 'object' && bg.src ? bg.src : undefined,
      label: g.title || '인터랙티브 게임',
      docId: g.docId,
    };
  });

  // 2) 메커니즘 추천 — 같은 메커니즘 저장 게임 장면, 없으면 보유 장면 풀에서 돌려 쓴다(없으면 이모지).
  const create: GameSuggestion[] = MECHS.map((m, i) => ({
    key: `new-${m.verb}`,
    kind: 'create' as const,
    emoji: m.emoji,
    mechanism: m.mech,
    thumb: map[m.mech] ?? (pool.length ? pool[i % pool.length] : undefined),
    label: theme ? `${theme} ${m.verb}` : m.verb,
    prompt: theme ? `${theme} ${m.verb} 게임` : `${m.verb} 게임`,
  }));

  return [...reuse, ...create];
}
