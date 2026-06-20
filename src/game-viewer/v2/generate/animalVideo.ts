/**
 * animalVideo.ts — 확장활동 '동물 영상' 생성·캐시(게임뷰어 전용, 보드 스토어 비의존).
 * ------------------------------------------------------------------
 * 게임에 나온 동물(라벨)의 '생성 이미지'를 첫 프레임으로 Gemini Veo 이미지→영상을 만든다
 * (그 동물 그대로 자연스럽게 움직이는 짧은 루프). 🔴 Veo는 고비용·수 분 비동기라 절대
 * 자동 실행하지 않는다 — 교사가 카드에서 '영상 만들기'를 누를 때만(온디맨드), 결과는
 * 세션 캐시(같은 동물 재생성 0). 게이트웨이 계약은 보드 영상(src/board/video.ts)과 동일.
 */
import { create } from "zustand";
import { buildVeoImagePrompt, buildVeoPrompt, KV_VIDEO_NEGATIVE } from "@/ai/agents/studio";

const POLL_INTERVAL = 4000;
const MAX_POLLS = 90; // ~6분(Veo 11초~6분)

type Status = "idle" | "pending" | "ready" | "error";
interface VEntry {
  status: Status;
  url?: string; // mp4 data URI
  step?: string; // 진행 안내(경과 초 등)
}
interface StartResp { ok: boolean; op?: string; mocked?: boolean; error?: string }
interface PollResp { ok: boolean; done: boolean; video?: string; mocked?: boolean; error?: string; filtered?: boolean }

interface VideoState {
  map: Record<string, VEntry>;
  generate: (label: string, seedImageUrl?: string) => void;
}

const inFlight = new Set<string>();
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const useVideoStore = create<VideoState>((set, get) => ({
  map: {},
  generate: (label, seedImageUrl) => {
    const cur = get().map[label];
    if (cur && (cur.status === "pending" || cur.status === "ready")) return; // 캐시/진행중 → 재생성 0
    if (inFlight.has(label)) return;
    inFlight.add(label);
    const put = (e: VEntry) => set((s) => ({ map: { ...s.map, [label]: e } }));
    put({ status: "pending", step: "영상을 만들고 있어요…" });

    void (async () => {
      try {
        // 이미지가 있으면 그 동물 그대로 '움직임만'(이미지→영상), 없으면 라벨로 텍스트→영상.
        const basePrompt = seedImageUrl ? await buildVeoImagePrompt("") : await buildVeoPrompt(label);
        // 안전 필터(확률적) — filtered면 사람 배제를 한 번 더 강조해 1회 재시도.
        const MAX_ATTEMPTS = 2;
        let video: string | null = null;
        let lastErr = "";
        for (let attempt = 1; attempt <= MAX_ATTEMPTS && !video; attempt++) {
          const prompt =
            attempt === 1
              ? basePrompt
              : `${basePrompt} Strictly no people, no children, no human figures or faces — only the animal, objects and nature.`;
          const startRes = (await fetch("/api/ai/video/start", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ prompt, imageDataUri: seedImageUrl, aspectRatio: "16:9", negativePrompt: KV_VIDEO_NEGATIVE }),
          }).then((r) => r.json())) as StartResp;
          if (startRes.mocked) { put({ status: "error", step: "GEMINI_API_KEY가 설정되면 영상이 켜져요" }); inFlight.delete(label); return; }
          if (!startRes.ok || !startRes.op) throw new Error(startRes.error || "시작 실패");
          const op = startRes.op;

          let filtered = false;
          for (let i = 0; i < MAX_POLLS; i++) {
            await sleep(POLL_INTERVAL);
            const pr = (await fetch(`/api/ai/video/poll?op=${encodeURIComponent(op)}`).then((r) => r.json())) as PollResp;
            if (pr.done) {
              if (pr.mocked) { put({ status: "error", step: "GEMINI_API_KEY가 설정되면 영상이 켜져요" }); inFlight.delete(label); return; }
              if (pr.filtered) { filtered = true; lastErr = pr.error || ""; break; }
              if (pr.error) throw new Error(pr.error);
              video = pr.video ?? null;
              break;
            }
            const sec = Math.round(((i + 1) * POLL_INTERVAL) / 1000);
            put({ status: "pending", step: `만드는 중… ${sec}초 경과` });
          }
          if (!filtered) break;
        }
        if (!video) throw new Error(lastErr || "시간 내에 끝나지 않았어요");
        put({ status: "ready", url: video });
      } catch (e) {
        put({ status: "error", step: e instanceof Error ? e.message : String(e) });
      } finally {
        inFlight.delete(label);
      }
    })();
  },
}));

/** 컴포넌트용 — 해당 라벨 영상 엔트리(없으면 idle). */
export function useVideoEntry(label: string): VEntry {
  return useVideoStore((s) => s.map[label] ?? { status: "idle" });
}
