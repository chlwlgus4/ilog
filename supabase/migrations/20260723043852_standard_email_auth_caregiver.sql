-- Replace the legacy anonymous-session password RPCs with Supabase Auth email/password.
-- Existing caregiver rows are claimed only by a verified Auth user with the same email.

create or replace function public.complete_email_auth_caregiver(
    p_invite_code text default null,
    p_caregiver_name text default null,
    p_role text default null
)
returns table(caregiver_id bigint, family_id bigint, child_id bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user auth.users%rowtype;
    v_family public.families%rowtype;
    v_child public.children%rowtype;
    v_caregiver public.caregivers%rowtype;
    v_invitation public.family_invitations%rowtype;
    v_email text;
    v_name text;
    v_requested_role text;
    v_role text;
    v_invite_code text;
    v_invitation_id bigint;
begin
    if auth.uid() is null then
        raise exception 'Supabase auth session is required';
    end if;

    select *
    into v_user
    from auth.users
    where id = auth.uid()
    limit 1;

    if not found then
        raise exception 'Supabase auth user was not found';
    end if;

    if v_user.email_confirmed_at is null then
        raise exception 'Email confirmation is required';
    end if;

    if not exists (
        select 1
        from jsonb_array_elements_text(coalesce(v_user.raw_app_meta_data->'providers', '[]'::jsonb)) as provider(value)
        where provider.value = 'email'
    ) and coalesce(v_user.raw_app_meta_data->>'provider', '') <> 'email' then
        raise exception 'Email password auth session is required';
    end if;

    v_email := lower(trim(coalesce(v_user.email, '')));
    if v_email = '' then
        raise exception 'Caregiver email is required';
    end if;

    v_name := trim(coalesce(
        nullif(p_caregiver_name, ''),
        v_user.raw_user_meta_data->>'caregiver_name',
        ''
    ));
    v_requested_role := upper(trim(coalesce(
        nullif(p_role, ''),
        v_user.raw_user_meta_data->>'caregiver_role',
        'GUARDIAN'
    )));
    v_role := v_requested_role;
    v_invite_code := nullif(upper(trim(coalesce(
        p_invite_code,
        v_user.raw_user_meta_data->>'invite_code',
        ''
    ))), '');

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

    select *
    into v_caregiver
    from public.caregivers as caregiver
    where caregiver.auth_user_id = auth.uid()
       or lower(caregiver.email) = v_email
    order by
        case when caregiver.auth_user_id = auth.uid() then 0 else 1 end,
        caregiver.updated_at desc
    limit 1;

    if found then
        select *
        into v_family
        from public.families as family
        where family.id = v_caregiver.family_id
        limit 1;

        if not found then
            raise exception 'Caregiver family was not found';
        end if;

        if v_invite_code is not null and upper(v_family.invite_code) <> v_invite_code then
            raise exception 'Caregiver email already belongs to another family';
        end if;

        update public.caregivers
        set auth_user_id = null,
            updated_at = now()
        where auth_user_id = auth.uid()
          and id <> v_caregiver.id;

        update public.caregivers
        set auth_user_id = auth.uid(),
            email = v_email,
            password_hash = '',
            pin_hash = '',
            updated_at = now()
        where id = v_caregiver.id
        returning * into v_caregiver;
    else
        if v_invite_code is not null then
            select *
            into v_family
            from public.families as family
            where upper(family.invite_code) = v_invite_code
            limit 1;

            if not found then
                raise exception 'Family invite code was not found';
            end if;

            select *
            into v_invitation
            from public.family_invitations as invitation
            where invitation.family_id = v_family.id
              and lower(invitation.email) = v_email
              and invitation.status = 'PENDING'
            order by invitation.created_at desc
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

        insert into public.caregivers(
            family_id,
            auth_user_id,
            email,
            name,
            role,
            availability_score,
            fatigue_score,
            password_hash,
            pin_hash
        )
        values (
            v_family.id,
            auth.uid(),
            v_email,
            v_name,
            v_role,
            7,
            4,
            '',
            ''
        )
        returning * into v_caregiver;
    end if;

    if v_invitation_id is null then
        select invitation.id
        into v_invitation_id
        from public.family_invitations as invitation
        where invitation.family_id = v_family.id
          and lower(invitation.email) = v_email
          and invitation.status = 'PENDING'
        order by invitation.created_at desc
        limit 1;
    end if;

    if v_invitation_id is not null then
        update public.family_invitations
        set status = 'ACCEPTED',
            accepted_at = now()
        where id = v_invitation_id;
    end if;

    select *
    into v_child
    from public.children as child
    where child.family_id = v_family.id
    order by child.id asc
    limit 1;

    return query
    select v_caregiver.id, v_family.id, v_child.id;
end;
$$;

revoke all on function public.complete_email_auth_caregiver(text, text, text) from public, anon;
grant execute on function public.complete_email_auth_caregiver(text, text, text) to authenticated;

-- Older TestFlight builds still authenticate email/password against
-- caregiver.password_hash. Keep those RPC grants during the staged rollout so
-- installing the new build is not an all-at-once requirement. Revoke them in a
-- follow-up migration after the new Supabase Auth build has been adopted.

create or replace function public.update_caregiver_personal_info_checked(
    p_caregiver_id bigint,
    p_name text,
    p_role text,
    p_contact_phone text default null,
    p_current_password text default null,
    p_new_password text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_current public.caregivers%rowtype;
    v_name text := trim(coalesce(p_name, ''));
    v_role text := upper(trim(coalesce(p_role, '')));
    v_contact_phone text := nullif(trim(coalesce(p_contact_phone, '')), '');
begin
    if auth.uid() is null then
        raise exception 'Supabase auth session is required';
    end if;

    select *
    into v_current
    from public.caregivers
    where id = p_caregiver_id
      and auth_user_id = auth.uid()
    limit 1;

    if not found then
        raise exception 'Only your own profile can be updated';
    end if;

    if v_name = '' then
        raise exception 'Caregiver name is required';
    end if;

    if v_role not in ('MOM', 'DAD', 'GUARDIAN') then
        raise exception 'Invalid caregiver role';
    end if;

    if v_contact_phone is not null and v_contact_phone !~ '^[0-9+() -]{7,24}$' then
        raise exception 'Invalid contact phone';
    end if;

    if trim(coalesce(p_current_password, '')) <> ''
       or coalesce(p_new_password, '') <> '' then
        raise exception 'Password changes must use Supabase Auth';
    end if;

    update public.caregivers
    set name = v_name,
        role = v_role,
        contact_phone = v_contact_phone,
        updated_at = now()
    where id = v_current.id;

    return v_current.id;
end;
$$;

revoke all on function public.update_caregiver_personal_info_checked(bigint, text, text, text, text, text) from public, anon;
grant execute on function public.update_caregiver_personal_info_checked(bigint, text, text, text, text, text) to authenticated;
