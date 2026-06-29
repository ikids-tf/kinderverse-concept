# CLAUDE.md — 게임 생성 엔진(Resolver) v0.2

> ⚠️ **HISTORICAL — '구현 착수 전' 청사진. 현행 아님.** Resolver는 **구현 완료**(`src/features/interactive-viewer/resolver/`, 레시피 11종 incl. `dress-up`, board/prompt.ts 배선됨). "착수하라"는 지시 따르면 완성된 작업을 재구현하게 됨.
> 진실원: 루트 `CLAUDE.md` + `docs/{ONBOARDING,ARCHITECTURE,MODULE_REFERENCE,API_REFERENCE}.md` + 코드.
> 옛 상태 주의: "Game Viewer v2(A) 폐기"는 **B 라인 설계 관점**일 뿐 — A(`src/game-viewer/v2/`)·B(`src/features/interactive-viewer/`) **둘 다 활성** · 파일:라인 번호는 드리프트(심볼명 기준 참조).

> Interactive Viewer(B) 메커니즘 레시피 작업의 항구적 컨텍스트. 모든 세션에서 먼저 읽을 것.
> 전체 설계: `docs/kinderverse-game-engine-spec-v0.2.md` · 근거 조사: B 생성 내부 조사(드래그 모델·결정론 꼬리·워크드 예시).

---

## 무엇을 만드는가 (한 줄)

교사 의도 → **메커니즘 레시피(결정론 ASSEMBLER)** → 손으로 조립한 `InteractiveNode` → B의 export된 꼬리 함수 → `store.mutate`로 **레인 인프라의 한 레인을 채운다**. hook → body → 연계 hook 가로 사슬을 공급.

---

## 확정된 결정 (재논의 불필요)

| 항목 | 값 | 근거 |
|---|---|---|
| 타깃 | Interactive Viewer(B) 단일. **Game Viewer v2(A)는 폐기** | 교사 만족·구조 유지 |
| 생성 방식 | **결정론 ASSEMBLER** (제약 프롬프트 아님) | LLM 단독 구조생성이 깨짐: "연잎 세기"가 `count` 누락으로 완료 불능 — 실증 |
| LLM 역할 | 구조 0%. **내용(라벨·정답집합·gen: 이미지 프롬프트)만** + 이미지 생성 | 비싼 구조 콜 제거 |
| 롱테일 폴백 | 레시피 없는 의도 → 기존 `composeInteractiveNode`(전체 LLM) 그대로 | B 경로 무변경 |
| 드래그 모델 | **하이브리드** — 자유 위치 드롭 + 연결-구속 영역 판정 | `hitConnectedAt`(InteractiveStage.tsx:890-906), `onPathUp`(:960-1004) |

---

## 절대 규칙

1. **타깃은 B 단일.** A의 `InteractiveDoc`/`kind`/Resolver/archetype은 무관. 참조 금지.
2. **레시피 = 결정론 구조.** LLM이 behavior 배선을 짓지 않는다. (배선을 LLM에 맡기면 §아래 버그 클래스가 돌아온다.)
3. **`composeInteractiveNode`를 호출하지 마라.** 그건 LLM 콜 포함 — 롱테일 폴백 전용. 레시피는 **export된 꼬리 함수를 직접** 태운다: `autoLayout`(layout.ts:81), `fillTokenImages`(artDirect.ts:236), `safeParseInteractiveNode`(parse.ts). 그 뒤 `store.mutate`.
4. **B 스키마·Behavior 엔진·꼬리 함수 무변경.** 호출만. 새 트리거·새 액션·새 프리미티브를 만들지 마라 — 아래 인벤토리로만 조립.
5. **레시피 노드는 참조무결성 완비.** `safeParseInteractiveNode`가 `behavior.target`·`connection.from/to`·`when.counterId/flagId`·`params.targets/connectionId` 전부 존재를 요구. ASSEMBLER가 이걸 코드로 보장한다(LLM이 못 하던 것).
6. **불확실하면 추측 말고 파일:라인과 함께 질문.** (이전 세션에서 추측이 두 번 틀렸다.)

---

## 🔴 레인 통합 규칙 (버그 방지 — 반드시 지킬 것)

`forceShape`(composeNode.ts:161)가 캔버스를 **1280×800으로 강제**하고 `autoLayout`이 그 안에 배치한다. 레인 인프라는 `canvas.w = 1280*N`로 다중 레인을 표현한다. 충돌을 피하려면:

- **꼬리(`forceShape`/`autoLayout`/`fillTokenImages`/`safeParse`)는 레인 1개짜리 독립 게임(1280×800)에만 돌린다.**
- 그 다음 레인 인프라가 `+targetLane*1280` **평행이동**으로 밴드에 꽂는다.
- **다중 레인 노드 전체에 `forceShape`/`autoLayout`을 다시 돌리지 마라** — 캔버스가 1280으로 리셋되고 전 레인이 뭉개진다.

순서: `레시피 → 독립 1280 게임(꼬리 실행) → +N*1280 평행이동 → 다중 레인 노드에 머지 → mutate`.
초기 게임(레인 0, N=1)은 평행이동 0 — 게임 자체가 노드.

---

## 절대 건드리지 말 것 (B의 나머지)

- **Behavior 엔진** `fireBehavior`/`applyAction`/`evalCond`, 6 트리거·11 액션·3 조건·체인·Counter/Flag/StoryGraph. (호출만, 무수정.)
- **스키마** `interactiveNode.ts`.
- **꼬리 함수 내부** `autoLayout`/`fillTokenImages`/`safeParse` — 호출만.
- **`composeInteractiveNode`** — 폴백으로 보존, 손대지 않음.

---

## B 프리미티브 인벤토리 (레시피 재료 — 이게 전부)

- **트리거 6:** `tap` · `sequenceTap` · `pathTraverse` · `sceneEnter` · `storyAdvance` · `afterComplete`
- **액션 11:** `animate`(9프리셋: bounce·jump·wiggle·grow·spin·shake·float·fadeIn·fadeOut) · `moveAlongPath` · `swap` · `playVideo` · `speak` · `reveal` · `hide` · `count` · `highlight` · `setFlag` · `goToScene`(레인 패닝, 인프라 v1.0)
- **조건 3:** `counter`(>=,==,<) · `flag` · `state`(default/swapped)
- **Connection kinds:** `path` · `link` · `order` · **State:** Counter · Flag · StoryGraph · Group

---

## 메커니즘 적합도 (조사 반영, 빌드 우선순위 순)

| 메커니즘 | 적합도 | 비고 |
|---|---|---|
| sequence-order | ★ 네이티브 | `Connection(order)`+`sequenceTap`. 청사진: "다람쥐 도토리"(= FEWSHOT 정규 템플릿) |
| path-trace | ★ 네이티브 | `Connection(path)`+`pathTraverse`+`moveAlongPath` |
| pair-match | ★ 네이티브 | `Connection(link)`+`pathTraverse` |
| tap-select (+find-it) | ◐ 조합 | 연결 없음. 청사진: "과일만 찾아요" |
| sort-to-bin | ◐ 조합 **(확정)** | 청사진: "숲속 곤충 찾기". `dragSortBeh`(:468) 발동 조건 주의(§SKILL) |
| slot-fill | ◐ 조합 **(확정)** | sort-to-bin과 동일 구조(통 대신 빈칸 요소) |
| branch-choose | ◐ 조합 | `tap`→`setFlag`+`swap`/`reveal`(결과)+`speak` |
| combine | ◐ 조합 | `pathTraverse`(A→B)+`when(둘다)`+`swap`(→C)+`count` |
| memory-flip | ◐ 조합 | `swap`(앞↔뒤)+`tap`+flag/counter 매칭 |
| **free-create** | ◐ **재정의** | 자유 배치 불가(드롭=숨김). **프리셋 슬롯 꾸미기**(`tap`→`swap` 옵션 순환)로만. 우선순위 낮음 |
| rhythm-tap | ✗ 보류 | realtime-arcade 명시적 제외 |
| (진짜 자유배치 샌드박스) | ✗ 보류 | "남겨두는 배치" 신규 프리미티브 필요 |

---

## 의존성 & 접속점

- **선행:** 레인 인프라 v1.0이 **코드로 완성**돼야 Resolver 구현 착수(레인이 있어야 채움). 단 본 핸드오프 *문서*는 미리 준비됨.
- **접속:** 인프라 **PROMPT 3에서 열어둔 훅**("확장 프롬프트 소스를 인자/훅으로")에 Resolver가 꽂힌다. 인프라="어떻게 레인 추가·패닝", Resolver="그 레인을 무엇으로".
- **ExtendActivity = 레시피의 기본 body 레시피.** 각 메커니즘이 기본 후속을 가져 "확장" 시 다음 레인 콘텐츠 공급.

---

## 작업 순서

`PROMPTS.md`를 순서대로. 각 단계는 `SKILL.md`의 청사진·꼬리 호출 순서·레인 통합 규칙으로 독립 검증.
