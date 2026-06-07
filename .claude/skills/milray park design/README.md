# Milray Park — Design System

A warm, editorial design system for **Milray Park**, an online *eDecorating* platform that
pairs people with professional interior designers and lets them collaborate **100% online**.
The brand voice is boutique and reassuring; the visual language is gallery-calm — cream
canvas, white cards, a single confident terracotta-coral accent, and a gold tier accent for
premium ("GOLD") designers.

> ⚠️ **Source of truth:** This system was reverse-engineered from a single brand component
> sheet (the "Design System" reference board) supplied by the user — see
> `assets/source-component-sheet.png`. There was **no codebase or Figma file** attached, so
> all tokens, fonts and component states are matched *visually* from that board. Fonts are a
> best-match substitution (see Visual Foundations → Typography). Please confirm or send the
> real brand assets so I can tighten the match.

---

## What is Milray Park?

Milray Park is an **online interior-design (eDecorating) service**. Instead of meeting a
decorator in person, customers brief a designer, share a budget and style, and the whole
project — moodboards, product sourcing, room plans — happens on the platform. Signals pulled
from the reference board:

- **Collaboration is the product.** "On Milray Park, you collaborate with your interior
  designer 100% online on our easy-to-use eDecorating platform."
- **Designers are tiered.** A **GOLD** / **SILVER** badge system ranks designers; profiles
  show star ratings, location (e.g. *Sydney*), an *Available now* status, and a **per-room
  price** (e.g. *$599 / ROOM*).
- **Style-led discovery.** Browsing is organised by **Moodboards**, design **styles**
  (*Art Deco*, etc.), brands, and **Ratings** — surfaced as filter tags.
- **Considered commerce.** Product search ("Search for Desktops / Mobiles"), budget filters,
  payments (Visa, Mastercard, Stripe, PayPal, Apple Pay…) and international support (country
  flags) all appear, so the platform handles real purchasing across regions.

### Surfaces in this system
1. **Web platform** — the customer-facing eDecorating site: browse/match designers, view a
   designer profile, moodboard discovery, brief/contact. The UI kit lives in
   `ui_kits/milray-park-web/`.

---

## CONTENT FUNDAMENTALS

How Milray Park writes.

- **Voice:** warm, premium, and reassuring — a concierge for design. It removes intimidation
  from hiring a decorator. Confident but never loud.
- **Person:** second person, customer-facing — **"you collaborate with your interior
  designer"**, *"Just let your designer know."* The brand speaks *to* the customer and frames
  the designer as *yours*.
- **Casing:** Sentence case for body and most UI labels ("Search for Desktops", "Available
  now"). **Title Case** for headings and proper nouns ("Home Page", "Case Study Details").
  **ALL-CAPS, tracked** reserved for micro-labels and badges only — `GOLD`, `SILVER`,
  `ART DECO`, `ROOM`, `NOVEMBER 2018`, filter tag `ALL`/`MOODBOARD`.
- **Headlines are questions.** Editorial, FAQ-style serif questions drive sections:
  *"What is Milray Park?"*, *"What makes Milray Park unique?"* — inviting, not declarative.
- **Emphasis with the accent.** Key phrases and the brand name are highlighted in coral
  inside running copy: *"On **Milray Park**, …our easy **to use eDecorating platform**."*
  Use sparingly — one or two coral phrases per paragraph, max.
- **Reassurance pattern.** Info blocks soften decisions: *"Like a particular brand? Just let
  your designer know. Otherwise, you can leave it up to your designer who will be sourcing
  the best pieces at the best prices for your overall look."* Note the structure: a friendly
  **bold lead-in question** + a calm, permission-giving answer.
- **Microcopy:** short, human, status-led — *"Available now"*, *"Highly professional"*,
  *"Clear All"*, *"What is your inquiry about?"*. Affirmations skew to craft and trust
  ("Highly professional").
- **No emoji.** The brand uses line icons and badges, never emoji, in product copy.

---

## VISUAL FOUNDATIONS

### Mood
Boutique, editorial, gallery-calm. The page is a **warm cream room**; content sits on
**clean white cards** like framed pieces. Lots of breathing room. The only saturated color
is a single terracotta-coral, used like a designer's signature accent, plus gold for tier.

### Color
- **Canvas:** cream `#F8F7F2`, with a slightly deeper `#F1EEE6` for recessed/outer frames.
- **Surfaces:** white `#FFFFFF` cards. Secondary surfaces are warm tans —
  `#F4EDE3` (light) and `#EAE0D2` (tag/well).
- **Ink:** near-black `#141311` for primary text and dark buttons; greys step down
  `#56524B → #8C887F → #B7B1A6` for secondary, muted and disabled.
- **Accent:** terracotta-coral `#F2733E` — active filter tag, links, star ratings, inline
  emphasis. Hover/press deepen to `#E5602B`.
- **Gold:** `#FFC324` tier badge (GOLD); `#E0A62C` for gold text on light.
- **Discipline:** one accent. Coral does the highlighting; gold *only* signals designer tier.
  Avoid introducing extra hues. Imagery is warm and natural (interiors, soft daylight, real
  furniture and people) — never cold, never heavily filtered.

### Typography
- **Display serif:** high-contrast, elegant — used for titles, section questions, and
  names (*"Design System"*, *"What is Milray Park?"*, *"Jane Cooper"*). **English:
  Playfair Display.** **Korean: Noto Serif KR (본명조).** (Confirmed pairing.)
- **UI / body sans:** a clean, warm grotesque for labels, buttons, body and microcopy.
  **English: Hanken Grotesk.** **Korean: Pretendard** — also covers Latin + numerals, so
  it doubles as the single body face for mixed KO/EN copy.
- **Mixed-language stacks:** `--font-display` and `--font-sans` list the Latin face first
  with the Korean face as fallback, so browsers pick the right glyph automatically. Use
  `--font-display-ko` / `--font-sans-ko` for fully-Korean blocks.
- **Pairing rule:** serif for *expressive* moments (page/section titles, designer names,
  FAQ questions); sans for *everything functional* (controls, labels, paragraphs, prices).
- **Micro-labels** are sans, 700 weight, uppercase, tracked `0.14em`.
  Fonts are loaded from Google Fonts (+ Pretendard CDN) via `@import` in
  `colors_and_type.css` (no local `.ttf` bundled).

### Shape, radius & borders
- **Pill-forward.** Buttons, tags, badges and search inputs are fully rounded
  (`border-radius: 999px`). Select fields and info blocks use a softer `10–14px`.
- **Cards** are big and soft: `~26px` radius, no harsh edges.
- **The signature outline:** primary search inputs use a crisp **1.5px charcoal pill
  border** on white — high-contrast, confident. Lighter `#E3DCD0` borders on tan/select
  fields. Promo cells use a thin hairline border.
- **Checkboxes** are small rounded squares (`6px`); radios are circles. Checked state fills
  charcoal with a white tick; indeterminate is a charcoal minus.

### Elevation & shadow
Whisper-soft, warm-tinted shadows (`rgba(40,33,24,…)`). Most cards read nearly **flat** on
cream, separated by color rather than depth. The exception: dark popovers/tooltips (the
slider's black **"Value"** bubble) get a deeper `rgba(20,19,17,0.18)` shadow to lift off the
page. No glows, no neon, no hard drop shadows.

### Layout
- Generous gutters; content centered in a wide frame.
- Card-grid composition — a masonry of white cards of varied size on cream.
- Comfortable internal padding (`24–32px`).
- Prefer flex/grid with `gap`; pills and chips flow in rows with consistent gaps.

### Motion & states
- **Calm and quick.** Short fades / 150–200ms ease transitions. No bounce, no parallax,
  nothing decorative-looping.
- **Hover:** tan surfaces deepen one step (`#F4EDE3 → #EAE0D2`); dark buttons lighten
  slightly; links shift to `--coral-strong` and underline. Coral fills deepen to
  `#E5602B`.
- **Press:** subtle darken (no big scale change); a faint inset is acceptable on tan.
- **Focus:** soft coral focus ring `rgba(242,115,62,0.35)`.
- **Loading:** thin circular **spinner** with a coral arc on a tan track.
- **Transparency/blur:** used sparingly — not a glassmorphism brand. Solid warm surfaces win.

### Imagery
Real interior photography and designer headshots, warm and natural. Avatars are
**rounded/oval**, often with a small gold **GOLD** tier chip pinned to the bottom. No
illustration system, no abstract gradients.

---

## ICONOGRAPHY

- **Style:** simple, thin **line icons**, ~1.75–2px stroke, rounded joins — search
  (magnifier), chevron-down, filter (sliders/lines), arrow-right, plus/minus (accordion),
  check. Monochrome charcoal; never multicolor, never emoji.
- **Source:** no icon font/SVG set was provided with the reference board. The set visually
  matches **Lucide / Feather** (same stroke weight + rounded style), so the UI kit links
  **Lucide** from CDN as a best-match substitution. ⚠️ Flagged — swap for the brand's real
  icon set when available.
- **Check/tick** marks (bullets, "checked" states, "Available now") use a filled charcoal
  circle with a white tick — a small custom motif, reproduced in the kit.
- **Badges over icons** carry meaning: `GOLD`/`SILVER` tier chips, star ratings (coral
  filled / outline empty).
- **Brand logos** (payments: Visa, Mastercard, Stripe, PayPal, Apple Pay; country flags) are
  third-party marks shown as-is on the board. They are **not** redrawn here. In the UI kit
  payment marks are represented with neutral text/placeholder chips and country flags use
  Unicode flag glyphs — replace with official brand SVGs for production. ⚠️ Flagged.
- **Emoji:** not used anywhere in the brand.

---

## INDEX — what's in this folder

| Path | What it is |
|------|------------|
| `README.md` | This file — brand context, content + visual foundations, iconography, index. |
| `colors_and_type.css` | All design tokens: color, type, radius, shadow, spacing CSS variables + helper classes. |
| `SKILL.md` | Agent-Skill manifest so this system can be used directly in Claude Code. |
| `assets/` | Brand/source assets — incl. `source-component-sheet.png` (the original reference board). |
| `preview/` | Small HTML specimen cards that populate the **Design System** tab (colors, type, components). |
| `ui_kits/milray-park-web/` | Web platform UI kit — interactive screen recreations + reusable JSX components. See its own `README.md`. |

### Quick start
1. Link the tokens: `<link rel="stylesheet" href="colors_and_type.css">`.
2. Use semantic vars (`var(--coral)`, `var(--surface)`, `var(--r-pill)`) and helper classes
   (`.mp-display`, `.mp-overline`).
3. For components, copy patterns from `ui_kits/milray-park-web/`.
