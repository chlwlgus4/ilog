-- Restrict family writes to the one family setting currently edited by clients.
-- Ownership, deletion lifecycle, invite codes, and subscription state remain
-- writable only through privileged database paths.
revoke update on table public.families from authenticated;

grant update (morning_briefing_enabled)
on table public.families
to authenticated;

-- Preserve the existing ownership rule for families created before the owner
-- column existed. Families without a caregiver intentionally remain ownerless.
with first_caregivers as (
    select distinct on (caregiver.family_id)
        caregiver.family_id,
        caregiver.id
    from public.caregivers as caregiver
    order by caregiver.family_id, caregiver.id
)
update public.families as family
set owner_caregiver_id = first_caregiver.id
from first_caregivers as first_caregiver
where family.id = first_caregiver.family_id
  and family.owner_caregiver_id is null;

-- A newly created family has no caregiver to own it yet. Assign ownership after
-- the first caregiver insert, while never replacing an owner selected by another
-- concurrent insert or by an explicit privileged lifecycle operation.
create or replace function public.assign_first_family_owner_after_caregiver_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    update public.families as family
    set owner_caregiver_id = (
        select caregiver.id
        from public.caregivers as caregiver
        where caregiver.family_id = new.family_id
        order by caregiver.id
        limit 1
    )
    where family.id = new.family_id
      and family.owner_caregiver_id is null;

    return new;
end;
$$;

revoke all on function public.assign_first_family_owner_after_caregiver_insert()
from public, anon, authenticated;

drop trigger if exists caregivers_assign_first_family_owner on public.caregivers;
create trigger caregivers_assign_first_family_owner
after insert on public.caregivers
for each row
execute function public.assign_first_family_owner_after_caregiver_insert();

-- Keep the OAuth completion contract used by the consent wrapper, but remove
-- output-column ambiguity and make the SECURITY DEFINER search path explicit.
create or replace function public.complete_oauth_caregiver(
    p_invite_code text default null
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
    v_provider text;
    v_email text;
    v_name text;
    v_requested_role text;
    v_role text;
    v_invite_code text := nullif(upper(trim(coalesce(p_invite_code, ''))), '');
    v_invitation_id bigint;
begin
    if auth.uid() is null then
        raise exception 'Supabase auth session is required';
    end if;

    select auth_user.*
    into v_user
    from auth.users as auth_user
    where auth_user.id = auth.uid()
    limit 1;

    if not found then
        raise exception 'Supabase auth user was not found';
    end if;

    if not exists (
        select 1
        from pg_catalog.jsonb_array_elements_text(
            coalesce(v_user.raw_app_meta_data->'providers', '[]'::jsonb)
        ) as provider(value)
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
        nullif(v_user.raw_user_meta_data->>'caregiver_name', ''),
        v_user.raw_user_meta_data->>'full_name',
        v_user.raw_user_meta_data->>'name',
        split_part(v_email, '@', 1),
        ''
    ));
    v_requested_role := upper(trim(coalesce(
        nullif(v_user.raw_user_meta_data->>'caregiver_role', ''),
        'GUARDIAN'
    )));

    if v_requested_role not in ('MOM', 'DAD', 'GUARDIAN') then
        raise exception 'Invalid caregiver role';
    end if;

    v_role := v_requested_role;

    if v_name = '' then
        v_name := case v_requested_role
            when 'MOM' then '엄마'
            when 'DAD' then '아빠'
            else '보호자'
        end;
    end if;

    select caregiver.*
    into v_caregiver
    from public.caregivers as caregiver
    where caregiver.auth_user_id = auth.uid()
       or lower(caregiver.email) = v_email
    order by
        case when caregiver.auth_user_id = auth.uid() then 0 else 1 end,
        caregiver.updated_at desc
    limit 1;

    if found then
        if v_invite_code is not null then
            select family.*
            into v_family
            from public.families as family
            where upper(family.invite_code) = v_invite_code
            limit 1;

            if not found then
                raise exception 'Family invite code was not found';
            end if;

            if v_caregiver.family_id <> v_family.id then
                raise exception 'Caregiver email already belongs to another family';
            end if;
        else
            select family.*
            into v_family
            from public.families as family
            where family.id = v_caregiver.family_id
            limit 1;
        end if;
    else
        if v_invite_code is not null then
            select family.*
            into v_family
            from public.families as family
            where upper(family.invite_code) = v_invite_code
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
        select invitation.*
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
        end if;
    end if;

    if v_caregiver.id is not null then
        update public.caregivers as caregiver
        set auth_user_id = null,
            updated_at = now()
        where caregiver.auth_user_id = auth.uid()
          and caregiver.id <> v_caregiver.id;

        update public.caregivers as caregiver
        set auth_user_id = auth.uid(),
            email = v_email,
            name = case when trim(coalesce(caregiver.name, '')) = '' then v_name else caregiver.name end,
            role = case when v_invitation_id is null then caregiver.role else v_role end,
            updated_at = now()
        where caregiver.id = v_caregiver.id
        returning caregiver.* into v_caregiver;
    else
        update public.caregivers as caregiver
        set auth_user_id = null,
            updated_at = now()
        where caregiver.auth_user_id = auth.uid();

        insert into public.caregivers(
            family_id,
            auth_user_id,
            email,
            name,
            role,
            availability_score,
            fatigue_score,
            password_hash
        )
        values (v_family.id, auth.uid(), v_email, v_name, v_role, 7, 4, '')
        returning * into v_caregiver;
    end if;

    if v_invitation_id is not null then
        update public.family_invitations as invitation
        set status = 'ACCEPTED',
            accepted_at = now()
        where invitation.id = v_invitation_id;
    end if;

    select child.*
    into v_child
    from public.children as child
    where child.family_id = v_caregiver.family_id
    order by child.id
    limit 1;

    return query
    select v_caregiver.id, v_caregiver.family_id, v_child.id;
end;
$$;

-- The consent wrapper remains the only authenticated OAuth completion surface.
revoke all on function public.complete_oauth_caregiver(text)
from public, anon, authenticated;
