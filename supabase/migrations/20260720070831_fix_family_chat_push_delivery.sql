-- A push token belongs to one installed app on one device. The previous client
-- used a per-launch session ID, which left stale tokens and allowed one token
-- to be associated with more than one caregiver.
with ranked_tokens as (
    select
        id,
        row_number() over (
            partition by expo_push_token
            order by last_seen_at desc, updated_at desc, id desc
        ) as token_rank
    from public.push_device_tokens
)
delete from public.push_device_tokens as token
using ranked_tokens
where token.id = ranked_tokens.id
  and ranked_tokens.token_rank > 1;

-- Session-based registrations from clients that have not been opened recently
-- are stale. Active devices re-register on startup, while this prevents old
-- development and TestFlight installations from receiving duplicate messages.
update public.push_device_tokens
set
    enabled = false,
    updated_at = now()
where enabled
  and last_seen_at < now() - interval '7 days';

create unique index if not exists idx_push_device_tokens_expo_push_token_unique
    on public.push_device_tokens(expo_push_token);

create or replace function public.upsert_push_device_token_checked(
    p_family_id bigint,
    p_expo_push_token text,
    p_platform text default 'unknown',
    p_device_id text default null,
    p_app_version text default null
)
returns public.push_device_tokens
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_current public.caregivers%rowtype;
    v_token public.push_device_tokens%rowtype;
    v_expo_push_token text := trim(coalesce(p_expo_push_token, ''));
    v_platform text := lower(trim(coalesce(p_platform, 'unknown')));
    v_device_id text := nullif(trim(coalesce(p_device_id, '')), '');
begin
    v_current := public.current_caregiver();
    if v_current.family_id <> p_family_id then raise exception 'Family access denied'; end if;
    if v_expo_push_token = '' then raise exception 'Expo push token is required'; end if;
    if v_platform not in ('ios', 'android', 'web', 'unknown') then v_platform := 'unknown'; end if;

    if v_device_id is not null then
        delete from public.push_device_tokens
        where caregiver_id = v_current.id
          and platform = v_platform
          and device_id = v_device_id
          and expo_push_token <> v_expo_push_token;
    end if;

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
        v_device_id,
        nullif(trim(coalesce(p_app_version, '')), ''),
        v_current.push_notifications_enabled,
        now()
    )
    on conflict (expo_push_token) do update set
        family_id = excluded.family_id,
        caregiver_id = excluded.caregiver_id,
        platform = excluded.platform,
        device_id = excluded.device_id,
        app_version = excluded.app_version,
        enabled = excluded.enabled,
        last_seen_at = now(),
        updated_at = now()
    returning * into v_token;

    return v_token;
end;
$$;

revoke all on function public.upsert_push_device_token_checked(bigint, text, text, text, text) from public, anon;
grant execute on function public.upsert_push_device_token_checked(bigint, text, text, text, text) to authenticated;

alter table public.push_notification_events
    add column if not exists processing_started_at timestamptz;

alter table public.push_notification_events
    drop constraint if exists push_notification_events_status_check;

alter table public.push_notification_events
    add constraint push_notification_events_status_check
    check (status in ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'SKIPPED'));

create index if not exists idx_push_notification_events_claim
    on public.push_notification_events(status, created_at)
    where status in ('PENDING', 'PROCESSING');

create or replace function public.claim_pending_push_notification_events(
    p_family_id bigint default null,
    p_event_types text[] default null,
    p_limit integer default 25
)
returns setof public.push_notification_events
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    return query
    with candidates as (
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
