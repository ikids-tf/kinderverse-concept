/**
 * nodeContent.ts — 편집에서 '선택한 요소(슬롯)'에 프롬프트로 만든 그림을 생성해 적용.
 * ------------------------------------------------------------------
 * 배경 생성(background.ts)과 짝 — 그쪽은 stage.background, 이쪽은 선택 노드의 라운드0 콘텐츠.
 * nanoBanana(아이템 화풍: 단일 오브젝트+흰배경, 기본 귀여운 3D 픽사) 생성 → 누끼 → assetStore에
 * URL 보관 → useGame.setNodeContent(asset 바인딩). 새 API 클라이언트 0(기존 게이트웨이 재사용).
 */
import { createImageProvider, createCutoutProvider } from "../providers/providers";
import { useGame } from "../runtime/useGame";
import { useAssetStore } from "../runtime/assetStore";
import { useGen } from "../runtime/genProgress";

const provider = createImageProvider();
const cutout = createCutoutProvider();

/** 선택 노드에 프롬프트 그림을 생성·적용. 성공 시 true. (편집 모드 + doc 있을 때만) */
export async function setNodeContentFromPrompt(nodeId: string, prompt: string): Promise<boolean> {
  const st = useGame.getState();
  if (!st.doc || st.mode !== "edit") return false;
  const gen = useGen.getState();
  if (gen.active) return false;
  const key = `__kv_node_${nodeId}__`;
  gen.begin();
  gen.pushStep("그림을 그리는 중…");
  try {
    const imgs = await provider.generate(prompt.trim()); // 화풍은 nanoBanana 기본(픽사 3D)/오버라이드
    const raw = imgs[0]?.url;
    if (!raw) { gen.pushStep("못 만들었어요"); return false; }
    let url = raw;
    try { gen.pushStep("배경 지우는 중…"); url = (await cutout.cutout(raw)).url; } catch { /* 누끼 실패 시 원본 */ }
    // 같은 키로 매번 새 URL — 캐시 무시하고 즉시 교체(이전 상태가 error여도 덮어쓴다).
    useAssetStore.setState((s) => ({ map: { ...s.map, [key]: { status: "ready", url } } }));
    useGame.getState().setNodeContent(nodeId, { type: "asset", asset: { assetId: key, kind: "generated", variant: "full", cutout: "none", styleLock: false } });
    gen.pushStep("적용했어요!");
    return true;
  } catch {
    gen.pushStep("생성에 실패했어요");
    return false;
  } finally {
    gen.end();
  }
}
