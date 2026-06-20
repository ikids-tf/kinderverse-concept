/**
 * 자료 선택기 — 파일 업로드(외부) 또는 보드 보관함(board-copy)에서 이미지 고르기.
 * '이미지 추가'와 '교체 대상 고르기'가 공유. 보관함 자산은 복사만(원본은 보관함 유지).
 */
import { useEffect, useState } from 'react';
import { listAssets, type ImageAsset } from '@/board/assets';

export type AssetPick = { kind: 'file'; file: File } | { kind: 'library'; asset: ImageAsset };

interface Props {
  title: string;
  onPick: (p: AssetPick) => void;
  onClose: () => void;
}

export function AssetPicker({ title, onPick, onClose }: Props) {
  const [assets, setAssets] = useState<ImageAsset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    listAssets(['image', '도안'])
      .then((a) => {
        if (alive) {
          setAssets(a);
          setLoading(false);
        }
      })
      .catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-fg/40 p-6" onClick={onClose}>
      <div
        className="flex max-h-[80%] w-[480px] max-w-full flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-fg">{title}</h3>
          <button onClick={onClose} className="rounded-pill px-2 py-1 text-fg-muted hover:bg-surface-3 hover:text-fg">
            ✕
          </button>
        </div>

        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border px-3 py-3 text-sm font-semibold text-fg-2 transition-colors hover:border-accent hover:text-accent">
          📁 파일에서 가져오기
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPick({ kind: 'file', file: f });
            }}
          />
        </label>

        <div className="text-[11px] font-bold uppercase tracking-wide text-fg-muted">보관함</div>
        {loading ? (
          <div className="py-6 text-center text-sm text-fg-muted">불러오는 중…</div>
        ) : assets.length === 0 ? (
          <div className="py-6 text-center text-sm text-fg-muted">보관함이 비어 있어요 — 파일에서 가져오세요</div>
        ) : (
          <div className="grid grid-cols-4 gap-2 overflow-y-auto">
            {assets.map((a, i) => (
              <button
                key={`${a.tag}-${i}`}
                onClick={() => onPick({ kind: 'library', asset: a })}
                title={a.tag}
                className="aspect-square overflow-hidden rounded-lg border border-border bg-surface-2 transition-colors hover:border-accent"
              >
                <img src={a.url} alt={a.tag} className="h-full w-full object-cover" draggable={false} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
