// kinderverse 주간계획(WeeklyPlanGrid) → verse 편집기 weeklyplan(주안) payload 변환 + 편집기 열기.
// 계획 노드: data.role='plan' 이고 data.payload = { type:'WeeklyPlanGrid', props:{ title, days:[{day,area,activity,materials,goal}] } }.
// 계획 doc 카드는 프레임 안(data.frameId)에 있으므로, 프레임에서 그 계획 노드를 찾아 매핑한다.
import { useBoardStore, type BoardNode } from '@/store/boardStore';
import { spawnEditorCard } from './spawnEditorCard';

interface WeeklyDay { day?: string; area?: string; activity?: string; materials?: string; goal?: string }
interface WeeklyPlanPayload { type?: string; props?: { title?: string; days?: WeeklyDay[] } }

const isPlanNode = (n: BoardNode) =>
  n.data?.role === 'plan' || (n.data?.payload as WeeklyPlanPayload | undefined)?.type === 'WeeklyPlanGrid';

/** 프레임(또는 그 자신)에서 WeeklyPlanGrid 계획 노드를 찾는다. */
export function findPlanNode(frameOrNodeId: string): BoardNode | undefined {
  const nodes = useBoardStore.getState().nodes;
  const self = nodes[frameOrNodeId];
  if (self && isPlanNode(self) && (self.data?.payload as WeeklyPlanPayload | undefined)?.props?.days) return self;
  return Object.values(nodes).find((n) => n.data?.frameId === frameOrNodeId && isPlanNode(n));
}

/** 프레임/노드가 주간계획을 담고 있는가(버튼 노출 판단용). */
export function frameHasPlan(frameId: string): boolean {
  return !!findPlanNode(frameId);
}

export function planNodeToPayload(node: BoardNode) {
  const p = node.data?.payload as WeeklyPlanPayload | undefined;
  const props = p?.props ?? {};
  const title = (props.title || (node.data?.title as string | undefined) || '주간 놀이계획').trim();
  const days = Array.isArray(props.days) ? props.days : [];
  const daily_flow = days.map((d) => ({
    day: d.day || '',
    date: '',
    play_ideas: [d.activity, d.area ? `영역: ${d.area}` : '', d.goal ? `목표: ${d.goal}` : '']
      .filter(Boolean) as string[],
  }));
  return {
    basic_info: { theme: title, sub_theme: '', period: '', class_name: '', age_band: '' },
    rationale: '',
    teacher_expectations: [...new Set(days.map((d) => d.goal).filter(Boolean))] as string[],
    curriculum_links: [...new Set(days.map((d) => d.area).filter(Boolean))] as string[],
    daily_flow,
    outdoor_and_physical_play: [] as string[],
    safety_education: '',
    character_education: '',
    events: [] as string[],
    home_connection: '',
  };
}

/** 주간계획 프레임/노드를 verse 편집기(주안 = weeklyplan)로 연다. */
export function openPlanInEditor(frameOrNodeId: string): void {
  const node = findPlanNode(frameOrNodeId);
  if (!node) return;
  spawnEditorCard('weeklyplan', planNodeToPayload(node));
}

/** 월간계획(WeeklyPlanGrid의 days=주차) → 월안(weekly_flow) payload 로 변환.
    activity 는 쉼표로 이은 그 주차 놀이들 → play_ideas 배열로 분해. */
export function monthlyNodeToPayload(node: BoardNode) {
  const p = node.data?.payload as WeeklyPlanPayload | undefined;
  const props = p?.props ?? {};
  const title = (props.title || (node.data?.title as string | undefined) || '여름 바다로 풍덩!').trim();
  const days = Array.isArray(props.days) ? props.days : [];
  const weekly_flow = days.map((d, i) => ({
    week: i + 1,
    sub_theme: d.area || d.day || `${i + 1}주차`,
    play_ideas: String(d.activity || '')
      .split(/[,·\n]/)
      .map((s) => s.trim())
      .filter(Boolean),
  }));
  return {
    basic_info: { theme: title, sub_theme: '', period: '', class_name: '', age_band: '' },
    header: { title },
    rationale: { summary: '' },
    teacher_expectations: [...new Set(days.map((d) => d.goal).filter(Boolean))].map((g) => ({ goal: g })),
    curriculum_links: [] as unknown[],
    weekly_flow,
    outdoor_and_physical_play: [] as unknown[],
    safety_education: '',
    character_education: '',
    events: [] as unknown[],
    home_connection: '',
  };
}

/** 월간계획 노드를 verse 편집기(월안 = monthlyplan 여름바다)로 연다. */
export function openMonthlyInEditor(frameOrNodeId: string): void {
  const node = findPlanNode(frameOrNodeId);
  if (!node) return;
  spawnEditorCard('monthlyplan-summer', monthlyNodeToPayload(node));
}
