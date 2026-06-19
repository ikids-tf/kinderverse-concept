/**
 * nodeContent.ts — 편집에서 '선택한 요소(슬롯)'에 프롬프트로 만든 그림을 생성해 적용.
 * ------------------------------------------------------------------
 * 배경 생성(background.ts)과 짝 — 그쪽은 stage.background, 이쪽은 선택 노드의 '현재 편집 페이지' 콘텐츠.
 * nanoBanana(아이템 화풍: 단일 오브젝트+흰배경, 기본 귀여운 3D 픽사) 생성 → assetStore에
 * URL 보관 → useGame.setNodeContent(asset 바인딩). 새 API 클라이언트 0(기존 게이트웨이 재사용).
 * ※ 배경 제거(누끼)는 적용하지 않는다 — 생성 이미지의 배경을 그대로 유지(사용자 지시).
 *
 * 🔴 에셋 키는 '생성마다 고유'(genSeq). 슬롯 id는 모든 페이지(라운드)가 공유하므로, 노드 id로만
 *    키를 잡으면 페이지 A에 그림을 넣을 때 같은 슬롯을 쓰는 페이지 B의 그림까지 덮어써진다("다른
 *    동물이 자꾸 나옴"). 매 생성마다 새 키를 만들고 그 페이지의 바인딩만 그 키를 가리키게 한다.
 */
import { createImageProvider } from "../providers/providers";
import { useGame } from "../runtime/useGame";
import { useAssetStore } from "../runtime/assetStore";
import { useGen } from "../runtime/genProgress";

const provider = createImageProvider();
let genSeq = 0; // 생성마다 +1 — 페이지·슬롯 간 에셋 키 충돌 방지(고유 키).

/** 선택 노드에 프롬프트 그림을 생성·적용. 성공 시 true. (편집 모드 + doc 있을 때만) */
export async function setNodeContentFromPrompt(nodeId: string, prompt: string): Promise<boolean> {
  const st = useGame.getState();
  if (!st.doc || st.mode !== "edit") return false;
  const gen = useGen.getState();
  if (gen.active) return false;
  // 제출 시점의 편집 페이지를 고정 — 생성(수 초) 동안 교사가 페이지를 넘겨도 '그때 그 페이지'에 적용된다.
  const roundIdx = st.editRoundIdx;
  const key = `__kv_node_${nodeId}__${++genSeq}__`;
  gen.begin();
  gen.pushStep("그림을 그리는 중…");
  try {
    const imgs = await provider.generate(prompt.trim()); // 화풍은 nanoBanana 기본(픽사 3D)/오버라이드
    const raw = imgs[0]?.url;
    if (!raw) { gen.pushStep("못 만들었어요"); return false; }
    const url = raw; // 배경 유지 — 누끼(배경 제거) 미적용
    // 고유 키 — 이 프레임(이 페이지의 이 슬롯)만의 새 에셋. 다른 페이지의 같은 슬롯을 건드리지 않는다.
    useAssetStore.setState((s) => ({ map: { ...s.map, [key]: { status: "ready", url } } }));
    useGame.getState().setNodeContent(nodeId, { type: "asset", asset: { assetId: key, kind: "generated", variant: "full", cutout: "none", styleLock: false } }, roundIdx);
    gen.pushStep("적용했어요!");
    return true;
  } catch {
    gen.pushStep("생성에 실패했어요");
    return false;
  } finally {
    gen.end();
  }
}
