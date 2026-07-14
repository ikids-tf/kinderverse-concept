// kinderverse 주간계획(WeeklyPlanGrid) → verse 편집기 weeklyplan(주안) payload 변환 + 편집기 열기.
// 계획 노드: data.role='plan' 이고 data.payload = { type:'WeeklyPlanGrid', props:{ title, days:[{day,area,activity,materials,goal}] } }.
// 계획 doc 카드는 프레임 안(data.frameId)에 있으므로, 프레임에서 그 계획 노드를 찾아 매핑한다.
import { useBoardStore, type BoardNode } from '@/store/boardStore';
import { spawnEditorCard } from './spawnEditorCard';

interface WeeklyDay { day?: string; area?: string; activity?: string; materials?: string; goal?: string }
interface WeeklyPlanPayload { type?: string; props?: { title?: string; days?: WeeklyDay[] } }

const isPlanNode = (n: BoardNode) =>
  n.data?.role === 'plan' || (n.data?.payload as WeeklyPlanPayload | undefined)?.type === 'WeeklyPlanGrid';

/** 노드가 계획 payload(주안 WeeklyPlanGrid/WeeklyPlan 또는 월안 MonthlyPlan)를 담고 있는가. */
const hasPlanPayload = (n?: BoardNode): boolean => {
  const pl = n?.data?.payload as { type?: string; props?: { days?: unknown } } | undefined;
  return !!(pl?.props?.days || pl?.type === 'MonthlyPlan' || pl?.type === 'WeeklyPlan');
};

/** 프레임(또는 그 자신)에서 계획(주안/월안) 노드를 찾는다. */
export function findPlanNode(frameOrNodeId: string): BoardNode | undefined {
  const nodes = useBoardStore.getState().nodes;
  const self = nodes[frameOrNodeId];
  if (self && isPlanNode(self) && hasPlanPayload(self)) return self;
  return Object.values(nodes).find((n) => n.data?.frameId === frameOrNodeId && isPlanNode(n));
}

/** 프레임/노드가 주간계획을 담고 있는가(버튼 노출 판단용). */
export function frameHasPlan(frameId: string): boolean {
  return !!findPlanNode(frameId);
}

interface WeeklyPlanNewPayload {
  type?: string;
  props?: {
    basic_info?: { theme?: string; sub_theme?: string; period?: string };
    daily_flow?: Array<{ day?: string; date?: string; flow_stage?: string; play_ideas?: Array<{ title?: string; core_experience?: string }> }>;
    teacher_expectations?: Array<{ goal?: string }>;
    curriculum_links?: Array<{ area?: string }>;
  };
}

export function planNodeToPayload(node: BoardNode) {
  const raw = node.data?.payload as (WeeklyPlanPayload & WeeklyPlanNewPayload) | undefined;

  // 신형: WeeklyPlan (기본 생성 경로) — daily_flow[].play_ideas[] 를 문자열로 평탄화.
  if (raw?.type === 'WeeklyPlan') {
    const wp = (raw as WeeklyPlanNewPayload).props ?? {};
    const title = (wp.basic_info?.theme || (node.data?.title as string | undefined) || '주간 놀이계획').trim();
    const daily_flow = (wp.daily_flow ?? []).map((d) => ({
      day: d.day || '',
      date: d.date || '',
      play_ideas: [
        ...(d.flow_stage ? [`[${d.flow_stage}]`] : []),
        ...(d.play_ideas ?? []).map((pi) => [pi.title, pi.core_experience].filter(Boolean).join(' — ')),
      ].filter(Boolean),
    }));
    return {
      basic_info: { theme: title, sub_theme: wp.basic_info?.sub_theme || '', period: wp.basic_info?.period || '', class_name: '', age_band: '' },
      rationale: '',
      teacher_expectations: (wp.teacher_expectations ?? []).map((t) => t.goal).filter(Boolean) as string[],
      curriculum_links: [...new Set((wp.curriculum_links ?? []).map((c) => c.area).filter(Boolean))] as string[],
      daily_flow,
      outdoor_and_physical_play: [] as string[],
      safety_education: '',
      character_education: '',
      events: [] as string[],
      home_connection: '',
    };
  }

  const p = raw as WeeklyPlanPayload | undefined;
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

interface MonthlyPlanPayload {
  type?: string;
  props?: {
    basic_info?: { theme?: string; class_name?: string; period?: string };
    rationale?: { reason?: string; teacher_expectations?: string[] };
    weekly_flow?: Array<{ week?: string; sub_theme?: string; play_ideas?: string[] }>;
    safety_education?: string;
    character_education?: string;
    home_connection?: string;
  };
}

/** 월간계획 노드 → 월안(weekly_flow) payload 로 변환. 신형 MonthlyPlan 페이로드(주차별 구조)와
    구형 WeeklyPlanGrid(days=주차, activity=쉼표 놀이) 를 모두 지원한다(verse 회귀 방지). */
export function monthlyNodeToPayload(node: BoardNode) {
  const raw = node.data?.payload as (WeeklyPlanPayload & MonthlyPlanPayload) | undefined;

  // 신형: MonthlyPlan
  if (raw?.type === 'MonthlyPlan') {
    const mp = (raw as MonthlyPlanPayload).props ?? {};
    const title = (mp.basic_info?.theme || (node.data?.title as string | undefined) || '월간 놀이계획').trim();
    const weekly_flow = (mp.weekly_flow ?? []).map((w, i) => ({
      week: i + 1,
      sub_theme: (w.sub_theme || w.week || `${i + 1}주차`).trim(),
      play_ideas: (w.play_ideas ?? []).map((s) => s.trim()).filter(Boolean),
    }));
    return {
      basic_info: { theme: title, sub_theme: '', period: mp.basic_info?.period || '', class_name: mp.basic_info?.class_name || '', age_band: '' },
      header: { title },
      rationale: { summary: mp.rationale?.reason || '' },
      teacher_expectations: (mp.rationale?.teacher_expectations ?? []).map((g) => ({ goal: g })),
      curriculum_links: [] as unknown[],
      weekly_flow,
      outdoor_and_physical_play: [] as unknown[],
      safety_education: mp.safety_education || '',
      character_education: mp.character_education || '',
      events: [] as unknown[],
      home_connection: mp.home_connection || '',
    };
  }

  // 구형: WeeklyPlanGrid (days=주차, activity=쉼표로 이은 놀이들)
  const props = (raw as WeeklyPlanPayload | undefined)?.props ?? {};
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
