// 놀이기록 → A4 DesignDoc(요소 배열) 빌더.
// 한 벌의 PlayRecordTemplate(payload)을 세 가지 편집 가능한 레이아웃으로 변환한다.
//   - card   : 카드형  (3열 활동 카드 그리드 포스터)
//   - canvas : 캔버스형 (사진 스크랩북 — 자유 배치/회전)
//   - story  : 스토리형 (번호 흐름 인포그래픽 + 정보 칩 + 하단 패널)
// 결과는 DesignFrame(요소 기반 자유 캔버스 에디터)이 그대로 렌더·편집한다.

export const A4 = { W: 794, H: 1123 };

// 레이아웃 버전 — 올리면 기존에 캐시된 디자인 문서(docs)를 최신 레이아웃으로 재생성한다.
export const LAYOUT_VERSION = "2026-07-07-lock-stickers";

const arr = (v) => (Array.isArray(v) ? v.filter((x) => x != null && x !== "") : []);
const has = (v) => v != null && v !== "";

// ── 테마 팔레트 (주제/계절 키워드) ──
// 레퍼런스(클레이 키즈 포스터) 기준: 제목은 모두 딥 네이비, 배지는 깔끔한 단색(흰 글씨),
// 배경은 밝은 크림·파스텔 워시 — 채도 낮고 가벼워 네이비 제목과 클레이 오브젝트가 또렷하게 보인다.
const TITLE_NAVY = "#223160"; // 모든 제목·소제목 공통 딥 네이비
const THEMES = [
  { key: "traffic", test: /교통|안전|신호|횡단|보행|버스|도로|자전거|킥보드|표지/,
    accent: "#3b82d6", title: TITLE_NAVY, badgeBg: "#2f6bc4",
    pageBg: "linear-gradient(155deg,#fdf6e6 0%,#eaf2fc 54%,#e9f6f3 100%)",
    learnBg: "#fdeef0", supportBg: "#e9f6ef", deco: ["🚦", "🚌", "🚸"] },
  { key: "winter", test: /겨울|눈|썰매|얼음|눈사람|크리스마스|루돌프|펭귄/,
    accent: "#4f9ad0", title: TITLE_NAVY, badgeBg: "#3d7fbe",
    pageBg: "linear-gradient(155deg,#eaf3fb 0%,#f6f0e2 60%,#fdfaf4 100%)",
    learnBg: "#eef4fb", supportBg: "#e9f6ef", deco: ["⛄", "❄️", "🦌"] },
  { key: "chuseok", test: /추석|한가위|송편|보름달|한복|차례|명절/,
    accent: "#e0921a", title: TITLE_NAVY, badgeBg: "#c47a16",
    pageBg: "linear-gradient(155deg,#fdf3df 0%,#fcefe0 50%,#eef6e9 100%)",
    learnBg: "#fdf2e2", supportBg: "#eef6e6", deco: ["🌕", "🍂", "🏮"] },
  { key: "eco", test: /환경|지구|재활용|분리수거|에너지|자연보호|식물|텃밭/,
    accent: "#43ad68", title: TITLE_NAVY, badgeBg: "#369356",
    pageBg: "linear-gradient(155deg,#eaf7ec 0%,#f6f2df 55%,#fdfbf3 100%)",
    learnBg: "#fdeef0", supportBg: "#e9f6ec", deco: ["🌱", "🌍", "♻️"] },
  { key: "spring", test: /봄|꽃|새싹|나비|벚꽃/,
    accent: "#e06b9c", title: TITLE_NAVY, badgeBg: "#cf5786",
    pageBg: "linear-gradient(155deg,#fdeef4 0%,#f6eef8 50%,#eafaf0 100%)",
    learnBg: "#fdeaf2", supportBg: "#eafaef", deco: ["🌸", "🌱", "🦋"] },
  { key: "summer", test: /여름|물놀이|바다|모래|수박|얼음|곤충/,
    accent: "#18a8c0", title: TITLE_NAVY, badgeBg: "#1390a6",
    pageBg: "linear-gradient(155deg,#fdf8e6 0%,#e3f4fb 55%,#eafaf7 100%)",
    learnBg: "#eef6fb", supportBg: "#e8f7f0", deco: ["🌊", "🐠", "🍉"] },
  { key: "autumn", test: /가을|단풍|낙엽|허수아비|열매|도토리/,
    accent: "#e07b3a", title: TITLE_NAVY, badgeBg: "#c9692f",
    pageBg: "linear-gradient(155deg,#fdefdc 0%,#fcf3e2 50%,#f3f6e6 100%)",
    learnBg: "#fdefdf", supportBg: "#eef6e6", deco: ["🍁", "🌰", "🍂"] },
  { key: "dino", test: /공룡|화석|쥐라기|티라노|브라키오|스테고/,
    accent: "#4f9e57", title: TITLE_NAVY, badgeBg: "#3f8a48",
    pageBg: "linear-gradient(155deg,#eaf6ea 0%,#f4f2dc 55%,#fdfbf2 100%)",
    learnBg: "#ecf6ea", supportBg: "#fdeef0", deco: ["🦕", "🦖", "🌋"] },
  { key: "shapes", test: /모양|도형|블록|삼각형|사각형|육각형|오각형|원형/,
    accent: "#7a5aa0", title: TITLE_NAVY, badgeBg: "#674a8c",
    pageBg: "linear-gradient(155deg,#f1ecf8 0%,#f6eef3 52%,#fdf8f0 100%)",
    learnBg: "#f2ecf8", supportBg: "#e9f6ef", deco: ["🔷", "🔶", "⭐"] },
  { key: "mart", test: /마트|배달|영수증|가격|세일|상품|장바구니|카트|결제/,
    accent: "#e07a5f", title: TITLE_NAVY, badgeBg: "#c96650",
    pageBg: "linear-gradient(155deg,#fdeee6 0%,#fcf2e6 52%,#fdfaf2 100%)",
    learnBg: "#fdeee8", supportBg: "#eef6e6", deco: ["🛒", "🏷️", "💰"] },
  { key: "media", test: /에너지|미디어|카메라|라디오|컴퓨터|모니터|위성|마이크|방송/,
    accent: "#3f7fd0", title: TITLE_NAVY, badgeBg: "#316bbd",
    pageBg: "linear-gradient(155deg,#eaf1fb 0%,#f1f0f6 52%,#fdfbf4 100%)",
    learnBg: "#eef3fb", supportBg: "#e9f6ef", deco: ["📷", "📺", "🎤"] },
  { key: "default", test: /.*/,
    accent: "#2bb3a3", title: TITLE_NAVY, badgeBg: "#1f9c8d",
    pageBg: "linear-gradient(155deg,#fff5dc 0%,#fde7ee 46%,#e6f5f0 100%)",
    learnBg: "#fdeef1", supportBg: "#e9f6ef", deco: ["🌈", "🎈", "⭐"] },
];

export function themeFor(text) {
  const t = text || "";
  return THEMES.find((th) => th.key !== "default" && th.test.test(t)) || THEMES[THEMES.length - 1];
}

// ── 활동 제목 → 아이콘 이모지 ──
const ICON_MAP = [
  [/횡단보도|건너|보행/, "🚸"], [/신호등|신호/, "🚦"], [/안전벨트|벨트/, "🔒"],
  [/자전거|킥보드|타기|타고/, "🚲"], [/버스|승하차|승차/, "🚌"], [/주차|차도|도로|인도/, "🅿️"],
  [/표지판|표지/, "🚧"], [/구호|외치|약속/, "📣"], [/배려|양보|협력|도와|함께/, "🤝"],
  [/송편/, "🍡"], [/차례|제사/, "🍽️"], [/보름달|소원|달/, "🌕"], [/한복|의상|옷/, "👘"],
  [/노래|음악|부르/, "🎵"], [/선물/, "🎁"], [/이야기|나누|소개|알아보/, "💬"],
  [/음식|먹|요리/, "🍱"], [/윷|제기|투호|전통\s*놀이/, "🪀"], [/사진|찍/, "📷"],
  [/그림|미술|색칠|꾸미/, "🎨"], [/만들|제작|구성/, "🔨"], [/물|바다|모래/, "🌊"],
  [/꽃|식물|나무|자연|텃밭|화분/, "🌿"], [/곤충|벌레|개미|나비/, "🐞"], [/책|그림책|읽/, "📖"],
  [/블록|쌓기/, "🧱"], [/역할|상상/, "🎭"], [/분리수거|쓰레기|재활용/, "♻️"],
  [/전기|에너지|아끼/, "💡"], [/지구|환경/, "🌍"],
];
const FALLBACK_ICONS = ["🧩", "🌈", "⭐", "🎈", "🪁", "🧸", "🌟", "🍀", "🎨"];
function iconFor(title, i) {
  const t = title || "";
  for (const [re, e] of ICON_MAP) if (re.test(t)) return e;
  return FALLBACK_ICONS[i % FALLBACK_ICONS.length];
}

// 레퍼런스(킨더 인포그래픽) 톤의 부드럽고 조화로운 색 — 원색 무지개 대신 파스텔 채도
const CARD_COLORS = [
  "#F4A259", // 따뜻한 앰버
  "#7FB685", // 세이지 그린
  "#6DAEDB", // 스카이 블루
  "#E98EA8", // 로즈 핑크
  "#A78BC9", // 라벤더
  "#EF8E6A", // 소프트 코랄
  "#5FC2B6", // 민트 틸
  "#E9B949", // 허니
  "#8AA9DD", // 페리윙클
  "#CC8FB8", // 모브
  "#7CC4A0", // 제이드
  "#E0855E", // 테라코타
];

// 자유 텍스트 → 문장 리스트
function toItems(text) {
  if (!text) return [];
  return String(text)
    .split(/\n+/)
    .flatMap((s) => s.split(/(?<=[.!?。…])\s+/))
    .map((s) => s.trim())
    .filter(Boolean);
}
function bulletText(text, mark = "•") {
  const items = toItems(text);
  if (!items.length) return text || "";
  return items.map((t) => `${mark} ${t}`).join("\n");
}

// 공백 포함 최대 limit(기본 30)자에서 줄바꿈. 단어 경계를 우선하되 한 단어가 길면 강제로 자른다.
// 기존 줄바꿈(\n)은 보존하고 각 줄을 다시 limit 단위로 접는다.
function wrap30(text, limit = 30) {
  if (!text) return text || "";
  const foldLine = (line) => {
    const words = line.split(" ");
    const out = [];
    let cur = "";
    for (let w of words) {
      while (w.length > limit) {
        // 한 단어가 limit 초과 → 강제 분할
        if (cur) { out.push(cur); cur = ""; }
        out.push(w.slice(0, limit));
        w = w.slice(limit);
      }
      if (!cur) cur = w;
      else if ((cur + " " + w).length <= limit) cur += " " + w;
      else { out.push(cur); cur = w; }
    }
    if (cur) out.push(cur);
    return out.join("\n");
  };
  return String(text).split("\n").map(foldLine).join("\n");
}

// 문장 하나마다 줄바꿈(레퍼런스 본문 스타일). 마침표/물음표/느낌표 단위로 끊는다.
function sentenceLines(text) {
  const items = toItems(text);
  return items.length ? items.join("\n") : (text || "");
}

// 텍스트 영역에 맞춰 자동 줄바꿈 + 폰트 크기 자동 축소 → 잘림/스크롤 없이 전부 보이게.
// (놀이의 흐름·놀이 속 배움·교사의 지원 영역 전용 정책)
function fitFontSize(text, boxW, boxH, base, min = 9, lh = 1.4) {
  const t = String(text || "");
  for (let fs = base; fs >= min; fs -= 0.5) {
    const cpl = Math.max(6, Math.floor(boxW / (fs * 0.92))); // 한글 기준 한 줄 글자 수
    let lines = 0;
    for (const para of t.split("\n")) lines += Math.max(1, Math.ceil((para.length || 1) / cpl));
    if (lines * fs * lh <= boxH) return fs;
  }
  return min;
}

// ── 요소 팩토리 (id 는 build 마다 유일) ──
function maker() {
  let n = 0;
  const id = (p) => `${p}${n++}`;
  return {
    bg: (style) => ({ id: id("bg"), type: "shape", x: 0, y: 0, w: A4.W, h: A4.H, locked: true, style: { radius: 0, ...style } }),
    shape: (x, y, w, h, style) => ({ id: id("s"), type: "shape", x, y, w, h, style }),
    text: (x, y, w, h, text, style, extra = {}) => ({ id: id("t"), type: "text", x, y, w, h, text, style, ...extra }),
    photo: (x, y, w, h, src, style = {}, extra = {}) => ({
      id: id("p"), type: "photo", x, y, w, h, src: src || null, fit: "cover",
      style: { bg: "#eee7df", radius: 14, shadow: "0 6px 16px rgba(0,0,0,0.14)", ...style }, ...extra,
    }),
    emoji: (x, y, size, ch, rot) => ({
      id: id("e"), type: "text", x, y, w: Math.round(size * 1.5), h: Math.round(size * 1.5),
      text: ch, rotation: rot, sticker: true, style: { fontSize: size, align: "center", valign: "center" },
    }),
  };
}

const TITLE_FONT = "'ONE Mobile POP', sans-serif";
const HEAD_FONT = "'Cafe24Ssurround', sans-serif";
const BODY_FONT = "'SUIT', sans-serif";
// 소제목(놀이의 흐름·배움·지원 등) 전용 — 둥글고 또렷한 Jua 로 포인트
const LABEL_FONT = "'Jua', 'Cafe24Ssurround', sans-serif";

// ── 장식 스티커 ──
const KIDS_STICKERS = ["⭐", "✨", "💛", "💚", "🩵", "🌈", "🎈", "☁️", "💗", "🌟"];
const SHAPE_STICKERS = ["🔺", "🔵", "🟡", "🟢", "🟠", "💗", "⭐", "🔶", "💜", "🧡", "💛", "💚"];
// 크기 강약: 큰/작은 섞어 배치(레퍼런스의 큰 마스코트 + 작은 눈송이/점). 에셋 로드 여부와 무관하게 크기만 결정.
const STICKER_SIZES = [78, 40, 66, 34, 72, 46, 50, 36, 38];
const STICKER_MAXBOX = Math.round(78 * 1.5);

// 두 사각형이 겹치는지(여백 pad 포함)
function rectsOverlap(a, b, pad = 0) {
  return a.x - pad < b.x + b.w && a.x + a.w + pad > b.x && a.y - pad < b.y + b.h && a.y + a.h + pad > b.y;
}
// 스티커가 피해야 할 영역 — 텍스트만(사진 위에는 올라가도 됨: 레퍼런스처럼 이미지 위/여백 배치 허용)
function occupiedRects(els) {
  return els
    .filter((e) => e.type === "text" && !e.locked)
    .map((e) => ({ x: e.x, y: e.y, w: e.w, h: e.h }));
}
// 후보 지점: ① 가장자리(좌·우 세로 + 상·하 가로) 우선, ② 내부 그리드(가장자리가 막히면 빈 곳 채움).
// 충돌 회피는 scatterStickers 에서 처리하므로 후보는 넉넉히 두고 빈 곳만 골라 쓴다.
function stickerCandidates(boxW) {
  const e = 6, left = [], right = [], horiz = [], grid = [];
  for (let y = 92; y <= A4.H - boxW - 24; y += 112) {
    left.push({ x: e, y });
    right.push({ x: A4.W - boxW - e, y });
  }
  for (let x = 150; x <= A4.W - boxW - 150; x += 150) {
    horiz.push({ x, y: 2 });
    horiz.push({ x, y: A4.H - boxW - 2 });
  }
  for (let y = 92; y <= A4.H - boxW - 24; y += 44) {
    for (let x = 30; x <= A4.W - boxW - 24; x += 54) grid.push({ x, y });
  }
  const edge = [];
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    if (left[i]) edge.push(left[i]);
    if (right[i]) edge.push(right[i]);
  }
  return [...edge, ...horiz, ...grid];
}
// 배치된 모든 스티커를 stickerAsset 으로 태깅 → 에디터가 기존 에셋 재사용(없으면 생성)으로 이미지 교체.
// 즉시 표시용 placeholder 는 주제 이모지(deco). 텍스트는 피하되 이미지 위/여백 배치 허용, 크기 강약, 스티커끼리 안 겹침.
function scatterStickers(m, theme, n, themeLabel = "", occupied = []) {
  const deco = theme.deco || [];
  const cands = stickerCandidates(STICKER_MAXBOX);
  const placed = [];
  const out = [];
  for (const c of cands) {
    if (out.length >= n) break;
    const i = out.length;
    const size = STICKER_SIZES[i % STICKER_SIZES.length];
    const boxW = Math.round(size * 1.5);
    const rect = { x: c.x, y: c.y, w: boxW, h: boxW };
    if (rect.x < 0 || rect.y < 0 || rect.x + boxW > A4.W || rect.y + boxW > A4.H) continue;
    if (occupied.some((o) => rectsOverlap(rect, o, 8))) continue; // 텍스트 회피
    if (placed.some((o) => rectsOverlap(rect, o, 8))) continue; // 스티커끼리 회피
    const ch = deco.length ? deco[i % deco.length] : KIDS_STICKERS[i % KIDS_STICKERS.length];
    const rot = (i % 2 === 0 ? -1 : 1) * (6 + (i % 3) * 3);
    const el = m.emoji(c.x, c.y, size, ch, rot);
    el.stickerAsset = { themeKey: theme.key, themeLabel: themeLabel || theme.key, idx: i };
    out.push(el);
    placed.push(rect);
  }
  return out;
}

// 캔버스형 고정 스티커 배치 — 디자이너가 편집한 배치/크기/회전을 디폴트로 고정.
// (좌표·size·rot 불변. theme=true 는 큰 마스코트, x 음수는 의도적 가장자리 오버행)
const CANVAS_STICKER_SPOTS = [
  { x: 564, y: 700, size: 78, rot: 2, theme: true },
  { x: 531, y: 254, size: 66, rot: 9, theme: true },
  { x: 671, y: 428, size: 72, rot: -12, theme: true },
  { x: 642, y: 810, size: 127, rot: 6 },
  { x: 401, y: 243, size: 72, rot: -22 },
  { x: 272, y: 694, size: 153, rot: 2 },
  { x: -26, y: 388, size: 116, rot: -6 },
  { x: 268, y: 80, size: 103, rot: 9 },
  { x: 164, y: 90, size: 99, rot: -12 },
];
function placeFixedStickers(m, theme, themeLabel, spots) {
  const deco = theme.deco || [];
  // 좌표·크기·회전 고정. 모든 spot 을 기존 에셋 로드 대상으로(없으면 생성). placeholder 는 주제 이모지.
  return spots.map((s, i) => {
    const ch = deco.length ? deco[i % deco.length] : KIDS_STICKERS[i % KIDS_STICKERS.length];
    const rot = s.rot ?? (i % 2 === 0 ? -1 : 1) * (6 + (i % 3) * 3);
    const el = m.emoji(s.x, s.y, s.size, ch, rot);
    el.stickerAsset = { themeKey: theme.key, themeLabel: themeLabel || theme.key, idx: i };
    return el;
  });
}

// 영유아 발화 말풍선 (빈 공간에 따뜻함 더하기) — 도형(테두리) + 아이 이모지 + 인용문
function speechBubble(m, x, y, w, text, color, h = 66) {
  return [
    m.shape(x, y, w, h, { bg: "#fffdfb", radius: 18, stroke: color, strokeWidth: 2, shadow: "0 4px 12px rgba(60,50,40,0.10)" }),
    m.emoji(x + 8, y + h / 2 - 17, 26, "🧒", -4),
    m.text(x + 44, y + 8, w - 54, h - 16, `“${text}”`, { fontSize: 13, fontFamily: BODY_FONT, color, align: "left", valign: "center" }),
  ];
}

// 상/하단 컬러 도형 스티커 띠 (스토리형 — 레퍼런스의 모서리 도형 보더)
function shapeBorder(m, rows = ["top"]) {
  const els = [], n = 11, gap = (A4.W - 24) / (n - 1);
  for (let i = 0; i < n; i++) {
    const x = Math.round(12 + i * gap - 13);
    if (rows.includes("top")) els.push(m.emoji(x, 2, 24, SHAPE_STICKERS[i % SHAPE_STICKERS.length], 0));
    if (rows.includes("bottom")) els.push(m.emoji(x, A4.H - 32, 24, SHAPE_STICKERS[(i + 4) % SHAPE_STICKERS.length], 0));
  }
  return els;
}

// 공통 데이터 추출
function read(payload) {
  const d = payload || {};
  return {
    title: d?.header?.title || d?.meta?.theme || "우리반 놀이기록",
    subtitle: d?.header?.subtitle || "",
    intro: d?.introduction?.text || "",
    activities: arr(d.activities),
    learning: d?.learning || { title: "놀이 속 배움", text: "" },
    support: d?.teacherSupport || { title: "교사의 지원", text: "" },
    meta: d?.meta || {},
    className: d?.className || "",
    month: d?.month || "",
    photos: arr(d.photos),
  };
}

const doc = (title, bg, elements) => ({
  output_type: "DesignDoc", title, frame: { w: A4.W, h: A4.H, bg }, elements,
});

// ════════════════════════════ 카드형 ════════════════════════════
// 활동 수(3~8)에 맞춘 2열 매거진 카드 — 카드마다 사진 + 아이콘 + 제목 + 요약.
// 카드형 겨울 주제 고정 스티커(사용자 큐레이션 기준). A4 794×1123.
// 캐릭터: 돋보기아이(1)·펭귄(2 大)·벙어리장갑(6) / 오브제: 눈송이(gen-4 ×2)·솔방울(deco-13 大)·코너 가지(deco-9)
const CARD_WINTER_STICKERS = [
  { src: "/assets/deco/stk-winter-9.png", x: 591, y: 27, w: 214, h: 214, rot: 0, flip: false },     // 우상단 코너 나뭇가지
  { src: "/assets/deco/stk-winter-9.png", x: -18, y: 8, w: 214, h: 214, rot: 0, flip: true },       // 좌상단 코너 나뭇가지(반전)
  { src: "/generated-assets/stk-winter-4.png", x: 492, y: 6, w: 86, h: 86, rot: -8, flip: false },  // 눈송이(상단 우)
  { src: "/generated-assets/stk-winter-4.png", x: 140, y: 93, w: 86, h: 86, rot: -8, flip: false }, // 눈송이(상단 좌)
  { src: "/generated-assets/stk-winter-6.png", x: 685, y: 234, w: 86, h: 86, rot: 10, flip: false },// 빨간 벙어리장갑(우측)
  { src: "/generated-assets/stk-winter-1.png", x: 567, y: 60, w: 120, h: 120, rot: -6, flip: false },// 돋보기 아이(상단 우, 제목 옆)
  { src: "/generated-assets/stk-winter-2.png", x: 172, y: 611, w: 164, h: 164, rot: 6, flip: true }, // 펭귄(좌측 중하, 大)
  { src: "/assets/deco/stk-winter-13.png", x: 627, y: 832, w: 157, h: 157, rot: 8, flip: false },    // 솔방울(우하단, 大 — 회전 bbox 우측 794 안으로 당김)
];

// 카드형 공통 본문 — 스티커 배치만 placeStickers(m, th, els, c) 콜백으로 주입(주제별 분리).
function buildCardBase(payload, placeStickers) {
  const c = read(payload);
  const th = themeFor(`${c.meta.theme} ${c.title}`);
  const m = maker();
  const els = [m.bg({ bg: th.pageBg })];
  const M = 46, W = A4.W;

  // 헤더
  els.push(m.shape(W / 2 - 105, 34, 210, 40, { bg: th.badgeBg, radius: 999 }));
  els.push(m.text(W / 2 - 105, 34, 210, 40, "우리반 놀이기록", { fontSize: 18, fontFamily: LABEL_FONT, color: "#fff", align: "center", valign: "center" }));
  els.push(m.text(M, 84, W - 2 * M, 74, c.title, { fontSize: 54, fontFamily: TITLE_FONT, color: th.title, align: "center", valign: "center" }, { textRole: "title" }));
  if (has(c.subtitle)) els.push(m.text(M, 162, W - 2 * M, 26, c.subtitle, { fontSize: 16, fontFamily: LABEL_FONT, color: th.badgeBg, align: "center", valign: "center" }));
  if (has(c.intro)) els.push(m.text(M + 30, 190, W - 2 * M - 60, 62, sentenceLines(c.intro), { fontSize: 16, fontFamily: BODY_FONT, color: "#5a5048", align: "center", valign: "top" }));

  // 활동 카드 — 사진 슬롯 최소 9개(3열×3행), 사진은 4:3 비율. 요약은 박스에 맞춰 전부 노출.
  const acts = c.activities.length ? c.activities : [{ title: c.title, summary: c.intro }];
  const N = 9; // 사진 슬롯 9개 고정(활동이 적으면 빈 슬롯은 사진 자리)
  const cols = 3, gap = 12, gridTop = 258;
  const rows = Math.ceil(N / cols);
  const cardW = Math.floor((W - 2 * M - (cols - 1) * gap) / cols);
  const panelH = 134, gridBottom = A4.H - panelH - 18;
  const rowH = Math.min(232, Math.floor((gridBottom - gridTop - (rows - 1) * gap) / rows));
  const photoW = cardW - 20, photoH = Math.round(photoW * 0.75); // 4:3
  for (let i = 0; i < N; i++) {
    const a = acts[i] || {};
    const col = i % cols, row = Math.floor(i / cols);
    const x = M + col * (cardW + gap), y = gridTop + row * (rowH + gap);
    const color = CARD_COLORS[i % CARD_COLORS.length];
    els.push(m.shape(x, y, cardW, rowH, { bg: "#ffffff", radius: 18, shadow: "0 6px 16px rgba(60,50,40,0.12)" }));
    els.push(m.photo(x + 10, y + 10, photoW, photoH, c.photos[i] || null, { radius: 12 }));
    const ty = y + photoH + 16;
    els.push(m.shape(x + 12, ty, 26, 26, { bg: color, radius: 8 }));
    els.push(m.text(x + 12, ty, 26, 26, iconFor(a.title, i), { fontSize: 15, align: "center", valign: "center" }));
    els.push(m.text(x + 44, ty - 1, cardW - 56, 28, a.title || `놀이 ${i + 1}`, { fontSize: 14, fontFamily: LABEL_FONT, color, align: "left", valign: "center" }, { textRole: "title" }));
    if (has(a.summary)) {
      const sw = cardW - 28, sh = rowH - photoH - 50;
      els.push(m.text(x + 14, ty + 32, sw, sh, a.summary, { fontSize: fitFontSize(a.summary, sw, sh, 12), fontFamily: BODY_FONT, color: "#5a5048", align: "left", valign: "top" }));
    }
  }

  // 하단 2패널 (배움 / 지원) — 하단 고정
  const py = A4.H - panelH - 22;
  const pw = Math.floor((W - 2 * M - gap) / 2), ph = panelH;
  const panel = (px, bg, title, body) => {
    els.push(m.shape(px, py, pw, ph, { bg, radius: 18 }));
    els.push(m.text(px + 20, py + 16, pw - 40, 28, title, { fontSize: 19, fontFamily: LABEL_FONT, color: th.title, align: "left", valign: "center" }, { textRole: "title" }));
    const tw = pw - 40, tht = ph - 60;
    const fs = fitFontSize(body, tw, tht, 13); // 박스에 맞춰 전부 보이게
    els.push(m.text(px + 20, py + 48, tw, tht, body, { fontSize: fs, fontFamily: BODY_FONT, color: "#4d453d", align: "left", valign: "top" }));
  };
  panel(M, th.learnBg, `♥ ${c.learning.title || "놀이 속 배움"}`, c.learning.text);
  panel(M + pw + gap, th.supportBg, `✓ ${c.support.title || "교사의 지원"}`, c.support.text);

  // 스티커 배치는 주제별 콜백으로 주입
  els.push(...placeStickers(m, th, els, c));
  return doc(c.title, th.pageBg, els);
}

// 기본 카드(모든 주제 적응) — 팔레트는 themeFor, 스티커는 자동 산포
export function buildCardDoc(payload) {
  return buildCardBase(payload, (m, th, els, c) => scatterStickers(m, th, 9, c.meta.theme || c.title, occupiedRects(els)));
}
// 겨울 전용 카드 — 레퍼런스 고정 겨울 스티커
export function buildCardWinterDoc(payload) {
  return buildCardBase(payload, () => CARD_WINTER_STICKERS.map((s, i) => ({
    id: `cstk${i}`, type: "image", src: s.src, fit: "contain", sticker: true,
    x: s.x, y: s.y, w: s.w, h: s.h, rotation: s.rot ?? 0,
    flipH: s.flip || undefined, style: { radius: 0 },
  })));
}

// ════════════════════════════ 캔버스형 ════════════════════════════
// 사진 스크랩북: 큰 제목 + 소개 + 흩어진(약간 회전) 사진 + 마스코트 + 하단 3블록
// 좌상단(x<388, y<450)은 제목·소개 텍스트 전용 → 사진은 우측 칼럼 + 하단 밴드에만 배치(텍스트와 안 겹침)
// 모두 4:3 비율(h = w*0.75). 좌상단은 제목·소개 텍스트 전용 → 사진은 우측 칼럼 + 하단 밴드.
const SCATTER = [
  { x: 438, y: 38, w: 300, h: 225, r: 2 },   // 우측 상 4:3
  { x: 438, y: 286, w: 300, h: 225, r: -3 }, // 우측 하 4:3
  { x: 44, y: 540, w: 224, h: 168, r: -4 },  // 하단 좌 4:3
  { x: 282, y: 540, w: 224, h: 168, r: 3 },  // 하단 중 4:3
  { x: 520, y: 540, w: 224, h: 168, r: -2 }, // 하단 우 4:3
];
// 캔버스형(스크랩북) — 레퍼런스 톤: 따뜻한 크림 종이 배경 + 2톤 제목 + 칩 라벨/밝은 본문 박스
const CANVAS_BG = "linear-gradient(165deg,#f7f0e0 0%,#f1e7d2 58%,#efe5cf 100%)";
export function buildCanvasDoc(payload) {
  const c = read(payload);
  const th = themeFor(`${c.meta.theme} ${c.title}`);
  const m = maker();
  const els = [m.bg({ bg: CANVAS_BG })];
  const M = 56;

  // 제목 — 2톤(첫 줄 네이비 + 둘째 줄 accent), 레퍼런스의 "겨울/놀이" 처럼
  const words = c.title.split(/\s+/);
  const half = Math.ceil(words.length / 2);
  const line1 = words.slice(0, half).join(" ");
  const line2 = words.length > 1 ? words.slice(half).join(" ") : "";
  els.push(m.text(M, 52, 360, 92, line1, { fontSize: 70, fontFamily: TITLE_FONT, color: th.title, align: "left", valign: "top" }, { textRole: "title" }));
  if (line2) els.push(m.text(M, 142, 360, 92, line2, { fontSize: 70, fontFamily: TITLE_FONT, color: th.accent, align: "left", valign: "top" }, { textRole: "title" }));
  const introY = line2 ? 250 : 158;
  if (has(c.subtitle)) els.push(m.text(M + 4, introY, 330, 28, c.subtitle, { fontSize: 16, fontFamily: LABEL_FONT, color: th.badgeBg, align: "left", valign: "center" }));
  if (has(c.intro)) els.push(m.text(M + 4, introY + 36, 332, 158, c.intro, { fontSize: fitFontSize(c.intro, 332, 158, 24), fontFamily: BODY_FONT, color: "#5b5246", align: "left", valign: "top" }));

  // 사진 (없으면 빈 슬롯) — 레퍼런스처럼 두꺼운 흰 폴라로이드 테두리 + 그림자
  SCATTER.forEach((p, i) => {
    els.push(m.photo(p.x, p.y, p.w, p.h, c.photos[i] || null, { bg: "#ffffff", radius: 10, stroke: "#ffffff", strokeWidth: 16, shadow: "0 10px 24px rgba(40,30,20,0.2)" }, { rotation: p.r }));
  });

  // 유아 발화 말풍선(최대 2개) — 사진 위에 살짝 올려 따뜻하게
  const cq = c.activities.flatMap((a) => arr(a?.childQuotes)).filter(Boolean).slice(0, 2);
  const cqSpots = [{ x: 446, y: 214 }, { x: 290, y: 548 }];
  cq.forEach((q, i) => { if (cqSpots[i]) els.push(...speechBubble(m, cqSpots[i].x, cqSpots[i].y, 200, q, th.badgeBg, 48)); });

  // 하단 블록 — 배움/지원 (놀이의 흐름은 상단 소개와 중복이라 제외). 차분한 베이지 라벨.
  const PILL_BG = "#e3d9c4", PILL_TX = "#6f6149"; // 약화된 라벨(베이지)
  const blocks = [
    { label: c.learning.title || "놀이 속 배움", text: c.learning.text },
    { label: c.support.title || "교사의 지원", text: c.support.text },
  ];
  const bw = A4.W - 2 * M, pillW = 128, textH = 80, bgap = 10;
  const totalH = blocks.length * (34 + textH) + bgap * (blocks.length - 1);
  let by = A4.H - 22 - totalH;
  blocks.forEach((b) => {
    els.push(m.shape(M, by, pillW, 30, { bg: PILL_BG, radius: 15 }));
    els.push(m.text(M, by, pillW, 30, b.label, { fontSize: 15, fontFamily: LABEL_FONT, color: PILL_TX, align: "center", valign: "center" }, { textRole: "title" }));
    els.push(m.shape(M, by + 34, bw, textH, { bg: "#fffdf7cc", radius: 12, stroke: "#e7dcc4", strokeWidth: 1.5 }));
    // 텍스트 영역에 맞춰 줄바꿈 + 폰트 자동맞춤 → 잘림/스크롤 없이 전부 노출
    const fs = fitFontSize(b.text, bw - 32, textH - 14, 13.5);
    els.push(m.text(M + 16, by + 41, bw - 32, textH - 14, b.text, { fontSize: fs, fontFamily: BODY_FONT, color: "#5a5046", align: "left", valign: "top" }));
    by += 34 + textH + bgap;
  });

  els.push(...placeFixedStickers(m, th, c.meta.theme || c.title, CANVAS_STICKER_SPOTS));
  return doc(c.title, CANVAS_BG, els);
}

// ════════════════════════════ 캔버스형 1 (여름 바다 — 디자이너 큐레이션) ════════════════════════════
// Claude Design '여름 놀이기록(캔버스형)' 을 A4 794×1123 로 환산한 고정 템플릿.
//   구성: 바다 스티커 20 + 보케 점 7 + 2톤 제목 + 정보바 + 3×3 사진 + 아이들의 말(말풍선 3) + 하단 기록칸 3.
//   에셋: /generated-assets/summer-record/stk-1..20.png (번들 원본에서 추출, 좌표는 1054×1492 → ×0.753 환산).
const SUMMER_BG = "#FEFDFA";
const SUMMER_JUA = "'Jua', sans-serif";
// 스티커 z:3 = 사진/본문 위로 올라오는 전경(레퍼런스 z-index:3), 나머지는 배경.
const SUMMER_STICKERS = [
  { src: "/generated-assets/summer-record/stk-1.png", x: 4, y: 19, w: 200, h: 207 },
  { src: "/generated-assets/summer-record/stk-2.png", x: 599, y: 19, w: 185, h: 143 },
  { src: "/generated-assets/summer-record/stk-3.png", x: 194, y: 147, w: 84, h: 84 },
  { src: "/generated-assets/summer-record/stk-4.png", x: 536, y: 129, w: 148, h: 109 },
  { src: "/generated-assets/summer-record/stk-5.png", x: 687, y: 215, w: 104, h: 83 },
  { src: "/generated-assets/summer-record/stk-6.png", x: 9, y: 303, w: 87, h: 139 },
  { src: "/generated-assets/summer-record/stk-7.png", x: 687, y: 360, w: 104, h: 81 },
  { src: "/generated-assets/summer-record/stk-8.png", x: 6, y: 461, w: 110, h: 120 },
  { src: "/generated-assets/summer-record/stk-9.png", x: 661, y: 483, w: 128, h: 109 },
  { src: "/generated-assets/summer-record/stk-10.png", x: 2, y: 619, w: 74, h: 113 },
  { src: "/generated-assets/summer-record/stk-11.png", x: 47, y: 676, w: 136, h: 135, z: 3 },
  { src: "/generated-assets/summer-record/stk-12.png", x: 646, y: 611, w: 143, h: 135 },
  { src: "/generated-assets/summer-record/stk-13.png", x: 634, y: 717, w: 95, h: 83, z: 3 },
  { src: "/generated-assets/summer-record/stk-14.png", x: 235, y: 732, w: 60, h: 56, z: 3 },
  { src: "/generated-assets/summer-record/stk-15.png", x: 351, y: 727, w: 105, h: 87, z: 3 },
  { src: "/generated-assets/summer-record/stk-16.png", x: 464, y: 739, w: 72, h: 72, z: 3 },
  { src: "/generated-assets/summer-record/stk-17.png", x: 702, y: 837, w: 87, h: 87, z: 3 },
  { src: "/generated-assets/summer-record/stk-18.png", x: 17, y: 1033, w: 90, h: 90, z: 3 },
  { src: "/generated-assets/summer-record/stk-19.png", x: 401, y: 1021, w: 121, h: 102, z: 3 },
  { src: "/generated-assets/summer-record/stk-20.png", x: 710, y: 1018, w: 83, h: 105, z: 3 },
];
const SUMMER_DOTS = [[173, 45, 17], [203, 90, 10], [580, 83, 14], [757, 143, 12], [654, 265, 15], [17, 858, 17], [761, 760, 14]];
const SUMMER_GRID = { cols: [90, 300, 509], rows: [298, 465, 632], w: 194, h: 157 };

export function buildCanvasSummerDoc(payload) {
  const c = read(payload);
  const m = maker();
  const els = [m.bg({ bg: SUMMER_BG })];
  const stk = (s, id) => els.push({
    id, type: "image", src: s.src, fit: "contain", sticker: true,
    x: s.x, y: s.y, w: s.w, h: s.h, rotation: 0, style: { radius: 0 },
  });

  // 보케 점(연한 물방울) — shape bg 에 radial-gradient 직접 지정
  SUMMER_DOTS.forEach(([x, y, d], i) => els.push(m.shape(x, y, d, d, { bg: "radial-gradient(circle at 32% 30%,#fff,#bfe2f7 70%)", radius: Math.round(d / 2) })));
  // 배경 스티커(z 없음) — 사진/본문 뒤
  SUMMER_STICKERS.forEach((s, i) => { if (!s.z) stk(s, `sbg${i}`); });

  // 제목 — 2톤(계단식) 파랑 + 흰 외곽선. 렌더러 line-height(1.35) 상 두 줄을 각각 단일 라인 박스로 쌓음.
  const words = (c.title || "여름 바다 놀이기록").split(/\s+/);
  const half = Math.ceil(words.length / 2);
  const line1 = words.slice(0, half).join(" ");
  const line2 = words.length > 1 ? words.slice(half).join(" ") : "";
  const tStyle = { fontSize: 68, fontFamily: SUMMER_JUA, color: "#3f74d1", align: "center", valign: "center", stroke: "#ffffff", strokeWidth: 5 };
  if (line2) {
    els.push(m.text(188, 20, 422, 80, line1, tStyle, { textRole: "title" }));
    els.push(m.text(188, 98, 422, 80, line2, tStyle, { textRole: "title" }));
  } else {
    els.push(m.text(188, 55, 422, 90, line1, tStyle, { textRole: "title" }));
  }
  // 부제 — ★ 포인트
  const sub = has(c.subtitle) ? c.subtitle : "신나는 바다 속 탐험!";
  els.push(m.text(188, 197, 422, 34, `★ ${sub}`, { fontSize: 26, fontFamily: SUMMER_JUA, color: "#4a78d0", align: "center", valign: "center" }));

  // 정보바 — 흰 알약 + 놀이기간(파랑)/담임교사(노랑) 배지 + 편집 칸
  els.push(m.shape(121, 259, 527, 35, { bg: "#ffffff", radius: 18, stroke: "#cfe3f4", strokeWidth: 2, shadow: "0 2px 5px rgba(90,130,180,.08)" }));
  els.push(m.shape(131, 264, 74, 24, { bg: "#6fb7e8", radius: 12 }));
  els.push(m.text(131, 264, 74, 24, "놀이기간", { fontSize: 14, fontFamily: SUMMER_JUA, color: "#fff", align: "center", valign: "center" }));
  els.push(m.text(213, 264, 260, 24, has(c.month) ? c.month : "년   월   일   ~   년   월   일", { fontSize: 14, fontFamily: BODY_FONT, color: "#5a6b7a", align: "left", valign: "center" }));
  els.push(m.shape(487, 264, 74, 24, { bg: "#f6c445", radius: 12 }));
  els.push(m.text(487, 264, 74, 24, "담임교사", { fontSize: 14, fontFamily: SUMMER_JUA, color: "#fff", align: "center", valign: "center" }));
  els.push(m.text(567, 264, 74, 24, "", { fontSize: 14, fontFamily: BODY_FONT, color: "#5a6b7a", align: "left", valign: "center" }));

  // 3×3 사진 그리드 — 없으면 빈 슬롯
  let pi = 0;
  SUMMER_GRID.rows.forEach((ry) => SUMMER_GRID.cols.forEach((cx) => {
    els.push(m.photo(cx, ry, SUMMER_GRID.w, SUMMER_GRID.h, c.photos[pi] || null, { bg: "#eef4fb", radius: 17, shadow: "0 2px 6px rgba(120,160,200,.10)" }));
    pi++;
  }));

  // 아이들의 말 — 라벨 + 말풍선 3(점선은 렌더러 미지원 → 실선 근사)
  els.push(m.shape(33, 825, 99, 26, { bg: "#f4a6c0", radius: 14, shadow: "0 2px 4px rgba(180,120,150,.2)" }));
  els.push(m.text(33, 825, 99, 26, "아이들의 말", { fontSize: 15, fontFamily: SUMMER_JUA, color: "#fff", align: "center", valign: "center" }, { textRole: "title" }));
  const quotes = c.activities.flatMap((a) => arr(a?.childQuotes)).filter(Boolean);
  [{ x: 134, w: 158, col: "#f3a9c1" }, { x: 309, w: 167, col: "#f3ca55" }, { x: 527, w: 167, col: "#a9cf6b" }].forEach((b, i) => {
    els.push(m.shape(b.x, 814, b.w, 89, { bg: "#ffffff", radius: 20, stroke: b.col, strokeWidth: 2 }));
    els.push(m.text(b.x + 10, 810, 34, 34, "“", { fontSize: 34, fontFamily: "Georgia, serif", color: b.col, align: "left", valign: "top" }));
    els.push(m.text(b.x + 16, 838, b.w - 32, 52, quotes[i] || "", { fontSize: 15, fontFamily: BODY_FONT, color: "#6a5560", align: "left", valign: "top" }));
  });

  // 하단 기록칸 3 — 놀이 속 배움 / 교사의 놀이 기록 / 가정 연계 (노트 줄 + 편집 본문)
  [
    { x: 14, bg: "#fdf1f5", bd: "#f4cdd9", tc: "#e07a9c", title: "놀이 속 배움 ★", body: c.learning.text },
    { x: 277, bg: "#f4f8ea", bd: "#d7e6bf", tc: "#7fae4c", title: "교사의 놀이 기록 🌿", body: c.support.text },
    { x: 541, bg: "#f6f1fb", bd: "#ddd0ee", tc: "#9b7ecb", title: "가정 연계 🏠", body: "" },
  ].forEach((bx) => {
    els.push(m.shape(bx.x, 942, 255, 169, { bg: bx.bg, radius: 14, stroke: bx.bd, strokeWidth: 2 }));
    els.push(m.text(bx.x, 953, 255, 26, bx.title, { fontSize: 16, fontFamily: SUMMER_JUA, color: bx.tc, align: "center", valign: "center" }, { textRole: "title" }));
    for (let ly = 986; ly <= 1092; ly += 29) els.push(m.shape(bx.x + 15, ly, 225, 1.5, { bg: bx.bd, radius: 0 }));
    if (has(bx.body)) els.push(m.text(bx.x + 15, 986, 225, 116, bx.body, { fontSize: fitFontSize(bx.body, 225, 116, 15), fontFamily: BODY_FONT, color: "#6a5560", align: "left", valign: "top" }));
  });

  // 전경 스티커(z:3) — 사진/본문 위로
  SUMMER_STICKERS.forEach((s, i) => { if (s.z) stk(s, `sfg${i}`); });

  return doc(c.title || "여름 바다 놀이기록", SUMMER_BG, els);
}

// ════════════════════════════ 카드형 2 (여름 바다 — 디자이너 큐레이션) ════════════════════════════
// Claude Design '여름 놀이기록(카드형)' 을 A4 794×1123 로 환산한 고정 포스터.
//   원본 1024×1536(세로 긺) → 높이맞춤 균일 스케일 ×0.731 + 좌우 중앙정렬(OFF 23).
//   구성: 장식 스티커 12 + 헤더/제목/소개 + 정보바 + 활동 카드 15(5×3, 아이콘 포함) + 아이들의 말 3 + 하단 기록칸 3.
const CARD2_BG = "#FDFDFD";
const CARD2_STICKERS = [
  { src: "/generated-assets/summer-record/card/stk-1.png", x: 23, y: 4, w: 155, h: 111, z: 4 },
  { src: "/generated-assets/summer-record/card/stk-2.png", x: 27, y: 67, w: 164, h: 151, z: 3 },
  { src: "/generated-assets/summer-record/card/stk-3.png", x: 617, y: 15, w: 133, h: 108, z: 0 },
  { src: "/generated-assets/summer-record/card/stk-4.png", x: 721, y: 66, w: 50, h: 47, z: 0 },
  { src: "/generated-assets/summer-record/card/stk-5.png", x: 586, y: 95, w: 89, h: 95, z: 0 },
  { src: "/generated-assets/summer-record/card/stk-6.png", x: 659, y: 108, w: 113, h: 117, z: 0 },
  { src: "/generated-assets/summer-record/card/stk-7.png", x: 27, y: 914, w: 107, h: 110, z: 5 },
  { src: "/generated-assets/summer-record/card/stk-8.png", x: 315, y: 939, w: 101, h: 76, z: 5 },
  { src: "/generated-assets/summer-record/card/stk-9.png", x: 681, y: 926, w: 91, h: 79, z: 5 },
  { src: "/generated-assets/summer-record/card/stk-10.png", x: 23, y: 1072, w: 76, h: 76, z: 6 },
  { src: "/generated-assets/summer-record/card/stk-11.png", x: 430, y: 1060, w: 86, h: 73, z: 6 },
  { src: "/generated-assets/summer-record/card/stk-12.png", x: 707, y: 1063, w: 63, h: 73, z: 6 },
];
const CARD2_ICONS = [
  "/generated-assets/summer-record/card/ic-1.png", "/generated-assets/summer-record/card/ic-2.png",
  "/generated-assets/summer-record/card/ic-3.png", "/generated-assets/summer-record/card/ic-4.png",
  "/generated-assets/summer-record/card/ic-5.png", "/generated-assets/summer-record/card/ic-6.png",
  "/generated-assets/summer-record/card/ic-7.png", "/generated-assets/summer-record/card/ic-8.png",
  "/generated-assets/summer-record/card/ic-9.png", "/generated-assets/summer-record/card/ic-10.png",
  "/generated-assets/summer-record/card/ic-11.png", "/generated-assets/summer-record/card/ic-12.png",
  "/generated-assets/summer-record/card/ic-13.png", "/generated-assets/summer-record/card/ic-14.png",
  "/generated-assets/summer-record/card/ic-15.png",
];
const CARD2_COLS = [33, 179, 326, 472, 618];
const CARD2_ROWS = [247, 471, 695];
const CARD2_DOTS = [[191, 44, 15], [215, 86, 9], [570, 70, 12]];

export function buildCardSummerDoc(payload) {
  const c = read(payload);
  const m = maker();
  const els = [m.bg({ bg: CARD2_BG })];
  const stk = (s, id) => els.push({
    id, type: "image", src: s.src, fit: "contain", sticker: true,
    x: s.x, y: s.y, w: s.w, h: s.h, rotation: 0, style: { radius: 0 },
  });

  // 보케 점 + 배경 스티커(z<3 은 뒤, z≥3 은 앞) — 우선 배경만 깔고 나머지는 콘텐츠 뒤/앞 배치
  CARD2_DOTS.forEach(([x, y, d]) => els.push(m.shape(x, y, d, d, { bg: "radial-gradient(circle at 32% 30%,#fff,#bfe2f7 70%)", radius: Math.round(d / 2) })));
  CARD2_STICKERS.forEach((s, i) => { if (s.z < 3) stk(s, `cbg${i}`); });

  // 헤더 배지 + 제목(파랑·흰 외곽선) + 소개
  els.push(m.shape(339, 9, 117, 22, { bg: "#3f74d1", radius: 11, shadow: "0 2px 4px rgba(70,110,180,.25)" }));
  els.push(m.text(339, 9, 117, 22, "우리반 놀이기록", { fontSize: 12, fontFamily: SUMMER_JUA, color: "#fff", align: "center", valign: "center" }, { textRole: "title" }));
  const title = c.title || "즐거운 여름 놀이";
  els.push(m.text(147, 30, 500, 70, title, { fontSize: Math.min(57, fitFontSize(title, 500, 70, 57)), fontFamily: SUMMER_JUA, color: "#2f7fd6", align: "center", valign: "center", stroke: "#ffffff", strokeWidth: 5 }, { textRole: "title" }));
  const intro = has(c.intro) ? c.intro : "시원한 여름, 바다와 물놀이를 주제로 다양한 놀이를 경험하며 여름의 특징을 알아보고 친구들과 함께 즐거운 시간을 보냈어요.";
  els.push(m.text(215, 124, 366, 78, intro, { fontSize: 11, fontFamily: BODY_FONT, color: "#4a5a68", align: "center", valign: "top" }));

  // 정보바 — 놀이기간(파랑)/담임교사(노랑)
  els.push(m.shape(163, 206, 468, 32, { bg: "#ffffff", radius: 16, stroke: "#cfe3f4", strokeWidth: 2, shadow: "0 2px 5px rgba(90,130,180,.08)" }));
  els.push(m.shape(172, 210, 66, 24, { bg: "#6fb7e8", radius: 12 }));
  els.push(m.text(172, 210, 66, 24, "놀이기간", { fontSize: 12, fontFamily: SUMMER_JUA, color: "#fff", align: "center", valign: "center" }));
  els.push(m.text(246, 210, 220, 24, has(c.month) ? c.month : "년   월   일   ~   년   월   일", { fontSize: 13, fontFamily: BODY_FONT, color: "#5a6b7a", align: "left", valign: "center" }));
  els.push(m.shape(497, 210, 66, 24, { bg: "#f6c445", radius: 12 }));
  els.push(m.text(497, 210, 66, 24, "담임교사", { fontSize: 12, fontFamily: SUMMER_JUA, color: "#fff", align: "center", valign: "center" }));
  els.push(m.text(569, 210, 58, 24, "", { fontSize: 13, fontFamily: BODY_FONT, color: "#5a6b7a", align: "left", valign: "center" }));

  // 활동 카드 15 (5×3) — 프레임 + 아이콘(고정) + 제목 + 사진 + 본문(payload activities)
  const CW = 143, CH = 212;
  for (let i = 0; i < 15; i++) {
    const cx = CARD2_COLS[i % 5], cy = CARD2_ROWS[Math.floor(i / 5)];
    const a = c.activities[i];
    els.push(m.shape(cx, cy, CW, CH, { bg: "#f2f8fd", radius: 12, stroke: "#dcebf7", strokeWidth: 1.5, shadow: "0 2px 5px rgba(120,160,200,.07)" }));
    if (CARD2_ICONS[i]) els.push({ id: `cic${i}`, type: "image", src: CARD2_ICONS[i], fit: "contain", x: cx + 9, y: cy + 7, w: 19, h: 19, rotation: 0, style: { radius: 0 } });
    els.push(m.text(cx + 31, cy + 8, CW - 37, 18, a?.title || "", { fontSize: 10, fontFamily: SUMMER_JUA, color: "#2e70c6", align: "left", valign: "center" }, { textRole: "title" }));
    els.push(m.photo(cx + 8, cy + 31, 127, 85, c.photos[i] || null, { bg: "#eef4fb", radius: 9, shadow: "0 1px 4px rgba(120,160,200,.10)" }));
    // 사진 아래 본문 텍스트 영역 — 데이터 없어도 항상 편집 가능한 빈 영역으로 배치(누락 금지)
    const para = a?.summary || "";
    els.push(m.text(cx + 10, cy + 121, CW - 20, CH - 129, para, { fontSize: has(para) ? fitFontSize(para, CW - 20, CH - 129, 9, 7) : 9, fontFamily: BODY_FONT, color: "#55636f", align: "left", valign: "top" }));
  }

  // 아이들의 말 — 라벨 + 말풍선 3(점선→실선 근사)
  els.push(m.shape(133, 920, 86, 22, { bg: "#f4a6c0", radius: 11, shadow: "0 2px 4px rgba(180,120,150,.2)" }));
  els.push(m.text(133, 920, 86, 22, "아이들의 말", { fontSize: 13, fontFamily: SUMMER_JUA, color: "#fff", align: "center", valign: "center" }, { textRole: "title" }));
  const quotes = c.activities.flatMap((a) => arr(a?.childQuotes)).filter(Boolean);
  [{ x: 155, w: 132, col: "#f3a9c1" }, { x: 394, w: 133, col: "#7fbfe0" }, { x: 535, w: 133, col: "#a9cf6b" }].forEach((b, i) => {
    els.push(m.shape(b.x, 949, b.w, 45, { bg: "#ffffff", radius: 19, stroke: b.col, strokeWidth: 2 }));
    els.push(m.text(b.x + 8, 945, 28, 28, "“", { fontSize: 28, fontFamily: "Georgia, serif", color: b.col, align: "left", valign: "top" }));
    els.push(m.text(b.x + 13, 964, b.w - 26, 26, quotes[i] || "", { fontSize: 12, fontFamily: BODY_FONT, color: "#6a5560", align: "left", valign: "top" }));
  });

  // 하단 기록칸 3
  [
    { x: 33, w: 252, bg: "#eef6fc", bd: "#cfe3f4", tc: "#3f8fd0", title: "놀이 속 배움 ★", body: c.learning.text },
    { x: 291, w: 216, bg: "#f4f8ea", bd: "#d7e6bf", tc: "#7fae4c", title: "교사의 놀이 기록 🌿", body: c.support.text },
    { x: 513, w: 249, bg: "#f6f1fb", bd: "#ddd0ee", tc: "#9b7ecb", title: "가정 연계 🏠", body: "" },
  ].forEach((bx) => {
    els.push(m.shape(bx.x, 1012, bx.w, 110, { bg: bx.bg, radius: 12, stroke: bx.bd, strokeWidth: 2 }));
    els.push(m.text(bx.x, 1019, bx.w, 22, bx.title, { fontSize: 13, fontFamily: SUMMER_JUA, color: bx.tc, align: "center", valign: "center" }, { textRole: "title" }));
    // 가정 연계 포함 세 칸 모두 편집 가능한 본문 영역을 항상 배치
    els.push(m.text(bx.x + 12, 1043, bx.w - 24, 70, bx.body, { fontSize: has(bx.body) ? fitFontSize(bx.body, bx.w - 24, 70, 10, 7) : 10, fontFamily: BODY_FONT, color: "#55636f", align: "left", valign: "top" }));
  });

  // 전경 스티커(z≥3) — 카드/본문 위로
  CARD2_STICKERS.forEach((s, i) => { if (s.z >= 3) stk(s, `cfg${i}`); });

  return doc(c.title || "즐거운 여름 놀이", CARD2_BG, els);
}

// ════════════════════════════ 카드형 (교통기관 — 디자이너 큐레이션) ════════════════════════════
// Claude Design '교통기관 놀이기록(카드형2)' → A4 환산. 원본 1086×1448 → ×0.731 + 세로중앙(OFFY 32).
//   구성: 탈것 스티커 32 + 헤더/제목/정보바 2박스 + 9칸 카드(3×3, 라벨 pill) + 아이들의 말 3 + 하단 기록칸 3.
const TRAFFIC_BG = "#F8F6F1";
const TRAFFIC_STICKERS = [
  { src: "/generated-assets/traffic-record-ai/stk-1.png", x: 6, y: 45, w: 154, h: 99, z: 4 },
  { src: "/generated-assets/traffic-record-ai/stk-2.png", x: 559, y: 52, w: 228, h: 84, z: 4 },
  { src: "/generated-assets/traffic-record-ai/stk-3.png", x: 719, y: 54, w: 47, h: 45, z: 4 },
  { src: "/generated-assets/traffic-record-ai/stk-4.png", x: 23, y: 167, w: 72, h: 95, z: 4 },
  { src: "/generated-assets/traffic-record-ai/stk-5.png", x: 665, y: 167, w: 88, h: 110, z: 4 },
  { src: "/generated-assets/traffic-record-ai/stk-6.png", x: 183, y: 58, w: 47, h: 32, z: 4 },
  { src: "/generated-assets/traffic-record-ai/stk-7.png", x: 99, y: 156, w: 34, h: 32, z: 4 },
  { src: "/generated-assets/traffic-record-ai/stk-8.png", x: 19, y: 295, w: 41, h: 38, z: 4 },
  { src: "/generated-assets/traffic-record-ai/stk-9.png", x: 234, y: 387, w: 39, h: 37, z: 4 },
  { src: "/generated-assets/traffic-record-ai/stk-10.png", x: 290, y: 400, w: 32, h: 31, z: 4 },
  { src: "/generated-assets/traffic-record-ai/stk-11.png", x: 739, y: 303, w: 38, h: 38, z: 4 },
  { src: "/generated-assets/traffic-record-ai/stk-12.png", x: 746, y: 475, w: 35, h: 35, z: 4 },
  { src: "/generated-assets/traffic-record-ai/stk-13.png", x: 306, y: 594, w: 39, h: 23, z: 4 },
  { src: "/generated-assets/traffic-record-ai/stk-14.png", x: 31, y: 374, w: 91, h: 60, z: 4 },
  { src: "/generated-assets/traffic-record-ai/stk-15.png", x: 407, y: 348, w: 114, h: 79, z: 4 },
  { src: "/generated-assets/traffic-record-ai/stk-16.png", x: 616, y: 374, w: 85, h: 57, z: 4 },
  { src: "/generated-assets/traffic-record-ai/stk-17.png", x: 699, y: 362, w: 53, h: 72, z: 4 },
  { src: "/generated-assets/traffic-record-ai/stk-18.png", x: 28, y: 512, w: 80, h: 128, z: 4 },
  { src: "/generated-assets/traffic-record-ai/stk-19.png", x: 203, y: 564, w: 83, h: 57, z: 4 },
  { src: "/generated-assets/traffic-record-ai/stk-20.png", x: 408, y: 542, w: 89, h: 67, z: 4 },
  { src: "/generated-assets/traffic-record-ai/stk-21.png", x: 696, y: 506, w: 85, h: 133, z: 4 },
  { src: "/generated-assets/traffic-record-ai/stk-22.png", x: 20, y: 728, w: 130, h: 83, z: 4 },
  { src: "/generated-assets/traffic-record-ai/stk-23.png", x: 291, y: 728, w: 120, h: 83, z: 4 },
  { src: "/generated-assets/traffic-record-ai/stk-24.png", x: 447, y: 735, w: 45, h: 72, z: 4 },
  { src: "/generated-assets/traffic-record-ai/stk-25.png", x: 674, y: 716, w: 118, h: 83, z: 4 },
  { src: "/generated-assets/traffic-record-ai/stk-26.png", x: 532, y: 762, w: 60, h: 45, z: 4 },
  { src: "/generated-assets/traffic-record-ai/stk-27.png", x: 181, y: 830, w: 67, h: 67, z: 6 },
  { src: "/generated-assets/traffic-record-ai/stk-28.png", x: 360, y: 830, w: 67, h: 67, z: 6 },
  { src: "/generated-assets/traffic-record-ai/stk-29.png", x: 540, y: 830, w: 67, h: 67, z: 6 },
  { src: "/generated-assets/traffic-record-ai/stk-30.png", x: 156, y: 991, w: 89, h: 60, z: 7 },
  { src: "/generated-assets/traffic-record-ai/stk-31.png", x: 366, y: 1035, w: 164, h: 44, z: 7 },
  { src: "/generated-assets/traffic-record-ai/stk-32.png", x: 616, y: 1013, w: 151, h: 72, z: 7 },
];

// 슬롯별 영문 subject — "재생성" 시 같은 대상을 다시 그리도록 각 스티커 요소에 부여(TRAFFIC_STICKERS 와 1:1).
const TRAFFIC_SUBJECTS = [
  "a cute chubby airplane", "a cute red steam train locomotive", "a cute glossy yellow star",
  "a cute traffic light signal", "a cute colorful hot air balloon", "a cute fluffy blue cloud",
  "a cute glossy yellow star", "a cute glossy pink star", "a cute glossy blue star",
  "a cute glossy pink star", "a cute glossy purple star", "a cute glossy green star",
  "a cute fluffy blue cloud", "a cute red car", "a cute yellow school bus",
  "a cute winding grey road", "a cute small round green tree", "a cute airport control tower",
  "a cute chubby airplane", "a cute white paper airplane", "a cute traffic light signal",
  "a cute police car", "a cute row of colorful city buildings", "a cute small round green tree",
  "a cute helicopter", "a cute red car", "a cute smiling kindergarten child face",
  "a cute smiling kindergarten child face", "a cute smiling kindergarten child face",
  "a cute yellow taxi car", "a cute red steam train locomotive", "a cute happy family, two parents and a child",
];

const TRAFFIC_COLS = [72, 296, 521];
const TRAFFIC_ROWS = [272, 475, 678];
const TRAFFIC_CARD_COLORS = ["#ef7fa8", "#f2994a", "#6cbf6c", "#45bfae", "#a98cd8", "#5aa3e0", "#f0b23e", "#ec6f9c", "#f0a5c0"];

export function buildCardTrafficDoc(payload) {
  const c = read(payload);
  const m = maker();
  const els = [m.bg({ bg: TRAFFIC_BG })];
  // 스티커 배치·크기·종류를 디자이너 큐레이션으로 고정(locked) → 이동·리사이즈·재생성·삭제 불가(정적 렌더).
  const stk = (s, id, subject) => els.push({ id, type: "image", src: s.src, fit: "contain", sticker: true, locked: true, subject, x: s.x, y: s.y, w: s.w, h: s.h, rotation: 0, style: { radius: 0 } });
  // 스티커는 전부 전경(맨 위)에 배치 → 사진·텍스트 위로 올라오고 가려져 잘리지 않음(아래 마지막에 한 번에 그림)

  // 헤더 배지 + 제목(흰 외곽선) + 정보바 2박스
  els.push(m.shape(254, 60, 287, 25, { bg: "#5aa3e0", radius: 12, shadow: "0 2px 4px rgba(70,120,180,.25)" }));
  els.push(m.text(254, 60, 287, 25, has(c.subtitle) ? c.subtitle : "탈것과 함께 떠나는 우리들의 이야기!", { fontSize: 12, fontFamily: SUMMER_JUA, color: "#fff", align: "center", valign: "center" }, { textRole: "title" }));
  // read() 는 제목이 비면 범용 기본값("우리반 놀이기록")을 채우므로, 원본 payload 를 직접 보고
  // 교통 주제 전용 기본 제목("신나는 교통기관")으로 폴백한다.
  const title = payload?.header?.title || payload?.meta?.theme || "신나는 교통기관";
  // 제목 텍스트 박스 고정(locked) — 위치·크기 이동/리사이즈 불가로 디자인 그대로 유지.
  els.push(m.text(88, 99, 619, 60, title, { fontSize: Math.min(51, fitFontSize(title, 619, 60, 51)), fontFamily: SUMMER_JUA, color: "#3f8fd6", align: "center", valign: "center", stroke: "#ffffff", strokeWidth: 5 }, { textRole: "title", locked: true }));
  els.push(m.shape(219, 178, 212, 31, { bg: "#fff6e6", radius: 11, stroke: "#ecdcb8", strokeWidth: 2 }));
  els.push(m.text(219, 178, 212, 31, has(c.month) ? `놀이 기간 : ${c.month}` : "놀이 기간 :", { fontSize: 12, fontFamily: BODY_FONT, color: "#7a6a4a", align: "center", valign: "center" }));
  els.push(m.shape(447, 178, 127, 31, { bg: "#fff6e6", radius: 11, stroke: "#ecdcb8", strokeWidth: 2 }));
  els.push(m.text(447, 178, 127, 31, "담임교사 :", { fontSize: 12, fontFamily: BODY_FONT, color: "#7a6a4a", align: "center", valign: "center" }));

  // 9칸 카드 (3×3) — 사진 + 라벨 pill(사진 상단 겹침)
  const PW = 197, PH = 161;
  for (let i = 0; i < 9; i++) {
    const cx = TRAFFIC_COLS[i % 3], cy = TRAFFIC_ROWS[Math.floor(i / 3)];
    const a = c.activities[i], col = TRAFFIC_CARD_COLORS[i % 9], t = a?.title || "";
    els.push(m.photo(cx, cy, PW, PH, c.photos[i] || null, { bg: "#eef3f8", radius: 15, shadow: "0 2px 6px rgba(120,150,190,.14)" }));
    els.push(m.shape(cx + 4, cy - 14, PW - 8, 26, { bg: col, radius: 13, shadow: "0 2px 4px rgba(80,80,90,.18)" }));
    els.push(m.text(cx + 8, cy - 14, PW - 16, 26, t, { fontSize: has(t) ? fitFontSize(t, PW - 16, 26, 11, 8) : 11, fontFamily: SUMMER_JUA, color: "#fff", align: "center", valign: "center" }, { textRole: "title" }));
  }

  // 아이들의 말 — 라벨 + 말풍선 3
  els.push(m.shape(48, 849, 110, 26, { bg: "#f0789e", radius: 13, shadow: "0 2px 4px rgba(180,120,150,.2)" }));
  els.push(m.text(48, 849, 110, 26, "아이들의 말", { fontSize: 14, fontFamily: SUMMER_JUA, color: "#fff", align: "center", valign: "center" }, { textRole: "title" }));
  const quotes = c.activities.flatMap((a) => arr(a?.childQuotes)).filter(Boolean);
  [{ x: 232, bg: "#ffffff", bd: "#f3c3d4" }, { x: 411, bg: "#f2f7e6", bd: "#c9dd9e" }, { x: 591, bg: "#f2ecfa", bd: "#cdbbe8" }].forEach((b, i) => {
    els.push(m.shape(b.x, 839, 124, 47, { bg: b.bg, radius: 17, stroke: b.bd, strokeWidth: 2 }));
    els.push(m.text(b.x + 8, 839, 108, 47, quotes[i] || "", { fontSize: 11, fontFamily: BODY_FONT, color: "#6a5560", align: "center", valign: "center" }));
  });

  // 하단 기록칸 3 (배지 상단 돌출 + 편집 본문 항상 배치)
  [
    { x: 29, w: 228, bg: "#eef6fc", bd: "#b9d6ef", badge: "#5aa3e0", title: "놀이 속 배움", body: c.learning.text },
    { x: 284, w: 227, bg: "#f5f0fb", bd: "#d6c7ec", badge: "#a98cd8", title: "교사의 놀이 기록", body: c.support.text },
    { x: 537, w: 228, bg: "#eaf7f3", bd: "#b9e0d3", badge: "#45bfae", title: "가정 연계", body: "" },
  ].forEach((bx) => {
    els.push(m.shape(bx.x, 920, bx.w, 156, { bg: bx.bg, radius: 13, stroke: bx.bd, strokeWidth: 2 }));
    els.push(m.shape(bx.x + bx.w / 2 - 55, 909, 110, 22, { bg: bx.badge, radius: 11, shadow: "0 2px 4px rgba(80,120,170,.2)" }));
    els.push(m.text(bx.x + bx.w / 2 - 55, 909, 110, 22, bx.title, { fontSize: 12, fontFamily: SUMMER_JUA, color: "#fff", align: "center", valign: "center" }, { textRole: "title" }));
    els.push(m.text(bx.x + 12, 940, bx.w - 24, 128, bx.body, { fontSize: has(bx.body) ? fitFontSize(bx.body, bx.w - 24, 128, 11, 8) : 10, fontFamily: BODY_FONT, color: "#55636f", align: "left", valign: "top" }));
  });

  TRAFFIC_STICKERS.forEach((s, i) => stk(s, `tfg${i}`, TRAFFIC_SUBJECTS[i])); // 전경 스티커(전부) — 사진·텍스트 위로
  return doc(title, TRAFFIC_BG, els);
}

// ════════════════════════════ 카드형 (가을·추석 — Figma 큐레이션) ════════════════════════════
// Figma '놀이기록-카드형-가을추석'(node 55:543, 1149×1395) → A4 794×1123 폭맞춤(×0.691) + 세로중앙(OFFY 79).
//   구성: 데코 4(감나무·보름달·청사초롱·송편) + 헤더(제목/부제/놀이기간) + 아이 말풍선 3(원형 사진슬롯 3) +
//         9칸 활동 카드(3×3, 번호배지·아이콘·사진 2·본문) + 하단 마무리 패널(아이들 그림·문구·미술도구).
//   사진·텍스트 전부 편집 가능(m.photo / m.text). 아이콘·데코만 고정 이미지.
const AUTUMN_BG = "linear-gradient(180deg,#fdf6e6 0%,#fbeecb 100%)";
// 본문 폰트 — Figma 원본(55:870)은 Gowun Dodum(고운돋움). 제목·라벨·번호는 Jua(LABEL_FONT) 유지.
const AUTUMN_BODY_FONT = "'Gowun Dodum', 'SUIT', sans-serif";
const AUTUMN_S = 794 / 1149;                                  // 폭맞춤 스케일 0.6910
const AUTUMN_OFFY = Math.round((A4.H - 1395.13 * AUTUMN_S) / 2); // 세로중앙 79
const aX = (v) => Math.round(v * AUTUMN_S);
const aY = (v) => Math.round(v * AUTUMN_S) + AUTUMN_OFFY;
const aD = (v) => Math.round(v * AUTUMN_S);
const AUTUMN_ASSET = "/generated-assets/autumn-record";

// 카드별 강조색·아이콘·기본 활동명/본문(원본 추석 콘텐츠 — payload 비면 폴백)
const AUTUMN_CARDS = [
  { accent: "#ef7a2a", icon: "ic-1.png",           iw: 62, ih: 62,    title: "추석 이야기 나누기",  body: "추석의 의미와 유래에 대해 알아보고 우리 가족의 추석 풍습에 대해 이야기 나누었어요." },
  { accent: "#f2ab2e", icon: "deco-songpyeon.png", iw: 70, ih: 70,    title: "송편 만들기",        body: "색색의 반죽을 빚어 송편을 만들었어요. 모양과 색깔을 다르게 만들어 보았어요." },
  { accent: "#7bab3c", icon: "ic-3.png",           iw: 74, ih: 62.13, title: "추석 음식 알아보기",  body: "추석에 먹는 다양한 음식을 알아보고 음식 이름 맞추기 놀이를 했어요." },
  { accent: "#4a90c4", icon: "ic-4.png",           iw: 56, ih: 73.38, title: "전통 놀이 한마당",    body: "윷놀이, 제기차기, 투호 놀이를 해보았어요. 친구들과 규칙을 정하고 함께 즐겼어요." },
  { accent: "#8a5cc4", icon: "ic-5.png",           iw: 64, ih: 64,    title: "한복 입고 사진 찍기",  body: "한복을 입어보고 거울을 보며 멋진 모습을 사진으로 남겼어요." },
  { accent: "#e05a7a", icon: "ic-6.png",           iw: 74, ih: 74,    title: "보름달 꾸미기",      body: "커다란 보름달에 반짝반짝 스티커를 붙여 예쁘게 꾸며보았어요." },
  { accent: "#3fa9a0", icon: "ic-7.png",           iw: 64, ih: 64,    title: "차례상 차려보기",    body: "모형 음식과 과일을 사용해 차례상을 차려보았어요. 바른 자세로 절하는 방법도 알아보았어요." },
  { accent: "#7bab3c", icon: "ic-8.png",           iw: 66, ih: 62.81, title: "추석 선물 만들기",    body: "감사하는 마음을 담아 송편 모양 비누와 카드로 추석 선물을 만들었어요." },
  { accent: "#ef9a2a", icon: "deco-moon.png",      iw: 72, ih: 57.92, title: "보름달 소원 빌기",    body: "보름달에 소원을 적어 붙이며 우리 가족의 행복을 빌었어요." },
];
// 카드 좌상단(포스터 기준)·아이콘 오프셋(카드 기준) — Figma 원본 좌표 그대로
const AUTUMN_CARD_POS = [
  { x: 29, y: 355 }, { x: 399.33, y: 355 }, { x: 769.66, y: 355 },
  { x: 29, y: 645.38 }, { x: 399.33, y: 645.38 }, { x: 769.66, y: 645.38 },
  { x: 29, y: 935.75 }, { x: 399.33, y: 935.75 }, { x: 769.66, y: 935.75 },
];
const AUTUMN_CARD_ICON = [
  { x: 274.33, y: 14 }, { x: 266.33, y: 12 }, { x: 264.34, y: 10 },
  { x: 280.33, y: 8 },  { x: 272.33, y: 10 }, { x: 264.34, y: 12 },
  { x: 272.33, y: 12 }, { x: 270.33, y: 12 }, { x: 266.34, y: 12 },
];
// 아이 말풍선 3(색상·문구는 원본 큐레이션, 아이 발화 있으면 대체) + 원형 아이 사진슬롯 3
const AUTUMN_QUOTES = [
  { x: 121, y: 270.5, w: 198.61, h: 45, bg: "#fff6df", bd: "#f2d79b", tc: "#6a5238", text: "송편은 반달처럼 생겼어요!" },
  { x: 526.95, y: 270.5, w: 187.06, h: 45, bg: "#eaf7ea", bd: "#bfe0bf", tc: "#4a6a44", text: "보름달이 둥글고 예뻐요!" },
  { x: 773.66, y: 260, w: 254.34, h: 66, bg: "#f3ecfb", bd: "#d6c3ee", tc: "#5a4a72", text: "강강술래 할 때 손잡으니까 재미있어요!" },
];
const AUTUMN_CHILD_SLOTS = [{ x: 29, y: 253 }, { x: 434.95, y: 253 }, { x: 1040, y: 253 }];

export function buildCardAutumnDoc(payload) {
  const c = read(payload);
  const m = maker();
  const els = [m.bg({ bg: AUTUMN_BG })];
  // 데코·아이콘·하단 그림 = 이미지 스티커. 기본 위치·크기는 Figma 원본 그대로지만 편집 가능
  // (아래 '구조 도형만 잠금' 정책으로 이동·리사이즈·회전·삭제 자유 — 주간계획안과 동일).
  const img = (src, x, y, w, h, id) => els.push({
    id, type: "image", src, fit: "contain", sticker: true,
    x: aX(x), y: aY(y), w: aD(w), h: aD(h), rotation: 0, style: { radius: 0 },
  });

  // 하단 마무리 패널 배경(Figma 55:866 y=1228.13, h=164; 하단 끝까지 배너로 확장)
  const panelTop = aY(1228.13);
  els.push(m.shape(0, panelTop, A4.W, A4.H - panelTop, { bg: "linear-gradient(180deg,#f7e2b0 0%,#f2d491 100%)", radius: 0 }));

  // 헤더 — 배지 / 제목 / 부제 / 놀이기간
  els.push(m.shape(aX(284), aY(29), aD(161.03), aD(39), { bg: "#5a4632", radius: aD(20), shadow: "0 3px 3px rgba(0,0,0,0.15)" }));
  els.push(m.text(aX(284), aY(29), aD(161.03), aD(39), "우리반 놀이기록", { fontSize: aD(17), fontFamily: LABEL_FONT, color: "#fff", align: "center", valign: "center" }, { textRole: "title" }));
  const title = payload?.header?.title || payload?.meta?.theme || "풍성한 추석 놀이";
  els.push(m.text(aX(336.91), aY(70), aD(464.56), aD(74), title, { fontSize: Math.min(aD(74), fitFontSize(title, aD(464.56), aD(74), aD(74))), fontFamily: LABEL_FONT, color: "#5a4632", align: "center", valign: "center" }, { textRole: "title" }));
  const subtitle = has(c.subtitle) ? c.subtitle : "추석의 의미를 알아보고 전통문화를 경험하며 즐겁게 놀았어요!";
  els.push(m.text(aX(297.67), aY(181), aD(542.95), aD(30), subtitle, { fontSize: aD(21), fontFamily: AUTUMN_BODY_FONT, color: "#7a6244", align: "center", valign: "center" }));
  els.push(m.text(aX(861.11), aY(121), aD(60.83), aD(17), "놀이 기간", { fontSize: aD(17), fontFamily: LABEL_FONT, color: "#8a6a3a", align: "center", valign: "center" }));
  els.push(m.text(aX(812.67), aY(144), aD(157.65), aD(20), has(c.month) ? c.month : "2024. 9. 2 ~ 9. 13", { fontSize: aD(20), fontFamily: AUTUMN_BODY_FONT, color: "#5a4632", align: "center", valign: "center" }));

  // 헤더 데코 4 (감나무·보름달·청사초롱·송편)
  img(`${AUTUMN_ASSET}/deco-persimmon.png`, 29, 23, 132, 132, "adc0");
  img(`${AUTUMN_ASSET}/deco-moon.png`, 31, 127, 170, 136.77, "adc1");
  img(`${AUTUMN_ASSET}/deco-lantern.png`, 1014, 15, 92, 157.25, "adc2");
  img(`${AUTUMN_ASSET}/deco-songpyeon.png`, 988, 173, 120, 120, "adc3");

  // 아이 원형 사진슬롯 3 + 말풍선 3
  AUTUMN_CHILD_SLOTS.forEach((sl, i) => {
    const d = aD(80);
    els.push(m.photo(aX(sl.x), aY(sl.y), d, d, null, { bg: "#fff", radius: Math.round(d / 2), stroke: "#9ecdf1", strokeWidth: 2 }));
  });
  const quotes = c.activities.flatMap((a) => arr(a?.childQuotes)).filter(Boolean);
  AUTUMN_QUOTES.forEach((q, i) => {
    els.push(m.shape(aX(q.x), aY(q.y), aD(q.w), aD(q.h), { bg: q.bg, radius: aD(16), stroke: q.bd, strokeWidth: 2 }));
    els.push(m.text(aX(q.x) + aD(18), aY(q.y), aD(q.w) - aD(30), aD(q.h), quotes[i] || q.text, { fontSize: aD(15), fontFamily: AUTUMN_BODY_FONT, color: q.tc, align: "left", valign: "center" }));
  });

  // 9칸 활동 카드 (3×3)
  const CW = 350.33, CH = 270.38;
  for (let i = 0; i < 9; i++) {
    const pos = AUTUMN_CARD_POS[i], cd = AUTUMN_CARDS[i], ic = AUTUMN_CARD_ICON[i];
    const a = c.activities[i] || {};
    const cx = pos.x, cy = pos.y;
    els.push(m.shape(aX(cx), aY(cy), aD(CW), aD(CH), { bg: "#fffaf0", radius: aD(18), stroke: "#f6dfae", strokeWidth: 2, shadow: "0 4px 12px rgba(120,90,40,0.08)" }));
    els.push(m.shape(aX(cx + 18), aY(cy + 18), aD(34), aD(34), { bg: cd.accent, radius: aD(9) }));
    els.push(m.text(aX(cx + 18), aY(cy + 18), aD(34), aD(34), String(i + 1).padStart(2, "0"), { fontSize: aD(17), fontFamily: LABEL_FONT, color: "#fff", align: "center", valign: "center" }));
    els.push(m.text(aX(cx + 62), aY(cy + 24), aD(154.52), aD(22), a.title || cd.title, { fontSize: aD(22), fontFamily: LABEL_FONT, color: cd.accent, align: "left", valign: "center" }, { textRole: "title" }));
    img(`${AUTUMN_ASSET}/${cd.icon}`, cx + ic.x, cy + ic.y, cd.iw, cd.ih, `aic${i}`);
    els.push(m.photo(aX(cx + 18), aY(cy + 64), aD(153.16), aD(130), c.photos[2 * i] || null, { bg: "#fff", radius: aD(10), stroke: "#9ecdf1", strokeWidth: 2 }));
    els.push(m.photo(aX(cx + 179.16), aY(cy + 64), aD(153.17), aD(130), c.photos[2 * i + 1] || null, { bg: "#fff", radius: aD(10), stroke: "#9ecdf1", strokeWidth: 2 }));
    const body = a.summary || cd.body;
    const bw = aD(307.75), bh = aD(44.19);
    els.push(m.text(aX(cx + 18), aY(cy + 207), bw, bh, body, { fontSize: has(body) ? fitFontSize(body, bw, bh, aD(14.5), 7) : aD(14.5), fontFamily: AUTUMN_BODY_FONT, color: "#6a5238", align: "left", valign: "top" }));
  }

  // 하단 마무리 패널 콘텐츠 — 아이들 그림 / 문구 / 미술도구 (Figma 55:867·868·869, 패널 y=1228.13 기준 절대좌표)
  img(`${AUTUMN_ASSET}/footer-kids.png`, 40, 1250.13, 120, 120, "afk");
  img(`${AUTUMN_ASSET}/footer-art.png`, 1007, 1260.63, 96, 96, "afa");
  const closing = has(c.support?.text)
    ? c.support.text
    : "아이들은 추석을 통해 우리 전통문화를 경험하고, 친구들과 함께 즐기며 더불어 생활하는 기쁨을 느꼈어요. 앞으로도 다양한 놀이를 통해 함께 성장하기를 응원합니다!";
  els.push(m.text(aX(353.97), aY(1263.67), aD(459.25), aD(91.6), closing, { fontSize: fitFontSize(closing, aD(459.25), aD(91.6), aD(19), 10), fontFamily: AUTUMN_BODY_FONT, color: "#5a4632", align: "center", valign: "center" }));

  // 편집 정책 — 구조 도형(전체 배경·카드 판·번호 배지·말풍선 바탕·하단 패널)만 고정(locked)해 레이아웃을
  // 유지하고, 텍스트·사진·이미지 스티커(데코·아이콘)는 편집 자유. (주간계획안 buildWeeklyPlanDoc 과 동일 정책.)
  els.forEach((e) => { if (e.type === "shape") e.locked = true; });
  return doc(title, AUTUMN_BG, els);
}

// ════════════════════════════ 놀이주제망 (여름바다 마인드맵 — Figma 큐레이션) ════════════════════════════
// Figma '놀이아이디어-주제망-여름바다'(node 55:1039, 720×960) → A4 794×1123 폭맞춤(×1.103) + 세로중앙(OFFY 32).
//   구성: 헤더(반이름·제목·기간·데코) + 중앙노드(대주제) + 8 소주제 카드(제목·불릿3·아이콘) +
//         하단 '주제 탐구 질문' 6 + 해양 스티커. 텍스트 편집 + 스티커 subject 재생성(기존 에셋 활용/없으면 생성).
const TW_BG = "linear-gradient(180deg,#dcf1fb 0%,#eaf7fd 42%,#f5fbff 100%)";
const TW_S = 794 / 720;                                   // 폭맞춤 1.1028
const TW_OFFY = Math.round((A4.H - 960 * TW_S) / 2);      // 세로중앙 32
const tX = (v) => Math.round(v * TW_S);
const tY = (v) => Math.round(v * TW_S) + TW_OFFY;
const tD = (v) => Math.round(v * TW_S);
const TW_ASSET = "/generated-assets/topicweb-record";
const TW_BULLET_TX = "#3f5468";

// 8 소주제 카드 — 좌표(포스터 기준)·테두리색·강조색·아이콘·기본 콘텐츠(payload 비면 폴백)
const TW_CARDS = [
  { x: 18,  y: 158, w: 206, h: 147, bd: "#f6c3b9", ac: "#e94f37", listY: 72, icon: "conch.png",   ix: 136, iy: 11, iw: 52, ih: 52, subj: "a cute seashell conch",     title: "바다에는 무엇이 있을까?", ideas: ["바다의 모습", "모래와 조개", "파도와 바람"] },
  { x: 258, y: 158, w: 204, h: 129, bd: "#b6e3da", ac: "#17a08d", listY: 54, icon: "octopus.png", ix: 121, iy: 2,  iw: 52, ih: 52, subj: "a cute octopus",             title: "바다 생물 탐구",       ideas: ["다양한 바다 생물", "생김새와 특징", "어디에 살까?"] },
  { x: 492, y: 158, w: 206, h: 147, bd: "#b7d6f2", ac: "#2f7fd6", listY: 72, icon: "wave.png",    ix: 136, iy: 11, iw: 52, ih: 52, subj: "a cute ocean wave",         title: "바다의 움직임",       ideas: ["파도는 왜 생길까?", "밀물과 썰물", "바람과 파도의 관계"] },
  { x: 18,  y: 312, w: 206, h: 147, bd: "#f6d9b0", ac: "#e0872a", listY: 72, icon: "tube.png",    ix: 136, iy: 11, iw: 52, ih: 52, subj: "a cute swim ring tube",     title: "여름바다에서 즐겨요",   ideas: ["물놀이 방법", "안전하게 놀아요", "바다에서 지켜야 할 약속"] },
  { x: 492, y: 312, w: 206, h: 147, bd: "#b9e4c2", ac: "#37a852", listY: 72, icon: "turtle.png",  ix: 136, iy: 11, iw: 52, ih: 52, subj: "a cute sea turtle",         title: "바다를 깨끗하게",     ideas: ["바다 쓰레기", "바다를 지키는 방법", "우리도 도울 수 있어요"] },
  { x: 18,  y: 464, w: 206, h: 147, bd: "#b7d6f2", ac: "#2f8fd0", listY: 72, icon: "sunset.png",  ix: 73,  iy: 15, iw: 55, ih: 43, subj: "a cute sunset over the sea", title: "바다와 날씨",         ideas: ["뜨거운 햇볕", "시원한 바닷바람", "비가 오면 바다는?"] },
  { x: 258, y: 464, w: 204, h: 147, bd: "#f4c6df", ac: "#e35d9c", listY: 72, icon: "seagull.png", ix: 134, iy: 11, iw: 52, ih: 52, subj: "a cute seagull",            title: "바다에서 나는 소리",   ideas: ["파도 소리", "바다 생물의 소리", "소리로 표현하기"] },
  { x: 492, y: 464, w: 206, h: 147, bd: "#f6c3b9", ac: "#e94f37", listY: 72, icon: null,          ix: 0,   iy: 0,  iw: 0,  ih: 0,  subj: null,                       title: "바다를 표현해요",     ideas: ["바다 그림 그리기", "바다 만들기", "노래와 율동"] },
];
// 하단 탐구질문 색 팔레트(파랑/앰버/초록/핑크)
const TW_QCOLORS = [
  { bg: "#eaf6ff", bd: "#bcdcf5", tc: "#345067" },
  { bg: "#fff6e3", bd: "#f3dca8", tc: "#5c4a2c" },
  { bg: "#eafbf0", bd: "#bfe6c9", tc: "#2f5a3d" },
  { bg: "#fdeef4", bd: "#f4c6df", tc: "#6b3b52" },
];
const TW_QSLOTS = [
  { x: 185, y: 683,    w: 158, h: 69.84, c: 0 }, { x: 359, y: 683,    w: 158, h: 69.84, c: 1 },
  { x: 185, y: 766.84, w: 158, h: 69.84, c: 2 }, { x: 359, y: 766.84, w: 158, h: 69.84, c: 3 },
  { x: 185, y: 850.69, w: 158, h: 90.77, c: 0 }, { x: 359, y: 850.69, w: 158, h: 90.77, c: 1 },
];
const TW_QDEFAULT = ["바다에는 어떤 색깔이 있을까?", "물고기는 어떻게 숨을 쉴까?", "상어와 돌고래는 무엇이 다를까?", "바다 생물들은 무엇을 먹을까?", "파도는 왜 생길까?", "우리가 바다를 위해 할 수 있는 일은 무엇일까?"];
// 장식 스티커(포스터 기준) — subject 로 재생성 지원(기존 에셋 활용/없으면 생성)
const TW_DECOS = [
  { src: "seahorse.png",  x: 33,  y: 52,  w: 112, h: 147,   subj: "a cute seahorse" },
  { src: "palm.png",      x: 607, y: 71,  w: 105, h: 106,   subj: "a cute palm tree" },
  { src: "beachball.png", x: 521, y: 93,  w: 44,  h: 47,    subj: "a cute beach ball" },
  { src: "conch.png",     x: 430, y: 212, w: 52,  h: 47.25, subj: "a cute seashell conch" },
  { src: "parasol.png",   x: 634, y: 520, w: 64,  h: 75.22, subj: "a cute beach parasol" },
  { src: "sandcastle.png",x: 422, y: 548, w: 62,  h: 54.73, subj: "a cute sand castle" },
  { src: "watergun.png",  x: 227, y: 561, w: 58,  h: 43.03, subj: "a cute water gun toy" },
];
const TW_PANEL_DECOS = [
  { src: "tube.png",       x: 18,  y: 643, w: 125, h: 116,    subj: "a cute child on a swim ring" },
  { src: "bubbles.png",    x: 111, y: 680, w: 46,  h: 79.55,  subj: "cute water bubbles" },
  { src: "icecream.png",   x: 96,  y: 767, w: 56,  h: 110.16, subj: "a cute ice cream" },
  { src: "beachball.png",  x: 533, y: 666, w: 79,  h: 79,     subj: "a cute beach ball" },
  { src: "sandcastle.png", x: 533, y: 779, w: 114, h: 108,    subj: "a cute sand castle" },
];

function readTopicWeb(payload) {
  const p = payload || {};
  const web = p.topic_web || {};
  return {
    main: web.main_topic || p.theme || p.title || "놀이 주제망",
    subs: arr(web.subtopics).map((s) => ({ title: s?.subtopic || "", ideas: arr(s?.play_ideas) })),
    questions: arr(p.children_expected_questions),
    className: p.className || p.age_band || "우리반",
    period: p.period || "",
  };
}

export function buildTopicWebDoc(payload) {
  const c = readTopicWeb(payload);
  const m = maker();
  const els = [m.bg({ bg: TW_BG })];
  // 스티커 — subject 부여(재생성), 이동/재생성 가능(잠금 아님)
  const stk = (src, x, y, w, h, id, subj) => els.push({
    id, type: "image", src: `${TW_ASSET}/${src}`, fit: "contain", sticker: true, subject: subj,
    x: tX(x), y: tY(y), w: tD(w), h: tD(h), rotation: 0, style: { radius: 0 },
  });

  // 중앙 점선 영역 + 마인드맵 연결선(카드 뒤)
  els.push(m.shape(tX(12), tY(150), tD(696), tD(452), { bg: "rgba(255,255,255,0.5)", radius: tD(44), stroke: "#a9dbf1", strokeWidth: 3 }));
  els.push({ id: "twbranch", type: "image", src: `${TW_ASSET}/branches.svg`, fit: "fill", sticker: false, locked: true, x: tX(216), y: tY(246), w: tD(286), h: tD(232), rotation: 0, style: { radius: 0 } });

  // 8 소주제 카드
  TW_CARDS.forEach((cd, i) => {
    const s = c.subs[i] || {};
    const title = has(s.title) ? s.title : cd.title;
    const ideas = (s.ideas && s.ideas.length ? s.ideas : cd.ideas).slice(0, 3);
    els.push(m.shape(tX(cd.x), tY(cd.y), tD(cd.w), tD(cd.h), { bg: "#ffffff", radius: tD(20), stroke: cd.bd, strokeWidth: 2, shadow: "0 5px 7px rgba(60,110,160,0.14)" }));
    const titleW = cd.icon ? tD(cd.ix - 18) : tD(cd.w - 28);
    els.push(m.text(tX(cd.x + 14), tY(cd.y + 12), titleW, tD(46), title, { fontSize: tD(16), fontFamily: LABEL_FONT, color: cd.ac, align: "left", valign: "center" }, { textRole: "title" }));
    if (cd.icon) stk(cd.icon, cd.x + cd.ix, cd.y + cd.iy, cd.iw, cd.ih, `twic${i}`, cd.subj);
    if (cd.icon === "sunset.png") stk("lighthouse.png", cd.x + 136, cd.y + 68, 60, 71.59, `twlh${i}`, "a cute lighthouse");
    const bullets = ideas.map((t) => `▸ ${t}`).join("\n");
    els.push(m.text(tX(cd.x + 14), tY(cd.y + cd.listY), tD(cd.w - 28), tD(66), bullets, { fontSize: tD(13.5), fontFamily: BODY_FONT, color: TW_BULLET_TX, align: "left", valign: "top" }));
  });

  // 중앙 노드(대주제)
  els.push(m.shape(tX(280), tY(298), tD(160), tD(160), { bg: "radial-gradient(circle at 40% 32%,#4bb6e6,#2f8fd0 52%,#1f6fb8)", radius: tD(80), stroke: "#ffffff", strokeWidth: 5, shadow: "0 8px 11px rgba(31,111,184,0.4)" }));
  els.push(m.text(tX(280), tY(298), tD(160), tD(160), c.main, { fontSize: fitFontSize(c.main, tD(120), tD(96), tD(34), 14), fontFamily: LABEL_FONT, color: "#ffffff", align: "center", valign: "center" }, { textRole: "title" }));
  stk("waterdrop.png", 275, 296, 44, 55.11, "twdrop", "a cute water drop");
  stk("crab.png", 389, 382, 52, 37.11, "twcrab", "a cute crab");
  stk("starfish.png", 276, 381, 44, 42.16, "twstar", "a cute starfish");

  // 하단 '주제 탐구 질문' 패널
  els.push(m.shape(tX(10), tY(623), tD(688), tD(322), { bg: "rgba(233,248,238,0.72)", radius: tD(32), stroke: "#bfe6c9", strokeWidth: 3 }));
  els.push(m.text(tX(190), tY(631), tD(340), tD(34), "🔍  주제 탐구 질문", { fontSize: tD(23), fontFamily: LABEL_FONT, color: "#2f7fd6", align: "center", valign: "center" }, { textRole: "title" }));
  TW_QSLOTS.forEach((q, i) => {
    const col = TW_QCOLORS[q.c];
    const txt = has(c.questions[i]) ? c.questions[i] : TW_QDEFAULT[i];
    els.push(m.shape(tX(q.x), tY(q.y), tD(q.w), tD(q.h), { bg: col.bg, radius: tD(18), stroke: col.bd, strokeWidth: 2 }));
    els.push(m.text(tX(q.x) + 6, tY(q.y), tD(q.w) - 12, tD(q.h), txt, { fontSize: fitFontSize(txt, tD(q.w) - 12, tD(q.h), tD(15.5), 9), fontFamily: LABEL_FONT, color: col.tc, align: "center", valign: "center" }));
  });
  TW_PANEL_DECOS.forEach((d, i) => stk(d.src, d.x, d.y, d.w, d.h, `twpd${i}`, d.subj));

  // 헤더 — 반이름 배지 / 예상 전개 기간 / 제목(2톤)
  els.push(m.shape(tX(18), tY(20), tD(116.31), tD(38), { bg: "#ffffff", radius: tD(22), stroke: "#7cc6e8", strokeWidth: 2, shadow: "0 3px 4px rgba(40,110,170,0.14)" }));
  els.push(m.text(tX(18) + tD(16), tY(20), tD(116.31) - tD(20), tD(38), c.className, { fontSize: tD(16), fontFamily: LABEL_FONT, color: "#2f7fd6", align: "left", valign: "center" }));
  els.push(m.shape(tX(587.98), tY(20), tD(114.02), tD(55.78), { bg: "#eaf6ff", radius: tD(16), stroke: "#7cc6e8", strokeWidth: 2 }));
  els.push(m.text(tX(587.98), tY(20), tD(114.02), tD(55.78), has(c.period) ? c.period : "예상 전개 기간\n6/3 ~ 6/28", { fontSize: tD(14), fontFamily: LABEL_FONT, color: "#2f7fd6", align: "center", valign: "center" }));
  els.push(m.text(tX(180), tY(16), tD(360), tD(53), c.main, { fontSize: Math.min(tD(52), fitFontSize(c.main, tD(360), tD(53), tD(52), 20)), fontFamily: LABEL_FONT, color: "#15559f", align: "center", valign: "center" }, { textRole: "title" }));
  els.push(m.text(tX(180), tY(69), tD(360), tD(53), "놀이주제망", { fontSize: tD(52), fontFamily: LABEL_FONT, color: "#1a9b8a", align: "center", valign: "center" }, { textRole: "title" }));

  // 헤더·주변 장식 스티커(맨 위)
  TW_DECOS.forEach((d, i) => stk(d.src, d.x, d.y, d.w, d.h, `twdc${i}`, d.subj));

  return doc(`${c.main} 놀이주제망`, TW_BG, els);
}

// ════════════════════════════ 놀이중심 주간계획안 (여름바다 — Figma 큐레이션) ════════════════════════════
// Figma '놀이계획-주안-여름바다'(node 55:872, 1157×1412) → A4 794×1123 폭맞춤(×0.686) + 세로중앙(OFFY 77).
//   구성: 헤더(돌고래·등대·문어·불가사리 데코 + 제목 + 기간) + 좌측 라벨행(주제·기간·선정이유·교사기대·교육과정연계)
//         + 5일 놀이흐름표(월~금) + 바깥놀이 5칸 + 안전·인성·행사·가정연계 + 하단 배너.
//   weekly_plan payload(basic_info/rationale/teacher_expectations/curriculum_links/daily_flow/…) 동적 매핑.
//   텍스트 편집 + 스티커 subject 재생성(기존 에셋 활용/없으면 생성).
const WK_BG = "#ffffff";
const WK_S = 794 / 1157;                                  // 폭맞춤 0.6863
const WK_OFFY = Math.round((A4.H - 1412 * WK_S) / 2);     // 세로중앙 77
const wX = (v) => Math.round(v * WK_S);
const wY = (v) => Math.round(v * WK_S) + WK_OFFY;
const wD = (v) => Math.round(v * WK_S);
const WK_ASSET = "/generated-assets/weekly-record";
const WK_BX = 22, WK_BY = 156;                            // 본문 테두리 박스 원점(포스터 기준)
const wbx = (rx) => wX(WK_BX + rx);
const wby = (ry) => wY(WK_BY + ry);
const WK_LABEL_TX = "#2f6db0", WK_BODY_TX = "#3a3a3a";
const WK_COLX = [200, 380.19, 560.39, 740.59, 920.8], WK_COLW = 188.2;

const WK_DAYS_DEF = [
  { d: "월", sub: "(7/6)",  ideas: ["바다 생물 그림 잔치", "바다 여행 떠나요", "조개 껍데기 목걸이"] },
  { d: "화", sub: "(7/7)",  ideas: ["찰방찰방 물놀이 체조", "파도 리본 춤추기", "첨벙첨벙 물놀이 상상"] },
  { d: "수", sub: "(7/8)",  ideas: ["바다 친구 낚시터", "바다 속 보물찾기", "해변가 산책하기"] },
  { d: "목", sub: "(7/9)",  ideas: ["바다 퀴즈 왕", "조개 껍데기 분류하기", "구조대 역할놀이"] },
  { d: "금", sub: "(7/10)", ideas: ["밀물과 썰물 놀이", "바다를 지켜주세요", "바다 속 악기 연주"] },
];
const WK_OUTDOOR_DEF = [
  "바다 생물 그림자 밟기 - 바다 생물 모양의 그림자가 생기도록 다양한 도구를 이용해 보고, 그림자를 따라 뛰어다니며 신나는 바다 탐험을 즐겨요.",
  "모래시장 파도 만들기 - 커다란 삽과 모래 놀이 도구를 이용해 나만의 파도를 만들고, 밀물과 썰물처럼 모래를 파고 덮으며 바다의 변화를 느껴봐요.",
  "바다 속 보물 찾기 - 운동장에 숨겨진 다양한 모양과 색깔의 조개 껍데기와 보물 카드를 찾으며 온몸으로 뛰어다녀요. 찾은 보물을 모으며 성취감을 느껴요.",
  "바닷속 길 따라 걷기 - 바닥에 그려진 알록달록 물고기와 바다 식물 그림을 따라 걸으며 리듬감 있게 움직여요. 친구와 함께 누가 더 멀리, 누가 더 신나게 걷는지 겨뤄봐요.",
  "해변에서 장애물 넘기 - 물결 모양으로 놓인 콜라주로 굴과 터널을 지나고, 모래 주머니를 넘어 바다 탐험을 즐겨요. 용감하게 장애물을 넘으며 신나는 시간을 경험해요.",
];
const WK_ROWS = [
  { key: "period", top: 63.75,  h: 73.66,  label: "예상놀이 기간", icon: "label-period.png",     iw: 38, ih: 44.66, def: "" },
  { key: "reason", top: 137.41, h: 84.61,  label: "주제 선정 이유", icon: "label-reason.png",     iw: 44, ih: 55.61, def: "바다와 관련된 다양한 활동을 통해 유아의 호기심을 자극하고 탐구 능력을 키울 수 있습니다. 신체, 언어, 인지, 사회정서, 예술경험 영역을 아우르며 즐거운 바다 탐험 경험을 제공합니다." },
  { key: "goal",   top: 222.02, h: 110.59, label: "교사의 기대 (활동 목표)", icon: "label-goal.png", iw: 44, ih: 31.41, def: "1. 아이들은 바다 생물에 대한 긍정적인 관심과 호기심을 가지고 상상력을 발휘하여 다양한 바다 생물을 창의적으로 표현한다. 2. 바다 여행 동화를 만들고 들려주는 활동을 통해 자신의 생각과 느낌을 말하고 친구와 소통하는 즐거움을 경험한다. 3. 조개 껍데기를 활용한 목걸이 만들기, 낚시놀이, 보물찾기 등 다양한 신체 활동에 즐겁게 참여하며 소근육 발달과 집중력을 향상시킨다." },
  { key: "curri",  top: 332.61, h: 105.13, label: "교육과정 연계", icon: "label-curriculum.png", iw: 58, ih: 47, def: "예술경험 > 창의적으로 표현하기 > 다양한 미술 재료와 도구로 자신의 생각과 느낌을 표현한다.\n의사소통 > 듣기와 말하기 > 자신의 경험, 느낌, 생각을 말한다.\n신체운동·건강 > 신체활동 즐기기 > 기초적인 이동운동, 제자리 운동, 도구를 이용한 운동을 한다." },
];
const WK_ROWS2 = [
  { key: "safety", top: 751.44, h: 76.84,  label: "안전 교육",    icon: "label-flow.png",   iw: 38, ih: 37.2,  def: "물놀이 시에는 반드시 선생님과 함께하고, 깊은 곳에는 가지 않아요. 낚시 놀이를 할 때는 낚싯바늘에 찔리지 않도록 조심하고, 친구를 향해 겨누지 않아요." },
  { key: "char",   top: 828.28, h: 76.84,  label: "인성 교육",    icon: "label-topic.png",  iw: 36, ih: 35.75, def: "바다 생물을 아끼고 소중히 여기는 마음을 가져요. 친구와 함께 조개 껍데기를 모으고 나누면서 협동하는 즐거움을 느껴요. 구조대 역할 놀이를 통해 어려움에 처한 친구를 돕는 따뜻한 마음을 길러요." },
  { key: "event",  top: 905.13, h: 73.66,  label: "행사",        icon: "label-period.png", iw: 38, ih: 44.66, def: "" },
  { key: "home",   top: 978.78, h: 127.56, label: "가정연계활동",  icon: "label-home.png",   iw: 64, ih: 52,    def: "바다 탐험대가 되어본 유아들이 가정으로 돌아가 가족에게 오늘 있었던 바다 탐험 이야기를 들려주고, 함께 바다 관련 책을 읽으며 추가적으로 바다 생물에 대한 관심을 키울 수 있습니다. 집에 있는 재활용품(플라스틱 병, 페트병 뚜껑 등)을 활용하여 바다 생물 모형을 만들거나, 빈 상자로 바닷속 풍경을 꾸며보는 활동을 통해 유아의 창의력과 문제 해결 능력을 향상시킬 수 있습니다." },
];
const WK_DECOS = [
  { src: "dolphin-big.png",   x: 22,   y: 6,  w: 140, h: 152.63, subj: "a cute jumping dolphin" },
  { src: "dolphin-small.png", x: 151,  y: 61, w: 105, h: 80,     subj: "a cute small dolphin" },
  { src: "lighthouse.png",    x: 881,  y: 25, w: 106, h: 122.32, subj: "a cute lighthouse" },
  { src: "octopus.png",       x: 982,  y: 16, w: 102, h: 117.33, subj: "a cute octopus" },
  { src: "starfish.png",      x: 1076, y: 74, w: 74,  h: 60.46,  subj: "a cute starfish and shells" },
];

function readWeekly(payload) {
  const d = payload || {};
  const b = d.basic_info || {};
  const period = b.period?.label || [b.period?.start_date, b.period?.end_date].filter(Boolean).join(" ~ ");
  // play_ideas 는 문자열 또는 {title,...} 객체 → 제목 문자열로 정규화
  const ideaText = (p) => (typeof p === "string" ? p : (p?.title || p?.name || ""));
  const days = arr(d.daily_flow).map((x) => ({ d: x?.day || "", sub: x?.date || x?.flow_stage || "", ideas: arr(x?.play_ideas).map(ideaText).filter(Boolean) }));
  const outdoor = arr(d.outdoor_and_physical_play).map((o) => [o?.activity_name, o?.method].filter(has).join(" - "));
  const s = d.safety_education, ch = d.character_education, h = d.home_connection;
  return {
    theme: b.theme || d.theme || "바다",
    sub: b.sub_theme || "바다 탐험대",
    period: period || "",
    className: b.class_name || (has(b.age_band) ? `만 ${b.age_band}` : ""),
    reason: d.rationale?.summary || d.rationale?.meaning_of_this_week || "",
    goal: arr(d.teacher_expectations).map((e, i) => `${i + 1}. ${e?.goal || ""}`).join(" "),
    curri: arr(d.curriculum_links).map((cl) => [cl?.area, cl?.category, cl?.content].filter(has).join(" > ")).join("\n"),
    days, outdoor,
    safety: s ? [s.play_safety, s.tool_safety, s.life_safety, s.weekly_safety_focus, s.teacher_guidance].filter(has).join(" ") : "",
    char: ch && has(ch.core_value) ? `${ch.core_value}${has(ch.practice_context) ? " — " + ch.practice_context : ""}` : "",
    event: arr(d.events).filter((e) => has(e?.name) && e.name !== "-").map((e) => [e.name, e.date, e.connection].filter(has).join(" ")).join(", "),
    home: !h ? "" : (typeof h === "string" ? h : [h.summary, h.activity, h.description, h.text].filter(has).join(" ")),
  };
}

export function buildWeeklyPlanDoc(payload) {
  const c = readWeekly(payload);
  const m = maker();
  const els = [m.bg({ bg: WK_BG })];
  const stk = (src, x, y, w, h, id, subj) => els.push({ id, type: "image", src: `${WK_ASSET}/${src}`, fit: "contain", sticker: true, subject: subj, x: wX(x), y: wY(y), w: wD(w), h: wD(h), rotation: 0, style: { radius: 0 } });
  const BW = 1113, BH = 1110.34;
  const contentX = 220, contentW = BW - contentX - 16;

  // 본문 테두리 박스 + 좌측 라벨 컬럼 + 분리선
  els.push(m.shape(wbx(0), wby(0), wD(BW), wD(BH), { bg: "#ffffff", radius: wD(12), stroke: "#a9cbe8", strokeWidth: 2 }));
  els.push(m.shape(wbx(0), wby(0), wD(200), wD(BH), { bg: "#eaf3fb", radius: 0 }));
  els.push(m.shape(wbx(200), wby(0), Math.max(1, wD(1.5)), wD(BH), { bg: "#b3d2ec", radius: 0 }));
  [63.75, 137.41, 222.02, 332.61, 437.73, 601.66, 751.44, 828.28, 905.13, 978.78].forEach((t) =>
    els.push(m.shape(wbx(0), wby(t), wD(BW), Math.max(1, wD(1)), { bg: "#b3d2ec", radius: 0 })));

  // 라벨셀(아이콘 + 텍스트)
  const labelCell = (top, h, icon, iw, ih, label, center) => {
    const iy = top + (h - ih) / 2 - (center ? 12 : 0);
    stk(icon, WK_BX + (center ? (200 - iw) / 2 : 12), WK_BY + iy, iw, ih, `wkic_${Math.round(top)}`, "a cute sea icon");
    els.push(m.text(wbx(center ? 20 : 58), wby(center ? top + h - 42 : top), wD(center ? 160 : 132), wD(center ? 36 : h), label, { fontSize: wD(17), fontFamily: LABEL_FONT, color: WK_LABEL_TX, align: center ? "center" : "left", valign: center ? "top" : "center" }, { textRole: "title" }));
  };

  // Row1 예상 놀이주제 — 주제 + 소주제
  labelCell(0, 63.75, "label-topic.png", 36, 35.75, "예상 놀이주제", false);
  els.push(m.text(wbx(contentX), wby(8), wD(120), wD(48), c.theme, { fontSize: wD(16), fontFamily: BODY_FONT, color: WK_BODY_TX, align: "left", valign: "center" }));
  els.push(m.text(wbx(contentX + 60), wby(8), wD(70), wD(48), "소주제:", { fontSize: wD(15), fontFamily: BODY_FONT, color: "#99aabb", align: "left", valign: "center" }));
  els.push(m.text(wbx(contentX + 132), wby(8), wD(320), wD(48), c.sub, { fontSize: wD(16), fontFamily: LABEL_FONT, color: WK_BODY_TX, align: "left", valign: "center" }));

  // 단순 라벨 행(기간·선정이유·교사기대·교육과정연계)
  WK_ROWS.forEach((r) => {
    const center = r.key === "goal";
    labelCell(r.top, r.h, r.icon, r.iw, r.ih, r.label, center);
    const val = r.key === "period" ? (has(c.period) ? c.period : "7/6~7/10")
      : r.key === "reason" ? (has(c.reason) ? c.reason : r.def)
      : r.key === "goal" ? (has(c.goal.replace(/\d+\.\s*/g, "").trim()) ? c.goal : r.def)
      : (has(c.curri) ? c.curri : r.def);
    els.push(m.text(wbx(contentX), wby(r.top + 8), wD(contentW), wD(r.h - 16), val, { fontSize: fitFontSize(val, wD(contentW), wD(r.h - 16), wD(r.key === "period" ? 16 : 14.5), 8), fontFamily: BODY_FONT, color: WK_BODY_TX, align: "left", valign: "center" }));
  });

  // Row6 예상놀이흐름 표(5일)
  {
    const top = 437.73, h = 163.92;
    labelCell(top, h, "label-flow.png", 40, 39.17, "예상놀이흐름", false);
    WK_COLX.forEach((cx, i) => {
      const day = c.days[i] || WK_DAYS_DEF[i];
      const dd = has(day.d) ? day.d : WK_DAYS_DEF[i].d;
      const sub = has(day.sub) ? day.sub : WK_DAYS_DEF[i].sub;
      const ideas = (day.ideas && day.ideas.length ? day.ideas : WK_DAYS_DEF[i].ideas);
      if (i > 0) els.push(m.shape(wbx(cx), wby(top), Math.max(1, wD(1)), wD(h), { bg: "#dcebf7", radius: 0 }));
      els.push(m.shape(wbx(cx), wby(top), wD(WK_COLW), wD(62), { bg: "#f5faff", radius: 0 }));
      els.push(m.shape(wbx(cx), wby(top + 62), wD(WK_COLW), Math.max(1, wD(1)), { bg: "#e6f0f9", radius: 0 }));
      els.push(m.text(wbx(cx), wby(top + 8), wD(WK_COLW), wD(24), dd, { fontSize: wD(19), fontFamily: LABEL_FONT, color: "#2a3f6b", align: "center", valign: "center" }, { textRole: "title" }));
      els.push(m.text(wbx(cx), wby(top + 34), wD(WK_COLW), wD(18), sub, { fontSize: wD(13), fontFamily: BODY_FONT, color: "#7a8894", align: "center", valign: "center" }));
      els.push(m.text(wbx(cx + 8), wby(top + 72), wD(WK_COLW - 16), wD(h - 82), ideas.join("\n"), { fontSize: fitFontSize(ideas.join("\n"), wD(WK_COLW - 16), wD(h - 82), wD(13.5), 8), fontFamily: BODY_FONT, color: "#454545", align: "center", valign: "center" }));
    });
  }

  // Row7 바깥놀이 및 신체활동 표(5일)
  {
    const top = 601.66, h = 149.78;
    labelCell(top, h, "label-outdoor.png", 44, 51.88, "바깥놀이 및 신체활동", true);
    WK_COLX.forEach((cx, i) => {
      const txt = has(c.outdoor[i]) ? c.outdoor[i] : WK_OUTDOOR_DEF[i];
      if (i > 0) els.push(m.shape(wbx(cx), wby(top), Math.max(1, wD(1)), wD(h), { bg: "#dcebf7", radius: 0 }));
      els.push(m.text(wbx(cx + 10), wby(top + 10), wD(WK_COLW - 20), wD(h - 20), txt, { fontSize: fitFontSize(txt, wD(WK_COLW - 20), wD(h - 20), wD(13), 8), fontFamily: BODY_FONT, color: "#454545", align: "left", valign: "center" }));
    });
  }

  // 안전·인성·행사·가정연계
  WK_ROWS2.forEach((r) => {
    labelCell(r.top, r.h, r.icon, r.iw, r.ih, r.label, false);
    const val = r.key === "safety" ? (has(c.safety) ? c.safety : r.def)
      : r.key === "char" ? (has(c.char) ? c.char : r.def)
      : r.key === "event" ? c.event
      : (has(c.home) ? c.home : r.def);
    els.push(m.text(wbx(contentX), wby(r.top + 8), wD(contentW), wD(r.h - 16), val, { fontSize: fitFontSize(val, wD(contentW), wD(r.h - 16), wD(14.5), 8), fontFamily: BODY_FONT, color: WK_BODY_TX, align: "left", valign: "center" }));
  });

  // 헤더 — 제목 / 반·연령 / 데코
  els.push(m.text(wX(330), wY(47), wD(497), wD(52), "놀이중심 주간계획안", { fontSize: Math.min(wD(52), fitFontSize("놀이중심 주간계획안", wD(497), wD(52), wD(52), 24)), fontFamily: LABEL_FONT, color: "#3f8fd6", align: "center", valign: "center" }, { textRole: "title" }));
  els.push(m.text(wX(950), wY(134), wD(190), wD(18), has(c.className) ? c.className : "2026 (만 5세)", { fontSize: wD(17), fontFamily: LABEL_FONT, color: "#6a7a88", align: "right", valign: "center" }));
  WK_DECOS.forEach((d, i) => stk(d.src, d.x, d.y, d.w, d.h, `wkdc${i}`, d.subj));

  // 하단 배너
  const bnY = 1306.34;
  els.push(m.shape(wX(0), wY(bnY), wD(1157), wD(92), { bg: "linear-gradient(180deg,#dff1fb 0%,#cdeaf7 100%)", radius: 0 }));
  els.push(m.text(wX(280), wY(bnY + 30), wD(640), wD(28), "놀이 흥미와 요구, 상황에 따라 변경될 수 있으며, 함께 만들어가는 놀이중심 교육과정으로 운영합니다.", { fontSize: wD(17), fontFamily: LABEL_FONT, color: "#3f8fd0", align: "center", valign: "center" }));
  stk("sandcastle.png", 11, bnY - 29, 142, 135, "wkbn0", "a cute sand castle");
  stk("seaweed.png", 149, bnY - 13, 93, 104, "wkbn1", "cute seaweed");
  stk("seaweed.png", 973, bnY - 15, 93, 104, "wkbn2", "cute seaweed");
  stk("seaweed.png", 1047.97, bnY - 12, 93, 104, "wkbn3", "cute seaweed");

  // 표 구조(테두리·분리선·셀 배경·배경 도형)만 locked(레이아웃 고정) →
  // 텍스트·스티커는 이동·리사이즈·회전·편집·재생성 자유(다른 템플릿과 동일한 편집성).
  els.forEach((e) => { if (e.type === "shape") e.locked = true; });
  return doc("놀이중심 주간계획안", WK_BG, els);
}

function readMonthly(payload) {
  const d = payload || {};
  const b = d.basic_info || {};
  const period = b.period?.label || [b.period?.start_date, b.period?.end_date].filter(Boolean).join(" ~ ");
  const ideaText = (p) => (typeof p === "string" ? p : (p?.title || p?.name || ""));
  const weeks = arr(d.weekly_flow).map((w) => ({ week: w?.week, sub: w?.sub_theme || w?.flow_stage || "", ideas: arr(w?.play_ideas).map(ideaText).filter(Boolean) }));
  const outdoor = arr(d.outdoor_and_physical_play).map((o) => [o?.activity_name, o?.method].filter(has).join("\n"));
  const s = d.safety_education, ch = d.character_education, h = d.home_connection;
  return {
    theme: b.theme || d.theme || "색깔 탐험",
    month: b.month || b.season || "",
    period: period || "",
    className: b.class_name || (has(b.age_band) ? `만 ${b.age_band}` : ""),
    reason: d.rationale?.summary || "",
    goals: arr(d.teacher_expectations).map((e) => e?.goal || "").filter(Boolean),
    curri: arr(d.curriculum_links).map((cl) => [cl?.area, cl?.category, cl?.content].filter(has).join(" > ")).join("\n"),
    weeks, outdoor,
    safety: s ? [s.play_safety, s.tool_safety, s.life_safety, s.weekly_safety_focus, s.teacher_guidance].filter(has).join(" ") : "",
    char: ch && has(ch.core_value) ? `${ch.core_value}${has(ch.practice_context) ? " — " + ch.practice_context : ""}` : "",
    event: arr(d.events).filter((e) => has(e?.name) && e.name !== "-").map((e) => [e.name, e.date, e.connection].filter(has).join(" ")).join(", "),
    home: !h ? "" : (typeof h === "string" ? h : [h.summary, h.activity, h.description, h.text].filter(has).join(" ")),
  };
}

// ════════════════════════════ 놀이중심 월간계획안 (여름바다 — Figma 74:455 큐레이션) ════════════════════════════
// Figma '월간계획안 여름바다'(node 74:455, bg frame 1097×1630) → A4 794×1123 높이맞춤(×0.689) + 좌우중앙(OFFX 19).
//   구성: 바다 그라데이션 배경 + 헤더(갈매기·돛단배·고래·플로트·상어 + 배지 + 제목 + 부제)
//         + 소개/기대 2박스 + 교육과정 연계(3영역 pill) + 5주차 놀이흐름 카드(생물 스티커)
//         + 바깥놀이 pill 6 + 안전·인성·가정·행사 2×2 + 하단 모래 배너(산호동굴·해초·불가사리·산호·소라게·고래).
//   monthly_plan payload(basic_info/rationale/teacher_expectations/curriculum_links/weekly_flow/…) 동적 매핑.
//   놀이기록처럼 텍스트 편집 + 스티커 subject 재생성 — 잠금 없음.
const MS_S = 1123 / 1630;                                  // 높이맞춤 0.6890
const MS_OFFX = Math.round((A4.W - 1097 * MS_S) / 2);      // 좌우중앙 19
const sX = (v) => Math.round(v * MS_S) + MS_OFFX;
const sY = (v) => Math.round(v * MS_S);
const sD = (v) => Math.round(v * MS_S);
// 기존 여름바다 스티커 재사용 — 주제망(topicweb-record)·주안(weekly-record) 큐레이션 세트.
const MS_TW = "/generated-assets/topicweb-record";
const MS_WK = "/generated-assets/weekly-record";
const MS_BG = "linear-gradient(180deg,#eaf7ff 0%,#cbe9f9 12%,#9ad6f2 32%,#66b9e5 55%,#4098d4 78%,#3079b7 100%)";
const MS_JUA = "'Jua', sans-serif";
const MS_WEEK_DEF = [
  { title: "바다 생명과 함께해요",  ideas: ["상어 탈출 달리기", "물총 위기 생물 보호", "잠수함 생물 꾸미기"],                          stk: `${MS_TW}/crab.png`,       subj: "a cute crab",       sw: 74, sh: 60, ac: "#f39c4e", tc: "#dd7f2b" },
  { title: "바다의 비밀을 탐구해요", ideas: ["모래성 쌓기 게임", "소금물 농도 실험", "바다 플로깅 규칙", "찰흙 바다 친구들", "해초 댄스"], stk: `${MS_TW}/sandcastle.png`, subj: "a cute sand castle", sw: 76, sh: 72, ac: "#37b6c3", tc: "#1f8a97" },
  { title: "바다를 지키는 우리",   ideas: ["바다 거북 구조대", "친환경 신고함", "바다 생물 수수께끼", "여름 과일 패턴", "바다 보호 포스터"], stk: `${MS_TW}/turtle.png`,     subj: "a cute sea turtle", sw: 78, sh: 66, ac: "#5cc078", tc: "#3a9c56" },
  { title: "신나는 바다 놀이",     ideas: ["바다를 지키는 약속", "시원한 파도가 쏴아", "여름 날씨 관찰", "물놀이 안전 규칙", "바다 쓰레기 악기"], stk: `${MS_WK}/dolphin-big.png`, subj: "a cute jumping dolphin", sw: 78, sh: 78, ac: "#4c9fe0", tc: "#2e79bd" },
  { title: "바다를 닮은 예술가",   ideas: ["파란 바다 협동화", "바다 속 생물 관찰", "종이컵 문어 만들기", "바다 여행 집 쓰기", "해변 쓰레기 줍기"], stk: `${MS_TW}/octopus.png`,   subj: "a cute octopus",    sw: 72, sh: 72, ac: "#ef7fa0", tc: "#d85a80" },
];
const MS_WEEKX = [40, 243.59, 447.19, 650.8, 854.39];
const MS_OUTDOOR_DEF = ["🐢 바다 거북 구조대 놀이", "🚶 바닷속 탐험하며 걷기", "💌 바다 보호 약속 카드", "🌊 파도 모양 만들기", "🐚 바다 생태계 걷기", "🏰 모래 바닷속 생물 표현"];
const MS_OUTDOOR_POS = [
  { x: 60, y: 963.36, w: 191, bd: "#f4b58a" }, { x: 248.05, y: 963.36, w: 185.25, bd: "#8fcf95" }, { x: 430.3, y: 963.36, w: 178.44, bd: "#f0a6c4" },
  { x: 605.73, y: 963.36, w: 160.02, bd: "#8fc9e6" }, { x: 762.75, y: 963.36, w: 157.84, bd: "#c4b0e0" }, { x: 60, y: 1008.36, w: 191.34, bd: "#f4b58a" },
];
const MS_HEADER_STK = [
  { src: `${MS_TW}/seagull.png`,     x: 34,  y: 20,  w: 141, h: 136, subj: "two cute white seagulls flying" },
  { src: `${MS_TW}/parasol.png`,     x: 928, y: 22,  w: 117, h: 134, subj: "a cute beach parasol" },
  { src: `${MS_WK}/dolphin-big.png`, x: 80,  y: 161, w: 137, h: 144, subj: "a cute jumping dolphin" },
  { src: `${MS_TW}/tube.png`,        x: 485, y: 157, w: 111, h: 117, subj: "a cute swim ring float" },
  { src: `${MS_WK}/dolphin-small.png`, x: 862, y: 168, w: 121, h: 100, subj: "a cute small dolphin" },
];
const MS_BANNER_STK = [
  { src: `${MS_TW}/palm.png`,      x: 34,  y: 1503, w: 150, h: 128, subj: "a cute palm tree" },
  { src: `${MS_WK}/seaweed.png`,   x: 196, y: 1508.62, w: 93, h: 117, subj: "cute green seaweed plants" },
  { src: `${MS_TW}/starfish.png`,  x: 316, y: 1547.69, w: 88,  h: 82,  subj: "a cute orange starfish" },
  { src: `${MS_TW}/conch.png`,     x: 766, y: 1516, w: 112, h: 108, subj: "a cute seashell conch" },
  { src: `${MS_TW}/crab.png`,      x: 892, y: 1550, w: 96,  h: 78,  subj: "a cute crab" },
  { src: `${MS_TW}/sunset.png`,    x: 980, y: 1520, w: 118, h: 104, subj: "a cute sunset over the sea" },
];
const MS_BOT_ROWS = [
  { key: "safety", x: 40,  y: 1075.36, badgeBg: "#fbe0d2", badgeTc: "#c2551c", label: "🛟 안전 교육",   def: "바닷가에서는 어른과 함께 다니고, 깊은 물에 혼자 들어가지 않아요. 물놀이 전 준비운동을 하고, 서로 밀거나 뛰지 않아요." },
  { key: "char",   x: 549, y: 1075.36, badgeBg: "#d6f0d8", badgeTc: "#2f8f4e", label: "💚 인성 교육",   def: "바다 생물을 보호하기 위해 노력하고, 친구와 협동하며, 바다를 지키는 약속을 실천하며 책임감을 배워요." },
  { key: "home",   x: 40,  y: 1190.73, badgeBg: "#e7dcf6", badgeTc: "#7a51c4", label: "🏠 가정연계활동", def: "바다 환경 보호 실천을 가족과 이야기 나누고, 집에 있는 재료로 나만의 바다 생물을 만들거나 관련 책을 함께 읽어요." },
  { key: "event",  x: 549, y: 1190.73, badgeBg: "#dbe7fb", badgeTc: "#3f6fd0", label: "🎉 행사",        def: "-" },
];
const MS_CUR_DEF = [
  { area: "신체운동·건강", content: "실내외 신체활동에 자발적으로 참여한다.",       bg: "#f4a259", w: 108 },
  { area: "자연탐구",     content: "주변의 동식물에 관심을 가진다.",             bg: "#7fc08a", w: 82 },
  { area: "예술경험",     content: "다양한 미술 재료와 도구로 생각과 느낌을 표현한다.", bg: "#ef9dbd", w: 82 },
];

export function buildMonthlyPlanSummerDoc(payload) {
  const c = readMonthly(payload);
  const d = payload || {};
  const m = maker();
  const els = [m.bg({ bg: MS_BG })];
  const stk = (src, x, y, w, h, id, subj) => els.push({ id, type: "image", src, fit: "contain", sticker: true, subject: subj, x: sX(x), y: sY(y), w: sD(w), h: sD(h), rotation: 0, style: { radius: 0 } });
  const SHADOW = "0 4px 14px rgba(30,70,110,0.10)";

  // ── 헤더 배지·제목·부제 ──
  els.push(m.shape(sX(391.17), sY(28), sD(314.64), sD(35), { bg: "#ffffff", radius: sD(18), stroke: "#a6d8f2", strokeWidth: 2, shadow: SHADOW }));
  const badge = has(c.className) || has(c.month)
    ? [c.month, c.className].filter(has).join(" · ")
    : "2026 · 7월 · 무지개반 (5세)";
  els.push(m.text(sX(391.17), sY(28), sD(314.64), sD(35), badge, { fontSize: sD(18), fontFamily: MS_JUA, color: "#2f8fd6", align: "center", valign: "center" }));
  const title = d?.header?.title || (has(d?.basic_info?.title) ? d.basic_info.title : "여름 바다로 풍덩!");
  els.push(m.text(sX(140), sY(70), sD(817), sD(60), title, { fontSize: Math.min(sD(54), fitFontSize(title, sD(817), sD(60), sD(54), 24)), fontFamily: MS_JUA, color: "#2f8fd6", align: "center", valign: "center", stroke: "#ffffff", strokeWidth: 5 }, { textRole: "title" }));
  const subTheme = d?.basic_info?.sub_theme || "바다와 친구들";
  const subtitle = `놀이중심 월간계획안 · ${subTheme}${has(c.period) ? " · " + c.period : " · 7/1 ~ 7/31"}`;
  els.push(m.text(sX(140), sY(136), sD(816), sD(24), subtitle, { fontSize: sD(17), fontFamily: MS_JUA, color: "#1f5aa0", align: "center", valign: "center" }));

  // ── 소개 박스(왜 이 놀이를 할까요) ──
  els.push(m.shape(sX(39.52), sY(258.8), sD(528.64), sD(144), { bg: "#ffffff", radius: sD(18), stroke: "#e3eef6", strokeWidth: 2, shadow: SHADOW }));
  els.push(m.shape(sX(59.5), sY(272.8), sD(182), sD(30), { bg: "#cdeafa", radius: sD(15) }));
  els.push(m.text(sX(59.5), sY(272.8), sD(182), sD(30), "🌊 왜 이 놀이를 할까요?", { fontSize: sD(15), fontFamily: MS_JUA, color: "#1f6aa8", align: "center", valign: "center" }, { textRole: "title" }));
  const reason = has(c.reason) ? c.reason : "여름철 유아들이 친근하게 느끼는 바다를 주제로, 다양한 바다 생물과 환경 보호의 중요성을 탐구하고 사회관계·예술경험 등 다방면의 놀이로 확장합니다.";
  els.push(m.text(sX(59.5), sY(310), sD(489), sD(78), reason, { fontSize: fitFontSize(reason, sD(489), sD(78), sD(16), 10), fontFamily: BODY_FONT, color: "#3a4653", align: "left", valign: "top" }));

  // ── 교사의 기대 박스 ──
  els.push(m.shape(sX(573.19), sY(255.35), sD(485.3), sD(144), { bg: "#ffffff", radius: sD(18), stroke: "#e3eef6", strokeWidth: 2, shadow: SHADOW }));
  els.push(m.shape(sX(593.19), sY(269.35), sD(125), sD(30), { bg: "#fde7c2", radius: sD(15) }));
  els.push(m.text(sX(593.19), sY(269.35), sD(125), sD(30), "☀️ 교사의 기대", { fontSize: sD(15), fontFamily: MS_JUA, color: "#b4740e", align: "center", valign: "center" }, { textRole: "title" }));
  const goals = c.goals.length ? c.goals : ["바다 생물의 특징을 이해하고 탐색해요", "바다 환경 보호 방법을 친구들과 나눠요", "신체·미술 활동으로 창의성과 표현력을 길러요"];
  const circ = ["①", "②", "③", "④", "⑤"];
  goals.slice(0, 3).forEach((g, i) => {
    els.push(m.text(sX(593.19), sY(308 + i * 25), sD(446), sD(23), `${circ[i]} ${g}`, { fontSize: sD(15.5), fontFamily: BODY_FONT, color: "#3a4653", align: "left", valign: "center" }));
  });

  // ── 교육과정 연계 ──
  els.push(m.shape(sX(40), sY(411.56), sD(1017), sD(105.13), { bg: "#ffffff", radius: sD(16), stroke: "#e3eef6", strokeWidth: 2, shadow: SHADOW }));
  els.push(m.text(sX(60), sY(423), sD(66), sD(60), "교육과정\n연계", { fontSize: sD(16), fontFamily: MS_JUA, color: "#2f6db0", align: "left", valign: "center" }, { textRole: "title" }));
  const curRows = arr(d.curriculum_links).map((cl) => ({ area: cl?.area || "", content: cl?.content || cl?.category || "" }));
  MS_CUR_DEF.forEach((r, i) => {
    const row = curRows[i] || {};
    const top = 411.56 + 14.57 + i * 27;
    els.push(m.shape(sX(138.08), sY(top), sD(r.w), sD(22), { bg: r.bg, radius: sD(11) }));
    els.push(m.text(sX(138.08), sY(top), sD(r.w), sD(22), has(row.area) ? row.area : r.area, { fontSize: sD(13), fontFamily: MS_JUA, color: "#ffffff", align: "center", valign: "center" }));
    els.push(m.text(sX(138.08 + r.w + 20), sY(top + 0.5), sD(560), sD(21), has(row.content) ? row.content : r.content, { fontSize: sD(15), fontFamily: BODY_FONT, color: "#3a4653", align: "left", valign: "center" }));
  });
  stk(`${MS_TW}/seahorse.png`, 876, 423.6, 64, 81, "mscur0", "a cute yellow seahorse");
  stk(`${MS_TW}/conch.png`, 956, 432.6, 70, 63, "mscur1", "a cute seashell conch");

  // ── 헤더 데코 스티커(배경 위, 콘텐츠 사이) ──
  MS_HEADER_STK.forEach((s, i) => stk(s.src, s.x, s.y, s.w, s.h, `mshd${i}`, s.subj));

  // ── 예상 놀이 흐름 섹션 타이틀 + 5주차 카드 ──
  els.push(m.text(sX(150), sY(537.69), sD(797), sD(28), "🫧 5주간의 바다 여행 · 예상 놀이 흐름 🫧", { fontSize: sD(24), fontFamily: MS_JUA, color: "#0f5c96", align: "center", valign: "center" }, { textRole: "title" }));
  MS_WEEKX.forEach((wx, i) => {
    const def = MS_WEEK_DEF[i];
    const w = c.weeks[i] || {};
    const wtitle = has(w.sub) ? w.sub : def.title;
    const ideas = (w.ideas && w.ideas.length ? w.ideas : def.ideas).slice(0, 5);
    const CW = 202.59, CH = 315.67, cy = 581.69;
    els.push(m.shape(sX(wx), sY(cy), sD(CW), sD(CH), { bg: "#ffffff", radius: sD(16), stroke: "#dce9f2", strokeWidth: 2, shadow: SHADOW }));
    els.push(m.shape(sX(wx + 81.8), sY(cy + 12), sD(38), sD(38), { bg: def.ac, radius: sD(19) }));
    els.push(m.text(sX(wx + 81.8), sY(cy + 12), sD(38), sD(38), `${w.week ? w.week : i + 1}주`, { fontSize: sD(15), fontFamily: MS_JUA, color: "#ffffff", align: "center", valign: "center" }));
    stk(def.stk, wx + (CW - def.sw) / 2, cy + 56, def.sw, def.sh, `mswk${i}`, def.subj);
    els.push(m.text(sX(wx + 8), sY(cy + 128), sD(CW - 16), sD(44), wtitle, { fontSize: fitFontSize(wtitle, sD(CW - 16), sD(44), sD(18), 12), fontFamily: MS_JUA, color: def.tc, align: "center", valign: "center" }, { textRole: "title" }));
    els.push(m.text(sX(wx + 12), sY(cy + 178), sD(CW - 22), sD(128), ideas.map((t) => `· ${t}`).join("\n"), { fontSize: fitFontSize(ideas.map((t) => `· ${t}`).join("\n"), sD(CW - 22), sD(128), sD(14), 9), fontFamily: BODY_FONT, color: "#3a4653", align: "left", valign: "top" }));
  });

  // ── 바깥놀이 및 신체활동 ──
  els.push(m.shape(sX(40), sY(913.36), sD(1017), sD(148), { bg: "#f2f9fe", radius: sD(16), stroke: "#cfe6f5", strokeWidth: 2, shadow: SHADOW }));
  els.push(m.text(sX(60), sY(929.36), sD(300), sD(24), "🏖️ 바깥놀이 및 신체활동", { fontSize: sD(19), fontFamily: MS_JUA, color: "#2f6db0", align: "left", valign: "center" }, { textRole: "title" }));
  MS_OUTDOOR_POS.forEach((p, i) => {
    const txt = has(c.outdoor[i]) ? c.outdoor[i] : MS_OUTDOOR_DEF[i];
    els.push(m.shape(sX(p.x), sY(p.y), sD(p.w), sD(37), { bg: "#ffffff", radius: sD(18), stroke: p.bd, strokeWidth: 2 }));
    els.push(m.text(sX(p.x + 16), sY(p.y), sD(p.w - 24), sD(37), txt, { fontSize: fitFontSize(txt, sD(p.w - 24), sD(37), sD(13.5), 9), fontFamily: BODY_FONT, color: "#3a4653", align: "left", valign: "center" }));
  });

  // ── 안전·인성·가정·행사 2×2 ──
  MS_BOT_ROWS.forEach((r, i) => {
    els.push(m.shape(sX(r.x), sY(r.y), sD(508), sD(103.38), { bg: "#ffffff", radius: sD(16), stroke: "#e3eef6", strokeWidth: 2, shadow: SHADOW }));
    els.push(m.shape(sX(r.x + 16), sY(r.y + 14), sD(r.key === "home" ? 116 : r.key === "event" ? 66 : 95), sD(25), { bg: r.badgeBg, radius: sD(12) }));
    els.push(m.text(sX(r.x + 28), sY(r.y + 14), sD(r.key === "home" ? 116 : r.key === "event" ? 66 : 95), sD(25), r.label, { fontSize: sD(14), fontFamily: MS_JUA, color: r.badgeTc, align: "left", valign: "center" }, { textRole: "title" }));
    const val = r.key === "safety" ? (has(c.safety) ? c.safety : r.def)
      : r.key === "char" ? (has(c.char) ? c.char : r.def)
      : r.key === "home" ? (has(c.home) ? c.home : r.def)
      : (has(c.event) ? c.event : r.def);
    els.push(m.text(sX(r.x + 16), sY(r.y + 46), sD(476), sD(48), val, { fontSize: fitFontSize(val, sD(476), sD(48), sD(14.5), 9), fontFamily: BODY_FONT, color: "#3a4653", align: "left", valign: "top" }));
  });

  // ── 하단 모래 배너 + 스티커 + 문구 ──
  els.push(m.shape(0, sY(1525), A4.W, sD(145), { bg: "linear-gradient(180deg,#fbeecb 0%,#f3ddac 100%)", radius: 0 }));
  MS_BANNER_STK.forEach((s, i) => stk(s.src, s.x, s.y, s.w, s.h, `msbn${i}`, s.subj));
  els.push(m.text(sX(430), sY(1560), sD(330), sD(40), "놀이 흥미와 요구, 상황에 따라 변경될 수 있으며, 함께 만들어가는 놀이중심 교육과정으로 운영합니다.", { fontSize: sD(15), fontFamily: MS_JUA, color: "#4a6b86", align: "center", valign: "center" }));

  return doc("놀이중심 월간계획안", MS_BG, els);
}


// ── 스토리형 흐름: 다양한 색 화살표 + 사진 자연 변주 ──
const ARROW_COLORS = ["#F06DA0", "#F4B731", "#5BA7E6", "#A77FCB", "#62B97A", "#F2884B",
  "#E8688A", "#54B6C0", "#F08C5B", "#8AA9DD", "#E1719E", "#7CC4A0"];
// 결정적 변주(위치 dx/dy, 크기 ds, 회전 r) — 정석 그리드를 자연스럽게 흩뜨림
const PHOTO_JITTER = [
  { dx: -10, dy: -6, ds: 10, r: -3 }, { dx: 8, dy: 7, ds: -6, r: 2 }, { dx: -6, dy: 11, ds: 6, r: -2 },
  { dx: 13, dy: -8, ds: -4, r: 3 }, { dx: -13, dy: 6, ds: 16, r: -4 }, { dx: 6, dy: -11, ds: -8, r: 2 },
  { dx: -9, dy: 9, ds: 8, r: -3 }, { dx: 11, dy: -6, ds: -6, r: 3 }, { dx: -11, dy: -9, ds: 13, r: -3 },
  { dx: 9, dy: 11, ds: -4, r: 2 }, { dx: -6, dy: -7, ds: 7, r: -2 }, { dx: 13, dy: 6, ds: -8, r: 3 },
];
const _u = (x, y) => { const l = Math.hypot(x, y) || 1; return { x: x / l, y: y / l }; };
const _r = (n) => Math.round(n * 10) / 10;
// 두 사진 중심 사이의 곡선 점선 화살표(+ 화살촉) 세그먼트
function arrowSeg(A, rA, B, rB, color, sign) {
  const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
  const dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy) || 1;
  const px = -dy / len, py = dx / len;
  const curve = len * 0.24 * sign; // 곡률
  const C = { x: mx + px * curve, y: my + py * curve };
  const ua = _u(C.x - A.x, C.y - A.y), start = { x: A.x + ua.x * (rA + 5), y: A.y + ua.y * (rA + 5) };
  const ub = _u(C.x - B.x, C.y - B.y), end = { x: B.x + ub.x * (rB + 10), y: B.y + ub.y * (rB + 10) };
  const d = `M ${_r(start.x)} ${_r(start.y)} Q ${_r(C.x)} ${_r(C.y)} ${_r(end.x)} ${_r(end.y)}`;
  const t = _u(end.x - C.x, end.y - C.y), a = 9; // 화살촉 크기
  const bp = { x: end.x - t.x * a, y: end.y - t.y * a }, nx = -t.y, ny = t.x;
  const head = `M ${_r(end.x)} ${_r(end.y)} L ${_r(bp.x + nx * a * 0.7)} ${_r(bp.y + ny * a * 0.7)} L ${_r(bp.x - nx * a * 0.7)} ${_r(bp.y - ny * a * 0.7)} Z`;
  return { d, head, color };
}

// ════════════════════════════ 스토리형 (Figma 스크랩북) ════════════════════════════
// 흩뿌린 폴라로이드 사진 13 + 번호 활동 카드 4 + 하단 흐름칩/패널 + 다수 스티커
// (Figma node 2-365 좌표를 보더 13px 제하고 A4 794×1123 로 환산)
const STORY_PHOTO_SLOTS = [
  { x: 468, y: 13, w: 213, h: 171, r: 2 },
  { x: 445, y: 287, w: 145, h: 189, r: -2 },
  { x: 591, y: 292, w: 147, h: 186, r: 2 },
  { x: 55, y: 333, w: 181, h: 138, r: -2 },
  { x: 235, y: 351, w: 175, h: 130, r: 2 },
  { x: 195, y: 490, w: 214, h: 128, r: -2 },
  { x: 426, y: 487, w: 174, h: 128, r: 2 },
  { x: 603, y: 487, w: 174, h: 128, r: -2 },
  { x: 199, y: 636, w: 138, h: 189, r: 2 },
  { x: 298, y: 642, w: 132, h: 186, r: -2 },
  { x: 605, y: 640, w: 174, h: 129, r: 2 },
  { x: 532, y: 753, w: 130, h: 101, r: -3 },
  { x: 419, y: 761, w: 123, h: 91, r: 3 },
];
const STORY_ACT_CARDS = [
  { x: 493, y: 146, w: 181, h: 138 },
  { x: 28, y: 481, w: 196, h: 130 },
  { x: 25, y: 668, w: 194, h: 131 },
  { x: 425, y: 629, w: 171, h: 124 },
];
// 활동명/번호 배지 색 — 레퍼런스 순서: 파랑·초록·연보라·핑크
const STORY_ACT_COLORS = ["#3E72A8", "#5AA46A", "#9B7FC9", "#D173A0"];
const STORY_FLOW_CHIPS = [
  { x: 287, w: 100 }, { x: 396, w: 101 }, { x: 508, w: 97 }, { x: 615, w: 103 },
];
// 스티커 다수 — 큰 마스코트 + 사진 옆 작은 액센트. size = 이모지 fontSize(박스 = 1.5×size).
// placeFixedStickers 가 stickerAsset{themeKey,idx} 태그 → 에디터 resolveSticker 로 테마 PNG 해석(정책 유지).
const STORY_STICKER_SPOTS = [
  { x: 5, y: 920, size: 120 },    // 북극곰(좌하) 큰 마스코트
  { x: 683, y: 1008, size: 74 },  // 다람쥐(우하)
  { x: 643, y: 127, size: 85 },   // 펭귄(우중)
  { x: 295, y: 75, size: 72 },    // 아이·돋보기(제목 옆)
  { x: 668, y: 13, size: 84 },    // 솔방울·열매(우상)
  { x: 226, y: 8, size: 39 },     // 눈(상단)
  { x: 39, y: 114, size: 29 },    // 눈(좌상)
  { x: 681, y: 794, size: 64 },   // 펭귄(우 하단)
  { x: 158, y: 625, size: 39 },   // 펭귄(중)
  { x: 415, y: 268, size: 26 },   // 사진2 모서리
  { x: 690, y: 282, size: 26 },   // 사진3 모서리
  { x: 372, y: 338, size: 26 },   // 사진5 모서리
  { x: 498, y: 480, size: 26 },   // 사진7 모서리
  { x: 360, y: 632, size: 26 },   // 사진10 모서리
];
// 겨울 스토리 기본 디자인 — 레퍼런스('겨울의 즐거움') 구성: 캐릭터·배경(눈송이)·액센트(테이프/장갑)를 균형 배치.
// 캐릭터는 가장자리(북극곰 좌하·펭귄 우상/우중·다람쥐 우), 눈송이는 작게 흩뿌림, 깅엄 테이프·장갑은 액센트.
const STORY_WINTER_STICKERS = [
  // 디자이너 큐레이션(겨울의 즐거움) — 에셋·좌표·크기·회전·반전 그대로 고정 (20개)
  { src: "/assets/deco/stk-winter-14.png", x: 10, y: 891, w: 229, h: 229, rot: 4, flip: false },       // 북극곰 (기본 에셋, 좌하 大)
  { src: "/generated-assets/stk-winter-2.png", x: 636, y: 111, w: 150, h: 150, rot: 8, flip: true },   // 펭귄 (우상)
  { src: "/assets/deco/stk-winter-9.png", x: 674, y: 15, w: 132, h: 132, rot: -7, flip: false },        // 코너 나뭇가지 (우상단)
  { src: "/generated-assets/stk-winter-3.png", x: 645, y: 958, w: 138, h: 138, rot: -8, flip: true },   // 다람쥐 (우측 하단, 북극곰과 균형. 회전 bbox 우측끝≈792<794, 하단≈1105<1123 → 잘림 없음)
  { src: "/generated-assets/stk-winter-1.png", x: 359, y: 188, w: 129, h: 129, rot: -6, flip: false }, // 돋보기 아이 (최종 고정 위치)
  { src: "/generated-assets/stk-winter-4.png", x: 226, y: 4, w: 52, h: 52, rot: 6, flip: false },      // 눈송이
  { src: "/generated-assets/stk-winter-4.png", x: 560, y: 14, w: 46, h: 46, rot: -8, flip: false },
  { src: "/generated-assets/stk-winter-4.png", x: 14, y: 300, w: 44, h: 44, rot: 6, flip: false },
  { src: "/generated-assets/stk-winter-4.png", x: 742, y: 250, w: 42, h: 42, rot: 12, flip: false },
  { src: "/generated-assets/deco-pin-1.png", x: 442, y: 484, w: 65, h: 65, rot: -6, flip: false },     // 핀 (사진 위)
  { src: "/generated-assets/deco-gingham-2.png", x: 217, y: 324, w: 96, h: 96, rot: -10, flip: false },// 깅엄 (사진 위)
  { src: "/generated-assets/deco-gingham-2.png", x: 623, y: 237, w: 96, h: 96, rot: 8, flip: false },  // 깅엄 (사진 위, 우상)
  { src: "/generated-assets/stk-winter-4.png", x: 310, y: 116, w: 96, h: 96, rot: 6, flip: false },    // 눈송이(大, 제목 우측·돋보기 아이 좌상단 — 스크린샷 추정 위치)
  { src: "/assets/deco/stk-winter-10.png", x: -7, y: 817, w: 130, h: 130, rot: 0, flip: false },       // 겨울 나무(눈 가지, 좌하)
  { src: "/generated-assets/deco-pin-1.png", x: 225, y: 603, w: 69, h: 69, rot: 0, flip: false },      // 핀 (사진 위)
  { src: "/generated-assets/deco-tape-2.png", x: 73, y: 270, w: 130, h: 130, rot: 0, flip: false },    // 테이프 (사진 위)
  { src: "/generated-assets/deco-gingham-3.png", x: 516, y: -34, w: 130, h: 130, rot: 0, flip: false },// 깅엄 (상단)
  { src: "/assets/deco/stk-winter-2.png", x: -18, y: -26, w: 130, h: 130, rot: 0, flip: false },       // 고드름 (좌상단 고정)
  { src: "/assets/deco/stk-winter-13.png", x: 658, y: 748, w: 130, h: 130, rot: 0, flip: false },      // 겨울 소품 (우중하)
  { src: "/generated-assets/deco-gingham-1.png", x: 409, y: 729, w: 93, h: 93, rot: 0, flip: false },  // 깅엄 (사진 위)
];

// 스토리형 공통 본문 — curatedStickers(주제 큐레이션 고정 배치, 없으면 자동)만 주제별로 주입.
function buildStoryBase(payload, curatedStickers) {
  const c = read(payload);
  const th = themeFor(`${c.meta.theme} ${c.title}`);
  const m = maker();
  const els = [m.bg({ bg: th.pageBg })];

  // 제목 — 2톤·계단식("겨울" th.title / "놀이" th.accent)
  const words = c.title.split(/\s+/);
  const half = Math.ceil(words.length / 2);
  const line1 = words.slice(0, half).join(" ");
  const line2 = words.length > 1 ? words.slice(half).join(" ") : "";
  // 제목 박스 확대(440×150) + 두 줄 같은 크기로 자동맞춤(최대 101). 줄 간격을 넓혀 두 줄이 서로 겹치지 않게.
  const titleFs = Math.min(fitFontSize(line1, 440, 150, 101), line2 ? fitFontSize(line2, 440, 150, 101) : 101);
  els.push(m.text(51, 38, 440, 150, line1, { fontSize: titleFs, fontFamily: TITLE_FONT, color: th.title, align: "left", valign: "top" }, { textRole: "title" }));
  if (line2) els.push(m.text(75, 140, 440, 150, line2, { fontSize: titleFs, fontFamily: TITLE_FONT, color: th.accent, align: "left", valign: "top" }, { textRole: "title" }));

  // 인트로(좌상단)
  if (has(c.intro)) els.push(m.text(37, 234, 331, 98, c.intro, { fontSize: fitFontSize(c.intro, 331, 98, 16), fontFamily: "'Gaegu', cursive", color: "#5b5246", align: "left", valign: "top" }));

  // 사진 슬롯 13 — 폴라로이드(흰 테두리+그림자), 번호·화살표 없음
  STORY_PHOTO_SLOTS.forEach((p, i) => {
    els.push(m.photo(p.x, p.y, p.w, p.h, c.photos[i] || null, { bg: "#fff", radius: 10, stroke: "#fff", strokeWidth: 8, shadow: "0 6px 16px rgba(40,30,20,0.18)" }, { rotation: p.r }));
  });

  // 번호 활동 카드 4 — c.activities[0..3], 없으면 카드 숨김
  STORY_ACT_CARDS.forEach((cd, i) => {
    const a = c.activities[i];
    if (!a) return;
    els.push(m.shape(cd.x, cd.y, cd.w, cd.h, { bg: "#fffdf7", radius: 14, stroke: "#ece3d0", strokeWidth: 1.5, shadow: "0 6px 16px rgba(40,30,20,0.12)" }));
    const acol = STORY_ACT_COLORS[i % STORY_ACT_COLORS.length];
    els.push(m.shape(cd.x + 11, cd.y + 11, 26, 26, { bg: acol, radius: 13, shadow: "0 2px 5px rgba(0,0,0,0.2)" }));
    els.push(m.text(cd.x + 11, cd.y + 11, 26, 26, String(i + 1), { fontSize: 15, fontFamily: HEAD_FONT, color: "#fff", align: "center", valign: "center" }));
    els.push(m.text(cd.x + 45, cd.y + 12, cd.w - 56, 24, a.title || `놀이 ${i + 1}`, { fontSize: 15, fontFamily: LABEL_FONT, color: acol, align: "left", valign: "center" }, { textRole: "title" }));
    if (has(a.summary)) els.push(m.text(cd.x + 16, cd.y + 44, cd.w - 30, cd.h - 54, a.summary, { fontSize: fitFontSize(a.summary, cd.w - 30, cd.h - 54, 12), fontFamily: BODY_FONT, color: "#5a5046", align: "left", valign: "top" }));
  });

  // 하단 흐름 — 라벨 + 칩 4(활동 제목). 칩 텍스트는 자동맞춤으로 칩 밖으로 안 나감.
  const flowY = 906;
  els.push(m.shape(187, flowY, 90, 26, { bg: "#79b76e", radius: 13 }));
  els.push(m.text(187, flowY, 90, 26, "놀이의 흐름", { fontSize: 13, fontFamily: LABEL_FONT, color: "#fff", align: "center", valign: "center" }, { textRole: "title" }));
  STORY_FLOW_CHIPS.forEach((ch, i) => {
    const a = c.activities[i];
    if (!a) return;
    const txt = `${i + 1}. ${a.title || ""}`;
    els.push(m.shape(ch.x, flowY, ch.w, 26, { bg: "#f0ead9", radius: 13 }));
    els.push(m.text(ch.x + 9, flowY, ch.w - 14, 26, txt, { fontSize: fitFontSize(txt, ch.w - 14, 26, 12), fontFamily: LABEL_FONT, color: "#6f6149", align: "left", valign: "center" }));
  });

  // 하단 패널 — 놀이 비법(learning) + 교사의 지원(support). 둘 다 캔버스 안에(잘림 방지: support 끝 ≤ 1104).
  const panel = (y, h, bg, badge, title, body, bodyH) => {
    els.push(m.shape(181, y, 507, h, { bg, radius: 16, stroke: "#ece3d0", strokeWidth: 1.5 }));
    els.push(m.shape(194, y + 12, 74, 24, { bg: badge, radius: 8 }));
    els.push(m.text(194, y + 12, 74, 24, title, { fontSize: 13, fontFamily: LABEL_FONT, color: "#fff", align: "center", valign: "center" }, { textRole: "title" }));
    if (has(body)) els.push(m.text(282, y + 14, 392, bodyH, body, { fontSize: fitFontSize(body, 392, bodyH, 13), fontFamily: BODY_FONT, color: "#5a5046", align: "left", valign: "top" }));
  };
  panel(940, 78, th.learnBg, "#f9973f", c.learning.title || "놀이 비법", c.learning.text, 58);
  panel(1026, 78, th.supportBg, "#418bc8", c.support.title || "교사의 지원", c.support.text, 58);

  // 스티커: ① 사용자가 "찜"한 배치(localStorage) ② 주제 큐레이션 디폴트(있으면) ③ 그 외 자동 배치
  const fixed = savedStoryStickers(th.key) || curatedStickers;
  if (fixed) {
    fixed.forEach((s, i) => {
      els.push({
        id: `wstk${i}`, type: "image", src: s.src, fit: "contain", sticker: true,
        x: s.x, y: s.y, w: s.w, h: s.h, rotation: s.rot ?? s.rotation ?? 0,
        flipH: (s.flip ?? s.flipH) || undefined, style: { radius: 0 },
      });
    });
  } else {
    els.push(...placeFixedStickers(m, th, c.meta.theme || c.title, STORY_STICKER_SPOTS));
  }
  return doc(c.title, th.pageBg, els);
}

// 기본 스토리(모든 주제 적응) — 자동 스티커 배치
export function buildStoryDoc(payload) {
  return buildStoryBase(payload, null);
}
// 겨울 전용 스토리 — 겨울 큐레이션 스티커 20개
export function buildStoryWinterDoc(payload) {
  return buildStoryBase(payload, STORY_WINTER_STICKERS);
}

// ── 스토리 스티커 "찜" 프리셋 (테마별 localStorage) ──
// 키에 LAYOUT_VERSION 포함 → 디자인 디폴트가 갱신되면 옛 찜은 자동 무효화(스테일 찜이 새 디폴트를 가리지 않음)
const STORY_STK_KEY = (themeKey) => `pr-story-stickers-${themeKey || "default"}-${LAYOUT_VERSION}`;
function savedStoryStickers(themeKey) {
  try {
    const raw = typeof localStorage !== "undefined" && localStorage.getItem(STORY_STK_KEY(themeKey));
    if (raw) { const arr = JSON.parse(raw); if (Array.isArray(arr) && arr.length) return arr; }
  } catch (e) { /* ignore */ }
  return null;
}
// 현재 스티커 배치를 그 주제의 스토리 디폴트로 저장(찜)
export function saveStoryStickers(themeKey, stickers) {
  try { localStorage.setItem(STORY_STK_KEY(themeKey), JSON.stringify(stickers)); return true; } catch (e) { return false; }
}
// ════════════ 반쪽 그림 그리기 활동지 (헤더 + 2×2 카드[이미지+라벨]) ════════════
// Figma "놀이 활동지-반쪽그림" 레퍼런스. 이미지는 payload.photos(기존 주제 정적 에셋 경로)로 사전 채움.
// 헤더 주황·카드 하늘색은 이 활동지 유형의 고정 콘텐츠 룩(Milray 미적용 — 슬라이드/게임과 동일 면제).
// 놀이기록 편집기와 동일한 DesignFrame 렌더러로 열려 교사가 스티커·꾸미기로 편집 가능.
export function buildHalfDrawingDoc(payload) {
  const c = read(payload);
  const m = maker();
  const W = A4.W;
  const theme = (c.meta.theme || "").trim();
  const els = [m.bg({ bg: "#ffffff" })];

  // ── 헤더(주황 밴드) ──
  els.push(m.shape(0, 0, W, 168, { bg: "#f0a93e", radius: 0 }));
  // 상단 태그 = "{주제}-{유형}활동지" (예: 여름 바다-반쪽그림활동지). 텍스트 길이에 맞춰 알약 폭 조정.
  const tag = c.meta.tag || (theme ? `${theme}-반쪽그림활동지` : "반쪽그림활동지");
  const tagW = Math.min(340, 44 + [...tag].length * 15);
  els.push(m.shape(26, 18, tagW, 34, { bg: "#f6f0d9", radius: 999 }));
  els.push(m.text(26, 18, tagW, 34, tag, { fontSize: 14, fontFamily: LABEL_FONT, color: "#8a6a3a", align: "center", valign: "center" }));
  els.push(m.text(28, 62, 480, 46, c.title || "반쪽 그림 그리기", { fontSize: 29, fontFamily: HEAD_FONT, color: "#ffffff", align: "left", valign: "center" }, { textRole: "title" }));
  if (has(c.intro)) els.push(m.text(30, 112, 452, 46, c.intro, { fontSize: 14, fontFamily: BODY_FONT, color: "#fffef2", align: "left", valign: "top" }));
  // 이름칸 — '이 름' 글자는 박스 맨 위에, 그 아래는 아이가 직접 이름을 쓰는 빈 칸(밑줄).
  els.push(m.shape(516, 20, 250, 128, { bg: "#ffffff", radius: 16, stroke: "#c49a5e", strokeWidth: 4, shadow: "0 2px 6px rgba(120,90,40,0.18)" }));
  els.push(m.text(516, 30, 250, 28, "이 름", { fontSize: 20, fontFamily: HEAD_FONT, color: "#3a3a3a", align: "center", valign: "center" }));
  els.push(m.shape(540, 112, 202, 2, { bg: "#ddd0bc", radius: 0 })); // 이름 쓰는 줄

  // ── 2×2 카드 그리드(각 카드: 이미지 왼쪽 편중 + 상단 라벨 알약) ──
  const M = 16, gap = 14, gridTop = 196, rowGap = 22, cardH = 432;
  const cols = 2, cardW = Math.floor((W - 2 * M - gap) / cols);
  const acts = c.activities || [];
  for (let i = 0; i < 4; i++) {
    const col = i % 2, row = Math.floor(i / 2);
    const x = M + col * (cardW + gap);
    const y = gridTop + row * (cardH + rowGap);
    els.push(m.shape(x, y, cardW, cardH, { bg: "#ffffff", radius: 10, stroke: "#7fbcd9", strokeWidth: 3, shadow: "0 4px 12px rgba(60,90,110,0.10)" }));
    // 이미지: 카드 중앙 정렬(중심이 접는선 = 카드 세로 중앙). 투명 PNG → image(fit contain).
    const src = c.photos[i] || null;
    const inX = x + 16, inY = y + 42, inW = cardW - 32, inH = cardH - 70;
    const cx = x + Math.round(cardW / 2);
    if (src) {
      els.push({ id: `hd-img${i}`, type: "image", src, fit: "contain", x: inX, y: inY, w: inW, h: inH, style: { radius: 0 } });
      // ★ '반쪽 그림' — 오른쪽 절반을 흰색으로 가려 생물의 반만 보이게(아이가 나머지 반을 그림).
      //   편집 요소(z:1)가 잠긴 요소(z:0) 위에 그려지므로 마스크는 잠그지 않고 이미지 '뒤 배열'이 아닌
      //   '뒤 순서'로 두어 위에 덮는다. 이미지를 선택하면 z-부스트되어 편집 중엔 전체가 보인다.
      els.push({ id: `hd-mask${i}`, type: "shape", x: cx, y: y + 4, w: x + cardW - 4 - cx, h: cardH - 8, style: { bg: "#ffffff", radius: 0 } });
      // 접는(대칭) 안내선 — 카드 세로 중앙 옅은 선.
      els.push({ id: `hd-fold${i}`, type: "shape", x: cx - 1, y: y + 16, w: 2, h: cardH - 32, style: { bg: "#a9d4e8", radius: 0 } });
    } else {
      els.push(m.photo(inX, inY, inW, inH, null, { bg: "#f4f8fb", radius: 10 }));
    }
    // 라벨 알약(카드 상단 걸침)
    const label = (acts[i] && acts[i].title) || "";
    const lw = 96, lx = x + Math.round((cardW - lw) / 2);
    els.push(m.shape(lx, y - 15, lw, 32, { bg: "#c3e4f2", radius: 999 }));
    els.push(m.text(lx, y - 15, lw, 32, label, { fontSize: 16, fontFamily: LABEL_FONT, color: "#5f92b0", align: "center", valign: "center" }));
  }
  return doc(c.title || "반쪽 그림 그리기", "#ffffff", els);
}

// ════════════ 수 세기 활동지 (난이도 상 4-5세 · 가로형) ════════════
// Figma "놀이 활동지-수세기-여름바다생물". 가로 A4(1123×794). 3행 = [라벨카드 | N마리 카운트박스 | 숫자 선택지].
// payload: { counting:true, header.title, meta.theme, introduction.text, rows:[{label,src,count,options[]}], questions[] }.
export function buildCountingDoc(payload) {
  const d = payload || {};
  const W = A4.W, H = A4.H; // 794 × 1123 (A4 세로) — 4개 활동지 템플릿 방향 통일
  const title = d.header?.title || "수 세기";
  const intro = d.introduction?.text || "";
  const rows = Array.isArray(d.rows) ? d.rows : [];
  const questions = Array.isArray(d.questions) ? d.questions : [];
  const m = maker();
  const els = [{ id: "cnt-bg", type: "shape", x: 0, y: 0, w: W, h: H, locked: true, style: { bg: "#ffffff", radius: 0 } }];

  // ── 헤더(세로: 태그·제목·안내는 좌측 세로 스택, 이름칸은 우상단) ──
  const tag = d.meta?.tag || "수세기활동지";
  const tagW = Math.min(300, 44 + [...tag].length * 15);
  els.push(m.shape(28, 24, tagW, 34, { bg: "#eaf3fb", radius: 999, stroke: "#7fbcd9", strokeWidth: 2 }));
  els.push(m.text(28, 24, tagW, 34, tag, { fontSize: 14, fontFamily: LABEL_FONT, color: "#5f92b0", align: "center", valign: "center" }));
  els.push(m.text(28, 64, 520, 50, title, { fontSize: 34, fontFamily: HEAD_FONT, color: "#3b7bbf", align: "left", valign: "center" }, { textRole: "title" }));
  if (intro) els.push(m.text(30, 120, 560, 26, intro, { fontSize: 15, fontFamily: BODY_FONT, color: "#6a6a6a", align: "left", valign: "center" }));
  els.push(m.text(590, 30, 60, 30, "이름:", { fontSize: 16, fontFamily: LABEL_FONT, color: "#5a5a5a", align: "left", valign: "center" }));
  els.push(m.shape(642, 54, 124, 2, { bg: "#c9c0b4", radius: 0 }));

  // ── 3행(세로: 라벨 카드 · 카운트 박스 · 숫자 선택지). 폭 794에 맞춰 카운트 박스를
  //    좁히고(perRow 5) 박스↔숫자 줄잇기 공간(약 100px)을 확보한다. 세로 여유로 행을 크게. ──
  const PAL = [
    { bd: "#7fbcd9", soft: "#eef6fb", dot: "#5f92b0" },
    { bd: "#e0a0a0", soft: "#fbeeee", dot: "#cf7f7f" },
    { bd: "#93c79f", soft: "#eef7f0", dot: "#5fa06e" },
  ];
  const rowTop = 172, rowH = 224, rowGap = 20, bx = 150, bw = 384;
  const numX = 636; // 숫자 선택지 열(줄잇기 공간 뒤)
  rows.forEach((r, i) => {
    const y = rowTop + i * (rowH + rowGap);
    const pal = PAL[i % 3];
    // 라벨 카드(좌)
    els.push(m.shape(28, y, 108, rowH, { bg: pal.soft, radius: 14, stroke: pal.bd, strokeWidth: 3 }));
    els.push(m.shape(38, y + 12, 88, 30, { bg: "#ffffff", radius: 999 }));
    els.push(m.text(38, y + 12, 88, 30, r.label || "", { fontSize: 16, fontFamily: LABEL_FONT, color: pal.dot, align: "center", valign: "center" }));
    if (r.src) els.push({ id: `cnt-lbl${i}`, type: "image", src: r.src, fit: "contain", x: 34, y: y + 50, w: 96, h: rowH - 66, style: { radius: 0 } });
    // 카운트 박스 + N개(세로 가운데 정렬 그리드)
    els.push(m.shape(bx, y, bw, rowH, { bg: "#ffffff", radius: 16, stroke: pal.bd, strokeWidth: 3 }));
    const n = Math.max(0, r.count || 0), perRow = 5, cell = 58, cgap = 8;
    const gridRows = Math.max(1, Math.ceil(n / perRow));
    const startY = y + Math.round((rowH - (gridRows * cell + (gridRows - 1) * cgap)) / 2);
    const stepX = (bw - 36 - cell) / (perRow - 1);
    for (let k = 0; k < n; k++) {
      const cc = k % perRow, cr = Math.floor(k / perRow);
      const ix = bx + 18 + cc * stepX, iy = startY + cr * (cell + cgap);
      if (r.src) els.push({ id: `cnt${i}_${k}`, type: "image", src: r.src, fit: "contain", x: Math.round(ix), y: Math.round(iy), w: cell, h: cell, style: { radius: 0 } });
    }
    // 연결점(카운트 박스 오른쪽 중앙) — 여기서 숫자로 선을 잇는다.
    els.push(m.shape(bx + bw - 7, y + Math.round(rowH / 2) - 7, 14, 14, { bg: pal.dot, radius: 999 }));
    // 숫자 선택지(줄잇기 공간 오른쪽 3개 + 점, 행 중앙 정렬)
    const opts = Array.isArray(r.options) ? r.options : [];
    const oStart = y + Math.round((rowH - (opts.length - 1) * 58) / 2) - 14;
    opts.forEach((val, j) => {
      const oy = oStart + j * 58;
      els.push(m.shape(numX, oy + 2, 16, 16, { bg: pal.dot, radius: 999 }));
      els.push(m.text(numX + 26, oy - 6, 90, 32, String(val), { fontSize: 26, fontFamily: HEAD_FONT, color: "#4a4a4a", align: "left", valign: "center" }));
    });
  });

  // ── 하단 '생각해봐요'(세로: 질문 1열로 쌓음) ──
  const by = rowTop + 3 * (rowH + rowGap) + 6;
  if (by + 60 < H) {
    els.push(m.shape(28, by, W - 56, H - by - 24, { bg: "#eef4f8", radius: 14, stroke: "#bcd6e6", strokeWidth: 2 }));
    els.push(m.text(44, by + 12, 200, 26, "🔍 생각해봐요!", { fontSize: 15, fontFamily: LABEL_FONT, color: "#e08a3a", align: "left", valign: "center" }));
    questions.slice(0, 3).forEach((q, j) => {
      const qy = by + 44 + j * 26;
      els.push(m.text(44, qy, W - 88, 22, `★ ${q}`, { fontSize: 13, fontFamily: BODY_FONT, color: "#5a5a5a", align: "left", valign: "center" }));
    });
  }
  return { output_type: "DesignDoc", title, frame: { w: W, h: H, bg: "#ffffff" }, elements: els };
}

// ════════════ 그림자 짝짓기 활동지 (왼쪽 컬러 그림 ↔ 오른쪽 검은 그림자, 잇기) ════════════
// 레퍼런스 "그림자 찾기 활동지"(초록 헤더·크림 배경). 오른쪽은 같은 이미지를 silhouette:true 로
// 검은 실루엣 렌더 + 순서 셔플. 이미지는 payload.items(기존 주제 정적 에셋).
export function buildShadowMatchDoc(payload) {
  const d = payload || {};
  const W = A4.W, H = A4.H;
  const title = d.header?.title || "그림자를 찾아요";
  const intro = d.introduction?.text || "";
  const tag = d.meta?.tag || "그림자짝짓기 활동지";
  const items = (Array.isArray(d.items) ? d.items : []).filter(Boolean);
  const m = maker();
  const els = [m.bg({ bg: "#fbf7e8" })];

  // 헤더(초록 밴드)
  els.push(m.shape(0, 0, W, 150, { bg: "#5a9e3d", radius: 0 }));
  const tagW = Math.min(340, 44 + [...tag].length * 15);
  els.push(m.shape(26, 18, tagW, 34, { bg: "#eef6e6", radius: 999 }));
  els.push(m.text(26, 18, tagW, 34, tag, { fontSize: 14, fontFamily: LABEL_FONT, color: "#3f7a2b", align: "center", valign: "center" }));
  els.push(m.text(28, 58, 480, 44, title, { fontSize: 30, fontFamily: HEAD_FONT, color: "#ffffff", align: "left", valign: "center" }, { textRole: "title" }));
  if (intro) els.push(m.text(30, 104, 500, 30, intro, { fontSize: 14, fontFamily: BODY_FONT, color: "#eaf5e0", align: "left", valign: "center" }));
  // 이름칸
  els.push(m.shape(560, 20, 210, 110, { bg: "#ffffff", radius: 14, stroke: "#3f7a2b", strokeWidth: 3 }));
  els.push(m.text(560, 30, 210, 26, "이 름", { fontSize: 18, fontFamily: HEAD_FONT, color: "#3a3a3a", align: "center", valign: "center" }));
  els.push(m.shape(584, 104, 162, 2, { bg: "#cfe0c2", radius: 0 }));

  // 항목: 왼쪽 컬러 그림 ↔ 오른쪽 그림자(셔플)
  const n = Math.min(items.length, 5);
  const top = 176, areaH = H - top - 24, rowH = Math.floor(areaH / Math.max(1, n));
  const imgSz = Math.min(150, rowH - 24);
  const leftX = 70, rightX = W - 70 - imgSz;
  const leftDotX = leftX + imgSz + 18, rightDotX = rightX - 34;
  const PERMS = { 1: [0], 2: [1, 0], 3: [2, 0, 1], 4: [2, 0, 3, 1], 5: [2, 4, 0, 3, 1] };
  const perm = PERMS[n] || items.map((_, i) => i);
  for (let i = 0; i < n; i++) {
    const y = top + i * rowH, cy = y + Math.round((rowH - imgSz) / 2), dotY = y + Math.round(rowH / 2) - 8;
    const L = items[i], R = items[perm[i]];
    if (L?.src) els.push({ id: `sm-l${i}`, type: "image", src: L.src, fit: "contain", x: leftX, y: cy, w: imgSz, h: imgSz, style: { radius: 0 } });
    els.push(m.shape(leftDotX, dotY, 16, 16, { bg: "#5a9e3d", radius: 999 }));
    if (R?.src) els.push({ id: `sm-r${i}`, type: "image", src: R.src, fit: "contain", silhouette: true, x: rightX, y: cy, w: imgSz, h: imgSz, style: { radius: 0 } });
    els.push(m.shape(rightDotX, dotY, 16, 16, { bg: "#5a9e3d", radius: 999 }));
  }
  return doc(title, "#fbf7e8", els);
}

// ════════════ 한글 쓰기 활동지 (그림 + 낱말 원고지 칸 따라쓰기) ════════════
// 레퍼런스 "여름 낱말을 알아요"(초록 헤더·크림). 각 행: 그림 + 그 낱말을 음절별 네모 칸에 연한 회색
// 안내글자로 두어 따라 쓴다. 낱말·그림은 payload.items(기존 주제 에셋 라벨/이미지).
export function buildHangulWritingDoc(payload) {
  const d = payload || {};
  const W = A4.W, H = A4.H;
  const title = d.header?.title || "낱말을 알아요";
  const intro = d.introduction?.text || "";
  const tag = d.meta?.tag || "한글쓰기 활동지";
  const items = (Array.isArray(d.items) ? d.items : []).filter(Boolean).slice(0, 2); // 2낱말/장(크게)
  const m = maker();
  const els = [m.bg({ bg: "#fbf7e8" })];
  // 초록 라운드 테두리 프레임(레퍼런스: 밴드 없이 크림 배경 + 초록 테두리)
  els.push(m.shape(14, 14, W - 28, H - 28, { stroke: "#8fc36a", strokeWidth: 5, radius: 26 }));

  // 태그(초록 외곽선 알약)
  const tagW = Math.min(360, 40 + [...tag].length * 15);
  els.push(m.shape(40, 32, tagW, 34, { bg: "#ffffff", radius: 999, stroke: "#8fc36a", strokeWidth: 2 }));
  els.push(m.text(40, 32, tagW, 34, tag, { fontSize: 14, fontFamily: LABEL_FONT, color: "#4a8a34", align: "center", valign: "center" }));
  // 제목(초록) + 해·수박 데코
  els.push(m.emoji(52, 74, 46, "🌞", -6));
  els.push(m.text(110, 74, 574, 56, title, { fontSize: 40, fontFamily: HEAD_FONT, color: "#4a8a34", align: "center", valign: "center" }, { textRole: "title" }));
  els.push(m.emoji(690, 72, 44, "🍉", 8));
  // 이름 · 날짜 한 줄
  els.push(m.text(120, 150, 60, 28, "이름:", { fontSize: 17, fontFamily: LABEL_FONT, color: "#3a3a3a", align: "left", valign: "center" }));
  els.push(m.shape(180, 176, 200, 2, { bg: "#3a3a3a", radius: 0 }));
  els.push(m.text(430, 150, 60, 28, "날짜:", { fontSize: 17, fontFamily: LABEL_FONT, color: "#3a3a3a", align: "left", valign: "center" }));
  els.push(m.shape(490, 176, 190, 2, { bg: "#3a3a3a", radius: 0 }));

  // 낱말 2개 — 번호+문장 · 큰 그림(가운데 왼쪽) · 큰 초록 낱말(오른쪽) · 원고지 풀폭 5칸(앞 음절만 안내글자)
  const n = items.length;
  const top = 200, rowH = Math.floor((H - top - 34) / Math.max(1, n));
  const BOXN = 5, bx0 = 60, box = Math.floor((W - 2 * bx0) / BOXN);
  for (let i = 0; i < n; i++) {
    const y = top + i * rowH, it = items[i];
    const word = it?.label || "";
    const chars = [...word];
    const wfs = chars.length <= 2 ? 76 : chars.length === 3 ? 62 : 50; // 낱말 길이별 크기
    els.push(m.text(56, y + 4, 640, 32, `${i + 1}. ${word}`, { fontSize: 23, fontFamily: LABEL_FONT, color: "#3a3a3a", align: "left", valign: "center" }));
    if (it?.src) els.push({ id: `hw-img${i}`, type: "image", src: it.src, fit: "contain", x: 150, y: y + 44, w: 200, h: 200, style: { radius: 0 } });
    els.push(m.text(400, y + 92, 360, 120, `'${word}'`, { fontSize: wfs, fontFamily: HEAD_FONT, color: "#2e6b2e", align: "center", valign: "center" }));
    // 원고지 풀폭 5칸 + 십자 안내선(연한), 앞 음절만 연한 안내글자
    const boxY = y + 262;
    els.push(m.shape(bx0 - 3, boxY - 3, BOXN * box + 6, box + 6, { bg: "#ffffff", radius: 12, stroke: "#8fc36a", strokeWidth: 4 }));
    for (let k = 0; k < BOXN; k++) {
      const bx = bx0 + k * box;
      if (k > 0) els.push(m.shape(bx, boxY + 6, 2, box - 12, { bg: "#cfe3bb", radius: 0 })); // 칸 구분선
      els.push(m.shape(bx + Math.round(box / 2) - 1, boxY + 8, 2, box - 16, { bg: "#e3e6c8", radius: 0 })); // 세로 십자
      els.push(m.shape(bx + 10, boxY + Math.round(box / 2) - 1, box - 20, 2, { bg: "#e3e6c8", radius: 0 })); // 가로 십자
      if (chars[k]) els.push(m.text(bx, boxY, box, box, chars[k], { fontSize: 78, fontFamily: HEAD_FONT, color: "#cdcdcd", align: "center", valign: "center" }));
    }
  }
  return doc(title, "#fbf7e8", els);
}

// ════════════ 역할놀이 머리띠 도안 (신체활동/역할놀이) ════════════
// Figma "여름바다 머리띠 도안". 3캐릭터 × [캐릭터 그림 · 컬러 앞띠(라벨) · 오리는 옆띠 2개(끝 탭)].
// 이미지는 payload.items(기존 주제 에셋). 오려서 머리에 두르는 머리띠를 만든다.
export function buildHeadbandDoc(payload) {
  const d = payload || {};
  const W = A4.W, H = A4.H;
  const tag = d.meta?.tag || "역할놀이 도안";
  const intro = d.introduction?.text || "";
  const items = (Array.isArray(d.items) ? d.items : []).filter(Boolean).slice(0, 3);
  const m = maker();
  const els = [m.bg({ bg: "#efe9dc" })];
  els.push(m.shape(16, 16, W - 32, H - 32, { bg: "#f7f3e9", radius: 24 })); // 크림 패널

  // 태그(외곽선 알약) + 우상단 점
  const tagW = Math.min(380, 40 + [...tag].length * 15);
  els.push(m.shape(40, 32, tagW, 40, { bg: "#ffffff", radius: 999, stroke: "#7a6a55", strokeWidth: 2 }));
  els.push(m.text(40, 32, tagW, 40, tag, { fontSize: 15, fontFamily: LABEL_FONT, color: "#5a4a38", align: "center", valign: "center" }));
  ["#f0785a", "#5cb3d6", "#e6c169"].forEach((c, i) => els.push(m.shape(W - 98 + i * 24, 46, 14, 14, { bg: c, radius: 999 })));
  if (intro) els.push(m.text(40, 80, W - 80, 22, intro, { fontSize: 13, fontFamily: BODY_FONT, color: "#8a7a63", align: "left", valign: "center" }));

  const PAL = [
    { band: "#f0785a", label: "#c74f31" },
    { band: "#5cb3d6", label: "#2e7a94" },
    { band: "#e6c169", label: "#a67c2e" },
  ];
  const n = items.length;
  const top = 116, rowH = Math.floor((H - top - 22) / Math.max(1, n));
  const bandX = 40, bandW = W - 80;
  for (let i = 0; i < n; i++) {
    const y = top + i * rowH, it = items[i], pal = PAL[i % 3];
    // 캐릭터(앞띠 위에 얹힘)
    if (it?.src) els.push({ id: `hb-img${i}`, type: "image", src: it.src, fit: "contain", x: Math.round(W / 2 - 85), y: y + 6, w: 170, h: 150, style: { radius: 0 } });
    // 앞띠(캐릭터 얼굴 띠) + 라벨 + 점
    const by = y + 150;
    els.push(m.shape(bandX, by, bandW, 74, { bg: pal.band, radius: 40, shadow: "0 8px 10px rgba(122,50,26,0.14)" }));
    els.push(m.shape(bandX + 9, by + 9, bandW - 18, 56, { stroke: "rgba(255,255,255,0.6)", strokeWidth: 2, radius: 30 }));
    els.push(m.shape(bandX + 16, by + 15, 110, 44, { bg: "rgba(255,255,255,0.92)", radius: 999 }));
    els.push(m.text(bandX + 16, by + 15, 110, 44, it?.label || "", { fontSize: 22, fontFamily: LABEL_FONT, color: pal.label, align: "center", valign: "center" }));
    [[-30, 26, 10], [-66, 44, 7], [-104, 30, 7]].forEach(([dx, dy, sz]) => els.push(m.shape(bandX + bandW + dx, by + dy, sz, sz, { bg: "rgba(255,255,255,0.55)", radius: 999 })));
    // 오리는 옆띠 2개(끝에 풀칠 탭 + 자르는 선)
    const sy = by + 88, sw = Math.floor((bandW - 20) / 2), sh = 56, cap = 34;
    const strap = (sx, capSide) => {
      els.push(m.shape(sx, sy, sw, sh, { bg: pal.band, radius: 12, shadow: "0 6px 9px rgba(122,50,26,0.10)" }));
      els.push(m.shape(sx + 8, sy + 8, sw - 16, sh - 16, { stroke: "rgba(255,255,255,0.7)", strokeWidth: 2, radius: 8 }));
      const capX = capSide === "left" ? sx : sx + sw - cap;
      els.push(m.shape(capX, sy, cap, sh, { bg: "rgba(255,255,255,0.5)", radius: 12 }));
      const cutX = capSide === "left" ? sx + cap : sx + sw - cap;
      els.push(m.shape(cutX - 1, sy + 5, 2, sh - 10, { bg: "rgba(255,255,255,0.9)", radius: 0 }));
    };
    strap(bandX, "left");
    strap(bandX + sw + 20, "right");
  }
  return doc("역할놀이 머리띠", "#efe9dc", els);
}

// payload → 주제 키 (찜 저장/조회용)
export function themeKeyOf(payload) {
  const text = `${payload?.meta?.theme || ""} ${payload?.header?.title || ""}`;
  return (themeFor(text) || {}).key || "default";
}

// 사진 자리(빈 photo 요소) 1개 — 추가 시마다 조금씩 어긋나게 배치
let _slotN = 0;
export function makePhotoSlot() {
  const i = _slotN++;
  const off = (i % 6) * 22;
  return {
    id: `slot${Date.now()}_${i}`, type: "photo", x: 286 + off, y: 430 + off,
    w: 240, h: 180, src: null, fit: "cover",
    style: { bg: "#eee7df", radius: 14, shadow: "0 6px 16px rgba(0,0,0,0.14)" },
  };
}

// 빈 A4 페이지 (페이지 추가용)
export function blankPage(payload) {
  const th = themeFor(`${payload?.meta?.theme || ""} ${payload?.header?.title || ""}`);
  const m = maker();
  return doc("새 페이지", th.pageBg, [m.bg({ bg: th.pageBg })]);
}

// 템플릿 선택 2축 — 가족(카드/스토리) × 주제(겨울/여름/기본). 조합 id = `${theme}-${family}`.
// 모든 조합을 UI에서 고를 수 있고, 새 기록은 주제에 맞는 조합이 기본 선택된다.
export const TEMPLATE_FAMILIES = [
  { key: "card", label: "카드형" },
  { key: "story", label: "스토리형" },
];
export const TEMPLATE_THEMES = [
  { key: "winter", label: "겨울" },
  { key: "summer", label: "여름" },
  { key: "autumn", label: "가을" },
  { key: "traffic", label: "교통" },
  { key: "default", label: "기본" },
];

// 주제(theme) × 가족(family) → { build, photos(1페이지 사진 수) }.
// winter·summer 는 전용 빌더, default 는 주제색 자동 적응(봄·가을 등 미등록 주제 포함).
const TEMPLATE_REGISTRY = {
  winter: {
    card: { build: buildCardWinterDoc, photos: 9 },
    story: { build: buildStoryWinterDoc, photos: STORY_PHOTO_SLOTS.length },
  },
  summer: {
    card: { build: buildCardSummerDoc, photos: 15 },
    story: { build: buildCanvasSummerDoc, photos: SUMMER_GRID.cols.length * SUMMER_GRID.rows.length },
  },
  autumn: {
    card: { build: buildCardAutumnDoc, photos: 18 },
    // story 없음 → 기본(적응형) 스토리로 폴백
  },
  traffic: {
    card: { build: buildCardTrafficDoc, photos: 9 },
    // story 없음 → 기본(적응형) 스토리로 폴백
  },
  default: {
    card: { build: buildCardDoc, photos: 9 },
    story: { build: buildStoryDoc, photos: STORY_PHOTO_SLOTS.length },
  },
};

// 조합 id 문자열 → { build, photos } (없는 조합은 default 로 폴백).
// 놀이주제망(topicweb)은 테마×가족 조합이 아닌 단일 템플릿 → 특수 처리.
function templateEntry(id) {
  if (id === "topicweb") return { build: buildTopicWebDoc, photos: 0 };
  if (id === "weeklyplan") return { build: buildWeeklyPlanDoc, photos: 0 };
  if (id === "monthlyplan" || id === "monthlyplan-summer") return { build: buildMonthlyPlanSummerDoc, photos: 0 };
  if (id === "half-drawing") return { build: buildHalfDrawingDoc, photos: 4 };
  if (id === "counting") return { build: buildCountingDoc, photos: 0 };
  if (id === "shadow-match") return { build: buildShadowMatchDoc, photos: 0 };
  if (id === "hangul-writing") return { build: buildHangulWritingDoc, photos: 0 };
  if (id === "headband") return { build: buildHeadbandDoc, photos: 0 };
  const [theme, family] = String(id).split("-");
  const set = TEMPLATE_REGISTRY[theme] || TEMPLATE_REGISTRY.default;
  return set[family] || TEMPLATE_REGISTRY.default[family] || TEMPLATE_REGISTRY.default.card;
}
// 유효한 조합 id 인지
export function isTemplateId(id) {
  if (id === "topicweb" || id === "weeklyplan" || id === "monthlyplan" || id === "monthlyplan-summer" || id === "half-drawing" || id === "counting" || id === "shadow-match" || id === "hangul-writing" || id === "headband") return true;
  const [theme, family] = String(id).split("-");
  return !!(TEMPLATE_REGISTRY[theme] && TEMPLATE_REGISTRY[theme][family]);
}
// 주제에 맞는 기본 조합 id (그 주제에 해당 가족 템플릿이 있으면 그 주제, 없으면 default).
export function defaultTemplateId(payload, family = "card") {
  const themeKey = themeKeyOf(payload);
  const hit = TEMPLATE_REGISTRY[themeKey] && TEMPLATE_REGISTRY[themeKey][family];
  return (hit ? themeKey : "default") + "-" + family;
}

export function buildVariant(id, payload) {
  return templateEntry(id).build(payload);
}

// 조합 id → 사람이 읽는 라벨 ("겨울 카드형")
export function templateLabel(id) {
  if (id === "topicweb") return "놀이주제망";
  if (id === "weeklyplan") return "주안 여름";
  if (id === "monthlyplan" || id === "monthlyplan-summer") return "월간 여름바다";
  if (id === "half-drawing") return "반쪽 그림 그리기";
  if (id === "counting") return "바다 친구들 수세기";
  if (id === "shadow-match") return "그림자를 찾아요";
  if (id === "hangul-writing") return "낱말을 알아요";
  if (id === "headband") return "역할놀이 머리띠";
  const [theme, family] = String(id).split("-");
  const t = TEMPLATE_THEMES.find((x) => x.key === theme);
  const f = TEMPLATE_FAMILIES.find((x) => x.key === family);
  return `${t ? t.label : theme} ${f ? f.label : family}`;
}

// 썸네일 갤러리에 노출할 템플릿 목록.
// 등록된 주제(default 제외)의 "실제 존재하는" 가족 템플릿만 노출한다(교통은 카드만).
// 계절 템플릿이 없는 기록(봄 등)은 기본(default)도 함께 제공한다.
export function pickerTemplates(payload) {
  // 놀이주제망·주간계획안 기록 → 각 단일 템플릿만 노출(놀이기록 카드/스토리 템플릿과 섞이지 않게).
  if (payload?.topic_web) return [{ id: "topicweb", theme: "topicweb", family: "web", label: "놀이주제망" }];
  if (payload?.daily_flow) return [{ id: "weeklyplan", theme: "weeklyplan", family: "week", label: "주안 여름" }];
  if (payload?.weekly_flow) return [{ id: "monthlyplan-summer", theme: "monthlyplan", family: "month", label: "월간 여름바다" }];
  if (payload?.half_drawing) return [{ id: "half-drawing", theme: "half-drawing", family: "worksheet", label: "반쪽 그림 그리기" }];
  if (payload?.counting) return [{ id: "counting", theme: "counting", family: "worksheet", label: "바다 친구들 수세기" }];
  if (payload?.shadow_match) return [{ id: "shadow-match", theme: "shadow-match", family: "worksheet", label: "그림자를 찾아요" }];
  if (payload?.hangul_writing) return [{ id: "hangul-writing", theme: "hangul-writing", family: "worksheet", label: "낱말을 알아요" }];
  if (payload?.headband) return [{ id: "headband", theme: "headband", family: "worksheet", label: "역할놀이 머리띠" }];
  const out = [];
  for (const theme of Object.keys(TEMPLATE_REGISTRY)) {
    if (theme === "default") continue;
    for (const f of TEMPLATE_FAMILIES) {
      if (TEMPLATE_REGISTRY[theme][f.key]) {
        out.push({ id: `${theme}-${f.key}`, theme, family: f.key, label: templateLabel(`${theme}-${f.key}`) });
      }
    }
  }
  const themeKey = themeKeyOf(payload);
  if (!TEMPLATE_REGISTRY[themeKey] || themeKey === "default") {
    for (const f of TEMPLATE_FAMILIES) {
      out.push({ id: `default-${f.key}`, theme: "default", family: f.key, label: templateLabel(`default-${f.key}`) });
    }
  }
  return out;
}

// 추가 사진 페이지(둥근 사각형 3열 그리드) — 첫 페이지에 못 담은 사진을 9장씩 채운다.
function buildPhotoGridPage(payload, photos, pageNo) {
  const c = read(payload);
  const th = themeFor(`${c.meta.theme} ${c.title}`);
  const m = maker();
  const els = [m.bg({ bg: th.pageBg })];
  const M = 46, W = A4.W, cols = 3, gap = 16;
  els.push(m.text(M, 40, W - 2 * M, 50, `${c.title}`, { fontSize: 34, fontFamily: TITLE_FONT, color: th.title, align: "center", valign: "center" }, { textRole: "title" }));
  els.push(m.text(M, 92, W - 2 * M, 26, `놀이 사진 ${pageNo}`, { fontSize: 15, fontFamily: LABEL_FONT, color: th.badgeBg, align: "center", valign: "center" }));
  const cw = Math.floor((W - 2 * M - (cols - 1) * gap) / cols);
  const chh = Math.round(cw * 0.84);
  const top = 134;
  photos.forEach((src, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const x = M + col * (cw + gap), y = top + row * (chh + gap);
    els.push(m.photo(x, y, cw, chh, src || null, { radius: 12, stroke: "#fff", strokeWidth: 13, shadow: "0 8px 18px rgba(40,30,20,0.16)" }));
  });
  els.push(...scatterStickers(m, th, 5, c.meta.theme || c.title, occupiedRects(els)));
  return doc(`놀이 사진 ${pageNo}`, th.pageBg, els);
}

// 변형 + 입력 사진 수에 맞춘 페이지 배열(첫 페이지에 못 담은 사진은 추가 페이지로).
export function buildVariantPages(id, payload) {
  const c = read(payload);
  const pages = [buildVariant(id, payload)];
  const used = templateEntry(id).photos || 0;
  const PER = 9;
  let i = used, pageNo = 1;
  while (i < c.photos.length) {
    pages.push(buildPhotoGridPage(payload, c.photos.slice(i, i + PER), pageNo++));
    i += PER;
  }
  return pages;
}
