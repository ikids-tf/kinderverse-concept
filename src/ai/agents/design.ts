import { callGateway } from '../client';
import { extractJson } from '../json';
import type { RouteTarget } from '../contract';
import { validateDesignSpec, ruleBasedSpec, type DesignSpec } from '@/board/design-spec';

/* Design Director (hybrid, P2). A fast/low-tier model reads a composed frame's
   contents + the teacher's intent and decides how to make it look good:
     - arrange: a layout variant
     - decorate: a theme-appropriate sticker palette, and (optionally) which ONE
       document deserves a cover illustration.
   It does NOT generate content or HTML — only a validated DesignSpec (the charter
   "AUI = 레지스트리 선택 + 파라미터" applied to design). Rule-based spec is the
   fallback whenever the call fails or returns junk. */

export interface DesignDirectorInput {
  topic: string;
  routeTo: RouteTarget | null;
  /** The cards already produced in the frame (role + a short title). */
  components: Array<{ role: string; title: string }>;
  /** Free-form teacher command to adjust the design (P4), e.g. "사진 크게", "겨울 느낌으로". */
  instruction?: string;
}

const SYSTEM = [
  '너는 킨더버스 "디자인 디렉터"다. 보드 프레임의 자료(문서·이미지·메모)를 보고, 한국 유아 교실 톤으로 예쁘고 의도에 맞게 보이도록 배치와 꾸미기를 정한다. 콘텐츠나 HTML은 만들지 않는다. JSON만 출력한다.',
  '- variant: "default"(문서 중심 다단), "gallery-first"(이미지가 주인공), "hero-doc"(문서 하나를 크게) 중 하나.',
  '- stickers: 이 주제·분위기에 어울리는 이모지 3~6개. 예) 겨울 눈→["❄️","⛄","☃️"], 감정 표현→["😊","💛","🌈"], 공룡→["🦕","🦖"].',
  '- coverRole: 표지 일러스트를 넣으면 더 예쁠 "문서 1개"의 역할명(plan/letter/record/worksheet/newsletter). 적합한 문서가 없거나 이미지가 이미 주인공이면 생략한다.',
].join('\n');

export async function runDesignDirector(input: DesignDirectorInput): Promise<DesignSpec> {
  const fallback = ruleBasedSpec(input.routeTo);
  const comp = input.components.map((c) => `- ${c.role}: ${c.title}`).join('\n') || '(아직 없음)';
  const cmd = input.instruction?.trim() ? `\n교사 요청(이 요청을 우선 반영해 조정): "${input.instruction.trim()}"` : '';
  const user = `주제: "${input.topic}"\n의도(route): ${input.routeTo ?? 'general'}\n프레임 자료:\n${comp}${cmd}\n\nJSON만 출력: { "variant": string, "stickers": string[], "coverRole"?: string }`;

  try {
    const res = await callGateway({
      task: 'design',
      tier: 'low',
      provider: 'auto',
      responseFormat: 'json',
      fallback: ['mid'],
      system: SYSTEM,
      messages: [{ role: 'user', content: user }],
      maxTokens: 400,
    });
    if (!res.ok || !res.text) return fallback;
    return validateDesignSpec(extractJson(res.text)) ?? fallback;
  } catch {
    return fallback;
  }
}
