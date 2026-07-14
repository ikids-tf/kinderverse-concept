import type { WeeklyPlanProps } from './contracts';
import type { ComponentState } from './state';
import { AgeBadge, CardFrame } from './parts';

/* 주간 놀이계획 (agent.plan · feature: weekly_plan) — 채팅 페이지(RegistryRenderer)용 카드.
   보드에선 weeklyPlanMarkdown 으로 렌더된다(같은 payload). 구형 표 그리드는 WeeklyPlanGrid. */

export function WeeklyPlan({ props, state = 'ready' }: { props: WeeklyPlanProps; state?: ComponentState }) {
  if (state === 'loading' || state === 'error') return <CardFrame state={state} />;
  const bi = props.basic_info;
  const metaBits = [bi.sub_theme?.trim(), bi.week_number ? `${bi.week_number}주차` : '', bi.period?.trim()].filter(Boolean);

  return (
    <CardFrame state={state} eyebrow="놀이계획 · 주안" title={`${bi.theme || '주간 놀이계획'} 주간 놀이계획`}>
      <div className="mb-t4 flex flex-wrap items-center gap-t2">
        <AgeBadge age_band={props.age_band} curriculum={props.curriculum} />
        {metaBits.map((m, i) => (
          <span key={i} className="rounded-pill bg-surface-2 px-t2 py-0.5 text-overline text-fg-muted">{m}</span>
        ))}
      </div>

      {props.rationale.summary?.trim() && (
        <div className="mb-t4">
          <div className="text-overline mb-t1 text-fg-muted">놀이 선정 근거</div>
          <p className="text-sm leading-relaxed text-fg-1">{props.rationale.summary}</p>
        </div>
      )}

      {props.teacher_expectations.length > 0 && (
        <div className="mb-t4">
          <div className="text-overline mb-t2 text-fg-muted">교사의 기대</div>
          <ul className="space-y-0.5">
            {props.teacher_expectations.map((t, i) => (
              <li key={i} className="flex items-start gap-t2 text-sm text-fg-1">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
                <span>
                  {t.goal}
                  {t.focus?.trim() && <span className="ml-t1 text-xs text-fg-muted">({t.focus})</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-t4">
        <div className="text-overline mb-t2 text-fg-muted">요일별 놀이 흐름</div>
        <div className="space-y-t2">
          {props.daily_flow.map((d, i) => (
            <div key={i} className="rounded-lg border border-border bg-surface-2 p-t3">
              <div className="mb-t2 flex items-center gap-t2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-overline font-bold text-on-accent">{d.day}</span>
                <span className="text-sm font-medium text-fg-2">{d.flow_stage}</span>
              </div>
              <ul className="space-y-0.5">
                {d.play_ideas.map((pi, j) => (
                  <li key={j} className="text-sm text-fg-1">
                    <span className="font-semibold text-fg">{pi.title}</span>
                    {pi.core_experience ? ` — ${pi.core_experience}` : ''}
                    {pi.learning_area.length > 0 && (
                      <span className="ml-t1 text-xs text-accent">{pi.learning_area.join('·')}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {props.curriculum_links.length > 0 && (
        <div className="mb-t4 overflow-x-auto">
          <div className="text-overline mb-t2 text-fg-muted">교육과정 연계</div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-overline text-fg-muted">
                <th className="border-b border-border px-t2 py-t1 text-left">영역</th>
                <th className="border-b border-border px-t2 py-t1 text-left">내용</th>
                <th className="border-b border-border px-t2 py-t1 text-left">기대 경험</th>
              </tr>
            </thead>
            <tbody>
              {props.curriculum_links.map((c, i) => (
                <tr key={i} className="align-top">
                  <td className="border-b border-border/60 px-t2 py-t1 font-medium text-fg">{c.area}</td>
                  <td className="border-b border-border/60 px-t2 py-t1 text-fg-1">{c.content || '—'}</td>
                  <td className="border-b border-border/60 px-t2 py-t1 text-fg-2">{c.expected_experience || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid gap-t3 sm:grid-cols-2">
        {props.outdoor_and_physical_play.length > 0 && (
          <Section title="바깥놀이·신체활동">
            <ul className="space-y-0.5">
              {props.outdoor_and_physical_play.map((o, i) => (
                <li key={i} className="text-sm text-fg-1">
                  <span className="font-medium text-fg-2">{o.day}</span> {o.activity_name}
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
        {(props.safety_education.weekly_safety_focus?.trim() || props.safety_education.teacher_guidance?.trim()) && (
          <Section title="안전교육">
            <p className="text-sm leading-relaxed text-fg-1">
              {[props.safety_education.weekly_safety_focus, props.safety_education.teacher_guidance].filter((s) => s?.trim()).join(' — ')}
            </p>
          </Section>
        )}
        {(props.character_education.core_value?.trim() || props.character_education.practice_context?.trim()) && (
          <Section title="인성교육">
            <p className="text-sm leading-relaxed text-fg-1">
              {[props.character_education.core_value, props.character_education.practice_context].filter((s) => s?.trim()).join(' — ')}
            </p>
          </Section>
        )}
        {(props.home_connection.home_play?.trim() || props.home_connection.conversation_topic?.trim() || props.home_connection.observation_point?.trim()) && (
          <Section title="가정연계활동">
            <ul className="space-y-0.5 text-sm text-fg-1">
              {props.home_connection.home_play?.trim() && <li>가정 놀이: {props.home_connection.home_play}</li>}
              {props.home_connection.conversation_topic?.trim() && <li>대화 주제: {props.home_connection.conversation_topic}</li>}
              {props.home_connection.observation_point?.trim() && <li>관찰 포인트: {props.home_connection.observation_point}</li>}
            </ul>
          </Section>
        )}
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
