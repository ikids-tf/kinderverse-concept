# KICKOFF_M1 — 지금 시작할 작업

## M1 범위

**In:** 자체 슬라이드 엔진 + DeckSpec 파이프라인 + parent/admin 템플릿 + Recharts 차트 + PDF export. 한 줄 요청 → 완성 덱 → PDF까지 전체 루프.

**Out (M2 이후):** 수업용 style-lock 삽화 파이프라인, PPTX export, 다국어, 4:3. M1에서 이미지는 큐레이션된 아이콘/스타터 에셋만 사용(AI 생성 없음).

이유: 가장 불확실한 건 ①삽화 일관성 ②엔진 렌더·export 품질이다. 이미지 없는 쪽으로 엔진을 먼저 완성해 루프가 단단한지 검증하고, 비싼 삽화 레이어는 M2에 얹는다.

---

## 0. 사전 셋업 (PowerShell — 경로 따옴표 필수)

```powershell
cd "D:\claud project\kinderverse concept"

# 의존성 (M1 신규)
npm install recharts ajv
npm install -D puppeteer        # 또는 playwright. PDF export용
# (기존: react, react-flow, zustand, zundo, @tiptap/*, @supabase/* 이미 설치 가정)

# 환경변수 (.env.local) — 값은 직접 채울 것
#   ANTHROPIC_API_KEY=...
#   SUPABASE_URL=...
#   SUPABASE_ANON_KEY=...
```

> 모든 후속 명령도 경로를 `"D:\claud project\kinderverse concept"`처럼 따옴표로 감싼다.

---

## 1. Task 체크리스트 (순서대로, 작게)

- [ ] **T1. 스키마·타입 고정**
  - `deckspec.schema.json`을 `src/features/slides/schema/`로 복사.
  - TS 타입 생성(또는 SKILL.md 타입과 1:1 일치). ajv로 검증 함수 작성.
- [ ] **T2. 디자인 토큰**
  - `engine/theme/`에 Milray Park 토큰(light/warm): coral `#F2733E`, 폰트(Noto Serif KR/Pretendard, Playfair/Hanken), 간격·명도.
  - CSS 변수 주입 + ThemeProvider.
- [ ] **T3. 슬라이드 엔진 + 레이아웃 6종(M1)**
  - 고정 캔버스(16:9, 1280×720 논리좌표, scale로 맞춤).
  - layout 컴포넌트: `title`, `bullets`, `two-column`, `quote`, `chart`, `photo-grid`(스타터 에셋용). (`hero-image`/`big-text`는 M2 삽화와 함께 완성.)
  - `SlideRenderer`: layout enum → 컴포넌트 매핑.
- [ ] **T4. 차트(Recharts)**
  - `chart` 블록 렌더(bar/line/pie/radar). 색은 토큰 팔레트만. 누리과정 radar 재사용.
- [ ] **T5. 라우터 + 장표 에이전트**
  - PROMPTS.md의 Router 프롬프트로 분류 → `{category, ageBand, lengthHint}`.
  - 장표 에이전트 프롬프트로 DeckSpec 생성. lesson/parent=Sonnet, admin=Haiku.
  - 출력 파싱: 마크다운 펜스 제거 → 스키마 검증 → 실패 시 1회 재요청.
- [ ] **T6. 캔버스 연동(My Board)**
  - DeckSpec → 워크플로우 레인(아웃라인 노드 → 슬라이드 노드 가로 확장).
  - Zustand+zundo 스토어. 텍스트 인라인 편집(TipTap), 순서 드래그.
- [ ] **T7. PDF export**
  - Puppeteer로 렌더 페이지 띄움 → `document.fonts.ready` 대기 → 슬라이드별 캡처 → PDF 합본.
  - 화면 렌더와 동일 컴포넌트·토큰으로 WYSIWYG 보장.
- [ ] **T8. 통합 테스트(아래 시나리오)**

---

## 2. 완료 기준 (Acceptance)

- 교사가 한 줄 + 칩 2개만 입력해 parent/admin 덱을 생성할 수 있다.
- 생성된 DeckSpec가 스키마 검증을 통과한다.
- 모든 슬라이드가 Milray 토큰 안에서 렌더된다(하드코딩 색/폰트 0).
- 캔버스에서 텍스트 수정·순서 변경이 되고 undo/redo가 동작한다.
- PDF로 내보냈을 때 한글 폰트가 정상 임베드되고 화면과 동일하다.

---

## 3. 테스트 시나리오

1. **부모설명회용:** 입력 "신학기 우리 반 운영 방침 설명회" / 칩 parent·혼합 → 10장 내외, two-column·quote·chart 포함 → PDF.
2. **행정용:** 입력 "3월 운영 보고" / 칩 admin·혼합 → 6장 내외, 이미지 0, bullets·chart 중심 → PDF (PROMPTS.md few-shot과 유사한 형태 기대).
3. **깨진 출력 처리:** 에이전트가 펜스/서문을 붙이거나 enum 밖 layout을 내는 경우 → 자동 정정·재요청으로 복구되는지.

---

## 4. 다음 단계 예고 (M2)

- `ImageProvider` 추상화 + style-lock + Supabase 에셋 캐시 + 마스코트 레퍼런스.
- 이미지 모델 후보 A/B → 1개 확정.
- `hero-image`/`big-text` 레이아웃을 실제 삽화와 함께 완성(수업용).
- pptxgenjs PPTX export.
