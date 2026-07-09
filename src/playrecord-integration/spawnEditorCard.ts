/* 편집디자인을 '보드 카드(iframe)'로 생성한다 — 모달(PlayEditorModal) 대신 보드에 얹는다.
   variant/payload 를 localStorage(kv-playedit-<id>)에 써두고, /playedit.html?id=<id> 를
   임베드한 스티커 노드를 화면 중앙에 만든다(슬라이드·게임 뷰어와 동일한 iframe 카드 패턴).
   뷰어(PlayEditorViewerApp)가 그 id 로 데이터를 읽어 편집기를 열고, 편집 결과를 같은 키에 저장한다.
   ※ 엔트리 이름은 반드시 /play-editor 라우트(데모 런처)와 겹치지 않게 'playedit.html' 유지. */

import { useBoardStore, newId } from '@/store/boardStore';
import { viewportCenterBoardPoint } from '@/board/workflow';
import { addPresetNodeCmd } from '@/board/commands';

const EDIT_KEY = (id: string) => `kv-playedit-${id}`;

export function spawnEditorCard(variant: string, payload: unknown): string {
  const editId = newId('pe');
  try {
    localStorage.setItem(EDIT_KEY(editId), JSON.stringify({ variant, payload, docs: {}, page: 0 }));
  } catch {
    /* quota — data-URI 이미지가 많으면 실패할 수 있으나 카드는 열린다(빈 상태로 시작) */
  }
  const c = viewportCenterBoardPoint();
  const nodeId = addPresetNodeCmd(
    'sticky',
    c.x,
    c.y,
    {
      w: 560,
      h: 820,
      autoH: false,
      text: '편집디자인',
      data: { embed: `/playedit.html?id=${editId}`, title: '편집디자인' },
    },
    '편집디자인 카드 추가',
  );
  useBoardStore.getState().focusNode(nodeId);
  return nodeId;
}
