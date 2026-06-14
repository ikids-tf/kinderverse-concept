import { idbGet, idbSet } from '@/board/idb';

/* 슬라이드 이미지 보관 — 배경/블록 이미지(data URI)를 덱이 아니라 IndexedDB에 id별로 저장.
   덱(DeckSpec)은 텍스트만(assetId 참조만) → localStorage 용량 안전. 슬라이드 뷰어는
   same-origin이라 보드와 같은 IndexedDB('kv-board')를 공유한다. videoAssets와 같은 패턴. */

const PREFIX = 'slide-image:v1:';

/** 간단한 고유 id(보드 newId와 독립) — 슬라이드 이미지 키. */
export function newImageId(): string {
  const rnd = Math.random().toString(36).slice(2, 9);
  return `simg-${Date.now().toString(36)}-${rnd}`;
}

/** 이미지(data URI)를 새 id로 저장하고 그 id를 돌려준다. data: 아니면 빈 문자열. */
export async function storeSlideImage(dataUri: string): Promise<string> {
  if (!dataUri || !dataUri.startsWith('data:')) return '';
  const id = newImageId();
  await idbSet(PREFIX + id, dataUri);
  return id;
}

/** 저장된 이미지 data URI를 id로 가져온다(없으면 undefined). */
export async function getSlideImage(id: string): Promise<string | undefined> {
  if (!id) return undefined;
  return idbGet<string>(PREFIX + id);
}
