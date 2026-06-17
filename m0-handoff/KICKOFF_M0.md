# KICKOFF_M0 — 런타임 플레이어 (React, v2 격리)

목표: **스키마 → 실제 플레이되는 React 런타임 플레이어.** `reference/player-prototype.html`를 React 18 + Vite + Tailwind + **Motion**으로 옮긴다. 새 코드는 **`src/game-viewer/v2/`에 격리**, 보드 계약(엔트리·7곳)은 **불가침**. 경로 공백 → 명령은 따옴표로. 루트: `D:\claude_project\kinderverse concept`.

> 전제: Vite/TS/Tailwind/React 셋업됨. zod 4.4.3·zustand 4·motion 12 **이미 설치됨** → 재설치/다운그레이드 금지.

---

## STEP 0 — 의존성 (추가만)
```powershell
npm install canvas-confetti zundo@^2
# 캐릭터(M2~M3) 미리: npm install "@rive-app/react-canvas" howler
```
- zod·zustand·motion은 설치돼 있으니 건너뜀. **zod 다운그레이드 금지(v4 유지).** zundo는 zustand 4 호환 `@^2`.

## STEP 1 — v2 모듈 안착 (옛 코드 보존)
핸드오프의 `src/game-viewer/v2/`를 레포 같은 경로로 복사. **옛 `src/game-viewer/schema/`(GameSpec)는 건드리지 않는다.**
```powershell
Copy-Item -Recurse -Force ".\m0-handoff\src\game-viewer\v2" ".\src\game-viewer\v2"
```
- 검증: `parseInteractiveDoc(examples.tapTheRightOneExample)` 통과 확인(타입+런타임). **zod 4.4.3에서 검증 완료**이므로 그대로 컴파일됨.
- 루트 `CLAUDE.md`에 포인터 한 줄: "게임 뷰어 계약 = `src/game-viewer/v2/schema/interactiveDoc.ts`. 작업 시 `m0-handoff/CLAUDE.md`·`PRD_TWO_LAYER_DESIGN.md` 함께 읽을 것. 옛 GameSpec은 M0 후 제거."

## STEP 2 — 파스텔 테마
`v2/theme.ts`는 제공됨(검증 완료). 런타임은 `cssVars()`를 무대 컨테이너에 주입하거나 Tailwind theme.extend에 **`game-` 프리픽스로** 매핑(기존 Milray Park 토큰과 분리). 게임 화면은 비-Tailwind 토큰 사용이라 충돌 0.

## STEP 3 — 런타임 플레이어 컴포넌트 (레퍼런스 포팅)
`reference/player-prototype.html` 구조를 `src/game-viewer/v2/runtime/`에 React로 분해. 게임 로직은 새로 발명하지 말고 그대로 옮긴다.
```
src/game-viewer/v2/
  App.tsx                  # v2 루트 (main.tsx가 마운트)
  theme.ts  schema/  providers/   …(제공됨)
  runtime/
    GameStage.tsx          # stage.nodes 정규화 transform 배치(중심 기준), 반응형 aspect, blob 배경
    NodeRenderer.tsx       # image/sticker(에셋)·text·shape(cover=흙)·slot·rive(M2)·group
    interactions/ TapTheRightOne.tsx · MatchPair.tsx
    effects/ RevealEffect.tsx
    presets.ts             # 모션 프리셋 라이브러리 (Motion 스프링)
    rewards.ts             # 정돈된 한 방 오케스트레이터
    useGame.ts             # Zustand 스토어 (loadDoc/start/answer/next/finish/restart)
```
- **Motion만** 사용(WAAPI 금지 — 레퍼런스의 cubic-bezier 흉내를 진짜 스프링으로). 반응형·키보드 포커스·`prefers-reduced-motion` 존중(레퍼런스에 패턴 있음).

## STEP 4 — 엔트리 스위치 (보드 불가침)
- **`game-viewer.html`·`vite.config.ts`의 엔트리명 그대로 둔다**(`/game-viewer.html` → `src/game-viewer/viewer/main.tsx`).
- **`src/game-viewer/viewer/main.tsx`만** v2 `App`을 마운트하도록 교체:
  ```tsx
  import { createRoot } from "react-dom/client";
  import { App } from "../v2/App";
  createRoot(document.getElementById("root")!).render(<App />);
  ```
  (옛 마운트 코드는 주석/백업으로 남겨 롤백 가능.) → **보드 7곳·iframe 계약 전혀 안 건드림.**

## STEP 5 — 프리셋 라이브러리 + 보상
- `presets.ts`: 프리셋 **이름**은 스키마 `PresetName`에 있음. 디자이너 튜닝 **값**을 Motion 스프링으로 구현(`theme.ts`의 `motion.spring` 참조). 강도는 `settings.mood`로 스케일(`moodScale`).
- `rewards.ts`: 정답/클리어 시 **한 번에 합주**(흩뿌리지 말 것) — 정답 요소 cheer + 별 팝 + 파스텔 confetti(`confettiColors` 고정) + 칭찬 음성. `reveal`의 dust는 흙 라인 갈색 소량.

## STEP 6 — Provider 연결 (제공된 인터페이스 사용)
`v2/providers/providers.ts` 제공됨. 팩토리로 주입:
- `createImageProvider()` — M0: Placeholder stub(나노바나나 호출 M2). child-photo 가드 포함.
- `createTtsProvider(clovaConfig?)` — clovaConfig 있으면 CLOVA(서버 프록시), 없으면 브라우저 폴백. **문장 캐싱 골격 동작.** 서버 프록시(NCP CLOVA 호출 + 오디오 Storage 저장)는 TODO.
- **`CutoutProvider`** — 🔴 새 stub 대신 **기존 `@/shared/background-removal/removeBackground.ts`(BiRefNet/RMBG, MIT)로 라우팅하는 어댑터**를 작성해 연결. `@imgly` 추가 금지. 호출은 비동기(크리티컬 패스 금지).
- `ObjectSegmenter` — 편집기(M1), 연결 보류.

## STEP 7 — 임시방편 → 진짜 파이프라인 교체 (레퍼런스 대비)
| 레퍼런스(프로토) | M0 목표 |
|---|---|
| 이모지 | `ImageProvider` 경유(M0 stub 플레이스홀더 OK) + 실사진/배경제거 자리 확보 |
| WAAPI cubic-bezier | **Motion 스프링** + 프리셋 라이브러리 |
| 브라우저 speechSynthesis | **`TtsProvider`(CLOVA) + 캐싱**, 브라우저는 폴백 |
| (배경제거) | 🔴 **`@/shared/background-removal`(MIT)** — @imgly 아님 |

## 검증(Acceptance) — M0 완료 기준
1. `examples.ts` 픽스처가 v2 플레이어에서 **그대로 플레이**(M0 범위: tap·match·reveal). `parseInteractiveDoc` 통과.
2. **엔트리·보드 불가침** — `/game-viewer.html` 유지, 보드 7곳·iframe 계약 무수정. main.tsx 롤백만으로 옛 뷰어 복귀 가능.
3. **TTFP** — 로드 → 첫 인터랙션까지 생성·합성·누끼에 안 막힘(시드/플레이스홀더 즉시).
4. 보상 "정돈된 한 방", `mood`/`confetti` 강도 반영. 모바일 반응형 + 키보드 + reduced-motion.
5. **라이선스/안전** — `@imgly` 미설치 확인(BiRefNet/RMBG만). `child-photo` 외부 API 미전송 가드 테스트.

> 끝나면 M1(직접 에디터 — "고급" 뒤) → M2(Resolver+추천카드+나노바나나) → M3(스타일락+Rive responsive-state) → 옛 GameSpec 제거.
