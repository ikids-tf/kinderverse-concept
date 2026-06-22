/**
 * 인터랙티브 게임 홈/갤러리 — 저장된 인터랙티브 게임 목록(살아있는 미리보기)을 보여주고,
 * 카드를 누르면 재생한다. 게임 '종료' 시 이 화면(인터랙티브 홈)으로 이동한다.
 *
 * 자기완결 오버레이(포털). 보드 카드(InteractiveNodeCard)나 어디서든 띄울 수 있다.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/lib/icons';
import { ZoomOverlay } from '@/components/board/ZoomOverlay';
import { extendInteractiveActivity } from '@/board/composer';
import { listInteractiveNodes, useInteractiveStore } from '../store/interactiveStore';
import { InteractiveStage } from '../runtime/InteractiveStage';
import { InteractiveOverlay } from './InteractiveOverlay';

const chromeBtn =
  'inline-flex items-center gap-1.5 rounded-pill border border-border bg-surface/95 px-3 py-1.5 text-sm font-semibold text-fg shadow-sm transition-colors hover:border-accent hover:text-accent';

/** 게임 한 칸의 살아있는 미리보기 — 스토어에서 문서를 보장(ensure)하고 preview 로 렌더. */
function GalleryThumb({ id }: { id: string }) {
  const ensure = useInteractiveStore((s) => s.ensure);
  const doc = useInteractiveStore((s) => s.docs[id]);
  useEffect(() => {
    ensure(id);
  }, [id, ensure]);
  return doc ? (
    <InteractiveStage doc={doc} mode="play" preview />
  ) : (
    <div className="grid h-full w-full place-items-center text-fg-muted">불러오는 중…</div>
  );
}

export function InteractiveGallery({ onClose }: { onClose: () => void }) {
  const [playId, setPlayId] = useState<string | null>(null);
  const games = listInteractiveNodes();
  const playing = games.find((g) => g.id === playId);

  return createPortal(
    <div className="fixed inset-0 z-[140] flex flex-col" style={{ background: 'var(--bg-deep)' }}>
      {/* 상단 */}
      <div className="flex items-center justify-between p-3">
        <span className="rounded-pill bg-surface px-3 py-1.5 text-sm font-bold text-fg shadow-sm">🎮 인터랙티브 게임</span>
        <button onClick={onClose} className={chromeBtn} aria-label="닫기">
          <Icon name="x" size={16} /> 닫기
        </button>
      </div>

      {/* 목록 */}
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {games.length === 0 ? (
          <div className="grid h-full place-items-center text-center text-fg-muted">
            아직 만든 인터랙티브 게임이 없어요.<br />보드에서 “○○ 게임 만들어줘”로 만들어 보세요.
          </div>
        ) : (
          <div className="mx-auto grid max-w-5xl grid-cols-2 gap-4 sm:grid-cols-3">
            {games.map((g) => (
              <button
                key={g.id}
                onClick={() => setPlayId(g.id)}
                className="group relative aspect-[16/10] overflow-hidden rounded-2xl border border-border bg-surface shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md"
                title={`${g.title || '인터랙티브'} — 재생`}
              >
                <div className="pointer-events-none absolute inset-0">
                  <GalleryThumb id={g.id} />
                </div>
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/55 to-transparent px-3 py-2 text-left">
                  <span className="truncate text-sm font-bold text-white">{g.title || '인터랙티브'}</span>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-on-accent shadow">
                    <Icon name="play" size={16} fill="currentColor" stroke={0} />
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 선택한 게임 재생 — 종료 시 다시 목록으로, 확장 활동은 보드에 만들고 갤러리도 닫는다. */}
      {playId && (
        <ZoomOverlay origin={null} onClose={() => setPlayId(null)} zIndex={150} backdropClassName="">
          {(close) => (
            <InteractiveOverlay
              docId={playId}
              initialMode="play"
              onClose={close}
              onExit={() => setPlayId(null)}
              onExtend={() => {
                void extendInteractiveActivity(playing?.title ?? '인터랙티브 놀이');
                onClose();
              }}
            />
          )}
        </ZoomOverlay>
      )}
    </div>,
    document.body,
  );
}
