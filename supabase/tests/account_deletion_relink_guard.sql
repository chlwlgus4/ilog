-- Runs only against a disposable local or isolated non-production Supabase DB.
-- Every fixture is rolled back. Never execute this against production.

begin;

do $$
declare
    v_blocked_user_id uuid := gen_random_uuid();
    v_allowed_user_id uuid := gen_random_uuid();
    v_family_id bigint;
    v_allowed_caregiver_id bigint;
    v_insert_blocked boolean := false;
    v_update_blocked boolean := false;
begin
    insert into auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at
    ) values
        (
            '00000000-0000-0000-0000-000000000000',
            v_blocked_user_id,
            'authenticated',
            'authenticated',
            'deletion-relink-blocked@example.test',
            '',
            now(),
            '{"provider":"email","providers":["email"]}',
            '{}',
            now(),
            now()
        ),
        (
            '00000000-0000-0000-0000-000000000000',
            v_allowed_user_id,
            'authenticated',
            'authenticated',
            'deletion-relink-allowed@example.test',
            '',
            now(),
            '{"provider":"email","providers":["email"]}',
            '{}',
            now(),
            now()
        );

    insert into public.families(name, invite_code)
    values ('Deletion relink guard family', 'RELINK-' || substr(v_blocked_user_id::text, 1, 8))
    returning id into v_family_id;

    insert into private.caregiver_account_deletion_jobs(auth_user_id, family_id)
    values (v_blocked_user_id, v_family_id);

    begin
        insert into public.caregivers(
            family_id,
            auth_user_id,
            name,
            role,
            email,
            password_hash
        ) values (
            v_family_id,
            v_blocked_user_id,
            'Blocked caregiver',
            'GUARDIAN',
            'deletion-relink-blocked@example.test',
            ''
        );
    exception when others then
        if sqlerrm not like '%Account deletion prevents caregiver relinking%' then
            raise;
        end if;
        v_insert_blocked := true;
    end;

    if not v_insert_blocked then
        raise exception 'A pending deletion user was inserted as a caregiver';
    end if;

    insert into public.caregivers(
        family_id,
        auth_user_id,
        name,
        role,
        email,
        password_hash
    ) values (
        v_family_id,
        v_allowed_user_id,
        'Allowed caregiver',
        'GUARDIAN',
        'deletion-relink-allowed@example.test',
        ''
    ) returning id into v_allowed_caregiver_id;

    begin
        update public.caregivers
        set auth_user_id = v_blocked_user_id
        where id = v_allowed_caregiver_id;
    exception when others then
        if sqlerrm not like '%Account deletion prevents caregiver relinking%' then
            raise;
        end if;
        v_update_blocked := true;
    end;

    if not v_update_blocked then
        raise exception 'A pending deletion user was linked to an existing caregiver';
    end if;
end;
$$;

rollback;
