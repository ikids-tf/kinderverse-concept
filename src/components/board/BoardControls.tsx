import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/lib/icons';
import { useBoardStore, presentationVisibleSet } from '@/store/boardStore';
import { useUIStore } from '@/store/uiStore';
import { linkedComponent } from '@/board/links';
import { recordCurrentLesson, saveCurrentLesson } from '@/board/lessons';
import { LessonHistoryPanel } from './LessonHistoryPanel';
import { BoardMinimap } from './BoardMinimap';

/** 호버 상태 — 커서가 떠나도 delay(기본 3초) 동안 유지된 뒤 풀린다.
    수업 모드 알약(이전 수업)·✕/수업 종료 클러스터가 바로 닫히지 않게. */
function useDelayedHover(delay = 3000) {
  const [hover, setHover] = useState(false);
  const t = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(t.current), []);
  return {
    hover,
    bind: {
      onMouseEnter: () => {
        window.clearTimeout(t.current);
        setHover(true);
      },
      onMouseLeave: () => {
        window.clearTimeout(t.current);
        t.current = window.setTimeout(() => setHover(false), delay);
      },
    },
  };
}

/* Always-visible edge controls (PRD §4.3, R9 — keep minimal):
   top-right zoom/Fit + 수업 모드. undo/redo 버튼은 제거(⌘/Ctrl+Z 단축키 유지).
   + 프롬프트 바 바로 위 중앙: 연결된 자료 슬라이드 쇼(▶ — 한 장씩 풀스크린처럼). */

/** 슬라이드 쇼 시작 — 수업 모드에서만. 수업 모드가 띄운 연결망을 순번 순서로. */
function startSlideShow() {
  const s = useBoardStore.getState();
  if (!s.classroom) return; // 수업 모드 밖에서는 동작하지 않는다
  // 이동 애니메이션 묶음 — 한 장씩 넘기는 대신 연결된 형태 그대로 전체를 풀로
  // 보여준다(선·출발·도착이 함께 보여야 ▶로 수업을 진행할 수 있다).
  if (s.classroom.ids.some((id) => s.nodes[id]?.type === 'motion')) {
    s.startShow(s.classroom.ids, true);
    return;
  }
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
  const classroom = useBoardStore((s) => s.classroom);
  const show = useBoardStore((s) => s.show);
  const stepShow = useBoardStore((s) => s.stepShow);
  const endShow = useBoardStore((s) => s.endShow);
  const setPromptBarCollapsed = useUIStore((s) => s.setPromptBarCollapsed);
  // 쇼에 이동 애니메이션이 보이면 하단 중앙은 모션 컨트롤 바가 차지한다(내비 숨김).
  // ids만이 아니라 가시 집합 기준 — 프레임 자식으로 들어온 모션 라인도 포함.
  const showHasMotion = useBoardStore((s) => {
    if (!s.show) return false;
    const vis = presentationVisibleSet(s.nodes, s.classroom, s.show);
    return !!vis && [...vis].some((id) => s.nodes[id]?.type === 'motion');
  });
  const [historyOpen, setHistoryOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const lessonHover = useDelayedHover(); // 수업 모드 알약 → 이전 수업 확장 유지
  const clusterHover = useDelayedHover(); // ✕ 클러스터 → 수업 종료 확장 유지
  // 수업 저장 버튼 — 누르면 잠깐 '저장됨 ✓'로 바뀌었다가 돌아온다.
  const [savedFlash, setSavedFlash] = useState(false);
  const savedTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(savedTimer.current), []);

  // 슬라이드 쇼(풀스크린) 진입 → 프롬프트 바를 닫힘(collapsed) 모드로, 종료 시 복원.
  // 화면에는 콘텐츠만 남기기 위함(보드 크롬은 NodeView에서 presenting으로 숨김).
  useEffect(() => {
    setPromptBarCollapsed(!!show);
  }, [show, setPromptBarCollapsed]);

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
      {/* top-left: MAP(미니맵) + zoom/Fit — 슬라이드 쇼 중에는 숨겨 화면을 깨끗하게 */}
      {!show && (
        <div className="pointer-events-auto absolute left-t4 top-t3 z-20 flex items-start gap-t2">
          {/* MAP — 미니맵 네비게이터(버튼 바로 아래로 펼쳐짐) */}
          <div className="relative">
            <button
              title="미니맵 — 보드 전체에서 현재 위치 보기·이동"
              onClick={() => setMapOpen((v) => !v)}
              className={`flex h-9 items-center rounded-pill border border-border bg-surface/95 px-t3 text-overline shadow-sm backdrop-blur hover:bg-surface-2 ${mapOpen ? 'text-accent' : 'text-fg-2'}`}
            >
              MAP
            </button>
            {mapOpen && <BoardMinimap />}
          </div>
          {/* zoom / Fit */}
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
        </div>
      )}

      {/* top-right: (수업 모드 중) ▶/✕ 슬라이드 쇼 토글 + 수업 모드/종료.
          ▶를 누르면 그 자리가 ✕로 바뀌고, ✕를 누르면 수업 모드로 돌아온다. */}
      {/* group/show — 쇼 중에는 수업 종료가 숨고, ✕를 호버하면 오른쪽에서 밀려 나온다.
          커서가 떠나도 3초 뒤에 닫힌다(useDelayedHover). */}
      <div
        {...clusterHover.bind}
        className="group/show pointer-events-auto absolute right-t4 top-t3 z-30 flex items-center gap-t2"
      >
        {/* 수업 저장 — 지금 보이는 수업자료 구성을 '이전 수업' 리스트(+서버 DB)에 기록 */}
        {classroom && (
          <button
            title="이 수업을 이전 수업 리스트에 저장 (서버에도 보관)"
            onClick={() => {
              const rec = saveCurrentLesson();
              if (!rec) return;
              setSavedFlash(true);
              window.clearTimeout(savedTimer.current);
              savedTimer.current = window.setTimeout(() => setSavedFlash(false), 2000);
            }}
            className={`flex h-10 items-center gap-t1 rounded-pill border px-t3 text-sm font-medium shadow-sm backdrop-blur transition-colors duration-150 ease-soft ${
              savedFlash
                ? 'border-accent bg-surface text-accent'
                : 'border-border bg-surface/95 text-fg-2 hover:border-accent hover:text-accent'
            }`}
          >
            <Icon name={savedFlash ? 'check' : 'folder'} size={15} /> {savedFlash ? '저장됨' : '저장'}
          </button>
        )}
        {classroom && (
          <button
            title={show ? '슬라이드 쇼 종료 — 수업 모드로 (ESC)' : '슬라이드 쇼 — 자료를 순서대로 한 장씩 크게'}
            onClick={() => (show ? endShow() : startSlideShow())}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-accent bg-accent text-on-accent shadow-sm transition-transform duration-150 ease-soft hover:scale-105"
          >
            {show ? (
              <Icon name="x" size={20} />
            ) : (
              <svg viewBox="0 0 24 24" width={20} height={20} fill="currentColor" aria-hidden>
                <path d="M8.5 5.8v12.4L18.5 12z" />
              </svg>
            )}
          </button>
        )}
        {/* 수업 모드 알약 — 호버하면 가로로 늘어나며 '이전 수업'이 안에서 나타난다.
            쇼 중에는 접혀서 사라지고(✕만 남음), ✕ 호버 시 다시 밀려 나온다.
            확장은 커서가 떠나고 3초 뒤에 닫힌다. */}
        <div
          {...lessonHover.bind}
          className={`group/lesson flex items-stretch overflow-hidden whitespace-nowrap rounded-pill border shadow-sm transition-all duration-200 ease-soft motion-reduce:transition-none ${
            classroomMode
              ? 'border-accent bg-accent text-on-accent'
              : 'border-border bg-surface/95 text-fg-2'
          } ${
            show
              ? clusterHover.hover
                ? 'max-w-[160px] border-accent opacity-100'
                : 'max-w-0 border-transparent opacity-0 group-focus-within/show:max-w-[160px] group-focus-within/show:border-accent group-focus-within/show:opacity-100'
              : ''
          }`}
        >
          {/* 호버 확장 순서: [이전 수업 | 수업 모드] — 알약이 화면 우측에 붙어 있어
              앞에 끼어드는 이전 수업이 '왼쪽으로' 펼쳐지고, 수업 모드는 오른쪽
              제자리를 지킨다. */}
          {!classroomMode && (
            <button
              title="이전 수업 — 저장된 수업 기록 보기"
              onClick={() => setHistoryOpen(true)}
              className={`flex items-center gap-t1 self-stretch overflow-hidden whitespace-nowrap border-r text-sm font-medium transition-all duration-200 ease-soft hover:bg-surface-2 hover:text-accent motion-reduce:transition-none ${
                lessonHover.hover
                  ? 'max-w-[120px] border-border px-t3 opacity-100'
                  : 'max-w-0 border-transparent px-0 opacity-0 group-focus-within/lesson:max-w-[120px] group-focus-within/lesson:border-border group-focus-within/lesson:px-t3 group-focus-within/lesson:opacity-100'
              }`}
            >
              <Icon name="history" size={15} /> 이전 수업
            </button>
          )}
          <button
            title={classroomMode ? '수업 종료 — 숨긴 요소와 원래 배치 복원' : '수업 모드 — 선택한 요소만 가로로 크게 (선 연결 안 해도 됨)'}
            onClick={() => {
              // 스냅샷이 아닌 최신 상태로 — 쇼 중 수업 종료는 쇼부터 정리하고 보드 복원.
              const s = useBoardStore.getState();
              if (s.show) s.endShow();
              s.toggleClassroomMode();
              recordCurrentLesson(); // 진입했을 때만 저장(종료/시각 토글이면 no-op)
            }}
            className={`flex items-center gap-t1 px-t3 py-t2 text-sm font-medium ${
              classroomMode ? '' : 'hover:bg-surface-2'
            }`}
          >
            <Icon name="present" size={16} /> {classroomMode ? '수업 종료' : '수업 모드'}
          </button>
        </div>
      </div>

      {/* 지난 수업 패널 — 오른쪽에서 슬라이드 인 */}
      <LessonHistoryPanel open={historyOpen} onClose={() => setHistoryOpen(false)} />

      {/* 프롬프트 바 바로 위 중앙 — 슬라이드 진행(◀ n/N ▶) 내비게이션 (쇼 중에만).
          모션 묶음 그룹 쇼는 한 화면이 전부라 내비게이션이 없고, 쇼에 이동
          애니메이션이 있으면 그 자리를 모션 컨트롤 바에 내준다. */}
      {show && !show.group && !showHasMotion && (
        <div className="pointer-events-auto absolute bottom-[96px] left-1/2 z-30 -translate-x-1/2">
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
          </div>
        </div>
      )}
    </>
  );
}
