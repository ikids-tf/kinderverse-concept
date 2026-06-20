/**
 * 인터렉티브 노드 — 영속화 + 리액티브 캐시.
 *
 * 저장 단위 = InteractiveNode(자기완결 문서). localStorage('kv:inodes:v1')에
 * docId로 보관하고, 보드 노드는 data.docId로만 참조한다(슬라이드 '?id=' 선례).
 * 보드 카드 미리보기와 풀스크린 저작 오버레이가 이 스토어로 같은 문서를 공유한다.
 */
import { create } from 'zustand';
import { newId } from '@/store/boardStore';
import { parseInteractiveNode, safeParseInteractiveNode } from '../schema/parse';
import type { InteractiveNode } from '../schema/interactiveNode';

const LS_KEY = 'kv:inodes:v1';

type Persisted = Record<string, InteractiveNode>;

function readAll(): Persisted {
  if (typeof localStorage === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? '{}') as Persisted;
  } catch {
    return {};
  }
}

function writeAll(all: Persisted): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(all));
  } catch {
    /* quota/직렬화 실패 — 무시(세션 캐시는 유지된다) */
  }
}

/** docId로 문서 로드 — 스키마 검증 통과분만(깨진 데이터는 null). */
export function loadInteractiveNode(id: string): InteractiveNode | null {
  const raw = readAll()[id];
  if (!raw) return null;
  const r = safeParseInteractiveNode(raw);
  return r.success ? r.data : null;
}

/** 문서를 localStorage에 저장(저장 직전 엄격 파싱으로 무결성 보장). */
export function saveInteractiveNode(doc: InteractiveNode): void {
  const all = readAll();
  all[doc.id] = doc;
  writeAll(all);
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
  /** docId 보장 — 캐시→localStorage→기본 생성(생성 시 즉시 영속화). */
  ensure: (docId: string) => InteractiveNode;
  /** 현재 캐시 값(없으면 undefined). */
  peek: (docId: string) => InteractiveNode | undefined;
  /** 문서 갱신 — 캐시 + localStorage 동시 반영. */
  update: (docId: string, doc: InteractiveNode) => void;
  /** 함수형 갱신(현재 문서 기반). */
  mutate: (docId: string, fn: (doc: InteractiveNode) => InteractiveNode) => void;
}

export const useInteractiveStore = create<InteractiveState>((set, get) => ({
  docs: {},
  ensure: (docId) => {
    const cached = get().docs[docId];
    if (cached) return cached;
    const loaded = loadInteractiveNode(docId) ?? createDefaultNode(docId);
    if (!loadInteractiveNode(docId)) saveInteractiveNode(loaded); // 신규 문서 즉시 영속화
    set((s) => ({ docs: { ...s.docs, [docId]: loaded } }));
    return loaded;
  },
  peek: (docId) => get().docs[docId],
  update: (docId, doc) => {
    set((s) => ({ docs: { ...s.docs, [docId]: doc } }));
    saveInteractiveNode(doc);
  },
  mutate: (docId, fn) => {
    const cur = get().docs[docId] ?? get().ensure(docId);
    const next = fn(cur);
    set((s) => ({ docs: { ...s.docs, [docId]: next } }));
    saveInteractiveNode(next);
  },
}));
