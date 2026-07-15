create or replace function public.join_family_by_invite(
    p_invite_code text,
    p_caregiver_name text,
    p_role text default null,
    p_availability_score integer default null,
    p_fatigue_score integer default null,
    p_pin_code text default ''
)
returns table(caregiver_id bigint, family_id bigint, child_id bigint)
language plpgsql
security definer
set search_path = public, extensions
as $function$
declare
    v_family public.families%rowtype;
    v_child public.children%rowtype;
    v_caregiver public.caregivers%rowtype;
    v_name text := trim(p_caregiver_name);
    v_pin text := trim(coalesce(p_pin_code, ''));
    v_next_role text;
    v_next_availability integer;
    v_next_fatigue integer;
begin
    if auth.uid() is null then
        raise exception 'Supabase auth session is required';
    end if;

    if v_name = '' then
        raise exception 'Caregiver name is required';
    end if;

    if v_pin !~ '^\d{4}$' then
        raise exception 'PIN must be 4 digits';
    end if;

    if p_role is not null and p_role not in ('MOM', 'DAD', 'GUARDIAN') then
        raise exception 'Invalid caregiver role';
    end if;

    if p_availability_score is not null and (p_availability_score < 1 or p_availability_score > 10) then
        raise exception 'Caregiver scores must be between 1 and 10';
    end if;

    if p_fatigue_score is not null and (p_fatigue_score < 1 or p_fatigue_score > 10) then
        raise exception 'Caregiver scores must be between 1 and 10';
    end if;

    select f.* into v_family
    from public.families as f
    where upper(f.invite_code) = upper(trim(p_invite_code))
    limit 1;

    if not found then
        raise exception 'Family invite code was not found';
    end if;

    select ch.* into v_child
    from public.children as ch
    where ch.family_id = v_family.id
    order by ch.id asc
    limit 1;

    if v_child.id is null then
        raise exception 'Family child profile was not found';
    end if;

    select cg.* into v_caregiver
    from public.caregivers as cg
    where cg.family_id = v_family.id
      and lower(cg.name) = lower(v_name)
    limit 1;

    if found then
        if coalesce(v_caregiver.pin_hash, '') <> ''
           and v_caregiver.pin_hash <> extensions.crypt(v_pin, v_caregiver.pin_hash) then
            raise exception 'Invalid caregiver PIN';
        end if;

        v_next_role := coalesce(p_role, v_caregiver.role, 'GUARDIAN');
        v_next_availability := coalesce(p_availability_score, v_caregiver.availability_score, 7);
        v_next_fatigue := coalesce(p_fatigue_score, v_caregiver.fatigue_score, 4);

        update public.caregivers as cg
        set auth_user_id = null,
            updated_at = now()
        where cg.auth_user_id = auth.uid()
          and cg.id <> v_caregiver.id;

        update public.caregivers as cg
        set auth_user_id = auth.uid(),
            role = v_next_role,
            availability_score = v_next_availability,
            fatigue_score = v_next_fatigue,
            pin_hash = case
                when coalesce(cg.pin_hash, '') = '' then extensions.crypt(v_pin, extensions.gen_salt('bf'))
                else cg.pin_hash
            end,
            updated_at = now()
        where cg.id = v_caregiver.id
        returning cg.* into v_caregiver;
    else
        v_next_role := coalesce(p_role, 'GUARDIAN');
        v_next_availability := coalesce(p_availability_score, 7);
        v_next_fatigue := coalesce(p_fatigue_score, 4);

        update public.caregivers as cg
        set auth_user_id = null,
            updated_at = now()
        where cg.auth_user_id = auth.uid();

        insert into public.caregivers (
            family_id,
            auth_user_id,
            name,
            role,
            availability_score,
            fatigue_score,
            pin_hash
        ) values (
            v_family.id,
            auth.uid(),
            v_name,
            v_next_role,
            v_next_availability,
            v_next_fatigue,
            extensions.crypt(v_pin, extensions.gen_salt('bf'))
        )
        returning * into v_caregiver;
    end if;

    return query select v_caregiver.id, v_family.id, v_child.id;
end;
$function$;

revoke all on function public.join_family_by_invite(text,text,text,integer,integer,text) from public, anon;
grant execute on function public.join_family_by_invite(text,text,text,integer,integer,text) to authenticated;
