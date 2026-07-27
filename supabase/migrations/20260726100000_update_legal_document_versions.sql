-- Keep this version gate in sync with mobile/src/legalDocuments.ts.
-- The app prompts existing caregivers to review and accept this document version.
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

    if p_terms_version <> '2026-07-26' or p_privacy_version <> '2026-07-26' then
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

revoke all on function public.has_current_caregiver_legal_consents(text, text) from public, anon;
grant execute on function public.has_current_caregiver_legal_consents(text, text) to authenticated;
