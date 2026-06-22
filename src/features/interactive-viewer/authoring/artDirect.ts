/**
 * 아트디렉션 — "gen:라벨" 이미지 요소를 '통일된 스타일 + 누끼(투명)' 그림으로 채운다.
 *
 * 핵심(스크린샷의 "흰 네모 + 제각각 그림체 + 민트 폴백"을 한 번에 해결):
 *  1) 모든 토큰에 같은 스타일 스펙(TOKEN_STYLE) 주입 → 그림체 통일.
 *  2) 똑같아야 하는 세트(동일 라벨 2~6개)는 '한 장'으로 그려 균등 분할 → 완전 동일.
 *  3) 생성 후 배경제거(@/shared/background-removal, 온디바이스)로 흰 배경 제거 → 장면 위에 안착.
 *  4) 실패 시 1회 재시도, 그래도 실패하면 도형 폴백(빈 이미지 방지).
 *
 * 게이트웨이 이미지엔 seed/참조가 없어(시드 고정 불가) '한 장→분할'이 세트 일관성의 핵심이다.
 * 생성은 병렬(네트워크), 누끼는 워커에서 직렬 처리된다. compose/edit 양쪽이 이 모듈만 쓴다.
 */
import { callGateway } from '@/ai/client';
import { urlToAssetRef } from '../runtime/assetIngest';
import { removeBackground, cleanupBackground, warmupBackgroundRemoval } from '@/shared/background-removal';
import type { AssetRef } from '../schema/interactiveNode';

const GEN_PREFIX = 'gen:';
export const MAX_IMAGES = 8; // 한 게임당 토큰 그림 상한(비용/지연 가드)

/** 토큰(개체) 공통 스타일 코어 — 3D 픽사풍·밝은 파스텔, 의인화 금지(교육용 정확성),
    순백 단색 배경·그림자 없음·또렷한 외곽선 = 배경제거(누끼)가 깔끔하게 되도록. */
const STYLE_CORE =
  '3D 픽사풍 귀여운 렌더, 밝은 파스텔 색, 부드럽고 둥근 형태, ' +
  '완전 정면 금지 — 대상의 특징이 가장 잘 드러나는 3/4 측면 각도(동물·생물은 꼬리·다리까지 전신이 다 보이게, 사물·기구·건물은 형태가 분명한 입체 각도), ' +
  '사물·동물은 의인화하지 말 것(사람 얼굴·표정·옷·직립 보행 금지), 실제 모습 그대로 정확하게(아이들이 실제 정보를 배우도록), ' +
  '완전한 순백색 단색 배경, 그림자·바닥·반사 없음, 또렷하고 깨끗한 외곽선, 글자 없음, 유아 친화';
/** 단일 토큰 — 대상이 프레임을 꽉 채우게(여백 최소, 단 잘리지 않고 전체가 보이게) → 표시·편집 시 충분히 크게. */
const TOKEN_STYLE = `대상 하나만 프레임에 꽉 차게 크게(여백 최소·가장자리까지, 단 잘리지 않고 전체가 보이게), 다른 사물 없음, ${STYLE_CORE}`;
/** 장면 배경 — 풀블리드 3D 픽사풍, 은은하게(전경 가독 보호). 누끼하지 않음. */
const SCENE_STYLE =
  '3D 픽사풍 부드러운 배경 장면, 밝은 파스텔 색, 은은하고 단순, 가로 와이드 16:10, 인물·캐릭터·동물 없음, 글자 없음, 가운데는 비워 균형 잡힌 구도';

type RawEl = Record<string, unknown>;
interface RawNode {
  elements?: RawEl[];
  [k: string]: unknown;
}

/** 생성 실패 시 쓰는 부드러운 플레이스홀더(파스텔 그림 타일) — 민트 네모 대신 자연스럽게.
    게임 콘텐츠는 Milray 면제(파스텔 허용) — SVG 데이터 URI라 토큰 대신 직접 색을 쓴다. */
const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
<rect x="10" y="10" width="220" height="220" rx="32" fill="#FBEADF" stroke="#EBB596" stroke-width="3" stroke-dasharray="11 10"/>
<circle cx="92" cy="100" r="20" fill="#F4C9B0"/>
<path d="M40 184 L104 120 L150 166 L176 144 L200 184 Z" fill="#EFD0BD"/>
<circle cx="168" cy="74" r="9" fill="#F2A98A"/></svg>`;
const PLACEHOLDER = 'data:image/svg+xml;utf8,' + encodeURIComponent(PLACEHOLDER_SVG);

/** task 'image' — 실패 시 retries 만큼 재시도. data URI 반환(없으면 null). */
async function genImage(label: string, style: string, retries = 2): Promise<string | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await callGateway({
      task: 'image',
      provider: 'gemini',
      messages: [{ role: 'user', content: label }],
      meta: { prompt: `${label}, ${style}`, caption: label },
    });
    if (res.ok && !res.mocked && res.image) return res.image;
  }
  return null;
}

/**
 * 배경제거(온디바이스) → 매트 정리. RMBG가 만화풍 그림에 남기는 반투명 헤일로(소프트 매트)를
 * cleanupBackground(keepMainOnly)로 깎아 '주 피사체만' 깨끗이 남긴다(흰 사각 잔상 제거).
 * 각 단계는 실패해도 직전 결과로 폴백 — 그림이 사라지지 않게.
 */
async function cutout(dataUri: string): Promise<string> {
  let out = dataUri;
  try {
    const r = await removeBackground(dataUri, { assetKind: 'generated' });
    out = r.dataUrl;
  } catch {
    return dataUri; // 배경제거 자체 실패 → 원본(흰 배경) 유지
  }
  let cleaned = out;
  try {
    cleaned = (await cleanupBackground(out, { keepMainOnly: true })).dataUrl;
  } catch {
    /* 정리 실패 → 1차 누끼 결과 유지 */
  }
  try {
    return await trimTransparent(cleaned); // 투명 여백 크롭 → 대상이 박스에 꽉 차게
  } catch {
    return cleaned;
  }
}

/** 투명 여백을 잘라 대상에 딱 맞게 크롭 — 편집 바운드박스가 대상에 밀착하고 더 크게 보이도록. */
async function trimTransparent(dataUri: string, padRatio = 0.03): Promise<string> {
  const blob = await (await fetch(dataUri)).blob();
  const bmp = await createImageBitmap(blob);
  const cv = document.createElement('canvas');
  cv.width = bmp.width;
  cv.height = bmp.height;
  const ctx = cv.getContext('2d');
  if (!ctx) { bmp.close?.(); return dataUri; }
  ctx.drawImage(bmp, 0, 0);
  bmp.close?.();
  const { data } = ctx.getImageData(0, 0, cv.width, cv.height);
  let minX = cv.width, minY = cv.height, maxX = -1, maxY = -1;
  for (let y = 0; y < cv.height; y++) {
    for (let x = 0; x < cv.width; x++) {
      if (data[(y * cv.width + x) * 4 + 3] > 16) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return dataUri; // 전부 투명 → 그대로
  const pad = Math.round(Math.max(cv.width, cv.height) * padRatio);
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(cv.width - 1, maxX + pad);
  maxY = Math.min(cv.height - 1, maxY + pad);
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  if (w >= cv.width && h >= cv.height) return dataUri; // 자를 여백 없음
  const out2 = document.createElement('canvas');
  out2.width = w;
  out2.height = h;
  const octx = out2.getContext('2d');
  if (!octx) return dataUri;
  octx.drawImage(cv, minX, minY, w, h, 0, 0, w, h);
  return out2.toDataURL('image/png');
}

/** 가로로 늘어선 세트 그림을 n등분(동일 폭)으로 자른다. */
async function sliceRow(dataUri: string, n: number): Promise<string[]> {
  const blob = await (await fetch(dataUri)).blob();
  const bmp = await createImageBitmap(blob);
  const colW = Math.floor(bmp.width / n);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const c = document.createElement('canvas');
    c.width = colW;
    c.height = bmp.height;
    const ctx = c.getContext('2d');
    if (!ctx) break;
    ctx.drawImage(bmp, i * colW, 0, colW, bmp.height, 0, 0, colW, bmp.height);
    out.push(c.toDataURL('image/png'));
  }
  bmp.close?.();
  return out;
}

/** 요소의 src에서 "gen:라벨"을 뽑는다(문자열 또는 {src} 객체 모두 허용). 없으면 null. */
function genLabelOf(el: RawEl): string | null {
  const s = el.src;
  if (typeof s === 'string' && s.startsWith(GEN_PREFIX)) return s.slice(GEN_PREFIX.length).trim();
  if (
    s &&
    typeof s === 'object' &&
    typeof (s as { src?: unknown }).src === 'string' &&
    (s as { src: string }).src.startsWith(GEN_PREFIX)
  ) {
    return (s as { src: string }).src.slice(GEN_PREFIX.length).trim();
  }
  return null;
}

/** data URI(또는 null)를 요소에 적용 — 누끼 후 AssetRef. 생성 실패 시 부드러운 플레이스홀더 그림. */
async function assignImage(el: RawEl, dataUri: string | null, doCutout: boolean): Promise<void> {
  const uri = dataUri ? (doCutout ? await cutout(dataUri) : dataUri) : PLACEHOLDER;
  try {
    el.src = await urlToAssetRef(uri, 'generated');
    el.assetKind = 'generated';
  } catch {
    el.kind = 'shape'; // 최후 폴백(플레이스홀더 적재마저 실패한 극단)
    delete el.src;
  }
}

/**
 * "gen:" 토큰 채우기. sheetSets=true면 동일 라벨 2~6개를 한 장으로 그려 분할(완전 동일).
 * 라벨 없는 이미지·상한 초과분·생성 실패분은 도형 폴백(유효·가시).
 */
export async function fillTokenImages(
  raw: RawNode,
  opts: { sheetSets: boolean; cutout?: boolean; onBusy?: (m: string | null) => void },
): Promise<void> {
  const doCut = opts.cutout ?? true;
  const els = Array.isArray(raw.elements) ? raw.elements : [];
  const targets: Array<{ el: RawEl; label: string }> = [];
  for (const el of els) {
    if (el.kind !== 'image') continue;
    const label = genLabelOf(el);
    if (!label) {
      if (!el.src) { el.kind = 'shape'; delete el.src; } // 그림 지정 없음 → 도형(빈 이미지 방지)
      continue;
    }
    if (targets.length >= MAX_IMAGES) { el.kind = 'shape'; delete el.src; continue; } // 상한 초과
    targets.push({ el, label });
  }
  if (!targets.length) return;
  opts.onBusy?.('그림을 만드는 중…');
  if (doCut) warmupBackgroundRemoval(); // 모델 미리 로드(누끼 대기 단축)

  // 라벨별 그룹(동일 라벨 = 같이 생겨야 하는 세트)
  const groups = new Map<string, Array<{ el: RawEl; label: string }>>();
  for (const t of targets) {
    const k = t.label.toLowerCase();
    let g = groups.get(k);
    if (!g) { g = []; groups.set(k, g); }
    g.push(t);
  }

  const jobs: Array<Promise<void>> = [];
  for (const members of groups.values()) {
    const label = members[0].label;
    if (opts.sheetSets && members.length >= 2 && members.length <= 6) {
      // 세트: 한 장으로 그려 분할 → 각 누끼(완전 동일). 실패 시 멤버별 개별 생성으로 폴백.
      jobs.push(
        (async () => {
          const sheet = await genImage(
            `같은 ${label} ${members.length}개가 한 줄로 균등 간격, 서로 닿지 않게 또렷이 분리, 모두 똑같은 모양과 크기`,
            STYLE_CORE,
          );
          if (!sheet) {
            await Promise.all(members.map(async (m) => assignImage(m.el, await genImage(label, TOKEN_STYLE), doCut)));
            return;
          }
          let slices: string[] = [];
          try { slices = await sliceRow(sheet, members.length); } catch { slices = []; }
          await Promise.all(members.map((m, i) => assignImage(m.el, slices[i] ?? sheet, doCut)));
        })(),
      );
    } else {
      // 단일/대형 세트: 멤버별 개별 생성(스타일 통일)
      for (const m of members) {
        jobs.push((async () => assignImage(m.el, await genImage(label, TOKEN_STYLE), doCut))());
      }
    }
  }
  await Promise.all(jobs);
}

/** 주제에 맞는 장면 배경 1장(누끼 없음·풀블리드). 실패 시 null → 색 배경 유지. */
export async function generateSceneBackground(prompt: string): Promise<AssetRef | null> {
  const img = await genImage(prompt, SCENE_STYLE, 1);
  if (!img) return null;
  try {
    return await urlToAssetRef(img, 'generated');
  } catch {
    return null;
  }
}
