/**
 * llmIntent.ts — 자유 프롬프트 → '제약 메뉴 안의 의도' (실제 LLM, 레포 게이트웨이 재사용).
 * ------------------------------------------------------------------
 * 🔴 새 API 클라이언트를 만들지 않는다 — 기존 얇은 게이트웨이(@/ai/client → /api/ai/run)를 호출.
 *    키는 서버에만(브라우저 노출 0). 키가 없으면 게이트웨이가 mock/실패를 돌려주고, 여기서 null →
 *    호출부가 결정론 parseIntent로 폴백한다(키 없이도 동작, 키 있으면 자유 표현까지 이해).
 * LLM은 '발명'하지 않고 주어진 카테고리/게임유형 중에서 '고르기만' 한다(바운드 생성).
 */
import { callGateway } from "@/ai/client";
import { extractJson } from "@/ai/json";
import { CATEGORIES, SEQUENCES, findSequence, type Category } from "./contentSets";
import type { Archetype, Intent } from "./resolver";

const ARCHETYPES: readonly string[] = [
  "tap-the-right-one", "match-pair", "flip-memory", "binary-choice", "connect",
  "categorize", "pattern-next", "order-sequence",
];

function mapCategory(name: string): Category | null {
  const n = name.trim();
  return CATEGORIES.find((c) => c.key === n.toLowerCase() || c.label === n) ?? null;
}
function mapArchetype(name: string | undefined): Archetype | undefined {
  return name && ARCHETYPES.includes(name) ? (name as Archetype) : undefined;
}

/** 실패/키없음(mock)/미매핑이면 null → 결정론 폴백. 저티어(저가) 1회 호출. */
export async function llmParseIntent(prompt: string): Promise<Intent | null> {
  if (!prompt.trim()) return null;
  const cats = CATEGORIES.map((c) => `${c.key}(${c.label})`).join(", ");
  try {
    const res = await callGateway({
      task: "game-intent",
      tier: "low",
      provider: "auto",
      responseFormat: "json",
      system:
        "너는 유아 교사의 놀이 요청을 정해진 메뉴 안에서 고르는 분류기다. " +
        "주어진 카테고리/게임유형 중에서만 고르고, 애매하면 가장 가까운 것을 고른다. JSON만 출력.",
      messages: [
        {
          role: "user",
          content:
            `요청: "${prompt}"\n` +
            `카테고리(key): ${cats}\n` +
            "게임유형: tap-the-right-one(이름 맞추기) · match-pair(짝 맞추기) · flip-memory(카드 뒤집기) · binary-choice(OX 퀴즈) · connect(관계 잇기) · categorize(분류 담기) · pattern-next(패턴 잇기) · order-sequence(순서 맞추기)\n" +
            'JSON만: { "category": "<key>", "archetype": "<게임유형 또는 빈문자열>" }',
        },
      ],
      maxTokens: 80,
    });
    if (!res.ok || res.mocked || !res.text) return null;
    const obj = extractJson(res.text) as { category?: string; archetype?: string };
    const category = obj.category ? mapCategory(obj.category) : null;
    if (!category) return null;
    const archetype = mapArchetype(obj.archetype);
    // order-sequence면 순서형 콘텐츠도 골라 둔다(없으면 빌드 시 기본값).
    const sequence = archetype === "order-sequence" ? (findSequence(prompt) ?? SEQUENCES[0]) : undefined;
    return { category, archetype, sequence };
  } catch {
    return null;
  }
}
