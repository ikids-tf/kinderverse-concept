# START HERE — 킨더버스 게임 뷰어 M0 핸드오프 (v2, 통합 점검 반영)

이 폴더는 **Claude Code 핸드오프 패키지**다. 게임 뷰어를 InteractiveDoc 모델로 재구축하는 M0 단계.
**읽기 전용 충돌 점검을 거쳐 통합 방향이 확정됐다.** 아래 순서로 읽고 시작한다.

## 🔴 통합 방향 (점검으로 확정 — 가장 안전한 길)

옛 게임 뷰어는 보드와 **iframe 엔트리 `/game-viewer.html` + `embed.includes('game-viewer')` 7곳**으로 묶여 있다. 그래서 새 경로로 갈아엎지 않는다.

1. **엔트리명 `/game-viewer.html` 유지** → 보드 7곳(BoardToolbar/prompt/NodeView/BoardCanvas/PromptBar/vite/html) **한 줄도 안 건드림.**
2. **새 런타임은 `src/game-viewer/v2/`에 격리** → 옛 GameSpec 코드는 **안 지운다.** `viewer/main.tsx`가 v2를 마운트하도록 **그 한 줄만 스위치** → 문제 시 main.tsx 되돌리면 즉시 롤백.
3. **배경제거 = 기존 공용 엔진 `@/shared/background-removal`(BiRefNet/RMBG, MIT) 재사용.** 🔴 **`@imgly` 금지**(AGPL, 레포에서 의도적으로 제거됨). 새 엔진 추가 금지.
4. **zod는 레포 기준 v4(4.4.3) 그대로.** 다운그레이드 금지. (스키마는 v4에서 검증 완료.) **`zundo@^2`만 추가 설치.**

## 읽는 순서

1. **CLAUDE.md** — 절대 규칙 + 통합 방향 + Provider + 디자인 경계 + zod v4 체크리스트. **먼저.**
2. **PRD_TWO_LAYER_DESIGN.md** — 제품 요구 전체(두 레이어·부품 카탈로그·Resolver·지표·워크스루).
3. **src/game-viewer/v2/schema/interactiveDoc.ts** — 단일 계약. **zod 4.4.3에서 타입+파싱 검증 완료.**
4. **src/game-viewer/v2/{theme.ts, providers/providers.ts}** — 파스텔 토큰, Provider 계약+stub(타입 통과).
5. **reference/player-prototype.html** — 런타임 레퍼런스(바닐라). M0에서 React로 포팅. ⚠️ 이미지=이모지, 모션=WAAPI, 음성=브라우저TTS는 **의도된 임시방편** — 진짜 파이프라인으로 교체.

## 이미 끝난 것 (M0 토대, 전부 검증됨)

- ✅ **InteractiveDoc 스키마 (전 부품 카탈로그 반영·검증됨)** — 인터랙션 11종(tap·match·binary·connect·flip·combine·categorize·order-sequence·find-it·sequence-tap·pattern-next) + 효과 3종(reveal·responsive-state·goal-state) + **확장활동(extend, 가로 레인)** + **video 노드/콘텐츠 + child-video 가드**. zod 4.4.3에서 **타입 통과 + 픽스처 10/10 + 잘못된 문서 4종 거부.**
  - ⚠️ 스키마는 런타임보다 앞서 자란다 — **M0 런타임은 그중 tap·match + reveal 만 구현**(나머지는 후속, 미구현 kind는 graceful default).
- ✅ **theme.ts / providers.ts** — strict + DOM + noUnused 타입 통과. (Provider 4계약 + M0 stub + child-photo 가드 + TTS 캐싱 골격.)
- ✅ **런타임 레퍼런스** — 3개 픽스처 실제 플레이(동물·짝·텃밭 뽑기). "스키마 → 플레이" 증명.

## M0에서 할 일 (요약)
`src/game-viewer/v2/`에 **React 18 + Vite + Tailwind + Motion** 런타임 플레이어를 만들고, `viewer/main.tsx`를 v2로 스위치. 임시방편 3개를 진짜 파이프라인(`ImageProvider`/`TtsProvider`/`CutoutProvider`)으로 교체. 상세는 **KICKOFF_M0.md**.
