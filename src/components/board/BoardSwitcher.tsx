import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/lib/icons';
import { useBoardsStore } from '@/store/boardsStore';
import { KIND_LABEL, type BoardKind } from '@/board/seed';
import { addImageFilesToBoard, viewportCenterWorld } from '@/board/upload';

/* 보드 전환 + 보드 추가 (PRD §4.2). 상단 중앙 플로팅 바.
   보드가 많아지면 가로 스크롤 탭이 뒤쪽 보드를 숨겨 "사라진 것처럼" 보였다 —
   현재 보드명 + 드롭다운 목록(세로 스크롤)으로 교체. */

const ADD_KINDS: BoardKind[] = ['general', 'play_plan', 'play_story', 'observation', 'studio', 'writing'];

export function BoardSwitcher() {
  const boards = useBoardsStore((s) => s.boards);
  const activeId = useBoardsStore((s) => s.activeId);
  const switchBoard = useBoardsStore((s) => s.switchBoard);
  const createBoard = useBoardsStore((s) => s.createBoard);
  const removeBoard = useBoardsStore((s) => s.removeBoard);
  const [listOpen, setListOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const active = boards.find((b) => b.id === activeId) ?? boards[0];
  // 드롭다운 표시 순서: 현재 보드를 맨 위로(저장 순서는 건드리지 않음 — 표시용 정렬만)
  const listed = active ? [active, ...boards.filter((b) => b.id !== active.id)] : boards;

  // 바깥 클릭으로 열린 메뉴 닫기
  useEffect(() => {
    if (!listOpen && !addOpen) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setListOpen(false);
        setAddOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [listOpen, addOpen]);

  function onPickUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ''; // 같은 파일 다시 선택 가능
    if (files.length) {
      const c = viewportCenterWorld(); // 현재 보이는 화면 중앙에 배치
      void addImageFilesToBoard(files, c.x, c.y);
    }
  }

  return (
    <div
      ref={rootRef}
      className="pointer-events-auto absolute left-1/2 top-t3 z-20 flex -translate-x-1/2 items-center gap-t1 rounded-pill border border-border bg-surface/95 p-t1 shadow-md backdrop-blur"
    >
      {/* 현재 보드 + 드롭다운 */}
      <div className="relative">
        <button
          onClick={() => {
            setListOpen((v) => !v);
            setAddOpen(false);
          }}
          aria-label="보드 선택"
          aria-expanded={listOpen}
          className="flex items-center gap-t2 rounded-pill px-t3 py-t1 text-sm font-medium text-fg-1 hover:bg-surface-2"
        >
          <span className="max-w-[220px] truncate">{active?.title ?? '보드'}</span>
          <span className="text-fg-muted">
            <Icon name="chevronDown" size={14} className={`transition-transform duration-150 ease-soft ${listOpen ? 'rotate-180' : ''}`} />
          </span>
        </button>

        {listOpen && (
          <div className="absolute left-0 top-9 z-30 w-64 rounded-xl border border-border bg-surface p-t1 shadow-pop">
            {/* 10개 초과 시 목록만 세로 스크롤(행 높이 ~36px × 10) — 카운트 푸터는 항상 보임 */}
            <div className="max-h-[360px] overflow-y-auto">
            {listed.map((b) => {
              const isActive = b.id === activeId;
              return (
                <div key={b.id} className="group flex items-center">
                  <button
                    onClick={() => {
                      switchBoard(b.id);
                      setListOpen(false);
                    }}
                    title={b.title}
                    className={`flex min-w-0 flex-1 items-center gap-t2 rounded-md px-t3 py-t2 text-left text-sm ${
                      isActive ? 'bg-surface-2 font-medium text-fg-1' : 'text-fg-2 hover:bg-surface-2'
                    }`}
                  >
                    <span className={`shrink-0 ${isActive ? 'text-fg-1' : 'invisible'}`}>
                      <Icon name="check" size={13} />
                    </span>
                    <span className="truncate">{b.title}</span>
                  </button>
                  {boards.length > 1 && (
                    <button
                      onClick={() => removeBoard(b.id)}
                      aria-label={`${b.title} 보드 닫기`}
                      className="mr-t1 hidden h-5 w-5 shrink-0 items-center justify-center rounded-full text-fg-muted hover:text-danger group-hover:flex"
                    >
                      <Icon name="x" size={11} />
                    </button>
                  )}
                </div>
              );
            })}
            </div>
            <div className="mt-t1 border-t border-border px-t3 pb-t1 pt-t2 text-xs text-fg-muted">
              보드 {boards.length}개
            </div>
          </div>
        )}
      </div>

      {/* 보드 추가 */}
      <div className="relative shrink-0">
        <button
          onClick={() => {
            setAddOpen((v) => !v);
            setListOpen(false);
          }}
          aria-label="보드 추가"
          className="flex h-7 w-7 items-center justify-center rounded-pill text-fg-2 hover:bg-surface-2"
        >
          <Icon name="plus" size={16} />
        </button>
        {addOpen && (
          <div className="absolute left-0 top-9 z-30 w-44 rounded-xl border border-border bg-surface p-t1 shadow-pop">
            {ADD_KINDS.map((k) => (
              <button
                key={k}
                onClick={() => {
                  createBoard(k);
                  setAddOpen(false);
                }}
                className="flex w-full items-center gap-t2 rounded-md px-t3 py-t2 text-left text-sm text-fg-1 hover:bg-surface-2"
              >
                {k === 'general' ? <Icon name="board" size={14} /> : <Icon name="sparkle" size={14} fill="currentColor" />}
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 이미지 업로드 — 보드 추가 버튼 오른쪽. 클릭하면 파일 선택 → 화면 중앙에 카드로 추가
          (드래그&드롭과 동일 처리: 즉시 표시 + 백그라운드 영구화·갤러리 저장·썸네일). */}
      <div className="shrink-0">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          onChange={onPickUpload}
          className="hidden"
        />
        <button
          onClick={() => fileRef.current?.click()}
          aria-label="이미지 업로드"
          title="이미지 업로드 — 보드에 추가"
          className="flex h-7 w-7 items-center justify-center rounded-pill text-fg-2 hover:bg-surface-2"
        >
          <Icon name="download" size={16} className="rotate-180" />
        </button>
      </div>
    </div>
  );
}
