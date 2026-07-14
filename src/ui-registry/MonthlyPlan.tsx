import type { MonthlyPlanProps } from './contracts';
import type { ComponentState } from './state';
import { AgeBadge, CardFrame } from './parts';

/* 월간 놀이계획 (agent.plan · feature: monthly_plan) — 채팅 페이지(RegistryRenderer)용 카드.
   보드에선 monthlyPlanMarkdown 으로 렌더된다(같은 payload). */

export function MonthlyPlan({ props, state = 'ready' }: { props: MonthlyPlanProps; state?: ComponentState }) {
  if (state === 'loading' || state === 'error') return <CardFrame state={state} />;
  const bi = props.basic_info;

  return (
    <CardFrame state={state} eyebrow="놀이계획 · 월안" title={`${bi.theme || '월간 놀이계획'} 월간 놀이계획`}>
      <div className="mb-t4 flex flex-wrap items-center gap-t2">
        <AgeBadge age_band={props.age_band} curriculum={props.curriculum} />
        {bi.class_name?.trim() && (
          <span className="rounded-pill bg-surface-2 px-t2 py-0.5 text-overline text-fg-muted">{bi.class_name.trim()}</span>
        )}
        {bi.period?.trim() && (
          <span className="rounded-pill bg-surface-2 px-t2 py-0.5 text-overline text-fg-muted">{bi.period.trim()}</span>
        )}
      </div>

      {props.rationale.reason?.trim() && (
        <div className="mb-t4">
          <div className="text-overline mb-t1 text-fg-muted">놀이 선정 근거</div>
          <p className="text-sm leading-relaxed text-fg-1">{props.rationale.reason}</p>
        </div>
      )}

      {props.rationale.teacher_expectations.length > 0 && (
        <div className="mb-t4">
          <div className="text-overline mb-t2 text-fg-muted">교사의 기대</div>
          <ul className="space-y-0.5">
            {props.rationale.teacher_expectations.map((e, i) => (
              <li key={i} className="flex items-start gap-t2 text-sm text-fg-1">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
                <span>{e}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-t4">
        <div className="text-overline mb-t2 text-fg-muted">예상 놀이 흐름</div>
        <div className="space-y-t3">
          {props.weekly_flow.map((w, i) => (
            <div key={i} className="rounded-lg border border-border bg-surface-2 p-t3">
              <div className="mb-t2 flex items-center gap-t2">
                <span className="rounded-pill bg-accent px-t2 py-0.5 text-overline text-on-accent">{w.week}</span>
                <span className="font-semibold text-fg">{w.sub_theme}</span>
              </div>
              <div className="flex flex-wrap gap-t2">
                {w.play_ideas.map((idea, j) => (
                  <span key={j} className="rounded-pill bg-surface px-t2 py-0.5 text-sm text-fg-1">{idea}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {props.rationale.curriculum_links.length > 0 && (
        <div className="mb-t4 overflow-x-auto">
          <div className="text-overline mb-t2 text-fg-muted">교육과정 연계</div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-overline text-fg-muted">
                <th className="border-b border-border px-t2 py-t1 text-left">영역</th>
                <th className="border-b border-border px-t2 py-t1 text-left">범주</th>
                <th className="border-b border-border px-t2 py-t1 text-left">내용</th>
              </tr>
            </thead>
            <tbody>
              {props.rationale.curriculum_links.map((c, i) => (
                <tr key={i} className="align-top">
                  <td className="border-b border-border/60 px-t2 py-t1 font-medium text-fg">{c.area}</td>
                  <td className="border-b border-border/60 px-t2 py-t1 text-fg-2">{c.category || '—'}</td>
                  <td className="border-b border-border/60 px-t2 py-t1 text-fg-1">{c.content || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid gap-t3 sm:grid-cols-2">
        {props.outdoor_play.length > 0 && (
          <Section title="바깥놀이·신체활동">
            <ul className="space-y-0.5">
              {props.outdoor_play.map((o, i) => (
                <li key={i} className="text-sm text-fg-1">
                  <span className="font-medium text-fg-2">{o.week}</span> {o.activity}
                </li>
              ))}
            </ul>
          </Section>
        )}
        {props.events.length > 0 && (
          <Section title="행사">
            <ul className="space-y-0.5">
              {props.events.map((e, i) => (
                <li key={i} className="text-sm text-fg-1">
                  <span className="font-medium text-fg">{e.name}</span>
                  {e.connection ? ` — ${e.connection}` : ''}
                </li>
              ))}
            </ul>
          </Section>
        )}
        {props.safety_education?.trim() && <Section title="안전교육"><p className="text-sm leading-relaxed text-fg-1">{props.safety_education}</p></Section>}
        {props.character_education?.trim() && <Section title="인성교육"><p className="text-sm leading-relaxed text-fg-1">{props.character_education}</p></Section>}
        {props.home_connection?.trim() && <Section title="가정연계활동"><p className="text-sm leading-relaxed text-fg-1">{props.home_connection}</p></Section>}
      </div>
    </CardFrame>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-t3">
      <div className="text-overline mb-t1 text-fg-muted">{title}</div>
      {children}
    </div>
  );
}
