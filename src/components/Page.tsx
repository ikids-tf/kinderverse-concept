import type { ReactNode } from 'react';

/* Consistent page scaffold. Reserves bottom space so content clears the fixed
   prompt bar, and provides the standard eyebrow + title header. */

export function Page({
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-6xl px-t6 pt-t8 pb-40">
      <header className="mb-t7 flex flex-wrap items-end justify-between gap-t4">
        <div>
          {eyebrow && <div className="text-overline mb-t2 text-fg-muted">{eyebrow}</div>}
          <h1 className="text-display font-display font-semibold tracking-[-0.01em] text-fg">{title}</h1>
          {description && <p className="mt-t3 max-w-2xl text-body-lg text-fg-2">{description}</p>}
        </div>
        {actions}
      </header>
      {children}
    </div>
  );
}

/* Empty-state placeholder used by M1 page stubs. */
export function StubBody({ note }: { note: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface/60 px-t6 py-t10 text-center">
      <p className="text-body text-fg-muted">{note}</p>
    </div>
  );
}
