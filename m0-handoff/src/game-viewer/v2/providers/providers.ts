/**
 * 외부 의존 = 교체 가능한 Provider 계약 (M0: 인터페이스 + stub).
 * ------------------------------------------------------------------
 * 게임 로직은 이 인터페이스만 의존한다. 구현체(나노바나나/CLOVA/RMBG/SlimSAM)가 바뀌어도 무관.
 *
 * 규칙(전 Provider 공통):
 *  - 생성/합성/누끼는 전부 비동기. 절대 크리티컬 패스에 두지 않는다.
 *    플레이는 시드/플레이스홀더로 즉시 시작 → 완료 시 스왑.
 *  - 결과는 캐싱(동일 입력 재처리 0).
 *  - 🔴 assetKind "child-photo" 는 외부 API로 절대 전송하지 않는다(아래 가드).
 *
 * M0 stub 정책:
 *  - ImageProvider: 플레이스홀더 반환(실제 나노바나나 호출은 M2).
 *  - CutoutProvider: 온디바이스 RMBG worker 연결 전까지 passthrough.
 *  - ObjectSegmenter: 편집기(M1) — 인터페이스만.
 *  - TtsProvider: CLOVA config 있으면 CLOVA, 없으면 브라우저 TTS 폴백. 캐싱 골격은 지금 동작.
 */

/* ════════════ 공통 타입 ════════════ */

export type AssetKind = "child-photo" | "uploaded" | "generated" | "curated";

export interface ImageAsset {
  assetId: string;
  url: string;          // 고해상
  lowResUrl?: string;   // 플레이스홀더(있으면 먼저 표시)
  kind: AssetKind;
}

/** 🔴 child-photo 외부 전송 금지 가드. 외부 이미지 API 호출 직전 반드시 통과시킨다. */
export class ChildPhotoToExternalError extends Error {
  constructor() {
    super("child-photo 는 외부 이미지 API로 전송할 수 없습니다.");
    this.name = "ChildPhotoToExternalError";
  }
}
export function assertNotChildPhoto(asset: { kind: AssetKind }): void {
  if (asset.kind === "child-photo") throw new ChildPhotoToExternalError();
}

/* ════════════ ImageProvider (현재 구현: 나노바나나 / Gemini) ════════════ */

export interface StyleRef {
  /** 스타일락: 떨군 이미지의 화풍을 고정. */
  assetId?: string;
  descriptor?: string; // 예: "soft pastel illustration, thick rounded outline"
}
export interface GenerateOptions {
  styleRef?: StyleRef;
  count?: number;              // 동반 이미지 수 (settings.companionCount)
  size?: "thumb" | "full";
  signal?: AbortSignal;
}
export interface ImageProvider {
  /** 프롬프트(+스타일락)로 이미지 생성. child-photo 는 입력으로 받지 않는다. */
  generate(prompt: string, opts?: GenerateOptions): Promise<ImageAsset[]>;
  /** 기존 이미지를 자연어로 변형(distractor·배경 등). 외부 전송 전 child-photo 가드. */
  editVariant(asset: ImageAsset, instruction: string, opts?: GenerateOptions): Promise<ImageAsset>;
}

/* ════════════ CutoutProvider (현재 구현: 기존 공용 온디바이스 엔진 @/shared/background-removal) ════════════ */
// 🔴 BiRefNet/RMBG (MIT), 온디바이스. @imgly(AGPL) 금지 — 레포에서 의도적으로 제거됨.

export interface CutoutResult {
  url: string;       // 투명 PNG
  maskUrl?: string;  // 알파 마스크(옵션)
}
export interface CutoutProvider {
  /** 온디바이스 누끼. 외부 전송이 아니므로 모든 assetKind 허용(child-photo 포함). */
  cutout(input: Blob | string, opts?: { signal?: AbortSignal }): Promise<CutoutResult>;
}

/* ════════════ ObjectSegmenter (현재 구현: SlimSAM — 편집기 M1) ════════════ */

export interface SegmentResult { maskUrl: string; }
export interface ObjectSegmenter {
  segment(input: Blob | string, clickPoint: { x: number; y: number }): Promise<SegmentResult>;
}

/* ════════════ TtsProvider (현재 구현: CLOVA Voice / NCP) ════════════ */

export type VoiceTone = "bright" | "calm";
export interface TtsOptions {
  voice?: VoiceTone;   // 유아용: 기본 bright 한 명 고정
  locale?: string;     // 기본 ko-KR
  signal?: AbortSignal;
}
export interface TtsProvider {
  /** 합성+재생. 같은 (text,voice,locale)은 캐시 사용(재합성 0). */
  speak(text: string, opts?: TtsOptions): Promise<void>;
  /** 미리 합성해 캐싱(재생 X). 라운드 진입 전 호출 가능. */
  prefetch(text: string, opts?: TtsOptions): Promise<void>;
  /** 현재 재생 중단. */
  stop(): void;
}

function ttsKey(text: string, opts?: TtsOptions): string {
  return `${opts?.locale ?? "ko-KR"}|${opts?.voice ?? "bright"}|${text}`;
}

/* ──────────────── M0 stub 구현 ──────────────── */

/** ImageProvider M0 stub — 플레이스홀더 반환(네트워크 없음). 실제 나노바나나는 M2. */
export class PlaceholderImageProvider implements ImageProvider {
  async generate(prompt: string, opts?: GenerateOptions): Promise<ImageAsset[]> {
    const n = opts?.count ?? 1;
    return Array.from({ length: n }, (_, i) => ({
      assetId: `placeholder_${slug(prompt)}_${i}`,
      url: placeholderDataUri(prompt),
      kind: "generated" as const,
    }));
    // TODO(M2): 나노바나나(Gemini) 호출 + styleRef 화풍 고정 + 캐싱(스타일+주제 키).
  }
  async editVariant(asset: ImageAsset, instruction: string, _opts?: GenerateOptions): Promise<ImageAsset> {
    assertNotChildPhoto(asset); // 🔴 외부 전송 전 가드
    return { ...asset, assetId: `${asset.assetId}_v_${slug(instruction)}` };
    // TODO(M2): 나노바나나 editVariant 호출.
  }
}

/** CutoutProvider M0 — 레포의 기존 공용 온디바이스 엔진으로 라우팅. */
export class PassthroughCutoutProvider implements CutoutProvider {
  async cutout(input: Blob | string, _opts?: { signal?: AbortSignal }): Promise<CutoutResult> {
    const url = typeof input === "string" ? input : URL.createObjectURL(input);
    return { url };
    // 🔴 @imgly(AGPL) 사용 금지 — 레포는 의도적으로 제거됨.
    // TODO: 기존 공용 엔진 `@/shared/background-removal/removeBackground.ts`
    //       (BiRefNet/RMBG, MIT, 온디바이스 worker.ts)로 라우팅. 새 엔진 추가 금지.
  }
}

/** ObjectSegmenter M0 stub — 편집기 미구현(M1). */
export class NotImplementedObjectSegmenter implements ObjectSegmenter {
  async segment(): Promise<SegmentResult> {
    throw new Error("ObjectSegmenter 는 편집기(M1)에서 구현됩니다.");
  }
}

/** 브라우저 TTS 폴백 — speechSynthesis(ko-KR). M0 기본. */
export class BrowserTtsProvider implements TtsProvider {
  private voice: SpeechSynthesisVoice | null = null;

  constructor() {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      const pick = () => {
        const vs = window.speechSynthesis.getVoices();
        this.voice = vs.find((v) => /ko/i.test(v.lang)) ?? null;
      };
      pick();
      window.speechSynthesis.onvoiceschanged = pick;
    }
  }
  speak(text: string, opts?: TtsOptions): Promise<void> {
    if (typeof window === "undefined" || !("speechSynthesis" in window) || !text) return Promise.resolve();
    return new Promise<void>((resolve) => {
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = opts?.locale ?? "ko-KR";
        if (this.voice) u.voice = this.voice;
        u.rate = 0.98;
        u.pitch = opts?.voice === "calm" ? 1.0 : 1.12;
        u.onend = () => resolve();
        u.onerror = () => resolve();
        window.speechSynthesis.speak(u);
      } catch {
        resolve();
      }
    });
  }
  async prefetch(): Promise<void> { /* 브라우저 TTS는 미리합성 불가 — no-op */ }
  stop(): void {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try { window.speechSynthesis.cancel(); } catch { /* noop */ }
    }
  }
}

export interface ClovaConfig {
  /** 서버 프록시 엔드포인트(키는 서버에 둔다 — 클라이언트 노출 금지). */
  synthEndpoint: string;
  /** 캐시(예: Supabase Storage)에서 오디오 URL을 받는 함수(있으면 재합성 0). */
  getCachedUrl?: (key: string) => Promise<string | null>;
  putCachedUrl?: (key: string, audioUrl: string) => Promise<void>;
}

/**
 * CLOVA Voice Provider — 서버에서 합성한 오디오를 캐싱·재생.
 * 캐싱 골격은 지금 동작하고, 실제 NCP 호출/오디오 저장은 서버 프록시에 둔다(TODO).
 */
export class ClovaTtsProvider implements TtsProvider {
  private audio: HTMLAudioElement | null = null;
  private mem = new Map<string, string>(); // key -> audioUrl (세션 메모리 캐시)

  constructor(private cfg: ClovaConfig) {}

  private async resolveUrl(text: string, opts?: TtsOptions): Promise<string> {
    const key = ttsKey(text, opts);
    const hit = this.mem.get(key);
    if (hit) return hit;
    if (this.cfg.getCachedUrl) {
      const cached = await this.cfg.getCachedUrl(key);
      if (cached) { this.mem.set(key, cached); return cached; }
    }
    // 합성: 서버 프록시 호출(키는 서버). 응답 = 오디오 URL.
    const res = await fetch(this.cfg.synthEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice: opts?.voice ?? "bright", locale: opts?.locale ?? "ko-KR" }),
      signal: opts?.signal,
    });
    if (!res.ok) throw new Error(`TTS 합성 실패: ${res.status}`);
    const data = (await res.json()) as { audioUrl: string };
    this.mem.set(key, data.audioUrl);
    if (this.cfg.putCachedUrl) await this.cfg.putCachedUrl(key, data.audioUrl);
    return data.audioUrl;
    // TODO: 서버 프록시(synthEndpoint)에서 NCP CLOVA Voice 호출 + 오디오를 Storage에 저장 후 URL 반환.
  }

  async speak(text: string, opts?: TtsOptions): Promise<void> {
    if (!text) return;
    const url = await this.resolveUrl(text, opts);
    this.stop();
    this.audio = new Audio(url);
    await this.audio.play().catch(() => { /* 자동재생 제한 등 — 무시 */ });
  }
  async prefetch(text: string, opts?: TtsOptions): Promise<void> {
    if (!text) return;
    try { await this.resolveUrl(text, opts); } catch { /* prefetch 실패는 조용히 무시 */ }
  }
  stop(): void {
    if (this.audio) { try { this.audio.pause(); } catch { /* noop */ } this.audio = null; }
  }
}

/* ──────────────── 팩토리 (앱이 env → config 주입) ──────────────── */

export function createImageProvider(): ImageProvider {
  return new PlaceholderImageProvider(); // TODO(M2): NanoBananaImageProvider
}
export function createCutoutProvider(): CutoutProvider {
  return new PassthroughCutoutProvider(); // TODO: RmbgCutoutProvider(worker)
}
export function createObjectSegmenter(): ObjectSegmenter {
  return new NotImplementedObjectSegmenter();
}
/** CLOVA config 있으면 CLOVA, 없으면 브라우저 폴백. */
export function createTtsProvider(clova?: ClovaConfig): TtsProvider {
  return clova ? new ClovaTtsProvider(clova) : new BrowserTtsProvider();
}

/* ──────────────── 내부 유틸 ──────────────── */

function slug(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\-가-힣]/g, "").slice(0, 24) || "x";
}
function placeholderDataUri(label: string): string {
  // 프로토용 단색 카드(SVG data URI). 실제 빌드에선 사용 안 함.
  const safe = label.replace(/[<>&]/g, "").slice(0, 16);
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><rect width='240' height='240' rx='22' fill='%23FBF1E6'/><text x='50%' y='52%' font-family='sans-serif' font-size='18' fill='%238C7E6E' text-anchor='middle'>${safe}</text></svg>`;
  return `data:image/svg+xml;utf8,${svg}`;
}
