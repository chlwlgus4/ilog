-- Sign in with Apple authorization codes are exchanged by an Edge Function.
-- Only the resulting refresh token is retained, encrypted by Supabase Vault,
-- so it can be revoked after the corresponding Supabase Auth user is deleted.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.apple_sign_in_revocation_tokens (
    auth_user_id uuid primary key,
    vault_secret_id uuid unique,
    revocation_state text not null default 'ACTIVE'
        check (revocation_state in ('ACTIVE', 'PENDING', 'PROCESSING', 'MANUAL_REQUIRED')),
    revocation_scheduled_for timestamptz,
    revocation_attempts integer not null default 0 check (revocation_attempts >= 0),
    processing_started_at timestamptz,
    last_error text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (
        (revocation_state = 'MANUAL_REQUIRED' and vault_secret_id is null)
        or (revocation_state <> 'MANUAL_REQUIRED' and vault_secret_id is not null)
    )
);

alter table private.apple_sign_in_revocation_tokens enable row level security;
revoke all on private.apple_sign_in_revocation_tokens from public, anon, authenticated;

create or replace function public.store_apple_sign_in_refresh_token(
    p_auth_user_id uuid,
    p_refresh_token text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_existing_secret_id uuid;
    v_secret_id uuid;
begin
    if p_auth_user_id is null or nullif(btrim(p_refresh_token), '') is null then
        raise exception 'Apple refresh token input is required';
    end if;

    -- Serialize refresh-token replacement per Auth user so concurrent Apple
    -- sign-ins cannot leave an unreferenced Vault secret behind.
    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(p_auth_user_id::text, 0)
    );

    if not exists (
        select 1
        from auth.identities identity_row
        where identity_row.user_id = p_auth_user_id
          and identity_row.provider = 'apple'
    ) then
        raise exception 'Apple identity was not found';
    end if;

    select token.vault_secret_id
    into v_existing_secret_id
    from private.apple_sign_in_revocation_tokens token
    where token.auth_user_id = p_auth_user_id
    for update;

    if v_existing_secret_id is not null
       and exists (
           select 1
           from vault.secrets secret_row
           where secret_row.id = v_existing_secret_id
       ) then
        perform vault.update_secret(v_existing_secret_id, p_refresh_token);

        update private.apple_sign_in_revocation_tokens
        set revocation_state = 'ACTIVE',
            revocation_scheduled_for = null,
            revocation_attempts = 0,
            processing_started_at = null,
            last_error = null,
            updated_at = now()
        where auth_user_id = p_auth_user_id;

        return;
    end if;

    v_secret_id := vault.create_secret(
        p_refresh_token,
        null,
        'iLog Sign in with Apple revocation token'
    );

    insert into private.apple_sign_in_revocation_tokens(
        auth_user_id,
        vault_secret_id,
        revocation_state
    ) values (
        p_auth_user_id,
        v_secret_id,
        'ACTIVE'
    )
    on conflict (auth_user_id) do update
    set vault_secret_id = excluded.vault_secret_id,
        revocation_state = 'ACTIVE',
        revocation_scheduled_for = null,
        revocation_attempts = 0,
        processing_started_at = null,
        last_error = null,
        updated_at = now();

    if v_existing_secret_id is not null and v_existing_secret_id <> v_secret_id then
        delete from vault.secrets
        where id = v_existing_secret_id;
    end if;
end;
$$;

create or replace function public.has_apple_sign_in_refresh_token(p_auth_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from private.apple_sign_in_revocation_tokens token
        join vault.secrets secret_row on secret_row.id = token.vault_secret_id
        where token.auth_user_id = p_auth_user_id
    );
$$;

create or replace function public.get_family_apple_revocation_status()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_family_id bigint;
    v_apple_accounts integer;
    v_automatic_accounts integer;
begin
    if auth.uid() is null then
        raise exception 'Supabase auth session is required';
    end if;

    select caregiver.family_id
    into v_family_id
    from public.caregivers caregiver
    where caregiver.auth_user_id = auth.uid();

    if v_family_id is null then
        raise exception 'Current caregiver was not found';
    end if;

    select
        count(distinct identity_row.user_id)::integer,
        count(distinct identity_row.user_id) filter (
            where exists (
                select 1
                from private.apple_sign_in_revocation_tokens token
                join vault.secrets secret_row on secret_row.id = token.vault_secret_id
                where token.auth_user_id = identity_row.user_id
                  and token.revocation_state = 'ACTIVE'
            )
        )::integer
    into v_apple_accounts, v_automatic_accounts
    from public.caregivers caregiver
    join auth.identities identity_row
      on identity_row.user_id = caregiver.auth_user_id
     and identity_row.provider = 'apple'
    where caregiver.family_id = v_family_id;

    if coalesce(v_apple_accounts, 0) = 0 then
        return 'NOT_APPLICABLE';
    end if;

    if v_automatic_accounts = v_apple_accounts then
        return 'AUTOMATIC';
    end if;

    return 'MANUAL_REQUIRED';
end;
$$;

create or replace function private.schedule_apple_token_revocation_on_auth_user_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if exists (
        select 1
        from auth.identities identity_row
        where identity_row.user_id = old.id
          and identity_row.provider = 'apple'
    ) then
        insert into private.apple_sign_in_revocation_tokens(
            auth_user_id,
            vault_secret_id,
            revocation_state,
            revocation_scheduled_for,
            last_error
        ) values (
            old.id,
            null,
            'MANUAL_REQUIRED',
            now(),
            'refresh_token_missing'
        )
        on conflict (auth_user_id) do update
        set revocation_state = case
                when private.apple_sign_in_revocation_tokens.vault_secret_id is null
                    then 'MANUAL_REQUIRED'
                else 'PENDING'
            end,
            revocation_scheduled_for = now(),
            processing_started_at = null,
            last_error = case
                when private.apple_sign_in_revocation_tokens.vault_secret_id is null
                    then 'refresh_token_missing'
                else null
            end,
            updated_at = now();
    end if;

    return old;
end;
$$;

drop trigger if exists auth_user_schedule_apple_token_revocation on auth.users;
create trigger auth_user_schedule_apple_token_revocation
before delete on auth.users
for each row execute function private.schedule_apple_token_revocation_on_auth_user_delete();

create or replace function public.claim_due_apple_token_revocations(p_limit integer default 25)
returns table (
    auth_user_id uuid,
    refresh_token text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
begin
    return query
    with due as (
        select token.auth_user_id
        from private.apple_sign_in_revocation_tokens token
        where token.revocation_state in ('PENDING', 'PROCESSING')
          and token.vault_secret_id is not null
          and token.revocation_scheduled_for is not null
          and token.revocation_scheduled_for <= now()
          and (
              token.processing_started_at is null
              or token.processing_started_at < now() - interval '15 minutes'
          )
        order by token.revocation_scheduled_for asc
        limit v_limit
        for update skip locked
    ), claimed as (
        update private.apple_sign_in_revocation_tokens token
        set revocation_state = 'PROCESSING',
            processing_started_at = now(),
            revocation_attempts = token.revocation_attempts + 1,
            updated_at = now()
        from due
        where token.auth_user_id = due.auth_user_id
        returning token.auth_user_id, token.vault_secret_id
    )
    select claimed.auth_user_id, secret_row.decrypted_secret
    from claimed
    join vault.decrypted_secrets secret_row
      on secret_row.id = claimed.vault_secret_id;
end;
$$;

create or replace function public.complete_apple_token_revocation(
    p_auth_user_id uuid,
    p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_secret_id uuid;
    v_attempts integer;
    v_retry_after interval;
begin
    select token.vault_secret_id, token.revocation_attempts
    into v_secret_id, v_attempts
    from private.apple_sign_in_revocation_tokens token
    where token.auth_user_id = p_auth_user_id
    for update;

    if not found then
        return;
    end if;

    if nullif(btrim(coalesce(p_error, '')), '') is null then
        delete from private.apple_sign_in_revocation_tokens
        where auth_user_id = p_auth_user_id;

        delete from vault.secrets
        where id = v_secret_id;

        return;
    end if;

    v_retry_after := case
        when v_attempts <= 1 then interval '5 minutes'
        when v_attempts = 2 then interval '15 minutes'
        when v_attempts = 3 then interval '1 hour'
        else interval '6 hours'
    end;

    update private.apple_sign_in_revocation_tokens
    set revocation_state = 'PENDING',
        revocation_scheduled_for = now() + v_retry_after,
        processing_started_at = null,
        last_error = left(p_error, 300),
        updated_at = now()
    where auth_user_id = p_auth_user_id;
end;
$$;

-- A refreshed access token must not count as explicit reauthentication. The
-- session id is stable across refreshes, so check the Auth session creation
-- time instead of the JWT iat claim used by the previous implementation.
create or replace function public.assert_recent_reauthentication()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_session_id uuid;
    v_session_created_at timestamptz;
begin
    if auth.uid() is null then
        raise exception 'Supabase auth session is required';
    end if;

    begin
        v_session_id := nullif(auth.jwt() ->> 'session_id', '')::uuid;
    exception
        when invalid_text_representation then
            v_session_id := null;
    end;

    select session_row.created_at
    into v_session_created_at
    from auth.sessions session_row
    where session_row.id = v_session_id
      and session_row.user_id = auth.uid();

    if v_session_created_at is null
       or v_session_created_at < now() - interval '10 minutes' then
        raise exception 'Recent reauthentication is required';
    end if;
end;
$$;

revoke all on function public.store_apple_sign_in_refresh_token(uuid, text) from public, anon, authenticated;
revoke all on function public.has_apple_sign_in_refresh_token(uuid) from public, anon, authenticated;
revoke all on function public.get_family_apple_revocation_status() from public, anon, authenticated;
revoke all on function public.claim_due_apple_token_revocations(integer) from public, anon, authenticated;
revoke all on function public.complete_apple_token_revocation(uuid, text) from public, anon, authenticated;
revoke all on function private.schedule_apple_token_revocation_on_auth_user_delete() from public, anon, authenticated;
revoke all on function public.assert_recent_reauthentication() from public, anon, authenticated;

grant execute on function public.store_apple_sign_in_refresh_token(uuid, text) to service_role;
grant execute on function public.has_apple_sign_in_refresh_token(uuid) to service_role;
grant execute on function public.get_family_apple_revocation_status() to authenticated;
grant execute on function public.claim_due_apple_token_revocations(integer) to service_role;
grant execute on function public.complete_apple_token_revocation(uuid, text) to service_role;

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
    if not exists (
        select 1
        from vault.secrets
        where name = 'babyboss_push_worker_cron_secret'
    ) then
        raise exception 'The babyboss_push_worker_cron_secret Vault secret must be created before this migration runs.';
    end if;
end;
$$;

select cron.schedule(
    'ilog-revoke-apple-sign-in-tokens',
    '*/5 * * * *',
    $cron$
    select net.http_post(
        url := 'https://sflxzfxoyicpiykvgcte.supabase.co/functions/v1/revoke-apple-tokens',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-apple-revoke-worker-secret', (
                select decrypted_secret
                from vault.decrypted_secrets
                where name = 'babyboss_push_worker_cron_secret'
                limit 1
            )
        ),
        body := jsonb_build_object('limit', 10),
        timeout_milliseconds := 60000
    );
    $cron$
);
