/**
 * segmentAdapter.ts — ObjectSegmenter 를 레포 공용 클릭-분할(SAM) 엔진으로 라우팅.
 * ------------------------------------------------------------------
 * 🔴 엔진 = @/shared/segment (SlimSAM/SAM, transformers.js worker). cutoutAdapter 와 동형.
 * 온디바이스(서버 전송 0)라 child-photo 포함 모든 소재 안전. prepare(임베딩 1회)는 무겁고,
 * 같은 이미지의 반복 클릭은 캐시된 임베딩으로 segmentAt 만 호출한다(크리티컬 패스 금지).
 * 마스크(Uint8Array 1=객체)는 흰=객체·투명=배경 PNG data URL 로 변환해 돌려준다(편집기가 알파로 적용).
 */
import { prepareSegment, segmentAt } from "@/shared/segment/segment";
import type { ObjectSegmenter, SegmentResult } from "./providers";

let counter = 0;
const preparedBlob = new WeakMap<Blob, string>(); // 같은 Blob → 재임베딩 0

async function toBlob(input: Blob | string): Promise<Blob> {
  if (typeof input !== "string") return input;
  const res = await fetch(input); // data: URL 또는 http(s) 모두 fetch 가능
  return res.blob();
}

/** Uint8Array(1=객체) 마스크 → 흰=객체·투명=배경 PNG data URL. */
function maskToPngUrl(mask: Uint8Array, w: number, h: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d 컨텍스트를 만들 수 없습니다.");
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < mask.length; i++) {
    const p = i * 4;
    img.data[p] = 255;
    img.data[p + 1] = 255;
    img.data[p + 2] = 255;
    img.data[p + 3] = mask[i] ? 255 : 0; // 객체=불투명 흰색, 배경=투명
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL("image/png");
}

export class SamObjectSegmenter implements ObjectSegmenter {
  async segment(
    input: Blob | string,
    clickPoint: { x: number; y: number },
  ): Promise<SegmentResult> {
    const blob = await toBlob(input);
    let id = typeof input !== "string" ? preparedBlob.get(blob) : undefined;
    if (!id) {
      id = `seg_${++counter}`;
      await prepareSegment(id, blob); // 임베딩 1회(무거움)
      if (typeof input !== "string") preparedBlob.set(blob, id);
    }
    const { mask, w, h } = await segmentAt(id, clickPoint.x, clickPoint.y);
    return { maskUrl: maskToPngUrl(mask, w, h) };
  }
}
