---
name: milray-park-design
description: Use this skill to generate well-branded interfaces and assets for Milray Park, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the `README.md` file within this skill, and explore the other available files.

Milray Park is a warm, editorial **online eDecorating** brand — cream canvas, white cards,
a single terracotta-coral accent (`#F2733E`), a gold tier accent (`#FFC324`), a high-contrast
display serif (Playfair Display) paired with a clean grotesque (Hanken Grotesk). Pill-shaped
controls, soft cards, whisper-soft shadows, calm motion. Voice is concierge-warm and speaks
to "you" about "your designer".

Key files:
- `colors_and_type.css` — all design tokens (color, type, radius, shadow, spacing). Link this first.
- `README.md` — brand context, content fundamentals, visual foundations, iconography, index.
- `preview/` — specimen cards for every foundation and component.
- `ui_kits/milray-park-web/` — reusable JSX components + interactive screen recreations.
- `assets/` — source brand material (incl. the original component sheet).

If creating visual artifacts (slides, mocks, throwaway prototypes, etc.), copy assets out and
create static HTML files for the user to view. If working on production code, copy assets and
read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or
design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_
production code, depending on the need.
