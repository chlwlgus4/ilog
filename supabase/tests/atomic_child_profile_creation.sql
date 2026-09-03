-- Runs only against a disposable local or isolated non-production Supabase DB.
-- Every fixture is rolled back. Never execute this against the production project.

begin;

do $$
declare
    v_user_a uuid := gen_random_uuid();
    v_user_b uuid := gen_random_uuid();
    v_family_a bigint;
    v_family_b bigint;
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
            v_user_a,
            'authenticated',
            'authenticated',
            'atomic-child-a@example.test',
            '',
            now(),
            '{"provider":"email","providers":["email"]}',
            '{}',
            now(),
            now()
        ),
        (
            '00000000-0000-0000-0000-000000000000',
            v_user_b,
            'authenticated',
            'authenticated',
            'atomic-child-b@example.test',
            '',
            now(),
            '{"provider":"email","providers":["email"]}',
            '{}',
            now(),
            now()
        );

    insert into public.families(name, invite_code)
    values ('Atomic child family A', 'ATOMIC-A-' || substr(v_user_a::text, 1, 8))
    returning id into v_family_a;

    insert into public.families(name, invite_code)
    values ('Atomic child family B', 'ATOMIC-B-' || substr(v_user_b::text, 1, 8))
    returning id into v_family_b;

    insert into public.caregivers(family_id, auth_user_id, name, role)
    values
        (v_family_a, v_user_a, 'Atomic caregiver A', 'GUARDIAN'),
        (v_family_b, v_user_b, 'Atomic caregiver B', 'GUARDIAN');

    perform set_config('ilog.test.atomic_child_user_a', v_user_a::text, true);
    perform set_config('ilog.test.atomic_child_user_b', v_user_b::text, true);
    perform set_config('ilog.test.atomic_child_family_a', v_family_a::text, true);
    perform set_config('ilog.test.atomic_child_family_b', v_family_b::text, true);
end;
$$;

create function public.ilog_test_reject_initial_weight()
returns trigger
language plpgsql
as $$
begin
    if new.note = '아이 정보에서 등록' then
        raise exception 'Forced initial weight failure';
    end if;

    return new;
end;
$$;

create trigger ilog_test_reject_initial_weight
before insert on public.growth_measurements
for each row execute function public.ilog_test_reject_initial_weight();

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('ilog.test.atomic_child_user_a'), true);

do $$
declare
    v_family_a bigint := current_setting('ilog.test.atomic_child_family_a')::bigint;
    v_failed boolean := false;
begin
    begin
        perform public.create_child_profile_checked(
            v_family_a,
            'Rollback child',
            current_date,
            'INFANT',
            'FEMALE',
            7.7,
            null
        );
    exception when others then
        if sqlerrm <> 'Forced initial weight failure' then
            raise;
        end if;
        v_failed := true;
    end;

    if not v_failed then
        raise exception 'Forced initial weight failure was not propagated';
    end if;

    if exists (
        select 1
        from public.children
        where family_id = v_family_a
          and name = 'Rollback child'
    ) then
        raise exception 'Child insert was not rolled back after initial weight failure';
    end if;
end;
$$;

reset role;
drop trigger ilog_test_reject_initial_weight on public.growth_measurements;
drop function public.ilog_test_reject_initial_weight();

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('ilog.test.atomic_child_user_a'), true);

do $$
declare
    v_user_b uuid := current_setting('ilog.test.atomic_child_user_b')::uuid;
    v_family_a bigint := current_setting('ilog.test.atomic_child_family_a')::bigint;
    v_family_b bigint := current_setting('ilog.test.atomic_child_family_b')::bigint;
    v_child public.children%rowtype;
    v_denied boolean := false;
    v_mismatch_denied boolean := false;
begin
    begin
        perform public.create_child_profile_checked(
            v_family_b,
            'Cross-family child',
            current_date,
            'INFANT',
            'MALE',
            7.2,
            null
        );
    exception when others then
        if sqlerrm <> 'Family access denied' then
            raise;
        end if;
        v_denied := true;
    end;

    if not v_denied then
        raise exception 'Cross-family child creation was allowed';
    end if;

    select * into v_child
    from public.create_child_profile_checked(
        v_family_a,
        'Atomic child',
        current_date,
        'INFANT',
        'FEMALE',
        7.555,
        null
    );

    if not exists (
        select 1
        from public.growth_measurements growth
        where growth.family_id = v_family_a
          and growth.child_id = v_child.id
          and growth.weight_kg = 7.56
          and growth.caregiver_id = public.current_caregiver_id()
    ) then
        raise exception 'Initial weight was not created with the child';
    end if;

    if (
        select retry_child.id
        from public.create_child_profile_checked(
            v_family_a,
            'Atomic child',
            current_date,
            'INFANT',
            'FEMALE',
            7.555,
            null
        ) retry_child
    ) <> v_child.id then
        raise exception 'Idempotent retry returned a different child';
    end if;

    if (
        select count(*)
        from public.children child
        where child.family_id = v_family_a
          and child.name = 'Atomic child'
    ) <> 1 then
        raise exception 'Idempotent retry created a duplicate child';
    end if;

    begin
        perform public.create_child_profile_checked(
            v_family_a,
            'Atomic child',
            current_date,
            'INFANT',
            'FEMALE',
            7.4,
            null
        );
    exception when others then
        if sqlerrm <> 'A child profile already exists for this family' then
            raise;
        end if;
        v_mismatch_denied := true;
    end;

    if not v_mismatch_denied then
        raise exception 'A retry with a different initial weight was silently accepted';
    end if;

    perform set_config('request.jwt.claim.sub', v_user_b::text, true);

    select * into v_child
    from public.create_child_profile_checked(
        v_family_b,
        'Child without weight',
        current_date,
        'TODDLER',
        'MALE',
        null,
        null
    );

    if exists (
        select 1
        from public.growth_measurements growth
        where growth.child_id = v_child.id
    ) then
        raise exception 'Null initial weight unexpectedly created a growth row';
    end if;
end;
$$;

rollback;
