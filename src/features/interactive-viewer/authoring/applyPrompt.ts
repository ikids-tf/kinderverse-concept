/**
 * 프롬프트 → 인터랙티브 노드 편집(AI). 풀스크린 프롬프트바 입력을 받아 노드를 고친다.
 *
 * - 빈 노드 → 전체 구성(runFullCreation: 디자인 에이전트 → 결정론 조립 → 폴백 사슬).
 *   빈 노드에 온 프롬프트는 생성 동사 유무와 무관하게 무조건 전체 구성이다 — 생성어
 *   미매칭 시 빈 문서를 '최소 수정'하던 거짓 경로를 없앴다(교사 카드·라이브러리 저장 포함).
 * - 그 외(내용이 있음) → 맥락 인지 편집(editInteractiveNode): 현재 노드 '전체'를
 *   모델에 보여주고 지시대로 '최소' 수정한다. 기존 요소·동작·연결을 보존해 통째 교체/파괴를 막는다.
 *
 * 어떤 인터랙티브 노드 안에 있으면(풀스크린) 입력은 그 노드(docId)에만 적용된다 —
 * board/prompt.ts 가 inodeFsDocId 를 보고 kv:inode-prompt 로 이 함수에 라우팅한다.
 * 선택 요소가 있으면 그 요소를 우선 대상으로 한다(컨셉 안에서만 수정).
 */
import { useInteractiveStore } from '../store/interactiveStore';
import { editInteractiveNode } from './composeNode';
import { runFullCreation } from './createChain';
import { saveToLibrary } from '../store/library';

export interface ApplyResult {
  ok: boolean;
  addedIds: string[];
  /** 사용자에게 보여줄 짧은 결과 메시지(토스트). */
  message: string;
}

export async function applyInteractivePrompt(
  docId: string,
  prompt: string,
  selectedElIds: string[],
  onBusy?: (msg: string | null) => void,
): Promise<ApplyResult> {
  const store = useInteractiveStore.getState();
  const doc = store.peek(docId) ?? store.ensure(docId);

  // 빈 노드 → 전체 구성(디렉터 사슬 공용 함수). 교사 카드·라이브러리 저장까지 안에서 끝난다.
  if (doc.elements.length === 0) {
    const r = await runFullCreation(docId, prompt, onBusy);
    return { ok: r.ok, addedIds: [], message: r.message };
  }

  // 내용이 있는 노드 → 맥락 인지 편집. 성공하면 라이브러리도 최신 상태로 갱신
  // (편집 후 갤러리/홈 썸네일·제목이 옛 스냅샷으로 남지 않게).
  const r = await editInteractiveNode(docId, prompt, selectedElIds, onBusy);
  if (r.ok) {
    const d = store.peek(docId);
    if (d && d.elements.length > 0) saveToLibrary(d);
  }
  return { ok: r.ok, addedIds: [], message: r.message };
}
