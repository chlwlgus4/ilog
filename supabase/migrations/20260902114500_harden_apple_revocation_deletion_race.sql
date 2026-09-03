-- Serialize delayed Apple authorization-code exchange with both individual
-- account deletion and family-wide Auth deletion. The original token table and
-- functions were introduced in 20260825122337, so redefine them here instead
-- of editing a migration that may already be applied remotely.

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

    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(p_auth_user_id::text, 0)
    );

    if exists (
        select 1
        from private.caregiver_account_deletion_jobs job
        where job.auth_user_id = p_auth_user_id
    ) then
        raise exception 'Account deletion prevents Apple refresh token storage';
    end if;

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

create or replace function private.schedule_apple_token_revocation_on_auth_user_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    -- The store function takes this same transaction-scoped lock before it can
    -- set ACTIVE. A delete that starts second therefore always leaves PENDING,
    -- while a store that starts second observes the removed identity/job.
    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(old.id::text, 0)
    );

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

revoke all on function public.store_apple_sign_in_refresh_token(uuid, text)
    from public, anon, authenticated;
revoke all on function private.schedule_apple_token_revocation_on_auth_user_delete()
    from public, anon, authenticated;

grant execute on function public.store_apple_sign_in_refresh_token(uuid, text)
    to service_role;
