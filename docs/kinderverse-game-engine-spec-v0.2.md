# KinderVerse 게임 생성 엔진(Resolver) 스펙

> **버전** v0.2 · **상태** **구현됨**(2026-06-26 확인) · **대상 레포** `kinderverse-concept`
> **타깃 런타임** Interactive Viewer(B) 단일. **v0.1 폐기 supersede** (v0.1은 폐기된 System A에 매핑돼 무효).
> **선행** 레인 인프라 스펙 v1.0(인프라), B 전수 조사(프리미티브 인벤토리).
> **범위** 레인을 *무엇으로* 채우는가 — 메커니즘 레시피 + 동사 매핑 + 테마팩 + Resolver. (레인을 *어떻게* 추가/패닝하는가는 인프라 v1.0.)
>
> **🔄 최신화 메모(2026-06-26, 코드 기준)**
> - **구현 완료**: Resolver는 `src/features/interactive-viewer/resolver/`(`resolveIntent`·`selectRecipe`·`assemble`·`fillSlots`·`themePacks`·`extend`·`place` 등)에 존재. 메커니즘 프리미티브 계약은 `src/features/interactive-viewer/schema/interactiveNode.ts`(`InteractiveNode`).
> - **메커니즘 명칭은 코드와 일치**: `sequence-order`·`path-trace`·`pair-match`·`tap-select`·`branch-choose`·`combine`·`memory-flip`·`free-create`·`sort-to-bin`·`slot-fill` 모두 B에 구현됨(§4 표 유효). §4-1 드래그 모델 조사는 해소됨(`sort-to-bin`·`slot-fill` 구현 확인).
> - **⚠ 용어 주의 — 'System A(폐기)'는 본 스펙(B 중심) 설계 시점 관점**이다. 별개 모듈 **`src/game-viewer/v2/`(계약 `InteractiveDoc`, 인터랙션 11종) 게임뷰어는 현재도 활성**(CLAUDE.md §8, 보드 '놀이 만들기' iframe `/game-viewer.html`). 즉 "A 폐기"는 *이 B 라인 설계 결정*이지 게임뷰어 v2 모듈 제거를 뜻하지 않는다. 본 문서의 'B' = `src/features/interactive-viewer/`(보드 네이티브 인터랙티브 노드).

---

## 0. 목적 (한 줄)

교사의 자연어 의도를 받아 **B의 실제 Behavior 프리미티브로 조립된 결정론 레시피**로 즉시 게임 노드를 합성하고, 레인 인프라 위에 hook → body → 연계 hook 가로 사슬을 공급한다.

전제: `게임 = 처음부터 생성 X, 레시피 재조합 O`. 흔한 의도는 결정론(즉시·안정), 롱테일만 기존 AI 생성(폴백).

---

## 1. v0.1에서 무엇이 바뀌었나

| | v0.1 (폐기) | **v0.2** |
|---|---|---|
| 타깃 | System A `InteractiveDoc`·`kind` | System B `InteractiveNode`·Behavior |
| 메커니즘 정의 | A의 타입드 `kind`에 매핑(무효) | **B 실제 트리거/액션/조건 조합 = 레시피** |
| 근거 | 이름·글로스 추측 | **B 전수 조사 프리미티브 인벤토리** |
| 출력 | A 게임 노드 + 별도 MyBoard 본활동 | **레인 인프라의 한 레인을 채움** (노드 내부) |
| free-create | "채점 스키마에 안 맞는 예외" | **B 네이티브(승리조건 없는 배치) — 메커니즘 복귀** |

---

## 2. 목표 / 비목표

### 목표
- 교사 요청 다수가 **레시피(결정론)** 로 즉시 합성, AI 구조 생성에 의존하지 않는다.
- 메커니즘이 **B의 실재 프리미티브로만** 표현된다(지어낸 프리미티브 0).
- 각 레시피가 **기본 ExtendActivity(body) 레시피**를 가져 "확장" 시 다음 레인을 자동 공급한다.
- **B 구조 무변경** — 레시피는 B가 이미 렌더하는 노드만 찍는다(프리셋 추가지 재설계 아님).

### 비목표
- **레인 인프라(카메라/goToScene/확장 배관)** — v1.0 소관.
- **realtime 메커니즘(rhythm-tap 등)** — B가 realtime-arcade를 명시적 제외. 보류(격리 런타임, post-v0.2).
- **B 스키마/Behavior 엔진/생성 LLM 계약 변경** — 무변경. Resolver는 기존 결정론 꼬리를 *재사용*만.

---

## 3. 핵심 모델: 메커니즘 = 결정론 Behavior 레시피

```
레시피 = { 트리거[] + 액션[] + 조건[] + Connection[] + State } 의 고정 조합
ComposedGame(레인) = 레시피(구조) + 테마팩(스킨·어휘) + Content(슬롯 충전)
```

- **구조(어떤 behavior, 어떻게 배선)** = 레시피가 **결정론**. LLM이 배선을 짓지 않음 → 불안정 원인 제거.
- **스킨·어휘** = 테마팩.
- **슬롯 충전** = 교육 내용 × 테마 vocab.

---

## 4. 메커니즘 → B 프리미티브 매핑 ★ v0.2의 심장

> 모든 레시피는 B 전수 조사의 **실재 프리미티브**로만 구성. 적합도: ★네이티브(거의 무작업) / ◐조합(기존 프리미티브 배선) / ⚠확인필요 / ✗보류.

| 메커니즘 | 교사 동사 | B 레시피 (실제 프리미티브) | 적합도 |
|---|---|---|---|
| **sequence-order** | 순서·차례 | `Connection(order)` + `sequenceTap`; 정답순서 success, 오답 `animate(shake)` | ★ 네이티브 |
| **path-trace** | 길찾기·경로 | `Connection(path)` + `pathTraverse` + `moveAlongPath` | ★ 네이티브 |
| **pair-match / connect** | 연결·짝 | `Connection(link)` + `pathTraverse`; 유효쌍 `reveal`+`count`, 무효 snap(`animate`) | ★ 네이티브 |
| **tap-select** (+find-it) | 맞히기·찾기·고르기 | `tap` + `when(flag/state)` 정답판정; 정답 `reveal`+`animate(grow/bounce)`+`count`, 오답 `animate(shake)` | ◐ 조합 |
| **branch-choose** | 상황·표현 선택 | `tap` → `setFlag` + `swap`/`reveal`(결과) + `speak`(피드백); 분기는 flag 조건 | ◐ 조합 |
| **combine** | 결합·변신(A+B→C) | `pathTraverse`(A→B) + `when(둘 다)` + `swap`(→C) + `count` | ◐ 조합 |
| **memory-flip** | 기억·뒤집기 | `swap`(앞↔뒤) + `tap` + flag/counter 매칭; 매치 `reveal`/lock, 불일치 `swap` back | ◐ 조합 |
| **free-create** | 꾸미기·만들기 | 테마 팔레트 요소 + 드래그 배치, **승리조건 없음**(behavior 최소) | ◐ 조합(열린결말) |
| **sort-to-bin** | 분류·나누기 | items→bins. **드래그 모델 의존(§4-1)** | ⚠ 확인필요 |
| **slot-fill** | 빈칸 완성 | piece→blank. **드래그 모델 의존(§4-1)** | ⚠ 확인필요 |
| **rhythm-tap** | 리듬·동작 | 타이밍/비트 — realtime-arcade 명시적 제외 | ✗ 보류 |

**효과(라운드 없는 조합):** `reveal`(가림→공개), `highlight`(1.5s), `speak`(말풍선/TTS), `swap`(이미지↔영상). 애니 프리셋 9종(bounce·jump·wiggle·grow·spin·shake·float·fadeIn·fadeOut)이 피드백 어휘.

### 4-1. ⚠ 핵심 확인 — 드래그 모델 (sort-to-bin · slot-fill을 가름)

B의 드래그(`pathTraverse`)는 조사상 **"연결을 따라" 드래그하는 연결-구속 모델**로 보임(`onPathUp 877`, "연결로 드래그"). 그런데 sort-to-bin·slot-fill은 **"N개 중 하나로 자유 드롭 + 위치 판정"** 이 필요하다. B에 free-drop(아무데나 놓고 어느 영역인지 판정)이 있는지가 두 메커니즘의 구현을 가른다:

- **free-drop 있음** → 자연스럽게 분류/빈칸 구현.
- **연결-구속만** → 각 item이 정답 bin으로의 연결을 갖는 형태(난이도↓, "분류"보다 "연결"에 가까움), 또는 free-drop 신규(= B 확장, "재설계 아님" 선과 충돌 가능).

→ **구현 투자 전 조사 필수**(§10 조사 프롬프트 항목 1).

---

## 5. 동사 → 메커니즘 (교사 입력 → 레시피 선택)

교사 동사가 메커니즘을 직접 가리킨다(= 레시피 선택 키). 명사는 테마팩, 영역은 카테고리.

| 동사 | 메커니즘 | | 동사 | 메커니즘 |
|---|---|---|---|---|
| 분류·나누기·모으기 | sort-to-bin | | 완성·빈칸 | slot-fill |
| 순서·차례 | sequence-order | | 꾸미기·만들기·그리기 | free-create |
| 연결·짝 짓기 | pair-match | | 결합·변신 | combine |
| 맞히기·찾기·고르기 | tap-select | | 기억·뒤집기 | memory-flip |
| 길 찾기·경로 | path-trace | | 상황·표현 선택 | branch-choose |

`"크리스마스 선물 분류하기"` → 동사 `분류`=sort-to-bin, 명사 `크리스마스/선물`=테마팩, 영역 `수·수학`=카테고리. **교사 문장이 곧 절반의 스펙.**

---

## 6. 테마팩 — B 에셋 파이프라인과 연결

테마팩 = **에셋 + 테마 어휘 풀**. 합성기는 레시피 슬롯을 `(교육 내용 × 테마 vocab)` 으로 채운다.

```
ThemePack { id, maps{lifeTopics[],seasons[]}, vocabulary, tokens(파스텔 child theme) }
```

**B 연결점:** 테마 vocab의 사물/캐릭터는 B 기존 자산 생성을 재사용 —
- `fillTokenImages`(`artDirect.ts:236`): `src:"gen:라벨"` → image 생성 + **온디바이스 누끼**.
- `generateSceneBackground`: 배경.

즉 테마팩이 "무슨 어휘"를 정하면, 실제 에셋은 B의 기존 `gen:` 파이프라인이 만든다. **에셋 생성 신규 0.** 초기 4팩: 크리스마스 / 할로윈 / 바다 / 여름·물놀이(인프라 스펙 동일).

---

## 7. 핵심 결정 — 레시피/LLM 경계

B 현재 생성은 **전부-LLM**(`composeInteractiveNode` 1콜 → 전체 JSON → 결정론 정리). "즉시·안정"을 위해 흔한 의도는 LLM 창의성에 의존하면 안 된다.

**권장 경계:**

| 조각 | 처리 | 비고 |
|---|---|---|
| **구조**(behavior 배선) | **레시피 = 결정론** | LLM이 배선 안 짓음. 불안정 제거 |
| **내용 슬롯**(항목·라벨·정답) | **테마 vocab 우선(결정론)** → 부족분만 좁은 LLM 콜(캐시) | "8개 항목 라벨" 등 |
| **에셋** | B 기존 `fillTokenImages`(비동기) | 신규 0 |
| **롱테일 폴백** | 레시피 없는 의도 → 기존 `composeInteractiveNode`(전체 LLM) | B 경로 그대로 |

**구현 방식 권장:** 폐기된 A의 `ASSEMBLERS` 패턴처럼 **레시피가 `InteractiveNode` 스켈레톤을 결정론 조립**하되, **B의 기존 결정론 꼬리(`forceShape`/`autoLayout`/`fillTokenImages`/`clampXY`/`mutate`)를 재사용**한다. 즉 LLM 구조 콜을 건너뛰고 `스켈레톤 → B 후처리 → 노드`.

→ 이 재사용 가능 여부(손으로 만든 스켈레톤을 B 후처리에 태울 수 있는가)가 **조사 항목 2**.

---

## 8. Resolver 파이프라인

```
Input: ParsedIntent { verb, themeNoun, domain?, age?, participants?, learningGoal? }

1. recipe   = selectRecipe(verb)                                   // §5 동사→메커니즘→레시피
2. theme    = resolveTheme(themeNoun, currentSeason)               // 명사 + 시즌 폴백
3. content  = fillSlots(recipe.slots, learningGoal, theme.vocab)   // vocab 우선, 부족분 narrow LLM
4. skeleton = assemble(recipe, theme, content, constraints)        // 결정론 InteractiveNode 스켈레톤
5. node     = B후처리(skeleton)                                    // forceShape/autoLayout/fillTokenImages/clamp 재사용
6. commit   = mutate(docId, 레인밴드에 node)                       // 인프라 v1.0 레인에 배치
```

**연령 → 난이도(기본값):** 만3(items 3~4) / 만4(5~8) / 만5(8~12). **인원 → 레이아웃:** 개인·2인 교대·전체(전자칠판 대형 타겟).
**폴백:** `selectRecipe` 실패(롱테일) → 기존 `composeInteractiveNode`(§7).

---

## 9. 레인 인프라와의 접속점

v0.2 Resolver와 인프라 v1.0이 만나는 곳:

- **인프라**가 "어떻게 레인 추가·패닝"(canvas.w += 1280, goToScene), **v0.2**가 "그 레인을 무엇으로 채울지" 공급.
- 만나는 지점 = 인프라 **PROMPT 3에서 열어둔 훅**("확장 프롬프트 소스를 인자/훅으로 열어둬, 하드코딩 금지"). v0.2 Resolver가 그 소스다.
- **ExtendActivity = 레시피의 기본 body 레시피.** 각 메커니즘이 기본 후속(body)을 가짐 → "확장" 클릭 시 Resolver가 다음 레인 콘텐츠 생성. 예: sort-to-bin(hook) → body "우리 반 물건 분류"(free-create) → 연계 hook "분류한 걸로 패턴 만들기"(sequence-order).

즉 hook → body → 연계 hook 가로 사슬을 v0.2가 레시피별 기본값으로 공급하고, 인프라가 레인으로 펼친다.

---

## 10. 열린 질문 + 구현 전 조사 (1건)

구현(레시피 라이브러리) 착수 전, B 생성 내부를 한 번 더 조사해야 한다 — 인프라 때처럼 추측 방지. 아래 프롬프트를 Claude Code에 투입.

```
[작업] Interactive Viewer(B) 생성 내부 조사 — Resolver 레시피 정밀화

확정: 게임 생성 엔진은 B 단일 타깃. 메커니즘을 B 실제 Behavior 프리미티브 레시피로
조립한다(인벤토리는 기존 조사 보유). 구현 전 아래 내부를 확인해야 레시피가 유효한
노드를 찍는다. 구현 아님 — 조사·정리. 추측 금지, 파일:라인 인용, 불확실하면 질문.

조사 항목:
1. ★ 드래그 모델 — pathTraverse가 "연결을 따라"만 되는 연결-구속인가, 아니면 임의
   위치 자유 드롭 + 영역 판정(free-drop)이 가능한가? onPathUp(877~) 로직 확인.
   sort-to-bin·slot-fill(N개 중 하나로 드롭)이 현재 프리미티브로 표현 가능한지,
   불가하면 무엇이 빠졌는지. (이게 두 메커니즘 구현을 가름.)
2. ★ 결정론 후처리 재사용 — composeInteractiveNode(composeNode.ts:258)의 출력
   InteractiveNode JSON의 정확한 형태(완전 예시 1개). forceShape/autoLayout/
   fillTokenImages/clampXY가 입력에 무엇을 기대하나. LLM 콜을 건너뛰고 손으로 만든
   InteractiveNode 스켈레톤을 이 결정론 꼬리에 직접 태울 수 있는가? (= 레시피가
   ASSEMBLER처럼 동작 가능한지.)
3. autoLayout 역할 분류 — layout.ts:81이 요소를 어떤 역할로 분류·배치하나. 레시피가
   요소에 역할 힌트를 줘야 하나?
4. 완전 워크드 예시 — 현재 동작하는 게임 노드 1~2개의 전체 데이터(요소 + behaviors +
   connections + state)를 덤프. 특히 sequenceTap(순서)·tap(정답판정)·pathTraverse가
   실제로 어떻게 배선돼 있는지 — 레시피의 정답 청사진.
5. 내용 생성 분리 — composeInteractiveNode에서 "구조"와 "내용(라벨/정답)"이 코드상
   분리돼 있나, 한 LLM 콜에 뭉쳐 있나? 분리돼 있으면 구조=레시피, 내용=narrow LLM로
   가르기 쉬움.

산출물(마크다운):
- 드래그 모델 결론 + sort-to-bin/slot-fill 표현 가능 여부(가능하면 방식, 불가면 갭)
- InteractiveNode 완전 예시 + 결정론 꼬리 입력 계약
- 손제작 스켈레톤 → B 후처리 직접 투입 가능 여부(yes/no + 근거)
- autoLayout 역할 분류 요약
- 워크드 예시 1~2개(순서·정답판정·드래그 배선)
- 구조/내용 분리 여부
- 권장 1개: 레시피를 (a) 결정론 ASSEMBLER로 / (b) 제약 프롬프트로 composeInteractiveNode
  유도로 — 코드 근거 기반 추천(옵션 나열 말고).
```

**그 외 열린 질문(조사 후/구현 중):**
| # | 질문 | 시점 |
|---|---|---|
| A | memory-flip·combine를 v1 레시피에 포함할지(완전 구현이지만 A 출신) vs 후순위 | 조사 후 |
| B | narrow LLM 콜의 캐시 키·재사용 정책 | 구현 중 |
| C | 레시피별 기본 body(ExtendActivity) 매핑표 — 교육적 연계(hook→body→연계) | v0.2 후속 |

---

## 11. Claude Code 핸드오프 (조사 통과 후)

표준 3-파일. **단, §10 조사 통과 + 인프라 v1.0 구현 완료가 선행.**

- **CLAUDE.md** — B 단일·A 폐기, 메커니즘=실제 프리미티브 레시피, 레시피/LLM 경계(§7), B 무변경 원칙, 레인 인프라 훅 접속(§9).
- **SKILL.md** — 레시피 추가하는 법(트리거/액션/조건 조합 → 스켈레톤), 테마팩 추가하는 법, narrow LLM 슬롯 충전 패턴.
- **PROMPTS.md** — 구현 순서:
  1. `Recipe` 타입 + **네이티브 3종**(sequence-order·path-trace·pair-match)부터 — 거의 무작업, 빠른 검증.
  2. 결정론 `assemble` + B 후처리 재사용(조사 항목 2 결과 반영).
  3. **조합 5종**(tap-select·branch-choose·combine·memory-flip·free-create).
  4. 드래그 모델 결론 반영해 **sort-to-bin·slot-fill**(조사 항목 1).
  5. `selectRecipe` + 동사 매핑 + 테마팩 충전 + 폴백.
  6. 레인 훅 접속(인프라 PROMPT 3 훅에 Resolver 연결) + 레시피별 기본 body.

---

### 변경 이력
- v0.2 — System B 재기반. v0.1(A 매핑) supersede. 메커니즘→실제 프리미티브 매핑, 동사 매핑, 테마팩-B에셋 연결, 레시피/LLM 경계, Resolver 파이프라인, 레인 접속, 구현 전 조사 1건.
