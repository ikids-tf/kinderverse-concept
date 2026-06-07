/* AUI registry payload contracts (SKILL §4 / PRD §6.3).
   Agents emit { type, props } JSON only → validated here → rendered by the
   matching registry component. Props schema is 1:1 with the agent output. */

import type { AgeBand, Curriculum } from '@/ai/pedagogy';

export type RegistryType =
  | 'RecordDraftCard'
  | 'PlayStoryCard'
  | 'ClarifyPrompt'
  | 'WeeklyPlanGrid'
  | 'WorksheetCard'
  | 'StudioGallery'
  | 'LetterPreview'
  | 'AssessmentReport';

/** One grounded observation statement (관찰기록). Anti-hallucination: `source`
    must be non-empty — every statement cites a photo id or teacher note. */
export interface ObservationStatement {
  text: string;
  source: string;
  domains: string[];
}

export interface RecordDraftCardProps {
  child_label: string; // masked/general (e.g. "관찰 대상", initials)
  age_band: AgeBand;
  curriculum: Curriculum;
  date?: string;
  observations: ObservationStatement[];
  summary?: string;
}

export interface PhotoSlot {
  caption: string;
  /** Real child photos arrive in M4; M3 uses captioned placeholders. */
  placeholder: boolean;
}

export interface PlayStoryCardProps {
  title: string;
  age_band: AgeBand;
  curriculum: Curriculum;
  photo_slots: PhotoSlot[];
  narrative: string;
  domains: string[];
  family_note?: string;
}

export interface ClarifyPromptProps {
  question: string;
  options?: string[];
}

/* 놀이계획 (agent.plan) — 요일×영역 그리드. */
export interface PlanDay {
  day: string; // 월/화/...
  area: string; // 누리/표준 영역
  activity: string;
  materials?: string;
  goal?: string;
}
export interface WeeklyPlanGridProps {
  id?: string; // plan id (worksheet links back via link_plan_id)
  title: string;
  age_band: AgeBand;
  curriculum: Curriculum;
  days: PlanDay[];
  notes?: string;
}

/* 활동지/워크시트 (agent.studio) — A4·인쇄·다운로드, 연결 계획 표시. */
export interface WorksheetCardProps {
  title: string;
  age_band: AgeBand;
  curriculum: Curriculum;
  objective: string;
  materials: string[];
  steps: string[];
  domains?: string[];
  link_plan_id?: string;
}

/* 이미지/도안 (agent.studio). AI 생성 라벨 필수 — 실제 아동 사진 아님(§9.5). */
export interface StudioItem {
  caption: string;
  kind: 'image' | '도안';
  url?: string; // data URI or remote; absent = placeholder
}
export interface StudioGalleryProps {
  title: string;
  items: StudioItem[];
}

/* 문장/통신문/공지 (agent.writing) — 톤 토글 + 자율성 게이트(발송=L2). */
export type LetterKind = 'letter' | 'notice' | 'text';
export type Tone = 'warm' | 'formal' | 'concise';
export interface LetterPreviewProps {
  kind: LetterKind;
  title: string;
  body: string;
  tone: Tone;
  audience?: string;
}

/* 발달평가서 (agent.writing) — 고위험. 적합성 검증 패스 결과 동봉, 발송=L3. */
export interface AssessmentDomain {
  area: string;
  observation: string;
  level?: string;
}
export interface SuitabilityResult {
  checked: boolean;
  pass: boolean;
  flags: string[];
}
export interface AssessmentReportProps {
  child_label: string;
  age_band: AgeBand;
  curriculum: Curriculum;
  domains: AssessmentDomain[];
  summary: string;
  suitability: SuitabilityResult;
}

export type RegistryPayload =
  | { type: 'RecordDraftCard'; props: RecordDraftCardProps }
  | { type: 'PlayStoryCard'; props: PlayStoryCardProps }
  | { type: 'ClarifyPrompt'; props: ClarifyPromptProps }
  | { type: 'WeeklyPlanGrid'; props: WeeklyPlanGridProps }
  | { type: 'WorksheetCard'; props: WorksheetCardProps }
  | { type: 'StudioGallery'; props: StudioGalleryProps }
  | { type: 'LetterPreview'; props: LetterPreviewProps }
  | { type: 'AssessmentReport'; props: AssessmentReportProps };

export interface RegistryValidation {
  ok: boolean;
  errors: string[];
  value?: RegistryPayload;
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}
function asAgeBand(v: unknown): AgeBand {
  return v === '0-2' ? '0-2' : '3-5';
}
function asCurriculum(v: unknown, band: AgeBand): Curriculum {
  if (v === 'standard' || v === 'nuri') return v;
  return band === '0-2' ? 'standard' : 'nuri';
}

/* Validate + coerce a raw agent payload into a typed RegistryPayload.
   Enforces the anti-hallucination invariant for observations. */
export function validateRegistryPayload(raw: unknown): RegistryValidation {
  const errors: string[] = [];
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, errors: ['payload is not an object'] };
  }
  const o = raw as Record<string, unknown>;
  const type = o.type as RegistryType;
  const p = (o.props ?? {}) as Record<string, unknown>;

  if (type === 'RecordDraftCard') {
    const age_band = asAgeBand(p.age_band);
    const observations: ObservationStatement[] = Array.isArray(p.observations)
      ? (p.observations as unknown[])
          .filter((s): s is Record<string, unknown> => typeof s === 'object' && s !== null)
          .map((s) => ({
            text: String(s.text ?? ''),
            source: String(s.source ?? ''),
            domains: isStringArray(s.domains) ? s.domains : [],
          }))
          .filter((s) => s.text)
      : [];

    if (observations.length === 0) errors.push('observations must be non-empty');
    // Anti-hallucination (SKILL §3 rule 5): every statement needs a source.
    if (observations.some((s) => !s.source.trim())) {
      errors.push('every observation must cite a source (무근거 생성 금지)');
    }
    if (errors.length) return { ok: false, errors };

    return {
      ok: true,
      errors: [],
      value: {
        type: 'RecordDraftCard',
        props: {
          child_label: String(p.child_label ?? '관찰 대상'),
          age_band,
          curriculum: asCurriculum(p.curriculum, age_band),
          date: typeof p.date === 'string' ? p.date : undefined,
          observations,
          summary: typeof p.summary === 'string' ? p.summary : undefined,
        },
      },
    };
  }

  if (type === 'PlayStoryCard') {
    const age_band = asAgeBand(p.age_band);
    const narrative = String(p.narrative ?? '');
    if (!narrative.trim()) errors.push('narrative is required');
    const photo_slots: PhotoSlot[] = Array.isArray(p.photo_slots)
      ? (p.photo_slots as unknown[])
          .filter((s): s is Record<string, unknown> => typeof s === 'object' && s !== null)
          .map((s) => ({ caption: String(s.caption ?? ''), placeholder: true }))
      : [];
    if (errors.length) return { ok: false, errors };

    return {
      ok: true,
      errors: [],
      value: {
        type: 'PlayStoryCard',
        props: {
          title: String(p.title ?? '오늘의 놀이이야기'),
          age_band,
          curriculum: asCurriculum(p.curriculum, age_band),
          photo_slots,
          narrative,
          domains: isStringArray(p.domains) ? p.domains : [],
          family_note: typeof p.family_note === 'string' ? p.family_note : undefined,
        },
      },
    };
  }

  if (type === 'ClarifyPrompt') {
    const question = String(p.question ?? '');
    if (!question.trim()) return { ok: false, errors: ['question is required'] };
    return {
      ok: true,
      errors: [],
      value: {
        type: 'ClarifyPrompt',
        props: { question, options: isStringArray(p.options) ? p.options : undefined },
      },
    };
  }

  if (type === 'WeeklyPlanGrid') {
    const age_band = asAgeBand(p.age_band);
    const days: PlanDay[] = Array.isArray(p.days)
      ? (p.days as unknown[])
          .filter((d): d is Record<string, unknown> => typeof d === 'object' && d !== null)
          .map((d) => ({
            day: String(d.day ?? ''),
            area: String(d.area ?? ''),
            activity: String(d.activity ?? ''),
            materials: typeof d.materials === 'string' ? d.materials : undefined,
            goal: typeof d.goal === 'string' ? d.goal : undefined,
          }))
          .filter((d) => d.activity)
      : [];
    if (days.length === 0) return { ok: false, errors: ['days must be non-empty'] };
    return {
      ok: true,
      errors: [],
      value: {
        type: 'WeeklyPlanGrid',
        props: {
          id: typeof p.id === 'string' ? p.id : undefined,
          title: String(p.title ?? '주간 놀이계획'),
          age_band,
          curriculum: asCurriculum(p.curriculum, age_band),
          days,
          notes: typeof p.notes === 'string' ? p.notes : undefined,
        },
      },
    };
  }

  if (type === 'WorksheetCard') {
    const age_band = asAgeBand(p.age_band);
    const objective = String(p.objective ?? '');
    const steps = isStringArray(p.steps) ? p.steps : [];
    if (!objective.trim() || steps.length === 0) {
      return { ok: false, errors: ['objective and steps are required'] };
    }
    return {
      ok: true,
      errors: [],
      value: {
        type: 'WorksheetCard',
        props: {
          title: String(p.title ?? '활동지'),
          age_band,
          curriculum: asCurriculum(p.curriculum, age_band),
          objective,
          materials: isStringArray(p.materials) ? p.materials : [],
          steps,
          domains: isStringArray(p.domains) ? p.domains : undefined,
          link_plan_id: typeof p.link_plan_id === 'string' ? p.link_plan_id : undefined,
        },
      },
    };
  }

  if (type === 'StudioGallery') {
    const items: StudioItem[] = Array.isArray(p.items)
      ? (p.items as unknown[])
          .filter((s): s is Record<string, unknown> => typeof s === 'object' && s !== null)
          .map((s) => ({
            caption: String(s.caption ?? ''),
            kind: s.kind === '도안' ? '도안' : 'image',
            url: typeof s.url === 'string' ? s.url : undefined,
          }))
      : [];
    if (items.length === 0) return { ok: false, errors: ['items must be non-empty'] };
    return { ok: true, errors: [], value: { type: 'StudioGallery', props: { title: String(p.title ?? '스튜디오'), items } } };
  }

  if (type === 'LetterPreview') {
    const body = String(p.body ?? '');
    if (!body.trim()) return { ok: false, errors: ['body is required'] };
    const kind: LetterKind = p.kind === 'notice' ? 'notice' : p.kind === 'text' ? 'text' : 'letter';
    const tone: Tone = p.tone === 'formal' ? 'formal' : p.tone === 'concise' ? 'concise' : 'warm';
    return {
      ok: true,
      errors: [],
      value: {
        type: 'LetterPreview',
        props: {
          kind,
          title: String(p.title ?? '문서'),
          body,
          tone,
          audience: typeof p.audience === 'string' ? p.audience : undefined,
        },
      },
    };
  }

  if (type === 'AssessmentReport') {
    const age_band = asAgeBand(p.age_band);
    const summary = String(p.summary ?? '');
    const domains: AssessmentDomain[] = Array.isArray(p.domains)
      ? (p.domains as unknown[])
          .filter((d): d is Record<string, unknown> => typeof d === 'object' && d !== null)
          .map((d) => ({
            area: String(d.area ?? ''),
            observation: String(d.observation ?? ''),
            level: typeof d.level === 'string' ? d.level : undefined,
          }))
          .filter((d) => d.area && d.observation)
      : [];
    if (domains.length === 0 || !summary.trim()) {
      return { ok: false, errors: ['domains and summary are required'] };
    }
    const s = (p.suitability ?? {}) as Record<string, unknown>;
    return {
      ok: true,
      errors: [],
      value: {
        type: 'AssessmentReport',
        props: {
          child_label: String(p.child_label ?? '대상 아동'),
          age_band,
          curriculum: asCurriculum(p.curriculum, age_band),
          domains,
          summary,
          suitability: {
            checked: typeof s.checked === 'boolean' ? s.checked : false,
            pass: typeof s.pass === 'boolean' ? s.pass : false,
            flags: isStringArray(s.flags) ? s.flags : [],
          },
        },
      },
    };
  }

  return { ok: false, errors: [`unknown registry type: ${String(type)}`] };
}
