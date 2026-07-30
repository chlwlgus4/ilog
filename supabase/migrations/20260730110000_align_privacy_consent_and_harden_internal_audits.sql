-- Keep the database consent contract aligned with mobile/src/legalDocuments.ts.
-- Client roles must not read or write internal audit records directly.

create or replace function public.record_current_caregiver_legal_consents(
    p_terms_version text,
    p_privacy_version text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_caregiver_id bigint;
begin
    if auth.uid() is null then
        raise exception 'Supabase auth session is required';
    end if;

    if p_terms_version <> '2026-07-26' or p_privacy_version <> '2026-07-30' then
        raise exception 'Required legal document versions were not accepted';
    end if;

    select caregiver.id
    into v_caregiver_id
    from public.caregivers as caregiver
    where caregiver.auth_user_id = auth.uid()
    order by caregiver.updated_at desc
    limit 1;

    if v_caregiver_id is null then
        raise exception 'Current caregiver was not found';
    end if;

    insert into public.caregiver_legal_consents(
        caregiver_id,
        auth_user_id,
        document_type,
        document_version
    )
    values
        (v_caregiver_id, auth.uid(), 'TERMS', p_terms_version),
        (v_caregiver_id, auth.uid(), 'PRIVACY', p_privacy_version)
    on conflict (caregiver_id, document_type, document_version) do nothing;
end;
$$;

create or replace function public.has_current_caregiver_legal_consents(
    p_terms_version text,
    p_privacy_version text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_caregiver_id bigint;
begin
    if auth.uid() is null then
        raise exception 'Supabase auth session is required';
    end if;

    if p_terms_version <> '2026-07-26' or p_privacy_version <> '2026-07-30' then
        raise exception 'Required legal document versions were not accepted';
    end if;

    select caregiver.id
    into v_caregiver_id
    from public.caregivers as caregiver
    where caregiver.auth_user_id = auth.uid()
    order by caregiver.updated_at desc
    limit 1;

    return v_caregiver_id is not null
        and exists (
            select 1
            from public.caregiver_legal_consents as consent
            where consent.caregiver_id = v_caregiver_id
              and consent.document_type = 'TERMS'
              and consent.document_version = p_terms_version
        )
        and exists (
            select 1
            from public.caregiver_legal_consents as consent
            where consent.caregiver_id = v_caregiver_id
              and consent.document_type = 'PRIVACY'
              and consent.document_version = p_privacy_version
        );
end;
$$;

revoke all on function public.record_current_caregiver_legal_consents(text, text) from public, anon, authenticated;
revoke all on function public.has_current_caregiver_legal_consents(text, text) from public, anon;
grant execute on function public.has_current_caregiver_legal_consents(text, text) to authenticated;
revoke all on function public.accept_current_caregiver_legal_consents(text, text) from public, anon;
grant execute on function public.accept_current_caregiver_legal_consents(text, text) to authenticated;

alter table public.account_deletion_audit enable row level security;
revoke all on table public.account_deletion_audit from public, anon, authenticated;
drop policy if exists account_deletion_audit_no_direct_client_access on public.account_deletion_audit;
create policy account_deletion_audit_no_direct_client_access
on public.account_deletion_audit
as permissive
for all
to public
using (false)
with check (false);

alter table public.caregiver_legal_consents enable row level security;
revoke all on table public.caregiver_legal_consents from public, anon, authenticated;
drop policy if exists caregiver_legal_consents_no_direct_client_access on public.caregiver_legal_consents;
create policy caregiver_legal_consents_no_direct_client_access
on public.caregiver_legal_consents
as permissive
for all
to public
using (false)
with check (false);

alter table public.export_jobs enable row level security;
revoke all on table public.export_jobs from public, anon, authenticated;
drop policy if exists export_jobs_no_direct_client_access on public.export_jobs;
create policy export_jobs_no_direct_client_access
on public.export_jobs
as permissive
for all
to public
using (false)
with check (false);
