import { useState } from 'react';

/**
 * 게임 추천 스트립 — 프롬프트바 위에 뜨는 '이런 놀이 어때요?' 카드들.
 * 클릭하면 v0.2 Resolver(결정론 레시피)가 보드에 새 게임 노드를 '즉시 합성'한다
 * (startInteractiveGame → resolveIntent → assembleAndPlace, 롱테일은 compose 폴백).
 *
 * 앱 크롬이므로 Milray 토큰 유지(CLAUDE §2). 6월=여름 시즌 기준 추천(테마는 Resolver가 처리).
 */
interface Suggestion {
  emoji: string;
  label: string;
  /** Resolver 동사 매핑 키가 들어가도록 동사를 분명히 둔다(분류·세기·뒤집기·짝·꾸미기). */
  prompt: string;
}

const SUGGESTIONS: Suggestion[] = [
  { emoji: '🌊', label: '바닷속 친구 분류', prompt: '바닷속 친구 분류하기 게임' },
  { emoji: '🍉', label: '수박 순서 세기', prompt: '수박 순서대로 세기 게임' },
  { emoji: '🃏', label: '카드 뒤집기', prompt: '여름 과일 카드 뒤집기 게임' },
  { emoji: '🧩', label: '짝 맞추기', prompt: '바다 동물 짝 맞추기 게임' },
  { emoji: '🎨', label: '물놀이 꾸미기', prompt: '여름 물놀이 꾸미기 놀이' },
];

export function GameSuggestStrip() {
  const [busy, setBusy] = useState(false);
  const pick = (s: Suggestion) => {
    if (busy) return;
    setBusy(true);
    void import('@/board/prompt')
      .then((m) => m.startInteractiveGame(s.prompt))
      .finally(() => setTimeout(() => setBusy(false), 1000));
  };
  return (
    <div
      data-kv-suggest
      className="pointer-events-auto absolute bottom-full left-1/2 z-0 mb-t2 flex -translate-x-1/2 flex-col items-center"
    >
      <div className="flex max-w-[calc(100vw-7rem)] flex-wrap items-center justify-center gap-t2 rounded-2xl border border-border bg-surface/95 px-t4 py-t3 shadow-lg backdrop-blur">
        <span className="flex items-center gap-t1 pr-t1 text-overline text-fg-2">
          <span aria-hidden>✨</span> 이런 놀이 어때요?
        </span>
        {SUGGESTIONS.map((s) => (
          <button
            key={s.label}
            type="button"
            disabled={busy}
            onClick={() => pick(s)}
            title={`'${s.label}' 바로 만들기`}
            className="flex items-center gap-t2 rounded-pill border border-border bg-surface px-t3 py-t2 text-sm font-semibold text-fg-2 shadow-sm transition-colors duration-150 ease-soft hover:border-accent hover:text-accent disabled:cursor-wait disabled:opacity-50"
          >
            <span aria-hidden className="text-base leading-none">
              {s.emoji}
            </span>
            <span className="whitespace-nowrap">{s.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
