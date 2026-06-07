import { callGateway } from '../client';
import { extractJson } from '../json';
import { PEDAGOGY_FOUNDATION } from '../pedagogy';
import { validateRegistryPayload, type RegistryPayload, type StudioItem } from '@/ui-registry/contracts';

/* Tier1 스튜디오 에이전트 (agent.studio). 활동지/워크시트 + 이미지/도안.
   활동지 두 경로: (A) 계획 연결(link_plan_id) (B) 독립 (SKILL §4.1). 이미지는
   게이트웨이 image 플러그인 사용(실연동 or 라벨 플레이스홀더, §9.5). */

function system(ctx?: string): string {
  const l0 = '너는 킨더버스 Tier1 스튜디오 에이전트다. 활동지/도안/이미지 프롬프트를 설계한다. 적합성은 Pedagogy Foundation이 보장한다.';
  const l3 = ctx?.trim() ? `[테넌트/교사 컨텍스트 — 우리반]\n${ctx.trim()}\n아동명 마스킹. 사실을 지어내지 마라.` : '';
  return [l0, PEDAGOGY_FOUNDATION, l3].filter(Boolean).join('\n\n');
}

export interface StudioResult {
  payload: RegistryPayload;
  mocked?: boolean;
  warning?: string;
}

function clarify(question: string): RegistryPayload {
  return { type: 'ClarifyPrompt', props: { question } };
}

/* 활동지/워크시트 → WorksheetCard. linkPlanId가 있으면 계획에 연결. */
export async function runStudioWorksheet(
  request: string,
  ctx?: string,
  linkPlanId?: string,
): Promise<StudioResult> {
  const user = `요청: "${request}"\n위 활동의 A4 활동지를 작성하라. JSON만 출력:\n{ "type": "WorksheetCard", "props": { "title": string, "age_band": "0-2"|"3-5", "curriculum": "standard"|"nuri", "objective": string, "materials": string[], "steps": string[], "domains": string[] } }`;

  const first = await callGateway({
    task: 'studio',
    tier: 'mid',
    provider: 'auto',
    responseFormat: 'json',
    fallback: ['high'],
    system: system(ctx),
    messages: [{ role: 'user', content: user }],
    meta: { kind: 'worksheet', title: request, selected: linkPlanId ? [linkPlanId] : [] },
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
  if (!result.ok || !result.value) {
    return { payload: clarify('활동지를 만들 정보가 부족해요.'), mocked: first.mocked };
  }
  if (result.value.type === 'WorksheetCard' && linkPlanId) {
    result.value.props.link_plan_id = linkPlanId;
  }
  return { payload: result.value, mocked: first.mocked };
}

/* 이미지/도안 → StudioGallery. 캡션 생성 후 image 플러그인으로 렌더 가능한 이미지 확보. */
export async function runStudioImages(
  request: string,
  selected: string[],
  ctx?: string,
  kind: 'image' | '도안' = 'image',
): Promise<StudioResult> {
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
      meta: { prompt: s.prompt, caption: s.caption },
    });
    anyMock = anyMock || !!img.mocked;
    items.push({ caption: s.caption, kind, url: img.image });
  }

  return {
    payload: { type: 'StudioGallery', props: { title: request, items } },
    mocked: anyMock,
  };
}
