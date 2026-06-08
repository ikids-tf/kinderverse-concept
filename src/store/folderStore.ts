import { create } from 'zustand';
import type { RegistryPayload } from '@/ui-registry/contracts';
import { useBoardStore, type Lane } from '@/store/boardStore';

/* 폴더 — 산출물 저장·정리 (PRD §4.6, §11). 레인/프레임 저장 = bundle로 묶어
   폴더에 1건으로(매니페스트). 폴더에서 제목 하나로 전체 재오픈. */

export interface BundleItem {
  kind: string;
  title: string;
  payload?: RegistryPayload;
  /** Plain text for note items (sticky/text cards with no structured payload). */
  text?: string;
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

/** Build a folder bundle from a board frame's child cards (My Board save). */
export function bundleFromFrame(frameId: string): Bundle | null {
  const b = useBoardStore.getState();
  const frame = b.nodes[frameId];
  if (!frame || frame.type !== 'frame') return null;

  // Walk the frame's children, recursing into nested sub-frames (e.g. 아이디어)
  // so grandchildren (idea cards) are saved too.
  const items: BundleItem[] = [];
  const collect = (fid: string) => {
    const kids = Object.values(b.nodes).filter((n) => n.data?.frameId === fid);
    for (const n of kids) {
      if (n.type === 'runner') continue; // control element, not content
      if (n.type === 'frame') { collect(n.id); continue; } // recurse into sub-frame
      if (n.data?.role === 'header') continue; // header text duplicates the bundle title
      const payload = n.data?.payload as RegistryPayload | undefined;
      if (payload) {
        items.push({ kind: payload.type, title: (n.text ?? '').split('\n')[0].slice(0, 40) || payload.type, payload });
      } else if (n.type === 'image') {
        items.push({
          kind: 'image',
          title: n.text || '이미지',
          payload: { type: 'StudioGallery', props: { title: n.text || '이미지', items: [{ caption: n.text ?? '', kind: 'image', url: n.src }] } },
        });
      } else if (n.data?.role === 'source' && Array.isArray(n.data?.links)) {
        const links = n.data.links as Array<{ title: string; url: string }>;
        const text = [n.data?.summary as string | undefined, ...links.map((l) => `· ${l.title} — ${l.url}`)].filter(Boolean).join('\n');
        items.push({ kind: 'source', title: '웹 자료', text });
      } else if (n.type === 'sticky' || n.type === 'text') {
        items.push({ kind: 'note', title: (n.text || '메모').split('\n')[0].slice(0, 40), text: n.text });
      }
    }
  };
  collect(frameId);

  const planItem = items.find((it) => it.payload?.type === 'WeeklyPlanGrid');
  const planId = planItem?.payload?.type === 'WeeklyPlanGrid' ? planItem.payload.props.id : undefined;
  const hasWorksheetLink = items.some(
    (it) => it.payload?.type === 'WorksheetCard' && !!it.payload.props.link_plan_id,
  );

  return {
    id: id(),
    title: (frame.data?.title as string) || '보드 묶음',
    template: (frame.data?.templateId as string) || 'board_frame',
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
