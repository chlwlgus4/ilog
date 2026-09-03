-- Read-only operational counts. Cron SQL success means the HTTP request was
-- queued, not that its Edge Function succeeded; inspect pg_net separately.
-- No commands, URLs, headers, response bodies, identifiers, or raw errors leave
-- this service-only function. Existing app/deletion RPC contracts are unchanged.
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
    v_cron jsonb;
    v_http jsonb;
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

    -- Include missing jobs, disabled/duplicate jobs, changed schedules, failed
    -- latest runs, and missing/stale successful runs. Never treat an empty job
    -- history as healthy, including the period before a new cron's first run.
    with expected(job_name, expected_schedule, max_age) as (values
        ('babyboss-send-push-notifications', '* * * * *', interval '15 minutes'),
        ('ilog-revoke-apple-sign-in-tokens', '*/5 * * * *', interval '15 minutes'),
        ('ilog-process-account-deletions', '*/5 * * * *', interval '15 minutes'),
        ('purge-resolved-content-safety-reports', '17 * * * *', interval '2 hours')
    ), health as (
        select e.job_name, count(j.jobid) as job_count,
            bool_and(j.active and j.schedule = e.expected_schedule
                and j.database = current_database()
                and coalesce(r.last_success >= now() - e.max_age, false)
                and coalesce(latest.status <> 'failed', false)) as healthy
        from expected e
        left join cron.job j on j.jobname = e.job_name
        left join lateral (
            select d.end_time as last_success
            from cron.job_run_details d
            where d.jobid = j.jobid and d.status = 'succeeded'
              and d.end_time >= now() - e.max_age
            order by d.runid desc limit 1
        ) r on true
        left join lateral (
            select d.status from cron.job_run_details d where d.jobid = j.jobid
            order by d.runid desc limit 1
        ) latest on true
        group by e.job_name
    )
    select jsonb_build_object('unhealthy_cron_jobs', count(*) filter (
        where job_count <> 1 or not coalesce(healthy, false)
    )) into v_cron from health;

    -- pg_net retains responses for six hours by default. Its response table has
    -- no request URL/job mapping: conservatively count ALL pg_net HTTP failures
    -- in the last 15 minutes, including any future non-worker integrations.
    select jsonb_build_object('failed_worker_requests', count(*)) into v_http
    from net._http_response r where r.created >= now() - interval '15 minutes'
      and (r.status_code is null or r.status_code < 200 or r.status_code >= 300
        or coalesce(r.timed_out, false) or r.error_msg is not null);

    return jsonb_build_object('checked_at', now()) || v_reports || v_deletions || v_apple || v_push || v_cron || v_http;
end;
$$;

revoke all on function public.get_content_safety_operations_status_checked() from public, anon, authenticated;
grant execute on function public.get_content_safety_operations_status_checked() to service_role;
