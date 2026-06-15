/**
 * useGameAudio.ts — 게임 음성/효과음 훅 (STEP 3).
 * ------------------------------------------------------------------
 * 유아는 글을 못 읽으므로 음성이 1급. 모든 지시·라벨·피드백을 소리로 낸다.
 *
 * M1 스텁:
 *   - TTS = Web Speech API(speechSynthesis, ko-KR). CLOVA 연동은 M2.
 *     spec에 ttsUrl이 있으면 Howler로 그 오디오를 우선 재생(미리 캐시된 음성).
 *   - SFX = Web Audio로 부드러운 톤 합성(에셋 파일 0). 통통/딩동/반짝.
 *
 * 🔴 부정 연출 금지: 오답도 벌하는 소리가 아니라 '부드러운' 톤 + 다정한 재시도 음성.
 */
import { useEffect, useMemo, useRef } from "react";
import { Howl } from "howler";

/* ───────────────────────── 음소거 (모듈 전역 — 셸 버튼이 토글) ───────────────────────── */

let MUTED = false;
export function setGameMuted(v: boolean): void {
  MUTED = v;
  if (v && typeof window !== "undefined") window.speechSynthesis?.cancel();
}
export function isGameMuted(): boolean {
  return MUTED;
}

/* ───────────────────────── 한국어 수 세기 낱말 ───────────────────────── */

const NATIVE_KO = [
  "", "하나", "둘", "셋", "넷", "다섯",
  "여섯", "일곱", "여덟", "아홉", "열",
] as const;

/** 1~10은 순우리말(하나·둘…), 그 이상은 숫자 그대로 읽기. */
export function countWord(n: number): string {
  return NATIVE_KO[n] ?? String(n);
}

/* ───────────────────────── SFX (Web Audio 합성) ───────────────────────── */

type SfxName = "pop" | "count" | "correct" | "soft" | "sparkle";

let audioCtx: AudioContext | null = null;
function ctx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
  }
  return audioCtx;
}

/** 부드러운 단음 — type/주파수/길이/볼륨. attack·release로 톡 끊기지 않게. */
function blip(freq: number, dur = 0.16, when = 0, vol = 0.18, type: OscillatorType = "sine") {
  const ac = ctx();
  if (!ac) return;
  const t0 = ac.currentTime + when;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(vol, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function playSfx(name: SfxName): void {
  if (MUTED) return;
  const ac = ctx();
  if (ac?.state === "suspended") void ac.resume();
  switch (name) {
    case "pop": // 아이템 탭 — 통통
      blip(660, 0.13, 0, 0.16, "triangle");
      break;
    case "count": // 카운트업 — 살짝 올라가는 블립
      blip(720, 0.12, 0, 0.14, "triangle");
      break;
    case "correct": // 정답 — 도-미-솔 상행
      blip(523, 0.16, 0, 0.18, "sine");
      blip(659, 0.16, 0.12, 0.18, "sine");
      blip(784, 0.22, 0.24, 0.2, "sine");
      break;
    case "soft": // 오답(벌 아님) — 부드러운 단음, 살짝 낮게
      blip(392, 0.18, 0, 0.12, "sine");
      break;
    case "sparkle": // 보상 — 반짝이는 상행 아르페지오
      [523, 659, 784, 1047].forEach((f, i) => blip(f, 0.18, i * 0.08, 0.16, "triangle"));
      break;
  }
}

/* ───────────────────────── TTS (Web Speech, ko-KR) ───────────────────────── */

function pickKoVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis?.getVoices() ?? [];
  return voices.find((v) => v.lang === "ko-KR") ?? voices.find((v) => v.lang?.startsWith("ko"));
}

/** 한국어 음성 합성 재생. 이전 발화는 취소(겹침 방지). */
function speak(text: string, rate = 0.95): void {
  if (MUTED || typeof window === "undefined" || !window.speechSynthesis || !text) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ko-KR";
  u.rate = rate; // 유아용으로 살짝 천천히
  u.pitch = 1.1; // 살짝 밝게
  const v = pickKoVoice();
  if (v) u.voice = v;
  synth.speak(u);
}

/* ───────────────────────── 훅 ───────────────────────── */

export interface GameAudio {
  /** ttsUrl 있으면 그 오디오, 없으면 Web Speech로 한국어 합성 */
  voice: (text: string, ttsUrl?: string) => void;
  /** 칭찬 음성 (정답/보상 시) */
  praise: (text: string, ttsUrl?: string) => void;
  /** 효과음 */
  sfx: (name: SfxName) => void;
  /** 수 세기 낱말 음성 ("하나","둘"...) + count 효과음 */
  count: (n: number) => void;
  /** 모든 음성 중단 */
  stop: () => void;
}

export function useGameAudio(): GameAudio {
  const howls = useRef<Howl[]>([]);

  // 음성 목록은 비동기 로드 — 미리 한 번 깨워 둔다(첫 발화 무음 방지).
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const warm = () => window.speechSynthesis.getVoices();
    warm();
    window.speechSynthesis.addEventListener("voiceschanged", warm);
    const list = howls.current;
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", warm);
      window.speechSynthesis.cancel();
      list.forEach((h) => h.unload());
    };
  }, []);

  return useMemo<GameAudio>(() => {
    const playUrl = (url: string) => {
      if (MUTED) return;
      const h = new Howl({ src: [url], html5: true });
      howls.current.push(h);
      h.play();
    };
    return {
      voice: (text, ttsUrl) => (ttsUrl ? playUrl(ttsUrl) : speak(text)),
      praise: (text, ttsUrl) => {
        playSfx("correct");
        if (ttsUrl) playUrl(ttsUrl);
        else setTimeout(() => speak(text, 1), 260); // 효과음 뒤에 칭찬
      },
      sfx: playSfx,
      count: (n) => {
        playSfx("count");
        speak(countWord(n), 1.05);
      },
      stop: () => {
        if (typeof window !== "undefined") window.speechSynthesis?.cancel();
      },
    };
  }, []);
}
