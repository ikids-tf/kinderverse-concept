/**
 * 클라우드 ↔ 로컬 시작 동기화(공유 1개 공간) — '서비스의 모든 자료'.
 *
 * 키 스킴: localStorage 키는 `ls:<key>`, IndexedDB 키는 `idb:<key>`로 클라우드에 저장된다.
 * 미러는 두 길목에서 자동으로 일어난다:
 *   · localStorage.setItem 패치(cloudMirror) → 모든 앱 LS 키
 *   · idbSet 래퍼(board/idb) → 모든 IDB 키(폴더·갤러리 이미지·슬라이드·동영상·웹링크…)
 *
 * ★ 보드는 특별 취급(다중 사용자 덮어쓰기 수정):
 *   · 목록(meta)은 LWW 교체가 아니라 **병합**(합집합+삭제 톰스톤, boardsMeta.ts) — 옛 탭이
 *     옛 목록을 밀어도 남의 새 보드가 사라지지 않는다.
 *   · 스냅샷은 클라우드에 **보드별 행**(`idb:snapshot:<id>`)으로 존재. 시작 시 행들을 모아
 *     로컬 blob('snapshots')을 조립한다. 구버전의 한-덩어리 행(idb:snapshots)은 보드별 행이
 *     없는 보드의 보충용으로만 읽고(읽는 즉시 보드별 행으로 이관), 더는 갱신하지 않는다.
 *   · 스냅샷은 있는데 목록에 없는 보드(과거 목록 덮어쓰기 사고의 산물)는 목록에 복구한다.
 *
 * 나머지 키(1행=1자료)는 기존 규칙: 클라우드=공유 진실 + 신선도 가드(로컬 마지막 쓰기가
 * 클라우드 updated_at보다 최신이면 덮지 않고 역푸시 — cloud.ts의 기기-로컬 맵).
 * 자격증명 없으면 즉시 반환(no-op).
 */
import { isCloudEnabled } from './supabase';
import { cloudList, cloudPushNow, cloudDeleteNow, isLocalNewerThan } from './cloud';
import { rawLocalSet, isMirroredKey } from './cloudMirror';
import { idbSetRaw, idbGet, idbKeys } from '@/board/idb';
import {
  mergeBoardsMeta,
  metaDiffers,
  META_LS_KEY,
  META_CLOUD_KEY,
  SNAP_CLOUD_PREFIX,
  LEGACY_SNAPSHOTS_CLOUD_KEY,
  IDB_SNAPSHOTS_KEY,
  type BoardsMetaShape,
} from '@/board/boardsMeta';

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

interface CloudRow {
  k: string;
  v: unknown;
  updated_at?: string;
}

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

/* ── 보드 동기화(목록 병합 + 보드별 스냅샷 행 조립) ─────────────────────────── */

async function syncBoards(
  metaRow: CloudRow | undefined,
  snapRows: CloudRow[],
  legacyRow: CloudRow | undefined,
): Promise<void> {
  let localMeta: BoardsMetaShape | null = null;
  try {
    const raw = localStorage.getItem(META_LS_KEY);
    if (raw) localMeta = JSON.parse(raw) as BoardsMetaShape;
  } catch {
    /* 손상된 로컬 meta는 무시 */
  }
  const remoteMeta = (metaRow?.v ?? null) as BoardsMetaShape | null;
  // 로컬 마지막 쓰기(이름변경 등)가 클라우드 행보다 최신이면 겹치는 항목은 로컬을 우선.
  const merged = mergeBoardsMeta(
    localMeta,
    remoteMeta,
    isLocalNewerThan(META_CLOUD_KEY, metaRow?.updated_at),
  );
  const removed = merged.removed ?? {};

  const localBlob =
    (await idbGet<Record<string, unknown>>(IDB_SNAPSHOTS_KEY)) ?? ({} as Record<string, unknown>);
  const snaps: Record<string, unknown> = {};

  // a) 클라우드 보드별 행 — 키 단위 신선도 가드 유지(로컬이 최신이면 로컬 유지+역푸시)
  for (const r of snapRows) {
    const id = r.k.slice(SNAP_CLOUD_PREFIX.length);
    if (removed[id] != null) {
      void cloudDeleteNow(r.k); // 지운 보드의 잔행 정리
      continue;
    }
    if (isLocalNewerThan(r.k, r.updated_at) && nonEmpty(localBlob[id])) {
      // eslint-disable-next-line no-console
      console.warn('[cloudSync] 로컬이 더 최신 — pull 생략·역푸시:', r.k);
      snaps[id] = localBlob[id];
      void cloudPushNow(r.k, localBlob[id]);
    } else {
      snaps[id] = r.v;
    }
  }

  // b) 구형 한-덩어리 행 — 보드별 행이 없는 보드만 보충(+즉시 보드별 행으로 이관)
  const legacy = (legacyRow?.v ?? null) as Record<string, unknown> | null;
  if (legacy && typeof legacy === 'object') {
    for (const [id, s] of Object.entries(legacy)) {
      if (snaps[id] !== undefined || removed[id] != null || !nonEmpty(s)) continue;
      snaps[id] = s;
      void cloudPushNow(SNAP_CLOUD_PREFIX + id, s);
    }
  }

  // c) 로컬 전용 보드(클라우드에 아직 없음) — 최초 이관
  for (const [id, s] of Object.entries(localBlob)) {
    if (snaps[id] !== undefined || removed[id] != null || !nonEmpty(s)) continue;
    snaps[id] = s;
    void cloudPushNow(SNAP_CLOUD_PREFIX + id, s);
  }

  // d) 스냅샷은 있는데 목록에 없는 보드 — 목록에 복구(과거 '목록 덮어쓰기'로 고아가 된 보드)
  const listed = new Set(merged.boards.map((b) => b.id));
  for (const [id, s] of Object.entries(snaps)) {
    if (listed.has(id)) continue;
    const nodes = (s as { nodes?: Record<string, unknown> } | null)?.nodes;
    if (!nodes || Object.keys(nodes).length === 0) continue; // 빈 보드까지 되살리진 않는다
    merged.boards.push({ id, title: '복구된 보드', kind: 'general' });
    listed.add(id);
  }

  // 로컬 반영(raw — 미러 안 탐) + 병합 결과가 클라우드와 다르면 역푸시
  await idbSetRaw(IDB_SNAPSHOTS_KEY, snaps);
  rawLocalSet(META_LS_KEY, JSON.stringify(merged));
  if (metaDiffers(merged, remoteMeta)) void cloudPushNow(META_CLOUD_KEY, merged);
}

/* ── 시작 동기화 본체 ─────────────────────────────────────────────────────── */

export async function initCloudSync(timeoutMs = 9000): Promise<void> {
  if (!isCloudEnabled()) return;
  const work = (async () => {
    const rows = await cloudList();
    const cloudHas = new Set(rows.map((r) => r.k));

    // 0) 보드(목록+스냅샷)는 병합 규칙으로 별도 처리
    try {
      await syncBoards(
        rows.find((r) => r.k === META_CLOUD_KEY),
        rows.filter((r) => r.k.startsWith(SNAP_CLOUD_PREFIX)),
        rows.find((r) => r.k === LEGACY_SNAPSHOTS_CLOUD_KEY),
      );
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[cloudSync] 보드 동기화 실패 — 로컬 상태로 계속', e);
    }

    // 1) 나머지 행: 클라우드 → 로컬 적용(신선도 가드: 로컬이 더 최신인 키는 덮지 않고 역푸시)
    for (const { k, v, updated_at } of rows) {
      if (k === META_CLOUD_KEY || k === LEGACY_SNAPSHOTS_CLOUD_KEY || k.startsWith(SNAP_CLOUD_PREFIX))
        continue; // 보드는 위(0)에서 처리
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
        if (k === META_LS_KEY) continue; // 보드 목록은 syncBoards가 병합·역푸시 완료
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
        if (k === IDB_SNAPSHOTS_KEY) continue; // 스냅샷은 보드별 행으로만 올린다(한-덩어리 행 갱신 중단)
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
