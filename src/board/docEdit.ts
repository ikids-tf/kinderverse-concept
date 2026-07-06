/**
 * 문서 편집 — 프롬프트로 문서(선택 영역)를 AI 수정하는 배관(독립 모듈).
 *
 * 문서 편집 페이지의 하단 프롬프트바 입력을 받아, 선택한 영역(섹션)만 지시대로 고쳐 되쓴다.
 * 선택이 없으면 문서 전체를 맥락으로 고친다. 본문 커밋은 editTextCmd(되돌리기 가능).
 *
 * ⚠ 이 파일은 board/prompt.ts·composer.ts 를 import 하지 않는다(순환 방지). 페이지와는
 *   CustomEvent('kv:doc-edit-prompt')로만 잇는다(직접 import 없음). @/ai·@/store·commands 만 의존.
 */
import { callGateway } from '@/ai/client';
import { useBoardStore } from '@/store/boardStore';
import { editTextCmd } from './commands';
import { splitSections, joinSections, type DocSection } from '@/features/doc-edit/sections';

/** 코드펜스·머리말 제거(모델이 ```로 감싸는 경우). */
function stripFence(t: string): string {
  return t.replace(/^```[a-z]*\n?/i, '').replace(/```\s*$/, '').trim();
}

export interface DocPromptResult {
  ok: boolean;
  message: string;
}

/**
 * 문서(nodeId)의 선택 영역(selIds)만 프롬프트대로 고친다. 선택이 없으면 전체.
 * onBusy 로 진행 문구를 흘려보낸다(프롬프트바 스트리밍은 호출부의 beginGen/endGen 이 담당).
 */
export async function applyDocPrompt(
  nodeId: string,
  prompt: string,
  selIds: string[],
  onBusy?: (m: string | null) => void,
): Promise<DocPromptResult> {
  const node = useBoardStore.getState().nodes[nodeId];
  if (!node) return { ok: false, message: '문서를 찾지 못했어요' };
  const md = node.text ?? '';
  const secs = splitSections(md);
  const sel = selIds.length ? new Set(selIds) : null; // null = 문서 전체
  const scope = sel ? secs.filter((s) => sel.has(s.id)).map((s) => s.text).join('\n\n') : md;
  if (sel && !scope.trim()) return { ok: false, message: '고칠 영역을 찾지 못했어요' };

  onBusy?.(sel ? '✏️ 고른 영역을 고치는 중…' : '✏️ 문서를 고치는 중…');
  const ask = (provider: 'auto' | 'gemini') =>
    callGateway({
      task: 'writing',
      tier: 'mid',
      provider,
      fallback: ['high'],
      system:
        '너는 유치원 교사의 교육 문서를 다듬는 문장 에이전트다. 교사의 지시대로 해당 부분만 고친다. ' +
        '사실을 지어내지 말고, 마크다운 구조(제목 #·##, 표, 인용 >, 목록)를 그대로 유지한다. ' +
        '설명·인사·머리말 없이 고친 마크다운만 출력한다(코드펜스 금지).',
      messages: [
        {
          role: 'user',
          content: sel
            ? `아래는 어느 교육 문서의 '선택한 영역'입니다. 교사 지시대로 이 부분만 고쳐, 같은 마크다운 구조로 다시 써 주세요.\n\n[교사 지시]\n${prompt}\n\n[선택 영역]\n${scope.slice(0, 3500)}`
            : `아래 교육 문서를 교사 지시대로 고쳐 전체를 다시 써 주세요. 제목·표·구성을 유지하세요.\n\n[교사 지시]\n${prompt}\n\n[문서]\n${md.slice(0, 4000)}`,
        },
      ],
      meta: { kind: 'doc_edit', title: (node.text ?? '문서').slice(0, 20), selected: [] },
      maxTokens: 1600,
    });

  let res = await ask('auto');
  if (!res.ok || !res.text) res = await ask('gemini'); // 프로바이더 한도 시 다른 쪽으로
  if (!res.ok || !res.text) return { ok: false, message: '수정에 실패했어요 — 다시 시도해 주세요' };
  const out = stripFence(res.text);
  if (!out) return { ok: false, message: '수정 내용을 받지 못했어요' };

  let next: string;
  if (sel) {
    // 선택 섹션들의 자리에 결과를 되끼운다 — 여러 섹션을 함께 보냈으면 결과 블록을 첫 선택 섹션
    // 자리에 넣고 나머지 선택 섹션은 제거(결과에 통합됨). 비선택 섹션은 그대로.
    const rebuilt: DocSection[] = [];
    let placed = false;
    for (const s of secs) {
      if (sel.has(s.id)) {
        if (!placed) {
          rebuilt.push({ ...s, text: out });
          placed = true;
        }
      } else {
        rebuilt.push(s);
      }
    }
    next = joinSections(rebuilt);
  } else {
    next = out;
  }
  if (next.trim() === md.trim()) return { ok: false, message: '바뀐 내용이 없어요 — 다르게 말씀해 주세요' };

  editTextCmd(nodeId, md, next);
  return { ok: true, message: sel ? '고른 영역을 고쳤어요' : '문서를 고쳤어요' };
}
