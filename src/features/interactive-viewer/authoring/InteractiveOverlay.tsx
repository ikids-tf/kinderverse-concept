/**
 * 풀스크린 저작/재생 오버레이 — 편집↔재생 토글, 저작 툴바(자료 추가·배경), 인스펙터,
 * 외부 파일 드롭, 배경제거, 교체 대상 고르기, 다중 선택. 보드 카드의 ZoomOverlay 안에 마운트.
 *
 * 🔴 토큰 분리: 크롬(툴바·인스펙터·상단바)=Milray(Tailwind 유틸). 캔버스/재생=파스텔
 *    (.kv-inode, InteractiveStage 내부). 재생 모드에선 저작 툴바·인스펙터를 숨긴다.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { newId, useBoardStore } from '@/store/boardStore';
import { Icon } from '@/lib/icons';
import { PromptBar } from '@/components/PromptBar';
import { useUIStore } from '@/store/uiStore';
import { showToast } from '@/lib/toast';
import { ImageFullscreen } from '@/components/board/ImageFullscreen';
import { ImageEditorModal } from '@/components/board/ImageEditorModal';
import type { OriginRect } from '@/components/board/useZoomModal';
import { useInteractiveStore } from '../store/interactiveStore';
import { InteractiveStage } from '../runtime/InteractiveStage';
import { Inspector } from '../inspector/Inspector';
import { StoryPanel } from './StoryPanel';
import { HelpOverlay } from './HelpOverlay';
import { AssetPicker, type AssetPick } from './AssetPicker';
import { warmupAssets } from '@/board/assets';
import { saveToLibrary } from '../store/library';
import { applyInteractivePrompt } from './applyPrompt';
import { extendActivityInNode } from './extendLane';
import { resolverExtend } from '../resolver/extend';
import { getGameCard } from '../store/gameCards';
import { TeacherCardPanel } from './TeacherCardPanel';
import { AppearanceStrip, type Appearance } from './AppearanceStrip';
import type { TeacherCard } from '../resolver/designAgent';
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
  /** 게임 완료 후 '종료' — 인터랙티브 홈/갤러리로 이동(없으면 onClose 로 폴백). */
  onExit?: () => void;
  /** 상단 '홈' — 인터랙티브 홈(저장 게임 목록·추천 프롬프트)으로 이동(없으면 버튼 숨김). */
  onHome?: () => void;
}

const chromeBtn =
  'inline-flex items-center gap-1.5 rounded-pill border border-border bg-surface/95 px-3 py-1.5 text-sm font-semibold text-fg shadow-sm transition-colors hover:border-accent hover:text-accent';
const chromeBtnAccent =
  'inline-flex items-center gap-1.5 rounded-pill bg-accent px-3 py-1.5 text-sm font-bold text-on-accent shadow-sm transition-colors hover:bg-accent-strong';
// 아이콘 전용(정사각) 크롬 버튼 — 실행취소/다시실행 등.
const chromeIconBtn =
  'inline-flex h-8 w-8 items-center justify-center rounded-pill border border-border bg-surface/95 text-fg shadow-sm transition-colors hover:border-accent hover:text-accent';
const tbBtn = 'flex h-10 w-10 items-center justify-center rounded-pill text-base font-semibold text-fg-2 transition-colors hover:bg-accent hover:text-on-accent';

/** 여러 클론을 한 문서에 누적 추가(한 mutate). */
function addClones(d: InteractiveNode, clones: ElementNode[]): InteractiveNode {
  return clones.reduce((acc, cl) => withElementAdded(acc, cl), d);
}
function cloneOf(el: ElementNode): ElementNode {
  return { ...el, id: newId('el'), transform: { ...el.transform, x: el.transform.x + 24, y: el.transform.y + 24 } };
}

/** 요소의 '여러 모습' — 기본 src + 그 요소를 대상으로 하는 swap 동작들의 to.src. 편집 스트립용. */
function appearancesOf(doc: InteractiveNode, elId: string): Appearance[] {
  const baseSrc = doc.elements.find((e) => e.id === elId)?.src?.src;
  if (!baseSrc) return [];
  const out: Appearance[] = [{ key: 'base', src: baseSrc, behId: null }];
  for (const b of doc.behaviors) {
    if (b.action === 'swap' && b.target === elId && typeof b.params?.to?.src === 'string') {
      out.push({ key: b.id, src: b.params.to.src, behId: b.id });
    }
  }
  return out;
}

export function InteractiveOverlay({ docId, initialMode = 'edit', onClose, onExit, onHome }: Props) {
  const doc = useInteractiveStore((s) => s.docs[docId]);
  const ensure = useInteractiveStore((s) => s.ensure);
  const mutate = useInteractiveStore((s) => s.mutate);
  const undo = useInteractiveStore((s) => s.undo);
  const redo = useInteractiveStore((s) => s.redo);
  const [mode, setMode] = useState<'play' | 'edit'>(initialMode);
  const [selectedElIds, setSelectedElIds] = useState<string[]>([]);
  // 편집 모드에선 게임 이미지 라이브러리(IDB)를 미리 데워(prefetch) — '게임 이미지' 피커가 로딩 없이 즉시.
  useEffect(() => { if (mode === 'edit') warmupAssets(); }, [mode]);
  const [resetNonce, setResetNonce] = useState(0);
  // 게임 완료(순서 게임 클리어·이야기 끝) — 하단 완료 버튼바를 띄운다. 다시하기/모드전환/문서변경 시 해제.
  const [finished, setFinished] = useState(false);
  const [extending, setExtending] = useState(false); // 확장 레인 생성 중(완료바 스피너용)
  const [picker, setPicker] = useState<null | { for: 'add' | 'swap' }>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [storyOpen, setStoryOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  // 교사 활동 카드(게임 디자인 에이전트 산출) — 우측 드로어, 재생·편집 양쪽에서 토글.
  const [cardOpen, setCardOpen] = useState(false);
  const [card, setCard] = useState<TeacherCard | null>(null);
  // 이미지 요소 편집/풀스크린 모달(마이보드 카드와 동일 컴포넌트 재사용).
  const [editImg, setEditImg] = useState<{ elId: string; behId?: string | null; src: string; caption: string; origin: OriginRect | null } | null>(null);
  const [fsImg, setFsImg] = useState<{ src: string; caption: string; origin: OriginRect | null } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ensure(docId);
  }, [docId, ensure]);

  // 교사 카드 로드 — docId 기준, 생성 직후(kv:game-card-saved) 갱신.
  useEffect(() => {
    const load = () => setCard(getGameCard(docId));
    load();
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail as { docId?: string } | null;
      if (!d || d.docId === docId) load();
    };
    window.addEventListener('kv:game-card-saved', on as EventListener);
    return () => window.removeEventListener('kv:game-card-saved', on as EventListener);
  }, [docId]);

  // 다시하기/모드 전환/문서 변경 시 완료 버튼바 숨김.
  useEffect(() => {
    setFinished(false);
  }, [resetNonce, mode, docId]);

  // 프롬프트바 라우팅용 — 편집 풀스크린일 때 이 노드를 '전용 컨텍스트'로 표시(보드로 안 샘).
  const setInodeFs = useUIStore((s) => s.setInodeFs);
  const setInodeFsSelCount = useUIStore((s) => s.setInodeFsSelCount);
  useEffect(() => {
    if (mode !== 'edit') {
      setInodeFs(null);
      return;
    }
    setInodeFs(docId);
    return () => setInodeFs(null);
  }, [mode, docId, setInodeFs]);
  useEffect(() => {
    if (mode === 'edit') setInodeFsSelCount(selectedElIds.length);
  }, [selectedElIds, mode, setInodeFsSelCount]);

  // 프롬프트바 입력 → 이 노드 AI 편집. 선택 요소가 있으면 그 요소에, 없으면 노드 전체 맥락.
  // 최신 선택을 안정 핸들러에서 읽으려 ref로 미러링한다.
  const selRef = useRef<string[]>([]);
  useEffect(() => {
    selRef.current = selectedElIds;
  }, [selectedElIds]);
  const applyingRef = useRef(false);
  useEffect(() => {
    const onPrompt = (e: Event) => {
      const d = (e as CustomEvent).detail as { docId?: string; prompt?: string } | null;
      if (!d || d.docId !== docId || !d.prompt || applyingRef.current) return;
      applyingRef.current = true;
      // 진행을 '마이보드 프롬프트바'처럼 입력창에 라이브 스트리밍한다 — boardStore.generating 을
      // 구동하면 공용 PromptBar 가 자동으로 스트리밍 표시(스피너+단계 메시지+타이핑 점)로 전환된다.
      const board = useBoardStore.getState();
      board.beginGen();
      board.setGenerating('✏️ 고치는 중…');
      const onBusy = (m: string | null) => {
        setBusy(m);
        if (m) board.setGenerating(m); // null은 endGen 이 정리(마지막 작업 끝날 때 메시지 비움)
      };
      void applyInteractivePrompt(docId, d.prompt, selRef.current, onBusy)
        .then((r) => {
          showToast(r.message, r.ok ? 'success' : 'error');
          if (r.ok && r.addedIds.length) setSelectedElIds(r.addedIds);
        })
        .finally(() => {
          applyingRef.current = false;
          board.endGen();
        });
    };
    window.addEventListener('kv:inode-prompt', onPrompt as EventListener);
    return () => window.removeEventListener('kv:inode-prompt', onPrompt as EventListener);
  }, [docId]);

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

  // 묶어서 복제(프리팹) — 선택한 여러 요소를 동작·내부 연결까지 함께 복제(id 재매핑).
  const duplicateBundle = () => {
    if (selectedElIds.length < 2) return;
    const ids = new Set(selectedElIds);
    const srcEls = doc.elements.filter((e) => ids.has(e.id));
    const srcBehs = doc.behaviors.filter((b) => ids.has(b.target));
    const srcConns = doc.connections.filter((c) => ids.has(c.from) && ids.has(c.to));
    const elMap: Record<string, string> = {};
    srcEls.forEach((e) => (elMap[e.id] = newId('el')));
    const behMap: Record<string, string> = {};
    srcBehs.forEach((b) => (behMap[b.id] = newId('beh')));
    const connMap: Record<string, string> = {};
    srcConns.forEach((c) => (connMap[c.id] = newId('conn')));
    const remapEls = (arr?: string[]) => (arr ?? []).map((t) => elMap[t] ?? t);
    const newEls = srcEls.map((e) => ({ ...e, id: elMap[e.id], transform: { ...e.transform, x: e.transform.x + 28, y: e.transform.y + 28 } }));
    const newBehs = srcBehs.map((b) => {
      // JSON 클론으로 union 타입 우회 — id/참조만 재매핑.
      const nb = JSON.parse(JSON.stringify(b)) as Record<string, unknown> & { params?: Record<string, unknown> };
      nb.id = behMap[b.id];
      nb.target = elMap[b.target] ?? b.target;
      if (typeof nb.after === 'string') nb.after = behMap[nb.after] ?? nb.after;
      if (Array.isArray(nb.then)) nb.then = (nb.then as string[]).map((t) => behMap[t] ?? t);
      if (nb.params && Array.isArray(nb.params.targets)) nb.params.targets = remapEls(nb.params.targets as string[]);
      if (nb.params && typeof nb.params.connectionId === 'string') nb.params.connectionId = connMap[nb.params.connectionId as string] ?? nb.params.connectionId;
      return nb as unknown as Behavior;
    });
    const newConns = srcConns.map((c) => ({ ...c, id: connMap[c.id], from: elMap[c.from], to: elMap[c.to] }));
    mutate(docId, (d) => ({
      ...d,
      elements: [...d.elements, ...newEls],
      behaviors: [...d.behaviors, ...newBehs],
      connections: [...d.connections, ...newConns],
    }));
    setSelectedElIds(Object.values(elMap));
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
  // swap(교체) 동작의 'to'(바뀐 모습) 이미지 교체 — 다중 모습 편집(AppearanceStrip)에서 되돌려 쓴다.
  const setSwapToSrc = (behId: string, url: string) =>
    mutate(docId, (d) => ({
      ...d,
      behaviors: d.behaviors.map((b) =>
        b.id === behId && b.action === 'swap'
          ? { ...b, params: { ...b.params, to: { ...b.params.to, id: newId('asset'), src: url } } }
          : b,
      ),
    }));
  // 다중 모습 스트립에서 한 모습을 골라 편집 — 그 모습의 src로 이미지 편집 모달을 연다(되돌릴 대상 behId 보존).
  const pickAppearance = (a: Appearance) =>
    setEditImg({ elId: selectedElIds[0], behId: a.behId, src: a.src, caption: '캐릭터 모습', origin: null });
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

  const onApply = async (picks: AssetPick[]) => {
    const forSwap = picker?.for === 'swap';
    const swapTarget = selectedElIds.length === 1 ? selectedElIds[0] : null;
    setPicker(null);
    if (picks.length === 0) return;
    setBusy('자료 넣는 중…');
    try {
      // 교체 모드 — 첫 선택 한 장으로 선택 요소의 그림을 바꾼다.
      if (forSwap && swapTarget) {
        const p = picks[0];
        const ref = p.kind === 'file' ? await fileToAssetRef(p.file, 'teacher-upload') : await urlToAssetRef(p.asset.url, 'teacher-upload');
        setBehaviorFor(swapTarget, { id: newId('beh'), target: swapTarget, trigger: 'tap', action: 'swap', params: { to: ref, mode: 'image' } });
        return;
      }
      // 추가 모드 — '배경' 태그는 캔버스 배경으로, 나머지는 요소로 누적 추가(겹치지 않게 계단식). 한 번의 mutate(한 번 실행취소).
      let bgRef: Awaited<ReturnType<typeof urlToAssetRef>> | null = null;
      const refs: Array<{ ref: Awaited<ReturnType<typeof urlToAssetRef>>; origin: 'upload' | 'board-copy' }> = [];
      for (const p of picks) {
        if (p.kind === 'library' && /배경|background/i.test(`${p.asset.tag} ${p.asset.group ?? ''}`)) {
          bgRef = await urlToAssetRef(p.asset.url, 'generated');
          continue;
        }
        const ref = p.kind === 'file' ? await fileToAssetRef(p.file, 'teacher-upload') : await urlToAssetRef(p.asset.url, 'teacher-upload');
        refs.push({ ref, origin: p.kind === 'file' ? 'upload' : 'board-copy' });
      }
      let at = center();
      const els = refs.map(({ ref, origin }) => {
        const el = makeImageElement(ref, origin, at, doc.canvas.size);
        at = { x: at.x + 44, y: at.y + 44 };
        return el;
      });
      mutate(docId, (d) => {
        let nd = d;
        if (bgRef) nd = { ...nd, canvas: { ...nd.canvas, background: bgRef } };
        nd = els.reduce((acc, el) => withElementAdded(acc, el), nd);
        return nd;
      });
      if (els.length) setSelectedElIds(els.map((e) => e.id));
    } finally {
      setBusy(null);
    }
  };

  // 이 게임을 라이브러리에 저장 — 인터랙티브 홈에서 바로 재생 + 비슷한 요청에 추천.
  const onSaveGame = () => {
    saveToLibrary(doc);
    setBusy('⭐ 게임을 저장했어요 — 인터랙티브 홈에서 바로 재생할 수 있어요');
    window.setTimeout(() => setBusy(null), 1800);
  };

  // 확장 — 같은 노드에 새 레인을 추가하고 그 레인으로 패닝(MyBoard로 안 나감, 모델 2 무한 성장).
  // v0.2 Resolver(결정론 레시피 + 기본 body 사슬)가 '무슨 확장인지'를 주입한다. 추정/충전 실패 시
  // 기존 composeInteractiveNode(extendActivityInNode) 폴백. 생성→병합→패닝 순서.
  const runExtend = async () => {
    if (extending) return;
    setExtending(true);
    const extendPrompt = `"${doc.title || '인터랙티브 놀이'}" 다음에 이어서 할 새로운 확장 놀이를 만들어줘`;
    try {
      let res = await resolverExtend(docId, setBusy); // 레시피별 기본 body 로 다음 레인
      if (!res.ok) res = await extendActivityInNode(docId, extendPrompt, setBusy); // 폴백(전체 LLM)
      if (res.ok) {
        setFinished(false);
        // 노드 로컬 카메라를 새 레인으로(InteractiveStage가 kv:inode-goto-lane 수신).
        window.dispatchEvent(new CustomEvent('kv:inode-goto-lane', { detail: { docId, lane: res.lane } }));
      } else {
        setBusy(res.message);
        window.setTimeout(() => setBusy(null), 2000);
      }
    } finally {
      setExtending(false);
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
      {/* 상단 크롬 — 좌:홈(+편집도구) / 중앙:게임 제목(텍스트) / 우:모드·처음으로·도움말·닫기 */}
      <div className="relative flex items-center justify-between gap-2 p-3">
        {/* 좌 — 홈(가장 왼쪽) + 편집 도구 */}
        <div className="flex items-center gap-2">
          {onHome && (
            <button onClick={onHome} className={chromeBtn} title="인터랙티브 홈 — 저장한 게임 목록·추천" aria-label="홈">
              <Icon name="home" size={16} /> 홈
            </button>
          )}
          {mode === 'edit' && (
            <>
              <button onClick={() => undo(docId)} className={chromeIconBtn} title="실행취소 (⌘/Ctrl+Z)" aria-label="실행취소">
                <Icon name="undo" size={16} />
              </button>
              <button onClick={() => redo(docId)} className={chromeIconBtn} title="다시실행 (⌘/Ctrl+⇧Z)" aria-label="다시실행">
                <Icon name="redo" size={16} />
              </button>
              <button
                onClick={() => {
                  setStoryOpen((v) => !v);
                  setSelectedElIds([]);
                }}
                className={storyOpen ? chromeBtnAccent : chromeBtn}
                title="이야기 — 단계별 나레이션"
              >
                <Icon name="book" size={16} /> 이야기
              </button>
              {selectedElIds.length > 1 && (
                <>
                  <span className="rounded-pill bg-accent-soft px-3 py-1.5 text-sm font-semibold text-fg">{selectedElIds.length}개 선택</span>
                  <button onClick={duplicateBundle} className={chromeBtn} title="선택한 것들을 동작·연결까지 묶어서 복제(프리팹)">
                    <Icon name="copy" size={16} /> 묶어서 복제
                  </button>
                </>
              )}
            </>
          )}
        </div>

        {/* 중앙 — 게임 제목(버튼 아닌 큰 텍스트). 절대중앙 정렬. */}
        <h1 className="pointer-events-none absolute left-1/2 top-1/2 max-w-[38%] -translate-x-1/2 -translate-y-1/2 truncate text-center font-serif text-xl font-bold text-fg">
          {doc.title}
        </h1>

        {/* 우 — 편집/재생 · (재생)처음으로/(편집)저장·게임이미지 · 도움말 · 닫기 */}
        <div className="flex items-center gap-2">
          <button onClick={toggleMode} className={chromeBtnAccent}>
            {mode === 'edit' ? <><Icon name="play" size={16} /> 재생</> : <><Icon name="edit" size={16} /> 편집</>}
          </button>
          {mode === 'play' && (
            <button onClick={() => setResetNonce((n) => n + 1)} className={chromeBtn} title="게임을 시작 상태로 되돌려요">
              <Icon name="reset" size={16} /> 처음으로
            </button>
          )}
          {mode === 'edit' && (
            <button onClick={onSaveGame} className={chromeBtn} title="이 게임을 저장 — 인터랙티브 홈에서 바로 재생할 수 있어요" aria-label="저장">
              <Icon name="star" size={16} /> 저장
            </button>
          )}
          {mode === 'edit' && (
            <button onClick={() => setPicker({ for: 'add' })} className={chromeBtn} title="저장된 게임 이미지·배경에서 골라 넣기" aria-label="게임 이미지">
              <Icon name="gallery" size={16} /> 게임 이미지
            </button>
          )}
          {card && (
            <button
              onClick={() => setCardOpen((v) => !v)}
              className={cardOpen ? chromeBtnAccent : chromeBtn}
              title="교사용 활동 안내 — 목표·발문·진행·확장·평가"
              aria-label="교사 안내"
            >
              <Icon name="book" size={16} /> 교사 안내
            </button>
          )}
          <button onClick={() => setHelpOpen(true)} className={chromeBtn} title="도움말 — 기능·단축키 안내" aria-label="도움말">
            <Icon name="help" size={16} /> 도움말
          </button>
          <button onClick={onClose} className={chromeBtn} aria-label="닫기">
            <Icon name="x" size={16} /> 닫기
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
            onComplete={() => { if (mode === 'play') setFinished(true); }}
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
            <button onClick={() => setSelectedElIds([])} title="선택 해제" className={tbBtn} aria-label="선택 해제">
              <Icon name="cursor" size={18} />
            </button>
            <span className="my-0.5 h-px w-6 bg-border" />
            <button onClick={() => fileRef.current?.click()} title="사진 추가(파일)" className={tbBtn} aria-label="사진 추가">
              <Icon name="gallery" size={18} />
            </button>
            <button onClick={() => setPicker({ for: 'add' })} title="보관함에서 추가" className={tbBtn} aria-label="보관함에서 추가">
              <Icon name="folder" size={18} />
            </button>
            <button onClick={addText} title="글자 추가" className={tbBtn} aria-label="글자 추가">
              <Icon name="type" size={18} />
            </button>
            <button onClick={addShape} title="도형 추가" className={tbBtn} aria-label="도형 추가">
              <Icon name="square" size={18} />
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
          title={picker.for === 'swap' ? '바뀔 그림 고르기' : '게임 이미지'}
          multi={picker.for !== 'swap'}
          onClose={() => setPicker(null)}
          onApply={onApply}
        />
      )}

      {helpOpen && <HelpOverlay onClose={() => setHelpOpen(false)} />}

      {/* 교사용 활동 안내 드로어 — 게임 디자인 에이전트가 만든 카드(있을 때만). 재생·편집 양쪽. */}
      {card && cardOpen && <TeacherCardPanel card={card} onClose={() => setCardOpen(false)} />}

      {/* 캐릭터 다중 모습 편집 스트립 — 편집모드 + 단일선택 + 여러 모습(swap)을 가진 요소일 때. */}
      {mode === 'edit' && selectedElIds.length === 1 && (() => {
        const apps = appearancesOf(doc, selectedElIds[0]);
        return apps.length > 1 ? <AppearanceStrip appearances={apps} onPick={pickAppearance} onClose={() => setSelectedElIds([])} /> : null;
      })()}

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
                onApply: (url) => (editImg.behId ? setSwapToSrc(editImg.behId, url) : setElementSrc(editImg.elId, url)),
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

      {/* 공용 프롬프트바 — 풀스크린(편집) 하단 중앙. 입력은 이 노드로 라우팅(board/prompt가
          kv:inode-prompt로 전달). 선택 요소 있으면 그 요소에, 없으면 노드 전체 맥락으로 AI 적용. */}
      {mode === 'edit' && (
        <div className="kv-fsbar-enter">
          <PromptBar />
        </div>
      )}

      {/* 게임 완료 — 하단 버튼바. 다시하기 · (다음 게임: 다음 레벨 있을 때만 · 지금은 레벨 시스템 없어 숨김)
          · 확장 활동(보드 오른쪽으로) · 종료(인터랙티브 홈). */}
      {mode === 'play' && finished && (
        <div className="pointer-events-none absolute inset-x-0 bottom-6 z-30 flex justify-center px-4">
          <div className="kv-fsbar-enter pointer-events-auto flex flex-wrap items-center justify-center gap-2 rounded-[28px] border border-border bg-surface/95 px-3 py-2 shadow-lg backdrop-blur">
            {extending ? (
              <span className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-semibold text-fg-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-surface-3 border-t-accent" />
                {busy ?? '확장 활동을 만드는 중…'}
              </span>
            ) : (
              <>
                <button
                  onClick={() => { setResetNonce((n) => n + 1); setFinished(false); }}
                  className={chromeBtn}
                  title="처음부터 다시"
                >
                  <Icon name="reset" size={16} /> 다시하기
                </button>
                <button onClick={runExtend} className={chromeBtn} title="이어지는 확장 놀이를 옆 레인에 만들기">
                  <Icon name="sparkle" size={16} /> 확장 활동
                </button>
                <button onClick={() => (onExit ? onExit() : onClose())} className={chromeBtnAccent} title="인터랙티브 홈으로">
                  <Icon name="x" size={16} /> 종료
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
