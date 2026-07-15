alter table public.push_notification_events
    drop constraint if exists push_notification_events_event_type_check;

alter table public.push_notification_events
    add constraint push_notification_events_event_type_check check (
        event_type in (
            'TIMELINE_COMMENT',
            'TIMELINE_REPLY',
            'FAMILY_CHAT',
            'RECORD_ALARM'
        )
    );

create or replace function public.record_alarm_target_route(p_log_type text)
returns text
language sql
immutable
set search_path = public
as $$
    select case upper(trim(coalesce(p_log_type, '')))
        when 'FEEDING' then '/feeding-add'
        when 'SLEEP' then '/sleep-add'
        when 'DIAPER' then '/diaper-add'
        when 'TEMPERATURE' then '/temperature-add'
        when 'MEDICINE' then '/medicine-add'
        when 'PUMPING' then '/pumping-add'
        when 'MEMO' then '/memo-add'
        when 'GROWTH' then '/growth-add'
        else '/quick-add'
    end;
$$;

create or replace function public.record_alarm_preference_enabled(
    p_preferences public.notification_preferences,
    p_log_type text
)
returns boolean
language sql
stable
set search_path = public
as $$
    select case upper(trim(coalesce(p_log_type, '')))
        when 'FEEDING' then coalesce(p_preferences.feeding_enabled, true)
        when 'MEDICINE' then coalesce(p_preferences.medicine_enabled, true)
        when 'GROWTH' then coalesce(p_preferences.growth_enabled, false)
        else true
    end;
$$;

create or replace function public.create_chat_message_checked(
    p_family_id bigint,
    p_body text,
    p_message_type text default 'TEXT',
    p_linked_task_id bigint default null
)
returns public.chat_messages
language plpgsql
set search_path = public
as $$
declare
    v_current public.caregivers%rowtype;
    v_task public.tasks%rowtype;
    v_message public.chat_messages%rowtype;
    v_body text := trim(coalesce(p_body, ''));
    v_message_type text := coalesce(p_message_type, 'TEXT');
    v_recipient_id bigint;
begin
    v_current := public.current_caregiver();
    if v_current.family_id <> p_family_id then raise exception 'Family access denied'; end if;
    if v_body = '' then raise exception 'Message body is required'; end if;
    if v_message_type not in ('TEXT', 'TASK_LINK', 'LOG_UPDATE') then raise exception 'Invalid chat message type'; end if;

    if p_linked_task_id is not null then
        select * into v_task from public.tasks where id = p_linked_task_id and family_id = p_family_id limit 1;
        if not found then raise exception 'Linked task was not found'; end if;
    end if;

    insert into public.chat_messages(family_id, sender_id, body, message_type, linked_task_id)
    values (p_family_id, v_current.id, v_body, v_message_type, p_linked_task_id)
    returning * into v_message;

    for v_recipient_id in
        select c.id
        from public.caregivers c
        join public.families f on f.id = c.family_id
        where c.family_id = p_family_id
          and c.id <> v_current.id
          and f.push_notifications_enabled
          and f.chat_notifications_enabled
    loop
        insert into public.push_notification_events(
            family_id,
            recipient_caregiver_id,
            actor_caregiver_id,
            event_type,
            title,
            body,
            data
        ) values (
            p_family_id,
            v_recipient_id,
            v_current.id,
            'FAMILY_CHAT',
            '새 가족 메시지',
            left(format('%s: %s', v_current.name, v_body), 180),
            jsonb_build_object(
                'chatMessageId', v_message.id,
                'route', '/timeline'
            )
        );
    end loop;

    return v_message;
end;
$$;

create or replace function public.enqueue_due_record_alarm_pushes(
    p_family_id bigint default null,
    p_limit integer default 50
)
returns integer
language plpgsql
set search_path = public
as $$
declare
    v_schedule record;
    v_recipient_id bigint;
    v_label text;
    v_body text;
    v_enqueued integer := 0;
    v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
begin
    for v_schedule in
        select
            s.*,
            l.entry_value,
            child.name as child_name,
            prefs as notification_preferences
        from public.record_alarm_schedules s
        join public.families f on f.id = s.family_id
        left join public.logs l on l.id = s.source_log_id
        left join public.children child on child.id = s.child_id
        left join public.notification_preferences prefs on prefs.family_id = s.family_id
        where s.status = 'SCHEDULED'
          and s.scheduled_for <= now()
          and f.push_notifications_enabled
          and (p_family_id is null or s.family_id = p_family_id)
          and public.record_alarm_preference_enabled(prefs, s.log_type)
        order by s.scheduled_for asc
        limit v_limit
        for update of s skip locked
    loop
        v_label := public.care_record_label(v_schedule.log_type);
        v_body := case
            when nullif(trim(coalesce(v_schedule.entry_value, '')), '') is not null then
                format('%s 기록할 시간이에요. (%s)', v_label, v_schedule.entry_value)
            when nullif(trim(coalesce(v_schedule.child_name, '')), '') is not null then
                format('%s %s 기록할 시간이에요.', v_schedule.child_name, v_label)
            else
                format('%s 기록할 시간이에요.', v_label)
        end;

        for v_recipient_id in
            select c.id
            from public.caregivers c
            where c.family_id = v_schedule.family_id
              and (
                v_schedule.notify_scope = 'FAMILY'
                or c.id = v_schedule.created_by_id
              )
        loop
            insert into public.push_notification_events(
                family_id,
                recipient_caregiver_id,
                actor_caregiver_id,
                event_type,
                title,
                body,
                data
            ) values (
                v_schedule.family_id,
                v_recipient_id,
                v_schedule.created_by_id,
                'RECORD_ALARM',
                format('%s 기록 알림', v_label),
                left(v_body, 180),
                jsonb_build_object(
                    'recordAlarmScheduleId', v_schedule.id,
                    'sourceLogId', v_schedule.source_log_id,
                    'logType', v_schedule.log_type,
                    'route', public.record_alarm_target_route(v_schedule.log_type)
                )
            );
            v_enqueued := v_enqueued + 1;
        end loop;

        update public.record_alarm_schedules
        set status = 'FIRED',
            updated_at = now()
        where id = v_schedule.id;
    end loop;

    update public.record_alarm_schedules s
    set status = 'DISMISSED',
        updated_at = now()
    from public.families f
    left join public.notification_preferences prefs on prefs.family_id = f.id
    where f.id = s.family_id
      and s.status = 'SCHEDULED'
      and s.scheduled_for <= now()
      and (p_family_id is null or s.family_id = p_family_id)
      and (
        not f.push_notifications_enabled
        or not public.record_alarm_preference_enabled(prefs, s.log_type)
      );

    return v_enqueued;
end;
$$;

revoke all on function public.record_alarm_target_route(text) from public, anon;
revoke all on function public.record_alarm_preference_enabled(public.notification_preferences, text) from public, anon;
revoke all on function public.enqueue_due_record_alarm_pushes(bigint, integer) from public, anon, authenticated;
revoke all on function public.create_chat_message_checked(bigint, text, text, bigint) from public, anon;

grant execute on function public.record_alarm_target_route(text) to authenticated, service_role;
grant execute on function public.record_alarm_preference_enabled(public.notification_preferences, text) to authenticated, service_role;
grant execute on function public.enqueue_due_record_alarm_pushes(bigint, integer) to service_role;
grant execute on function public.create_chat_message_checked(bigint, text, text, bigint) to authenticated;
