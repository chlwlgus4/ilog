alter table public.family_invitations
    add column if not exists role text;

update public.family_invitations
set role = case
    when upper(trim(coalesce(role, ''))) in ('MOM', 'DAD', 'GUARDIAN') then upper(trim(role))
    when trim(coalesce(relationship, '')) = '엄마' then 'MOM'
    when trim(coalesce(relationship, '')) = '아빠' then 'DAD'
    else 'GUARDIAN'
end;

alter table public.family_invitations
    alter column role set default 'GUARDIAN',
    alter column role set not null;

alter table public.family_invitations
    drop constraint if exists family_invitations_role_check;

alter table public.family_invitations
    add constraint family_invitations_role_check
    check (role in ('MOM', 'DAD', 'GUARDIAN'));

drop function if exists public.create_family_invitation_checked(bigint, text, text, text, text);

create function public.create_family_invitation_checked(
    p_family_id bigint,
    p_email text,
    p_contact_phone text,
    p_role text,
    p_note text
)
returns public.family_invitations
language plpgsql
set search_path = public
as $$
declare
    v_current public.caregivers%rowtype;
    v_invitation public.family_invitations%rowtype;
    v_role text := upper(trim(coalesce(p_role, '')));
begin
    v_current := public.current_caregiver();

    if v_current.family_id <> p_family_id then
        raise exception 'Family access denied';
    end if;

    if trim(coalesce(p_email, '')) = '' then
        raise exception 'Invitation email is required';
    end if;

    if trim(coalesce(p_contact_phone, '')) = '' then
        raise exception 'Invitation contact phone is required';
    end if;

    if v_role not in ('MOM', 'DAD', 'GUARDIAN') then
        raise exception 'Invitation role is invalid';
    end if;

    insert into public.family_invitations(family_id, email, contact_phone, role, relationship, note, invited_by_id)
    values (
        p_family_id,
        lower(trim(p_email)),
        trim(p_contact_phone),
        v_role,
        case v_role
            when 'MOM' then '엄마'
            when 'DAD' then '아빠'
            else '보호자'
        end,
        nullif(trim(coalesce(p_note, '')), ''),
        v_current.id
    )
    returning * into v_invitation;

    return v_invitation;
end;
$$;

revoke all on function public.create_family_invitation_checked(bigint, text, text, text, text) from public, anon;
grant execute on function public.create_family_invitation_checked(bigint, text, text, text, text) to authenticated;

create or replace function public.register_caregiver(
    p_invite_code text default null,
    p_email text default '',
    p_caregiver_name text default '',
    p_role text default null,
    p_password text default ''
)
returns table(caregiver_id bigint, family_id bigint, child_id bigint)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_family public.families%rowtype;
    v_child public.children%rowtype;
    v_caregiver public.caregivers%rowtype;
    v_invitation public.family_invitations%rowtype;
    v_email text := lower(trim(coalesce(p_email, '')));
    v_name text := trim(coalesce(p_caregiver_name, ''));
    v_password text := coalesce(p_password, '');
    v_requested_role text := upper(trim(coalesce(p_role, 'GUARDIAN')));
    v_role text := upper(trim(coalesce(p_role, 'GUARDIAN')));
    v_invite_code text := nullif(upper(trim(coalesce(p_invite_code, ''))), '');
    v_invitation_id bigint;
begin
    if auth.uid() is null then
        raise exception 'Supabase auth session is required';
    end if;

    if v_email = '' then
        raise exception 'Caregiver email is required';
    end if;

    if v_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then
        raise exception 'Invalid caregiver email';
    end if;

    if length(v_password) < 8 or v_password !~ '[A-Za-z]' or v_password !~ '[0-9]' then
        raise exception 'Password must be at least 8 characters and include letters and numbers';
    end if;

    if v_requested_role not in ('MOM', 'DAD', 'GUARDIAN') then
        raise exception 'Invalid caregiver role';
    end if;

    if v_name = '' then
        v_name := case v_requested_role
            when 'MOM' then '엄마'
            when 'DAD' then '아빠'
            else '보호자'
        end;
    end if;

    if v_invite_code is not null then
        select * into v_family
        from public.families
        where upper(invite_code) = v_invite_code
        limit 1;

        if not found then
            raise exception 'Family invite code was not found';
        end if;

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

            if v_name = (
                case v_requested_role
                    when 'MOM' then '엄마'
                    when 'DAD' then '아빠'
                    else '보호자'
                end
            ) then
                v_name := case v_role
                    when 'MOM' then '엄마'
                    when 'DAD' then '아빠'
                    else '보호자'
                end;
            end if;
        end if;
    else
        insert into public.families(name, invite_code)
        values (v_name || ' 가족', public.next_family_invite_code())
        returning * into v_family;
    end if;

    select * into v_caregiver
    from public.caregivers
    where lower(email) = v_email
    limit 1;

    if found then
        if v_caregiver.family_id <> v_family.id then
            raise exception 'Caregiver email already belongs to another family';
        end if;

        if coalesce(v_caregiver.password_hash, '') <> ''
           and v_caregiver.password_hash <> extensions.crypt(v_password, v_caregiver.password_hash) then
            raise exception 'Invalid caregiver password';
        end if;

        update public.caregivers
        set auth_user_id = null,
            updated_at = now()
        where auth_user_id = auth.uid()
          and id <> v_caregiver.id;

        update public.caregivers
        set auth_user_id = auth.uid(),
            email = v_email,
            name = v_name,
            role = v_role,
            password_hash = case
                when coalesce(password_hash, '') = '' then extensions.crypt(v_password, extensions.gen_salt('bf'))
                else password_hash
            end,
            updated_at = now()
        where id = v_caregiver.id
        returning * into v_caregiver;
    else
        update public.caregivers
        set auth_user_id = null,
            updated_at = now()
        where auth_user_id = auth.uid();

        insert into public.caregivers(family_id, auth_user_id, email, name, role, availability_score, fatigue_score, password_hash)
        values (v_family.id, auth.uid(), v_email, v_name, v_role, 7, 4, extensions.crypt(v_password, extensions.gen_salt('bf')))
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
    where ch.family_id = v_family.id
    order by ch.id asc
    limit 1;

    return query select v_caregiver.id, v_family.id, v_child.id;
end;
$$;

revoke all on function public.register_caregiver(text, text, text, text, text) from public, anon;
grant execute on function public.register_caregiver(text, text, text, text, text) to authenticated;

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

revoke all on function public.complete_google_oauth_caregiver(text) from public, anon;
grant execute on function public.complete_google_oauth_caregiver(text) to authenticated;
