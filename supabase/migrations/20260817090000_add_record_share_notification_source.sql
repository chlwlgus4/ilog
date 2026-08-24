-- Distinguish records whose numeric IDs come from independent tables.
-- Existing clients ignore recordSource and continue to use the existing route fallback.

drop policy if exists push_notification_events_insert_actor on public.push_notification_events;
create policy push_notification_events_insert_actor on public.push_notification_events
    for insert to authenticated
    with check (
        public.is_family_member(family_id)
        and actor_caregiver_id = public.current_caregiver_id()
        and exists (
            select 1
            from public.caregivers recipient
            where recipient.id = recipient_caregiver_id
              and recipient.family_id = public.push_notification_events.family_id
        )
    );

create or replace function public.enqueue_record_share_notifications(
    p_family_id bigint,
    p_actor_caregiver_id bigint,
    p_record_type text,
    p_record_id bigint,
    p_title text,
    p_body text,
    p_share_enabled boolean,
    p_excluded_caregiver_ids bigint[],
    p_record_source text
)
returns integer
language plpgsql
set search_path = public
as $$
declare
    v_current public.caregivers%rowtype;
    v_recipient_id bigint;
    v_enqueued integer := 0;
begin
    v_current := public.current_caregiver();
    if v_current.family_id <> p_family_id or v_current.id <> p_actor_caregiver_id then
        raise exception 'Family access denied';
    end if;
    if p_record_source not in ('LOG', 'GROWTH_MEASUREMENT') then
        raise exception 'Invalid record source';
    end if;

    if not coalesce(p_share_enabled, false) then
        return v_enqueued;
    end if;

    if not exists (
        select 1
        from public.families
        where id = p_family_id
          and push_notifications_enabled
    ) then
        return v_enqueued;
    end if;

    for v_recipient_id in
        select caregiver.id
        from public.caregivers caregiver
        where caregiver.family_id = p_family_id
          and caregiver.id <> p_actor_caregiver_id
          and not (
              caregiver.id = any(coalesce(p_excluded_caregiver_ids, array[]::bigint[]))
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
            p_family_id,
            v_recipient_id,
            p_actor_caregiver_id,
            'RECORD_SHARED',
            left(trim(coalesce(p_title, '새 기록이 등록되었어요.')), 100),
            left(trim(coalesce(p_body, '가족이 새 기록을 등록했어요.')), 180),
            jsonb_build_object(
                'recordType', p_record_type,
                'recordId', p_record_id,
                'recordSource', p_record_source,
                'route', '/timeline'
            )
        );
        v_enqueued := v_enqueued + 1;
    end loop;

    return v_enqueued;
end;
$$;

-- Keep the existing eight-argument contract for vaccination, hospital, and
-- older app versions while applying the same no-self-notification rule.
create or replace function public.enqueue_record_share_notifications(
    p_family_id bigint,
    p_actor_caregiver_id bigint,
    p_record_type text,
    p_record_id bigint,
    p_title text,
    p_body text,
    p_share_enabled boolean,
    p_excluded_caregiver_ids bigint[] default null
)
returns integer
language plpgsql
set search_path = public
as $$
declare
    v_current public.caregivers%rowtype;
    v_recipient_id bigint;
    v_enqueued integer := 0;
begin
    v_current := public.current_caregiver();
    if v_current.family_id <> p_family_id or v_current.id <> p_actor_caregiver_id then
        raise exception 'Family access denied';
    end if;

    if not coalesce(p_share_enabled, false) then
        return v_enqueued;
    end if;

    if not exists (
        select 1
        from public.families
        where id = p_family_id
          and push_notifications_enabled
    ) then
        return v_enqueued;
    end if;

    for v_recipient_id in
        select caregiver.id
        from public.caregivers caregiver
        where caregiver.family_id = p_family_id
          and caregiver.id <> p_actor_caregiver_id
          and not (
              caregiver.id = any(coalesce(p_excluded_caregiver_ids, array[]::bigint[]))
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
            p_family_id,
            v_recipient_id,
            p_actor_caregiver_id,
            'RECORD_SHARED',
            left(trim(coalesce(p_title, '새 기록이 등록되었어요.')), 100),
            left(trim(coalesce(p_body, '가족이 새 기록을 등록했어요.')), 180),
            jsonb_build_object(
                'recordType', p_record_type,
                'recordId', p_record_id,
                'route', '/timeline'
            )
        );
        v_enqueued := v_enqueued + 1;
    end loop;

    return v_enqueued;
end;
$$;

create or replace function public.create_care_record_with_chat(
    p_family_id bigint,
    p_child_id bigint,
    p_type text,
    p_value text,
    p_note text,
    p_recorded_at timestamptz,
    p_recorded_end_at timestamptz default null,
    p_record_subtype text default null,
    p_details jsonb default '{}'::jsonb,
    p_share_enabled boolean default null,
    p_excluded_caregiver_ids bigint[] default null
)
returns public.logs
language plpgsql
set search_path = public
as $$
declare
    v_current public.caregivers%rowtype;
    v_child public.children%rowtype;
    v_log public.logs%rowtype;
    v_preference public.record_share_preferences%rowtype;
    v_value text := trim(coalesce(p_value, ''));
    v_details jsonb := coalesce(p_details, '{}'::jsonb);
begin
    v_current := public.current_caregiver();
    if v_current.family_id <> p_family_id then raise exception 'Family access denied'; end if;
    if p_type not in ('FEEDING','SLEEP','GROWTH','MOMENT','MEDICINE','CHECKLIST','DIAPER','TEMPERATURE','PUMPING','MEMO') then raise exception 'Invalid log type'; end if;
    if v_value = '' then raise exception 'Log value is required'; end if;
    if p_recorded_at is null then raise exception 'Recorded time is required'; end if;

    v_child := public.resolve_family_child(p_family_id, p_child_id);
    v_preference := public.resolve_record_share_preference(
        p_family_id,
        p_share_enabled,
        p_excluded_caregiver_ids
    );

    insert into public.logs(family_id, child_id, caregiver_id, type, entry_value, note, recorded_at, recorded_end_at, record_subtype, details)
    values (
        p_family_id,
        v_child.id,
        v_current.id,
        p_type,
        v_value,
        nullif(trim(coalesce(p_note, '')), ''),
        p_recorded_at,
        p_recorded_end_at,
        nullif(trim(coalesce(p_record_subtype, '')), ''),
        v_details
    )
    returning * into v_log;

    insert into public.chat_messages(family_id, sender_id, body, message_type)
    values (p_family_id, v_current.id, format('%s 기록을 남겼어요: %s', public.care_record_label(v_log.type), v_log.entry_value), 'LOG_UPDATE');

    perform public.enqueue_record_share_notifications(
        p_family_id,
        v_current.id,
        v_log.type,
        v_log.id,
        format('새 %s 기록', public.care_record_label(v_log.type)),
        format('%s님이 %s 기록을 등록했어요.', v_current.name, public.care_record_label(v_log.type)),
        coalesce(v_preference.share_enabled, false),
        coalesce(v_preference.excluded_caregiver_ids, array[]::bigint[]),
        'LOG'
    );

    return v_log;
end;
$$;

create or replace function public.create_growth_measurement_checked(
    p_family_id bigint,
    p_child_id bigint,
    p_measured_at timestamptz,
    p_height_cm numeric,
    p_weight_kg numeric,
    p_head_circumference_cm numeric,
    p_note text,
    p_share_enabled boolean default null,
    p_excluded_caregiver_ids bigint[] default null
)
returns public.growth_measurements
language plpgsql
set search_path = public
as $$
declare
    v_current public.caregivers%rowtype;
    v_child public.children%rowtype;
    v_growth public.growth_measurements%rowtype;
    v_preference public.record_share_preferences%rowtype;
begin
    v_current := public.current_caregiver();
    if v_current.family_id <> p_family_id then raise exception 'Family access denied'; end if;
    if p_measured_at is null then raise exception 'Measured time is required'; end if;

    v_child := public.resolve_family_child(p_family_id, p_child_id);
    v_preference := public.resolve_record_share_preference(
        p_family_id,
        p_share_enabled,
        p_excluded_caregiver_ids
    );

    insert into public.growth_measurements(
        family_id,
        child_id,
        caregiver_id,
        measured_at,
        height_cm,
        weight_kg,
        head_circumference_cm,
        note
    ) values (
        p_family_id,
        v_child.id,
        v_current.id,
        p_measured_at,
        p_height_cm,
        p_weight_kg,
        p_head_circumference_cm,
        nullif(trim(coalesce(p_note, '')), '')
    )
    returning * into v_growth;

    insert into public.chat_messages(family_id, sender_id, body, message_type)
    values (p_family_id, v_current.id, '성장 기록을 남겼어요.', 'LOG_UPDATE');

    perform public.enqueue_record_share_notifications(
        p_family_id,
        v_current.id,
        'GROWTH',
        v_growth.id,
        '새 성장 기록',
        format('%s님이 성장 기록을 등록했어요.', v_current.name),
        coalesce(v_preference.share_enabled, false),
        coalesce(v_preference.excluded_caregiver_ids, array[]::bigint[]),
        'GROWTH_MEASUREMENT'
    );

    return v_growth;
end;
$$;

revoke all on function public.enqueue_record_share_notifications(bigint, bigint, text, bigint, text, text, boolean, bigint[]) from public, anon;
revoke all on function public.enqueue_record_share_notifications(bigint, bigint, text, bigint, text, text, boolean, bigint[], text) from public, anon;
grant execute on function public.enqueue_record_share_notifications(bigint, bigint, text, bigint, text, text, boolean, bigint[]) to authenticated;
grant execute on function public.enqueue_record_share_notifications(bigint, bigint, text, bigint, text, text, boolean, bigint[], text) to authenticated;
