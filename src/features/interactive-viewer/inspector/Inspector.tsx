/**
 * 인스펙터 — 선택 요소의 동작 카드(반응/교체) 추가·수정·삭제 + 이미지 배경제거 + 글자 편집.
 * 저작 크롬 → Milray 토큰(Tailwind 유틸). 캔버스(.kv-inode 파스텔)와 섞지 않는다.
 * 요소당 단일 tap 동작(P0). 고급 옵션(then/when/순서…)은 노출하지 않음(Phase 2+).
 */
import { useState } from 'react';
import { newId } from '@/store/boardStore';
import type { Behavior, InteractiveNode } from '../schema/interactiveNode';
import { ANIMATE_LABELS, ANIMATE_PRESETS } from '../runtime/behaviors';

interface Props {
  doc: InteractiveNode;
  elId: string;
  onSetBehavior: (b: Behavior | null) => void;
  onAddSwap: () => void;
  onRemoveBg: () => void;
  onEditText: (text: string) => void;
  onRemoveElement: () => void;
  busy?: string | null;
}

export function Inspector({ doc, elId, onSetBehavior, onAddSwap, onRemoveBg, onEditText, onRemoveElement, busy }: Props) {
  const el = doc.elements.find((e) => e.id === elId);
  const beh = doc.behaviors.find((b) => b.target === elId && b.trigger === 'tap');
  const [picking, setPicking] = useState(false);
  if (!el) return null;

  const isImage = el.kind === 'image' || el.kind === 'sprite';
  const behLabel =
    beh?.action === 'animate'
      ? `반응 · ${ANIMATE_LABELS[beh.params.preset]}`
      : beh?.action === 'swap'
        ? '교체 · 탭하면 바뀌어요'
        : null;

  return (
    <aside className="flex w-64 flex-col gap-3 overflow-y-auto rounded-2xl border border-border bg-surface p-3 shadow-md">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-fg-2">
          {isImage ? '그림' : el.kind === 'text' ? '글자' : el.kind === 'video' ? '영상' : '도형'}
        </span>
        <button
          onClick={onRemoveElement}
          className="rounded-pill px-2 py-1 text-[11px] font-semibold text-fg-muted transition-colors hover:bg-danger-soft hover:text-danger"
        >
          요소 삭제
        </button>
      </div>

      {el.kind === 'text' && (
        <input
          value={el.text ?? ''}
          onChange={(e) => onEditText(e.target.value)}
          placeholder="글자 내용"
          className="w-full rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm text-fg focus:border-accent focus:outline-none"
        />
      )}

      {/* 동작 — 탭하면 일어나는 일 */}
      <div className="flex flex-col gap-2">
        <span className="text-[11px] font-bold text-fg-2">탭하면…</span>
        {beh ? (
          <div className="flex items-center justify-between rounded-xl border border-accent-soft bg-accent-soft/40 px-3 py-2">
            <span className="text-sm font-semibold text-fg">{behLabel}</span>
            <button
              onClick={() => onSetBehavior(null)}
              className="rounded-pill px-2 py-0.5 text-[11px] font-semibold text-fg-muted hover:bg-surface-3 hover:text-fg"
            >
              해제
            </button>
          </div>
        ) : picking ? (
          <div className="grid grid-cols-3 gap-1.5">
            {ANIMATE_PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => {
                  onSetBehavior({ id: newId('beh'), target: elId, trigger: 'tap', action: 'animate', params: { preset: p } });
                  setPicking(false);
                }}
                className="rounded-lg border border-border bg-surface-2 px-1.5 py-2 text-[11px] font-semibold text-fg-2 transition-colors hover:border-accent hover:bg-accent hover:text-on-accent"
              >
                {ANIMATE_LABELS[p]}
              </button>
            ))}
            <button
              onClick={() => setPicking(false)}
              className="col-span-3 rounded-lg px-2 py-1 text-[11px] text-fg-muted hover:text-fg"
            >
              취소
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => setPicking(true)}
              className="flex-1 rounded-xl border border-border bg-surface-2 px-2 py-2 text-sm font-semibold text-fg transition-colors hover:border-accent hover:text-accent"
            >
              ✨ 반응
            </button>
            {isImage && (
              <button
                onClick={onAddSwap}
                className="flex-1 rounded-xl border border-border bg-surface-2 px-2 py-2 text-sm font-semibold text-fg transition-colors hover:border-accent hover:text-accent"
              >
                🔄 교체
              </button>
            )}
          </div>
        )}
      </div>

      {/* 이미지 도구 */}
      {isImage && el.src && (
        <button
          onClick={onRemoveBg}
          disabled={!!busy}
          className="rounded-xl border border-border bg-surface-2 px-2 py-2 text-sm font-semibold text-fg transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
        >
          🪄 배경 제거
        </button>
      )}

      {busy && (
        <div className="flex items-center gap-2 rounded-lg bg-surface-2 px-2 py-1.5 text-[11px] text-fg-2">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-surface-3 border-t-accent" />
          {busy}
        </div>
      )}
    </aside>
  );
}
