// kinderverse 가정통신문(LetterPreview) · 소식지(role:'newsletter') → 편집기 편지형 payload 변환 + 편집기 열기.
// 두 형태를 모두 지원한다:
//   ① writing.letter 라우트 문서 카드: data.payload = { type:'LetterPreview', props:{ kind, title, body, tone, audience? } }.
//   ② genNewsletter 소식지 카드: data.role='newsletter', payload 없이 node.text 만(제목 = 첫 줄, 본문 = 나머지).
// 편집기 letter 템플릿(buildLetterDoc)은 payload.letter 마커로 식별하고 { header.title, kind, meta.theme, body, audience } 를 읽는다.
import { useBoardStore, type BoardNode } from '@/store/boardStore';
import { usePlayEditorStore } from './store';

interface LetterProps {
  kind?: 'letter' | 'notice' | 'text';
  title?: string;
  body?: string;
  audience?: string;
}
interface LetterPayload { type?: string; props?: LetterProps }

const letterPayloadOf = (n: BoardNode): LetterProps | undefined => {
  const p = n.data?.payload as LetterPayload | undefined;
  return p?.type === 'LetterPreview' ? p.props ?? {} : undefined;
};

/** 편집디자인 버튼 노출 판단 — 구조화 통신문(LetterPreview) 또는 소식지(role:'newsletter'). */
export function isLetterDoc(node: BoardNode | undefined): boolean {
  if (!node) return false;
  return !!letterPayloadOf(node) || node.data?.role === 'newsletter' || node.data?.role === 'letter';
}

/** 프레임(또는 그 자신)에서 통신문/소식지 노드를 찾는다. */
export function findLetterNode(frameOrNodeId: string): BoardNode | undefined {
  const nodes = useBoardStore.getState().nodes;
  const self = nodes[frameOrNodeId];
  if (self && isLetterDoc(self)) return self;
  return Object.values(nodes).find((n) => n.data?.frameId === frameOrNodeId && isLetterDoc(n));
}

/** 프레임/노드가 통신문·소식지를 담고 있는가(버튼 노출 판단용). */
export function frameHasLetter(frameId: string): boolean {
  return !!findLetterNode(frameId);
}

/** node.text(마크다운/평문) → { title, body } — 첫 제목 줄을 제목으로, 나머지를 본문으로. */
function parseLetterText(text: string): { title: string; body: string } {
  const lines = String(text || '').split(/\n/);
  let title = '';
  let i = 0;
  // 앞쪽 빈 줄 건너뛰기
  while (i < lines.length && !lines[i].trim()) i++;
  if (i < lines.length) {
    // "# 제목" · "✉️ 제목" · "✨ …" 등 선행 마크/이모지 제거
    title = lines[i].replace(/^#+\s*/, '').replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}️]+\s*/u, '').trim();
    i++;
  }
  const body = lines.slice(i).join('\n').replace(/^\n+/, '').trimEnd();
  return { title: title || '가정통신문', body };
}

export function letterNodeToPayload(node: BoardNode) {
  const props = letterPayloadOf(node);
  if (props) {
    const title = (props.title || '가정통신문').trim();
    return {
      letter: true,
      kind: props.kind === 'notice' ? 'notice' : props.kind === 'text' ? 'text' : 'letter',
      header: { title },
      meta: { theme: title },
      body: (props.body || '').trim(),
      audience: (props.audience || '').trim(),
      photos: [],
    };
  }
  // 소식지(newsletter) — text 파싱
  const { title, body } = parseLetterText(node.text ?? '');
  return {
    letter: true,
    kind: 'letter' as const,
    header: { title },
    meta: { theme: title },
    body,
    audience: '',
    photos: [],
  };
}

/** 통신문/소식지 프레임·노드를 편집기(편지형)로 연다. */
export function openLetterInEditor(frameOrNodeId: string): void {
  const node = findLetterNode(frameOrNodeId);
  if (!node) return;
  usePlayEditorStore.getState().openEditor('letter', letterNodeToPayload(node));
}
