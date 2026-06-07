import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/lib/icons';
import { useBoardStore, type BoardNode } from '@/store/boardStore';
import { editTextCmd } from '@/board/commands';
import { runWorkflowStep, type RunnerData, type StepKind } from '@/board/workflow';

/* Renders one board node (reference board model): frame container, runner control,
   image card (real src), and content-sized sticky/text memos. Selection ring +
   drag handled by the parent canvas via onPointerDown. */

const COLOR_BG: Record<string, string> = {
  'accent-soft': 'bg-accent-soft',
  'surface-3': 'bg-surface-3',
  'surface-2': 'bg-surface-2',
  gold: 'bg-gold',
  'success-soft': 'bg-success-soft',
};

interface Props {
  node: BoardNode;
  selected: boolean;
  onPointerDown: (e: React.PointerEvent, id: string) => void;
  dx?: number;
  dy?: number;
}

export function NodeView({ node, selected, onPointerDown, dx = 0, dy = 0 }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(node.text ?? '');
  const ref = useRef<HTMLTextAreaElement>(null);
  const editable = node.type === 'sticky' || node.type === 'text' || node.type === 'image';

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  function commit() {
    setEditing(false);
    editTextCmd(node.id, node.text ?? '', draft);
  }

  const left = node.x + dx;
  const top = node.y + dy;
  const ring = selected ? 'ring-2 ring-accent' : 'ring-1 ring-transparent';

  const down = (e: React.PointerEvent) => onPointerDown(e, node.id);
  const dbl = (e: React.MouseEvent) => {
    if (editable && !node.locked) {
      e.stopPropagation();
      setDraft(node.text ?? '');
      setEditing(true);
    }
  };

  /* ---------- frame: back container (interior click-through) ---------- */
  if (node.type === 'frame') {
    const title = (node.data?.title as string) ?? '프레임';
    const renameTitle = (v: string) =>
      useBoardStore.getState().updateNodeRaw(node.id, { data: { ...node.data, title: v.trim() || '프레임' } });
    return (
      <div
        className="absolute"
        style={{ left, top, width: node.w, height: node.h, pointerEvents: 'none' }}
      >
        <div
          className={`absolute inset-0 rounded-lg border-2 ${selected ? 'border-accent' : 'border-border'} bg-surface/40 shadow-md`}
        />
        {/* edge grab strips — drag to move the frame */}
        {[
          { left: 0, right: 0, top: 0, height: 16 },
          { left: 0, right: 0, bottom: 0, height: 16 },
          { top: 0, bottom: 0, left: 0, width: 16 },
          { top: 0, bottom: 0, right: 0, width: 16 },
        ].map((pos, i) => (
          <div key={i} onPointerDown={down} style={{ position: 'absolute', ...pos, pointerEvents: 'auto', cursor: 'grab' }} />
        ))}
        {/* title tab — drag to move, double-click to rename */}
        <div
          onPointerDown={down}
          onDoubleClick={(e) => {
            e.stopPropagation();
            setDraft(title);
            setEditing(true);
          }}
          className={`absolute -top-7 left-0 inline-flex items-center gap-t1 rounded-md border px-t3 py-t1 text-overline shadow-sm ${
            selected ? 'border-accent bg-accent text-on-accent' : 'border-border bg-surface text-fg-2'
          }`}
          style={{ pointerEvents: 'auto', cursor: 'grab' }}
        >
          <Icon name="frame" size={12} />
          {editing ? (
            <input
              autoFocus
              data-kv-editable="true"
              value={draft}
              onPointerDown={(e) => e.stopPropagation()}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => { renameTitle(draft); setEditing(false); }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              className="w-28 bg-transparent text-overline focus:outline-none"
            />
          ) : (
            title
          )}
        </div>
      </div>
    );
  }

  /* ---------- runner: workflow control card ---------- */
  if (node.type === 'runner') {
    return <RunnerCard node={node} selected={selected} onPointerDown={onPointerDown} left={left} top={top} />;
  }

  /* ---------- image card (real src / loading / placeholder) ---------- */
  if (node.type === 'image') {
    return (
      <div
        onPointerDown={down}
        onDoubleClick={dbl}
        className={`absolute select-none overflow-hidden rounded-md border border-border bg-surface shadow-sm ${ring}`}
        style={{ left, top, width: node.w }}
      >
        <div className="relative" style={{ width: '100%', height: node.h }}>
          {node.loading ? (
            <div className="flex h-full w-full items-center justify-center bg-surface-2 text-fg-muted">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-surface-3 border-t-accent" />
            </div>
          ) : node.src ? (
            <img src={node.src} alt={node.text ?? ''} draggable={false} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-fg-muted">
              <Icon name="studio" size={24} />
            </div>
          )}
          {node.src && (
            <span className="absolute left-1 top-1 rounded-pill bg-fg/75 px-t2 py-0.5 text-[10px] text-on-dark">AI 생성</span>
          )}
        </div>
        {(node.text || editing) && (
          <div className="px-t2 py-t1">
            {editing ? (
              <textarea
                ref={ref}
                data-kv-editable="true"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                className="w-full resize-none bg-transparent text-overline text-fg focus:outline-none"
              />
            ) : (
              <span className="text-overline text-fg-muted">{node.text}</span>
            )}
          </div>
        )}
        {node.locked && <LockBadge />}
      </div>
    );
  }

  /* ---------- sticky / memo (content-sized) ---------- */
  if (node.type === 'sticky') {
    return (
      <div
        onPointerDown={down}
        onDoubleClick={dbl}
        className={`absolute select-none rounded-md ${COLOR_BG[node.color ?? 'accent-soft'] ?? 'bg-accent-soft'} p-t3 shadow-md ${ring}`}
        style={{ left, top, width: node.w, ...(node.autoH ? { minHeight: node.h } : { height: node.h }) }}
      >
        {editing ? (
          <textarea
            ref={ref}
            data-kv-editable="true"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            rows={Math.max(3, draft.split('\n').length)}
            className="w-full resize-none bg-transparent text-sm leading-relaxed text-fg focus:outline-none"
          />
        ) : (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg">{node.text || '메모…'}</p>
        )}
        {node.locked && <LockBadge />}
      </div>
    );
  }

  /* ---------- text ---------- */
  if (node.type === 'text') {
    return (
      <div
        onPointerDown={down}
        onDoubleClick={dbl}
        className={`absolute select-none rounded-sm px-t2 ${ring}`}
        style={{ left, top, width: node.w, ...(node.autoH ? { minHeight: node.h } : { height: node.h }) }}
      >
        {editing ? (
          <textarea
            ref={ref}
            data-kv-editable="true"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            className="w-full resize-none bg-transparent font-display text-h4 text-fg focus:outline-none"
          />
        ) : (
          <p className="whitespace-pre-wrap font-display text-h4 text-fg">{node.text || '텍스트'}</p>
        )}
        {node.locked && <LockBadge />}
      </div>
    );
  }

  /* ---------- shape ---------- */
  return (
    <div
      onPointerDown={down}
      className={`absolute rounded-lg border border-border ${COLOR_BG[node.color ?? 'surface-3'] ?? 'bg-surface-3'} ${ring}`}
      style={{ left, top, width: node.w, height: node.h }}
    >
      {node.locked && <LockBadge />}
    </div>
  );
}

function LockBadge() {
  return (
    <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-fg text-on-dark">
      <Icon name="lock" size={11} />
    </span>
  );
}

/* ---- runner control card ---- */
const STEP_ICON: Record<StepKind, Parameters<typeof Icon>[0]['name']> = {
  idea: 'plan',
  image: 'studio',
  plan: 'plan',
  worksheet: 'writing',
};

function RunnerCard({
  node,
  selected,
  onPointerDown,
  left,
  top,
}: {
  node: BoardNode;
  selected: boolean;
  onPointerDown: (e: React.PointerEvent, id: string) => void;
  left: number;
  top: number;
}) {
  const data = node.data as unknown as RunnerData;
  const steps = data?.steps ?? [];
  const ideaDone = steps.find((s) => s.kind === 'idea')?.status === 'done';
  const stop = (e: React.PointerEvent | React.MouseEvent) => e.stopPropagation();

  return (
    <div
      className={`absolute select-none rounded-xl border bg-surface shadow-lg ${selected ? 'border-accent' : 'border-border'}`}
      style={{ left, top, width: node.w }}
    >
      {/* drag handle / header */}
      <div
        onPointerDown={(e) => onPointerDown(e, node.id)}
        className="flex items-center gap-t2 rounded-t-xl border-b border-border bg-bg-deep/60 px-t3 py-t2"
        style={{ cursor: 'grab' }}
      >
        <Icon name="sparkle" size={14} fill="currentColor" className="text-accent" />
        <span className="text-overline text-fg-2">워크플로 러너</span>
      </div>
      <div className="flex flex-col gap-t1 p-t2">
        {steps.map((s, i) => {
          const enabled = s.kind === 'idea' || ideaDone;
          const running = s.status === 'running';
          return (
            <button
              key={s.kind}
              onPointerDown={stop}
              onClick={(e) => {
                stop(e);
                if (enabled && !running) void runWorkflowStep(node.id, s.kind);
              }}
              disabled={!enabled || running}
              className={`flex items-center gap-t2 rounded-md px-t3 py-t2 text-left text-sm transition-colors duration-150 ease-soft ${
                s.status === 'done'
                  ? 'bg-success-soft text-success'
                  : enabled
                    ? 'bg-bg/60 text-fg hover:bg-surface-2'
                    : 'text-fg-disabled'
              }`}
            >
              <span className="text-overline text-fg-muted">{i + 1}</span>
              <Icon name={STEP_ICON[s.kind]} size={14} />
              <span className="font-medium">{s.label}</span>
              <span className="ml-auto text-overline">
                {running ? (
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-surface-3 border-t-accent" />
                ) : s.status === 'done' ? (
                  <Icon name="check" size={13} />
                ) : s.status === 'error' ? (
                  '재시도'
                ) : (
                  '실행'
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
