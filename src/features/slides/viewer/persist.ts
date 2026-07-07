/* 덱 영속화 — 뷰어 인스턴스(보드 노드)마다 ?id=로 분리해 localStorage에 저장.
   M1은 텍스트만(삽화 없음)이라 용량이 작다. 보드의 node.data.embed에 ?id=가 들어가
   새로고침에도 같은 덱을 복원한다. (보드 '폴더 번들' 저장 연동은 다음 단계.) */

import type { DeckSpec } from '../schema/deckspec';

/** 덱의 localStorage 키 — 카드 뷰어와 편집 오버레이(별도 iframe)가 storage 이벤트로 동기화할 때도 쓴다. */
export const deckKey = (id: string) => `kv-deck-${id}`;
const key = deckKey;

export function loadDeck(id: string): DeckSpec | null {
  try {
    const raw = localStorage.getItem(key(id));
    return raw ? (JSON.parse(raw) as DeckSpec) : null;
  } catch {
    return null;
  }
}

export function saveDeck(id: string, deck: DeckSpec): void {
  try {
    localStorage.setItem(key(id), JSON.stringify(deck));
  } catch {
    /* quota/직렬화 실패 — 무시(다음 편집에서 재시도) */
  }
}
