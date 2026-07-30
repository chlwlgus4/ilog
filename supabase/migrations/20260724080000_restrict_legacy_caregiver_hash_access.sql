-- The standard Supabase Auth rollout no longer reads legacy caregiver hashes.
-- Keep legacy values out of every client-facing SELECT while migration history
-- and dormant accounts are reconciled separately.

revoke select on table public.caregivers from authenticated;

grant select (
    id,
    family_id,
    auth_user_id,
    email,
    name,
    role,
    availability_score,
    fatigue_score,
    created_at,
    updated_at,
    image_url,
    contact_phone,
    push_notifications_enabled,
    chat_notifications_enabled
) on table public.caregivers to authenticated;

do $$
begin
    if has_column_privilege('authenticated', 'public.caregivers', 'pin_hash', 'SELECT')
       or has_column_privilege('authenticated', 'public.caregivers', 'password_hash', 'SELECT') then
        raise exception 'Legacy caregiver credential hashes must not be selectable by authenticated users';
    end if;
end;
$$;
