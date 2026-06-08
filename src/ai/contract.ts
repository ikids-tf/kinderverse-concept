/* Router output contract (SKILL.md §3 / PRD §5.5).
   Agents emit JSON only — this is the schema + a dependency-free runtime
   validator with one self-repair pass handled by the caller (router agent). */

export type RouteTarget = 'router' | 'record' | 'plan' | 'studio' | 'writing' | 'mindmap';
export type Scope = 'selection' | 'page' | 'new';
export type RecordMode = 'observation' | 'story';

export interface Selection {
  ids: string[];
  types: string[];
  count: number;
}

export interface SuggestedNext {
  action: string;
  label: string;
  reason: string;
  confidence: number;
}

export interface LaneContext {
  id: string;
  template: string;
  step: string;
  node_id: string;
}

export interface Grounding {
  photos: string[];
  teacher_notes: string[];
}

/** Clarification slot — filled when confidence < 0.7 (PROMPTS §1, SKILL §3 rule 4). */
export interface Clarify {
  question: string;
  options?: string[];
}

export interface RouterOutput {
  page: string;
  selection: Selection;
  available_actions: string[];
  intent: string;
  scope: Scope;
  /** null when confidence is too low to route (needs_confirmation=true). */
  route_to: RouteTarget | null;
  mode?: RecordMode;
  link?: { plan_id: string | null; child_ids: string[] };
  lane?: LaneContext | null;
  suggested_next: SuggestedNext[];
  confidence: number;
  grounding?: Grounding;
  /** Set when the router declines to route and asks a clarifying question. */
  needs_confirmation?: boolean;
  clarify?: Clarify;
}

/** Input the prompt bar sends to the router: "선택이 곧 범위." */
export interface RouterInput {
  text: string;
  page: string;
  selection: Selection;
  available_actions: string[];
}

export const CONFIDENCE_THRESHOLD = 0.7; // SKILL §3 rule 4
export const SUGGESTION_HIDE_BELOW = 0.6; // SKILL §3 rule 7

const ROUTE_TARGETS: RouteTarget[] = ['router', 'record', 'plan', 'studio', 'writing', 'mindmap'];
const SCOPES: Scope[] = ['selection', 'page', 'new'];

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  value?: RouterOutput;
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

/* Hand-rolled validator (no external schema dep). Coerces/defaults loose fields
   so a mostly-correct model response is accepted; reports hard violations. */
export function validateRouterOutput(raw: unknown): ValidationResult {
  const errors: string[] = [];
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, errors: ['output is not an object'] };
  }
  const o = raw as Record<string, unknown>;

  if (typeof o.page !== 'string') errors.push('page must be a string');

  const sel = (o.selection ?? {}) as Record<string, unknown>;
  const selection: Selection = {
    ids: isStringArray(sel.ids) ? sel.ids : [],
    types: isStringArray(sel.types) ? sel.types : [],
    count: typeof sel.count === 'number' ? sel.count : 0,
  };

  const available_actions = isStringArray(o.available_actions) ? o.available_actions : [];

  if (typeof o.intent !== 'string') errors.push('intent must be a string');

  const scope = SCOPES.includes(o.scope as Scope) ? (o.scope as Scope) : null;
  if (!scope) errors.push(`scope must be one of ${SCOPES.join('|')}`);

  let route_to: RouteTarget | null = null;
  if (o.route_to === null || o.route_to === undefined || o.route_to === '') {
    route_to = null;
  } else if (ROUTE_TARGETS.includes(o.route_to as RouteTarget)) {
    route_to = o.route_to as RouteTarget;
  } else {
    errors.push(`route_to must be null or one of ${ROUTE_TARGETS.join('|')}`);
  }

  const confidence = typeof o.confidence === 'number' ? o.confidence : NaN;
  if (Number.isNaN(confidence) || confidence < 0 || confidence > 1) {
    errors.push('confidence must be a number in [0,1]');
  }

  const suggested_next: SuggestedNext[] = Array.isArray(o.suggested_next)
    ? (o.suggested_next as unknown[])
        .filter((s): s is Record<string, unknown> => typeof s === 'object' && s !== null)
        .map((s) => ({
          action: String(s.action ?? ''),
          label: String(s.label ?? ''),
          reason: String(s.reason ?? ''),
          confidence: typeof s.confidence === 'number' ? s.confidence : 0,
        }))
        .filter((s) => s.action && s.label)
    : [];

  if (errors.length) return { ok: false, errors };

  const value: RouterOutput = {
    page: o.page as string,
    selection,
    available_actions,
    intent: o.intent as string,
    scope: scope as Scope,
    route_to,
    suggested_next,
    confidence,
  };

  if (o.mode === 'observation' || o.mode === 'story') value.mode = o.mode;
  if (o.lane && typeof o.lane === 'object') value.lane = o.lane as LaneContext;
  if (o.link && typeof o.link === 'object') value.link = o.link as RouterOutput['link'];
  if (o.grounding && typeof o.grounding === 'object') value.grounding = o.grounding as Grounding;
  if (typeof o.needs_confirmation === 'boolean') value.needs_confirmation = o.needs_confirmation;
  if (o.clarify && typeof o.clarify === 'object') {
    const c = o.clarify as Record<string, unknown>;
    if (typeof c.question === 'string') {
      value.clarify = {
        question: c.question,
        options: isStringArray(c.options) ? c.options : undefined,
      };
    }
  }

  // Enforce rule 4: low confidence ⇒ don't route, ask.
  if (value.confidence < CONFIDENCE_THRESHOLD) {
    value.route_to = null;
    value.needs_confirmation = true;
    if (!value.clarify) {
      value.clarify = { question: '무엇을 도와드릴까요? 조금 더 구체적으로 알려주세요.' };
    }
  }

  return { ok: true, errors: [], value };
}
