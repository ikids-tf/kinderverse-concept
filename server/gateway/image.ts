/* Image generation plugin (PRD §7.1, CLAUDE §1 — 이미지는 플러그인).
   Real raster generation via Gemini image model when GEMINI_API_KEY +
   KV_GEMINI_IMAGE_MODEL are configured; otherwise a labeled SVG placeholder so
   the lane stays runnable. Server-side only; keys never reach the browser. */

import type { DetectedRegion } from '../../src/ai/gateway/types';

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
  /** 종횡비 힌트(예: '3:4' 세로). 모델이 지원하면 적용, 아니면 무시. */
  aspectRatio?: string;
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
        generationConfig: {
          responseModalities: ['IMAGE', 'TEXT'],
          // imageConfig.aspectRatio는 Gemini 이미지 모델이 지원하면 적용된다(미지원 시 무시).
          ...(opts.aspectRatio ? { imageConfig: { aspectRatio: opts.aspectRatio } } : {}),
        },
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

/* ---------- Element detection (레이어 분리: 이미지 → 요소 경계상자) ---------- */

/** Gemini vision model for object detection. Flash supports image input + boxes. */
const DEFAULT_DETECT_MODEL = 'gemini-2.5-flash';

function parseDataUri(uri: string): { mime: string; data: string } | null {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(uri);
  if (!m) return null;
  return { mime: m[1], data: m[2] };
}

/** Offline mock — a 2×2 grid of regions so 레이어 분리 stays runnable without a key. */
function mockRegions(): DetectedRegion[] {
  return [
    { label: '요소 1', box: [80, 80, 460, 470] },
    { label: '요소 2', box: [80, 520, 460, 920] },
    { label: '요소 3', box: [520, 80, 920, 470] },
    { label: '요소 4', box: [520, 520, 920, 920] },
  ];
}

interface DetectOpts {
  geminiKey?: string;
  model?: string;
  image: string; // data URI
  max?: number;
}

/** Detect distinct illustration elements in a generated image and return their
    bounding boxes ([ymin,xmin,ymax,xmax] 0–1000). Falls back to a mock grid. */
export async function detectImageElements(
  opts: DetectOpts,
): Promise<{ regions: DetectedRegion[]; mocked: boolean; detail?: string }> {
  const parsed = parseDataUri(opts.image);
  if (!opts.geminiKey || !parsed) {
    return {
      regions: mockRegions(),
      mocked: true,
      detail: !opts.geminiKey ? 'no GEMINI_API_KEY' : 'image is not a base64 data URI',
    };
  }
  // 마스크(투명 분리)는 응답이 커서 토큰을 많이 먹는다 → 객체 수를 보수적으로 제한.
  const max = opts.max && opts.max > 0 ? Math.min(opts.max, 10) : 10;
  const model = opts.model || DEFAULT_DETECT_MODEL;
  const prompt =
    `이 그림에서 개별 시각 요소(동물·사물·도형·캐릭터·아이콘 등)를 하나하나 따로 최대 ${max}개 찾아 ` +
    '각 요소의 세그멘테이션 마스크를 만들어라. 여러 요소를 한 상자로 묶지 말고 객체 단위로 분리한다. ' +
    '배경·여백·격자선·순수 텍스트(제목/안내문)는 제외한다. ' +
    '마크다운 없이 JSON 배열만 출력하라. 각 항목은 경계 상자 "box_2d"([ymin, xmin, ymax, xmax], 0~1000 정규화), ' +
    '해당 상자 영역의 흑백 마스크 PNG(흰색=요소) "mask"(base64 data URI), 짧은 한국어 라벨 "label"을 포함한다: ' +
    '[{"box_2d": [ymin, xmin, ymax, xmax], "mask": "data:image/png;base64,...", "label": string}]';
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model,
    )}:generateContent?key=${encodeURIComponent(opts.geminiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType: parsed.mime, data: parsed.data } },
              { text: prompt },
            ],
          },
        ],
        // 마스크 base64가 길어 잘리지 않도록 출력 한도를 넉넉히.
        generationConfig: { responseMimeType: 'application/json', temperature: 0, maxOutputTokens: 32768 },
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { regions: mockRegions(), mocked: true, detail: `gemini ${model} HTTP ${res.status}: ${body.slice(0, 160)}` };
    }
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    const regions = parseRegions(text, max);
    if (regions.length === 0) {
      return { regions: mockRegions(), mocked: true, detail: `${model}: no regions parsed` };
    }
    return { regions, mocked: false };
  } catch (e) {
    return { regions: mockRegions(), mocked: true, detail: e instanceof Error ? e.message : String(e) };
  }
}

function clampBox(b: number[]): [number, number, number, number] | null {
  if (!Array.isArray(b) || b.length !== 4 || b.some((n) => typeof n !== 'number')) return null;
  const [ymin, xmin, ymax, xmax] = b.map((n) => Math.max(0, Math.min(1000, n)));
  if (xmax - xmin < 20 || ymax - ymin < 20) return null; // drop slivers
  return [ymin, xmin, ymax, xmax];
}

/** Extract balanced top-level {...} objects from text — tolerant to a truncated
    tail (a long mask base64 cut off mid-string just drops that last object). */
function extractJsonObjects(s: string): string[] {
  const objs: string[] = [];
  let depth = 0;
  let start = -1;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        objs.push(s.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return objs;
}

function normalizeMask(m: unknown): string | undefined {
  if (typeof m !== 'string' || !m.trim()) return undefined;
  const v = m.trim();
  if (v.startsWith('data:')) return v;
  // bare base64 → assume PNG
  return `data:image/png;base64,${v}`;
}

/** Tolerant parse for the detection response: salvages complete objects even if
    the array is truncated (segmentation masks make responses large). */
function parseRegions(text: string, max: number): DetectedRegion[] {
  const out: DetectedRegion[] = [];
  for (const chunk of extractJsonObjects(text)) {
    let o: Record<string, unknown>;
    try {
      o = JSON.parse(chunk) as Record<string, unknown>;
    } catch {
      continue;
    }
    const raw = (o.box_2d ?? o.box ?? o.bbox) as number[] | undefined;
    const box = raw ? clampBox(raw) : null;
    if (!box) continue;
    out.push({
      label: typeof o.label === 'string' && o.label.trim() ? o.label.trim() : `요소 ${out.length + 1}`,
      box,
      mask: normalizeMask(o.mask),
    });
    if (out.length >= max) break;
  }
  return out;
}
