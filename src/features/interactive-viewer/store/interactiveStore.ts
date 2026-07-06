/**
 * 인터렉티브 노드 — 영속화 + 리액티브 캐시.
 *
 * 저장 단위 = InteractiveNode(자기완결 문서). localStorage('kv:inodes:v1')에
 * docId로 보관하고, 보드 노드는 data.docId로만 참조한다(슬라이드 '?id=' 선례).
 * 보드 카드 미리보기와 풀스크린 저작 오버레이가 이 스토어로 같은 문서를 공유한다.
 */
import { create } from 'zustand';
import { newId } from '@/store/boardStore';
import { showToast } from '@/lib/toast';
import { parseInteractiveNode, safeParseInteractiveNode } from '../schema/parse';
import { normalizeNode } from '../runtime/geometry';
import type { InteractiveNode } from '../schema/interactiveNode';

const LS_KEY = 'kv:inodes:v1';
// 파싱 실패한 저장분의 대피소 — 깨진 문서를 빈 기본 문서로 '영구 덮어쓰기' 전에 원본을 보존한다(복구 여지).
const QUARANTINE_KEY = 'kv:inodes:quarantine:v1';

type Persisted = Record<string, InteractiveNode>;

function readAll(): Persisted {
  if (typeof localStorage === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? '{}') as Persisted;
  } catch {
    return {};
  }
}

/** 전체 맵 저장 — 성공 여부를 반환해 호출부가 실패(quota/직렬화)를 표면화할 수 있게 한다. */
function writeAll(all: Persisted): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(all)); // localStorage 미러가 클라우드로 동기화
    return true;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[inodes] 저장 실패(quota/직렬화) — 세션 캐시만 유지된다:', e);
    return false;
  }
}

/** 파싱 실패한 raw 원본을 격리 보관 — 같은 id는 재격리 스킵(리로드마다 재검사돼도 최초 원본만 보존). */
function quarantineRaw(docId: string, raw: unknown): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const q = JSON.parse(localStorage.getItem(QUARANTINE_KEY) ?? '{}') as Record<string, unknown>;
    if (docId in q) return;
    q[docId] = raw;
    localStorage.setItem(QUARANTINE_KEY, JSON.stringify(q));
  } catch {
    /* 격리 실패해도 흐름 유지 — 핵심은 원본을 기본 문서로 덮어쓰지 않는 것 */
  }
}

/** docId로 문서 로드 — 스키마 검증 통과분만(깨진 데이터는 null). */
export function loadInteractiveNode(id: string): InteractiveNode | null {
  const raw = readAll()[id];
  if (!raw) return null;
  const r = safeParseInteractiveNode(raw);
  return r.success ? r.data : null;
}

/** 저장된 모든 인터렉티브 노드 목록(수업 슬라이드 picker용) — id·제목·요소 수. */
export function listInteractiveNodes(): Array<{ id: string; title: string; count: number }> {
  const all = readAll();
  return Object.values(all).map((d) => ({ id: d.id, title: d.title || '인터랙티브', count: (d.elements ?? []).length }));
}

// 저장 실패 토스트는 세션당 1회만 — mutate 마다 실패가 반복돼도 도배하지 않는다.
let quotaToastShown = false;

/** 문서를 localStorage에 저장 — 실패(quota)를 무음으로 삼키지 않고 경고·토스트로 표면화. */
export function saveInteractiveNode(doc: InteractiveNode): void {
  const all = readAll();
  all[doc.id] = doc;
  if (!writeAll(all) && typeof window !== 'undefined' && !quotaToastShown) {
    quotaToastShown = true;
    showToast('저장 공간이 부족해요 — 게임이 저장되지 않았어요', 'error');
  }
}

/** 빈 인터렉티브 노드 — 파스텔 배경 + 빈 캔버스. parse로 기본값 채워 항상 유효. */
export function createDefaultNode(docId: string, createdBy = 'teacher'): InteractiveNode {
  return parseInteractiveNode({
    id: docId,
    title: '인터랙티브',
    canvas: { background: 'pastel.cream', size: { w: 1280, h: 800 } },
    elements: [],
    meta: { createdBy, safety: {} },
  });
}

/** 새 문서 id. */
export function newDocId(): string {
  return newId('inode');
}

interface InteractiveState {
  /** 열린/미리보기 중인 문서 캐시(docId → doc). */
  docs: Record<string, InteractiveNode>;
  /** per-doc undo/redo 스택(편집 히스토리). */
  past: Record<string, InteractiveNode[]>;
  future: Record<string, InteractiveNode[]>;
  /** docId 보장 — 캐시→localStorage→기본 생성(신규만 즉시 영속화 · 파싱 실패분은 격리 후 메모리에만). 히스토리에 안 남음. */
  ensure: (docId: string) => InteractiveNode;
  /** 현재 캐시 값(없으면 undefined). */
  peek: (docId: string) => InteractiveNode | undefined;
  /** 함수형 갱신 — 히스토리에 기록(undo 가능) + localStorage 반영. */
  mutate: (docId: string, fn: (doc: InteractiveNode) => InteractiveNode) => void;
  undo: (docId: string) => void;
  redo: (docId: string) => void;
  canUndo: (docId: string) => boolean;
  canRedo: (docId: string) => boolean;
}

const HISTORY_MAX = 50;

export const useInteractiveStore = create<InteractiveState>((set, get) => ({
  docs: {},
  past: {},
  future: {},
  ensure: (docId) => {
    const cached = get().docs[docId];
    if (cached) return cached;
    const stored = loadInteractiveNode(docId);
    const raw = stored ? undefined : (readAll()[docId] as unknown);
    if (!stored && raw !== undefined) {
      // 저장분이 '있는데' 파싱에 실패한 경우 — 예전엔 기본 문서를 즉시 저장해 원본이 영구 소실됐다.
      // 원본은 격리 보관하고 기본 문서는 메모리 캐시에만 둔다(다음 정상 mutate 때 저장).
      // eslint-disable-next-line no-console
      console.warn('[inodes] 저장 문서 파싱 실패 — 원본을 격리 보관:', docId);
      quarantineRaw(docId, raw);
      const fallback = normalizeNode(createDefaultNode(docId));
      set((s) => ({ docs: { ...s.docs, [docId]: fallback } }));
      return fallback;
    }
    // 화면 밖으로 튕겨나간 요소 회수 + 신규 문서는 즉시 영속화.
    const loaded = normalizeNode(stored ?? createDefaultNode(docId));
    if (!stored || loaded !== stored) saveInteractiveNode(loaded);
    set((s) => ({ docs: { ...s.docs, [docId]: loaded } }));
    return loaded;
  },
  peek: (docId) => get().docs[docId],
  mutate: (docId, fn) =>
    set((s) => {
      const cur = s.docs[docId];
      if (!cur) return s;
      const next = fn(cur);
      saveInteractiveNode(next);
      const past = [...(s.past[docId] ?? []), cur];
      if (past.length > HISTORY_MAX) past.shift();
      return { docs: { ...s.docs, [docId]: next }, past: { ...s.past, [docId]: past }, future: { ...s.future, [docId]: [] } };
    }),
  undo: (docId) =>
    set((s) => {
      const p = s.past[docId] ?? [];
      const cur = s.docs[docId];
      if (!p.length || !cur) return s;
      const prev = p[p.length - 1];
      saveInteractiveNode(prev);
      return {
        docs: { ...s.docs, [docId]: prev },
        past: { ...s.past, [docId]: p.slice(0, -1) },
        future: { ...s.future, [docId]: [cur, ...(s.future[docId] ?? [])] },
      };
    }),
  redo: (docId) =>
    set((s) => {
      const f = s.future[docId] ?? [];
      const cur = s.docs[docId];
      if (!f.length || !cur) return s;
      const nxt = f[0];
      saveInteractiveNode(nxt);
      return {
        docs: { ...s.docs, [docId]: nxt },
        future: { ...s.future, [docId]: f.slice(1) },
        past: { ...s.past, [docId]: [...(s.past[docId] ?? []), cur] },
      };
    }),
  canUndo: (docId) => (get().past[docId]?.length ?? 0) > 0,
  canRedo: (docId) => (get().future[docId]?.length ?? 0) > 0,
}));
