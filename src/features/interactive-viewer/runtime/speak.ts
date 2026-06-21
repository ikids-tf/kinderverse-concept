/**
 * 말하기(speak) — 브라우저 음성합성(ko-KR) 폴백. 키 없는 환경에서도 동작.
 * (CLOVA Voice 서버 프록시 연동은 후속 — 여기선 의존성 없는 브라우저 TTS만.)
 */
export function speakText(text: string): void {
  try {
    if (typeof speechSynthesis === 'undefined' || !text.trim()) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ko-KR';
    u.rate = 0.95;
    u.pitch = 1.05;
    speechSynthesis.speak(u);
  } catch {
    /* 음성합성 미지원 — 말풍선만 표시 */
  }
}

export function stopSpeaking(): void {
  try {
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
  } catch {
    /* noop */
  }
}
