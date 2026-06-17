/**
 * cutoutAdapter.ts — CutoutProvider 를 레포 공용 온디바이스 누끼 엔진으로 라우팅.
 * ------------------------------------------------------------------
 * 🔴 엔진 = @/shared/background-removal (BiRefNet/RMBG, MIT, transformers.js + worker.ts).
 *    @imgly(AGPL) 절대 추가 금지 — 레포에서 의도적으로 제거됨.
 * 온디바이스(서버 전송 0)라 child-photo 포함 모든 소재 안전. ~수초 → 비동기, 크리티컬 패스 금지.
 * worker는 첫 호출 때 lazy 생성되므로 이 모듈 import 자체는 가볍다(transformers는 워커에서만 로드).
 */
import { removeBackground } from "@/shared/background-removal";
import type { CutoutProvider, CutoutResult } from "./providers";

export class RmbgCutoutProvider implements CutoutProvider {
  async cutout(input: Blob | string, opts?: { signal?: AbortSignal }): Promise<CutoutResult> {
    const r = await removeBackground(input, { assetKind: "unknown", signal: opts?.signal });
    return { url: r.dataUrl };
  }
}
