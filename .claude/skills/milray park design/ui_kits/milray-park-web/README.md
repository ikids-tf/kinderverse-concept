# Milray Park — Web UI Kit

A high-fidelity, interactive recreation of the **Milray Park** eDecorating web platform,
built from the brand's design-system component sheet. It is a click-through prototype, not
production code — components are cosmetic recreations meant to be pieced together for mocks.

> ⚠️ Reverse-engineered from the brand component board only (no codebase/Figma). Fonts
> (Playfair Display + Hanken Grotesk) and icons (Lucide) are best-match substitutions.
> Imagery uses warm placeholder blocks; payment marks and flags are placeholders — swap in
> licensed assets for production.

## Run it
Open `index.html`. It loads React 18 + Babel from CDN and the design tokens from
`../../colors_and_type.css`.

## Click-through flow
`Home` → `Find a designer (Browse)` → `Designer profile` → `Start a project (Brief)` → success.
Navigate via the header, the hero CTAs, designer cards, and breadcrumbs. The header "Start a
project" and all primary CTAs route to the brief; submitting it shows the matched-success state.

## Files & components
| File | Exports | Notes |
|------|---------|-------|
| `Icons.jsx` | `Icon`, `Tick`, `Stars` | Lucide-path icon component + the charcoal-circle tick motif + coral star rating. |
| `UI.jsx` | `Button`, `IconButton`, `Tag`, `Badge`, `SearchField`, `SelectField`, `Photo`, `Avatar`, `Logo` | Core primitives. `Button` variants: dark / coral / outline / tan / ghost. |
| `Chrome.jsx` | `Header`, `Footer` | Sticky blurred header; dark footer. |
| `Cards.jsx` | `DesignerTile`, `FaqItem`, `Step` | Designer grid card, FAQ accordion row, how-it-works step. |
| `Home.jsx` | `Home` (+ `Hero`, `TrustStrip`, `HowItWorks`, `FeaturedDesigners`, `FaqSection`, `CtaBand`) | Landing page sections. |
| `Browse.jsx` | `Browse`, `DesignerRow` | Filter chips, search + budget, grid/list toggle, results. |
| `Profile.jsx` | `Profile` | Designer profile with sticky booking card + reassurance info block. |
| `Brief.jsx` | `Brief` (+ `Field`, `BudgetSlider`) | Multi-input brief form with the signature value-bubble slider + success state. |
| `App.jsx` | `App` | Designer data (`DESIGNERS`) + screen router. Mounts to `#root`. |

## Conventions
- Each `*.jsx` file ends with `Object.assign(window, {...})` so components share scope across
  the separate Babel `<script>` tags. Load order matters — Icons → UI → everything else.
- All color/spacing/radius/type values come from `colors_and_type.css` variables.
- Designer records drive every surface — edit `DESIGNERS` in `App.jsx` to reskin content.

## Coverage (intentional gaps)
Login, dashboard/messaging, and checkout are not built out — the kit focuses on the public
discovery → brief funnel visible in the source material. Add them following the same patterns.
