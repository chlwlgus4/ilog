create or replace function public.complete_google_oauth_caregiver(
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
    v_provider text;
    v_email text;
    v_name text;
    v_invite_code text := nullif(upper(trim(coalesce(p_invite_code, ''))), '');
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
        where provider.value = 'google'
    ) then
        v_provider := coalesce(v_user.raw_app_meta_data->>'provider', '');
        if v_provider <> 'google' then
            raise exception 'Google OAuth session is required';
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

        update public.caregivers
        set auth_user_id = null,
            updated_at = now()
        where auth_user_id = auth.uid()
          and id <> v_caregiver.id;

        update public.caregivers
        set auth_user_id = auth.uid(),
            email = v_email,
            name = case when trim(coalesce(name, '')) = '' then v_name else name end,
            updated_at = now()
        where id = v_caregiver.id
        returning * into v_caregiver;
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

        update public.caregivers
        set auth_user_id = null,
            updated_at = now()
        where auth_user_id = auth.uid();

        insert into public.caregivers(family_id, auth_user_id, email, name, role, availability_score, fatigue_score, password_hash)
        values (v_family.id, auth.uid(), v_email, v_name, 'GUARDIAN', 7, 4, '')
        returning * into v_caregiver;
    end if;

    select ch.* into v_child
    from public.children as ch
    where ch.family_id = v_caregiver.family_id
    order by ch.id asc
    limit 1;

    return query select v_caregiver.id, v_caregiver.family_id, v_child.id;
end;
$$;

revoke all on function public.complete_google_oauth_caregiver(text) from public, anon;
grant execute on function public.complete_google_oauth_caregiver(text) to authenticated;
