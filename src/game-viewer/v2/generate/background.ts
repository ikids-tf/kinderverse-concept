/**
 * background.ts — 프롬프트로 '게임 배경' 이미지를 생성해 stage.background에 적용.
 * ------------------------------------------------------------------
 * 아이템 생성(nanoBanana: 단일 오브젝트+흰배경+누끼)과 달리, 배경은 전체 장면(풀 프레임)·
 * 누끼 없음. 기존 게이트웨이(@/ai/client task:'image') 재사용 — 새 API 클라이언트 0.
 * URL은 assetStore(BG_ASSET_KEY)에 두고, doc.stage.background는 asset(BG_ASSET_KEY) 바인딩.
 */
import { callGateway } from "@/ai/client";
import { useGame } from "../runtime/useGame";
import { useAssetStore } from "../runtime/assetStore";
import { useGen } from "../runtime/genProgress";

/** stage.background asset 키 — 세션 동안 이 키로 assetStore에 URL을 보관. */
export const BG_ASSET_KEY = "__kv_bg__";

const BG_STYLE =
  "유아 그림책 배경 일러스트, 부드러운 파스텔, 전체 장면(풀 프레임)으로 가장자리까지 채우되 " +
  "가운데는 비워 넉넉한 여백, 단순하고 차분하게, 캐릭터·글자·테두리 없음";

/** 프롬프트로 배경 이미지를 생성해 stage.background에 적용. 성공 시 true. */
export async function setBackgroundFromPrompt(prompt: string): Promise<boolean> {
  const doc = useGame.getState().doc;
  if (!doc) return false;
  const gen = useGen.getState();
  if (gen.active) return false;
  gen.begin();
  gen.pushStep("배경을 그리는 중…");
  try {
    const res = await callGateway({
      task: "image",
      provider: "auto",
      messages: [],
      meta: { prompt: `${prompt.trim()} — ${BG_STYLE}`, caption: prompt.trim() },
    });
    if (!res.ok || !res.image) {
      gen.pushStep("배경을 못 만들었어요");
      return false;
    }
    // 배경은 컷아웃하지 않고 그대로(풀 프레임). assetStore에 URL 등록 + 배경 적용.
    const url = res.image;
    useAssetStore.setState((s) => ({ map: { ...s.map, [BG_ASSET_KEY]: { status: "ready", url } } }));
    useGame.getState().setBackgroundImage(BG_ASSET_KEY);
    gen.pushStep("배경을 넣었어요!");
    return true;
  } catch {
    gen.pushStep("배경 생성에 실패했어요");
    return false;
  } finally {
    gen.end();
  }
}
