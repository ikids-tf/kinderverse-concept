/**
 * 인터랙티브 게임 '저장 라이브러리' — 교사가 명시적으로 저장한 게임만 모은 큐레이션 목록.
 *
 * 모든 노드는 kv:inodes:v1에 자동 영속되지만(드래프트 포함), 여기 라이브러리는 '저장' 버튼으로
 * 골라 담은 활동만 담는다(인터랙티브 홈에서 보여주고, 비슷한 요청에 추천). 문서 자체는
 * kv:inodes:v1에 그대로 두고 docId로 참조한다(이미지 중복 저장으로 용량 폭주 방지).
 */
import { loadInteractiveNode } from './interactiveStore';
import type { InteractiveNode } from '../schema/interactiveNode';

const LIB_KEY = 'kv:inode-library:v1';

export interface SavedGame {
  docId: string;
  title: string;
  savedAt: number;
}

function readLib(): SavedGame[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const v = JSON.parse(localStorage.getItem(LIB_KEY) ?? '[]');
    return Array.isArray(v) ? (v as SavedGame[]) : [];
  } catch {
    return [];
  }
}
function writeLib(l: SavedGame[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LIB_KEY, JSON.stringify(l));
  } catch {
    /* quota — 무시 */
  }
}

/** 저장된 게임 목록(최신순). 문서가 사라진 항목은 건너뛴다. */
export function listLibrary(): SavedGame[] {
  return readLib()
    .filter((s) => !!loadInteractiveNode(s.docId))
    .sort((a, z) => z.savedAt - a.savedAt);
}

/** 이 게임이 이미 저장돼 있나? */
export function isInLibrary(docId: string): boolean {
  return readLib().some((s) => s.docId === docId);
}

/** 현재 게임을 라이브러리에 저장(같은 docId면 갱신). 반환=저장 항목. */
export function saveToLibrary(doc: InteractiveNode): SavedGame {
  const rest = readLib().filter((s) => s.docId !== doc.id);
  const entry: SavedGame = { docId: doc.id, title: doc.title || '인터랙티브', savedAt: Date.now() };
  writeLib([entry, ...rest]);
  return entry;
}

/** 라이브러리에서 제거(문서 자체는 남는다). */
export function removeFromLibrary(docId: string): void {
  writeLib(readLib().filter((s) => s.docId !== docId));
}

/** 질의(게임 만들기 프롬프트)와 제목이 겹치는 저장 게임 추천 — 없으면 빈 배열. */
export function recommendFromLibrary(query: string, limit = 3): SavedGame[] {
  const toks = (query || '')
    .toLowerCase()
    .split(/[\s,!?.·]+/)
    .map((w) => w.replace(/(을|를|이|가|은|는|에|의|로|와|과|게임|퀴즈|만들어줘|만들기|만들|놀이|활동|찾아|눌러|세기)$/u, ''))
    .filter((w) => w.length >= 2);
  if (!toks.length) return [];
  return listLibrary()
    .map((s) => ({ s, score: toks.reduce((n, t) => n + (s.title.toLowerCase().includes(t) ? 1 : 0), 0) }))
    .filter((x) => x.score > 0)
    .sort((a, z) => z.score - a.score || z.s.savedAt - a.s.savedAt)
    .slice(0, limit)
    .map((x) => x.s);
}
