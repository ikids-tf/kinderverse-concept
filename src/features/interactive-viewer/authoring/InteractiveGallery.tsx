/**
 * 인터랙티브 게임 홈 — 첫 화면.
 *  · 저장한 게임 목록(살아있는 미리보기) — 눌러서 바로 재생.
 *  · 대표 프롬프트 버튼('어떤 게임을 만들 수 있나') — 눌러서 바로 생성·재생.
 * 게임 '종료' 시 이 화면(인터랙티브 홈)으로 이동한다. 자기완결 오버레이(포털).
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/lib/icons';
import { ZoomOverlay } from '@/components/board/ZoomOverlay';
import { newDocId, useInteractiveStore } from '../store/interactiveStore';
import { listLibrary, removeFromLibrary } from '../store/library';
import { composeInteractiveNode } from './composeNode';
import { renderGameFirstFrame } from '../runtime/firstFrame';
import { InteractiveOverlay } from './InteractiveOverlay';

const chromeBtn =
  'inline-flex items-center gap-1.5 rounded-pill border border-border bg-surface/95 px-3 py-1.5 text-sm font-semibold text-fg shadow-sm transition-colors hover:border-accent hover:text-accent';

/** 대표 프롬프트 — '이런 게임을 만들 수 있어요'. 누르면 바로 생성·재생. */
const REC_PROMPTS: Array<{ emoji: string; label: string; prompt: string }> = [
  { emoji: '🔢', label: '수 세기·순서', prompt: '개구리가 연잎을 순서대로 눌러 숫자 세는 게임 만들어줘' },
  { emoji: '🍎', label: '정답 고르기', prompt: '여러 그림 중에서 과일만 찾아 누르는 게임 만들어줘' },
  { emoji: '🗑️', label: '분류하기', prompt: '쓰레기를 종류별 통에 옮기는 분류 게임 만들어줘' },
  { emoji: '🐰', label: '숨바꼭질', prompt: '풀숲에 숨은 토끼를 찾아 누르면 깡총 뛰어나오는 게임 만들어줘' },
  { emoji: '🔊', label: '탐험·소리', prompt: '동물을 누르면 이름과 소리를 들려주는 게임 만들어줘' },
];

/** 게임 한 칸의 미리보기 — 라이브 스테이지 대신 '첫 화면'을 한 장(정적 이미지)으로 구워 보여준다.
    N개 게임을 동시에 살아있는 스테이지로 렌더하던 부담(요소·애니메이션 상시 구동)을 없앤다.
    합성은 docId+내용 기준 캐시(firstFrame.ts) → 재열람은 즉시. 합성 실패(CORS 등) 시 배경 폴백. */
function GalleryThumb({ id }: { id: string }) {
  const ensure = useInteractiveStore((s) => s.ensure);
  const doc = useInteractiveStore((s) => s.docs[id]);
  const [frame, setFrame] = useState<string | undefined>();
  useEffect(() => { ensure(id); }, [id, ensure]);
  useEffect(() => {
    if (!doc) return;
    let alive = true;
    setFrame(undefined);
    void renderGameFirstFrame(doc)
      .then((f) => { if (alive && f) setFrame(f); })
      .catch(() => { /* 합성 실패(CORS 등) — 배경 폴백 유지 */ });
    return () => { alive = false; };
  }, [doc]);

  // 합성 완료 전엔 배경만 즉시 보여주고(빠른 첫 페인트), 완료되면 '배경+요소' 합성 한 장으로
  // 교체한다. 어느 경우든 라이브 스테이지는 마운트하지 않는다(가벼움).
  const bg = doc?.canvas.background as { src?: string } | string | undefined;
  const bgSrc =
    bg && typeof bg === 'object' && typeof bg.src === 'string' && /^(data:|https?:|blob:)/.test(bg.src) ? bg.src : null;
  const src = frame ?? bgSrc;
  if (src) {
    return <img src={src} alt="" draggable={false} loading="lazy" decoding="async" className="h-full w-full object-cover" />;
  }
  return <div className="grid h-full w-full place-items-center bg-surface-2 text-[11px] text-fg-muted">불러오는 중…</div>;
}

export function InteractiveGallery({ onClose }: { onClose: () => void }) {
  const [playId, setPlayId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, setTick] = useState(0); // 삭제 후 목록 재렌더용(상태 변경으로 listLibrary 재호출)
  const ensure = useInteractiveStore((s) => s.ensure);
  const games = listLibrary();

  // 저장 목록에서 게임 삭제 — 목록에서만 빼고(게임 문서·이미지는 보드에 그대로), 즉시 재렌더.
  const removeGame = (docId: string, title: string) => {
    if (!window.confirm(`'${title || '인터랙티브'}'을(를) 목록에서 지울까요?\n(게임 자체는 보드에 남아요)`)) return;
    removeFromLibrary(docId);
    setTick((t) => t + 1);
  };

  // 대표 프롬프트 → 새 게임 생성 후 바로 재생.
  const makeFromPrompt = async (prompt: string) => {
    if (busy) return;
    const id = newDocId();
    ensure(id);
    setBusy('🎮 게임을 만드는 중…');
    try {
      const r = await composeInteractiveNode(id, prompt, (m) => setBusy(m ?? '🎮 게임을 만드는 중…'));
      if (r.ok) setPlayId(id);
    } finally {
      setBusy(null);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[140] flex flex-col" style={{ background: 'var(--bg-deep)' }}>
      {/* 상단 */}
      <div className="flex items-center justify-between p-3">
        <span className="rounded-pill bg-surface px-3 py-1.5 text-sm font-bold text-fg shadow-sm">🎮 인터랙티브 게임</span>
        <button onClick={onClose} className={chromeBtn} aria-label="닫기">
          <Icon name="x" size={16} /> 닫기
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="mx-auto max-w-5xl">
          {/* 대표 프롬프트 — 무엇을 만들 수 있나 */}
          <h2 className="mb-2 text-[13px] font-bold uppercase tracking-wide text-fg-muted">이런 게임을 만들 수 있어요 — 눌러서 바로 시작</h2>
          <div className="mb-7 flex flex-wrap gap-2">
            {REC_PROMPTS.map((p) => (
              <button
                key={p.label}
                onClick={() => makeFromPrompt(p.prompt)}
                disabled={!!busy}
                title={p.prompt}
                className="inline-flex items-center gap-2 rounded-pill border border-border bg-surface px-[15px] py-2 text-[13px] font-semibold text-fg shadow-sm transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span aria-hidden className="text-[15px] leading-none">{p.emoji}</span> {p.label}
              </button>
            ))}
          </div>

          {/* 저장한 게임 */}
          <h2 className="mb-2 text-[13px] font-bold uppercase tracking-wide text-fg-muted">저장한 게임</h2>
          {games.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-surface/50 px-4 py-10 text-center text-sm text-fg-muted">
              아직 저장한 게임이 없어요 — 게임 편집 화면 상단의 <b className="text-fg">⭐ 저장</b>으로 담아 보세요.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {games.map((g) => (
                // 갤러리(자료 갤러리) 카드와 동일한 형태 — 흰 카드 + 상단 썸네일(배지·호버 액션) + 하단 제목/부제.
                <button
                  key={g.docId}
                  onClick={() => setPlayId(g.docId)}
                  title={`${g.title || '인터랙티브'} — 재생`}
                  className="kv-galcard group block w-full overflow-hidden rounded-2xl border border-border bg-surface text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-md"
                >
                  <div className="relative aspect-[16/10] overflow-hidden bg-surface-2">
                    <GalleryThumb id={g.docId} />
                    {/* 카테고리 배지(좌상단) — 갤러리 it.cat 배지와 동일 */}
                    <span className="absolute left-2.5 top-2.5 rounded-pill bg-surface px-2.5 py-[3px] text-[10.5px] font-bold text-accent shadow-sm">게임</span>
                    {/* 재생 배지(우하단) */}
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-accent text-on-accent shadow-md ring-2 ring-surface/70 transition-transform group-hover:scale-105 absolute bottom-2.5 right-2.5">
                      <Icon name="play" size={15} fill="currentColor" stroke={0} />
                    </span>
                    {/* 삭제(우상단, 호버) — 갤러리 kv-galmax 호버 액션과 동일 */}
                    <span
                      className="kv-galmax absolute right-2.5 top-2.5 grid h-7 w-7 place-items-center rounded-lg bg-surface/90 shadow-sm"
                      role="button"
                      onClick={(e) => { e.stopPropagation(); removeGame(g.docId, g.title); }}
                      title="이 게임을 목록에서 삭제"
                      aria-label="삭제"
                      style={{ color: '#D8442F' }}
                    >
                      <Icon name="trash" size={13} />
                    </span>
                  </div>
                  <div className="px-3.5 pb-3 pt-2.5">
                    <div className="truncate text-[14.5px] font-bold leading-tight text-fg">{g.title || '인터랙티브'}</div>
                    <div className="mt-1 text-xs text-fg-muted">인터랙티브 게임</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 생성 중 오버레이 */}
      {busy && (
        <div className="absolute inset-0 z-[145] grid place-items-center bg-black/45">
          <div className="flex items-center gap-3 rounded-2xl bg-surface px-6 py-4 text-sm font-semibold text-fg shadow-xl">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            {busy}
          </div>
        </div>
      )}

      {/* 선택한 게임 재생 — 종료 시 목록으로, 확장 활동은 보드에 만들고 홈도 닫는다. */}
      {playId && (
        <ZoomOverlay origin={null} onClose={() => setPlayId(null)} zIndex={150} backdropClassName="">
          {(close) => (
            <InteractiveOverlay
              docId={playId}
              initialMode="play"
              onClose={close}
              onExit={() => setPlayId(null)}
              onHome={() => setPlayId(null)}
            />
          )}
        </ZoomOverlay>
      )}
    </div>,
    document.body,
  );
}
