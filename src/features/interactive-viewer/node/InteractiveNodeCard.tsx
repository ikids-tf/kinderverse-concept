/**
 * 보드 임베드 카드 — 인터렉티브 노드의 '살아있는 썸네일'(파스텔 미리보기) + 교사용
 * 호버 액션(편집/재생). 클릭하면 ZoomOverlay로 풀블리드 확장(저작/재생). 닫으면
 * 보드로 줌아웃 + 갱신된 썸네일. NodeView의 type==='interactive' 분기가 이걸 감싼다.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ZoomOverlay } from '@/components/board/ZoomOverlay';
import type { OriginRect } from '@/components/board/useZoomModal';
import type { BoardNode } from '@/store/boardStore';
import { useInteractiveStore } from '../store/interactiveStore';
import { InteractiveStage } from '../runtime/InteractiveStage';
import { InteractiveOverlay } from '../authoring/InteractiveOverlay';
import { urlToAssetRef, makeImageElement, makeVideoElement, withElementAdded } from '../runtime/assetIngest';

interface Props {
  node: BoardNode;
  height: number;
  selected: boolean;
  presenting: boolean;
}

const hoverBtn =
  'flex h-8 items-center rounded-md border border-border bg-surface/95 px-2 text-xs font-semibold text-fg-2 shadow-sm transition-colors hover:border-accent hover:bg-accent hover:text-on-accent';

export function InteractiveNodeCard({ node, height, selected, presenting }: Props) {
  const docId = (node.data?.docId as string | undefined) ?? '';
  const doc = useInteractiveStore((s) => (docId ? s.docs[docId] : undefined));
  const ensure = useInteractiveStore((s) => s.ensure);
  const mutate = useInteractiveStore((s) => s.mutate);
  const cardRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<null | { mode: 'play' | 'edit'; origin: OriginRect | null }>(null);

  useEffect(() => {
    if (docId) ensure(docId);
  }, [docId, ensure]);

  // 보드 자료(이미지·동영상)를 이 인터랙티브 노드 위에 드롭 → 드롭한 위치에 요소로 추가.
  // BoardCanvas가 드롭을 감지해 kv:inode-add-asset(커서 클라이언트 좌표)을 쏜다.
  useEffect(() => {
    if (!docId) return;
    const onAdd = (e: Event) => {
      const d = (e as CustomEvent).detail as
        | { nodeId?: string; kind?: 'image' | 'video'; src?: string; clientX?: number; clientY?: number }
        | null;
      if (!d || d.nodeId !== node.id || !d.src || (d.kind !== 'image' && d.kind !== 'video')) return;
      // 클라이언트 좌표 → 논리(캔버스) 좌표. .ic-canvas의 실제 화면 사각형(logical 0..cw를 덮음)
      // 비율로 환산 — 어떤 transform(보드 줌·fit scale)이 걸려 있어도 정확하다.
      const canvasEl = cardRef.current?.querySelector('.ic-canvas') as HTMLElement | null;
      const cur = useInteractiveStore.getState().docs[docId];
      if (!canvasEl || !cur) return;
      const rect = canvasEl.getBoundingClientRect();
      const cw = cur.canvas.size.w;
      const ch = cur.canvas.size.h;
      const lx = rect.width ? ((d.clientX ?? rect.left) - rect.left) * (cw / rect.width) : cw / 2;
      const ly = rect.height ? ((d.clientY ?? rect.top) - rect.top) * (ch / rect.height) : ch / 2;
      const at = { x: Math.max(0, Math.min(cw, lx)), y: Math.max(0, Math.min(ch, ly)) };
      const kind = d.kind;
      const srcUrl = d.src;
      void (async () => {
        const ref = await urlToAssetRef(srcUrl, 'board-copy');
        const el =
          kind === 'video'
            ? makeVideoElement(ref, 'board-copy', at, { w: cw, h: ch })
            : makeImageElement(ref, 'board-copy', at, { w: cw, h: ch });
        mutate(docId, (doc2) => withElementAdded(doc2, el));
      })();
    };
    window.addEventListener('kv:inode-add-asset', onAdd as EventListener);
    return () => window.removeEventListener('kv:inode-add-asset', onAdd as EventListener);
  }, [docId, node.id, mutate]);

  const openOverlay = (mode: 'play' | 'edit') => {
    const r = cardRef.current?.getBoundingClientRect();
    setOpen({ mode, origin: r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null });
  };

  return (
    <div ref={cardRef} className="relative h-full w-full" style={{ height }}>
      {doc ? (
        <InteractiveStage doc={doc} mode="play" preview />
      ) : (
        <div className="grid h-full w-full place-items-center text-fg-muted">불러오는 중…</div>
      )}

      {doc && doc.elements.length === 0 && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center p-3 text-center">
          <span className="rounded-pill bg-surface/90 px-3 py-1 text-[11px] font-semibold text-fg-2 shadow-sm">
            탭하면 움직이는 카드 — ‘편집’으로 자료를 넣어요
          </span>
        </div>
      )}

      {!presenting && (
        <div
          className={`absolute right-1 top-1 flex gap-1 transition-opacity duration-150 ${
            selected ? 'opacity-100' : 'opacity-0 group-hover/card:opacity-100'
          }`}
        >
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              openOverlay('edit');
            }}
            className={hoverBtn}
            title="편집 — 자료 넣고 동작 주기"
          >
            ✎ 편집
          </button>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              openOverlay('play');
            }}
            className={hoverBtn}
            title="재생 — 풀스크린으로"
          >
            ▶ 재생
          </button>
        </div>
      )}

      {open &&
        createPortal(
          <ZoomOverlay origin={open.origin} onClose={() => setOpen(null)} zIndex={130} backdropClassName="">
            {(close) => <InteractiveOverlay docId={docId} initialMode={open.mode} onClose={close} />}
          </ZoomOverlay>,
          document.body,
        )}
    </div>
  );
}
