import { useEffect, useState } from 'react';
import { Icon } from '@/lib/icons';
import { useBoardStore } from '@/store/boardStore';
import { listLessons, removeLesson, recordCurrentLesson, type LessonRecord } from '@/board/lessons';

/* 지난 수업 패널 — 오른쪽에서 슬라이드 인. 수업 모드 진입 시 자동 저장된 기록을
   최신순으로 보여주고, [다시 열기]로 그 자료 구성 그대로 수업 모드를 재시작한다.
   썸네일은 살아있는 노드에서 그때그때 찾는다(지워진 카드는 아이콘 폴백). */

function dayLabel(at: number): string {
  const d = new Date(at);
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (diff === 0) return '오늘';
  if (diff === 1) return '어제';
  return d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
}

const timeLabel = (at: number) =>
  new Date(at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

const TYPE_ICON: Record<string, Parameters<typeof Icon>[0]['name']> = {
  frame: 'frame',
  sticky: 'record',
  text: 'writing',
  image: 'gallery',
  motion: 'motion',
};

export function LessonHistoryPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [lessons, setLessons] = useState<LessonRecord[]>([]);
  const nodes = useBoardStore((s) => s.nodes);

  useEffect(() => {
    if (open) setLessons(listLessons());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  /** 그 수업의 자료 구성 그대로 수업 모드 재시작(살아있는 노드만). */
  const replay = (rec: LessonRecord) => {
    const b = useBoardStore.getState();
    const alive = rec.items.map((it) => it.id).filter((id) => b.nodes[id]);
    if (!alive.length) return;
    if (b.show) b.endShow();
    if (b.classroom) b.toggleClassroomMode(); // 진행 중 수업 정리 후 재진입
    useBoardStore.getState().setSelection(alive);
    useBoardStore.getState().toggleClassroomMode();
    recordCurrentLesson();
    onClose();
  };

  const erase = (id: string) => {
    removeLesson(id);
    setLessons(listLessons());
  };

  return (
    /* 클리핑 래퍼 — 닫혀서 오른쪽 밖으로 밀려난 패널이 스크롤 영역(가로 오버플로)을
       만들지 않게 가둔다(미들버튼 오토스크롤로 패널이 끌려 나오던 버그). */
    <div
      className="absolute inset-0 z-30 overflow-hidden"
      style={{ pointerEvents: open ? 'auto' : 'none' }}
    >
      {/* 클릭 캐처 — 패널 밖을 누르면 닫힘 */}
      {open && <div className="absolute inset-0" onClick={onClose} />}

      <aside
        aria-hidden={!open}
        className={`pointer-events-auto absolute inset-y-0 right-0 flex w-[380px] max-w-[90vw] flex-col border-l border-border bg-surface shadow-xl transition-transform duration-200 ease-soft motion-reduce:transition-none ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* header */}
        <header className="flex items-center gap-t2 border-b border-border px-t5 py-t4">
          <Icon name="history" size={18} className="text-accent" />
          <h2 className="flex-1 font-display text-lg font-semibold text-fg">이전 수업</h2>
          <span className="text-overline text-fg-muted">{lessons.length}건</span>
          <button
            title="닫기 (ESC)"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-pill text-fg-2 hover:bg-surface-2"
          >
            <Icon name="x" size={16} />
          </button>
        </header>

        {/* list */}
        <div className="min-h-0 flex-1 overflow-y-auto px-t4 py-t4">
          {lessons.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-t3 px-t6 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">
                <Icon name="present" size={22} />
              </span>
              <p className="font-display text-base font-semibold text-fg">아직 저장된 수업이 없어요</p>
              <p className="text-sm leading-relaxed text-fg-muted">
                보드에서 자료를 선택해 수업 모드를 시작하면
                <br />
                이곳에 자동으로 기록돼요.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-t3">
              {lessons.map((rec) => {
                const alive = rec.items.filter((it) => nodes[it.id]);
                const thumbs = rec.items.filter((it) => it.type !== 'frame').slice(0, 4);
                const extra = rec.items.filter((it) => it.type !== 'frame').length - thumbs.length;
                return (
                  <li
                    key={rec.id}
                    className="group rounded-lg border border-border bg-surface p-t4 shadow-sm transition-colors duration-150 ease-soft hover:border-accent"
                  >
                    <div className="flex items-start gap-t2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-display text-base font-semibold text-fg">{rec.title}</p>
                        <p className="mt-t1 text-overline text-fg-muted">
                          {dayLabel(rec.at)} · {timeLabel(rec.at)} · 자료 {rec.items.length}개
                        </p>
                      </div>
                      <button
                        title="기록 삭제"
                        onClick={() => erase(rec.id)}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-pill text-fg-muted opacity-0 transition-opacity duration-150 ease-soft hover:bg-danger-soft hover:text-danger group-hover:opacity-100"
                      >
                        <Icon name="x" size={13} />
                      </button>
                    </div>

                    {/* 자료 미리보기 — 살아있는 이미지 카드는 썸네일, 그 외는 아이콘 타일 */}
                    {thumbs.length > 0 && (
                      <div className="mt-t3 flex items-center gap-t1">
                        {thumbs.map((it) => {
                          const n = nodes[it.id];
                          const src = n?.type === 'image' ? ((n.data?.thumb as string) || n.src) : undefined;
                          return src ? (
                            <img
                              key={it.id}
                              src={src}
                              alt={it.caption}
                              title={it.caption}
                              className="h-11 w-11 rounded-md border border-border object-cover"
                            />
                          ) : (
                            <span
                              key={it.id}
                              title={it.caption}
                              className="flex h-11 w-11 items-center justify-center rounded-md border border-border bg-surface-2 text-fg-muted"
                            >
                              <Icon name={TYPE_ICON[it.type] ?? 'board'} size={16} />
                            </span>
                          );
                        })}
                        {extra > 0 && (
                          <span className="flex h-11 w-11 items-center justify-center rounded-md border border-border bg-surface-2 text-overline text-fg-2">
                            +{extra}
                          </span>
                        )}
                      </div>
                    )}

                    <div className="mt-t3 flex items-center gap-t2">
                      <button
                        disabled={alive.length === 0}
                        onClick={() => replay(rec)}
                        title={alive.length === 0 ? '자료가 보드에서 삭제되어 다시 열 수 없어요' : '이 자료 구성으로 수업 모드 시작'}
                        className="inline-flex items-center gap-t1 rounded-pill border border-accent bg-accent px-t3 py-t1 text-sm font-medium text-on-accent transition-colors duration-150 ease-soft hover:bg-accent-hover disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-2 disabled:text-fg-muted"
                      >
                        <Icon name="present" size={13} /> 다시 열기
                      </button>
                      {alive.length < rec.items.length && (
                        <span className="text-overline text-fg-muted">
                          {rec.items.length - alive.length}개 자료가 삭제됨
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
