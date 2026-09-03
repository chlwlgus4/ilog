-- Remove the current installation's push registration before signing out.
-- A logged-out or shared device must not continue receiving family content.

create or replace function public.remove_current_push_device_token_checked(
    p_platform text,
    p_device_id text default null,
    p_expo_push_token text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_current_caregiver_id bigint;
    v_platform text := lower(btrim(coalesce(p_platform, '')));
    v_device_id text := nullif(btrim(coalesce(p_device_id, '')), '');
    v_expo_push_token text := nullif(btrim(coalesce(p_expo_push_token, '')), '');
    v_deleted_count integer := 0;
begin
    if auth.uid() is null then
        raise exception 'Supabase auth session is required';
    end if;

    if v_platform not in ('ios', 'android') then
        raise exception 'A native push platform is required';
    end if;

    select caregiver.id
    into v_current_caregiver_id
    from public.caregivers caregiver
    where caregiver.auth_user_id = auth.uid();

    -- Account deletion may already have removed the caregiver and cascaded
    -- their token rows. Keep the cleanup idempotent for that logout path.
    if v_current_caregiver_id is null then
        return 0;
    end if;

    -- Never interpret a missing installation identifier as a wildcard. The
    -- Expo token is persisted locally after registration so logout can still
    -- target this installation when a native device-ID API is unavailable.
    if v_device_id is null and v_expo_push_token is null then
        return 0;
    end if;

    delete from public.push_device_tokens token
    where token.caregiver_id = v_current_caregiver_id
      and token.platform = v_platform
      and (
          (v_device_id is not null and token.device_id = v_device_id)
          or (
              v_expo_push_token is not null
              and token.expo_push_token = v_expo_push_token
          )
      );

    get diagnostics v_deleted_count = row_count;
    return v_deleted_count;
end;
$$;

revoke all on function public.remove_current_push_device_token_checked(text, text, text)
    from public, anon;
grant execute on function public.remove_current_push_device_token_checked(text, text, text)
    to authenticated;

-- Mobile registration/settings already use checked SECURITY DEFINER RPCs.
-- Keep the token table out of the general authenticated API surface.
revoke all privileges on table public.push_device_tokens from authenticated;
