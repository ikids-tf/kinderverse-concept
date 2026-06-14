/* 이미지 피커 — 블록/배경 이미지를 세 경로로 채운다: AI 생성 · 보관함 · 업로드.
   어떤 경로든 결과 data URI를 slideAssets(IDB)에 저장하고 그 assetId를 onPick으로 돌려준다
   (덱에는 id만 들어감). AI는 기존 게이트웨이 image 태스크, 보관함은 assets.ts 재사용. */

import { useEffect, useState, type FC } from 'react';
import { callGateway } from '@/ai/client';
import { listAssets, searchAssets, type ImageAsset } from '@/board/assets';
import { storeSlideImage } from '../assets/slideAssets';

type Tab = 'ai' | 'lib' | 'upload';

export const ImagePicker: FC<{ title?: string; onPick: (assetId: string) => void; onClose: () => void }> = ({
  title,
  onPick,
  onClose,
}) => {
  const [tab, setTab] = useState<Tab>('ai');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [lib, setLib] = useState<ImageAsset[]>([]);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (tab !== 'lib') return;
    const p = q.trim() ? searchAssets(q, undefined, 40) : listAssets(['image', '도안']);
    p.then(setLib).catch(() => setLib([]));
  }, [tab, q]);

  const commit = async (dataUri: string) => {
    setBusy(true);
    setErr('');
    const id = await storeSlideImage(dataUri);
    setBusy(false);
    if (id) onPick(id);
    else setErr('이미지를 저장하지 못했어요');
  };

  const genAI = async () => {
    const p = aiPrompt.trim();
    if (!p) return;
    setBusy(true);
    setErr('');
    try {
      const res = await callGateway({
        task: 'image',
        provider: 'auto',
        messages: [],
        meta: { prompt: `${p} — 밝고 따뜻한 일러스트, 깔끔한 배경, 이미지 안에 글자 없음`, caption: p, aspectRatio: '16:9' },
      });
      if (res.image) await commit(res.image);
      else setErr(res.error || '이미지를 만들지 못했어요');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onFile = (f?: File) => {
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      if (typeof r.result === 'string') void commit(r.result);
    };
    r.readAsDataURL(f);
  };

  return (
    <div className="ip-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ip-modal">
        <div className="ip-head">
          <span className="ip-title">{title ?? '이미지 추가'}</span>
          <button type="button" className="ip-x" title="닫기" onClick={onClose}>✕</button>
        </div>
        <div className="ip-tabs">
          <button type="button" className={tab === 'ai' ? 'on' : ''} onClick={() => setTab('ai')}>AI 생성</button>
          <button type="button" className={tab === 'lib' ? 'on' : ''} onClick={() => setTab('lib')}>보관함</button>
          <button type="button" className={tab === 'upload' ? 'on' : ''} onClick={() => setTab('upload')}>업로드</button>
        </div>
        <div className="ip-body">
          {tab === 'ai' && (
            <div className="ip-ai">
              <textarea
                className="ip-input"
                placeholder="그릴 내용을 적어요 — 예: 봄 들판의 노란 나비"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
              />
              <button type="button" className="ip-btn" disabled={busy || !aiPrompt.trim()} onClick={genAI}>
                {busy ? '생성 중…' : '생성'}
              </button>
            </div>
          )}
          {tab === 'lib' && (
            <div className="ip-lib">
              <input className="ip-search" placeholder="보관함 검색…" value={q} onChange={(e) => setQ(e.target.value)} />
              <div className="ip-grid">
                {lib.map((a, i) => (
                  <button
                    key={i}
                    type="button"
                    className="ip-thumb"
                    title={a.tag}
                    onClick={() => void commit(a.url)}
                    style={{ backgroundImage: `url("${a.url}")` }}
                  />
                ))}
                {lib.length === 0 && <div className="ip-empty">보관함에 이미지가 없어요</div>}
              </div>
            </div>
          )}
          {tab === 'upload' && (
            <label className="ip-upload">
              <input type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0] ?? undefined)} />
              <span className="ph-ic" aria-hidden>📁</span>
              <span>기기에서 이미지 선택</span>
            </label>
          )}
          {err && <div className="ip-err">{err}</div>}
        </div>
      </div>
    </div>
  );
};
