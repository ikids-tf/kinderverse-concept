# PROMPTS — Claude Code 위임 프롬프트

> Claude Code에 그대로 붙여넣어 단계별로 진행. 각 프롬프트는 자기완결적이며 문서를 참조한다.
> **공통 전제(매번 적용)**: Windows/PowerShell, 경로 `D:\claude_project\kinderverse concept`는
> 공백 포함 → 모든 경로 인자 따옴표. TypeScript strict. 게임 화면은 파스텔(theme.ts), Milray Park 아님.

---

## 🟢 M1

### M1-0 · 셋업 & 컨텍스트
```
CLAUDE.md, PRD.md, KICKOFF_M1.md, src/game-viewer/schema/gameSpec.ts, src/game-viewer/theme.ts를
읽어. 그다음 KICKOFF_M1.md STEP 0~1을 수행해: Vite(react-ts) 골격을 이 폴더에 얹되 기존
src/game-viewer/(schema, theme)는 보존·병합하고, 의존성을 설치해. PowerShell 경로는 모두
따옴표로 감싸. 설치 후 Motion 등 주요 라이브러리의 현재 import 경로/API를 확인해서 보고해.
```

### M1-1 · GameSpec zod 검증
```
src/game-viewer/schema/gameSpec.zod.ts를 만들어. gameSpec.ts의 모든 타입(판별 유니온 포함)에
1:1 대응하는 zod 스키마와 parseGameSpec(json): GameSpec를 구현해. examples.ts의 두 예시가
검증을 통과하는 단위 테스트도 추가해.
```

### M1-2 · 엔진 셸
```
KICKOFF_M1.md STEP 3을 구현해: engine/GameViewer.tsx(templateId 라우팅),
engine/GameShell.tsx(지시 음성 자동재생·라운드 진행·정답 시 보상 호출),
engine/useGameAudio.ts(Howler 래퍼 + M1은 Web Speech API로 한국어 음성 스텁),
engine/rewards.tsx(파스텔 confetti + 별 팝 + 칭찬 음성, 한 번에 오케스트레이션).
색·모션·터치 토큰은 전부 theme.ts에서 가져와. 순수 검정·원색 형광 금지.
```

### M1-3 · OpenMoji 리졸버
```
KICKOFF_M1.md STEP 4를 구현해: assets/openmoji.ts. ref(hexcode)→SVG URL(jsDelivr CDN 또는
public/openmoji 로컬), 실루엣 변환 유틸(알파/형태를 단색으로), 라벨→ref 매핑(동물·탈것 위주
20~30개). 자주 쓰는 셋은 public/openmoji/에 사전 다운로드해 오프라인·속도를 확보해.
```

### M1-4 · counting 템플릿
```
KICKOFF_M1.md STEP 5를 구현해: templates/counting/CountingGame.tsx. 아이템을 spring.bouncy로
흩뿌리고, 탭하면 통통 튀며 카운트업 음성("하나","둘"...)과 시각 카운터, 큰 파스텔 숫자 보기.
정답은 rewards, 오답은 부드러운 흔들림+재시도(부정 연출 금지). EXAMPLE_COUNTING으로 확인.
```

### M1-5 · silhouette 템플릿
```
KICKOFF_M1.md STEP 6을 구현해: templates/silhouette/SilhouetteGame.tsx. 정답을 실루엣(단색)으로
크게, 컬러 보기 버튼, 정답 선택 시 실루엣이 컬러로 모핑+스케일인(Motion) 후 rewards.
EXAMPLE_SILHOUETTE으로 확인.
```

### M1-6 · 입구① 템플릿 갤러리 + 폼 (LLM 없음)
```
generate/contentSets.ts·templateForms.ts·buildSpecFromForm.ts는 이미 제공됨(검증 완료). FORM_DESIGN.md를
읽어. 먼저 contentSets.ts의 모든 OpenMoji ref를 jsDelivr(color/svg/{REF}.svg)에 대조해 404를 교체하고,
assets/openmoji.ts 리졸버가 단일 ref와 ZWJ 결합 ref(예 1F9D1-200D-1F692)를 모두 처리하게 해.
그다음 entry/TemplateGallery.tsx(TEMPLATE_FORMS 순회 카드, M2는 '준비중' 뱃지)와 entry/TemplateForm.tsx
(def.fields를 큰 세그먼트/칩으로, ageRange 변경 시 AGE_DEFAULTS로 의존필드 기본값 갱신, 하단 옵션
프롬프트는 M1 플레이스홀더)를 만들어. "게임 시작"→buildSpecFromForm()→GameViewer 연결. 색·모션은 theme.ts.
```

### M1-7 · 입구② 프롬프트(목업) + StartScreen 데모
```
KICKOFF_M1.md STEP 8을 구현해. generate/router.ts·generateGameSpec.ts를 목업으로(키워드→templateId
+카테고리, 내부적으로 buildSpecFromForm 재사용 가능). entry/PromptBar.tsx(입력+파스텔 퀵픽 칩),
entry/StartScreen.tsx(상단 탭으로 [템플릿에서 시작](기본)↔[프롬프트로 시작] 전환). App.tsx를
StartScreen 기본 화면으로 구성하고 EXAMPLE_* 즉시 플레이 버튼 2개도 둬. npm run dev로 띄우고
M1 수용 기준 체크리스트를 전부 검증해서 보고해. 특히 "폼만으로(프롬프트 비움) 끝까지 동작"과
"두 입구 탭 전환"을 확인해.
```

---

## 🟡 M2

### M2-1 · CLOVA Voice 실연동
```
useGameAudio의 음성 스텁을 Naver CLOVA Voice로 교체해. 백엔드 프록시로 키를 숨기고(.env),
(문장, locale)→오디오 URL을 캐시(같은 문장 재사용). 표현력이 중요한 감정 게임 라인은
ElevenLabs로 분기 가능하게 인터페이스를 둬. 실패 시 Web Speech 폴백.
```

### M2-2 · emotion 템플릿 (Rive, 쇼케이스)
```
templates/emotion/을 구현해: @rive-app/react-canvas로 감정을 연기하는 캐릭터(상태머신),
감정 보기 식별 단계, 그리고 EmotionRound.empathyAction의 공감 반응 단계("안아주기" 탭 →
responseState로 표정 전이). PRD §4.3 기준. Rive 파일이 없으면 필요한 상태머신/입력 스펙을
문서로 정의해서 디자이너 핸드오프용으로 먼저 만들어.
```

### M2-3 · matching 템플릿 (Konva, 선잇기)
```
templates/matching/을 구현해: react-konva로 좌/우 칼럼을 드래그로 연결, 스냅 + 정/오답 피드백.
MatchingRound.pairs/relation 사용. 가벼운 건 SVG로도 되지만 드래그·히트검출은 Konva로.
색/모션은 theme.ts.
```

### M2-4 · 실제 생성 에이전트
```
generate/를 실제 LLM 연동으로 승격해: router(프롬프트→templateId+파라미터)와 전문 에이전트
(rounds 구조화 JSON + 유아 기준 오답 보기 검증)를 3-tier로 구현(CLAUDE.md §3). 산출물은
gameSpec.zod로 검증. 4개 템플릿 모두 자연어 프롬프트로 생성되는지 확인.
```

---

## 🔵 M3

### M3-1 · 교사 에셋 파이프라인
```
teacher-assets/를 구현해: 업로드 → @imgly/background-removal(브라우저 온디바이스) →
정규화(정사각·여백) → 실루엣 변환 → 안전 분류기. 결과를 TeacherAsset(status 관리)로.
아이 얼굴 일러스트화/변형은 기본 비활성. 저해상 미리보기 먼저, 처리는 백그라운드. PRD §6.
```

### M3-2 · 인라인 슬롯 교체 + 기관 보관함
```
게임 생성 후 각 에셋 위 "이미지 바꾸기" UI(업로드/촬영→자동 처리→슬롯 주입)와, 처리한 에셋을
Supabase Storage 기관별 버킷에 저장·재사용하는 "내 에셋 보관함"을 구현해. source 추상화 덕에
템플릿 수정 없이 동작해야 함.
```

### M3-3 · 캐시 라이브러리 + 수업 모드 + 생성 폴백
```
(templateId+정규화 파라미터) 캐시와 스타터 라이브러리 ~50개 사전생성, board/LessonMode.tsx
(전체화면·프로젝터·교사 컨트롤), OpenMoji 미보유 소재용 이미지 생성 폴백(스타일 락 + 안전
분류기)을 구현해. 그리고 입구③: entry/ExampleGallery.tsx로 스타터 라이브러리의 기존 게임을 열어
소재만 교체("이 사자 세기를 우리 반 토끼로")하는 진입을 추가해 — M3-1 교사 에셋 교체와 연결.
PRD §3.5·§5·§7·§9(M3).
```

### M3-4 · React Flow 보드 노드
```
board/GameNode.tsx를 구현해: 생성 게임을 킨더버스 React Flow 보드의 아티팩트 노드로 등장시키고
(Workflow Lane 정합), 인라인 플레이·저장·재생·파라미터 수정·공유를 지원. 노드 프레임/툴바는
Milray Park, 게임 화면 안쪽은 파스텔(theme.ts) 경계를 지켜.
```

---

## 디버깅/기타 단발 프롬프트

```
# 경로 공백 에러
"명령이 'kinderverse' 까지만 인식되면 경로 공백 문제다. 'D:\claude_project\kinderverse concept'
전체를 따옴표로 감싸서 다시 실행해."

# 음성이 안 나옴
"useGameAudio가 사용자 제스처 없이 자동재생을 시도하면 브라우저가 막는다. 첫 탭 이후 재생되도록
오디오 언락 패턴을 넣어."

# 디자인 드리프트
"게임 화면에 Milray Park coral(#F2733E)/serif가 새어 들어왔는지 점검하고, 전부 theme.ts 파스텔
토큰으로 되돌려. 순수 검정·원색 형광도 제거."
```
