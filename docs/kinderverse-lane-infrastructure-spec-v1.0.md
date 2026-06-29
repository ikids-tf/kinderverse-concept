# KinderVerse Interactive Viewer — 레인 인프라 스펙

> **버전** v1.0 · **상태** **부분 구현 — 확장 내부화(step3)는 의도적 보류** (2026-06-26 확인 — §9 step1·step2 구현 / step3은 파킹된 확장성 인프라·부활 대기, 삭제 금지) · **대상 레포** `kinderverse-concept`
> **타깃 런타임** Interactive Viewer(B) 단일. *(본 스펙의 "Game Viewer v2(A)는 폐기"는 이 B 라인 설계 결정 — 별개 모듈 `src/game-viewer/v2/` 게임뷰어는 현재도 활성, CLAUDE.md §8 참조.)*
> **선행 조사** 본 스펙의 모든 파일:라인은 B 전수 조사 문서 기준(라인 번호는 이후 드리프트 가능 — 심볼명 기준 참조 권장).
> **범위** 노드 내부 다중 레인 + 확장 내부화 인프라. **게임 생성 엔진(레시피·테마·Resolver)은 후속 스펙 v0.2.**
>
> **🔄 최신화 메모(2026-06-26, 코드 기준)** — **부분 구현: §9 step1(카메라 오프셋 인프라)·step2(`goToScene` 런타임)만 구현(`InteractiveStage.tsx`).** step3(확장 내부화)는 **미배선 보류 인프라(의도적 파킹)** — `extendActivityInNode`(`authoring/extendLane.ts`)·`resolverExtend`(`resolver/extend.ts`)·`extendInteractiveActivity`(`composer.ts`) 호출부 0건, `onExtend` 심볼 부재, `kv:inode-goto-lane` 디스패처 없음(리스너만 `InteractiveStage.tsx:280`에 존재), 확장 버튼은 `InteractiveOverlay.tsx:871`에서 제거됨. 핵심 파일: 노드 내부 레인 + 카메라 패닝 `src/features/interactive-viewer/runtime/InteractiveStage.tsx`(`LANE_W`·`panToLane`·`laneFromSceneId`·`goToScene`), 확장 내부화(정의만·미배선) `src/features/interactive-viewer/authoring/extendLane.ts`(`extendActivityInNode`·`offsetLane`), 확장 레시피 `resolver/extend.ts`. (보드 워크플로 레인 `src/board/lanes.ts`는 별개 시스템 — 혼동 주의.) ⚠ §9 step3는 아직 미반영.
>
> **🅿️ 보존 결정(2026-06-29):** step3(확장 내부화) 인프라는 **삭제하지 않고 보존**한다 — 의도적으로 파킹된 확장성 인프라이며 "데드코드"가 아니다. "놀이 확장 사슬"(놀이 끝 → ✨확장 → 같은 카드 새 레인에 이어지는 놀이) 기능의 두뇌·배관은 ~85–90% 완성 상태이고, 과거 stretch-canvas UI 이슈로 ✨버튼만 제거됨(commit `91ff874`). **부활 = ✨확장 버튼 + `runExtend` 글루 ~25줄**(아래 §9 step3). 대상 파일에 동일 취지 주석 표기됨(`extendLane.ts`·`resolver/extend.ts`·`composer.ts` `extendInteractiveActivity`·`InteractiveStage.tsx` 리스너). (`offsetLane`은 보류 아님 — `resolver/place.ts`가 쓰는 라이브 유틸.)

---

## 0. 목적 (한 줄)

인터렉티브 노드를 **가로로 무한히 자라는 레인 컨테이너**로 만든다. `[게임 레인] → "확장" 클릭 → 카메라가 옆 레인으로 패닝 → [확장활동 레인] → [연계 게임 레인] → "확장" → …`. 확장은 더 이상 MyBoard로 새지 않고 **같은 노드 내부 레인으로** 들어온다.

핵심 제약: **B 구조·스타일은 재설계하지 않는다.** 신규는 딱 3곳, 나머지 B(스키마·엔진·생성·저장·보드)는 전부 무변경.

---

## 1. 확정된 결정

| 결정 | 값 | 근거 |
|---|---|---|
| 런타임 | Interactive Viewer(B) 단일 | 교사 만족·구조 유지. A 폐기 |
| 레인 모델 | **모델 2 — 무한 성장** | "확장" 시마다 오른쪽에 레인 append. MyBoard 워크플로우 우향 성장의 노드 내부판 |
| 확장 레인 콘텐츠 | **플레이 가능한 인터랙티브 활동** | 교사 의도 "옆에서 확장활동을 *플레이*". 마크다운 노트(plan) 아님 |
| 연계 게임 | **또 다른 새 레인** | hook → body → 연계 hook 가로 사슬. 원래 레인 재생 아님 |
| 레인 표현 | **넓은 캔버스의 1280px x-밴드** | 요소는 기존 평면 `elements[]` 절대좌표 유지. 스키마 무변경 |

---

## 2. 비목표 (이 스펙에서 안 함)

- **게임 생성 엔진** — Behavior 레시피 라이브러리, 동사→메커니즘 매핑, 테마팩, Resolver. → **v0.2**.
- **확장 콘텐츠의 교육적 연결 로직** — "이 게임 다음에 무슨 확장이 적절한가". v0.2 Resolver 영역. 이 스펙은 "확장 누르면 새 레인에 노드를 생성·배치·패닝"하는 **배관**까지만.
- **B 스키마/Behavior 엔진/생성 LLM 계약 변경** — 절대 안 건드림(§5).
- **MyBoard 전역 viewport·`slideFrameToEmpty` 원본 수정** — 패턴만 로컬 복제, 원본 무수정.

---

## 3. 핵심 통찰: `goToScene`는 이미 비워둔 자리(현재 구현됨)

조사의 결정적 발견이었던 자리 — `goToScene` 액션이 **스키마에 이미 존재**(`interactiveNode.ts:171`)하고 런타임은 당시 **no-op**였다. **현재는 구현됨** — `InteractiveStage.tsx`의 case `'goToScene'`(line 705~709)이 `panToLane(laneFromSceneId(...))`를 호출한다. 옛 no-op 주석(*"장면 개념 미도입(P2). 무시"*)은 제거됨. (단 이 패닝 흐름은 어떤 UI에도 미배선된 휴면 코드 — 디스패처/트리거 발화부가 없다.)

→ 레인 전환을 위해 **새 트리거·새 액션·새 params 스키마를 0개** 만들었다. 기존 `goToScene`의 빈 본문을 "레인으로 패닝"으로 채웠으므로, 기존 트리거(`afterComplete`, `tap` 등)와 조합하면 *"게임 끝 → 옆 레인 패닝"* 이 그대로 표현된다.

이것이 "가산 변경"의 이상적 형태다.

---

## 4. 신규 변경 — 정확히 3곳

### 4-1. 레인 = x-밴드 규약 (스키마 무변경, 순수 규약)

- N레인 노드는 `canvas.size.w = 1280 * N` (기존 필드 `canvas.size`, `schema:216~219` 활용. 폭만 넓게 씀).
- 레인 `i`의 요소는 `x ∈ [i·1280, (i+1)·1280)`. 요소는 지금처럼 `elements[]` 평면 절대좌표(`schema:227`, `transform` `schema:31~38`) — **요소 모델 손대지 않음**.
- 레인 식별은 좌표 밴드로 충분. 옵셔널 `lanes?` 메타는 **필수 아님**(필요해지면 `Counter.display`처럼 옵셔널 메타로 후가산).

### 4-2. 한 레인 fit + 가로 카메라 오프셋 (런타임만) — ✅ 구현됨(step1)

당초 상태: `useStageFit`이 전체 캔버스 기준 단일 scale, `tx`는 중앙 레터박스 정렬 전용, 가로 패닝 없음. **현재는 아래대로 구현됨**(`InteractiveStage.tsx`의 `LANE_W`·`panToLane`):
- **fit 기준을 전체 → 한 레인(1280)** 으로 (`InteractiveStage.tsx:199` fit 폭).
- **`tx`에 카메라 오프셋 가산** — `tx + (-cameraLane * 1280 * scale)` (`InteractiveStage.tsx:201`).
- **`cameraLane` state + rAF 이징** — `slideFrameToEmpty`(`workflow.ts:523~`)의 rAF+cubic-out 패턴을 **로컬 복제**(원본 무수정).
- **기본값 `cameraLane = 0`** → 단일 레인(N=1) 노드는 동작·렌더 완전 불변(하위호환).

### 4-3. `goToScene` 런타임 구현 (no-op 교체) — ✅ 구현됨(step2)

- ✅ 옛 no-op을 교체 — `InteractiveStage.tsx`의 case `'goToScene'`(line 705~709)이 `panToLane(laneFromSceneId(...))` 호출.
- `params.sceneId`(`schema:171`)를 `laneFromSceneId`로 **레인 인덱스/대상**으로 해석 → §4-2의 카메라(`panToLane`)를 그 값으로 rAF 이징 애니메이트.
- 트리거·액션·params 스키마 신설 0.
- ⚠ 단 이 액션 경로는 어떤 UI에도 미배선된 휴면 코드(발화부 부재).

### 4-4. 확장을 노드 내부로 (MyBoard externalize 차단) — ⚠ 미배선(보류 인프라(의도적 파킹), step3)

> **현재 상태(2026-06-26):** 이 분기는 **미구현 보류 인프라(의도적 파킹)**다. `extendInteractiveActivity`(`composer.ts:2209~`)는 보드-누수 경로(`sticky` 생성·`focusNode` 전역 카메라·`task:'plan'` 마크다운)를 **그대로 보유**하나 호출부 0건의 **휴면/보류 인프라(의도적 파킹) 상태(미삭제)**다. 노드 내부화 함수(`extendActivityInNode` in `authoring/extendLane.ts`, `resolverExtend` in `resolver/extend.ts`)는 **정의만 있고 미배선**이며, `onExtend` 심볼·`kv:inode-goto-lane` 디스패처는 부재(리스너만 `InteractiveStage.tsx:280`), 확장 버튼은 `InteractiveOverlay.tsx:871`에서 제거됨. 아래는 **목표 설계(미달성)**.

설계상 확장 경로: ✨ 버튼 → 부모 `onExtend` → `InteractiveNodeCard` → `extendInteractiveActivity(title, anchorNodeId?)`(`composer.ts:2209~`).

문제 라인 — **MyBoard로 새는 지점**: `extendInteractiveActivity` 내부의 `b.addNodeRaw({type:'sticky', ...})` + `setSelection`+`focusNode` (현재 잔존, 휴면).

목표 변경(미달성):
- **끊을 곳:** 보드 sticky 생성 + 전역 카메라 패닝 경로. *(현재 미제거 — 휴면 보류 인프라(의도적 파킹)로 잔존.)*
- **붙일 곳:** 같은 `docId`에 `useInteractiveStore.getState().mutate(docId, ...)`로 **새 레인 밴드(`canvas.w += 1280`)에 콘텐츠 append**. `docId`는 `InteractiveNodeCard`에 이미 있음 → `onExtend` 클로저로 전달. *(현재 `onExtend` 심볼 부재.)*
- **콘텐츠 생성:** 확장 레인은 플레이 가능 활동이므로 `composeInteractiveNode`(`composeNode.ts`) 재사용. **목표상 `task:'plan'` 마크다운 경로는 버리되, 현재는 잔존.**
  - ⚠ v0.2 의존: "어떤 확장 게임을 생성할지"의 교육적 선택은 Resolver(v0.2) 몫. **이 스펙에서는 배관만** — 즉 `composeInteractiveNode`를 호출해 새 밴드에 노드를 채우고 `goToScene`로 그 레인으로 패닝하는 흐름까지. 프롬프트 결정 로직은 v0.2에서 주입.
- **패닝:** append 후 `goToScene`(§4-3)로 새 레인으로 카메라 이동.

---

## 5. 절대 건드리지 말 것 (B의 나머지)

- **Behavior 엔진** — `fireBehavior`/`applyAction`/`evalCond`, 6개 트리거(`tap`·`sequenceTap`·`pathTraverse`·`sceneEnter`·`storyAdvance`·`afterComplete`), 나머지 10개 액션, 조건 3종, then-체인, Counter/Flag, StoryGraph. 전부 그대로.
- **스키마** `interactiveNode.ts` — 요소·행동·조건 구조 무변경. (`canvas.w`를 넓게 쓰는 건 기존 필드 활용일 뿐.)
- **생성 경로** — LLM 계약(`interactive-compose`/`-edit`), 결정론 조립(`forceShape`/`autoLayout`/`fillTokenImages`/`clampXY`), `store.mutate` 영속, undo 1급.
- **MyBoard 전역** viewport·`slideFrameToEmpty` 원본.
- **단일 레인 노드 렌더** (`cameraLane=0` 기본).

**가산 변경 선 점검:** 신규 = 카메라 오프셋(`panToLane`) + `goToScene` 본문 + 확장 mutate 분기 **3곳뿐**. 현재 앞 2곳은 구현 완료, 확장 mutate 분기는 정의만·미배선(보류 인프라(의도적 파킹)). 기존 스키마/엔진/생성/저장/보드 무변경. ✅(범위 측면)

---

## 6. 동작 시나리오 (목표 상태)

```
1. 교사가 게임 생성 → 노드 1레인(N=1, canvas.w=1280). cameraLane=0. (현재와 동일)
2. 게임 플레이 종료 → ✨ "확장" 표출(InteractiveOverlay.tsx:822, finished).
3. "확장" 클릭:
   a. canvas.w += 1280 (N=2), 레인1 밴드[1280,2560)에 확장활동 노드 append
      (composeInteractiveNode 재사용, mutate(docId)).
   b. goToScene(sceneId=1) → cameraLane 0→1 rAF 이징 패닝.
4. 확장활동(레인1) 플레이 → 다시 "확장" or 연계:
   a. canvas.w += 1280 (N=3), 레인2 밴드[2560,3840)에 연계 게임 append.
   b. goToScene(sceneId=2) → cameraLane 1→2 패닝.
5. 무한 반복. 좌향 패닝(이전 레인 복귀)도 goToScene(작은 sceneId)로 동일.
```

레인은 콘텐츠가 추가될 때마다 우측으로 무한 성장(모델 2). 캔버스 `overflow:hidden`(`inode.css`)이라 항상 한 레인만 보임.

---

## 7. 검증 / 수용 기준 (Acceptance)

- [ ] **하위호환:** 기존 단일 레인 노드(N=1)가 픽셀·동작 완전 불변으로 렌더된다(`cameraLane=0`).
- [ ] **레인 fit:** N>1 노드에서 한 번에 정확히 한 레인(1280)만 화면을 채운다(레터박스 정렬 유지).
- [ ] **패닝:** `goToScene` 발화 시 카메라가 대상 레인으로 부드럽게(cubic-out 이징) 이동하고, 종료 시 정확히 밴드 경계에 정렬된다.
- [ ] **양방향:** 큰 sceneId(우향)·작은 sceneId(좌향) 모두 동작.
- [ ] **확장 내부화:** *(⚠ 현재 충족 불가 — step3 미배선 보류 인프라(의도적 파킹). 확장 버튼·`onExtend`·`kv:inode-goto-lane` 디스패처가 부재해 클릭 경로 자체가 없고, 보드-누수 경로(`composer.ts:2209~`)는 휴면으로 잔존.)* 목표: "확장" 클릭이 MyBoard에 sticky 노드를 **생성하지 않는다**(보드-누수 경로 미발화). 콘텐츠가 같은 노드 새 레인에 나타난다.
- [ ] **영속·undo:** 레인 추가가 `store.mutate`로 저장되고 undo 1회로 직전 레인 상태로 복귀한다.
- [ ] **전역 미오염:** 노드 내부 패닝이 MyBoard 전역 `viewport.panX`를 건드리지 않는다.

---

## 8. 열린 질문 (v0.2 또는 후속)

| # | 질문 | 처리 시점 |
|---|---|---|
| 1 | "어떤 확장 게임을 생성할지"의 교육적 선택 로직(현 게임 → 적절한 확장 → 연계) | **v0.2 Resolver** |
| 2 | 레인 간 내비게이션 UI — 교사가 임의 레인으로 점프하는 미니맵/탭이 필요한가, `goToScene` 발화만으로 충분한가 | 인프라 후 UX 검토 |
| 3 | 레인 상한 — 무한이지만 성능/메모리 실용 한계(예: 레인 N개 초과 시 비활성 레인 언마운트) | 성능 패스 |
| 4 | 확장 생성 중 로딩 상태 표현 — 새 레인에 `loadingDoc` 스켈레톤 후 패닝 vs 패닝 후 로딩 | 구현 중 결정 |

---

## 9. Claude Code 핸드오프 (구현 순서 / 현재 상태)

표준 3-파일 패턴.

> **상태(2026-06-26):** step1·step2는 **구현 완료**(`InteractiveStage.tsx`), step3(확장 내부화)는 함수만 정의되고 호출부 0건의 **미배선 보류 인프라(의도적 파킹)**. 아래 step 라인 번호는 드리프트됨 — 심볼 기준으로 읽을 것.

- **CLAUDE.md** — 타깃 B 단일·A 폐기, 모델 2 무한 성장, 레인=x-밴드 규약, "가산 변경 3곳" 원칙, §5 불가침 목록.
- **SKILL.md** — 카메라 오프셋 추가하는 법, `goToScene` 해석 규칙, 확장 mutate 분기 패턴.
- **PROMPTS.md** — 구현 순서(각 단계 독립 검증):
  1. **카메라 오프셋 인프라** ✅ **구현됨** — `panToLane` 카메라 + fit 폭 1280(`LANE_W`) + tx 오프셋 가산 + rAF 이징(`slideFrameToEmpty` 패턴 로컬 복제). 수용: §7 하위호환·fit·패닝.
  2. **`goToScene` 본문** ✅ **구현됨** — 옛 no-op 교체, case `'goToScene'`(`InteractiveStage.tsx:705~709`)이 `panToLane(laneFromSceneId(...))` 호출. 수용: §7 양방향. (단 어떤 UI에도 미배선된 휴면 코드.)
  3. **확장 내부화** ⚠ **미배선(보류 인프라(의도적 파킹))** — `extendActivityInNode`(`authoring/extendLane.ts`)·`resolverExtend`(`resolver/extend.ts`)·`extendInteractiveActivity`(`composer.ts:2209~`) 정의는 있으나 호출부 0건, `onExtend` 심볼 부재, `kv:inode-goto-lane` 디스패처 없음(리스너만 `InteractiveStage.tsx:280`), 확장 버튼 `InteractiveOverlay.tsx:871`에서 제거됨. 남은 작업: 보드-누수 경로 끊기, `mutate(docId)` 새 밴드 append, `docId` 클로저 전달, `composeInteractiveNode` 재사용, append 후 `goToScene` 발화 배선. 수용: §7 확장 내부화·영속·전역 미오염 — **현재 충족 불가.**

각 단계는 앞 단계 위에서만 동작. 1 없이 2·3 불가. (현재 1·2 완료, 3 미배선.)

---

### 변경 이력
- v1.0 — 레인 인프라 초안. 모델 2 확정, goToScene 재사용 전략, 신규 3곳, 가산 변경 선, 수용 기준, 핸드오프.
- v1.0 상태 정정(2026-06-26, 코드 기준) — "구현 완료"를 "부분 구현"으로 정정. step1(카메라 오프셋)·step2(`goToScene` 런타임)는 구현됨(`InteractiveStage.tsx`), step3(확장 내부화)는 호출부 0건의 미배선 보류 인프라(의도적 파킹)로 표기. §3는 `goToScene` 구현 반영, §4-4/§7은 보드-누수 경로가 제거가 아닌 휴면 잔존임을 정정.
