-- Push preferences belong to each caregiver, not the whole family.
-- This lets one caregiver mute their own device without suppressing another caregiver's alerts.

alter table public.caregivers
    add column if not exists push_notifications_enabled boolean not null default true,
    add column if not exists chat_notifications_enabled boolean not null default true;

-- Preserve the previous family-wide choice as the initial personal choice for every caregiver.
update public.caregivers caregiver
set
    push_notifications_enabled = family.push_notifications_enabled,
    chat_notifications_enabled = family.chat_notifications_enabled
from public.families family
where family.id = caregiver.family_id;

-- The family-wide columns are legacy compatibility switches. Delivery now checks each recipient.
update public.families
set
    push_notifications_enabled = true,
    chat_notifications_enabled = true
where not push_notifications_enabled or not chat_notifications_enabled;

create or replace function public.update_current_push_notification_settings(
    p_push_notifications_enabled boolean default null,
    p_chat_notifications_enabled boolean default null
)
returns public.caregivers
language plpgsql
set search_path = public
as $$
declare
    v_current public.caregivers%rowtype;
    v_updated public.caregivers%rowtype;
begin
    v_current := public.current_caregiver();

    update public.caregivers
    set
        push_notifications_enabled = coalesce(p_push_notifications_enabled, push_notifications_enabled),
        chat_notifications_enabled = coalesce(p_chat_notifications_enabled, chat_notifications_enabled),
        updated_at = now()
    where id = v_current.id
    returning * into v_updated;

    if p_push_notifications_enabled is not null then
        update public.push_device_tokens
        set
            enabled = p_push_notifications_enabled,
            updated_at = now()
        where caregiver_id = v_current.id;
    end if;

    return v_updated;
end;
$$;

create or replace function public.upsert_push_device_token_checked(
    p_family_id bigint,
    p_expo_push_token text,
    p_platform text default 'unknown',
    p_device_id text default null,
    p_app_version text default null
)
returns public.push_device_tokens
language plpgsql
set search_path = public
as $$
declare
    v_current public.caregivers%rowtype;
    v_token public.push_device_tokens%rowtype;
    v_expo_push_token text := trim(coalesce(p_expo_push_token, ''));
    v_platform text := lower(trim(coalesce(p_platform, 'unknown')));
begin
    v_current := public.current_caregiver();
    if v_current.family_id <> p_family_id then raise exception 'Family access denied'; end if;
    if v_expo_push_token = '' then raise exception 'Expo push token is required'; end if;
    if v_platform not in ('ios','android','web','unknown') then v_platform := 'unknown'; end if;

    insert into public.push_device_tokens(
        family_id,
        caregiver_id,
        expo_push_token,
        platform,
        device_id,
        app_version,
        enabled,
        last_seen_at
    ) values (
        p_family_id,
        v_current.id,
        v_expo_push_token,
        v_platform,
        nullif(trim(coalesce(p_device_id, '')), ''),
        nullif(trim(coalesce(p_app_version, '')), ''),
        v_current.push_notifications_enabled,
        now()
    )
    on conflict (caregiver_id, expo_push_token) do update set
        family_id = excluded.family_id,
        platform = excluded.platform,
        device_id = excluded.device_id,
        app_version = excluded.app_version,
        enabled = v_current.push_notifications_enabled,
        last_seen_at = now(),
        updated_at = now()
    returning * into v_token;

    return v_token;
end;
$$;

create or replace function public.create_family_chat_message_checked(
    p_family_id bigint,
    p_body text default '',
    p_image_storage_path text default null
)
returns public.family_chat_messages
language plpgsql
set search_path = public
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

revoke all on function public.update_current_push_notification_settings(boolean, boolean) from public, anon;
revoke all on function public.upsert_push_device_token_checked(bigint, text, text, text, text) from public, anon;
revoke all on function public.create_family_chat_message_checked(bigint, text, text) from public, anon;

grant execute on function public.update_current_push_notification_settings(boolean, boolean) to authenticated;
grant execute on function public.upsert_push_device_token_checked(bigint, text, text, text, text) to authenticated;
grant execute on function public.create_family_chat_message_checked(bigint, text, text) to authenticated;
