/* eslint-disable react-refresh/only-export-components --
   useSlideImage 훅 + SlideImage/SlideBg 컴포넌트를 한 모듈로(엔진 이미지 유닛). 의도된 동거. */

/* 슬라이드 이미지 렌더 — assetId(IDB slideAssets)에서 data URI를 로드해 <img>로 그린다.
   불변식 1 유지: 글자는 절대 이미지에 굽지 않는다(이미지는 삽화/배경만, 텍스트는 엔진). */

import { useEffect, useState, type FC } from 'react';
import { getSlideImage } from '../assets/slideAssets';
import type { SlideBackground } from '../schema/deckspec';

/** assetId → IDB data URI(없으면 null). assetId 변경 시 다시 로드. */
export function useSlideImage(assetId?: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (assetId) {
      getSlideImage(assetId).then((u) => {
        if (alive) setUrl(u ?? null);
      });
    } else {
      setUrl(null);
    }
    return () => {
      alive = false;
    };
  }, [assetId]);
  return url;
}

/** 블록 이미지 — 있으면 <img>, 없으면 클릭 가능한 '이미지 추가' 자리표시.
    dataBi: 흐름 모드에서 freeze 측정용 블록 인덱스(data-bi). */
export const SlideImage: FC<{
  assetId?: string | null;
  fit?: 'cover' | 'contain';
  editable: boolean;
  dataBi?: number;
  onPick?: () => void;
}> = ({ assetId, fit, editable, dataBi, onPick }) => {
  const url = useSlideImage(assetId);
  if (url) {
    return (
      <img
        className="sl-img"
        src={url}
        alt=""
        data-bi={dataBi}
        style={{ objectFit: fit ?? 'cover' }}
        onClick={editable ? onPick : undefined}
      />
    );
  }
  return (
    <button type="button" className="sl-ph sl-ph--add" data-bi={dataBi} onClick={editable ? onPick : undefined} disabled={!editable}>
      <span className="ph-ic" aria-hidden>🖼️</span>
      <span className="ph-label">{editable ? '이미지 추가' : '이미지'}</span>
    </button>
  );
};

/** 슬라이드 배경 레이어 + 가독 스크림. */
export const SlideBg: FC<{ background?: SlideBackground }> = ({ background }) => {
  const url = useSlideImage(background?.assetId);
  if (!background || !url) return null;
  return (
    <>
      <div className="slide-bg" style={{ backgroundImage: `url("${url}")`, backgroundSize: background.fit ?? 'cover' }} />
      {background.dim ? <div className="slide-bg-scrim" style={{ opacity: background.dim }} /> : null}
    </>
  );
};
