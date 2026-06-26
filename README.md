# KinderVerse · 킨더버스

공간 단위 교사 워크스페이스. 자세한 제품 정의는 [`CLAUDE.md`](CLAUDE.md), 기획은 [`docs/PRD.md`](docs/PRD.md),
도메인/에이전트 지식은 [`.claude/skills/kinderverse/SKILL.md`](.claude/skills/kinderverse/SKILL.md).

## 📚 문서

| 목적 | 문서 |
|---|---|
| **처음 시작** — 실행·환경·디렉터리·멘탈 모델 | [`docs/ONBOARDING.md`](docs/ONBOARDING.md) |
| **시스템 구조** — 계층·데이터 흐름·다이어그램(Mermaid) | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| **모듈 레퍼런스** — 스토어/AI/보드/게임뷰어 export + 확장 레시피 | [`docs/MODULE_REFERENCE.md`](docs/MODULE_REFERENCE.md) |
| **API·백엔드** — 엔드포인트·AUI(JSON) 계약·env·Supabase | [`docs/API_REFERENCE.md`](docs/API_REFERENCE.md) |
| 제품 헌장·하드 룰 | [`CLAUDE.md`](CLAUDE.md) |
| 상세 기획 | [`docs/PRD.md`](docs/PRD.md) |

> 아래는 마일스톤별 구현 이력(M1~M9). 빠른 개발 시작은 위 온보딩 문서를 권장한다.

## 스택

- React 18 + Vite + TypeScript
- Tailwind CSS (시맨틱 토큰만 — Milray Park 디자인 시스템)
- Zustand (전역/보드/히스토리 상태 분리)
- React Router

## 실행

```bash
npm install
npm run dev      # 개발 서버 (http://localhost:5173)
npm run build    # 타입체크 + 프로덕션 빌드
npm run preview  # 빌드 결과 미리보기
```

## 디자인 토큰 (하드 룰)

색·폰트·라운드·그림자·간격은 **하드코딩 금지**. 전부 시맨틱 토큰으로.

- 토큰 원본: [`src/styles/tokens.css`](src/styles/tokens.css) (Milray Park `colors_and_type.css` 사본)
- Tailwind 매핑: [`tailwind.config.js`](tailwind.config.js) — 모든 값이 CSS 변수 참조
- 사용 예: `bg-surface`, `text-fg`, `text-accent`, `rounded-pill`, `shadow-md`, `gap-t4`, `text-h2`
- 악센트는 코랄(`accent`) 단일 + `gold`(등급 전용). 웜(크림) 단일 테마.
- 화이트 모드는 미생성 — `src/index.css`에 토큰 오버라이드 자리만 비워둠.
- 토큰 확인용 데모: `/tokens`

## M1 구현 현황

| 영역 | 위치 |
|---|---|
| 디자인 토큰 + Tailwind 매핑 | `src/styles/tokens.css`, `tailwind.config.js`, `src/index.css` |
| 앱 셸 (반응형: 넓으면 아이콘 레일 / 좁으면 하단탭, container query) | `src/components/AppShell.tsx`, `src/index.css` |
| LNB (통합 IA, SKILL §5) | `src/components/LNB.tsx`, `src/lib/nav.ts` |
| 공용 프롬프트바 (전 페이지 상주, 4동작, SKILL §7) | `src/components/PromptBar.tsx`, `src/components/FavoriteCardRail.tsx` |
| AI 채팅 전용 페이지 (SKILL §8) | `src/pages/AIChatPage.tsx` |
| 전역 단축키 핸들러 (포커스 분리) | `src/hooks/useKeyboardShortcuts.ts` |
| Undo/Redo 히스토리 모듈 (보드 상태와 분리, SKILL §6.2) | `src/store/historyStore.ts` |
| 페이지 스텁 | `src/pages/*` |

### 프롬프트바 4동작 (SKILL §7)

1. 좌측 메시지 아이콘 → AI 채팅 페이지 이동(접힌 상태에선 펼침 트리거)
2. 입력 비면 별(즐겨찾기) ↔ 입력 있으면 전송 토글
3. 별 클릭 → 즐겨찾기 카드(놀이계획·놀이기록·관찰기록·문장생성·스튜디오) 솟아오름 → 해당 페이지 이동
4. 우측 둥근 토글 → 바 접기(메시지 아이콘만 남김)

## M2 구현 현황 — 라우터 + 멀티 프로바이더 게이트웨이

| 영역 | 위치 |
|---|---|
| 출력 계약(타입 + 런타임 검증 + 자기수선) | `src/ai/contract.ts` |
| 4계층 프롬프트 조립(L0~L3) | `src/ai/prompt.ts` |
| Tier0 라우터 에이전트(확신도 게이팅·자기수선 1회) | `src/ai/agents/router.ts` |
| 게이트웨이 클라이언트(`POST /api/ai/run`) | `src/ai/client.ts`, `src/ai/gateway/types.ts` |
| 서버 게이트웨이(직접 API·캐스케이드·목 폴백) | `server/gateway/*` |
| 프로바이더 어댑터(Anthropic·Gemini, 직접 fetch) | `server/gateway/providers.ts` |
| Dev 게이트웨이 미들웨어(`/api/ai/run`) | `vite-plugins/devGateway.ts` |
| 페이지별 `available_actions` 등록 | `src/ai/actions.ts`, `AppShell` |
| 프롬프트바 → 라우터 연결 / 결과·명확화 렌더 | `PromptBar`, `AIChatPage`, `src/components/ai/RouterTurnView.tsx` |

### 보안·키
- 프로바이더 키는 **서버 측에서만** 사용(`.env`의 `ANTHROPIC_API_KEY` / `GEMINI_API_KEY`). 브라우저로 노출되지 않음.
- 키가 없으면 게이트웨이가 **오프라인 목(mock)** 으로 폴백 → 키 없이도 앱이 완전히 동작.
- 클라이언트 계약(`POST /api/ai/run`)은 추후 서버리스/Supabase 엣지 함수로 그대로 이전.
- 모델 티어: low=`claude-haiku-4-5`(라우터, 저가·고속) / mid=`claude-sonnet-4-6` / high=`claude-opus-4-8`. (`.env`로 오버라이드 가능)

설정: [`.env.example`](.env.example)를 `.env`로 복사 후 키 입력.

## M3 구현 현황 — Pedagogy Foundation + AUI 레지스트리 + 기록 에이전트

| 영역 | 위치 |
|---|---|
| Pedagogy Foundation(공유 L1 레이어 + 도메인 상수) | `src/ai/pedagogy.ts` |
| AUI 레지스트리 계약(타입 + 검증, 안티-환각 불변식) | `src/ui-registry/contracts.ts` |
| 레지스트리 렌더러(`agent JSON → 컴포넌트`) | `src/ui-registry/registry.tsx` |
| 결과 컴포넌트(5상태) | `RecordDraftCard` · `PlayStoryCard` · `ClarifyPromptCard` |
| 기록 에이전트(2모드, 자기수선) | `src/ai/agents/record.ts`, `src/ai/prompt-record.ts` |
| 기록 목(offline) | `server/gateway/mock.ts` |
| 라우터 결정 → 기록 생성 인라인 렌더 | `RouterTurnView`, `routerStore.runResult` |

### 핵심 보장
- **AUI 임의 HTML 금지**: 에이전트는 `{ type, props }` JSON만 출력 → 스키마 검증 → 레지스트리 컴포넌트 렌더(SKILL §4).
- **무근거 생성 금지**: 관찰 진술은 `source`(근거) 없이는 검증 실패. 근거 없으면 `ClarifyPrompt`로 보강 요청. 결과에 근거 출처 + 누리/표준 영역 연계 표시(CLAUDE.md 룰4, SKILL §3 룰5).
- **Pedagogy Foundation 상속**: 모든 Tier1 에이전트가 연령대(0-2 표준보육 / 3-5 누리)·발달 적합성·영역 매핑을 공유 레이어로 상속(직렬 검수 없음).
- **자율성 게이트**: 놀이기록 생성=L1 초안, 발송=L2 확인(`PlayStoryCard`), 외부 채널=L3.

## M4 구현 현황 — My Board 통합 캔버스 + Workflow Runner

| 영역 | 위치 |
|---|---|
| 보드 상태(노드·레인·뷰포트·선택, raw ops) | `src/store/boardStore.ts` |
| 명령(되돌리기 단위) — add/move/delete/duplicate/group/lock/edit | `src/board/commands.ts` |
| §6.1 단축키 → §6.2 히스토리 바인딩(포커스 분리) | `src/hooks/useKeyboardShortcuts.ts` |
| 캔버스(팬·줌·드래그박스·노드 드래그·그리드) | `src/components/board/BoardCanvas.tsx` |
| 좌측 툴바 / 가장자리 컨트롤(Fit·줌·추가·수업모드·undo/redo) | `BoardToolbar` · `BoardControls` |
| 프리미티브 렌더(메모·텍스트·도형·이미지, 인라인 편집) | `src/components/board/NodeView.tsx` |
| ★ Workflow Lane + Runner | `src/board/lanes.ts` · `src/components/board/LaneView.tsx` |

### 핵심
- **단축키 = 히스토리**: `⌘/Ctrl+Z`(실행취소)·`Shift+Z`/`Ctrl+Y`(다시실행)·`Delete`·전체선택·복제·그룹·잠금·줌·Fit·`Esc`·`Space+드래그` 팬. 모든 동작은 되돌리기 단위(command)로 기록되고, **입력/편집 포커스 중에는 보드 단축키를 가로채지 않음**. 모든 단축키에 마우스/버튼 경로 병존.
- **Workflow Lane(보드의 핵심, SKILL §9 / CLAUDE §3.1)**: 보드에서 하나를 요청하면 가로로 자라는 레인 생성 → 단계 노드(아이디어→활동사진→계획안→활동지)가 왼→오로 채워짐. **진행은 클릭으로만**(자동 전체 실행 금지), **선택이 다음 단계 입력**, Pedagogy Foundation 상속. ②활동 사진은 **AI 생성 개념 이미지**(실제 아동 사진 분리·"AI 생성" 라벨). 레인 저장 = 폴더 번들(스텁).
- **Workflow Runner**(새 에이전트 아님): 템플릿 순서대로 기존 에이전트/게이트웨이(`lane_step`)를 호출해 노드를 채움.
- 반응형: 넓은 화면=캔버스, 좁은 화면=태스크 리스트 폴백(R5).

## M5 구현 현황 — 우리반 모듈 + 캘린더 + 컨텍스트 연결

| 영역 | 위치 |
|---|---|
| 우리반 상태(반·아동·투약·출결·하원·동의) + 시드 | `src/store/classStore.ts` |
| 우리반 화면(반 선택·명부·상세) | `src/pages/OurClassPage.tsx` |
| 캘린더 상태/시드 | `src/store/calendarStore.ts` |
| 캘린더 화면(월뷰·일정·생성 트리거) | `src/pages/CalendarPage.tsx` |
| 우리반 → L3 테넌트 컨텍스트(마스킹) | `buildTenantContext()` · `maskName()` (classStore) |

### 핵심
- **우리반 = 1차 컨텍스트**(PRD §4.4, §8.1): 선택 반(연령대·누리/표준)·출석·선택 아동 특이사항을 `buildTenantContext()`가 **마스킹**해 라우터·기록 에이전트의 L3 레이어로 자동 동봉.
- **거버넌스**(§12): 테넌트 격리, 아동명 마스킹(성+O), `consent_flag` 미동의 사진은 파이프라인 제외.
- **캘린더 → 생성 트리거**: 일정의 "이 일정으로 만들기" → 라우터(문장 에이전트=가정통신문)로 라우팅 → 채팅에 결정 카드.

## M6 구현 현황 — 계획·스튜디오 에이전트 + 이미지 플러그인 + 폴더 번들

| 영역 | 위치 |
|---|---|
| 계획 에이전트(아이디어·WeeklyPlanGrid) | `src/ai/agents/plan.ts` |
| 스튜디오 에이전트(WorksheetCard·StudioGallery) | `src/ai/agents/studio.ts` |
| AUI 컴포넌트(WeeklyPlanGrid·WorksheetCard·StudioGallery) | `src/ui-registry/*` |
| 이미지 생성 플러그인(실연동 or 라벨 플레이스홀더) | `server/gateway/image.ts` |
| 레인 러너 → 전용 에이전트 호출 | `src/board/lanes.ts` |
| 폴더 번들 저장/렌더 | `src/store/folderStore.ts`, `src/pages/FolderPage.tsx` |

### 핵심
- **레인 단계 = 전용 에이전트**: 아이디어→계획(WeeklyPlanGrid)→활동지(WorksheetCard, `link_plan_id`로 계획 연결)→개념이미지(StudioGallery). 모두 Pedagogy Foundation + 우리반 컨텍스트 상속. **진행은 클릭으로만, 선택이 다음 단계 입력**.
- **이미지 플러그인**(§9.5): `GEMINI_API_KEY`+`KV_GEMINI_IMAGE_MODEL` 구성 시 실제 생성, 미구성 시 **"AI 생성" 라벨 플레이스홀더**. 실제 아동 사진과 분리.
- **폴더 번들**: 레인 저장 → 매니페스트(계획안+활동지+이미지+연결) 1건으로 폴더에 저장, 제목 하나로 재오픈. 활동지↔계획 연결 표시.
- **비용 캐스케이드**: 게이트웨이 티어 fallback(mid→high). 라우터 route_to plan/studio는 채팅에서 인라인 실행.

## M7 구현 현황 — 문장 에이전트 + 고위험 적합성 검증 + 자율성 게이트

| 영역 | 위치 |
|---|---|
| 문장 에이전트(통신문·공지·문장·평가서, 모드 추론) | `src/ai/agents/writing.ts` |
| 적합성 검증 패스(체크리스트 1회) | `writing.ts` `suitabilityCheck()` |
| AUI: LetterPreview(톤 토글·L2) · AssessmentReport(고위험·L3·검증 배지) | `src/ui-registry/*` |
| 라우터 route_to writing 인라인 | `routerStore` `INLINE_ROUTES` |

### 핵심
- **모드 추론**: 평가서→AssessmentReport / 통신문·공지·문장→LetterPreview.
- **고위험 적합성 검증**(PROMPTS §5): 발달평가서는 생성 후 **자동 체크리스트 패스 1회**(발달적합성·무근거 진술·영역연계·비낙인) → `통과/주의` 배지 + 지적 사항. 검증에서 근거 없는 진술을 자동 적발.
- **자율성 게이트**: 생성=**L1 초안** / 통신문·공지 발송=**L2 확인**(인라인) / 외부 채널·평가서 발송=**L3 휴먼게이트**(컴포넌트에서 잠금 표시).
- 우리반 컨텍스트(L3) 상속 — 통신문에 마스킹된 알레르기 안전 안내 자동 반영.

## M8 구현 현황 — 자가고도화 루프(편집 diff·메모리·RAG·distill)

| 영역 | 위치 |
|---|---|
| 학습 스토어(편집 diff·선호·exemplar·distill, 로컬 영속) | `src/store/learningStore.ts` |
| 결합 컨텍스트(우리반 + 학습) | `src/ai/context.ts` `buildAgentContext()` |
| 학습 신호 캡처(편집/채택) | `LetterPreview`·`RecordDraftCard` |
| 자가고도화 대시보드 | `src/pages/ProfilePage.tsx` |

### 핵심 (PRD §8)
- **편집 diff 피드백(최고 레버리지)**: 카드 편집·채택 시 before/after diff + 채택 신호 저장 → `distill()`이 **learned_json**(길이/톤/메모)·exemplar로 정제.
- **메모리 + RAG 주입**: `buildAgentContext()`가 우리반(테넌트) + 학습 선호 + 우수 산출물 예시를 모든 Tier1 생성에 L3로 주입 → "지난번엔 이렇게 쓰셨더라고요" 선반영.
- **체감(§8.3)**: 채택률·편집량 추이 대시보드, 채팅에 "지난 선호 반영" 힌트. **로컬 영속**으로 누적(새로고침 유지). distill 배치는 추후 GitHub Actions로 이전.

## M9 구현 현황 — 평가 하네스 + 거버넌스 마감 + 베타

| 영역 | 위치 |
|---|---|
| 골든셋(라우팅·계약 픽스처) | `src/eval/golden.ts` |
| 하네스 러너(회귀·라우팅정확도) | `src/eval/run.ts` |
| 평가/QA 페이지(`/eval`) | `src/pages/EvalPage.tsx` |
| 거버넌스 정책 레지스트리 | `src/lib/governance.ts` |
| 삭제 L3 게이트 | `FolderPage`(번들) · `OurClassPage`(아동) |

### 핵심
- **평가 하네스**(PRD §9, KPI §14): `/eval`에서 (1) **출력 계약 회귀검사**(결정적 — 무근거 관찰 거부 등 안티-환각 회귀 포함) (2) **라우팅 정확도**(라이브, KPI ≥90%).
- **거버넌스 마감**(§12): 영구 삭제=**L3 휴먼게이트**(확인), 정책 체크리스트(테넌트격리·동의·마스킹·무근거금지·고위험검증·발송게이트·삭제L3·공용학습금지·보존·법무)와 시행 지점.
- 검증: 회귀 10/10, 라우팅 정확도 **100%**.

---

## 전체 로드맵 완료 — M1~M9 ✅
4대 태스크 에이전트(기록·계획·스튜디오·문장) + 디자인 디렉터 + 라우터·게이트웨이 + AUI 레지스트리(8종) + 통합 보드·워크플로 레인·러너 + 우리반·캘린더·컨텍스트 + 이미지 플러그인·폴더 번들 + 고위험 적합성검증·자율성 게이트 + 자가고도화 폐루프 + 평가 하네스·거버넌스. 동작하는 수직 슬라이스.

남은 외부 작업(코드 외): 멀티테넌트 인증·실DB 격리(현재 `supabase/schema.sql` = `kv_store`·`kv-assets` 데모 anon 모델), distill 야간 배치(GitHub Actions), 사진 분류 API 실연동, 법무 검토.

## M10+ 추가 모듈 — 게임뷰어 v2 · 인터랙티브 노드 · 슬라이드 · 영상

| 영역 | 위치 | 비고 |
|---|---|---|
| **게임뷰어 v2**(놀이 만들기, iframe) | `src/game-viewer/v2/`, 엔트리 `game-viewer.html`→`viewer/main.tsx` | 단일 계약 `InteractiveDoc`(Zod), **인터랙션 11종**·이펙트 3종·확장활동 6종. 결정적 리졸버(`resolver/`) + 프로바이더(나노바나나 이미지·RMBG 누끼·SlimSAM 분할·CLOVA TTS). 보드 임베드 postMessage 계약. 플레이 화면 Milray 면제(파스텔 `theme.ts`). 옛 v1 `GameSpec`은 제거. |
| **인터랙티브 노드**(보드 네이티브) | `src/features/interactive-viewer/` | 계약 `InteractiveNode`. 동작엔진(액션·트리거·조건/체인)·노드 내부 다중 레인·확장 내부화·리졸버(레시피·테마팩·메커니즘). 게임뷰어 v2와 별개 시스템(`type:'interactive'` 카드). |
| **슬라이드 엔진** | `src/features/slides/`, 엔트리 `slides-viewer.html` | DeckSpec·다중 레이아웃·테마(`--s-*`, Milray 면제)·Recharts·PDF/PPTX 내보내기. |
| **영상 생성**(Veo) | `server/gateway/video.ts`, `/api/ai/video/{start,poll}` | Gemini Veo 비동기 2단계(과금 게이트·중복 가드, 서버가 mp4 변환·키 비노출). |

> 두 인터랙티브 시스템 구분: **게임뷰어 v2(A)** = 독립 iframe(`InteractiveDoc`), **인터랙티브 노드(B)** = 보드 카드(`InteractiveNode`). 스펙 문서 `docs/kinderverse-game-engine-spec-v0.2.md`·`docs/kinderverse-lane-infrastructure-spec-v1.0.md`는 **B 라인**을 다룬다.

### 후속 개선 (UX)
- **프롬프트바 중앙 정렬**: 메인 콘텐츠 영역 기준 가로 중앙(LNB·채팅 사이드패널 비킴). `AppShell` 메인 컬럼 내부 `absolute` + `promptBarLeftInset`.
- **멀티 보드**(`boardsStore` + `board/seed.ts` + `BoardSwitcher`): 즐겨찾기 카드 클릭 → 해당 콘텐츠에 **최적화 시드된 새 보드**(놀이계획=워크플로 레인, 그 외=맞춤 시작 카드)로 이동. 상단 탭으로 보드 전환(상태 보존), **보드 추가** 메뉴(빈 보드 + 5종). 세션 스코프.
- **보드 하이브리드**(참조 KinderVerse 모델): 프레임(뒤쪽 컨테이너) + 보드 네이티브 카드(이미지/메모/텍스트). 놀이계획 보드 = "새 놀이계획" 프레임 + 러너; 각 단계가 프레임 안에 카드를 생성(아이디어/계획안/활동지=메모, 이미지=실제 Gemini 이미지 카드). 모든 카드 선택·드래그·인라인 편집(스크롤 없이 내용에 맞춰 크기). `board/workflow.ts`, `frame`/`runner` 노드 타입.
- **보드에서 바로 생성**(`board/prompt.ts` `runBoardPrompt`): 대상을 선택하고 프롬프트바에 입력하면 **AI 채팅으로 이동하지 않고** 그 대상에 바로 생성 — 이미지 카드→`regenImageCard`(제자리 재생성), 메모/텍스트→`genTextCard`(제자리 재작성), 프레임→`generateIntoFrame`(이미지 키워드면 이미지 카드, 아니면 메모). AI 채팅은 프롬프트바 왼쪽 메시지 아이콘으로만.
- **프레임 그룹 이동 + 자동 확장**: 프레임을 드래그하면 그 위에 겹친 모든 카드가 함께 이동(`BoardCanvas.containedNodeIds`, 되돌리기 1단위). 프레임/워크플로로 생성 시 공간이 부족하면 프레임이 자동 확장(`workflow.ts` `placeInFrame`→`expandFrame`).
- **홈 = 추천 자료 갤러리 홈**(참조 KinderVerse 패리티): 중앙 정렬 인사("선생님, 오늘은 / 무엇을 만들어 볼까요?") + **가로 스크롤 추천 자료 갤러리**(10종 카드, 코랄 아이콘 타일, 드래그/휠→가로 스크롤 + 관성, 가장자리 페이드 마스크, 페이지 점=활성 코랄 알약) + **퀵 액션 알약 5개**(자료 갤러리·우리반·캘린더·자료 보관함·내 캔버스). 카드 클릭 → 프롬프트바에 해당 프롬프트 채움(바로 시작), 퀵 액션 → 라우트 이동. `src/pages/HomePage.tsx`, 전부 시맨틱 토큰(세리프 인사/그로테스크 본문, 색 하드코딩 0), 진입 페이드 애니메이션(`kv-home-in`/`kv-quick-in`, reduced-motion 안전).
- **AI 채팅 = 스트리밍 마크다운 채팅**(참조 KinderVerse 답변 스타일·UI/UX 패리티): 일반 질문은 **편집 디자인된 마크다운**(도입 → `##` 소제목 → **굵게** → 목록/표 → 마무리)으로 **토큰 단위 스트리밍** 응답. 사용자 말풍선(우측) + 코랄 스파클 아바타(좌측) + 작성 중 점 애니메이션 + **복사** 버튼 + 자동 스크롤. 서버 SSE는 `/api/ai/chat`(`server/gateway/chat.ts`, 키는 서버 전용: Anthropic=실시간 패스스루 / Gemini=완성 후 타자기 / 키 없음=데모). 클라이언트 파서·시스템프롬프트는 `src/ai/chat.ts`, 마크다운 렌더는 `src/components/ai/MarkdownMessage.tsx`(전부 시맨틱 토큰 — 세리프 제목/그로테스크 본문, 색 하드코딩 0). **라우터는 유지** — 프로즈 답변 아래 *맥락 액션*으로 표시(명확한 작업≥0.7 → "○○ 생성" 카드 → AUI / 모호하면 옵션 칩). `routerStore.send`가 스트림과 라우터를 병렬 실행.
