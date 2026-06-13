import { callGateway } from '../client';
import { extractJson } from '../json';
import { requestedCount, imageSubject, coreTopic } from '../intent-lexicon';
import { PEDAGOGY_FOUNDATION } from '../pedagogy';
import { validateRegistryPayload, type RegistryPayload, type StudioItem } from '@/ui-registry/contracts';
import {
  parseWorksheetRequest,
  recommendWorksheet,
  type StyleCode,
  type WorksheetMode,
} from '../worksheet-reference';

/* Tier1 스튜디오 에이전트 (agent.studio). 활동지/워크시트 + 이미지/도안.
   활동지 두 경로: (A) 계획 연결(link_plan_id) (B) 독립 (SKILL §4.1). 이미지는
   게이트웨이 image 플러그인 사용(실연동 or 라벨 플레이스홀더, §9.5). */

function system(ctx?: string): string {
  const l0 = '너는 킨더버스 Tier1 스튜디오 에이전트다. 활동지/도안/이미지 프롬프트를 설계한다. 적합성은 Pedagogy Foundation이 보장한다.';
  const l3 = ctx?.trim() ? `[테넌트/교사 컨텍스트 — 우리반]\n${ctx.trim()}\n아동명 마스킹. 사실을 지어내지 마라.` : '';
  return [l0, PEDAGOGY_FOUNDATION, l3].filter(Boolean).join('\n\n');
}

/* Shared art-style descriptors (Design Director — style-locked illustration, P3).
   Appended to every image prompt so a frame's generated art is tonally cohesive. */
export const KV_ART_STYLE =
  '밝고 따뜻한 유아 그림책 일러스트 스타일, 부드러운 파스텔 색감, 둥근 형태, 단순하고 깔끔한 배경, 한 장면·단일 주제, 유아가 무서워할 요소 없음, 이미지 안에 글자·숫자·문자 절대 없음';
export const KV_COLORING_STYLE =
  '유아용 흑백 색칠 도안, 굵고 선명한 윤곽선, 색과 음영 없음, 깨끗한 흰 배경, 닫힌 면으로 칠하기 쉬운 큰 영역, 이미지 안에 글자·숫자 없음';

/* Veo(동영상) 스타일 — 영문 프롬프트 뒤에 붙여 톤을 고정(이미지 KV_ART_STYLE에 대응).
   사람(특히 아동) 미등장·무자막은 PRD §9.5(아동 안전) + 거버넌스와 일치. */
export const KV_VIDEO_STYLE =
  'warm gentle preschool picture-book animation style, soft pastel colors, rounded simple shapes, calm slow camera, cozy storybook atmosphere, child-friendly, nothing scary, absolutely no text, letters, numbers, captions or watermark anywhere on screen';
export const KV_VIDEO_NEGATIVE =
  'text, words, letters, numbers, captions, subtitles, watermark, logo, scary, violent, photorealistic real children, human faces, distorted anatomy, fast flashing, jump cuts';

/** 교사의 한국어 요청(또는 계획에서 뽑은 활동 내용)을 Veo용 영문 프롬프트로 변환.
    공식 5요소(subject·action·scene·camera·composition·ambiance) 구조 + 유아 스타일.
    저티어 LLM 1콜. 실패 시 휴리스틱 폴백(coreTopic + 스타일 접미사). */
export async function buildVeoPrompt(request: string, ctx?: string): Promise<string> {
  const topic = coreTopic(request) || request.trim();
  const fallback = `A gentle short animated scene about "${topic}" for preschool children, no people on screen. ${KV_VIDEO_STYLE}`;
  const res = await callGateway({
    task: 'studio',
    tier: 'low',
    provider: 'auto',
    responseFormat: 'json',
    system: system(ctx),
    messages: [
      {
        role: 'user',
        content: `유아 활동 개념 영상을 만들려 한다. 아래 한국어 요청을 Veo(텍스트→비디오)용 영문 프롬프트 "한 단락"으로 바꿔라.
요청: "${request}"
[규칙]
- 5요소를 한 흐름에 녹여라: subject(주체) · action(동작) · scene/context(장면·배경) · camera motion(카메라 움직임) · composition(구도) · ambiance(분위기).
- 사람(특히 아동) 등장 금지 — 동물·사물·자연·그림책 캐릭터로 표현.
- 화면에 글자·숫자·자막 넣지 마라.
- 4초 내외의 짧고 잔잔한 장면.
JSON만: { "prompt": "<English Veo prompt>" }`,
      },
    ],
    meta: { kind: 'veo_prompt', title: topic },
    maxTokens: 500,
  });
  if (res.ok && res.text) {
    try {
      const p = (extractJson(res.text) as { prompt?: string }).prompt;
      if (p && p.trim().length > 8) return `${p.trim()} ${KV_VIDEO_STYLE}`;
    } catch {
      /* fall through to heuristic */
    }
  }
  return fallback;
}

export interface StudioResult {
  payload: RegistryPayload;
  mocked?: boolean;
  warning?: string;
}

function clarify(question: string): RegistryPayload {
  return { type: 'ClarifyPrompt', props: { question } };
}

/* 활동지/워크시트 → WorksheetCard. linkPlanId가 있으면 계획에 연결.
   PROMPTS §4: 연령·주제(필수) + 유형·스타일(선택)을 슬롯으로 받아
   worksheet-reference로 유형/스타일을 추천(단일 출처) → image_prompt 조립 →
   studio가 시각물 렌더 → 교육 내용(목표/준비물/진행)은 LLM이 채운다. */
export interface WorksheetOpts {
  type?: string;
  style?: StyleCode;
  mode?: WorksheetMode;
  ageBand?: '0-2' | '3-5';
}

export async function runStudioWorksheet(
  request: string,
  ctx?: string,
  linkPlanId?: string,
  opts?: WorksheetOpts,
): Promise<StudioResult> {
  // 1) 슬롯 파싱(자연어) + 명시 옵션 병합 → 레퍼런스 추천.
  const parsed = parseWorksheetRequest(request, ctx);
  const reco = recommendWorksheet({
    age_band: opts?.ageBand ?? parsed.age_band,
    topic: parsed.topic,
    type: opts?.type ?? parsed.type,
    style: opts?.style ?? parsed.style,
    mode: opts?.mode,
  });

  // 2) 교육 내용(목표/준비물/진행/영역)은 LLM이 선택된 유형·연령에 맞게 작성.
  const user = `활동지 설계 요청.
- 주제: "${reco.topic}"
- 활동 유형: "${reco.type}"
- 대상 연령: ${reco.age_band === '0-2' ? '0~2세(영아)' : '3~5세(유아)'}
위 유형·연령에 맞는 A4 활동지의 교육 내용을 작성하라.
[현장 기준]
- 활동지는 그림 중심 한 장이다 — 유아는 글을 못 읽으므로 steps는 '교사가 진행하며 하는 말·행동' 기준으로 3~4단계(예: "그림을 함께 보며 '어떤 친구들이 있니?' 묻는다").
- 연령별 난이도: 같은 활동이라도 만3세는 항목 수 적고 크게·단순하게, 만5세는 심화·확장(비교/이유 묻기). 대상 연령에 맞춰 objective와 steps의 수준을 조절하고 무근거 난이도 상향 금지.
- objective는 '기대 경험'으로: "~하며 ~을 경험한다 / ~에 관심을 가진다" 1문장.
- materials는 활동지 외 실제 필요한 것만(색연필·가위·풀 등 2~4가지).
JSON만 출력:
{ "type": "WorksheetCard", "props": { "title": string, "age_band": "${reco.age_band}", "curriculum": "standard"|"nuri", "objective": string, "materials": string[], "steps": string[], "domains": string[] } }`;

  const first = await callGateway({
    task: 'studio',
    tier: 'mid',
    provider: 'auto',
    responseFormat: 'json',
    fallback: ['high'],
    system: system(ctx),
    messages: [{ role: 'user', content: user }],
    meta: { kind: 'worksheet', title: reco.topic, selected: linkPlanId ? [linkPlanId] : [] },
    maxTokens: 1800,
  });

  if (!first.ok || !first.text) {
    return { payload: clarify('활동지 생성에 실패했어요.'), warning: first.error, mocked: first.mocked };
  }

  let result;
  try {
    result = validateRegistryPayload(extractJson(first.text));
  } catch {
    result = { ok: false as const, errors: ['unparseable'] };
  }
  if (!result.ok || !result.value || result.value.type !== 'WorksheetCard') {
    return { payload: clarify('활동지를 만들 정보가 부족해요.'), mocked: first.mocked };
  }

  // 3) studio가 image_prompt로 활동지 "그림 영역"을 렌더(글자 없음, 세로형).
  //    제목·안내는 앱이 텍스트 레이어로 덧입힌다. A4에 맞게 세로 비율(3:4) 요청.
  const visual = await callGateway({
    task: 'image',
    provider: 'auto',
    messages: [],
    meta: { prompt: reco.image_prompt, caption: `${reco.topic} ${reco.type}`, aspectRatio: '3:4' },
  });

  // 4) 추천 메타 + 시각물 병합 → 확장 WorksheetCard.
  //    제목은 레퍼런스 제목(이미지에 그려진 제목)과 일치시킨다.
  const props = result.value.props;
  props.title = reco.title;
  props.age_band = reco.age_band;
  props.topic = reco.topic;
  props.instruction = reco.instruction;
  props.type = reco.type;
  props.style = reco.style;
  props.style_label = reco.style_label;
  props.selection = reco.selection;
  props.difficulty = reco.difficulty;
  props.image_prompt = reco.image_prompt;
  props.image_url = visual.image;
  props.needs_cut_layout = reco.needs_cut_layout;
  props.cut_layout = reco.cut_layout;
  props.visual_status = visual.image ? 'filled' : 'pending';
  if (linkPlanId) props.link_plan_id = linkPlanId;

  return { payload: result.value, mocked: first.mocked || !!visual.mocked };
}

/* 이미지/도안 생성은 2단계로 분리한다(보드가 카드를 먼저 깔고 차례로 채우는 UX):
   1) planStudioImages — 캡션/프롬프트 목록(스펙)만 계획. 요청에 개수가 명시되면
      ("각각 10개") 그 수만큼, 항목마다 서로 다른 대상 + 짧은 이름 캡션(예: 소방차).
   2) renderStudioImage — 스펙 1건을 이미지 1장으로 렌더. */

export interface StudioImageSpec {
  caption: string;
  prompt: string;
}
export interface StudioImagePlan {
  specs: StudioImageSpec[];
  style: string;
  /** 갤러리/프레임 제목용 — 수량·어미를 뗀 주제. */
  title: string;
}

export async function planStudioImages(
  request: string,
  selected: string[],
  ctx?: string,
  kind: 'image' | '도안' = 'image',
  opts?: { simple?: boolean; count?: number },
): Promise<StudioImagePlan> {
  const style = kind === '도안' ? KV_COLORING_STYLE : KV_ART_STYLE;
  const subject = imageSubject(request);
  // 명시 개수: 호출자 지정 > 요청문 파싱("10개/열 장"). 다개수면 simple이라도 멀티로.
  const reqN = opts?.count ?? requestedCount(request) ?? undefined;
  const multi = (reqN ?? 1) > 1;

  // Simple mode ("사자 그려줘") — ONE clean drawing of the subject, caption = subject.
  if (opts?.simple && !multi) {
    return { specs: [{ caption: subject, prompt: subject }], style, title: subject };
  }

  const n = Math.min(Math.max(reqN ?? 3, 1), 12);
  const sel = selected.length ? `참고 활동: ${selected.join(', ')}` : '';
  const capRes = await callGateway({
    task: 'studio',
    tier: 'low',
    provider: 'auto',
    responseFormat: 'json',
    system: system(ctx),
    messages: [
      {
        role: 'user',
        content: `요청: "${request}"\n${sel}\n${kind === '도안' ? '색칠 도안' : '개념 일러스트'} 정확히 ${n}개의 캡션과 이미지 프롬프트를 제안하라(실제 아동 사진 아님).
[캡션 규칙]
- 각 항목은 요청 범주 안의 '서로 다른 대상' 하나씩 (예: "직업 자동차 10개" → 소방차, 경찰차, 구급차, 우편차…).
- caption은 그 대상의 짧은 이름 1~3단어만 (예: "소방차"). 요청 문장이나 "개념 N" 같은 표현을 캡션에 쓰지 마라.
- prompt는 그 대상 '하나'를 그릴 구체적 묘사 1문장.
JSON만:\n{ "items": [ { "caption": string, "prompt": string } ] } — items는 정확히 ${n}개.`,
      },
    ],
    meta: { kind: 'image_captions', title: request, selected, count: n },
    maxTokens: 200 + n * 130,
  });

  let specs: StudioImageSpec[] = [];
  if (capRes.ok && capRes.text) {
    try {
      specs = (extractJson(capRes.text) as { items?: Array<{ caption: string; prompt?: string }> }).items?.map(
        (it) => ({ caption: it.caption, prompt: it.prompt ?? it.caption }),
      ) ?? [];
    } catch {
      specs = [];
    }
  }
  if (specs.length === 0) {
    // 캡션 LLM 실패 폴백 — 요청 문장 대신 '주제'의 짧은 이름으로 n개.
    specs = Array.from({ length: n }, (_, i) => ({
      caption: n > 1 ? `${subject} ${i + 1}` : subject,
      prompt: `${subject}${n > 1 ? ` — 서로 다른 모습 ${i + 1}` : ''}`,
    }));
  }
  return { specs: specs.slice(0, n), style, title: subject };
}

/** 스펙 1건 → 이미지 1장(게이트웨이 image 플러그인). */
export async function renderStudioImage(
  spec: StudioImageSpec,
  style: string,
): Promise<{ url?: string; mocked?: boolean }> {
  const img = await callGateway({
    task: 'image',
    provider: 'auto',
    messages: [],
    meta: { prompt: `${spec.prompt} — ${style}`, caption: spec.caption },
  });
  return { url: img.image, mocked: !!img.mocked };
}

/* 이미지/도안 → StudioGallery (일괄 API — 레인/러너/소식지 등 기존 호출부용).
   보드 컴포저는 planStudioImages+renderStudioImage로 카드를 먼저 깔고 채운다. */
export async function runStudioImages(
  request: string,
  selected: string[],
  ctx?: string,
  kind: 'image' | '도안' = 'image',
  opts?: { simple?: boolean; count?: number },
): Promise<StudioResult> {
  const plan = await planStudioImages(request, selected, ctx, kind, opts);
  const results = await Promise.all(plan.specs.map((s) => renderStudioImage(s, plan.style)));
  const items: StudioItem[] = results.map((img, i) => ({ caption: plan.specs[i].caption, kind, url: img.url }));
  return {
    payload: { type: 'StudioGallery', props: { title: plan.title, items } },
    mocked: results.some((r) => !!r.mocked),
  };
}
