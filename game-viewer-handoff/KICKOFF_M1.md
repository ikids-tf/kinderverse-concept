# KICKOFF M1 — 엔진 + counting + silhouette

> 목표: **"프롬프트 → 게임 → 플레이"** 전체 루프를 가장 빠르게 동작시킨다.
> 두 템플릿 모두 OpenMoji만 쓰므로 **이미지 생성이 0** → 즉시 확인 가능.

먼저 읽기: `CLAUDE.md`, `PRD.md §3·§4·§9(M1)`, `src/game-viewer/schema/gameSpec.ts`, `src/game-viewer/theme.ts`.

---

## 🔴 환경 주의 (반복 강조)

루트 경로 `D:\claude_project\kinderverse concept` 의 **"concept" 앞에 공백**이 있다.
PowerShell의 **모든 경로 인자를 따옴표로 감쌀 것.**

```powershell
cd "D:\claude_project\kinderverse concept"
```

---

## STEP 0 — 스캐폴드 (Vite + React + TS)

> 🔴 **기존 KinderVerse 프로젝트에 통합하는 경우 STEP 0·STEP 1의 스캐폴드는 건너뛴다.**
> 이미 Vite/TS/Tailwind가 있다. `INTEGRATION.md`대로 `src/game-viewer/` 이동 + deps 설치만 하고
> **STEP 2부터** 시작. 아래는 *맨바닥에서 새로 시작할 때만* 해당된다.

> 킨더버스/MeetFlow 스택(React 18 + Vite + Tailwind)에 맞춘다. 프로토타입을 자기완결적으로.

```powershell
cd "D:\claud project\kinderverse concept"

# (맨바닥 시작 시에만) Vite 앱 골격을 얹는다:
npm create vite@latest . -- --template react-ts
npm install
```

- `src/game-viewer/`(제공된 schema/theme/generate)는 **보존**하고, Vite의 `src/`와 병합한다.
- Tailwind 설치(원하면): `npm install -D tailwindcss postcss autoprefixer && npx tailwindcss init -p`
  (단, **게임 뷰어 색은 Tailwind 기본 팔레트가 아니라 `theme.ts` 파스텔 토큰**을 쓴다.)

## STEP 1 — 의존성 설치

```powershell
# M1 최소 (기존 프로젝트면 zustand·zundo는 이미 있을 수 있음 → 자동 스킵)
npm install motion howler canvas-confetti zod
npm install -D @types/howler @types/canvas-confetti
```

> 핸드오프 `package.json`은 **참고용**이다. 기존 프로젝트의 package.json 위에 복사하지 말 것
> (INTEGRATION.md §2). 설치 후 각 라이브러리 최신 호환 버전·API 확인(특히 Motion import 경로).
> OpenMoji 에셋은 npm 대신 CDN/로컬로 받는다(STEP 4).

## STEP 2 — GameSpec 검증(zod)

`src/game-viewer/schema/gameSpec.zod.ts` 생성:
- `gameSpec.ts`의 타입에 1:1 대응하는 zod 스키마.
- `parseGameSpec(json): GameSpec` — 생성 산출물/캐시 로드 시 런타임 검증.
- 기존 `assertSpecIntegrity`(gameSpec.ts)와 함께 사용.

## STEP 3 — 엔진 셸

`src/game-viewer/engine/`:

- **`GameViewer.tsx`** — `{ spec: GameSpec }` 받아 `spec.templateId`로 템플릿 컴포넌트 라우팅.
  배경은 `theme.palette` 파스텔. 알 수 없는 templateId는 친절한 빈 상태.
- **`GameShell.tsx`** — 공통 셸:
  - 게임 시작 시 `instruction` 음성 자동 재생.
  - 라운드 진행(현재 라운드 인덱스, 다음 라운드 전환 — Motion 페이지 전환).
  - 정답 시 **보상 오케스트레이션** 호출(`rewards.tsx`).
  - 진행 표시(별 N개 등, 파스텔).
- **`useGameAudio.ts`** — Howler 래퍼 훅:
  - `playInstruction(url)`, `playSfx(name)`, `playPraise(url)`.
  - **M1은 CLOVA 스텁**: 실제 TTS 대신 사전 녹음/placeholder 또는 Web Speech API(`speechSynthesis`)로
    한국어 음성 임시 재생. (CLOVA 연동은 M2.) **핵심은 "음성으로 나온다"를 지금 증명.**
- **`rewards.tsx`** — `Rewards` 받아 confetti(파스텔 색만) + 별 팝 + 칭찬 음성. 한 번에 몰아서.

## STEP 4 — OpenMoji 에셋 리졸버

`src/game-viewer/assets/openmoji.ts`:
- `ref`(hexcode) → SVG URL. CDN(`https://cdn.jsdelivr.net/gh/hfg-gmuend/openmoji/color/svg/{REF}.svg`)
  또는 로컬 `public/openmoji/`로 사전 다운로드(오프라인·속도).
- 실루엣용: 같은 SVG의 알파/형태를 단색(`theme.palette.textSoft` 또는 검정)으로 채워 반환하는 유틸.
  (SVG fill 치환 또는 CSS mask 기법.)
- 라벨→ref 매핑 테이블(M1은 작은 셋: 동물·탈것 위주 20~30개면 충분).

## STEP 5 — `counting` 템플릿

`src/game-viewer/templates/counting/`:
- `CountingGame.tsx` — `CountingRound[]` 소비.
- 아이템 N개를 `scatter`(random/grid)로 배치 — Motion `spring.bouncy`로 등장.
- **아이템 탭 → 통통 bounce + 카운트업 음성**("하나!","둘!"...) + 시각 카운터.
- 숫자 보기 버튼(파스텔 로테이션, 큰 터치 타깃 `touch.minTarget`).
- 정답 → `rewards`. 오답 → 살짝 흔들고 부드럽게, **부정 연출 없이** 재시도 음성.

## STEP 6 — `silhouette` 템플릿

`src/game-viewer/templates/silhouette/`:
- `SilhouetteGame.tsx` — `SilhouetteRound[]` 소비.
- 정답 에셋을 **실루엣**(단색)으로 크게 표시.
- 보기 에셋들(컬러) 버튼.
- 정답 선택 → 실루엣이 **컬러로 모핑 + 스케일 인**(Motion) → `rewards`.
- 오답 → 부드러운 흔들림 + 재시도.

## STEP 7 — 입구 ①: 템플릿 갤러리 + 폼 (LLM 없음, M1 핵심 진입)

> **`generate/contentSets.ts`·`templateForms.ts`·`buildSpecFromForm.ts`는 이미 제공됨**(타입체크+런타임
> 검증 완료). 구체 사양은 **FORM_DESIGN.md** 참조. 여기선 ① ref 검증과 ② UI 구현만 하면 된다.

**먼저 — OpenMoji ref 검증:**
- `contentSets.ts`의 모든 ref를 jsDelivr(`color/svg/{REF}.svg`)에 대조해 404 나는 항목 교체.
- `assets/openmoji.ts` 리졸버가 **단일 ref와 ZWJ 결합 ref(예 `1F9D1-200D-1F692`)를 모두** 처리하는지 확인.
- 실루엣은 단일 코드포인트 우선(job 카테고리는 `goodForSilhouette:false`로 이미 제외됨).

**그다음 — UI:**
`src/game-viewer/entry/`:
- **`TemplateGallery.tsx`** — `TEMPLATE_FORMS`를 돌며 템플릿 카드(파스텔, 아이콘=`def.icon`) 렌더.
  M2 템플릿은 "준비중" 뱃지(`def.milestone`). 카드 클릭 → `TemplateForm` 진입.
- **`TemplateForm.tsx`** — 선택 템플릿의 `def.fields`를 **큰 세그먼트/칩**으로 렌더(FORM_DESIGN §5).
  `ageRange` 변경 시 `autoFrom` 필드 기본값을 `AGE_DEFAULTS`로 갱신. 하단 "(옵션) 프롬프트"는
  M1 플레이스홀더(비활성). "게임 시작" → `buildSpecFromForm({templateId, values})` → GameViewer.
- 색·모션·터치는 전부 `theme.ts`.

## STEP 8 — 입구 ②: 프롬프트(목업) + 데모 페이지

`src/game-viewer/generate/` (프롬프트 경로, M1은 목업):
- `router.ts`(목업): 프롬프트 키워드 → `templateId` + 카테고리/테마.
- `generateGameSpec.ts`(목업): 내부적으로 `buildSpecFromForm` 재사용하거나 미리 정의된 GameSpec 반환.
  (실제 Router→전문 에이전트 LLM 연동은 M2.)

`src/game-viewer/entry/StartScreen.tsx` + `src/App.tsx`:
- **기본 화면 = `StartScreen`**: 상단 탭/토글로 **[템플릿에서 시작]**(기본) ↔ **[프롬프트로 시작]** 전환.
  - 템플릿 탭 → `TemplateGallery`.
  - 프롬프트 탭 → `PromptBar`(입력 + 파스텔 **퀵픽 칩**).
- 생성된 spec → GameViewer 렌더.
- 개발 확인용: `EXAMPLE_COUNTING` / `EXAMPLE_SILHOUETTE` 즉시 플레이 버튼 2개.

```powershell
npm run dev
```

---

## ✅ M1 수용 기준 (이게 되면 M1 끝)

- [ ] `EXAMPLE_COUNTING` / `EXAMPLE_SILHOUETTE` 가 GameViewer에서 렌더된다.
- [ ] **counting**: 아이템 탭 → bounce + 카운트업 음성 → 숫자 선택 → 파스텔 confetti + 칭찬 음성.
- [ ] **silhouette**: 실루엣 → 정답 선택 → 컬러 모핑 등장 → 보상.
- [ ] 오답에 **부정 연출이 없다**. 다정한 재시도.
- [ ] **입구①**: 갤러리 → 템플릿 선택 → 폼(카테고리·개수·연령) → `buildSpecFromForm()`(**LLM 없음**)
      → 게임 플레이까지 끝까지 동작.
- [ ] 폼의 (옵션) 프롬프트칸을 **비워도** 폼만으로 게임이 완성된다.
- [ ] **입구②**: 프롬프트 입력(목업 매핑이라도) → 게임 생성 루프가 돈다.
- [ ] StartScreen에서 두 입구를 탭으로 오갈 수 있다.
- [ ] 지시·라벨·피드백이 **음성으로 나온다**(Web Speech 스텁이라도).
- [ ] 게임 화면이 **파스텔/큐트**다 (Milray Park 아님). 터치 타깃 크고 둥글다.

---

## 다음(M2 예고)

CLOVA Voice 실연동 · Rive `emotion`(공감 반응) · Konva `matching`(선잇기) · 실제 생성
에이전트(Router→전문 에이전트). → `PROMPTS.md` M2 섹션.
