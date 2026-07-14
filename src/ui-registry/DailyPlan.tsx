import type { DailyPlanProps } from './contracts';
import type { ComponentState } from './state';
import { AgeBadge, CardFrame } from './parts';

/* 일일 놀이계획 (agent.plan · feature: daily_plan) — 채팅 페이지(RegistryRenderer)용 카드.
   보드에선 dailyPlanMarkdown 으로 렌더된다(같은 payload). */

export function DailyPlan({ props, state = 'ready' }: { props: DailyPlanProps; state?: ComponentState }) {
  if (state === 'loading' || state === 'error') return <CardFrame state={state} />;
  const bi = props.basic_info;
  const metaBits = [bi.sub_theme?.trim(), bi.date?.trim() ? `${bi.date}${bi.day?.trim() ? ` (${bi.day})` : ''}` : ''].filter(Boolean);
  const nonEmpty = (a: string[]) => a.filter((x) => x && x.trim());

  return (
    <CardFrame state={state} eyebrow="놀이계획 · 일안" title={`${bi.theme || '일일 놀이계획'} 일일 놀이계획`}>
      <div className="mb-t4 flex flex-wrap items-center gap-t2">
        <AgeBadge age_band={props.age_band} curriculum={props.curriculum} />
        {metaBits.map((m, i) => (
          <span key={i} className="rounded-pill bg-surface-2 px-t2 py-0.5 text-overline text-fg-muted">{m}</span>
        ))}
      </div>

      {props.teacher_expectations.length > 0 && (
        <Block title="교사의 기대">
          <ul className="space-y-0.5">
            {props.teacher_expectations.map((t, i) => (
              <li key={i} className="text-sm text-fg-1">
                {t.goal}
                {t.focus?.trim() && <span className="ml-t1 text-xs text-fg-muted">({t.focus})</span>}
              </li>
            ))}
          </ul>
        </Block>
      )}

      <Block title="도입">
        {props.introduction.interest_trigger?.trim() && <p className="text-sm leading-relaxed text-fg-1">{props.introduction.interest_trigger}</p>}
        {nonEmpty(props.introduction.conversation.teacher_questions).length > 0 && (
          <p className="mt-t1 text-xs text-fg-2">발문: {nonEmpty(props.introduction.conversation.teacher_questions).join(' / ')}</p>
        )}
      </Block>

      <Block title="전개">
        <div className="space-y-t2">
          {props.development_activities.map((d, i) => (
            <div key={i} className="rounded-lg border border-border bg-surface-2 p-t3">
              <div className="font-semibold text-fg">{d.activity_name}</div>
              {d.activity_goal?.trim() && <div className="mt-0.5 text-xs text-fg-muted">목표 · {d.activity_goal}</div>}
              {nonEmpty(d.activity_method).length > 0 && (
                <ol className="mt-t2 list-decimal space-y-0.5 pl-t4 text-sm text-fg-1 marker:text-fg-muted">
                  {nonEmpty(d.activity_method).map((m, j) => (
                    <li key={j}>{m}</li>
                  ))}
                </ol>
              )}
              {nonEmpty(d.teacher_questions).length > 0 && (
                <p className="mt-t2 text-xs text-fg-2">발문: {nonEmpty(d.teacher_questions).join(' / ')}</p>
              )}
            </div>
          ))}
        </div>
      </Block>

      <Block title="마무리">
        {props.closing.experience_sharing?.trim() && <p className="text-sm leading-relaxed text-fg-1">{props.closing.experience_sharing}</p>}
        {props.closing.connection_to_next_play?.trim() && (
          <p className="mt-t1 text-xs text-fg-2">다음 놀이 연결: {props.closing.connection_to_next_play}</p>
        )}
      </Block>

      <div className="grid gap-t3 sm:grid-cols-2">
        {(nonEmpty(props.materials.teacher_materials).length > 0 || nonEmpty(props.materials.children_materials).length > 0) && (
          <Block title="준비물" inline>
            {nonEmpty(props.materials.teacher_materials).length > 0 && <p className="text-sm text-fg-1">교사: {nonEmpty(props.materials.teacher_materials).join(', ')}</p>}
            {nonEmpty(props.materials.children_materials).length > 0 && <p className="text-sm text-fg-1">유아: {nonEmpty(props.materials.children_materials).join(', ')}</p>}
          </Block>
        )}
        {props.outdoor_and_physical_play.activity_name?.trim() && (
          <Block title="바깥놀이·신체활동" inline>
            <p className="text-sm text-fg-1">{props.outdoor_and_physical_play.activity_name}{props.outdoor_and_physical_play.method?.trim() ? ` — ${props.outdoor_and_physical_play.method}` : ''}</p>
          </Block>
        )}
        {props.rainy_day_alternative.indoor_alternative_play?.trim() && (
          <Block title="우천 시 대체" inline>
            <p className="text-sm text-fg-1">{props.rainy_day_alternative.indoor_alternative_play}</p>
          </Block>
        )}
        {nonEmpty(props.assessment.observation_points).length > 0 && (
          <Block title="평가 · 관찰 포인트" inline>
            <ul className="list-disc space-y-0.5 pl-t4 text-sm text-fg-1 marker:text-accent">
              {nonEmpty(props.assessment.observation_points).map((o, i) => (
                <li key={i}>{o}</li>
              ))}
            </ul>
          </Block>
        )}
        {(props.safety_notes.play_safety?.trim() || props.safety_notes.environment_safety?.trim() || props.safety_notes.health_safety?.trim()) && (
          <Block title="안전·유의사항" inline>
            <p className="text-sm leading-relaxed text-fg-1">
              {[props.safety_notes.play_safety, props.safety_notes.environment_safety, props.safety_notes.health_safety].filter((s) => s?.trim()).join(' · ')}
            </p>
          </Block>
        )}
        {(props.home_connection.try_at_home?.trim() || props.home_connection.recommended_picture_book?.trim()) && (
          <Block title="가정연계" inline>
            {props.home_connection.try_at_home?.trim() && <p className="text-sm text-fg-1">가정에서: {props.home_connection.try_at_home}</p>}
            {props.home_connection.recommended_picture_book?.trim() && <p className="text-sm text-fg-1">추천 그림책: {props.home_connection.recommended_picture_book}</p>}
          </Block>
        )}
      </div>
    </CardFrame>
  );
}

function Block({ title, children, inline }: { title: string; children: React.ReactNode; inline?: boolean }) {
  return (
    <div className={inline ? 'mt-t3' : 'mb-t4'}>
      <div className="text-overline mb-t1 text-fg-muted">{title}</div>
      {children}
    </div>
  );
}
