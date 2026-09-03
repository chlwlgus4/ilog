-- Remove content authored or uploaded by a caregiver before deleting the
-- caregiver row. Earlier account-deletion behavior deliberately retained
-- shared content and allowed author foreign keys to become NULL. That loses the
-- only reliable ownership mapping and can leave Storage objects that no
-- remaining caregiver is allowed to remove.

-- The private job retains the opaque Auth UUID after completion because it is
-- the idempotency key for Admin soft deletion and the relink-denial tombstone.
-- It is never exposed through the Data API. Public audit identifiers are
-- scrubbed as soon as the worker confirms completion.
alter table private.caregiver_account_deletion_jobs
    add column if not exists caregiver_id bigint;

alter table private.caregiver_account_deletion_jobs
    alter column family_id drop not null;

create table if not exists private.caregiver_account_deletion_media_paths (
    auth_user_id uuid not null,
    storage_path text not null,
    created_at timestamptz not null default now(),
    primary key (auth_user_id, storage_path),
    constraint caregiver_account_deletion_media_paths_job_fkey
        foreign key (auth_user_id)
        references private.caregiver_account_deletion_jobs(auth_user_id)
        on delete cascade,
    constraint caregiver_account_deletion_media_paths_path_check check (
        storage_path like 'photos/%' or storage_path like 'chat/%'
    )
);

alter table private.caregiver_account_deletion_media_paths enable row level security;
revoke all on table private.caregiver_account_deletion_media_paths
    from public, anon, authenticated;

-- Schedules created before this migration have no reliable author mapping and
-- remain family-owned legacy data. New schedules always record their creator.
alter table public.schedules
    add column if not exists created_by_id bigint
        references public.caregivers(id) on delete set null;

create index if not exists idx_schedules_created_by
    on public.schedules(created_by_id)
    where created_by_id is not null;

create or replace function public.create_schedule_with_chat(
    p_family_id bigint,
    p_child_id bigint,
    p_title text,
    p_category text,
    p_start_at timestamptz,
    p_end_at timestamptz,
    p_note text
)
returns public.schedules
language plpgsql
set search_path = public
as $$
declare
    v_current public.caregivers%rowtype;
    v_child public.children%rowtype;
    v_schedule public.schedules%rowtype;
    v_title text := trim(coalesce(p_title, ''));
begin
    v_current := public.current_caregiver();
    if v_current.family_id <> p_family_id then raise exception 'Family access denied'; end if;
    if v_title = '' then raise exception 'Schedule title is required'; end if;
    if p_category not in ('HOSPITAL', 'VACCINE', 'DAYCARE', 'SCHOOL', 'HOME', 'ACTIVITY') then raise exception 'Invalid schedule category'; end if;
    if p_start_at is null or p_end_at is null then raise exception 'Schedule times are required'; end if;

    v_child := public.resolve_family_child(p_family_id, p_child_id);
    insert into public.schedules(
        family_id,
        child_id,
        created_by_id,
        title,
        category,
        start_at,
        end_at,
        note
    ) values (
        p_family_id,
        v_child.id,
        v_current.id,
        v_title,
        p_category,
        p_start_at,
        p_end_at,
        nullif(trim(coalesce(p_note, '')), '')
    )
    returning * into v_schedule;

    insert into public.chat_messages(family_id, sender_id, body, message_type)
    values (p_family_id, v_current.id, format('%s 일정을 등록했어요.', v_schedule.title), 'TEXT');

    return v_schedule;
end;
$$;

revoke all on function public.create_schedule_with_chat(bigint, bigint, text, text, timestamptz, timestamptz, text)
    from public, anon;
grant execute on function public.create_schedule_with_chat(bigint, bigint, text, text, timestamptz, timestamptz, text)
    to authenticated;

-- Keep legacy rows whose author was never captured, but do not allow new
-- authenticated writes to create another ownerless row. The checked RPCs
-- already populate these columns with current_caregiver_id(); these policies
-- close the equivalent direct Data API bypass without changing that contract.
drop policy if exists tasks_insert_member on public.tasks;
create policy tasks_insert_member on public.tasks
    for insert to authenticated
    with check (
        public.is_family_member(family_id)
        and created_by_id = public.current_caregiver_id()
    );

drop policy if exists schedules_insert_member on public.schedules;
create policy schedules_insert_member on public.schedules
    for insert to authenticated
    with check (
        public.is_family_member(family_id)
        and created_by_id = public.current_caregiver_id()
    );

drop policy if exists logs_insert_member on public.logs;
create policy logs_insert_member on public.logs
    for insert to authenticated
    with check (
        public.is_family_member(family_id)
        and caregiver_id = public.current_caregiver_id()
    );

drop policy if exists memory_entries_insert_member on public.memory_entries;
create policy memory_entries_insert_member on public.memory_entries
    for insert to authenticated
    with check (
        public.is_family_member(family_id)
        and created_by_id = public.current_caregiver_id()
    );

drop policy if exists record_attachments_insert_member on public.record_attachments;
create policy record_attachments_insert_member on public.record_attachments
    for insert to authenticated
    with check (
        public.is_family_member(family_id)
        and created_by_id = public.current_caregiver_id()
    );

drop policy if exists growth_measurements_insert_member on public.growth_measurements;
create policy growth_measurements_insert_member on public.growth_measurements
    for insert to authenticated
    with check (
        public.is_family_member(family_id)
        and caregiver_id = public.current_caregiver_id()
    );

drop policy if exists family_invitations_insert_member on public.family_invitations;
create policy family_invitations_insert_member on public.family_invitations
    for insert to authenticated
    with check (
        public.is_family_member(family_id)
        and invited_by_id = public.current_caregiver_id()
    );

drop policy if exists vaccination_records_insert_member on public.vaccination_records;
create policy vaccination_records_insert_member on public.vaccination_records
    for insert to authenticated
    with check (
        public.is_family_member(family_id)
        and created_by_id = public.current_caregiver_id()
    );

drop policy if exists hospital_visits_insert_member on public.hospital_visits;
create policy hospital_visits_insert_member on public.hospital_visits
    for insert to authenticated
    with check (
        public.is_family_member(family_id)
        and created_by_id = public.current_caregiver_id()
    );

drop policy if exists record_alarm_schedules_insert_member on public.record_alarm_schedules;
create policy record_alarm_schedules_insert_member on public.record_alarm_schedules
    for insert to authenticated
    with check (
        public.is_family_member(family_id)
        and created_by_id = public.current_caregiver_id()
    );

-- Several shared records intentionally remain editable by any family member.
-- RLS alone cannot compare OLD and NEW authors without also taking away those
-- shared edits. Preserve that collaboration contract while making the original
-- author immutable, so an authored row cannot be reassigned or anonymized just
-- before account deletion. Legacy NULL authors stay NULL and are not backfilled.
create or replace function private.reject_caregiver_content_author_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    -- Direct Data API writes run as authenticated/anon and must not reassign an
    -- author. Trusted SECURITY DEFINER RPCs run as their owner, so FK ON DELETE
    -- SET NULL during the versioned deletion flows remains possible even while
    -- the caller's auth.uid() is still present.
    if current_user in ('authenticated', 'anon')
       and (pg_catalog.to_jsonb(new) -> tg_argv[0])
        is distinct from (pg_catalog.to_jsonb(old) -> tg_argv[0]) then
        raise exception 'Content author cannot be changed'
            using errcode = '42501';
    end if;

    return new;
end;
$$;

revoke all on function private.reject_caregiver_content_author_change()
    from public, anon, authenticated;

drop trigger if exists tasks_reject_author_change on public.tasks;
create trigger tasks_reject_author_change
before update of created_by_id on public.tasks
for each row execute function private.reject_caregiver_content_author_change('created_by_id');

drop trigger if exists schedules_reject_author_change on public.schedules;
create trigger schedules_reject_author_change
before update of created_by_id on public.schedules
for each row execute function private.reject_caregiver_content_author_change('created_by_id');

drop trigger if exists logs_reject_author_change on public.logs;
create trigger logs_reject_author_change
before update of caregiver_id on public.logs
for each row execute function private.reject_caregiver_content_author_change('caregiver_id');

drop trigger if exists memory_entries_reject_author_change on public.memory_entries;
create trigger memory_entries_reject_author_change
before update of created_by_id on public.memory_entries
for each row execute function private.reject_caregiver_content_author_change('created_by_id');

drop trigger if exists record_attachments_reject_author_change on public.record_attachments;
create trigger record_attachments_reject_author_change
before update of created_by_id on public.record_attachments
for each row execute function private.reject_caregiver_content_author_change('created_by_id');

drop trigger if exists growth_measurements_reject_author_change on public.growth_measurements;
create trigger growth_measurements_reject_author_change
before update of caregiver_id on public.growth_measurements
for each row execute function private.reject_caregiver_content_author_change('caregiver_id');

drop trigger if exists family_invitations_reject_author_change on public.family_invitations;
create trigger family_invitations_reject_author_change
before update of invited_by_id on public.family_invitations
for each row execute function private.reject_caregiver_content_author_change('invited_by_id');

drop trigger if exists vaccination_records_reject_author_change on public.vaccination_records;
create trigger vaccination_records_reject_author_change
before update of created_by_id on public.vaccination_records
for each row execute function private.reject_caregiver_content_author_change('created_by_id');

drop trigger if exists hospital_visits_reject_author_change on public.hospital_visits;
create trigger hospital_visits_reject_author_change
before update of created_by_id on public.hospital_visits
for each row execute function private.reject_caregiver_content_author_change('created_by_id');

drop trigger if exists record_alarm_schedules_reject_author_change on public.record_alarm_schedules;
create trigger record_alarm_schedules_reject_author_change
before update of created_by_id on public.record_alarm_schedules
for each row execute function private.reject_caregiver_content_author_change('created_by_id');

-- export_jobs intentionally remains unavailable to authenticated clients; the
-- release-hardening migration revoked the table and dropped its policies.
--
-- Keep request_caregiver_account_deletion_checked() unchanged for already
-- installed beta builds whose screen promises that shared family content is
-- retained. The 2026-09-02 app calls this explicit v2 RPC, so the stricter
-- destructive policy is never applied behind the older disclosure.

create or replace function public.request_caregiver_account_deletion_v2_checked()
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
    v_authored_task_ids bigint[] := array[]::bigint[];
begin
    perform public.assert_recent_reauthentication();

    -- Preserve the established family -> caregiver -> Apple-user lock order.
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

    -- A family deletion request may have been initiated by this caregiver. The
    -- schedule remains family-owned, but its direct Auth-user link does not.
    update public.families
    set deletion_requested_by_auth_user_id = null
    where id = v_current.family_id
      and deletion_requested_by_auth_user_id = auth.uid();

    -- Queue Apple revocation while the identity and transaction-scoped Apple
    -- user lock are still available.
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
        caregiver_id,
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
        v_current.id,
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
        caregiver_id = excluded.caregiver_id,
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

    -- Snapshot both referenced paths and every object uploaded by this Auth user
    -- inside the current family. The latter also catches an upload that committed
    -- to Storage but failed before its database row was created.
    insert into private.caregiver_account_deletion_media_paths(auth_user_id, storage_path)
    select auth.uid(), candidate.storage_path
    from (
        select photo.storage_path
        from public.family_photos photo
        where photo.family_id = v_current.family_id
          and photo.created_by_id = v_current.id
        union
        select message.image_storage_path
        from public.family_chat_messages message
        where message.family_id = v_current.family_id
          and message.sender_caregiver_id = v_current.id
          and message.image_storage_path is not null
        union
        select attachment.image_url
        from public.record_attachments attachment
        where attachment.family_id = v_current.family_id
          and attachment.created_by_id = v_current.id
        union
        select memory.image_url
        from public.memory_entries memory
        where memory.family_id = v_current.family_id
          and memory.created_by_id = v_current.id
          and memory.image_url is not null
        union
        select object.name::text
        from storage.objects object
        where object.bucket_id = 'family-media'
          and object.owner = auth.uid()
          and (
              object.name like 'photos/' || v_current.family_id::text || '/%'
              or object.name like 'chat/' || v_current.family_id::text || '/%'
          )
    ) candidate
    where candidate.storage_path is not null
      and (
          candidate.storage_path like 'photos/' || v_current.family_id::text || '/%'
          or candidate.storage_path like 'chat/' || v_current.family_id::text || '/%'
      )
    on conflict (auth_user_id, storage_path) do nothing;

    select coalesce(array_agg(task.id order by task.id), array[]::bigint[])
    into v_authored_task_ids
    from public.tasks task
    where task.family_id = v_current.family_id
      and task.created_by_id = v_current.id;

    -- Notification rows embed actor names, previews and source identifiers.
    delete from public.push_notification_events event
    where event.family_id = v_current.family_id
      and (
          event.actor_caregiver_id = v_current.id
          or event.recipient_caregiver_id = v_current.id
      );

    -- Preserve the conversation structure and other caregivers' replies while
    -- irreversibly replacing the departing caregiver's text.
    update public.timeline_comments comment
    set body = '삭제된 댓글입니다.',
        author_caregiver_id = null,
        updated_at = now()
    where comment.family_id = v_current.family_id
      and comment.author_caregiver_id = v_current.id;

    update public.chat_messages message
    set body = '삭제된 활동입니다.',
        sender_id = null,
        linked_task_id = null,
        updated_at = now()
    where message.family_id = v_current.family_id
      and message.sender_id = v_current.id;

    -- Another caregiver may have replied to or acted on the departing
    -- caregiver's task. Remove only the deleted task reference; their own text
    -- and authorship must remain intact.
    update public.chat_messages message
    set linked_task_id = null,
        updated_at = now()
    where message.family_id = v_current.family_id
      and message.sender_id is distinct from v_current.id
      and message.linked_task_id = any(v_authored_task_ids);

    -- Family chat has no reply tree. Remove the departing caregiver's messages,
    -- and remove a queued image from any anomalous surviving reference.
    delete from public.family_chat_messages message
    where message.family_id = v_current.family_id
      and message.sender_caregiver_id = v_current.id;

    delete from public.family_chat_messages message
    where message.family_id = v_current.family_id
      and message.image_storage_path in (
          select queued.storage_path
          from private.caregiver_account_deletion_media_paths queued
          where queued.auth_user_id = auth.uid()
      )
      and nullif(btrim(message.body), '') is null;

    update public.family_chat_messages message
    set image_storage_path = null
    where message.family_id = v_current.family_id
      and message.image_storage_path in (
          select queued.storage_path
          from private.caregiver_account_deletion_media_paths queued
          where queued.auth_user_id = auth.uid()
      )
      and nullif(btrim(message.body), '') is not null;

    delete from public.family_photos photo
    where photo.family_id = v_current.family_id
      and (
          photo.created_by_id = v_current.id
          or photo.storage_path in (
              select queued.storage_path
              from private.caregiver_account_deletion_media_paths queued
              where queued.auth_user_id = auth.uid()
          )
      );

    delete from public.record_attachments attachment
    where attachment.family_id = v_current.family_id
      and attachment.created_by_id = v_current.id;

    delete from public.record_alarm_schedules schedule
    where schedule.family_id = v_current.family_id
      and schedule.created_by_id = v_current.id;

    delete from public.logs log
    where log.family_id = v_current.family_id
      and log.caregiver_id = v_current.id;

    delete from public.growth_measurements measurement
    where measurement.family_id = v_current.family_id
      and measurement.caregiver_id = v_current.id;

    delete from public.vaccination_records vaccination
    where vaccination.family_id = v_current.family_id
      and vaccination.created_by_id = v_current.id;

    delete from public.hospital_visits visit
    where visit.family_id = v_current.family_id
      and visit.created_by_id = v_current.id;

    delete from public.memory_entries memory
    where memory.family_id = v_current.family_id
      and memory.created_by_id = v_current.id;

    delete from public.tasks task
    where task.family_id = v_current.family_id
      and task.created_by_id = v_current.id;

    delete from public.schedules schedule
    where schedule.family_id = v_current.family_id
      and schedule.created_by_id = v_current.id;

    delete from public.family_invitations invitation
    where invitation.family_id = v_current.family_id
      and (
          invitation.invited_by_id = v_current.id
          or (
              nullif(btrim(v_current.email), '') is not null
              and lower(invitation.email) = lower(v_current.email)
          )
          or (
              nullif(btrim(v_current.contact_phone), '') is not null
              and invitation.contact_phone = v_current.contact_phone
          )
      );

    delete from public.export_jobs export_job
    where export_job.family_id = v_current.family_id
      and export_job.requested_by_id = v_current.id;

    update public.record_share_preferences preference
    set excluded_caregiver_ids = array_remove(preference.excluded_caregiver_ids, v_current.id),
        updated_at = now()
    where preference.family_id = v_current.family_id
      and v_current.id = any(preference.excluded_caregiver_ids);

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
        null,
        jsonb_build_object(
            'authored_content_cleanup', 'completed',
            'storage_cleanup', 'pending',
            'auth_cleanup', 'pending_soft_delete'
        )
    );

    delete from public.caregivers
    where id = v_current.id;
end;
$$;

create or replace function public.list_caregiver_account_deletion_media_paths(
    p_auth_user_id uuid,
    p_claim_token uuid,
    p_limit integer default 500
)
returns table(storage_path text)
language sql
stable
security definer
set search_path = ''
as $$
    select queued.storage_path
    from private.caregiver_account_deletion_media_paths queued
    where queued.auth_user_id = p_auth_user_id
      and exists (
          select 1
          from private.caregiver_account_deletion_jobs job
          where job.auth_user_id = p_auth_user_id
            and job.status = 'PROCESSING'
            and job.claim_token = p_claim_token
      )
    order by queued.storage_path asc
    limit least(greatest(coalesce(p_limit, 1), 1), 500);
$$;

create or replace function public.ack_caregiver_account_deletion_media_paths(
    p_auth_user_id uuid,
    p_claim_token uuid,
    p_storage_paths text[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_deleted_count integer := 0;
begin
    if coalesce(array_length(p_storage_paths, 1), 0) = 0 then
        return 0;
    end if;

    if array_length(p_storage_paths, 1) > 500
       or array_position(p_storage_paths, null) is not null then
        raise exception 'Invalid caregiver media acknowledgement';
    end if;

    if not exists (
        select 1
        from private.caregiver_account_deletion_jobs job
        where job.auth_user_id = p_auth_user_id
          and job.status = 'PROCESSING'
          and job.claim_token = p_claim_token
    ) then
        raise exception 'Caregiver account deletion claim was not found';
    end if;

    delete from private.caregiver_account_deletion_media_paths queued
    where queued.auth_user_id = p_auth_user_id
      and queued.storage_path = any(p_storage_paths)
      and not exists (
          select 1
          from storage.objects object
          where object.bucket_id = 'family-media'
            and object.name = queued.storage_path
      );

    get diagnostics v_deleted_count = row_count;
    return v_deleted_count;
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

    if exists (
        select 1
        from private.caregiver_account_deletion_media_paths queued
        where queued.auth_user_id = p_auth_user_id
    ) then
        return false;
    end if;

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
        family_id = null,
        caregiver_id = null,
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
    set family_id = null,
        caregiver_id = null,
        auth_user_id = null,
        completed_at = now(),
        metadata = coalesce(audit.metadata, '{}'::jsonb)
            || jsonb_build_object(
                'storage_cleanup', 'completed',
                'auth_cleanup', 'completed_soft_delete'
            )
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

revoke all on function public.request_caregiver_account_deletion_v2_checked()
    from public, anon;
revoke all on function public.list_caregiver_account_deletion_media_paths(uuid, uuid, integer)
    from public, anon, authenticated;
revoke all on function public.ack_caregiver_account_deletion_media_paths(uuid, uuid, text[])
    from public, anon, authenticated;
revoke all on function public.finalize_caregiver_account_deletion_job(uuid, uuid)
    from public, anon, authenticated;

grant execute on function public.request_caregiver_account_deletion_v2_checked()
    to authenticated;
grant execute on function public.list_caregiver_account_deletion_media_paths(uuid, uuid, integer)
    to service_role;
grant execute on function public.ack_caregiver_account_deletion_media_paths(uuid, uuid, text[])
    to service_role;
grant execute on function public.finalize_caregiver_account_deletion_job(uuid, uuid)
    to service_role;
