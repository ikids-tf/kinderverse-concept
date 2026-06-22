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
import { saveAsset } from '@/board/assets';
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
/** 단일 토큰 — 대상 '전체'가 잘리지 않고 프레임 안에 여유 있게(사방 여백). 타이트한 박스는 누끼 후 trimTransparent가 만든다(여기서 꽉 채우면 앞다리·꼬리가 잘림). */
const TOKEN_STYLE = `대상 하나만, 머리·귀부터 꼬리·발끝까지 전체가 절대 잘리지 않고 프레임 안에 여유 있게 다 들어오도록(사방에 넉넉한 여백, 화면을 꽉 채우지 말 것), 화면 가운데에 또렷하게, 다른 사물 없음, ${STYLE_CORE}`;
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
 * "gen:" 토큰을 통일 스타일 + 누끼(투명) 그림으로 채운다 — 각 대상을 '개별' 생성한다(병렬).
 * (한 장→분할 방식은 칸 경계에서 대상이 잘려 폐기. 같은 라벨도 강한 공통 스타일로 일관되게 나온다.)
 * 라벨 없는 이미지·상한 초과분·생성 실패분은 폴백(플레이스홀더/도형).
 */
export async function fillTokenImages(
  raw: RawNode,
  opts: { cutout?: boolean; onBusy?: (m: string | null) => void; theme?: string },
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

  await Promise.all(
    targets.map(async (t) => {
      const img = await genImage(t.label, TOKEN_STYLE);
      await assignImage(t.el, img, doCut);
      // 라이브러리(IDB)에 저장 — 편집 시 '게임 이미지 갤러리'에서 재사용. 실제 PNG만(플레이스홀더 제외).
      const s = t.el.src;
      const uri = s && typeof s === 'object' ? (s as { src?: unknown }).src : undefined;
      if (typeof uri === 'string' && uri.startsWith('data:image/') && !uri.startsWith('data:image/svg')) {
        void saveAsset(t.label, 'image', uri, opts.theme);
      }
    }),
  );
}

/** 주제에 맞는 장면 배경 1장(누끼 없음·풀블리드). 실패 시 null → 색 배경 유지. */
export async function generateSceneBackground(prompt: string, theme?: string): Promise<AssetRef | null> {
  const img = await genImage(prompt, SCENE_STYLE, 1);
  if (!img) return null;
  try {
    const ref = await urlToAssetRef(img, 'generated');
    // 배경도 라이브러리에 저장(재사용) — 태그에 '배경'을 넣어 갤러리/피커가 '배경으로 적용'을 식별.
    if (ref.src.startsWith('data:image/') && !ref.src.startsWith('data:image/svg')) {
      void saveAsset(`${(theme || '게임').slice(0, 24)} 배경`, 'image', ref.src, `배경 ${theme ?? ''}`.trim());
    }
    return ref;
  } catch {
    return null;
  }
}
