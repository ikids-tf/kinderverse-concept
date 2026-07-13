// 프레임(패키지 박스) 안의 '편집디자인으로 변환 가능한 문서'를 모두 모은다.
// "전체 편집디자인" 버튼이 이 목록으로 편집기 덱(openDeck)을 연다.
// 변환기·판별은 fromRecord/fromPlan/fromMindmap 의 것을 그대로 재사용한다(중복 로직 없음).
import { useBoardStore, type BoardNode } from '@/store/boardStore';
import { defaultTemplateId } from '@/playrecord';
import type { EditorDoc } from './store';
import { recordNodeToPayload } from './fromRecord';
import { planNodeToPayload, monthlyNodeToPayload } from './fromPlan';
import { parseMindmapDoc, isMindmapDoc } from './fromMindmap';

/** 노드 → 편집 가능 문서(EditorDoc) 매핑. 변환 불가면 null. */
function nodeToEditorDoc(node: BoardNode): EditorDoc | null {
  const payloadType = (node.data?.payload as { type?: string; props?: { title?: string } } | undefined)?.type;
  const propTitle = (node.data?.payload as { props?: { title?: string } } | undefined)?.props?.title;
  const fallbackTitle = (propTitle || (node.data?.title as string | undefined) || (node.text ?? '').split('\n')[0] || '').trim() || undefined;

  if (payloadType === 'PlayStoryCard') {
    const payload = recordNodeToPayload(node);
    return { variant: defaultTemplateId(payload, 'card') || 'default-card', payload, title: fallbackTitle };
  }
  if (payloadType === 'WeeklyPlanGrid') {
    return node.data?.monthly
      ? { variant: 'monthlyplan-summer', payload: monthlyNodeToPayload(node), title: fallbackTitle }
      : { variant: 'weeklyplan', payload: planNodeToPayload(node), title: fallbackTitle };
  }
  if (isMindmapDoc(node)) {
    return { variant: 'topicweb', payload: parseMindmapDoc(node.text || ''), title: fallbackTitle };
  }
  return null;
}

/**
 * 프레임 안(서브프레임 포함)의 변환 가능 문서를 좌→우 순서로 모은다.
 * bundleFromFrame 과 동일한 방식으로 자식/손자 노드를 순회한다.
 */
export function collectFrameEditableDocs(frameId: string): EditorDoc[] {
  const nodes = useBoardStore.getState().nodes;
  const found: Array<{ x: number; doc: EditorDoc }> = [];
  const seen = new Set<string>();

  const collect = (fid: string) => {
    for (const n of Object.values(nodes)) {
      if (n.data?.frameId !== fid || seen.has(n.id)) continue;
      seen.add(n.id);
      if (n.type === 'frame') { collect(n.id); continue; } // 서브프레임 재귀
      const doc = nodeToEditorDoc(n);
      if (doc) found.push({ x: n.x ?? 0, doc });
    }
  };
  collect(frameId);

  return found.sort((a, b) => a.x - b.x).map((f) => f.doc);
}
