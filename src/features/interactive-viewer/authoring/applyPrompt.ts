/**
 * 프롬프트 → 인터랙티브 노드 편집(AI). 풀스크린 프롬프트바 입력을 받아 노드를 고친다.
 *
 * - 빈 노드 + 게임 생성 의도 → 전체 구성(composeInteractiveNode: 새 컨셉 확립).
 * - 그 외(내용이 있거나 단순 수정) → 맥락 인지 편집(editInteractiveNode): 현재 노드 '전체'를
 *   모델에 보여주고 지시대로 '최소' 수정한다. 기존 요소·동작·연결을 보존해 통째 교체/파괴를 막는다.
 *
 * 어떤 인터랙티브 노드 안에 있으면(풀스크린) 입력은 그 노드(docId)에만 적용된다 —
 * board/prompt.ts 가 inodeFsDocId 를 보고 kv:inode-prompt 로 이 함수에 라우팅한다.
 * 선택 요소가 있으면 그 요소를 우선 대상으로 한다(컨셉 안에서만 수정).
 */
import { useInteractiveStore } from '../store/interactiveStore';
import { composeInteractiveNode, editInteractiveNode } from './composeNode';
import { resolveIntent } from '../resolver/resolveIntent';
import { assembleAndPlace } from '../resolver/place';

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

  // 전체 구성(디렉터)은 '빈 노드 + 게임 생성 의도'일 때만 — 새 컨셉을 처음 세울 때.
  // 그 외엔 맥락 인지 편집으로 '그 자리에서' 최소 수정(컨셉·기존 동작 보존, 통째 교체 금지).
  const empty = doc.elements.length === 0;
  const createIntent =
    /(게임|놀이|액티비티|활동|퀴즈|미션)/.test(prompt) && /(만들|구성|생성|새로|처음|짜)/.test(prompt);

  // 새 컨셉 생성 — 먼저 Resolver(결정론 레시피)로 즉시·안정 합성을 시도하고,
  // 레시피 없는 의도(롱테일)거나 조립 실패면 기존 composeInteractiveNode(전체 LLM)로 폴백.
  if (empty && createIntent) {
    const intent = await resolveIntent(prompt, onBusy);
    if (intent) {
      const placed = await assembleAndPlace(docId, intent.mechanism, intent.input, onBusy);
      if (placed.ok) return { ok: true, addedIds: [], message: placed.message };
      // 레시피 조립 실패 → 폴백.
    }
    const c = await composeInteractiveNode(docId, prompt, onBusy);
    return { ok: c.ok, addedIds: [], message: c.message };
  }

  const r = await editInteractiveNode(docId, prompt, selectedElIds, onBusy);
  return { ok: r.ok, addedIds: [], message: r.message };
}
