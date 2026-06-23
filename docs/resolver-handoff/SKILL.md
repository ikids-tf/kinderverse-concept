# SKILL.md — 레시피 작성 절차

> 메커니즘 레시피의 *어떻게*. `CLAUDE.md`(무엇·규칙)와 함께. 청사진은 B 실동작 게임 덤프에서 추출 — **검증된 정답 배선**이니 그대로 본떠라.

---

## 레시피 = 구조(결정론) + 내용(슬롯)

```
Recipe(params) → InteractiveNode {
  elements   : 요소 (도형/이미지/텍스트) — 위치는 보통 생략(autoLayout이 배치)
  behaviors  : 트리거→액션 배선 (이게 메커니즘. 결정론)
  connections: path/link/order (메커니즘이 요구할 때만)
  counters/flags: 완료·상태
}
params = { items[], answerKey, count, themeVocab, ... }  // 내용만 가변
```

구조는 항목 수만 다른 **동일 배선의 반복**이다. 레시피 = 메커니즘 템플릿 + 항목 루프.

---

## 청사진 — 실데이터에서 추출한 정답 배선 3종

### 청사진 A — sequence-order (순서 강제 + 세기 + 액터 이동)
출처: "다람쥐 도토리 세기" (= `composeNode.ts` FEWSHOT "개구리 점프 세기"와 동일 = 정규 템플릿).

```
elements: title, actor(image), item_1..N(image), win(text)
connections: kind:'order'  actor→item_k  (액터→각 항목, k=1..N)
behaviors:
  win:     trigger sceneEnter → hide[win]
  item_k:  trigger sequenceTap → count{cnt,+1}, then:[move_k]      // 순서대로만 발동
  move_k:  target actor, trigger afterComplete → moveAlongPath{conn_k}, then:[speak_k]
           (마지막 move_N then:[speak_N, showwin])
  speak_k: target item_k, trigger afterComplete → speak(bubble)
  showwin: target win, trigger afterComplete → reveal[win], when counter cnt>=N   // 완료
counters: cnt(initial 0)
```
핵심: `sequenceTap`이 connection 라벨순 강제(seqOrder :434-441). `count` + `when counter>=N`이 완료. **count 액션을 빠뜨리면 완료 불능**(LLM이 저질렀던 버그 — ASSEMBLER는 코드로 항상 첨부).

### 청사진 B — sort-to-bin (드래그 분류)
출처: "숲속 곤충 찾기".

```
elements: title, bin_1..M(shape, 라벨), item_1..N(image), win(text)
connections: kind:'path'  item_k→정답 bin   (각 항목 → 자기 정답 통)
behaviors:
  win:    sceneEnter → hide[win]
  item_k: trigger tap → moveAlongPath{conn_k}, then:[speak_k]
          + afterComplete → count{cnt,+1}, then:[win체크]
  win체크: reveal[win] when counter cnt>=N
counters: cnt
```
⚠ **드래그-분류 발동 조건**(`dragSortBeh` InteractiveStage.tsx:468-476): 항목이 `moveAlongPath` + `tap`/`sequenceTap` 트리거를 갖고 **2종 이상**이어야 드래그-분류로 인식(탭 자동이동 비활성, 드래그로만). 1종이면 발동 안 함.
판정(`hitConnectedAt` :890-906): 드롭 좌표에 겹친 요소 중 **연결된 통**이면 성공(`count`+`hide`), 아니면 제자리(틀린 통/빈 곳).

### 청사진 C — tap-select (정답 고르기, 연결 없음)
출처: "과일만 찾아요!".

```
elements: title, item_1..N(image; 정답/오답 섞임), win(text)
connections: []   // 불필요
behaviors:
  win:        sceneEnter → hide[win]
  정답_item:  trigger tap → count{cnt,+1}, then:[animate(grow/bounce)]
  완료:       reveal[win] when counter cnt>=K   // K=정답 개수
  (오답_item: 동작 없음 또는 trigger tap → animate(shake))
counters: cnt
```

---

## 나머지 메커니즘 — 청사진 유추

| 메커니즘 | 본뜨기 |
|---|---|
| **path-trace** | 청사진 B 변형 — `Connection(path)` + `pathTraverse` 트리거 + `moveAlongPath`(캐릭터를 경로 따라). 통 대신 목표 지점 |
| **pair-match** | `Connection(link)` left↔right + `pathTraverse`; 유효쌍 `reveal`+`count`, 완료 `when counter>=쌍수` |
| **slot-fill** | 청사진 B와 **구조 동일** — 통(bin)을 빈칸 요소로 교체, 조각→정답 빈칸 path 연결 |
| **branch-choose** | `tap` on choice → `setFlag` + `swap`/`reveal`(결과 비주얼) + `speak`(피드백). 분기는 flag 조건. (goToScene 아님 — 그건 레인 패닝) |
| **combine** | item A `pathTraverse`→B, `when(A·B 존재 flag)` → `swap`(target→C) + `count` |
| **memory-flip** | 카드 `swap`(뒤↔앞), `tap`으로 뒤집기, flag/counter 매칭, 매치 `reveal`/lock·불일치 `swap` back |
| **free-create**(재정의) | 자유 배치 X. **프리셋 슬롯**: 슬롯 요소에 `tap` → `swap`으로 테마 옵션 순환(얼굴/옷/색). 승리조건 없음 |

---

## 참조무결성 체크리스트 (`safeParse` 통과 필수)

레시피가 노드를 내보내기 전 코드로 보장:
- [ ] 모든 `behavior.target`이 존재하는 element id
- [ ] 모든 `connection.from`/`to`가 존재하는 element id
- [ ] 모든 `when.counterId`/`flagId`가 선언된 Counter/Flag
- [ ] 모든 `params.targets`/`connectionId`가 존재
- [ ] `then:[id]` 체인의 모든 id가 존재하는 behavior
- [ ] 완료 경로 존재: `count` 액션 + `when counter>=N` `reveal`이 실제로 도달 가능

ASSEMBLER가 항목 루프로 id를 생성하므로 위는 구조적으로 보장됨 — 이게 LLM 대비 핵심 이점.

---

## autoLayout 활용 (배치)

`classify()`(layout.ts:37-78)가 behavior/connection/text/size로 역할 판정 후 좌표를 **무조건 덮어씀**:

| 역할 | 판정 | 배치 |
|---|---|---|
| actors | `moveAlongPath` 대상 | 전경 대형 250px, 하단 |
| play | `tap`/`sequenceTap` 대상 | 그리드 또는 scatter |
| overlay | `sceneEnter hide` 대상·축하 텍스트 | 중앙 |
| labels | 짧은 text(≤4자) | play 항목 아래 |
| title | 가장 긴/위 text | 상단 중앙 y=40 |
| dropShapes | 캔버스 60%↑ shape + 무참조 | **삭제** |

**레시피 전략:** behavior/connection/text를 정확히 주면 **위치를 안 줘도 역할대로 배치**된다 → 위치 생략하고 autoLayout에 맡겨라(단순·안정). 정확한 수동 배치가 필요하면 autoLayout을 호출하지 않는다(edit 경로가 그렇게 함). 주의: 큰 무참조 shape는 삭제되니 통(bin)에는 반드시 연결을 달 것.

---

## 꼬리 호출 순서 (레시피 → 노드)

```
1. assemble(recipe, theme, content)  → 손제작 InteractiveNode 스켈레톤 (1280×800, 위치 생략 가능)
2. fillTokenImages(node)             → element.src "gen:라벨"을 실제 이미지+온디바이스 누끼로
3. autoLayout(node)                  → 역할대로 배치 (수동배치 원하면 생략)
4. safeParseInteractiveNode(node)    → zod + 참조무결성 검증 (실패 시 레시피 버그 — 고침)
5. [레인 통합] +targetLane*1280 평행이동 → 다중 레인 노드에 머지
6. store.mutate(docId, ()=>merged)   → 커밋 (undo 1급)
```

`forceShape`/`clampNode`는 사소 — 인라인 또는 생략. **`composeInteractiveNode`/`buildNode`는 호출 금지**(LLM 포함, buildNode 미export).

---

## 🔴 레인 통합 (CLAUDE.md 규칙 재확인)

꼬리(2~4)는 **레인 1개짜리 독립 1280 게임에만** 돈다. 그 뒤 5에서 `+N*1280` 평행이동으로 밴드에 꽂는다. **다중 레인 노드 전체에 forceShape/autoLayout 재실행 금지**(캔버스 1280 리셋 → 전 레인 뭉개짐).

---

## 내용 슬롯 충전 (구조/내용 분리)

- **테마 vocab 우선(결정론):** 항목 라벨·이미지 프롬프트(`gen:라벨`)를 테마팩 어휘 풀에서.
- **부족분만 narrow LLM:** "8개 곤충 라벨"·"정답 집합 분류" 같은 *내용*만. 구조는 절대 LLM에 안 보냄. 캐시(키=메커니즘+테마+학습목표).
- **에셋:** `gen:라벨`이 `fillTokenImages`에서 자동 생성(비동기) — 신규 0.

---

## 회귀 점검 (매 레시피)

- `safeParse` 통과(참조무결성).
- 완료 도달 가능(`count` + `when>=N`).
- 단일 레인 게임이 보드에서 정상 플레이.
- 레인 통합 후 다중 레인에서 해당 밴드만 차지(다른 레인 불변).
