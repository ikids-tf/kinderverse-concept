import { create } from 'zustand';
import type { RegistryPayload } from '@/ui-registry/contracts';
import { useBoardStore, type Lane } from '@/store/boardStore';
import { idbGet, idbSet } from '@/board/idb';

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

/* ── 계층 저장(프레임 → 폴더 트리) ──────────────────────────────────────────
   "폴더에 저장"은 프레임 구조를 그대로 폴더 트리로 옮긴다:
   프레임 = 폴더(중첩 프레임 = 중첩 폴더), 이미지 = .jpg, 문서(data.doc) = .pdf,
   메모/텍스트 = .txt. content에 원본(이미지 src · 문서 마크다운 · 메모 평문)을
   담아 폴더 페이지에서 실제 파일로 다운로드한다. */

export interface SavedFile {
  kind: 'file';
  id: string;
  /** 확장자 포함 표시 이름 — 예: "봄 꽃밭.jpg". */
  name: string;
  type: 'image' | 'doc' | 'note' | 'board';
  /** image: src(URL/dataURL) · doc: 마크다운 · note: 평문 · board: BoardSnap JSON. */
  content: string;
  /** board: 원본 프레임 id — 뷰어의 '마이보드에서 보기'가 이 프레임으로 점프한다. */
  frameId?: string;
  /** doc: 보드 카드의 표지 배너(coverImage) — 뷰어가 보드와 같은 모습으로 그린다. */
  cover?: string;
}

/* board.board — 저장 당시 프레임의 '보드 모습 그대로' 스냅샷. 노드들을 프레임
   원점 기준 보드 px 좌표로 담아, 폴더 페이지가 CSS scale로 1:1 축소 렌더한다. */
export interface BoardSnapNode {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: 'image' | 'doc' | 'memo' | 'frame';
  src?: string; // image
  text?: string; // doc 마크다운 · memo 평문 · frame 제목
  color?: string; // memo 색 토큰명(paper/accent-soft/surface-2…)
  cover?: string; // doc 표지 배너 — 보드 모습 그대로 재현
}

export interface BoardSnap {
  w: number;
  h: number;
  nodes: BoardSnapNode[];
}

export interface SavedFolder {
  kind: 'folder';
  id: string;
  name: string;
  children: SavedEntry[];
}

export type SavedEntry = SavedFile | SavedFolder;

/** 트리 안의 파일 수(폴더 카드의 "N개 항목"). */
export function savedFileCount(folder: SavedFolder): number {
  return folder.children.reduce((n, c) => n + (c.kind === 'file' ? 1 : savedFileCount(c)), 0);
}

interface FolderState {
  bundles: Bundle[];
  addBundle: (b: Bundle) => void;
  removeBundle: (id: string) => void;
  /** 프레임에서 저장된 폴더 트리(최신이 앞). */
  saved: SavedFolder[];
  addSavedFolder: (f: SavedFolder) => void;
  removeSavedFolder: (id: string) => void;
}

let seq = 0;
const id = () => `bundle_${++seq}`;
let entrySeq = 0;
export const savedEntryId = () => `sv_${++entrySeq}`;

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
  saved: [],
  addSavedFolder: (f) => set((s) => ({ saved: [f, ...s.saved] })),
  removeSavedFolder: (fid) => set((s) => ({ saved: s.saved.filter((x) => x.id !== fid) })),
}));

/* ---------------- 영속화 (IndexedDB) ----------------
   저장 폴더 트리는 이미지 dataURL·보드 스냅샷을 품어 수 MB가 될 수 있으므로
   localStorage(5MB) 대신 보드와 같은 IDB에 디바운스로 미러링한다(persist.ts와
   동일한 패턴). 모듈 로드 시 복원하고, id 시퀀스(sv_N/bundle_N)는 복원본의
   최대값 뒤로 이어 재시작 후에도 충돌하지 않는다. */

const PERSIST_KEY = 'kv:folder:v1';
const PERSIST_DEBOUNCE = 600;

interface PersistShape {
  saved: SavedFolder[];
  bundles: Bundle[];
}

let hydrating = true;
let persistTimer: ReturnType<typeof setTimeout> | undefined;

function bumpSeqs(p: PersistShape): void {
  let maxEntry = 0;
  let maxBundle = 0;
  const walk = (e: SavedEntry) => {
    const m = /^sv_(\d+)$/.exec(e.id);
    if (m) maxEntry = Math.max(maxEntry, Number(m[1]));
    if (e.kind === 'folder') e.children.forEach(walk);
  };
  p.saved.forEach(walk);
  for (const b of p.bundles) {
    const m = /^bundle_(\d+)$/.exec(b.id);
    if (m) maxBundle = Math.max(maxBundle, Number(m[1]));
  }
  entrySeq = Math.max(entrySeq, maxEntry);
  seq = Math.max(seq, maxBundle);
}

void (async () => {
  try {
    const p = await idbGet<PersistShape>(PERSIST_KEY);
    if (p && Array.isArray(p.saved)) {
      bumpSeqs(p);
      useFolderStore.setState({ saved: p.saved, bundles: Array.isArray(p.bundles) ? p.bundles : [] });
    }
  } finally {
    hydrating = false;
  }
})();

useFolderStore.subscribe((s) => {
  if (hydrating) return; // 복원 직후의 setState는 다시 쓰지 않는다
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    void idbSet(PERSIST_KEY, { saved: s.saved, bundles: s.bundles } satisfies PersistShape);
  }, PERSIST_DEBOUNCE);
});
