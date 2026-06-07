/** @type {import('tailwindcss').Config} */
// All theme values map to the Milray Park CSS variables defined in
// src/styles/tokens.css. Never hardcode color/spacing/radius/shadow — extend
// this map and use the semantic utility (e.g. bg-surface, text-fg, rounded-pill).
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    // Replace the default palette so raw hex utilities (bg-red-500) are gone;
    // only semantic, token-backed colors remain.
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      inherit: 'inherit',

      // surfaces / background
      bg: 'var(--bg)',
      'bg-deep': 'var(--bg-deep)',
      surface: 'var(--surface)',
      'surface-2': 'var(--surface-2)',
      'surface-3': 'var(--surface-3)',

      // ink / text
      fg: 'var(--fg)',
      'fg-1': 'var(--fg-1)',
      'fg-2': 'var(--fg-2)',
      'fg-muted': 'var(--fg-muted)',
      'fg-disabled': 'var(--fg-disabled)',

      // brand accents
      accent: 'var(--accent)',
      'accent-hover': 'var(--accent-hover)',
      'accent-soft': 'var(--coral-soft)',
      link: 'var(--link)',
      'on-accent': 'var(--on-accent)',
      'on-dark': 'var(--on-dark)',
      gold: 'var(--gold)',
      'gold-deep': 'var(--gold-deep)',

      // borders / lines
      border: 'var(--border)',
      'border-strong': 'var(--border-strong)',
      'field-border': 'var(--field-border)',

      // status
      success: 'var(--success)',
      'success-soft': 'var(--success-soft)',
      danger: 'var(--danger)',
      'danger-soft': 'var(--danger-soft)',
    },

    borderRadius: {
      none: '0',
      xs: 'var(--r-xs)',
      sm: 'var(--r-sm)',
      md: 'var(--r-md)',
      lg: 'var(--r-lg)',
      xl: 'var(--r-xl)',
      '2xl': 'var(--r-2xl)',
      pill: 'var(--r-pill)',
      full: '9999px',
    },

    boxShadow: {
      none: 'none',
      xs: 'var(--shadow-xs)',
      sm: 'var(--shadow-sm)',
      md: 'var(--shadow-md)',
      lg: 'var(--shadow-lg)',
      pop: 'var(--shadow-pop)',
    },

    extend: {
      fontFamily: {
        display: 'var(--font-display)',
        sans: 'var(--font-sans)',
        'display-ko': 'var(--font-display-ko)',
        'sans-ko': 'var(--font-sans-ko)',
      },
      // 4pt spacing scale mapped to tokens (use alongside Tailwind defaults).
      spacing: {
        't1': 'var(--sp-1)',
        't2': 'var(--sp-2)',
        't3': 'var(--sp-3)',
        't4': 'var(--sp-4)',
        't5': 'var(--sp-5)',
        't6': 'var(--sp-6)',
        't7': 'var(--sp-7)',
        't8': 'var(--sp-8)',
        't9': 'var(--sp-9)',
        't10': 'var(--sp-10)',
        't12': 'var(--sp-12)',
      },
      fontSize: {
        display: ['var(--fs-display)', { lineHeight: 'var(--lh-display)' }],
        h1: ['var(--fs-h1)', { lineHeight: 'var(--lh-h1)' }],
        h2: ['var(--fs-h2)', { lineHeight: 'var(--lh-h2)' }],
        h3: ['var(--fs-h3)', { lineHeight: 'var(--lh-h3)' }],
        h4: ['var(--fs-h4)', { lineHeight: 'var(--lh-h4)' }],
        'body-lg': ['var(--fs-body-lg)', { lineHeight: 'var(--lh-body-lg)' }],
        body: ['var(--fs-body)', { lineHeight: 'var(--lh-body)' }],
        sm: ['var(--fs-sm)', { lineHeight: 'var(--lh-sm)' }],
        xs: ['var(--fs-xs)', { lineHeight: 'var(--lh-xs)' }],
        overline: ['var(--fs-overline)', { lineHeight: 'var(--lh-overline)', letterSpacing: 'var(--tk-overline)' }],
      },
      ringColor: {
        focus: 'var(--focus-ring)',
      },
      transitionTimingFunction: {
        // motion: 150–200ms ease, no bounce (CLAUDE.md §5)
        soft: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
    },
  },
  plugins: [],
};
