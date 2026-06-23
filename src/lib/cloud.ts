/**
 * 클라우드 미러 — 각 스토어의 'JSON 한 덩어리'를 Supabase `kv_store` 한 행(k, v jsonb)으로 동기화.
 *
 * 모델: 공유 1개 공간 · last-write-wins.
 *  - cloudPush(key, value): 변경 시(디바운스) → 이미지 외부화 → upsert.
 *  - cloudPull(key): 시작 시 → 클라우드 값이 있으면 그게 '공유 진실' → 로컬에 적용.
 * 클라우드 비활성(자격증명 없음)이면 전부 no-op → 앱은 기존 로컬 전용으로 동작.
 */
import { supabase, isCloudEnabled, KV_TABLE } from './supabase';
import { externalizeAssets } from './cloudAssets';

/** 클라우드의 모든 행(k, v)을 읽는다 — 시작 동기화에서 한 번에 받는다(이미지는 URL이라 가벼움). */
export async function cloudList(): Promise<Array<{ k: string; v: unknown }>> {
  if (!isCloudEnabled() || !supabase) return [];
  try {
    const { data, error } = await supabase.from(KV_TABLE).select('k, v');
    if (error || !data) return [];
    return data as Array<{ k: string; v: unknown }>;
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

/** 즉시 push(이미지 외부화 후 upsert). 실패는 콘솔 경고만(앱 흐름 방해 안 함). */
export async function cloudPushNow(key: string, value: unknown): Promise<void> {
  if (!isCloudEnabled() || !supabase) return;
  try {
    const externalized = await externalizeAssets(value);
    const { error } = await supabase
      .from(KV_TABLE)
      .upsert({ k: key, v: externalized as unknown, updated_at: new Date().toISOString() });
    if (error) {
      // eslint-disable-next-line no-console
      console.warn('[cloud] push 실패', key, error.message);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[cloud] push 오류', key, e);
  }
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();

/** 디바운스 push — 로컬 저장 직후 호출(로컬이 1차, 클라우드는 미러). */
export function cloudPush(key: string, value: unknown, debounceMs = 1500): void {
  if (!isCloudEnabled()) return;
  const t = timers.get(key);
  if (t) clearTimeout(t);
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key);
      void cloudPushNow(key, value);
    }, debounceMs),
  );
}
