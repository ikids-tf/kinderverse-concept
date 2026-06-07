import { seedWorkflowFrame } from './workflow';
import { newId, type BoardNode, type BoardSnapshot, type Lane } from '@/store/boardStore';

/* 보드 종류별 시드 — 즐겨찾기 카드로 새 보드를 만들 때, 그 콘텐츠에 최적화된
   시작 카드/화면으로 캔버스를 구성한다(SKILL §6/§9, PRD §4.2). */

export type BoardKind = 'general' | 'play_plan' | 'play_story' | 'observation' | 'studio' | 'writing';

export const KIND_LABEL: Record<BoardKind, string> = {
  general: '빈 보드',
  play_plan: '놀이계획',
  play_story: '놀이기록',
  observation: '관찰기록',
  studio: '스튜디오',
  writing: '문장생성',
};

/** Favorite card id → board kind. */
export function kindFromFavorite(id: string): BoardKind {
  if (id === 'play_plan' || id === 'play_story' || id === 'observation' || id === 'studio' || id === 'writing') {
    return id;
  }
  return 'general';
}

const emptyViewport = { zoom: 1, panX: 0, panY: 0 };

function builder() {
  const nodes: Record<string, BoardNode> = {};
  const order: string[] = [];
  const add = (n: Omit<BoardNode, 'id'> & { id?: string }) => {
    const node = { id: n.id ?? newId(n.type), ...n } as BoardNode;
    nodes[node.id] = node;
    order.push(node.id);
    return node;
  };
  return { nodes, order, add };
}

function sticky(x: number, y: number, text: string, color = 'accent-soft'): Omit<BoardNode, 'id'> {
  return { type: 'sticky', x, y, w: 200, h: 150, text, color };
}
function titleNode(text: string): Omit<BoardNode, 'id'> {
  return { type: 'text', x: 140, y: 32, w: 360, h: 52, text };
}

/* Build the starter snapshot for a board kind. */
export function seedSnapshot(kind: BoardKind): BoardSnapshot {
  const { nodes, order, add } = builder();
  const lanes: Record<string, Lane> = {};
  const laneOrder: string[] = [];

  const row = (y: number) => [140, 372, 604].map((x) => ({ x, y }));

  switch (kind) {
    case 'play_plan': {
      // 핵심: "새 놀이계획" 프레임 + 워크플로 러너. 단계 실행 시 보드 네이티브
      // 카드(이미지/메모)가 프레임 안에 생성됨(board/workflow.ts).
      seedWorkflowFrame('새 놀이계획', 120, 80).forEach((n) => add(n));
      break;
    }
    case 'play_story': {
      add(titleNode('놀이기록 (놀이이야기)'));
      const p = row(110);
      add(sticky(p[0].x, p[0].y, '오늘 활동을 떠올리며 사진을 골라보세요', 'accent-soft'));
      add(sticky(p[1].x, p[1].y, '아이들이 무엇을 했나요? 인상 깊은 장면', 'surface-3'));
      add(sticky(p[2].x, p[2].y, '학부모께 전하고 싶은 한마디', 'gold'));
      add({ type: 'image', x: 140, y: 290, w: 220, h: 160, text: '활동 사진 자리' });
      break;
    }
    case 'observation': {
      add(titleNode('관찰기록'));
      const p = row(110);
      add(sticky(p[0].x, p[0].y, '관찰 대상 아동 (마스킹)', 'accent-soft'));
      add(sticky(p[1].x, p[1].y, '상황 · 행동 · 또래 상호작용', 'surface-3'));
      add(sticky(p[2].x, p[2].y, '연계 영역 (누리/표준) · 근거', 'success-soft'));
      break;
    }
    case 'studio': {
      add(titleNode('스튜디오'));
      const p = row(110);
      add(sticky(p[0].x, p[0].y, '활동지/워크시트 (A4)', 'accent-soft'));
      add(sticky(p[1].x, p[1].y, '색칠 도안', 'surface-3'));
      add(sticky(p[2].x, p[2].y, '개념 이미지 (AI 생성)', 'gold'));
      break;
    }
    case 'writing': {
      add(titleNode('문장생성'));
      const p = row(110);
      add(sticky(p[0].x, p[0].y, '받는 사람 (학부모/가정)', 'accent-soft'));
      add(sticky(p[1].x, p[1].y, '핵심 메시지', 'surface-3'));
      add(sticky(p[2].x, p[2].y, '톤 (따뜻/정중/간결)', 'gold'));
      break;
    }
    case 'general':
    default:
      break;
  }

  return { nodes, order, lanes, laneOrder, viewport: emptyViewport };
}
