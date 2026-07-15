create table if not exists public.record_share_preferences (
    family_id bigint not null references public.families(id) on delete cascade,
    caregiver_id bigint not null references public.caregivers(id) on delete cascade,
    share_enabled boolean not null default false,
    excluded_caregiver_ids bigint[] not null default '{}'::bigint[],
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (family_id, caregiver_id)
);

alter table public.record_share_preferences enable row level security;

drop policy if exists record_share_preferences_select_own on public.record_share_preferences;
create policy record_share_preferences_select_own on public.record_share_preferences
    for select to authenticated
    using (caregiver_id = public.current_caregiver_id());

drop policy if exists record_share_preferences_insert_own on public.record_share_preferences;
create policy record_share_preferences_insert_own on public.record_share_preferences
    for insert to authenticated
    with check (
        public.is_family_member(family_id)
        and caregiver_id = public.current_caregiver_id()
    );

drop policy if exists record_share_preferences_update_own on public.record_share_preferences;
create policy record_share_preferences_update_own on public.record_share_preferences
    for update to authenticated
    using (caregiver_id = public.current_caregiver_id())
    with check (
        public.is_family_member(family_id)
        and caregiver_id = public.current_caregiver_id()
    );

revoke all on public.record_share_preferences from anon;
grant select, insert, update on public.record_share_preferences to authenticated;

alter table public.push_notification_events
    drop constraint if exists push_notification_events_event_type_check;

alter table public.push_notification_events
    add constraint push_notification_events_event_type_check check (
        event_type in (
            'TIMELINE_COMMENT',
            'TIMELINE_REPLY',
            'FAMILY_CHAT',
            'RECORD_ALARM',
            'TASK_REMINDER',
            'RECORD_SHARED'
        )
    );

create or replace function public.resolve_record_share_preference(
    p_family_id bigint,
    p_share_enabled boolean default null,
    p_excluded_caregiver_ids bigint[] default null
)
returns public.record_share_preferences
language plpgsql
set search_path = public
as $$
declare
    v_current public.caregivers%rowtype;
    v_preference public.record_share_preferences%rowtype;
    v_excluded_caregiver_ids bigint[];
begin
    v_current := public.current_caregiver();
    if v_current.family_id <> p_family_id then raise exception 'Family access denied'; end if;

    if p_share_enabled is null then
        select * into v_preference
        from public.record_share_preferences
        where family_id = p_family_id
          and caregiver_id = v_current.id;
        return v_preference;
    end if;

    select coalesce(array_agg(caregiver_id order by caregiver_id), array[]::bigint[])
    into v_excluded_caregiver_ids
    from (
        select distinct caregiver_id
        from unnest(coalesce(p_excluded_caregiver_ids, array[]::bigint[])) as excluded(caregiver_id)
        where caregiver_id is not null
    ) as exclusions;

    if exists (
        select 1
        from unnest(v_excluded_caregiver_ids) as excluded(caregiver_id)
        left join public.caregivers caregiver
            on caregiver.id = excluded.caregiver_id
           and caregiver.family_id = p_family_id
        where caregiver.id is null
    ) then
        raise exception 'Excluded caregiver was not found in this family';
    end if;

    insert into public.record_share_preferences(
        family_id,
        caregiver_id,
        share_enabled,
        excluded_caregiver_ids
    ) values (
        p_family_id,
        v_current.id,
        p_share_enabled,
        v_excluded_caregiver_ids
    )
    on conflict (family_id, caregiver_id) do update set
        share_enabled = excluded.share_enabled,
        excluded_caregiver_ids = excluded.excluded_caregiver_ids,
        updated_at = now()
    returning * into v_preference;

    return v_preference;
end;
$$;

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

drop function if exists public.create_care_record_with_chat(bigint, bigint, text, text, text, timestamptz, timestamptz, text, jsonb);

create function public.create_care_record_with_chat(
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
        coalesce(v_preference.excluded_caregiver_ids, array[]::bigint[])
    );

    return v_log;
end;
$$;

drop function if exists public.create_growth_measurement_checked(bigint, bigint, timestamptz, numeric, numeric, numeric, text);

create function public.create_growth_measurement_checked(
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
        coalesce(v_preference.excluded_caregiver_ids, array[]::bigint[])
    );

    return v_growth;
end;
$$;

create or replace function public.create_vaccination_record_checked(
    p_family_id bigint,
    p_child_id bigint,
    p_name text,
    p_dose_label text,
    p_status text,
    p_due_at timestamptz,
    p_completed_at timestamptz,
    p_note text,
    p_share_enabled boolean default null,
    p_excluded_caregiver_ids bigint[] default null
)
returns public.vaccination_records
language plpgsql
set search_path = public
as $$
declare
    v_current public.caregivers%rowtype;
    v_child public.children%rowtype;
    v_vaccination public.vaccination_records%rowtype;
    v_preference public.record_share_preferences%rowtype;
    v_name text := trim(coalesce(p_name, ''));
    v_status text := coalesce(p_status, 'SCHEDULED');
begin
    v_current := public.current_caregiver();
    if v_current.family_id <> p_family_id then raise exception 'Family access denied'; end if;
    if v_name = '' then raise exception 'Vaccination name is required'; end if;
    if p_due_at is null then raise exception 'Vaccination date is required'; end if;
    if v_status not in ('SCHEDULED', 'COMPLETED', 'SKIPPED') then raise exception 'Invalid vaccination status'; end if;

    v_child := public.resolve_family_child(p_family_id, p_child_id);
    v_preference := public.resolve_record_share_preference(
        p_family_id,
        p_share_enabled,
        p_excluded_caregiver_ids
    );

    insert into public.vaccination_records(
        family_id,
        child_id,
        name,
        dose_label,
        status,
        due_at,
        completed_at,
        note,
        created_by_id
    ) values (
        p_family_id,
        v_child.id,
        v_name,
        nullif(trim(coalesce(p_dose_label, '')), ''),
        v_status,
        p_due_at,
        p_completed_at,
        nullif(trim(coalesce(p_note, '')), ''),
        v_current.id
    )
    returning * into v_vaccination;

    perform public.enqueue_record_share_notifications(
        p_family_id,
        v_current.id,
        'VACCINATION',
        v_vaccination.id,
        '새 예방접종 기록',
        format('%s님이 예방접종 기록을 등록했어요.', v_current.name),
        coalesce(v_preference.share_enabled, false),
        coalesce(v_preference.excluded_caregiver_ids, array[]::bigint[])
    );

    return v_vaccination;
end;
$$;

create or replace function public.create_hospital_visit_checked(
    p_family_id bigint,
    p_child_id bigint,
    p_hospital_name text,
    p_reason text,
    p_visited_at timestamptz,
    p_diagnosis text,
    p_note text,
    p_share_enabled boolean default null,
    p_excluded_caregiver_ids bigint[] default null
)
returns public.hospital_visits
language plpgsql
set search_path = public
as $$
declare
    v_current public.caregivers%rowtype;
    v_child public.children%rowtype;
    v_visit public.hospital_visits%rowtype;
    v_preference public.record_share_preferences%rowtype;
    v_hospital_name text := trim(coalesce(p_hospital_name, ''));
begin
    v_current := public.current_caregiver();
    if v_current.family_id <> p_family_id then raise exception 'Family access denied'; end if;
    if v_hospital_name = '' then raise exception 'Hospital name is required'; end if;
    if p_visited_at is null then raise exception 'Hospital visit date is required'; end if;

    v_child := public.resolve_family_child(p_family_id, p_child_id);
    v_preference := public.resolve_record_share_preference(
        p_family_id,
        p_share_enabled,
        p_excluded_caregiver_ids
    );

    insert into public.hospital_visits(
        family_id,
        child_id,
        hospital_name,
        reason,
        visited_at,
        diagnosis,
        note,
        created_by_id
    ) values (
        p_family_id,
        v_child.id,
        v_hospital_name,
        nullif(trim(coalesce(p_reason, '')), ''),
        p_visited_at,
        nullif(trim(coalesce(p_diagnosis, '')), ''),
        nullif(trim(coalesce(p_note, '')), ''),
        v_current.id
    )
    returning * into v_visit;

    perform public.enqueue_record_share_notifications(
        p_family_id,
        v_current.id,
        'HOSPITAL',
        v_visit.id,
        '새 병원 방문 기록',
        format('%s님이 병원 방문 기록을 등록했어요.', v_current.name),
        coalesce(v_preference.share_enabled, false),
        coalesce(v_preference.excluded_caregiver_ids, array[]::bigint[])
    );

    return v_visit;
end;
$$;

revoke all on function public.resolve_record_share_preference(bigint, boolean, bigint[]) from public, anon;
revoke all on function public.enqueue_record_share_notifications(bigint, bigint, text, bigint, text, text, boolean, bigint[]) from public, anon;
revoke all on function public.create_care_record_with_chat(bigint, bigint, text, text, text, timestamptz, timestamptz, text, jsonb, boolean, bigint[]) from public, anon;
revoke all on function public.create_growth_measurement_checked(bigint, bigint, timestamptz, numeric, numeric, numeric, text, boolean, bigint[]) from public, anon;
revoke all on function public.create_vaccination_record_checked(bigint, bigint, text, text, text, timestamptz, timestamptz, text, boolean, bigint[]) from public, anon;
revoke all on function public.create_hospital_visit_checked(bigint, bigint, text, text, timestamptz, text, text, boolean, bigint[]) from public, anon;

grant execute on function public.resolve_record_share_preference(bigint, boolean, bigint[]) to authenticated;
grant execute on function public.enqueue_record_share_notifications(bigint, bigint, text, bigint, text, text, boolean, bigint[]) to authenticated;
grant execute on function public.create_care_record_with_chat(bigint, bigint, text, text, text, timestamptz, timestamptz, text, jsonb, boolean, bigint[]) to authenticated;
grant execute on function public.create_growth_measurement_checked(bigint, bigint, timestamptz, numeric, numeric, numeric, text, boolean, bigint[]) to authenticated;
grant execute on function public.create_vaccination_record_checked(bigint, bigint, text, text, text, timestamptz, timestamptz, text, boolean, bigint[]) to authenticated;
grant execute on function public.create_hospital_visit_checked(bigint, bigint, text, text, timestamptz, text, text, boolean, bigint[]) to authenticated;
