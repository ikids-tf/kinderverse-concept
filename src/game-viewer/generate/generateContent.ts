/**
 * generateContent.ts — 프롬프트 → '임의 소재' 게임 콘텐츠 생성 (안전한 emoji 경로).
 * ------------------------------------------------------------------
 * LLM(전문 에이전트)이 게임 아이템을 '표준 유니코드 emoji'로 생성하고, emoji→OpenMoji ref로
 * 렌더한다. 큐레이션 셋에 없는 "건물↔직업" 같은 임의 요청도 게임으로 만든다.
 *
 * 🔴 안전: 임의 이미지 생성 ❌. 유한·아동적합한 유니코드 emoji 집합만(OpenMoji가 그림 제공).
 *    LLM은 '어떤 emoji를 쓸지'만 고르고, 그림 자체는 큐레이션된 OpenMoji 아트다.
 * 실패/무키/형식오류 → null 반환 → 호출부가 큐레이션(buildSpecFromForm)으로 폴백.
 * emotion 은 고정 표정이라 여기서 다루지 않는다(큐레이션 빌더 사용).
 */
import { emojiToRef } from "../assets/openmoji";
import {
  type AgeRange,
  type CountingGame,
  type CountingRound,
  type GameSpec,
  type Instruction,
  type MatchingGame,
  type MatchingRound,
  type OpenmojiAsset,
  type Rewards,
  type SilhouetteGame,
  type SilhouetteRound,
} from "../schema/gameSpec";

export type GenTemplate = "counting" | "silhouette" | "matching";

interface Item {
  label: string;
  emoji: string;
}
interface RawContent {
  templateId?: unknown;
  title?: unknown;
  ageRange?: unknown;
  items?: unknown;
  rounds?: unknown;
  relation?: unknown;
  pairs?: unknown;
}

const MEANING: Record<GenTemplate, string> = {
  counting: "개수 세기",
  silhouette: "검은 실루엣 맞추기",
  matching: "어울리는 것 줄로 잇기",
};

function systemPrompt(prefer?: GenTemplate): string {
  const lines = [
    "너는 유아(3~7세) 놀이 콘텐츠 생성기다. 교사 요청에 맞는 게임 아이템을 '표준 유니코드 emoji'로 만든다.",
    "단순하고 흔한 emoji를 쓴다. 설명·코드펜스 없이 JSON 한 개만 출력한다.",
    '형식: {"templateId":"counting|silhouette|matching","title":"<짧은 한국어 제목>","ageRange":"3-5|5-7", ...템플릿별 필드}',
    '- counting → "items":[{"label":"사자","emoji":"🦁"}] (4~6개).',
    '- silhouette → "rounds":[{"answer":{"label":"","emoji":""},"distractors":[{"label":"","emoji":""}]}] (3~5라운드, distractors 2~3개). 윤곽 또렷한 사물/동물/탈것만.',
    '- matching → "relation":"<관계 이름>","pairs":[{"left":{"label":"병원","emoji":"🏥"},"right":{"label":"의사","emoji":"👨‍⚕️"}}] (3~5쌍).',
    "- 해당 템플릿 필드만 채운다. 모든 label은 한국어, emoji는 각 항목 1개.",
  ];
  if (prefer) lines.push(`- 교사가 '${MEANING[prefer]}' 놀이를 골랐다. 특별한 단서가 없으면 templateId는 '${prefer}'로 한다.`);
  return lines.join("\n");
}

const isItem = (x: unknown): x is Item =>
  typeof x === "object" &&
  x !== null &&
  typeof (x as Item).label === "string" &&
  typeof (x as Item).emoji === "string" &&
  (x as Item).emoji.length > 0;

const omoji = (it: Item, id: string): OpenmojiAsset => ({
  id,
  source: "openmoji",
  ref: emojiToRef(it.emoji),
  label: it.label.slice(0, 20),
  alt: it.label.slice(0, 20),
});

const shuffle = <T>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const dedupe = (assets: OpenmojiAsset[]): OpenmojiAsset[] => {
  const m = new Map<string, OpenmojiAsset>();
  for (const a of assets) if (!m.has(a.id)) m.set(a.id, a);
  return [...m.values()];
};
function countOptions(count: number, k: number): number[] {
  const set = new Set<number>([count]);
  let d = 1;
  while (set.size < k && d < 40) {
    for (const c of [count - d, count + d]) if (c >= 1 && set.size < k) set.add(c);
    d++;
  }
  return shuffle([...set]);
}
const extractJson = (t: string): string => t.match(/\{[\s\S]*\}/)?.[0] ?? t;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

const defaultRewards: Rewards = { effects: ["confetti", "stars"], voicePraise: "잘했어요!" };
const INSTRUCTION: Record<GenTemplate, Instruction> = {
  counting: { text: "그림이 몇 개인지 세어 볼까요?" },
  silhouette: { text: "그림자를 보고 무엇인지 맞춰 볼까요?" },
  matching: { text: "어울리는 것끼리 줄로 이어 볼까요?" },
};

/** 프롬프트 → 임의 소재 GameSpec(emoji→OpenMoji). 실패 시 null. */
export async function generateContentLLM(prompt: string, prefer?: GenTemplate): Promise<GameSpec | null> {
  const text = prompt.trim();
  if (!text) return null;
  let raw: RawContent;
  try {
    const res = await fetch("/api/ai/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        task: "agent",
        tier: "mid",
        provider: "auto",
        responseFormat: "json",
        system: systemPrompt(prefer),
        messages: [{ role: "user", content: text }],
        maxTokens: 700,
      }),
    });
    const data = (await res.json()) as { ok?: boolean; text?: string };
    if (!data?.ok || typeof data.text !== "string") return null;
    raw = JSON.parse(extractJson(data.text)) as RawContent;
  } catch {
    return null;
  }

  const tidRaw = typeof raw.templateId === "string" ? raw.templateId : prefer;
  const tid = (["counting", "silhouette", "matching"] as const).find((t) => t === tidRaw);
  if (!tid) return null;
  const age: AgeRange = raw.ageRange === "5-7" ? "5-7" : "3-5";
  const title = (typeof raw.title === "string" && raw.title.trim().slice(0, 40)) || MEANING[tid];
  const common = {
    schemaVersion: 1 as const,
    id: `gen-${tid}-${Date.now()}`,
    title,
    ageRange: age,
    ttsLocale: "ko-KR" as const,
    rewards: defaultRewards,
    instruction: INSTRUCTION[tid],
  };

  try {
    if (tid === "counting") {
      const items = arr(raw.items).filter(isItem).slice(0, 6);
      if (items.length < 1) return null;
      const assets: OpenmojiAsset[] = [];
      const rounds: CountingRound[] = [];
      items.forEach((it, i) => {
        const id = `c${i}`;
        assets.push(omoji(it, id));
        const max = age === "3-5" ? 5 : 10;
        const count = 1 + Math.floor(Math.random() * max);
        rounds.push({ itemAssetId: id, count, options: countOptions(count, age === "3-5" ? 3 : 4), scatter: "random" });
      });
      const spec: CountingGame = { ...common, templateId: "counting", theme: "animal", assets, rounds };
      return spec;
    }
    if (tid === "silhouette") {
      const assets: OpenmojiAsset[] = [];
      const rounds: SilhouetteRound[] = [];
      let n = 0;
      for (const r of arr(raw.rounds).slice(0, 5)) {
        const ro = r as { answer?: unknown; distractors?: unknown };
        if (!isItem(ro.answer)) continue;
        const ans = omoji(ro.answer, `s${n}a`);
        const ds = arr(ro.distractors).filter(isItem).slice(0, age === "3-5" ? 2 : 3);
        const opts = [ans, ...ds.map((d, j) => omoji(d, `s${n}o${j}`))];
        assets.push(...opts);
        rounds.push({ answerAssetId: ans.id, optionAssetIds: shuffle(opts).map((o) => o.id) });
        n++;
      }
      if (!rounds.length) return null;
      const spec: SilhouetteGame = { ...common, templateId: "silhouette", theme: "animal", assets: dedupe(assets), rounds };
      return spec;
    }
    // matching
    const assets: OpenmojiAsset[] = [];
    const pairs: MatchingRound["pairs"] = [];
    arr(raw.pairs)
      .slice(0, age === "3-5" ? 4 : 5)
      .forEach((p, i) => {
        const po = p as { left?: unknown; right?: unknown };
        if (!isItem(po.left) || !isItem(po.right)) return;
        const l = omoji(po.left, `L${i}`);
        const rr = omoji(po.right, `R${i}`);
        assets.push(l, rr);
        pairs.push({ leftAssetId: l.id, rightAssetId: rr.id });
      });
    if (pairs.length < 2) return null;
    const relation = (typeof raw.relation === "string" && raw.relation.trim().slice(0, 30)) || title;
    const spec: MatchingGame = {
      ...common,
      templateId: "matching",
      theme: "matching",
      assets: dedupe(assets),
      rounds: [{ pairs, relation }],
    };
    return spec;
  } catch {
    return null;
  }
}
