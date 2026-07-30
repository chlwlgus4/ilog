-- Restore least-privilege client access after the broad grant introduced by
-- 20260717124500_restore_caregiver_client_grants.sql. Legacy credential hashes
-- are intentionally retained here for a separately verified retirement step;
-- this migration only removes client visibility and mutation rights.

revoke all privileges on table public.caregivers from authenticated;

-- These are the only caregiver columns selected by the current mobile client.
grant select (
    id,
    family_id,
    auth_user_id,
    email,
    name,
    role,
    availability_score,
    fatigue_score,
    image_url,
    contact_phone,
    push_notifications_enabled,
    chat_notifications_enabled,
    updated_at
) on table public.caregivers to authenticated;

-- Direct client writes are limited to the profile photo/name editor. Personal
-- information uses the checked RPC and password changes use Supabase Auth.
grant update (
    name,
    image_url
) on table public.caregivers to authenticated;

-- This RPC returns the composite caregiver row. Keep stored legacy hashes
-- intact for now, but never serialize them to an authenticated caller.
create or replace function public.update_current_push_notification_settings(
    p_push_notifications_enabled boolean default null,
    p_chat_notifications_enabled boolean default null
)
returns public.caregivers
language plpgsql
security definer
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

    v_updated.pin_hash := '';
    v_updated.password_hash := '';
    return v_updated;
end;
$$;

revoke all on function public.update_current_push_notification_settings(boolean, boolean) from public, anon;
grant execute on function public.update_current_push_notification_settings(boolean, boolean) to authenticated;
