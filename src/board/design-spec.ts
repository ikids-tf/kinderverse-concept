import type { RouteTarget } from '@/ai/contract';

/* Design Director — the ARRANGE half (P0/P1a).
   A minimal, validated layout decision the composer hands to designComposedFrame.
   P1 = rule-based (deterministic). P2 = a hybrid LLM emits this same spec (schema-
   validated), with the rule-based result as the fallback. Keeping the type tiny now
   means the seam is open without committing to the full spec shape yet. */

export type LayoutVariant = 'default' | 'gallery-first' | 'hero-doc';

const VARIANTS: LayoutVariant[] = ['default', 'gallery-first', 'hero-doc'];

/** Coerce an untrusted value (e.g. a future LLM output) to a known variant. */
export function asLayoutVariant(v: unknown): LayoutVariant {
  return typeof v === 'string' && (VARIANTS as string[]).includes(v) ? (v as LayoutVariant) : 'default';
}

/** Rule-based arrange decision. studio is image-led → put images up front. */
export function ruleBasedVariant(routeTo: RouteTarget | null): LayoutVariant {
  return routeTo === 'studio' ? 'gallery-first' : 'default';
}

/* ---- Full spec (arrange + decorate) — emitted by the hybrid director (P2) ---- */

export interface DesignSpec {
  /** layout arrangement variant */
  variant: LayoutVariant;
  /** emoji palette the director chose for this frame's theme/mood (0–6) */
  stickers: string[];
  /** role of the ONE document that should get a cover illustration (or undefined) */
  coverRole?: string;
}

const COVER_ROLES = new Set(['plan', 'letter', 'record', 'worksheet', 'newsletter']);

/** Validate/coerce an untrusted DesignSpec (the director's LLM output). This is the
    charter safety boundary — same role as validateRegistryPayload. Returns null on
    anything unusable so the caller can fall back to the rule-based spec. */
export function validateDesignSpec(raw: unknown): DesignSpec | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const variant = asLayoutVariant(o.variant);
  const stickers = Array.isArray(o.stickers)
    ? (o.stickers as unknown[]).filter((s): s is string => typeof s === 'string' && s.trim().length > 0).slice(0, 6)
    : [];
  const coverRole = typeof o.coverRole === 'string' && COVER_ROLES.has(o.coverRole) ? o.coverRole : undefined;
  return { variant, stickers, coverRole };
}

/** The deterministic fallback spec (when the director call fails / no provider). */
export function ruleBasedSpec(routeTo: RouteTarget | null): DesignSpec {
  return { variant: ruleBasedVariant(routeTo), stickers: [], coverRole: undefined };
}
