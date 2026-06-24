/**
 * 교사용 활동 안내 패널 — 게임 디자인 에이전트가 만든 TeacherCard 를 교사에게 보여 준다.
 * 우측 드로어(재생·편집 양쪽에서 토글). 아이 대면 게임과 분리된 '교사 대면' 산출물이라
 * 앱 크롬으로 취급 → Milray 토큰(Tailwind 유틸: bg-surface/text-fg/border-border…)만 쓴다.
 */
import { Icon, type IconName } from '@/lib/icons';
import type { TeacherCard } from '../resolver/designAgent';

const AGE_LABEL: Record<3 | 4 | 5, string> = { 3: '만 3세', 4: '만 4세', 5: '만 5세' };

function Section({ icon, title, children }: { icon: IconName; title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border px-4 py-3.5">
      <div className="mb-2 flex items-center gap-1.5 text-fg">
        <Icon name={icon} size={15} className="text-accent" />
        <h3 className="text-sm font-bold">{title}</h3>
      </div>
      {children}
    </section>
  );
}

export function TeacherCardPanel({ card, onClose }: { card: TeacherCard; onClose: () => void }) {
  return (
    <div className="kv-fsbar-enter absolute right-3 top-20 bottom-4 z-30 flex w-[360px] max-w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-lg">
      {/* 헤더 */}
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon name="book" size={17} className="text-accent" />
          <span className="font-serif text-base font-bold text-fg">교사용 활동 안내</span>
        </div>
        <button
          onClick={onClose}
          className="inline-flex h-7 w-7 items-center justify-center rounded-pill text-fg-2 transition-colors hover:bg-accent-soft hover:text-fg"
          aria-label="닫기"
        >
          <Icon name="x" size={15} />
        </button>
      </div>

      {/* 메타 — 연령 + 누리 영역 */}
      <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3">
        <span className="rounded-pill bg-accent px-2.5 py-1 text-xs font-bold text-on-accent">{AGE_LABEL[card.age]}</span>
        {card.domains.map((d) => (
          <span key={d} className="rounded-pill bg-accent-soft px-2.5 py-1 text-xs font-semibold text-fg">{d}</span>
        ))}
      </div>

      {/* 본문 — 스크롤 */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section icon="star" title="학습 목표">
          <p className="text-sm leading-relaxed text-fg-2">{card.objective}</p>
        </Section>

        <Section icon="message" title="도입 — 이렇게 열어요">
          <p className="text-sm leading-relaxed text-fg-2">{card.intro}</p>
        </Section>

        {card.prompts && card.prompts.length > 0 && (
          <Section icon="message" title="함께 보며 묻는 말 (발문)">
            <ul className="flex flex-col gap-2">
              {card.prompts.map((q, i) => (
                <li key={i} className="flex gap-2 rounded-xl bg-accent-soft/60 px-3 py-2 text-sm leading-relaxed text-fg">
                  <span aria-hidden className="flex-none font-bold text-accent">Q.</span>
                  <span>{q}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section icon="check" title="진행">
          <ol className="flex flex-col gap-2">
            {card.steps.map((s, i) => (
              <li key={i} className="flex gap-2 text-sm leading-relaxed text-fg-2">
                <span className="mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-fg">{i + 1}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </Section>

        {card.extensions.length > 0 && (
          <Section icon="sparkle" title="확장 활동">
            <ul className="flex flex-col gap-1.5">
              {card.extensions.map((e, i) => (
                <li key={i} className="flex gap-2 text-sm leading-relaxed text-fg-2">
                  <span className="mt-2 h-1 w-1 flex-none rounded-full bg-accent" />
                  <span>{e}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section icon="observation" title="관찰 · 평가">
          <p className="text-sm leading-relaxed text-fg-2">{card.assessment}</p>
        </Section>
      </div>
    </div>
  );
}
