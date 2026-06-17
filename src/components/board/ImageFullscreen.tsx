import { useEffect } from 'react';
import { Icon } from '@/lib/icons';
import { useZoomModal, type OriginRect } from './useZoomModal';

/* 이미지 '크게 보기'(풀스크린) — 카드 위치에서 커지며 열리고 닫을 때 그 위치로 작아진다.
   열려 있는 동안 배경(보드) 조작은 useZoomModal이 차단한다. */
export function ImageFullscreen({
  src,
  caption,
  origin,
  onClose,
}: {
  src: string;
  caption: string;
  origin?: OriginRect | null;
  onClose: () => void;
}) {
  const { requestClose, onContentTransitionEnd, contentStyle, backdropStyle } = useZoomModal(origin, onClose);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') requestClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [requestClose]);

  const download = () => {
    const a = document.createElement('a');
    a.href = src;
    a.download = `${(caption || 'kinderverse').replace(/[\\/:*?"<>|]/g, '_')}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 80 }}>
      <div
        onClick={requestClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(20,19,17,.82)', backdropFilter: 'blur(6px)', ...backdropStyle }}
      />
      <div
        onClick={requestClose}
        onTransitionEnd={onContentTransitionEnd}
        style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, ...contentStyle }}
      >
        <img
          src={src}
          alt={caption}
          onClick={(e) => e.stopPropagation()}
          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,.4)' }}
        />
        <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', gap: 8 }}>
          <button
            onClick={(e) => { e.stopPropagation(); download(); }}
            title="다운로드"
            style={{ width: 40, height: 40, borderRadius: 999, border: 'none', background: 'rgba(255,255,255,.92)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}
          >
            <Icon name="download" size={18} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); requestClose(); }}
            title="닫기 (Esc)"
            style={{ width: 40, height: 40, borderRadius: 999, border: 'none', background: 'rgba(255,255,255,.92)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}
          >
            <Icon name="x" size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
