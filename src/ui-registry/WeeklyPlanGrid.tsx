import { useState } from 'react';
import { CURRICULUM_LABEL } from '@/ai/pedagogy';
import type { WeeklyPlanGridProps } from './contracts';
import type { ComponentState } from './state';
import { AgeBadge, CardFrame } from './parts';

/* 놀이계획 (agent.plan) — 요일×영역 그리드. */

export function WeeklyPlanGrid({
  props,
  state = 'ready',
}: {
  props: WeeklyPlanGridProps;
  state?: ComponentState;
}) {
  const [editing, setEditing] = useState(false);
  if (state === 'loading' || state === 'error') return <CardFrame state={state} />;

  return (
    <CardFrame
      state={editing ? 'editing' : state}
      eyebrow="놀이계획 · 주안"
      title={props.title}
      actions={
        <button
          onClick={() => setEditing((v) => !v)}
          className="rounded-pill border border-border px-t3 py-1 text-sm text-fg-2 hover:bg-surface-2"
        >
          {editing ? '완료' : '편집'}
        </button>
      }
    >
      <div className="mb-t4">
        <AgeBadge age_band={props.age_band} curriculum={props.curriculum} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-overline text-fg-muted">
              <th className="border-b border-border px-t2 py-t2 text-left">요일</th>
              <th className="border-b border-border px-t2 py-t2 text-left">영역</th>
              <th className="border-b border-border px-t2 py-t2 text-left">활동</th>
              <th className="border-b border-border px-t2 py-t2 text-left">준비물</th>
              <th className="border-b border-border px-t2 py-t2 text-left">발달목표</th>
            </tr>
          </thead>
          <tbody>
            {props.days.map((d, i) => (
              <tr key={i} className="align-top">
                <td className="border-b border-border/60 px-t2 py-t2 font-semibold text-fg">{d.day}</td>
                <td className="border-b border-border/60 px-t2 py-t2">
                  <span className="rounded-pill bg-accent-soft px-t2 py-0.5 text-overline text-accent">{d.area}</span>
                </td>
                <td className="border-b border-border/60 px-t2 py-t2 text-fg-1">{d.activity}</td>
                <td className="border-b border-border/60 px-t2 py-t2 text-fg-2">{d.materials ?? '—'}</td>
                <td className="border-b border-border/60 px-t2 py-t2 text-fg-2">{d.goal ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {props.notes && <p className="mt-t3 text-sm text-fg-2">{props.notes}</p>}
      <p className="mt-t3 text-overline text-fg-muted">{CURRICULUM_LABEL[props.curriculum]} 연계</p>
    </CardFrame>
  );
}
