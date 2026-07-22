do $test$
declare
    v_family_id bigint;
    v_sender_id bigint;
    v_sender_auth_user_id uuid;
    v_active_id bigint;
    v_absent_id bigint;
    v_message public.family_chat_messages%rowtype;
    v_second_message public.family_chat_messages%rowtype;
    v_manual_event_id bigint;
    v_count integer;
begin
    select caregiver.family_id, caregiver.id, caregiver.auth_user_id
    into v_family_id, v_sender_id, v_sender_auth_user_id
    from public.caregivers caregiver
    where caregiver.auth_user_id is not null
    order by caregiver.id
    limit 1;

    if v_sender_auth_user_id is null then
        raise exception 'An authenticated caregiver is required for the integration test';
    end if;

    insert into public.caregivers(family_id, name, role, push_notifications_enabled, chat_notifications_enabled)
    values (v_family_id, '__presence_active_test__', 'GUARDIAN', true, true)
    returning id into v_active_id;

    insert into public.caregivers(family_id, name, role, push_notifications_enabled, chat_notifications_enabled)
    values (v_family_id, '__presence_absent_test__', 'GUARDIAN', true, true)
    returning id into v_absent_id;

    perform set_config('request.jwt.claim.sub', v_sender_auth_user_id::text, true);

    perform public.touch_family_chat_presence_checked(v_family_id, 'integration-sender-session-0001');
    if not exists (
        select 1
        from private.family_chat_presence_sessions
        where family_id = v_family_id
          and caregiver_id = v_sender_id
          and session_key = 'integration-sender-session-0001'
    ) then
        raise exception 'Presence touch did not create the sender session';
    end if;

    perform public.clear_family_chat_presence_checked(v_family_id, 'integration-sender-session-0001');
    if exists (
        select 1
        from private.family_chat_presence_sessions
        where family_id = v_family_id
          and caregiver_id = v_sender_id
          and session_key = 'integration-sender-session-0001'
    ) then
        raise exception 'Presence clear did not remove the sender session';
    end if;

    insert into private.family_chat_presence_sessions(family_id, caregiver_id, session_key, last_seen_at)
    values (v_family_id, v_active_id, 'integration-active-session-0001', clock_timestamp());

    v_message := public.create_family_chat_message_checked(
        v_family_id,
        '__presence_filter_test_message__',
        null
    );

    select count(*) into v_count
    from public.push_notification_events event
    where event.data ->> 'familyChatMessageId' = v_message.id::text
      and event.recipient_caregiver_id = v_active_id;
    if v_count <> 0 then
        raise exception 'Active chat recipient received % push events', v_count;
    end if;

    select count(*) into v_count
    from public.push_notification_events event
    where event.data ->> 'familyChatMessageId' = v_message.id::text
      and event.recipient_caregiver_id = v_absent_id;
    if v_count <> 1 then
        raise exception 'Absent chat recipient received % push events instead of 1', v_count;
    end if;

    select count(*) into v_count
    from public.push_notification_events event
    where event.data ->> 'familyChatMessageId' = v_message.id::text
      and event.recipient_caregiver_id = v_sender_id;
    if v_count <> 0 then
        raise exception 'Message sender received % push events', v_count;
    end if;

    insert into public.push_notification_events(
        family_id,
        recipient_caregiver_id,
        actor_caregiver_id,
        event_type,
        title,
        body,
        data
    ) values (
        v_family_id,
        v_active_id,
        v_sender_id,
        'FAMILY_CHAT',
        'integration claim test',
        'integration claim test',
        jsonb_build_object('integrationTest', true)
    ) returning id into v_manual_event_id;

    perform public.claim_pending_push_notification_events(
        v_family_id,
        array['FAMILY_CHAT', 'FAMILY_CHAT_MENTION'],
        100
    );

    if not exists (
        select 1
        from public.push_notification_events
        where id = v_manual_event_id
          and status = 'SKIPPED'
          and error_message = 'Recipient is viewing family chat'
    ) then
        raise exception 'Active chat event was not skipped during claim';
    end if;

    update private.family_chat_presence_sessions
    set last_seen_at = clock_timestamp() - interval '46 seconds'
    where family_id = v_family_id
      and caregiver_id = v_active_id;

    v_second_message := public.create_family_chat_message_checked(
        v_family_id,
        '__presence_expiry_test_message__',
        null
    );

    select count(*) into v_count
    from public.push_notification_events event
    where event.data ->> 'familyChatMessageId' = v_second_message.id::text
      and event.recipient_caregiver_id in (v_active_id, v_absent_id);
    if v_count <> 2 then
        raise exception 'Expired presence produced % recipient events instead of 2', v_count;
    end if;
end;
$test$;
