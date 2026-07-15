alter table public.caregivers
    add column if not exists email text;

create unique index if not exists caregivers_email_ci_key
    on public.caregivers (lower(email))
    where email is not null;

grant insert on table public.children to authenticated;

drop policy if exists children_insert_member on public.children;
create policy children_insert_member on public.children
for insert
to authenticated
with check (public.is_family_member(family_id));

create or replace function public.next_family_invite_code()
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_code text;
begin
    loop
        v_code := 'BB-' || upper(substr(encode(extensions.gen_random_bytes(5), 'hex'), 1, 8));
        exit when not exists (
            select 1
            from public.families
            where invite_code = v_code
        );
    end loop;

    return v_code;
end;
$$;

revoke all on function public.next_family_invite_code() from public, anon;
grant execute on function public.next_family_invite_code() to authenticated;

create or replace function public.register_caregiver(
    p_invite_code text default null,
    p_email text default '',
    p_caregiver_name text default '',
    p_role text default null,
    p_pin_code text default ''
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
    v_email text := lower(trim(coalesce(p_email, '')));
    v_name text := trim(coalesce(p_caregiver_name, ''));
    v_pin text := trim(coalesce(p_pin_code, ''));
    v_role text := coalesce(p_role, 'GUARDIAN');
    v_invite_code text := nullif(upper(trim(coalesce(p_invite_code, ''))), '');
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

    if v_name = '' then
        raise exception 'Caregiver name is required';
    end if;

    if v_pin !~ '^\d{4}$' then
        raise exception 'PIN must be 4 digits';
    end if;

    if v_role not in ('MOM', 'DAD', 'GUARDIAN') then
        raise exception 'Invalid caregiver role';
    end if;

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

    select * into v_caregiver
    from public.caregivers
    where lower(email) = v_email
    limit 1;

    if found then
        if v_caregiver.family_id <> v_family.id then
            raise exception 'Caregiver email already belongs to another family';
        end if;

        if coalesce(v_caregiver.pin_hash, '') <> ''
           and v_caregiver.pin_hash <> extensions.crypt(v_pin, v_caregiver.pin_hash) then
            raise exception 'Invalid caregiver PIN';
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
            pin_hash = case
                when coalesce(pin_hash, '') = '' then extensions.crypt(v_pin, extensions.gen_salt('bf'))
                else pin_hash
            end,
            updated_at = now()
        where id = v_caregiver.id
        returning * into v_caregiver;
    else
        update public.caregivers
        set auth_user_id = null,
            updated_at = now()
        where auth_user_id = auth.uid();

        insert into public.caregivers(family_id, auth_user_id, email, name, role, availability_score, fatigue_score, pin_hash)
        values (v_family.id, auth.uid(), v_email, v_name, v_role, 7, 4, extensions.crypt(v_pin, extensions.gen_salt('bf')))
        returning * into v_caregiver;
    end if;

    select ch.* into v_child
    from public.children as ch
    where ch.family_id = v_family.id
    order by ch.id asc
    limit 1;

    return query select v_caregiver.id, v_family.id, v_child.id;
end;
$$;

revoke all on function public.register_caregiver(text,text,text,text,text) from public, anon;
grant execute on function public.register_caregiver(text,text,text,text,text) to authenticated;

create or replace function public.login_caregiver_by_email(
    p_email text,
    p_pin_code text
)
returns table(caregiver_id bigint, family_id bigint, child_id bigint)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_child public.children%rowtype;
    v_caregiver public.caregivers%rowtype;
    v_email text := lower(trim(coalesce(p_email, '')));
    v_pin text := trim(coalesce(p_pin_code, ''));
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

    if v_pin !~ '^\d{4}$' then
        raise exception 'PIN must be 4 digits';
    end if;

    select * into v_caregiver
    from public.caregivers
    where lower(email) = v_email
    limit 1;

    if not found then
        raise exception 'Caregiver was not found';
    end if;

    if coalesce(v_caregiver.pin_hash, '') = ''
       or v_caregiver.pin_hash <> extensions.crypt(v_pin, v_caregiver.pin_hash) then
        raise exception 'Invalid caregiver PIN';
    end if;

    update public.caregivers
    set auth_user_id = null,
        updated_at = now()
    where auth_user_id = auth.uid()
      and id <> v_caregiver.id;

    update public.caregivers
    set auth_user_id = auth.uid(),
        updated_at = now()
    where id = v_caregiver.id
    returning * into v_caregiver;

    select ch.* into v_child
    from public.children as ch
    where ch.family_id = v_caregiver.family_id
    order by ch.id asc
    limit 1;

    return query select v_caregiver.id, v_caregiver.family_id, v_child.id;
end;
$$;

revoke all on function public.login_caregiver_by_email(text,text) from public, anon;
grant execute on function public.login_caregiver_by_email(text,text) to authenticated;
