import { idbGet, idbSet } from './idb';

/* 동영상 자산 보관함 — Veo로 생성한 mp4(data URI)를 보드 스냅샷과 별개로 IndexedDB에
   저장한다. 영상은 수 MB라 스냅샷(node.data.viewerSrc)에 넣으면 영속화가 비대해지고
   Veo 원본 URI는 2일 후 만료되므로, 생성 즉시 받아 둔 이 로컬 복사본이 원본이 된다.
   이미지(assets.ts)와 달리 영상은 한 건이 크므로 키 하나에 모으지 않고 id별 키로
   저장한다(getVideoAsset이 그 영상 하나만 읽음 — 전체 맵 로드 회피). */

const PREFIX = 'video-asset:v1:';

/** 생성된 영상(data URI)을 id로 저장. 빈 값/플레이스홀더는 저장하지 않는다. */
export async function saveVideoAsset(id: string, dataUri: string): Promise<void> {
  if (!id || !dataUri.startsWith('data:')) return;
  await idbSet(PREFIX + id, dataUri);
}

/** 저장된 영상 data URI를 id로 가져온다(없으면 undefined). 새로고침 복원에 사용. */
export async function getVideoAsset(id: string): Promise<string | undefined> {
  if (!id) return undefined;
  return idbGet<string>(PREFIX + id);
}
