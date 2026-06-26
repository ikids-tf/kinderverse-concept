# KinderVerse 모듈 레퍼런스

> 개발자용 모듈 지도. 어디에 무엇이 있고 어떻게 확장하는지. 전체 흐름은 [`ARCHITECTURE.md`](./ARCHITECTURE.md), 엔드포인트·AUI 계약은 [`API_REFERENCE.md`](./API_REFERENCE.md), 시작 가이드는 [`ONBOARDING.md`](./ONBOARDING.md).

경로 별칭: `@/` → `src/`. 모든 export는 코드에서 검증된 실제 심볼이다.

---

## 1. 스토어 (`src/store/`)

도메인별 Zustand 스토어. 보드 상태(raw ops)와 되돌리기(Command)는 의도적으로 분리.

| 스토어 | export | 상태(주요) | 도메인 |
|---|---|---|---|
| `boardStore.ts` | `useBoardStore`, `BoardNode`, `Lane`, `LaneStep`, `BoardSnapshot`, `newId` | `nodes`, `order`, `lanes`, `selection`, `viewport`, `links`, `classroomMode`, `show`, `generating` | 보드 캔버스 raw ops (노드/레인/뷰포트) |
| `historyStore.ts` | `useHistoryStore`, `Command` | `past[]`, `future[]`, `limit`(100) | 되돌리기 Command 패턴 (`execute/push/undo/redo`) |
| `boardsStore.ts` | `useBoardsStore`, `BoardMeta`, `BoardKind` | `boards[]`, `snapshots`, `activeId` | 멀티보드 (create/switch/save/remove) |
| `routerStore.ts` | `useRouterStore`, `RouterTurn`, `INLINE_ROUTES`, `isImageRequest` | `turns[]` | AI 채팅 턴 + 병렬 라우터 + 인라인 Tier1 |
| `classStore.ts` | `useClassStore`, `Child`, `ClassRoom`, `maskName`, `buildTenantContext` | `classes`, `children`, `selectedClassId` | 우리반 (테넌트 컨텍스트·동의 게이팅) |
| `calendarStore.ts` | `useCalendarStore`, `CalEvent`, `EVENT_COLOR` | `events[]` | 일정 → 생성 트리거 |
| `folderStore.ts` | `useFolderStore`, `Bundle`, `SavedFolder`, `bundleFromLane`, `bundleFromFrame` | `bundles[]`, `saved[]` | 출력 번들 + 폴더 트리 (IndexedDB+클라우드 미러) |
| `learningStore.ts` | `useLearningStore`, `EditEvent`, `Exemplar`, `buildLearnedContext` | `events[]`, `prefs`, `exemplars[]` | 자가고도화 (편집 diff → distill → RAG 주입) |
| `uiStore.ts` | `useUIStore`, `VideoComposeCtx` | `promptBarCollapsed`, `favoritesOpen`, `promptDraft`, `availableActions`, `gameViewerFsNodeId`, `inodeFsDocId` | 프롬프트바 셸 + 풀스크린 컨텍스트 라우팅 |
| `trayStore.ts` | `useTrayStore`, `TrayItem` | `items[]` | 갤러리→보드 임시 트레이 (비영속) |
| `formatChoiceStore.ts` | `useFormatChoiceStore`, `FormatChoice`, `MODE_CHOICES` | `pending` | 포맷 선택 오버레이 (list/mindmap/plan/package) |
| `promptChoiceStore.ts` | `usePromptChoiceStore`, `ReqIntent`, `PromptChoice` | `pending` | 선택≠의도 불일치 다이얼로그 |

**컨텍스트 헬퍼**: `buildTenantContext()`(classStore)와 `buildLearnedContext()`(learningStore)는 `src/ai/context.ts`의 `buildAgentContext()`가 합쳐 모든 Tier1 생성의 L3 레이어로 주입한다.

---

## 2. AI 계층 (`src/ai/`)

### 핵심 인프라
| 파일 | export | 책임 |
|---|---|---|
| `client.ts` | `callGateway(req)`, `GATEWAY_ENDPOINT` | 브라우저→서버 게이트웨이 클라이언트 (키 미노출) |
| `contract.ts` | `RouterOutput`, `RouterInput`, `validateRouterOutput`, `CONFIDENCE_THRESHOLD`(0.7), `SUGGESTION_HIDE_BELOW`(0.6) | 라우터 출력 스키마 + 의존성 없는 검증·자기수선 |
| `prompt.ts` | `buildRouterPrompt(input, tenantContext?)`, `AssembledPrompt` | 라우터 4계층 프롬프트(L0~L3) |
| `prompt-record.ts` | `buildRecordPrompt(input, tenantContext?)`, `RecordInput` | 기록 에이전트 프롬프트(observation/story) |
| `pedagogy.ts` | `PEDAGOGY_FOUNDATION`, `NURI_AREAS`, `STANDARD_AREAS`, `curriculumForAge`, `areasFor` | 공유 L1 레이어 + 영역 상수 |
| `context.ts` | `buildAgentContext(task?)` | L3 = 테넌트 + 학습 선호 결합 |
| `actions.ts` | `PAGE_ACTIONS`, `actionsForPath`, `pathForRoute`, `ROUTE_LABEL` | 페이지별 액션 화이트리스트 + route→랜딩 경로 |
| `chat.ts` | `streamChat`, `buildChatSystem`, `ChatMsg`, `CHAT_ENDPOINT` | 스트리밍 대화 + SSE 파서 |
| `json.ts` | `extractJson(text)` | 관용적 JSON 추출(펜스/접두사 처리) |
| `intent-lexicon.ts` | `ContentIntent`, `INTENT_RE`, `VIDEO_RE`, `isBehaviorConsult` | 단일 의도 어휘 소스(라우터/컴포저/목 공유) |
| `layers.ts` | `separateImageLayers(imageUrl)` | 브라우저 측 레이어 분리(detect 태스크 + canvas) |
| `gateway/types.ts` | `GatewayRequest`, `GatewayResponse`, `Tier`, `Provider`, `DetectedRegion` | 와이어 타입 |

### Tier1 에이전트 (`src/ai/agents/`)
공통 패턴: `callGateway()`로 JSON 출력 → `validate*()` → 실패 시 1회 자기수선 → 폴백.

| 에이전트 | 진입 함수 | 티어(기본→fallback) | 출력 계약 |
|---|---|---|---|
| `router.ts` | `runRouter(input, tenantContext?)` | low → mid | `RouterOutput` |
| `record.ts` | `runRecord(input, tenantContext?)` | mid → high | `RecordDraftCard` / `PlayStoryCard` / `ClarifyPrompt` |
| `plan.ts` | `runPlan(request, selected, ctx?, opts?)`, `runPlanIdeas`, `runMindMapActivities` | mid → high | `WeeklyPlanGrid` (계획 `id` 스탬프) |
| `studio.ts` | `runStudioWorksheet(...)`, `planStudioImages`, `runStudioImages`, `renderStudioImage`, `buildVeoPrompt` | low(프롬프트)/mid(콘텐츠) | `WorksheetCard` (`link_plan_id`) / `StudioGallery` |
| `writing.ts` | `runWriting(text, ctx?)`, `suitabilityCheck` | mid → high | `LetterPreview` / `AssessmentReport`(+적합성 검증) |
| `design.ts` | `runDesignDirector(input)` | low → mid | `DesignSpec` (variant/stickers, 규칙 폴백) |

> 새 에이전트 추가 시: 출력 계약을 `src/ui-registry`에 컴포넌트로 등록(§4)하고, `validateRegistryPayload`에 `type`을 추가하며, 라우터의 `route_to`/`INLINE_ROUTES`(routerStore)에 연결한다.

---

## 3. 보드 (`src/board/`)

| 파일 | export | 책임 |
|---|---|---|
| `commands.ts` | `addNodeCmd`, `addFrameCmd`, `addPresetNodeCmd`, `addPrimitivesRowCmd`, `wrapSelectionInFrameCmd`, `moveNodesCmd`, `deleteNodesCmd` 외 다수 | 되돌리기 가능한 L1 명령 팩토리 (`{id,label,do,undo}` + `history().execute()`) |
| `lanes.ts` | `createLane(template, request, x, y)`, `runLaneStep(laneId, stepId)`, `LANE_TEMPLATES` | Workflow Lane/Runner — 템플릿 순서대로 전용 Tier1 에이전트 호출 |
| `workflow.ts` | `seedWorkflowFrame`, `placeInFrame`, `spawnTextCard`, `spawnHeaderCard`, `spawnImageCard`, `generateIntoFrame`, `regenImageCard`, `genTextCard`, `RunnerStep` | 프레임+러너 모델 — 보드 네이티브 카드 생성·자동 확장 |
| `prompt.ts` | `handleBoardPrompt(text)`, `runFormatChoice`, `startInteractiveGame`, `spawnSavedGameOnBoard` | PromptBar 진입점 — 의도 감지 후 생성/오버레이/다이얼로그 라우팅 |
| `seed.ts` | `seedSnapshot(kind)`, `KIND_LABEL`, `kindFromFavorite` | 보드 종류별 초기 시드(play_plan/observation/studio/writing/general) |

**Workflow Runner 동작**: `createLane()`이 4단계(아이디어→이미지→계획→활동지)를 pending으로 생성 → 교사가 단계 클릭 → `runLaneStep()`이 해당 단계의 전용 에이전트(`runPlanIdeas`/`runStudioImages`/`runPlan`/`runStudioWorksheet`)를 호출, 이전 단계 선택을 다음 입력으로 전달. **자동 전체 실행 없음.**

---

## 4. AUI 레지스트리 (`src/ui-registry/`)

| 파일 | 책임 |
|---|---|
| `contracts.ts` | `validateRegistryPayload(raw)` — `type` 화이트리스트·필수 props·근거(`source`) 비공백 강제 |
| `registry.tsx` | `RegistryRenderer` — `payload.type` → React 컴포넌트 매핑 |
| `state.ts` | `ComponentState` = `loading\|streaming\|ready\|editing\|error` |
| `parts.tsx` | 공용 파트(배지·헤더 등) |
| `worksheet-sheet.tsx`, `worksheet-a4.ts` | 활동지 A4 인쇄 레이아웃 |
| 8개 카드 컴포넌트 | `RecordDraftCard` · `PlayStoryCard` · `ClarifyPromptCard` · `WeeklyPlanGrid` · `WorksheetCard` · `StudioGallery` · `LetterPreview` · `AssessmentReport` |

각 카드의 props 스키마는 [`API_REFERENCE.md` §2](./API_REFERENCE.md#2-aui-출력-계약-ui-레지스트리) 참조.

---

## 5. game-viewer (`src/game-viewer/v2/`)

iframe(`/game-viewer.html`)으로 임베드되는 자기완결 React 런타임. 아이 대면 파스텔 테마(`theme.ts`), Milray 미적용.

### 계약 & 파싱 (`schema/`)
| 파일 | export | 책임 |
|---|---|---|
| `interactiveDoc.ts` | `InteractiveDoc`, `SceneNode`, `Interaction`, `Effect`, `ExtendActivity`, `ContentBinding`, `AssetRef`, `SCHEMA_VERSION` | 단일 계약 (Zod + superRefine 시맨틱 검증) |
| `parse.ts` | `parseInteractiveDoc`, `safeParseInteractiveDoc`, `assertDocIntegrity`, `collectWarnings` | 검증·경고 수집 |
| `examples.ts` | FIXTURES | 테스트/참조 |

**InteractiveDoc 구조**: `{ schemaVersion, meta, settings, stage{nodes[]}, interaction(1종), effects[], extend[], rewards }`.
- **인터랙션 11종**: `tap-the-right-one`, `match-pair`, `binary-choice`, `connect`, `flip-memory`, `combine`, `categorize`, `order-sequence`, `find-it`, `sequence-tap`, `pattern-next`.
- **이펙트 3종**: `reveal`, `responsive-state`, `goal-state`.
- **확장 활동 6종**: `discuss`, `story`, `name-create`, `connect-apply`, `move-express`, `watch-video`.

### 런타임 (`runtime/`)
| 파일 | export | 책임 |
|---|---|---|
| `useGame.ts` | `useGame`, `GameStore`, `Phase` | Zustand 게임 상태 (zundo undo, limit 100). 모든 인터랙션 액션(tap/matchTap/answerBinary/...) + 편집 액션 |
| `useBoardBridge.ts` | `useBoardBridge`, `isEmbedded`, `useChromeVisible` | iframe↔부모 메시징 |
| `GameStage.tsx` / `NodeRenderer.tsx` / `StageBackground.tsx` | — | 캔버스 + 노드 렌더 + 배경 |
| `interactions/*.tsx` | `TapTheRightOne`, `MatchPair`, `BinaryChoice`, `FlipMemory`, `OrderSequence`, `Categorize`, `PatternNext`, `FindIt`, `SequenceTap`, `CombineGame` | 인터랙션별 컴포넌트 |
| `editor/EditLayer.tsx` | — | 직접 레이아웃 편집(드래그/리사이즈/크롭/인라인 텍스트, 릴리즈 시 1 undo) |
| `tts.ts` | `say`, `stopSay` | TtsProvider 싱글톤 |

### 생성·리졸버·프로바이더
| 파일 | export | 책임 |
|---|---|---|
| `generate/orchestrator.ts` | `generateGame(prompt, opts)` | 리졸버 추천 → 게임 문서 렌더 |
| `resolver/resolver.ts` | `recommend`, `parseIntent`, `recommendFromPrompt(AI)`, `Archetype` | **결정적** 게임 조립(LLM 불필요) + 아키타입 어셈블러 |
| `resolver/contentSets.ts` | `CATEGORIES`, `SEQUENCES` | 콘텐츠 세트(동물/식물/탈것, 순서) |
| `providers/nanoBanana.ts` | `NanoBananaImageProvider`, `setImageStyle` | 이미지 = `callGateway({task:'image'})` |
| `providers/cutoutAdapter.ts` | `RmbgCutoutProvider` | `@/shared/background-removal` (RMBG) |
| `providers/segmentAdapter.ts` | `SamObjectSegmenter` | `@/shared/segment` (SlimSAM) |
| `providers/providers.ts` | `ImageProvider`, `CutoutProvider`, `ObjectSegmenter`, `TtsProvider`, `assertNotChildMedia`, `create*` 팩토리 | 프로바이더 계약 + **아동 미디어 가드** |

### 임베드 계약 (7개 불변점)
1. iframe URL `/game-viewer.html` (동일 출처)
2. 보드 카드가 iframe 생성
3. 부모→자식: `kv-game-create {prompt, seedImages?}`, `kv-game-add-image {src, label}`
4. 자식→부모: `kv-game-ready`, `kv-game-progress {active, step}`, `kv-game-mode {playing}`
5. `iframe.contentWindow.kvSetChrome(bool)` — 교사 툴바 표시 토글
6. 보드·뷰어가 동일 Supabase Storage 자산 공유
7. "놀이 만들기" 프리셋이 뷰어 카드 생성(첫 `kv-game-create` 대기)

진입: `game-viewer.html` → `viewer/main.tsx` (`createRoot(#kv-game-root)` → `v2/App`).

---

## 6. 온디바이스 공유 모듈 (`src/shared/`)

아동 사진/영상은 외부 미전송 — WASM 워커로 온디바이스 처리.

| 모듈 | export | 책임 |
|---|---|---|
| `background-removal/` | `removeBackground(input, opts)`, `cleanupBackground`, `warmupBackgroundRemoval`, `pickTier` | BRIA RMBG-1.4 (q8 WASM) 배경 제거 + 형태학 정리/홀필 |
| `segment/` | `prepareSegment(id, blob)`, `segmentAt(id, x, y)`, `segmentAtPoints`, `warmupSegment` | SlimSAM (transformers.js 워커) 클릭 분할 |
| `inpaint/` | `inpaintPatch(canvas, mask, w, h)` | PatchMatch 멀티스케일 인페인팅(텍스처 보존) |

**안전 티어**(`removeBackground`): `child-photo`/`child-video` → 항상 온디바이스. `generated`/`object` → 서버 티어 허용(현재 `SERVER_ENABLED=false`).

---

## 7. 피처 (`src/features/`)

### `slides/`
슬라이드 덱: `schema/`(프레임·전환·노트), `viewer/`(인라인+풀스크린), `engine/`(재생), `agent/`(계획/콘텐츠→덱 생성), `assets/`. 엔트리 `slides-viewer.html`. **슬라이드 콘텐츠는 Milray 면제**(전문 테마 `themes.css` `--s-*` 허용), 앱 크롬은 Milray 유지.

### `interactive-viewer/`
보드 네이티브 인터랙티브/게임 노드 저작.
- `store/` → `useInteractiveStore` (`ensure`, `peek`, `mutate`, `undo`, `redo`, `loadInteractiveNode`, `saveInteractiveNode`, `newDocId`, `listInteractiveNodes`). docId별 캐시 + 문서별 undo + localStorage/클라우드 미러.
- `resolver/` → 리졸버 파이프라인(`resolveIntent` → `selectRecipe` → `designGame` → `ensurePrompts` → `assembleAndPlace`).
- `runtime/`·`authoring/`·`inspector/`·`node/` → 렌더·편집·속성·보드 통합.

흐름: 프롬프트 "○○ 게임" → `createInteractiveGame()` → `addPresetNodeCmd('interactive', { data.docId })` → `useInteractiveStore.ensure(docId)` → `runDesignGame()` → 보드 카드 인라인 렌더. 풀스크린 편집은 `uiStore.inodeFsDocId`로 프롬프트 입력을 해당 문서로 라우팅.

---

## 8. 컴포넌트 & 페이지

### 셸 컴포넌트 (`src/components/`)
| 컴포넌트 | export | 책임 |
|---|---|---|
| `AppShell.tsx` | `AppShell` | 레이아웃 셸. LNB+Outlet+PromptBar+토스트+오버레이. 페이지 액션 등록, 프롬프트바 가시성 관리 |
| `PromptBar.tsx` | `PromptBar` 외 | 전 페이지 상주 입력 셸(SKILL §7 4동작). AI 채팅(routerStore) ↔ My Board(`handleBoardPrompt`) 동적 라우팅. 풀스크린 컨텍스트 라우팅 |
| `LNB.tsx` | `LNB`, `BottomTabs` | 좌측 레일(넓음)/하단 탭(좁음) — container query |
| `FavoriteCardRail.tsx` | `FavoriteCardRail` | 즐겨찾기 카드 레일(보드 종류별 → 새 보드 생성) |
| `ai/RouterTurnView.tsx` | — | 채팅 턴: 사용자 말풍선 + 스트리밍 마크다운 답변 + 맥락 액션(라우트 카드/명확화 칩) |
| `ai/MarkdownMessage.tsx` | — | 편집 디자인 마크다운 렌더(전부 Milray 토큰) |
| `board/*` | `BoardCanvas`, `NodeView`, `LaneView`, `BoardToolbar`, `BoardControls`, `BoardTray`, `BoardSwitcher`, `BoardMinimap`, `PromptChoiceDialog`, `ImageEditorModal` 외 | 캔버스·노드·레인·툴바·미니맵 등 |

### 페이지 (`src/pages/`)
`HomePage`(추천 갤러리 홈) · `MyBoardPage`(보드 캔버스) · `AIChatPage`(채팅) · `OurClassPage`(우리반) · `CalendarPage`(캘린더) · `FolderPage`(자료 보관) · `GalleryPage`(자료 갤러리) · `ProfilePage`(자가고도화 대시보드) · `EvalPage`(평가 하네스 `/eval`) · `TokensDemoPage`(`/tokens` 토큰 데모).

---

## 9. 확장 레시피

- **새 결과 유형(AUI) 추가** → ① `src/ui-registry/<Name>.tsx` 5상태 컴포넌트 ② `registry.tsx`에 매핑 ③ `contracts.ts`에 `type`+필수 props ④ 생성 에이전트가 해당 JSON 출력. (DoD: 컴포넌트 ↔ 스키마 1:1)
- **새 Tier1 에이전트 추가** → `src/ai/agents/<name>.ts`(4계층 프롬프트 + `callGateway` + 검증) → 라우터 `route_to` + `routerStore.INLINE_ROUTES` 연결.
- **새 보드 명령** → `src/board/commands.ts`에 `{id,label,do,undo}` 팩토리 추가 → 단축키는 `src/hooks/useKeyboardShortcuts.ts`(포커스 분리 유지).
- **새 게임 인터랙션** → `interactiveDoc.ts` 스키마에 `kind` 추가 → `runtime/interactions/`에 컴포넌트 → `resolver`에 어셈블러.
- **새 프로바이더 태스크** → `server/gateway/handler.ts` 분기 + `mock.ts` 폴백 + `vite-plugins/devGateway.ts` 라우트.
