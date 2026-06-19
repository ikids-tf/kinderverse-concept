/**
 * orchestrator.ts — 프롬프트(+드래그 시드) → 게임 생성의 한 흐름. 진행을 단계별로 스트리밍한다.
 * ------------------------------------------------------------------
 * 1) 의도 파악(recommendFromPromptAI) → 2) useImages 문서 조립 → loadDoc+start(이모지 시드 즉시 플레이)
 * 3) 요소 그림을 보관함 우선/생성+누끼로 채움(assetStore가 출처 정책대로 처리, 각 단계 pushStep)
 * 끌어온 시드 이미지는 앞쪽 요소에 그대로 넣어 교사 그림이 게임에 등장한다.
 */
import { recommendFromPromptAI, type Knobs } from "../resolver/resolver";
import type { ContentBindingInput, InteractiveDocInput } from "../schema/interactiveDoc";
import { useGame } from "../runtime/useGame";
import { useGen } from "../runtime/genProgress";
import { useAssetStore } from "../runtime/assetStore";
import { setImageStyle } from "../providers/nanoBanana";
import { buildEmotionGameFromImages, canBuildEmotionGame } from "./emotionFromImages";

/** 프롬프트가 '이미지로 만들어 달라'는 요청인지 — 기본은 이모지(생성 0), 요청 시에만 이미지 생성. */
function wantsImages(text: string): boolean {
  return /이미지|그림|사진|일러스트|삽화|캐릭터|그려|실사|픽사|3d/i.test(text);
}

/** 프롬프트가 '감정/마음 알기' 게임을 가리키는지 — 시드 사진을 표정 분석해 마음알기 게임으로. */
function wantsEmotionGame(text: string): boolean {
  return /감정|기분|표정|마음|정서|느낌|emotion|feeling/i.test(text);
}

/** 프롬프트의 화풍 요청 감지 — 없으면 null(기본 = 귀여운 3D 픽사). 요청 시 그 스타일로 생성. */
function detectStyle(text: string): string | null {
  if (/수채화|워터\s*컬러|watercolor/i.test(text)) return "부드러운 수채화 일러스트";
  if (/실사|포토|리얼|사실적|photo|real/i.test(text)) return "사실적인 실사 사진풍, 자연스러운 조명과 디테일";
  if (/플랫|벡터|아이콘|flat|vector/i.test(text)) return "심플한 플랫 벡터 일러스트, 면 위주, 그림자 최소";
  if (/(만화|카툰|cartoon|2d)/i.test(text) && !/(픽사|3d|입체)/i.test(text)) return "납작한 2D 카툰 일러스트, 두꺼운 외곽선";
  if (/파스텔|그림책|크레용|손그림|동화|수묵/i.test(text)) return "포근한 파스텔 그림책 손그림 일러스트";
  return null; // 기본 = 귀여운 3D 픽사
}

/** input에서 생성/소싱 대상 asset 라벨 수집 — assetStore.request 키와 동일 규칙. */
function inputLabels(input: InteractiveDocInput): string[] {
  const set = new Set<string>();
  const scan = (c: ContentBindingInput) => {
    if (c.type === "asset") set.add(c.asset.assetId);
  };
  const it = input.interaction;
  if (it.kind === "tap-the-right-one") it.rounds.forEach((r) => { scan(r.cue); r.options.forEach((o) => scan(o.content)); });
  else if (it.kind === "match-pair") it.rounds.forEach((r) => r.pairs.forEach((p) => { scan(p.left); scan(p.right); }));
  else if (it.kind === "connect") it.rounds.forEach((r) => r.links.forEach((l) => { scan(l.left); scan(l.right); }));
  else if (it.kind === "binary-choice") it.rounds.forEach((r) => scan(r.prompt));
  else if (it.kind === "flip-memory") it.rounds.forEach((r) => r.faces.forEach(scan));
  return [...set];
}

/** 라벨들의 asset이 모두 정착(ready/error)될 때까지 대기 — 스트리밍 종료 시점. */
function waitForSettle(labels: string[], timeoutMs = 90000): Promise<void> {
  if (!labels.length) return Promise.resolve();
  const settled = (map: Record<string, { status: string }>) =>
    labels.every((k) => map[k] && map[k].status !== "pending");
  if (settled(useAssetStore.getState().map)) return Promise.resolve();
  return new Promise((resolve) => {
    const unsub = useAssetStore.subscribe((s) => {
      if (settled(s.map)) {
        unsub();
        resolve();
      }
    });
    setTimeout(() => {
      unsub();
      resolve();
    }, timeoutMs);
  });
}

export interface GenerateOpts {
  seedImages?: string[];
  knobs?: Knobs;
}

/** 프롬프트(+시드)로 게임을 만든다. 진행은 useGen 채널로 스트리밍(프롬프트바·환영화면 구독). */
export async function generateGame(prompt: string, opts: GenerateOpts = {}): Promise<void> {
  const gen = useGen.getState();
  if (gen.active) return;
  const text = (prompt || "").trim();
  const seeds = opts.seedImages ?? [];
  if (!text && !seeds.length) return;

  gen.begin();
  try {
    gen.pushStep("주제를 살펴보고 있어요…");
    const knobs = opts.knobs ?? useGen.getState().knobs; // 설정 메뉴 노브 반영

    // 보드에서 고른 사진 + '감정/마음 알기' 요청 → 각 사진의 표정을 분석해 마음알기(감정 맞추기)
    // 게임으로 조립한다(고른 사진이 곧 단서, 정답 = 분석 감정). 결정론 리졸버 경로보다 우선.
    if (seeds.length && wantsEmotionGame(text) && canBuildEmotionGame(seeds)) {
      gen.pushStep("고른 사진의 표정을 살펴보고 있어요…");
      const input = await buildEmotionGameFromImages(seeds, knobs);
      useGame.getState().loadDoc(input);
      useGame.getState().start();
      gen.pushStep("마음 알기 게임을 완성했어요! 🎉");
      return;
    }

    // 기본은 이모지(생성 0) — 프롬프트가 '이미지로' 요청하거나 시드 그림이 있을 때만 이미지 생성.
    const useImages = wantsImages(text) || seeds.length > 0;
    setImageStyle(useImages ? detectStyle(text) : null); // 화풍: 요청 없으면 기본(귀여운 3D 픽사)
    const cards = await recommendFromPromptAI(text || "동물", { useImages, knobs });
    const top = cards[0];
    if (!top) {
      gen.pushStep("음… 무엇을 만들지 다시 알려주세요");
      return;
    }
    gen.pushStep(`‘${top.title}’ 만드는 중…`);
    const { input } = top.build();
    const labels = inputLabels(input);

    // 끌어온 시드 이미지를 앞쪽 요소에 미리 박는다(primeImages가 이 라벨은 건너뜀 → 교사 그림이 게임에 등장).
    if (seeds.length) {
      useAssetStore.setState((s) => {
        const map = { ...s.map };
        seeds.slice(0, labels.length).forEach((url, i) => {
          map[labels[i]] = { status: "ready", url };
        });
        return { map };
      });
      gen.pushStep("끌어온 그림을 게임에 넣었어요");
    }

    useGame.getState().loadDoc(input); // 이모지 시드로 즉시 플레이 + 요소 소싱 시작(출처 정책대로)
    useGame.getState().start();

    await waitForSettle(labels);
    gen.pushStep("완성했어요! 🎉");
  } catch {
    gen.pushStep("앗, 만들다가 문제가 생겼어요");
  } finally {
    gen.end();
    gen.clearSeeds();
  }
}
