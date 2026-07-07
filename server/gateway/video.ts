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
    기본을 fast로 둬(저가·할당량 여유) 모든 PC가 별도 .env 없이 동작하게 한다.
    ※ 모델 ID는 Google이 수시로 폐기·개명한다(구 veo-3.0-*·veo-2.0-* GA는 현재 다수 키에서
    404). 그래서 하드코딩에만 의존하지 않고, 404가 나면 pickAvailableVideoModel이 이 키로
    실제 쓸 수 있는 Veo 모델을 조회해 자동 대체한다(아래). 고품질이 필요하면 env로 교체. */
export const DEFAULT_GEMINI_VIDEO_MODEL = 'veo-3.1-fast-generate-preview';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/** 세션 캐시 — 한 번 성공(또는 자동 해석)한 모델을 재사용해 매 호출 404 왕복·ListModels를 막는다. */
let resolvedVideoModel: string | null = null;

/** 이 키로 실제 쓸 수 있는 Veo 모델 중 최적을 고른다(predictLongRunning 지원 + 이름에 veo).
    선호: fast(저가) > lite > 표준, 동급이면 버전 높은 순. 조회 실패/후보 없으면 null.
    구성 모델이 404(NOT_FOUND — 키에 권한 없음/폐기·개명)일 때만 호출된다. */
async function pickAvailableVideoModel(geminiKey: string): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/models?key=${encodeURIComponent(geminiKey)}&pageSize=200`);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
    };
    const cands = (data.models ?? [])
      .filter(
        (m) =>
          typeof m.name === 'string' &&
          /veo/i.test(m.name) &&
          (m.supportedGenerationMethods ?? []).includes('predictLongRunning'),
      )
      .map((m) => (m.name as string).replace(/^models\//, ''));
    if (!cands.length) return null;
    const versionRank = (id: string): number => {
      const m = /veo-(\d+)\.(\d+)/.exec(id);
      return m ? Number(m[1]) * 100 + Number(m[2]) : 0;
    };
    const tierRank = (id: string): number => (/fast/i.test(id) ? 2 : /lite/i.test(id) ? 1 : 0);
    cands.sort(
      (a, b) => tierRank(b) - tierRank(a) || versionRank(b) - versionRank(a) || a.localeCompare(b),
    );
    return cands[0];
  } catch {
    return null;
  }
}

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

/* ── 레이트리밋(429)·일시 과부하(503) 자동 재시도 ─────────────────────────────
   Veo는 분당·일일 할당량이 작아 429(RESOURCE_EXHAUSTED)가 잦다. 구글 오류 본문의
   RetryInfo.retryDelay("21s")를 존중해 그만큼 기다렸다 다시 시도하고, 권고 지연이
   너무 길면(=일일 할당량 소진) 즉시 포기해 사용자에게 빨리 안내한다. */
const RETRY_STATUS = new Set([429, 503]);
const MAX_RETRIES = 3;
const MAX_WAIT_MS = 30_000;

/** 구글 오류 JSON의 RetryInfo.retryDelay(예: "21s")를 ms로. 없으면 null. */
function parseRetryDelayMs(body: string): number | null {
  try {
    const j = JSON.parse(body) as { error?: { details?: Array<{ retryDelay?: string }> } };
    for (const d of j?.error?.details ?? []) {
      const m = typeof d?.retryDelay === 'string' ? /^([\d.]+)s$/.exec(d.retryDelay.trim()) : null;
      if (m) return Math.round(parseFloat(m[1]) * 1000);
    }
  } catch {
    /* 본문이 JSON이 아니면 무시 */
  }
  return null;
}

/** fetch + 429/503 백오프 재시도. 성공/비재시도 상태/재시도 소진 시 응답을 그대로 반환
    (본문 미소비 — 호출부가 읽는다). 재시도 시에는 clone만 읽어 원본을 보존한다. */
async function fetchVeo(url: string, init?: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init);
    if (!RETRY_STATUS.has(res.status) || attempt >= MAX_RETRIES) return res;
    const body = await res.clone().text().catch(() => '');
    const hinted = parseRetryDelayMs(body);
    if (hinted != null && hinted > MAX_WAIT_MS) return res; // 너무 길게 기다려야 하면 포기
    const wait = Math.min(hinted ?? 3000 * 2 ** attempt, MAX_WAIT_MS);
    await new Promise((r) => setTimeout(r, wait));
  }
}

/** 429·404를 교사용 안내 메시지로(나머지는 진단용 원문). */
function formatVeoHttpError(status: number, model: string, body: string): string {
  if (status === 429) {
    return 'Veo 사용량 한도(429)에 걸렸어요 — 1~2분 뒤 다시 시도해 주세요. 계속 실패하면 Google AI Studio에서 Veo 할당량·결제를 확인해 주세요.';
  }
  if (status === 404) {
    // 자동 대체까지 실패한 경우에만 도달(이 키로 쓸 수 있는 Veo 모델이 없음).
    return `영상 모델 "${model}"을(를) 이 API 키로 찾을 수 없어요(404) — 모델이 폐기됐거나 키에 권한이 없어요. Google AI Studio에서 Veo 사용 가능 여부를 확인하거나 .env의 KV_GEMINI_VIDEO_MODEL을 지워(자동 선택) 다시 시도해 주세요.`;
  }
  return `veo ${model} HTTP ${status}: ${body.slice(0, 240)}`;
}

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

  const key = opts.geminiKey;
  const post = (m: string): Promise<Response> =>
    fetchVeo(`${API_BASE}/models/${encodeURIComponent(m)}:predictLongRunning?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ instances: [instance], parameters }),
    });

  try {
    // 우선순위: 명시 model > 세션에 해석해둔 모델 > 코드 기본값.
    let active = opts.model || resolvedVideoModel || DEFAULT_GEMINI_VIDEO_MODEL;
    let res = await post(active);
    // 404(NOT_FOUND — 이 키에 그 모델이 없음/폐기·개명)면 실제 쓸 수 있는 Veo로 1회 자동 대체.
    // 구 GA(veo-3.0-*·veo-2.0-*)가 키에서 사라져도 여기서 스스로 복구된다(사용자 보고: 404 반복).
    if (res.status === 404) {
      const alt = await pickAvailableVideoModel(key);
      if (alt && alt !== active) {
        active = alt;
        res = await post(active);
      }
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { real: false, error: formatVeoHttpError(res.status, active, body) };
    }
    const data = (await res.json()) as { name?: string };
    if (!data.name) return { real: false, error: `${active}: no operation name in response` };
    resolvedVideoModel = active; // 성공 모델 캐시 → 다음 호출부터 404 왕복 없이 바로 사용
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
  /** 완료됐지만 영상 샘플이 없음(대개 안전 필터) — 재시도하면 성공할 수 있음. */
  filtered?: boolean;
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
    generateVideoResponse?: { generatedSamples?: Array<{ video?: { uri?: string } }>; videos?: Array<{ uri?: string; video?: { uri?: string } }> };
    generatedSamples?: Array<{ video?: { uri?: string } }>;
    videos?: Array<{ uri?: string; video?: { uri?: string } }>;
  };
  return (
    r?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri ??
    r?.generateVideoResponse?.videos?.[0]?.uri ??
    r?.generateVideoResponse?.videos?.[0]?.video?.uri ??
    r?.generatedSamples?.[0]?.video?.uri ??
    r?.videos?.[0]?.uri ??
    r?.videos?.[0]?.video?.uri
  );
}

/** Veo가 완료했지만 영상 샘플이 없을 때 사유를 읽는다 — 대개 콘텐츠 안전 필터
    (raiMediaFilteredCount/Reasons). 사유가 있으면 교사용 안내 메시지를, 없으면
    진단용으로 응답 최상위 키 목록을 돌려준다. */
function noVideoReason(response: unknown): string {
  const r = (response ?? {}) as {
    generateVideoResponse?: { raiMediaFilteredCount?: number; raiMediaFilteredReasons?: string[] };
    raiMediaFilteredCount?: number;
    raiMediaFilteredReasons?: string[];
  };
  const gv = r.generateVideoResponse ?? {};
  const count = gv.raiMediaFilteredCount ?? r.raiMediaFilteredCount ?? 0;
  const reasons = gv.raiMediaFilteredReasons ?? r.raiMediaFilteredReasons ?? [];
  if (count > 0 || reasons.length) {
    const why = reasons.length ? ` (${reasons.join('; ').slice(0, 200)})` : '';
    return `안전 필터로 영상이 생성되지 않았어요${why} — 사람·아동이 등장하지 않는 묘사로 바꿔 다시 시도해 주세요.`;
  }
  const keys = Object.keys((response as Record<string, unknown>) ?? {}).join(',');
  return `veo: 완료됐지만 영상 샘플이 없어요 (응답 키: ${keys || '없음'})`;
}

/** Veo URI(키 필요)를 서버가 받아 data URI로 변환. */
async function downloadVideo(uri: string, geminiKey: string): Promise<string | null> {
  try {
    // URI에 key 쿼리가 없으면 헤더로 인증(둘 다 허용됨).
    const r = await fetchVeo(uri, { headers: { 'x-goog-api-key': geminiKey } });
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
    const res = await fetchVeo(url, { headers: { 'x-goog-api-key': geminiKey } });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { done: true, error: res.status === 429 ? formatVeoHttpError(429, name, body) : `veo poll HTTP ${res.status}: ${body.slice(0, 240)}` };
    }
    const data = (await res.json()) as {
      done?: boolean;
      error?: { message?: string };
      response?: unknown;
    };
    if (!data.done) return { done: false };
    if (data.error) return { done: true, error: data.error.message || 'veo operation failed' };
    const uri = extractVideoUri(data.response);
    if (!uri) return { done: true, error: noVideoReason(data.response), filtered: true };
    const video = await downloadVideo(uri, geminiKey);
    if (!video) return { done: true, error: 'veo: failed to download generated video' };
    return { done: true, video };
  } catch (e) {
    return { done: true, error: e instanceof Error ? e.message : String(e) };
  }
}
