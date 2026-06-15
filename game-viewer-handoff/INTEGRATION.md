# INTEGRATION — 기존 KinderVerse 프로젝트에 끼워넣기

> ⚠️ 너의 루트(`D:\claud project\kinderverse concept`)는 **이미 셋업된 실제 프로젝트**다
> (.git · node_modules · Vite · TS · Tailwind · 기존 CLAUDE.md/package.json 보유).
> 그래서 **통째로 풀어 덮어쓰면 안 된다.** 이 폴더(`game-viewer-handoff/`)는 충돌 없이
> 한 폴더로만 풀리며, 아래 순서로 **모듈만 끼워넣는다.**

루트 경로에 공백이 두 곳(`claud project`, `kinderverse concept`) 있으니 **모든 경로는 따옴표** 필수.

---

## 0. 이 폴더를 프로젝트 안에 둔다

`game-viewer-handoff.zip`을 풀면 `game-viewer-handoff\` 폴더 하나만 생긴다(기존 파일 안 건드림).
이걸 프로젝트 루트 안에 둔다:

```
D:\claud project\kinderverse concept\
  ├─ (기존 파일들 그대로)
  └─ game-viewer-handoff\        ← 이 폴더만 새로 추가됨, 충돌 0
```

PowerShell:
```powershell
Expand-Archive -Path "$env:USERPROFILE\Downloads\game-viewer-handoff.zip" -DestinationPath "D:\claud project\kinderverse concept" -Force
```
> `-Force`를 써도 새 폴더라 기존 파일을 덮지 않는다(같은 이름 폴더가 없으므로).

---

## 1. 게임 뷰어 소스를 실제 src로 이동

핸드오프 안의 `src\game-viewer\`를 프로젝트의 실제 `src\` 아래로 옮긴다.

```powershell
cd "D:\claud project\kinderverse concept"

# 혹시 이미 있으면 멈추고 확인 (충돌 방지)
if (Test-Path ".\src\game-viewer") { Write-Host "⚠️ src\game-viewer 가 이미 있음 — 수동 병합 필요" }
else { Move-Item ".\game-viewer-handoff\src\game-viewer" ".\src\game-viewer" }
```

→ 결과: `src\game-viewer\{schema, theme.ts, generate}` 가 본 프로젝트 안에 들어옴.
문서(`*.md`)는 `game-viewer-handoff\`에 그대로 둬도 되고, 너희 `docs\`로 옮겨도 된다.

---

## 2. 의존성 설치 (덮어쓰기 아님, 추가)

> 🔴 **핸드오프의 `package.json`을 너 package.json 위에 복사하지 마라.** 참고용이다.
> 대신 **필요한 패키지만 설치**한다. npm install은 멱등이라 이미 있는 건 건너뛴다.

**M1만 하려면 (가벼움):**
```powershell
npm install motion howler canvas-confetti zod
npm install -D @types/howler @types/canvas-confetti
```

**M2·M3까지 미리 받으려면:**
```powershell
npm install @rive-app/react-canvas react-konva konva lottie-react @imgly/background-removal
```

> zustand·zundo는 KinderVerse에 이미 있을 가능성이 높다(있으면 자동 스킵).
> 설치 후 각 라이브러리 최신 호환 버전·import 경로 확인(특히 motion).

---

## 3. 기존 CLAUDE.md는 덮지 말고 "연결"

핸드오프의 `CLAUDE.md`(게임 뷰어 전용)는 **너 루트 CLAUDE.md를 대체하지 않는다.**
루트 CLAUDE.md에 아래 한 줄만 추가해서 연결한다:

```md
## 게임 뷰어 (보드 툴바)
게임 뷰어 작업 시 `game-viewer-handoff/CLAUDE.md` · `KICKOFF_M1.md` · `FORM_DESIGN.md`를 함께 읽을 것.
게임 화면 안쪽은 Milray Park 미적용 — `src/game-viewer/theme.ts` 파스텔 토큰 사용.
```

---

## 4. (선택) .env / .gitignore 는 머지만

- `.env.example`: 핸드오프 쪽 키(CLOVA_VOICE_*, SUPABASE_* 등)가 **필요해지면** 너 `.env.example`에
  **추가**만. 파일 교체 금지.
- `.gitignore`: 필요하면 `public/openmoji` 한 줄만 추가. 교체 금지.

---

## 5. Claude Code로 시작 (스캐폴드 단계는 건너뜀)

이미 Vite/TS/Tailwind가 있으므로 KICKOFF_M1의 STEP 0(스캐폴드)·STEP 1(앱 생성)은 **건너뛴다.**
2번에서 deps만 설치하면 된다. 그다음:

```powershell
cd "D:\claud project\kinderverse concept"
claude
```
Claude Code 안에서:
```
game-viewer-handoff/KICKOFF_M1.md 를 읽어. 단, 이 프로젝트는 이미 Vite/TS/Tailwind가
셋업돼 있으니 STEP 0~1(스캐폴드)은 건너뛰고, src/game-viewer/ 는 이미 옮겨져 있다.
STEP 2(zod 검증)부터 시작해. 경로에 공백이 있으니 모든 명령을 따옴표로 감싸.
```

---

## 요약

| 항목 | 할 일 |
|---|---|
| 압축 | `game-viewer-handoff\` 폴더로만 풀기 (충돌 0) |
| 소스 | `src\game-viewer\` 를 실제 `src\` 로 이동 |
| 의존성 | 나열된 패키지 **설치**(package.json 복사 ❌) |
| CLAUDE.md | 덮지 말고 루트에 **포인터 한 줄** 추가 |
| .env/.gitignore | **머지만**, 교체 ❌ |
| 시작 | KICKOFF STEP 2부터 (스캐폴드 건너뜀) |
