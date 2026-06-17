import { forwardRef, useImperativeHandle } from 'react';
import { useZoomModal, type OriginRect } from './useZoomModal';

/* 공용 줌 오버레이 — 카드 위치(origin)에서 커지며 열리고 닫을 때 그 위치로 작아진다.
   열려 있는 동안 배경(보드) 스크롤·줌·터치를 차단(useZoomModal).
   이 서비스의 '편집창/풀스크린/뷰어' 오버레이가 모두 같은 동작을 갖도록 공유한다.

   - children: 닫기 함수를 받는 렌더 프롭. 내부 닫기 버튼은 이 close를 호출하면 애니메이션 닫힘.
   - ref.close(): Esc·postMessage 등 외부에서 애니메이션 닫기를 트리거할 때 사용. */
export type ZoomOverlayHandle = { close: () => void };

export const ZoomOverlay = forwardRef<
  ZoomOverlayHandle,
  {
    origin?: OriginRect | null;
    onClose: () => void;
    zIndex?: number;
    backdropClassName?: string;
    backdropStyle?: React.CSSProperties;
    children: (close: () => void) => React.ReactNode;
  }
>(function ZoomOverlay(
  { origin, onClose, zIndex = 120, backdropClassName = 'bg-fg/80 backdrop-blur-sm', backdropStyle, children },
  ref,
) {
  const { requestClose, onContentTransitionEnd, contentStyle, backdropStyle: bdAnim } = useZoomModal(origin, onClose);
  useImperativeHandle(ref, () => ({ close: requestClose }), [requestClose]);
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex }}>
      <div
        onClick={requestClose}
        className={`absolute inset-0 ${backdropClassName}`}
        style={{ ...backdropStyle, ...bdAnim }}
      />
      <div className="absolute inset-0" style={contentStyle} onTransitionEnd={onContentTransitionEnd}>
        {children(requestClose)}
      </div>
    </div>
  );
});
