# KinderVerse 아키텍처 개요

> 코드에서 도출한 시스템 구조 문서. 제품 정의는 [`CLAUDE.md`](../CLAUDE.md), 기획은 [`PRD.md`](./PRD.md), 도메인/에이전트 지식은 [`.claude/skills/kinderverse/SKILL.md`](../.claude/skills/kinderverse/SKILL.md), 개발 시작은 [`ONBOARDING.md`](./ONBOARDING.md), 세부 모듈/API는 [`MODULE_REFERENCE.md`](./MODULE_REFERENCE.md)·[`API_REFERENCE.md`](./API_REFERENCE.md).

---

## 1. 한눈에 보는 시스템

KinderVerse는 **단일 SPA + 얇은 서버 게이트웨이** 구조다. 브라우저는 프로바이더 키를 절대 보지 않고, 모든 AI 호출은 동일 계약(`POST /api/ai/run`, `POST /api/ai/chat`)으로 서버를 거친다. 키가 없으면 게이트웨이가 **오프라인 목(mock)** 으로 폴백하므로 앱 전체가 키 없이도 동작한다.

```mermaid
graph TB
    subgraph Browser["브라우저 (React 18 + Vite SPA)"]
        Shell["AppShell · LNB · PromptBar<br/>(Milray Park 토큰)"]
        Pages["Pages (Home/Board/Chat/Class/Calendar/Folder/...)"]
        Board["My Board 캔버스 + Workflow Lane/Runner"]
        AIClient["AI 클라이언트 계층<br/>src/ai/* · agents/*"]
        Registry["AUI 레지스트리<br/>JSON → 컴포넌트 렌더"]
        Stores["Zustand 스토어 (12+)"]
        GV["game-viewer v2 (iframe)"]
        Slides["slides / interactive-viewer 피처"]
    end

    subgraph Edge["서버 게이트웨이 (Vercel 함수 / Vite dev 미들웨어)"]
        Run["/api/ai/run<br/>handleGatewayRequest"]
        Chat["/api/ai/chat<br/>streamChatResponse (SSE)"]
        Aux["/api/* 보조<br/>unfurl · youtube · lessons · video"]
    end

    subgraph Providers["외부 프로바이더 (직접 fetch, SDK·프레임워크 없음)"]
        Anthropic["Anthropic<br/>haiku/sonnet/opus"]
        Gemini["Gemini<br/>flash/pro · 이미지 · Veo"]
        Clova["CLOVA Voice (TTS)"]
        Mock["오프라인 목 폴백"]
    end

    subgraph Data["데이터/온디바이스"]
        Supabase["Supabase<br/>kv_store · kv-assets"]
        Local["localStorage / IndexedDB"]
        WASM["온디바이스 모델<br/>RMBG · SlimSAM (child media)"]
    end

    Pages --> Stores
    Board --> Stores
    AIClient --> Run
    Registry --> AIClient
    Shell --> AIClient
    GV --> Run
    Slides --> Run
    Run --> Anthropic
    Run --> Gemini
    Run --> Clova
    Run --> Mock
    Chat --> Anthropic
    Chat --> Gemini
    Chat --> Mock
    Stores --> Local
    Stores --> Supabase
    GV --> WASM
```

**핵심 원칙 (CLAUDE.md 하드 룰에서 직접 도출)**
- **키는 서버에만.** 클라이언트는 `callGateway()`로만 모델에 접근(`src/ai/client.ts`).
- **AUI는 임의 HTML 금지.** 에이전트는 `{ type, props }` JSON만 출력 → 검증 → 레지스트리 컴포넌트 렌더.
- **무근거 생성 금지.** 관찰/평가는 `source`(근거) 없이는 검증 실패.
- **아동 미디어 격리.** `child-photo`/`child-video`는 외부 API 미전송, 온디바이스(WASM)에서만 처리.
- **프레임워크 금지.** LangChain/CrewAI 없이 직접 `fetch`.

---

## 2. 계층 구조

```mermaid
graph LR
    subgraph L0["라우팅 (Tier 0)"]
        Router["router.ts<br/>의도분류·확신도 게이팅<br/>(low 티어, 콘텐츠 생성 안 함)"]
    end
    subgraph L1["전문 에이전트 (Tier 1)"]
        Rec["record.ts<br/>관찰/놀이이야기"]
        Plan["plan.ts<br/>아이디어/주간계획"]
        Studio["studio.ts<br/>활동지/이미지"]
        Write["writing.ts<br/>통신문/평가서"]
        Design["design.ts<br/>레이아웃 디렉터"]
    end
    subgraph Shared["공유 레이어"]
        Ped["pedagogy.ts<br/>Pedagogy Foundation (L1 프롬프트)"]
        Ctx["context.ts<br/>테넌트+학습 컨텍스트 (L3)"]
    end
    subgraph L2["도구 (Tier 2)"]
        GW["server/gateway/*<br/>이미지·비전·TTS·검색"]
    end

    Router --> Rec
    Router --> Plan
    Router --> Studio
    Router --> Write
    Rec --> Ped
    Plan --> Ped
    Studio --> Ped
    Write --> Ped
    Rec --> Ctx
    Plan --> Ctx
    Studio --> Ctx
    Write --> Ctx
    Rec --> GW
    Plan --> GW
    Studio --> GW
    Write --> GW
    Router --> GW
```

| 계층 | 책임 | 모델 티어 | 위치 |
|---|---|---|---|
| **Tier 0 라우터** | 의도분류·슬롯추출·라우팅·확신도. 콘텐츠 생성 안 함 | low (`claude-haiku-4-5`) | `src/ai/agents/router.ts` |
| **Tier 1 에이전트** | 기록·계획·스튜디오·문장. Pedagogy Foundation 상속 | mid→high fallback | `src/ai/agents/{record,plan,studio,writing,design}.ts` |
| **Tier 2 도구** | 이미지/비디오 생성, 비전, TTS, 검색 | 프로바이더별 | `server/gateway/*` |
| **공유 레이어** | 유아교육 적합성·테넌트·학습 선호 주입 | — | `src/ai/pedagogy.ts`, `src/ai/context.ts` |

**4계층 프롬프트 조립**: 모든 에이전트의 시스템 프롬프트는 `L0(헌장) + L1(PEDAGOGY_FOUNDATION) + L2(태스크 스키마) + L3(테넌트/학습 컨텍스트)`로 조립된다(`src/ai/prompt.ts`, `prompt-record.ts`).

---

## 3. AI 요청 데이터 흐름

프롬프트바 제출부터 검증된 AUI 렌더까지의 단대단 흐름이다.

```mermaid
sequenceDiagram
    participant T as 교사 PromptBar
    participant RS as routerStore.send
    participant R as runRouter Tier0
    participant C as callGateway
    participant GW as handleGatewayRequest
    participant P as 프로바이더
    participant A as Tier1 에이전트 studio
    participant V as validateRegistryPayload
    participant UI as RegistryRenderer

    T->>RS: send({ text, page, selection, available_actions })
    par 병렬
        RS->>C: streamChat() (편집 마크다운 답변 SSE)
    and
        RS->>R: runRouter(input, tenantContext)
    end
    R->>C: callGateway(task:'router', tier:'low', json)
    C->>GW: POST /api/ai/run
    GW->>P: anthropicComplete / 목 폴백
    P-->>GW: text (RouterOutput JSON)
    GW-->>C: GatewayResponse
    C-->>R: text
    R->>R: extractJson → validateRouterOutput<br/>(confidence<0.7 → route_to=null, 명확화)
    R-->>RS: RouterOutput { route_to, confidence, ... }
    Note over RS: route_to ∈ INLINE_ROUTES 면 인라인 실행
    RS->>A: runResult(turnId) → runStudioWorksheet(...)
    A->>C: callGateway(task:'studio', tier:'mid', json)
    C->>GW: POST /api/ai/run
    GW->>P: 콘텐츠 생성 + (task:'image') 이미지
    P-->>A: WorksheetCard JSON + image_url
    A->>V: validateRegistryPayload (1회 자기수선)
    V-->>UI: RegistryPayload { type, props }
    UI->>T: 5상태 카드 렌더 (loading/streaming/ready/editing/error)
```

**검증·자기수선·안티-환각**
- `extractJson()` (관용적 JSON 추출) → `validateRouterOutput()` / `validateRegistryPayload()` (의존성 없는 손수 검증).
- 스키마 위반 시 **에러 메시지를 붙여 1회 재호출**(자기수선). 그래도 실패하면 `ClarifyPrompt`로 폴백.
- **라우터 룰 4**: `confidence < 0.7` → 라우팅 대신 명확화 질문(`CONFIDENCE_THRESHOLD = 0.7`).
- **근거 강제**: `RecordDraftCard`의 모든 `observations[].source`는 비어 있을 수 없음(사진 ID/교사 메모 인용).
- **고위험 검증**: `AssessmentReport`는 생성 후 자동 적합성 체크 1회(`suitabilityCheck()`).

---

## 4. 프로바이더 게이트웨이

```mermaid
graph TB
    Req["GatewayRequest<br/>{ task, tier, provider, fallback, messages, ... }"]
    Req --> H{handleGatewayRequest}
    H -->|"task: image/edit"| Img["generateImage / editImage<br/>(Gemini)"]
    H -->|"task: detect/vision"| Vis["detectImageElements / askImage<br/>(Gemini 비전)"]
    H -->|"task: tts"| TTS["synthSpeech (CLOVA Voice)"]
    H -->|"task: search"| Srch["geminiSearch (Google Search 툴)"]
    H -->|"키 없음"| Mock["mockRouterOutput / mockAgentStep ..."]
    H -->|"텍스트 태스크"| Cascade{"티어 캐스케이드<br/>primary → fallback[]"}
    Cascade --> Anth["anthropicComplete<br/>low/mid/high"]
    Cascade --> Gem["geminiComplete<br/>flash/pro"]
    Resp["GatewayResponse<br/>{ ok, text/image/audio/regions, provider, model, mocked, usage }"]
    Img --> Resp
    Vis --> Resp
    TTS --> Resp
    Srch --> Resp
    Mock --> Resp
    Anth --> Resp
    Gem --> Resp
```

| 티어 | Anthropic | Gemini | 용도 |
|---|---|---|---|
| **low** | `claude-haiku-4-5` | `gemini-2.5-flash` | 라우터·Veo 프롬프트·디자인 |
| **mid** | `claude-sonnet-4-6` | `gemini-2.5-flash` | Tier1 에이전트(record/plan/studio/writing) |
| **high** | `claude-opus-4-8` | `gemini-2.5-pro` | 복잡 작업 fallback |

- 프로바이더 우선순위: `auto` → Anthropic(헌장 기본) → Gemini.
- 모든 모델 ID는 `.env`로 오버라이드 가능(`KV_ANTHROPIC_MODEL_*`, `KV_GEMINI_MODEL_*`).
- 게이트웨이 구현: `server/gateway/handler.ts`, 어댑터: `server/gateway/providers.ts`, 목: `server/gateway/mock.ts`.
- 개발 환경에서는 `vite-plugins/devGateway.ts`가 Vercel 함수와 **동일 계약**으로 엔드포인트를 마운트한다.

---

## 5. 보드 + Workflow Lane

My Board는 KinderVerse의 핵심 창작 표면이다. 보드 상태(raw ops)는 `boardStore`에, 되돌리기 단위(Command)는 `historyStore`에 분리된다.

```mermaid
graph TB
    PB["PromptBar 입력"] -->|"My Board 페이지"| HBP["handleBoardPrompt(text)<br/>의도 감지 + 선택 분석"]
    HBP -->|"이미지"| Img["composeFromPrompt → callGateway(task:'image')"]
    HBP -->|"활동지/계획/영상/게임"| Spec["전용 핸들러"]
    HBP -->|"아이디어/계획 + 포맷 미정"| FC["formatChoiceStore.open()<br/>(list/mindmap/plan/package)"]
    HBP -->|"선택≠의도"| PC["promptChoiceStore.open()<br/>(불일치 다이얼로그)"]
    HBP -->|"단순 추가"| Prim["addPrimitivesRowCmd()"]

    subgraph Cmd["명령 + 히스토리"]
        Factory["commands.ts 팩토리<br/>addNodeCmd · addFrameCmd ..."]
        Exec["history().execute(cmd)"]
    end
    Img --> Factory
    Spec --> Factory
    Prim --> Factory
    Factory --> Exec
    Exec --> BS["boardStore<br/>nodes / order / lanes / viewport"]
    BS --> Canvas["BoardCanvas 재렌더<br/>NodeView · LaneView · 링크 · 선택"]

    subgraph Lane["Workflow Lane/Runner"]
        CL["createLane(template) → 4단계(아이디어→이미지→계획→활동지)"]
        RLS["runLaneStep() → 전용 Tier1 에이전트 호출 (템플릿 순서)"]
    end
    CL --> RLS --> Factory
```

- **Workflow Runner는 새 에이전트가 아니다.** 템플릿 순서대로 기존 Tier1 에이전트(plan, studio)를 호출하고, **진행은 교사 클릭으로만**, **선택이 다음 단계 입력**이 된다(`src/board/lanes.ts`).
- **프레임+러너 모델**(`src/board/workflow.ts`): "새 놀이계획" 프레임이 보드 네이티브 카드를 생성·자동 확장. 모든 카드는 선택·드래그·인라인 편집 가능.
- **자율성 게이트**: L1(초안·레이아웃)=자동, L2(통신문·공지)=확인, L3(외부 발송·영구 삭제)=휴먼게이트(되돌리기 스택에 안 들어감).

---

## 6. game-viewer (자기완결 모듈)

게임 뷰어는 보드에 **iframe(`/game-viewer.html`)** 으로 임베드되는 독립 React 런타임이다. 아이 대면 파스텔 테마(`v2/theme.ts`)를 쓰며 Milray Park 토큰을 적용하지 않는다(면제 대상).

```mermaid
graph TB
    Board["My Board 카드"] -->|"iframe /game-viewer.html"| Entry["viewer/main.tsx<br/>createRoot(#kv-game-root)"]
    Entry --> App["v2/App.tsx (테마 CSS 주입)"]
    App --> Stage["GameStage (플레이 + 인라인 편집)"]

    subgraph Contract["단일 계약"]
        Doc["schema/interactiveDoc.ts<br/>InteractiveDoc (Zod)"]
        Parse["parse.ts<br/>parseInteractiveDoc · assertDocIntegrity"]
    end
    subgraph Runtime["런타임"]
        Game["useGame (Zustand + zundo undo)"]
        Inter["인터랙션 11종 컴포넌트"]
        Edit["editor/EditLayer (직접 레이아웃 편집)"]
    end
    subgraph Gen["생성/리졸버"]
        Orch["generate/orchestrator.ts"]
        Resolve["resolver/resolver.ts<br/>(결정적 게임 조립, LLM 불필요)"]
    end
    subgraph Prov["프로바이더 어댑터"]
        Nano["nanoBanana (이미지 = @/ai/client task:image)"]
        Cut["cutoutAdapter (@/shared/background-removal · RMBG)"]
        Seg["segmentAdapter (@/shared/segment · SlimSAM)"]
        Tts["TtsProvider (CLOVA / 브라우저 폴백)"]
    end

    Stage --> Game
    Game --> Doc
    Doc --> Parse
    Stage --> Inter
    Stage --> Edit
    Orch --> Resolve
    Resolve --> Doc
    Stage --> Nano
    Stage --> Cut
    Stage --> Seg
    Stage --> Tts
    WASM["WASM 워커"]
    Cut -.->|"child-photo 온디바이스만"| WASM
    Seg -.->|"child-photo 온디바이스만"| WASM

    Board <-->|"postMessage<br/>kv-game-create/progress/mode"| Entry
```

- **단일 계약**: 생성·편집·런타임 모두 `InteractiveDoc` 하나에 의존. 런타임 코드 생성 없음.
- **인터랙션 11종**: tap-the-right-one, match-pair, binary-choice, connect, flip-memory, combine, categorize, order-sequence, find-it, sequence-tap, pattern-next. (문서 1개당 정확히 1종)
- **이펙트 3종**: reveal, responsive-state, goal-state. **확장 활동 6종**: discuss, story, name-create, connect-apply, move-express, watch-video.
- **아동 미디어 가드**: `assertNotChildMedia()`가 외부 전송을 차단. 배경 제거(RMBG)·분할(SlimSAM)은 WASM 워커에서 온디바이스 실행.

세부 임베드 계약(7개 불변점)·심화는 [`MODULE_REFERENCE.md` §5 game-viewer](./MODULE_REFERENCE.md#5-game-viewer-srcgame-viewerv2) 참조.

---

## 7. 상태 관리 (Zustand)

상태는 도메인별로 분리되어 있고, 보드 상태와 히스토리(되돌리기)는 의도적으로 별도 스토어다.

```mermaid
graph LR
    subgraph Core["보드 핵심"]
        bs["boardStore<br/>nodes/lanes/viewport"]
        hs["historyStore<br/>undo/redo (Command)"]
        bss["boardsStore<br/>멀티보드 + 스냅샷"]
    end
    subgraph AI["AI/생성"]
        rs["routerStore<br/>채팅 턴 + 인라인 에이전트"]
        ls["learningStore<br/>편집 diff → 선호 distill"]
    end
    subgraph Domain["도메인"]
        cs["classStore<br/>우리반 (테넌트 컨텍스트)"]
        cals["calendarStore<br/>일정 → 생성 트리거"]
        fs["folderStore<br/>번들 + 폴더 트리"]
    end
    subgraph UI["UI/오버레이"]
        uis["uiStore<br/>프롬프트바·풀스크린"]
        ts["trayStore"]
        fcs["formatChoiceStore"]
        pcs["promptChoiceStore"]
    end

    bs --> hs
    rs --> cs
    rs --> ls
    cs -->|"buildTenantContext (마스킹)"| rs
    ls -->|"buildLearnedContext (RAG)"| rs
```

- **자가고도화 폐루프**: 생성 → 교사 편집/채택 → diff 신호 → `distill()` → exemplar/선호 → 다음 생성에 L3로 주입(`learningStore`).
- **테넌트 컨텍스트**: `classStore.buildTenantContext()`가 아동명 마스킹 후 라우터·에이전트의 L3 레이어에 자동 동봉.
- 영속: `learningStore`=localStorage, `folderStore`=IndexedDB(+클라우드 미러), 나머지=세션/로컬.

스토어별 상태·액션 전체는 [`MODULE_REFERENCE.md` §스토어](./MODULE_REFERENCE.md#1-스토어-srcstore) 참조.

---

## 8. 빌드/배포 토폴로지

```mermaid
graph LR
    subgraph Multipage["Vite 멀티페이지 엔트리"]
        Main["index.html → 메인 SPA"]
        Slides["slides-viewer.html → 슬라이드 뷰어"]
        Game["game-viewer.html → 게임 뷰어"]
    end
    subgraph Dev["개발 (vite dev)"]
        DG["devGateway 플러그인<br/>= 서버 게이트웨이 인프로세스"]
    end
    subgraph Prod["프로덕션 (Vercel)"]
        Static["dist/ 정적 SPA"]
        Fns["api/*.ts 서버리스 함수"]
    end
    Multipage --> Static
    DG -.동일 계약.-> Fns
```

- 멀티페이지 입력은 `vite.config.ts`의 `build.rollupOptions.input`(main/slides/game).
- `vercel.json`: `/((?!api/).*)` → `/index.html` SPA 폴백. 설치 시 `ONNXRUNTIME_NODE_INSTALL=skip`.
- 경로 별칭 `@/*` → `./src/*` (`tsconfig.app.json`).
- 디자인 토큰: Tailwind 값 전부 `src/styles/tokens.css`의 CSS 변수 참조(하드코딩 0).

상세 환경변수·엔드포인트·테이블은 [`API_REFERENCE.md`](./API_REFERENCE.md) 참조.
