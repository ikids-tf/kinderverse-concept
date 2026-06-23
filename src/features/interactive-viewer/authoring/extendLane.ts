/**
 * 확장 레인 — "확장" 클릭 시 같은 인터랙티브 노드에 새 레인(1280px 밴드)을 추가하고
 * 플레이 가능한 활동으로 채운다(모델 2 무한 성장). 더 이상 MyBoard로 새지 않는다.
 *
 * 메커니즘(사용자 결정 A — 스크래치 버퍼): composeInteractiveNode는 docId 문서를 '통째 교체'
 * 하므로(composeNode.ts) 기존 멀티레인 doc에 직접 호출할 수 없다. 그래서 임시 docId에 그대로
 * 호출(생성 경로 내부 무수정·호출만)한 뒤, 그 결과를 새 밴드로 평행이동 + 모든 id 재매핑해
 * 기존 doc에 병합하고 임시 doc을 정리한다.
 *
 * ⚠ 배관만: "무슨 확장 게임을 생성할지"의 프롬프트 결정은 v0.2 Resolver 몫. 여기선 prompt를
 *   인자로 받아 그대로 composeInteractiveNode에 넘긴다(하드코딩 금지). 패닝은 호출부가 한다.
 */
import { newId } from '@/store/boardStore';
import { useInteractiveStore, newDocId } from '../store/interactiveStore';
import { composeInteractiveNode } from './composeNode';
import type { Behavior, Connection, ElementNode, InteractiveNode } from '../schema/interactiveNode';

const LANE_W = 1280;

/** 임시(스크래치) 문서를 스토어·localStorage에서 제거 — 영구 doc으로 남지 않게. */
function dropScratch(scratchId: string): void {
  try {
    const KEY = 'kv:inodes:v1';
    const all = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>;
    if (all[scratchId]) {
      delete all[scratchId];
      localStorage.setItem(KEY, JSON.stringify(all));
    }
  } catch {
    /* best effort */
  }
  useInteractiveStore.setState((s) => {
    const docs = { ...s.docs };
    const past = { ...s.past };
    const future = { ...s.future };
    delete docs[scratchId];
    delete past[scratchId];
    delete future[scratchId];
    return { docs, past, future };
  });
}

/** 생성된 한 레인(1280×800) 노드를 새 밴드(offsetX)로 평행이동 + 모든 id 재매핑한 '조각'으로.
    참조 무결성을 위해 요소/행동/연결/카운터/플래그 id를 전부 새로 발급하고 상호참조를 갱신한다
    (InteractiveOverlay.duplicateBundle 패턴). 확장 레인의 story는 단일 doc.story 충돌을 피해 생략. */
function offsetLane(src: InteractiveNode, offsetX: number): {
  elements: ElementNode[];
  behaviors: Behavior[];
  connections: Connection[];
  counters: NonNullable<InteractiveNode['counters']>;
  flags: NonNullable<InteractiveNode['flags']>;
} {
  const elMap: Record<string, string> = {};
  src.elements.forEach((e) => (elMap[e.id] = newId('el')));
  const behMap: Record<string, string> = {};
  src.behaviors.forEach((b) => (behMap[b.id] = newId('beh')));
  const connMap: Record<string, string> = {};
  src.connections.forEach((c) => (connMap[c.id] = newId('conn')));
  const cntMap: Record<string, string> = {};
  (src.counters ?? []).forEach((c) => (cntMap[c.id] = newId('cnt')));
  const flagMap: Record<string, string> = {};
  (src.flags ?? []).forEach((f) => (flagMap[f.id] = newId('flag')));
  const mapEls = (ids?: string[]) => (ids ?? []).map((i) => elMap[i] ?? i);

  const elements: ElementNode[] = src.elements.map((e) => ({
    ...e,
    id: elMap[e.id],
    transform: { ...e.transform, x: e.transform.x + offsetX },
  }));
  const connections: Connection[] = src.connections.map((c) => ({
    ...c,
    id: connMap[c.id],
    from: elMap[c.from] ?? c.from,
    to: elMap[c.to] ?? c.to,
    points: c.points?.map((p) => ({ ...p, x: p.x + offsetX })),
  }));
  const behaviors: Behavior[] = src.behaviors.map((b) => {
    // JSON 클론으로 union 타입 우회 — id/참조만 재매핑(duplicateBundle와 동일).
    const nb = JSON.parse(JSON.stringify(b)) as Record<string, unknown> & { params?: Record<string, unknown>; when?: Record<string, unknown> };
    nb.id = behMap[b.id];
    nb.target = elMap[b.target] ?? b.target;
    if (typeof nb.after === 'string') nb.after = behMap[nb.after] ?? nb.after;
    if (Array.isArray(nb.then)) nb.then = (nb.then as string[]).map((t) => behMap[t] ?? t);
    const p = nb.params;
    if (p) {
      if (Array.isArray(p.targets)) p.targets = mapEls(p.targets as string[]);
      if (typeof p.connectionId === 'string') p.connectionId = connMap[p.connectionId] ?? p.connectionId;
      if (typeof p.counterId === 'string') p.counterId = cntMap[p.counterId] ?? p.counterId;
      if (typeof p.flagId === 'string') p.flagId = flagMap[p.flagId] ?? p.flagId;
    }
    const w = nb.when;
    if (w) {
      if (typeof w.counterId === 'string') w.counterId = cntMap[w.counterId] ?? w.counterId;
      if (typeof w.flagId === 'string') w.flagId = flagMap[w.flagId] ?? w.flagId;
      if (typeof w.target === 'string') w.target = elMap[w.target] ?? w.target;
    }
    return nb as unknown as Behavior;
  });
  const counters = (src.counters ?? []).map((c) => ({
    ...c,
    id: cntMap[c.id],
    display: c.display ? { ...c.display, x: c.display.x + offsetX } : c.display,
  }));
  const flags = (src.flags ?? []).map((f) => ({ ...f, id: flagMap[f.id] }));
  return { elements, behaviors, connections, counters, flags };
}

export interface ExtendResult {
  ok: boolean;
  /** 추가된 레인 인덱스(패닝 대상). */
  lane: number;
  message: string;
}

/**
 * 확장 — 같은 노드에 새 레인을 추가하고 composeInteractiveNode로 채운다(스크래치 버퍼 경유).
 * 패닝은 호출부(오버레이)가 res.lane으로 한다. 생성 실패 시 레인을 추가하지 않는다.
 */
export async function extendActivityInNode(
  docId: string,
  prompt: string,
  onBusy?: (msg: string | null) => void,
): Promise<ExtendResult> {
  const store = useInteractiveStore.getState();
  const base = store.peek(docId) ?? store.ensure(docId);
  const newIdx = Math.max(1, Math.round(base.canvas.size.w / LANE_W)); // 현 레인 수 = 새 레인 인덱스

  const scratch = newDocId();
  store.ensure(scratch);
  let r: { ok: boolean; message: string };
  try {
    r = await composeInteractiveNode(scratch, prompt, onBusy);
  } catch {
    r = { ok: false, message: '확장 생성에 실패했어요' };
  }
  const gen = store.peek(scratch);

  if (r.ok && gen && gen.elements.length > 0) {
    const piece = offsetLane(gen, newIdx * LANE_W);
    store.mutate(docId, (d) => ({
      ...d,
      canvas: { ...d.canvas, size: { ...d.canvas.size, w: d.canvas.size.w + LANE_W } },
      elements: [...d.elements, ...piece.elements],
      behaviors: [...d.behaviors, ...piece.behaviors],
      connections: [...d.connections, ...piece.connections],
      counters: [...(d.counters ?? []), ...piece.counters],
      flags: [...(d.flags ?? []), ...piece.flags],
    }));
    dropScratch(scratch);
    return { ok: true, lane: newIdx, message: '확장 레인을 추가했어요' };
  }

  dropScratch(scratch);
  return { ok: false, lane: newIdx, message: r.message || '확장 생성에 실패했어요' };
}
