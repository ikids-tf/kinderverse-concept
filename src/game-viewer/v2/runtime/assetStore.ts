/**
 * assetStore.ts — 생성 이미지 캐시 + 비동기 시드→스왑 오케스트레이션.
 * ------------------------------------------------------------------
 * 규칙(PRD): 생성은 크리티컬 패스 금지 — 이모지 시드로 즉시 플레이, 완료되면 조용히 스왑.
 * 같은 키(아이템 라벨)는 재생성 0(세션 캐시). 키 없으면 게이트웨이가 플레이스홀더를 준다.
 */
import { create } from "zustand";
import { createImageProvider } from "../providers/providers";
import { CATEGORIES } from "../resolver/contentSets";
import type { ContentBinding, InteractiveDoc } from "../schema/interactiveDoc";
import { useGen } from "./genProgress";
import { findGalleryImage } from "../generate/gallery";
import { saveAsset } from "@/board/assets";

const LABELS = new Set(CATEGORIES.flatMap((c) => c.items.map((it) => it.label)));
const provider = createImageProvider();
// 🔴 자동 배경 제거(누끼) 미적용 — 게임 이미지는 생성된 배경을 그대로 둔다(사용자 지시).
//    배경 제거가 필요하면 교사가 이미지 편집(호버 버튼)에서 직접 한다.

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
    const step = (m: string) => useGen.getState().pushStep(m);

    void (async () => {
      const mode = useGen.getState().sourceMode;
      try {
        // 1) 보관함 우선 — 'generate'(모두 생성)가 아니면 갤러리에서 먼저 찾는다.
        if (mode !== "generate") {
          step(`‘${key}’ 보관함에서 찾는 중…`);
          const hit = await findGalleryImage(key);
          if (hit) {
            step(`‘${key}’ 보관함에서 가져왔어요`);
            put({ status: "ready", url: hit });
            return; // 생성 0
          }
          if (mode === "gallery") {
            // 모두 보관함: 없는 요소는 이모지 시드 유지(생성 안 함).
            step(`‘${key}’은 보관함에 없어 그대로 둬요`);
            put({ status: "error" });
            return;
          }
        }
        // 2) 생성(모두 생성 또는 보관함 우선의 미스분) → 그대로 보관함 저장(누끼 미적용).
        step(`‘${key}’ 새로 그리는 중…`);
        const imgs = await provider.generate(prompt);
        const raw = imgs[0]?.url;
        if (!raw) {
          put({ status: "error" });
          return;
        }
        put({ status: "ready", url: raw }); // 이모지 시드 → 생성 이미지(배경 그대로 유지)
        void saveAsset(`${key} (생성)`, "image", raw, key); // 다음엔 보관함에서 재사용(배경 유지본)
      } catch {
        put({ status: "error" });
      }
    })();
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
