import { Icon } from '@/lib/icons';
import { CURRICULUM_LABEL } from '@/ai/pedagogy';
import type { AssessmentReportProps } from './contracts';
import type { ComponentState } from './state';
import { AgeBadge, CardFrame } from './parts';

/* 발달평가서 (agent.writing) — 고위험. 자동 적합성 검증 패스 결과 동봉.
   발송은 L3 휴먼게이트(사용자가 직접). */

export function AssessmentReport({
  props,
  state = 'ready',
}: {
  props: AssessmentReportProps;
  state?: ComponentState;
}) {
  if (state === 'loading' || state === 'error') return <CardFrame state={state} />;

  const s = props.suitability;

  return (
    <CardFrame
      state={state}
      eyebrow="발달평가서 · 고위험"
      title={props.child_label}
      actions={
        s.checked ? (
          <span
            className={`inline-flex items-center gap-t1 rounded-pill px-t3 py-1 text-overline ${
              s.pass ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'
            }`}
          >
            <Icon name={s.pass ? 'check' : 'x'} size={12} />
            적합성 검증 {s.pass ? '통과' : '주의'}
          </span>
        ) : null
      }
    >
      <div className="mb-t4">
        <AgeBadge age_band={props.age_band} curriculum={props.curriculum} />
      </div>

      <div className="flex flex-col gap-t2">
        {props.domains.map((d, i) => (
          <div key={i} className="rounded-md border border-border bg-bg/60 p-t3">
            <div className="mb-t1 flex items-center gap-t2">
              <span className="rounded-pill bg-accent-soft px-t2 py-0.5 text-overline text-accent">{d.area}</span>
              {d.level && <span className="text-overline text-fg-muted">{d.level}</span>}
            </div>
            <p className="text-sm text-fg-1">{d.observation}</p>
          </div>
        ))}
      </div>

      <div className="mt-t4">
        <div className="text-overline mb-t1 text-fg-muted">종합 의견</div>
        <p className="text-body text-fg-1">{props.summary}</p>
      </div>

      {/* 적합성 검증 플래그 */}
      {s.checked && s.flags.length > 0 && (
        <div className="mt-t3 rounded-md bg-danger-soft px-t3 py-t2">
          <div className="text-overline mb-t1 text-danger">적합성 검토 지적</div>
          <ul className="list-disc pl-t4 text-sm text-fg-1">
            {s.flags.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      {/* L3 게이트 */}
      <div className="mt-t4 flex items-center gap-t2 rounded-md border border-border bg-surface px-t4 py-t3">
        <Icon name="lock" size={16} />
        <div className="text-sm text-fg-2">
          발송·외부 공유는 <b className="text-fg">휴먼게이트(L3)</b> — 교사가 직접 확인 후 처리합니다.
        </div>
      </div>

      <p className="mt-t3 text-overline text-fg-muted">{CURRICULUM_LABEL[props.curriculum]} 영역 연계 · 근거 기반</p>
    </CardFrame>
  );
}
