// ⏸️ 보류된 확장성 인프라(파킹) — "놀이 확장 사슬"의 두뇌. 의도적 미배선(부활 대기) — 데드코드로 오인·삭제 금지(2026-06-29 보존 결정).
//    부활 경로·상세: docs/kinderverse-lane-infrastructure-spec-v1.0.md §9 step3. (gameSuggest.ts의 detectMechanism은 별개 사본 — 여기와 무관.)
/**
 * Resolver — 레인 확장 훅(§9 + PROMPT 6). "확장 활동" 클릭 시 현재 레인의 메커니즘을 감지하고
 * 레시피별 기본 body(교육적 후속)를 골라 다음 레인을 Resolver로 채운다(결정론 + 의미 narrow LLM).
 * 인프라(extendLane/오버레이)가 +N*1280 배치·패닝을 하고, 여기선 '무엇을 채울지'만 공급한다.
 *
 * hook → body → 연계 hook 가로 사슬(§9): 각 메커니즘이 기본 후속 동사를 가진다(BODY_CHAIN).
 * 테마는 현재 노드 title 에서 이어받아(같은 주제로) 다음 레인에 일관성을 준다.
 *
 * 감지/충전 실패면 ok:false → 호출부가 기존 extendActivityInNode(compose 폴백)로 넘긴다.
 */
import { useInteractiveStore } from '../store/interactiveStore';
import { assembleAndPlace, type PlaceResult } from './place';
import { resolveIntent } from './resolveIntent';
import { resolveTheme } from './themePacks';
import type { InteractiveNode } from '../schema/interactiveNode';
import type { MechanismId } from './recipeTypes';

/** 노드 구조에서 현재(마지막) 레인의 메커니즘을 추정 — Resolver/compose 둘 다 같은 배선 패턴이라 통한다. */
export function detectMechanism(node: InteractiveNode): MechanismId | null {
  const behs = node.behaviors;
  const has = (fn: (b: InteractiveNode['behaviors'][number]) => boolean) => behs.some(fn);

  // 드래그 분류 — moveAlongPath + tap/sequenceTap 이 2종 이상.
  const dragTargets = new Set(behs.filter((b) => b.action === 'moveAlongPath' && (b.trigger === 'tap' || b.trigger === 'sequenceTap')).map((b) => b.target));
  if (dragTargets.size >= 2) return 'sort-to-bin';

  if (has((b) => b.trigger === 'sequenceTap')) return 'sequence-order';
  if (has((b) => b.action === 'swap' && b.when?.kind === 'flag')) return 'memory-flip';
  if (has((b) => b.action === 'swap')) return 'free-create';
  if (has((b) => b.action === 'setFlag') && has((b) => b.action === 'reveal' && b.when?.kind === 'flag')) return 'branch-choose';

  if (has((b) => b.trigger === 'pathTraverse')) {
    return node.connections.some((c) => c.kind === 'link') ? 'pair-match' : 'path-trace';
  }
  if (has((b) => b.trigger === 'tap' && b.action === 'count')) return 'tap-select';
  return null;
}

/** 레시피별 기본 body(후속 동사구). 테마는 앞에 붙여 같은 주제로 잇는다. 동사만으로 다음 메커니즘이 정해진다. */
const BODY_CHAIN: Record<MechanismId, string> = {
  'sort-to-bin': '자유롭게 꾸미기 놀이',
  'slot-fill': '순서대로 세기 놀이',
  'sequence-order': '짝 짓기 놀이',
  'pair-match': '순서대로 세기 놀이',
  'tap-select': '분류하기 놀이',
  'path-trace': '숨은 그림 찾기 놀이',
  combine: '자유롭게 꾸미기 놀이',
  'memory-flip': '짝 짓기 놀이',
  'branch-choose': '순서대로 세기 놀이',
  'free-create': '짝 짓기 놀이',
  'dress-up': '분류하기 놀이',
  'shadow-quiz': '짝 짓기 놀이',
};

/**
 * 확장 — 현재 노드의 메커니즘을 감지해 기본 body 를 다음 레인으로 채운다.
 * 성공 시 PlaceResult(lane = 추가된 밴드 인덱스). 실패 시 ok:false(호출부 폴백).
 */
export async function resolverExtend(docId: string, onBusy?: (m: string | null) => void): Promise<PlaceResult> {
  const node = useInteractiveStore.getState().peek(docId);
  if (!node) return { ok: false, lane: 0, message: '노드를 찾지 못했어요' };
  const current = detectMechanism(node);
  if (!current) return { ok: false, lane: 0, message: '확장 메커니즘을 추정하지 못했어요' };

  const theme = resolveTheme(node.title)?.names[0] ?? '';
  const prompt = `${theme} ${BODY_CHAIN[current]}`.trim();
  const intent = await resolveIntent(prompt, onBusy);
  if (!intent) return { ok: false, lane: 0, message: '확장 내용을 만들지 못했어요' };

  // assembleAndPlace 가 기존 멀티레인 노드면 +N*1280 평행이동 머지로 다음 밴드에 배치.
  return await assembleAndPlace(docId, intent.mechanism, intent.input, onBusy);
}
