# FORM_DESIGN — 템플릿 폼 필드 명세

> 입구① "템플릿 갤러리 → 폼 → (옵션) 프롬프트"의 **구체 설계**.
> 구현 파일: `generate/templateForms.ts`(폼 정의) · `generate/contentSets.ts`(콘텐츠) ·
> `generate/buildSpecFromForm.ts`(조립, LLM 없음). 이 문서는 그 세 파일의 사람용 사양이다.

---

## 0. 원칙

- **자유 입력 없이 탭만으로 완성.** 모든 필드는 큰 **세그먼트/칩**(segmented)으로 렌더. 글 못 쓰는 상황에서 끝까지 간다.
- **자유 프롬프트는 옵션.** 폼 하단에 1칸. M1은 비활성(placeholder), M2에서 LLM 미세조정 경로.
- **연령이 난이도를 끈다.** `ageRange` 선택 시 의존 필드 기본값이 `AGE_DEFAULTS`로 자동 세팅(교사가 덮어쓸 수 있음).
- **데이터 주도 확장.** 새 템플릿 = `TEMPLATE_FORMS`에 `TemplateFormDef` 1개 추가 → 갤러리·폼 자동 확장.

---

## 1. 연령 난이도 기본값 (`AGE_DEFAULTS` — 단일 출처)

| 연령 | maxCount | 보기 수(optionCount) | 판 수(rounds) | 잇기 쌍(pairCount) | 감정 풀 |
|---|---|---|---|---|---|
| **3~5세** | 5 | 3 | 3 | 3 | 기쁨·슬픔·화남 |
| **5~7세** | 10 | 4 | 5 | 4 | +무서움·놀람 |

> 이 값은 **기본값**이지 상한이 아니다. 교사가 폼에서 더 높게/낮게 고를 수 있고, 빌더는 정합성만 보정한다(개수 ≥1, 보기 수 ≤ 카테고리 항목 수 등).

---

## 2. 템플릿별 폼 필드

### 2.1 counting — 숫자 세기 놀이 (M1)
| 필드 id | 질문(라벨) | 타입 | 옵션 | 기본값 |
|---|---|---|---|---|
| `ageRange` | 몇 살 친구들인가요? | segmented | 3~5세 / 5~7세 | 3-5 |
| `category` | 무엇으로 놀까요? | segmented | 동물·과일·탈것·음식·식물·직업 | 동물 |
| `maxCount` | 몇 개까지 셀까요? | segmented | 3까지 / 5까지 / 10까지 | 연령(5 또는 10) |
| `rounds` | 몇 판 할까요? | segmented | 3판 / 5판 / 7판 | 연령(3 또는 5) |
| _(옵션)_ 자유 프롬프트 | 특별히 바꾸고 싶은 게 있나요? | text | — | 빈값(M1 비활성) |

- 보기 수는 폼에 없음 → **연령에서 도출**(3-5→3, 5-7→4).
- 판마다 정답 개수 = `1~maxCount`(3-5) / `2~maxCount`(5-7) 사이 랜덤.

### 2.2 silhouette — 그림자 맞추기 (M1)
| 필드 id | 질문 | 타입 | 옵션 | 기본값 |
|---|---|---|---|---|
| `ageRange` | 몇 살 친구들인가요? | segmented | 3~5세 / 5~7세 | 3-5 |
| `category` | 무엇으로 놀까요? | segmented | 동물·과일·탈것·음식·식물 **(직업 제외)** | 동물 |
| `optionCount` | 보기를 몇 개 보여줄까요? | segmented | 3개 / 4개 | 연령(3 또는 4) |
| `rounds` | 몇 판 할까요? | segmented | 3판 / 5판 / 7판 | 연령(3 또는 5) |
| _(옵션)_ 자유 프롬프트 | — | text | — | 빈값(M1 비활성) |

- **직업 제외 이유**: ZWJ 시퀀스라 형태가 복잡해 실루엣이 또렷하지 않음(`goodForSilhouette: false`).

### 2.3 emotion — 표정 보고 마음 알기 (M2, Rive)
| 필드 id | 질문 | 타입 | 옵션 | 기본값 |
|---|---|---|---|---|
| `ageRange` | 몇 살 친구들인가요? | segmented | 3~5세 / 5~7세 | 3-5 |
| `emotionSet` | 어떤 감정으로 놀까요? | segmented | 기본(기쁨·슬픔·화남) / 전체(5가지) | 기본 |
| `empathy` | 위로해 주기 단계도 넣을까요? | **toggle** | 넣기 / 빼기 | 넣기 |
| `rounds` | 몇 판 할까요? | segmented | 3판 / 5판 / 7판 | 연령 |

- `empathy` on → 감정 식별 후 "안아주기"(기쁨이면 "함께 기뻐하기") 공감 반응 단계 추가.

### 2.4 matching — 줄로 잇기 (M2, Konva)
| 필드 id | 질문 | 타입 | 옵션 | 기본값 |
|---|---|---|---|---|
| `ageRange` | 몇 살 친구들인가요? | segmented | 3~5세 / 5~7세 | 3-5 |
| `relation` | 무엇끼리 이어 볼까요? | segmented | 동물-먹이 / 직업-도구 | 동물-먹이 |
| `pairCount` | 몇 쌍을 이을까요? | segmented | 3쌍 / 4쌍 | 연령(3 또는 4) |
| `rounds` | 몇 판 할까요? | segmented | 3판 / 5판 / 7판 | 연령 |

- 관계는 순수 이모지로 표현 가능한 것만(M2 시작 2종). **동물-집/엄마-아기 등 다양화는 교사·생성 에셋(M3)**에서 — 이모지 커버리지에 묶이지 않음.

---

## 3. 콘텐츠 셋 (`CONTENT_SETS`)

| 카테고리 | 항목 수 | 실루엣 적합 | 예시 |
|---|---|---|---|
| 동물 | 10 | ✅ | 사자·코끼리·호랑이·곰·토끼·강아지·고양이·기린·판다·펭귄 |
| 과일 | 10 | ✅ | 사과·바나나·포도·딸기·수박·귤·복숭아·체리·배·파인애플 |
| 탈것 | 10 | ✅ | 자동차·버스·비행기·배·기차·자전거·헬리콥터·트럭·로켓·소방차 |
| 음식 | 8 | ✅ | 피자·햄버거·핫도그·아이스크림·케이크·빵·도넛·초밥 |
| 식물 | 8 | ✅ | 튤립·해바라기·장미·나무·선인장·네잎클로버·새싹·버섯 |
| 직업 | 8 | ❌(ZWJ) | 소방관·경찰·요리사·선생님·농부·의사·우주비행사·화가 |

관계 팩(matching): **동물-먹이**(토끼-당근, 원숭이-바나나, 곰-꿀, 고양이-물고기, 강아지-뼈, 펭귄-열대어), **직업-도구**(소방관-소방차, 경찰-경찰차, 요리사-식칼, 농부-트랙터, 화가-팔레트, 의사-주사기).

> 🔴 **ref 검증 필수**: contentSets의 OpenMoji hexcode는 Unicode 코드포인트 기준 "시작 셋"이다.
> Claude Code는 각 ref를 jsDelivr(`color/svg/{REF}.svg`)에 대조해 404를 교체하고, 실루엣은
> 단일 코드포인트를 우선한다. job/일부 도구는 ZWJ 결합(예 `1F9D1-200D-1F692`)이라 `openmoji.ts`
> 리졸버가 다중 코드포인트를 처리해야 한다.

---

## 4. GameSpec 조립 규칙 (`buildSpecFromForm`, LLM 없음)

- **아이템 선택**: 카테고리/관계 셋에서 판마다 랜덤 픽(`seed` 주면 재현 가능).
- **counting 보기 생성**: 정답에서 `±1, ±2…`로 확장해 `optionCount`개를 채우고(1 미만 제외) 셔플 → 정답 항상 포함.
- **silhouette 보기**: 정답 + 같은 카테고리에서 `optionCount-1`개 distractor(중복 없음) → 셔플.
- **matching**: 관계 팩에서 `pairCount`쌍 샘플. 좌/우 에셋 id는 `L_`/`R_` 프리픽스로 충돌 방지.
- **emotion**: 감정 풀에서 정답 + distractor. `riveStateMachine`은 M1 placeholder(`character_default`), M2에서 실제 Rive로 교체.
- **공통**: title/instruction은 카테고리·관계 라벨로 자동 작문, `rewards`는 기본(파스텔 confetti+별 + 칭찬 음성 로테이션), `ttsLocale: ko-KR`.
- 반환 전 `assertSpecIntegrity` 호출(zod 스키마 생성 후 `parseGameSpec` 병행).

> 검증됨: 6개 조합(연령/카테고리/관계 교차)에서 유효 GameSpec 생성 + 동일 seed 재현 확인.

---

## 5. UI 렌더 가이드 (entry/TemplateForm)

- 모든 필드 = **큰 세그먼트/칩**. 터치 타깃 `theme.touch.minTarget`(72px+), 간격 `theme.touch.gap`.
- 칩에 카테고리 대표 OpenMoji 아이콘 표시(옵션의 `icon`).
- `ageRange` 변경 시 `autoFrom` 필드들의 기본값을 `AGE_DEFAULTS[age][autoFrom]`로 갱신.
- 색·둥근모서리·그림자·스프링은 전부 `theme.ts` 파스텔 토큰. Milray Park 미적용.
- 하단 "(옵션) 프롬프트" 칸은 M1에선 흐리게/플레이스홀더("우리 반 텃밭 채소들로 — 곧 지원돼요"). 비워도 폼만으로 "게임 시작" 가능.

---

## 6. 확장 체크리스트 (새 템플릿/카테고리 추가 시)

- [ ] 카테고리 추가 → `CONTENT_SETS`에 항목(ref+label) + `goodForSilhouette` 설정.
- [ ] 관계 추가 → `RELATION_SETS`에 pairs.
- [ ] 새 템플릿 → `gameSpec.ts`에 round 타입+유니온, `TEMPLATE_FORMS`에 `TemplateFormDef`, `buildSpecFromForm`에 빌더 case.
- [ ] 폼 필드는 segmented/toggle만으로 구성(자유 입력 지양).
- [ ] ref 검증(jsDelivr 대조) + 실루엣 적합도 표시.
