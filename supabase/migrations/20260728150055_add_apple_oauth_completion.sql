-- Keep OAuth account completion aligned across the supported native providers.
-- The legacy Google-only functions remain in place for already released apps.
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

    if p_terms_version <> '2026-07-26' or p_privacy_version <> '2026-07-28' then
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

    if p_terms_version <> '2026-07-26' or p_privacy_version <> '2026-07-28' then
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

create or replace function public.complete_oauth_caregiver(
    p_invite_code text default null
)
returns table(caregiver_id bigint, family_id bigint, child_id bigint)
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
    v_user auth.users%rowtype;
    v_family public.families%rowtype;
    v_child public.children%rowtype;
    v_caregiver public.caregivers%rowtype;
    v_invitation public.family_invitations%rowtype;
    v_provider text;
    v_email text;
    v_name text;
    v_role text := 'GUARDIAN';
    v_invite_code text := nullif(upper(trim(coalesce(p_invite_code, ''))), '');
    v_invitation_id bigint;
begin
    if auth.uid() is null then
        raise exception 'Supabase auth session is required';
    end if;

    select * into v_user
    from auth.users
    where id = auth.uid()
    limit 1;

    if not found then
        raise exception 'Supabase auth user was not found';
    end if;

    if not exists (
        select 1
        from jsonb_array_elements_text(coalesce(v_user.raw_app_meta_data->'providers', '[]'::jsonb)) as provider(value)
        where provider.value in ('google', 'apple')
    ) then
        v_provider := coalesce(v_user.raw_app_meta_data->>'provider', '');
        if v_provider not in ('google', 'apple') then
            raise exception 'Supported OAuth session is required';
        end if;
    end if;

    v_email := lower(trim(coalesce(v_user.email, '')));

    if v_email = '' then
        raise exception 'Caregiver email is required';
    end if;

    if v_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then
        raise exception 'Invalid caregiver email';
    end if;

    v_name := trim(coalesce(
        v_user.raw_user_meta_data->>'full_name',
        v_user.raw_user_meta_data->>'name',
        split_part(v_email, '@', 1),
        ''
    ));

    if v_name = '' then
        v_name := split_part(v_email, '@', 1);
    end if;

    select * into v_caregiver
    from public.caregivers
    where auth_user_id = auth.uid()
       or lower(email) = v_email
    order by case when auth_user_id = auth.uid() then 0 else 1 end, updated_at desc
    limit 1;

    if found then
        if v_invite_code is not null then
            select * into v_family
            from public.families
            where upper(invite_code) = v_invite_code
            limit 1;

            if not found then
                raise exception 'Family invite code was not found';
            end if;

            if v_caregiver.family_id <> v_family.id then
                raise exception 'Caregiver email already belongs to another family';
            end if;
        else
            select * into v_family
            from public.families
            where id = v_caregiver.family_id
            limit 1;
        end if;
    else
        if v_invite_code is not null then
            select * into v_family
            from public.families
            where upper(invite_code) = v_invite_code
            limit 1;

            if not found then
                raise exception 'Family invite code was not found';
            end if;
        else
            insert into public.families(name, invite_code)
            values (v_name || ' 가족', public.next_family_invite_code())
            returning * into v_family;
        end if;
    end if;

    if v_invite_code is not null then
        select * into v_invitation
        from public.family_invitations
        where family_id = v_family.id
          and lower(email) = v_email
          and status = 'PENDING'
        order by created_at desc
        limit 1;

        if found then
            v_invitation_id := v_invitation.id;
            v_role := v_invitation.role;
        end if;
    end if;

    if v_caregiver.id is not null then
        update public.caregivers
        set auth_user_id = null,
            updated_at = now()
        where auth_user_id = auth.uid()
          and id <> v_caregiver.id;

        update public.caregivers
        set auth_user_id = auth.uid(),
            email = v_email,
            name = case when trim(coalesce(name, '')) = '' then v_name else name end,
            role = case when v_invitation_id is null then role else v_role end,
            updated_at = now()
        where id = v_caregiver.id
        returning * into v_caregiver;
    else
        update public.caregivers
        set auth_user_id = null,
            updated_at = now()
        where auth_user_id = auth.uid();

        insert into public.caregivers(family_id, auth_user_id, email, name, role, availability_score, fatigue_score, password_hash)
        values (v_family.id, auth.uid(), v_email, v_name, v_role, 7, 4, '')
        returning * into v_caregiver;
    end if;

    if v_invitation_id is not null then
        update public.family_invitations
        set status = 'ACCEPTED',
            accepted_at = now()
        where id = v_invitation_id;
    end if;

    select ch.* into v_child
    from public.children as ch
    where ch.family_id = v_caregiver.family_id
    order by ch.id asc
    limit 1;

    return query select v_caregiver.id, v_caregiver.family_id, v_child.id;
end;
$$;

create or replace function public.complete_oauth_caregiver_with_consent(
    p_invite_code text default null,
    p_terms_version text default null,
    p_privacy_version text default null
)
returns table(caregiver_id bigint, family_id bigint, child_id bigint)
language plpgsql
security definer
set search_path = ''
as $$
begin
    if auth.uid() is null then
        raise exception 'Supabase auth session is required';
    end if;

    return query
    select *
    from public.complete_oauth_caregiver(p_invite_code);

    if p_terms_version is not null or p_privacy_version is not null then
        perform public.record_current_caregiver_legal_consents(
            p_terms_version,
            p_privacy_version
        );
    end if;
end;
$$;

revoke all on function public.complete_oauth_caregiver(text) from public, anon;
revoke all on function public.complete_oauth_caregiver_with_consent(text, text, text) from public, anon;

grant execute on function public.complete_oauth_caregiver(text) to authenticated;
grant execute on function public.complete_oauth_caregiver_with_consent(text, text, text) to authenticated;
