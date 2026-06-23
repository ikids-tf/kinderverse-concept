-- KinderVerse — 클라우드 동기화 스키마 (공유 1개 공간 · 로그인 없음)
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 한 번 실행하세요.
-- ⚠️ 이 설정은 anon(공개) 키로 읽기/쓰기를 허용합니다. URL을 아는 누구나 보고 수정 가능 —
--    데모/개인용으로 의도된 모델입니다. 나중에 로그인(테넌트 격리)을 붙이면 정책을 조입니다.

-- 1) 공유 키-값 미러 테이블 ------------------------------------------------------
create table if not exists public.kv_store (
  k          text primary key,
  v          jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.kv_store enable row level security;

-- anon(로그인 없는 공개 키) 전체 허용 — 공유 공간.
drop policy if exists "kv_anon_all" on public.kv_store;
create policy "kv_anon_all" on public.kv_store
  for all to anon
  using (true) with check (true);

-- 2) 생성 이미지 버킷 (공개 읽기) -----------------------------------------------
insert into storage.buckets (id, name, public)
values ('kv-assets', 'kv-assets', true)
on conflict (id) do update set public = true;

drop policy if exists "kv_assets_read" on storage.objects;
create policy "kv_assets_read" on storage.objects
  for select to anon
  using (bucket_id = 'kv-assets');

drop policy if exists "kv_assets_write" on storage.objects;
create policy "kv_assets_write" on storage.objects
  for insert to anon
  with check (bucket_id = 'kv-assets');

-- 같은 파일명(콘텐츠 해시) 재업로드(upsert) 허용.
drop policy if exists "kv_assets_update" on storage.objects;
create policy "kv_assets_update" on storage.objects
  for update to anon
  using (bucket_id = 'kv-assets') with check (bucket_id = 'kv-assets');
