import { Icon } from '@/lib/icons';
import { useLearningStore } from '@/store/learningStore';

/* 프로필 + 자가고도화 대시보드 (PRD §8). 편집 diff·채택 신호로 학습된 교사
   선호(learned_json)·우수 산출물(exemplar)과 체감 지표(채택률·편집량)를 보여준다. */

const LENGTH_LABEL: Record<string, string> = {
  concise: '간결한 문장',
  detailed: '풍부한 서술',
  unknown: '학습 중',
};

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-t4 shadow-sm">
      <div className="text-overline text-fg-muted">{label}</div>
      <div className="mt-t1 font-display text-h2 font-semibold text-fg">{value}</div>
      {hint && <div className="text-overline text-fg-muted">{hint}</div>}
    </div>
  );
}

export function ProfilePage() {
  const events = useLearningStore((s) => s.events);
  const prefs = useLearningStore((s) => s.prefs);
  const exemplars = useLearningStore((s) => s.exemplars);
  const acceptanceRate = useLearningStore((s) => s.acceptanceRate);
  const avgEditDelta = useLearningStore((s) => s.avgEditDelta);
  const distill = useLearningStore((s) => s.distill);
  const reset = useLearningStore((s) => s.reset);

  const rate = Math.round(acceptanceRate() * 100);
  const delta = Math.round(avgEditDelta());

  return (
    <div className="mx-auto w-full max-w-4xl px-t6 pt-t7 pb-40">
      <header className="mb-t6 flex items-center gap-t3">
        <span className="flex h-12 w-12 items-center justify-center rounded-pill bg-surface-3 text-fg">
          <Icon name="user" size={22} />
        </span>
        <div>
          <div className="text-overline text-fg-muted">계정</div>
          <h1 className="font-display text-h1 font-semibold tracking-[-0.01em] text-fg">김교사 · 햇살반</h1>
        </div>
      </header>

      <section className="mb-t7">
        <div className="mb-t3 flex items-center justify-between">
          <h2 className="font-display text-h3 font-semibold text-fg">AI 자가고도화</h2>
          <div className="flex gap-t2">
            <button
              onClick={() => distill()}
              className="rounded-pill bg-fg px-t4 py-t2 text-sm font-semibold text-on-dark hover:bg-fg-1"
            >
              지금 distill
            </button>
            <button
              onClick={() => reset()}
              className="rounded-pill border border-border px-t4 py-t2 text-sm text-fg-2 hover:bg-surface-2"
            >
              학습 초기화
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-t4">
          <Stat label="수정 없이 채택률" value={`${rate}%`} hint={`신호 ${events.length}건`} />
          <Stat
            label="평균 편집 변화"
            value={delta === 0 ? '—' : `${delta > 0 ? '+' : ''}${delta}자`}
            hint={delta < 0 ? '분량 줄임' : delta > 0 ? '분량 늘림' : ''}
          />
          <Stat label="우수 산출물" value={`${exemplars.length}`} hint="exemplar(RAG)" />
        </div>
      </section>

      {/* 학습된 선호 */}
      <section className="mb-t7">
        <h2 className="mb-t3 font-display text-h4 font-semibold text-fg">학습된 교사 선호 (learned_json)</h2>
        <div className="rounded-xl border border-border bg-surface p-t5">
          <div className="mb-t3 flex flex-wrap gap-t2">
            <span className="rounded-pill bg-accent-soft px-t3 py-1 text-overline text-accent">
              길이: {LENGTH_LABEL[prefs.lengthPref] ?? prefs.lengthPref}
            </span>
            {prefs.tone && (
              <span className="rounded-pill bg-surface-2 px-t3 py-1 text-overline text-fg-2">톤: {prefs.tone}</span>
            )}
          </div>
          {prefs.notes.length > 0 ? (
            <ul className="flex flex-col gap-t1">
              {prefs.notes.map((n, i) => (
                <li key={i} className="flex items-start gap-t2 text-sm text-fg-1">
                  <Icon name="sparkle" size={14} fill="currentColor" className="mt-0.5 text-accent" />
                  {n}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-fg-muted">
              아직 학습된 선호가 없어요. 생성된 카드를 편집·채택하면 “지난번엔 이렇게 쓰셨더라고요”를 다음 생성에 반영합니다.
            </p>
          )}
        </div>
      </section>

      {/* exemplar */}
      {exemplars.length > 0 && (
        <section>
          <h2 className="mb-t3 font-display text-h4 font-semibold text-fg">우수 산출물 (다음 생성에 참고)</h2>
          <div className="flex flex-col gap-t2">
            {exemplars.map((e) => (
              <div key={e.id} className="rounded-md border border-border bg-surface px-t4 py-t3">
                <div className="text-overline mb-t1 text-fg-muted">{e.task} · {e.artifactType}</div>
                <p className="line-clamp-2 text-sm text-fg-2">{e.excerpt}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
