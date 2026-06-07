import { useState } from 'react';
import { Icon } from '@/lib/icons';
import { CURRICULUM_LABEL } from '@/ai/pedagogy';
import type { RecordDraftCardProps } from './contracts';
import type { ComponentState } from './state';
import { AgeBadge, CardFrame, DomainChips } from './parts';
import { useLearningStore } from '@/store/learningStore';

/* 관찰기록 카드 (record.observation). 발달·영역 분석, 행정/평가용.
   각 진술은 근거(source)와 연계 영역을 표시 — 무근거 생성 금지(SKILL §3 rule 5). */

export function RecordDraftCard({
  props,
  state = 'ready',
}: {
  props: RecordDraftCardProps;
  state?: ComponentState;
}) {
  const [editing, setEditing] = useState(false);
  const [summary, setSummary] = useState(props.summary ?? '');
  const recordEdit = useLearningStore((s) => s.recordEdit);

  function toggleEdit() {
    if (editing) recordEdit({ task: 'record', artifactType: 'RecordDraftCard', before: props.summary ?? '', after: summary });
    setEditing((v) => !v);
  }

  if (state === 'loading' || state === 'error') {
    return <CardFrame state={state} />;
  }

  const effective = editing ? 'editing' : state;

  return (
    <CardFrame
      state={effective}
      eyebrow="관찰기록 · 행정/평가용"
      title={props.child_label}
      actions={
        <button
          onClick={toggleEdit}
          className="rounded-pill border border-border px-t3 py-1 text-sm text-fg-2 transition-colors duration-150 ease-soft hover:bg-surface-2"
        >
          {editing ? '완료' : '편집'}
        </button>
      }
    >
      <div className="mb-t4 flex flex-wrap items-center gap-t2">
        <AgeBadge age_band={props.age_band} curriculum={props.curriculum} />
        {props.date && <span className="text-overline text-fg-muted">{props.date}</span>}
      </div>

      <ol className="flex flex-col gap-t3">
        {props.observations.map((o, i) => (
          <li key={i} className="rounded-md border border-border bg-bg/60 p-t3">
            <p className="text-body text-fg">{o.text}</p>
            <div className="mt-t2 flex flex-wrap items-center gap-t2">
              <span className="inline-flex items-center gap-t1 text-overline text-fg-muted">
                <Icon name="check" size={12} /> 근거: {o.source}
              </span>
              <DomainChips domains={o.domains} />
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-t4">
        <div className="text-overline mb-t1 text-fg-muted">종합</div>
        {editing ? (
          <textarea
            data-kv-editable="true"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            className="min-h-[72px] w-full resize-y rounded-md border border-field-border bg-surface px-t3 py-t2 text-body text-fg focus:outline-none focus:ring-2 focus:ring-focus"
          />
        ) : (
          <p className="text-body text-fg-2">{summary || '—'}</p>
        )}
      </div>

      <p className="mt-t4 text-overline text-fg-muted">
        근거 기반 · {CURRICULUM_LABEL[props.curriculum]} 영역 연계 · 발송 대상 아님(평가용)
      </p>
    </CardFrame>
  );
}
