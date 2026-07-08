# 놀이기록 편집기 모듈 (playrecord)

카드형·스토리형 놀이기록 + **놀이중심 주제망(topicweb)** + **놀이계획 주안(weeklyplan)** 템플릿을 자유 캔버스 편집기(드래그·회전·스티커·사진 슬롯·z순서·PNG 저장·재생성 + 템플릿 썸네일 갤러리)로 편집하는 **자립형 React 모듈**. 이 폴더를 통째로 복사하면 다른 React 서비스에 붙일 수 있다(외부 `../` import 0개). 4종 모두 `PlayRecordEditor → layouts.js 빌더 → DesignFrame` 한 경로로 렌더된다.

## 사용법

```jsx
import { PlayRecordEditor } from "./playrecord"; // index.js

function Host() {
  const [rec, setRec] = useState({ payload: myPlayRecordPayload });
  return (
    <div style={{ width: 500, height: 707 }}>
      <PlayRecordEditor
        value={rec}
        selected                                   // 편집 UI(탭바) 노출
        zoom={1}
        onChange={(patch) => setRec((r) => ({ ...r, ...patch }))}
        onExportImage={(dataUrl, meta) => {/* 저장/업로드 등 */}}
      />
    </div>
  );
}
```

- **controlled**: 상태(value)는 호스트가 소유한다. 편집기는 `onChange(patch)`로 병합 패치만 보낸다.
- `value` 초기값은 `{ payload }`만 있으면 되고, 나머지(`variant`/`docs`/`docsVersion`/`page`)는 편집기가 채운다.
- `variant` 로 어떤 템플릿을 그릴지 지정한다(미지정 시 `defaultTemplateId(payload)` 로 주제 자동 선택). 값: `"<theme>-card"|"<theme>-story"`(theme=winter/summer/autumn/traffic/default) · `"topicweb"` · `"weeklyplan"`.
- **payload 스키마**(빌더가 기대하는 형태):
  - 놀이기록: `header.title`·`meta.theme`·`activities[].{title,childQuotes?}`·`photos[]`·`learning.text`·`teacherSupport.text`·`month` (`layouts.js`의 `read()` 참고)
  - 주제망(topicweb): `payload.topic_web.{main_topic, subtopics[].{subtopic, play_ideas[]}}`·`payload.children_expected_questions[]`
  - 주안(weeklyplan): `payload.{basic_info.{theme,sub_theme,period,class_name,age_band}, rationale, teacher_expectations[], curriculum_links[], daily_flow[].{day,date,play_ideas[]}, outdoor_and_physical_play[], safety_education, character_education, events[], home_connection}`
- 놀이기록은 갤러리에서 주제/가족(카드·스토리)을 고를 수 있다. topicweb·weeklyplan 은 각 payload당 단일 템플릿.

## 빌드 설정 (⚠️ 필수)

- **`DRAGGABLE_DEBUG` define**: `react-rnd` 가 `process.env.DRAGGABLE_DEBUG` 를 참조 → 브라우저 번들에서 정의 안 하면 편집 시 `process is not defined` 크래시. Vite면 `vite.config` 에 `define: { "process.env.DRAGGABLE_DEBUG": "false" }`. (다른 번들러도 동등 처리)
- Vite 는 `.ts`+`.jsx` 혼용을 기본 지원. 순수 JS 프로젝트면 아래 `.ts` 7개를 트랜스파일.

## 의존성 (peerDependencies)

호스트가 설치해야 함: `react`, `react-dom`, `react-rnd`, `html-to-image`, `lucide-react`.

## 정적 에셋 (필수)

코드가 **절대경로**(`/fonts/…`, `/generated-assets/…`, `/assets/deco/…`)로 참조하므로, 타깃의 `public/` 루트에 배치해야 한다.

- **동봉(작음, ~6.7MB)**: `assets/fonts/`(폰트 7종), `assets/generated-assets/summer-record/`(여름 템플릿 커스텀 47개).
- **공유 스티커 라이브러리(큼, 수십 MB)**: 전 주제 스티커(`/assets/deco/*`, `/generated-assets/stk-winter-*`, `deco-*`)는 저장소 용량 문제로 **동봉하지 않음**. 소스 `public/`에서 복사한다.

한 번에 배치:
```bash
./copy-assets.sh <소스-public> <타깃-public>
# 예: ./copy-assets.sh ../../public ../../my-app/public   # 소스 = verse 의 client/public
```
→ `fonts/` + `assets/{deco,frames,banners,characters}` + `generated-assets/` **전체**(topicweb-record·weekly-record·traffic-record-ai·autumn-record·eco·summer-record·summer + 루트 stk-winter-*/deco-*)를 타깃 `public/` 에 통째로 복사한다. (구버전은 frames·autumn/weekly/topicweb-record·eco·traffic-record-ai 를 빠뜨렸음 → 통째 복사로 수정됨.)

폰트 `@font-face`와 편집기 CSS·색상 변수는 `playrecord.css`에 포함되어 있고 `DesignFrame.jsx`가 side-effect import 하므로 별도 CSS 로드는 불필요.

## 백엔드 (선택)

- **불필요**: 빌트인 겨울/여름/기본 템플릿은 위 정적 PNG로 완결. 누끼(`cutout`)·배경제거(`removeBackground`)도 브라우저 내 처리.
- **선택(LLM 스티커 자동생성)**: 정적 에셋이 없는 새 주제에서 `assetLibrary.getAssetSmart → imageCache`가 백엔드(`/api/icon-prompt` + 이미지 생성)를 호출. 없으면 이모지/정적 데코로 graceful degrade.

## 파일 구성

| 파일 | 역할 |
|---|---|
| `index.js` | 공개 API |
| `PlayRecordEditor.jsx` | 편집기(탭·갤러리·페이지·PNG 저장). controlled. |
| `DesignFrame.jsx` | 렌더 엔진(자유 캔버스 + 요소 편집/렌더). `playrecord.css` import. |
| `layouts.js` | 템플릿 빌더·레지스트리·테마(의존성 0) |
| `stickerAssets.ts` / `stickerManifest.ts` | 스티커 URL 해석 |
| `cutout.ts` / `removeBackground.ts` | 누끼(배경 투명화) |
| `assetLibrary.ts` / `imageCache.ts` | (선택) LLM 스티커 생성 |
| `decoManifest.ts` | 데코 스티커 목록(DECO_IMAGES) |
| `playrecord.css` | 폰트·CSS변수·편집기 스타일 |
| `assets/` | 동봉 폰트 + 여름 커스텀 PNG |
| `copy-assets.sh` | 에셋 배치 스크립트 |

## 비고

- 순수 JS 프로젝트로 옮기면 `.ts` 파일(`stickerAssets`·`assetLibrary`·`imageCache`·`cutout`·`removeBackground`·`decoManifest`·`stickerManifest`)을 `.js`로 변환 필요.
- 색상 변수(`--accent` 등)는 `playrecord.css`에 기본값 포함. 호스트에서 override 가능.
- **주안(weeklyplan)은 현재 모든 요소가 `locked`** — `layouts.js`의 `buildWeeklyPlanDoc` 마지막 `els.forEach(e => e.locked = true)` 때문에 캔버스에서 이동/편집 불가(뷰 + PNG저장 + 페이지·사진 추가만). 요소 편집을 열려면 그 줄을 제거/조정.
- 재생성(`onRegenerate`) 버튼은 스티커를 AI로 다시 생성한다 → 백엔드(`/api/weekcard-image`) 필요. 미설정 시 버튼을 넘기지 않으면 노출 안 됨.
- 모듈 동봉 `assets/generated-assets/traffic-record/` 는 stale(코드는 `traffic-record-ai/` 참조). 소스 `public/` 것을 사용.
