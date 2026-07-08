// =============================================================================
// 누끼 캐시 래퍼 — 기존 브라우저 flood-fill(removeBackground) 재사용.
// (gpt-image 가 투명 배경 미지원 → 클라이언트에서 흰/밝은 배경을 투명화)
// =============================================================================
import { removeBackground } from "./removeBackground";

const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

export async function cutout(url: string): Promise<string> {
  if (cache.has(url)) return cache.get(url) as string;
  if (inflight.has(url)) return inflight.get(url) as Promise<string>;
  const p = removeBackground(url, { tolerance: 46 })
    .then((out) => { cache.set(url, out); inflight.delete(url); return out; })
    .catch(() => { inflight.delete(url); return url; });
  inflight.set(url, p);
  return p;
}
