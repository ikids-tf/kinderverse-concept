// 디자인 에셋 라이브러리: 클레이 누끼 그림 · 꾸밈 요소를 내부 LLM(gpt-image)으로 생성 →
// 누끼(투명) 처리 → 디스크립터 key 기준으로 캐시. 같은/비슷한 요소는 항상 캐시 재사용(재생성 X).
//  - 디자인 퀄리티: 공통 스타일 접미사로 모든 에셋의 톤을 통일(클레이 3D, 파스텔, 흰 배경 컷아웃).
import { generateImageForPrompt } from "./imageCache";
import { removeBackground } from "./removeBackground";

export type AssetKind = "illustration" | "decoration";
export interface AssetDescriptor {
  kind: AssetKind;
  key: string; // 안정적 식별자 (예: "sun", "corner-sparkle") — 캐시 키
  label: string; // 표시명
  subject: string; // 생성 프롬프트의 핵심 묘사(영문)
}

// 스타일 버전 — 올리면 전체 에셋이 새 톤으로 재생성된다.
export const ASSET_STYLE_VERSION = "v2";

// 모든 에셋 공통 스타일(품질·일관성의 핵심). 흰 배경 단일 오브젝트 → 누끼로 투명 컷아웃.
const STYLE_SUFFIX =
  "cute 3D claymation / plasticine style, professional 3D render like Pixar, glossy soft clay texture, " +
  "smooth rounded chunky forms, vibrant cheerful pastel colors, soft gentle studio lighting, subtle highlights, " +
  "a single object centered and large, isolated on a flat pure white background #ffffff, clean crisp edges, " +
  "die-cut sticker look, adorable kawaii, no text, no letters, no border, no ground shadow, ultra high detail, 1:1 square";

// 주차 장식 그림(클레이 누끼) 후보 묘사
const ILLUSTRATION_SUBJECTS: Record<string, string> = {
  sun: "a cheerful smiling summer sun character",
  palette: "an artist paint palette with colorful paint blobs and a small brush, and a little rainbow",
  tree: "a cute round leafy summer tree",
  shell: "a pretty seashell next to a small starfish",
  sandcastle: "a small sandcastle with a tiny flag and a bucket",
  ball: "a colorful striped beach ball",
  music: "two cute musical notes",
  book: "an open picture storybook",
  star: "a cute smiling star",
  flower: "a cute blooming summer flower",
  watermelon: "a cute group of summer fruits — a watermelon slice, grapes and an orange",
  cloud: "a fluffy cute smiling cloud",
  rainbow: "a colorful cute rainbow",
  crayon: "a few colorful crayons in a cup",
  paint: "a paintbrush with a dab of colorful paint",
  water: "a playful splash of blue water with droplets",
  leaf: "a couple of fresh green leaves",
  insect: "a cute friendly ladybug",
  calendar: "a cute wall calendar",
  puzzle: "a few colorful jigsaw puzzle pieces",
  camera: "a cute toy camera",
  drum: "a small toy drum",
  icecream: "a cute ice cream cone",
  // ── 기타(misc) ──
  umbrella: "a cute summer parasol umbrella",
  fan: "a cute hand fan",
  hat: "a cute summer straw hat",
  boat: "a cute little sailboat",
  butterfly: "a cute butterfly",
  frog: "a cute little frog",
  bird: "a cute little bird",
  kite: "a cute kite",
  balloon: "a couple of cute balloons",
  watering_can: "a cute watering can",
  bucket: "a cute sand bucket with a shovel",
  popsicle: "a cute popsicle",
  cup: "a cute cup of fruit punch",
  magnifier: "a cute magnifying glass",
};

// 꾸밈 요소(가장자리 장식) 묘사
const DECORATION_SUBJECTS: Record<string, string> = {
  "corner-sparkle": "a small decorative cluster of one four-point sparkle star with a few tiny round dots around it",
  leaf: "a couple of small cute leaves",
  flower: "a tiny cute single flower",
  dots: "a small scattered cluster of tiny round dots",
};

export function descriptorFor(kind: AssetKind, key: string): AssetDescriptor {
  const subjects = kind === "illustration" ? ILLUSTRATION_SUBJECTS : DECORATION_SUBJECTS;
  return { kind, key, label: key, subject: subjects[key] || key };
}

function buildAssetPrompt(d: AssetDescriptor): string {
  return `${d.subject}, ${STYLE_SUFFIX}`;
}

// ── 캐시 (누끼 완료본) : 키별 개별 localStorage 항목 + 메모리 ──
const MEM = new Map<string, string>();
const PREFIX = "verse:asset:";
function cacheKey(d: AssetDescriptor): string {
  return `${PREFIX}${ASSET_STYLE_VERSION}:${d.kind}:${d.key}`;
}

export function getCachedAsset(d: AssetDescriptor): string | null {
  const k = cacheKey(d);
  const m = MEM.get(k);
  if (m) return m;
  try {
    const v = localStorage.getItem(k);
    if (v) { MEM.set(k, v); return v; }
  } catch { /* ignore */ }
  return null;
}

function setCachedAsset(d: AssetDescriptor, src: string): void {
  const k = cacheKey(d);
  MEM.set(k, src);
  try { localStorage.setItem(k, src); } catch { /* quota — 메모리 캐시만 */ }
}

export interface AssetResult { src: string; cached: boolean }

/**
 * 에셋(누끼 완료 dataURL)을 얻는다. 캐시 우선(과금 0).
 * 캐시에 없으면 gpt-image 로 생성 → 누끼(흰 배경 제거) → 캐시 저장.
 */
export async function getAsset(d: AssetDescriptor, opts: { force?: boolean } = {}): Promise<AssetResult> {
  if (!opts.force) {
    const cached = getCachedAsset(d);
    if (cached) return { src: cached, cached: true };
  }
  // 스티커/장식/아이콘 자산은 비용 절감 위해 low 품질로 생성
  const gen = await generateImageForPrompt(buildAssetPrompt(d), { force: opts.force, quality: "low" });
  let cutout = gen.src;
  try {
    cutout = await removeBackground(gen.src, { tolerance: 46 }); // 흰 배경 → 투명
  } catch { /* 누끼 실패 시 원본 유지 */ }
  setCachedAsset(d, cutout);
  return { src: cutout, cached: false };
}

/**
 * v3: 내부 LLM이 놀이주제·놀이명을 분석해 아이콘 subject를 작성 → (있으면) 포스터 레퍼런스 스타일로 생성 → 누끼.
 * cacheId 별로 캐시(같은 주제면 재사용).
 */
export async function getAssetSmart(
  cacheId: string,
  theme: string,
  plays: string[],
  reference?: string | null,
  opts: { force?: boolean } = {}
): Promise<AssetResult & { subject?: string }> {
  const d: AssetDescriptor = { kind: "illustration", key: `smart-${cacheId}`, label: theme, subject: "" };
  if (!opts.force) { const c = getCachedAsset(d); if (c) return { src: c, cached: true }; }
  let subject = "";
  try {
    const r = await fetch("/api/icon-prompt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ theme, plays }) });
    const j = await r.json();
    subject = (j && j.subject) || "";
  } catch { /* ignore */ }
  if (!subject) subject = `a cute clay icon representing ${theme}`;
  const prompt = `${subject}, ${STYLE_SUFFIX}`;
  // 스티커(클레이 아이콘) 자산은 비용 절감 위해 low 품질로 생성
  const gen = await generateImageForPrompt(prompt, { reference: reference || null, force: opts.force, quality: "low" });
  let cutout = gen.src;
  try { cutout = await removeBackground(gen.src, { tolerance: 46 }); } catch { /* keep */ }
  setCachedAsset(d, cutout);
  return { src: cutout, cached: false, subject };
}

// "재생성" — 주어진 subject(있으면) 또는 theme 로 스티커를 매번 새로(force) 생성 → 누끼.
// 캐시하지 않으므로 누를 때마다 다른 변형이 나온다. subject 가 있으면 같은 대상을 재생성, 없으면 theme 기반.
export async function regenerateBySubject(subject: string, opts: { reference?: string | null } = {}): Promise<AssetResult> {
  const subj = (subject && subject.trim()) || "a cute clay icon";
  const prompt = `${subj}, ${STYLE_SUFFIX}`;
  const gen = await generateImageForPrompt(prompt, { reference: opts.reference || null, force: true, quality: "low" });
  let cutout = gen.src;
  try { cutout = await removeBackground(gen.src, { tolerance: 46 }); } catch { /* keep */ }
  return { src: cutout, cached: false };
}
