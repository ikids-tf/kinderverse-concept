/* AUI registry payload contracts (SKILL §4 / PRD §6.3).
   Agents emit { type, props } JSON only → validated here → rendered by the
   matching registry component. Props schema is 1:1 with the agent output. */

import type { AgeBand, Curriculum } from '@/ai/pedagogy';

/* 세분 연령(만 나이) — 놀이계획 문서의 대상 선택 UI 전용. 유아교육 현장은 반을 만 나이로
   운영하므로 0~1/2/3/4/5세를 개별 선택하게 한다. 광역 AgeBand(0-2·3-5)는 기존 소비자
   (워크시트·계획 생성 등)와의 호환을 위해 계속 유지하고, age_years 를 넣으면 그로부터 파생한다. */
export type AgeYears = '0-1' | '2' | '3' | '4' | '5';

export const AGE_OPTIONS: ReadonlyArray<{ value: AgeYears; label: string; short: string; band: AgeBand }> = [
  { value: '0-1', label: '만 0~1세', short: '0~1세', band: '0-2' },
  { value: '2', label: '만 2세', short: '2세', band: '0-2' },
  { value: '3', label: '만 3세', short: '3세', band: '3-5' },
  { value: '4', label: '만 4세', short: '4세', band: '3-5' },
  { value: '5', label: '만 5세', short: '5세', band: '3-5' },
];

/** 세분 연령 → 광역 AgeBand(payload 호환용). */
export function bandForAge(years: AgeYears): AgeBand {
  return AGE_OPTIONS.find((o) => o.value === years)?.band ?? '3-5';
}

/** 문서 표시용 대상 라벨 — 세분 연령이 있으면 '만 N세', 없으면 광역 밴드 라벨. */
export function ageLabel(p: { age_years?: string; age_band: AgeBand }): string {
  const opt = AGE_OPTIONS.find((o) => o.value === p.age_years);
  if (opt) return opt.label;
  return p.age_band === '0-2' ? '영아(0–2세)' : '유아(3–5세)';
}

export type RegistryType =
  | 'RecordDraftCard'
  | 'PlayStoryCard'
  | 'ClarifyPrompt'
  | 'TopicWeb'
  | 'MonthlyPlan'
  | 'WeeklyPlan'
  | 'DailyPlan'
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
  /** 세분 연령(만 나이) — 있으면 문서 대상 라벨·AI 맥락에 우선 사용. age_band 는 이로부터 파생. */
  age_years?: AgeYears;
  curriculum: Curriculum;
  days: PlanDay[];
  notes?: string;
}

/* 놀이중심 주제망 (agent.plan · feature: topic_web) — 대주제→소주제→놀이아이디어 2단계 +
   환경구성 + 유아 예상질문. 하위(놀이아이디어·월/주/일안·프로젝트) seed 이자 verse topic_web
   변환 소스. 필드명은 verse/downstream 계약(topic_web·play_ideas·environment_setup·
   children_expected_questions)과 1:1로 맞춘다. */
export interface TopicWebSubtopic {
  subtopic: string; // 탐색·관심 영역 (활동명이 아님)
  play_ideas: string[]; // 짧은 놀이명들
}
export interface TopicWebProps {
  id?: string;
  main_topic: string;
  age_band: AgeBand;
  age_years?: AgeYears;
  theme?: string;
  life_theme?: string;
  season?: string;
  project_mode?: boolean;
  subtopics: TopicWebSubtopic[];
  environment_setup: string[];
  children_expected_questions: string[];
}

/* 월간 놀이계획 (agent.plan · feature: monthly_plan) — 실제 현장 월안 서식. 기본정보 +
   놀이선정근거(이유·교사기대·교육과정연계) + 주차별 예상놀이흐름 + 바깥놀이 + 안전/인성교육 +
   행사 + 가정연계. 주안·일안의 상위 컨텍스트. 필드명은 영문 통일(스펙의 한글 키를 영문으로). */
export interface MonthlyCurriculumLink {
  area: string; // 신체운동·건강 / 의사소통 / 사회관계 / 예술경험 / 자연탐구
  category: string; // 범주
  content: string; // 내용
}
export interface MonthlyWeekFlow {
  week: string; // "1주차"
  sub_theme: string; // 소주제
  play_ideas: string[]; // 놀이아이디어(놀이명만)
}
export interface MonthlyOutdoorPlay {
  week: string;
  activity: string; // 활동명
}
export interface MonthlyEvent {
  name: string; // 행사명
  connection: string; // 연계내용
}
export interface MonthlyPlanProps {
  id?: string;
  age_band: AgeBand;
  age_years?: AgeYears;
  curriculum: Curriculum;
  basic_info: {
    class_name: string; // 반이름
    theme: string; // 놀이주제
    period: string; // 놀이기간(예: "2026년 6월")
  };
  rationale: {
    reason: string; // 놀이선정이유
    teacher_expectations: string[]; // 교사의기대(2~5)
    curriculum_links: MonthlyCurriculumLink[]; // 교육과정연계(5영역)
  };
  weekly_flow: MonthlyWeekFlow[]; // 예상놀이흐름(4~5주)
  outdoor_play: MonthlyOutdoorPlay[]; // 바깥놀이및신체활동
  safety_education: string; // 안전교육
  character_education: string; // 인성교육
  events: MonthlyEvent[]; // 행사(없으면 [])
  home_connection: string; // 가정연계활동
}

/* 주간 놀이계획 (agent.plan · feature: weekly_plan) — 월안의 한 주차를 월~금 운영 흐름으로.
   요일별 flow_stage(관심·탐색→탐구→표현→협력→공유) + 놀이아이디어(경험·영역) + 바깥놀이 +
   안전/인성교육 + 행사 + 가정연계. 일안의 상위 컨텍스트. 기본 계획 생성 경로 전용(내부 합성·
   프로젝트는 계속 WeeklyPlanGrid). */
export interface WeeklyTeacherExpectation {
  goal: string;
  focus: string; // 탐색|표현|협력|문제해결|의사소통
}
export interface WeeklyCurriculumLink {
  area: string;
  content: string;
  expected_experience: string;
}
export interface WeeklyPlayIdea {
  title: string;
  core_experience: string;
  learning_area: string[];
}
export interface WeeklyDayFlow {
  day: string; // 월/화/수/목/금
  date?: string;
  flow_stage: string; // 관심 및 탐색 / 탐구 및 경험 / 표현 / 협력 / 공유 및 확장
  play_ideas: WeeklyPlayIdea[];
}
export interface WeeklyOutdoorPlay {
  day: string;
  activity_name: string;
  method?: string;
  safety_point?: string;
}
export interface WeeklySafetyEducation {
  weekly_safety_focus: string;
  teacher_guidance: string;
}
export interface WeeklyCharacterEducation {
  core_value: string;
  practice_context: string;
}
export interface WeeklyEvent {
  name: string;
  date?: string;
  connection: string;
}
export interface WeeklyHomeConnection {
  home_play: string;
  conversation_topic: string;
  observation_point: string;
}
export interface WeeklyPlanProps {
  id?: string;
  age_band: AgeBand;
  age_years?: AgeYears;
  curriculum: Curriculum;
  basic_info: {
    theme: string;
    sub_theme: string;
    week_number?: number;
    period: string; // 기간 라벨(예: "2026.07.06 ~ 07.10")
  };
  rationale: {
    summary: string;
    meaning_of_this_week: string;
    connection_from_previous_play: string;
    expansion_to_next_play: string;
  };
  teacher_expectations: WeeklyTeacherExpectation[];
  curriculum_links: WeeklyCurriculumLink[];
  daily_flow: WeeklyDayFlow[];
  outdoor_and_physical_play: WeeklyOutdoorPlay[];
  safety_education: WeeklySafetyEducation;
  character_education: WeeklyCharacterEducation;
  events: WeeklyEvent[];
  home_connection: WeeklyHomeConnection;
}

/* 일일 놀이계획 (agent.plan · feature: daily_plan) — 교사가 바로 운영하는 실행 단위 계획.
   도입→전개(활동 2~4개: 놀이명·목표·방법·발문·예상반응·지원전략)→마무리→평가→확장 + 준비물
   (교사/유아)·환경(실내/외)·우천대체·안전·가정연계. 주안의 특정 요일을 상세화. 교사기대·교육과정
   연계는 주안 타입 재사용(구조 동일). */
export interface DailyMaterials {
  teacher_materials: string[];
  children_materials: string[];
}
export interface DailyEnvironmentSetup {
  indoor_environment: { space_setup: string; material_arrangement: string };
  outdoor_environment: { play_environment: string };
}
export interface DailyConversation {
  teacher_questions: string[];
  expected_child_responses: string[];
}
export interface DailyIntroduction {
  interest_trigger: string;
  conversation: DailyConversation;
}
export interface DailySupportStrategy {
  language_support: string;
  play_expansion: string;
  individual_support: string;
}
export interface DailyDevelopmentActivity {
  activity_name: string;
  activity_goal: string;
  activity_method: string[];
  teacher_questions: string[];
  expected_child_responses: string[];
  support_strategy: DailySupportStrategy;
}
export interface DailyClosing {
  experience_sharing: string;
  reflection_questions: string[];
  connection_to_next_play: string;
}
export interface DailyOutdoorPlay {
  activity_name: string;
  method: string;
  safety_guidance: string;
}
export interface DailyRainyAlternative {
  indoor_alternative_play: string;
  materials: string[];
  operation_method: string;
}
export interface DailySafetyNotes {
  play_safety: string;
  environment_safety: string;
  health_safety: string;
}
export interface DailyAssessment {
  observation_points: string[];
  teacher_check_questions: string[];
}
export interface DailyExtensionActivities {
  classroom_extension: string;
  project_extension: string;
  art_extension: string;
  role_play_extension: string;
}
export interface DailyHomeConnection {
  try_at_home: string;
  parent_question: string;
  recommended_picture_book: string;
  follow_up_play: string;
}
export interface DailyPlanProps {
  id?: string;
  age_band: AgeBand;
  age_years?: AgeYears;
  curriculum: Curriculum;
  basic_info: { theme: string; sub_theme: string; date: string; day: string };
  teacher_expectations: WeeklyTeacherExpectation[];
  curriculum_links: WeeklyCurriculumLink[];
  materials: DailyMaterials;
  environment_setup: DailyEnvironmentSetup;
  introduction: DailyIntroduction;
  development_activities: DailyDevelopmentActivity[];
  closing: DailyClosing;
  outdoor_and_physical_play: DailyOutdoorPlay;
  rainy_day_alternative: DailyRainyAlternative;
  safety_notes: DailySafetyNotes;
  assessment: DailyAssessment;
  extension_activities: DailyExtensionActivities;
  home_connection: DailyHomeConnection;
}

/* 활동지/워크시트 (agent.studio) — A4·인쇄·다운로드, 연결 계획 표시.
   확장 필드(유형·스타일·image_prompt·cut_layout 등)는 worksheet-reference 추천 결과.
   PROMPTS §4 / worksheet_match_reference 스키마와 1:1. */
export interface WorksheetCutLayout {
  pieces: string[];
  shared_edges: string[][];
  cut_line_style: 'solid' | 'dashed';
}
export interface WorksheetSelection {
  type_by: 'user' | 'recommended';
  style_by: 'user' | 'recommended';
  mode: 'instant' | 'guided';
}

/** 레이어 분리 결과의 한 조각(이동·스케일 편집 상태). 에이전트 출력이 아니라
    보드 편집 상태라 payload가 아닌 node.data에 보관한다. x/y/w/h는 시트 대비 %. */
export interface WorksheetLayer {
  id: string;
  label: string;
  src: string; // 잘라낸 요소 이미지(dataURI)
  x: number; // left, 시트 너비의 % (0–100)
  y: number; // top, 시트 높이의 %
  w: number; // width, 시트 너비의 %
  h: number; // height, 시트 높이의 %
  scale: number; // 사용자 확대/축소 배율(기본 1)
}
export interface WorksheetCardProps {
  title: string;
  age_band: AgeBand;
  /** 세분 연령(만 나이) — 있으면 헤더 대상 라벨·난이도(3/4/5세)에 우선 사용. age_band 는 이로부터 파생. */
  age_years?: AgeYears;
  curriculum: Curriculum;
  objective: string;
  materials: string[];
  steps: string[];
  domains?: string[];
  link_plan_id?: string;
  // ── A4 인쇄 헤더(상단 서식) ──
  /** 주제 — 놀이/프로젝트 주제(예: "여름 바다"). 헤더 '주제' 칸. 없으면 topic 으로 대체. */
  theme?: string;
  /** 영역 — 활동 카테고리(예: "수·셈"). 헤더 '영역' 칸. 활동 유형에서 파생. */
  area?: string;
  // ── 레퍼런스 추천 확장 ──
  topic?: string;
  instruction?: string; // 활동지 안내문(텍스트 레이어로 표시)
  type?: string; // 활동 유형(분류하기 등)
  style?: string; // 스타일 code(round_character 등)
  style_label?: string; // 스타일 표시명(캐릭터 친구들 등)
  selection?: WorksheetSelection;
  difficulty?: 'basic' | 'standard' | 'extended';
  image_prompt?: string; // 조립 완료된 studio 호출용 프롬프트
  image_url?: string; // studio가 렌더한 활동지 시각물
  needs_cut_layout?: boolean;
  cut_layout?: WorksheetCutLayout | null;
  visual_status?: 'pending' | 'filled';
  /** 편집 디자인 템플릿 variant id(수 세기=counting 등). 있으면 이 활동지는 AI 이미지 대신
   *  DesignFrame 편집기(편집디자인 카드)로 '생성 시점부터' 열린다. 단일 출처=worksheet-reference.template. */
  template_variant?: string;
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
  | { type: 'TopicWeb'; props: TopicWebProps }
  | { type: 'MonthlyPlan'; props: MonthlyPlanProps }
  | { type: 'WeeklyPlan'; props: WeeklyPlanProps }
  | { type: 'DailyPlan'; props: DailyPlanProps }
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

  if (type === 'TopicWeb') {
    const age_band = asAgeBand(p.age_band);
    const subtopics: TopicWebSubtopic[] = Array.isArray(p.subtopics)
      ? (p.subtopics as unknown[])
          .filter((s): s is Record<string, unknown> => typeof s === 'object' && s !== null)
          .map((s) => ({
            subtopic: String(s.subtopic ?? ''),
            play_ideas: isStringArray(s.play_ideas) ? s.play_ideas.filter((x) => x.trim()) : [],
          }))
          .filter((s) => s.subtopic.trim())
      : [];
    if (subtopics.length === 0) return { ok: false, errors: ['subtopics must be non-empty'] };
    return {
      ok: true,
      errors: [],
      value: {
        type: 'TopicWeb',
        props: {
          id: typeof p.id === 'string' ? p.id : undefined,
          main_topic: String(p.main_topic ?? '놀이 주제망'),
          age_band,
          age_years: AGE_OPTIONS.some((o) => o.value === p.age_years) ? (p.age_years as AgeYears) : undefined,
          theme: typeof p.theme === 'string' ? p.theme : undefined,
          life_theme: typeof p.life_theme === 'string' ? p.life_theme : undefined,
          season: typeof p.season === 'string' ? p.season : undefined,
          project_mode: typeof p.project_mode === 'boolean' ? p.project_mode : undefined,
          subtopics,
          environment_setup: isStringArray(p.environment_setup) ? p.environment_setup.filter((x) => x.trim()) : [],
          children_expected_questions: isStringArray(p.children_expected_questions)
            ? p.children_expected_questions.filter((x) => x.trim())
            : [],
        },
      },
    };
  }

  if (type === 'MonthlyPlan') {
    const age_band = asAgeBand(p.age_band);
    const bi = (p.basic_info ?? {}) as Record<string, unknown>;
    const rat = (p.rationale ?? {}) as Record<string, unknown>;
    const asObjArr = (v: unknown): Record<string, unknown>[] =>
      Array.isArray(v) ? (v as unknown[]).filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null) : [];
    const weekly_flow: MonthlyWeekFlow[] = asObjArr(p.weekly_flow)
      .map((w) => ({
        week: String(w.week ?? ''),
        sub_theme: String(w.sub_theme ?? ''),
        play_ideas: isStringArray(w.play_ideas) ? w.play_ideas.filter((x) => x.trim()) : [],
      }))
      .filter((w) => w.sub_theme.trim() || w.play_ideas.length);
    if (weekly_flow.length === 0) return { ok: false, errors: ['weekly_flow must be non-empty'] };
    const curriculum_links: MonthlyCurriculumLink[] = asObjArr(rat.curriculum_links).map((c) => ({
      area: String(c.area ?? ''),
      category: String(c.category ?? ''),
      content: String(c.content ?? ''),
    }));
    const outdoor_play: MonthlyOutdoorPlay[] = asObjArr(p.outdoor_play)
      .map((o) => ({ week: String(o.week ?? ''), activity: String(o.activity ?? o.activity_name ?? '') }))
      .filter((o) => o.activity.trim());
    const events: MonthlyEvent[] = asObjArr(p.events)
      .map((e) => ({ name: String(e.name ?? ''), connection: String(e.connection ?? '') }))
      .filter((e) => e.name.trim());
    return {
      ok: true,
      errors: [],
      value: {
        type: 'MonthlyPlan',
        props: {
          id: typeof p.id === 'string' ? p.id : undefined,
          age_band,
          age_years: AGE_OPTIONS.some((o) => o.value === p.age_years) ? (p.age_years as AgeYears) : undefined,
          curriculum: asCurriculum(p.curriculum, age_band),
          basic_info: {
            class_name: String(bi.class_name ?? ''),
            theme: String(bi.theme ?? ''),
            period: String(bi.period ?? ''),
          },
          rationale: {
            reason: String(rat.reason ?? ''),
            teacher_expectations: isStringArray(rat.teacher_expectations) ? rat.teacher_expectations.filter((x) => x.trim()) : [],
            curriculum_links,
          },
          weekly_flow,
          outdoor_play,
          safety_education: typeof p.safety_education === 'string' ? p.safety_education : '',
          character_education: typeof p.character_education === 'string' ? p.character_education : '',
          events,
          home_connection: typeof p.home_connection === 'string' ? p.home_connection : '',
        },
      },
    };
  }

  if (type === 'WeeklyPlan') {
    const age_band = asAgeBand(p.age_band);
    const bi = (p.basic_info ?? {}) as Record<string, unknown>;
    const rat = (p.rationale ?? {}) as Record<string, unknown>;
    const se = (p.safety_education ?? {}) as Record<string, unknown>;
    const ce = (p.character_education ?? {}) as Record<string, unknown>;
    const hc = (p.home_connection ?? {}) as Record<string, unknown>;
    const objArr = (v: unknown): Record<string, unknown>[] =>
      Array.isArray(v) ? (v as unknown[]).filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null) : [];
    const daily_flow: WeeklyDayFlow[] = objArr(p.daily_flow)
      .map((d) => ({
        day: String(d.day ?? ''),
        date: typeof d.date === 'string' ? d.date : undefined,
        flow_stage: String(d.flow_stage ?? ''),
        play_ideas: objArr(d.play_ideas)
          .map((pi) => ({
            title: String(pi.title ?? ''),
            core_experience: String(pi.core_experience ?? ''),
            learning_area: isStringArray(pi.learning_area) ? pi.learning_area.filter((x) => x.trim()) : [],
          }))
          .filter((pi) => pi.title.trim()),
      }))
      .filter((d) => d.day.trim());
    if (daily_flow.length === 0) return { ok: false, errors: ['daily_flow must be non-empty'] };
    return {
      ok: true,
      errors: [],
      value: {
        type: 'WeeklyPlan',
        props: {
          id: typeof p.id === 'string' ? p.id : undefined,
          age_band,
          age_years: AGE_OPTIONS.some((o) => o.value === p.age_years) ? (p.age_years as AgeYears) : undefined,
          curriculum: asCurriculum(p.curriculum, age_band),
          basic_info: {
            theme: String(bi.theme ?? ''),
            sub_theme: String(bi.sub_theme ?? ''),
            week_number: typeof bi.week_number === 'number' ? bi.week_number : undefined,
            period: typeof bi.period === 'string' ? bi.period : String((bi.period as Record<string, unknown>)?.label ?? ''),
          },
          rationale: {
            summary: String(rat.summary ?? ''),
            meaning_of_this_week: String(rat.meaning_of_this_week ?? ''),
            connection_from_previous_play: String(rat.connection_from_previous_play ?? ''),
            expansion_to_next_play: String(rat.expansion_to_next_play ?? ''),
          },
          teacher_expectations: objArr(p.teacher_expectations)
            .map((t) => ({ goal: String(t.goal ?? ''), focus: String(t.focus ?? '') }))
            .filter((t) => t.goal.trim()),
          curriculum_links: objArr(p.curriculum_links)
            .map((c) => ({ area: String(c.area ?? ''), content: String(c.content ?? ''), expected_experience: String(c.expected_experience ?? '') }))
            .filter((c) => c.area.trim()),
          daily_flow,
          outdoor_and_physical_play: objArr(p.outdoor_and_physical_play)
            .map((o) => ({
              day: String(o.day ?? ''),
              activity_name: String(o.activity_name ?? ''),
              method: typeof o.method === 'string' ? o.method : undefined,
              safety_point: typeof o.safety_point === 'string' ? o.safety_point : undefined,
            }))
            .filter((o) => o.activity_name.trim()),
          safety_education: {
            weekly_safety_focus: String(se.weekly_safety_focus ?? ''),
            teacher_guidance: String(se.teacher_guidance ?? ''),
          },
          character_education: {
            core_value: String(ce.core_value ?? ''),
            practice_context: String(ce.practice_context ?? ''),
          },
          events: objArr(p.events)
            .map((e) => ({ name: String(e.name ?? ''), date: typeof e.date === 'string' ? e.date : undefined, connection: String(e.connection ?? '') }))
            .filter((e) => e.name.trim()),
          home_connection: {
            home_play: String(hc.home_play ?? ''),
            conversation_topic: String(hc.conversation_topic ?? ''),
            observation_point: String(hc.observation_point ?? ''),
          },
        },
      },
    };
  }

  if (type === 'DailyPlan') {
    const age_band = asAgeBand(p.age_band);
    const S = (v: unknown): string => (typeof v === 'string' ? v : '');
    const A = (v: unknown): string[] => (isStringArray(v) ? v.filter((x) => x.trim()) : []);
    const O = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {});
    const objArr = (v: unknown): Record<string, unknown>[] =>
      Array.isArray(v) ? (v as unknown[]).filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null) : [];
    const bi = O(p.basic_info);
    const mat = O(p.materials);
    const env = O(p.environment_setup);
    const indoor = O(env.indoor_environment);
    const outdoor = O(env.outdoor_environment);
    const intro = O(p.introduction);
    const introConv = O(intro.conversation);
    const closing = O(p.closing);
    const oap = O(p.outdoor_and_physical_play);
    const rainy = O(p.rainy_day_alternative);
    const safety = O(p.safety_notes);
    const assess = O(p.assessment);
    const ext = O(p.extension_activities);
    const hc = O(p.home_connection);
    const development_activities: DailyDevelopmentActivity[] = objArr(p.development_activities)
      .map((d) => {
        const sup = O(d.support_strategy);
        return {
          activity_name: S(d.activity_name),
          activity_goal: S(d.activity_goal),
          activity_method: A(d.activity_method),
          teacher_questions: A(d.teacher_questions),
          expected_child_responses: A(d.expected_child_responses),
          support_strategy: {
            language_support: S(sup.language_support),
            play_expansion: S(sup.play_expansion),
            individual_support: S(sup.individual_support),
          },
        };
      })
      .filter((d) => d.activity_name.trim());
    if (development_activities.length === 0) return { ok: false, errors: ['development_activities must be non-empty'] };
    return {
      ok: true,
      errors: [],
      value: {
        type: 'DailyPlan',
        props: {
          id: typeof p.id === 'string' ? p.id : undefined,
          age_band,
          age_years: AGE_OPTIONS.some((o) => o.value === p.age_years) ? (p.age_years as AgeYears) : undefined,
          curriculum: asCurriculum(p.curriculum, age_band),
          basic_info: { theme: S(bi.theme), sub_theme: S(bi.sub_theme), date: S(bi.date), day: S(bi.day) },
          teacher_expectations: objArr(p.teacher_expectations)
            .map((t) => ({ goal: S(t.goal), focus: S(t.focus) }))
            .filter((t) => t.goal.trim()),
          curriculum_links: objArr(p.curriculum_links)
            .map((c) => ({ area: S(c.area), content: S(c.content), expected_experience: S(c.expected_experience) }))
            .filter((c) => c.area.trim()),
          materials: { teacher_materials: A(mat.teacher_materials), children_materials: A(mat.children_materials) },
          environment_setup: {
            indoor_environment: { space_setup: S(indoor.space_setup), material_arrangement: S(indoor.material_arrangement) },
            outdoor_environment: { play_environment: S(outdoor.play_environment) },
          },
          introduction: {
            interest_trigger: S(intro.interest_trigger),
            conversation: { teacher_questions: A(introConv.teacher_questions), expected_child_responses: A(introConv.expected_child_responses) },
          },
          development_activities,
          closing: {
            experience_sharing: S(closing.experience_sharing),
            reflection_questions: A(closing.reflection_questions),
            connection_to_next_play: S(closing.connection_to_next_play),
          },
          outdoor_and_physical_play: { activity_name: S(oap.activity_name), method: S(oap.method), safety_guidance: S(oap.safety_guidance) },
          rainy_day_alternative: { indoor_alternative_play: S(rainy.indoor_alternative_play), materials: A(rainy.materials), operation_method: S(rainy.operation_method) },
          safety_notes: { play_safety: S(safety.play_safety), environment_safety: S(safety.environment_safety), health_safety: S(safety.health_safety) },
          assessment: { observation_points: A(assess.observation_points), teacher_check_questions: A(assess.teacher_check_questions) },
          extension_activities: {
            classroom_extension: S(ext.classroom_extension),
            project_extension: S(ext.project_extension),
            art_extension: S(ext.art_extension),
            role_play_extension: S(ext.role_play_extension),
          },
          home_connection: {
            try_at_home: S(hc.try_at_home),
            parent_question: S(hc.parent_question),
            recommended_picture_book: S(hc.recommended_picture_book),
            follow_up_play: S(hc.follow_up_play),
          },
        },
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
          age_years: AGE_OPTIONS.some((o) => o.value === p.age_years) ? (p.age_years as AgeYears) : undefined,
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
    const cut = p.cut_layout as Record<string, unknown> | null | undefined;
    const cut_layout: WorksheetCutLayout | null | undefined =
      cut && typeof cut === 'object'
        ? {
            pieces: isStringArray(cut.pieces) ? cut.pieces : [],
            shared_edges: Array.isArray(cut.shared_edges)
              ? (cut.shared_edges as unknown[]).filter(isStringArray)
              : [],
            cut_line_style: cut.cut_line_style === 'dashed' ? 'dashed' : 'solid',
          }
        : cut === null
          ? null
          : undefined;
    const sel = p.selection as Record<string, unknown> | undefined;
    const selection: WorksheetSelection | undefined =
      sel && typeof sel === 'object'
        ? {
            type_by: sel.type_by === 'user' ? 'user' : 'recommended',
            style_by: sel.style_by === 'user' ? 'user' : 'recommended',
            mode: sel.mode === 'guided' ? 'guided' : 'instant',
          }
        : undefined;
    const difficulty =
      p.difficulty === 'basic' || p.difficulty === 'standard' || p.difficulty === 'extended'
        ? p.difficulty
        : undefined;
    return {
      ok: true,
      errors: [],
      value: {
        type: 'WorksheetCard',
        props: {
          title: String(p.title ?? '활동지'),
          age_band,
          age_years: AGE_OPTIONS.some((o) => o.value === p.age_years) ? (p.age_years as AgeYears) : undefined,
          curriculum: asCurriculum(p.curriculum, age_band),
          objective,
          materials: isStringArray(p.materials) ? p.materials : [],
          steps,
          domains: isStringArray(p.domains) ? p.domains : undefined,
          link_plan_id: typeof p.link_plan_id === 'string' ? p.link_plan_id : undefined,
          theme: typeof p.theme === 'string' ? p.theme : undefined,
          area: typeof p.area === 'string' ? p.area : undefined,
          topic: typeof p.topic === 'string' ? p.topic : undefined,
          instruction: typeof p.instruction === 'string' ? p.instruction : undefined,
          type: typeof p.type === 'string' ? p.type : undefined,
          style: typeof p.style === 'string' ? p.style : undefined,
          style_label: typeof p.style_label === 'string' ? p.style_label : undefined,
          selection,
          difficulty,
          image_prompt: typeof p.image_prompt === 'string' ? p.image_prompt : undefined,
          image_url: typeof p.image_url === 'string' ? p.image_url : undefined,
          needs_cut_layout: typeof p.needs_cut_layout === 'boolean' ? p.needs_cut_layout : undefined,
          cut_layout,
          visual_status:
            p.visual_status === 'filled' || p.visual_status === 'pending' ? p.visual_status : undefined,
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
