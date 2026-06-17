# CLAUDE.md — 게임 뷰어 (재구축, v2)

## 이 프로젝트가 뭔가
교사가 **프롬프트·드롭·간단한 노브**로 유아용 인터랙티브 게임을 만드는 뷰어. 옛 GameSpec(템플릿 4종) 모델을 InteractiveDoc(단일 문서) 모델로 재구축한다. **읽기 전용 충돌 점검 완료 — 통합 방향 확정.**

## 🔴 통합 방향 (불변)
1. **엔트리명 `/game-viewer.html` 유지.** 보드↔뷰어는 iframe 엔트리 + `embed.includes('game-viewer')` 7곳(BoardToolbar:94 / prompt.ts:138 / NodeView:257 / BoardCanvas:728 / PromptBar:93 / vite.config:21 / game-viewer.html:11)으로 묶여 있다 → **이 7곳 불가침.**
2. **새 런타임 = `src/game-viewer/v2/`.** 옛 GameSpec 코드(`src/game-viewer/schema/gameSpec.zod.ts` 등)는 **지우지 않는다.** `src/game-viewer/viewer/main.tsx`가 v2를 마운트하게 **그 한 줄만 스위치**(롤백 가능).
3. **배경제거 = `@/shared/background-removal`(BiRefNet/RMBG, MIT) 재사용.** 🔴 `@imgly`(AGPL) 금지 — 레포에서 의도적으로 제거됨. 새 누끼 엔진 추가 금지.
4. **zod = 레포 v4(4.4.3) 그대로.** 다운그레이드 금지. `zundo@^2`만 추가.

## 절대 규칙 (흔들리지 말 것)
1. **단일 계약.** 모든 게임 = `InteractiveDoc`. 위치: `src/game-viewer/v2/schema/interactiveDoc.ts`. 생성·편집·런타임 모두 이 문서만 의존. `parseInteractiveDoc`로 검증 후 사용.
2. **교사 ≠ 제작자.** 교사는 InteractiveDoc를 직접 편집하지 않는다. 의도(프롬프트/드롭/노브/발화)만, Resolver가 문서로 번역(M2 — M0는 픽스처 직접 투입).
3. **퀄리티는 박제, AI는 선택.** 좋은 building block만 만들어 두고 AI는 그 안에서 고른다. 임의 HTML/CSS 발명 금지.
4. **디자인 경계.** 교사용 보드/툴바/에디터 크롬 = **Milray Park**. 아이가 만지는 **게임 플레이 화면 = 파스텔/큐트 별도 토큰**(`v2/theme.ts`). Milray Park 미적용. 게임 화면은 비-Tailwind 토큰을 쓰므로 유틸리티 충돌 0.
5. **성능.** transform·opacity만 애니메이트. 무거운 건 lazy-load. **약한 교실 태블릿 60fps.** 컷아웃·생성은 **크리티컬 패스 금지** — 시드=원본/플레이스홀더 즉시 플레이 → 완료 시 스왑.
6. **부품 직교성.** 새 부품은 특정 소재에 묶지 말 것. 콘텐츠 무관하게 일반화.

## 외부 의존 = 교체 가능한 Provider 계약 (`v2/providers/providers.ts`)
- **`ImageProvider`** — 현재 구현 **나노바나나(Gemini)**. `generate`/`editVariant`. 스타일락 동반 생성, 비동기+캐싱, 수는 `settings.companionCount`. (M0: PlaceholderImageProvider stub.)
- **`TtsProvider`** — 현재 구현 **CLOVA Voice(NCP)**. `speak`/`prefetch`/`stop`. 한 보이스 고정, **문장 캐싱**(골격 동작), 키는 서버 프록시. 브라우저 TTS는 폴백.
- **`CutoutProvider`** — 현재 구현 **`@/shared/background-removal`(BiRefNet/RMBG, MIT, 온디바이스)**. 🔴 @imgly 금지. ~수초 → 비동기, 캐싱.
- **`ObjectSegmenter`** — SlimSAM(편집기 M1), 인터페이스만.
- 🔴 **`assetKind: "child-photo"`는 외부 API 절대 미전송.** 누끼는 온디바이스만(`assertNotChildPhoto` 가드 제공).

## zod v4 주의 (레포 4.4.3)
- ✅ OK(v4): `discriminatedUnion` · `literal` · `enum` · `.extend()` · `z.record(키, 값)`(2-arg) · `.superRefine` · `z.input`. (현 스키마가 쓰는 것 전부 v4 검증 완료.)
- ❌ 금지(v3 전용, v4에서 터짐): `z.string().email()`(→`z.email()`) · `{required_error,invalid_type_error}`·`errorMap`(→`{error}`) · `z.record(값)`(1-arg) · `.merge()` 의존. **신규 zod 코드에서 이 패턴 쓰지 말 것.**

## 스택
React 18 + Vite + TS + Tailwind. 애니 **Motion 12(설치됨)** + **Rive(`@rive-app/react-canvas`)** + **canvas-confetti**. 상태 **Zustand 4(설치됨) + zundo@^2(추가)**. 검증 **zod 4.4.3(설치됨)**. 에셋 Supabase Storage(보드 공유).

## 개발 환경 컨벤션
- 루트: `D:\claude_project\kinderverse concept` (공백 포함 → 모든 명령 따옴표).
- 파일 이동은 `Move-Item`보다 **`Copy-Item -Recurse -Force`** 선호.
- 직접 추천 우선, 빠른 결정 확인.

## M0 범위
- **포함**: `src/game-viewer/v2/` 런타임 플레이어(React), 인터랙션 2종(`tap-the-right-one`·`match-pair`) + 효과 `reveal`, `theme.ts` 파스텔, Motion 프리셋 라이브러리, 보상 오케스트레이터, Provider 4계약 + M0 stub, `main.tsx` v2 스위치, 픽스처 직접 투입.
- 🔴 **스키마는 이미 전 부품 카탈로그(인터랙션 11종) + extend + 가로 레인 + video 까지 반영·검증됨** — M0는 그중 **tap/match/reveal 런타임만** 구현한다. 스키마 재작성 금지(필요 시 ADDITIVE만).
- **제외(후속)**: Resolver/추천카드/프롬프트(M2), Rive `responsive-state`(M2~M3), 스타일락 실생성(M3), 직접 에디터(M1), realtime-arcade(격리·후순위), 옛 GameSpec 제거(M0 후).
