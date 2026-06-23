# PROMPTS.md — Resolver 구현 프롬프트

> **게이트:** 레인 인프라 v1.0이 코드로 완성된 뒤 착수(레인이 있어야 채움). 생성 내부 조사는 완료됨.
> Claude Code에 **순서대로** 투입. `CLAUDE.md`·`SKILL.md`·`docs/kinderverse-game-engine-spec-v0.2.md`가 레포에 있다고 가정.
> 공통: 구현 전 해당 파일 직접 확인. **`composeInteractiveNode` 호출 금지**(폴백 전용). export 꼬리만 사용. 참조무결성 완비. 레인 통합 규칙 준수. 새 프리미티브 만들지 말 것. 불확실하면 파일:라인과 함께 질문.

---

## 프롬프트 1 — Recipe 타입 + 네이티브 3종

```
[작업] Resolver 1/6 — Recipe 타입 + 네이티브 메커니즘 3종

CLAUDE.md, SKILL.md(청사진 A/path-trace/pair-match), docs/...-v0.2.md를 읽어줘.
게이트 확인: 레인 인프라 v1.0이 코드로 완성됐는지 먼저 확인. 아니면 멈추고 보고.

목표: 메커니즘 레시피를 결정론으로 조립하는 Recipe 타입을 세우고, B에 이미 다 있는
네이티브 3종부터 구현한다(거의 무작업, 빠른 검증).

구현:
1. Recipe 인터페이스 — params(items[], count, themeVocab 등) → InteractiveNode 조립.
   구조(behaviors/connections/state)는 결정론, 위치는 생략(autoLayout에 위임).
2. 네이티브 3종을 SKILL.md 청사진대로:
   - sequence-order = 청사진 A (Connection(order) + sequenceTap + count + moveAlongPath +
     when counter>=N). count 액션 누락 절대 금지(완료 불능 버그).
   - path-trace = Connection(path) + pathTraverse + moveAlongPath.
   - pair-match = Connection(link) + pathTraverse + reveal/count.
3. 각 레시피는 참조무결성 완비(SKILL.md 체크리스트): behavior.target·connection.from/to·
   when.counterId·then 체인·params.connectionId 전부 존재하는 id로 코드 생성.

이 단계엔 꼬리 호출/레인 통합 없이, 레시피가 유효한 InteractiveNode 객체를 반환하는지까지.

절대 금지: composeInteractiveNode 호출, 새 트리거/액션, B 스키마/엔진 변경.

수용 기준:
- [ ] 세 레시피가 항목 수 파라미터로 동일 배선 InteractiveNode를 결정론 생성
- [ ] 생성 노드가 safeParseInteractiveNode를 통과(참조무결성)
- [ ] sequence-order에 count + when counter>=N 완료 경로가 항상 존재

끝나면 변경 파일:라인 보고.
```

---

## 프롬프트 2 — 결정론 assemble + 꼬리 재사용 + 레인 통합 (엔드투엔드)

```
[작업] Resolver 2/6 — 꼬리 재사용 + 레인 배치 (한 레시피 보드 검증)

선행: 1/6 통과. CLAUDE.md(레인 통합 규칙), SKILL.md(꼬리 호출 순서)를 읽어줘.

목표: 1/6의 레시피 노드를 B의 export된 결정론 꼬리에 태우고, 레인 인프라 밴드에
실제로 배치해 보드에서 한 게임이 플레이되게 한다.

구현 (SKILL.md 꼬리 호출 순서대로):
1. fillTokenImages(node) — element.src "gen:라벨"을 실제 이미지+온디바이스 누끼로.
   (autoLayout/fillTokenImages/safeParseInteractiveNode는 export됨. composeInteractiveNode/
   buildNode는 호출 금지.)
2. autoLayout(node) — 역할대로 배치.
3. safeParseInteractiveNode(node) — 검증.
4. 레인 배치 — 🔴 규칙: 위 꼬리는 레인 1개짜리 독립 1280 게임에만 돌린다. 그 다음
   +targetLane*1280 평행이동으로 밴드에 머지. 다중 레인 노드 전체에 forceShape/autoLayout
   재실행 금지(캔버스 1280 리셋 → 전 레인 뭉개짐). 초기 게임은 레인 0(평행이동 0).
5. store.mutate(docId, ()=>node)로 커밋.

검증: sequence-order 레시피 하나를 보드 빈 노드에 생성 → 실제 플레이(순서 강제·세기·
완료) 확인.

절대 금지: composeInteractiveNode 호출, 꼬리 함수 내부 수정, 다중 레인 노드에 꼬리 재실행.

수용 기준:
- [ ] 레시피 게임이 보드에서 정상 플레이(순서·완료 동작)
- [ ] gen: 이미지가 실제 에셋으로 채워짐
- [ ] 레인 0 게임이 단일 1280 밴드만 차지
- [ ] store.mutate로 영속 + undo 동작

끝나면 변경 파일:라인 + 검증 방법 보고.
```

---

## 프롬프트 3 — 조합 메커니즘 4종

```
[작업] Resolver 3/6 — 조합 메커니즘 (tap-select, branch-choose, combine, memory-flip)

선행: 2/6 통과. SKILL.md(청사진 C + 나머지 유추표)를 읽어줘.

목표: 기존 프리미티브 배선으로 4종 추가.
- tap-select(+find-it) = 청사진 C (연결 없음, 정답 item에 tap→count, when counter>=K).
  find-it 변형 = 장면 속 핫스팟 요소에 동일.
- branch-choose = tap on choice → setFlag + swap/reveal(결과) + speak. 분기 flag 조건.
  (goToScene 쓰지 마라 — 그건 레인 패닝.)
- combine = item A pathTraverse→B, when(둘 다) → swap(→C) + count.
- memory-flip = 카드 swap(뒤↔앞) + tap + flag/counter 매칭.

각 레시피 참조무결성 완비. 2/6의 꼬리 호출+레인 배치 재사용.

수용 기준:
- [ ] 4종 각각 safeParse 통과 + 보드 플레이 + 완료 도달
- [ ] branch-choose가 goToScene 아닌 swap/reveal로 분기

끝나면 보고.
```

---

## 프롬프트 4 — sort-to-bin · slot-fill (드래그 분류)

```
[작업] Resolver 4/6 — 드래그 분류 (sort-to-bin, slot-fill)

선행: 3/6 통과. SKILL.md(청사진 B + dragSortBeh 발동 조건)를 읽어줘.

목표: 드래그 분류 2종. 조사로 현재 프리미티브로 가능 확인됨(하이브리드 드롭).
- sort-to-bin = 청사진 B (bin=shape, item=image, Connection(path) item→정답 bin,
  item: tap→moveAlongPath+afterComplete count, win: reveal when counter>=N).
- slot-fill = 청사진 B와 동일 구조, bin을 빈칸 요소로 교체.

⚠ 필수: 드래그-분류 발동 조건(dragSortBeh, InteractiveStage.tsx:468-476) — 항목이
moveAlongPath + tap/sequenceTap 트리거를 갖고 2종 이상이어야 드래그로 인식. 레시피가
이 조건을 만족하도록 항목 behavior를 구성. 통(bin) 같은 큰 shape는 autoLayout이 무참조
시 삭제하므로 반드시 연결을 달 것.

판정 동작 확인: hitConnectedAt(:890-906)이 드롭 지점의 연결된 통만 인정, 틀린 통/빈 곳은
제자리 복귀(:960-1004).

수용 기준:
- [ ] sort-to-bin이 드래그-분류로 동작(탭 자동이동 아님), 정답 통만 인정
- [ ] 틀린 통/빈 곳 드롭 시 제자리 복귀
- [ ] safeParse 통과 + 완료(counter>=N) 도달
- [ ] bin shape가 autoLayout에 삭제되지 않음(연결 보유)

끝나면 보고.
```

---

## 프롬프트 5 — selectRecipe + 동사 매핑 + 폴백

```
[작업] Resolver 5/6 — 의도 라우팅 (동사→레시피, 테마 충전, 롱테일 폴백)

선행: 4/6 통과. docs/...-v0.2.md(§5 동사 매핑, §6 테마팩, §8 파이프라인)를 읽어줘.

목표: 교사 의도를 레시피로 라우팅하고 내용을 채운다.
1. selectRecipe(verb) — 동사→메커니즘 매핑(§5 표). 동사 추출 + 명사(테마)+영역.
2. fillSlots — 테마팩 vocab 우선(결정론). 부족분만 narrow LLM 콜(내용만: 라벨/정답집합).
   구조는 절대 LLM에 안 보냄. 캐시(키=메커니즘+테마+학습목표).
3. 연령→난이도(만3:3-4 / 만4:5-8 / 만5:8-12 항목), 인원→레이아웃 기본값 적용.
4. 폴백 — selectRecipe 실패(롱테일)면 기존 composeInteractiveNode(전체 LLM) 그대로 호출.
   (레시피 경로에서만 composeInteractiveNode 금지 — 폴백은 명시적 폴백이라 허용.)

수용 기준:
- [ ] "크리스마스 선물 분류하기" → sort-to-bin + 크리스마스 테마로 즉시 합성
- [ ] 테마 vocab으로 채워지는 항목은 LLM 콜 없이 결정론
- [ ] 레시피 없는 의도는 composeInteractiveNode 폴백으로 처리

끝나면 보고.
```

---

## 프롬프트 6 — free-create + 레인 훅 + 기본 body

```
[작업] Resolver 6/6 — free-create(프리셋) + 레인 인프라 접속

선행: 5/6 통과 + 레인 인프라 v1.0 완성. CLAUDE.md(접속점), SKILL.md(free-create 재정의)를
읽어줘.

목표:
1. free-create(우선순위 낮음) — 자유 배치 X. 프리셋 슬롯 꾸미기: 슬롯 요소에 tap →
   swap으로 테마 옵션 순환(얼굴/옷/색). 승리조건 없음. (진짜 자유배치 샌드박스는 보류 —
   신규 프리미티브 필요, 만들지 마라.)
2. 레인 훅 접속 — 인프라 PROMPT 3에서 열어둔 "확장 프롬프트 소스" 훅에 Resolver를 연결.
   "확장" 클릭 시 Resolver가 다음 레인 콘텐츠(독립 1280 게임)를 생성 → 인프라가 +N*1280
   밴드에 배치 + goToScene 패닝.
3. 레시피별 기본 body(ExtendActivity) 매핑 — 각 메커니즘의 기본 후속 레시피를 정의해
   hook→body→연계 hook 사슬 공급. 예: sort-to-bin(hook) → "우리 반 물건 분류"(free-create
   body) → "분류한 걸로 패턴"(sequence-order 연계).

수용 기준:
- [ ] free-create가 프리셋 swap으로 동작(자유 배치 아님)
- [ ] "확장" 클릭이 Resolver 경유로 다음 레인을 플레이 가능 게임으로 채움(마크다운 아님)
- [ ] 레시피별 기본 body가 연결돼 hook→body 사슬이 한 노드 안에서 흐름

끝나면 보고.
```

---

## 완료 후

6단계 통과 시 v0.2 Resolver 완성 — 교사 의도가 레인 위에서 결정론 게임으로 즉시 합성되고,
hook→body→연계 사슬이 노드 내부 가로로 흐른다. 추천 스트립 UX(프롬프트 바 위 카드·즉시
합성 표출)는 별도 후속.
