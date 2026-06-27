# KinderVerse API · 백엔드 레퍼런스

> 서버리스 엔드포인트, AUI(JSON) 출력 계약, 환경변수, Supabase 데이터 모델. 흐름은 [`ARCHITECTURE.md`](./ARCHITECTURE.md), 모듈 세부는 [`MODULE_REFERENCE.md`](./MODULE_REFERENCE.md).

모든 엔드포인트는 **개발(`vite-plugins/devGateway.ts`)과 프로덕션(`api/*.ts` Vercel 함수)에서 동일 계약**으로 제공된다. 프로바이더 키는 서버에서만 읽으며 브라우저로 노출되지 않는다.

---

## 1. HTTP 엔드포인트

### `POST /api/ai/run` — 마스터 AI 게이트웨이
- **함수**: `api/ai/run.ts` → `server/gateway/handler.ts` `handleGatewayRequest()`
- **최대 실행**: 60s
- **요청 본문** (`GatewayRequest`, `src/ai/gateway/types.ts`):

```ts
{
  task: string;  // 논리적 태스크명(기본 tier/provider 결정). 알려진 14종 아래.
                 // router·record·plan·studio·writing·design·suitability
                 // ·lane_step·slides·image·detect·vision·tts·search
  messages: { role: string; content: string }[];
  provider?: 'anthropic' | 'gemini' | 'auto';   // 기본 auto (Anthropic 우선)
  tier?: 'low' | 'mid' | 'high' | 'auto';        // 라우터 기본 low, 그 외 mid
  fallback?: ('low' | 'mid' | 'high')[];         // 티어 캐스케이드
  system?: string;
  responseFormat?: 'json' | 'text';
  cache?: string[];                               // 프롬프트 캐시 힌트
  maxTokens?: number;
  meta?: unknown;                                 // 태스크별 컨텍스트 패스스루
}
```

- **응답** (`GatewayResponse`):

```ts
{
  ok: boolean;
  text?: string;             // LLM 출력 (구조화 태스크는 JSON 문자열)
  image?: string;            // task:'image' → data URI
  audio?: string;            // task:'tts'   → mp3 data URI
  sources?: SearchSource[];  // task:'search'
  regions?: DetectedRegion[];// task:'detect' (box [ymin,xmin,ymax,xmax] 0–1000 + 마스크 PNG)
  provider?: 'anthropic' | 'gemini';
  model?: string;
  tier?: 'low' | 'mid' | 'high';
  mocked?: boolean;          // 키 없어 목 폴백되면 true
  error?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}
```

태스크별 분기는 `handleGatewayRequest()`에서: `image/edit`→`generateImage`/`editImage`, `detect`→`detectImageElements`, `vision`→`askImage`, `tts`→`synthSpeech`, `search`→`geminiSearch`, 텍스트→티어 캐스케이드(`anthropicComplete`/`geminiComplete`), 키 없음→`mock.ts`.

### `POST /api/ai/chat` — 스트리밍 대화 (SSE)
- **함수**: `api/ai/chat.ts` → `server/gateway/chat.ts` `streamChatResponse()`
- **요청 본문**: `{ messages: { role: 'user'|'assistant'; content: string }[]; system?: string }`
- **응답**: Server-Sent Events. Anthropic 형식 델타로 통일 — `data: {type:"content_block_delta", delta:{type:"text_delta", text}}`.
  - Anthropic 키: 네이티브 스트리밍 패스스루
  - Gemini 키: 완성 후 18자 단위 타자기 효과
  - 키 없음: 데모 마크다운 답변
- **클라이언트**: `src/ai/chat.ts` `streamChat()` (SSE 파서 + `buildChatSystem()`).

### `POST /api/ai/video/start` · `GET /api/ai/video/poll` — Veo 비디오 (비동기)
- **함수**: `api/ai/video/{start,poll}.ts` → `server/gateway/video.ts` `startVideo()` / `pollVideo()`
- `start` 본문: `{ prompt?, imageDataUri?, aspectRatio?='16:9', durationSeconds?=4, negativePrompt? }` → `{ ok, op?, real }`
- `poll` 쿼리: `?op=<operation>` → `{ ok, done, video?, mocked?, error?, filtered? }` (서버가 Gemini URI를 base64 data URI로 변환해 최상위 `video`에 담음; `result`/`outputUri` 필드 없음). 클라이언트는 `pr.video`를 읽음(`src/board/video.ts`).
- 프로바이더: Google Gemini **Veo** 전용. 기본 모델 `veo-3.0-fast-generate-001`.

### `GET /api/youtube/search` — 키리스 유튜브 검색
- **함수**: `api/youtube/search.ts` → `server/gateway/youtube.ts` `searchYoutube()`
- 쿼리: `?q=<검색어>&n=<개수=3>` → `{ ok, results?: { id, title, channel?, duration? }[] }`
- 검색 결과 페이지의 `ytInitialData`를 서버에서 파싱(CORS 우회, 키 불필요).

### `GET /api/unfurl` — 링크 미리보기
- **함수**: `api/unfurl.ts` → `server/gateway/unfurl.ts` `unfurlLink()`
- 쿼리: `?url=<URL>` → `{ ok, url, thumb?, title?, embeddable? }` (og:image/og:title + X-Frame-Options/CSP 임베드 가능 여부).

### `/api/lessons` — 레슨 영속 미러 (스텁)
- **함수**: `api/lessons.ts` → `server/gateway/lessons.ts` `dbListLessons` / `dbSaveLesson` / `dbRemoveLesson`
- GET/POST/DELETE. Vercel 임시 파일시스템은 비영속 → **진실 소스는 클라이언트 localStorage + Supabase 동기화**.

---

## 2. AUI 출력 계약 (UI 레지스트리)

에이전트는 **임의 HTML이 아니라 `{ type, props }` JSON만** 출력한다. `src/ui-registry/contracts.ts`의 `validateRegistryPayload()`가 검증하고 `registry.tsx`의 `RegistryRenderer`가 `type`을 컴포넌트로 매핑한다. 모든 컴포넌트는 **5상태**(`loading | streaming | ready | editing | error`, `src/ui-registry/state.ts`)를 지원한다.

```ts
RegistryRenderer({
  payload: RegistryPayload;
  state?: 'loading' | 'streaming' | 'ready' | 'editing' | 'error';
  onClarifyOption?: (option: string) => void;
})
```

### 컴포넌트 카탈로그 (`type` 1:1)

| `type` | 한글 | 파일 | 자율성 게이트 |
|---|---|---|---|
| `RecordDraftCard` | 관찰기록 | `RecordDraftCard.tsx` | L1 |
| `PlayStoryCard` | 놀이이야기 | `PlayStoryCard.tsx` | L2(발송) |
| `ClarifyPrompt` | 명확화 질문 | `ClarifyPromptCard.tsx` | — |
| `WeeklyPlanGrid` | 주간 놀이계획 | `WeeklyPlanGrid.tsx` | L1 |
| `WorksheetCard` | 활동지 | `WorksheetCard.tsx` | L1 |
| `StudioGallery` | 이미지/도안 갤러리 | `StudioGallery.tsx` | L1 |
| `LetterPreview` | 통신문/공지/문장 | `LetterPreview.tsx` | L2(발송) |
| `AssessmentReport` | 발달평가서 (고위험) | `AssessmentReport.tsx` | L3(발송) |

#### `RecordDraftCard` (관찰기록)
```ts
{ type: 'RecordDraftCard', props: {
  child_label: string;            // 마스킹된 라벨
  age_band: '0-2' | '3-5';
  curriculum: 'standard' | 'nuri';
  date?: string;
  observations: {
    text: string;
    source: string;               // ★ 안티-환각: 비어 있을 수 없음 (사진 ID/교사 메모 인용)
    domains: string[];            // 누리/표준 영역
  }[];
  summary?: string;
}}
```

#### `PlayStoryCard` (놀이이야기 — 학부모 발송)
```ts
{ type: 'PlayStoryCard', props: {
  title: string; age_band: '0-2'|'3-5'; curriculum: 'standard'|'nuri';
  photo_slots: { caption: string; placeholder: boolean }[];
  narrative: string; domains: string[]; family_note?: string;
}}
```

#### `ClarifyPrompt` (명확화)
```ts
{ type: 'ClarifyPrompt', props: { question: string; options?: string[] } }
// 사용자가 옵션 선택 시 onClarifyOption(option) 콜백
```

#### `WeeklyPlanGrid` (주간 계획)
```ts
{ type: 'WeeklyPlanGrid', props: {
  id?: string;                    // 활동지가 link_plan_id로 역참조
  title: string; age_band: '0-2'|'3-5'; curriculum: 'standard'|'nuri';
  days: { day: string; area: string; activity: string; materials?: string; goal?: string }[];
  notes?: string;
}}
```

#### `WorksheetCard` (활동지)
```ts
{ type: 'WorksheetCard', props: {
  title: string; age_band: '0-2'|'3-5'; curriculum: 'standard'|'nuri';
  objective: string; materials: string[]; steps: string[];
  domains?: string[];
  link_plan_id?: string;          // WeeklyPlanGrid 역참조 (계획↔활동지 연결)
  // 추천/스튜디오 확장
  topic?: string; instruction?: string;
  type?: string; style?: string; style_label?: string;
  selection?: { type_by: 'user'|'recommended'; style_by: 'user'|'recommended'; mode: 'instant'|'guided' };
  difficulty?: 'basic'|'standard'|'extended';
  image_prompt?: string; image_url?: string;
  needs_cut_layout?: boolean;
  cut_layout?: { pieces: string[]; shared_edges: string[][]; cut_line_style: 'solid'|'dashed' } | null;
  visual_status?: 'pending'|'filled';
}}
```

#### `StudioGallery`
```ts
{ type: 'StudioGallery', props: {
  title: string;
  items: { caption: string; kind: 'image'|'도안'; url?: string }[];
}}
```

#### `LetterPreview` (통신문/공지/문장)
```ts
{ type: 'LetterPreview', props: {
  kind: 'letter'|'notice'|'text';
  title: string; body: string;
  tone: 'warm'|'formal'|'concise';   // 톤 토글
  audience?: string;
}}
```

#### `AssessmentReport` (발달평가서 — 고위험·L3)
```ts
{ type: 'AssessmentReport', props: {
  child_label: string; age_band: '0-2'|'3-5'; curriculum: 'standard'|'nuri';
  domains: { area: string; observation: string; level?: string }[];
  summary: string;
  suitability: { checked: boolean; pass: boolean; flags: string[] };  // 자동 적합성 검증 결과
}}
```

**불변식**: `validateRegistryPayload()`가 `type` 화이트리스트·필수 props·근거(`source`) 비공백을 강제한다. 새 결과 유형 추가 시 컴포넌트 등록 + 에이전트 출력 스키마와 1:1로 맞춰야 한다(DoD).

---

## 3. 환경변수 (`.env.example`)

`.env.example`를 `.env`로 복사해 채운다. **키가 하나도 없어도 앱은 목 모드로 완전 동작한다.**

| 변수 | 용도 | 기본값 |
|---|---|---|
| `ANTHROPIC_API_KEY` | Anthropic (1차) | — |
| `GEMINI_API_KEY` | Gemini (2차, 이미지/영상/비전) | — |
| `KV_ANTHROPIC_MODEL_LOW` | low 티어 오버라이드 | `claude-haiku-4-5` |
| `KV_ANTHROPIC_MODEL_MID` | mid 티어 오버라이드 | `claude-sonnet-4-6` |
| `KV_ANTHROPIC_MODEL_HIGH` | high 티어 오버라이드 | `claude-opus-4-8` |
| `KV_GEMINI_MODEL_LOW` | low 티어 | `gemini-2.5-flash` |
| `KV_GEMINI_MODEL_MID` | mid 티어 | `gemini-2.5-flash` |
| `KV_GEMINI_MODEL_HIGH` | high 티어 | `gemini-2.5-pro` |
| `KV_GEMINI_IMAGE_MODEL` | 이미지 생성 모델 | `gemini-2.5-flash-image` |
| `KV_GEMINI_VIDEO_MODEL` | Veo 비디오 모델 | `veo-3.0-fast-generate-001` |
| `CLOVA_VOICE_CLIENT_ID` | NCP CLOVA Voice ID | — |
| `CLOVA_VOICE_CLIENT_SECRET` | CLOVA Voice Secret | — |
| `CLOVA_VOICE_SPEAKER_BRIGHT` | 밝은 톤 화자 | `nara` |
| `CLOVA_VOICE_SPEAKER_CALM` | 차분한 톤 화자 | `nara` |
| `VITE_SUPABASE_URL` | Supabase 프로젝트 URL (브라우저 노출) | — |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon 키 (브라우저 노출, 안전) | — |

**키 조합별 동작**: 키 없음→전체 목 / Anthropic만→텍스트 실연동·나머지 목 / Gemini만→Gemini 실연동·Anthropic 목 / 둘 다→`auto`(Anthropic 우선). `VITE_` 접두사만 브라우저로 번들된다(`service_role` 키는 절대 커밋 금지).

---

## 4. Supabase 데이터 모델 (`supabase/schema.sql`)

클라우드 동기화는 **선택**이다(`VITE_SUPABASE_*` 미설정 시 localStorage/IndexedDB 로컬 전용). 데모 모델이라 로그인 없이 anon 역할로 동작한다.

```sql
-- 보드·게임·폴더를 미러링하는 키-값 저장소
create table if not exists public.kv_store (
  k          text primary key,
  v          jsonb not null,
  updated_at timestamptz default now()
);
alter table public.kv_store enable row level security;
create policy "kv_anon_all" on public.kv_store ...  -- anon 전체 읽기/쓰기

-- 생성 이미지 등 자산 (공개 읽기)
insert into storage.buckets (id, name, public) values ('kv-assets', 'kv-assets', true);
-- policies: kv_assets_read (SELECT), kv_assets_write (INSERT), kv_assets_update (UPSERT)
```

| 객체 | 종류 | 용도 |
|---|---|---|
| `public.kv_store` | 테이블 | 보드/게임/폴더 JSON 미러 (`k` PK, `v` jsonb) |
| `kv-assets` | 스토리지 버킷 | 생성 이미지 등 공개 자산 (콘텐츠 해시 upsert) |

> ⚠️ 현 스키마는 데모용 anon-개방 모델이다. 멀티테넌트 격리·실DB 연동(아동 데이터 L3 거버넌스)은 후속 외부 작업으로 남아 있다(README 로드맵 참조).

---

## 5. 서버 게이트웨이 모듈 (`server/gateway/`)

| 파일 | 핵심 export | 책임 |
|---|---|---|
| `handler.ts` | `handleGatewayRequest`, `GatewayConfig` | 프로바이더 선택·티어 캐스케이드·목 폴백·태스크 분기 |
| `env.ts` | `gatewayConfigFromEnv` | `process.env` → `GatewayConfig` |
| `providers.ts` | `anthropicComplete`, `geminiComplete`, `geminiSearch`, `DEFAULT_*_MODELS` | 직접 fetch 어댑터 |
| `chat.ts` | `streamChatResponse` | `/api/ai/chat` SSE 스트리밍 |
| `image.ts` | `generateImage`, `editImage`, `detectImageElements`, `askImage`, `placeholderImage` | Gemini 이미지 생성/편집/비전 |
| `video.ts` | `startVideo`, `pollVideo` | Veo 비동기 비디오 |
| `tts.ts` | `synthSpeech` | CLOVA Voice 합성 |
| `youtube.ts` | `searchYoutube` | ytInitialData 파싱 |
| `unfurl.ts` | `unfurlLink` | 링크 미리보기 |
| `lessons.ts` | `dbListLessons` 등 | 레슨 영속(스텁) |
| `mock.ts` | `mockRouterOutput`, `mockRecordOutput`, `mockAgentStep`, `mockLaneStep` | 오프라인 데모 |

개발 환경 와이어업은 `vite-plugins/devGateway.ts` (`.env`를 `loadEnv('')`로 읽어 위 핸들러에 라우팅).
