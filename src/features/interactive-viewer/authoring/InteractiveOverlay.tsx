/**
 * 풀스크린 저작/재생 오버레이 — 편집↔재생 토글, 저작 툴바(자료 추가·배경), 인스펙터,
 * 외부 파일 드롭, 배경제거, 교체 대상 고르기, 다중 선택. 보드 카드의 ZoomOverlay 안에 마운트.
 *
 * 🔴 토큰 분리: 크롬(툴바·인스펙터·상단바)=Milray(Tailwind 유틸). 캔버스/재생=파스텔
 *    (.kv-inode, InteractiveStage 내부). 재생 모드에선 저작 툴바·인스펙터를 숨긴다.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { newId } from '@/store/boardStore';
import { ImageFullscreen } from '@/components/board/ImageFullscreen';
import { ImageEditorModal } from '@/components/board/ImageEditorModal';
import type { OriginRect } from '@/components/board/useZoomModal';
import { useInteractiveStore } from '../store/interactiveStore';
import { InteractiveStage } from '../runtime/InteractiveStage';
import { Inspector } from '../inspector/Inspector';
import { StoryPanel } from './StoryPanel';
import { HelpOverlay } from './HelpOverlay';
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
import { clampXY } from '../runtime/geometry';
import type { Behavior, ElementNode, InteractiveNode } from '../schema/interactiveNode';

/** 요소 클립보드(⌘C/⌘V) — 다중 복사 지원, 오버레이 인스턴스 간 공유(세션 한정). */
let elementClipboard: ElementNode[] | null = null;

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
const tbBtn = 'flex h-10 w-10 items-center justify-center rounded-pill text-base font-semibold text-fg-2 transition-colors hover:bg-accent hover:text-on-accent';

/** 여러 클론을 한 문서에 누적 추가(한 mutate). */
function addClones(d: InteractiveNode, clones: ElementNode[]): InteractiveNode {
  return clones.reduce((acc, cl) => withElementAdded(acc, cl), d);
}
function cloneOf(el: ElementNode): ElementNode {
  return { ...el, id: newId('el'), transform: { ...el.transform, x: el.transform.x + 24, y: el.transform.y + 24 } };
}

export function InteractiveOverlay({ docId, initialMode = 'edit', onClose }: Props) {
  const doc = useInteractiveStore((s) => s.docs[docId]);
  const ensure = useInteractiveStore((s) => s.ensure);
  const mutate = useInteractiveStore((s) => s.mutate);
  const undo = useInteractiveStore((s) => s.undo);
  const redo = useInteractiveStore((s) => s.redo);
  const [mode, setMode] = useState<'play' | 'edit'>(initialMode);
  const [selectedElIds, setSelectedElIds] = useState<string[]>([]);
  const [resetNonce, setResetNonce] = useState(0);
  const [picker, setPicker] = useState<null | { for: 'add' | 'swap' }>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [storyOpen, setStoryOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  // 이미지 요소 편집/풀스크린 모달(마이보드 카드와 동일 컴포넌트 재사용).
  const [editImg, setEditImg] = useState<{ elId: string; src: string; caption: string; origin: OriginRect | null } | null>(null);
  const [fsImg, setFsImg] = useState<{ src: string; caption: string; origin: OriginRect | null } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ensure(docId);
  }, [docId, ensure]);

  // 노드 단축키 — capture+stopImmediatePropagation으로 보드 단축키(bubble)보다 먼저 가로챈다.
  // 실행취소/다시실행/전체선택/붙여넣기는 선택 없이도, 나머지(삭제·복제·복사·이동)는 선택 요소 전부 대상.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (mode !== 'edit') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const m = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      const allEls = () => useInteractiveStore.getState().docs[docId]?.elements ?? [];
      // ── 실행취소 / 다시실행 ──
      if (m && k === 'z') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (e.shiftKey) redo(docId);
        else undo(docId);
        return;
      }
      if (m && k === 'y') {
        e.preventDefault();
        e.stopImmediatePropagation();
        redo(docId);
        return;
      }
      // ── 전체 선택 ──
      if (m && k === 'a') {
        e.preventDefault();
        e.stopImmediatePropagation();
        setSelectedElIds(allEls().map((x) => x.id));
        return;
      }
      // ── 붙여넣기(선택 불필요, 다중) ──
      if (m && k === 'v') {
        if (elementClipboard && elementClipboard.length) {
          e.preventDefault();
          e.stopImmediatePropagation();
          const clones = elementClipboard.map(cloneOf);
          mutate(docId, (d) => addClones(d, clones));
          setSelectedElIds(clones.map((c) => c.id));
        }
        return;
      }
      // ── 이하 선택 요소 전부 대상 ──
      if (!selectedElIds.length) return;
      const ids = new Set(selectedElIds);
      if (m && k === 'c') {
        e.preventDefault();
        e.stopImmediatePropagation();
        const els = allEls().filter((x) => ids.has(x.id));
        if (els.length) elementClipboard = JSON.parse(JSON.stringify(els)) as ElementNode[];
        return;
      }
      if (m && k === 'd') {
        e.preventDefault();
        e.stopImmediatePropagation();
        const clones = allEls().filter((x) => ids.has(x.id)).map(cloneOf);
        if (clones.length) {
          mutate(docId, (d) => addClones(d, clones));
          setSelectedElIds(clones.map((c) => c.id));
        }
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        e.stopImmediatePropagation();
        mutate(docId, (d) => ({
          ...d,
          elements: d.elements.filter((x) => !ids.has(x.id)),
          behaviors: d.behaviors.filter((b) => !ids.has(b.target)),
          connections: d.connections.filter((c) => !ids.has(c.from) && !ids.has(c.to)),
        }));
        setSelectedElIds([]);
        return;
      }
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        setSelectedElIds([]);
        return;
      }
      if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const step = e.shiftKey ? 20 : 4;
        let dx = 0;
        let dy = 0;
        if (e.key === 'ArrowLeft') dx = -step;
        else if (e.key === 'ArrowRight') dx = step;
        else if (e.key === 'ArrowUp') dy = -step;
        else if (e.key === 'ArrowDown') dy = step;
        mutate(docId, (d) => ({
          ...d,
          elements: d.elements.map((z) => {
            if (!ids.has(z.id)) return z;
            const t = z.transform;
            const p = clampXY(t.x + dx, t.y + dy, t.w, t.h, d.canvas.size.w, d.canvas.size.h);
            return { ...z, transform: { ...t, ...p } };
          }),
        }));
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [mode, selectedElIds, docId, mutate, undo, redo]);

  if (!doc) {
    return <div className="absolute inset-0 grid place-items-center text-fg-2">불러오는 중…</div>;
  }

  const center = () => ({ x: doc.canvas.size.w / 2, y: doc.canvas.size.h / 2 });

  const setBehaviorFor = (elId: string, beh: Behavior | null) =>
    mutate(docId, (d) => ({
      ...d,
      behaviors: [...d.behaviors.filter((b) => b.target !== elId), ...(beh ? [beh] : [])],
    }));

  // 조건(when) — 요소의 동작이 '언제 실행될지' 게이트(예: 스위치 켜졌을 때만).
  const setConditionFor = (elId: string, cond: Behavior['when'] | null) =>
    mutate(docId, (d) => ({
      ...d,
      behaviors: d.behaviors.map((b) => (b.target === elId ? { ...b, when: cond ?? undefined } : b)),
    }));

  // 트리거 — 이 동작이 '탭하면(tap)' 일어날지 '시작하면(sceneEnter)' 자동 실행될지.
  const setTriggerFor = (elId: string, trigger: Behavior['trigger']) =>
    mutate(docId, (d) => ({
      ...d,
      behaviors: d.behaviors.map((b) => (b.target === elId ? { ...b, trigger } : b)),
    }));

  // 세기(count) — 노드의 공용 카운터를 (없으면) 만들고 그 요소에 +1 동작 부여. 카운팅 놀이용.
  const addCountFor = (elId: string, label: string) =>
    mutate(docId, (d) => {
      const counters = d.counters ?? [];
      let counter = counters[0];
      let nextCounters = counters;
      if (!counter) {
        counter = { id: newId('cnt'), initial: 0, label, display: { x: 48, y: 48 } };
        nextCounters = [...counters, counter];
      }
      const beh: Behavior = { id: newId('beh'), target: elId, trigger: 'tap', action: 'count', params: { counterId: counter.id, by: 1 } };
      return {
        ...d,
        counters: nextCounters,
        behaviors: [...d.behaviors.filter((b) => b.target !== elId), beh],
      };
    });

  // 플래그 스위치(setFlag) — 노드의 공용 플래그를 (없으면) 만들고 토글 동작 부여.
  const addSetFlagFor = (elId: string, value: boolean) =>
    mutate(docId, (d) => {
      const flags = d.flags ?? [];
      let flag = flags[0];
      let nextFlags = flags;
      if (!flag) {
        flag = { id: newId('flag'), initial: false };
        nextFlags = [...flags, flag];
      }
      const beh: Behavior = { id: newId('beh'), target: elId, trigger: 'tap', action: 'setFlag', params: { flagId: flag.id, value } };
      return {
        ...d,
        flags: nextFlags,
        behaviors: [...d.behaviors.filter((b) => b.target !== elId), beh],
      };
    });

  const moveElements = (ids: string[], dx: number, dy: number) => {
    const set = new Set(ids);
    mutate(docId, (d) => ({
      ...d,
      elements: d.elements.map((e) => {
        if (!set.has(e.id)) return e;
        const t = e.transform;
        const p = clampXY(t.x + dx, t.y + dy, t.w, t.h, d.canvas.size.w, d.canvas.size.h);
        return { ...e, transform: { ...t, ...p } };
      }),
    }));
  };

  const resizeElement = (elId: string, patch: { x: number; y: number; w: number; h: number }) =>
    mutate(docId, (d) => ({
      ...d,
      elements: d.elements.map((e) => {
        if (e.id !== elId) return e;
        const p = clampXY(patch.x, patch.y, patch.w, patch.h, d.canvas.size.w, d.canvas.size.h);
        return { ...e, transform: { ...e.transform, ...patch, ...p } };
      }),
    }));

  const rotateElement = (elId: string, rotation: number) =>
    mutate(docId, (d) => ({
      ...d,
      elements: d.elements.map((e) => (e.id === elId ? { ...e, transform: { ...e.transform, rotation } } : e)),
    }));

  const duplicateElement = (elId: string) => {
    const el = doc.elements.find((e) => e.id === elId);
    if (!el) return;
    const clone = cloneOf(el);
    mutate(docId, (d) => withElementAdded(d, clone));
    setSelectedElIds([clone.id]);
  };

  const editText = (elId: string, text: string) =>
    mutate(docId, (d) => ({ ...d, elements: d.elements.map((e) => (e.id === elId ? { ...e, text } : e)) }));

  const removeElement = (elId: string) => {
    mutate(docId, (d) => ({
      ...d,
      elements: d.elements.filter((e) => e.id !== elId),
      behaviors: d.behaviors.filter((b) => b.target !== elId),
      connections: d.connections.filter((c) => c.from !== elId && c.to !== elId),
    }));
    setSelectedElIds([]);
  };

  const setBackground = (token: string) =>
    mutate(docId, (d) => ({ ...d, canvas: { ...d.canvas, background: token } }));

  // ── 이야기(story) 단계 편집 ──
  const addStoryStep = () =>
    mutate(docId, (d) => ({
      ...d,
      story: { ...(d.story ?? { steps: [] }), steps: [...(d.story?.steps ?? []), { id: newId('step'), speak: { text: '', mode: 'narration' as const } }] },
    }));
  const updateStoryStepText = (id: string, text: string) =>
    mutate(docId, (d) =>
      d.story
        ? { ...d, story: { ...d.story, steps: d.story.steps.map((s) => (s.id === id ? { ...s, speak: { text, mode: s.speak?.mode ?? 'narration' } } : s)) } }
        : d,
    );
  const removeStoryStep = (id: string) =>
    mutate(docId, (d) => (d.story ? { ...d, story: { ...d.story, steps: d.story.steps.filter((s) => s.id !== id) } } : d));
  const moveStoryStep = (id: string, dir: -1 | 1) =>
    mutate(docId, (d) => {
      if (!d.story) return d;
      const steps = [...d.story.steps];
      const i = steps.findIndex((s) => s.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= steps.length) return d;
      [steps[i], steps[j]] = [steps[j], steps[i]];
      return { ...d, story: { ...d.story, steps } };
    });

  // 요소 연결(from→to) — 중복/자기연결 무시. 마이보드 링크와 동일한 from/to 모델.
  const addConnection = (from: string, to: string) =>
    mutate(docId, (d) => {
      if (from === to) return d;
      const dup = d.connections.some(
        (c) => (c.from === from && c.to === to) || (c.from === to && c.to === from),
      );
      if (dup) return d;
      return { ...d, connections: [...d.connections, { id: newId('conn'), kind: 'link' as const, from, to }] };
    });
  const removeConnection = (id: string) =>
    mutate(docId, (d) => ({ ...d, connections: d.connections.filter((c) => c.id !== id) }));

  // 이미지 요소 호버 액션 — 마이보드 카드의 편집/풀스크린을 그대로(같은 컴포넌트) 재사용.
  const editImage = (elId: string, origin: { x: number; y: number; w: number; h: number }) => {
    const el = doc.elements.find((e) => e.id === elId);
    if (!el?.src?.src) return;
    setEditImg({ elId, src: el.src.src, caption: el.text ?? '이미지', origin });
  };
  const fullscreenImage = (elId: string, origin: { x: number; y: number; w: number; h: number }) => {
    const el = doc.elements.find((e) => e.id === elId);
    if (!el?.src?.src) return;
    setFsImg({ src: el.src.src, caption: el.text ?? '이미지', origin });
  };
  // 편집 결과(PNG dataURL) 반영 — assetKind는 보존, src만 교체.
  const setElementSrc = (elId: string, url: string) =>
    mutate(docId, (d) => ({
      ...d,
      elements: d.elements.map((e) =>
        e.id === elId && e.src ? { ...e, src: { ...e.src, id: newId('asset'), src: url } } : e,
      ),
    }));
  // 떼어내 다른 요소로 옮기기 — 자기연결이면 무시, 이미 같은 쌍이 있으면 이 연결은 제거(중복 방지).
  const relinkConnection = (id: string, from: string, to: string) =>
    mutate(docId, (d) => {
      if (from === to) return d;
      const dup = d.connections.some(
        (c) => c.id !== id && ((c.from === from && c.to === to) || (c.from === to && c.to === from)),
      );
      if (dup) return { ...d, connections: d.connections.filter((c) => c.id !== id) };
      return { ...d, connections: d.connections.map((c) => (c.id === id ? { ...c, from, to } : c)) };
    });

  const addImageRef = (
    ref: Awaited<ReturnType<typeof fileToAssetRef>>,
    origin: 'upload' | 'board-copy',
    at: { x: number; y: number },
  ) => {
    const el = makeImageElement(ref, origin, at, doc.canvas.size);
    mutate(docId, (d) => withElementAdded(d, el));
    setSelectedElIds([el.id]);
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
    const swapTarget = selectedElIds.length === 1 ? selectedElIds[0] : null;
    setPicker(null);
    setBusy('자료 넣는 중…');
    try {
      const ref =
        pick.kind === 'file'
          ? await fileToAssetRef(pick.file, 'teacher-upload')
          : await urlToAssetRef(pick.asset.url, 'teacher-upload');
      if (forSwap && swapTarget) {
        setBehaviorFor(swapTarget, {
          id: newId('beh'),
          target: swapTarget,
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
    const id = selectedElIds.length === 1 ? selectedElIds[0] : null;
    if (!id) return;
    const el = doc.elements.find((e) => e.id === id);
    if (!el || !el.src) return;
    setBusy('배경 지우는 중… (처음엔 모델 다운로드로 시간이 걸려요)');
    try {
      const next = await removeBgFromAssetRef(el.src);
      mutate(docId, (d) => ({
        ...d,
        elements: d.elements.map((e) => (e.id === id ? { ...e, src: next } : e)),
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
    setSelectedElIds([el.id]);
  };
  const addShape = () => {
    const el = makeShapeElement(center());
    mutate(docId, (d) => withElementAdded(d, el));
    setSelectedElIds([el.id]);
  };

  const toggleMode = () =>
    setMode((m) => {
      const next = m === 'edit' ? 'play' : 'edit';
      if (next === 'play') setResetNonce((n) => n + 1);
      else setSelectedElIds([]);
      return next;
    });

  return (
    <div className="absolute inset-0 flex flex-col" style={{ background: 'var(--bg-deep)' }}>
      {/* 상단 크롬 */}
      <div className="flex items-center justify-between gap-2 p-3">
        <div className="flex items-center gap-2">
          <span className="rounded-pill bg-surface px-3 py-1.5 text-sm font-bold text-fg shadow-sm">{doc.title}</span>
          {mode === 'edit' && (
            <>
              <button onClick={() => undo(docId)} className={chromeBtn} title="실행취소 (⌘/Ctrl+Z)">
                ↩
              </button>
              <button onClick={() => redo(docId)} className={chromeBtn} title="다시실행 (⌘/Ctrl+⇧Z)">
                ↪
              </button>
              <button
                onClick={() => {
                  setStoryOpen((v) => !v);
                  setSelectedElIds([]);
                }}
                className={storyOpen ? chromeBtnAccent : chromeBtn}
                title="이야기 — 단계별 나레이션"
              >
                📖 이야기
              </button>
              {selectedElIds.length > 1 && (
                <span className="rounded-pill bg-accent-soft px-3 py-1.5 text-sm font-semibold text-fg">{selectedElIds.length}개 선택</span>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setHelpOpen(true)} className={chromeBtn} title="도움말 — 기능·단축키 안내" aria-label="도움말">
            ❔ 도움말
          </button>
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

      {/* 본문 — 캔버스 + (편집·단일선택 시) 인스펙터. 좌측 툴바 레일 공간을 위해 pl-20. */}
      <div className="flex min-h-0 flex-1 gap-3 pb-4 pl-20 pr-3">
        <div className="relative min-w-0 flex-1 overflow-hidden rounded-2xl">
          <InteractiveStage
            doc={doc}
            mode={mode}
            selectedElIds={selectedElIds}
            onSelectEls={setSelectedElIds}
            onMoveElements={moveElements}
            onResizeElement={resizeElement}
            onRotateElement={rotateElement}
            onEditText={editText}
            onEditImage={editImage}
            onFullscreenImage={fullscreenImage}
            onAddConnection={addConnection}
            onRemoveConnection={removeConnection}
            onRelinkConnection={relinkConnection}
            onDropFiles={onDropFiles}
            resetNonce={resetNonce}
          />
        </div>
        {mode === 'edit' && storyOpen ? (
          <StoryPanel
            story={doc.story}
            onAddStep={addStoryStep}
            onUpdateStepText={updateStoryStepText}
            onRemoveStep={removeStoryStep}
            onMoveStep={moveStoryStep}
            onClose={() => setStoryOpen(false)}
          />
        ) : mode === 'edit' && selectedElIds.length === 1 ? (
          <Inspector
            doc={doc}
            elId={selectedElIds[0]}
            onSetBehavior={(b) => setBehaviorFor(selectedElIds[0], b)}
            onAddSwap={() => setPicker({ for: 'swap' })}
            onAddCount={(label) => addCountFor(selectedElIds[0], label)}
            onAddSetFlag={(value) => addSetFlagFor(selectedElIds[0], value)}
            onSetCondition={(cond) => setConditionFor(selectedElIds[0], cond)}
            onSetTrigger={(trigger) => setTriggerFor(selectedElIds[0], trigger)}
            onRemoveBg={removeBg}
            onEditText={(t) => editText(selectedElIds[0], t)}
            onRemoveElement={() => removeElement(selectedElIds[0])}
            busy={busy}
          />
        ) : null}
      </div>

      {/* 저작 툴바 — 마이보드식 좌측 세로 레일(재생 모드에선 숨김). 클릭 시 노드 내부 요소로 추가. */}
      {mode === 'edit' && (
        <div className="pointer-events-none absolute left-4 top-1/2 flex -translate-y-1/2">
          <div className="pointer-events-auto flex flex-col items-center gap-1 rounded-pill border border-border bg-surface/95 p-1.5 shadow-md backdrop-blur">
            <button onClick={() => setSelectedElIds([])} title="선택 해제" className={tbBtn}>
              ↖
            </button>
            <span className="my-0.5 h-px w-6 bg-border" />
            <button onClick={() => fileRef.current?.click()} title="사진 추가(파일)" className={tbBtn}>
              📷
            </button>
            <button onClick={() => setPicker({ for: 'add' })} title="보관함에서 추가" className={tbBtn}>
              🗂
            </button>
            <button onClick={addText} title="글자 추가" className={tbBtn}>
              가
            </button>
            <button onClick={addShape} title="도형 추가" className={tbBtn}>
              ⬛
            </button>
            <span className="my-0.5 h-px w-6 bg-border" />
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

      {helpOpen && <HelpOverlay onClose={() => setHelpOpen(false)} />}

      {/* 이미지 편집 모달 — 마이보드와 동일 컴포넌트. target.onApply로 요소 src 교체.
          🔴 z-200 래퍼로 감싸 ZoomOverlay(z-130) 위에 띄운다(안 그러면 오버레이 뒤로 가려 안 보인다). */}
      {editImg &&
        createPortal(
          <div style={{ position: 'fixed', inset: 0, zIndex: 200 }}>
            <ImageEditorModal
              target={{
                src: editImg.src,
                caption: editImg.caption,
                allowExtract: false,
                onApply: (url) => setElementSrc(editImg.elId, url),
              }}
              origin={editImg.origin}
              onClose={() => setEditImg(null)}
            />
          </div>,
          document.body,
        )}

      {/* 이미지 풀스크린 — 마이보드와 동일 컴포넌트(동일하게 z-200 래퍼로 오버레이 위에). */}
      {fsImg &&
        createPortal(
          <div style={{ position: 'fixed', inset: 0, zIndex: 200 }}>
            <ImageFullscreen src={fsImg.src} caption={fsImg.caption} origin={fsImg.origin} onClose={() => setFsImg(null)} />
          </div>,
          document.body,
        )}
    </div>
  );
}
