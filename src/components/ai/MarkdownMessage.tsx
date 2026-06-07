import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

/* Editorial markdown renderer for assistant answers (reference KinderVerse
   parity). All styling uses Milray Park semantic tokens (CLAUDE §2.1) — serif
   `font-display` for expressive headings, grotesque `font-sans` for body,
   coral accent for links/quotes. No hardcoded colors. */

const components: Components = {
  h1: ({ node: _n, ...p }) => (
    <h1 className="mb-t3 mt-t6 font-display text-h3 font-semibold leading-tight text-fg first:mt-0" {...p} />
  ),
  h2: ({ node: _n, ...p }) => (
    <h2 className="mb-t2 mt-t5 font-display text-h4 font-semibold leading-tight text-fg first:mt-0" {...p} />
  ),
  h3: ({ node: _n, ...p }) => (
    <h3 className="mb-t2 mt-t4 font-sans text-body-lg font-semibold text-fg first:mt-0" {...p} />
  ),
  p: ({ node: _n, ...p }) => <p className="mb-t3 leading-7 text-fg-1 last:mb-0" {...p} />,
  strong: ({ node: _n, ...p }) => <strong className="font-semibold text-fg" {...p} />,
  em: ({ node: _n, ...p }) => <em className="italic" {...p} />,
  a: ({ node: _n, ...p }) => (
    <a className="text-link underline underline-offset-2 hover:text-accent-hover" target="_blank" rel="noreferrer" {...p} />
  ),
  ul: ({ node: _n, ...p }) => <ul className="mb-t3 list-disc space-y-1 pl-5 marker:text-fg-muted last:mb-0" {...p} />,
  ol: ({ node: _n, ...p }) => <ol className="mb-t3 list-decimal space-y-1 pl-5 marker:text-fg-muted last:mb-0" {...p} />,
  li: ({ node: _n, ...p }) => <li className="leading-7 text-fg-1" {...p} />,
  blockquote: ({ node: _n, ...p }) => (
    <blockquote className="my-t3 border-l-2 border-accent pl-t3 text-fg-2" {...p} />
  ),
  hr: ({ node: _n, ...p }) => <hr className="my-t5 border-border" {...p} />,
  pre: ({ node: _n, ...p }) => (
    <pre className="my-t3 overflow-x-auto rounded-md bg-fg p-t3 text-sm text-on-dark" {...p} />
  ),
  code: ({ node: _n, className, children }) => {
    const text = String(children ?? '');
    const isBlock = (className?.includes('language-') ?? false) || text.includes('\n');
    if (isBlock) {
      return <code className="font-mono text-sm leading-relaxed">{children}</code>;
    }
    return (
      <code className="rounded-xs bg-surface-3 px-1.5 py-0.5 font-mono text-[0.85em] text-fg">{children}</code>
    );
  },
  table: ({ node: _n, ...p }) => (
    <div className="my-t3 overflow-x-auto">
      <table className="w-full border-collapse text-sm" {...p} />
    </div>
  ),
  th: ({ node: _n, ...p }) => (
    <th className="border-b-2 border-border bg-surface-2 px-t3 py-t2 text-left font-semibold text-fg" {...p} />
  ),
  td: ({ node: _n, ...p }) => <td className="border-b border-border px-t3 py-t2 align-top text-fg-1" {...p} />,
};

export function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="text-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
