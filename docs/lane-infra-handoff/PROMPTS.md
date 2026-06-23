# PROMPTS.md — 레인 인프라 구현 프롬프트

> Claude Code에 **순서대로** 투입. 각 프롬프트는 직전 단계가 통과된 뒤 실행. `CLAUDE.md`·`SKILL.md`·`docs/kinderverse-lane-infrastructure-spec-v1.0.md`가 레포에 있다고 가정.
> 공통 규칙: 구현 전 해당 파일을 직접 읽고 현재 코드를 확인. 불확실하면 추측하지 말고 파일:라인과 함께 질문. `CLAUDE.md`의 "절대 건드리지 말 것"을 위반하지 말 것.

---

## 프롬프트 1 — 카메라 오프셋 인프라

```
[작업] Interactive Viewer 레인 인프라 1/3 — 가로 카메라 오프셋

CLAUDE.md, SKILL.md(절차 1), docs/kinderverse-lane-infrastructure-spec-v1.0.md(§4-2)를
먼저 읽어줘.

목표: InteractiveStage에 "한 번에 한 레인(1280px)만 보이는 가로 카메라"를 도입한다.
레인 = 넓은 캔버스의 1280px x-밴드. cameraLane=0이면 기존과 픽셀·동작 완전 동일이어야 함.

구현 (정확히 이 범위만):
1. InteractiveStage.tsx:199 근처 — useStageFit에 넘기는 콘텐츠 폭을 전체 canvas.w에서
   레인폭 1280(LANE_W 상수)으로 변경. 컨테이너 대비 한 레인이 꽉 차도록 scale 산출.
2. cameraLane state(정수, 기본 0) + 애니메이션용 보간값(cameraLaneAnimated) 추가.
3. InteractiveStage.tsx:201 — tx 계산에 가로 오프셋 가산:
   tx 최종 = (기존 중앙정렬 tx) - cameraLaneAnimated * LANE_W * scale.
   적용부(:1312 transform: translate(tx,ty) scale(scale))는 변경하지 말 것 — tx 값만 바뀜.
4. rAF + cubic-out 이징 헬퍼를 InteractiveStage 안에 로컬로 추가(SKILL.md 골격 참고).
   ⚠ workflow.ts의 slideFrameToEmpty를 import해서 호출하지 마라 — 그건 MyBoard 전역
   viewport를 만진다. 패턴만 복제.

절대 금지:
- 스키마(interactiveNode.ts) 변경
- Behavior 엔진/트리거/액션/조건 변경
- MyBoard 전역 viewport(boardStore.ts)·slideFrameToEmpty 원본 수정
- :1312 적용부 구조 변경

수용 기준:
- [ ] N=1(canvas.w=1280) 노드가 cameraLane=0에서 기존과 픽셀·동작 동일하게 렌더
- [ ] canvas.w를 2560(2레인)으로 임시 세팅 시, 한 번에 정확히 한 레인(1280)만 화면을 채움
- [ ] cameraLaneAnimated를 0→1로 보간하면 캔버스가 cubic-out으로 부드럽게 좌측 슬라이드,
      종료 시 두 번째 밴드[1280,2560)가 정확히 화면에 정렬
- [ ] MyBoard 전역 viewport.panX 불변

이 단계에서 goToScene·확장은 건드리지 마라(2/3, 3/3에서).
끝나면 변경 파일:라인과 수동 검증 방법을 보고해줘.
```

---

## 프롬프트 2 — goToScene 런타임 본문

```
[작업] Interactive Viewer 레인 인프라 2/3 — goToScene로 레인 패닝

선행: 1/3(카메라 오프셋) 통과 상태. CLAUDE.md, SKILL.md(절차 2),
docs/...-v1.0.md(§4-3)를 읽어줘.

목표: 이미 스키마에 존재하나 런타임이 no-op인 goToScene 액션을 "대상 레인으로 카메라
패닝"으로 구현한다. 새 트리거·새 액션·새 params 스키마를 만들지 마라.

구현:
1. InteractiveStage.tsx:615~617 — 현재 goToScene no-op(주석: 장면 개념 미도입) 교체.
2. params.sceneId(schema:171)를 목표 레인 인덱스로 해석. sceneId가 정수 레인 번호로
   쓰이도록 한다. 만약 sceneId의 타입이 문자열 Id여서 레인 번호 매핑이 모호하면,
   추측하지 말고 매핑 규칙을 질문해줘.
3. 1/3의 이징 헬퍼로 cameraLaneAnimated를 현재값→목표레인으로 애니메이트,
   종료 시 cameraLane=목표레인 확정(밴드 경계 정확 정렬).
4. 양방향(목표>현재 우향, 목표<현재 좌향) 동일 처리 + 음수/범위초과 가드.

검증용 임시 셋업: afterComplete 또는 tap 트리거 → goToScene(sceneId=1) 행동을
연결해 "게임 끝/탭 → 옆 레인 패닝"이 새 배선 없이 표현되는지 확인.

절대 금지: 1/3과 동일(스키마·엔진·전역 viewport 무변경).

수용 기준:
- [ ] goToScene(sceneId=1) 발화 시 카메라가 레인1로 부드럽게 이동, 경계 정확 정렬
- [ ] goToScene(sceneId=0) 발화 시 좌향 복귀 동작
- [ ] 기존 트리거(afterComplete/tap)와 조합으로 동작(새 트리거/액션 추가 0)
- [ ] 범위 밖 sceneId에 안전(크래시·이탈 없음)

끝나면 변경 파일:라인 보고.
```

---

## 프롬프트 3 — 확장 콘텐츠를 노드 내부 레인으로

```
[작업] Interactive Viewer 레인 인프라 3/3 — 확장 내부화(MyBoard externalize 차단)

선행: 1/3·2/3 통과. CLAUDE.md, SKILL.md(절차 3), docs/...-v1.0.md(§4-4)를 읽어줘.

목표: "✨ 확장" 클릭이 MyBoard에 sticky 노드를 만드는 현재 동작을 끊고, 대신 같은
인터렉티브 노드에 새 레인을 추가해 플레이 가능한 확장 활동을 채운 뒤 그 레인으로
패닝한다. 모델 2(무한 성장): 확장할 때마다 우측에 레인 1개 append.

현재 경로(먼저 읽고 확인):
- 진입: InteractiveOverlay.tsx:822(✨ 버튼) → onExtend → InteractiveNodeCard.tsx:159
  (extendInteractiveActivity(title, node.id)) / InteractiveGallery.tsx:159~162
- 구현: composer.ts:1864~1911

구현:
1. docId 전달 — InteractiveNodeCard.tsx:156에 docId가 이미 있음. onExtend 클로저가
   docId를 받도록 배선(현재 title/anchorNodeId만).
2. externalize 끊기 — composer.ts:1877~1886 제거:
   b.addNodeRaw({type:'sticky', ...})(보드 노드 생성) + setSelection+focusNode(전역 카메라).
   이 둘이 MyBoard로 새는 지점.
3. 새 레인 append — 대신:
   - 대상 노드 canvas.size.w += 1280 (N→N+1)
   - 새 밴드 x ∈ [N·1280, (N+1)·1280)에 콘텐츠 배치(기존 1280×800 레이아웃 +N·1280 평행이동)
   - useInteractiveStore.getState().mutate(docId, draft => { ...append... })로 커밋
4. 콘텐츠 생성 — composeInteractiveNode(composeNode.ts:258) 재사용(플레이 가능 활동).
   task:'plan' 마크다운 경로(composer.ts:1889~1908)는 사용하지 마라.
   ⚠ 배관만: "무슨 확장 게임을 생성할지"의 프롬프트 결정 로직은 이번 범위 밖(v0.2).
   프롬프트 소스를 하드코딩하지 말고 인자/훅으로 열어둬서 v0.2가 주입 가능하게.
   당장 검증용으로는 플레이스홀더 프롬프트 허용.
5. 패닝 — append 후 goToScene(N)(2/3)으로 새 레인 이동.
6. 로딩 — 생성 비동기 동안 새 밴드에 loadingDoc 스켈레톤 표시 여부 + 패닝 타이밍
   (로딩 전/후)은 네 판단으로 자연스럽게(스펙 §8-4). 결정한 바를 보고에 적어줘.

절대 금지:
- composeInteractiveNode 내부(LLM 계약·결정론 조립) 수정 — 호출만
- MyBoard 전역 viewport 사용(모든 카메라는 노드 로컬 cameraLane)
- 스키마·Behavior 엔진 변경

수용 기준:
- [ ] "확장" 클릭이 MyBoard에 sticky 노드를 생성하지 않음(composer.ts:1877~1886 경로 미발화)
- [ ] 같은 노드에 새 레인이 생기고 플레이 가능 콘텐츠가 채워짐
- [ ] append 후 카메라가 새 레인으로 패닝(2/3 goToScene 사용)
- [ ] 레인 추가가 store.mutate로 영속, undo 1회로 직전 레인 상태 복귀
- [ ] 반복 "확장" 시 레인이 계속 우측 성장(모델 2)
- [ ] MyBoard 전역 viewport.panX 불변

끝나면 변경 파일:라인 + 로딩/패닝 타이밍 결정 + 수동 검증 방법 보고.
```

---

## 완료 후

3단계 통과 시 인프라 완성 — 레인 컨테이너가 보드에서 동작. 다음은 **v0.2 게임 생성 엔진**
(Behavior 레시피 라이브러리 + 동사 매핑 + 테마팩 + Resolver)이 이 레인 위에서 게임·확장·
연계 콘텐츠를 *무엇으로* 채울지를 정의한다. 인프라가 실제로 도는 것을 확인한 뒤 착수.
