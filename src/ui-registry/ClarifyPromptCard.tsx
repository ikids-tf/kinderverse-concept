import { Icon } from '@/lib/icons';
import type { ClarifyPromptProps } from './contracts';

/* ClarifyPrompt — shown when an agent declines to generate (e.g. missing
   grounding for an observation) and asks for input. */

export function ClarifyPromptCard({
  props,
  onOption,
}: {
  props: ClarifyPromptProps;
  onOption?: (option: string) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-t4 shadow-sm">
      <div className="mb-t2 flex items-center gap-t2">
        <span className="flex h-6 w-6 items-center justify-center rounded-pill bg-accent-soft text-accent">
          <Icon name="message" size={14} />
        </span>
        <span className="text-overline text-fg-muted">근거 필요 · 무근거 생성 금지</span>
      </div>
      <p className="text-body text-fg">{props.question}</p>
      {props.options && props.options.length > 0 && (
        <div className="mt-t3 flex flex-wrap gap-t2">
          {props.options.map((opt) => (
            <button
              key={opt}
              onClick={() => onOption?.(opt)}
              className="rounded-pill border border-border-strong bg-surface px-t4 py-t2 text-sm font-medium text-fg transition-colors duration-150 ease-soft hover:bg-surface-2"
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
