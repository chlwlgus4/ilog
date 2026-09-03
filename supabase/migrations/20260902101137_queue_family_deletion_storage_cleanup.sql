-- Queue family deletion so Storage payloads are removed through the Storage API.
-- Direct changes to storage.objects metadata do not remove the underlying file.

-- Validate project-local routing before creating any deletion queue objects.
-- Every target environment must provision these Vault values first.
do $$
declare
    v_worker_secret text;
    v_function_base_url text;
begin
    select secret_row.decrypted_secret
    into v_worker_secret
    from vault.decrypted_secrets secret_row
    where secret_row.name = 'babyboss_push_worker_cron_secret'
    limit 1;

    if nullif(btrim(v_worker_secret), '') is null then
        raise exception 'The babyboss_push_worker_cron_secret Vault secret must be created before this migration runs.';
    end if;

    select btrim(secret_row.decrypted_secret)
    into v_function_base_url
    from vault.decrypted_secrets secret_row
    where secret_row.name = 'babyboss_edge_function_base_url'
    limit 1;

    if nullif(v_function_base_url, '') is null then
        raise exception 'The babyboss_edge_function_base_url Vault secret must be created before this migration runs.';
    end if;

    if v_function_base_url !~ '^https://[a-z0-9]{20}[.]supabase[.]co$' then
        raise exception 'The babyboss_edge_function_base_url Vault secret must be the canonical HTTPS URL for this Supabase project.';
    end if;
end;
$$;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.family_deletion_jobs (
    family_id bigint primary key,
    scheduled_for timestamptz not null,
    status text not null default 'PENDING'
        check (status in ('PENDING', 'PROCESSING', 'CANCELLED', 'COMPLETED')),
    attempt_count integer not null default 0 check (attempt_count >= 0),
    next_attempt_at timestamptz not null,
    processing_started_at timestamptz,
    claim_token uuid,
    last_error text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    completed_at timestamptz,
    check (
        (status = 'PROCESSING' and processing_started_at is not null and claim_token is not null)
        or (status <> 'PROCESSING' and processing_started_at is null and claim_token is null)
    ),
    check ((status = 'COMPLETED') = (completed_at is not null))
);

create index if not exists idx_family_deletion_jobs_due
    on private.family_deletion_jobs(status, next_attempt_at, scheduled_for);

alter table private.family_deletion_jobs enable row level security;
revoke all on table private.family_deletion_jobs from public, anon, authenticated;

-- Shared family content remains available to the other caregivers, so the
-- departing Auth user is irreversibly soft-deleted by the Edge worker. The
-- durable row makes that supported Admin API operation retryable without
-- reopening the departing caregiver's application access.
create table if not exists private.caregiver_account_deletion_jobs (
    auth_user_id uuid primary key,
    family_id bigint not null,
    status text not null default 'PENDING'
        check (status in ('PENDING', 'PROCESSING', 'COMPLETED')),
    attempt_count integer not null default 0 check (attempt_count >= 0),
    next_attempt_at timestamptz not null default now(),
    processing_started_at timestamptz,
    claim_token uuid,
    last_error text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    completed_at timestamptz,
    check (
        (status = 'PROCESSING' and processing_started_at is not null and claim_token is not null)
        or (status <> 'PROCESSING' and processing_started_at is null and claim_token is null)
    ),
    check ((status = 'COMPLETED') = (completed_at is not null))
);

create index if not exists idx_caregiver_account_deletion_jobs_due
    on private.caregiver_account_deletion_jobs(status, next_attempt_at);

alter table private.caregiver_account_deletion_jobs enable row level security;
revoke all on table private.caregiver_account_deletion_jobs from public, anon, authenticated;

-- Earlier family deletion audits retained the deleted family's display name.
-- Keep the operational audit identifiers and timestamps while removing that
-- unnecessary personal/family label during upgrade.
update public.account_deletion_audit audit
set metadata = coalesce(audit.metadata, '{}'::jsonb) - 'family_name'
where audit.action = 'FAMILY_DELETED'
  and coalesce(audit.metadata, '{}'::jsonb) ? 'family_name';

-- The Auth JWT can remain valid briefly after an immediate caregiver deletion
-- while the Admin soft-delete worker is pending. Block every current and future
-- caregiver-linking path from recreating application access in that window.
create or replace function private.reject_account_deletion_caregiver_relink()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if new.auth_user_id is not null
       and exists (
           select 1
           from private.caregiver_account_deletion_jobs job
           where job.auth_user_id = new.auth_user_id
       ) then
        raise exception 'Account deletion prevents caregiver relinking';
    end if;

    return new;
end;
$$;

revoke all on function private.reject_account_deletion_caregiver_relink()
    from public, anon, authenticated;

drop trigger if exists caregivers_reject_account_deletion_relink on public.caregivers;
create trigger caregivers_reject_account_deletion_relink
before insert or update of auth_user_id on public.caregivers
for each row execute function private.reject_account_deletion_caregiver_relink();

-- Individual account deletion keeps family-owned content. Do not mutate
-- storage.objects ownership: that is an unsupported Storage metadata write.
create or replace function public.request_caregiver_account_deletion_checked()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_current public.caregivers%rowtype;
    v_family public.families%rowtype;
    v_family_id bigint;
    v_successor_caregiver_id bigint;
    v_successor_auth_user_id uuid;
    v_caregiver_count integer;
begin
    perform public.assert_recent_reauthentication();

    -- Resolve membership without a row lock, then use the same family ->
    -- caregiver ordering as cancellation and finalization. Revalidate after
    -- both locks in case membership changed between the two reads.
    select caregiver.family_id
    into v_family_id
    from public.caregivers caregiver
    where caregiver.auth_user_id = auth.uid();

    if not found then
        raise exception 'Current caregiver was not found';
    end if;

    select *
    into v_family
    from public.families family
    where family.id = v_family_id
    for update;

    if not found then
        raise exception 'Current family was not found';
    end if;

    select *
    into v_current
    from public.caregivers caregiver
    where caregiver.auth_user_id = auth.uid()
      and caregiver.family_id = v_family.id
    for update;

    if not found then
        raise exception 'Current caregiver was not found';
    end if;

    -- Once a caregiver has accepted the stricter 2026-09-02 disclosure, do not
    -- let a direct API call choose the older shared-content retention path.
    -- Already-installed beta builds remain compatible for caregivers who have
    -- only accepted the immediately previous document versions.
    if exists (
        select 1
        from public.caregiver_legal_consents consent
        where consent.caregiver_id = v_current.id
          and consent.document_type in ('TERMS', 'PRIVACY')
          and consent.document_version = '2026-09-02'
    ) then
        raise exception 'Updated account deletion policy requires version 2';
    end if;

    -- Take the Apple user lock only after family and caregiver locks. The
    -- family finalizer reaches the Auth DELETE trigger in this same order.
    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(auth.uid()::text, 0)
    );

    select count(*)
    into v_caregiver_count
    from public.caregivers caregiver
    where caregiver.family_id = v_current.family_id;

    if v_caregiver_count <= 1 then
        raise exception 'At least one other caregiver must remain';
    end if;

    select caregiver.id, caregiver.auth_user_id
    into v_successor_caregiver_id, v_successor_auth_user_id
    from public.caregivers caregiver
    where caregiver.family_id = v_current.family_id
      and caregiver.id <> v_current.id
      and caregiver.auth_user_id is not null
    order by caregiver.id asc
    limit 1;

    if v_successor_auth_user_id is null then
        raise exception 'A remaining caregiver with an active account is required';
    end if;

    if v_family.owner_caregiver_id = v_current.id then
        update public.families
        set owner_caregiver_id = v_successor_caregiver_id
        where id = v_current.family_id;
    end if;

    -- Auth soft deletion does not fire the existing auth.users DELETE trigger.
    -- Queue Apple revocation while the identity is still available so the
    -- established automatic/manual fallback contract remains intact.
    if exists (
        select 1
        from auth.identities identity_row
        where identity_row.user_id = auth.uid()
          and identity_row.provider = 'apple'
    ) then
        insert into private.apple_sign_in_revocation_tokens(
            auth_user_id,
            vault_secret_id,
            revocation_state,
            revocation_scheduled_for,
            last_error
        ) values (
            auth.uid(),
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

    insert into private.caregiver_account_deletion_jobs(
        auth_user_id,
        family_id,
        status,
        attempt_count,
        next_attempt_at,
        processing_started_at,
        claim_token,
        last_error,
        completed_at,
        updated_at
    ) values (
        auth.uid(),
        v_current.family_id,
        'PENDING',
        0,
        now(),
        null,
        null,
        null,
        null,
        now()
    )
    on conflict (auth_user_id) do update
    set family_id = excluded.family_id,
        next_attempt_at = least(
            private.caregiver_account_deletion_jobs.next_attempt_at,
            excluded.next_attempt_at
        ),
        last_error = null,
        updated_at = now()
    where private.caregiver_account_deletion_jobs.status = 'PENDING'
      and private.caregiver_account_deletion_jobs.attempt_count = 0;

    if not found then
        raise exception 'Account deletion is already being processed';
    end if;

    insert into public.account_deletion_audit(
        family_id,
        caregiver_id,
        auth_user_id,
        action,
        completed_at,
        metadata
    ) values (
        v_current.family_id,
        v_current.id,
        auth.uid(),
        'CAREGIVER_DELETED',
        now(),
        jsonb_build_object(
            'shared_content_retained', true,
            'auth_cleanup', 'pending_soft_delete'
        )
    );

    delete from public.caregivers
    where id = v_current.id;
end;
$$;

create or replace function public.schedule_family_deletion_checked()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_current public.caregivers%rowtype;
    v_family public.families%rowtype;
    v_family_id bigint;
    v_scheduled_for timestamptz := now() + interval '30 days';
begin
    perform public.assert_recent_reauthentication();

    select caregiver.family_id
    into v_family_id
    from public.caregivers caregiver
    where caregiver.auth_user_id = auth.uid();

    if not found then
        raise exception 'Current caregiver was not found';
    end if;

    select *
    into v_family
    from public.families family
    where family.id = v_family_id
    for update;

    if not found then
        raise exception 'Current family was not found';
    end if;

    select *
    into v_current
    from public.caregivers caregiver
    where caregiver.auth_user_id = auth.uid()
      and caregiver.family_id = v_family.id
    for update;

    if not found then
        raise exception 'Current caregiver was not found';
    end if;

    if v_family.owner_caregiver_id is distinct from v_current.id then
        raise exception 'Only the family owner can schedule deletion';
    end if;

    if v_family.deletion_scheduled_for is not null then
        raise exception 'Family deletion is already scheduled';
    end if;

    update public.families
    set deletion_requested_at = now(),
        deletion_scheduled_for = v_scheduled_for,
        deletion_requested_by_auth_user_id = auth.uid()
    where id = v_family.id;

    insert into private.family_deletion_jobs(
        family_id,
        scheduled_for,
        status,
        attempt_count,
        next_attempt_at,
        processing_started_at,
        claim_token,
        last_error,
        completed_at,
        updated_at
    ) values (
        v_family.id,
        v_scheduled_for,
        'PENDING',
        0,
        v_scheduled_for,
        null,
        null,
        null,
        null,
        now()
    )
    on conflict (family_id) do update
    set scheduled_for = excluded.scheduled_for,
        status = 'PENDING',
        attempt_count = 0,
        next_attempt_at = excluded.next_attempt_at,
        processing_started_at = null,
        claim_token = null,
        last_error = null,
        completed_at = null,
        updated_at = now()
    where private.family_deletion_jobs.status in ('PENDING', 'CANCELLED');

    if not found then
        raise exception 'Family deletion job cannot be rescheduled';
    end if;

    insert into public.account_deletion_audit(
        family_id,
        caregiver_id,
        auth_user_id,
        action,
        scheduled_for
    ) values (
        v_family.id,
        v_current.id,
        auth.uid(),
        'FAMILY_DELETION_SCHEDULED',
        v_scheduled_for
    );

    return v_scheduled_for;
end;
$$;

create or replace function public.cancel_family_deletion_checked()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_current public.caregivers%rowtype;
    v_family public.families%rowtype;
    v_job_status text;
    v_job_attempt_count integer;
begin
    if auth.uid() is null then
        raise exception 'Supabase auth session is required';
    end if;

    select *
    into v_current
    from public.caregivers caregiver
    where caregiver.auth_user_id = auth.uid();

    if not found then
        raise exception 'Current caregiver was not found';
    end if;

    select *
    into v_family
    from public.families family
    where family.id = v_current.family_id
    for update;

    -- Revalidate and lock membership after the family lock. Finalization also
    -- locks the family first, so it cannot wait on a caregiver row held by a
    -- concurrent cancellation while cancellation waits on the family.
    select *
    into v_current
    from public.caregivers caregiver
    where caregiver.auth_user_id = auth.uid()
      and caregiver.family_id = v_family.id
    for update;

    if not found then
        raise exception 'Current caregiver was not found';
    end if;

    if v_family.owner_caregiver_id is distinct from v_current.id then
        raise exception 'Only the family owner can cancel deletion';
    end if;

    if v_family.deletion_scheduled_for is null then
        raise exception 'No family deletion is scheduled';
    end if;

    select job.status, job.attempt_count
    into v_job_status, v_job_attempt_count
    from private.family_deletion_jobs job
    where job.family_id = v_family.id
    for update;

    if not found
       or v_family.deletion_scheduled_for <= clock_timestamp()
       or v_job_status is distinct from 'PENDING'
       or v_job_attempt_count is distinct from 0 then
        raise exception '가족 삭제 정리가 시작되었거나 취소 기한이 지나 취소할 수 없습니다. Family deletion cleanup has started or the cancellation deadline has passed.';
    end if;

    update public.families
    set deletion_requested_at = null,
        deletion_scheduled_for = null,
        deletion_requested_by_auth_user_id = null
    where id = v_family.id;

    update private.family_deletion_jobs
    set status = 'CANCELLED',
        next_attempt_at = v_family.deletion_scheduled_for,
        processing_started_at = null,
        claim_token = null,
        last_error = null,
        completed_at = null,
        updated_at = now()
    where family_id = v_family.id
      and status = 'PENDING'
      and attempt_count = 0;

    if not found then
        raise exception '가족 삭제 정리가 시작되었거나 취소 기한이 지나 취소할 수 없습니다. Family deletion cleanup has started or the cancellation deadline has passed.';
    end if;

    insert into public.account_deletion_audit(
        family_id,
        caregiver_id,
        auth_user_id,
        action
    ) values (
        v_family.id,
        v_current.id,
        auth.uid(),
        'FAMILY_DELETION_CANCELLED'
    );
end;
$$;

-- Preserve deletion requests created before this durable queue existed.
insert into private.family_deletion_jobs(
    family_id,
    scheduled_for,
    status,
    attempt_count,
    next_attempt_at
)
select
    family.id,
    family.deletion_scheduled_for,
    'PENDING',
    0,
    family.deletion_scheduled_for
from public.families family
where family.deletion_scheduled_for is not null
on conflict (family_id) do nothing;

-- Choose across both queues by the oldest currently-due timestamp. Keeping
-- this decision in the database prevents a steady stream in one queue from
-- starving the other while the Edge worker remains bounded to one claim.
create or replace function public.next_due_deletion_job_kind()
returns text
language sql
security definer
set search_path = ''
as $$
    with due_queues as (
        select
            'caregiver'::text as job_kind,
            min(job.next_attempt_at) as due_at
        from private.caregiver_account_deletion_jobs job
        where (
                job.status = 'PENDING'
                and job.next_attempt_at <= now()
            )
            or (
                job.status = 'PROCESSING'
                and job.processing_started_at < now() - interval '15 minutes'
            )

        union all

        select
            'family'::text as job_kind,
            min(job.next_attempt_at) as due_at
        from private.family_deletion_jobs job
        join public.families family on family.id = job.family_id
        where family.deletion_scheduled_for is not null
          and family.deletion_scheduled_for <= now()
          and job.scheduled_for <= now()
          and (
              (job.status = 'PENDING' and job.next_attempt_at <= now())
              or (
                  job.status = 'PROCESSING'
                  and job.processing_started_at < now() - interval '15 minutes'
              )
          )
    )
    select queue.job_kind
    from due_queues queue
    where queue.due_at is not null
    order by
        queue.due_at asc,
        case when queue.job_kind = 'family' then 0 else 1 end
    limit 1;
$$;

create or replace function public.claim_due_caregiver_account_deletion_jobs(
    p_limit integer default 1
)
returns table (
    auth_user_id uuid,
    claim_token uuid,
    attempt_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_limit integer := least(greatest(coalesce(p_limit, 1), 1), 10);
begin
    return query
    with due as (
        select job.auth_user_id
        from private.caregiver_account_deletion_jobs job
        where (
                job.status = 'PENDING'
                and job.next_attempt_at <= now()
            )
            or (
                job.status = 'PROCESSING'
                and job.processing_started_at < now() - interval '15 minutes'
            )
        order by job.next_attempt_at asc, job.auth_user_id asc
        limit v_limit
        for update skip locked
    ), claimed as (
        update private.caregiver_account_deletion_jobs job
        set status = 'PROCESSING',
            attempt_count = job.attempt_count + 1,
            processing_started_at = now(),
            claim_token = gen_random_uuid(),
            last_error = null,
            updated_at = now()
        from due
        where job.auth_user_id = due.auth_user_id
        returning job.auth_user_id, job.claim_token, job.attempt_count
    )
    select claimed.auth_user_id, claimed.claim_token, claimed.attempt_count
    from claimed;
end;
$$;

create or replace function public.fail_caregiver_account_deletion_job(
    p_auth_user_id uuid,
    p_claim_token uuid,
    p_error text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_attempt_count integer;
    v_retry_after interval;
begin
    select job.attempt_count
    into v_attempt_count
    from private.caregiver_account_deletion_jobs job
    where job.auth_user_id = p_auth_user_id
      and job.status = 'PROCESSING'
      and job.claim_token = p_claim_token
    for update;

    if not found then
        return false;
    end if;

    v_retry_after := case
        when v_attempt_count <= 1 then interval '5 minutes'
        when v_attempt_count = 2 then interval '15 minutes'
        when v_attempt_count = 3 then interval '1 hour'
        else interval '6 hours'
    end;

    update private.caregiver_account_deletion_jobs
    set status = 'PENDING',
        next_attempt_at = now() + v_retry_after,
        processing_started_at = null,
        claim_token = null,
        last_error = left(coalesce(nullif(btrim(p_error), ''), 'worker_failed'), 160),
        updated_at = now()
    where auth_user_id = p_auth_user_id
      and status = 'PROCESSING'
      and claim_token = p_claim_token;

    return found;
end;
$$;

create or replace function public.finalize_caregiver_account_deletion_job(
    p_auth_user_id uuid,
    p_claim_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_job private.caregiver_account_deletion_jobs%rowtype;
begin
    select *
    into v_job
    from private.caregiver_account_deletion_jobs job
    where job.auth_user_id = p_auth_user_id
    for update;

    if not found then
        return false;
    end if;

    if v_job.status = 'COMPLETED' then
        return true;
    end if;

    if v_job.status <> 'PROCESSING'
       or v_job.claim_token is distinct from p_claim_token then
        return false;
    end if;

    -- The worker may have completed Auth soft deletion and stopped before this
    -- RPC. Confirm the irreversible tombstone in the database so a retry can
    -- finalize idempotently even when Admin deleteUser reports already deleted.
    if not exists (
        select 1
        from auth.users user_row
        where user_row.id = p_auth_user_id
          and user_row.deleted_at is not null
    ) then
        return false;
    end if;

    update private.caregiver_account_deletion_jobs
    set status = 'COMPLETED',
        next_attempt_at = now(),
        processing_started_at = null,
        claim_token = null,
        last_error = null,
        completed_at = now(),
        updated_at = now()
    where auth_user_id = p_auth_user_id
      and status = 'PROCESSING'
      and claim_token = p_claim_token;

    if not found then
        return false;
    end if;

    update public.account_deletion_audit audit
    set completed_at = now(),
        metadata = coalesce(audit.metadata, '{}'::jsonb)
            || jsonb_build_object('auth_cleanup', 'completed_soft_delete')
    where audit.id = (
        select candidate.id
        from public.account_deletion_audit candidate
        where candidate.auth_user_id = p_auth_user_id
          and candidate.action = 'CAREGIVER_DELETED'
          and candidate.metadata ->> 'auth_cleanup' = 'pending_soft_delete'
        order by candidate.id desc
        limit 1
    );

    return true;
end;
$$;

create or replace function public.claim_due_family_deletion_jobs(p_limit integer default 1)
returns table (
    family_id bigint,
    claim_token uuid,
    attempt_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_limit integer := least(greatest(coalesce(p_limit, 1), 1), 10);
begin
    return query
    with due as (
        select job.family_id
        from private.family_deletion_jobs job
        join public.families family on family.id = job.family_id
        where family.deletion_scheduled_for is not null
          and family.deletion_scheduled_for <= now()
          and job.scheduled_for <= now()
          and (
              (job.status = 'PENDING' and job.next_attempt_at <= now())
              or (
                  job.status = 'PROCESSING'
                  and job.processing_started_at < now() - interval '15 minutes'
              )
          )
        order by job.next_attempt_at asc, job.family_id asc
        limit v_limit
        for update of job skip locked
    ), claimed as (
        update private.family_deletion_jobs job
        set status = 'PROCESSING',
            attempt_count = job.attempt_count + 1,
            processing_started_at = now(),
            claim_token = gen_random_uuid(),
            last_error = null,
            updated_at = now()
        from due
        where job.family_id = due.family_id
        returning job.family_id, job.claim_token, job.attempt_count
    )
    select claimed.family_id, claimed.claim_token, claimed.attempt_count
    from claimed;
end;
$$;

create or replace function public.fail_family_deletion_job(
    p_family_id bigint,
    p_claim_token uuid,
    p_error text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_attempt_count integer;
    v_retry_after interval;
begin
    select job.attempt_count
    into v_attempt_count
    from private.family_deletion_jobs job
    where job.family_id = p_family_id
      and job.status = 'PROCESSING'
      and job.claim_token = p_claim_token
    for update;

    if not found then
        return false;
    end if;

    v_retry_after := case
        when v_attempt_count <= 1 then interval '5 minutes'
        when v_attempt_count = 2 then interval '15 minutes'
        when v_attempt_count = 3 then interval '1 hour'
        else interval '6 hours'
    end;

    update private.family_deletion_jobs
    set status = 'PENDING',
        next_attempt_at = now() + v_retry_after,
        processing_started_at = null,
        claim_token = null,
        last_error = left(coalesce(nullif(btrim(p_error), ''), 'worker_failed'), 160),
        updated_at = now()
    where family_id = p_family_id
      and status = 'PROCESSING'
      and claim_token = p_claim_token;

    return true;
end;
$$;

create or replace function public.finalize_family_deletion_job(
    p_family_id bigint,
    p_claim_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_job private.family_deletion_jobs%rowtype;
    v_family public.families%rowtype;
    v_family_found boolean;
    v_auth_user_ids uuid[];
begin
    -- Schedule, cancel, and finalize all acquire the family row before the job
    -- row. Keeping one lock order avoids a cancellation/finalization deadlock.
    select *
    into v_family
    from public.families family
    where family.id = p_family_id
    for update;

    v_family_found := found;

    select *
    into v_job
    from private.family_deletion_jobs job
    where job.family_id = p_family_id
    for update;

    if not found then
        return false;
    end if;

    if v_job.status = 'COMPLETED' then
        return true;
    end if;

    if v_job.status <> 'PROCESSING' or v_job.claim_token is distinct from p_claim_token then
        return false;
    end if;

    if not v_family_found then
        raise exception 'Family scheduled for deletion was not found';
    end if;

    if v_family.deletion_scheduled_for is null
       or v_family.deletion_scheduled_for > now() then
        raise exception 'Family deletion is not due';
    end if;

    if exists (
        select 1
        from storage.objects object
        where object.bucket_id = 'family-media'
          and (
              object.name like 'photos/' || p_family_id::text || '/%'
              or object.name like 'chat/' || p_family_id::text || '/%'
          )
    ) then
        raise exception 'Family media storage cleanup is incomplete';
    end if;

    select array_agg(distinct caregiver.auth_user_id)
    into v_auth_user_ids
    from public.caregivers caregiver
    where caregiver.family_id = p_family_id
      and caregiver.auth_user_id is not null;

    insert into public.account_deletion_audit(
        family_id,
        action,
        scheduled_for,
        completed_at,
        metadata
    ) values (
        p_family_id,
        'FAMILY_DELETED',
        v_family.deletion_scheduled_for,
        now(),
        jsonb_build_object('storage_cleanup', 'storage_api')
    );

    delete from public.families
    where id = p_family_id;

    if coalesce(array_length(v_auth_user_ids, 1), 0) > 0 then
        delete from auth.users user_row
        where user_row.id = any(v_auth_user_ids)
          and not exists (
              select 1
              from public.caregivers caregiver
              where caregiver.auth_user_id = user_row.id
          );
    end if;

    update private.family_deletion_jobs
    set status = 'COMPLETED',
        next_attempt_at = now(),
        processing_started_at = null,
        claim_token = null,
        last_error = null,
        completed_at = now(),
        updated_at = now()
    where family_id = p_family_id;

    return true;
end;
$$;

-- Uploads stop as soon as the scheduled deletion is due or a worker owns it.
create or replace function public.family_media_upload_allowed(p_family_id bigint)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    v_current_family_id bigint;
    v_family public.families%rowtype;
begin
    select (public.current_caregiver()).family_id
    into v_current_family_id;

    if p_family_id is distinct from v_current_family_id then
        return false;
    end if;

    -- Hold a family-row lock until the Storage insert commits. The deletion
    -- finalizer takes FOR UPDATE on the same row and therefore must re-check
    -- storage.objects after every in-flight upload has become visible.
    select family.*
    into v_family
    from public.families family
    where family.id = v_current_family_id
    for key share;

    if not found
       or (
           v_family.deletion_scheduled_for is not null
           and v_family.deletion_scheduled_for <= now()
       ) then
        return false;
    end if;

    return not exists (
        select 1
        from private.family_deletion_jobs job
        where job.family_id = v_current_family_id
          and job.status = 'PROCESSING'
    );
end;
$$;

drop policy if exists family_media_insert_member on storage.objects;
create policy family_media_insert_member on storage.objects
    for insert to authenticated
    with check (
        bucket_id = 'family-media'
        and (storage.foldername(name))[1] in ('photos', 'chat')
        and (storage.foldername(name))[2] = ((public.current_caregiver()).family_id)::text
        and name ~ (
            '^(photos|chat)/'
            || ((public.current_caregiver()).family_id)::text
            || '/[A-Za-z0-9._-]+$'
        )
        and public.family_media_upload_allowed((public.current_caregiver()).family_id)
    );

-- Return a bounded page of every media object owned by the claimed family,
-- regardless of legacy folder depth. The worker removes these paths through
-- the Storage API; database metadata is never deleted directly.
create or replace function public.list_family_deletion_media_paths(
    p_family_id bigint,
    p_claim_token uuid,
    p_limit integer default 500
)
returns table(storage_path text)
language sql
stable
security definer
set search_path = ''
as $$
    select object.name::text as storage_path
    from storage.objects object
    where object.bucket_id = 'family-media'
      and (
          object.name like 'photos/' || p_family_id::text || '/%'
          or object.name like 'chat/' || p_family_id::text || '/%'
      )
      and exists (
          select 1
          from private.family_deletion_jobs job
          where job.family_id = p_family_id
            and job.status = 'PROCESSING'
            and job.claim_token = p_claim_token
      )
    order by object.name asc
    limit least(greatest(coalesce(p_limit, 1), 1), 500);
$$;

-- Keep the old SQL entry point present for compatibility, but make it impossible
-- to bypass the Storage API worker.
create or replace function public.purge_due_family_deletions(p_limit integer default 50)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
    raise exception 'Direct family deletion purge is disabled; use the account deletion worker';
end;
$$;

revoke all on function public.request_caregiver_account_deletion_checked() from public, anon;
revoke all on function public.schedule_family_deletion_checked() from public, anon;
revoke all on function public.cancel_family_deletion_checked() from public, anon;
revoke all on function public.next_due_deletion_job_kind() from public, anon, authenticated;
revoke all on function public.claim_due_caregiver_account_deletion_jobs(integer) from public, anon, authenticated;
revoke all on function public.fail_caregiver_account_deletion_job(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.finalize_caregiver_account_deletion_job(uuid, uuid) from public, anon, authenticated;
revoke all on function public.claim_due_family_deletion_jobs(integer) from public, anon, authenticated;
revoke all on function public.fail_family_deletion_job(bigint, uuid, text) from public, anon, authenticated;
revoke all on function public.finalize_family_deletion_job(bigint, uuid) from public, anon, authenticated;
revoke all on function public.family_media_upload_allowed(bigint) from public, anon, authenticated;
revoke all on function public.list_family_deletion_media_paths(bigint, uuid, integer) from public, anon, authenticated;
revoke all on function public.purge_due_family_deletions(integer) from public, anon, authenticated, service_role;

grant execute on function public.request_caregiver_account_deletion_checked() to authenticated;
grant execute on function public.schedule_family_deletion_checked() to authenticated;
grant execute on function public.cancel_family_deletion_checked() to authenticated;
grant execute on function public.next_due_deletion_job_kind() to service_role;
grant execute on function public.claim_due_caregiver_account_deletion_jobs(integer) to service_role;
grant execute on function public.fail_caregiver_account_deletion_job(uuid, uuid, text) to service_role;
grant execute on function public.finalize_caregiver_account_deletion_job(uuid, uuid) to service_role;
grant execute on function public.claim_due_family_deletion_jobs(integer) to service_role;
grant execute on function public.fail_family_deletion_job(bigint, uuid, text) to service_role;
grant execute on function public.finalize_family_deletion_job(bigint, uuid) to service_role;
grant execute on function public.family_media_upload_allowed(bigint) to authenticated;
grant execute on function public.list_family_deletion_media_paths(bigint, uuid, integer) to service_role;

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Keep immediate family-chat delivery on the same project as the database.
-- The surrounding exception handler intentionally preserves the prior
-- best-effort trigger contract when pg_net itself is unavailable.
create or replace function private.dispatch_family_chat_push()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, vault, net
as $$
declare
    v_worker_secret text;
    v_function_base_url text;
begin
    select decrypted_secret
    into v_worker_secret
    from vault.decrypted_secrets
    where name = 'babyboss_push_worker_cron_secret'
    limit 1;

    select btrim(decrypted_secret)
    into v_function_base_url
    from vault.decrypted_secrets
    where name = 'babyboss_edge_function_base_url'
    limit 1;

    if nullif(v_worker_secret, '') is null then
        raise warning 'babyboss_push_worker_cron_secret is not configured';
        return new;
    end if;

    if nullif(v_function_base_url, '') is null then
        raise warning 'babyboss_edge_function_base_url is not configured';
        return new;
    end if;

    perform net.http_post(
        url := v_function_base_url || '/functions/v1/send-push-notifications',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-push-worker-secret', v_worker_secret
        ),
        body := jsonb_build_object(
            'familyId', new.family_id,
            'eventTypes', jsonb_build_array('FAMILY_CHAT', 'FAMILY_CHAT_MENTION')
        ),
        timeout_milliseconds := 10000
    );

    return new;
exception
    when others then
        raise warning 'Could not dispatch family chat push worker: %', sqlerrm;
        return new;
end;
$$;

revoke all on function private.dispatch_family_chat_push() from public, anon, authenticated;

do $$
declare
    v_job_id bigint;
begin
    for v_job_id in
        select job.jobid
        from cron.job job
        where job.jobname in (
            'ilog-purge-family-deletions',
            'babyboss-send-push-notifications',
            'ilog-revoke-apple-sign-in-tokens',
            'ilog-process-account-deletions'
        )
    loop
        perform cron.unschedule(v_job_id);
    end loop;
end;
$$;

select cron.schedule(
    'babyboss-send-push-notifications',
    '* * * * *',
    $cron$
    select net.http_post(
        url := (
            select btrim(decrypted_secret)
            from vault.decrypted_secrets
            where name = 'babyboss_edge_function_base_url'
            limit 1
        ) || '/functions/v1/send-push-notifications',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-push-worker-secret', (
                select decrypted_secret
                from vault.decrypted_secrets
                where name = 'babyboss_push_worker_cron_secret'
                limit 1
            )
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 10000
    );
    $cron$
);

select cron.schedule(
    'ilog-revoke-apple-sign-in-tokens',
    '*/5 * * * *',
    $cron$
    select net.http_post(
        url := (
            select btrim(decrypted_secret)
            from vault.decrypted_secrets
            where name = 'babyboss_edge_function_base_url'
            limit 1
        ) || '/functions/v1/revoke-apple-tokens',
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

select cron.schedule(
    'ilog-process-account-deletions',
    '*/5 * * * *',
    $cron$
    select net.http_post(
        url := (
            select btrim(decrypted_secret)
            from vault.decrypted_secrets
            where name = 'babyboss_edge_function_base_url'
            limit 1
        ) || '/functions/v1/process-account-deletions',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-account-deletion-worker-secret', (
                select decrypted_secret
                from vault.decrypted_secrets
                where name = 'babyboss_push_worker_cron_secret'
                limit 1
            )
        ),
        body := jsonb_build_object('limit', 1),
        timeout_milliseconds := 60000
    );
    $cron$
);
