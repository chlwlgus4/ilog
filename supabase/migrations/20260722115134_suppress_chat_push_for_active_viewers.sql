create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.family_chat_presence_sessions (
    family_id bigint not null references public.families(id) on delete cascade,
    caregiver_id bigint not null references public.caregivers(id) on delete cascade,
    session_key text not null,
    last_seen_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    constraint family_chat_presence_session_key_check
        check (char_length(session_key) between 16 and 160),
    primary key (caregiver_id, session_key)
);

alter table private.family_chat_presence_sessions enable row level security;
revoke all on private.family_chat_presence_sessions from public, anon, authenticated;

create index if not exists idx_family_chat_presence_active
    on private.family_chat_presence_sessions(family_id, caregiver_id, last_seen_at desc);

create or replace function public.touch_family_chat_presence_checked(
    p_family_id bigint,
    p_session_key text
)
returns timestamptz
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
    v_current public.caregivers%rowtype;
    v_session_key text := trim(coalesce(p_session_key, ''));
    v_last_seen_at timestamptz := clock_timestamp();
begin
    v_current := public.current_caregiver();
    if v_current.family_id <> p_family_id then raise exception 'Family access denied'; end if;
    if char_length(v_session_key) not between 16 and 160 then raise exception 'Invalid chat presence session'; end if;

    delete from private.family_chat_presence_sessions
    where last_seen_at < v_last_seen_at - interval '10 minutes';

    insert into private.family_chat_presence_sessions(
        family_id,
        caregiver_id,
        session_key,
        last_seen_at
    ) values (
        p_family_id,
        v_current.id,
        v_session_key,
        v_last_seen_at
    )
    on conflict (caregiver_id, session_key) do update set
        family_id = excluded.family_id,
        last_seen_at = excluded.last_seen_at;

    return v_last_seen_at;
end;
$$;

create or replace function public.clear_family_chat_presence_checked(
    p_family_id bigint,
    p_session_key text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
    v_current public.caregivers%rowtype;
    v_session_key text := trim(coalesce(p_session_key, ''));
begin
    v_current := public.current_caregiver();
    if v_current.family_id <> p_family_id then raise exception 'Family access denied'; end if;

    delete from private.family_chat_presence_sessions
    where family_id = p_family_id
      and caregiver_id = v_current.id
      and session_key = v_session_key;
end;
$$;

revoke all on function public.touch_family_chat_presence_checked(bigint, text) from public, anon;
revoke all on function public.clear_family_chat_presence_checked(bigint, text) from public, anon;
grant execute on function public.touch_family_chat_presence_checked(bigint, text) to authenticated;
grant execute on function public.clear_family_chat_presence_checked(bigint, text) to authenticated;

create or replace function public.create_family_chat_message_checked(
    p_family_id bigint,
    p_body text default '',
    p_image_storage_path text default null
)
returns public.family_chat_messages
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
    v_current public.caregivers%rowtype;
    v_message public.family_chat_messages%rowtype;
    v_recipient record;
    v_body text := trim(coalesce(p_body, ''));
    v_image_storage_path text := nullif(trim(coalesce(p_image_storage_path, '')), '');
    v_preview text;
    v_mentioned boolean;
begin
    v_current := public.current_caregiver();
    if v_current.family_id <> p_family_id then raise exception 'Family access denied'; end if;
    if v_body = '' and v_image_storage_path is null then raise exception 'Message content is required'; end if;
    if v_image_storage_path is not null
       and v_image_storage_path !~ ('^chat/' || p_family_id::text || '/[A-Za-z0-9._-]+$') then
        raise exception 'Invalid family chat image path';
    end if;

    delete from private.family_chat_presence_sessions
    where last_seen_at < clock_timestamp() - interval '10 minutes';

    insert into public.family_chat_messages(family_id, sender_caregiver_id, body, image_storage_path)
    values (p_family_id, v_current.id, v_body, v_image_storage_path)
    returning * into v_message;

    v_preview := left(
        regexp_replace(coalesce(nullif(v_body, ''), '사진을 보냈어요.'), '[[:space:]]+', ' ', 'g'),
        180
    );

    for v_recipient in
        select c.id, c.name
        from public.caregivers c
        where c.family_id = p_family_id
          and c.id <> v_current.id
          and c.push_notifications_enabled
          and c.chat_notifications_enabled
          and not exists (
              select 1
              from private.family_chat_presence_sessions presence
              where presence.family_id = p_family_id
                and presence.caregiver_id = c.id
                and presence.last_seen_at >= clock_timestamp() - interval '45 seconds'
          )
    loop
        v_mentioned := position(lower('@' || v_recipient.name) in lower(v_body)) > 0;

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
            v_recipient.id,
            v_current.id,
            case when v_mentioned then 'FAMILY_CHAT_MENTION' else 'FAMILY_CHAT' end,
            case
                when v_mentioned then format('%s님이 나를 언급했어요', v_current.name)
                else format('%s님의 가족 메시지', v_current.name)
            end,
            v_preview,
            jsonb_build_object(
                'familyChatMessageId', v_message.id,
                'route', '/family-chat'
            )
        );
    end loop;

    return v_message;
end;
$$;

revoke all on function public.create_family_chat_message_checked(bigint, text, text) from public, anon;
grant execute on function public.create_family_chat_message_checked(bigint, text, text) to authenticated;

create or replace function public.claim_pending_push_notification_events(
    p_family_id bigint default null,
    p_event_types text[] default null,
    p_limit integer default 25
)
returns setof public.push_notification_events
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
    return query
    with skipped_active_chat_events as (
        update public.push_notification_events as event
        set
            status = 'SKIPPED',
            error_message = 'Recipient is viewing family chat',
            processing_started_at = null,
            updated_at = now()
        where (
            event.status = 'PENDING'
            or (
                event.status = 'PROCESSING'
                and event.processing_started_at < now() - interval '5 minutes'
            )
        )
          and event.event_type in ('FAMILY_CHAT', 'FAMILY_CHAT_MENTION')
          and (p_family_id is null or event.family_id = p_family_id)
          and (
              coalesce(array_length(p_event_types, 1), 0) = 0
              or event.event_type = any(p_event_types)
          )
          and exists (
              select 1
              from private.family_chat_presence_sessions presence
              where presence.family_id = event.family_id
                and presence.caregiver_id = event.recipient_caregiver_id
                and presence.last_seen_at >= clock_timestamp() - interval '45 seconds'
          )
        returning event.id
    ), candidates as (
        select event.id
        from public.push_notification_events as event
        where (
            event.status = 'PENDING'
            or (
                event.status = 'PROCESSING'
                and event.processing_started_at < now() - interval '5 minutes'
            )
        )
          and (p_family_id is null or event.family_id = p_family_id)
          and (
              coalesce(array_length(p_event_types, 1), 0) = 0
              or event.event_type = any(p_event_types)
          )
          and not exists (
              select 1
              from skipped_active_chat_events skipped
              where skipped.id = event.id
          )
        order by event.created_at asc
        for update skip locked
        limit greatest(1, least(coalesce(p_limit, 25), 100))
    )
    update public.push_notification_events as event
    set
        status = 'PROCESSING',
        processing_started_at = now(),
        updated_at = now()
    from candidates
    where event.id = candidates.id
    returning event.*;
end;
$$;

revoke all on function public.claim_pending_push_notification_events(bigint, text[], integer) from public, anon, authenticated;
grant execute on function public.claim_pending_push_notification_events(bigint, text[], integer) to service_role;
