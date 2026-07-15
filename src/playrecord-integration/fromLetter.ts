// 가정통신문/안내문/소식지 → verse 가정통신문 편집디자인(newsletter) payload 변환 + 편집기 열기.
// 두 종류 지원:
//   ① LetterPreview 카드(writing.letter): data.payload = { type:'LetterPreview', props:{ kind, title, body } }.
//   ② 소식지 카드(decorateDoc): data.role='newsletter', payload 없음 — 마크다운 text 에서 제목·본문 추출.
// 본문을 문단으로 나눠, 요리체험(paragraphs)·행사안내(greeting) 두 템플릿 모두에서 렌더되게 넘긴다.
// (kind='text' 인 일반 문장/메모는 편집디자인 대상이 아니다 → 버튼 미노출.)
import { useBoardStore, type BoardNode } from '@/store/boardStore';
import { spawnEditorCard } from './spawnEditorCard';

interface LetterProps {
  kind?: string;
  title?: string;
  body?: string;
  audience?: string;
}
interface LetterPayload {
  type?: string;
  props?: LetterProps;
}

const isLetterNode = (n?: BoardNode): boolean => {
  const p = n?.data?.payload as LetterPayload | undefined;
  if (p?.type === 'LetterPreview' && (p.props?.kind ?? 'letter') !== 'text') return true;
  if (n?.data?.role === 'newsletter') return true; // decorateDoc 소식지(payload 없음, 마크다운 text)
  return false;
};

/** 프레임(또는 그 자신)에서 가정통신문(LetterPreview, text 제외) 노드를 찾는다. */
export function findLetterNode(frameOrNodeId: string): BoardNode | undefined {
  const nodes = useBoardStore.getState().nodes;
  const self = nodes[frameOrNodeId];
  if (isLetterNode(self)) return self;
  return Object.values(nodes).find((n) => n.data?.frameId === frameOrNodeId && isLetterNode(n));
}

/** 프레임/노드가 가정통신문(LetterPreview)을 담고 있는가(버튼 노출 판단용). */
export function frameHasLetter(frameId: string): boolean {
  return !!findLetterNode(frameId);
}

/** 가정통신문/소식지 → 가정통신문 편집디자인 payload. 제목+본문을 문단으로 나눠
    요리체험(paragraphs)·행사안내(greeting) 두 템플릿 모두에서 렌더되게 함께 넘긴다. */
export function letterNodeToPayload(node: BoardNode) {
  const p = (node.data?.payload as LetterPayload | undefined)?.props;
  let title: string, body: string;
  if (p && (p.title || p.body)) {
    // ① LetterPreview
    title = (p.title || '가정통신문').trim();
    body = String(p.body || '').trim();
  } else {
    // ② 소식지(role:'newsletter') — 마크다운 text 에서 제목(H1)·본문 추출
    const md = String(node.text || '').trim();
    title = ((md.match(/^#\s+(.+)$/m)?.[1]) || '가정통신문').replace(/[#*]/g, '').trim();
    body = md
      .replace(/^#\s+.+$/m, '')      // 제목 H1 제거
      .replace(/^#{1,6}\s*/gm, '')   // 소제목 마크 제거
      .replace(/^>\s*/gm, '')        // 콜아웃(>) 마크 제거
      .replace(/\*\*/g, '')          // 굵게 제거
      .trim();
  }
  const paragraphs = body.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
  return { newsletter: { title, paragraphs, greeting: body } };
}

/** 가정통신문 노드를 verse 편집기(가정통신문 편집디자인)로 연다.
    기본 변형=요리체험(newsletter-cooking), 편집기 picker 로 행사안내(newsletter-event) 전환 가능. */
export function openLetterInEditor(frameOrNodeId: string): void {
  const node = findLetterNode(frameOrNodeId);
  if (!node) return;
  spawnEditorCard('newsletter-cooking', letterNodeToPayload(node));
}
