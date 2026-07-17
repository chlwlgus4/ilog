-- RLS already limits caregiver rows to the active family and current user.
-- Restore the table privileges required for the client to use those policies.
grant select, insert, update on table public.caregivers to authenticated;
