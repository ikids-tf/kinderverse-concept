/* 임시 검증 — Resolver 결정론 파이프라인.
   build → safeParse(참조무결성) → autoLayout(순수) → 재검증 + 구조 보존 + 완료 경로 + in-canvas.
   (fillTokenImages 는 브라우저 전용(canvas/gateway)이라 여기선 제외 — 보드 플레이로 확인.) */
import { buildRecipe } from '@/features/interactive-viewer/resolver';
import { selectRecipe } from '@/features/interactive-viewer/resolver/selectRecipe';
import { fillSlots } from '@/features/interactive-viewer/resolver/fillSlots';
import { autoLayout } from '@/features/interactive-viewer/authoring/layout';
import { safeParseInteractiveNode } from '@/features/interactive-viewer/schema/parse';
import type { MechanismId, RecipeInput } from '@/features/interactive-viewer/resolver';
import type { InteractiveNode } from '@/features/interactive-viewer/schema/interactiveNode';

const cases: Array<[MechanismId, RecipeInput]> = [
  ['sequence-order', { docId: 'd1', title: '다람쥐 도토리 세기', actorLabel: '다람쥐', items: [{ label: '1 적힌 도토리' }, { label: '2 적힌 도토리' }, { label: '3 적힌 도토리' }, { label: '4 적힌 도토리' }] }],
  ['path-trace', { docId: 'd2', title: '토끼를 집까지', actorLabel: '토끼', goalLabel: '토끼집', items: [{ label: '징검돌' }, { label: '징검돌' }, { label: '징검돌' }] }],
  ['pair-match', { docId: 'd3', title: '엄마와 아기 짝', pairs: [{ left: '강아지', right: '강아지 집' }, { left: '고양이', right: '고양이 집' }, { left: '병아리', right: '병아리 집' }] }],
  ['tap-select', { docId: 'd4', title: '과일만 찾아요', items: [{ label: '사과', correct: true }, { label: '바나나', correct: true }, { label: '자동차' }, { label: '의자' }] }],
  ['branch-choose', { docId: 'd5', title: '신호등이 빨강이면?', goalLabel: '멈춘 아이', items: [{ label: '멈추기', correct: true }, { label: '건너기' }] }],
  ['combine', { docId: 'd6', title: '빨강+노랑은?', goalLabel: '주황 물감', items: [{ label: '빨강 물감' }, { label: '노랑 물감' }] }],
  ['sort-to-bin', { docId: 'd7', title: '동물과 탈것 분류', bins: [{ key: 'a', label: '동물' }, { key: 'v', label: '탈것' }], items: [{ label: '강아지', binKey: 'a' }, { label: '고양이', binKey: 'a' }, { label: '자동차', binKey: 'v' }, { label: '버스', binKey: 'v' }] }],
  ['slot-fill', { docId: 'd8', title: '빈칸 완성', bins: [{ key: 's1', label: '①' }, { key: 's2', label: '②' }, { key: 's3', label: '③' }], items: [{ label: '조각1', binKey: 's1' }, { label: '조각2', binKey: 's2' }, { label: '조각3', binKey: 's3' }] }],
  ['free-create', { docId: 'd9', title: '눈사람 꾸미기', pairs: [{ left: '빨간 모자', right: '파란 모자' }, { left: '당근 코', right: '단추 코' }] }],
  ['memory-flip', { docId: 'd10', title: '카드 뒤집기', items: [{ label: '사과' }, { label: '바나나' }, { label: '포도' }, { label: '딸기' }] }],
];

const MANUAL = new Set<MechanismId>(['sort-to-bin', 'slot-fill']);
const NO_WIN = new Set<MechanismId>(['free-create']); // 열린결말 — 완료 경로 면제
/** 드래그-분류 발동 조건(dragSortBeh): moveAlongPath + tap/sequenceTap, 이동 타깃 ≥2종. */
function dragSortActivates(n: InteractiveNode): boolean {
  const t = new Set(n.behaviors.filter((b) => b.action === 'moveAlongPath' && (b.trigger === 'tap' || b.trigger === 'sequenceTap')).map((b) => b.target));
  return t.size >= 2;
}

function inCanvas(n: InteractiveNode): boolean {
  const { w, h } = n.canvas.size;
  return n.elements.every((e) => {
    const t = e.transform;
    return t.x >= -t.w && t.y >= -t.h && t.x <= w && t.y <= h;
  });
}
function completionPath(n: InteractiveNode): boolean {
  // 완료 = 시작 시 숨긴 승리요소를 조건부(reveal+when)로 노출. 게이트는 counter(>=N) 또는 flag.
  return n.behaviors.some((b) => b.action === 'reveal' && !!b.when);
}

let allOk = true;
for (const [id, input] of cases) {
  const built = buildRecipe(id, input);
  if (!built.ok || !built.node) { allOk = false; console.log(`✗ ${id} build — ${built.errors}`); continue; }
  const before = built.node;
  // manualLayout 레시피(드래그 분류)는 place.ts 처럼 autoLayout 을 건너뛴다.
  const laid = MANUAL.has(id) ? before : autoLayout(before);
  const re = safeParseInteractiveNode(laid);
  const structPreserved =
    laid.behaviors.length === before.behaviors.length &&
    laid.connections.length === before.connections.length &&
    laid.elements.length === before.elements.length;
  const dragOk = MANUAL.has(id) ? dragSortActivates(laid) : true;
  const completeOk = NO_WIN.has(id) ? true : completionPath(laid);
  const ok = re.success && structPreserved && completeOk && inCanvas(laid) && dragOk;
  if (!ok) allOk = false;
  console.log(
    `${ok ? '✓' : '✗'} ${id} — reparse=${re.success} struct=${structPreserved} ` +
      `els=${laid.elements.length} behs=${laid.behaviors.length} conns=${laid.connections.length} ` +
      `complete=${completeOk} inCanvas=${inCanvas(laid)}` +
      (MANUAL.has(id) ? ` dragSort=${dragOk}` : ''),
  );
}

// 동사→메커니즘 라우팅 + 연령 난이도(selectRecipe, 결정론).
console.log('\n-- selectRecipe (§5 동사 매핑 + 난이도) --');
const routeCases: Array<[string, MechanismId | null]> = [
  ['사과 5개 순서대로 세기 게임 만들어줘', 'sequence-order'],
  ['토끼를 집까지 데려가는 길찾기 놀이', 'path-trace'],
  ['동물 짝짓기 게임', 'pair-match'],
  ['크리스마스 선물 분류하기 게임', 'sort-to-bin'],
  ['과일만 찾아보는 놀이', 'tap-select'],
  ['빨강이랑 노랑 색 섞기', 'combine'],
  ['카드 뒤집기 기억 게임', 'memory-flip'],
  ['눈사람 꾸미기', 'free-create'],
  ['빈칸 완성하기', 'slot-fill'],
  ['만3 강아지 그림 보고 이야기해줘', null], // 동사 없음 → 폴백
];
let routeOk = true;
for (const [p, expect] of routeCases) {
  const r = selectRecipe(p);
  const got = r?.mechanism ?? null;
  const pass = got === expect;
  if (!pass) routeOk = false;
  console.log(`  ${pass ? '✓' : '✗'} "${p.slice(0, 16)}…" → ${got ?? 'null'}${r ? ` (n=${r.count}${r.age ? `, 만${r.age}` : ''})` : ''}`);
}
if (!routeOk) allOk = false;

// 결정론 fillSlots(테마 vocab, LLM 콜 없음) — 크리스마스 세기.
const det = await fillSlots('크리스마스 트리 장식 5개 순서대로 세기', { mechanism: 'sequence-order', themeNoun: '크리스마스', count: 5 });
const detOk = !!det && (det.items?.length === 5) && det.items.every((i) => /적힌/.test(i.label));
if (!detOk) allOk = false;
console.log(`  ${detOk ? '✓' : '✗'} fillSlots 결정론(크리스마스 vocab) — items=${det?.items?.length} 예: ${det?.items?.[0]?.label}`);

console.log(allOk ? '\nALL PASS' : '\nSOME FAILED');
process.exit(allOk ? 0 : 1);
