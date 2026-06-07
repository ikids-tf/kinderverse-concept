import { create } from 'zustand';
import type { RegistryPayload } from '@/ui-registry/contracts';
import type { Lane } from '@/store/boardStore';

/* 폴더 — 산출물 저장·정리 (PRD §4.6, §11). 레인 저장 = lane_bundles로 묶어
   폴더에 1건으로(매니페스트). 폴더에서 레인 제목 하나로 전체 재오픈. */

export interface BundleItem {
  kind: string;
  title: string;
  payload?: RegistryPayload;
}

export interface Bundle {
  id: string;
  title: string;
  template: string;
  items: BundleItem[];
  /** plan↔worksheet 연결 표시용. */
  planId?: string;
  hasWorksheetLink: boolean;
}

interface FolderState {
  bundles: Bundle[];
  addBundle: (b: Bundle) => void;
  removeBundle: (id: string) => void;
}

let seq = 0;
const id = () => `bundle_${++seq}`;

/** Build a folder bundle from a lane's ready steps (manifest). */
export function bundleFromLane(lane: Lane): Bundle {
  const items: BundleItem[] = lane.steps
    .filter((s) => s.status === 'ready' && s.content != null)
    .map((s) => {
      const content = s.content as { type?: string } | { items?: unknown[] };
      const isPayload = (content as { type?: string }).type != null;
      return {
        kind: s.step,
        title: s.title,
        payload: isPayload ? (s.content as RegistryPayload) : undefined,
      };
    });

  const planStep = lane.steps.find((s) => s.step === 'plan');
  const planProps = planStep?.content as { type?: string; props?: { id?: string } } | undefined;
  const planId = planProps?.type === 'WeeklyPlanGrid' ? planProps.props?.id : undefined;

  const worksheetStep = lane.steps.find((s) => s.step === 'worksheet');
  const wsProps = worksheetStep?.content as { type?: string; props?: { link_plan_id?: string } } | undefined;
  const hasWorksheetLink =
    wsProps?.type === 'WorksheetCard' && !!wsProps.props?.link_plan_id;

  return {
    id: id(),
    title: lane.title,
    template: lane.template,
    items,
    planId,
    hasWorksheetLink,
  };
}

export const useFolderStore = create<FolderState>((set) => ({
  bundles: [],
  addBundle: (b) => set((s) => ({ bundles: [b, ...s.bundles] })),
  removeBundle: (bid) => set((s) => ({ bundles: s.bundles.filter((x) => x.id !== bid) })),
}));
