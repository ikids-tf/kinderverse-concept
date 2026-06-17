/**
 * stageSize.ts — 무대 픽셀 크기 컨텍스트.
 * 이모지/텍스트 크기(노드 비율 → px)와 reveal 뽑힘 거리를 정규화 좌표에서 px로 환산하는 데 쓴다.
 */
import { createContext, useContext } from "react";

export interface StageSize { w: number; h: number; }
export const StageSizeContext = createContext<StageSize>({ w: 0, h: 0 });
export const useStageSize = (): StageSize => useContext(StageSizeContext);
