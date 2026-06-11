import { useEffect } from 'react';
import { Icon } from '@/lib/icons';
import { useBoardStore } from '@/store/boardStore';
import { linkedComponent } from '@/board/links';

/* Always-visible edge controls (PRD §4.3, R9 — keep minimal):
   top-right zoom/Fit + 수업 모드. undo/redo 버튼은 제거(⌘/Ctrl+Z 단축키 유지).
   + 프롬프트 바 바로 위 중앙: 연결된 자료 슬라이드 쇼(▶ — 한 장씩 풀스크린처럼). */

/** 슬라이드 쇼 시작 — 수업 모드에서만. 수업 모드가 띄운 연결망을 순번 순서로. */
function startSlideShow() {
  const s = useBoardStore.getState();
  if (!s.classroom) return; // 수업 모드 밖에서는 동작하지 않는다
  const live = s.links.filter((l) => s.nodes[l.from] && s.nodes[l.to]);
  const anchor = s.classroom.ids.find((id) => live.some((l) => l.from === id || l.to === id));
  const chain = anchor ? linkedComponent(anchor, live).filter((id) => s.nodes[id]) : s.classroom.ids;
  if (chain.length) s.startShow(chain);
}

export function BoardControls() {
  const viewport = useBoardStore((s) => s.viewport);
  const zoomBy = useBoardStore((s) => s.zoomBy);
  const fit = useBoardStore((s) => s.fit);
  const classroomMode = useBoardStore((s) => s.classroomMode);
  const toggleClassroom = useBoardStore((s) => s.toggleClassroomMode);
  const classroom = useBoardStore((s) => s.classroom);
  const show = useBoardStore((s) => s.show);
  const stepShow = useBoardStore((s) => s.stepShow);
  const endShow = useBoardStore((s) => s.endShow);

  // 슬라이드 쇼 키보드 — ←/→ 넘기기, ESC 종료(교실에서 리모컨/키보드로).
  useEffect(() => {
    if (!show) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        useBoardStore.getState().stepShow(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        useBoardStore.getState().stepShow(-1);
      } else if (e.key === 'Escape') {
        useBoardStore.getState().endShow();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [show]);

  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;

  return (
    <>
      {/* top-right: zoom/Fit + 수업 모드 — 슬라이드 쇼 중에는 숨겨 화면을 깨끗하게 */}
      {!show && (
        <div className="pointer-events-auto absolute right-t4 top-t3 z-20 flex items-center gap-t2">
          <div className="flex items-center gap-t1 rounded-pill border border-border bg-surface/95 p-t1 shadow-sm backdrop-blur">
            <button
              title="축소 (⌘/Ctrl+-)"
              onClick={() => zoomBy(1 / 1.1, cx, cy)}
              className="flex h-8 w-8 items-center justify-center rounded-pill text-fg-2 hover:bg-surface-2"
            >
              <Icon name="minus" size={16} />
            </button>
            <span className="w-12 text-center text-overline text-fg-2">
              {Math.round(viewport.zoom * 100)}%
            </span>
            <button
              title="확대 (⌘/Ctrl+=)"
              onClick={() => zoomBy(1.1, cx, cy)}
              className="flex h-8 w-8 items-center justify-center rounded-pill text-fg-2 hover:bg-surface-2"
            >
              <Icon name="plus" size={16} />
            </button>
            <button
              title="전체 맞춤 (Shift+1)"
              onClick={fit}
              className="flex h-8 items-center justify-center rounded-pill px-t2 text-overline text-fg-2 hover:bg-surface-2"
            >
              FIT
            </button>
          </div>
          <button
            title={classroomMode ? '수업 종료 — 숨긴 요소와 원래 배치 복원' : '수업 모드 (연결된 요소를 선택하면 그 묶음만 가로로 크게)'}
            onClick={toggleClassroom}
            className={`flex items-center gap-t1 rounded-pill border px-t3 py-t2 text-sm font-medium shadow-sm transition-colors duration-150 ease-soft ${
              classroomMode
                ? 'border-accent bg-accent text-on-accent'
                : 'border-border bg-surface/95 text-fg-2 hover:bg-surface-2'
            }`}
          >
            <Icon name="present" size={16} /> {classroomMode ? '수업 종료' : '수업 모드'}
          </button>
        </div>
      )}

      {/* 프롬프트 바 바로 위 중앙 — 슬라이드 쇼 ▶ / 진행 컨트롤 (수업 모드 전용) */}
      <div className="pointer-events-auto absolute bottom-[96px] left-1/2 z-30 -translate-x-1/2">
        {!show && classroom && (
          <button
            title="슬라이드 쇼 — 연결된 자료를 순서대로 한 장씩 크게"
            onClick={startSlideShow}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-accent bg-accent text-on-accent shadow-lg transition-transform duration-150 ease-soft hover:scale-105"
          >
            <svg viewBox="0 0 24 24" width={18} height={18} fill="currentColor" aria-hidden>
              <path d="M8.5 5.8v12.4L18.5 12z" />
            </svg>
          </button>
        )}
        {show && (
          <div className="flex items-center gap-t1 rounded-pill border border-border bg-surface/95 px-t2 py-t1 shadow-lg backdrop-blur">
            <button
              title="이전 (←)"
              onClick={() => stepShow(-1)}
              disabled={show.index === 0}
              className="flex h-9 w-9 items-center justify-center rounded-full text-fg-2 hover:bg-surface-2 hover:text-accent disabled:opacity-30"
            >
              <Icon name="chevronLeft" size={18} />
            </button>
            <span className="min-w-12 text-center text-sm font-medium tabular-nums text-fg">
              {show.index + 1} / {show.ids.length}
            </span>
            <button
              title="다음 (→)"
              onClick={() => stepShow(1)}
              disabled={show.index === show.ids.length - 1}
              className="flex h-9 w-9 items-center justify-center rounded-full text-fg-2 hover:bg-surface-2 hover:text-accent disabled:opacity-30"
            >
              <Icon name="chevronRight" size={18} />
            </button>
            <div className="mx-t1 h-5 w-px bg-border" />
            <button
              title="슬라이드 쇼 종료 (ESC)"
              onClick={endShow}
              className="flex h-9 w-9 items-center justify-center rounded-full text-fg-2 hover:bg-danger-soft hover:text-danger"
            >
              <Icon name="x" size={16} />
            </button>
          </div>
        )}
      </div>
    </>
  );
}
