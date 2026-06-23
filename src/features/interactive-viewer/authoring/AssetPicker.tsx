/**
 * 자료 선택기 — 게임/갤러리 탭 · 복수선택 · '적용' 버튼.
 *  · 게임 탭: 인터랙티브 노드에서 생성한 이미지(source==='game').
 *  · 갤러리 탭: 갤러리 페이지의 그 외 이미지(업로드·보드 생성 등).
 * 라이브러리 자산은 복사만(원본 유지). 파일 업로드는 즉시 적용(단발).
 * 클릭=선택(즉시 적용 X), 하단 '적용'으로 한 번에 게임에 넣는다.
 */
import { useEffect, useMemo, useState } from 'react';
import { Icon } from '@/lib/icons';
import { listAssets, peekAssets, type ImageAsset } from '@/board/assets';

export type AssetPick = { kind: 'file'; file: File } | { kind: 'library'; asset: ImageAsset };

interface Props {
  title: string;
  /** true = 복수선택 + 적용 버튼 / false = 단일선택(교체 등). */
  multi?: boolean;
  onApply: (picks: AssetPick[]) => void;
  onClose: () => void;
}

const keyOf = (a: ImageAsset) => `${a.tag}-${a.createdAt}`;
const isBgAsset = (a: ImageAsset) => /배경|background/i.test(`${a.tag} ${a.group ?? ''}`);

export function AssetPicker({ title, multi = true, onApply, onClose }: Props) {
  // 캐시에 이미 있으면(워밍업됨) 로딩 없이 '즉시' 그린다 — 클릭하면 바로 이미지가 보이게.
  const [assets, setAssets] = useState<ImageAsset[]>(() => peekAssets(['image', '도안']) ?? []);
  const [loading, setLoading] = useState(() => !peekAssets(['image', '도안']));
  const [tab, setTab] = useState<'game' | 'gallery'>('game');
  const [sel, setSel] = useState<string[]>([]);

  // 항상 한 번 새로고침(새로 저장된 이미지 반영). 캐시가 있으면 위에서 이미 보여줬으니 깜빡임 없음.
  useEffect(() => {
    let alive = true;
    listAssets(['image', '도안'])
      .then((a) => { if (alive) { setAssets(a); setLoading(false); } })
      .catch(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  const gameAssets = useMemo(() => assets.filter((a) => a.source === 'game'), [assets]);
  const galleryAssets = useMemo(() => assets.filter((a) => a.source !== 'game'), [assets]);
  // 게임 탭이 비어 있으면 갤러리부터 보여준다.
  useEffect(() => {
    if (!loading && gameAssets.length === 0 && galleryAssets.length > 0) setTab('gallery');
  }, [loading, gameAssets.length, galleryAssets.length]);

  const shown = tab === 'game' ? gameAssets : galleryAssets;
  const selSet = useMemo(() => new Set(sel), [sel]);

  const toggle = (a: ImageAsset) => {
    const k = keyOf(a);
    setSel((s) => (multi ? (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]) : s.includes(k) ? [] : [k]));
  };

  const onFiles = (fl: FileList | null) => {
    const f = fl && fl[0];
    if (f) onApply([{ kind: 'file', file: f }]); // 파일 업로드는 즉시 적용(단발)
  };

  const apply = () => {
    const byKey = new Map(assets.map((a) => [keyOf(a), a] as const));
    const picks: AssetPick[] = sel
      .map((k) => byKey.get(k))
      .filter((a): a is ImageAsset => !!a)
      .map((a) => ({ kind: 'library', asset: a }));
    if (picks.length) onApply(picks);
  };

  const tabBtn = (t: 'game' | 'gallery', label: string, count: number) => (
    <button
      type="button"
      onClick={() => setTab(t)}
      className={`flex items-center gap-1.5 rounded-pill px-3.5 py-1.5 text-sm font-bold transition-colors ${
        tab === t ? 'bg-accent text-on-accent' : 'bg-surface-2 text-fg-2 hover:text-fg'
      }`}
    >
      {label}
      <span className={`rounded-full px-1.5 text-[11px] font-bold ${tab === t ? 'bg-white/25' : 'bg-surface-3 text-fg-muted'}`}>{count}</span>
    </button>
  );

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-fg/40 p-6" onClick={onClose}>
      <div
        className="flex max-h-[88%] w-[760px] max-w-[94vw] flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-fg">{title}</h3>
          <button onClick={onClose} className="inline-flex items-center rounded-pill px-2 py-1 text-fg-muted hover:bg-surface-3 hover:text-fg" aria-label="닫기">
            <Icon name="x" size={16} />
          </button>
        </div>

        {/* 탭 + 파일 업로드 */}
        <div className="flex flex-wrap items-center gap-2">
          {tabBtn('game', '게임', gameAssets.length)}
          {tabBtn('gallery', '갤러리', galleryAssets.length)}
          <label className="ml-auto flex cursor-pointer items-center gap-1.5 rounded-pill border border-dashed border-border px-3 py-1.5 text-sm font-semibold text-fg-2 transition-colors hover:border-accent hover:text-accent">
            <Icon name="upload" size={15} /> 파일에서
            <input type="file" accept="image/*" className="hidden" onChange={(e) => onFiles(e.target.files)} />
          </label>
        </div>

        {/* 그리드 — 큰 썸네일(고정 높이로 그리드 행 붕괴/겹침 방지) */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="py-10 text-center text-sm text-fg-muted">불러오는 중…</div>
          ) : shown.length === 0 ? (
            <div className="py-10 text-center text-sm text-fg-muted">
              {tab === 'game'
                ? '게임에서 만든 이미지가 아직 없어요 — 프롬프트로 게임을 만들면 여기 쌓여요'
                : '갤러리에 이미지가 없어요 — 파일에서 가져오세요'}
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-3">
              {shown.map((a) => {
                const on = selSet.has(keyOf(a));
                return (
                  <button
                    key={keyOf(a)}
                    onClick={() => toggle(a)}
                    title={a.tag}
                    className={`relative h-36 overflow-hidden rounded-xl border-2 bg-surface-2 transition-colors ${
                      on ? 'border-accent' : 'border-border hover:border-accent/60'
                    }`}
                  >
                    <img src={a.url} alt={a.tag} loading="lazy" decoding="async" className="block h-full w-full object-cover" draggable={false} />
                    {isBgAsset(a) && (
                      <span className="absolute left-1.5 top-1.5 rounded-pill bg-fg/70 px-1.5 py-0.5 text-[10px] font-bold text-on-dark">배경</span>
                    )}
                    {on && (
                      <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-on-accent shadow">
                        <Icon name="check" size={14} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 적용 바 */}
        <div className="flex items-center justify-between border-t border-border pt-3">
          <span className="text-sm text-fg-muted">
            {sel.length > 0 ? `${sel.length}개 선택됨` : multi ? '이미지를 골라 선택하세요 (여러 개 가능)' : '이미지를 하나 고르세요'}
          </span>
          <button
            onClick={apply}
            disabled={sel.length === 0}
            className={`inline-flex items-center gap-1.5 rounded-pill px-5 py-2 text-sm font-bold transition-colors ${
              sel.length === 0 ? 'cursor-not-allowed bg-surface-2 text-fg-muted' : 'bg-accent text-on-accent hover:bg-accent-strong'
            }`}
          >
            <Icon name="check" size={15} /> 적용{sel.length > 0 ? ` (${sel.length})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
