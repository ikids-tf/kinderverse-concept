# CLAUDE.md — KinderVerse 프로젝트 헌장

> 배치: **프로젝트 루트** (`KinderVerse/CLAUDE.md`). Claude Code가 세션 시작 시 자동으로 읽음.
> 상세 기획은 `docs/PRD.md`, 도메인/에이전트 지식은 `.claude/skills/kinderverse/SKILL.md`, 프롬프트 템플릿은 `docs/PROMPTS.md`.
> **코드 기준 심화 문서**(읽으면 빠르게 생산적): 시작 `docs/ONBOARDING.md` · 구조·데이터흐름·다이어그램 `docs/ARCHITECTURE.md` · 모듈별 export·확장 레시피 `docs/MODULE_REFERENCE.md` · 엔드포인트·AUI(JSON) 계약·env·Supabase `docs/API_REFERENCE.md`.

## 0. 제품 한 줄 정의
킨더버스 = "공간 단위" 교사 워크스페이스. 교사가 자연어로 말하거나 보드 위 대상을 선택해 명령하면, 얇은 3계층 에이전트가 의도를 해석해 전문 에이전트/도구로 라우팅하고, 결과를 레지스트리 제약 AUI로 렌더한다.

## 1. 기술 스택 (고정)
- Frontend: **React 18 + Vite + Tailwind + Zustand**
- Backend/DB: **Supabase** (Postgres + pgvector)
- AI: **얇은 프로바이더 게이트웨이** — Anthropic + Gemini 기본. 이미지/영상/OCR은 플러그인. **LangChain/CrewAI 등 프레임워크 금지(직접 API 호출).**
- 사진 분류: 기개발 분류 API **실시간** 연동
- 배치: GitHub Actions (distill/인덱싱 등 비실시간만)

## 1.1 명령 (빌드·실행·검증)
- `npm install` — **신규 체크아웃 시 먼저 실행**(`node_modules` 미커밋). 미설치 상태면 `tsc`가 react/@types/node를 못 찾아 빌드가 가짜 에러로 깨진다.
- `npm run dev` — Vite 개발 서버(http://localhost:5173). `vite-plugins/devGateway.ts`가 `/api/*`(ai/run·ai/chat·youtube·unfurl·video·lessons)를 **인프로세스로** 제공(Vercel 함수와 동일 계약).
- `npm run build` — `tsc -b && vite build`. **타입체크 포함이라 PR 전 필수 게이트.**
- `npm run lint` — eslint(`eslint .`).
- `npm run preview` — 프로덕션 빌드 미리보기.
- **테스트 러너 없음.** 단위테스트 프레임워크 미구성 — 단일 테스트 명령 같은 건 없다. 회귀·라우팅 정확도 검증은 **인앱 `/eval` 페이지**(`src/eval/` 골든셋+러너, `EvalPage`). 디자인 토큰 확인은 `/tokens`.
- **Vite 멀티페이지 엔트리 3개**: `index.html`(메인 SPA) · `game-viewer.html` · `slides-viewer.html`(`vite.config.ts` `rollupOptions.input`).
- **AI 키 없이도 완전 동작** — 게이트웨이가 오프라인 mock으로 폴백. `.env.example`→`.env`(키는 **서버 전용**, `VITE_` 접두사만 브라우저 노출). 경로 별칭 `@/*`→`./src/*`.
- **Git:** 이 레포는 `main`에 직접 커밋(PR 흐름 없음). 커밋은 자유지만 **`main` push는 매번 사용자 승인 필요**(기본 브랜치 직접 push는 자동 차단됨).

## 2. 하드 룰 (위반 금지)
1. **디자인 토큰은 Milray Park 시스템만 사용** — `.claude/skills/milray park design/colors_and_type.css`(디렉터리명에 공백 포함)의 CSS 변수를 그대로 쓴다. 앱 토큰 구현체는 `src/styles/tokens.css`. 색·폰트·라운드·그림자·간격을 하드코딩하지 말고 `var(--coral)`, `var(--surface)`, `var(--r-pill)` 등 시맨틱 변수로.
   - 악센트는 **코랄 `#F2733E`** 단일 + 골드(등급 전용). **퍼플(#723CEB) 등 임의 색 추가 금지.**
   - 폰트: 표현=Playfair Display/Noto Serif KR(세리프), 기능=Hanken Grotesk/Pretendard(그로테스크).
   - 모드: **웜(크림) 단일 테마 기본.** 화이트 모드는 토큰 오버라이드 한 겹으로 추후 추가(지금은 만들지 말 것).
   - ※ Milray Park의 **시각 토큰만** 채택. 그 브랜드 보이스/카피("your designer", e-decorating 문구)는 **사용 금지.**
   - **예외(2026-06-14, 사용자 지시): 슬라이드 '콘텐츠'는 이 규칙에서 면제.** `src/features/slides`는 다양한 전문 테마(themes.css의 `--s-*`)를 허용한다(Claude Design 원칙). 단, **앱 크롬(툴바·레일·프롬프트바 등)은 Milray 토큰 유지.** 슬라이드 콘텐츠의 비-Milray 색/폰트를 "위반"으로 보고 되돌리지 말 것.
2. **프롬프트바는 새로 만들지 말 것.** 기존 로컬 프로젝트의 프롬프트바 컴포넌트를 기준 구현체로 가져와 **공용 셸 컴포넌트로 승격**해 전 페이지 재사용. 동작 명세는 SKILL.md/PRD §10.4.
3. **AUI는 임의 HTML 생성 금지.** 에이전트는 JSON만 출력 → 스키마 검증 → UI Registry 컴포넌트 렌더.
4. **무근거 생성 금지.** 관찰/평가는 사진·교사메모 `grounding` 없이는 생성하지 않는다. 결과에 근거 출처 + 누리/표준 영역 연계를 표시.
5. **아동 데이터.** 테넌트(원) 단위 격리. 공용 모델 학습 사용 금지. `consent_flag` 없는 사진은 파이프라인 제외. 삭제는 L3(휴먼게이트).
6. **에이전트 명칭 = 기능명**(라우터/기록/계획/스튜디오/문장/분류·기억). 페르소나 이름 사용 금지.

## 3. 에이전트 구조 (요약 — 상세는 SKILL.md)
- **Tier 0 라우터**: 의도분류·슬롯추출·선택 컨텍스트·라우팅·확신도. 콘텐츠 생성 안 함. 저가·고속 모델.
- **Tier 1 전문 에이전트**: 기록 / 계획 / 스튜디오 / 문장. 모두 **Pedagogy Foundation 레이어 상속**.
- **Tier 2 도구**: 이미지/영상 생성, 문서 템플릿, 분류·기억(엔진).
- 유아교육 적합성은 공유 레이어가 보장(직렬 검수 없음). 고위험 산출물(평가서)만 자동 적합성 검증 1회.
- **기록 2모드**: `observation`(관찰기록·평가용) / `story`(놀이기록=놀이이야기, 사진배치+활동서술, 학부모 발송용).
- **활동지**: 항상 스튜디오 생성. (A)놀이계획 연결(계획이 맥락 공급) / (B)독립. 결과는 `link.plan_id`로 연결.

## 3.1 ★ Workflow Lane (보드의 핵심 — 반드시 구현)
보드에서 하나를 요청하면 **가로로 자라는 워크플로 레인**이 생기고 단계 노드(아이디어→사진→계획안→활동지)가 왼→오로 채워진다. 진행은 **교사 클릭으로만**(자동 전체 실행 금지), **선택이 다음 단계 입력**, 모든 노드는 인라인+프롬프트바 편집. 레인 저장 = **폴더에 번들**(계획안+활동지+이미지+연결자료). 새 에이전트 없이 **Workflow Runner**가 기존 전문 에이전트를 템플릿 순서로 호출. 단계 순서는 템플릿 고정 + 라우터의 `suggested_next`(상황 제안, 옅게 "추천", 자동 실행 금지)는 **M2부터 탑재**. 상세: SKILL.md §9.

## 4. 자율성 게이트
- **L1 자동**(되돌리기 가능): 초안 생성, 사진 분류, 보드 레이아웃 변경.
- **L2 확인**: 가정통신문·공지 생성 → "이대로 진행?" 확인.
- **L3 휴먼게이트**: 외부 발송, 영구 삭제, 권한 변경 → 사용자가 직접 실행.

## 5. 코딩 컨벤션
- 컴포넌트 단위 작게, 타입 명시(TS 권장). 상태는 전역/보드/태스크로 분리(Zustand).
- 모든 결과 컴포넌트는 5상태 지원: `loading / streaming / ready / editing / error`.
- 반응형: 셸=container query, 결과=fluid grid, My Board=줌/팬(작은 화면은 태스크 리스트 폴백).
- 모션: 150~200ms ease, 바운스/패럴럭스 없음. `prefers-reduced-motion` 대응. 시그니처 clip-path reveal 유지.
- **문서 Mermaid:** IDE 미리보기가 구버전 — `A --> B & C`(엣지 체이닝)·sequenceDiagram `participant … as`의 괄호/슬래시가 파싱 실패한다. 엣지는 1:1로 풀어 쓰고 참여자명에 괄호 금지(최신 CLI는 통과해도 구버전에서 깨짐).

## 6. PR/작업 완료 기준 (Definition of Done)
- 토큰 하드코딩 0건(시맨틱 변수만). 빌드/린트 통과.
- 라이트하우스 접근성 기본 통과(대비·키보드·포커스 링).
- 새 결과 유형 추가 시 UI Registry에 컴포넌트 등록 + 에이전트 출력 스키마와 1:1.
- 변경 요약 + 스크린샷(있으면) 첨부.

## 7. 작업 순서
현재 마일스톤: **M1**(디자인 토큰 · 셸 · LNB · 프롬프트바). 단계별 지시는 `docs/KICKOFF_M1.md`를 순서대로 실행.

## 8. 게임 뷰어 (보드 툴바)
게임 뷰어 작업 시 `m0-handoff/CLAUDE.md` · `PRD_TWO_LAYER_DESIGN.md` · `KICKOFF_M0.md`를 함께 읽을 것.
- 코드: **`src/game-viewer/v2/`(자기완결 모듈)** + 공용 엔트리 `viewer/main.tsx`. 진입 페이지 `game-viewer.html`(Vite 멀티페이지 엔트리). 보드 임베드는 툴바 뷰어 패널의 **놀이 만들기** 프리셋(iframe `/game-viewer.html`). 엔트리·보드 임베드 계약 **불변(7곳)**.
- **게임 플레이 화면 안쪽은 Milray Park 미적용**(아이 대면 파스텔) — `src/game-viewer/v2/theme.ts` 토큰 사용. 슬라이드 콘텐츠와 동일한 면제 대상. 단, 게임을 감싸는 **보드 카드 프레임·툴바·프롬프트바(교사용)는 Milray 유지**.
- 핵심 결정: 런타임 코드 생성 ❌ → **단일 계약 `src/game-viewer/v2/schema/interactiveDoc.ts`**(InteractiveDoc). 생성·편집·런타임 모두 이 문서만 의존(`parseInteractiveDoc` 검증). 인터랙션 11종(tap-the-right-one·match-pair·binary-choice·connect·flip-memory·combine·categorize·order-sequence·find-it·sequence-tap·pattern-next) + 효과 3종(reveal·responsive-state·goal-state) + 고급 편집(EditLayer) + 리졸버(프롬프트→추천카드) 구현됨. (reveal은 인터랙션이 아니라 효과)
- Provider(교체 가능): 이미지=나노바나나(`@/ai/client` `task:'image'`) → 누끼=`@/shared/background-removal`(현행 모델 briaai/RMBG-1.4, BRIA 비상업 라이선스 / BiRefNet(MIT)은 상업화 전 교체 대상·현재 미사용) → 객체분할=`@/shared/segment`(SAM). 음성=CLOVA Voice(`task:'tts'`, 키 없으면 브라우저 TTS 폴백). **`@imgly`(AGPL) 금지.** child-photo/video는 외부 API 미전송(`assertNotChildMedia`).
- 옛 v1 GameSpec 게임뷰어(`src/game-viewer/{schema,engine,entry,templates,assets,generate}` + `theme.ts`)는 **제거됨**(v2가 대체, git 이력 보존).
- **★ 두 인터랙티브 시스템 구분(혼동 주의 — 여러 파일을 봐야 보이는 함정):** 이 §8의 게임뷰어(**A** = `src/game-viewer/v2/`, 계약 `InteractiveDoc`, 독립 iframe `/game-viewer.html`)와 **보드 네이티브 인터랙티브 노드**(**B** = `src/features/interactive-viewer/`, 계약 `InteractiveNode`, 보드 카드 `type:'interactive'`)는 **이름이 비슷하지만 별개 시스템**이다(메커니즘 명칭·계약·런타임 전부 다름). `docs/kinderverse-game-engine-spec-v0.2.md`·`docs/kinderverse-lane-infrastructure-spec-v1.0.md`는 **B**를 다룬다(두 문서의 "Game Viewer v2(A) 폐기"는 B 라인 설계 관점일 뿐, A 모듈은 현재도 활성). B의 '확장 내부화'(놀이 확장 사슬, `extendLane.ts`·`resolver/extend.ts`)는 **의도적 보류 인프라(데드코드 아님 — 삭제 금지)**, 부활=UI 글루 ~25줄(레인 스펙 §9).
