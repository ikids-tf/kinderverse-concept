import type { TopicWebProps } from './contracts';
import type { ComponentState } from './state';
import { AgeBadge, CardFrame } from './parts';

/* 놀이중심 주제망 (agent.plan · feature: topic_web) — 대주제→소주제→놀이아이디어 2단계 +
   환경구성 + 유아 예상질문. 채팅 페이지(RegistryRenderer)용 카드. 보드에선 topicWebMarkdown
   으로 렌더된다(같은 payload). */

export function TopicWeb({ props, state = 'ready' }: { props: TopicWebProps; state?: ComponentState }) {
  if (state === 'loading' || state === 'error') return <CardFrame state={state} />;
  const curriculum = props.age_band === '0-2' ? 'standard' : 'nuri';

  return (
    <CardFrame state={state} eyebrow="놀이계획 · 놀이중심 주제망" title={props.main_topic}>
      <div className="mb-t4 flex flex-wrap items-center gap-t2">
        <AgeBadge age_band={props.age_band} curriculum={curriculum} />
        {props.season?.trim() && (
          <span className="rounded-pill bg-surface-2 px-t2 py-0.5 text-overline text-fg-muted">{props.season.trim()}</span>
        )}
        {props.project_mode && (
          <span className="rounded-pill bg-accent-soft px-t2 py-0.5 text-overline text-accent">프로젝트</span>
        )}
      </div>

      <div className="grid gap-t3 sm:grid-cols-2">
        {props.subtopics.map((s, i) => (
          <div key={i} className="rounded-lg border border-border bg-surface-2 p-t3">
            <div className="mb-t2 font-semibold text-fg">{s.subtopic}</div>
            <ul className="space-y-0.5">
              {s.play_ideas.map((idea, j) => (
                <li key={j} className="flex items-start gap-t2 text-sm text-fg-1">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
                  <span>{idea}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {props.environment_setup.length > 0 && (
        <div className="mt-t4">
          <div className="text-overline mb-t2 text-fg-muted">환경 구성</div>
          <ul className="space-y-0.5">
            {props.environment_setup.map((e, i) => (
              <li key={i} className="flex items-start gap-t2 text-sm text-fg-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-fg-muted" />
                <span>{e}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {props.children_expected_questions.length > 0 && (
        <div className="mt-t4">
          <div className="text-overline mb-t2 text-fg-muted">유아의 예상 질문</div>
          <div className="flex flex-wrap gap-t2">
            {props.children_expected_questions.map((q, i) => (
              <span key={i} className="rounded-pill bg-accent-soft px-t3 py-1 text-sm text-accent">
                {q}
              </span>
            ))}
          </div>
        </div>
      )}
    </CardFrame>
  );
}
