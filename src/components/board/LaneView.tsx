import { Icon } from '@/lib/icons';
import {
  useBoardStore,
  laneWidth,
  LANE_STEP_WIDTH,
  LANE_GAP,
  type Lane,
  type LaneStep,
} from '@/store/boardStore';
import { runLaneStep } from '@/board/lanes';
import { RegistryRenderer } from '@/ui-registry/registry';
import type { RegistryPayload } from '@/ui-registry/contracts';
import { useFolderStore, bundleFromLane } from '@/store/folderStore';

/* Workflow lane (SKILL §9) rendered on the board: a typed container whose step
   nodes fill left→right. Progress is click-only; a step's selection feeds the
   next step. Inline content; [레인 저장] bundles to a folder (stub for M6). */

const STATUS_DOT: Record<LaneStep['status'], string> = {
  pending: 'bg-fg-disabled',
  running: 'bg-accent animate-pulse',
  ready: 'bg-success',
  error: 'bg-danger',
};

function IdeaList({ lane, step }: { lane: Lane; step: LaneStep }) {
  const updateStep = useBoardStore((s) => s.updateStep);
  const items = (step.content as { items?: Array<{ id: string; label: string; desc: string }> })?.items ?? [];
  const selected = step.selected ?? [];
  const toggle = (id: string) =>
    updateStep(lane.id, step.id, {
      selected: selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id],
    });
  return (
    <ul className="flex flex-col gap-t2">
      {items.map((it) => {
        const on = selected.includes(it.id);
        return (
          <li key={it.id}>
            <button
              onClick={() => toggle(it.id)}
              className={`flex w-full items-start gap-t2 rounded-md border px-t2 py-t2 text-left transition-colors duration-150 ease-soft ${
                on ? 'border-accent bg-accent-soft' : 'border-border bg-bg/60 hover:bg-surface-2'
              }`}
            >
              <span
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-xs border ${
                  on ? 'border-accent bg-accent text-on-accent' : 'border-field-border'
                }`}
              >
                {on && <Icon name="check" size={10} stroke={3} />}
              </span>
              <span>
                <span className="block text-sm font-semibold text-fg">{it.label}</span>
                {it.desc && <span className="block text-xs text-fg-2">{it.desc}</span>}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function StepCard({ lane, step }: { lane: Lane; step: LaneStep }) {
  const updateLane = useBoardStore((s) => s.updateLane);
  const runnable = step.order <= lane.unlocked;
  const isFrontier = step.order === lane.unlocked;
  const selectable = step.step === 'idea';
  const hasSelection = (step.selected?.length ?? 0) > 0;
  const canAdvance =
    step.status === 'ready' &&
    isFrontier &&
    lane.unlocked < lane.steps.length - 1 &&
    (!selectable || hasSelection);

  return (
    <div
      className="flex flex-col rounded-xl border border-border bg-surface shadow-sm"
      style={{ width: LANE_STEP_WIDTH }}
    >
      <div className="flex items-center gap-t2 border-b border-border px-t3 py-t2">
        <span className={`h-2 w-2 rounded-full ${STATUS_DOT[step.status]}`} />
        <span className="text-overline text-fg-muted">{step.order + 1}</span>
        <span className="font-sans text-sm font-semibold text-fg">{step.title}</span>
        <span className="ml-auto text-overline text-fg-muted">{step.agent.replace('agent.', '')}</span>
      </div>

      <div className="min-h-[120px] flex-1 overflow-auto p-t3" style={{ maxHeight: 360 }}>
        {step.status === 'pending' && !runnable && (
          <p className="text-sm text-fg-muted">이전 단계를 먼저 진행하세요.</p>
        )}
        {step.status === 'pending' && runnable && (
          <button
            onClick={() => void runLaneStep(lane.id, step.id)}
            className="inline-flex items-center gap-t2 rounded-pill bg-fg px-t4 py-t2 text-sm font-semibold text-on-dark transition-colors duration-150 ease-soft hover:bg-fg-1"
          >
            <Icon name="sparkle" size={14} fill="currentColor" /> 실행
          </button>
        )}
        {step.status === 'running' && (
          <div className="flex items-center gap-t2 text-sm text-fg-muted">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-surface-3 border-t-accent" />
            생성 중…
          </div>
        )}
        {step.status === 'error' && (
          <div className="text-sm text-danger">
            {step.error ?? '오류'}
            <button
              onClick={() => void runLaneStep(lane.id, step.id)}
              className="ml-t2 rounded-pill border border-border px-t2 py-0.5 text-overline text-fg-2"
            >
              재시도
            </button>
          </div>
        )}
        {step.status === 'ready' && step.step === 'idea' && <IdeaList lane={lane} step={step} />}
        {step.status === 'ready' && step.step !== 'idea' && step.content != null && (
          <RegistryRenderer payload={step.content as RegistryPayload} />
        )}
      </div>

      {canAdvance && (
        <div className="border-t border-border p-t2">
          <button
            onClick={() => updateLane(lane.id, { unlocked: lane.unlocked + 1 })}
            className="inline-flex w-full items-center justify-center gap-t1 rounded-pill bg-accent px-t3 py-t2 text-sm font-semibold text-on-accent transition-colors duration-150 ease-soft hover:bg-accent-hover"
          >
            다음 단계 <Icon name="arrowRight" size={14} />
          </button>
          {selectable && !hasSelection && (
            <p className="mt-t1 text-center text-overline text-fg-muted">항목을 선택하면 다음 단계로</p>
          )}
        </div>
      )}
    </div>
  );
}

export function LaneView({ lane }: { lane: Lane }) {
  const updateLane = useBoardStore((s) => s.updateLane);
  const addBundle = useFolderStore((s) => s.addBundle);

  const save = () => {
    addBundle(bundleFromLane(lane)); // 폴더에 번들로 저장 (manifest)
    updateLane(lane.id, { status: 'saved' });
  };

  return (
    <div className="absolute" style={{ left: lane.x, top: lane.y, width: laneWidth(lane) }}>
      <div className="mb-t2 flex items-center gap-t2">
        <span className="rounded-pill bg-accent px-t3 py-t1 text-overline text-on-accent">
          워크플로 · {lane.template}
        </span>
        <span className="font-display text-h4 text-fg">{lane.title}</span>
        <button
          onClick={save}
          className="ml-auto inline-flex items-center gap-t1 rounded-pill border border-border-strong bg-surface px-t3 py-t1 text-sm font-medium text-fg transition-colors duration-150 ease-soft hover:bg-surface-2"
        >
          <Icon name="folder" size={14} />
          {lane.status === 'saved' ? '저장됨' : '레인 저장'}
        </button>
      </div>

      <div className="flex items-start" style={{ gap: LANE_GAP }}>
        {lane.steps.map((step) => (
          <StepCard key={step.id} lane={lane} step={step} />
        ))}
      </div>
    </div>
  );
}
