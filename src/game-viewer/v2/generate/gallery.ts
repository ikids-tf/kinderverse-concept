/**
 * gallery.ts — 보관함(갤러리) 우선 소싱. 게임 요소(라벨)에 맞는 이미지가 보관함에 있으면
 * 생성하지 않고 가져다 쓴다. 보관함은 앱 전역 IndexedDB(@/board/assets) — 동일 오리진이라
 * 게임뷰어 iframe에서도 같은 데이터에 접근한다.
 */
import { searchAssets } from "@/board/assets";

/** 라벨(예: "사자")로 보관함에서 가장 잘 맞는 이미지 url을 찾는다. 없으면 null.
    배경제거(누끼)된 자산을 우선("(배경제거)" 태그) — 게임 카드에 깔끔하게 얹힌다. */
export async function findGalleryImage(label: string): Promise<string | null> {
  const q = label.trim();
  if (!q) return null;
  try {
    const hits = await searchAssets(q, ["image", "도안"]);
    if (!hits.length) return null;
    const cut = hits.find((a) => /배경제거|누끼/.test(a.tag));
    return (cut ?? hits[0]).url || null;
  } catch {
    return null;
  }
}
