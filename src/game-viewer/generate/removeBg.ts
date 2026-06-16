/**
 * removeBg.ts — 이미지 배경 제거(누끼) — @imgly/background-removal, 온디바이스(브라우저).
 * ------------------------------------------------------------------
 * 업로드/생성 이미지의 배경을 지워 투명 PNG(data URL)로 만든다. 누낀 그림은 실루엣 게임의
 * CSS 마스크로 또렷한 실루엣이 되고, 세기/줄잇기에서도 배경 없이 깔끔하게 보인다.
 * 모델(수 MB)은 첫 호출 시 CDN에서 받아 캐시 — 첫 장은 수 초 걸린다. 실패 시 null(원본 유지).
 * 🔴 아이 사진은 온디바이스 처리 우선(외부 전송 최소화 — 헌장 §4-7).
 */
let _mod: typeof import("@imgly/background-removal") | null = null;

async function lib() {
  if (!_mod) _mod = await import("@imgly/background-removal");
  return _mod;
}

/** src(data URL 또는 http URL) → 배경 제거된 투명 PNG data URL. 실패 시 null. */
export async function removeBg(src: string): Promise<string | null> {
  try {
    const { removeBackground } = await lib();
    const blob = await removeBackground(src, { output: { format: "image/png" } });
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error("read failed"));
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
