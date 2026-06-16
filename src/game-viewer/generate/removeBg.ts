/**
 * removeBg.ts — 배경 제거(누끼)는 공용 구현(@/lib/removeBg)으로 일원화했다.
 * 게임 뷰어(MakeGamePage)와 보드(배경제거 프롬프트)가 같은 함수를 쓴다. 이 파일은
 * 기존 게임 뷰어 임포트 경로를 깨지 않으려는 얇은 재노출이다.
 */
export { removeBg } from "@/lib/removeBg";
