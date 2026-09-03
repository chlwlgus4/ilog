-- Disposable local/non-production database only. All fixtures roll back.
-- Never run this file against the linked production project.
begin isolation level repeatable read;

create function pg_temp.safety_assert(p_ok boolean, p_message text)
returns void language plpgsql as $$
begin
    if p_ok is distinct from true then raise exception '%', p_message; end if;
end;
$$;

create function pg_temp.safety_expect_error(p_sql text, p_expected text)
returns void language plpgsql as $$
begin
    begin
        execute p_sql;
    exception when others then
        if position(p_expected in sqlerrm) > 0 or sqlstate = p_expected then return; end if;
        raise exception 'Expected %, received %: %', p_expected, sqlstate, sqlerrm;
    end;
    raise exception 'Expected error %, but statement succeeded: %', p_expected, p_sql;
end;
$$;

create function pg_temp.safety_id(p_name text)
returns bigint language sql stable as $$
    select current_setting('ilog.safety.' || p_name)::bigint;
$$;

create function pg_temp.safety_login(p_name text)
returns void language plpgsql as $$
begin
    perform set_config('request.jwt.claims', jsonb_build_object(
        'sub', current_setting('ilog.safety.user_' || p_name),
        'session_id', current_setting('ilog.safety.session_' || p_name),
        'role', 'authenticated', 'is_anonymous', p_name = 'x'
    )::text, true);
end;
$$;

-- Each matrix case uses a subtransaction so successful reports do not consume
-- quota or hide another case's parent. Assertion failures are never swallowed.
create function pg_temp.safety_target_case(p_type text, p_id bigint, p_table text)
returns void language plpgsql as $$
declare v_result jsonb; v_visible boolean;
begin
    begin
        v_result:=public.report_safety_content_checked(p_type,p_id,'OTHER','검증용 신고 사유입니다.');
        perform pg_temp.safety_assert(v_result->>'status'='OPEN','Target type was not reportable: ' || p_type);
        perform pg_temp.safety_assert(public.get_my_content_safety_state_checked()->'hidden_targets'
            @> jsonb_build_array(jsonb_build_object('target_type',p_type,'target_id',p_id)), 'Target hide state missing: ' || p_type);
        if p_table is not null then
            execute format('select exists(select 1 from public.%I where id=$1)',p_table) into v_visible using p_id;
            perform pg_temp.safety_assert(not v_visible,'Reported target still visible: ' || p_type);
        end if;
        if p_type='RECORD_ATTACHMENT' then
            perform pg_temp.safety_assert(not public.content_safety_media_visible(current_setting('ilog.safety.attachment_path')),
                'Reported attachment media remained accessible');
        end if;
        raise exception using errcode='PZZ01',message='rollback successful target case';
    exception when sqlstate 'PZZ01' then null;
    end;
end;
$$;

do $$
declare
    v_family bigint;
    v_foreign_family bigint;
    v_child bigint;
    v_user uuid;
    v_session uuid;
    v_caregiver bigint;
    v_id bigint;
    v_message bigint;
    v_key text;
    v_author bigint;
begin
    insert into public.families(name, invite_code)
    values ('Safety family', 'SAFETY-' || gen_random_uuid()) returning id into v_family;
    insert into public.families(name, invite_code)
    values ('Other safety family', 'SAFETY-' || gen_random_uuid()) returning id into v_foreign_family;
    perform set_config('ilog.safety.family', v_family::text, true);
    perform set_config('ilog.safety.foreign_family', v_foreign_family::text, true);

    foreach v_key in array array['a', 'b', 'c', 'd', 'x'] loop
        v_user := gen_random_uuid();
        v_session := gen_random_uuid();
        insert into auth.users(instance_id, id, aud, role, email, encrypted_password,
            email_confirmed_at, raw_app_meta_data, raw_user_meta_data, is_anonymous, created_at, updated_at)
        values ('00000000-0000-0000-0000-000000000000', v_user, 'authenticated', 'authenticated',
            'safety-' || v_key || '@example.test', '', now(),
            '{"provider":"email","providers":["email"]}', '{}', v_key = 'x', now(), now());
        insert into auth.sessions(id, user_id, created_at, updated_at)
        values (v_session, v_user, now(), now());
        insert into public.caregivers(family_id, auth_user_id, name, role)
        values (case when v_key = 'd' then v_foreign_family else v_family end,
            v_user, 'Safety ' || upper(v_key), 'GUARDIAN') returning id into v_caregiver;
        insert into public.caregiver_legal_consents(caregiver_id, auth_user_id, document_type, document_version)
        values (v_caregiver, v_user, 'TERMS', '2026-09-02'),
            (v_caregiver, v_user, 'PRIVACY', '2026-09-02');
        perform set_config('ilog.safety.user_' || v_key, v_user::text, true);
        perform set_config('ilog.safety.session_' || v_key, v_session::text, true);
        perform set_config('ilog.safety.caregiver_' || v_key, v_caregiver::text, true);
        insert into public.family_chat_messages(family_id, sender_caregiver_id, body)
        values (case when v_key = 'd' then v_foreign_family else v_family end,
            v_caregiver, 'Safe family message ' || v_key) returning id into v_id;
        perform set_config('ilog.safety.family_chat_' || v_key, v_id::text, true);
        insert into public.chat_messages(family_id, sender_id, body)
        values (case when v_key = 'd' then v_foreign_family else v_family end,
            v_caregiver, 'Safe timeline message ' || v_key) returning id into v_message;
        perform set_config('ilog.safety.chat_' || v_key, v_message::text, true);
        insert into public.timeline_comments(family_id, chat_message_id, author_caregiver_id, body)
        values (case when v_key = 'd' then v_foreign_family else v_family end,
            v_message, v_caregiver, 'Safe comment ' || v_key) returning id into v_id;
        perform set_config('ilog.safety.comment_' || v_key, v_id::text, true);
    end loop;
    update public.families set owner_caregiver_id = pg_temp.safety_id('caregiver_a') where id = v_family;
    insert into public.children(family_id, name, birth_date, stage)
    values (v_family, 'Safety child', current_date, 'INFANT') returning id into v_child;
    perform set_config('ilog.safety.child', v_child::text, true);
    v_author := pg_temp.safety_id('caregiver_b');
    insert into public.logs(family_id, child_id, caregiver_id, type, entry_value, recorded_at)
    values (v_family, v_child, v_author, 'MEMO', '아기 예방접종 후 열이 났어요', now()) returning id into v_id;
    perform set_config('ilog.safety.log_b', v_id::text, true);
    insert into public.record_attachments(family_id,child_id,log_id,created_by_id,image_url,caption)
    values(v_family,v_child,v_id,v_author,'photos/' || v_family || '/attachment.jpg','Safe attachment') returning id into v_id;
    perform set_config('ilog.safety.attachment_b',v_id::text,true);
    perform set_config('ilog.safety.attachment_path','photos/' || v_family || '/attachment.jpg',true);
    update public.family_chat_messages set image_storage_path='chat/' || v_family || '/safety.jpg'
    where id=pg_temp.safety_id('family_chat_b');
    perform set_config('ilog.safety.chat_path','chat/' || v_family || '/safety.jpg',true);
    insert into storage.objects(bucket_id,name,owner,metadata) values
        ('family-media','chat/' || v_family || '/safety.jpg',current_setting('ilog.safety.user_b')::uuid,'{}'),
        ('family-media','photos/' || v_family || '/attachment.jpg',current_setting('ilog.safety.user_b')::uuid,'{}');
    insert into public.tasks(family_id, child_id, created_by_id, title, due_at)
    values (v_family, v_child, v_author, 'Safe task', now()) returning id into v_id;
    perform set_config('ilog.safety.task_b', v_id::text, true);
    insert into public.schedules(family_id, child_id, created_by_id, title, category, start_at, end_at)
    values (v_family, v_child, v_author, 'Safe schedule', 'HOME', now(), now() + interval '1 hour') returning id into v_id;
    perform set_config('ilog.safety.schedule_b', v_id::text, true);
    insert into public.memory_entries(family_id, child_id, created_by_id, title, happened_at)
    values (v_family, v_child, v_author, 'Safe memory', now()) returning id into v_id;
    perform set_config('ilog.safety.memory_b', v_id::text, true);
    insert into public.family_photos(family_id, created_by_id, storage_path, caption)
    values (v_family, v_author, 'photos/' || v_family || '/safety.jpg', 'Safe photo') returning id into v_id;
    perform set_config('ilog.safety.photo_b', v_id::text, true);
    insert into public.growth_measurements(family_id, child_id, caregiver_id, measured_at, weight_kg, note)
    values (v_family, v_child, v_author, now(), 3.5, 'Safe growth') returning id into v_id;
    perform set_config('ilog.safety.growth_b', v_id::text, true);
    insert into public.vaccination_records(family_id, child_id, created_by_id, name, due_at)
    values (v_family, v_child, v_author, 'Safe vaccine', now()) returning id into v_id;
    perform set_config('ilog.safety.vaccine_b', v_id::text, true);
    insert into public.hospital_visits(family_id, child_id, created_by_id, hospital_name, visited_at)
    values (v_family, v_child, v_author, 'Safe hospital', now()) returning id into v_id;
    perform set_config('ilog.safety.hospital_b', v_id::text, true);
    for v_id in 1..25 loop
        insert into public.family_chat_messages(family_id, sender_caregiver_id, body)
        values (v_family, v_author, 'Rate limit fixture ' || v_id) returning id into v_message;
        perform set_config('ilog.safety.rate_' || v_id, v_message::text, true);
    end loop;
end;
$$;

-- Anonymous Postgres clients and actual anonymous Auth users cannot report/block.
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare v_health jsonb; v_key text; v_value jsonb;
begin
    v_health := public.get_content_safety_operations_status_checked();
    perform pg_temp.safety_assert((select count(*) from jsonb_object_keys(v_health)) = 12
        and v_health ?& array[
            'checked_at','open_reports','urgent_unreviewed_reports','overdue_reports',
            'stale_deletions','failed_deletions','apple_manual_required','stale_apple_revocations',
            'failed_push_events','stale_push_events','unhealthy_cron_jobs','failed_worker_requests'
        ],
        'Operations response has unexpected fields');
    for v_key, v_value in select * from jsonb_each(v_health) loop
        if v_key <> 'checked_at' then
            perform pg_temp.safety_assert(jsonb_typeof(v_value) = 'number' and v_value::text::integer >= 0,
                'Operations field is not a nonnegative count: ' || v_key);
        end if;
    end loop;
    perform set_config('ilog.safety.health_baseline',v_health::text,true);
end;
$$;
reset role;
set local role anon;
select set_config('request.jwt.claims', '{}', true);
select pg_temp.safety_expect_error(
    'select public.report_safety_content_checked(''FAMILY_CHAT_MESSAGE'', 1, ''SPAM'', null)', '42501');
select pg_temp.safety_expect_error('select public.block_caregiver_checked(1)', '42501');
select pg_temp.safety_expect_error('select public.get_content_safety_operations_status_checked()', '42501');
select pg_temp.safety_expect_error('select public.list_safety_reports_checked()', '42501');
select pg_temp.safety_expect_error('select public.moderate_safety_report_checked(1,''IN_REVIEW'',null)', '42501');
reset role;
set local role authenticated;
select pg_temp.safety_login('x');
-- A forged non-anonymous JWT hint cannot override the Auth server's flag.
select set_config('request.jwt.claims',(current_setting('request.jwt.claims')::jsonb || '{"is_anonymous":false}'::jsonb)::text,true);
select pg_temp.safety_expect_error(format(
    'select public.report_safety_content_checked(''FAMILY_CHAT_MESSAGE'', %s, ''SPAM'', null)',
    pg_temp.safety_id('family_chat_b')), 'CONTENT_SAFETY');
select pg_temp.safety_expect_error(format('select public.block_caregiver_checked(%s)',
    pg_temp.safety_id('caregiver_b')), 'CONTENT_SAFETY');

select pg_temp.safety_login('a');
select pg_temp.safety_expect_error('select public.get_content_safety_operations_status_checked()', '42501');
select pg_temp.safety_expect_error('select public.list_safety_reports_checked()', '42501');
select pg_temp.safety_expect_error('select public.moderate_safety_report_checked(1,''IN_REVIEW'',null)', '42501');
select pg_temp.safety_expect_error('select public.can_deliver_content_safety_push_checked(1)', '42501');
select pg_temp.safety_expect_error(format(
    'select public.report_safety_content_checked(''FAMILY_CHAT_MESSAGE'', %s, ''SPAM'', null)',
    pg_temp.safety_id('family_chat_d')), 'CONTENT_SAFETY_TARGET_NOT_FOUND');
select pg_temp.safety_expect_error(format('select public.block_caregiver_checked(%s)',
    pg_temp.safety_id('caregiver_d')), 'CONTENT_SAFETY_TARGET_NOT_FOUND');
select pg_temp.safety_expect_error(format(
    'select public.report_safety_content_checked(''FAMILY_CHAT_MESSAGE'', %s, ''SPAM'', null)',
    pg_temp.safety_id('family_chat_a')), 'CONTENT_SAFETY_SELF_REPORT');
select pg_temp.safety_expect_error(format('select public.block_caregiver_checked(%s)',
    pg_temp.safety_id('caregiver_a')), 'CONTENT_SAFETY');
select pg_temp.safety_expect_error('select public.report_safety_content_checked('''', 1, ''SPAM'', null)', 'CONTENT_SAFETY_INVALID_INPUT');
select pg_temp.safety_expect_error('select public.report_safety_content_checked(''FAMILY_CHAT_MESSAGE'', null, ''SPAM'', null)', 'CONTENT_SAFETY_INVALID_INPUT');
select pg_temp.safety_expect_error(format(
    'select public.report_safety_content_checked(''FAMILY_CHAT_MESSAGE'', %s, '''', null)',
    pg_temp.safety_id('family_chat_b')), 'CONTENT_SAFETY_INVALID_INPUT');
select pg_temp.safety_expect_error(format(
    'select public.report_safety_content_checked(''FAMILY_CHAT_MESSAGE'', %s, ''OTHER'', ''short'')',
    pg_temp.safety_id('family_chat_b')), 'CONTENT_SAFETY_INVALID_INPUT');
select pg_temp.safety_expect_error(format(
    'select public.report_safety_content_checked(''FAMILY_CHAT_MESSAGE'', %s, ''SPAM'', repeat(''x'', 1001))',
    pg_temp.safety_id('family_chat_b')), 'CONTENT_SAFETY_INVALID_INPUT');

-- Report identity is server-derived; clients cannot inspect or forge private reports.
select pg_temp.safety_expect_error('select * from private.safety_reports', '42501');
select pg_temp.safety_expect_error('insert into private.safety_reports default values', '42501');
do $$
declare v_first jsonb; v_again jsonb; v_state jsonb;
begin
    v_first := public.report_safety_content_checked('FAMILY_CHAT_MESSAGE', pg_temp.safety_id('family_chat_b'), 'SPAM', null);
    v_again := public.report_safety_content_checked('FAMILY_CHAT_MESSAGE', pg_temp.safety_id('family_chat_b'), 'SPAM', null);
    perform pg_temp.safety_assert(v_first ->> 'status' = 'OPEN', 'New report was not OPEN');
    perform pg_temp.safety_assert((v_first ->> 'already_reported')::boolean = false, 'New report marked duplicate');
    perform pg_temp.safety_assert(v_again ->> 'report_id' = v_first ->> 'report_id'
        and (v_again ->> 'already_reported')::boolean, 'Duplicate report was not idempotent');
    perform set_config('ilog.safety.report', v_first ->> 'report_id', true);
    v_state := public.get_my_content_safety_state_checked();
    perform pg_temp.safety_assert(v_state -> 'hidden_targets' @> jsonb_build_array(jsonb_build_object(
        'target_type', 'FAMILY_CHAT_MESSAGE', 'target_id', pg_temp.safety_id('family_chat_b'))), 'Reported target missing from own hide state');
    perform pg_temp.safety_assert(not exists(select 1 from public.family_chat_messages where id = pg_temp.safety_id('family_chat_b')),
        'Reporter can still read reported content');
    perform pg_temp.safety_assert(not exists(select 1 from storage.objects where bucket_id='family-media' and name=current_setting('ilog.safety.chat_path')),
        'Reporter can still request media for hidden chat');
end;
$$;
select pg_temp.safety_login('c');
select pg_temp.safety_assert(exists(select 1 from public.family_chat_messages where id = pg_temp.safety_id('family_chat_b')),
    'Report unexpectedly hid content from another caregiver');
select pg_temp.safety_assert(public.get_my_content_safety_state_checked() -> 'hidden_targets' = '[]'::jsonb,
    'Another caregiver can discover reporter hide state');
select pg_temp.safety_target_case('FAMILY_CHAT_MESSAGE',pg_temp.safety_id('family_chat_b'),'family_chat_messages');
select pg_temp.safety_target_case('CHAT_MESSAGE',pg_temp.safety_id('chat_b'),'chat_messages');
select pg_temp.safety_target_case('TIMELINE_COMMENT',pg_temp.safety_id('comment_b'),'timeline_comments');
select pg_temp.safety_target_case('FAMILY_PHOTO',pg_temp.safety_id('photo_b'),'family_photos');
select pg_temp.safety_target_case('RECORD_ATTACHMENT',pg_temp.safety_id('attachment_b'),'record_attachments');
select pg_temp.safety_target_case('LOG',pg_temp.safety_id('log_b'),'logs');
select pg_temp.safety_target_case('GROWTH_MEASUREMENT',pg_temp.safety_id('growth_b'),'growth_measurements');
select pg_temp.safety_target_case('VACCINATION_RECORD',pg_temp.safety_id('vaccine_b'),'vaccination_records');
select pg_temp.safety_target_case('HOSPITAL_VISIT',pg_temp.safety_id('hospital_b'),'hospital_visits');
select pg_temp.safety_target_case('MEMORY_ENTRY',pg_temp.safety_id('memory_b'),'memory_entries');
select pg_temp.safety_target_case('TASK',pg_temp.safety_id('task_b'),'tasks');
select pg_temp.safety_target_case('SCHEDULE',pg_temp.safety_id('schedule_b'),'schedules');
select pg_temp.safety_target_case('CAREGIVER',pg_temp.safety_id('caregiver_b'),null);

-- Blocking is idempotent, private, and bilateral for communication, not shared records.
select pg_temp.safety_login('a');
select public.block_caregiver_checked(pg_temp.safety_id('caregiver_b'));
select public.block_caregiver_checked(pg_temp.safety_id('caregiver_b'));
select pg_temp.safety_assert((select count(*) from public.list_blocked_caregivers_checked()) = 1,
    'Repeated block created duplicate list entries');
select pg_temp.safety_assert(not exists(select 1 from public.chat_messages where id = pg_temp.safety_id('chat_b')),
    'Blocker can read blocked timeline communication');
select pg_temp.safety_assert(not exists(select 1 from public.timeline_comments where id = pg_temp.safety_id('comment_b')),
    'Blocker can read blocked comments');
select pg_temp.safety_assert(exists(select 1 from public.tasks where id = pg_temp.safety_id('task_b'))
    and exists(select 1 from public.logs where id = pg_temp.safety_id('log_b')),
    'Block incorrectly removed shared caregiving records');
select pg_temp.safety_expect_error(format('select public.create_timeline_comment_checked(%s, %s, null, ''Blocked comment'')',
    pg_temp.safety_id('family'), pg_temp.safety_id('chat_b')), 'Timeline item was not found');
select pg_temp.safety_expect_error(format('insert into public.timeline_comments(family_id,chat_message_id,author_caregiver_id,body) values (%s,%s,%s,''Blocked direct comment'')',
    pg_temp.safety_id('family'),pg_temp.safety_id('chat_b'),pg_temp.safety_id('caregiver_a')), 'CAREGIVER_CONTACT_BLOCKED');
select pg_temp.safety_expect_error(format('select public.create_family_chat_message_checked(%s, ''@Safety B hello'', null)',
    pg_temp.safety_id('family')), 'CAREGIVER_CONTACT_BLOCKED');
select pg_temp.safety_login('b');
select pg_temp.safety_assert(public.get_my_content_safety_state_checked()->'blocked_caregiver_ids'
    @> jsonb_build_array(pg_temp.safety_id('caregiver_a')), 'Inbound block missing from cache invalidation state');
select pg_temp.safety_assert(not exists(select 1 from public.family_chat_messages where id = pg_temp.safety_id('family_chat_a'))
    and not exists(select 1 from public.chat_messages where id = pg_temp.safety_id('chat_a')),
    'Blocked caregiver can still read blocker communication');
select pg_temp.safety_expect_error(format('select public.create_timeline_comment_checked(%s, %s, null, ''Reverse blocked comment'')',
    pg_temp.safety_id('family'), pg_temp.safety_id('chat_a')), 'Timeline item was not found');
select pg_temp.safety_expect_error(format('insert into public.timeline_comments(family_id,chat_message_id,author_caregiver_id,body) values (%s,%s,%s,''Reverse blocked direct comment'')',
    pg_temp.safety_id('family'),pg_temp.safety_id('chat_a'),pg_temp.safety_id('caregiver_b')), 'CAREGIVER_CONTACT_BLOCKED');
select pg_temp.safety_expect_error(format('select public.create_family_chat_message_checked(%s, ''@Safety A hello'', null)',
    pg_temp.safety_id('family')), 'CAREGIVER_CONTACT_BLOCKED');
select public.create_family_chat_message_checked(pg_temp.safety_id('family'), 'Safe message to unblocked family members', null);
reset role;
select pg_temp.safety_assert(not exists(select 1 from public.push_notification_events
    where actor_caregiver_id = pg_temp.safety_id('caregiver_b') and recipient_caregiver_id = pg_temp.safety_id('caregiver_a')
      and status = 'PENDING'), 'Blocked contact generated a pending personal push');
set local role authenticated;
select pg_temp.safety_login('c');
select pg_temp.safety_assert(exists(select 1 from public.chat_messages where id = pg_temp.safety_id('chat_a'))
    and exists(select 1 from public.chat_messages where id = pg_temp.safety_id('chat_b')), 'Unblocked caregiver lost communication');
select pg_temp.safety_login('a');
select public.unblock_caregiver_checked(pg_temp.safety_id('caregiver_b'));
select public.unblock_caregiver_checked(pg_temp.safety_id('caregiver_b'));
select pg_temp.safety_assert(exists(select 1 from public.chat_messages where id = pg_temp.safety_id('chat_b')),
    'Unblock did not restore communication');
select pg_temp.safety_assert(not exists(select 1 from public.family_chat_messages where id = pg_temp.safety_id('family_chat_b')),
    'Unblock incorrectly removed an independent report hide');
select pg_temp.safety_login('b');
do $$
declare v_message public.family_chat_messages%rowtype;
begin
    v_message:=public.create_family_chat_message_checked(pg_temp.safety_id('family'),'Delivery race fixture',null);
    perform set_config('ilog.safety.delivery_message',v_message.id::text,true);
end;
$$;
reset role;
select set_config('ilog.safety.delivery_event',(select id::text from public.push_notification_events
    where family_id=pg_temp.safety_id('family') and recipient_caregiver_id=pg_temp.safety_id('caregiver_a')
      and data->>'familyChatMessageId'=current_setting('ilog.safety.delivery_message') order by id desc limit 1),true);
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $$ begin
    perform public.claim_pending_push_notification_events(pg_temp.safety_id('family'),null,100);
    perform pg_temp.safety_assert(public.can_deliver_content_safety_push_checked(pg_temp.safety_id('delivery_event')),
        'Unblocked claimed event was not deliverable');
end; $$;
reset role;
set local role authenticated;
select pg_temp.safety_login('a');
select public.block_caregiver_checked(pg_temp.safety_id('caregiver_b'));
reset role;
select pg_temp.safety_assert((select status='SKIPPED' from public.push_notification_events where id=pg_temp.safety_id('delivery_event')),
    'Blocking did not invalidate an already claimed event');
do $$
declare v_event public.push_notification_events%rowtype;
begin
    insert into public.push_notification_events(family_id,actor_caregiver_id,recipient_caregiver_id,event_type,title,body)
    values(pg_temp.safety_id('family'),pg_temp.safety_id('caregiver_b'),pg_temp.safety_id('caregiver_a'),'FAMILY_CHAT','Blocked push','Safe fixture') returning * into v_event;
    perform pg_temp.safety_assert(v_event.status='SKIPPED','Direct push insertion bypassed a block');
end; $$;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select pg_temp.safety_assert(not public.can_deliver_content_safety_push_checked(pg_temp.safety_id('delivery_event')),
    'Final delivery recheck allowed an event blocked after claim');
reset role;
set local role authenticated;
select pg_temp.safety_login('a');
select public.unblock_caregiver_checked(pg_temp.safety_id('caregiver_b'));
reset role;

-- Filters must protect direct Data API writes and pre-existing checked RPCs.
set local role authenticated;
select pg_temp.safety_login('a');
do $$
declare
    v_family bigint := pg_temp.safety_id('family');
    v_child bigint := pg_temp.safety_id('child');
    v_actor bigint := pg_temp.safety_id('caregiver_a');
    v_sql text;
    v_bad text := '너를 죽여버리겠다';
begin
    foreach v_sql in array array[
        format('insert into public.family_chat_messages(family_id,sender_caregiver_id,body) values (%s,%s,%L)', v_family,v_actor,v_bad),
        format('insert into public.chat_messages(family_id,sender_id,body) values (%s,%s,%L)', v_family,v_actor,v_bad),
        format('insert into public.timeline_comments(family_id,chat_message_id,author_caregiver_id,body) values (%s,%s,%s,%L)', v_family,pg_temp.safety_id('chat_a'),v_actor,v_bad),
        format('insert into public.family_photos(family_id,created_by_id,storage_path,caption) values (%s,%s,%L,%L)', v_family,v_actor,'photos/' || v_family || '/filtered.jpg',v_bad),
        format('insert into public.logs(family_id,child_id,caregiver_id,type,entry_value,recorded_at) values (%s,%s,%s,''MEMO'',%L,now())',v_family,v_child,v_actor,v_bad),
        format('insert into public.logs(family_id,child_id,caregiver_id,type,entry_value,recorded_at,details) values (%s,%s,%s,''MEMO'',''Safe label'',now(),jsonb_build_object(''note'',%L))',v_family,v_child,v_actor,v_bad),
        format('insert into public.tasks(family_id,created_by_id,title,due_at) values (%s,%s,%L,now())',v_family,v_actor,v_bad),
        format('insert into public.schedules(family_id,created_by_id,title,category,start_at,end_at,note) values (%s,%s,''Safe schedule'',''HOME'',now(),now(),%L)',v_family,v_actor,v_bad),
        format('insert into public.memory_entries(family_id,created_by_id,title,happened_at) values (%s,%s,%L,now())',v_family,v_actor,v_bad),
        format('insert into public.growth_measurements(family_id,child_id,caregiver_id,measured_at,weight_kg,note) values (%s,%s,%s,now(),3.5,%L)',v_family,v_child,v_actor,v_bad),
        format('insert into public.vaccination_records(family_id,child_id,created_by_id,name,due_at,note) values (%s,%s,%s,''Vaccine'',now(),%L)',v_family,v_child,v_actor,v_bad),
        format('insert into public.hospital_visits(family_id,child_id,created_by_id,hospital_name,visited_at,diagnosis) values (%s,%s,%s,''Hospital'',now(),%L)',v_family,v_child,v_actor,v_bad),
        format('select public.create_family_chat_message_checked(%s,%L,null)',v_family,v_bad),
        format('select public.create_chat_message_checked(%s,%L,''TEXT'',null)',v_family,v_bad),
        format('select public.create_timeline_comment_checked(%s,%s,null,%L)',v_family,pg_temp.safety_id('chat_a'),v_bad),
        format('select public.create_family_photo_checked(%s,%L,%L)',v_family,'photos/' || v_family || '/filtered-rpc.jpg',v_bad),
        format('select public.create_schedule_with_chat(%s,%s,%L,''HOME'',now(),now(),null)',v_family,v_child,v_bad)
    ] loop
        perform pg_temp.safety_expect_error(v_sql, 'CONTENT_SAFETY_FILTERED');
    end loop;
    perform public.create_family_chat_message_checked(v_family, '아기 예방접종 후 열이 났어요', null);
end;
$$;
reset role;

-- Rate limits count unique reports, not idempotent retries: 5/hour, 20/day.
set local role authenticated;
select pg_temp.safety_login('c');
do $$
begin
    for i in 1..5 loop
        perform public.report_safety_content_checked('FAMILY_CHAT_MESSAGE', pg_temp.safety_id('rate_' || i), 'SPAM', null);
    end loop;
    perform public.report_safety_content_checked('FAMILY_CHAT_MESSAGE', pg_temp.safety_id('rate_1'), 'SPAM', null);
    perform pg_temp.safety_expect_error(format('select public.report_safety_content_checked(''FAMILY_CHAT_MESSAGE'',%s,''SPAM'',null)',
        pg_temp.safety_id('rate_6')), 'CONTENT_SAFETY_RATE_LIMITED');
end;
$$;
reset role;
update private.safety_reports set created_at = now() - interval '2 hours' where reporter_caregiver_id = pg_temp.safety_id('caregiver_c');
set local role authenticated;
select pg_temp.safety_login('c');
do $$ begin for i in 6..10 loop
    perform public.report_safety_content_checked('FAMILY_CHAT_MESSAGE',pg_temp.safety_id('rate_' || i),'SPAM',null);
end loop; end; $$;
reset role;
update private.safety_reports set created_at = now() - interval '2 hours' where reporter_caregiver_id = pg_temp.safety_id('caregiver_c');
set local role authenticated;
select pg_temp.safety_login('c');
do $$ begin for i in 11..15 loop
    perform public.report_safety_content_checked('FAMILY_CHAT_MESSAGE',pg_temp.safety_id('rate_' || i),'SPAM',null);
end loop; end; $$;
reset role;
update private.safety_reports set created_at = now() - interval '2 hours' where reporter_caregiver_id = pg_temp.safety_id('caregiver_c');
set local role authenticated;
select pg_temp.safety_login('c');
do $$ begin for i in 16..20 loop
    perform public.report_safety_content_checked('FAMILY_CHAT_MESSAGE',pg_temp.safety_id('rate_' || i),'SPAM',null);
end loop; end; $$;
reset role;
update private.safety_reports set created_at = now() - interval '2 hours' where reporter_caregiver_id = pg_temp.safety_id('caregiver_c');
set local role authenticated;
select pg_temp.safety_login('c');
select pg_temp.safety_expect_error(format('select public.report_safety_content_checked(''FAMILY_CHAT_MESSAGE'',%s,''SPAM'',null)',
    pg_temp.safety_id('rate_21')), 'CONTENT_SAFETY_RATE_LIMITED');
reset role;

-- A service role must also supply the trusted role claim; no client moderation.
set local role service_role;
select set_config('request.jwt.claims', '{}', true);
select pg_temp.safety_expect_error('select public.get_content_safety_operations_status_checked()', 'OPERATIONS_SERVICE_ROLE_REQUIRED');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select pg_temp.safety_assert(exists(select 1 from jsonb_array_elements(public.list_safety_reports_checked(null,100,null)) r
    where (r->>'id')::bigint=pg_temp.safety_id('report')), 'Moderator queue is missing the fixture report');
select pg_temp.safety_assert(public.moderate_safety_report_checked(pg_temp.safety_id('report'),'IN_REVIEW','Review fixture') ->> 'status' = 'IN_REVIEW',
    'Review action did not move report to IN_REVIEW');
select public.moderate_safety_report_checked(pg_temp.safety_id('report'),'HIDE_CONTENT','Hide fixture');
reset role;
set local role authenticated;
select pg_temp.safety_login('c');
select pg_temp.safety_assert(not exists(select 1 from public.family_chat_messages where id = pg_temp.safety_id('family_chat_b')),
    'Moderation hide did not hide content from other caregivers');
select pg_temp.safety_assert(public.get_my_content_safety_state_checked()->'hidden_targets'
    @> jsonb_build_array(jsonb_build_object('target_type','FAMILY_CHAT_MESSAGE','target_id',pg_temp.safety_id('family_chat_b'))),
    'Moderation hide missing from cache invalidation state');
select pg_temp.safety_login('b');
select pg_temp.safety_assert(exists(select 1 from public.family_chat_messages where id = pg_temp.safety_id('family_chat_b')),
    'Moderation hide prevented author from managing their own content');
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select public.moderate_safety_report_checked(pg_temp.safety_id('report'),'RESTORE_CONTENT','Restore fixture');
select public.moderate_safety_report_checked(pg_temp.safety_id('report'),'RESTRICT_USER','Restriction fixture');
reset role;
set local role authenticated;
select pg_temp.safety_login('c');
select pg_temp.safety_assert(exists(select 1 from public.family_chat_messages where id = pg_temp.safety_id('family_chat_b')),
    'Moderation restore did not restore global visibility');
select pg_temp.safety_login('a');
select pg_temp.safety_assert(not exists(select 1 from public.family_chat_messages where id = pg_temp.safety_id('family_chat_b')),
    'Moderation restore erased reporter personal hide');
select pg_temp.safety_login('b');
select pg_temp.safety_expect_error(format('select public.create_family_chat_message_checked(%s,''Restricted write'',null)',pg_temp.safety_id('family')),
    'CONTENT_SAFETY_USER_RESTRICTED');
select pg_temp.safety_expect_error(format('insert into public.chat_messages(family_id,sender_id,body) values (%s,%s,''Restricted direct write'')',
    pg_temp.safety_id('family'),pg_temp.safety_id('caregiver_b')), 'CONTENT_SAFETY_USER_RESTRICTED');
select pg_temp.safety_expect_error(format('update public.caregivers set image_url=%L where id=%s',
    'photos/' || pg_temp.safety_id('family') || '/restricted-profile.jpg',pg_temp.safety_id('caregiver_b')), 'CONTENT_SAFETY_USER_RESTRICTED');
select pg_temp.safety_assert(not public.content_safety_upload_allowed(),'Restricted caregiver can upload media');
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select public.moderate_safety_report_checked(pg_temp.safety_id('report'),'UNRESTRICT_USER','Unrestrict fixture');
select pg_temp.safety_assert(public.moderate_safety_report_checked(pg_temp.safety_id('report'),'DISMISS','Dismiss fixture') ->> 'status' = 'DISMISSED',
    'Dismiss action did not close report');
reset role;
set local role authenticated;
select pg_temp.safety_login('b');
select public.create_family_chat_message_checked(pg_temp.safety_id('family'),'Safe write after restriction removed',null);
reset role;

-- Operational health returns only counts, with urgent/overdue thresholds applied.
update private.safety_reports set status='OPEN',reason='CHILD_SAFETY',created_at=now()-interval '2 hours',resolved_at=null
where id=pg_temp.safety_id('report');
update private.safety_reports set status='OPEN',created_at=now()-interval '25 hours'
where reporter_caregiver_id=pg_temp.safety_id('caregiver_c') and target_id=pg_temp.safety_id('rate_1');
update private.safety_reports set status='IN_REVIEW',created_at=now()-interval '73 hours'
where reporter_caregiver_id=pg_temp.safety_id('caregiver_c') and target_id=pg_temp.safety_id('rate_2');
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare v_health jsonb; v_baseline jsonb:=current_setting('ilog.safety.health_baseline')::jsonb; v_key text; v_value jsonb;
begin
    v_health:=public.get_content_safety_operations_status_checked();
    perform pg_temp.safety_assert((v_health->>'open_reports')::integer=(v_baseline->>'open_reports')::integer+21
        and (v_health->>'urgent_unreviewed_reports')::integer=(v_baseline->>'urgent_unreviewed_reports')::integer+1
        and (v_health->>'overdue_reports')::integer=(v_baseline->>'overdue_reports')::integer+2, 'Operations SLA report counts are incorrect');
    perform pg_temp.safety_assert((select count(*) from jsonb_object_keys(v_health))=12
        and v_health ?& array[
            'checked_at','open_reports','urgent_unreviewed_reports','overdue_reports',
            'stale_deletions','failed_deletions','apple_manual_required','stale_apple_revocations',
            'failed_push_events','stale_push_events','unhealthy_cron_jobs','failed_worker_requests'
        ],
        'Operations status exposed unexpected fields');
    for v_key,v_value in select * from jsonb_each(v_health) loop
        if v_key<>'checked_at' then
            perform pg_temp.safety_assert(jsonb_typeof(v_value)='number' and v_value::text::integer>=0,
                'Operations status exposed a non-count value');
        end if;
    end loop;
end;
$$;
reset role;

-- Deletion must remove report details/relationships without blocking existing RPCs.
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select public.moderate_safety_report_checked(pg_temp.safety_id('report'),'RESTRICT_USER','Deletion compatibility fixture');
reset role;
set local role authenticated;
select pg_temp.safety_login('a');
select public.block_caregiver_checked(pg_temp.safety_id('caregiver_b'));
select public.request_caregiver_account_deletion_v2_checked();
reset role;
select pg_temp.safety_assert(not exists(select 1 from private.safety_reports where reporter_caregiver_id=pg_temp.safety_id('caregiver_a'))
    and not exists(select 1 from private.caregiver_blocks where blocker_caregiver_id=pg_temp.safety_id('caregiver_a') or blocked_caregiver_id=pg_temp.safety_id('caregiver_a'))
    and not exists(select 1 from private.reported_content_hides where caregiver_id=pg_temp.safety_id('caregiver_a')),
    'Reporter deletion retained private safety data');
select pg_temp.safety_assert(exists(select 1 from public.caregivers where id=pg_temp.safety_id('caregiver_b')),
    'Reporter deletion removed another caregiver');
set local role authenticated;
select pg_temp.safety_login('b');
select public.request_caregiver_account_deletion_v2_checked();
reset role;
select pg_temp.safety_assert(not exists(select 1 from private.safety_reports where reported_caregiver_id=pg_temp.safety_id('caregiver_b')),
    'Reported caregiver deletion retained report details');
select set_config('request.jwt.claims','{}',true);
delete from public.families where id=pg_temp.safety_id('family');
select pg_temp.safety_assert(not exists(select 1 from private.safety_reports where family_id=pg_temp.safety_id('family'))
    and not exists(select 1 from private.caregiver_blocks where family_id=pg_temp.safety_id('family'))
    and not exists(select 1 from private.reported_content_hides where family_id=pg_temp.safety_id('family'))
    and not exists(select 1 from private.moderation_content_hides where family_id=pg_temp.safety_id('family'))
    and not exists(select 1 from private.moderation_restrictions where family_id=pg_temp.safety_id('family')),
    'Family cascade retained private safety relationships');

rollback;
select 'content safety integration checks passed' as result;
