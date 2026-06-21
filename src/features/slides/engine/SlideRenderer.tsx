/* SlideRenderer — DeckSpec의 한 슬라이드를 layout enum에 매핑된 React 컴포넌트로 렌더.
   외부 슬라이드 SaaS로 위임하지 않는다(불변식 3). 캔버스는 16:9 1280×720 고정. */

import type { FC } from 'react';
import type { DeckSpec, Slide } from '../schema/deckspec';
import { LAYOUT_COMPONENTS, NO_SELECTION, type EditHandlers, type Selection } from './layouts';
import { SlideBg } from './SlideImage';

export const SlideRenderer: FC<{
  slide: Slide;
  theme: DeckSpec['theme'];
  editable: boolean;
  h: EditHandlers;
  /** 현재 쪽번호(1-based). slide.number가 true일 때 우하단에 표시. */
  pageNumber?: number;
  /** 현재 선택(다중 블록 + eyebrow). 없으면 빈 선택. */
  selected?: Selection;
  /** 썸네일(레일) 렌더 — 인터렉티브 슬라이드를 정적 미리보기로(버튼·자동재생 없음). */
  thumbnail?: boolean;
}> = ({ slide, theme, editable, h, pageNumber, selected, thumbnail }) => {
  const Cmp = LAYOUT_COMPONENTS[slide.layout] ?? LAYOUT_COMPONENTS.title;
  return (
    <div
      className="slide-canvas"
      data-theme={theme}
      data-layout={slide.layout}
      data-accent={slide.accentRole ?? 'coral'}
      data-bg={slide.background ? '1' : undefined}
    >
      <SlideBg background={slide.background} />
      <Cmp slide={slide} theme={theme} editable={editable} h={h} selected={selected ?? NO_SELECTION} thumbnail={thumbnail} />
      {slide.number && pageNumber ? (
        <span className="slide-number">{String(pageNumber).padStart(2, '0')}</span>
      ) : null}
    </div>
  );
};
