/**
 * gallery.ts — 보관함(갤러리) 우선 소싱. 게임 요소(라벨)에 맞는 이미지가 보관함에 있으면
 * 생성하지 않고 가져다 쓴다. 보관함은 앱 전역 IndexedDB(@/board/assets) — 동일 오리진이라
 * 게임뷰어 iframe에서도 같은 데이터에 접근한다.
 */
import { searchAssets } from "@/board/assets";

/** 라벨(예: "사자")로 보관함에서 가장 잘 맞는 이미지 url을 찾는다. 없으면 null.
    🔴 배경 제거(누끼) 자산은 게임 단서로 쓰지 않는다 — 배경 유지본(전체)만 사용(사용자 지시).
    누끼본만 있으면 null을 반환해 새로 생성(배경 유지)하게 한다. */
export async function findGalleryImage(label: string): Promise<string | null> {
  const q = label.trim();
  if (!q) return null;
  try {
    const hits = await searchAssets(q, ["image", "도안"]);
    const full = hits.filter((a) => !/배경제거|누끼/.test(a.tag));
    if (!full.length) return null;
    return full[0].url || null;
  } catch {
    return null;
  }
}
