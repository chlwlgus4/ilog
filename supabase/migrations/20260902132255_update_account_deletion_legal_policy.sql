-- Align the consent contract with the stricter individual-account deletion
-- policy. Keep the immediately previous pair available so installed binaries
-- remain usable while the 2026-09-02 app version rolls out. New binaries send
-- only the new pair and therefore require a fresh acknowledgement.

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

    if (p_terms_version, p_privacy_version) not in (
        ('2026-07-26', '2026-07-30'),
        ('2026-09-02', '2026-09-02')
    ) then
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

    if (p_terms_version, p_privacy_version) not in (
        ('2026-07-26', '2026-07-30'),
        ('2026-09-02', '2026-09-02')
    ) then
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

revoke all on function public.record_current_caregiver_legal_consents(text, text)
    from public, anon, authenticated;
revoke all on function public.has_current_caregiver_legal_consents(text, text)
    from public, anon;
grant execute on function public.has_current_caregiver_legal_consents(text, text)
    to authenticated;
