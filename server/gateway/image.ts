/* Image generation plugin (PRD §7.1, CLAUDE §1 — 이미지는 플러그인).
   Real raster generation via Gemini image model when GEMINI_API_KEY +
   KV_GEMINI_IMAGE_MODEL are configured; otherwise a labeled SVG placeholder so
   the lane stays runnable. Server-side only; keys never reach the browser. */

const WARM = ['#F4EDE3', '#EAE0D2', '#FBE6D9', '#F1EEE6'];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Deterministic warm-toned SVG placeholder labeled "AI 생성 (개념)". */
export function placeholderImage(caption: string): string {
  const h = hash(caption);
  const a = WARM[h % WARM.length];
  const b = WARM[(h >> 3) % WARM.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
<rect width="512" height="512" fill="url(#g)"/>
<circle cx="256" cy="220" r="92" fill="#F2733E" opacity="0.18"/>
<circle cx="256" cy="220" r="56" fill="#F2733E" opacity="0.28"/>
<text x="256" y="430" font-family="sans-serif" font-size="22" fill="#56524B" text-anchor="middle">AI 생성 (개념)</text>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

interface ImageOpts {
  geminiKey?: string;
  model?: string;
  prompt: string;
  caption: string;
}

/* Default Gemini image-generation model — used when GEMINI_API_KEY is set but no
   KV_GEMINI_IMAGE_MODEL override is provided. Override in .env if the id changes. */
const DEFAULT_IMAGE_MODEL = 'gemini-2.5-flash-image';

/** Returns { image: dataURI, real, detail? }. Falls back to a placeholder, with
    `detail` describing why (for diagnostics; non-sensitive). */
export async function generateImage(
  opts: ImageOpts,
): Promise<{ image: string; real: boolean; detail?: string }> {
  const model = opts.model || DEFAULT_IMAGE_MODEL;
  if (!opts.geminiKey) {
    return { image: placeholderImage(opts.caption), real: false, detail: 'no GEMINI_API_KEY' };
  }
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model,
    )}:generateContent?key=${encodeURIComponent(opts.geminiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: opts.prompt }] }],
        generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return {
        image: placeholderImage(opts.caption),
        real: false,
        detail: `gemini ${model} HTTP ${res.status}: ${body.slice(0, 200)}`,
      };
    }
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { mimeType: string; data: string } }> } }>;
    };
    const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
    if (part?.inlineData) {
      return { image: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`, real: true };
    }
    return { image: placeholderImage(opts.caption), real: false, detail: `${model}: no inlineData in response` };
  } catch (e) {
    return {
      image: placeholderImage(opts.caption),
      real: false,
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}
