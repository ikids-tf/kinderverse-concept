/**
 * assetStore.ts — 생성 이미지 캐시 + 비동기 시드→스왑 오케스트레이션.
 * ------------------------------------------------------------------
 * 규칙(PRD): 생성은 크리티컬 패스 금지 — 이모지 시드로 즉시 플레이, 완료되면 조용히 스왑.
 * 같은 키(아이템 라벨)는 재생성 0(세션 캐시). 키 없으면 게이트웨이가 플레이스홀더를 준다.
 */
import { create } from "zustand";
import { createImageProvider, createCutoutProvider } from "../providers/providers";
import { CATEGORIES } from "../resolver/contentSets";
import type { ContentBinding, InteractiveDoc } from "../schema/interactiveDoc";

const LABELS = new Set(CATEGORIES.flatMap((c) => c.items.map((it) => it.label)));
const provider = createImageProvider();
const cutout = createCutoutProvider(); // 온디바이스 RMBG (생성→누끼)

type Entry = { status: "pending" | "ready" | "error"; url?: string };
interface AssetState {
  map: Record<string, Entry>;
  request: (key: string, prompt: string) => void;
}

export const useAssetStore = create<AssetState>((set, get) => ({
  map: {},
  request: (key, prompt) => {
    const cur = get().map[key];
    if (cur && cur.status !== "error") return; // 캐시/진행중 → 재생성 0
    set((s) => ({ map: { ...s.map, [key]: { status: "pending" } } }));
    const put = (e: Entry) => set((s) => ({ map: { ...s.map, [key]: e } }));
    provider
      .generate(prompt)
      .then(async (imgs) => {
        const raw = imgs[0]?.url;
        if (!raw) {
          put({ status: "error" });
          return;
        }
        put({ status: "ready", url: raw }); // 1차 스왑: 이모지 → 생성 이미지(흰 배경)
        try {
          // 2차: 생성 → 누끼(온디바이스 RMBG) → 투명 컷아웃으로 조용히 교체(카드에 깔끔히).
          const cut = await cutout.cutout(raw);
          put({ status: "ready", url: cut.url });
        } catch {
          /* 누끼 실패 시 생성 원본 유지 */
        }
      })
      .catch(() => put({ status: "error" }));
  },
}));

/** 컴포넌트용 — key의 생성 이미지 url(ready일 때만). 상태 변화 시 자동 리렌더(스왑). */
export function useAssetUrl(key: string | undefined): string | undefined {
  return useAssetStore((s) => (key && s.map[key]?.status === "ready" ? s.map[key].url : undefined));
}

/** 문서의 asset 콘텐츠 중 '알려진 라벨'만 모아 비동기 생성 요청(시드는 이모지로 즉시 플레이 중). */
export function primeImages(doc: InteractiveDoc): void {
  const keys = new Set<string>();
  const scan = (c: ContentBinding) => {
    if (c.type === "asset" && LABELS.has(c.asset.assetId)) keys.add(c.asset.assetId);
  };
  const it = doc.interaction;
  if (it.kind === "tap-the-right-one") it.rounds.forEach((r) => { scan(r.cue); r.options.forEach((o) => scan(o.content)); });
  else if (it.kind === "match-pair") it.rounds.forEach((r) => r.pairs.forEach((p) => { scan(p.left); scan(p.right); }));
  else if (it.kind === "connect") it.rounds.forEach((r) => r.links.forEach((l) => { scan(l.left); scan(l.right); }));
  else if (it.kind === "binary-choice") it.rounds.forEach((r) => scan(r.prompt));
  else if (it.kind === "flip-memory") it.rounds.forEach((r) => r.faces.forEach(scan));

  const req = useAssetStore.getState().request;
  keys.forEach((k) => req(k, k)); // prompt = 라벨(예: "사자") → nanoBanana가 스타일락 부착
}
