/**
 * 풀스크린 저작/재생 오버레이 — 편집↔재생 토글, 저작 툴바(자료 추가·배경), 인스펙터,
 * 외부 파일 드롭, 배경제거, 교체 대상 고르기. 보드 카드의 ZoomOverlay 안에 마운트된다.
 *
 * 🔴 토큰 분리: 크롬(툴바·인스펙터·상단바)=Milray(Tailwind 유틸). 캔버스/재생=파스텔
 *    (.kv-inode, InteractiveStage 내부). 재생 모드에선 저작 툴바·인스펙터를 숨긴다.
 */
import { useEffect, useRef, useState } from 'react';
import { newId } from '@/store/boardStore';
import { useInteractiveStore } from '../store/interactiveStore';
import { InteractiveStage } from '../runtime/InteractiveStage';
import { Inspector } from '../inspector/Inspector';
import { AssetPicker, type AssetPick } from './AssetPicker';
import {
  fileToAssetRef,
  makeImageElement,
  makeShapeElement,
  makeTextElement,
  removeBgFromAssetRef,
  urlToAssetRef,
  withElementAdded,
} from '../runtime/assetIngest';
import type { Behavior } from '../schema/interactiveNode';

const PASTEL_BGS: Array<{ token: string; color: string }> = [
  { token: 'pastel.cream', color: '#fff7f0' },
  { token: 'pastel.peach', color: '#fde9dd' },
  { token: 'pastel.mint', color: '#8fd9c3' },
  { token: 'pastel.sky', color: '#cfe8f7' },
];

interface Props {
  docId: string;
  initialMode?: 'play' | 'edit';
  onClose: () => void;
}

const chromeBtn =
  'rounded-pill border border-border bg-surface/95 px-3 py-1.5 text-sm font-semibold text-fg shadow-sm transition-colors hover:border-accent hover:text-accent';
const chromeBtnAccent =
  'rounded-pill bg-accent px-3 py-1.5 text-sm font-bold text-on-accent shadow-sm transition-colors hover:bg-accent-strong';
const tbBtn = 'rounded-pill px-2.5 py-1.5 text-sm font-semibold text-fg-2 transition-colors hover:bg-accent hover:text-on-accent';

export function InteractiveOverlay({ docId, initialMode = 'edit', onClose }: Props) {
  const doc = useInteractiveStore((s) => s.docs[docId]);
  const ensure = useInteractiveStore((s) => s.ensure);
  const mutate = useInteractiveStore((s) => s.mutate);
  const [mode, setMode] = useState<'play' | 'edit'>(initialMode);
  const [selectedElId, setSelectedElId] = useState<string | null>(null);
  const [resetNonce, setResetNonce] = useState(0);
  const [picker, setPicker] = useState<null | { for: 'add' | 'swap' }>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ensure(docId);
  }, [docId, ensure]);

  if (!doc) {
    return <div className="absolute inset-0 grid place-items-center text-on-dark">불러오는 중…</div>;
  }

  const center = () => ({ x: doc.canvas.size.w / 2, y: doc.canvas.size.h / 2 });

  const setBehaviorFor = (elId: string, beh: Behavior | null) =>
    mutate(docId, (d) => ({
      ...d,
      behaviors: [...d.behaviors.filter((b) => !(b.target === elId && b.trigger === 'tap')), ...(beh ? [beh] : [])],
    }));

  const moveElement = (elId: string, x: number, y: number) =>
    mutate(docId, (d) => ({
      ...d,
      elements: d.elements.map((e) => (e.id === elId ? { ...e, transform: { ...e.transform, x, y } } : e)),
    }));

  const editText = (elId: string, text: string) =>
    mutate(docId, (d) => ({ ...d, elements: d.elements.map((e) => (e.id === elId ? { ...e, text } : e)) }));

  const removeElement = (elId: string) => {
    mutate(docId, (d) => ({
      ...d,
      elements: d.elements.filter((e) => e.id !== elId),
      behaviors: d.behaviors.filter((b) => b.target !== elId),
      connections: d.connections.filter((c) => c.from !== elId && c.to !== elId),
    }));
    setSelectedElId(null);
  };

  const setBackground = (token: string) =>
    mutate(docId, (d) => ({ ...d, canvas: { ...d.canvas, background: token } }));

  const addImageRef = (
    ref: Awaited<ReturnType<typeof fileToAssetRef>>,
    origin: 'upload' | 'board-copy',
    at: { x: number; y: number },
  ) => {
    const el = makeImageElement(ref, origin, at, doc.canvas.size);
    mutate(docId, (d) => withElementAdded(d, el));
    setSelectedElId(el.id);
  };

  const onFile = async (file: File) => {
    setBusy('사진 넣는 중…');
    try {
      const ref = await fileToAssetRef(file, 'teacher-upload');
      addImageRef(ref, 'upload', center());
    } finally {
      setBusy(null);
    }
  };

  const onDropFiles = async (files: File[], at: { x: number; y: number }) => {
    let p = at;
    for (const f of files) {
      const ref = await fileToAssetRef(f, 'teacher-upload');
      addImageRef(ref, 'upload', p);
      p = { x: p.x + 28, y: p.y + 28 };
    }
  };

  const onPick = async (pick: AssetPick) => {
    const forSwap = picker?.for === 'swap';
    setPicker(null);
    setBusy('자료 넣는 중…');
    try {
      const ref =
        pick.kind === 'file'
          ? await fileToAssetRef(pick.file, 'teacher-upload')
          : await urlToAssetRef(pick.asset.url, 'teacher-upload');
      if (forSwap && selectedElId) {
        setBehaviorFor(selectedElId, {
          id: newId('beh'),
          target: selectedElId,
          trigger: 'tap',
          action: 'swap',
          params: { to: ref, mode: 'image' },
        });
      } else {
        addImageRef(ref, pick.kind === 'file' ? 'upload' : 'board-copy', center());
      }
    } finally {
      setBusy(null);
    }
  };

  const removeBg = async () => {
    if (!selectedElId) return;
    const el = doc.elements.find((e) => e.id === selectedElId);
    if (!el || !el.src) return;
    setBusy('배경 지우는 중… (처음엔 모델 다운로드로 시간이 걸려요)');
    try {
      const next = await removeBgFromAssetRef(el.src);
      mutate(docId, (d) => ({
        ...d,
        elements: d.elements.map((e) => (e.id === el.id ? { ...e, src: next } : e)),
      }));
    } catch {
      setBusy('배경 제거에 실패했어요 — 원본을 유지합니다');
      setTimeout(() => setBusy(null), 1800);
      return;
    }
    setBusy(null);
  };

  const addText = () => {
    const el = makeTextElement('글자', center());
    mutate(docId, (d) => withElementAdded(d, el));
    setSelectedElId(el.id);
  };
  const addShape = () => {
    const el = makeShapeElement(center());
    mutate(docId, (d) => withElementAdded(d, el));
    setSelectedElId(el.id);
  };

  const toggleMode = () =>
    setMode((m) => {
      const next = m === 'edit' ? 'play' : 'edit';
      if (next === 'play') setResetNonce((n) => n + 1);
      else setSelectedElId(null);
      return next;
    });

  return (
    <div className="absolute inset-0 flex flex-col" style={{ background: 'rgba(20,19,17,.95)' }}>
      {/* 상단 크롬 */}
      <div className="flex items-center justify-between gap-2 p-3">
        <span className="rounded-pill bg-surface px-3 py-1.5 text-sm font-bold text-fg shadow-sm">{doc.title}</span>
        <div className="flex items-center gap-2">
          {mode === 'play' && (
            <button onClick={() => setResetNonce((n) => n + 1)} className={chromeBtn}>
              ↺ 처음으로
            </button>
          )}
          <button onClick={toggleMode} className={chromeBtnAccent}>
            {mode === 'edit' ? '▶ 재생' : '✎ 편집'}
          </button>
          <button onClick={onClose} className={chromeBtn}>
            ✕ 닫기
          </button>
        </div>
      </div>

      {/* 본문 — 캔버스 + (편집 시) 인스펙터 */}
      <div className="flex min-h-0 flex-1 gap-3 px-3 pb-16">
        <div className="relative min-w-0 flex-1 overflow-hidden rounded-2xl">
          <InteractiveStage
            doc={doc}
            mode={mode}
            selectedElId={selectedElId}
            onSelectEl={setSelectedElId}
            onMoveElement={moveElement}
            onDropFiles={onDropFiles}
            resetNonce={resetNonce}
          />
        </div>
        {mode === 'edit' && selectedElId && (
          <Inspector
            doc={doc}
            elId={selectedElId}
            onSetBehavior={(b) => setBehaviorFor(selectedElId, b)}
            onAddSwap={() => setPicker({ for: 'swap' })}
            onRemoveBg={removeBg}
            onEditText={(t) => editText(selectedElId, t)}
            onRemoveElement={() => removeElement(selectedElId)}
            busy={busy}
          />
        )}
      </div>

      {/* 저작 툴바(재생 모드에선 숨김) */}
      {mode === 'edit' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
          <div className="pointer-events-auto flex items-center gap-1 rounded-pill border border-border bg-surface/95 px-2 py-1.5 shadow-md backdrop-blur">
            <button onClick={() => fileRef.current?.click()} className={tbBtn}>
              📷 사진
            </button>
            <button onClick={() => setPicker({ for: 'add' })} className={tbBtn}>
              🗂 보관함
            </button>
            <button onClick={addText} className={tbBtn}>
              가 글자
            </button>
            <button onClick={addShape} className={tbBtn}>
              ⬛ 도형
            </button>
            <span className="mx-1 h-5 w-px bg-border" />
            {PASTEL_BGS.map((b) => (
              <button
                key={b.token}
                onClick={() => setBackground(b.token)}
                title="배경 색"
                className="h-6 w-6 rounded-full border border-border transition-transform hover:scale-110"
                style={{ background: b.color }}
              />
            ))}
          </div>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
          e.currentTarget.value = '';
        }}
      />

      {picker && (
        <AssetPicker
          title={picker.for === 'swap' ? '바뀔 그림 고르기' : '그림 추가'}
          onClose={() => setPicker(null)}
          onPick={onPick}
        />
      )}
    </div>
  );
}
