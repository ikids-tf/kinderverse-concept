import { Icon } from '@/lib/icons';
import type { WorksheetCardProps } from './contracts';
import type { ComponentState } from './state';
import { AgeBadge, CardFrame, DomainChips } from './parts';

/* 활동지/워크시트 (agent.studio) — A4·인쇄·다운로드, 연결된 놀이계획 표시. */

export function WorksheetCard({
  props,
  state = 'ready',
}: {
  props: WorksheetCardProps;
  state?: ComponentState;
}) {
  if (state === 'loading' || state === 'error') return <CardFrame state={state} />;

  function download() {
    const body = [
      `# ${props.title}`,
      ``,
      `대상: ${props.age_band === '0-2' ? '0~2세' : '3~5세'}`,
      `목표: ${props.objective}`,
      `준비물: ${props.materials.join(', ')}`,
      ``,
      `진행:`,
      ...props.steps.map((s, i) => `${i + 1}. ${s}`),
    ].join('\n');
    const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${props.title}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <CardFrame
      state={state}
      eyebrow="활동지 · A4 인쇄"
      title={props.title}
      actions={
        <button
          onClick={download}
          className="inline-flex items-center gap-t1 rounded-pill border border-border px-t3 py-1 text-sm text-fg-2 hover:bg-surface-2"
        >
          <Icon name="folder" size={14} /> 다운로드
        </button>
      }
    >
      <div className="mb-t4 flex flex-wrap items-center gap-t2">
        <AgeBadge age_band={props.age_band} curriculum={props.curriculum} />
        {props.link_plan_id && (
          <span className="inline-flex items-center gap-t1 rounded-pill bg-surface-2 px-t2 py-0.5 text-overline text-fg-2">
            <Icon name="plan" size={12} /> 계획 연결됨
          </span>
        )}
      </div>

      {/* A4-ish 미리보기 */}
      <div className="rounded-md border border-border bg-white p-t5" style={{ aspectRatio: '1 / 1.414', maxWidth: 360 }}>
        <h4 className="mb-t3 font-display text-h4 text-fg">{props.title}</h4>
        <p className="mb-t2 text-sm text-fg-1"><span className="text-fg-muted">목표</span> {props.objective}</p>
        <p className="mb-t3 text-sm text-fg-1">
          <span className="text-fg-muted">준비물</span> {props.materials.join(', ') || '—'}
        </p>
        <ol className="flex list-decimal flex-col gap-t1 pl-t4 text-sm text-fg-1">
          {props.steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      </div>

      <div className="mt-t3">
        <DomainChips domains={props.domains ?? []} />
      </div>
    </CardFrame>
  );
}
