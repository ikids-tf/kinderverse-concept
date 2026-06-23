# SKILL.md — 레인 인프라 구현 절차

> 세 가지 신규 변경의 *어떻게*. `CLAUDE.md`(무엇·규칙)와 함께 읽을 것. 패턴 가이드이며, 실제 변수명·시그니처는 코드 컨벤션에 맞춰 조정.

---

## 개념 모델

- **레인 = x-밴드.** 노드가 N레인이면 `canvas.size.w = 1280 * N`. 레인 `i`의 콘텐츠는 가로 `[i·1280, (i+1)·1280)`에 산다. 요소는 기존 `elements[]` 평면 절대좌표 그대로 — 새 컨테이너 엔티티 없음.
- **카메라.** 화면엔 항상 한 레인만. `cameraLane`(정수, 기본 0)이 "지금 보이는 레인". 캔버스 가로 위치 = `-cameraLane * 1280 * scale`.
- **fit.** 스케일 기준이 전체 캔버스(넓음) → **한 레인(1280)**. 이래야 한 레인이 화면을 꽉 채움.
- **전환.** `goToScene(sceneId)`가 `cameraLane`을 목표값으로 rAF 이징 애니메이트.

---

## 절차 1 — 카메라 오프셋 인프라

**목표:** 가로 카메라 도입. `cameraLane=0`이면 기존과 동일(하위호환).

1. **fit 폭 변경** — `InteractiveStage.tsx:199` 근처. `useStageFit`에 넘기는 콘텐츠 폭을 전체 `canvas.w` → **레인폭 `1280`**(`LANE_W` 상수)으로. 컨테이너 대비 한 레인이 꽉 차도록 scale 산출.
2. **카메라 state** — `cameraLane`(숫자) + 애니용 보조값(아래). 단일 레인 노드는 0 고정.
3. **tx 오프셋 가산** — `InteractiveStage.tsx:201`. 현재 `tx`는 중앙 레터박스 정렬 전용. 여기에 `- cameraOffsetPx`를 더함. `cameraOffsetPx = cameraLaneAnimated * LANE_W * scale`. 적용부(`:1312`, `transform: translate(tx,ty) scale(scale)`)는 그대로 — `tx`만 바뀜.
4. **rAF 이징** — `cameraLane`이 바뀌면 `cameraLaneAnimated`를 현재값→목표값으로 보간. `slideFrameToEmpty`(`workflow.ts:523~`)의 rAF + cubic-out 패턴을 **로컬 복제**(원본 import해서 호출 금지 — 전역 viewport를 만짐).

```
// 이징 로컬 복제 골격 (예시)
function animateCamera(from, to, durMs, onFrame, onDone) {
  const t0 = performance.now();
  const ease = (p) => 1 - Math.pow(1 - p, 3); // cubic-out
  const tick = (now) => {
    const p = Math.min(1, (now - t0) / durMs);
    onFrame(from + (to - from) * ease(p));
    if (p < 1) requestAnimationFrame(tick); else onDone?.();
  };
  requestAnimationFrame(tick);
}
```

**하위호환 체크:** N=1 노드 → `canvas.w=1280`, `cameraLane=0`, 오프셋 0 → 픽셀·동작 기존과 동일.

---

## 절차 2 — `goToScene` 런타임 본문

**목표:** no-op 자리를 레인 패닝으로. **스키마·params 신설 0.**

1. **위치** — `InteractiveStage.tsx:615~617` (현재: `// 장면 개념 미도입(P2). 무시` no-op).
2. **해석** — `params.sceneId`(`schema:171`)를 **목표 레인 인덱스**로 해석. (정수 레인 번호로 쓰는 게 가장 단순. sceneId가 문자열 Id 타입이면 레인 번호로의 매핑 규칙을 한 곳에 두고, 불명확하면 질문.)
3. **동작** — `animateCamera(현 cameraLaneAnimated, 목표레인, DUR, v => setCameraAnimated(v), () => setCameraLane(목표레인))`. 종료 시 정확히 밴드 경계 정렬.
4. **양방향** — 목표 > 현재(우향)·목표 < 현재(좌향) 동일 코드. 음수·범위초과 가드.

**조합 확인:** 기존 트리거로 *"게임 끝 → 옆 레인"* 표현 가능해야 함 — 예: `{ trigger:'afterComplete', then:[goToScene 행동 id] }`. 새 배선 불필요.

---

## 절차 3 — 확장 콘텐츠를 노드 내부로

**목표:** "확장" 클릭이 MyBoard sticky를 만들지 않고, 같은 노드 새 레인에 플레이 가능 활동을 append + 그 레인으로 패닝.

**현재 경로(추적):** `InteractiveOverlay.tsx:822`(✨ 버튼, `mode==='play' && finished`) → 부모 `onExtend` → `InteractiveNodeCard.tsx:159`(`extendInteractiveActivity(title, node.id)`) / `InteractiveGallery.tsx:159~162`. 구현 `composer.ts:1864~1911`.

1. **docId 전달** — `InteractiveNodeCard.tsx:156`에 `docId` 이미 있음. `onExtend` 클로저로 `docId`를 넘기게 함(현재 `title`/`anchorNodeId`만 넘김).
2. **externalize 끊기** — `composer.ts:1877~1886` 제거: `b.addNodeRaw({type:'sticky', ...})`(보드 노드 생성) + `setSelection`+`focusNode`(전역 카메라). 이 둘이 MyBoard로 새는 지점.
3. **새 레인 append** — 대신:
   - `canvas.size.w += 1280` (레인 1개 증설, N→N+1).
   - 새 밴드 `x ∈ [N·1280, (N+1)·1280)`에 확장 콘텐츠 요소 배치.
   - `useInteractiveStore.getState().mutate(docId, draft => { ...append... })`로 커밋(영속·undo 1급 자동).
4. **콘텐츠 생성** — 확장 레인은 *플레이 가능 활동*이므로 `composeInteractiveNode`(`composeNode.ts:258`) 재사용. **`task:'plan'` 마크다운 경로(`composer.ts:1889~1908`)는 버림.**
   - ⚠ **배관만.** "무슨 확장 게임인가"의 프롬프트 결정은 v0.2. 지금은 `composeInteractiveNode`를 호출해 새 밴드를 채우는 *자리*만 만든다. 프롬프트 소스는 v0.2가 주입할 수 있게 인자/훅으로 열어둘 것(하드코딩 금지).
5. **패닝** — append 후 `goToScene(N)`(절차 2)으로 새 레인으로 이동.
6. **로딩** — 생성 비동기 동안 새 밴드에 `loadingDoc` 스켈레톤 표시 여부는 구현 중 결정(스펙 §8-4). 패닝 타이밍(로딩 전/후)도 함께.

**전역 미오염 체크:** 이 경로가 MyBoard `viewport.panX`(`boardStore.ts:67`)를 절대 만지지 않아야 함. 모든 카메라 이동은 노드 로컬 `cameraLane`으로만.

---

## 새 레인을 추가하는 법 (요약 레시피)

엔진/확장 어디서든 레인 1개 증설 시:
```
1. canvas.size.w += 1280
2. 새 요소들의 x를 [N·1280, (N+1)·1280) 밴드에 배치 (기존 1280×800 레이아웃을 +N·1280 평행이동)
3. mutate(docId)로 커밋
4. goToScene(N)으로 패닝
```

---

## 회귀 점검 (매 절차 후)

- 단일 레인(N=1) 노드: 픽셀·동작 불변.
- 기존 Behavior(애니·reveal·count·speak 등): 레인 도입과 무관하게 그대로.
- undo: 레인 추가 1회 undo로 직전 상태 복귀.
- 전역 보드 viewport: 노드 내부 조작에 불변.
