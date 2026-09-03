-- Counts only: never expose report text, family identifiers, tokens, or raw errors.
create or replace function public.get_content_safety_operations_status_checked()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_reports jsonb;
    v_deletions jsonb;
    v_apple jsonb;
    v_push jsonb;
begin
    if coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'role'
        is distinct from 'service_role' then
        raise exception 'OPERATIONS_SERVICE_ROLE_REQUIRED' using errcode = '42501';
    end if;

    select jsonb_build_object(
        'open_reports', count(*) filter (where status in ('OPEN', 'IN_REVIEW')),
        'urgent_unreviewed_reports', count(*) filter (
            where status = 'OPEN' and reason in ('CHILD_SAFETY', 'VIOLENCE')
                and created_at < now() - interval '1 hour'),
        'overdue_reports', count(*) filter (
            where (status = 'OPEN' and created_at < now() - interval '24 hours')
                or (status in ('OPEN', 'IN_REVIEW') and created_at < now() - interval '72 hours'))
    ) into v_reports from private.safety_reports;

    with jobs as (
        select status, scheduled_for as due_at, processing_started_at, last_error
        from private.family_deletion_jobs
        where status in ('PENDING', 'PROCESSING') and scheduled_for <= now()
        union all
        select status, created_at as due_at, processing_started_at, last_error
        from private.caregiver_account_deletion_jobs where status in ('PENDING', 'PROCESSING')
    )
    select jsonb_build_object(
        'stale_deletions', count(*) filter (
            where (status = 'PENDING' and due_at < now() - interval '1 hour')
                or (status = 'PROCESSING' and processing_started_at < now() - interval '15 minutes')),
        'failed_deletions', count(*) filter (where last_error is not null)
    ) into v_deletions from jobs;

    select jsonb_build_object(
        'apple_manual_required', count(*) filter (where revocation_state = 'MANUAL_REQUIRED'),
        'stale_apple_revocations', count(*) filter (
            where (revocation_state = 'PENDING' and revocation_scheduled_for < now() - interval '1 hour')
                or (revocation_state = 'PROCESSING' and processing_started_at < now() - interval '15 minutes'))
    ) into v_apple from private.apple_sign_in_revocation_tokens;

    select jsonb_build_object(
        'failed_push_events', count(*) filter (where status = 'FAILED' and updated_at >= now() - interval '24 hours'),
        'stale_push_events', count(*) filter (
            where (status = 'PENDING' and created_at < now() - interval '15 minutes')
                or (status = 'PROCESSING' and updated_at < now() - interval '15 minutes'))
    ) into v_push from public.push_notification_events
    where status in ('PENDING', 'PROCESSING', 'FAILED');

    return jsonb_build_object('checked_at', now()) || v_reports || v_deletions || v_apple || v_push;
end;
$$;

revoke all on function public.get_content_safety_operations_status_checked() from public, anon, authenticated;
grant execute on function public.get_content_safety_operations_status_checked() to service_role;
