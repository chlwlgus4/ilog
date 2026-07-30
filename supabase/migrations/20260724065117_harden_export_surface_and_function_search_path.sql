-- The export feature is intentionally not part of the first release.
-- Prevent direct Data API and RPC access until a complete export workflow exists.
alter function public.touch_updated_at() set search_path = pg_catalog, public;

revoke all on function public.request_data_export_checked(bigint, text, jsonb) from anon, authenticated;
revoke all on table public.export_jobs from anon, authenticated;
drop policy if exists export_jobs_select_member on public.export_jobs;
drop policy if exists export_jobs_insert_member on public.export_jobs;
