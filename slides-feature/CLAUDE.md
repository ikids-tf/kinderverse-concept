# CLAUDE.md — KinderVerse 슬라이드 기능 프로젝트 규칙

> 이 파일은 Claude Code가 자동으로 읽는 프로젝트 헌법이다. 여기 적힌 불변식은 협상 대상이 아니다.

## 1. 작업 환경 / 경로 규칙 (필수)

- OS: Windows 주 환경, **PowerShell**이 기본 터미널.
- 프로젝트 경로에 **공백이 두 군데 있다**(`claud project`, `kinderverse concept`): `D:\claud project\kinderverse concept`. 따옴표 없이 쓰면 100% 깨진다.
- **모든 터미널 명령에서 경로는 반드시 따옴표로 감싼다.** 예:
  ```powershell
  cd "D:\claud project\kinderverse concept"
  ```
- 스크립트·설정 파일에서 경로를 하드코딩하지 말고 상대경로 또는 `process.cwd()` 기준으로 작성.

## 2. 절대 어기지 않는 아키텍처 불변식 (4)

1. **텍스트는 절대 이미지 안에 굽지 않는다.** AI 이미지는 삽화/배경만. 제목·본문·라벨·캡션 등 모든 글자는 슬라이드 엔진이 렌더한다. (한글 가독성·편집성·비용·벤더 독립성 전부 여기서 나옴.)
2. **Claude는 슬라이드를 그리지 않는다. DeckSpec JSON만 생성한다.** 콘텐츠/스토리/레이아웃 선택까지 구조화된 JSON으로 내고, 렌더링은 엔진 전담. `deckspec.schema.json`이 둘 사이의 유일한 계약이다.
3. **슬라이드 엔진은 React 컴포넌트 렌더러다.** HTML/CSS로 렌더 → PDF/PNG/PPTX export. 절대 외부 슬라이드 SaaS로 위임하지 않는다(SlideSpeak 등 사용 금지).
4. **레이아웃은 열거형으로 고정한다.** Claude가 자유롭게 디자인하게 두지 않는다. 정해진 `layout` enum 중에서만 고르게 해 결과가 항상 브랜드 템플릿 안에 들어오게 한다.

## 3. 카테고리별 파이프라인 분기

라우터가 요청을 `lesson | parent | admin`으로 분류하고, **카테고리마다 다른 파이프라인을 탄다.** "하나의 파이프라인에 옵션" 아님.

- `lesson` (수업용): 풀 삽화, Claude Sonnet, 이미지 생성 ON
- `parent` (부모설명회용): 선택적 히어로 + 차트, Sonnet, 이미지 캐시 우선
- `admin` (기타행정용): 삽화 없음(아이콘/도형만), Haiku, 이미지 생성 OFF → 가장 빠르고 저렴

## 4. 디자인 시스템 — 다중 테마 (2026-06-14 개정)

> **개정**: 사용자 지시로 슬라이드 콘텐츠는 Milray 단일 고정에서 풀려 **다양한 전문 테마**를 허용한다(Claude Design 원칙 — 덱마다 고유 비주얼). 단 앱 크롬(툴바·레일)은 Milray 유지.

- 테마는 `src/features/slides/engine/themes.css`의 `.slides-root[data-theme]` → `--s-*` 변수로 정의. 슬라이드 콘텐츠 CSS(slides.css)는 **`--s-*`만** 참조(특정 색 하드코딩은 themes.css 안에서만).
- 현재 테마(7): `warm`(Milray 웜·코랄) · `ivory` · `midnight`(다크) · `slate`(블루) · `sage` · `bloom`(유아) · `mono`. dark 포함.
- 폰트도 테마가 정함(`--s-display` 세리프/산세 전환). 교사는 테마 피커로 전체 스타일을 바꾸고, AI는 주제에 맞는 테마를 고른다.
- 레이아웃 enum·위계·여백 규칙은 그대로(불변식 4) — "예쁨"은 테마+레이아웃 시스템이 보장.

## 5. 에이전트 컨벤션

- 3-tier 구조(Router / specialist / deterministic tools)에 **슬라이드(장표) 전문 에이전트**를 추가한다.
- 에이전트 식별자는 기존 컨벤션대로 **기능 중심 한국어 네이밍**을 따른다 (예: `장표` 에이전트).
- 슬라이드 생성은 **워크플로우 레인**으로 표현한다: 한 줄 요청 → 아웃라인 노드 1개 → 슬라이드 노드 N개가 가로로 연결 확장.

## 6. 라이브러리 / 스택

| 용도 | 라이브러리 | 비고 |
|---|---|---|
| 캔버스 | React Flow | 기존 My Board 재사용 |
| 상태 | Zustand + zundo | 기존 재사용, 무한 undo |
| 리치텍스트 | TipTap | 슬라이드 텍스트 인라인 편집 |
| 에셋 | Supabase Storage | 이미지 LOD 기존 인프라 재사용 |
| 차트 | Recharts | 누리과정 레이더 차트에서 쓰던 것 |
| PDF/PNG export | Puppeteer 또는 Playwright | React 슬라이드를 서버사이드 렌더 |
| PPTX export | pptxgenjs | DeckSpec → 네이티브 PPTX 매핑 (M2) |
| 콘텐츠 | Claude API (Sonnet/Haiku) | 카테고리별 모델 분기 |
| 이미지 | `ImageProvider` 추상화 | 모델 교체 가능, M2에서 후보 A/B |

## 7. 코딩 컨벤션

- TypeScript strict. DeckSpec 타입은 `deckspec.schema.json`에서 생성하거나 그와 1:1 일치시킨다.
- 슬라이드 렌더러 / Exporter / ImageProvider는 모두 **인터페이스 우선**으로 설계해 구현체를 교체 가능하게 한다(SKILL.md 참조).
- 프롬프트 문자열은 코드에 흩지 말고 `PROMPTS.md` 원문을 단일 출처로 관리.
- 커밋·작업 단위는 KICKOFF_M1.md 체크리스트 항목 단위로 작게.

## 8. 하지 말 것

- 이미지에 텍스트 굽기 (불변식 1 위반).
- 외부 슬라이드 SaaS 연동 (불변식 3 위반).
- Claude에게 자유 레이아웃/자유 CSS 생성 시키기 (불변식 2·4 위반).
- 디자인 토큰 밖의 색/폰트/픽셀 하드코딩.
- 아동·교사 데이터를 킨더버스/Supabase 밖으로 내보내기.
- 경로를 따옴표 없이 쓰기.
