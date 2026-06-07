import type { ReactNode } from 'react';
import { Icon } from '@/lib/icons';
import { CURRICULUM_LABEL, type Curriculum } from '@/ai/pedagogy';

/* Small shared building blocks for registry cards. */

export function DomainChips({ domains }: { domains: string[] }) {
  if (!domains.length) return null;
  return (
    <span className="flex flex-wrap gap-t1">
      {domains.map((d) => (
        <span key={d} className="rounded-pill bg-accent-soft px-t2 py-0.5 text-overline text-accent">
          {d}
        </span>
      ))}
    </span>
  );
}

export function AgeBadge({ age_band, curriculum }: { age_band: string; curriculum: Curriculum }) {
  return (
    <span className="rounded-pill bg-surface-2 px-t3 py-1 text-overline text-fg-2">
      {age_band === '0-2' ? '0~2세' : '3~5세'} · {CURRICULUM_LABEL[curriculum]}
    </span>
  );
}

/* Card frame with built-in loading skeleton + error states. */
export function CardFrame({
  state,
  eyebrow,
  title,
  actions,
  children,
}: {
  state: 'loading' | 'streaming' | 'ready' | 'editing' | 'error';
  eyebrow?: string;
  title?: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  if (state === 'loading') {
    return (
      <div className="animate-pulse rounded-xl border border-border bg-surface p-t5 shadow-sm">
        <div className="mb-t3 h-3 w-24 rounded-pill bg-surface-3" />
        <div className="mb-t2 h-5 w-2/3 rounded-pill bg-surface-3" />
        <div className="h-20 rounded-md bg-surface-2" />
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="flex items-center gap-t2 rounded-xl border border-border bg-danger-soft px-t4 py-t3 text-sm text-danger">
        <Icon name="x" size={16} />
        결과를 표시할 수 없어요. 다시 시도해 주세요.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-t5 shadow-sm">
      <div className="mb-t4 flex flex-wrap items-start justify-between gap-t2">
        <div>
          {eyebrow && <div className="text-overline mb-t1 text-fg-muted">{eyebrow}</div>}
          {title && <h3 className="font-display text-h3 font-semibold text-fg">{title}</h3>}
        </div>
        <div className="flex items-center gap-t2">
          {state === 'streaming' && (
            <span className="flex items-center gap-t1 text-overline text-fg-muted">
              <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
              생성 중
            </span>
          )}
          {actions}
        </div>
      </div>
      {children}
    </div>
  );
}
