/* SlideRenderer — DeckSpec의 한 슬라이드를 layout enum에 매핑된 React 컴포넌트로 렌더.
   외부 슬라이드 SaaS로 위임하지 않는다(불변식 3). 캔버스는 16:9 1280×720 고정. */

import type { FC } from 'react';
import type { DeckSpec, Slide } from '../schema/deckspec';
import { LAYOUT_COMPONENTS, type EditHandlers } from './layouts';

export const SlideRenderer: FC<{
  slide: Slide;
  theme: DeckSpec['theme'];
  editable: boolean;
  h: EditHandlers;
  /** 현재 쪽번호(1-based). slide.number가 true일 때 우하단에 표시. */
  pageNumber?: number;
}> = ({ slide, theme, editable, h, pageNumber }) => {
  const Cmp = LAYOUT_COMPONENTS[slide.layout] ?? LAYOUT_COMPONENTS.title;
  return (
    <div
      className="slide-canvas"
      data-theme={theme}
      data-layout={slide.layout}
      data-accent={slide.accentRole ?? 'coral'}
    >
      <Cmp slide={slide} editable={editable} h={h} />
      {slide.number && pageNumber ? (
        <span className="slide-number">{String(pageNumber).padStart(2, '0')}</span>
      ) : null}
    </div>
  );
};
