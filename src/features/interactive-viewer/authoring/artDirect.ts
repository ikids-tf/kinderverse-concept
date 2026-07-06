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
const GENF_PREFIX = 'genf:'; // 정면 캐릭터(얼굴 보이게) — dress-up 등. CHARACTER_FRONT_STYLE 사용.
export const MAX_IMAGES = 12; // 한 게임당 '서로 다른' 토큰 그림 상한(비용/지연 가드 — 같은 라벨은 1장 공유)

/** ★ 누끼(배경제거) 최적화 클로즈 — 온디바이스 RMBG가 '주 피사체만' 깔끔히 따도록 생성
    단계에서 강하게 강제한다. 스티커/다이컷처럼 피사체는 100% 불투명, 배경은 완전 평면 순백,
    경계는 칼날 하드 엣지(소프트 매트·글로우·그림자가 반투명 사각 잔상으로 남는 것을 원천 차단). */
const CUTOUT_CLAUSE =
  '★배경제거(누끼)에 최적화된 그림: 스티커·다이컷처럼 피사체를 100% 완전 불투명하게 그리고, ' +
  '배경은 오직 완전한 순백색(#FFFFFF) 평면 단색 한 가지뿐(그라데이션·질감·무늬·점·다른 색 픽셀·옅은 색조 절대 없음), ' +
  '피사체와 배경의 경계는 칼날처럼 선명한 하드 엣지(흐릿한 가장자리·반투명·외곽 글로우/헤일로·소프트포커스·안개·모션블러·번짐·페더링 절대 금지), ' +
  '드롭섀도·접지(바닥) 그림자·반사·비네팅·테두리 박스·액자 절대 없음, 피사체 실루엣이 배경과 또렷한 고대비로 완전히 분리, ' +
  '★특히 피사체 둘레·발밑에 옅은 회색 그림자나 앰비언트 오클루전(어둑한 음영)을 단 한 점도 만들지 말 것 — 3D 렌더라도 피사체를 완전히 평평한 순백 위에 떠 있듯 올려, 외곽 한 픽셀 바깥부터 곧바로 순백(#FFFFFF)이 되게(이 음영이 남으면 누끼 후 외곽 노이즈가 된다)';

/** 토큰(개체) 공통 스타일 코어 — 3D 픽사풍·밝은 파스텔, 의인화 금지(교육용 정확성),
    순백 단색 배경·그림자 없음·또렷한 외곽선 = 배경제거(누끼)가 깔끔하게 되도록.
    ★ 아이 대면 콘텐츠 = 특별 지시 없으면 무조건 밝고 화사하고 예쁘게(어둡거나 칙칙·음침 금지). */
const STYLE_CORE =
  '아이들이 보는 콘텐츠라 늘 밝고 화사하고 예쁘게(어둡거나 칙칙하거나 음침하거나 무서운 느낌 절대 금지), ' +
  '3D 픽사풍 귀여운 렌더, 밝고 화사한 파스텔 색, 부드럽고 둥근 형태, ' +
  '완전 정면 금지 — 대상의 특징이 가장 잘 드러나는 3/4 측면 각도(동물·생물은 꼬리·다리까지 전신이 다 보이게, 사물·기구·건물은 형태가 분명한 입체 각도), ' +
  '사물·동물은 의인화하지 말 것(사람 얼굴·표정·옷·직립 보행 금지), 실제 모습 그대로 정확하게(아이들이 실제 정보를 배우도록), ' +
  '또렷하고 깨끗한 외곽선, 글자 없음, 유아 친화, ' + CUTOUT_CLAUSE;
/** 단일 토큰 — 대상 '전체'가 잘리지 않고 프레임 안에 여유 있게(사방 여백). 타이트한 박스는 누끼 후 trimTransparent가 만든다(여기서 꽉 채우면 앞다리·꼬리가 잘림).
    ★ 대상-불문: '머리·꼬리' 같은 동물 전제 표현을 쓰지 않는다 — 모자·목도리·사물 라벨이 동물/캐릭터로 둔갑하던 버그 차단. */
const TOKEN_STYLE = `요청한 대상 하나만 — 요청한 바로 그 대상을 실제 모습 그대로 정확히 그린다(예: '모자'면 모자, '강아지'면 강아지 — 요청과 다른 엉뚱한 사물·동물로 바꾸지 말 것), ★요청이 옷·티셔츠·바지·점퍼·수영복·신발·모자 등 '의류·소지품'이면 그 물건 한 점만 보기 좋게 그리고(평평하게 펼치거나 살짝 입체로), 그것을 입거나 착용한 사람·어린이·인물·마네킹은 절대 그리지 말 것(옷만, 사람 없이), 대상의 위·아래·좌우 끝까지 전체가 절대 잘리지 않고 프레임 안에 여유 있게(사방에 넉넉한 여백, 화면을 꽉 채우지 말 것), 화면 가운데에 또렷하게, 다른 사물 없음, ${STYLE_CORE}`;
/** 숫자 토큰 — 수 세기·숫자 게임의 번호 아이템. 대상 위에 큰 아라비아 숫자를 또렷하게(‘글자 없음’ 해제). */
const NUMBER_TOKEN_STYLE =
  '대상 하나만, 전체가 잘리지 않고 프레임 안에 여유 있게, 대상 표면(또는 한가운데)에 크고 또렷하며 깔끔한 아라비아 숫자 하나가 분명히 보이게 적혀 있음(숫자 외 다른 글자는 없음), 화면 가운데, 다른 사물 없음, ' +
  STYLE_CORE.replace('글자 없음, ', '');
/** 라벨에 숫자(번호)가 들어간 토큰인가 — 그러면 숫자를 그려 넣는 스타일을 쓴다. */
const isNumberedLabel = (label: string): boolean => /\d/.test(label) || /숫자|번호/.test(label);
/** 정면 토큰 — 주인공(액터)을 시작/끝 정지 상태에서 쓸 '정면(아이를 바라보는)' 자세로 생성. */
const FRONT_TOKEN_STYLE =
  '대상 하나만, 정면(카메라·아이를 바라보는) 귀엽고 또렷한 자세로 좌우 균형 있게, 머리부터 발끝까지 전신이 잘리지 않고 프레임 안에 여유 있게(사방 여백), 화면 가운데, 다른 사물 없음, ' +
  '아이들이 보는 콘텐츠라 늘 밝고 화사하고 예쁘게(어둡거나 칙칙·음침·무서운 느낌 절대 금지), 3D 픽사풍 귀여운 렌더, 밝고 화사한 파스텔 색, 부드럽고 둥근 형태, ' +
  '사물·동물은 의인화하지 말 것(사람 얼굴·표정·옷·직립 보행 금지), 실제 모습 그대로 정확하게, 또렷하고 깨끗한 외곽선, 글자 없음, 유아 친화, ' + CUTOUT_CLAUSE;
/** ★ 모든 아이(어린이) 캐릭터 공통 — '유치원생(만 4~5세)'처럼 아주 어리고 귀엽게.
    초등학생·청소년·다 큰 아이로 그리던 것을 막아, 모든 게임의 아이를 작고 통통한 유아로 통일한다. */
const KID_DESC =
  '★나이·체형: 만 4~5세 유치원생처럼 아주 어리고 귀여운 아이로 그린다 — 머리가 몸에 비해 크고(2.5~3등신 아기 비율), 볼이 통통하고 둥근 얼굴, 크고 동그란 눈, 작은 코와 입, 짧고 통통한 팔다리, 작은 키. ' +
  '초등학생·청소년·키 크고 늘씬한 큰 아이처럼 절대 그리지 말 것(작고 동글동글한 유아 체형의 사랑스러운 아기 같은 인상)';
/** 정면 캐릭터(옷입히기 등) — 아이가 정면을 바라보고, 얼굴이 또렷이 보이며, 요청한 옷차림을 정확히 입은 전신.
    (인물이므로 의인화 금지 같은 사물용 제약은 빼고, '옷 입은 사람'을 자연스럽게 그린다.) */
const CHARACTER_FRONT_STYLE =
  '요청한 인물 한 명만 — 카메라(아이)를 똑바로 바라보는 완전한 정면 자세로 좌우 균형 있게, 머리부터 발끝까지 전신이 잘리지 않고 프레임 안에 여유 있게(사방 여백), 화면 가운데, 다른 사물·배경 없음, ' +
  `${KID_DESC}, ` +
  '★얼굴(두 눈·코·입)이 또렷하고 환하게 보이게 한다 — 모자·후드·목도리·마스크 등이 얼굴(특히 눈)을 가리지 않도록 얼굴을 비워 두고, 정면을 향한 밝고 자연스러운 표정, ' +
  '요청한 옷차림·소품을 몸에 정확히 입은(착용한) 모습으로(공중에 뜬 옷이 아니라 실제로 입은), ' +
  '아이들이 보는 콘텐츠라 늘 밝고 화사하고 예쁘게(어둡거나 무섭지 않게), 3D 픽사풍 귀여운 렌더, 밝고 화사한 파스텔 색, 부드럽고 둥근 형태, 또렷하고 깨끗한 외곽선, 글자 없음, 유아 친화, ' + CUTOUT_CLAUSE;
/** 장면 배경 — 풀블리드 3D 픽사풍, 풍부한 디테일·빛·깊이로 '아름답게'(아이 대면=밝고 예쁘게).
    그 위에 놓일 토큰(아이템)과 같은 화풍으로 어우러지되, 가운데 놀이 영역은 차분히 비워 가독 보호. 누끼 안 함. */
const SCENE_STYLE =
  '3D 픽사·디즈니풍 고퀄리티 동화책 배경 일러스트, 밝고 화사하되 한 색에 치우치지 않은 균형 잡힌 파스텔 팔레트(과도한 빨강·단색 채도 금지 — 노랑·연두·하늘색 등이 산뜻하게 어우러지게), ' +
  '따뜻한 자연광과 부드러운 그림자로 입체감과 빛이 또렷이 느껴지게(역광·공기원근·은은한 빛산란), ' +
  '풍부한 디테일과 깊이감 — 전경·중경·원경 레이어, 다양한 형태의 자연물(똑같은 모양 반복 금지), 주제·계절에 맞는 바닥·환경 디테일을 정성껏(예: 가을이면 낙엽과 함께 나무 밑동의 풀더미·들꽃·이끼 등 소소한 식생), ' +
  '아름답고 생동감 있게 — 단, 어둡거나 칙칙·음침·무서운 분위기는 절대 금지(아이들이 보는 밝고 예쁜 콘텐츠), ' +
  '가로 와이드 16:10, 인물·캐릭터·동물·글자 없음, ' +
  '★가장 중요(바닥): 화면 한가운데 아래(캐릭터가 서는 자리, 가로 중앙 40%·하단 1/3)에는 아무 가구·사물도 두지 말고 — 탁자·소파·의자·침대·러그 위 물건·화분 등을 그 자리에 놓지 말 것 — 평평하고 깨끗한 바닥(마루·잔디·길·모래 등 주제에 맞는 지면)만 비워 둔다. 그래야 그 위에 설 캐릭터가 가구에 겹치거나 공중에 뜨지 않고 바닥에 발을 디딘 것처럼 보인다. ' +
  '가구·소품·식생 등은 화면 양옆과 뒤쪽(배경)으로 배치하고, 중앙 바닥은 캐릭터가 설 수 있게 탁 트이게 한다(하단 전체를 허공·하늘·물 등 설 수 없는 면으로 비우지도 말 것 — 하단 1/3은 닿을 수 있는 평평한 지면)';

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

/** task 'image' — 실패 시 retries 만큼 재시도. data URI 반환(없으면 null).
    재시도 사이 지수 백오프(800→2400ms) — 레이트리밋에 백오프 없이 3연타하면 전부 같은 이유로
    실패해 재시도가 무의미하던 문제 해소(잠깐 쉬면 살아나는 429 계열을 실제로 구제). */
async function genImage(label: string, style: string, retries = 2): Promise<string | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 800 * 3 ** (attempt - 1)));
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
 * 동시성 제한 워커 풀 — 이미지 생성 잡을 concurrency 개씩만 병렬로 돌린다.
 * (전 라벨 Promise.all 동시 발사 → 프로바이더 레이트리밋 연쇄 실패 → 플레이스홀더 다발이 되던
 *  것을 차단. 잡 큐를 워커 while 루프가 나눠 소진 — 총 시간은 소폭 늘지만 성공률이 오른다.)
 * fillTokenImages 외에 place.ts 의 swap/배경/시트 패스도 이 풀을 재사용한다.
 */
export async function runImageJobs(jobs: Array<() => Promise<void>>, concurrency = 3): Promise<void> {
  if (!jobs.length) return;
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      await job();
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, () => worker()));
}

/**
 * 배경제거(온디바이스) → 매트 정리. RMBG가 만화풍 그림에 남기는 반투명 헤일로(소프트 매트)를
 * cleanupBackground(keepMainOnly)로 깎아 '주 피사체만' 깨끗이 남긴다(흰 사각 잔상 제거).
 * 각 단계는 실패해도 직전 결과로 폴백 — 그림이 사라지지 않게.
 */
async function cutout(dataUri: string, gentle = false): Promise<string> {
  let out = dataUri;
  try {
    const r = await removeBackground(dataUri, { assetKind: 'generated' });
    out = r.dataUrl;
  } catch {
    return dataUri; // 배경제거 자체 실패 → 원본(흰 배경) 유지
  }
  let cleaned = out;
  try {
    // gentle=캐릭터(아이): 다리 끊는 강한 오프닝 대신 약하게 + 내부 구멍 닫기(흰옷·내부 면이 깎이지 않게).
    cleaned = (await cleanupBackground(out, { keepMainOnly: true, gentle })).dataUrl;
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

/** 한 장(가로 2컷)을 좌/우 절반 data URI로 자른다 — 액터 정면+측면 2포즈 시트 분할용. */
async function sliceHalves(dataUri: string): Promise<[string, string]> {
  const blob = await (await fetch(dataUri)).blob();
  const bmp = await createImageBitmap(blob);
  const w = bmp.width;
  const h = bmp.height;
  const hw = Math.floor(w / 2);
  const cut = (sx: number, sw: number): string => {
    const cv = document.createElement('canvas');
    cv.width = sw;
    cv.height = h;
    const ctx = cv.getContext('2d');
    if (ctx) ctx.drawImage(bmp, sx, 0, sw, h, 0, 0, sw, h);
    return cv.toDataURL('image/png');
  };
  const left = cut(0, hw);
  const right = cut(hw, w - hw);
  bmp.close?.();
  return [left, right];
}

/**
 * 주인공(액터)의 '정면 + 측면' 2포즈를 '한 장'에 그려(같은 캐릭터 보장) 좌/우로 분할·누끼한다.
 * 게이트웨이 이미지엔 참조/시드가 없어 따로 생성하면 다른 캐릭터가 나오므로 한 장→분할이 일관성의 핵심.
 * 실패 시 null(호출부가 정면 단독 생성으로 폴백).
 */
export async function generateActorPoses(label: string, doCutout: boolean): Promise<{ front: string; side: string } | null> {
  const sheet = await genImage(
    label,
    `흰 배경에 같은 ${label} 캐릭터를 가로로 두 컷 나란히 — ` +
      `왼쪽 칸: 정면(카메라·아이를 똑바로 바라보는) 자세. ` +
      `오른쪽 칸: 완전한 옆모습 측면 프로필 — 머리·코·눈·시선이 모두 또렷하게 화면 오른쪽을 향해(오른쪽으로 걸어가는 듯한 이동 자세), 정면 요소 없이 확실한 사이드뷰. ` +
      `두 컷이 완전히 같은 캐릭터·색·무늬·크기, 가운데 넉넉한 간격으로 분리해 서로 겹치지 않게, ${STYLE_CORE}`,
    1,
  );
  if (!sheet) return null;
  try {
    const [left, right] = await sliceHalves(sheet);
    const front = doCutout ? await cutout(left) : left;
    const side = doCutout ? await cutout(right) : right;
    return { front, side };
  } catch {
    return null;
  }
}

/** 한 장(가로 N컷)을 N개의 data URI로 균등 분할. 캐릭터 시트(같은 아이 여러 착장) 분할용. */
async function sliceN(dataUri: string, n: number): Promise<string[]> {
  const blob = await (await fetch(dataUri)).blob();
  const bmp = await createImageBitmap(blob);
  const w = bmp.width;
  const h = bmp.height;
  const pw = Math.floor(w / n);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const sx = i * pw;
    const sw = i === n - 1 ? w - sx : pw;
    const cv = document.createElement('canvas');
    cv.width = sw;
    cv.height = h;
    const ctx = cv.getContext('2d');
    if (ctx) ctx.drawImage(bmp, sx, 0, sw, h, 0, 0, sw, h);
    out.push(cv.toDataURL('image/png'));
  }
  bmp.close?.();
  return out;
}

/**
 * 캐릭터 시트 — '완전히 같은 한 아이'를 옷차림만 바꿔 가로 N컷 한 장에 그려(시드 없는 모델에서
 * 따로 그리면 얼굴이 다 달라지는 문제 해결) 컷별로 분할·누끼해 돌려준다(라벨 순서 = 반환 순서).
 * 옷입히기처럼 '맨몸 + 여러 착장이 모두 같은 아이'여야 할 때 쓴다. 실패 시 null(호출부가 개별 생성 폴백).
 */
export async function generateCharacterSheet(labels: string[]): Promise<string[] | null> {
  if (labels.length < 2) return null;
  warmupBackgroundRemoval();
  const n = labels.length;
  const panels = labels.map((l, i) => `${i + 1}) ${l}`).join('  ');
  const sheet = await genImage(
    `옷차림만 다른 같은 아이 ${n}컷`,
    `★완전히 똑같은 한 아이(동일한 얼굴·이목구비·머리모양·머리색·피부·체형)를 가로로 ${n}컷 나란히 그린다 — 모든 컷이 같은 인물이고, 옷차림(의상)만 컷마다 다르다: ${panels}. ` +
      `각 컷의 아이는 카메라(정면)를 바라보고, 얼굴(두 눈·코·입)이 또렷하고 환하게 보인다(모자·후드가 얼굴을 가리지 않게). ` +
      `★가장 중요: 머리 끝부터 발끝까지 전신(머리·두 손·두 발 전부)이 절대 잘리지 않게 한 컷 안에 온전히 담는다. 아이를 컷 한가운데에 ‘작게’ 그려(컷 높이의 약 70~75%만 차지) 머리 위·발 아래·양옆(손 바깥)에 넉넉한 빈 여백을 둔다 — 몸·손·발·머리카락이 컷의 위·아래·좌우 가장자리에 닿거나 넘어가면 절대 안 된다. 두 팔은 몸통에 가깝게 자연스럽게 내리고(크게 벌리거나 손을 위로 뻗지 말 것), 두 발은 가지런히 모아 바닥선보다 위에 둔다. ` +
      `컷들은 가로로 정확히 균등한 너비로 나뉘고 각 컷 가운데에 아이가 오며 컷 사이 넉넉한 간격으로 서로 겹치지 않는다. ` +
      `아이들이 보는 콘텐츠라 밝고 화사하고 예쁘게, 3D 픽사풍 귀여운 렌더, 부드럽고 둥근 형태, ${KID_DESC}, ${CUTOUT_CLAUSE}`,
    1,
  );
  if (!sheet) return null;
  try {
    const slices = await sliceN(sheet, n);
    return await Promise.all(slices.map((s) => cutout(s, true)));
  } catch {
    return null;
  }
}

/** 요소 src 문자열(문자열 또는 {src} 객체) — 없으면 null. */
function rawSrc(el: RawEl): string | null {
  const s = el.src;
  if (typeof s === 'string') return s;
  if (s && typeof s === 'object' && typeof (s as { src?: unknown }).src === 'string') return (s as { src: string }).src;
  return null;
}
/** "gen:라벨" 또는 "genf:라벨"(정면)에서 라벨을 뽑는다. 없으면 null. */
function genLabelOf(el: RawEl): string | null {
  const raw = rawSrc(el);
  if (raw?.startsWith(GENF_PREFIX)) return raw.slice(GENF_PREFIX.length).trim();
  if (raw?.startsWith(GEN_PREFIX)) return raw.slice(GEN_PREFIX.length).trim();
  return null;
}
/** genf:(정면 캐릭터·얼굴 보이게) 토큰인가. */
function isFrontEl(el: RawEl): boolean {
  return !!rawSrc(el)?.startsWith(GENF_PREFIX);
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
 * "gen:" 토큰을 통일 스타일 + 누끼(투명) 그림으로 채운다 — 각 대상을 '개별' 생성한다
 * (동시성 3 워커 풀 — 전량 동시 발사로 인한 레이트리밋 연쇄 실패 방지).
 * (한 장→분할 방식은 칸 경계에서 대상이 잘려 폐기. 같은 라벨도 강한 공통 스타일로 일관되게 나온다.)
 * 라벨 없는 이미지·상한 초과분·생성 실패분은 폴백(플레이스홀더/도형).
 * @returns 플레이스홀더(자리그림)로 끝난 '그림 수'(라벨·액터 단위) — 호출부가 성공 메시지에
 *          "그림 N개는 나중에 다시"를 표기해 조용한 성공 위장을 막는다.
 */
export async function fillTokenImages(
  raw: RawNode,
  opts: {
    cutout?: boolean;
    onBusy?: (m: string | null) => void;
    theme?: string;
    frontIds?: Set<string>;
    /** 액터의 측면 포즈(이동 중 사용) 콜백 — 정면은 메인 src, 측면은 별도 저장한다. */
    onActorSide?: (elId: string, sideDataUri: string) => void;
  },
): Promise<number> {
  const doCut = opts.cutout ?? true;
  const els = Array.isArray(raw.elements) ? raw.elements : [];
  // gen:/genf: 이미지 대상 수집(라벨 없는 이미지는 도형 폴백). front=정면 캐릭터(genf).
  type Target = { el: RawEl; label: string; front: boolean; elId: string };
  const all: Target[] = [];
  for (const el of els) {
    if (el.kind !== 'image') continue;
    const label = genLabelOf(el);
    if (!label) {
      if (!el.src) { el.kind = 'shape'; delete el.src; } // 그림 지정 없음 → 도형(빈 이미지 방지)
      continue;
    }
    all.push({ el, label, front: isFrontEl(el), elId: String((el as { id?: unknown }).id ?? '') });
  }
  if (!all.length) return 0;

  // 액터(정면+측면 2포즈)는 개별 생성. 나머지는 '같은 라벨 1회 생성→공유'로 중복 제거 —
  // 예: 꾸미기의 팔레트 썸네일과 캐릭터 위 오버레이가 같은 라벨이면 한 번만 그려 둘 다에 적용
  // (시드가 없어 따로 그리면 서로 다른 그림이 나오던 문제까지 해결 = 팔레트와 입혀진 모습이 일치).
  const fronts = all.filter((t) => opts.frontIds?.has(t.elId));
  const normals = all.filter((t) => !opts.frontIds?.has(t.elId));
  const byLabel = new Map<string, Target[]>();
  for (const t of normals) {
    const key = `${t.front ? 'f:' : ''}${t.label}`; // 정면/일반은 스타일이 달라 분리(같은 라벨이라도)
    const g = byLabel.get(key);
    if (g) g.push(t);
    else byLabel.set(key, [t]);
  }

  // 생성 단위(액터 + distinct 라벨)에 상한 적용 — 초과분은 '무음 도형 강등' 대신 플레이스홀더
  // (자리그림)로 두고 아래에서 onBusy 로 통보한다(어떤 항목이 빠졌는지 보이게 + 나중에 다시 그리게).
  // 우선순위: 액터(필수) → 요소 배열 순 distinct 라벨. 레시피가 제목→액터→놀이 아이템→장식 순으로
  // 요소를 쌓으므로 배열 순서가 곧 '필수 아이템 우선'이다.
  let placeholders = 0; // 플레이스홀더로 끝난 그림 수(상한 초과 + 생성 실패)
  const keptFronts = fronts.slice(0, MAX_IMAGES);
  const overflow: Target[] = [...fronts.slice(MAX_IMAGES)];
  let overCount = fronts.length > MAX_IMAGES ? fronts.length - MAX_IMAGES : 0; // 초과 '그림 수'(라벨·액터 단위)
  let budget = MAX_IMAGES - keptFronts.length;
  const keptLabels: Array<[string, Target[]]> = [];
  for (const entry of byLabel) {
    if (budget > 0) { keptLabels.push(entry); budget--; }
    else { overflow.push(...entry[1]); overCount++; }
  }
  if (overflow.length) {
    opts.onBusy?.(`🖼️ 그림 상한(${MAX_IMAGES}장) 초과 — ${overCount}개는 자리그림으로 두었어요`);
    placeholders += overCount;
    await Promise.all(overflow.map((t) => assignImage(t.el, null, false))); // PLACEHOLDER 배정(네트워크 없음)
  }

  // 진행률 — 교사가 '몇 개 중 몇 개째'인지 보며 기다리게(서로 다른 그림 수 기준).
  const total = keptFronts.length + keptLabels.length;
  let done = 0;
  const tick = () => opts.onBusy?.(`🖼️ 놀이 그림 그리는 중… (${done}/${total})`);
  tick();
  if (doCut) warmupBackgroundRemoval(); // 모델 미리 로드(누끼 대기 단축)

  const saveIfReal = (label: string, uri: unknown) => {
    if (typeof uri === 'string' && uri.startsWith('data:image/') && !uri.startsWith('data:image/svg')) {
      void saveAsset(label, 'image', uri, opts.theme, undefined, 'game');
    }
  };

  // 액터 — 정면+측면 2포즈를 한 장에서 분할 생성(같은 캐릭터). 실패 시 정면 단독 폴백.
  const frontJobs = keptFronts.map((t) => async () => {
    const poses = await generateActorPoses(t.label, doCut);
    if (poses) {
      try {
        t.el.src = await urlToAssetRef(poses.front, 'generated');
        t.el.assetKind = 'generated';
        opts.onActorSide?.(t.elId, poses.side);
      } catch {
        t.el.kind = 'shape';
        delete t.el.src;
      }
    } else {
      const img = await genImage(t.label, FRONT_TOKEN_STYLE);
      if (!img) placeholders++; // 정면 단독 폴백까지 실패 → 플레이스홀더로 끝남
      await assignImage(t.el, img, doCut);
      const s = t.el.src;
      saveIfReal(t.label, s && typeof s === 'object' ? (s as { src?: unknown }).src : undefined);
    }
    done++;
    tick();
  });

  // 일반 토큰 — distinct 라벨당 1회 생성·누끼 → 같은 라벨 요소 전부에 공유 적용.
  const labelJobs = keptLabels.map(([, group]) => async () => {
    const label = group[0].label; // (키엔 front 프리픽스가 붙어 있어 깨끗한 라벨은 group에서)
    const style = group[0].front ? CHARACTER_FRONT_STYLE : isNumberedLabel(label) ? NUMBER_TOKEN_STYLE : TOKEN_STYLE;
    const img = await genImage(label, style);
    if (!img) placeholders++; // 재시도(백오프) 후에도 실패 → 플레이스홀더로 끝남
    const cut = img ? (doCut ? await cutout(img) : img) : null;
    for (const t of group) await assignImage(t.el, cut, false); // 이미 누끼 처리됨(중복 누끼 방지)
    saveIfReal(label, cut); // 라이브러리(IDB) 저장 — 라벨당 1회, 실제 PNG만
    done++;
    tick();
  });

  await runImageJobs([...frontJobs, ...labelJobs]); // 동시성 3 풀 — 레이트리밋 연쇄 실패 방지
  return placeholders;
}

/**
 * 단일 라벨 → 통일 스타일 + 누끼 AssetRef. element 가 아닌 곳(behavior swap.to·프리셋 옵션 등)의
 * 'gen:라벨' 이미지를 채울 때 쓴다(fillTokenImages 는 elements 만 훑으므로 그 사각지대 보강).
 * 실패해도 부드러운 플레이스홀더 ref 를 돌려 '깨진 gen: 문자열'이 렌더되지 않게 한다.
 */
export async function generateCutoutAsset(label: string, doCutout = true, front = false): Promise<AssetRef> {
  if (doCutout) warmupBackgroundRemoval();
  const style = front ? CHARACTER_FRONT_STYLE : isNumberedLabel(label) ? NUMBER_TOKEN_STYLE : TOKEN_STYLE;
  const img = await genImage(label, style);
  const uri = img ? (doCutout ? await cutout(img) : img) : PLACEHOLDER;
  try {
    const ref = await urlToAssetRef(uri, 'generated');
    if (img && ref.src.startsWith('data:image/') && !ref.src.startsWith('data:image/svg')) {
      void saveAsset(label, 'image', ref.src, undefined, undefined, 'game');
    }
    return ref;
  } catch {
    return { id: `swap_${label.slice(0, 8)}`, src: PLACEHOLDER, assetKind: 'generated' };
  }
}

/** data URI → HTMLImageElement(로드 완료). data URI 는 same-origin 이라 캔버스를 오염(taint)시키지 않는다. */
function loadImageEl(uri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load fail'));
    img.src = uri;
  });
}

/** 누끼(투명 배경) 그림 → 실루엣(그림자) data URI. 불투명 영역만 어두운 색으로 채운다(source-in).
    그림자 퀴즈(shadow-quiz)의 '질문'을 정답 그림과 똑같은 형태로 만들기 위함(같은 원본에서 파생). */
export async function toSilhouette(cutoutUri: string, color = '#2B2F3A'): Promise<string> {
  const img = await loadImageEl(cutoutUri);
  const w = img.naturalWidth || 512;
  const h = img.naturalHeight || 512;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) return cutoutUri; // 캔버스 불가 — 원본 유지(최소한 형태는 보임)
  ctx.drawImage(img, 0, 0, w, h);
  ctx.globalCompositeOperation = 'source-in'; // 기존(그림) 알파가 있는 곳에만 채움 → 실루엣
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  return c.toDataURL('image/png');
}

/** 정답 라벨 → { real: 원본 누끼, shadow: 실루엣 } AssetRef 한 쌍. 정답을 '한 번' 그려 그림자와
    정답 그림을 함께 만든다(shadow-quiz — 그림자가 정답 그림과 정확히 일치). 생성 실패 시 null. */
export async function generateShadowPair(label: string): Promise<{ real: AssetRef; shadow: AssetRef } | null> {
  warmupBackgroundRemoval();
  const img = await genImage(label, TOKEN_STYLE);
  if (!img) return null;
  const cut = await cutout(img);
  try {
    const real = await urlToAssetRef(cut, 'generated');
    const shadow = await urlToAssetRef(await toSilhouette(cut), 'generated');
    // 원본(정답 그림)만 라이브러리에 저장 — 실루엣은 파생물이라 저장 안 함.
    if (real.src.startsWith('data:image/') && !real.src.startsWith('data:image/svg')) {
      void saveAsset(label, 'image', real.src, undefined, undefined, 'game');
    }
    return { real, shadow };
  } catch {
    return null;
  }
}

/** 주제에 맞는 장면 배경 1장(누끼 없음·풀블리드). 실패 시 null → 색 배경 유지. */
export async function generateSceneBackground(prompt: string, theme?: string): Promise<AssetRef | null> {
  const img = await genImage(prompt, SCENE_STYLE, 1);
  if (!img) return null;
  try {
    const ref = await urlToAssetRef(img, 'generated');
    // 배경도 라이브러리에 저장(재사용) — 태그에 '배경'을 넣어 갤러리/피커가 '배경으로 적용'을 식별.
    if (ref.src.startsWith('data:image/') && !ref.src.startsWith('data:image/svg')) {
      void saveAsset(`${(theme || '게임').slice(0, 24)} 배경`, 'image', ref.src, `배경 ${theme ?? ''}`.trim(), undefined, 'game');
    }
    return ref;
  } catch {
    return null;
  }
}
