/**
 * tts.ts — 나레이션 싱글톤(브라우저 폴백). M0: speechSynthesis(ko-KR).
 * ------------------------------------------------------------------
 * Provider 계약(providers.ts)을 통해 만든다. CLOVA Voice(서버 프록시)는 config를 주면
 * 자동 교체(M2). 켜기/끄기(mute)는 스토어 ttsEnabled가 게이트한다 — 여긴 재생만.
 */
import { createTtsProvider, type TtsProvider } from "../providers/providers";

let provider: TtsProvider | null = null;

function tts(): TtsProvider {
  if (!provider) provider = createTtsProvider(); // M0: 브라우저 폴백
  return provider;
}

export function say(text: string): void {
  void tts().speak(text);
}
export function stopSay(): void {
  tts().stop();
}
