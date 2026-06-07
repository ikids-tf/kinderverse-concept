import { useEffect } from 'react';
import { Icon } from '@/lib/icons';
import { useLocation } from 'react-router-dom';
import { useRouterStore } from '@/store/routerStore';
import { useUIStore } from '@/store/uiStore';
import { useLearningStore } from '@/store/learningStore';
import { RouterTurnView } from '@/components/ai/RouterTurnView';

/* AI 채팅 전용 페이지 (SKILL.md §8).
   헤더 "AI 채팅 · Claude 기반" · 좌측(+새 대화·추천 질문·최근 대화) · 메인("무엇을
   도와드릴까요?" + 추천 칩) · 하단 공용 프롬프트바(전역) · 푸터 면책 문구.
   M1: UI + 라우팅만. 실제 모델 호출은 M2 라우터 연결 시. 추천/최근은 더미 데이터. */

const SUGGESTED_QUESTIONS = [
  '이번 주 만 4세 놀이계획 짜줘',
  '오늘 블록놀이 사진으로 놀이기록 만들어줘',
  '봄 나들이 가정통신문 초안',
  '관찰기록 작성 도와줘',
];

const SUGGESTION_CHIPS = [
  '5월 가정의 달 활동 추천',
  '바깥놀이 활동지',
  '신체발달 관찰 포인트',
  '학부모 상담 멘트',
  '재활용품 미술활동',
];

const RECENT_CHATS = [
  '블록놀이 놀이이야기',
  '4월 주간 놀이계획',
  '봄 동시 활동지',
];

export function AIChatPage() {
  const location = useLocation();
  const turns = useRouterStore((s) => s.turns);
  const newConversation = useRouterStore((s) => s.clear);
  const send = useRouterStore((s) => s.send);
  const availableActions = useUIStore((s) => s.availableActions);
  const setPromptBarLeftInset = useUIStore((s) => s.setPromptBarLeftInset);
  const learnedNotes = useLearningStore((s) => s.prefs.notes);

  // The chat page has its own 256px left panel (md+). Tell the prompt bar so it
  // centers within the chat content area, not over the panel.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const apply = () => setPromptBarLeftInset(mq.matches ? 256 : 0);
    apply();
    mq.addEventListener('change', apply);
    return () => {
      mq.removeEventListener('change', apply);
      setPromptBarLeftInset(0);
    };
  }, [setPromptBarLeftInset]);

  const ask = (text: string) =>
    void send({
      text,
      page: location.pathname,
      selection: { ids: [], types: [], count: 0 },
      available_actions: availableActions,
    });

  const hasConversation = turns.length > 0;

  return (
    <div className="flex h-full min-h-0">
      {/* 좌측 사이드바: 헤더(상단) + 새 대화 + 추천 질문 + 최근 대화 */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-bg-deep px-t4 py-t5 md:flex">
        {/* 헤더 — 사이드바 상단 (LNB 브랜드 마크와 중복 방지로 심볼 없음) */}
        <div className="mb-t5 border-b border-border pb-t4">
          <h1 className="font-display text-h3 font-semibold text-fg">AI 채팅</h1>
          <span className="text-overline text-fg-muted">CLAUDE 기반</span>
        </div>

        <button
          onClick={() => newConversation()}
          className="mb-t5 flex items-center justify-center gap-t2 rounded-pill bg-fg px-t4 py-t3 font-sans text-sm font-semibold text-on-dark transition-colors duration-150 ease-soft hover:bg-fg-1"
        >
          <Icon name="plus" size={16} />
          새 대화
        </button>

        <div className="mb-t5">
          <div className="text-overline mb-t3 text-fg-muted">추천 질문</div>
          <div className="flex flex-col gap-t1">
            {SUGGESTED_QUESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => ask(q)}
                className="rounded-md px-t3 py-t2 text-left text-sm text-fg-2 transition-colors duration-150 ease-soft hover:bg-surface-2 hover:text-fg"
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <div className="text-overline mb-t3 text-fg-muted">최근 대화</div>
          <div className="flex flex-col gap-t1">
            {RECENT_CHATS.map((c) => (
              <button
                key={c}
                className="flex items-center gap-t2 rounded-md px-t3 py-t2 text-left text-sm text-fg-2 transition-colors duration-150 ease-soft hover:bg-surface-2 hover:text-fg"
              >
                <Icon name="message" size={15} />
                <span className="truncate">{c}</span>
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* 메인 — 상단 헤더 없음(모바일에서만 간단 헤더) */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-t2 border-b border-border px-t5 py-t3 md:hidden">
          <h1 className="font-display text-h4 font-semibold text-fg">AI 채팅</h1>
          <span className="text-overline text-fg-muted">· CLAUDE 기반</span>
        </header>

        {hasConversation ? (
          /* 대화: 라우터 결정/명확화/추천을 순서대로 렌더 */
          <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-t6 overflow-auto px-t6 pt-t6 pb-40">
            {turns.map((turn) => (
              <RouterTurnView key={turn.id} turn={turn} />
            ))}
          </div>
        ) : (
          /* 빈 상태: 안내 + 추천 칩. (프롬프트바는 전역 공용 컴포넌트가 하단에 상주) */
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-t6 pb-40 text-center">
            <h2 className="text-h1 font-display font-semibold tracking-[-0.01em] text-fg">
              무엇을 도와드릴까요?
            </h2>
            <p className="mt-t3 max-w-md text-body text-fg-2">
              자유롭게 대화하거나, 아래 추천으로 새 작업을 시작하세요.
            </p>
            {learnedNotes.length > 0 && (
              <p className="mt-t2 inline-flex items-center gap-t1 rounded-pill bg-accent-soft px-t3 py-t1 text-overline text-accent">
                <Icon name="sparkle" size={12} fill="currentColor" /> 지난 선호 반영: {learnedNotes[0]}
              </p>
            )}

            <div className="mt-t6 flex max-w-2xl flex-wrap justify-center gap-t2">
              {SUGGESTION_CHIPS.map((chip) => (
                <button
                  key={chip}
                  onClick={() => ask(chip)}
                  className="rounded-pill border border-border bg-surface px-t4 py-t2 text-sm text-fg-2 shadow-xs transition-[transform,box-shadow,color] duration-150 ease-soft hover:-translate-y-0.5 hover:text-fg hover:shadow-sm"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        )}
        {/* 면책 문구는 공용 프롬프트바 아래로 이동 (PromptBar) */}
      </div>
    </div>
  );
}
