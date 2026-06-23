/**
 * Supabase 클라이언트 — 클라우드 동기화의 단일 진입점.
 *
 * 환경변수(.env)로 켜진다: VITE_SUPABASE_URL · VITE_SUPABASE_ANON_KEY.
 * 둘 다 없으면 client = null → isCloudEnabled() = false → 앱은 기존처럼 '로컬 전용'으로
 * 그대로 동작한다(연동 코드는 전부 no-op). 자격증명을 .env에 넣으면 그때부터 클라우드 미러가 켜진다.
 *
 * 모델: '공유 1개 공간 · 로그인 없음'(사용자 선택). anon 키로 읽기/쓰기 — 같은 URL을 쓰는 모든
 * 기기가 하나의 동일 데이터를 본다. service_role 키는 절대 프론트에 넣지 않는다(anon만).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

let client: SupabaseClient | null = null;
if (URL && ANON) {
  try {
    // 공유 공간이라 세션 영속/자동 리프레시 불필요(anon 고정 키).
    client = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[supabase] init 실패 — 로컬 전용으로 계속', e);
  }
}

/** 설정된 Supabase 클라이언트(없으면 null). */
export const supabase = client;

/** 클라우드 동기화가 켜져 있나(자격증명이 있나). */
export function isCloudEnabled(): boolean {
  return client !== null;
}

/** 공유 키-값 미러 테이블 · 생성 이미지 버킷 이름(schema.sql과 일치). */
export const KV_TABLE = 'kv_store';
export const ASSET_BUCKET = 'kv-assets';
