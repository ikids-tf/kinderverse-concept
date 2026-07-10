/**
 * Realtime 브로드캐스트 동기화 — 열린 탭도 다른 기기/탭의 변경을 즉시 받는다.
 * "옛 상태를 든 탭이 남의 최신 작업을 덮는" 문제의 근본 대책: 탭이 항상 최신을 들고 있으면
 * 옛 상태를 push할 일 자체가 없다.
 *
 * postgres_changes(테이블 퍼블리케이션 DDL 필요) 대신 **broadcast 채널**을 쓴다 — DB 스키마
 * 변경 없이 동작. 송신: cloudPushNow/cloudDeleteNow 성공 직후 {k, at, deleted} 방송(cloud.ts의
 * onCloudMutation 훅). 수신: 그 키 하나만 kv_store에서 pull해 로컬 반영.
 *  - 보드 목록/스냅샷: persist.ts의 applyRemote*로 스토어까지 라이브 반영(활성 보드의 편집
 *    중 화면은 건드리지 않음).
 *  - 그 외 키(폴더·슬라이드·수업기록…): 저장소(raw)에만 반영 — 로드된 스토어는 다음
 *    새로고침에 최신을 본다(모듈-로드 하이드레이션 구조라 라이브 주입은 범위 밖).
 * 방송을 놓친 경우(끊김 등)의 최종 방어선은 시작 동기화(cloudSync)다.
 */
import { supabase, isCloudEnabled } from './supabase';
import { cloudPull, onCloudMutation, isLocalNewerThan, type CloudMutation } from './cloud';
import { rawLocalSet, isMirroredKey } from './cloudMirror';
import { idbSetRaw } from '@/board/idb';
import {
  META_CLOUD_KEY,
  SNAP_CLOUD_PREFIX,
  LEGACY_SNAPSHOTS_CLOUD_KEY,
  type BoardsMetaShape,
} from '@/board/boardsMeta';
import {
  applyRemoteBoardsMeta,
  applyRemoteSnapshot,
  applyRemoteSnapshotDelete,
} from '@/board/persist';
import type { BoardSnapshot } from '@/store/boardStore';

/** 이 탭의 식별자 — 자기 방송의 되돌림(에코) 차단용(self:false와 이중 안전). */
const clientId = Math.random().toString(36).slice(2) + Date.now().toString(36);

interface KvEvent extends CloudMutation {
  from?: string;
}

async function handleRemote(p: KvEvent): Promise<void> {
  const k = p?.k;
  if (!k || p.from === clientId) return;
  try {
    // 보드 목록 — 병합 적용(덮어쓰기 아님)
    if (k === META_CLOUD_KEY) {
      const v = await cloudPull<BoardsMetaShape>(k);
      if (v && Array.isArray(v.boards)) applyRemoteBoardsMeta(v, p.at);
      return;
    }
    // 보드 스냅샷(보드별 행)
    if (k.startsWith(SNAP_CLOUD_PREFIX)) {
      const id = k.slice(SNAP_CLOUD_PREFIX.length);
      if (p.deleted) {
        applyRemoteSnapshotDelete(id);
        return;
      }
      if (isLocalNewerThan(k, p.at)) return; // 이 탭이 방금 쓴 게 더 최신 — 뒤늦은 방송 무시
      const v = await cloudPull<BoardSnapshot>(k);
      if (v) applyRemoteSnapshot(id, v);
      return;
    }
    // 구버전 탭의 한-덩어리 방송(현 버전은 안 보냄) — 보드별 행이 진실이므로 무시
    if (k === LEGACY_SNAPSHOTS_CLOUD_KEY) return;

    // 그 외 자료: 저장소에만 반영(다음 새로고침이 최신을 읽는다)
    if (k.startsWith('ls:')) {
      const lsKey = k.slice(3);
      if (!isMirroredKey(lsKey) || isLocalNewerThan(k, p.at)) return;
      const v = await cloudPull(k);
      if (v != null) rawLocalSet(lsKey, typeof v === 'string' ? v : JSON.stringify(v));
    } else if (k.startsWith('idb:')) {
      if (isLocalNewerThan(k, p.at)) return;
      const v = await cloudPull(k);
      if (v != null) await idbSetRaw(k.slice(4), v);
    }
  } catch {
    /* 수신 반영 실패는 조용히 — 다음 시작 동기화가 맞춘다 */
  }
}

/** 앱 시작 시 1회(initBoardPersistence 이후) — 채널 구독 + push 성공 방송 연결. */
export function initCloudRealtime(): void {
  if (!isCloudEnabled() || !supabase) return;
  const channel = supabase.channel('kv-sync', { config: { broadcast: { self: false } } });
  channel.on('broadcast', { event: 'kv' }, ({ payload }) => {
    void handleRemote(payload as KvEvent);
  });
  channel.subscribe();
  onCloudMutation((m) => {
    void channel.send({ type: 'broadcast', event: 'kv', payload: { ...m, from: clientId } });
  });
}
