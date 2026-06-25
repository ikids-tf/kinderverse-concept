/* 포맷 선택 오버레이 — "○○ 아이디어/놀이계획 만들어줘" 입력 시 화면 중앙에 떠서
   '어떤 형식으로 만들까?'를 썸네일로 고르게 한다(board/prompt 가 useFormatChoiceStore.open). 선택 시
   board/prompt.runFormatChoice 로 생성. 앱 크롬이라 Milray 토큰(Tailwind 유틸)만 쓴다. */
import { createPortal } from 'react-dom';
import { useFormatChoiceStore, MODE_CHOICES, type FormatChoice } from '@/store/formatChoiceStore';

const META: Record<FormatChoice, { emoji: string; label: string; desc: string; soon?: boolean }> = {
  'idea-list': { emoji: '💡', label: '아이디어 리스트', desc: '놀이 아이디어 20가지를 간단한 목록 문서로' },
  mindmap: { emoji: '🧠', label: '마인드맵', desc: '대주제 → 소주제 → 활동을 가지로 펼친 생각그물' },
  'plan-doc': { emoji: '📋', label: '놀이계획 문서', desc: '바로 쓰는 주간 놀이계획안 한 장(A4)' },
  package: { emoji: '📦', label: '놀이 패키지', desc: '아이디어·계획안·활동이미지·시청각자료·활동지·동영상·게임 한 세트', soon: false },
};

export function FormatChoiceOverlay() {
  const pending = useFormatChoiceStore((s) => s.pending);
  const close = useFormatChoiceStore((s) => s.close);
  if (!pending) return null;
  const choices = MODE_CHOICES[pending.mode];
  const topic = pending.topic || '놀이';

  const kind = pending.kind;
  const pick = (c: FormatChoice) => {
    close();
    void import('@/board/prompt').then((m) => m.runFormatChoice(c, topic, kind));
  };

  return createPortal(
    <div
      className="kv-fsbar-enter fixed inset-0 z-[120] flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
      onClick={close}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-[min(94vw,660px)] rounded-3xl border border-border bg-surface p-5 shadow-2xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <h2 className="font-serif text-lg font-bold text-fg">
            <span className="text-accent">{topic}</span> — 어떤 형식으로 만들까요?
          </h2>
          <button
            onClick={close}
            className="rounded-pill px-2 py-1 text-sm text-fg-2 transition-colors hover:bg-accent-soft hover:text-fg"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>
        <p className="mb-4 text-sm text-fg-2">원하는 형식을 고르면 바로 만들어 드려요.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {choices.map((c) => {
            const m = META[c];
            return (
              <button
                key={c}
                type="button"
                onClick={() => pick(c)}
                className="group relative flex items-start gap-3 rounded-2xl border border-border bg-surface-2 p-4 text-left transition-all duration-150 ease-soft hover:-translate-y-0.5 hover:border-accent hover:shadow-md"
              >
                <span aria-hidden className="text-3xl leading-none">{m.emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="font-bold text-fg group-hover:text-accent">{m.label}</span>
                    {m.soon && (
                      <span className="rounded-pill bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-fg-2">곧</span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-fg-2">{m.desc}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
