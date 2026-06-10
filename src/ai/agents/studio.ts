import { callGateway } from '../client';
import { extractJson } from '../json';
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
export const KV_ART_STYLE = '밝고 따뜻한 유아 그림책 일러스트 스타일, 부드러운 파스텔 색감, 둥근 형태, 단순하고 깔끔한 배경';
export const KV_COLORING_STYLE = '유아용 흑백 색칠 도안, 굵고 선명한 윤곽선, 색과 음영 없음, 깨끗한 흰 배경';

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
  const user = `활동지 설계 요청.\n- 주제: "${reco.topic}"\n- 활동 유형: "${reco.type}"\n- 대상 연령: ${reco.age_band === '0-2' ? '0~2세(영아)' : '3~5세(유아)'}\n위 유형·연령에 맞는 A4 활동지의 교육 내용을 작성하라. 무근거 난이도 상향 금지. JSON만 출력:\n{ "type": "WorksheetCard", "props": { "title": string, "age_band": "${reco.age_band}", "curriculum": "standard"|"nuri", "objective": string, "materials": string[], "steps": string[], "domains": string[] } }`;

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

/* 이미지/도안 → StudioGallery. 캡션 생성 후 image 플러그인으로 렌더 가능한 이미지 확보. */
export async function runStudioImages(
  request: string,
  selected: string[],
  ctx?: string,
  kind: 'image' | '도안' = 'image',
  opts?: { simple?: boolean; count?: number },
): Promise<StudioResult> {
  const style = kind === '도안' ? KV_COLORING_STYLE : KV_ART_STYLE;

  // Simple mode ("사자 그려줘") — just ONE clean drawing of the subject, with the
  // subject as the caption. No activity framing, no extra explanation.
  if (opts?.simple) {
    const subject =
      request
        .replace(/(을|를|좀|한\s*장|하나)?\s*(그려\s*주세요|그려\s*줘|그려|그림\s*그려|그림|그리기|만들어\s*주세요|만들어\s*줘|만들어|해\s*줘)\s*$/u, '')
        .trim() || request;
    const img = await callGateway({
      task: 'image',
      provider: 'auto',
      messages: [],
      meta: { prompt: `${subject} — ${style}`, caption: subject },
    });
    return {
      payload: { type: 'StudioGallery', props: { title: subject, items: [{ caption: subject, kind, url: img.image }] } },
      mocked: !!img.mocked,
    };
  }

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
        content: `요청: "${request}"\n${sel}\n${kind === '도안' ? '색칠 도안' : '개념 일러스트'} 3개의 캡션과 이미지 프롬프트를 제안하라(실제 아동 사진 아님). JSON만:\n{ "items": [ { "caption": string, "prompt": string } ] }`,
      },
    ],
    meta: { kind: 'image_captions', title: request, selected },
    maxTokens: 600,
  });

  let specs: Array<{ caption: string; prompt: string }> = [];
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
    specs = [
      { caption: `${request} — 개념 1`, prompt: request },
      { caption: `${request} — 개념 2`, prompt: request },
    ];
  }
  specs = specs.slice(0, 3);

  // Generate (or placeholder) one image per caption via the image plugin.
  const items: StudioItem[] = [];
  let anyMock = false;
  for (const s of specs) {
    const img = await callGateway({
      task: 'image',
      provider: 'auto',
      messages: [],
      meta: { prompt: `${s.prompt} — ${style}`, caption: s.caption },
    });
    anyMock = anyMock || !!img.mocked;
    items.push({ caption: s.caption, kind, url: img.image });
  }

  return {
    payload: { type: 'StudioGallery', props: { title: request, items } },
    mocked: anyMock,
  };
}
