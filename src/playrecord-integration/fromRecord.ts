// kinderverse 놀이기록(PlayStoryCard) → verse 편집기 놀이기록 payload 변환 + 편집기 열기.
// 레코드 카드: data.role='record' 이고 data.payload = { type:'PlayStoryCard', props:{ title, photo_slots[], narrative, domains[], family_note? } }.
// 레코드 doc 카드는 프레임 안(data.frameId)에 있으므로, 프레임에서 그 레코드 노드를 찾아 매핑한다.
// verse 놀이기록 read(): header.title / meta.theme / introduction.text / activities[].{title,summary} / learning.text / teacherSupport.text / photos[].
import { useBoardStore, type BoardNode } from '@/store/boardStore';
import { defaultTemplateId } from '@/playrecord';
import { usePlayEditorStore } from './store';

interface PhotoSlot { caption?: string; placeholder?: boolean }
interface PlayStoryProps {
  title?: string;
  photo_slots?: PhotoSlot[];
  narrative?: string;
  domains?: string[];
  family_note?: string;
}
interface PlayStoryPayload { type?: string; props?: PlayStoryProps }

const isRecordNode = (n: BoardNode) =>
  (n.data?.payload as PlayStoryPayload | undefined)?.type === 'PlayStoryCard';

/** 프레임(또는 그 자신)에서 PlayStoryCard 놀이기록 노드를 찾는다. */
export function findRecordNode(frameOrNodeId: string): BoardNode | undefined {
  const nodes = useBoardStore.getState().nodes;
  const self = nodes[frameOrNodeId];
  if (self && isRecordNode(self)) return self;
  return Object.values(nodes).find((n) => n.data?.frameId === frameOrNodeId && isRecordNode(n));
}

/** 프레임/노드가 놀이기록(PlayStoryCard)을 담고 있는가(버튼 노출 판단용). */
export function frameHasRecord(frameId: string): boolean {
  return !!findRecordNode(frameId);
}

export function recordNodeToPayload(node: BoardNode) {
  const p = node.data?.payload as PlayStoryPayload | undefined;
  const props = p?.props ?? {};
  const title = (props.title || '우리반 놀이기록').trim();
  const slots = Array.isArray(props.photo_slots) ? props.photo_slots : [];
  // 사진 슬롯 캡션 → 활동 카드(카드형 그리드의 제목). 캡션 없으면 활동 생략.
  const activities = slots
    .map((s) => (s.caption || '').trim())
    .filter(Boolean)
    .map((caption) => ({ title: caption, summary: '' }));
  const domains = Array.isArray(props.domains) ? props.domains.filter(Boolean) : [];
  return {
    header: { title, subtitle: '' },
    meta: { theme: title },
    introduction: { text: (props.narrative || '').trim() },
    activities,
    photos: slots.map((s) => ({ caption: (s.caption || '').trim() })),
    learning: {
      title: '놀이 속 배움',
      text: domains.length ? `연계 영역: ${domains.join(', ')}` : '',
    },
    teacherSupport: {
      title: '교사의 지원',
      text: (props.family_note || '').trim(),
    },
  };
}

/** 놀이기록 프레임/노드를 verse 편집기(놀이기록 = 카드형)로 연다.
 *  제목에 계절어가 있으면 그 주제 카드형(여름/겨울/가을…), 없으면 default-card. */
export function openRecordInEditor(frameOrNodeId: string): void {
  const node = findRecordNode(frameOrNodeId);
  if (!node) return;
  const payload = recordNodeToPayload(node);
  const variant = defaultTemplateId(payload, 'card') || 'default-card';
  usePlayEditorStore.getState().openEditor(variant, payload);
}
