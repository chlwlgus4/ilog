-- Disposable local database only; no user/family/report fixtures are needed.
-- Use the disposable container's supabase_admin metadata owner. The caller must
-- explicitly set: SET ilog.test.isolated = 'true';
-- Synthetic cron/HTTP rows and every change below are rolled back. This file
-- does not call net.http_post, dispatch a worker, or inspect response contents.
begin isolation level repeatable read;

do $$ begin
    if current_setting('ilog.test.isolated', true) is distinct from 'true' then
        raise exception 'Explicit disposable database confirmation is required';
    end if;
end $$;

create function pg_temp.operations_assert(p_ok boolean, p_message text)
returns void language plpgsql as $$
begin
    if p_ok is distinct from true then raise exception '%', p_message; end if;
end;
$$;

create function pg_temp.operations_count(p_key text)
returns bigint language sql as $$
    select (public.get_content_safety_operations_status_checked()->>p_key)::bigint;
$$;

select pg_temp.operations_assert(
    not has_function_privilege('anon', 'public.get_content_safety_operations_status_checked()', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.get_content_safety_operations_status_checked()', 'EXECUTE')
    and has_function_privilege('service_role', 'public.get_content_safety_operations_status_checked()', 'EXECUTE'),
    'Operational RPC must only grant service-role access');

-- The explicit role guard is defense in depth even for the function owner.
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
do $$ begin
    begin
        perform public.get_content_safety_operations_status_checked();
    exception when insufficient_privilege then return;
    end;
    raise exception 'Operational RPC accepted non-service JWT claims';
end $$;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

create temporary table operations_expected_jobs(jobname text, schedule text, jobid bigint);
insert into operations_expected_jobs values
    ('babyboss-send-push-notifications', '* * * * *', 8100000000000001),
    ('ilog-revoke-apple-sign-in-tokens', '*/5 * * * *', 8100000000000002),
    ('ilog-process-account-deletions', '*/5 * * * *', 8100000000000003),
    ('purge-resolved-content-safety-reports', '17 * * * *', 8100000000000004);

delete from cron.job_run_details where jobid in (
    select jobid from cron.job where jobname in (select jobname from operations_expected_jobs)
);
delete from cron.job where jobname in (select jobname from operations_expected_jobs);
delete from net._http_response;
select pg_temp.operations_assert(pg_temp.operations_count('unhealthy_cron_jobs') = 4, 'Missing jobs must be unhealthy');

insert into cron.job(jobid, jobname, schedule, command, nodeport, username)
select jobid, jobname, schedule, 'select 1', 5432, 'postgres' from operations_expected_jobs;
select pg_temp.operations_assert(pg_temp.operations_count('unhealthy_cron_jobs') = 4, 'Empty history must not report healthy');

insert into cron.job_run_details(jobid, runid, status, start_time, end_time, username, database)
select jobid, jobid, 'succeeded', now() - interval '2 minutes', now() - interval '1 minute', 'postgres', current_database()
from operations_expected_jobs;
select pg_temp.operations_assert(pg_temp.operations_count('unhealthy_cron_jobs') = 0, 'Recent successful schedules must be healthy');

update cron.job set active = false where jobid = 8100000000000001;
select pg_temp.operations_assert(pg_temp.operations_count('unhealthy_cron_jobs') = 1, 'Inactive job was missed');
update cron.job set active = true where jobid = 8100000000000001;
update cron.job set schedule = '0 0 * * *' where jobid = 8100000000000001;
select pg_temp.operations_assert(pg_temp.operations_count('unhealthy_cron_jobs') = 1, 'Changed schedule was missed');
update cron.job set schedule = '* * * * *' where jobid = 8100000000000001;

insert into cron.job(jobid, jobname, schedule, command, nodeport, username)
values (8100000000000010, 'babyboss-send-push-notifications', '* * * * *', 'select 1', 5432, 'service_role');
select pg_temp.operations_assert(pg_temp.operations_count('unhealthy_cron_jobs') = 1, 'Duplicate cron name under another role was missed');
delete from cron.job where jobid = 8100000000000010;

update cron.job_run_details set end_time = now() - interval '16 minutes' where jobid = 8100000000000001;
select pg_temp.operations_assert(pg_temp.operations_count('unhealthy_cron_jobs') = 1, 'Stale minute worker was missed');
update cron.job_run_details set end_time = now() - interval '1 minute' where jobid = 8100000000000001;
update cron.job_run_details set end_time = now() - interval '119 minutes' where jobid = 8100000000000004;
select pg_temp.operations_assert(pg_temp.operations_count('unhealthy_cron_jobs') = 0, 'Hourly purge used minute-worker threshold');
update cron.job_run_details set end_time = now() - interval '121 minutes' where jobid = 8100000000000004;
select pg_temp.operations_assert(pg_temp.operations_count('unhealthy_cron_jobs') = 1, 'Stale hourly purge was missed');
update cron.job_run_details set end_time = now() - interval '1 minute' where jobid = 8100000000000004;

insert into cron.job_run_details(jobid, runid, status, start_time, end_time, username, database)
values (8100000000000001, 8100000000000020, 'failed', now(), now(), 'postgres', current_database());
select pg_temp.operations_assert(pg_temp.operations_count('unhealthy_cron_jobs') = 1, 'Latest failure was hidden by earlier success');
insert into cron.job_run_details(jobid, runid, status, start_time, end_time, username, database)
values (8100000000000001, 8100000000000021, 'succeeded', now(), now(), 'postgres', current_database());
select pg_temp.operations_assert(pg_temp.operations_count('unhealthy_cron_jobs') = 0, 'Recovered cron still reported unhealthy');

-- Simulate only metadata: no request is sent and no personal payload is stored.
insert into net._http_response(id, status_code, timed_out, error_msg, created) values
    (8100000000000101, 200, false, null, now()),
    (8100000000000102, 204, false, null, now()),
    (8100000000000103, 500, false, null, now()),
    (8100000000000104, 401, false, null, now()),
    (8100000000000105, null, true, null, now()),
    (8100000000000106, 200, false, 'Synthetic transport error', now()),
    (8100000000000107, 302, false, null, now()),
    (8100000000000108, 500, false, null, now() - interval '16 minutes');
select pg_temp.operations_assert(pg_temp.operations_count('failed_worker_requests') = 5,
    'HTTP status/timeout/error/retention counts do not match the contract');

-- Service-role call returns only the fixed count allowlist and timestamp.
set local role service_role;
select pg_temp.operations_assert(
    not exists (select 1 from jsonb_each(public.get_content_safety_operations_status_checked()) item
      where item.key <> 'checked_at' and (item.key not in (
        'open_reports', 'urgent_unreviewed_reports', 'overdue_reports', 'stale_deletions',
        'failed_deletions', 'apple_manual_required', 'stale_apple_revocations',
        'failed_push_events', 'stale_push_events', 'unhealthy_cron_jobs', 'failed_worker_requests'
      ) or jsonb_typeof(item.value) <> 'number')),
    'Operational RPC exposed unexpected keys or non-count values');
reset role;

rollback;
