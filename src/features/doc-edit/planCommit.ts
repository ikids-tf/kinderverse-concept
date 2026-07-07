/**
 * 문서 편집 — 놀이계획 payload 커밋 공통 경로.
 *
 * 좌패널이 기본정보(PlanBasicInfo)·표 편집(PlanFieldsEditor)·도구(DocToolsPanel) 여러
 * 컴포넌트로 나뉘면서, 각자가 로컬 draft 전체를 커밋하면 서로의 변경을 스테일 값으로
 * 덮어쓴다. 그래서 **스토어의 '현재' payload 를 읽어 patch 만 머지**해 커밋한다.
 * payload = 단일 진실원: 머지 → planDocMarkdown/projectDocMarkdown 재생성 →
 * editTextCmd(되돌리기 가능) + updateNodeRaw(payload 메타).
 */
import { useBoardStore } from '@/store/boardStore';
import { editTextCmd } from '@/board/commands';
import { planDocMarkdown, projectDocMarkdown } from '@/board/workflow';
import type { WeeklyPlanGridProps } from '@/ui-registry/contracts';

/** 현재 payload 에 patch 를 머지해 본문 재생성 + 커밋. 노드/페이로드 없으면 no-op. */
export function commitPlanPatch(nodeId: string, patch: Partial<WeeklyPlanGridProps>, isProject: boolean): void {
  const board = useBoardStore.getState();
  const cur = board.nodes[nodeId];
  const payload = cur?.data?.payload as { type?: string; props?: WeeklyPlanGridProps } | undefined;
  if (!cur || payload?.type !== 'WeeklyPlanGrid' || !payload.props) return;
  const next: WeeklyPlanGridProps = { ...payload.props, ...patch };
  const wrapped = { type: 'WeeklyPlanGrid' as const, props: next };
  const md = isProject ? projectDocMarkdown(wrapped) : planDocMarkdown(wrapped);
  editTextCmd(nodeId, cur.text ?? '', md);
  board.updateNodeRaw(nodeId, { data: { ...(cur.data ?? {}), payload: wrapped } });
}

/** node.data 의 UI 전용 키(키워드·문서 테마 등)를 머지 커밋 — 본문(text)은 건드리지 않는다. */
export function commitDocData(nodeId: string, patch: Record<string, unknown>): void {
  const board = useBoardStore.getState();
  const cur = board.nodes[nodeId];
  if (!cur) return;
  board.updateNodeRaw(nodeId, { data: { ...(cur.data ?? {}), ...patch } });
}
