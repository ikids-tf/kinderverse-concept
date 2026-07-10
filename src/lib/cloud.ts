/**
 * 클라우드 미러 — 각 스토어의 'JSON 한 덩어리'를 Supabase `kv_store` 한 행(k, v jsonb)으로 동기화.
 *
 * 모델: 공유 1개 공간 · last-write-wins.
 *  - cloudPush(key, value): 변경 시(디바운스) → 이미지 외부화 → upsert.
 *  - cloudPull(key): 시작 시 → 클라우드 값이 있으면 그게 '공유 진실' → 로컬에 적용.
 *  - flushPendingPushes(): pagehide·백그라운드 진입 시 디바운스 대기분을 즉시 밀어낸다
 *    (1.5s 창 안에서 리로드하면 마지막 쓰기가 클라우드에 못 가던 구멍의 1차 방어).
 *  - 신선도 가드: 로컬 마지막 쓰기 시각을 기기-로컬 맵에 남겨, 시작 pull이 그보다 오래된
 *    클라우드 스냅샷으로 로컬 최신 쓰기를 롤백하지 않게 한다(cloudSync가 isLocalNewerThan 사용).
 * 클라우드 비활성(자격증명 없음)이면 전부 no-op → 앱은 기존 로컬 전용으로 동작.
 */
import { supabase, isCloudEnabled, KV_TABLE } from './supabase';
import { externalizeAssets } from './cloudAssets';

/* ── 신선도 가드: 로컬 마지막 쓰기 시각 맵 ─────────────────────────────────────
   '리로드 시 라이브러리가 옛 스냅샷으로 롤백'되는 원인은 (디바운스 미플러시) + (pull의 무조건
   클라우드 우선)의 결합 — 여기서 쓰기 시각을 남겨 pull 쪽에서 비교한다. 이 맵은 기기-로컬
   개념이라 미러하면 안 됨: 'kv:' 접두사를 일부러 피해 cloudMirror 대상에서 자연히 빠진다. */
const LAST_WRITE_KEY = 'cloud:last-local-write:v1';
/** 이보다 오래된 항목은 로드 시 정리 — 맵 무한 성장 방지(한 달 넘은 오프라인 롤백까지는 범위 밖). */
const LAST_WRITE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

let lastWrites: Record<string, number> | null = null;

function loadLastWrites(): Record<string, number> {
  try {
    const m = JSON.parse(localStorage.getItem(LAST_WRITE_KEY) ?? '{}') as Record<string, number>;
    const cutoff = Date.now() - LAST_WRITE_TTL_MS;
    for (const k of Object.keys(m)) if (typeof m[k] !== 'number' || m[k] < cutoff) delete m[k];
    return m;
  } catch {
    return {};
  }
}

function saveLastWrites(m: Record<string, number>): void {
  try {
    // 'kv:' 접두사가 아니라 cloudMirror의 setItem 패치를 타도 미러되지 않는다(루프 없음).
    localStorage.setItem(LAST_WRITE_KEY, JSON.stringify(m));
  } catch {
    /* quota — 가드는 best-effort */
  }
}

/** 로컬 쓰기 발생을 기록(즉시 영속 — 디바운스 창에서 리로드해도 다음 시작이 알 수 있게). */
function markLocalWrite(key: string): void {
  const m = (lastWrites ??= loadLastWrites());
  m[key] = Date.now();
  saveLastWrites(m);
}

/**
 * 클라우드 행(updated_at)보다 로컬 마지막 쓰기가 더 최신인가 — 시작 pull의 롤백 방지 판정.
 * updated_at을 못 읽으면 false(기존 '클라우드 우선' 동작 유지). 같은 기기의 자기-레이스가
 * 주 대상이라 시계는 동일 — 기기 간 미세한 시계 오차는 LWW 모델의 원래 한계로 둔다.
 */
export function isLocalNewerThan(key: string, cloudUpdatedAt: string | undefined): boolean {
  const cloudTime = cloudUpdatedAt ? Date.parse(cloudUpdatedAt) : NaN;
  if (!Number.isFinite(cloudTime)) return false;
  const local = (lastWrites ??= loadLastWrites())[key];
  return typeof local === 'number' && local > cloudTime;
}

/** 클라우드의 모든 행(k, v, updated_at)을 읽는다 — 시작 동기화에서 한 번에 받는다(이미지는 URL이라 가벼움). */
export async function cloudList(): Promise<Array<{ k: string; v: unknown; updated_at?: string }>> {
  if (!isCloudEnabled() || !supabase) return [];
  try {
    // updated_at은 신선도 가드용. 컬럼이 없는 구스키마 배포면 k,v만으로 재시도(가드 없이 기존 동작).
    const withTime = await supabase.from(KV_TABLE).select('k, v, updated_at');
    const res: { data: unknown; error: unknown } = withTime.error
      ? await supabase.from(KV_TABLE).select('k, v')
      : withTime;
    if (res.error || !res.data) return [];
    return res.data as Array<{ k: string; v: unknown; updated_at?: string }>;
  } catch {
    return [];
  }
}

/** 클라우드에서 key의 값을 읽는다(없거나 비활성이면 null). */
export async function cloudPull<T = unknown>(key: string): Promise<T | null> {
  if (!isCloudEnabled() || !supabase) return null;
  try {
    const { data, error } = await supabase.from(KV_TABLE).select('v').eq('k', key).maybeSingle();
    if (error || !data) return null;
    return (data as { v: T }).v;
  } catch {
    return null;
  }
}

/* ── 변경 알림(Realtime 브로드캐스트용) ─────────────────────────────────────
   push/delete가 클라우드에 반영된 '후' 리스너에게 알린다. cloudRealtime이 구독해
   다른 탭/기기에 "이 키 바뀜"을 방송한다. 리스너 없으면 no-op(순환 import 회피용 콜백 등록). */
export interface CloudMutation {
  k: string;
  /** 행에 기록된 updated_at — 수신측 신선도 판정용. */
  at?: string;
  deleted?: boolean;
}
let mutationListener: ((m: CloudMutation) => void) | null = null;
export function onCloudMutation(cb: (m: CloudMutation) => void): void {
  mutationListener = cb;
}

/** 즉시 push(이미지 외부화 후 upsert). 실패는 콘솔 경고만(앱 흐름 방해 안 함). */
export async function cloudPushNow(key: string, value: unknown): Promise<void> {
  if (!isCloudEnabled() || !supabase) return;
  try {
    const externalized = await externalizeAssets(value);
    const at = new Date().toISOString();
    const { error } = await supabase
      .from(KV_TABLE)
      .upsert({ k: key, v: externalized as unknown, updated_at: at });
    if (error) {
      // eslint-disable-next-line no-console
      console.warn('[cloud] push 실패', key, error.message);
    } else {
      mutationListener?.({ k: key, at });
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[cloud] push 오류', key, e);
  }
}

/** 클라우드 행 삭제(보드 삭제 시 per-board 스냅샷 행 정리). 실패는 경고만. */
export async function cloudDeleteNow(key: string): Promise<void> {
  if (!isCloudEnabled() || !supabase) return;
  try {
    const { error } = await supabase.from(KV_TABLE).delete().eq('k', key);
    if (error) {
      // eslint-disable-next-line no-console
      console.warn('[cloud] delete 실패', key, error.message);
    } else {
      markLocalWrite(key); // 삭제도 로컬 쓰기 — 옛 클라우드 스냅으로의 부활 방지
      mutationListener?.({ k: key, at: new Date().toISOString(), deleted: true });
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[cloud] delete 오류', key, e);
  }
}

/** 디바운스 대기 중인 push — 값을 함께 들고 있어 flushPendingPushes가 즉시 밀어낼 수 있다. */
const pending = new Map<string, { value: unknown; timer: ReturnType<typeof setTimeout> }>();

/** 디바운스 push — 로컬 저장 직후 호출(로컬이 1차, 클라우드는 미러). */
export function cloudPush(key: string, value: unknown, debounceMs = 1500): void {
  if (!isCloudEnabled()) return;
  // 디바운스·push 성패와 무관하게 '이 시각에 로컬이 새로 썼다'는 사실부터 기록(신선도 가드 근거).
  markLocalWrite(key);
  const prev = pending.get(key);
  if (prev) clearTimeout(prev.timer);
  const timer = setTimeout(() => {
    pending.delete(key);
    void cloudPushNow(key, value);
  }, debounceMs);
  pending.set(key, { value, timer });
}

/**
 * 언로드 직전용 push — keepalive fetch(PostgREST upsert 직행)라 페이지가 닫혀도 브라우저가
 * 요청을 마저 보낸다. 이미지 외부화는 생략(시간 없음): keepalive 본문 한도(~64KB)를 넘는
 * 큰 값은 일반 경로로 폴백한다(페이지가 살아 있으면 — 탭 전환 flush — 거기서 마저 처리).
 */
async function pushKeepalive(key: string, value: unknown): Promise<void> {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !anon) return;
  try {
    const body = JSON.stringify({ k: key, v: value, updated_at: new Date().toISOString() });
    if (body.length > 60_000) throw new Error('keepalive 한도 초과');
    const res = await fetch(`${url}/rest/v1/${KV_TABLE}?on_conflict=k`, {
      method: 'POST',
      keepalive: true,
      headers: {
        apikey: anon,
        Authorization: `Bearer ${anon}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch {
    void cloudPushNow(key, value); // best-effort — 언로드 중이면 미보장이나 현재의 0%보단 낫다
  }
}

/** 디바운스 대기분을 지금 전부 밀어낸다 — pagehide·visibilitychange(hidden)에서 호출. */
export function flushPendingPushes(): void {
  if (pending.size === 0) return;
  for (const [key, p] of [...pending]) {
    clearTimeout(p.timer);
    pending.delete(key);
    void pushKeepalive(key, p.value);
  }
}

// 언로드/백그라운드 진입에서 대기분 즉시 플러시 — 모듈 로드 시 1회 등록(중복 flush는 무해:
// pending에서 지우고 보내므로 두 이벤트가 연달아 와도 두 번 안 보낸다).
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('pagehide', () => flushPendingPushes());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushPendingPushes();
  });
}
