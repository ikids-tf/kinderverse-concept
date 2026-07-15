/* 편집디자인을 '보드 카드(iframe)'로 생성한다 — 모달(PlayEditorModal) 대신 보드에 얹는다.
   variant/payload 를 localStorage(kv-playedit-<id>)에 써두고, /playedit.html?id=<id> 를
   임베드한 스티커 노드를 화면 중앙에 만든다(슬라이드·게임 뷰어와 동일한 iframe 카드 패턴).
   뷰어(PlayEditorViewerApp)가 그 id 로 데이터를 읽어 편집기를 열고, 편집 결과를 같은 키에 저장한다.
   ※ 엔트리 이름은 반드시 /play-editor 라우트(데모 런처)와 겹치지 않게 'playedit.html' 유지. */

import { useBoardStore, newId } from '@/store/boardStore';
import { viewportCenterBoardPoint } from '@/board/workflow';
import { addPresetNodeCmd } from '@/board/commands';

const EDIT_KEY = (id: string) => `kv-playedit-${id}`;

/** 편집기 임베드 URL(뷰어 엔트리 + 데이터 키). */
export const editorEmbedUrl = (editId: string) => `/playedit.html?id=${editId}`;

// 가로형(A4 landscape) 문서 variant — 카드도 가로 비율로 만든다(세로 카드에 letterbox 되지 않게).
const LANDSCAPE_VARIANTS = new Set(['name-tag']);
/** variant 별 편집디자인 카드 크기. 가로형 문서는 가로 카드(A4 landscape ≈ 1.41:1). */
export function editorCardSize(variant: string): { w: number; h: number } {
  return LANDSCAPE_VARIANTS.has(variant) ? { w: 820, h: 580 } : { w: 560, h: 820 };
}

/** variant/payload 를 localStorage 에 stash 하고 편집기 데이터 id 를 돌려준다(카드 생성은 별도).
 *  spawnEditorCard(새 카드) 와 '제자리 변환'(placeholder → 편집디자인 카드) 이 공유한다. */
export function stashEditorPayload(variant: string, payload: unknown): string {
  const editId = newId('pe');
  try {
    localStorage.setItem(EDIT_KEY(editId), JSON.stringify({ variant, payload, docs: {}, page: 0 }));
  } catch {
    /* quota — data-URI 이미지가 많으면 실패할 수 있으나 카드는 열린다(빈 상태로 시작) */
  }
  return editId;
}

export function spawnEditorCard(variant: string, payload: unknown): string {
  const editId = stashEditorPayload(variant, payload);
  const c = viewportCenterBoardPoint();
  const { w, h } = editorCardSize(variant);
  const nodeId = addPresetNodeCmd(
    'sticky',
    c.x,
    c.y,
    {
      w,
      h,
      autoH: false,
      text: '편집디자인',
      data: { embed: editorEmbedUrl(editId), title: '편집디자인' },
    },
    '편집디자인 카드 추가',
  );
  useBoardStore.getState().focusNode(nodeId);
  return nodeId;
}
