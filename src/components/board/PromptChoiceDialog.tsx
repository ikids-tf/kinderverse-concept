import { useEffect } from 'react';
import { Icon } from '@/lib/icons';
import { usePromptChoiceStore, INTENT_LABEL } from '@/store/promptChoiceStore';
import { applyToSelection } from '@/board/selectionApply';
import { composeFromPrompt } from '@/board/composer';

/* 선택 유형과 요청이 안 맞을 때 뜨는 안내 팝업(SKILL §6, 헌장 1: 디자인 토큰만).
   "그 자리에 생성 / 성격 바꿔 생성 / 새 프레임" 중 교사가 고른다. */

export function PromptChoiceDialog() {
  const pending = usePromptChoiceStore((s) => s.pending);
  const close = usePromptChoiceStore((s) => s.close);

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending, close]);

  if (!pending) return null;
  const { ids, text, intent, selKind } = pending;
  const label = INTENT_LABEL[intent];
  const selWord = selKind === 'image' ? '이미지' : selKind === 'text' ? '메모/텍스트' : '카드';

  const beside = () => {
    void applyToSelection(ids, text, intent, 'beside');
    close();
  };
  const replace = () => {
    void applyToSelection(ids, text, intent, 'replace');
    close();
  };
  const newFrame = () => {
    void composeFromPrompt(text);
    close();
  };

  return (
    <div
      className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center bg-fg/30 backdrop-blur-sm"
      onClick={close}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="선택 적용 방법"
        onClick={(e) => e.stopPropagation()}
        className="mx-t4 w-full max-w-md rounded-2xl border border-border bg-surface p-t5 shadow-pop"
      >
        <div className="flex items-start justify-between gap-t3">
          <div>
            <h2 className="font-display text-h4 font-semibold text-fg">
              선택한 {selWord} {ids.length}개에 어떻게 할까요?
            </h2>
            <p className="mt-t1 text-sm text-fg-muted">
              요청: <span className="text-fg-2">“{text}”</span> — 선택과 요청 유형이 달라요.
            </p>
          </div>
          <button
            onClick={close}
            aria-label="닫기"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pill text-fg-muted hover:bg-surface-2"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="mt-t4 flex flex-col gap-t2">
          <button
            onClick={beside}
            className="flex items-center gap-t3 rounded-xl border border-border bg-surface px-t4 py-t3 text-left hover:bg-surface-2"
          >
            <Icon name="plus" size={18} />
            <span>
              <span className="block text-sm font-medium text-fg">그 자리에 {label} 새로 만들기</span>
              <span className="block text-overline text-fg-muted">선택 카드는 그대로 두고 옆에 추가</span>
            </span>
          </button>

          <button
            onClick={replace}
            className="flex items-center gap-t3 rounded-xl border border-accent bg-accent-soft px-t4 py-t3 text-left hover:brightness-[0.98]"
          >
            <Icon name="sparkle" size={18} fill="currentColor" />
            <span>
              <span className="block text-sm font-medium text-fg">선택 카드를 {label}(으)로 바꿔 생성</span>
              <span className="block text-overline text-fg-muted">선택 카드의 성격을 바꿔 제자리에서 교체</span>
            </span>
          </button>

          <button
            onClick={newFrame}
            className="flex items-center gap-t3 rounded-xl border border-border bg-surface px-t4 py-t3 text-left hover:bg-surface-2"
          >
            <Icon name="board" size={18} />
            <span>
              <span className="block text-sm font-medium text-fg">새 프레임으로 만들기</span>
              <span className="block text-overline text-fg-muted">선택과 무관하게 빈 곳에 새로 구성</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
