# SKILL.md — 슬라이드 기능 구현 플레이북

PRD가 "무엇/왜"라면 이 문서는 "어떻게"다. 인터페이스 우선으로 설계하고 구현체를 교체 가능하게 한다.

## 1. 모듈 구조 (제안)

```
src/features/slides/
  schema/            # deckspec.schema.json + 생성된 TS 타입
  agent/             # 라우터 분류 + 장표 에이전트 호출(Claude API)
  engine/
    layouts/         # 레이아웃별 React 컴포넌트 (title, hero-image, ...)
    SlideRenderer.tsx
    theme/           # Milray Park 토큰(light/warm)
  image/
    ImageProvider.ts # 인터페이스
    providers/       # 구현체(M2에서 후보들)
    styleLock.ts     # 스타일 접미 빌더
    assetCache.ts    # Supabase 캐시/라이브러리
  export/
    pdf.ts           # Puppeteer/Playwright (M1)
    pptx.ts          # pptxgenjs (M2)
    png.ts
  canvas/            # My Board(React Flow) 노드 연동
  store/             # Zustand + zundo
```

## 2. 핵심 타입 (DeckSpec)

`deckspec.schema.json`에서 타입을 생성하거나 1:1 일치시킨다. 요약:

```ts
type Category = "lesson" | "parent" | "admin";
type Theme = "milray.light" | "milray.warm";
type Ratio = "16:9" | "4:3";
type Layout =
  | "title" | "hero-image" | "big-text" | "two-column"
  | "bullets" | "photo-grid" | "quote" | "chart";

interface DeckSpec {
  category: Category;
  theme: Theme;
  ratio: Ratio;
  ageBand: "3세" | "4세" | "5세" | "혼합";
  title: string;
  language?: "ko" | "ja" | "en";
  slides: Slide[];
}

interface Slide { layout: Layout; blocks: Block[]; speakerNote?: string; }

type Block = TextBlock | ImageBlock | BulletsBlock | ChartBlock;
interface TextBlock { type: "title" | "subtitle" | "body" | "caption"; text: string; }
interface BulletsBlock { type: "bullets"; items: string[]; }
interface ImageBlock {
  type: "image";
  role: "hero" | "inline" | "background" | "icon";
  prompt: string;            // 삽화 내용만. 스타일 접미는 styleLock이 덧붙임.
  characterRef?: string;
  assetId?: string | null;
}
interface ChartBlock {
  type: "chart";
  chartType: "bar" | "line" | "pie" | "radar";
  data: Record<string, unknown>[];
  caption?: string;
}
```

생성 직후 **DeckSpec를 스키마로 검증**한 뒤 렌더에 넘긴다(ajv 등).

## 3. 슬라이드 엔진

- 고정 캔버스: 16:9 기준 1280×720 논리 좌표(또는 1920×1080). CSS `transform: scale()`로 컨테이너에 맞춤.
- 레이아웃별 컴포넌트가 블록을 받아 배치. 슬라이드 컴포넌트엔 **토큰만** 사용, 색/픽셀 하드코딩 금지.
- 테마는 CSS 변수로 주입(`--accent: #F2733E` 등), light/warm 토글.

```tsx
function SlideRenderer({ slide, theme }: { slide: Slide; theme: Theme }) {
  const Layout = LAYOUTS[slide.layout];        // enum → 컴포넌트 매핑
  return <ThemeProvider theme={theme}><Layout slide={slide} /></ThemeProvider>;
}
```

- 폰트: 영문 Playfair Display/Hanken Grotesk, 국문 Noto Serif KR/Pretendard. **export 경로에서 폰트가 임베드되도록** 주의(아래 함정 참조).

## 4. 차트 (Recharts)

- `chart` 레이아웃/블록은 Recharts로 렌더. radar는 누리과정 평가용으로 기존 컴포넌트 재사용.
- 차트 색은 Milray 토큰 팔레트에서만.

## 5. Export

### PDF / PNG (M1)
- Puppeteer 또는 Playwright로 렌더 페이지를 띄워 슬라이드별 캡처 → PDF 합본.
- 서버사이드 렌더 시 **웹폰트 로딩 완료를 기다린 뒤** 캡처(`document.fonts.ready`).
- WYSIWYG 보장: 화면 렌더와 동일 컴포넌트·토큰 사용.

### PPTX (M2)
- pptxgenjs로 DeckSpec → 슬라이드 매핑. 각 layout을 PPTX 도형/텍스트박스/이미지로 변환.
- 이미지 블록은 Supabase 에셋을 다운로드해 삽입. 텍스트는 PPTX 텍스트박스(이미지에 굽지 않음).
- 폰트는 PPTX에 폰트명만 지정되므로, 산출물 안내에 "정확히 보려면 해당 폰트 설치 필요" 명시.

## 6. 이미지 파이프라인 (M2)

```ts
interface ImageProvider {
  generate(opts: {
    prompt: string;            // styleLock 접미가 이미 붙은 최종 프롬프트
    refs?: string[];           // 캐릭터/스타일 레퍼런스 URL
    aspect: "16:9" | "1:1" | "4:3";
  }): Promise<{ url: string }>;
}
```

- **styleLock:** theme·category에 따라 고정 접미를 만들어 모든 prompt에 붙인다. (PROMPTS.md의 style-lock 섹션 참조.)
- **assetCache:** prompt+style+refs 해시를 키로 Supabase에서 조회. 적중 시 생성 스킵. 미적중 시 생성 후 태그와 함께 저장하고 `assetId` 채움.
- **마스코트:** 레퍼런스 3컷을 고정 저장, `characterRef` 있으면 refs에 첨부.
- 모델 후보(M2 A/B): 캐릭터 레퍼런스 강한 것, 일관 세트 한 번에 뽑는 것, 단가 최저인 것 중 삽화 품질·일관성·단가로 1개 선택. 인터페이스 뒤라 교체는 한 줄.

## 7. 에이전트 연동

- 라우터: 요청을 분류해 `{ category, ageBand, lengthHint }` 추출(PROMPTS.md).
- 장표 에이전트: category에 맞는 시스템 프롬프트 + 콘텐츠 가이드로 **DeckSpec JSON만** 출력(JSON 외 텍스트 금지).
- 모델 분기: lesson/parent=Sonnet, admin=Haiku.
- 출력 검증 → 워크플로우 레인 노드 생성 → (lesson/parent) 이미지 워커 트리거.

## 8. 상태 관리

- Zustand 스토어에 DeckSpec + 노드 상태. zundo로 undo/redo.
- 편집 액션(텍스트 수정/이미지 교체/순서 변경)은 모두 스토어 경유 → 히스토리 자동.

## 9. 알려진 함정

- **경로 공백:** `D:\claud project\kinderverse concept` — 모든 명령 따옴표(CLAUDE.md).
- **폰트 임베드:** PDF/PPTX export에서 한글 폰트 누락 흔함. export 전 폰트 로딩 보장, PPTX는 설치 안내.
- **이미지 화풍 불일치:** style-lock 미적용 시 슬라이드마다 화풍 제각각 → 반드시 접미 강제.
- **JSON 깨짐:** Claude가 마크다운 펜스/서문 붙일 수 있음 → 파싱 전 펜스 제거 + 스키마 검증, 실패 시 1회 재요청.
- **레이아웃 이탈:** Claude가 enum 밖 layout 내면 거부하고 재요청.
