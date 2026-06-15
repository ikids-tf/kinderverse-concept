# START HERE — 킨더버스 게임 뷰어

> 보드 툴바에 들어가는 **게임 뷰어(Game Viewer)**. 교사가 프롬프트를 입력하면
> 유아용 인터랙티브 게임이 즉시 생성·플레이되는 모듈.

이 폴더는 **Claude Code 핸드오프 패키지**다. 아래 순서로 읽고 바로 개발을 시작한다.

> 🔴 **기존 KinderVerse 프로젝트에 끼워넣는 경우 → 먼저 `INTEGRATION.md`를 본다.**
> 이 패키지를 프로젝트 루트에 통째로 덮어쓰면 기존 CLAUDE.md·package.json 등이 날아간다.
> INTEGRATION.md가 충돌 없이 모듈만 끼워넣는 순서를 안내한다.

## 📖 읽는 순서

0. **INTEGRATION.md** — (기존 프로젝트에 넣을 때) 충돌 없이 통합하는 법. **먼저.**

1. **CLAUDE.md** — 매 세션 컨텍스트. 핵심 설계 결정·규칙·금지사항. (Claude Code가 자동으로 읽음)
2. **PRD.md** — 무엇을 만드는가. 전체 스펙·템플릿·파이프라인·마일스톤.
3. **KICKOFF_M1.md** — 가장 먼저 만들 것. 단계별 실행 순서.
4. **PROMPTS.md** — Claude Code에 그대로 붙여넣는 위임 프롬프트 모음.
5. **FORM_DESIGN.md** — 템플릿 폼 필드 구체 명세(카테고리·개수 옵션·조립 규칙). 입구① 구현 시.
6. **src/game-viewer/schema/gameSpec.ts** — 모든 것의 계약(Contract). 먼저 이해할 것.

## ⚡ 셋업 (PowerShell — 경로에 공백 있으니 반드시 따옴표)

```powershell
# 1) 프로젝트 폴더로 이동 (공백 때문에 따옴표 필수!)
cd "D:\claude_project\kinderverse concept"

# 2) Claude Code 실행
claude

# 3) Claude Code 안에서 첫 명령:
#    "KICKOFF_M1.md를 읽고 M1을 시작해줘. 경로에 공백이 있으니 모든 명령을 따옴표로 감싸."
```

## 🎯 한 줄 원칙

> **런타임 코드 생성이 아니다. 잘 만든 템플릿(엔진) + AI가 만드는 콘텐츠 파라미터(GameSpec)다.**
> 빠르고, 퀄리티가 항상 일정하고, 아이에게 안전하다.
>
> 시작 입구는 **셋(템플릿 갤러리 / 프롬프트 / 예시 변형)**, 출력은 **하나(GameSpec)**.
> 프롬프트로만 시작하지 않아도 된다. (CLAUDE.md §1-❹, PRD §3.5)

## 🚦 지금 당장 (M1)

`counting` + `silhouette` 두 템플릿으로 두 입구를 동작시킨다:
- **① 템플릿 갤러리 → 폼**(카테고리·개수·연령 탭 선택) → **LLM 없이** 게임 생성. ← M1 핵심
- **② 프롬프트**(목업 매핑) → 게임 생성.

둘 다 OpenMoji만 쓰므로 이미지 생성이 없어 가장 빠르게 동작을 확인할 수 있다.

→ **KICKOFF_M1.md** 로 이동.
