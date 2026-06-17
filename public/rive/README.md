# Rive 캐릭터 에셋 — 반응하는 캐릭터 (게임 뷰어, PRD §9)

이 폴더에 `.riv` 파일을 넣으면, 게임 뷰어가 그 캐릭터를 렌더하고 **아이의 선택에 따라 표정·상태를 실제로 바꿉니다**(슬픔→위로→행복). 런타임 코드는 이미 완성돼 있고 — **파일 + 이름 계약**만 맞추면 됩니다. 그 전까지는 게임이 🧸 플레이스홀더로 정상 동작합니다(콘솔 에러 0).

> 파일은 Vite `public/`이라 빌드 시 사이트 루트로 서빙됩니다. `public/rive/friend.riv` → 런타임 경로 **`/rive/friend.riv`**.

---

## 빠른 시작 (3단계)

1. **만들기** — [Rive 에디터](https://rive.app)(무료)에서 캐릭터 + **상태머신(State Machine)** + **입력(Inputs)** 을 만들고 `.riv`로 **Export**.
2. **넣기** — 그 파일을 이 폴더(`public/rive/`)에 둔다. 예: `public/rive/friend.riv`.
3. **연결** — InteractiveDoc의 `rive` 노드 `src`를 절대경로(`/rive/friend.riv`)로 바꾸고, `stateMachine`·`inputs` 이름을 `.riv` 안 이름과 **정확히 일치**시킨다. 끝.

---

## 이름 계약 (이게 핵심 — 3가지가 일치해야 함)

InteractiveDoc 쪽 값 ↔ `.riv` 안 이름이 그대로 매칭됩니다:

```jsonc
// 1) 장면 노드 (캐릭터)
{ "id": "friend", "type": "rive",
  "src": "/rive/friend.riv",   // ← ① 파일 위치 (절대경로 / 또는 https:// URL)
  "stateMachine": "emotion" }  // ← ② .riv 안 상태머신 이름과 일치

// 2) responsive-state 효과 (선택 → 캐릭터 변형)
{ "kind": "responsive-state", "actorNodeId": "friend", "stateMachine": "emotion",
  "inputs": {
    "correct": { "name": "comfort",  "value": "trigger" },  // ← ③ input 이름과 일치
    "wrong":   { "name": "confused", "value": "trigger" }
  },
  "goalState": "happy" }
```

- **정답** 탭 → 런타임이 `comfort` 트리거 발사 → `.riv`가 전이 애니 재생(sad→happy).
- **오답** → `confused` 발사(부드러운 갸웃 — 부정 연출 금지).
- `value`: `"trigger"`=트리거 발사 / `true·false`=불리언 / 숫자=값 설정.
- 🔴 `src`가 **바 파일명**(`"friend.riv"`)이면 "아직 에셋 없음"으로 보고 로드하지 않습니다(플레이스홀더). 반드시 **`/`로 시작하는 절대경로**나 **`http(s)://` URL**, 끝은 `.riv`.

---

## ✅ 현재 연결된 에셋 — `teddy.riv` (감정 게임 `😊 마음 알기`, 작동 중)

데모로 **무료 커뮤니티 Rive 캐릭터(로그인 곰)** 를 받아 연결했습니다 — 라이브 검증 완료(선택→곰 표정 변화). 픽스처 `responsiveStateExample`(`src/game-viewer/v2/schema/examples.ts`)의 실제 매핑:

| 항목 | 값 |
|---|---|
| 파일 | `public/rive/teddy.riv` (49KB) |
| 상태머신 | **`LoginState`** |
| 입력 `success` | **Trigger** — 정답 시 발사(곰 환호) |
| 입력 `fail` | **Trigger** — 오답 시 발사(곰 반응) |
| (그 외 입력) | `Check`(bool), `Look`(number), `hands_up` — 미사용 |

> 출처/라이선스: 로그인 곰은 JcToon의 유명 Rive 커뮤니티 에셋(여러 튜토리얼에서 재사용). 여기엔 `JaySitaram/flutter_rive_login` 레포의 `teddy_login_screen.riv`를 받아 넣었습니다. **데모용** — 상업 배포 시 원작 라이선스를 확인하거나 다른 에셋으로 교체하세요.

### 다른 캐릭터로 교체하려면
1. 새 `.riv`를 `public/rive/`에 넣는다.
2. 그 파일의 상태머신·입력 이름을 확인 — 게임을 열면 **콘솔에 `[RiveActor] loaded <src> → [{sm, inputs:[...]}]`** 가 찍힙니다(RiveActor의 DEV 헬퍼). 또는 Rive 에디터에서 확인.
3. `examples.ts`의 `friend` 노드 `src`/`stateMachine` + responsive-state `inputs.correct.name`/`wrong.name`을 그 이름들로 바꾼다. 끝.

---

## 런타임 동작 (참고 — 손댈 필요 없음)

- `src/game-viewer/v2/runtime/RiveActor.tsx` — `@rive-app/react-canvas`의 `useRive`로 `.riv` 로드·재생. 로드 가능한 경로일 때만 로드.
- `riveBus.ts` + `useGame`(tap 판정) — 정답/오답 → `responsive-state.inputs[outcome]` 매핑대로 Rive 상태머신 input 발사.
- `.riv`가 없거나 못 읽으면 🧸 플레이스홀더로 graceful(게임은 정상).

## 라이선스·성능 메모

- Rive 런타임은 오픈소스(무료). 저작은 에디터에서 하고, 상용 Export는 Rive 요금제(예: Cadet) 확인.
- GPU 캔버스라 약한 교실 태블릿에서도 가볍습니다. **캐릭터/반응에만** 쓰고, 모든 요소를 Rive로 만들지 마세요(선언적 부품이 기본).
