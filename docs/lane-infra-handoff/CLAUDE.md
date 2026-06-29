# CLAUDE.md — 레인 인프라

> ⚠️ **HISTORICAL — 작업 계획(plan) 스냅샷. 현행 아님.** 여기 적힌 3단계는 **모두 구현됨**(레인 인프라 v1.0), step3(확장 내부화)는 이후 **의도적 보류**로 전환(데드코드 아님·삭제 금지). "no-op 교체하라"는 지시 따르면 회귀 유발.
> 진실원: 루트 `CLAUDE.md` + `docs/{ONBOARDING,ARCHITECTURE,MODULE_REFERENCE,API_REFERENCE}.md` + `docs/kinderverse-lane-infrastructure-spec-v1.0.md` §9 + 코드.
> 옛 상태 주의: "Game Viewer v2(A) 폐기"는 **B 라인 설계 관점**일 뿐 — A(`src/game-viewer/v2/`)·B(`src/features/interactive-viewer/`) **둘 다 활성** · `goToScene`/카메라 런타임은 이미 구현됨 · 파일:라인 번호는 드리프트(심볼명 기준).

> Interactive Viewer(B) 노드 내부 다중 레인 작업의 항구적 컨텍스트. 모든 세션에서 먼저 읽을 것.
> 전체 스펙: `docs/kinderverse-lane-infrastructure-spec-v1.0.md`

---

## 무엇을 만드는가 (한 줄)

인터렉티브 노드를 **가로로 무한히 자라는 레인 컨테이너**로 만든다.
`[게임 레인] → "확장" 클릭 → 카메라가 옆 레인으로 패닝 → [확장활동 레인] → [연계 게임 레인] → "확장" → …`
확장은 더 이상 MyBoard로 새지 않고, **같은 노드 내부 레인**으로 들어온다.

---

## 절대 규칙

1. **타깃은 Interactive Viewer(B) 단일.** Game Viewer v2(A)는 폐기됐다. A의 `InteractiveDoc`·`kind`·Resolver·archetype은 이 작업과 무관하다. 참조하지 말 것.
2. **B 구조·스타일은 재설계가 아니다.** 신규 변경은 **정확히 3곳**(아래). 그 외 B는 무변경.
3. **새 트리거·새 액션·새 params 스키마를 만들지 마라.** 레인 전환은 **이미 스키마에 존재하는** `goToScene` 액션(`interactiveNode.ts:171`)의 빈 런타임 본문을 채워서 한다.
4. **레인은 별도 엔티티가 아니다.** "넓은 캔버스의 1280px x-밴드"라는 **규약**일 뿐. 요소는 기존 평면 `elements[]` 절대좌표 그대로.
5. **불확실하면 추측하지 말고 파일:라인과 함께 질문하라.** (이전 세션에서 추측이 두 번 틀렸다.)

---

## 신규 변경 — 정확히 이 3곳만

| # | 변경 | 위치 |
|---|---|---|
| 1 | `cameraLane` state + 한 레인 fit + tx 가로 오프셋 + rAF 이징 | `InteractiveStage.tsx:199`(fit 폭), `:201`(tx 오프셋) |
| 2 | `goToScene` 런타임 본문 (no-op 교체) | `InteractiveStage.tsx:615~617` |
| 3 | 확장 콘텐츠를 노드 내부 레인으로 (MyBoard externalize 차단) | `composer.ts:1877~1886` 끊기 → `mutate(docId)` 새 밴드 append |

순서 의존: **1 없이 2·3 불가.** 1=토대, 2=토대 위 전환, 3=토대+전환 위 확장.

---

## 절대 건드리지 말 것 (B의 나머지)

- **Behavior 엔진** — `fireBehavior`/`applyAction`/`evalCond`. 6 트리거(`tap`·`sequenceTap`·`pathTraverse`·`sceneEnter`·`storyAdvance`·`afterComplete`), 나머지 10 액션, 조건 3종, then-체인, Counter/Flag, StoryGraph. 전부 그대로.
- **스키마** `interactiveNode.ts` — 요소·행동·조건 구조 무변경. `canvas.size.w`를 넓게 쓰는 것은 기존 필드 활용이지 스키마 변경이 아님.
- **생성 경로** — LLM 계약(`interactive-compose`/`-edit`), 결정론 조립(`forceShape`/`autoLayout`/`fillTokenImages`/`clampXY`), `store.mutate` 영속, undo 1급. (단 §3은 *호출*만, 내부 무수정.)
- **MyBoard 전역** viewport·`slideFrameToEmpty` **원본**. (패턴만 로컬 복제 가능, 원본 수정 금지.)
- **단일 레인 노드 렌더** — `cameraLane=0` 기본값에서 기존과 픽셀·동작 완전 동일해야 함.

---

## 확정된 결정 (재논의 불필요)

| 항목 | 값 |
|---|---|
| 런타임 | B 단일 (A 폐기) |
| 레인 모델 | **모델 2 — 무한 성장** ("확장"마다 우측 레인 append, `canvas.w += 1280`) |
| 확장 레인 콘텐츠 | **플레이 가능한 인터랙티브 활동** (`composeInteractiveNode` 재사용). 마크다운 노트(`task:'plan'`) 아님 |
| 연계 게임 | **또 다른 새 레인** (원래 레인 재생 아님) |
| 레인 표현 | 넓은 캔버스의 1280px x-밴드. 레인 `i` 요소는 `x ∈ [i·1280, (i+1)·1280)` |

---

## 이 작업의 경계 (스코프 밖 = v0.2)

이 인프라는 **배관까지만**이다: "확장 누르면 새 레인에 노드를 생성·배치·패닝".
**"현 게임 다음에 *어떤* 확장·연계 게임을 생성할지"의 교육적 선택 로직은 여기 없다** — 그건 후속 게임 생성 엔진(v0.2 Resolver: Behavior 레시피·테마팩·동사 매핑)의 몫이다. §3은 `composeInteractiveNode`를 *호출*하는 자리만 만들고, 프롬프트 결정 로직은 v0.2에서 주입한다. 섞지 말 것.

---

## 작업 순서

`PROMPTS.md`의 3단계를 순서대로. 각 단계는 `SKILL.md`의 해당 절차와 수용 기준으로 독립 검증한 뒤 다음으로.
