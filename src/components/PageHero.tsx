/* Full-bleed page hero used by the inline-style pages (Gallery / Calendar /
   Folder). Eyebrow + display title + description, matching the gallery header
   1:1 so every section top reads the same. Token-backed Tailwind classes. */

export function PageHero({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <header style={{ padding: '32px 28px 8px' }}>
      {eyebrow && <div className="text-overline mb-t2 text-fg-muted">{eyebrow}</div>}
      <h1 className="text-display font-display font-semibold tracking-[-0.01em] text-fg">{title}</h1>
      {description && <p className="mt-t3 max-w-2xl text-body-lg text-fg-2">{description}</p>}
    </header>
  );
}
