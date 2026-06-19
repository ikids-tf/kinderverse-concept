/**
 * editContext.ts — 일반(플레이) 화면에서 교사가 더블클릭으로 내용을 바로 고칠 수 있는지.
 * ------------------------------------------------------------------
 * 교사 크롬이 보이는 미리보기 화면에서만 true. 아이 플레이(집중/전체화면)에선 false라
 * 더블클릭 편집이 끼어들지 않고, 탭 반응 지연도 걸리지 않는다(GameStage가 값을 내려준다).
 */
import { createContext, useContext } from "react";

export const InlineEditContext = createContext(false);
export const useCanInlineEdit = (): boolean => useContext(InlineEditContext);
