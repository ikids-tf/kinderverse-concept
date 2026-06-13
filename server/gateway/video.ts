/* Video generation plugin (PRD §7.1·§9.5 — 전용 영상 생성, 게이팅).
   Google Gemini **Veo**로 짧은 활동 개념 영상을 만든다. 이미지 생성(image.ts)과
   달리 Veo는 장시간 비동기 작업(11초~6분)이라 2단계로 처리한다:
     1) startVideo  → :predictLongRunning 호출 → 오퍼레이션 이름 반환(즉시).
     2) pollVideo   → 오퍼레이션 GET, done:true면 결과 mp4 URI를 **서버가** 받아
                      base64 data URI로 변환해 돌려준다(키 비노출 — URI는 키 필요).
   GEMINI_API_KEY 없으면 mock(영상 없음 + 안내). 서버 전용; 키는 브라우저에 안 감.

   참고: ai.google.dev/gemini-api/docs/video (predict 엔드포인트 구조).
   - 텍스트→비디오: instances[0].prompt
   - 이미지→비디오: instances[0].image = { bytesBase64Encoded, mimeType } (첫 프레임)
     ※ predict 계열은 inlineData가 아니라 bytesBase64Encoded를 쓴다(generateContent와 구분). */

/** 기본 Veo 모델 — GEMINI_API_KEY가 있고 KV_GEMINI_VIDEO_MODEL 미설정 시 사용.
    교체: veo-3.0-fast-generate-001(저가) · veo-2.0-generate-001 등. */
export const DEFAULT_GEMINI_VIDEO_MODEL = 'veo-3.0-generate-001';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export interface StartVideoOpts {
  geminiKey?: string;
  model?: string;
  /** 영문 Veo 프롬프트(스튜디오 buildVeoPrompt 결과). */
  prompt: string;
  /** 이미지→비디오일 때 첫 프레임(data URI 또는 http URL). 없으면 텍스트→비디오. */
  imageDataUri?: string;
  /** '16:9'(기본) | '9:16'. */
  aspectRatio?: string;
  /** 4(기본) · 6 · 8. 비용 통제를 위해 기본 4초. */
  durationSeconds?: number;
  /** 부정 프롬프트(글자/워터마크/무서운 요소 배제). */
  negativePrompt?: string;
  /** personGeneration 제약값. ※ Veo 3 텍스트→비디오는 'allow_all'만 지원하고
      'dont_allow'·'allow_adult'는 HTTP 400을 낸다(이미지→비디오·Veo 2에서만 제약값 허용).
      그래서 기본은 '미지정'(API 기본=allow_all)으로 두고, 아동 미생성은 프롬프트 스타일
      (사람 배제 — 동물·사물·자연) + negativePrompt('human faces, real children')로 보장한다
      (PRD §9.5). 명시 값을 주면(예: Veo 2 'dont_allow') 그대로 전달한다. */
  personGeneration?: string;
  resolution?: string;
}

export interface StartVideoResult {
  /** 오퍼레이션 이름(폴링용). mock이면 없음. */
  op?: string;
  /** 실제 API 호출이면 true, 키 없음(mock)이면 false. */
  real: boolean;
  mocked?: boolean;
  error?: string;
}

const dataUriRe = /^data:([^;]+);base64,(.*)$/s;

/** data URI에서 { mime, base64 } 분리. http URL이면 서버가 받아 변환. */
async function toBytes(src: string): Promise<{ mime: string; b64: string } | null> {
  const m = dataUriRe.exec(src);
  if (m) return { mime: m[1], b64: m[2] };
  if (/^https?:\/\//i.test(src)) {
    try {
      const r = await fetch(src);
      if (!r.ok) return null;
      const mime = r.headers.get('content-type') || 'image/png';
      const buf = Buffer.from(await r.arrayBuffer());
      return { mime: mime.split(';')[0], b64: buf.toString('base64') };
    } catch {
      return null;
    }
  }
  return null;
}

/** Veo 생성 시작 → 오퍼레이션 이름. 키 없으면 mocked. */
export async function startVideo(opts: StartVideoOpts): Promise<StartVideoResult> {
  if (!opts.geminiKey) return { real: false, mocked: true, error: 'no GEMINI_API_KEY' };
  const model = opts.model || DEFAULT_GEMINI_VIDEO_MODEL;

  const instance: Record<string, unknown> = { prompt: opts.prompt };
  if (opts.imageDataUri) {
    const img = await toBytes(opts.imageDataUri);
    if (img) instance.image = { bytesBase64Encoded: img.b64, mimeType: img.mime };
  }

  const parameters: Record<string, unknown> = {
    aspectRatio: opts.aspectRatio || '16:9',
    durationSeconds: opts.durationSeconds ?? 4,
    resolution: opts.resolution || '720p',
  };
  if (opts.negativePrompt) parameters.negativePrompt = opts.negativePrompt;
  if (opts.personGeneration) parameters.personGeneration = opts.personGeneration;

  try {
    const url = `${API_BASE}/models/${encodeURIComponent(model)}:predictLongRunning?key=${encodeURIComponent(
      opts.geminiKey,
    )}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ instances: [instance], parameters }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { real: false, error: `veo ${model} HTTP ${res.status}: ${body.slice(0, 240)}` };
    }
    const data = (await res.json()) as { name?: string };
    if (!data.name) return { real: false, error: `${model}: no operation name in response` };
    return { op: data.name, real: true };
  } catch (e) {
    return { real: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface PollVideoResult {
  done: boolean;
  /** done:true일 때 영상 data URI(서버가 다운로드·변환). */
  video?: string;
  mocked?: boolean;
  error?: string;
}

/** 오퍼레이션 이름은 클라이언트→서버로 매 폴링마다 전달된다. 키는 안 받으므로
    SSRF 방지를 위해 형태를 검증한다(operations/ 경로만 허용). */
function safeOpName(op: string): string | null {
  const s = op.trim();
  if (!/^[\w./-]+$/.test(s)) return null;
  if (!s.includes('operations/')) return null;
  return s.replace(/^\/+/, '');
}

/** 결과에서 mp4 URI를 꺼낸다 — 응답 형태가 버전마다 달라 방어적으로 탐색. */
function extractVideoUri(response: unknown): string | undefined {
  const r = response as {
    generateVideoResponse?: { generatedSamples?: Array<{ video?: { uri?: string } }> };
    generatedSamples?: Array<{ video?: { uri?: string } }>;
    videos?: Array<{ uri?: string; video?: { uri?: string } }>;
  };
  return (
    r?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri ??
    r?.generatedSamples?.[0]?.video?.uri ??
    r?.videos?.[0]?.uri ??
    r?.videos?.[0]?.video?.uri
  );
}

/** Veo URI(키 필요)를 서버가 받아 data URI로 변환. */
async function downloadVideo(uri: string, geminiKey: string): Promise<string | null> {
  try {
    // URI에 key 쿼리가 없으면 헤더로 인증(둘 다 허용됨).
    const r = await fetch(uri, { headers: { 'x-goog-api-key': geminiKey } });
    if (!r.ok) return null;
    const mime = (r.headers.get('content-type') || 'video/mp4').split(';')[0];
    const buf = Buffer.from(await r.arrayBuffer());
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

/** 오퍼레이션 폴링 — 미완료면 {done:false}, 완료면 영상 data URI. */
export async function pollVideo(op: string, geminiKey?: string): Promise<PollVideoResult> {
  if (!geminiKey) return { done: true, mocked: true, error: 'no GEMINI_API_KEY' };
  const name = safeOpName(op);
  if (!name) return { done: true, error: 'invalid operation name' };
  try {
    const url = `${API_BASE}/${name}?key=${encodeURIComponent(geminiKey)}`;
    const res = await fetch(url, { headers: { 'x-goog-api-key': geminiKey } });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { done: true, error: `veo poll HTTP ${res.status}: ${body.slice(0, 240)}` };
    }
    const data = (await res.json()) as {
      done?: boolean;
      error?: { message?: string };
      response?: unknown;
    };
    if (!data.done) return { done: false };
    if (data.error) return { done: true, error: data.error.message || 'veo operation failed' };
    const uri = extractVideoUri(data.response);
    if (!uri) return { done: true, error: 'veo: no video uri in completed operation' };
    const video = await downloadVideo(uri, geminiKey);
    if (!video) return { done: true, error: 'veo: failed to download generated video' };
    return { done: true, video };
  } catch (e) {
    return { done: true, error: e instanceof Error ? e.message : String(e) };
  }
}
