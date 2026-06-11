import { useBoardStore } from '@/store/boardStore';
import {
  moveNodesCmd,
  deleteNodesCmd,
  duplicateNodesCmd,
  groupNodesCmd,
  captureNodes,
  pushRedesign,
} from './commands';
import type { BoardOpMatch } from '@/ai/intent-lexicon';

/* 화면 지시 실행기 (INTENT_DIAGNOSIS P2-7). "이거 더 크게 / 왼쪽으로 / 정렬해 /
   지워 / 복사 / 노란색으로" 같은 보드 조작 의도를 실제 보드 동작으로 실행한다.
   전부 L1 자동(undo 가능, CLAUDE §4) — 기존 commands.ts의 undoable 커맨드 재사용,
   기하/데이터 변경은 captureNodes→pushRedesign으로 한 번의 ⌘Z가 되게 묶는다. */

const MOVE_STEP = 240; // "왼쪽으로" 한 번에 옮기는 보드 px
const RESIZE_UP = 1.25;
const RESIZE_DOWN = 0.8;
const GAP = 24;

/** 보드 조작 실행. 성공 시 사용자에게 보일 라벨, 실행 불가면 null. */
export function runBoardOp(ids: string[], m: BoardOpMatch): string | null {
  const b = useBoardStore.getState();
  const nodes = ids.map((id) => b.nodes[id]).filter(Boolean);
  if (nodes.length === 0) return null;

  switch (m.op) {
    case 'move': {
      const d = m.dir ?? 'right';
      const dx = d === 'left' ? -MOVE_STEP : d === 'right' ? MOVE_STEP : 0;
      const dy = d === 'up' ? -MOVE_STEP : d === 'down' ? MOVE_STEP : 0;
      moveNodesCmd(ids, dx, dy);
      return '이동';
    }
    case 'delete':
      deleteNodesCmd(ids);
      return '삭제';
    case 'duplicate':
      duplicateNodesCmd(ids);
      return '복제';
    case 'group':
      groupNodesCmd(ids);
      return '그룹';
    case 'resize_up':
    case 'resize_down': {
      const k = m.op === 'resize_up' ? RESIZE_UP : RESIZE_DOWN;
      const before = captureNodes(ids);
      for (const n of nodes) {
        if (n.locked) continue;
        // autoH 카드는 높이가 내용을 따라가므로 너비만 스케일.
        const patch: { w: number; h?: number } = { w: Math.max(80, Math.round(n.w * k)) };
        if (!n.autoH) patch.h = Math.max(60, Math.round(n.h * k));
        b.updateNodeRaw(n.id, patch);
      }
      pushRedesign(ids, before, m.op === 'resize_up' ? '크게' : '작게');
      return m.op === 'resize_up' ? '크게' : '작게';
    }
    case 'match_size': {
      // 크기 통일: 첫 선택(앵커) 카드의 '월드 크기'(스케일 반영)에 나머지를 맞춘다.
      // 너비를 기준으로 각 카드의 고유 비율은 유지(16:9 썸네일이 찌그러지지 않게),
      // 스케일은 1로 접어 명목 크기와 화면 크기를 일치시킨다.
      const items = nodes.filter((n) => !n.locked);
      if (items.length < 2) return null;
      const before = captureNodes(ids);
      const anchor = items[0];
      const aw = anchor.w * (anchor.scale ?? 1);
      for (const n of items.slice(1)) {
        const k = aw / n.w;
        const patch: { w: number; h?: number; scale: number } = {
          w: Math.max(80, Math.round(aw)),
          scale: 1,
        };
        if (!n.autoH) patch.h = Math.max(60, Math.round(n.h * k));
        b.updateNodeRaw(n.id, patch);
      }
      pushRedesign(ids, before, '크기 맞춤');
      return '크기 맞춤';
    }
    case 'recolor': {
      const color = m.color ?? 'accent-soft';
      const targets = nodes.filter((n) => (n.type === 'sticky' || n.type === 'shape') && !n.locked);
      if (targets.length === 0) return null; // 색 토큰이 의미 있는 카드가 없음
      const tids = targets.map((n) => n.id);
      const before = captureNodes(tids); // NodeSnap이 color를 포함 → undo로 색 복원
      targets.forEach((n) => b.updateNodeRaw(n.id, { color }));
      pushRedesign(tids, before, '색 변경');
      return '색 변경';
    }
    case 'align': {
      // 한 줄 정렬: 위쪽 가장자리(최소 y)에 맞추고 x 순서대로 GAP 간격 배치.
      const before = captureNodes(ids);
      const sorted = [...nodes].filter((n) => !n.locked).sort((a, z) => a.x - z.x);
      if (sorted.length < 2) return null;
      const top = Math.min(...sorted.map((n) => n.y));
      let x = sorted[0].x;
      for (const n of sorted) {
        b.updateNodeRaw(n.id, { x: Math.round(x), y: Math.round(top) });
        x += n.w + GAP;
      }
      pushRedesign(ids, before, '정렬');
      return '정렬';
    }
    case 'arrange': {
      // 격자 정리: 좌상단 기준 √n 열 격자.
      const before = captureNodes(ids);
      const items = [...nodes].filter((n) => !n.locked).sort((a, z) => a.y - z.y || a.x - z.x);
      if (items.length < 2) return null;
      const cols = Math.ceil(Math.sqrt(items.length));
      const cellW = Math.max(...items.map((n) => n.w)) + GAP;
      const cellH = Math.max(...items.map((n) => n.h)) + GAP;
      const ox = Math.min(...items.map((n) => n.x));
      const oy = Math.min(...items.map((n) => n.y));
      items.forEach((n, i) => {
        b.updateNodeRaw(n.id, {
          x: Math.round(ox + (i % cols) * cellW),
          y: Math.round(oy + Math.floor(i / cols) * cellH),
        });
      });
      pushRedesign(ids, before, '정리');
      return '정리';
    }
    default:
      return null;
  }
}
