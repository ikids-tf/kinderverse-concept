# START HERE — KinderVerse 슬라이드 생성 기능 핸드오프

이 패키지는 **킨더버스(KinderVerse)에 유치원 교사용 슬라이드 장표 생성 기능**을 붙이기 위한 Claude Code 핸드오프입니다. 외부 슬라이드 SaaS(SlideSpeak 등)를 쓰지 않는 **완전 자체 구현** 버전입니다.

## 한 줄 요약

교사가 "봄 나비 관찰 수업 슬라이드 만들어줘" 한 줄을 입력하면, Claude가 슬라이드 구조(DeckSpec JSON)를 생성하고, 자체 React 슬라이드 엔진이 Milray Park 브랜드 템플릿으로 렌더하며, 수업용 삽화는 자체 이미지 파이프라인이 그린다. 결과는 My Board 캔버스에 노드로 올라오고 PDF/PPTX로 내보낸다.

## 읽는 순서

1. **CLAUDE.md** — 반드시 먼저. 절대 어기면 안 되는 아키텍처 불변식과 경로/환경 규칙.
2. **PRD.md** — 제품 스펙 전체. 무엇을 왜 만드는가.
3. **SKILL.md** — 어떻게 만드는가. 인터페이스·모듈 구조·구현 가이드.
4. **PROMPTS.md** — 라우터/슬라이드 에이전트/이미지 style-lock 프롬프트 원문.
5. **KICKOFF_M1.md** — 지금 당장 시작할 M1 작업 체크리스트와 셋업 명령어.
6. **deckspec.schema.json** — DeckSpec JSON Schema (엔진과 에이전트의 계약).

## 스택 (전부 기존 킨더버스 재사용 + 2개 추가)

- React + TypeScript / 캔버스: React Flow / 상태: Zustand + zundo / 텍스트: TipTap
- 에셋: Supabase Storage (+ 이미지 LOD) / 차트: Recharts
- **추가:** PDF export(Puppeteer/Playwright), PPTX export(pptxgenjs)
- 콘텐츠 생성: Claude API / 이미지: `ImageProvider` 추상화 뒤의 교체 가능한 모델

## M1 목표 (1문장)

자체 슬라이드 엔진 + DeckSpec 파이프라인 + 부모설명회/행정 템플릿 + Recharts 차트 + **PDF export**까지, 한 줄 요청에서 완성 덱까지 전체 루프를 닫는다. (수업용 삽화와 PPTX는 M2.)
