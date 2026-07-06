/**
 * 클라우드 ↔ 로컬 시작 동기화(공유 1개 공간 · last-write-wins) — '서비스의 모든 자료'.
 *
 * 키 스킴: localStorage 키는 `ls:<key>`, IndexedDB 키는 `idb:<key>`로 클라우드에 저장된다.
 * 미러는 두 길목에서 자동으로 일어난다:
 *   · localStorage.setItem 패치(cloudMirror) → 모든 앱 LS 키
 *   · idbSet 래퍼(board/idb) → 모든 IDB 키(보드 스냅샷·폴더·갤러리 이미지·슬라이드·동영상·웹링크…)
 *
 * 시작 시(이 함수, main.tsx에서 렌더 전 await):
 *   1) 클라우드의 모든 행을 받아 로컬에 적용(raw 세터 — 미러 루프 안 탐). cloud=공유 진실.
 *      단, 신선도 가드: 로컬 마지막 쓰기(cloud.ts의 기기-로컬 맵)가 클라우드 updated_at보다
 *      최신이면 그 키는 덮지 않고 로컬 값을 역푸시한다 — 디바운스 창 리로드로 push가 유실됐을 때
 *      옛 스냅샷이 라이브러리를 롤백하던 문제의 2차 방어(1차는 cloud.ts의 flushPendingPushes).
 *   2) 구버전 키(prefix 없는 boards:* 등)는 알맞은 로컬 위치로 1회 이관(하위호환).
 *   3) 클라우드에 아직 없는 로컬 항목은 올린다(기존 로컬 자료 최초 이관).
 * 자격증명 없으면 즉시 반환(no-op).
 */
import { isCloudEnabled } from './supabase';
import { cloudList, cloudPushNow, isLocalNewerThan } from './cloud';
import { rawLocalSet, isMirroredKey } from './cloudMirror';
import { idbSetRaw, idbGet, idbKeys } from '@/board/idb';

/** 구버전(접두사 없는) 클라우드 키 → 로컬 위치. 한 번 적용되면 이후엔 prefix 키로 재동기화된다. */
const LEGACY_LS: Record<string, string> = {
  'boards:meta': 'kv:boards:meta:v1',
  inodes: 'kv:inodes:v1',
  library: 'kv:inode-library:v1',
  actorPoses: 'kv:actor-poses:v1',
};
const LEGACY_IDB: Record<string, string> = {
  'boards:snapshots': 'snapshots',
  folders: 'kv:folder:v1',
};

function toStr(v: unknown): string {
  return typeof v === 'string' ? v : JSON.stringify(v);
}
function nonEmpty(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === 'string') return v.length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v as object).length > 0;
  return true;
}

export async function initCloudSync(timeoutMs = 9000): Promise<void> {
  if (!isCloudEnabled()) return;
  const work = (async () => {
    // 1) 클라우드 전체 → 로컬 적용(신선도 가드: 로컬이 더 최신인 키는 덮지 않고 역푸시)
    const rows = await cloudList();
    const cloudHas = new Set(rows.map((r) => r.k));
    for (const { k, v, updated_at } of rows) {
      try {
        if (k.startsWith('ls:')) {
          const lsKey = k.slice(3);
          if (isLocalNewerThan(k, updated_at)) {
            const raw = localStorage.getItem(lsKey);
            if (raw != null && raw.length > 0) {
              let parsed: unknown = raw;
              try {
                parsed = JSON.parse(raw);
              } catch {
                /* 비-JSON 값은 문자열 그대로 */
              }
              if (nonEmpty(parsed)) {
                // eslint-disable-next-line no-console
                console.warn('[cloudSync] 로컬이 더 최신 — pull 생략·역푸시:', k);
                void cloudPushNow(k, parsed); // 렌더를 막지 않게 fire-and-forget
                continue;
              }
            }
            /* 로컬 실물이 비어 있으면(쓰기 기록만 남은 경우) 가드 해제 → 아래로 진행해 클라우드 값 적용 */
          }
          rawLocalSet(lsKey, toStr(v));
        } else if (k.startsWith('idb:')) {
          const idbKey = k.slice(4);
          if (isLocalNewerThan(k, updated_at)) {
            const local = await idbGet<unknown>(idbKey);
            if (nonEmpty(local)) {
              // eslint-disable-next-line no-console
              console.warn('[cloudSync] 로컬이 더 최신 — pull 생략·역푸시:', k);
              void cloudPushNow(k, local);
              continue;
            }
          }
          await idbSetRaw(idbKey, v);
        } else if (LEGACY_LS[k]) rawLocalSet(LEGACY_LS[k], toStr(v));
        else if (LEGACY_IDB[k]) await idbSetRaw(LEGACY_IDB[k], v);
      } catch {
        /* 한 항목 실패는 건너뛴다 */
      }
    }

    // 2) 클라우드에 아직 없는 로컬 항목 올리기(기존 자료 최초 이관)
    try {
      for (const k of Object.keys(localStorage)) {
        if (!isMirroredKey(k) || cloudHas.has('ls:' + k)) continue;
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        let parsed: unknown = raw;
        try {
          parsed = JSON.parse(raw);
        } catch {
          /* 문자열 그대로 */
        }
        if (nonEmpty(parsed)) await cloudPushNow('ls:' + k, parsed);
      }
    } catch {
      /* ignore */
    }
    try {
      for (const k of await idbKeys()) {
        if (cloudHas.has('idb:' + k)) continue;
        const v = await idbGet<unknown>(k);
        if (nonEmpty(v)) await cloudPushNow('idb:' + k, v);
      }
    } catch {
      /* ignore */
    }
  })();
  await Promise.race([work, new Promise<void>((r) => setTimeout(r, timeoutMs))]);
}
