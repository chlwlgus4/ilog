-- Runs only against a disposable local or isolated non-production Supabase DB.
-- Every fixture is rolled back. Never execute this against production.

begin;

-- A family cascade runs without an end-user Auth subject. It must be allowed to
-- clear author FKs while the family-owned rows are being deleted.
do $$
declare
    v_user uuid := '10000000-0000-0000-0000-000000000001';
    v_family bigint;
    v_caregiver bigint;
    v_child bigint;
    v_log bigint;
begin
    insert into auth.users(
        instance_id, id, aud, role, email, encrypted_password,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values (
        '00000000-0000-0000-0000-000000000000', v_user,
        'authenticated', 'authenticated', 'cascade@example.test', '',
        '{}', '{}', now(), now()
    );
    insert into public.families(name, invite_code)
    values ('Cascade family', 'CASCADE-DELETE-FIXTURE')
    returning id into v_family;
    insert into public.caregivers(family_id, auth_user_id, name, role, email)
    values (v_family, v_user, 'Cascade owner', 'GUARDIAN', 'cascade@example.test')
    returning id into v_caregiver;
    insert into public.children(family_id, name, birth_date, stage)
    values (v_family, 'Cascade child', current_date, 'INFANT')
    returning id into v_child;

    insert into public.tasks(family_id, child_id, created_by_id, title, due_at)
    values (v_family, v_child, v_caregiver, 'Cascade task', now());
    insert into public.schedules(
        family_id, child_id, created_by_id, title, category, start_at, end_at
    ) values (
        v_family, v_child, v_caregiver, 'Cascade schedule', 'HOME',
        now(), now() + interval '1 hour'
    );
    insert into public.logs(
        family_id, child_id, caregiver_id, type, entry_value, recorded_at
    ) values (
        v_family, v_child, v_caregiver, 'MEMO', 'Cascade log', now()
    ) returning id into v_log;
    insert into public.memory_entries(
        family_id, child_id, created_by_id, title, happened_at
    ) values (v_family, v_child, v_caregiver, 'Cascade memory', now());
    insert into public.record_attachments(
        family_id, child_id, log_id, created_by_id, image_url
    ) values (
        v_family, v_child, v_log, v_caregiver,
        'photos/' || v_family || '/cascade.jpg'
    );
    insert into public.growth_measurements(
        family_id, child_id, caregiver_id, measured_at, weight_kg
    ) values (v_family, v_child, v_caregiver, now(), 3.2);
    insert into public.family_invitations(
        family_id, email, relationship, role, invited_by_id
    ) values (
        v_family, 'invite@example.test', '보호자', 'GUARDIAN', v_caregiver
    );
    insert into public.vaccination_records(
        family_id, child_id, name, due_at, created_by_id
    ) values (v_family, v_child, 'Cascade vaccine', now(), v_caregiver);
    insert into public.hospital_visits(
        family_id, child_id, hospital_name, visited_at, created_by_id
    ) values (v_family, v_child, 'Cascade hospital', now(), v_caregiver);
    insert into public.record_alarm_schedules(
        family_id, child_id, source_log_id, log_type, interval_minutes,
        scheduled_for, created_by_id
    ) values (
        v_family, v_child, v_log, 'MEMO', 60,
        now() + interval '1 hour', v_caregiver
    );

    delete from public.families where id = v_family;

    if exists (select 1 from public.caregivers where id = v_caregiver)
       or exists (select 1 from public.tasks where family_id = v_family)
       or exists (
           select 1 from public.record_alarm_schedules where family_id = v_family
       ) then
        raise exception 'Family cascade did not remove fixture rows';
    end if;
end;
$$;

-- Already-installed beta builds still call the zero-argument RPC and display
-- the previously disclosed shared-content retention policy. Keep that contract
-- until those builds are retired, while the new app uses the v2 RPC below.
do $$
declare
    v_departing_user uuid := '15000000-0000-0000-0000-000000000001';
    v_remaining_user uuid := '15000000-0000-0000-0000-000000000002';
    v_session uuid := '15000000-0000-0000-0000-000000000003';
    v_family bigint;
    v_departing bigint;
    v_remaining bigint;
    v_child bigint;
    v_task bigint;
begin
    insert into auth.users(
        instance_id, id, aud, role, email, encrypted_password,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values
        (
            '00000000-0000-0000-0000-000000000000', v_departing_user,
            'authenticated', 'authenticated', 'legacy-departing@example.test', '',
            '{}', '{}', now(), now()
        ),
        (
            '00000000-0000-0000-0000-000000000000', v_remaining_user,
            'authenticated', 'authenticated', 'legacy-remaining@example.test', '',
            '{}', '{}', now(), now()
        );
    insert into auth.sessions(id, user_id, created_at, updated_at)
    values (v_session, v_departing_user, now(), now());
    insert into public.families(name, invite_code)
    values ('Legacy deletion family', 'LEGACY-DELETE-FIXTURE')
    returning id into v_family;
    insert into public.caregivers(family_id, auth_user_id, name, role, email)
    values (
        v_family, v_departing_user, 'Legacy departing', 'GUARDIAN',
        'legacy-departing@example.test'
    ) returning id into v_departing;
    insert into public.caregivers(family_id, auth_user_id, name, role, email)
    values (
        v_family, v_remaining_user, 'Legacy remaining', 'GUARDIAN',
        'legacy-remaining@example.test'
    ) returning id into v_remaining;
    insert into public.children(family_id, name, birth_date, stage)
    values (v_family, 'Legacy child', current_date, 'INFANT')
    returning id into v_child;
    insert into public.tasks(family_id, child_id, created_by_id, title, due_at)
    values (v_family, v_child, v_departing, 'Legacy retained task', now())
    returning id into v_task;

    perform set_config('ilog.test.legacy_departing_user', v_departing_user::text, true);
    perform set_config('ilog.test.legacy_session', v_session::text, true);
    perform set_config('ilog.test.legacy_family', v_family::text, true);
    perform set_config('ilog.test.legacy_departing', v_departing::text, true);
    perform set_config('ilog.test.legacy_remaining', v_remaining::text, true);
    perform set_config('ilog.test.legacy_task', v_task::text, true);
end;
$$;

set local role authenticated;
select set_config(
    'request.jwt.claims',
    jsonb_build_object(
        'sub', current_setting('ilog.test.legacy_departing_user'),
        'session_id', current_setting('ilog.test.legacy_session'),
        'role', 'authenticated'
    )::text,
    true
);
select public.request_caregiver_account_deletion_checked();
reset role;

do $$
declare
    v_user uuid := current_setting('ilog.test.legacy_departing_user')::uuid;
    v_family bigint := current_setting('ilog.test.legacy_family')::bigint;
    v_departing bigint := current_setting('ilog.test.legacy_departing')::bigint;
    v_remaining bigint := current_setting('ilog.test.legacy_remaining')::bigint;
    v_task bigint := current_setting('ilog.test.legacy_task')::bigint;
begin
    if exists (select 1 from public.caregivers where id = v_departing)
       or not exists (select 1 from public.caregivers where id = v_remaining) then
        raise exception 'Legacy caregiver deletion compatibility failed';
    end if;
    if not exists (
        select 1 from public.tasks
        where id = v_task and family_id = v_family
          and created_by_id is null and title = 'Legacy retained task'
    ) then
        raise exception 'Legacy shared-content retention contract changed';
    end if;
    if not exists (
        select 1 from public.account_deletion_audit
        where auth_user_id = v_user and action = 'CAREGIVER_DELETED'
          and metadata ->> 'shared_content_retained' = 'true'
    ) then
        raise exception 'Legacy retention audit evidence is missing';
    end if;
end;
$$;

-- Build a two-caregiver family, exercise the authenticated request, then
-- simulate the worker's already-confirmed Storage/Auth cleanup before finalize.
do $$
declare
    v_departing_user uuid := '20000000-0000-0000-0000-000000000001';
    v_remaining_user uuid := '20000000-0000-0000-0000-000000000002';
    v_session uuid := '20000000-0000-0000-0000-000000000003';
    v_family bigint;
    v_departing bigint;
    v_remaining bigint;
    v_child bigint;
    v_task bigint;
    v_log bigint;
    v_message bigint;
    v_departing_comment bigint;
    v_remaining_task bigint;
    v_remaining_message bigint;
    v_remaining_linked_departing_message bigint;
begin
    insert into auth.users(
        instance_id, id, aud, role, email, encrypted_password,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values
        (
            '00000000-0000-0000-0000-000000000000', v_departing_user,
            'authenticated', 'authenticated', 'departing@example.test', '',
            '{}', '{}', now(), now()
        ),
        (
            '00000000-0000-0000-0000-000000000000', v_remaining_user,
            'authenticated', 'authenticated', 'remaining@example.test', '',
            '{}', '{}', now(), now()
        );
    insert into auth.sessions(id, user_id, created_at, updated_at)
    values (v_session, v_departing_user, now(), now());
    insert into public.families(name, invite_code)
    values ('Personal deletion family', 'PERSONAL-DELETE-FIXTURE')
    returning id into v_family;
    insert into public.caregivers(
        family_id, auth_user_id, name, role, email, contact_phone
    ) values (
        v_family, v_departing_user, 'Departing caregiver', 'GUARDIAN',
        'departing@example.test', '01000000001'
    ) returning id into v_departing;
    insert into public.caregivers(
        family_id, auth_user_id, name, role, email, contact_phone
    ) values (
        v_family, v_remaining_user, 'Remaining caregiver', 'GUARDIAN',
        'remaining@example.test', '01000000002'
    ) returning id into v_remaining;
    insert into public.caregiver_legal_consents(
        caregiver_id, auth_user_id, document_type, document_version
    ) values
        (v_departing, v_departing_user, 'TERMS', '2026-09-02'),
        (v_departing, v_departing_user, 'PRIVACY', '2026-09-02');
    insert into public.children(family_id, name, birth_date, stage)
    values (v_family, 'Personal deletion child', current_date, 'INFANT')
    returning id into v_child;

    insert into public.tasks(
        family_id, child_id, assignee_id, created_by_id, title, due_at
    ) values (
        v_family, v_child, v_remaining, v_departing, 'Departing task', now()
    ) returning id into v_task;
    insert into public.schedules(
        family_id, child_id, created_by_id, title, category, start_at, end_at
    ) values (
        v_family, v_child, v_departing, 'Departing schedule', 'HOME',
        now(), now() + interval '1 hour'
    );
    insert into public.logs(
        family_id, child_id, caregiver_id, type, entry_value, recorded_at
    ) values (
        v_family, v_child, v_departing, 'MEMO', 'Departing log', now()
    ) returning id into v_log;
    insert into public.memory_entries(
        family_id, child_id, created_by_id, title, image_url, happened_at
    ) values (
        v_family, v_child, v_departing, 'Departing memory',
        'photos/' || v_family || '/departing.jpg', now()
    );
    insert into public.record_attachments(
        family_id, child_id, log_id, created_by_id, image_url
    ) values (
        v_family, v_child, v_log, v_departing,
        'photos/' || v_family || '/departing.jpg'
    );
    insert into public.growth_measurements(
        family_id, child_id, caregiver_id, measured_at, weight_kg
    ) values (v_family, v_child, v_departing, now(), 3.4);
    insert into public.family_invitations(
        family_id, email, contact_phone, relationship, role, invited_by_id
    ) values (
        v_family, 'departing-invite@example.test', '01000000003',
        '보호자', 'GUARDIAN', v_departing
    );
    insert into public.vaccination_records(
        family_id, child_id, name, due_at, created_by_id
    ) values (v_family, v_child, 'Departing vaccine', now(), v_departing);
    insert into public.hospital_visits(
        family_id, child_id, hospital_name, visited_at, created_by_id
    ) values (v_family, v_child, 'Departing hospital', now(), v_departing);
    insert into public.record_alarm_schedules(
        family_id, child_id, source_log_id, log_type, interval_minutes,
        scheduled_for, created_by_id
    ) values (
        v_family, v_child, v_log, 'MEMO', 60,
        now() + interval '1 hour', v_departing
    );
    insert into public.family_photos(
        family_id, created_by_id, storage_path, caption
    ) values (
        v_family, v_departing,
        'photos/' || v_family || '/departing.jpg', 'Departing photo'
    );
    insert into public.family_chat_messages(
        family_id, sender_caregiver_id, body, image_storage_path
    ) values (
        v_family, v_departing, 'Departing family chat',
        'chat/' || v_family || '/departing.jpg'
    );
    insert into public.chat_messages(
        family_id, sender_id, body, message_type, linked_task_id
    ) values (
        v_family, v_departing, 'Departing activity', 'TASK_LINK', v_task
    ) returning id into v_message;
    insert into public.timeline_comments(
        family_id, chat_message_id, author_caregiver_id, body
    ) values (v_family, v_message, v_departing, 'Departing comment')
    returning id into v_departing_comment;

    -- Another caregiver's rows are the preservation boundary: the departing
    -- assignee is cleared, but authorship and content must remain intact.
    insert into public.tasks(
        family_id, child_id, assignee_id, created_by_id, title, due_at
    ) values (
        v_family, v_child, v_departing, v_remaining, 'Remaining task', now()
    ) returning id into v_remaining_task;
    insert into public.logs(
        family_id, child_id, caregiver_id, type, entry_value, recorded_at
    ) values (
        v_family, v_child, v_remaining, 'MEMO', 'Remaining log', now()
    );
    insert into public.family_photos(
        family_id, created_by_id, storage_path, caption
    ) values (
        v_family, v_remaining,
        'photos/' || v_family || '/remaining.jpg', 'Remaining photo'
    );
    insert into public.family_chat_messages(
        family_id, sender_caregiver_id, body, image_storage_path
    ) values (
        v_family, v_remaining, 'Remaining family chat',
        'chat/' || v_family || '/remaining.jpg'
    );
    insert into public.chat_messages(
        family_id, sender_id, body, message_type, linked_task_id
    ) values (
        v_family, v_remaining, 'Remaining activity', 'TASK_LINK',
        v_remaining_task
    ) returning id into v_remaining_message;
    insert into public.chat_messages(
        family_id, sender_id, body, message_type, linked_task_id
    ) values (
        v_family, v_remaining, 'Remaining activity on departing task',
        'TASK_LINK', v_task
    ) returning id into v_remaining_linked_departing_message;
    insert into public.timeline_comments(
        family_id, chat_message_id, parent_comment_id,
        author_caregiver_id, body
    ) values (
        v_family, v_message, v_departing_comment,
        v_remaining, 'Remaining reply'
    );
    perform set_config('ilog.test.departing_user', v_departing_user::text, true);
    perform set_config('ilog.test.session', v_session::text, true);
    perform set_config('ilog.test.family', v_family::text, true);
    perform set_config('ilog.test.departing', v_departing::text, true);
    perform set_config('ilog.test.remaining', v_remaining::text, true);
    perform set_config('ilog.test.task', v_task::text, true);
    perform set_config('ilog.test.message', v_message::text, true);
    perform set_config('ilog.test.remaining_task', v_remaining_task::text, true);
    perform set_config('ilog.test.remaining_message', v_remaining_message::text, true);
    perform set_config(
        'ilog.test.remaining_linked_departing_message',
        v_remaining_linked_departing_message::text,
        true
    );
end;
$$;

set local role authenticated;
select set_config(
    'request.jwt.claims',
    jsonb_build_object(
        'sub', current_setting('ilog.test.departing_user'),
        'session_id', current_setting('ilog.test.session'),
        'role', 'authenticated'
    )::text,
    true
);

do $$
declare
    v_task bigint := current_setting('ilog.test.task')::bigint;
    v_family bigint := current_setting('ilog.test.family')::bigint;
    v_child bigint;
    v_insert_blocked boolean := false;
    v_author_change_blocked boolean := false;
    v_legacy_deletion_blocked boolean := false;
begin
    select child.id into v_child
    from public.children child
    where child.family_id = v_family
    order by child.id
    limit 1;

    begin
        insert into public.tasks(family_id, child_id, title, due_at)
        values (v_family, v_child, 'Ownerless bypass', now());
    exception when insufficient_privilege then
        v_insert_blocked := true;
    end;
    if not v_insert_blocked then
        raise exception 'Authenticated ownerless insert was not blocked';
    end if;

    begin
        update public.tasks set created_by_id = null where id = v_task;
    exception when insufficient_privilege then
        if sqlerrm not like '%Content author cannot be changed%' then
            raise;
        end if;
        v_author_change_blocked := true;
    end;
    if not v_author_change_blocked then
        raise exception 'Authenticated content author change was not blocked';
    end if;

    begin
        perform public.request_caregiver_account_deletion_checked();
    exception when others then
        if sqlerrm not like '%Updated account deletion policy requires version 2%' then
            raise;
        end if;
        v_legacy_deletion_blocked := true;
    end;
    if not v_legacy_deletion_blocked then
        raise exception 'New-policy caregiver could bypass strict deletion through v1';
    end if;

    perform public.request_caregiver_account_deletion_v2_checked();
end;
$$;

reset role;

do $$
declare
    v_user uuid := current_setting('ilog.test.departing_user')::uuid;
    v_family bigint := current_setting('ilog.test.family')::bigint;
    v_departing bigint := current_setting('ilog.test.departing')::bigint;
    v_remaining bigint := current_setting('ilog.test.remaining')::bigint;
    v_message bigint := current_setting('ilog.test.message')::bigint;
    v_remaining_task bigint := current_setting('ilog.test.remaining_task')::bigint;
    v_remaining_message bigint := current_setting('ilog.test.remaining_message')::bigint;
    v_remaining_linked_departing_message bigint :=
        current_setting('ilog.test.remaining_linked_departing_message')::bigint;
    v_claim uuid := '20000000-0000-0000-0000-000000000004';
    v_paths text[];
    v_finalized boolean;
begin
    if exists (select 1 from public.caregivers where id = v_departing)
       or not exists (select 1 from public.caregivers where id = v_remaining) then
        raise exception 'Personal deletion caregiver access result is invalid';
    end if;
    if exists (select 1 from public.tasks where id = current_setting('ilog.test.task')::bigint)
       or exists (select 1 from public.schedules where family_id = v_family and title = 'Departing schedule')
       or exists (select 1 from public.logs where family_id = v_family and entry_value = 'Departing log')
       or exists (select 1 from public.memory_entries where family_id = v_family and title = 'Departing memory')
       or exists (select 1 from public.record_attachments where family_id = v_family and image_url like '%/departing.jpg')
       or exists (select 1 from public.growth_measurements where family_id = v_family and caregiver_id = v_departing)
       or exists (select 1 from public.family_invitations where family_id = v_family and email = 'departing-invite@example.test')
       or exists (select 1 from public.vaccination_records where family_id = v_family and name = 'Departing vaccine')
       or exists (select 1 from public.hospital_visits where family_id = v_family and hospital_name = 'Departing hospital')
       or exists (select 1 from public.record_alarm_schedules where family_id = v_family and created_by_id = v_departing)
       or exists (select 1 from public.family_photos where family_id = v_family and storage_path like '%/departing.jpg')
       or exists (select 1 from public.family_chat_messages where family_id = v_family and image_storage_path like '%/departing.jpg') then
        raise exception 'Departing authored content was retained';
    end if;
    if not exists (
        select 1 from public.tasks
        where id = v_remaining_task and created_by_id = v_remaining
          and assignee_id is null and title = 'Remaining task'
    ) or not exists (
        select 1 from public.logs
        where family_id = v_family and caregiver_id = v_remaining
          and entry_value = 'Remaining log'
    ) or not exists (
        select 1 from public.family_photos
        where family_id = v_family and created_by_id = v_remaining
          and storage_path like '%/remaining.jpg'
    ) or not exists (
        select 1 from public.family_chat_messages
        where family_id = v_family and sender_caregiver_id = v_remaining
          and body = 'Remaining family chat'
          and image_storage_path like '%/remaining.jpg'
    ) or not exists (
        select 1 from public.chat_messages
        where id = v_remaining_message and sender_id = v_remaining
          and linked_task_id = v_remaining_task
          and body = 'Remaining activity'
    ) or not exists (
        select 1 from public.chat_messages
        where id = v_remaining_linked_departing_message
          and sender_id = v_remaining
          and linked_task_id is null
          and body = 'Remaining activity on departing task'
    ) or not exists (
        select 1 from public.timeline_comments
        where chat_message_id = v_message and author_caregiver_id = v_remaining
          and body = 'Remaining reply'
    ) then
        raise exception 'Remaining caregiver content was not preserved';
    end if;
    if not exists (
        select 1 from public.chat_messages
        where id = v_message and sender_id is null and linked_task_id is null
          and body = '삭제된 활동입니다.'
    ) or not exists (
        select 1 from public.timeline_comments
        where chat_message_id = v_message and author_caregiver_id is null
          and body = '삭제된 댓글입니다.'
    ) then
        raise exception 'Shared content was not irreversibly redacted';
    end if;
    if not exists (
        select 1 from private.caregiver_account_deletion_jobs
        where auth_user_id = v_user and family_id = v_family
          and caregiver_id = v_departing and status = 'PENDING'
    ) then
        raise exception 'Durable Auth deletion job was not queued';
    end if;

    select array_agg(path.storage_path order by path.storage_path)
    into v_paths
    from private.caregiver_account_deletion_media_paths path
    where path.auth_user_id = v_user;
    if coalesce(array_length(v_paths, 1), 0) <> 2 then
        raise exception 'Storage cleanup paths were not captured';
    end if;

    update private.caregiver_account_deletion_jobs
    set status = 'PROCESSING',
        attempt_count = attempt_count + 1,
        processing_started_at = now(),
        claim_token = v_claim
    where auth_user_id = v_user;
    -- No Storage metadata was inserted for this fixture. This is the worker's
    -- idempotent "already absent" case after a successful Storage API remove.
    if public.ack_caregiver_account_deletion_media_paths(
        v_user, v_claim, v_paths
    ) <> 2 then
        raise exception 'Confirmed Storage paths were not acknowledged';
    end if;
    update auth.users set deleted_at = now() where id = v_user;
    select public.finalize_caregiver_account_deletion_job(v_user, v_claim)
    into v_finalized;
    if not v_finalized then
        raise exception 'Caregiver deletion finalization failed';
    end if;
    if not exists (
        select 1 from private.caregiver_account_deletion_jobs
        where auth_user_id = v_user and status = 'COMPLETED'
          and family_id is null and caregiver_id is null
    ) then
        raise exception 'Private job retained nonessential relationship IDs';
    end if;
    if not exists (
        select 1 from public.account_deletion_audit
        where action = 'CAREGIVER_DELETED' and completed_at is not null
          and family_id is null and caregiver_id is null and auth_user_id is null
          and metadata ->> 'storage_cleanup' = 'completed'
          and metadata ->> 'auth_cleanup' = 'completed_soft_delete'
    ) then
        raise exception 'Final audit identifiers were not scrubbed';
    end if;
end;
$$;

rollback;
