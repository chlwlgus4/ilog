-- The current app uses Supabase Auth plus the consent-aware completion RPCs.
-- Retire the older direct authentication and invitation RPC entry points.
revoke all on function public.complete_email_auth_caregiver(text, text, text) from anon, authenticated;
revoke all on function public.complete_google_oauth_caregiver(text) from anon, authenticated;
revoke all on function public.join_family_by_invite(text, text, text, integer, integer, text) from anon, authenticated;
revoke all on function public.login_caregiver_by_email(text, text) from anon, authenticated;
revoke all on function public.register_caregiver(text, text, text, text, text) from anon, authenticated;
revoke all on function public.next_family_invite_code() from anon, authenticated;
revoke all on function public.select_task_assignee(bigint) from anon, authenticated;
