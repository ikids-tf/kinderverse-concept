# KinderVerse 온보딩

새 기여자를 위한 시작 가이드. 제품 정의는 [`CLAUDE.md`](../CLAUDE.md)(프로젝트 헌장·하드 룰), 시스템 구조는 [`ARCHITECTURE.md`](./ARCHITECTURE.md), 모듈 지도는 [`MODULE_REFERENCE.md`](./MODULE_REFERENCE.md), 엔드포인트·계약은 [`API_REFERENCE.md`](./API_REFERENCE.md).

---

## 1. 한 줄 정의

킨더버스 = **"공간 단위" 교사 워크스페이스.** 교사가 자연어로 말하거나 보드 위 대상을 선택해 명령하면, 얇은 3계층 에이전트가 의도를 해석해 전문 에이전트/도구로 라우팅하고, 결과를 레지스트리 제약 AUI로 렌더한다.

---

## 2. 5분 실행

```bash
npm install
npm run dev      # 개발 서버 → http://localhost:5173
```

- **API 키는 필수가 아니다.** 키가 없으면 게이트웨이가 **오프라인 목(mock)** 으로 폴백하므로 라우팅·생성·보드·게임이 전부 동작한다.
- 실제 모델을 붙이려면 `.env.example`를 `.env`로 복사해 채운다(아래 §4).

```bash
npm run build    # tsc -b + vite build (타입체크 포함)
npm run lint     # eslint
npm run preview  # 빌드 결과 미리보기
```

> `npm run build`는 타입체크를 포함하므로 PR 전 반드시 통과시킨다(DoD).

---

## 3. 기술 스택

| 영역 | 선택 |
|---|---|
| 프론트엔드 | React 18 + Vite + TypeScript |
| 스타일 | Tailwind CSS (Milray Park **시맨틱 토큰만**) |
| 상태 | Zustand (전역/보드/히스토리 분리, zundo undo) |
| 라우팅 | React Router |
| 백엔드 | Vercel 서버리스 함수 + 개발용 Vite 미들웨어(`devGateway`) |
| DB(선택) | Supabase (Postgres + Storage) |
| AI | **얇은 프로바이더 게이트웨이** — Anthropic + Gemini 직접 fetch. **LangChain/CrewAI 등 프레임워크 금지.** |
| 온디바이스 | RMBG(배경제거)·SlimSAM(분할) WASM — 아동 미디어 전용 |

---

## 4. 환경 설정

`.env.example` → `.env` 복사 후 필요한 키만 채운다. 키 조합별 동작:

| 설정 | 동작 |
|---|---|
| 키 없음 | 전체 목 모드 (앱 완전 동작) |
| `ANTHROPIC_API_KEY`만 | 텍스트 실연동, 이미지/영상 목 |
| `GEMINI_API_KEY`만 | Gemini 실연동(이미지/영상 포함), Anthropic 목 |
| 둘 다 | `auto` (Anthropic 우선, Gemini 폴백) |

전체 변수 표(모델 티어 오버라이드, CLOVA Voice, Supabase)는 [`API_REFERENCE.md` §3](./API_REFERENCE.md#3-환경변수-envexample).

---

## 5. 디자인 토큰 (하드 룰 — 위반 금지)

색·폰트·라운드·그림자·간격을 **하드코딩하지 않는다.** 전부 시맨틱 토큰으로.

- 토큰 원본: `src/styles/tokens.css` (Milray Park `colors_and_type.css` 사본)
- Tailwind 매핑: `tailwind.config.js` (모든 값이 CSS 변수 참조)
- 사용 예: `bg-surface`, `text-fg`, `text-accent`, `rounded-pill`, `shadow-md`, `gap-t4`, `text-h2`
- 악센트는 **코랄(`accent`) 단일** + `gold`(등급 전용). 웜(크림) 단일 테마.
- 확인용 데모: `/tokens`

**면제 대상**(비-Milray 색/폰트 허용, "위반"으로 되돌리지 말 것):
- 슬라이드 콘텐츠(`src/features/slides`, `themes.css` `--s-*`)
- 게임 플레이 화면 안쪽(`src/game-viewer/v2/theme.ts` 파스텔)
- 단, 두 경우 모두 **감싸는 앱 크롬(툴바·레일·프롬프트바)은 Milray 유지.**

---

## 6. 디렉터리 지도

```
kinderverse-concept/
├─ src/
│  ├─ ai/             # AI 클라이언트·계약·프롬프트·에이전트 (agents/)
│  ├─ ui-registry/    # AUI: JSON → 컴포넌트 렌더 (8종 카드)
│  ├─ board/          # 명령·Workflow Lane·프레임/러너·프롬프트 라우팅
│  ├─ store/          # Zustand 스토어 12+
│  ├─ components/     # AppShell·LNB·PromptBar·board/*·ai/*
│  ├─ pages/          # 라우트 페이지 10
│  ├─ features/       # slides/ · interactive-viewer/
│  ├─ game-viewer/v2/ # 자기완결 게임 런타임 (iframe)
│  ├─ shared/         # 온디바이스 RMBG·SlimSAM·inpaint
│  ├─ styles/         # tokens.css (Milray)
│  ├─ hooks/          # useKeyboardShortcuts 등
│  └─ eval/           # 평가 하네스 (골든셋·러너)
├─ server/gateway/    # 프로바이더 게이트웨이(핸들러·어댑터·목·이미지·영상·TTS)
├─ api/               # Vercel 서버리스 함수 (게이트웨이 위임)
├─ vite-plugins/      # devGateway (= 서버 게이트웨이 인프로세스)
├─ supabase/          # schema.sql (kv_store · kv-assets)
├─ index.html · game-viewer.html · slides-viewer.html   # Vite 멀티페이지 엔트리
└─ docs/              # 이 문서들 + PRD.md · PROMPTS.md
```

---

## 7. 핵심 흐름 멘탈 모델

1. **프롬프트바**(전 페이지 상주)가 단일 명령 인터페이스. 입력은 `uiStore.promptDraft`로 리프트된다.
2. **AI 채팅 페이지** → `routerStore.send()` → 병렬로 (a) 스트리밍 마크다운 답변 (b) 라우터 + 선택적 인라인 Tier1 에이전트.
3. **My Board 페이지** → `handleBoardPrompt()`(`src/board/prompt.ts`) → 의도 감지 후 직접 생성/포맷 선택/불일치 다이얼로그/단순 추가로 분기.
4. 보드 변경은 **명령 팩토리**(`commands.ts`) → `history().execute()` → `boardStore` raw ops → `BoardCanvas` 재렌더. 되돌리기는 모두 Command 단위.
5. AI 출력은 항상 **`{ type, props }` JSON** → `validateRegistryPayload` → `RegistryRenderer`로 5상태 카드 렌더(임의 HTML 금지).

자세한 시퀀스 다이어그램은 [`ARCHITECTURE.md` §3](./ARCHITECTURE.md#3-ai-요청-데이터-흐름).

---

## 8. 코딩 컨벤션 (CLAUDE.md 발췌)

- 컴포넌트 작게, 타입 명시(TS). 상태는 전역/보드/태스크로 분리.
- 모든 결과 컴포넌트는 **5상태** 지원: `loading / streaming / ready / editing / error`.
- 모션: 150~200ms ease, 바운스/패럴럭스 없음. `prefers-reduced-motion` 대응.
- 에이전트 명칭 = 기능명(라우터/기록/계획/스튜디오/문장). 페르소나 이름 금지.
- **자율성 게이트**: L1(자동·되돌리기 가능) / L2(확인) / L3(휴먼게이트 — 외부 발송·영구 삭제·권한 변경).

---

## 9. PR 완료 기준 (Definition of Done)

- 토큰 하드코딩 **0건**(시맨틱 변수만). `npm run build` + `npm run lint` 통과.
- 라이트하우스 접근성 기본 통과(대비·키보드·포커스 링).
- 새 결과 유형 추가 시 UI Registry 컴포넌트 등록 + 에이전트 출력 스키마와 1:1.
- 변경 요약 + 스크린샷(있으면) 첨부.

---

## 10. 다음에 읽을 것

| 목적 | 문서 |
|---|---|
| 제품 헌장·하드 룰 | [`CLAUDE.md`](../CLAUDE.md) |
| 시스템 구조·다이어그램 | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| 모듈별 export·확장 레시피 | [`MODULE_REFERENCE.md`](./MODULE_REFERENCE.md) |
| 엔드포인트·AUI 계약·env·DB | [`API_REFERENCE.md`](./API_REFERENCE.md) |
| 상세 기획 | [`PRD.md`](./PRD.md) |
| 에이전트/도메인 지식 | [`.claude/skills/kinderverse/SKILL.md`](../.claude/skills/kinderverse/SKILL.md) |
| 프롬프트 템플릿 | [`PROMPTS.md`](./PROMPTS.md) |
| 마일스톤 이력 (M1~M9) | [`../README.md`](../README.md) |
