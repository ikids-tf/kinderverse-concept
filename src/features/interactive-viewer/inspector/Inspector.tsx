/**
 * 인스펙터 — 선택 요소의 탭 동작(반응/교체/말하기/보이기/숨기기/강조) 저작 + 이미지 배경제거 + 글자 편집.
 * 저작 크롬 → Milray 토큰(Tailwind 유틸). 캔버스(.kv-inode 파스텔)와 섞지 않는다.
 * 요소당 단일 tap 동작. 런타임 동작 엔진이 실제 실행(then/when 등 고급 옵션은 AI/후속 UI).
 */
import { useState } from 'react';
import { newId } from '@/store/boardStore';
import type { Behavior, Condition, ElementNode, InteractiveNode } from '../schema/interactiveNode';
import { ANIMATE_LABELS, ANIMATE_PRESETS } from '../runtime/behaviors';

interface Props {
  doc: InteractiveNode;
  elId: string;
  onSetBehavior: (b: Behavior | null) => void;
  onAddSwap: () => void;
  onAddCount: (label: string) => void;
  onAddSetFlag: (value: boolean) => void;
  onSetCondition: (cond: Condition | null) => void;
  onRemoveBg: () => void;
  onEditText: (text: string) => void;
  onRemoveElement: () => void;
  busy?: string | null;
}

/** 요소를 교사가 알아볼 친근한 라벨로. */
function elementLabel(e: ElementNode, idx: number): string {
  const base =
    e.kind === 'text' ? `글자 "${(e.text ?? '').trim().slice(0, 8) || '글자'}"` : e.kind === 'image' || e.kind === 'sprite' ? '그림' : e.kind === 'video' ? '영상' : '도형';
  return `${base} ${idx + 1}`;
}

type Sub = 'menu' | 'animate' | 'speak' | 'reveal' | 'hide' | 'highlight' | 'move';

export function Inspector({ doc, elId, onSetBehavior, onAddSwap, onAddCount, onAddSetFlag, onSetCondition, onRemoveBg, onEditText, onRemoveElement, busy }: Props) {
  const el = doc.elements.find((e) => e.id === elId);
  const beh = doc.behaviors.find((b) => b.target === elId && b.trigger === 'tap');
  const [sub, setSub] = useState<Sub>('menu');
  const [speak, setSpeak] = useState('');
  const [targets, setTargets] = useState<string[]>([]);
  if (!el) return null;

  const isImage = el.kind === 'image' || el.kind === 'sprite';
  const others = doc.elements.filter((e) => e.id !== elId);
  // 이 요소가 가진 연결(따라 이동 대상) — 연결된 상대 요소들.
  const myConns = doc.connections
    .filter((c) => c.from === elId || c.to === elId)
    .map((c) => ({ connId: c.id, other: c.from === elId ? c.to : c.from }));

  const behLabel = !beh
    ? null
    : beh.action === 'animate'
      ? `반응 · ${ANIMATE_LABELS[beh.params.preset]}`
      : beh.action === 'swap'
        ? '교체 · 탭하면 바뀌어요'
        : beh.action === 'speak'
          ? `말하기 · "${beh.params.text.slice(0, 12)}"`
          : beh.action === 'reveal'
            ? `보이기 · ${beh.params.targets.length}개`
            : beh.action === 'hide'
              ? `숨기기 · ${beh.params.targets.length}개`
              : beh.action === 'highlight'
                ? `강조 · ${beh.params.targets.length}개`
                : beh.action === 'count'
                  ? '세기 · +1'
                  : beh.action === 'setFlag'
                    ? `스위치 · ${beh.params.value ? '켜기' : '끄기'}`
                    : beh.action === 'moveAlongPath'
                      ? '따라 이동'
                      : '동작';

  const reset = () => {
    setSub('menu');
    setSpeak('');
    setTargets([]);
  };
  const setBeh = (b: Behavior) => {
    onSetBehavior(b);
    reset();
  };
  const toggleTarget = (id: string) => setTargets((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));

  const actionBtn = 'rounded-xl border border-border bg-surface-2 px-2 py-2 text-sm font-semibold text-fg transition-colors hover:border-accent hover:text-accent';

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
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between rounded-xl border border-accent-soft bg-accent-soft/40 px-3 py-2">
              <span className="text-sm font-semibold text-fg">{behLabel}</span>
              <button
                onClick={() => onSetBehavior(null)}
                className="rounded-pill px-2 py-0.5 text-[11px] font-semibold text-fg-muted hover:bg-surface-3 hover:text-fg"
              >
                해제
              </button>
            </div>
            {/* 조건(when) — 스위치(플래그)가 있을 때만 노출. 이 동작이 언제 실행될지. */}
            {doc.flags && doc.flags.length > 0 && (
              <label className="flex items-center gap-2 px-1 text-[11px] text-fg-2">
                실행 조건
                <select
                  value={beh.when?.kind === 'flag' ? (beh.when.is ? 'on' : 'off') : 'always'}
                  onChange={(e) => {
                    const v = e.target.value;
                    const flagId = doc.flags![0].id;
                    onSetCondition(v === 'always' ? null : { kind: 'flag', flagId, is: v === 'on' });
                  }}
                  className="flex-1 rounded-md border border-border bg-surface-2 px-1.5 py-1 text-[12px] font-semibold text-fg focus:border-accent focus:outline-none"
                >
                  <option value="always">언제나</option>
                  <option value="on">스위치 켜졌을 때만</option>
                  <option value="off">스위치 꺼졌을 때만</option>
                </select>
              </label>
            )}
          </div>
        ) : sub === 'animate' ? (
          <div className="grid grid-cols-3 gap-1.5">
            {ANIMATE_PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => setBeh({ id: newId('beh'), target: elId, trigger: 'tap', action: 'animate', params: { preset: p } })}
                className="rounded-lg border border-border bg-surface-2 px-1.5 py-2 text-[11px] font-semibold text-fg-2 transition-colors hover:border-accent hover:bg-accent hover:text-on-accent"
              >
                {ANIMATE_LABELS[p]}
              </button>
            ))}
            <button onClick={reset} className="col-span-3 rounded-lg px-2 py-1 text-[11px] text-fg-muted hover:text-fg">
              취소
            </button>
          </div>
        ) : sub === 'speak' ? (
          <div className="flex flex-col gap-2">
            <textarea
              value={speak}
              onChange={(e) => setSpeak(e.target.value)}
              placeholder="할 말을 적어요 (예: 안녕!)"
              rows={2}
              autoFocus
              className="w-full resize-none rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm text-fg focus:border-accent focus:outline-none"
            />
            <div className="flex gap-2">
              <button
                disabled={!speak.trim()}
                onClick={() => setBeh({ id: newId('beh'), target: elId, trigger: 'tap', action: 'speak', params: { text: speak.trim(), mode: 'bubble' } })}
                className="flex-1 rounded-lg bg-accent px-2 py-1.5 text-sm font-bold text-on-accent disabled:opacity-50"
              >
                적용
              </button>
              <button onClick={reset} className="rounded-lg px-2 py-1.5 text-[11px] text-fg-muted hover:text-fg">
                취소
              </button>
            </div>
          </div>
        ) : sub === 'reveal' || sub === 'hide' || sub === 'highlight' ? (
          <div className="flex flex-col gap-2">
            <span className="text-[11px] text-fg-2">
              {sub === 'reveal' ? '보여줄' : sub === 'hide' ? '숨길' : '강조할'} 요소를 골라요
            </span>
            <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
              {others.length === 0 && <span className="px-1 text-[11px] text-fg-muted">다른 요소가 없어요</span>}
              {others.map((o, i) => (
                <label
                  key={o.id}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 text-[12px] font-semibold transition-colors ${
                    targets.includes(o.id) ? 'border-accent bg-accent-soft/50 text-fg' : 'border-border bg-surface-2 text-fg-2 hover:border-accent'
                  }`}
                >
                  <input type="checkbox" checked={targets.includes(o.id)} onChange={() => toggleTarget(o.id)} className="accent-[var(--accent)]" />
                  {elementLabel(o, i)}
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                disabled={!targets.length}
                onClick={() => {
                  const id = newId('beh');
                  const b: Behavior =
                    sub === 'highlight'
                      ? { id, target: elId, trigger: 'tap', action: 'highlight', params: { targets } }
                      : sub === 'hide'
                        ? { id, target: elId, trigger: 'tap', action: 'hide', params: { targets } }
                        : { id, target: elId, trigger: 'tap', action: 'reveal', params: { targets } };
                  setBeh(b);
                }}
                className="flex-1 rounded-lg bg-accent px-2 py-1.5 text-sm font-bold text-on-accent disabled:opacity-50"
              >
                적용 ({targets.length})
              </button>
              <button onClick={reset} className="rounded-lg px-2 py-1.5 text-[11px] text-fg-muted hover:text-fg">
                취소
              </button>
            </div>
          </div>
        ) : sub === 'move' ? (
          <div className="flex flex-col gap-2">
            <span className="text-[11px] text-fg-2">어디로 이동할지 (연결된 요소)</span>
            <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
              {myConns.map((mc) => {
                const o = doc.elements.find((e) => e.id === mc.other);
                const idx = doc.elements.findIndex((e) => e.id === mc.other);
                return (
                  <button
                    key={mc.connId}
                    onClick={() => setBeh({ id: newId('beh'), target: elId, trigger: 'tap', action: 'moveAlongPath', params: { connectionId: mc.connId, speed: 1 } })}
                    className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-left text-[12px] font-semibold text-fg-2 transition-colors hover:border-accent hover:text-accent"
                  >
                    ➡ {o ? elementLabel(o, idx) : '연결 요소'}
                  </button>
                );
              })}
            </div>
            <button onClick={reset} className="rounded-lg px-2 py-1 text-[11px] text-fg-muted hover:text-fg">
              취소
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setSub('animate')} className={actionBtn}>
              ✨ 반응
            </button>
            {isImage && (
              <button onClick={onAddSwap} className={actionBtn}>
                🔄 교체
              </button>
            )}
            <button onClick={() => setSub('speak')} className={actionBtn}>
              💬 말하기
            </button>
            <button onClick={() => setSub('reveal')} className={actionBtn}>
              👁 보이기
            </button>
            <button onClick={() => setSub('hide')} className={actionBtn}>
              🙈 숨기기
            </button>
            <button onClick={() => setSub('highlight')} className={actionBtn}>
              🌟 강조
            </button>
            <button onClick={() => onAddCount('개수')} className={actionBtn}>
              🔢 세기
            </button>
            <button onClick={() => onAddSetFlag(true)} className={actionBtn}>
              🔌 스위치
            </button>
            {myConns.length > 0 && (
              <button onClick={() => (myConns.length === 1 ? setBeh({ id: newId('beh'), target: elId, trigger: 'tap', action: 'moveAlongPath', params: { connectionId: myConns[0].connId, speed: 1 } }) : setSub('move'))} className={`${actionBtn} col-span-2`}>
                ➡ 연결 따라 이동
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
