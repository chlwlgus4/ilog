-- Runs only against a disposable local or isolated non-production Supabase DB.
-- Every fixture is rolled back. Never execute this against the production project.

begin;

do $$
declare
    v_user_a uuid := gen_random_uuid();
    v_user_a_recipient uuid := gen_random_uuid();
    v_user_b uuid := gen_random_uuid();
    v_family_a bigint;
    v_family_b bigint;
    v_caregiver_a bigint;
    v_caregiver_a_recipient bigint;
    v_caregiver_b bigint;
    v_child_a bigint;
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
            'rls-family-a@example.test',
            '$2a$10$M9v2t7TnGvKrq7pH3aRjNeaYAlzG4u7e1xBPY2ZL4C1Slw8d5KyzG',
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
            'rls-family-b@example.test',
            '$2a$10$M9v2t7TnGvKrq7pH3aRjNeaYAlzG4u7e1xBPY2ZL4C1Slw8d5KyzG',
            now(),
            '{"provider":"email","providers":["email"]}',
            '{}',
            now(),
            now()
        ),
        (
            '00000000-0000-0000-0000-000000000000',
            v_user_a_recipient,
            'authenticated',
            'authenticated',
            'rls-family-a-recipient@example.test',
            '$2a$10$M9v2t7TnGvKrq7pH3aRjNeaYAlzG4u7e1xBPY2ZL4C1Slw8d5KyzG',
            now(),
            '{"provider":"email","providers":["email"]}',
            '{}',
            now(),
            now()
        );

    insert into public.families(name, invite_code)
    values ('RLS family A', 'RLS-A-' || substr(v_user_a::text, 1, 8))
    returning id into v_family_a;

    insert into public.families(name, invite_code)
    values ('RLS family B', 'RLS-B-' || substr(v_user_b::text, 1, 8))
    returning id into v_family_b;

    insert into public.caregivers(family_id, auth_user_id, name, role)
    values (v_family_a, v_user_a, 'RLS A', 'GUARDIAN')
    returning id into v_caregiver_a;

    insert into public.caregivers(family_id, auth_user_id, name, role)
    values (v_family_b, v_user_b, 'RLS B', 'GUARDIAN')
    returning id into v_caregiver_b;

    insert into public.caregivers(family_id, auth_user_id, name, role)
    values (v_family_a, v_user_a_recipient, 'RLS A recipient', 'GUARDIAN')
    returning id into v_caregiver_a_recipient;

    insert into public.children(family_id, name, birth_date, stage)
    values (v_family_a, 'RLS child A', current_date - 30, 'INFANT')
    returning id into v_child_a;

    insert into public.tasks(family_id, created_by_id, title, due_at)
    values
        (v_family_a, v_caregiver_a, 'A only task', now()),
        (v_family_b, v_caregiver_b, 'B only task', now());

    insert into public.family_photos(family_id, created_by_id, storage_path, caption)
    values
        (v_family_a, v_caregiver_a, 'photos/' || v_family_a::text || '/a.png', 'A only photo'),
        (v_family_b, v_caregiver_b, 'photos/' || v_family_b::text || '/b.png', 'B only photo');

    insert into storage.objects(bucket_id, name, owner, metadata)
    values
        ('family-media', 'photos/' || v_family_a::text || '/a.png', v_user_a, '{}'::jsonb),
        ('family-media', 'photos/' || v_family_b::text || '/b.png', v_user_b, '{}'::jsonb);

    perform set_config('ilog.test.user_a', v_user_a::text, true);
    perform set_config('ilog.test.user_b', v_user_b::text, true);
    perform set_config('ilog.test.family_a', v_family_a::text, true);
    perform set_config('ilog.test.family_b', v_family_b::text, true);
    perform set_config('ilog.test.caregiver_a', v_caregiver_a::text, true);
    perform set_config('ilog.test.caregiver_a_recipient', v_caregiver_a_recipient::text, true);
    perform set_config('ilog.test.caregiver_b', v_caregiver_b::text, true);
    perform set_config('ilog.test.child_a', v_child_a::text, true);
end;
$$;

set local role authenticated;

select set_config('request.jwt.claim.sub', current_setting('ilog.test.user_a'), true);

do $$
declare
    v_family_a bigint := current_setting('ilog.test.family_a')::bigint;
    v_family_b bigint := current_setting('ilog.test.family_b')::bigint;
    v_caregiver_a bigint := current_setting('ilog.test.caregiver_a')::bigint;
    v_caregiver_a_recipient bigint := current_setting('ilog.test.caregiver_a_recipient')::bigint;
    v_caregiver_b bigint := current_setting('ilog.test.caregiver_b')::bigint;
    v_child_a bigint := current_setting('ilog.test.child_a')::bigint;
    v_log public.logs%rowtype;
    v_growth public.growth_measurements%rowtype;
    v_visible_tasks integer;
    v_visible_photos integer;
    v_visible_objects integer;
    v_insert_denied boolean := false;
    v_push_insert_denied boolean := false;
begin
    select count(*) into v_visible_tasks from public.tasks;
    select count(*) into v_visible_photos from public.family_photos;
    select count(*) into v_visible_objects
    from storage.objects
    where bucket_id = 'family-media';

    if v_visible_tasks <> 1 or v_visible_photos <> 1 or v_visible_objects <> 1 then
        raise exception 'Family A isolation failed: tasks %, photos %, storage objects %',
            v_visible_tasks, v_visible_photos, v_visible_objects;
    end if;

    begin
        insert into public.tasks(family_id, title, due_at)
        values (v_family_b, 'Cross-family write must fail', now());
    exception when insufficient_privilege then
        v_insert_denied := true;
    end;

    if not v_insert_denied then
        raise exception 'Family A was able to create a task for family B';
    end if;

    begin
        insert into public.push_notification_events(
            family_id,
            recipient_caregiver_id,
            actor_caregiver_id,
            event_type,
            title,
            body
        ) values (
            v_family_a,
            v_caregiver_b,
            v_caregiver_a,
            'TIMELINE_COMMENT',
            'Cross-family push must fail',
            'Cross-family push must fail'
        );
    exception when insufficient_privilege then
        v_push_insert_denied := true;
    end;

    if not v_push_insert_denied then
        raise exception 'Family A was able to enqueue a push for family B';
    end if;

    insert into public.push_notification_events(
        family_id,
        recipient_caregiver_id,
        actor_caregiver_id,
        event_type,
        title,
        body
    ) values (
        v_family_a,
        v_caregiver_a,
        v_caregiver_a,
        'TIMELINE_COMMENT',
        'Same-family push is allowed',
        'Same-family push is allowed'
    );

    select * into v_log
    from public.create_care_record_with_chat(
        p_family_id => v_family_a,
        p_child_id => v_child_a,
        p_type => 'FEEDING',
        p_value => '120 ml',
        p_note => 'recordSource fixture',
        p_recorded_at => now(),
        p_share_enabled => true,
        p_excluded_caregiver_ids => array[]::bigint[]
    );

    if not exists (
        select 1
        from public.push_notification_events event
        where event.family_id = v_family_a
          and event.recipient_caregiver_id = v_caregiver_a_recipient
          and event.actor_caregiver_id = v_caregiver_a
          and event.event_type = 'RECORD_SHARED'
          and event.data ->> 'recordType' = 'FEEDING'
          and event.data ->> 'recordId' = v_log.id::text
          and event.data ->> 'recordSource' = 'LOG'
    ) then
        raise exception 'Log share notification recordSource contract failed';
    end if;

    select * into v_growth
    from public.create_growth_measurement_checked(
        p_family_id => v_family_a,
        p_child_id => v_child_a,
        p_measured_at => now(),
        p_height_cm => 61.2,
        p_weight_kg => 6.4,
        p_head_circumference_cm => null,
        p_note => 'recordSource fixture',
        p_share_enabled => true,
        p_excluded_caregiver_ids => array[]::bigint[]
    );

    if not exists (
        select 1
        from public.push_notification_events event
        where event.family_id = v_family_a
          and event.recipient_caregiver_id = v_caregiver_a_recipient
          and event.actor_caregiver_id = v_caregiver_a
          and event.event_type = 'RECORD_SHARED'
          and event.data ->> 'recordType' = 'GROWTH'
          and event.data ->> 'recordId' = v_growth.id::text
          and event.data ->> 'recordSource' = 'GROWTH_MEASUREMENT'
    ) then
        raise exception 'Growth share notification recordSource contract failed';
    end if;

    perform public.enqueue_record_share_notifications(
        v_family_a,
        v_caregiver_a,
        'VACCINATION',
        900001,
        'Vaccination compatibility fixture',
        'Vaccination compatibility fixture',
        true,
        array[]::bigint[]
    );
    perform public.enqueue_record_share_notifications(
        v_family_a,
        v_caregiver_a,
        'HOSPITAL',
        900002,
        'Hospital compatibility fixture',
        'Hospital compatibility fixture',
        true,
        array[]::bigint[]
    );

    if not exists (
        select 1
        from public.push_notification_events event
        where event.recipient_caregiver_id = v_caregiver_a_recipient
          and event.data ->> 'recordType' = 'VACCINATION'
          and event.data ->> 'recordId' = '900001'
    ) or not exists (
        select 1
        from public.push_notification_events event
        where event.recipient_caregiver_id = v_caregiver_a_recipient
          and event.data ->> 'recordType' = 'HOSPITAL'
          and event.data ->> 'recordId' = '900002'
    ) then
        raise exception 'Legacy record share notification contract failed';
    end if;

    if exists (
        select 1
        from public.push_notification_events event
        where event.family_id = v_family_a
          and event.recipient_caregiver_id = v_caregiver_a
          and event.actor_caregiver_id = v_caregiver_a
          and event.event_type = 'RECORD_SHARED'
    ) then
        raise exception 'Record author received their own share notification';
    end if;

    if exists (select 1 from public.tasks where family_id = v_family_b)
       or exists (select 1 from public.family_photos where family_id = v_family_b) then
        raise exception 'Family A can read family B data';
    end if;

    if not exists (select 1 from public.tasks where family_id = v_family_a) then
        raise exception 'Family A cannot read its own task';
    end if;
end;
$$;

reset role;
set local role authenticated;

select set_config('request.jwt.claim.sub', current_setting('ilog.test.user_b'), true);

do $$
declare
    v_family_a bigint := current_setting('ilog.test.family_a')::bigint;
    v_family_b bigint := current_setting('ilog.test.family_b')::bigint;
    v_visible_tasks integer;
    v_visible_photos integer;
    v_visible_objects integer;
begin
    select count(*) into v_visible_tasks from public.tasks;
    select count(*) into v_visible_photos from public.family_photos;
    select count(*) into v_visible_objects
    from storage.objects
    where bucket_id = 'family-media';

    if v_visible_tasks <> 1 or v_visible_photos <> 1 or v_visible_objects <> 1 then
        raise exception 'Family B isolation failed: tasks %, photos %, storage objects %',
            v_visible_tasks, v_visible_photos, v_visible_objects;
    end if;

    if exists (select 1 from public.tasks where family_id = v_family_a)
       or exists (select 1 from public.family_photos where family_id = v_family_a) then
        raise exception 'Family B can read family A data';
    end if;

    if not exists (select 1 from public.tasks where family_id = v_family_b) then
        raise exception 'Family B cannot read its own task';
    end if;
end;
$$;

reset role;
rollback;

select 'family RLS, push recipient, and family-media Storage isolation checks passed' as result;
